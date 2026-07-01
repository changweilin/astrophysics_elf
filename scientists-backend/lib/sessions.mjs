// In-memory conversation store. Sessions hold the running message history plus
// the carried-over summary memory produced when context is compressed. Nothing
// is persisted to disk -- restarting the backend clears all sessions, which is
// the intended privacy posture for a personal local deployment.

import { randomUUID } from 'node:crypto';
import { config } from '../config.mjs';

const sessions = new Map(); // id -> session

function makeSession(scientistId, lang) {
  const now = Date.now();
  return {
    id: randomUUID(),
    scientistId,
    lang,
    summary: '',        // carried-over memory from past summarizations
    messages: [],       // [{ role: 'user' | 'assistant', content }]
    lastPromptTokens: 0,
    summaryCount: 0,
    shownFollowups: [], // follow-up questions already suggested this conversation (see lib/followups.mjs)
    createdAt: now,
    updatedAt: now,
  };
}

export function createSession(scientistId, lang) {
  evictIfNeeded();
  const s = makeSession(scientistId, lang);
  sessions.set(s.id, s);
  return s;
}

export function getSession(id) {
  return id ? sessions.get(id) || null : null;
}

// Get an existing session or create a fresh one. If the caller switches
// scientist or language on an existing id, reset the history but keep the id so
// the frontend's reference stays valid.
export function getOrCreateSession(id, scientistId, lang) {
  let s = getSession(id);
  if (!s) {
    s = makeSession(scientistId, lang);
    s.id = id || s.id;
    sessions.set(s.id, s);
    evictIfNeeded();
    return s;
  }
  if (s.scientistId !== scientistId) {
    // Different persona -> start a clean dialogue under the same id.
    s.scientistId = scientistId;
    s.messages = [];
    s.summary = '';
    s.lastPromptTokens = 0;
    s.summaryCount = 0;
    s.shownFollowups = [];
  }
  s.lang = lang;
  return s;
}

export function appendMessage(session, role, content) {
  session.messages.push({ role, content });
  session.updatedAt = Date.now();
}

// Replace the running history with the summary memory (the "restart" step).
export function restartWithSummary(session, summary) {
  session.summary = summary;
  session.messages = [];
  session.lastPromptTokens = 0;
  session.summaryCount += 1;
  session.updatedAt = Date.now();
}

export function deleteSession(id) {
  return sessions.delete(id);
}

// Record follow-up questions just shown to the user so a later round (single
// chat or discussion) knows to avoid repeating or near-duplicating them. Shared
// by both session shapes below -- both simply carry a `shownFollowups` array.
export function rememberFollowups(store, questions) {
  if (!store || !Array.isArray(questions) || !questions.length) return;
  if (!Array.isArray(store.shownFollowups)) store.shownFollowups = [];
  for (const q of questions) {
    if (!store.shownFollowups.includes(q)) store.shownFollowups.push(q);
  }
  // Cap so a very long conversation doesn't grow this list without bound.
  if (store.shownFollowups.length > 40) store.shownFollowups = store.shownFollowups.slice(-40);
}

export function sessionCount() {
  return sessions.size;
}

// Evict the least-recently-updated sessions when over the soft cap.
function evictIfNeeded() {
  if (sessions.size < config.maxSessions) return;
  const ordered = [...sessions.values()].sort((a, b) => a.updatedAt - b.updatedAt);
  const toRemove = sessions.size - config.maxSessions + 1;
  for (let i = 0; i < toRemove && i < ordered.length; i++) {
    sessions.delete(ordered[i].id);
  }
}

// ---- multi-scientist discussion sessions (Science Dialogue tab) ----
//
// A discussion remembers a panel (the set of scientist ids) plus a compact
// memory of past question -> conclusion pairs, so a follow-up question keeps
// continuity without replaying every scientist's every turn. The live, turn-by-
// turn transcript of a single question is ephemeral and lives only in the
// request handler; only the resulting (question, conclusion) pair is retained.

const discussions = new Map(); // id -> discussion

function makeDiscussion(scientistIds, lang) {
  const now = Date.now();
  return {
    id: randomUUID(),
    scientistIds: Array.isArray(scientistIds) ? scientistIds.slice() : [],
    lang,
    summary: '',          // carried-over memory from past summarizations
    rounds: [],           // [{ question, conclusion }] -- one entry per user turn
    summaryCount: 0,
    shownFollowups: [],   // follow-up questions already suggested this discussion (see lib/followups.mjs)
    createdAt: now,
    updatedAt: now,
  };
}

export function getDiscussion(id) {
  return id ? discussions.get(id) || null : null;
}

// Same arraysEqual semantics as the single chat: switching the panel under an
// existing id starts a clean discussion but keeps the id stable for the client.
function samePanel(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function getOrCreateDiscussion(id, scientistIds, lang) {
  let d = getDiscussion(id);
  if (!d) {
    d = makeDiscussion(scientistIds, lang);
    d.id = id || d.id;
    discussions.set(d.id, d);
    evictDiscussionsIfNeeded();
    return d;
  }
  if (!samePanel(d.scientistIds, scientistIds)) {
    d.scientistIds = Array.isArray(scientistIds) ? scientistIds.slice() : [];
    d.rounds = [];
    d.summary = '';
    d.summaryCount = 0;
    d.shownFollowups = [];
  }
  d.lang = lang;
  return d;
}

export function appendDiscussionRound(discussion, question, conclusion) {
  discussion.rounds.push({ question, conclusion });
  discussion.updatedAt = Date.now();
}

export function restartDiscussionWithSummary(discussion, summary) {
  discussion.summary = summary;
  discussion.rounds = [];
  discussion.summaryCount += 1;
  discussion.updatedAt = Date.now();
}

export function deleteDiscussion(id) {
  return discussions.delete(id);
}

function evictDiscussionsIfNeeded() {
  if (discussions.size < config.maxSessions) return;
  const ordered = [...discussions.values()].sort((a, b) => a.updatedAt - b.updatedAt);
  const toRemove = discussions.size - config.maxSessions + 1;
  for (let i = 0; i < toRemove && i < ordered.length; i++) {
    discussions.delete(ordered[i].id);
  }
}
