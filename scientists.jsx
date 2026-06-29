/* Scientists page UI -- a self-contained React app (UMD React + in-browser
   Babel, matching the rest of the demo). It talks to the local LLM backend
   purely over the REST/SSE contract; no engine code is imported here. */

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// Shuffle a copy (Fisher-Yates) and take the first n -- used to surface a fresh,
// random handful of starter questions each time an empty conversation is shown.
function sampleN(arr, n) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, n);
}

// ---- bilingual UI strings ----
const T = {
  zh: {
    title: '科學家對談',
    subtitle: '物理 · 數學 · 天文 · 宇宙學',
    roster: '選擇對談對象',
    sortLabel: '排序方式',
    sortDefault: '預設順序',
    sortYear: '出生年分',
    sortName: '姓名字母',
    sortField: '專長領域',
    asc: '升序',
    desc: '降序',
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
    summarizingNow: '正在摘要這段對話...',
    summarized: '已摘要先前對話並重啟脈絡(第 {n} 次)',
    summaryErr: '摘要失敗,已保留最近幾輪對話繼續',
    summaryStale: '後端的對話脈絡已重置(可能後端重新啟動過),這段對話會在你下次提問時重新開始。',
    autoPlaceholder: '描述你的問題,系統會指派最合適的科學家回答...(Enter 送出,Shift+Enter 換行)',
    followupsLabel: '接著可以問',
    ctx: '脈絡',
    suggestions: [
      '用思想實驗解釋時間膨脹',
      '黑洞的事件視界是什麼?',
      '請推導克卜勒第三定律',
      '暗物質的證據有哪些?',
      '什麼是吸積盤,為什麼會發光?',
      '重力透鏡如何讓我們看到黑洞背後的星系?',
      '潮汐力為什麼會把人「麵條化」?',
      '旋轉的黑洞如何拖曳周圍的時空?(參考系拖曳)',
      '能層是什麼?彭羅斯過程怎麼從黑洞取出能量?',
      '為什麼會有最內穩定圓軌道(ISCO)?',
      '光子球與黑洞剪影是怎麼形成的?',
      '重力波是什麼?我們是怎麼偵測到的?',
      '錢德拉塞卡極限決定了什麼?',
      '相對論性噴流是怎麼被加速出來的?',
      '宇宙為什麼在膨脹?哈伯定律告訴我們什麼?',
      '黑洞會蒸發嗎?霍金輻射是什麼?',
      '對稱性與守恆律有什麼關係?(諾特定理)',
      '電荷會如何改變黑洞的結構?',
    ],
    errPrefix: '發生錯誤:',
    noBackend: '無法連到後端。請先在本機啟動後端(scientists-backend 目錄執行 node server.mjs),或在設定中更正位址。',
    backendOutdated: '後端找不到這個功能(版本可能過舊)。請到 scientists-backend 目錄重新啟動 node server.mjs 後再試。',
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
      '資訊掉進黑洞後會永遠消失嗎?(資訊悖論)',
      '暗物質真的存在,還是重力理論需要修正?',
      '星系中心的超大質量黑洞是怎麼長大的?',
      '重力可以被量子化嗎?',
      '黑洞內部的奇異點代表物理的終點嗎?',
      '我們有可能利用黑洞的旋轉取得能量嗎?',
      '為什麼自然界的基本常數剛好適合生命?',
      '兩個星系相撞時會發生什麼?',
      '白矮星、中子星與黑洞之間的界線在哪裡?',
      '重力波會為天文學打開什麼樣的新窗口?',
    ],
  },
  en: {
    title: 'Talk with Scientists',
    subtitle: 'Physics · Math · Astronomy · Cosmology',
    roster: 'Choose a scientist',
    sortLabel: 'Sort By',
    sortDefault: 'Default',
    sortYear: 'Birth Year',
    sortName: 'Name',
    sortField: 'Specialty',
    asc: 'Ascending',
    desc: 'Descending',
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
    summarizingNow: 'Summarizing this conversation...',
    summarized: 'Summarized earlier conversation and restarted context (#{n})',
    summaryErr: 'Summarization failed; kept the last few turns and continued',
    summaryStale: 'The backend context was reset (the backend may have restarted); this thread will resume on your next message.',
    autoPlaceholder: 'Describe your question; the best-matched scientist will answer... (Enter to send, Shift+Enter for newline)',
    followupsLabel: 'You might also ask',
    ctx: 'Context',
    suggestions: [
      'Explain time dilation with a thought experiment',
      "What is a black hole's event horizon?",
      "Derive Kepler's third law",
      'What is the evidence for dark matter?',
      'What is an accretion disc, and why does it glow?',
      'How does gravitational lensing let us see galaxies behind a black hole?',
      'Why do tidal forces "spaghettify" you near a black hole?',
      'How does a spinning black hole drag spacetime? (frame dragging)',
      'What is the ergosphere, and how does the Penrose process extract energy?',
      'Why is there an innermost stable circular orbit (ISCO)?',
      'How do the photon sphere and the black-hole shadow form?',
      'What are gravitational waves, and how do we detect them?',
      'What does the Chandrasekhar limit determine?',
      'How are relativistic jets accelerated?',
      "Why is the universe expanding? What does Hubble's law tell us?",
      'Do black holes evaporate? What is Hawking radiation?',
      "How does symmetry relate to conservation laws? (Noether's theorem)",
      "How does electric charge change a black hole's structure?",
    ],
    errPrefix: 'Error: ',
    noBackend: 'Cannot reach the backend. Start it locally (run `node server.mjs` in scientists-backend), or fix the URL in Settings.',
    backendOutdated: 'The backend is missing this endpoint (it may be outdated). Restart `node server.mjs` in scientists-backend and try again.',
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
      'Does information vanish when it falls into a black hole? (the information paradox)',
      'Is dark matter real, or does gravity need modifying?',
      'How do supermassive black holes at galaxy centres grow?',
      'Can gravity be quantized?',
      'Does the singularity inside a black hole mark the end of physics?',
      "Could we ever extract energy from a black hole's spin?",
      'Why do the constants of nature seem fine-tuned for life?',
      'What happens when two galaxies collide?',
      'Where is the line between white dwarfs, neutron stars, and black holes?',
      'What new window will gravitational waves open for astronomy?',
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

// Comic-style portrait avatar. Loads the generated PNG from the /avatars/ folder
// for a recognizable face; falls back to the procedural SVG or the coloured initial
// if the helper or the id is missing. Works at any size (the circle wrapper clips the avatar).
function SciAvatar({ id, accent, name, size = 38, className = '', onClick }) {
  const dim = typeof size === 'number' ? size + 'px' : size;
  const fontSize = (typeof size === 'number' ? Math.round(size * 0.42) : 16) + 'px';
  const extraClass = onClick ? ' clickable' : '';
  // The auto-assign persona has no portrait; show a route/shuffle glyph instead.
  if (id === AUTO_ID) {
    return (
      <span className={'sci-avatar auto ' + className + extraClass} style={{ width: dim, height: dim }} onClick={onClick}>
        <IconShuffle />
      </span>
    );
  }
  // If the scientist is known, render the generated premium PNG avatar.
  if (id && window.knSciAvatarHas && window.knSciAvatarHas(id)) {
    return (
      <span
        className={'sci-avatar ' + className + extraClass}
        style={{ width: dim, height: dim, background: 'transparent', overflow: 'hidden' }}
        onClick={onClick}
      >
        <img
          src={`/avatars/${id}.png`}
          alt={name || id}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </span>
    );
  }
  const svg = (id && window.knSciAvatar) ? window.knSciAvatar(id, accent || '#7db3ff') : '';
  if (svg) {
    return (
      <span
        className={'sci-avatar ' + className + extraClass}
        style={{ width: dim, height: dim, background: 'transparent', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: svg }}
        onClick={onClick}
      />
    );
  }
  const initial = String(name || id || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={'sci-avatar ' + className + extraClass} style={{ width: dim, height: dim, fontSize, background: accent || 'var(--accent)' }} onClick={onClick}>
      {initial}
    </span>
  );
}

// Cap on how many scientists may share one discussion (matches the backend).
const DISCUSS_MAX = 5;

// Single-chat "auto-assign" pseudo-persona. Picking it lets the backend route
// each question to the best-matched real scientist (see lib/router.mjs); the id
// is ASCII and matches the backend sentinel. It is NOT a real roster entry, so
// it never appears in the Science Dialogue panel.
const AUTO_ID = 'auto';
const AUTO_PERSONA = {
  id: AUTO_ID,
  name: { zh: '隨機指派專家', en: 'Auto-assign expert' },
  years: '',
  fields: { zh: '依問題自動選最合適的科學家', en: 'Best-matched scientist per question' },
  accent: '#8ea2c6',
  auto: true,
};

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
// Auto-assign: crossing arrows (shuffle/route to the right expert).
const IconShuffle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h3.2a3 3 0 0 1 2.5 1.4l4.6 7.2a3 3 0 0 0 2.5 1.4H21" />
    <path d="M4 17h3.2a3 3 0 0 0 2.5-1.4l4.6-7.2A3 3 0 0 1 16.8 7H21" />
    <path d="m18 4 3 3-3 3" />
    <path d="m18 14 3 3-3 3" />
  </svg>
);
// Follow-up suggestions: a little spark / "what next".
const IconSpark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4.5 13.4 9 18 10.4 13.4 11.8 12 16.3 10.6 11.8 6 10.4 10.6 9z" />
    <path d="M18 4v3M19.5 5.5h-3" />
  </svg>
);

