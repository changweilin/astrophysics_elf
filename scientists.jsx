/* Scientists page UI -- a self-contained React app (UMD React + in-browser
   Babel, matching the rest of the demo). It talks to the local LLM backend
   purely over the REST/SSE contract; no engine code is imported here. */

const { useState, useEffect, useRef, useCallback } = React;

// ---- bilingual UI strings ----
const T = {
  zh: {
    title: '科學家對談',
    subtitle: '物理 · 數學 · 天文 · 宇宙學',
    roster: '選擇對談對象',
    placeholder: '向這位科學家提問...(Enter 送出,Shift+Enter 換行)',
    send: '送出',
    stop: '停止',
    settings: '設定',
    backendUrl: '後端位址 (本地 / Tailscale)',
    backendHint: '手機請填你的 Tailscale 主機,例如 https://your-host.ts.net:5188',
    save: '儲存',
    cancel: '取消',
    reset: '清除這段對話',
    online: '已連線',
    offline: '未連線',
    checking: '連線中...',
    emptyTitle: '挑一位科學家,開始提問',
    emptyBody: '用你習慣的語言發問即可;切換語言會自動換用該語言最強的本地模型。',
    summarizing: '脈絡已達上限,正在摘要先前對話...',
    summarized: '已摘要先前對話並重啟脈絡(第 {n} 次)',
    summaryErr: '摘要失敗,已保留最近幾輪對話繼續',
    ctx: '脈絡',
    suggestions: [
      '用思想實驗解釋時間膨脹',
      '黑洞的事件視界是什麼?',
      '請推導克卜勒第三定律',
      '暗物質的證據有哪些?',
    ],
    errPrefix: '發生錯誤:',
    noBackend: '無法連到後端。請先在本機啟動後端(scientists-backend 目錄執行 node server.mjs),或在設定中更正位址。',
    backendTrying: '嘗試連線後端:',
    retry: '重試連線',
  },
  en: {
    title: 'Talk with Scientists',
    subtitle: 'Physics · Math · Astronomy · Cosmology',
    roster: 'Choose a scientist',
    placeholder: 'Ask this scientist... (Enter to send, Shift+Enter for newline)',
    send: 'Send',
    stop: 'Stop',
    settings: 'Settings',
    backendUrl: 'Backend URL (local / Tailscale)',
    backendHint: 'On mobile, use your Tailscale host, e.g. https://your-host.ts.net:5188',
    save: 'Save',
    cancel: 'Cancel',
    reset: 'Clear this conversation',
    online: 'Online',
    offline: 'Offline',
    checking: 'Connecting...',
    emptyTitle: 'Pick a scientist and start asking',
    emptyBody: 'Ask in whatever language you like; switching language auto-swaps to the strongest local model for it.',
    summarizing: 'Context near the limit -- summarizing the earlier conversation...',
    summarized: 'Summarized earlier conversation and restarted context (#{n})',
    summaryErr: 'Summarization failed; kept the last few turns and continued',
    ctx: 'Context',
    suggestions: [
      'Explain time dilation with a thought experiment',
      "What is a black hole's event horizon?",
      "Derive Kepler's third law",
      'What is the evidence for dark matter?',
    ],
    errPrefix: 'Error: ',
    noBackend: 'Cannot reach the backend. Start it locally (run `node server.mjs` in scientists-backend), or fix the URL in Settings.',
    backendTrying: 'Trying backend:',
    retry: 'Retry',
  },
};

function nameFor(sci, lang) {
  return (sci.name && (sci.name[lang] || sci.name.en)) || sci.id;
}
function fieldsFor(sci, lang) {
  return (sci.fields && (sci.fields[lang] || sci.fields.en)) || '';
}
function blurbFor(sci, lang) {
  return (sci.blurb && (sci.blurb[lang] || sci.blurb.en)) || '';
}
function initialOf(sci) {
  const en = (sci.name && sci.name.en) || sci.id;
  return en.trim().charAt(0).toUpperCase();
}

