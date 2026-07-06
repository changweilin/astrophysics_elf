// Multi-scientist roundtable orchestration for the Science Dialogue tab.
//
// Given a panel of scientists (already ranked by expertise for the question),
// run a turn-by-turn discussion where each speaks in their own voice, builds on
// or challenges the others, and the group converges on an answer. The loop ends
// when a neutral moderator judges the question resolved, the running transcript
// reaches the configured fraction of the context window (the user-facing "touch
// 50% of context"), or a hard round cap is hit -- after which the lead scientist
// delivers the conclusion.
//
// Streaming is reported through the `emit(type, data)` callback so the HTTP
// handler can forward each event as an SSE frame, identical in spirit to the
// single-chat stream but tagged with the speaking scientist's id.

import { config } from '../config.mjs';
import { chatStream, chat } from './ollama.mjs';
import { estimateTokens } from './context.mjs';
import { shingles, maxSimilarity } from './text-similarity.mjs';
import { nameOf, buildPanelPrompt, buildConclusionPrompt } from '../personas/scientists.mjs';

// Render the running transcript as plain "Name: text" lines for the next prompt.
function formatTranscript(turns) {
  return turns.map((t) => `${t.name}: ${t.content}`).join('\n\n');
}

// Nudge appended when continuing a reply that was cut off at its token cap.
function continueNudge(lang) {
  return lang === 'zh'
    ? '(請接續剛才未說完的內容繼續講完,不要重複前面已經講過的部分。)'
    : '(Continue from exactly where you left off and finish the thought; do not repeat what you already said.)';
}

// Stream a reply, transparently continuing if the model stopped only because it
// hit the num_predict cap (done_reason 'length') instead of finishing its
// thought. This is what keeps a turn or conclusion from being shown cut off
// mid-sentence. Continuation tokens flow through the same onToken callback, so
// the client sees one seamless bubble. Bounded by maxContinuations.
async function streamComplete({ model, messages, signal, numPredict, maxContinuations = 0, lang }, onToken) {
  const convo = messages.slice();
  let full = '';
  let last = { doneReason: 'stop', promptTokens: 0, completionTokens: 0 };
  for (let attempt = 0; attempt <= maxContinuations; attempt++) {
    const stats = await chatStream(
      { model, messages: convo, signal, optionOverrides: { num_predict: numPredict } },
      onToken,
    );
    full += stats.content;
    last = stats;
    if (stats.doneReason !== 'length' || !stats.content.trim()) break; // finished, or nothing more to extend
    // Truncated: hand back what we have and ask it to keep going without repeating.
    convo.push({ role: 'assistant', content: stats.content });
    convo.push({ role: 'user', content: continueNudge(lang) });
  }
  return { content: full.trim(), truncated: last.doneReason === 'length' };
}

function L(lang) {
  return lang === 'zh'
    ? {
        question: '使用者的問題:',
        memory: '先前討論的記憶:',
        soFar: '目前的討論記錄:',
        openFirst: '(目前還沒有人發言,請你開場。)',
        yourTurn: (n) => `輪到你(${n})發言:`,
        fullLog: '完整討論記錄:',
        concludeAsk: (n) => `請你(${n})為這場討論做出總結,綜合大家的觀點,給出完整、正確的最終解答。`,
        // Explicit language lock -- the last line carries the most weight for
        // small models, and the English transcript above can pull them off-language.
        replyIn: '(請務必以繁體中文回答,並保持你本人的口吻與時代語氣。)',
      }
    : {
        question: "The user's question:",
        memory: 'Memory of earlier discussion:',
        soFar: 'Discussion so far:',
        openFirst: '(No one has spoken yet -- you open the discussion.)',
        yourTurn: (n) => `Your turn to speak (${n}):`,
        fullLog: 'Full discussion transcript:',
        concludeAsk: (n) => `As ${n}, sum up the discussion: synthesize everyone's points into a clear, correct, complete final answer.`,
        replyIn: '(Reply in English, in your own voice and the tone of your era.)',
      };
}

function turnUserMessage(lang, question, memory, turns, speakerName) {
  const t = L(lang);
  const parts = [`${t.question}\n${question}`];
  if (memory) parts.push(`${t.memory}\n${memory}`);
  parts.push(turns.length ? `${t.soFar}\n${formatTranscript(turns)}` : t.openFirst);
  parts.push(t.yourTurn(speakerName));
  parts.push(t.replyIn);
  return parts.join('\n\n');
}

function conclusionUserMessage(lang, question, memory, turns, leadName) {
  const t = L(lang);
  const parts = [`${t.question}\n${question}`];
  if (memory) parts.push(`${t.memory}\n${memory}`);
  parts.push(`${t.fullLog}\n${formatTranscript(turns)}`);
  parts.push(t.concludeAsk(leadName));
  parts.push(t.replyIn);
  return parts.join('\n\n');
}