const IconUndo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

function CopyButton({ text, title }) {
  const [copied, setCopied] = useState(false);
  const onClick = (e) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {}
    });
  };
  return (
    <button
      className={'sci-action-btn copy' + (copied ? ' copied' : '')}
      onClick={onClick}
      title={copied ? '已複製 / Copied!' : title}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}

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

// Reduce a discussion transcript to the compact (question -> conclusion) rounds
// the backend keeps as panel memory, so a resumed discussion can be rehydrated.
function extractRounds(messages) {
  const rounds = [];
  let q = null;
  for (const m of messages || []) {
    if (m.role === 'user') q = m.text;
    else if (m.role === 'sci' && m.conclusion && q != null) {
      rounds.push({ question: q, conclusion: m.text });
      q = null;
    }
  }
  return rounds;
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
  
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem('kn_sci_sort_by') || 'year'; } catch (e) { return 'year'; }
  });
  const [sortOrder, setSortOrder] = useState(() => {
    try { return localStorage.getItem('kn_sci_sort_order') || 'asc'; } catch (e) { return 'asc'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('kn_sci_sort_by', sortBy);
      localStorage.setItem('kn_sci_sort_order', sortOrder);
    } catch (e) {}
  }, [sortBy, sortOrder]);

  const [sessions, setSessions] = useState(() => persisted.sessions || {});

  const sortedScientists = useMemo(() => {
    if (sortBy === 'default') {
      return sortOrder === 'asc' ? scientists : [...scientists].reverse();
    }
    const list = [...scientists];
    list.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'year') {
        const parseBirthYear = (yearsStr) => {
          if (!yearsStr) return Infinity;
          const match = yearsStr.match(/^-?\d+/);
          return match ? parseInt(match[0], 10) : Infinity;
        };
        valA = parseBirthYear(a.years);
        valB = parseBirthYear(b.years);
      } else if (sortBy === 'alphabet') {
        valA = nameFor(a, 'en').toLowerCase();
        valB = nameFor(b, 'en').toLowerCase();
      } else if (sortBy === 'specialty') {
        valA = fieldsFor(a, lang).toLowerCase();
        valB = fieldsFor(b, lang).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [scientists, sortBy, sortOrder, lang]);

  const getPersistedSession = useCallback((sciId) => {
    if (!sciId) {
      return { messages: [], usage: 0, activeModel: '', sessionId: '', followups: [] };
    }
    if (persisted.sessions && persisted.sessions[sciId]) {
      return persisted.sessions[sciId];
    }
    if (persisted.selectedId === sciId) {
      return {
        messages: persisted.messages || [],
        usage: persisted.usage || 0,
        activeModel: persisted.activeModel || '',
        sessionId: persisted.sessionId || '',
        followups: persisted.followups || [],
      };
    }
    return {
      messages: [],
      usage: 0,
      activeModel: '',
      sessionId: '',
      followups: [],
    };
  }, [persisted]);

  const selectedIdState = useState(persisted.selectedId || '');
  const selectedId = selectedIdState[0], setSelectedId = selectedIdState[1];

  const initialSession = useMemo(() => getPersistedSession(persisted.selectedId || ''), [persisted.selectedId, getPersistedSession]);

  const [messages, setMessages] = useState(initialSession.messages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState(initialSession.usage);
  const [activeModel, setActiveModel] = useState(initialSession.activeModel);
  const [showSettings, setShowSettings] = useState(false);
  const [bioId, setBioId] = useState(null);

  // 'chat' (live single conversation) | 'favorites' (saved threads)
  const [view, setView] = useState('chat');
  const [favorites, setFavorites] = useState(() => {
    const v = loadJSON(FAV_KEY, []);
    return Array.isArray(v) ? v : [];
  });
  const [openFav, setOpenFav] = useState(null); // a saved thread being viewed

  // Topic-aware follow-up suggestions generated from the running conversation.
  // Purely UI chips: only a clicked one becomes a turn, so the unclicked options
  // (and the act of suggesting) never enter the context window.
  const [followups, setFollowups] = useState(initialSession.followups || []);
  const [discussFollowups, setDiscussFollowups] = useState([]);

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

  const sessionId = useRef(initialSession.sessionId);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // Latest messages, readable from the (memoized) sendMessage without stale closure.
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const discussMessagesRef = useRef(discussMessages);
  useEffect(() => { discussMessagesRef.current = discussMessages; }, [discussMessages]);

  // When true, the next turn replays the visible history so the backend can
  // rebuild context (set after a reload / saved-thread resume; cleared once the
  // backend has streamed a turn back). Tokens guard stale follow-up responses.
  const needHistoryRef = useRef(true);
  const needDiscussHistoryRef = useRef(true);
  const followupTokenRef = useRef(0);
  const discussFollowupTokenRef = useRef(0);
  // One-shot guards, paired with the needHistory refs above: when a thread is
  // (re)loaded with prior turns (page reload / resumed saved thread), surface
  // follow-up chips once -- so an existing conversation offers next questions
  // without waiting for a fresh turn. False = "armed", true = "already offered".
  const restoredFollowupRef = useRef(false);
  const restoredDiscussFollowupRef = useRef(false);

  const isAuto = selectedId === AUTO_ID;
  const selected = isAuto ? AUTO_PERSONA : (scientists.find((s) => s.id === selectedId) || null);
  const panelScientists = panel.map((id) => scientists.find((s) => s.id === id)).filter(Boolean);

  // A fresh random handful of starter questions per (language, scientist). Each
  // scientist gets prompts suited to their own specialty; the auto persona (no
  // starters) falls back to the broad general list.
  const chatSuggestions = useMemo(() => {
    const own = selected && selected.starters && selected.starters[lang];
    return sampleN(own && own.length ? own : tr.suggestions, 4);
  }, [lang, selectedId, scientists]);

  // persist language
  useEffect(() => { try { localStorage.setItem('kn_sci_lang', lang); } catch (e) {} }, [lang]);

  // Persist the live conversation so a reload keeps it (and the session id, so
  // the backend can continue the same dialogue while its session is alive).
  useEffect(() => {
    const activeSession = { messages, usage, activeModel, sessionId: sessionId.current, followups };
    saveJSON(PERSIST_KEY, {
      selectedId,
      sessions: {
        ...sessions,
        [selectedId]: activeSession,
      },
      // Keep top-level fields for backward compatibility
      messages,
      usage,
      activeModel,
      sessionId: sessionId.current,
    });
  }, [selectedId, messages, usage, activeModel, sessions, followups, streaming]);

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
        // Keep the restored selection if it still exists (or is the auto persona),
        // else default to first.
        const prev = selectedId;
        const next = (prev && (prev === AUTO_ID || d.scientists.some((s) => s.id === prev)))
          ? prev
          : (d.scientists[0] && d.scientists[0].id) || '';
        
        if (next !== prev) {
          const nextSession = (persisted.sessions && persisted.sessions[next]) || { messages: [], usage: 0, activeModel: '', sessionId: '', followups: [] };
          setSelectedId(next);
          setMessages(nextSession.messages || []);
          setUsage(nextSession.usage || 0);
          setActiveModel(nextSession.activeModel || '');
          sessionId.current = nextSession.sessionId || '';
          setFollowups(nextSession.followups || []);
        }
      }
    } catch (e) { /* leave roster empty; health dot shows offline */ }
  }, [backendUrl, selectedId, persisted]);

  useEffect(() => { loadBackend(); }, [loadBackend]);

  // autoscroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  function pushNotice(kind, text) {
    setMessages((m) => [...m, { role: 'notice', kind, text }]);
  }

  // Drop any follow-up chips and invalidate an in-flight suggestion request (the
  // token bump makes a late response no-op).
  const clearFollowups = useCallback(() => { followupTokenRef.current += 1; setFollowups([]); }, []);

  // Ask the backend (isolated call) for a few on-topic follow-up questions from
  // the running conversation. Fails silent -> just no chips.
  const fetchFollowups = useCallback(async () => {
    const token = (followupTokenRef.current += 1);
    try {
      const res = await fetch(backendUrl + '/api/followups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current || undefined, lang, history: messagesRef.current }),
      });
      if (!res.ok) { if (token === followupTokenRef.current) setFollowups([]); return; }
      const r = await res.json().catch(() => null);
      if (token !== followupTokenRef.current) return; // a newer turn superseded us
      setFollowups(r && Array.isArray(r.followups) ? r.followups : []);
    } catch (e) {
      if (token === followupTokenRef.current) setFollowups([]);
    }
  }, [backendUrl, lang]);

  // Offer follow-ups for a RESTORED conversation (page reload / resumed thread)
  // once the backend is reachable, so a pre-existing dialogue immediately shows
  // on-topic next questions. One-shot per (re)loaded thread; the fetch is
  // isolated, so neither suggesting nor the unclicked options touch the context.
  useEffect(() => {
    if (restoredFollowupRef.current || health !== 'online' || streaming || followups.length) return;
    if (!messages.some((m) => m.role === 'sci' && m.text && m.text.trim())) return;
    restoredFollowupRef.current = true;
    fetchFollowups();
  }, [health, streaming, messages, followups, fetchFollowups]);

  function selectScientist(id) {
    if (id === selectedId) return;
    
    // Save current active session
    setSessions((prev) => ({
      ...prev,
      [selectedId]: {
        messages,
        usage,
        activeModel,
        sessionId: sessionId.current,
        followups,
      }
    }));

    // Load next session
    const nextSession = sessions[id] || getPersistedSession(id);
    setSelectedId(id);
    setMessages(nextSession.messages || []);
    setUsage(nextSession.usage || 0);
    setActiveModel(nextSession.activeModel || '');
    sessionId.current = nextSession.sessionId || '';
    setFollowups(nextSession.followups || []);

    clearFollowups();
    needHistoryRef.current = true;
    restoredFollowupRef.current = false;
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
    clearFollowups();
    needHistoryRef.current = true;
    restoredFollowupRef.current = false;

    // Clear inside sessions dictionary
    setSessions((prev) => ({
      ...prev,
      [selectedId]: {
        messages: [],
        usage: 0,
        activeModel: activeModel,
        sessionId: '',
        followups: [],
      }
    }));
  }

  // Manually compress the running dialogue into a few key points. The backend
  // summarizes + restarts the session memory; we surface the bullets inline.
  async function summarizeNow() {
    if (streaming) return;
    if (!sessionId.current || !messages.some((m) => m.role === 'user')) {
      pushNotice('summary', tr.summaryNothing);
      return;
    }
    pushNotice('summary', tr.summarizingNow);
    try {
      const res = await fetch(backendUrl + '/api/session/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current, lang }),
      });
      // A 404 means the backend no longer holds this session (it restarted, or
      // the session was evicted). The visible history is still here, so just
      // drop the stale id and let the next message open a fresh session.
      if (res.status === 404) {
        sessionId.current = '';
        pushNotice('summary', tr.summaryStale);
        return;
      }
      const r = await res.json().catch(() => null);
      if (res.ok && r && r.ok && r.changed) {
        pushNotice('keypoints', r.summary || '');
        setUsage(typeof r.usage === 'number' ? r.usage : 0);
      } else if (res.ok && r && r.ok) {
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
      needDiscussHistoryRef.current = true; // replay rounds to rebuild context
      restoredDiscussFollowupRef.current = false; // re-offer follow-ups for it
      setDiscussFollowups([]);
      setOpenFav(null);
      setView('discuss');
      return;
    }
    // Save current active session
    setSessions((prev) => ({
      ...prev,
      [selectedId]: {
        messages,
        usage,
        activeModel,
        sessionId: sessionId.current,
        followups,
      }
    }));
    
    setSelectedId(fav.scientistId);
    setMessages(fav.messages.slice());
    setUsage(0);
    sessionId.current = '';
    needHistoryRef.current = true; // replay history to rebuild context
    restoredFollowupRef.current = false; // re-offer follow-ups for it
    clearFollowups();
    setOpenFav(null);
    setView('chat');
  }

  function stopStreaming() {
    if (abortRef.current) abortRef.current.abort();
  }

  function undoMessage(index) {
    if (streaming) return;
    const targetMsg = messages[index];
    if (!targetMsg || targetMsg.role !== 'user') return;

    setInput(targetMsg.text);

    const nextMessages = messages.slice(0, index);
    setMessages(nextMessages);

    setSessions((prev) => ({
      ...prev,
      [selectedId]: {
        ...prev[selectedId],
        messages: nextMessages,
      }
    }));

    clearFollowups();
    needHistoryRef.current = true;
    restoredFollowupRef.current = false;
  }

  const sendMessage = useCallback(async (text) => {
    const msg = (text != null ? text : input).trim();
    if (!msg || streaming || !selected) return;
    // Replay the prior visible history once after a reload / resume so the backend
    // can rebuild context for a session it no longer (or never) held.
    const replayHistory = needHistoryRef.current ? messagesRef.current.slice() : null;
    setInput('');
    clearFollowups();
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

    let ok = false;
    try {
      const res = await fetch(backendUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.current || undefined,
          scientistId: selected.id,
          lang,
          message: msg,
          history: replayHistory && replayHistory.length ? replayHistory : undefined,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(res.status === 404 ? tr.backendOutdated : 'HTTP ' + res.status);

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
      ok = true;
    } catch (e) {
      if (!ac.signal.aborted) pushNotice('err', tr.errPrefix + (e && e.message || e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }

    // A completed turn means the backend now holds this dialogue, so stop
    // replaying history; then suggest a few follow-ups (isolated -> no context).
    if (ok) {
      needHistoryRef.current = false;
      restoredFollowupRef.current = true; // live flow owns follow-ups from here
      fetchFollowups();
    }
  }, [input, streaming, selected, backendUrl, lang, tr, clearFollowups, fetchFollowups]);

  function handleEvent(ev, appendDelta) {
    if (ev.type === 'meta') {
      if (ev.sessionId) sessionId.current = ev.sessionId;
      if (ev.model) setActiveModel(ev.model);
      if (typeof ev.usage === 'number') setUsage(ev.usage);
    } else if (ev.type === 'assigned') {
      // Auto-assign mode: tag the in-progress bubble with the chosen expert so it
      // shows that scientist's avatar and name.
      setMessages((m) => {
        const c = m.slice();
        for (let i = c.length - 1; i >= 0; i--) {
          if (c[i].role === 'sci') { c[i] = { ...c[i], id: ev.id, name: ev.name, accent: ev.accent }; break; }
        }
        return c;
      });
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
    } else if (ev.type === 'summary') {
      // Emitted when a large rehydrated history is compressed before the turn.
      if (ev.state === 'start') pushDiscussNotice('summary', tr.summarizing);
      else if (ev.state === 'done') pushDiscussNotice('summary', tr.summarized.replace('{n}', ev.summaryCount || 1));
      else if (ev.state === 'error') pushDiscussNotice('summary', tr.summaryErr);
    } else if (ev.type === 'turn-done' || ev.type === 'done') {
      if (typeof ev.usage === 'number') setDiscussUsage(ev.usage);
    } else if (ev.type === 'error') {
      pushDiscussNotice('err', tr.errPrefix + ev.error);
    }
  }

  function clearDiscussFollowups() { discussFollowupTokenRef.current += 1; setDiscussFollowups([]); }

  async function fetchDiscussFollowups() {
    const token = (discussFollowupTokenRef.current += 1);
    try {
      const res = await fetch(backendUrl + '/api/discuss/followups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: discussSessionId.current || undefined,
          lang,
          rounds: extractRounds(discussMessagesRef.current),
        }),
      });
      if (!res.ok) { if (token === discussFollowupTokenRef.current) setDiscussFollowups([]); return; }
      const r = await res.json().catch(() => null);
      if (token !== discussFollowupTokenRef.current) return;
      setDiscussFollowups(r && Array.isArray(r.followups) ? r.followups : []);
    } catch (e) {
      if (token === discussFollowupTokenRef.current) setDiscussFollowups([]);
    }
  }

  // Mirror of the single-chat restored-followups effect for the discussion tab:
  // a reloaded / resumed panel thread offers on-topic follow-ups once online.
  useEffect(() => {
    if (restoredDiscussFollowupRef.current || health !== 'online' || discussStreaming || discussFollowups.length) return;
    if (!extractRounds(discussMessages).length) return;
    restoredDiscussFollowupRef.current = true;
    fetchDiscussFollowups();
  }, [health, discussStreaming, discussMessages, discussFollowups]);

  async function sendDiscuss(text) {
    const msg = (text != null ? text : discussInput).trim();
    if (!msg || discussStreaming || panel.length === 0) return;
    // Replay prior rounds once after a reload / resume to rebuild panel memory.
    const replayRounds = needDiscussHistoryRef.current ? extractRounds(discussMessagesRef.current) : null;
    setDiscussInput('');
    clearDiscussFollowups();
    setDiscussMessages((m) => [...m, { role: 'user', text: msg }]);
    setDiscussStreaming(true);

    const ac = new AbortController();
    discussAbortRef.current = ac;
    let ok = false;
    try {
      const res = await fetch(backendUrl + '/api/discuss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: discussSessionId.current || undefined,
          scientistIds: panel,
          lang,
          message: msg,
          rounds: replayRounds && replayRounds.length ? replayRounds : undefined,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(res.status === 404 ? tr.backendOutdated : 'HTTP ' + res.status);

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
      ok = true;
    } catch (e) {
      if (!ac.signal.aborted) pushDiscussNotice('err', tr.errPrefix + (e && e.message || e));
    } finally {
      setDiscussStreaming(false);
      discussAbortRef.current = null;
    }

    if (ok) {
      needDiscussHistoryRef.current = false;
      restoredDiscussFollowupRef.current = true; // live flow owns follow-ups now
      fetchDiscussFollowups();
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
    clearDiscussFollowups();
    needDiscussHistoryRef.current = true;
    restoredDiscussFollowupRef.current = false;
  }

  async function summarizeDiscuss() {
    if (discussStreaming) return;
    if (!discussSessionId.current || !discussMessages.some((m) => m.role === 'user')) {
      pushDiscussNotice('summary', tr.summaryNothing);
      return;
    }
    pushDiscussNotice('summary', tr.summarizingNow);
    try {
      const res = await fetch(backendUrl + '/api/discuss/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: discussSessionId.current, lang }),
      });
      if (res.status === 404) {
        discussSessionId.current = '';
        pushDiscussNotice('summary', tr.summaryStale);
        return;
      }
      const r = await res.json().catch(() => null);
      if (res.ok && r && r.ok && r.changed) {
        pushDiscussNotice('keypoints', r.summary || '');
        setDiscussUsage(typeof r.usage === 'number' ? r.usage : 0);
      } else if (res.ok && r && r.ok) {
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
            <FavReader fav={openFav} tr={tr} lang={lang} onBack={() => setOpenFav(null)} onResume={() => resumeFavorite(openFav)} onDelete={() => deleteFavorite(openFav.id)} onBio={setBioId} />
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
          scientists={sortedScientists}
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
          followups={discussFollowups}
          showPicker={showPanelPicker}
          setShowPicker={setShowPanelPicker}
          onRetry={loadBackend}
          onSettings={() => setShowSettings(true)}
          onBio={setBioId}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
        />
      ) : (
      <div className="sci-body">
        <nav className="sci-roster">
          <div className="sci-roster-label">{tr.roster}</div>
          <div className="sci-sort-container">
            <select
              className="sci-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label={tr.sortLabel}
            >
              <option value="default">{tr.sortDefault}</option>
              <option value="year">{tr.sortYear}</option>
              <option value="alphabet">{tr.sortName}</option>
              <option value="specialty">{tr.sortField}</option>
            </select>
            <button
              className="sci-sort-order-btn"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? tr.asc : tr.desc}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          {scientists.length > 0 && (
            <button
              className={'sci-card sci-card-auto' + (isAuto ? ' active' : '')}
              onClick={() => selectScientist(AUTO_ID)}
            >
              <SciAvatar id={AUTO_ID} accent={AUTO_PERSONA.accent} size={38} />
              <span className="who">
                <div className="nm">{nameFor(AUTO_PERSONA, lang)}</div>
                <div className="meta">{fieldsFor(AUTO_PERSONA, lang)}</div>
              </span>
            </button>
          )}
          {sortedScientists.map((s) => (
            <button
              key={s.id}
              className={'sci-card' + (s.id === selectedId ? ' active' : '')}
              onClick={() => selectScientist(s.id)}
            >
              <SciAvatar
                id={s.id}
                accent={s.accent}
                name={(s.name && s.name.en) || s.id}
                size={38}
                onClick={(e) => {
                  e.stopPropagation();
                  setBioId(s.id);
                }}
              />
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
              {scientists.length > 0 && <option value={AUTO_ID}>{nameFor(AUTO_PERSONA, lang)}</option>}
              {sortedScientists.map((s) => (
                <option key={s.id} value={s.id}>{nameFor(s, lang)} · {s.years}</option>
              ))}
            </select>

            <div className="sci-sort-container mobile-only">
              <select
                className="sci-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label={tr.sortLabel}
              >
                <option value="default">{tr.sortDefault}</option>
                <option value="year">{tr.sortYear}</option>
                <option value="alphabet">{tr.sortName}</option>
                <option value="specialty">{tr.sortField}</option>
              </select>
              <button
                className="sci-sort-order-btn"
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? tr.asc : tr.desc}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            {selected && (
              <div className="sci-head-who-wrap" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {selected.id !== AUTO_ID && (
                  <SciAvatar
                    id={selected.id}
                    accent={selected.accent}
                    name={nameFor(selected, lang)}
                    size={32}
                    onClick={() => setBioId(selected.id)}
                  />
                )}
                <div className="who">
                  <div className="nm">{nameFor(selected, lang)}</div>
                  <div className="meta">{fieldsFor(selected, lang)}</div>
                </div>
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
                  {chatSuggestions.map((q, i) => (
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
              if (m.role === 'user') {
                return (
                  <div key={i} className="sci-msg user">
                    <div className="sci-bubble-wrap">
                      <div className="sci-bubble">{renderText(m.text)}</div>
                      <div className="sci-msg-actions">
                        <button
                          className="sci-action-btn undo"
                          onClick={() => undoMessage(i)}
                          title={lang === 'zh' ? '收回此訊息' : 'Undo this message'}
                          disabled={streaming}
                        >
                          <IconUndo />
                        </button>
                        <CopyButton text={m.text} title={lang === 'zh' ? '複製訊息' : 'Copy message'} />
                      </div>
                    </div>
                  </div>
                );
              }
              // sci turn. In auto-assign mode each answer carries its own scientist
              // (id/name/accent set by the 'assigned' event); otherwise it's the
              // selected persona.
              const isLastSci = i === messages.length - 1;
              const sciId = m.id || (selected && selected.id);
              const sciAccent = m.accent || (selected && selected.accent);
              const showCopy = !(isLastSci && streaming);
              return (
                <div key={i} className="sci-msg sci">
                  <SciAvatar id={sciId} accent={sciAccent} name={m.name || (selected && (selected.name && selected.name.en))} size={30} onClick={sciId !== AUTO_ID ? () => setBioId(sciId) : undefined} />
                  <div className="sci-bubble-wrap">
                    {m.name && <div className="sci-speaker">{m.name}</div>}
                    <div className="sci-bubble">
                      {renderText(m.text)}
                      {isLastSci && streaming && <span className="sci-typing" />}
                    </div>
                    {showCopy && (
                      <div className="sci-msg-actions">
                        <CopyButton text={m.text} title={lang === 'zh' ? '複製回覆' : 'Copy reply'} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* On-topic follow-up suggestions from the conversation so far. */}
            {!streaming && followups.length > 0 && (
              <div className="sci-followups">
                <div className="fu-label"><IconSpark />{tr.followupsLabel}</div>
                <div className="sci-suggest fu-chips">
                  {followups.map((q, i) => (
                    <button key={i} onClick={() => sendMessage(q)} disabled={!selected || health !== 'online'}>{q}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="sci-composer">
            <textarea
              rows={1}
              value={input}
              placeholder={isAuto ? tr.autoPlaceholder : tr.placeholder}
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

      {bioId && (
        <BioModal
          id={bioId}
          scientists={scientists}
          lang={lang}
          onClose={() => setBioId(null)}
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
function FavReader({ fav, tr, lang, onBack, onResume, onDelete, onBio }) {
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
          <DiscussMessages messages={fav.messages || []} tr={tr} lang={lang} streaming={false} onBio={onBio} />
        ) : (
          (fav.messages || []).map((m, i) => {
            if (m.role === 'notice') {
              if (m.kind === 'keypoints') {
                return <div key={i} className="sci-keypoints"><span className="kp-title">{tr.keypointsTitle}</span><div className="kp-body">{m.text}</div></div>;
              }
              return <div key={i} className={'sci-notice ' + (m.kind || '')}>{m.text}</div>;
            }
            if (m.role === 'user') {
              return (
                <div key={i} className="sci-msg user">
                  <div className="sci-bubble">{renderText(m.text)}</div>
                </div>
              );
            }
            // Honor a per-message scientist (auto-assign threads) when present.
            const sid = m.id || fav.scientistId;
            const sacc = m.accent || fav.accent;
            return (
              <div key={i} className="sci-msg sci">
                <SciAvatar id={sid} accent={sacc} name={m.name || fav.name} size={30} onClick={sid !== AUTO_ID ? () => onBio(sid) : undefined} />
                <div className="sci-bubble-wrap">
                  {m.name && <div className="sci-speaker">{m.name}</div>}
                  <div className="sci-bubble">{renderText(m.text)}</div>
                </div>
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
function DiscussMessages({ messages, tr, lang, streaming, onBio }) {
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
            <SciAvatar id={m.id} accent={m.accent} name={m.name} size={26} onClick={onBio ? () => onBio(m.id) : undefined} />
            <span className="cc-title">{tr.conclusion} · {m.name}</span>
          </div>
          <div className="cc-body">{renderText(m.text)}{typing && <span className="sci-typing" />}</div>
        </div>
      );
    }
    return (
      <div key={i} className="sci-msg sci discuss">
        <SciAvatar id={m.id} accent={m.accent} name={m.name} size={30} onClick={onBio ? () => onBio(m.id) : undefined} />
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
  onSend, onStop, onKey, onClear, onSummarize, onSave, followups, showPicker, setShowPicker,
  onRetry, onSettings, onBio,
  sortBy, setSortBy, sortOrder, setSortOrder,
}) {
  const scrollRef = useRef(null);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, streaming]);
  const hasPanel = panel.length > 0;
  // Fresh random debate topics each time the (populated) panel's empty state shows.
  const discussSuggestions = useMemo(() => sampleN(tr.discussSuggestions, 4), [lang, hasPanel]);
  return (
    <div className="sci-body">
      <nav className="sci-roster sci-roster-discuss">
        <div className="sci-roster-label">{tr.discussRoster}</div>
        <div className="sci-sort-container">
          <select
            className="sci-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label={tr.sortLabel}
          >
            <option value="default">{tr.sortDefault}</option>
            <option value="year">{tr.sortYear}</option>
            <option value="alphabet">{tr.sortName}</option>
            <option value="specialty">{tr.sortField}</option>
          </select>
          <button
            className="sci-sort-order-btn"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            title={sortOrder === 'asc' ? tr.asc : tr.desc}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
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
                    {discussSuggestions.map((q, i) => (
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

          <DiscussMessages messages={messages} tr={tr} lang={lang} streaming={streaming} onBio={onBio} />

          {/* On-topic follow-up topics drawn from the discussion so far. */}
          {!streaming && followups && followups.length > 0 && (
            <div className="sci-followups">
              <div className="fu-label"><IconSpark />{tr.followupsLabel}</div>
              <div className="sci-suggest fu-chips">
                {followups.map((q, i) => (
                  <button key={i} onClick={() => onSend(q)} disabled={!hasPanel || health !== 'online'}>{q}</button>
                ))}
              </div>
            </div>
          )}
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
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          onBio={onBio}
        />
      )}
    </div>
  );
}

// Modal list to add/remove panel members (the primary control on mobile, where
// the roster column is hidden).
function PanelPicker({ tr, lang, scientists, panel, onToggle, onClose, sortBy, setSortBy, sortOrder, setSortOrder, onBio }) {
  const full = panel.length >= DISCUSS_MAX;
  return (
    <div className="sci-modal-backdrop" onClick={onClose}>
      <div className="sci-modal sci-panel-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tr.managePanel}</h3>
        <div className="sci-sort-container" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 12 }}>
          <select
            className="sci-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label={tr.sortLabel}
          >
            <option value="default">{tr.sortDefault}</option>
            <option value="year">{tr.sortYear}</option>
            <option value="alphabet">{tr.sortName}</option>
            <option value="specialty">{tr.sortField}</option>
          </select>
          <button
            className="sci-sort-order-btn"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            title={sortOrder === 'asc' ? tr.asc : tr.desc}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
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
                <SciAvatar
                  id={s.id}
                  accent={s.accent}
                  name={(s.name && s.name.en) || s.id}
                  size={34}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onBio) onBio(s.id);
                  }}
                />
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

function BioModal({ id, scientists, lang, onClose }) {
  const s = (scientists || []).find((x) => x.id === id);
  if (!s) return null;
  const name = nameFor(s, lang);
  const fields = fieldsFor(s, lang);
  const blurb = blurbFor(s, lang);
  return (
    <div className="sci-modal-backdrop" onClick={onClose}>
      <div className="sci-modal bio-modal" onClick={(e) => e.stopPropagation()} style={{ borderColor: s.accent || 'var(--accent)' }}>
        <button className="bio-close" onClick={onClose} aria-label="close">&times;</button>
        <div className="bio-modal-content">
          <div className="bio-avatar-container" style={{ background: `linear-gradient(135deg, ${(s.accent || '#7db3ff')}44, ${(s.accent || '#7db3ff')}11)` }}>
            <SciAvatar id={id} accent={s.accent} name={name} size={110} />
          </div>
          <div className="bio-info">
            <h2 className="bio-name">{name}</h2>
            <div className="bio-years">{s.years}</div>
            <div className="bio-fields-badge" style={{ backgroundColor: `${(s.accent || '#7db3ff')}22`, color: s.accent || 'var(--accent)', border: `1px solid ${(s.accent || '#7db3ff')}44` }}>
              {fields}
            </div>
            <p className="bio-blurb">{blurb}</p>
            {s.details && s.details[lang] && (
              <div className="bio-details-sections">
                <div className="bio-detail-section">
                  <h4>{lang === 'zh' ? '生平背景' : 'Life & Background'}</h4>
                  <p>{s.details[lang].life}</p>
                </div>
                <div className="bio-detail-section">
                  <h4>{lang === 'zh' ? '研究專長' : 'Areas of Expertise'}</h4>
                  <p>{s.details[lang].expertise}</p>
                </div>
                <div className="bio-detail-section">
                  <h4>{lang === 'zh' ? '主要成就' : 'Key Achievements'}</h4>
                  <p>{s.details[lang].achievements}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SciAppRoot />);