// Minimal inline markdown: `code` spans only (keep it safe + simple).
function renderText(text) {
  const parts = String(text).split(/(`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) {
      return React.createElement('code', { key: i }, p.slice(1, -1));
    }
    return p;
  });
}

function SciAppRoot() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('kn_sci_lang') || 'zh'; } catch (e) { return 'zh'; }
  });
  const tr = T[lang] || T.zh;

  const [backendUrl, setBackendUrl] = useState(() => window.SCI.getBackendUrl());
  const [health, setHealth] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [models, setModels] = useState({ zh: '', en: '' });
  const [scientists, setScientists] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]); // {role:'user'|'sci'|'notice', text, kind?}
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState(0);
  const [activeModel, setActiveModel] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const sessionId = useRef('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  const selected = scientists.find((s) => s.id === selectedId) || null;

  // persist language
  useEffect(() => { try { localStorage.setItem('kn_sci_lang', lang); } catch (e) {} }, [lang]);

  // reflect language -> default active model chip
  useEffect(() => { setActiveModel(models[lang] || ''); }, [lang, models]);

  // health + scientist list (re-run when backend URL changes)
  const loadBackend = useCallback(async () => {
    setHealth('checking');
    try {
      const h = await fetch(backendUrl + '/api/health').then((r) => r.json());
      setHealth(h && h.ok ? 'online' : 'offline');
      if (h && h.models) setModels(h.models);
    } catch (e) { setHealth('offline'); }
    try {
      const d = await fetch(backendUrl + '/api/scientists').then((r) => r.json());
      if (d && Array.isArray(d.scientists)) {
        setScientists(d.scientists);
        setSelectedId((prev) => prev || (d.scientists[0] && d.scientists[0].id) || '');
      }
    } catch (e) { /* leave roster empty; health dot shows offline */ }
  }, [backendUrl]);

  useEffect(() => { loadBackend(); }, [loadBackend]);

  // autoscroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  function pushNotice(kind, text) {
    setMessages((m) => [...m, { role: 'notice', kind, text }]);
  }

  function selectScientist(id) {
    if (id === selectedId) return;
    setSelectedId(id);
    setMessages([]);
    setUsage(0);
    sessionId.current = ''; // fresh dialogue for the new persona
  }

  async function resetConversation() {
    if (sessionId.current) {
      try {
        await fetch(backendUrl + '/api/session/reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId.current }),
        });
      } catch (e) {}
    }
    sessionId.current = '';
    setMessages([]);
    setUsage(0);
  }

  function stopStreaming() {
    if (abortRef.current) abortRef.current.abort();
  }

  const sendMessage = useCallback(async (text) => {
    const msg = (text != null ? text : input).trim();
    if (!msg || streaming || !selected) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: msg }, { role: 'sci', text: '' }]);
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    // append streamed deltas to the last (sci) message
    const appendDelta = (delta) => {
      setMessages((m) => {
        const copy = m.slice();
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'sci') { copy[i] = { ...copy[i], text: copy[i].text + delta }; break; }
        }
        return copy;
      });
    };

    try {
      const res = await fetch(backendUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.current || undefined,
          scientistId: selected.id,
          lang,
          message: msg,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const line = frame.replace(/^data:\s?/, '');
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line); } catch (e) { continue; }
          handleEvent(ev, appendDelta);
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) pushNotice('err', tr.errPrefix + (e && e.message || e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, selected, backendUrl, lang, tr]);

  function handleEvent(ev, appendDelta) {
    if (ev.type === 'meta') {
      if (ev.sessionId) sessionId.current = ev.sessionId;
      if (ev.model) setActiveModel(ev.model);
      if (typeof ev.usage === 'number') setUsage(ev.usage);
    } else if (ev.type === 'token') {
      appendDelta(ev.text || '');
    } else if (ev.type === 'summary') {
      if (ev.state === 'start') pushNotice('summary', tr.summarizing);
      else if (ev.state === 'done') pushNotice('summary', tr.summarized.replace('{n}', ev.summaryCount || 1));
      else if (ev.state === 'error') pushNotice('summary', tr.summaryErr);
    } else if (ev.type === 'done') {
      if (typeof ev.usage === 'number') setUsage(ev.usage);
    } else if (ev.type === 'error') {
      pushNotice('err', tr.errPrefix + ev.error);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // ---- render ----
  const statusLabel = health === 'online' ? tr.online : health === 'offline' ? tr.offline : tr.checking;

  return (
    <div className="sci-app">
      <header className="sci-header">
        <div className="sci-title">{tr.title}<small>{tr.subtitle}</small></div>
        <nav className="kn-pagenav" aria-label="頁面導覽">
          <a className="kn-navbtn" href="index.html" title="黑洞實驗室 · Lab"><span className="kn-navdot" />實驗室</a>
          <a className="kn-navbtn" href="library.html" title="圖書館 · Library"><span className="kn-navdot" />圖書館</a>
        </nav>
        <div className="spacer" />
        <div className="sci-status" title={backendUrl}>
          <span className={'sci-dot ' + (health === 'online' ? 'ok' : health === 'offline' ? 'err' : '')} />
          {statusLabel}
        </div>
        <div className="sci-lang-toggle">
          <button className={lang === 'zh' ? 'active' : ''} onClick={() => setLang('zh')}>繁中</button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <button className="sci-iconbtn" onClick={() => setShowSettings(true)}>{tr.settings}</button>
      </header>

      <div className="sci-body">
        <nav className="sci-roster">
          <div className="sci-roster-label">{tr.roster}</div>
          {scientists.map((s) => (
            <button
              key={s.id}
              className={'sci-card' + (s.id === selectedId ? ' active' : '')}
              onClick={() => selectScientist(s.id)}
            >
              <span className="sci-avatar" style={{ background: s.accent || 'var(--accent)' }}>{initialOf(s)}</span>
              <span className="who">
                <div className="nm">{nameFor(s, lang)}</div>
                <div className="meta">{s.years} · {fieldsFor(s, lang)}</div>
              </span>
            </button>
          ))}
        </nav>

        <section className="sci-chat">
          <div className="sci-chat-head">
            {/* mobile picker */}
            <select
              className="sci-roster-select sci-iconbtn"
              value={selectedId}
              onChange={(e) => selectScientist(e.target.value)}
            >
              {scientists.map((s) => (
                <option key={s.id} value={s.id}>{nameFor(s, lang)} · {s.years}</option>
              ))}
            </select>

            {selected && (
              <div className="who">
                <div className="nm">{nameFor(selected, lang)}</div>
                <div className="meta">{fieldsFor(selected, lang)}</div>
              </div>
            )}
            <div className="spacer" />
            <div className="sci-meter" title={tr.ctx}>
              <span>{tr.ctx}</span>
              <span className="bar"><span className={'fill' + (usage >= 0.7 ? ' warn' : '')} style={{ width: Math.round(usage * 100) + '%' }} /></span>
              <span>{Math.round(usage * 100)}%</span>
            </div>
            {activeModel && <span className="sci-modelchip">{activeModel}</span>}
            <button className="sci-iconbtn" onClick={resetConversation} title={tr.reset}>↺</button>
          </div>

          <div className="sci-scroll" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="sci-empty">
                <h2>{tr.emptyTitle}</h2>
                <p>{tr.emptyBody}</p>
                <div className="sci-suggest">
                  {tr.suggestions.map((q, i) => (
                    <button key={i} onClick={() => sendMessage(q)} disabled={!selected || health !== 'online'}>{q}</button>
                  ))}
                </div>
                {health !== 'online' && (
                  <div style={{ marginTop: 16 }}>
                    {health === 'offline' && <p style={{ color: 'var(--err)' }}>{tr.noBackend}</p>}
                    <p className="sci-modelchip" style={{ display: 'inline-block' }}>{tr.backendTrying} {backendUrl}</p>
                    <div className="sci-suggest" style={{ marginTop: 10 }}>
                      <button onClick={loadBackend}>{tr.retry}</button>
                      <button onClick={() => setShowSettings(true)}>{tr.settings}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => {
              if (m.role === 'notice') {
                return <div key={i} className={'sci-notice ' + (m.kind || '')}>{m.text}</div>;
              }
              const isUser = m.role === 'user';
              const isLastSci = !isUser && i === messages.length - 1;
              return (
                <div key={i} className={'sci-msg ' + (isUser ? 'user' : 'sci')}>
                  {!isUser && selected && (
                    <span className="sci-avatar" style={{ background: selected.accent || 'var(--accent)', width: 30, height: 30, fontSize: '0.8rem' }}>{initialOf(selected)}</span>
                  )}
                  <div className="sci-bubble">
                    {renderText(m.text)}
                    {isLastSci && streaming && <span className="sci-typing" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sci-composer">
            <textarea
              rows={1}
              value={input}
              placeholder={tr.placeholder}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!selected}
            />
            {streaming
              ? <button className="sci-send sci-stop" onClick={stopStreaming}>{tr.stop}</button>
              : <button className="sci-send" onClick={() => sendMessage()} disabled={!input.trim() || !selected || health !== 'online'}>{tr.send}</button>}
          </div>
        </section>
      </div>

      {showSettings && (
        <SettingsModal
          tr={tr}
          initial={backendUrl}
          onClose={() => setShowSettings(false)}
          onSave={(url) => {
            window.SCI.setBackendUrl(url);
            setBackendUrl(window.SCI.getBackendUrl());
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

function SettingsModal({ tr, initial, onClose, onSave }) {
  const [url, setUrl] = useState(initial);
  return (
    <div className="sci-modal-backdrop" onClick={onClose}>
      <div className="sci-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tr.settings}</h3>
        <label>{tr.backendUrl}</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={window.SCI.defaultBackendUrl()} />
        <div className="hint">{tr.backendHint}</div>
        <div className="row">
          <button className="sci-iconbtn" onClick={onClose}>{tr.cancel}</button>
          <button className="sci-send" onClick={() => onSave(url)}>{tr.save}</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SciAppRoot />);