// Ask a neutral moderator whether the panel has fully answered the question.
async function isResolved(model, lang, question, turns, signal) {
  const system = lang === 'zh'
    ? '你是中立的主持人。只判斷專家小組是否已經對使用者的問題給出清楚、正確且完整的最終答案。只回覆「YES」或「NO」,不要任何其他文字。'
    : 'You are a neutral moderator. Decide only whether the panel has reached a clear, correct, and complete final answer to the user\'s question. Reply with exactly YES or NO -- nothing else.';
  const user = `${L(lang).question}\n${question}\n\n${L(lang).soFar}\n${formatTranscript(turns)}`;
  try {
    const { content } = await chat({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      optionOverrides: { temperature: 0, num_predict: 4 },
      signal,
    });
    return /^\s*(yes|是|對|已)/i.test(content);
  } catch {
    return false; // never let the moderator check abort the discussion
  }
}

// Run a full roundtable for one user question. `scientists` is the ranked panel
// (most-expert first). Returns the visible turns + conclusion and stop metadata.
export async function runDiscussion({ model, lang, scientists, question, memory = '', wikiContext = '', signal }, emit) {
  const dc = config.discussion;
  const window = model.contextTokens;
  const baseTokens = estimateTokens(buildPanelPrompt(scientists[0], {
    colleagues: scientists.slice(1).map((s) => nameOf(s, lang)),
    lang, wikiContext,
  })) + estimateTokens(question) + estimateTokens(memory);

  const turns = []; // [{ id, name, accent, content }]
  const usageNow = () => Math.min(1, (baseTokens + estimateTokens(formatTranscript(turns))) / window);

  // Report the starting usage from the carried memory (panel prompt + question +
  // all retained/summarized rounds) so a continued discussion shows its real
  // context fullness instead of resetting to 0% each new question.
  emit('meta', { usage: usageNow() });

  let stopReason = 'maxRounds';
  let resolved = false;

  // Shingle sets of every turn so far, for the repetition guard below.
  const priorShingles = [];

  outer:
  for (let round = 0; round < dc.maxRounds; round++) {
    emit('phase', { phase: 'discussing', round: round + 1, maxRounds: dc.maxRounds });

    let spoke = 0;     // turns actually produced this round
    let redundant = 0; // of those, how many merely restated earlier turns

    for (const sci of scientists) {
      // Stop before adding another turn once we are near the budget (but always
      // let the very first scientist speak so a discussion actually happens).
      if (turns.length && usageNow() >= dc.stopFraction) { stopReason = 'context'; break outer; }

      const colleagues = scientists.filter((s) => s.id !== sci.id).map((s) => nameOf(s, lang));
      const name = nameOf(sci, lang);
      emit('speaker', { id: sci.id, name, accent: sci.accent || '', role: 'turn', round: round + 1 });

      const system = buildPanelPrompt(sci, { colleagues, lang, summary: memory, wikiContext });
      const userMsg = turnUserMessage(lang, question, memory, turns, name);

      const out = await streamComplete({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        signal,
        numPredict: dc.turnTokens || 320,
        maxContinuations: dc.maxContinuations,
        lang,
      }, (delta) => emit('token', { id: sci.id, text: delta }));
      const reply = out.content;

      spoke++;
      // Flag a turn that mostly restates earlier turns -- the looping the user saw.
      if (priorShingles.length && maxSimilarity(reply, priorShingles) >= dc.repeatThreshold) redundant++;
      priorShingles.push(shingles(reply));

      turns.push({ id: sci.id, name, accent: sci.accent || '', content: reply });
      emit('turn-done', { id: sci.id, usage: usageNow() });
    }

    // Stall guard: once a full round (after the first, which sets the baseline)
    // only restates earlier turns, the panel has converged or is looping -- stop
    // and let the lead conclude rather than grinding out more identical rounds.
    if (round >= 1 && spoke > 0 && redundant === spoke) { stopReason = 'stalled'; break; }

    // After a completed round, let the moderator end it early if the question
    // looks fully answered (skip on the final round -- we conclude regardless).
    if (round < dc.maxRounds - 1 && dc.moderator && scientists.length > 1) {
      if (await isResolved(model, lang, question, turns, signal)) {
        resolved = true; stopReason = 'resolved'; break;
      }
    }
    if (usageNow() >= dc.stopFraction) { stopReason = 'context'; break; }
  }

  // ---- conclusion: the lead (most-expert) scientist synthesizes ----
  const lead = scientists[0];
  const leadName = nameOf(lead, lang);
  emit('phase', { phase: 'concluding', stopReason });
  emit('speaker', { id: lead.id, name: leadName, accent: lead.accent || '', role: 'conclusion' });

  const conclSystem = buildConclusionPrompt(lead, {
    colleagues: scientists.slice(1).map((s) => nameOf(s, lang)),
    lang, wikiContext,
  });
  const conclUser = conclusionUserMessage(lang, question, memory, turns, leadName);

  const conclOut = await streamComplete({
    model,
    messages: [
      { role: 'system', content: conclSystem },
      { role: 'user', content: conclUser },
    ],
    signal,
    numPredict: dc.conclusionTokens || 640,
    maxContinuations: dc.maxContinuations,
    lang,
  }, (delta) => emit('token', { id: lead.id, text: delta }));
  const conclusion = conclOut.content;
  emit('turn-done', { id: lead.id, role: 'conclusion', usage: usageNow() });

  return {
    turns,
    conclusion: { id: lead.id, name: leadName, accent: lead.accent || '', content: conclusion },
    resolved,
    stopReason,
    rounds: turns.length,
    usage: usageNow(),
  };
}
