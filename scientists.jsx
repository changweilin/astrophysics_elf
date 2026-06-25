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
    tabChat: '對話',
    tabFav: '收藏',
    clear: '清理',
    summarize: '摘要',
    favorite: '收藏',
    saved: '已收藏這段對話',
    summaryNothing: '目前還沒有可摘要的內容',
    keypointsTitle: '重點摘要',
    favEmptyTitle: '還沒有收藏的對話',
    favEmptyBody: '在對話中按「收藏」,就能把整串對話存到這裡,日後隨時回顧或載入繼續。',
    favResume: '載入繼續',
    favDelete: '刪除',
    favBack: '返回收藏',
    favTurns: '則訊息',
    tabDiscuss: '科學對話',
    discussRoster: '點選加入討論成員',
    managePanel: '管理討論成員',
    members: '位成員',
    addMembers: '加入科學家',
    emptyPanelTitle: '先加入幾位科學家',
    emptyPanelBody: '從左側列表(手機請按「加入科學家」)挑選 2 至 5 位科學家組成討論小組。提出問題後,擅長該主題的人會先發言,並彼此回應、互相補充,直到得出結論。',
    discussEmptyTitle: '提出一個主題,讓科學家們一起討論',
    discussEmptyBody: '若主題正好是某些成員的專長,他們會帶頭發言、互相對話,直到獲得解答或脈絡達 50% 後做出結論。',
    discussPlaceholder: '提出討論主題...(Enter 送出,Shift+Enter 換行)',
    concluding: '正在綜合各方觀點,做出結論...',
    conclusion: '結論',
    panelFull: '討論成員已達上限(5 位)',
    done: '完成',
    discussSuggestions: [
      '黑洞最後會如何結束?',
      '宇宙為何會加速膨脹?',
      '時間有開始嗎?',
      '對稱性如何決定守恆律?',
    ],
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
    tabChat: 'Chat',
    tabFav: 'Saved',
    clear: 'Clear',
    summarize: 'Summarize',
    favorite: 'Save',
    saved: 'Conversation saved',
    summaryNothing: 'Nothing to summarize yet',
    keypointsTitle: 'Key points',
    favEmptyTitle: 'No saved conversations yet',
    favEmptyBody: 'Tap "Save" in a chat to keep the whole thread here -- revisit or resume it anytime.',
    favResume: 'Resume',
    favDelete: 'Delete',
    favBack: 'Back to saved',
    favTurns: 'messages',
    tabDiscuss: 'Dialogue',
    discussRoster: 'Tap to add panel members',
    managePanel: 'Manage panel',
    members: 'members',
    addMembers: 'Add scientists',
    emptyPanelTitle: 'Add a few scientists first',
    emptyPanelBody: 'Pick 2 to 5 scientists (from the list, or "Add scientists" on mobile) to form a panel. Ask a question and whoever is most expert speaks first, then they respond to and build on each other until they reach a conclusion.',
    discussEmptyTitle: 'Pose a topic for the scientists to discuss together',
    discussEmptyBody: "If the topic is a panelist's specialty, they lead off and talk to each other -- until they reach an answer or hit 50% of context, then they conclude.",
    discussPlaceholder: 'Pose a topic to discuss... (Enter to send, Shift+Enter for newline)',
    concluding: 'Synthesizing the discussion into a conclusion...',
    conclusion: 'Conclusion',
    panelFull: 'Panel is full (max 5)',
    done: 'Done',
    discussSuggestions: [
      'How will a black hole finally end?',
      "Why is the universe's expansion accelerating?",
      'Did time have a beginning?',
      'How does symmetry dictate conservation laws?',
    ],
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

// Comic-style portrait avatar. Uses window.knSciAvatar (scientist-avatars.js)
// for a recognizable SVG face; falls back to the coloured initial if the helper
// or the id is missing. Works at any size (the circle wrapper clips the SVG).
function SciAvatar({ id, accent, name, size = 38, className = '' }) {
  const svg = (id && window.knSciAvatar) ? window.knSciAvatar(id, accent || '#7db3ff') : '';
  const dim = typeof size === 'number' ? size + 'px' : size;
  const fontSize = (typeof size === 'number' ? Math.round(size * 0.42) : 16) + 'px';
  if (svg) {
    return (
      <span
        className={'sci-avatar ' + className}
        style={{ width: dim, height: dim, background: 'transparent', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  const initial = String(name || id || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={'sci-avatar ' + className} style={{ width: dim, height: dim, fontSize, background: accent || 'var(--accent)' }}>
      {initial}
    </span>
  );
}

// Cap on how many scientists may share one discussion (matches the backend).
const DISCUSS_MAX = 5;

// Inline header icons (stroke, currentColor; sized via CSS). Match the shared
// nav icons used on the lab + library pages so the three top bars feel alike.
const IconLab = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.5 3h5" />
    <path d="M10 3v5.3L5.4 18a1.6 1.6 0 0 0 1.45 2.3h10.3A1.6 1.6 0 0 0 18.6 18L14 8.3V3" />
    <path d="M7.6 14.5h8.8" />
  </svg>
);
const IconBook = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6.4C12 6.4 9.8 4.6 4.6 4.6V16.6C9.8 16.6 12 18.4 12 18.4" />
    <path d="M12 6.4C12 6.4 14.2 4.6 19.4 4.6V16.6C14.2 16.6 12 18.4 12 18.4" />
  </svg>
);
const IconGear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.6 14a1.5 1.5 0 0 0 .3 1.65l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.5 1.5 0 0 0-2.55 1.06V20a2 2 0 1 1-4 0v-.07A1.5 1.5 0 0 0 9 18.6a1.5 1.5 0 0 0-1.65.3l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.5 1.5 0 0 0 4.07 13H4a2 2 0 1 1 0-4h.07A1.5 1.5 0 0 0 5.4 7a1.5 1.5 0 0 0-.3-1.65l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05A1.5 1.5 0 0 0 9 2.4h.07A1.5 1.5 0 0 0 11 1.07V1a2 2 0 1 1 4 0v.07A1.5 1.5 0 0 0 16.65 2.4l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.5 1.5 0 0 0 19.6 7V7a1.5 1.5 0 0 0 1.33 1H21a2 2 0 1 1 0 4h-.07A1.5 1.5 0 0 0 19.6 14z" />
  </svg>
);
// Clear: eraser sweeping the slate.
const IconClear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7.5 18.5 4 15a1.6 1.6 0 0 1 0-2.3l7.2-7.2a1.6 1.6 0 0 1 2.3 0l4.7 4.7a1.6 1.6 0 0 1 0 2.3l-6 6z" />
    <path d="M8 19h10.5" />
    <path d="m9.2 8.2 6.6 6.6" />
  </svg>
);
// Summarize: collapse many lines into a few key points.
const IconSummarize = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h16" />
    <path d="M4 10h10" />
    <path d="M4 14h16" />
    <path d="M4 18h7" />
    <path d="m17.5 12 2.5 2.5 2.5-2.5" />
  </svg>
);
// Save / favorite: bookmark.
const IconBookmark = ({ filled }) => (
  <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 4.5h12a1 1 0 0 1 1 1V20l-7-4-7 4V5.5a1 1 0 0 1 1-1z" />
  </svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
const IconBack = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
// Panel / roundtable of scientists.
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="9" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6.2a3.2 3.2 0 0 1 0 5.6" />
    <path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// ---- local persistence ----
// The live conversation and the saved-thread collection both survive a page
// reload (and let you continue talking later) by living in localStorage.
const PERSIST_KEY = 'kn_sci_session_v1';
const PERSIST_DISCUSS_KEY = 'kn_sci_discuss_v1';
const FAV_KEY = 'kn_sci_favorites_v1';

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
// First user line of a thread -- used as the saved-thread title.
function threadTitle(messages) {
  const first = (messages || []).find((m) => m.role === 'user');
  return first ? first.text : '';
}

function SciAppRoot() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('kn_sci_lang') || 'zh'; } catch (e) { return 'zh'; }
  });
  const tr = T[lang] || T.zh;

  // Restore the previous live conversation (if any) on first mount.
  const persisted = useRef(loadJSON(PERSIST_KEY, {})).current;
  // ...and the previous multi-scientist discussion (Science Dialogue tab).
  const persistedD = useRef(loadJSON(PERSIST_DISCUSS_KEY, {})).current;

  const [backendUrl, setBackendUrl] = useState(() => window.SCI.getBackendUrl());
  const [health, setHealth] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [models, setModels] = useState({ zh: '', en: '' });
  const [scientists, setScientists] = useState([]);
  const [selectedId, setSelectedId] = useState(persisted.selectedId || '');
  const [messages, setMessages] = useState(Array.isArray(persisted.messages) ? persisted.messages : []); // {role:'user'|'sci'|'notice', text, kind?}
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState(persisted.usage || 0);
  const [activeModel, setActiveModel] = useState(persisted.activeModel || '');
  const [showSettings, setShowSettings] = useState(false);

  // 'chat' (live single conversation) | 'favorites' (saved threads)
  const [view, setView] = useState('chat');
  const [favorites, setFavorites] = useState(() => {
    const v = loadJSON(FAV_KEY, []);
    return Array.isArray(v) ? v : [];
  });
  const [openFav, setOpenFav] = useState(null); // a saved thread being viewed

  // ---- Science Dialogue (multi-scientist roundtable) state ----
  const [panel, setPanel] = useState(Array.isArray(persistedD.panel) ? persistedD.panel : []);
  const [discussMessages, setDiscussMessages] = useState(Array.isArray(persistedD.messages) ? persistedD.messages : []);
  const [discussInput, setDiscussInput] = useState('');
  const [discussStreaming, setDiscussStreaming] = useState(false);
  const [discussUsage, setDiscussUsage] = useState(persistedD.usage || 0);
  const [discussModel, setDiscussModel] = useState(persistedD.activeModel || '');
  const [showPanelPicker, setShowPanelPicker] = useState(false);
  const discussSessionId = useRef(persistedD.sessionId || '');
  const discussAbortRef = useRef(null);

  const sessionId = useRef(persisted.sessionId || '');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  const selected = scientists.find((s) => s.id === selectedId) || null;
  const panelScientists = panel.map((id) => scientists.find((s) => s.id === id)).filter(Boolean);

  // persist language
  useEffect(() => { try { localStorage.setItem('kn_sci_lang', lang); } catch (e) {} }, [lang]);

  // Persist the live conversation so a reload keeps it (and the session id, so
  // the backend can continue the same dialogue while its session is alive).
  useEffect(() => {
    saveJSON(PERSIST_KEY, { selectedId, messages, usage, activeModel, sessionId: sessionId.current });
  }, [selectedId, messages, usage, activeModel, streaming]);

  // Persist the live discussion (panel + transcript + session id) across reloads.
  useEffect(() => {
    saveJSON(PERSIST_DISCUSS_KEY, { panel, messages: discussMessages, usage: discussUsage, activeModel: discussModel, sessionId: discussSessionId.current });
  }, [panel, discussMessages, discussUsage, discussModel, discussStreaming]);

  // Persist the saved-thread collection whenever it changes.
  useEffect(() => { saveJSON(FAV_KEY, favorites); }, [favorites]);

  // reflect language -> default active model chip
  useEffect(() => { setActiveModel(models[lang] || ''); setDiscussModel((m) => m || models[lang] || ''); }, [lang, models]);

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
        // Keep the restored selection if it still exists, else default to first.
        setSelectedId((prev) =>
          (prev && d.scientists.some((s) => s.id === prev))
            ? prev
            : (d.scientists[0] && d.scientists[0].id) || '');
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

  // Manually compress the running dialogue into a few key points. The backend
  // summarizes + restarts the session memory; we surface the bullets inline.
  async function summarizeNow() {
    if (streaming) return;
    if (!sessionId.current || !messages.some((m) => m.role === 'user')) {
      pushNotice('summary', tr.summaryNothing);
      return;
    }
    pushNotice('summary', tr.summarizing);
    try {
      const r = await fetch(backendUrl + '/api/session/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current, lang }),
      }).then((res) => res.json());
      if (r && r.ok && r.changed) {
        pushNotice('keypoints', r.summary || '');
        setUsage(typeof r.usage === 'number' ? r.usage : 0);
      } else if (r && r.ok) {
        pushNotice('summary', tr.summaryNothing);
      } else {
        pushNotice('err', tr.errPrefix + ((r && r.error) || 'summarize failed'));
      }
    } catch (e) {
      pushNotice('err', tr.errPrefix + ((e && e.message) || e));
    }
  }

  // Snapshot the current thread into the saved collection.
  function saveFavorite() {
    if (!selected || !messages.some((m) => m.role === 'user' || m.role === 'sci')) return;
    const fav = {
      id: uid(),
      scientistId: selected.id,
      name: nameFor(selected, lang),
      accent: selected.accent || '',
      years: selected.years || '',
      lang,
      messages: messages.slice(),
      title: threadTitle(messages),
      savedAt: Date.now(),
    };
    setFavorites((f) => [fav, ...f]);
    pushNotice('saved', tr.saved);
  }

  function deleteFavorite(id) {
    setFavorites((f) => f.filter((x) => x.id !== id));
    setOpenFav((cur) => (cur && cur.id === id ? null : cur));
  }

  // Load a saved thread back into the live chat to keep talking. The backend
  // starts a fresh session (its in-memory context for the old one is gone), so
  // the visible history returns while the dialogue continues from here.
  function resumeFavorite(fav) {
    if (fav.mode === 'discuss') {
      setPanel(Array.isArray(fav.panel) ? fav.panel.slice() : []);
      setDiscussMessages(fav.messages.slice());
      setDiscussUsage(0);
      discussSessionId.current = '';
      setOpenFav(null);
      setView('discuss');
      return;
    }
    setSelectedId(fav.scientistId);
    setMessages(fav.messages.slice());
    setUsage(0);
    sessionId.current = '';
    setOpenFav(null);
    setView('chat');
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

  // ---- Science Dialogue (multi-scientist roundtable) handlers ----

  function togglePanelMember(id) {
    setPanel((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= DISCUSS_MAX) return p; // panel full
      return [...p, id];
    });
  }

  function pushDiscussNotice(kind, text) {
    setDiscussMessages((m) => [...m, { role: 'notice', kind, text }]);
  }

  // Append a streamed delta to the most recent speaker's bubble.
  function appendDiscussDelta(delta) {
    setDiscussMessages((m) => {
      const c = m.slice();
      for (let i = c.length - 1; i >= 0; i--) {
        if (c[i].role === 'sci') { c[i] = { ...c[i], text: c[i].text + delta }; break; }
      }
      return c;
    });
  }

  function handleDiscussEvent(ev) {
    if (ev.type === 'meta') {
      if (ev.sessionId) discussSessionId.current = ev.sessionId;
      if (ev.model) setDiscussModel(ev.model);
      if (typeof ev.usage === 'number') setDiscussUsage(ev.usage);
    } else if (ev.type === 'phase') {
      setDiscussMessages((m) => [...m, { role: 'phase', phase: ev.phase, round: ev.round, maxRounds: ev.maxRounds, stopReason: ev.stopReason }]);
    } else if (ev.type === 'speaker') {
      setDiscussMessages((m) => [...m, { role: 'sci', id: ev.id, name: ev.name, accent: ev.accent, text: '', conclusion: ev.role === 'conclusion' }]);
    } else if (ev.type === 'token') {
      appendDiscussDelta(ev.text || '');
    } else if (ev.type === 'turn-done' || ev.type === 'done') {
      if (typeof ev.usage === 'number') setDiscussUsage(ev.usage);
    } else if (ev.type === 'error') {
      pushDiscussNotice('err', tr.errPrefix + ev.error);
    }
  }

  async function sendDiscuss(text) {
    const msg = (text != null ? text : discussInput).trim();
    if (!msg || discussStreaming || panel.length === 0) return;
    setDiscussInput('');
    setDiscussMessages((m) => [...m, { role: 'user', text: msg }]);
    setDiscussStreaming(true);

    const ac = new AbortController();
    discussAbortRef.current = ac;
    try {
      const res = await fetch(backendUrl + '/api/discuss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: discussSessionId.current || undefined,
          scientistIds: panel,
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
          handleDiscussEvent(ev);
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) pushDiscussNotice('err', tr.errPrefix + (e && e.message || e));
    } finally {
      setDiscussStreaming(false);
      discussAbortRef.current = null;
    }
  }

  function stopDiscuss() {
    if (discussAbortRef.current) discussAbortRef.current.abort();
  }

  async function clearDiscuss() {
    if (discussSessionId.current) {
      try {
        await fetch(backendUrl + '/api/discuss/reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: discussSessionId.current }),
        });
      } catch (e) {}
    }
    discussSessionId.current = '';
    setDiscussMessages([]);
    setDiscussUsage(0);
  }

  async function summarizeDiscuss() {
    if (discussStreaming) return;
    if (!discussSessionId.current || !discussMessages.some((m) => m.role === 'user')) {
      pushDiscussNotice('summary', tr.summaryNothing);
      return;
    }
    pushDiscussNotice('summary', tr.summarizing);
    try {
      const r = await fetch(backendUrl + '/api/discuss/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: discussSessionId.current, lang }),
      }).then((res) => res.json());
      if (r && r.ok && r.changed) {
        pushDiscussNotice('keypoints', r.summary || '');
        setDiscussUsage(typeof r.usage === 'number' ? r.usage : 0);
      } else if (r && r.ok) {
        pushDiscussNotice('summary', tr.summaryNothing);
      } else {
        pushDiscussNotice('err', tr.errPrefix + ((r && r.error) || 'summarize failed'));
      }
    } catch (e) {
      pushDiscussNotice('err', tr.errPrefix + ((e && e.message) || e));
    }
  }

  function saveDiscussFavorite() {
    if (!discussMessages.some((m) => m.role === 'user' || m.role === 'sci')) return;
    const names = panel.map((id) => {
      const sc = scientists.find((s) => s.id === id);
      return sc ? nameFor(sc, lang) : id;
    });
    const panelAccents = panel.map((id) => {
      const sc = scientists.find((s) => s.id === id);
      return (sc && sc.accent) || '';
    });
    const lead = scientists.find((s) => s.id === panel[0]);
    const fav = {
      id: uid(),
      mode: 'discuss',
      panel: panel.slice(),
      names,
      panelAccents,
      scientistId: panel[0] || '',
      name: names.join(' · '),
      accent: (lead && lead.accent) || '',
      lang,
      messages: discussMessages.slice(),
      title: threadTitle(discussMessages),
      savedAt: Date.now(),
    };
    setFavorites((f) => [fav, ...f]);
    pushDiscussNotice('saved', tr.saved);
  }

  function onDiscussKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDiscuss(); }
  }

  // ---- render ----
  const statusLabel = health === 'online' ? tr.online : health === 'offline' ? tr.offline : tr.checking;
  const statusClass = health === 'online' ? 'ok' : health === 'offline' ? 'err' : '';

  return (
    <div className="sci-app">
      <header className="sci-header">
        <div className="kn-brand">
          <img src="/logos/icon-192.png" alt="" width="24" height="24" />
          <span className="kn-brand-name"><strong>ASTRO ELF</strong><span className="kn-brand-suffix">{lang === 'zh' ? '黑洞實驗室' : 'Black Hole Lab'}</span></span>
        </div>
        <div className="spacer" />
        <nav className="kn-pagenav" aria-label="頁面導覽">
          <a className="kn-navbtn" href="index.html" title="實驗室 · Lab" aria-label="實驗室"><IconLab /></a>
          <a className="kn-navbtn" href="library.html" title="圖書館 · Library" aria-label="圖書館"><IconBook /></a>
        </nav>
        <select className="sci-lang-select" aria-label="language" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="zh">繁中</option>
          <option value="en">English</option>
        </select>
        <button className="sci-iconbtn sci-gear" onClick={() => setShowSettings(true)} title={tr.settings} aria-label={tr.settings}><IconGear /></button>
      </header>

      <div className="sci-tabs" role="tablist">
        <button role="tab" aria-selected={view === 'chat'} className={'sci-tab' + (view === 'chat' ? ' active' : '')} onClick={() => setView('chat')}>{tr.tabChat}</button>
        <button role="tab" aria-selected={view === 'discuss'} className={'sci-tab' + (view === 'discuss' ? ' active' : '')} onClick={() => setView('discuss')}>
          <IconUsers />{tr.tabDiscuss}{panel.length > 0 && <span className="sci-tab-badge">{panel.length}</span>}
        </button>
        <button role="tab" aria-selected={view === 'favorites'} className={'sci-tab' + (view === 'favorites' ? ' active' : '')} onClick={() => setView('favorites')}>
          {tr.tabFav}{favorites.length > 0 && <span className="sci-tab-badge">{favorites.length}</span>}
        </button>
      </div>

      {view === 'favorites' ? (
        <div className="sci-favorites">
          {openFav ? (
            <FavReader fav={openFav} tr={tr} lang={lang} onBack={() => setOpenFav(null)} onResume={() => resumeFavorite(openFav)} onDelete={() => deleteFavorite(openFav.id)} />
          ) : favorites.length === 0 ? (
            <div className="sci-empty"><h2>{tr.favEmptyTitle}</h2><p>{tr.favEmptyBody}</p></div>
          ) : (
            <div className="sci-fav-grid">
              {favorites.map((f) => (
                <FavCard key={f.id} fav={f} tr={tr} lang={lang} onOpen={() => setOpenFav(f)} onResume={() => resumeFavorite(f)} onDelete={() => deleteFavorite(f.id)} />
              ))}
            </div>
          )}
        </div>
      ) : view === 'discuss' ? (
        <DiscussView
          tr={tr}
          lang={lang}
          scientists={scientists}
          panel={panel}
          panelScientists={panelScientists}
          onToggle={togglePanelMember}
          messages={discussMessages}
          input={discussInput}
          setInput={setDiscussInput}
          streaming={discussStreaming}
          usage={discussUsage}
          activeModel={discussModel}
          health={health}
          backendUrl={backendUrl}
          statusLabel={statusLabel}
          statusClass={statusClass}
          onSend={sendDiscuss}
          onStop={stopDiscuss}
          onKey={onDiscussKeyDown}
          onClear={clearDiscuss}
          onSummarize={summarizeDiscuss}
          onSave={saveDiscussFavorite}
          showPicker={showPanelPicker}
          setShowPicker={setShowPanelPicker}
          onRetry={loadBackend}
          onSettings={() => setShowSettings(true)}
        />
      ) : (
      <div className="sci-body">
        <nav className="sci-roster">
          <div className="sci-roster-label">{tr.roster}</div>
          {scientists.map((s) => (
            <button
              key={s.id}
              className={'sci-card' + (s.id === selectedId ? ' active' : '')}
              onClick={() => selectScientist(s.id)}
            >
              <SciAvatar id={s.id} accent={s.accent} name={(s.name && s.name.en) || s.id} size={38} />
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
            <span className="sci-statusdot" title={statusLabel} aria-label={statusLabel}>
              <span className={'sci-dot ' + statusClass} />
            </span>
            {activeModel && <span className="sci-modelchip">{activeModel}</span>}
            <div className="sci-meter" title={tr.ctx}>
              <span>{tr.ctx}</span>
              <span className="bar"><span className={'fill' + (usage >= 0.7 ? ' warn' : '')} style={{ width: Math.round(usage * 100) + '%' }} /></span>
              <span>{Math.round(usage * 100)}%</span>
            </div>
            <div className="sci-headbtns">
              <button className="sci-iconbtn" onClick={resetConversation} title={tr.clear} aria-label={tr.clear}><IconClear /></button>
              <button className="sci-iconbtn" onClick={summarizeNow} title={tr.summarize} aria-label={tr.summarize} disabled={streaming}><IconSummarize /></button>
              <button className="sci-iconbtn" onClick={saveFavorite} title={tr.favorite} aria-label={tr.favorite}><IconBookmark /></button>
            </div>
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
                if (m.kind === 'keypoints') {
                  return (
                    <div key={i} className="sci-keypoints">
                      <span className="kp-title">{tr.keypointsTitle}</span>
                      <div className="kp-body">{m.text}</div>
                    </div>
                  );
                }
                return <div key={i} className={'sci-notice ' + (m.kind || '')}>{m.text}</div>;
              }
              const isUser = m.role === 'user';
              const isLastSci = !isUser && i === messages.length - 1;
              return (
                <div key={i} className={'sci-msg ' + (isUser ? 'user' : 'sci')}>
                  {!isUser && selected && (
                    <SciAvatar id={selected.id} accent={selected.accent} name={(selected.name && selected.name.en) || selected.id} size={30} />
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
      )}

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

function favDateLabel(ts, lang) {
  try {
    return new Date(ts).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US',
      { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

// A saved-thread card in the 收藏 grid.
function FavCard({ fav, tr, lang, onOpen, onResume, onDelete }) {
  const turns = (fav.messages || []).filter((m) => m.role === 'user' || m.role === 'sci').length;
  const isDiscuss = fav.mode === 'discuss';
  return (
    <div className="sci-fav-card" onClick={onOpen}>
      <div className="fav-top">
        {isDiscuss ? (
          <span className="sci-panel-stack">
            {(fav.panel || []).slice(0, 3).map((id, k) => (
              <SciAvatar key={id} id={id} accent={(fav.panelAccents && fav.panelAccents[k]) || fav.accent} name={(fav.names && fav.names[k]) || id} size={28} className="stacked" />
            ))}
            {(fav.panel || []).length > 3 && <span className="sci-panel-more">+{fav.panel.length - 3}</span>}
          </span>
        ) : (
          <SciAvatar id={fav.scientistId} accent={fav.accent} name={fav.name} size={30} />
        )}
        <div className="fav-meta">
          <div className="nm">{isDiscuss && <IconUsers />}{fav.name}</div>
          <div className="sub">{favDateLabel(fav.savedAt, lang)} · {turns} {tr.favTurns}</div>
        </div>
      </div>
      <div className="fav-title">{fav.title || ''}</div>
      <div className="fav-actions" onClick={(e) => e.stopPropagation()}>
        <button className="sci-iconbtn" onClick={onResume} title={tr.favResume}>{tr.favResume}</button>
        <button className="sci-iconbtn fav-del" onClick={onDelete} title={tr.favDelete} aria-label={tr.favDelete}><IconTrash /></button>
      </div>
    </div>
  );
}

// Full transcript of one saved thread, with resume / delete.
function FavReader({ fav, tr, lang, onBack, onResume, onDelete }) {
  const isDiscuss = fav.mode === 'discuss';
  return (
    <div className="sci-fav-reader">
      <div className="fav-reader-head">
        <button className="sci-iconbtn" onClick={onBack} title={tr.favBack} aria-label={tr.favBack}><IconBack /></button>
        <div className="who">
          <div className="nm">{isDiscuss && <IconUsers />}{fav.name}</div>
          <div className="meta">{favDateLabel(fav.savedAt, lang)}</div>
        </div>
        <div className="spacer" />
        <button className="sci-iconbtn" onClick={onResume} title={tr.favResume}>{tr.favResume}</button>
        <button className="sci-iconbtn fav-del" onClick={onDelete} title={tr.favDelete} aria-label={tr.favDelete}><IconTrash /></button>
      </div>
      <div className="sci-scroll fav-reader-scroll">
        {isDiscuss ? (
          <DiscussMessages messages={fav.messages || []} tr={tr} lang={lang} streaming={false} />
        ) : (
          (fav.messages || []).map((m, i) => {
            if (m.role === 'notice') {
              if (m.kind === 'keypoints') {
                return <div key={i} className="sci-keypoints"><span className="kp-title">{tr.keypointsTitle}</span><div className="kp-body">{m.text}</div></div>;
              }
              return <div key={i} className={'sci-notice ' + (m.kind || '')}>{m.text}</div>;
            }
            const isUser = m.role === 'user';
            return (
              <div key={i} className={'sci-msg ' + (isUser ? 'user' : 'sci')}>
                {!isUser && <SciAvatar id={fav.scientistId} accent={fav.accent} name={fav.name} size={30} />}
                <div className="sci-bubble">{renderText(m.text)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Shared renderer for a multi-scientist discussion transcript (used by the live
// Science Dialogue view and by saved-thread playback). Speaker turns carry the
// speaking scientist's avatar + name; the closing synthesis renders as a
// distinct "conclusion" card.
function DiscussMessages({ messages, tr, lang, streaming }) {
  let lastSci = -1;
  for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'sci') { lastSci = i; break; } }
  return messages.map((m, i) => {
    if (m.role === 'notice') {
      if (m.kind === 'keypoints') {
        return <div key={i} className="sci-keypoints"><span className="kp-title">{tr.keypointsTitle}</span><div className="kp-body">{m.text}</div></div>;
      }
      return <div key={i} className={'sci-notice ' + (m.kind || '')}>{m.text}</div>;
    }
    if (m.role === 'phase') {
      if (m.phase === 'concluding') {
        return <div key={i} className="sci-phase concluding">{tr.concluding}</div>;
      }
      const label = lang === 'zh' ? ('第 ' + (m.round || 1) + ' 輪討論') : ('Round ' + (m.round || 1));
      return <div key={i} className="sci-phase"><span>{label}</span></div>;
    }
    if (m.role === 'user') {
      return (
        <div key={i} className="sci-msg user">
          <div className="sci-bubble">{renderText(m.text)}</div>
        </div>
      );
    }
    // m.role === 'sci'
    const typing = i === lastSci && streaming;
    if (m.conclusion) {
      return (
        <div key={i} className="sci-conclusion">
          <div className="cc-head">
            <SciAvatar id={m.id} accent={m.accent} name={m.name} size={26} />
            <span className="cc-title">{tr.conclusion} · {m.name}</span>
          </div>
          <div className="cc-body">{renderText(m.text)}{typing && <span className="sci-typing" />}</div>
        </div>
      );
    }
    return (
      <div key={i} className="sci-msg sci discuss">
        <SciAvatar id={m.id} accent={m.accent} name={m.name} size={30} />
        <div className="sci-bubble-wrap">
          <div className="sci-speaker">{m.name}</div>
          <div className="sci-bubble">{renderText(m.text)}{typing && <span className="sci-typing" />}</div>
        </div>
      </div>
    );
  });
}

// The Science Dialogue tab: pick a panel of scientists (left, or via the mobile
// "manage" modal) and pose a topic; whoever is most expert leads and the panel
// talks it out, then concludes. Other controls mirror the single-chat tab.
function DiscussView({
  tr, lang, scientists, panel, panelScientists, onToggle, messages, input, setInput,
  streaming, usage, activeModel, health, backendUrl, statusLabel, statusClass,
  onSend, onStop, onKey, onClear, onSummarize, onSave, showPicker, setShowPicker,
  onRetry, onSettings,
}) {
  const scrollRef = useRef(null);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, streaming]);
  const hasPanel = panel.length > 0;
  return (
    <div className="sci-body">
      <nav className="sci-roster sci-roster-discuss">
        <div className="sci-roster-label">{tr.discussRoster}</div>
        {scientists.map((s) => {
          const on = panel.includes(s.id);
          return (
            <button
              key={s.id}
              className={'sci-card' + (on ? ' active' : '')}
              onClick={() => onToggle(s.id)}
              aria-pressed={on}
            >
              <SciAvatar id={s.id} accent={s.accent} name={(s.name && s.name.en) || s.id} size={38} />
              <span className="who">
                <div className="nm">{nameFor(s, lang)}</div>
                <div className="meta">{fieldsFor(s, lang)}</div>
              </span>
              <span className={'sci-toggle' + (on ? ' on' : '')}>{on ? <IconCheck /> : <IconPlus />}</span>
            </button>
          );
        })}
      </nav>

      <section className="sci-chat sci-discuss">
        <div className="sci-chat-head">
          <button className="sci-iconbtn sci-managebtn" onClick={() => setShowPicker(true)} title={tr.managePanel} aria-label={tr.managePanel}>
            <IconUsers />
          </button>
          <span className="sci-panel-stack head">
            {panelScientists.slice(0, 5).map((s) => (
              <SciAvatar key={s.id} id={s.id} accent={s.accent} name={(s.name && s.name.en) || s.id} size={28} className="stacked" />
            ))}
          </span>
          <div className="who">
            <div className="nm">{tr.tabDiscuss}</div>
            <div className="meta">{panel.length} {tr.members}</div>
          </div>
          <div className="spacer" />
          <span className="sci-statusdot" title={statusLabel} aria-label={statusLabel}><span className={'sci-dot ' + statusClass} /></span>
          {activeModel && <span className="sci-modelchip">{activeModel}</span>}
          <div className="sci-meter" title={tr.ctx}>
            <span>{tr.ctx}</span>
            <span className="bar"><span className={'fill' + (usage >= 0.45 ? ' warn' : '')} style={{ width: Math.round(usage * 100) + '%' }} /></span>
            <span>{Math.round(usage * 100)}%</span>
          </div>
          <div className="sci-headbtns">
            <button className="sci-iconbtn" onClick={onClear} title={tr.clear} aria-label={tr.clear}><IconClear /></button>
            <button className="sci-iconbtn" onClick={onSummarize} title={tr.summarize} aria-label={tr.summarize} disabled={streaming}><IconSummarize /></button>
            <button className="sci-iconbtn" onClick={onSave} title={tr.favorite} aria-label={tr.favorite}><IconBookmark /></button>
          </div>
        </div>

        <div className="sci-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="sci-empty">
              {!hasPanel ? (
                <React.Fragment>
                  <h2>{tr.emptyPanelTitle}</h2>
                  <p>{tr.emptyPanelBody}</p>
                  <div className="sci-suggest" style={{ marginTop: 14 }}>
                    <button onClick={() => setShowPicker(true)}><IconPlus />{tr.addMembers}</button>
                  </div>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <h2>{tr.discussEmptyTitle}</h2>
                  <p>{tr.discussEmptyBody}</p>
                  <div className="sci-suggest">
                    {tr.discussSuggestions.map((q, i) => (
                      <button key={i} onClick={() => onSend(q)} disabled={health !== 'online'}>{q}</button>
                    ))}
                  </div>
                </React.Fragment>
              )}
              {health !== 'online' && (
                <div style={{ marginTop: 16 }}>
                  {health === 'offline' && <p style={{ color: 'var(--err)' }}>{tr.noBackend}</p>}
                  <p className="sci-modelchip" style={{ display: 'inline-block' }}>{tr.backendTrying} {backendUrl}</p>
                  <div className="sci-suggest" style={{ marginTop: 10 }}>
                    <button onClick={onRetry}>{tr.retry}</button>
                    <button onClick={onSettings}>{tr.settings}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DiscussMessages messages={messages} tr={tr} lang={lang} streaming={streaming} />
        </div>

        <div className="sci-composer">
          <textarea
            rows={1}
            value={input}
            placeholder={tr.discussPlaceholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={!hasPanel}
          />
          {streaming
            ? <button className="sci-send sci-stop" onClick={onStop}>{tr.stop}</button>
            : <button className="sci-send" onClick={() => onSend()} disabled={!input.trim() || !hasPanel || health !== 'online'}>{tr.send}</button>}
        </div>
      </section>

      {showPicker && (
        <PanelPicker
          tr={tr}
          lang={lang}
          scientists={scientists}
          panel={panel}
          onToggle={onToggle}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// Modal list to add/remove panel members (the primary control on mobile, where
// the roster column is hidden).
function PanelPicker({ tr, lang, scientists, panel, onToggle, onClose }) {
  const full = panel.length >= DISCUSS_MAX;
  return (
    <div className="sci-modal-backdrop" onClick={onClose}>
      <div className="sci-modal sci-panel-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tr.managePanel}</h3>
        {full && <div className="sci-notice summary" style={{ alignSelf: 'flex-start' }}>{tr.panelFull}</div>}
        <div className="sci-panel-list">
          {scientists.map((s) => {
            const on = panel.includes(s.id);
            return (
              <button
                key={s.id}
                className={'sci-panel-item' + (on ? ' active' : '')}
                onClick={() => onToggle(s.id)}
                disabled={!on && full}
              >
                <SciAvatar id={s.id} accent={s.accent} name={(s.name && s.name.en) || s.id} size={34} />
                <span className="who">
                  <div className="nm">{nameFor(s, lang)}</div>
                  <div className="meta">{fieldsFor(s, lang)}</div>
                </span>
                <span className={'sci-toggle' + (on ? ' on' : '')}>{on ? <IconCheck /> : <IconPlus />}</span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <button className="sci-send" onClick={onClose}>{tr.done}</button>
        </div>
      </div>
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
