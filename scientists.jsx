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
    replyModeBadgeDirect: '直接回覆',
    replyModeBadgeRag: '知識庫檢索',
    sourcesLabel: '參考來源:',
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
    favEdit: '編輯',
    favEditTitle: '標題',
    favEditSave: '儲存變更',
    favEditCancel: '取消編輯',
    favEditDelMsg: '刪除這則訊息',
    favEdited: '已更新收藏內容',
    favKb: '加入知識圖譜',
    favKbBusy: '正在加入知識圖譜...',
    favKbDone: '已加入知識圖譜——RAG 檢索與圖譜檢視現在都找得到這段對話',
    favKbErr: '加入知識圖譜失敗:',
    favKbHint: '(需要 wiki-kb 服務運行中;可用 ?kb= 參數或圖書館頁設定位址)',
    favCompareTitle: '這段對話包含比較回覆,要收藏哪一個?',
    favCompareDirect: '收藏直接回覆',
    favCompareRag: '收藏知識庫回覆',
    favCompareBoth: '都收藏(分開儲存)',
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
    replyModeBadgeDirect: 'Direct',
    replyModeBadgeRag: 'KB-searched',
    sourcesLabel: 'Sources:',
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
    favEdit: 'Edit',
    favEditTitle: 'Title',
    favEditSave: 'Save changes',
    favEditCancel: 'Cancel editing',
    favEditDelMsg: 'Delete this message',
    favEdited: 'Saved thread updated',
    favKb: 'Add to knowledge graph',
    favKbBusy: 'Adding to the knowledge graph...',
    favKbDone: 'Added -- this thread is now retrievable via RAG and visible in the knowledge graph',
    favKbErr: 'Could not add to the knowledge graph: ',
    favKbHint: '(requires the wiki-kb service; set its URL via ?kb= or on the library page)',
    favCompareTitle: 'This thread has compare replies -- which one do you want to save?',
    favCompareDirect: 'Save the direct reply',
    favCompareRag: 'Save the KB-searched reply',
    favCompareBoth: 'Save both (separately)',
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
// Scientists write formulas as LaTeX ($...$ inline, $$...$$ block -- see the
// system prompt in scientists-backend/personas/scientists.mjs). Render them
// with KaTeX (loaded globally via scientists.html) so they show as real math
// instead of raw markup; if KaTeX failed to load or the expression is invalid,
// fall back to the literal source so the text is never silently dropped.
function looksLikeMath(expr) {
  // Cheap guard against plain "$5 and $10" currency text: only treat a $...$
  // span as math if it actually contains a formula-ish character. Real LaTeX
  // (even something as simple as E=mc^2) always has one of these.
  return /[\\^_=<>]/.test(expr);
}

function renderMathHtml(expr, displayMode) {
  if (!window.katex) return null;
  try {
    return window.katex.renderToString(expr, { throwOnError: false, displayMode, output: 'htmlAndMathml' });
  } catch (e) {
    return null;
  }
}

// Minimal inline markdown: `code` spans, plus $...$ / $$...$$ LaTeX math.
function renderText(text) {
  const parts = String(text).split(/(`[^`]+`|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) {
      return React.createElement('code', { key: i }, p.slice(1, -1));
    }
    if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) {
      const html = renderMathHtml(p.slice(2, -2), true);
      if (html) return React.createElement('span', { key: i, className: 'sci-math sci-math-block', dangerouslySetInnerHTML: { __html: html } });
      return p;
    }
    if (p.startsWith('$') && p.endsWith('$') && p.length > 2 && looksLikeMath(p.slice(1, -1))) {
      const html = renderMathHtml(p.slice(1, -1), false);
      if (html) return React.createElement('span', { key: i, className: 'sci-math', dangerouslySetInnerHTML: { __html: html } });
      return p;
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

// Combined height (px) of the mobile .sci-header (49) + .sci-tabs (47) bars
// that sit above the per-view .sci-chat-head row -- kept in sync with the
// hard-coded values in scientists.css's mobile media query.
const HEADER_STACK_PX = 96;

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

// Resume a saved thread: play triangle.
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 5.5v13l11-6.5-11-6.5z" />
  </svg>
);
// Edit a saved thread: pencil.
const IconEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l1.1-4.4L15.8 5 19 8.2 8.3 18.9 4 20z" />
    <path d="M13.6 6.6l3.8 3.8" />
  </svg>
);
// Cancel editing: close / X.
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
// Add a saved thread to the knowledge graph: three connected nodes.
const IconGraph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="7" r="2.2" />
    <circle cx="18" cy="7" r="2.2" />
    <circle cx="12" cy="18" r="2.2" />
    <path d="M8.2 8.3 10.4 16M15.8 8.3 13.6 16M8.2 7h7.6" />
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

// Undo needs an explicit confirm step (it drops messages) but a bare "click
// again within 3s" affordance is invisible on touch (no hover for the tooltip
// that explains it) and impossible to back out of on purpose. Show a small
// popup with an explicit Confirm/Cancel choice instead; it stays open until
// answered or dismissed by clicking outside.
function UndoButton({ onUndo, title, disabled, lang }) {
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!confirming) return;
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setConfirming(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [confirming]);

  return (
    <span className="sci-undo-wrap" ref={wrapRef}>
      <button
        className={'sci-action-btn undo' + (confirming ? ' confirming' : '')}
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        title={title}
        disabled={disabled}
      >
        <IconUndo />
      </button>
      {confirming && (
        <div className="sci-undo-confirm" onClick={(e) => e.stopPropagation()}>
          <span>{lang === 'zh' ? '收回這則訊息?' : 'Undo this message?'}</span>
          <div className="sci-undo-confirm-actions">
            <button type="button" className="sci-undo-confirm-btn cancel" onClick={() => setConfirming(false)}>
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              className="sci-undo-confirm-btn ok"
              onClick={() => { setConfirming(false); onUndo(); }}
            >
              {lang === 'zh' ? '確認' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// The model-picker "dropdown": once /api/health has reported the installed
// Ollama tags, the model chip becomes a real <select> (matching the existing
// .sci-lang-select pattern) so clicking it lists every installed model plus an
// "Auto" entry that hands the pick back to the backend's shared pin / per-
// language default. Falls back to the old plain chip when the list hasn't
// loaded yet. `busy` shows a small dot when the backend can't answer right
// away (it's already generating for this device or another one).
function ModelChip({ activeModel, installedModels, modelOverride, setModelOverride, lang, busy }) {
  const busyTitle = lang === 'zh' ? '後端忙碌中(可能有其他裝置正在使用)' : 'Backend busy (another device may be using it)';
  const busyDot = busy ? <span className={'sci-dot warn'} title={busyTitle} aria-label={busyTitle} /> : null;
  if (!installedModels || !installedModels.length) {
    return activeModel || busy ? (
      <span className="sci-modelchip-wrap">
        {activeModel && <span className="sci-modelchip">{activeModel}</span>}
        {busyDot}
      </span>
    ) : null;
  }
  const title = lang === 'zh' ? '切換模型' : 'Switch model';
  return (
    <span className="sci-modelchip-wrap">
      <select
        className="sci-modelchip sci-model-select"
        value={modelOverride || ''}
        onChange={(e) => setModelOverride(e.target.value)}
        title={title}
        aria-label={title}
      >
        <option value="">{(lang === 'zh' ? '自動:' : 'Auto:') + ' ' + (activeModel || '...')}</option>
        {installedModels.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      {busyDot}
    </span>
  );
}

// Reply-mode selector for the single chat: direct / KB-RAG-forced / compare
// both. Styled to match ModelChip so it sits naturally in the same toolbar row.
function ReplyModeChip({ replyMode, setReplyMode, lang, allowCompare = true }) {
  const title = lang === 'zh' ? '回覆模式' : 'Reply mode';
  return (
    <span className="sci-modelchip-wrap">
      <select
        className="sci-modelchip sci-model-select"
        value={replyMode}
        onChange={(e) => setReplyMode(e.target.value)}
        title={title}
        aria-label={title}
      >
        <option value="direct">{lang === 'zh' ? '直接回覆' : 'Direct reply'}</option>
        <option value="rag">{lang === 'zh' ? '知識庫檢索後回覆' : 'KB-searched reply'}</option>
        {allowCompare && <option value="compare">{lang === 'zh' ? '比較直接與知識庫回覆' : 'Compare direct vs. KB'}</option>}
      </select>
    </span>
  );
}

// Wraps a compare-mode turn's two panes (direct vs. RAG-searched) so mobile
// can switch between them two ways: swiping the pane strip itself (never the
// whole page), or tapping the sliver of the other pane that peeks at the
// strip's edge (see the mobile CSS -- each pane is ~88% width, so its
// neighbor is always partly visible). Desktop just shows both side by side
// (see the non-mobile CSS) and the dots/peek styling stay inert.
//
// touch-action: pan-x (see .sci-compare-row CSS) is supposed to hand a
// vertical drag straight to the page's own scroller without the row ever
// claiming it, but empirically (confirmed with a real touch-gesture replay,
// not just mouse-drag testing) Chromium sometimes still swallows it -- the
// conversation reads as "stuck" under a compare row instead of scrolling.
// The touchmove listener below is the reliable fallback: once a gesture
// reveals itself as more vertical than horizontal, this manually forwards
// the remaining delta to the nearest .sci-scroll ancestor and takes over
// from there, instead of trusting the browser to hand it off mid-gesture.
function CompareSwipeRow({ className, children }) {
  const rowRef = useRef(null);
  const [active, setActive] = useState(0);
  const onScroll = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    setActive(el.scrollLeft > w / 2 ? 1 : 0);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const gesture = { active: false, intent: null, lastY: 0 };

    function onTouchStart(e) {
      if (e.touches.length !== 1) { gesture.active = false; return; }
      const t = e.touches[0];
      gesture.active = true;
      gesture.intent = null;
      gesture.startX = t.clientX;
      gesture.startY = t.clientY;
      gesture.lastY = t.clientY;
      gesture.scroller = row.closest('.sci-scroll');
    }
    function onTouchMove(e) {
      if (!gesture.active || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!gesture.intent) {
        const dx = t.clientX - gesture.startX;
        const dy = t.clientY - gesture.startY;
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        gesture.intent = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
      }
      if (gesture.intent === 'v' && gesture.scroller) {
        e.preventDefault();
        gesture.scroller.scrollTop -= (t.clientY - gesture.lastY);
        gesture.lastY = t.clientY;
      }
      // 'h' intent: leave it to the row's own native horizontal scrolling.
    }
    function onTouchEnd() { gesture.active = false; gesture.intent = null; }

    row.addEventListener('touchstart', onTouchStart, { passive: true });
    row.addEventListener('touchmove', onTouchMove, { passive: false });
    row.addEventListener('touchend', onTouchEnd, { passive: true });
    row.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      row.removeEventListener('touchstart', onTouchStart);
      row.removeEventListener('touchmove', onTouchMove);
      row.removeEventListener('touchend', onTouchEnd);
      row.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const kids = React.Children.toArray(children);
  function goTo(idx) {
    const el = rowRef.current;
    const pane = el && el.children[idx];
    if (pane) pane.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
  // Only intercept a tap on the peeking pane when the row is actually a
  // horizontally-scrollable strip (mobile layout) -- on desktop both panes
  // sit side by side at full height and every click must reach the real
  // bubble underneath (e.g. the copy/undo buttons in the right-hand pane).
  function onPaneClickCapture(idx, e) {
    const el = rowRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    if (idx !== active) { e.preventDefault(); e.stopPropagation(); goTo(idx); }
  }

  return (
    <div className="sci-compare-wrap">
      <div className={'sci-compare-row' + (className ? ' ' + className : '')} ref={rowRef} onScroll={onScroll}>
        {kids.map((child, idx) => (
          <div
            key={idx}
            className={'sci-compare-pane' + (idx === active ? ' is-active' : ' is-peek')}
            onClickCapture={(e) => onPaneClickCapture(idx, e)}
          >
            {child}
          </div>
        ))}
      </div>
      <div className="sci-compare-dots" aria-hidden="true">
        <span className={'sci-compare-dot' + (active === 0 ? ' active' : '')} onClick={() => goTo(0)} />
        <span className={'sci-compare-dot' + (active === 1 ? ' active' : '')} onClick={() => goTo(1)} />
      </div>
    </div>
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

// Reduce a compare-mode transcript (direct + RAG bubbles interleaved, tagged
// `compare`/`mode`) to one lineage's ordinary turns: drop the sibling reply
// and the compare bookkeeping fields, so it reads (and saves/replays) exactly
// like a normal, non-compare conversation. Used when a compare-mode thread is
// saved to favorites with only one side picked (or split into two favorites).
function stripCompareMessages(msgs, mode) {
  return (msgs || [])
    .filter((m) => !(m.compare && m.mode !== mode))
    .map((m) => {
      if (!m.compare) return m;
      const { compare, mode: _mode, cid, done, turnId, ...rest } = m;
      return rest;
    });
}

// Reduce a discussion transcript to the compact (question -> conclusion) rounds
// the backend keeps as panel memory, so a resumed discussion can be rehydrated.
// A compare-mode turn has TWO conclusions (direct + rag, tagged `mode`) for one
// question; `mode` picks which lineage's conclusion counts for that turn --
// defaulting to 'rag' (the session-backed, "primary" lineage) when omitted, so
// generic callers (e.g. follow-up suggestions) get a sensible single thread.
function extractRounds(messages, mode) {
  const rounds = [];
  let q = null;
  for (const m of messages || []) {
    if (m.role === 'user') q = m.text;
    else if (m.role === 'sci' && m.conclusion && q != null
      && (!m.compare || m.mode === (mode || 'rag'))) {
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

  // Every Ollama tag actually installed (from /api/health), for the model-picker
  // dropdown. The pin itself is shared backend-side (see model-resolver.mjs's
  // globalOverride) so every device converges on the same model instead of
  // fighting over which one Ollama has loaded; this is only this device's
  // memory of an explicit choice it made. Three states matter, so `null`
  // (never touched -- omit `model` from requests, just follow the shared pin)
  // must stay distinct from `''` (explicitly picked "Auto" -- tell the backend
  // to clear the shared pin) even though both read back falsy from storage.
  const [installedModels, setInstalledModels] = useState([]);
  const [modelOverride, setModelOverride] = useState(() => {
    try { return localStorage.getItem('kn_sci_model_override'); } catch (e) { return null; }
  });
  useEffect(() => {
    try {
      if (modelOverride) localStorage.setItem('kn_sci_model_override', modelOverride);
      else localStorage.removeItem('kn_sci_model_override');
    } catch (e) {}
  }, [modelOverride]);
  // The `model` field to send on every request: omitted (undefined) when this
  // device has no opinion, so the shared backend pin (or per-language auto
  // pick) is left alone; sent explicitly (including '' for "Auto") only when
  // the user actually touched the picker on this device.
  const modelParam = modelOverride == null ? undefined : modelOverride;
  // True while the backend is already generating for some device (this one or
  // another) -- Ollama serializes requests, so a new one just queues behind it.
  const [backendBusy, setBackendBusy] = useState(false);

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

  // Reply mode for the single chat: 'direct' (no retrieval), 'rag' (force
  // knowledge-base retrieval regardless of the backend's default-off env
  // switch), or 'compare' (run both and show them side by side). Defaults to
  // 'direct' so behavior is unchanged for anyone who never touches this.
  const [replyMode, setReplyMode] = useState(() => {
    try { return localStorage.getItem('kn_sci_reply_mode') || 'direct'; } catch (e) { return 'direct'; }
  });
  useEffect(() => {
    try { localStorage.setItem('kn_sci_reply_mode', replyMode); } catch (e) {}
  }, [replyMode]);

  // Same idea for the Science Dialogue tab, including 'compare': a compare-mode
  // question runs the FULL multi-round roundtable twice (direct lineage, then
  // the RAG-searched one) -- see sendDiscuss/runDiscussCall -- and renders
  // side by side per turn, same layout as the single chat's compare rows.
  const [discussReplyMode, setDiscussReplyMode] = useState(() => {
    try { return localStorage.getItem('kn_sci_discuss_reply_mode') || 'direct'; } catch (e) { return 'direct'; }
  });
  useEffect(() => {
    try { localStorage.setItem('kn_sci_discuss_reply_mode', discussReplyMode); } catch (e) {}
  }, [discussReplyMode]);

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
      return { messages: [], usage: 0, activeModel: '', sessionId: '', followups: [], shownFollowups: [], input: '' };
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
        shownFollowups: persisted.shownFollowups || [],
        input: persisted.input || '',
      };
    }
    return {
      messages: [],
      usage: 0,
      activeModel: '',
      sessionId: '',
      followups: [],
      shownFollowups: [],
      input: '',
    };
  }, [persisted]);

  const selectedIdState = useState(persisted.selectedId || '');
  const selectedId = selectedIdState[0], setSelectedId = selectedIdState[1];

  const initialSession = useMemo(() => getPersistedSession(persisted.selectedId || ''), [persisted.selectedId, getPersistedSession]);

  const [messages, setMessages] = useState(initialSession.messages);
  const [input, setInput] = useState(initialSession.input || '');
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState(initialSession.usage);
  const [activeModel, setActiveModel] = useState(initialSession.activeModel);
  const [showSettings, setShowSettings] = useState(false);
  const [bioId, setBioId] = useState(null);
  const [showSinglePicker, setShowSinglePicker] = useState(false);
  const appRef = useRef(null);
  const translateYRef = useRef(0);

  // The chat-head row wraps on narrow screens (long model names / long persona
  // names push the model chip and meter onto their own lines), so its real
  // height varies. Track it live so the scroll padding and the hide-on-scroll
  // clamp below always match what's actually on screen instead of an assumed
  // one-line height -- otherwise wrapped rows sit on top of (and behind) the
  // message list instead of collapsing along with it.
  const chatHeadHeightRef = useRef(57);
  const chatHeadObserverRef = useRef(null);
  const setChatHeadNode = useCallback((node) => {
    if (chatHeadObserverRef.current) {
      chatHeadObserverRef.current.disconnect();
      chatHeadObserverRef.current = null;
    }
    if (!node) return;
    const applyHeight = () => {
      chatHeadHeightRef.current = node.offsetHeight || 57;
      if (appRef.current) {
        appRef.current.style.setProperty('--chathead-h', `${chatHeadHeightRef.current}px`);
      }
    };
    applyHeight();
    const ro = new ResizeObserver(applyHeight);
    ro.observe(node);
    chatHeadObserverRef.current = ro;
  }, []);

  const lastScrollTop = useRef(0);
  // Set right before the autoscroll-to-bottom effect forces scrollTop during a
  // streaming reply, and cleared a frame later. The forced scroll fires its own
  // 'scroll' event, and without this guard handleScroll reads that as a user
  // drag and yanks the header stack toward fully-collapsed on every token --
  // the "screen jitter while generating" this is here to prevent.
  const autoScrollLockRef = useRef(false);
  const handleScroll = useCallback((e) => {
    if (window.innerWidth > 760) return;
    const scrollTop = e.currentTarget.scrollTop;
    if (autoScrollLockRef.current) { lastScrollTop.current = scrollTop; return; }

    if (scrollTop <= 5) {
      translateYRef.current = 0;
      if (appRef.current) {
        appRef.current.style.setProperty('--header-translate', '0px');
      }
      lastScrollTop.current = scrollTop;
      return;
    }

    const dy = scrollTop - lastScrollTop.current;

    // Calculate new translation, clamping between -(full header stack height)
    // and 0, so the header/tabs/chat-head tuck fully away TOGETHER (in sync) as
    // one unit -- not just the chat-head row -- and a wrapped (taller) chat-head
    // still tucks away completely instead of leaving overflow rows on screen.
    let next = translateYRef.current - dy;
    next = Math.max(-(HEADER_STACK_PX + chatHeadHeightRef.current), Math.min(0, next));

    translateYRef.current = next;
    if (appRef.current) {
      appRef.current.style.setProperty('--header-translate', `${next}px`);
    }

    lastScrollTop.current = scrollTop;
  }, []);

  // 'chat' (live single conversation) | 'discuss' (Science Dialogue) | 'favorites' (saved threads)
  const [view, setView] = useState('chat');

  // Reset the hide-on-scroll header tuck whenever the active view changes, so
  // switching tabs never leaves the header stuck mid-collapse from the
  // previous view's scroll position.
  useEffect(() => {
    translateYRef.current = 0;
    if (appRef.current) {
      appRef.current.style.setProperty('--header-translate', '0px');
    }
  }, [view]);

  const [favorites, setFavorites] = useState(() => {
    const v = loadJSON(FAV_KEY, []);
    return Array.isArray(v) ? v : [];
  });
  const [openFav, setOpenFav] = useState(null); // a saved thread being viewed
  // null | 'chat' | 'discuss' -- which tab's compare-mode "Save" is waiting on
  // the direct/RAG/both save-choice modal (see resolveSaveChoice).
  const [saveChoiceFor, setSaveChoiceFor] = useState(null);

  // Topic-aware follow-up suggestions generated from the running conversation.
  // Purely UI chips: only a clicked one becomes a turn, so the unclicked options
  // (and the act of suggesting) never enter the context window.
  const [followups, setFollowups] = useState(initialSession.followups || []);
  const [discussFollowups, setDiscussFollowups] = useState(Array.isArray(persistedD.followups) ? persistedD.followups : []);

  // Every follow-up question ever shown in this thread (not just the currently
  // displayed chips) -- sent back to the backend so its "don't repeat yourself"
  // memory survives a backend restart, a scientist switch, or a page reload,
  // none of which the backend's own in-memory session copy survives on its own.
  const [shownFollowups, setShownFollowups] = useState(initialSession.shownFollowups || []);
  const [discussShownFollowups, setDiscussShownFollowups] = useState(Array.isArray(persistedD.shownFollowups) ? persistedD.shownFollowups : []);
  const shownFollowupsRef = useRef(shownFollowups);
  useEffect(() => { shownFollowupsRef.current = shownFollowups; }, [shownFollowups]);
  const discussShownFollowupsRef = useRef(discussShownFollowups);
  useEffect(() => { discussShownFollowupsRef.current = discussShownFollowups; }, [discussShownFollowups]);

  // Merge newly-shown follow-up questions into the running "ever shown" memory,
  // deduping case-insensitively and capping like the backend's own list.
  function mergeShown(prev, fresh) {
    if (!fresh || !fresh.length) return prev;
    const seen = new Set(prev.map((q) => q.toLowerCase()));
    const merged = prev.slice();
    for (const q of fresh) {
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(q);
    }
    return merged.slice(-40);
  }

  // ---- Science Dialogue (multi-scientist roundtable) state ----
  const [panel, setPanel] = useState(Array.isArray(persistedD.panel) ? persistedD.panel : []);
  const [discussMessages, setDiscussMessages] = useState(Array.isArray(persistedD.messages) ? persistedD.messages : []);
  const [discussInput, setDiscussInput] = useState(persistedD.input || '');
  const [discussStreaming, setDiscussStreaming] = useState(false);
  const [discussUsage, setDiscussUsage] = useState(persistedD.usage || 0);
  const [discussModel, setDiscussModel] = useState(persistedD.activeModel || '');
  const [showPanelPicker, setShowPanelPicker] = useState(false);
  const discussSessionId = useRef(persistedD.sessionId || '');
  const discussAbortRef = useRef(null);

  const sessionId = useRef(initialSession.sessionId);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // Compare mode's "direct" lineage never holds a server session (it's an
  // isolated call, see runChatCall) -- so unlike the RAG side, ITS carried
  // memory has to live here on the client: a compact summary string, plus the
  // message-array index it covers (messages before that index are folded into
  // the summary and no longer replayed; see lineageHistory / summarizeNow).
  const directSummaryRef = useRef('');
  const directHistoryStartRef = useRef(0);

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
    const activeSession = { messages, usage, activeModel, sessionId: sessionId.current, followups, shownFollowups, input };
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
      input,
    });
  }, [selectedId, messages, usage, activeModel, sessions, followups, shownFollowups, streaming, input]);

  // Persist the live discussion (panel + transcript + session id) across reloads.
  useEffect(() => {
    saveJSON(PERSIST_DISCUSS_KEY, {
      panel, messages: discussMessages, usage: discussUsage, activeModel: discussModel,
      sessionId: discussSessionId.current, input: discussInput,
      followups: discussFollowups, shownFollowups: discussShownFollowups,
    });
  }, [panel, discussMessages, discussUsage, discussModel, discussStreaming, discussInput, discussFollowups, discussShownFollowups]);

  // Persist the saved-thread collection whenever it changes.
  useEffect(() => { saveJSON(FAV_KEY, favorites); }, [favorites]);

  // reflect language -> default active model chip
  useEffect(() => { setActiveModel(models[lang] || ''); setDiscussModel((m) => m || models[lang] || ''); }, [lang, models]);

  // Lightweight health-only refresh: confirms what model the backend is
  // currently running (and whether it's busy) without touching the scientist
  // roster or the active session, so it's cheap enough to poll on an interval
  // and on tab refocus. This is the "confirm current model first" check --
  // it's what lets this device pick up a model another device already pinned
  // instead of guessing its own and forcing Ollama to reload.
  const refreshHealth = useCallback(async () => {
    try {
      const h = await fetch(backendUrl + '/api/health').then((r) => r.json());
      setHealth(h && h.ok ? 'online' : 'offline');
      if (h && h.models) setModels(h.models);
      setInstalledModels(h && Array.isArray(h.installed) ? h.installed : []);
      setBackendBusy(!!(h && h.busy));
      return h;
    } catch (e) {
      setHealth('offline');
      return null;
    }
  }, [backendUrl]);

  // health + scientist list (re-run when backend URL changes)
  const loadBackend = useCallback(async () => {
    setHealth('checking');
    await refreshHealth();
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
          const nextSession = (persisted.sessions && persisted.sessions[next]) || { messages: [], usage: 0, activeModel: '', sessionId: '', followups: [], shownFollowups: [], input: '' };
          setSelectedId(next);
          setMessages(nextSession.messages || []);
          setUsage(nextSession.usage || 0);
          setActiveModel(nextSession.activeModel || '');
          sessionId.current = nextSession.sessionId || '';
          setFollowups(nextSession.followups || []);
          setShownFollowups(nextSession.shownFollowups || []);
          setInput(nextSession.input || '');
        }
      }
    } catch (e) { /* leave roster empty; health dot shows offline */ }
  }, [backendUrl, selectedId, persisted, refreshHealth]);

  useEffect(() => { loadBackend(); }, [loadBackend]);

  // Re-confirm the backend's current model + busy state on an interval and
  // whenever the tab regains focus, so a dialog left open doesn't keep
  // showing a stale model/idle state once another device has changed things.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') refreshHealth(); };
    const id = setInterval(tick, 8000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refreshHealth]);

  // autoscroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    autoScrollLockRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { autoScrollLockRef.current = false; });
  }, [messages, streaming]);

  // `modeLabel` (e.g. tr.replyModeBadgeDirect/Rag) tags a compare-mode
  // keypoints notice so the two lineages' summaries aren't shown as one.
  // `compareTag` ({compare:true, mode:'rag'|'direct'}) marks it the same way
  // a compare-mode sci bubble is marked, so it (a) pairs into a side-by-side
  // CompareSwipeRow like the conversation itself, and (b) is picked up by
  // stripCompareMessages when a favorite keeps only one lineage.
  function pushNotice(kind, text, modeLabel, compareTag) {
    setMessages((m) => [...m, { role: 'notice', kind, text, modeLabel, ...compareTag }]);
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
        body: JSON.stringify({
          sessionId: sessionId.current || undefined,
          lang,
          history: messagesRef.current,
          model: modelParam,
          // Everything ever shown in this thread, so the "don't repeat" memory
          // survives even if the backend's own copy was lost (restart / a
          // rebuilt session) -- see mergeClientFollowups() in server.mjs.
          existingFollowups: shownFollowupsRef.current,
        }),
      });
      if (!res.ok) { if (token === followupTokenRef.current) setFollowups([]); return; }
      const r = await res.json().catch(() => null);
      if (token !== followupTokenRef.current) return; // a newer turn superseded us
      const next = r && Array.isArray(r.followups) ? r.followups : [];
      setFollowups(next);
      if (next.length) setShownFollowups((prev) => mergeShown(prev, next));
    } catch (e) {
      if (token === followupTokenRef.current) setFollowups([]);
    }
  }, [backendUrl, lang, modelOverride]);

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
        shownFollowups,
        input,
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
    setShownFollowups(nextSession.shownFollowups || []);
    setInput(nextSession.input || '');
    // Compare mode's direct-lineage memory is ephemeral (not part of the
    // persisted per-scientist session), so a persona switch just starts fresh.
    directSummaryRef.current = '';
    directHistoryStartRef.current = 0;

    // Invalidate any in-flight follow-up fetch for the scientist we're leaving
    // (so its response can't land on top of the one we're switching to) WITHOUT
    // wiping the follow-ups we just restored above -- a bare clearFollowups()
    // here would blow away the just-restored chips on every switch.
    followupTokenRef.current += 1;
    needHistoryRef.current = true;
    // Cached follow-ups for the resumed scientist should show immediately; only
    // re-arm the "offer once" flow when there's nothing cached to show yet.
    restoredFollowupRef.current = !!(nextSession.followups && nextSession.followups.length);
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
    setShownFollowups([]);
    needHistoryRef.current = true;
    restoredFollowupRef.current = false;
    directSummaryRef.current = '';
    directHistoryStartRef.current = 0;

    // Clear inside sessions dictionary
    setSessions((prev) => ({
      ...prev,
      [selectedId]: {
        messages: [],
        usage: 0,
        activeModel: activeModel,
        sessionId: '',
        followups: [],
        shownFollowups: [],
        input,
      }
    }));
  }

  // Manually compress the running dialogue into a few key points. The backend
  // summarizes + restarts the session memory; we surface the bullets inline.
  // Compare mode has two independent lineages -- the RAG side's real backend
  // session, and the direct side's client-carried memory (directSummaryRef) --
  // so both are summarized in turn, each reported as its own keypoints card.
  async function summarizeNow() {
    if (streaming) return;
    if (!messages.some((m) => m.role === 'user')) {
      pushNotice('summary', tr.summaryNothing);
      return;
    }
    if (replyMode !== 'compare') {
      await summarizeRagLineage();
      return;
    }
    pushNotice('summary', tr.summarizingNow);
    await summarizeRagLineage({ silent: true, compare: true });
    await summarizeDirectLineage({ compare: true });
  }

  // RAG lineage (or the plain direct/rag single-mode chat): backed by a real
  // server session, so this is the original manual-summarize call. `silent`
  // (compare mode) skips the standalone "nothing to summarize" chatter since
  // the sibling direct-lineage call still has its own thing to report.
  async function summarizeRagLineage(opts) {
    const silent = !!(opts && opts.silent);
    const compareTag = opts && opts.compare ? { compare: true, mode: 'rag' } : undefined;
    if (!sessionId.current) {
      if (!silent) pushNotice('summary', tr.summaryNothing);
      return;
    }
    if (!silent) pushNotice('summary', tr.summarizingNow);
    try {
      const res = await fetch(backendUrl + '/api/session/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current, lang, model: modelParam }),
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
        pushNotice('keypoints', r.summary || '', silent ? tr.replyModeBadgeRag : undefined, compareTag);
        setUsage(typeof r.usage === 'number' ? r.usage : 0);
      } else if (res.ok && r && r.ok) {
        if (!silent) pushNotice('summary', tr.summaryNothing);
      } else {
        pushNotice('err', tr.errPrefix + ((r && r.error) || 'summarize failed'));
      }
    } catch (e) {
      pushNotice('err', tr.errPrefix + ((e && e.message) || e));
    }
  }

  // Direct lineage (compare mode only): stateless/isolated, so its "session"
  // is just the client-held summary text + a replay start index -- summarizing
  // folds everything up to now into that summary and moves the start index
  // forward, so future direct-mode turns replay less (see lineageHistory).
  async function summarizeDirectLineage(opts) {
    const compareTag = opts && opts.compare ? { compare: true, mode: 'direct' } : undefined;
    const hist = lineageHistory(messagesRef.current, 'direct', directHistoryStartRef.current)
      .filter((m) => m.role === 'user' || (m.role === 'sci' && m.text && m.text.trim()));
    if (!hist.length) return;
    try {
      const res = await fetch(backendUrl + '/api/session/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: hist, summary: directSummaryRef.current, lang, model: modelParam }),
      });
      const r = await res.json().catch(() => null);
      if (res.ok && r && r.ok && r.changed) {
        directSummaryRef.current = r.summary || '';
        directHistoryStartRef.current = messagesRef.current.length;
        pushNotice('keypoints', r.summary || '', tr.replyModeBadgeDirect, compareTag);
      }
    } catch (e) {
      pushNotice('err', tr.errPrefix + ((e && e.message) || e));
    }
  }

  // Snapshot the current thread into the saved collection. A compare-mode
  // thread (direct + RAG bubbles side by side) can't be flattened into one
  // ordinary saved conversation without picking a side, so ask which lineage
  // (or both, saved as two separate favorites) before committing.
  function saveFavorite() {
    if (!selected || !messages.some((m) => m.role === 'user' || m.role === 'sci')) return;
    if (messages.some((m) => m.compare)) { setSaveChoiceFor('chat'); return; }
    commitChatFavorite(messages.slice());
    pushNotice('saved', tr.saved);
  }

  function commitChatFavorite(msgs, titleSuffix) {
    const fav = {
      id: uid(),
      scientistId: selected.id,
      name: nameFor(selected, lang),
      accent: selected.accent || '',
      years: selected.years || '',
      lang,
      messages: msgs,
      title: threadTitle(msgs) + (titleSuffix || ''),
      savedAt: Date.now(),
    };
    setFavorites((f) => [fav, ...f]);
  }

  // Resolve the direct/RAG/both save-choice modal for whichever thread asked
  // for it (the single chat, or -- once the discussion panel supports compare
  // mode -- the Science Dialogue tab; see saveChoiceFor).
  function resolveSaveChoice(choice) {
    const target = saveChoiceFor;
    setSaveChoiceFor(null);
    if (!choice) return;
    if (target === 'chat') {
      if (choice === 'both') {
        commitChatFavorite(stripCompareMessages(messages, 'direct'), ' · ' + tr.replyModeBadgeDirect);
        commitChatFavorite(stripCompareMessages(messages, 'rag'), ' · ' + tr.replyModeBadgeRag);
      } else {
        commitChatFavorite(stripCompareMessages(messages, choice));
      }
      pushNotice('saved', tr.saved);
    } else if (target === 'discuss') {
      if (choice === 'both') {
        commitDiscussFavorite(stripCompareMessages(discussMessages, 'direct'), ' · ' + tr.replyModeBadgeDirect);
        commitDiscussFavorite(stripCompareMessages(discussMessages, 'rag'), ' · ' + tr.replyModeBadgeRag);
      } else {
        commitDiscussFavorite(stripCompareMessages(discussMessages, choice));
      }
      pushDiscussNotice('saved', tr.saved);
    }
  }

  function deleteFavorite(id) {
    setFavorites((f) => f.filter((x) => x.id !== id));
    setOpenFav((cur) => (cur && cur.id === id ? null : cur));
  }

  // Apply an edit made in the FavReader (title / trimmed or reworded messages).
  function updateFavorite(id, patch) {
    setFavorites((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setOpenFav((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
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
      setDiscussShownFollowups([]);
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
        shownFollowups,
      }
    }));

    setSelectedId(fav.scientistId);
    setMessages(fav.messages.slice());
    setUsage(0);
    sessionId.current = '';
    needHistoryRef.current = true; // replay history to rebuild context
    restoredFollowupRef.current = false; // re-offer follow-ups for it
    clearFollowups();
    setShownFollowups([]);
    directSummaryRef.current = '';
    directHistoryStartRef.current = 0;
    setOpenFav(null);
    setView('chat');
  }

  function stopStreaming() {
    // abortRef.current is an array (compare mode can have more than one call
    // registered, even though item 3 now runs them sequentially rather than
    // concurrently). Abort locally right away for instant UI feedback, AND
    // tell the backend explicitly (fire-and-forget) so the Ollama-bound
    // generation actually stops now -- waiting for the browser's fetch-abort
    // to close the underlying connection can be delayed indefinitely by a
    // reverse proxy (e.g. tailscale serve on mobile), leaving the backend
    // generating (and reporting busy) long after the user tapped Stop.
    for (const { ac, requestId } of abortRef.current || []) {
      ac.abort();
      if (requestId) {
        fetch(backendUrl + '/api/chat/stop', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
        }).catch(() => {});
      }
    }
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

  function undoDiscussMessage(index) {
    if (discussStreaming) return;
    const targetMsg = discussMessages[index];
    if (!targetMsg || targetMsg.role !== 'user') return;

    setDiscussInput(targetMsg.text);

    const nextMessages = discussMessages.slice(0, index);
    setDiscussMessages(nextMessages);

    clearDiscussFollowups();
    needDiscussHistoryRef.current = true;
    restoredDiscussFollowupRef.current = false;
  }

  // Apply an update to exactly one message, matched by client id (cid) rather
  // than "the last sci message" -- compare mode has two sci bubbles streaming
  // concurrently, so a positional match would corrupt the wrong one.
  const patchMessageByCid = useCallback((cid, patch) => {
    setMessages((m) => {
      const copy = m.slice();
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].cid === cid) {
          copy[i] = { ...copy[i], ...(typeof patch === 'function' ? patch(copy[i]) : patch) };
          break;
        }
      }
      return copy;
    });
  }, []);

  // isolated calls (compare mode's "direct" companion) never hold a real
  // session server-side, so their meta/done events must not clobber the real
  // session's sessionId/usage/model chip.
  function handleEvent(ev, cid, isolated) {
    if (ev.type === 'meta') {
      if (ev.sessionId && !isolated) sessionId.current = ev.sessionId;
      if (ev.model && !isolated) setActiveModel(ev.model);
      if (typeof ev.usage === 'number' && !isolated) setUsage(ev.usage);
      patchMessageByCid(cid, { ragUsed: !!ev.ragUsed, sources: ev.sources || [] });
    } else if (ev.type === 'assigned') {
      // Auto-assign mode: tag the in-progress bubble with the chosen expert so it
      // shows that scientist's avatar and name.
      patchMessageByCid(cid, { id: ev.id, name: ev.name, accent: ev.accent });
    } else if (ev.type === 'token') {
      patchMessageByCid(cid, (mm) => ({ text: mm.text + (ev.text || '') }));
    } else if (ev.type === 'summary') {
      if (isolated) { /* isolated calls never summarize */ }
      else if (ev.state === 'start') pushNotice('summary', tr.summarizing);
      else if (ev.state === 'done') pushNotice('summary', tr.summarized.replace('{n}', ev.summaryCount || 1));
      else if (ev.state === 'error') pushNotice('summary', tr.summaryErr);
    } else if (ev.type === 'done') {
      if (typeof ev.usage === 'number' && !isolated) setUsage(ev.usage);
    } else if (ev.type === 'error') {
      pushNotice('err', tr.errPrefix + ev.error);
    }
  }

  // One /api/chat SSE call, streaming into the message identified by `cid`.
  // `isolated` calls (compare mode's direct-reply companion) send their own
  // history snapshot and never touch the real session (mirrors the existing
  // auto-assign/follow-ups isolated-call pattern already used server-side).
  const runChatCall = useCallback(async (msg, { mode, isolated, cid, history, summary }) => {
    const ac = new AbortController();
    const requestId = uid();
    abortRef.current = [...(abortRef.current || []), { ac, requestId }];

    let ok = false;
    let gotToken = false;
    try {
      const res = await fetch(backendUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: isolated ? undefined : (sessionId.current || undefined),
          requestId,
          scientistId: selected.id,
          lang,
          message: msg,
          history: history && history.length ? history : undefined,
          summary: isolated && summary ? summary : undefined,
          model: modelParam,
          replyMode: mode,
          isolated: isolated || undefined,
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
          if (ev && ev.type === 'token' && ev.text) gotToken = true;
          handleEvent(ev, cid, isolated);
        }
      }
      ok = true;
    } catch (e) {
      if (!ac.signal.aborted) pushNotice('err', tr.errPrefix + (e && e.message || e));
    } finally {
      abortRef.current = (abortRef.current || []).filter((x) => x.ac !== ac);
      patchMessageByCid(cid, { done: true });
    }
    // `gotToken` covers the case where the reply visibly finished (tokens
    // rendered) but the stream's own tail (e.g. the final SSE frame, or the
    // connection itself on a flaky mobile link) didn't cleanly resolve --
    // the caller still treats that as "got a reply" for follow-up purposes.
    return { ok, gotToken };
  }, [backendUrl, selected, lang, modelParam, tr, patchMessageByCid]);

  // Build one mode's own conversation lineage from a message-list snapshot:
  // user turns plus only the sci turns that belong to that mode. A
  // compare-mode turn pushes one bubble per mode (tagged `m.mode`); a plain
  // (non-compare) turn has no mode conflict and belongs to both lineages. This
  // is what keeps the direct and RAG threads from contaminating each other's
  // context in compare mode -- each side only ever sees its own prior answers.
  // `fromIndex` skips turns already folded into that lineage's own carried
  // summary (only meaningful for the direct lineage -- see directHistoryStartRef).
  function lineageHistory(snapshot, mode, fromIndex = 0) {
    const out = [];
    for (let i = fromIndex; i < snapshot.length; i++) {
      const m = snapshot[i];
      if (m.role === 'user') out.push(m);
      else if (m.role === 'sci' && (!m.compare || m.mode === mode)) out.push(m);
    }
    return out;
  }

  const sendMessage = useCallback(async (text) => {
    const msg = (text != null ? text : input).trim();
    if (!msg || streaming || !selected) return;
    // Snapshot BEFORE this turn's own (still-empty) placeholder bubbles are
    // pushed below, so neither lineage ever includes its own in-flight turn.
    const priorMessages = messagesRef.current.slice();
    setInput('');
    clearFollowups();

    const isCompare = replyMode === 'compare';
    const cidRag = uid();
    const cidDirect = isCompare ? uid() : null;
    const primaryMode = isCompare ? 'rag' : replyMode;

    setMessages((m) => {
      const next = [...m, { role: 'user', text: msg }];
      if (isCompare) {
        next.push({ role: 'sci', text: '', cid: cidRag, done: false, mode: 'rag', compare: true });
        next.push({ role: 'sci', text: '', cid: cidDirect, done: false, mode: 'direct', compare: true });
      } else {
        next.push({ role: 'sci', text: '', cid: cidRag, done: false, mode: primaryMode });
      }
      return next;
    });
    setStreaming(true);

    let primaryResult = { ok: false, gotToken: false };
    try {
      if (isCompare) {
        // Direct first, then RAG -- both isolated in their own lineage so
        // neither side's history includes the other's replies (see
        // lineageHistory above). Sequential (not Promise.all) so the two
        // don't contend for the single Ollama generation slot at once, and so
        // "which one is the primary/session-backed call" stays unambiguous.
        await runChatCall(msg, {
          mode: 'direct', isolated: true, cid: cidDirect,
          history: lineageHistory(priorMessages, 'direct', directHistoryStartRef.current),
          summary: directSummaryRef.current,
        });
        primaryResult = await runChatCall(msg, {
          mode: 'rag', isolated: false, cid: cidRag,
          history: needHistoryRef.current ? lineageHistory(priorMessages, 'rag') : null,
        });
      } else {
        primaryResult = await runChatCall(msg, {
          mode: primaryMode, isolated: false, cid: cidRag,
          history: needHistoryRef.current ? priorMessages : null,
        });
      }
    } finally {
      setStreaming(false);
    }

    // A completed turn means the backend now holds this dialogue, so stop
    // replaying history; then suggest a few follow-ups (isolated -> no
    // context). Gate on `gotToken` too, not just `ok`: a reply that fully
    // rendered but whose stream tail didn't cleanly resolve (a flaky mobile
    // connection, or a long RAG turn getting cut off right at the end) should
    // still offer follow-ups instead of silently skipping them.
    if (primaryResult.ok || primaryResult.gotToken) {
      needHistoryRef.current = false;
      restoredFollowupRef.current = true; // live flow owns follow-ups from here
      fetchFollowups();
    }
  }, [input, streaming, selected, replyMode, runChatCall, clearFollowups, fetchFollowups]);

  // Renders one keypoints (summary) notice. Shared by the plain single-card
  // path and the compare-mode side-by-side pair (see the messages.map above).
  function renderKeypoints(m, i) {
    return (
      <div key={i} className="sci-keypoints">
        <span className="kp-title">{tr.keypointsTitle}{m.modeLabel && <span className="sci-mode-badge">{m.modeLabel}</span>}</span>
        <div className="kp-body">{m.text}</div>
      </div>
    );
  }

  // Renders one sci-turn bubble. Shared by the normal single-bubble path and
  // the compare-mode side-by-side pair (see the messages.map below) --
  // `m.done === false` (not "is this the last message") now drives the typing
  // cursor / copy-button visibility, since compare mode streams two bubbles
  // that aren't both last.
  function renderSciBubble(m, i) {
    const sciId = m.id || (selected && selected.id);
    const sciAccent = m.accent || (selected && selected.accent);
    const showCopy = m.done !== false;
    return (
      <div key={i} className="sci-msg sci">
        <SciAvatar id={sciId} accent={sciAccent} name={m.name || (selected && (selected.name && selected.name.en))} size={30} onClick={sciId !== AUTO_ID ? () => setBioId(sciId) : undefined} />
        <div className="sci-bubble-wrap">
          {(m.name || m.compare) && (
            <div className="sci-speaker">
              {m.name}
              {m.compare && (
                <span className="sci-mode-badge">
                  {m.mode === 'direct' ? tr.replyModeBadgeDirect : tr.replyModeBadgeRag}
                </span>
              )}
            </div>
          )}
          <div className="sci-bubble">
            {renderText(m.text)}
            {m.done === false && <span className="sci-typing" />}
          </div>
          {m.sources && m.sources.length > 0 && (
            <div className="sci-sources">
              {tr.sourcesLabel}{' '}
              {m.sources.map((s, si) => (
                <span key={si} className="sci-source">
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
                  {si < m.sources.length - 1 ? '、' : ''}
                </span>
              ))}
            </div>
          )}
          {showCopy && (
            <div className="sci-msg-actions">
              <CopyButton text={m.text} title={lang === 'zh' ? '複製回覆' : 'Copy reply'} />
            </div>
          )}
        </div>
      </div>
    );
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

  // `ctx.isolated` is compare mode's direct-reply lineage (see runDiscussCall):
  // its meta/model/usage must never clobber the real (RAG) session's state,
  // exactly like the single chat's isolated compare call. `ctx.mode`/`turnId`
  // tag every message this call produces, so a compare turn's two full
  // roundtables (direct then RAG) render side by side afterward.
  function handleDiscussEvent(ev, ctx) {
    const { isolated, mode, turnId } = ctx || {};
    const compare = !!turnId;
    if (ev.type === 'meta') {
      if (!isolated) {
        if (ev.sessionId) discussSessionId.current = ev.sessionId;
        if (ev.model) setDiscussModel(ev.model);
        if (typeof ev.usage === 'number') setDiscussUsage(ev.usage);
      }
    } else if (ev.type === 'phase') {
      setDiscussMessages((m) => [...m, { role: 'phase', phase: ev.phase, round: ev.round, maxRounds: ev.maxRounds, stopReason: ev.stopReason, compare, mode, turnId }]);
    } else if (ev.type === 'speaker') {
      setDiscussMessages((m) => [...m, { role: 'sci', id: ev.id, name: ev.name, accent: ev.accent, text: '', conclusion: ev.role === 'conclusion', compare, mode, turnId }]);
    } else if (ev.type === 'token') {
      appendDiscussDelta(ev.text || '');
    } else if (ev.type === 'summary') {
      // Emitted when a large rehydrated history is compressed before the turn.
      // The isolated lineage never holds server memory to restart, so there's
      // nothing to report here for it.
      if (isolated) { /* no-op */ }
      else if (ev.state === 'start') pushDiscussNotice('summary', tr.summarizing);
      else if (ev.state === 'done') pushDiscussNotice('summary', tr.summarized.replace('{n}', ev.summaryCount || 1));
      else if (ev.state === 'error') pushDiscussNotice('summary', tr.summaryErr);
    } else if (ev.type === 'turn-done' || ev.type === 'done') {
      if (!isolated && typeof ev.usage === 'number') setDiscussUsage(ev.usage);
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
          model: modelParam,
          existingFollowups: discussShownFollowupsRef.current,
        }),
      });
      if (!res.ok) { if (token === discussFollowupTokenRef.current) setDiscussFollowups([]); return; }
      const r = await res.json().catch(() => null);
      if (token !== discussFollowupTokenRef.current) return;
      const next = r && Array.isArray(r.followups) ? r.followups : [];
      setDiscussFollowups(next);
      if (next.length) setDiscussShownFollowups((prev) => mergeShown(prev, next));
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

  // One full /api/discuss roundtable (a whole multi-round panel debate down to
  // its conclusion), streamed into discussMessages tagged by `mode`/`turnId`
  // when this is one half of a compare-mode turn. `isolated` mirrors the
  // single chat's compare-mode direct call: no server session, so the caller
  // must resend that lineage's own (question -> conclusion) rounds every time.
  const runDiscussCall = useCallback(async (msg, { mode, isolated, turnId, rounds }) => {
    const ac = new AbortController();
    const requestId = uid();
    discussAbortRef.current = [...(discussAbortRef.current || []), { ac, requestId }];
    let ok = false;
    try {
      const res = await fetch(backendUrl + '/api/discuss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: isolated ? undefined : (discussSessionId.current || undefined),
          requestId,
          scientistIds: panel,
          lang,
          message: msg,
          rounds: rounds && rounds.length ? rounds : undefined,
          model: modelParam,
          replyMode: mode,
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
          handleDiscussEvent(ev, { isolated, mode, turnId });
        }
      }
      ok = true;
    } catch (e) {
      if (!ac.signal.aborted) pushDiscussNotice('err', tr.errPrefix + (e && e.message || e));
    } finally {
      discussAbortRef.current = (discussAbortRef.current || []).filter((x) => x.ac !== ac);
    }
    return ok;
  }, [backendUrl, panel, lang, modelParam, tr]);

  async function sendDiscuss(text) {
    const msg = (text != null ? text : discussInput).trim();
    if (!msg || discussStreaming || panel.length === 0) return;
    const priorMessages = discussMessagesRef.current.slice();
    setDiscussInput('');
    clearDiscussFollowups();
    setDiscussMessages((m) => [...m, { role: 'user', text: msg }]);
    setDiscussStreaming(true);

    const isCompare = discussReplyMode === 'compare';
    let primaryOk = false;
    try {
      if (isCompare) {
        // Direct lineage first (isolated -- resends its own extracted rounds
        // every turn, since it holds no server session), then the RAG lineage
        // (the real, session-backed panel) -- same order as the single chat's
        // compare mode, and for the same reason: keeps "which call owns the
        // real session" unambiguous.
        const turnId = uid();
        await runDiscussCall(msg, { mode: 'direct', isolated: true, turnId, rounds: extractRounds(priorMessages, 'direct') });
        primaryOk = await runDiscussCall(msg, {
          mode: 'rag', isolated: false, turnId,
          rounds: needDiscussHistoryRef.current ? extractRounds(priorMessages, 'rag') : null,
        });
      } else {
        primaryOk = await runDiscussCall(msg, {
          mode: discussReplyMode, isolated: false, turnId: null,
          rounds: needDiscussHistoryRef.current ? extractRounds(priorMessages) : null,
        });
      }
    } finally {
      setDiscussStreaming(false);
    }

    if (primaryOk) {
      needDiscussHistoryRef.current = false;
      restoredDiscussFollowupRef.current = true; // live flow owns follow-ups now
      fetchDiscussFollowups();
    }
  }

  function stopDiscuss() {
    for (const { ac, requestId } of discussAbortRef.current || []) {
      ac.abort();
      if (requestId) {
        fetch(backendUrl + '/api/discuss/stop', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
        }).catch(() => {});
      }
    }
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
    setDiscussShownFollowups([]);
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
        body: JSON.stringify({ sessionId: discussSessionId.current, lang, model: modelParam }),
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
    if (discussMessages.some((m) => m.compare)) { setSaveChoiceFor('discuss'); return; }
    commitDiscussFavorite(discussMessages.slice());
    pushDiscussNotice('saved', tr.saved);
  }

  function commitDiscussFavorite(msgs, titleSuffix) {
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
      messages: msgs,
      title: threadTitle(msgs) + (titleSuffix || ''),
      savedAt: Date.now(),
    };
    setFavorites((f) => [fav, ...f]);
  }

  function onDiscussKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDiscuss(); }
  }

  // ---- render ----
  const statusLabel = health === 'online' ? tr.online : health === 'offline' ? tr.offline : tr.checking;
  const statusClass = health === 'online' ? 'ok' : health === 'offline' ? 'err' : '';

  return (
    <div className="sci-app" ref={appRef}>
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
            <FavReader fav={openFav} tr={tr} lang={lang} onBack={() => setOpenFav(null)} onResume={() => resumeFavorite(openFav)} onDelete={() => deleteFavorite(openFav.id)} onBio={setBioId} onEdit={updateFavorite} />
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
          onScroll={handleScroll}
          onUndo={undoDiscussMessage}
          headRef={setChatHeadNode}
          autoScrollLockRef={autoScrollLockRef}
          installedModels={installedModels}
          modelOverride={modelOverride}
          setModelOverride={setModelOverride}
          busy={backendBusy}
          replyMode={discussReplyMode}
          setReplyMode={setDiscussReplyMode}
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
          <div className="sci-chat-head" ref={setChatHeadNode}>
            {/* mobile picker */}
            <button
              className="sci-iconbtn sci-managebtn"
              onClick={() => setShowSinglePicker(true)}
              title={tr.roster}
              aria-label={tr.roster}
            >
              <IconUsers />
            </button>

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
            {/* Mobile-only row breaks (see .sci-chathead-break-a/-b in
                scientists.css) -- invisible on desktop; on mobile, CSS `order`
                reflows this whole row into 3 stacked rows using these as the
                forced line breaks between them. */}
            <span className="sci-chathead-break-a" aria-hidden="true" />
            <span className="sci-statusdot" title={statusLabel} aria-label={statusLabel}>
              <span className={'sci-dot ' + statusClass} />
            </span>
            <ModelChip activeModel={activeModel} installedModels={installedModels} modelOverride={modelOverride} setModelOverride={setModelOverride} lang={lang} busy={backendBusy} />
            <ReplyModeChip replyMode={replyMode} setReplyMode={setReplyMode} lang={lang} />
            <span className="sci-chathead-break-b" aria-hidden="true" />
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

          <div className="sci-scroll" ref={scrollRef} onScroll={handleScroll}>
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
                  // Compare mode's pair (rag then direct, pushed in that order
                  // by summarizeNow) renders side by side, same as the
                  // conversation's own compare rows -- the second notice of
                  // the pair is skipped here since the first already rendered it.
                  if (m.compare && m.mode === 'direct'
                    && messages[i - 1] && messages[i - 1].role === 'notice' && messages[i - 1].kind === 'keypoints'
                    && messages[i - 1].compare && messages[i - 1].mode === 'rag') {
                    return null;
                  }
                  if (m.compare && m.mode === 'rag'
                    && messages[i + 1] && messages[i + 1].role === 'notice' && messages[i + 1].kind === 'keypoints'
                    && messages[i + 1].compare && messages[i + 1].mode === 'direct') {
                    return (
                      <CompareSwipeRow key={i}>
                        {renderKeypoints(m, i)}
                        {renderKeypoints(messages[i + 1], i + 1)}
                      </CompareSwipeRow>
                    );
                  }
                  return renderKeypoints(m, i);
                }
                return <div key={i} className={'sci-notice ' + (m.kind || '')}>{m.text}</div>;
              }
              if (m.role === 'user') {
                return (
                  <div key={i} className="sci-msg user">
                    <div className="sci-bubble-wrap">
                      <div className="sci-bubble">{renderText(m.text)}</div>
                      <div className="sci-msg-actions">
                        <UndoButton
                          onUndo={() => undoMessage(i)}
                          title={lang === 'zh' ? '收回此訊息' : 'Undo this message'}
                          disabled={streaming}
                          lang={lang}
                        />
                        <CopyButton text={m.text} title={lang === 'zh' ? '複製訊息' : 'Copy message'} />
                      </div>
                    </div>
                  </div>
                );
              }
              // sci turn. In auto-assign mode each answer carries its own scientist
              // (id/name/accent set by the 'assigned' event); otherwise it's the
              // selected persona. Compare mode's pair (rag then direct, pushed
              // together in sendMessage) renders as one side-by-side row; the
              // second bubble of the pair is skipped here since the first
              // already rendered it.
              if (m.compare && m.mode === 'direct'
                && messages[i - 1] && messages[i - 1].compare && messages[i - 1].mode === 'rag') {
                return null;
              }
              if (m.compare && m.mode === 'rag'
                && messages[i + 1] && messages[i + 1].compare && messages[i + 1].mode === 'direct') {
                return (
                  <CompareSwipeRow key={i}>
                    {renderSciBubble(m, i)}
                    {renderSciBubble(messages[i + 1], i + 1)}
                  </CompareSwipeRow>
                );
              }
              return renderSciBubble(m, i);
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

      {showSinglePicker && (
        <SinglePicker
          tr={tr}
          lang={lang}
          scientists={sortedScientists}
          selectedId={selectedId}
          onSelect={selectScientist}
          onClose={() => setShowSinglePicker(false)}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          onBio={setBioId}
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

      {saveChoiceFor && (
        <SaveCompareModal tr={tr} onPick={resolveSaveChoice} onClose={() => resolveSaveChoice(null)} />
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
        <button className="sci-iconbtn" onClick={onResume} title={tr.favResume} aria-label={tr.favResume}><IconPlay /></button>
        <button className="sci-iconbtn fav-del" onClick={onDelete} title={tr.favDelete} aria-label={tr.favDelete}><IconTrash /></button>
      </div>
    </div>
  );
}

// Serialize a saved thread into a plain-text article for the wiki-kb RAG
// corpus: speaker-labelled turns, notices dropped.
function favToKbContent(fav) {
  const lines = [];
  for (const m of fav.messages || []) {
    if (m.role === 'user') lines.push(`Q: ${m.text}`);
    else if (m.role === 'sci') lines.push(`${m.name || fav.name}: ${m.text}`);
  }
  return lines.join('\n\n');
}

// Full transcript of one saved thread, with resume / delete / edit and
// "add to knowledge graph" (wiki-kb /api/contribute via window.KNKB).
function FavReader({ fav, tr, lang, onBack, onResume, onDelete, onBio, onEdit }) {
  const isDiscuss = fav.mode === 'discuss';
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMsgs, setDraftMsgs] = useState([]);
  // 'idle' | 'busy' | 'done' | Error message string
  const [kbState, setKbState] = useState(fav.kbSavedAt ? 'done' : 'idle');
  useEffect(() => { setKbState(fav.kbSavedAt ? 'done' : 'idle'); setEditing(false); }, [fav.id]);

  function startEdit() {
    setDraftTitle(fav.title || '');
    setDraftMsgs((fav.messages || []).map((m) => ({ ...m })));
    setEditing(true);
  }
  function saveEdit() {
    onEdit(fav.id, { title: draftTitle.trim(), messages: draftMsgs });
    setEditing(false);
  }

  function addToKb() {
    if (kbState === 'busy') return;
    setKbState('busy');
    const title = (fav.title || '').slice(0, 180) || (lang === 'zh' ? '科學家對話' : 'Scientist dialogue');
    fetch(window.KNKB.getBaseUrl() + '/api/contribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lang: fav.lang || lang,
        title: (lang === 'zh' ? '對話:' : 'Dialogue: ') + title,
        summary: title,
        content: favToKbContent(fav),
        kind: 'note',
        createEntity: true,
        source: 'scientists',
      }),
    }).then((res) => res.json().then((r) => {
      if (!res.ok || !r || r.ok === false) throw new Error((r && r.error) || ('HTTP ' + res.status));
      setKbState('done');
      onEdit(fav.id, { kbSavedAt: Date.now(), kbQid: r.qid || null });
    })).catch((e) => {
      setKbState(tr.favKbErr + ((e && e.message) || e) + ' ' + tr.favKbHint);
    });
  }

  return (
    <div className="sci-fav-reader">
      <div className="fav-reader-head">
        <button className="sci-iconbtn" onClick={onBack} title={tr.favBack} aria-label={tr.favBack}><IconBack /></button>
        <div className="who">
          <div className="nm">{isDiscuss && <IconUsers />}{fav.name}</div>
          <div className="meta">{favDateLabel(fav.savedAt, lang)}</div>
        </div>
        <div className="spacer" />
        {editing ? (
          <React.Fragment>
            <button className="sci-iconbtn" onClick={saveEdit} title={tr.favEditSave} aria-label={tr.favEditSave}><IconCheck /></button>
            <button className="sci-iconbtn" onClick={() => setEditing(false)} title={tr.favEditCancel} aria-label={tr.favEditCancel}><IconClose /></button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <button className="sci-iconbtn" onClick={startEdit} title={tr.favEdit} aria-label={tr.favEdit}><IconEdit /></button>
            <button
              className="sci-iconbtn"
              onClick={addToKb}
              disabled={kbState === 'busy' || kbState === 'done'}
              title={kbState === 'busy' ? tr.favKbBusy : tr.favKb}
              aria-label={kbState === 'busy' ? tr.favKbBusy : tr.favKb}
            >
              {kbState === 'done' ? <IconCheck /> : <IconGraph />}
            </button>
            <button className="sci-iconbtn" onClick={onResume} title={tr.favResume} aria-label={tr.favResume}><IconPlay /></button>
            <button className="sci-iconbtn fav-del" onClick={onDelete} title={tr.favDelete} aria-label={tr.favDelete}><IconTrash /></button>
          </React.Fragment>
        )}
      </div>
      {kbState === 'done' && <div className="sci-notice saved">{tr.favKbDone}</div>}
      {typeof kbState === 'string' && kbState !== 'idle' && kbState !== 'busy' && kbState !== 'done' && (
        <div className="sci-notice err">{kbState}</div>
      )}
      {editing ? (
        <div className="sci-scroll fav-reader-scroll fav-edit">
          <label className="fav-edit-label">{tr.favEditTitle}</label>
          <input
            className="fav-edit-title"
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
          />
          {draftMsgs.map((m, i) => {
            if (m.role !== 'user' && m.role !== 'sci') return null;
            return (
              <div key={i} className={'fav-edit-msg ' + m.role}>
                <div className="fav-edit-who">
                  <span>{m.role === 'user' ? 'Q' : (m.name || fav.name)}</span>
                  <button
                    className="sci-iconbtn fav-del"
                    title={tr.favEditDelMsg}
                    aria-label={tr.favEditDelMsg}
                    onClick={() => setDraftMsgs((ms) => ms.filter((_, k) => k !== i))}
                  ><IconTrash /></button>
                </div>
                <textarea
                  value={m.text}
                  rows={Math.min(10, Math.max(2, Math.ceil((m.text || '').length / 60)))}
                  onChange={(e) => setDraftMsgs((ms) => ms.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
                />
              </div>
            );
          })}
        </div>
      ) : (
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
      )}
    </div>
  );
}

// Shared renderer for a multi-scientist discussion transcript (used by the live
// Science Dialogue view and by saved-thread playback). Speaker turns carry the
// speaking scientist's avatar + name; the closing synthesis renders as a
// distinct "conclusion" card.
// Render one discussion item (notice / phase / user / speaker / conclusion).
// `key` is the React key (a true index for top-level items, a column-local
// one for items inside a compare-mode column); `typing` is already resolved
// per-item (is THIS the bubble currently streaming). Shared by the flat
// (non-compare) path and the two side-by-side columns of a compare turn.
function renderDiscussItem(m, key, { tr, lang, onBio, onUndo, undoDisabled, typing }) {
  if (m.role === 'notice') {
    if (m.kind === 'keypoints') {
      return <div key={key} className="sci-keypoints"><span className="kp-title">{tr.keypointsTitle}</span><div className="kp-body">{m.text}</div></div>;
    }
    return <div key={key} className={'sci-notice ' + (m.kind || '')}>{m.text}</div>;
  }
  if (m.role === 'phase') {
    if (m.phase === 'concluding') {
      return <div key={key} className="sci-phase concluding">{tr.concluding}</div>;
    }
    const label = lang === 'zh' ? ('第 ' + (m.round || 1) + ' 輪討論') : ('Round ' + (m.round || 1));
    return <div key={key} className="sci-phase"><span>{label}</span></div>;
  }
  if (m.role === 'user') {
    return (
      <div key={key} className="sci-msg user">
        <div className="sci-bubble-wrap">
          <div className="sci-bubble">{renderText(m.text)}</div>
          <div className="sci-msg-actions">
            {onUndo && (
              <UndoButton
                onUndo={() => onUndo(key)}
                title={lang === 'zh' ? '收回此訊息' : 'Undo this message'}
                disabled={undoDisabled}
                lang={lang}
              />
            )}
            <CopyButton text={m.text} title={lang === 'zh' ? '複製訊息' : 'Copy message'} />
          </div>
        </div>
      </div>
    );
  }
  // m.role === 'sci'
  const showCopy = !typing;
  if (m.conclusion) {
    return (
      <div key={key} className="sci-conclusion">
        <div className="cc-head">
          <SciAvatar id={m.id} accent={m.accent} name={m.name} size={26} onClick={onBio ? () => onBio(m.id) : undefined} />
          <span className="cc-title">{tr.conclusion} · {m.name}</span>
        </div>
        <div className="cc-body">{renderText(m.text)}{typing && <span className="sci-typing" />}</div>
        {showCopy && (
          <div className="sci-msg-actions">
            <CopyButton text={m.text} title={lang === 'zh' ? '複製回覆' : 'Copy reply'} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div key={key} className="sci-msg sci discuss">
      <SciAvatar id={m.id} accent={m.accent} name={m.name} size={30} onClick={onBio ? () => onBio(m.id) : undefined} />
      <div className="sci-bubble-wrap">
        <div className="sci-speaker">{m.name}</div>
        <div className="sci-bubble">{renderText(m.text)}{typing && <span className="sci-typing" />}</div>
        {showCopy && (
          <div className="sci-msg-actions">
            <CopyButton text={m.text} title={lang === 'zh' ? '複製回覆' : 'Copy reply'} />
          </div>
        )}
      </div>
    </div>
  );
}

// Index of the last 'sci' item in a list (used to place the typing cursor).
function lastSciIndex(list) {
  for (let k = list.length - 1; k >= 0; k--) if (list[k].role === 'sci') return k;
  return -1;
}

function DiscussMessages({ messages, tr, lang, streaming, onBio, onUndo }) {
  const lastSci = lastSciIndex(messages);
  const out = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.compare) {
      // A compare-mode turn's direct-lineage roundtable and RAG-lineage
      // roundtable are pushed back-to-back (see sendDiscuss/runDiscussCall),
      // tagged with a shared turnId -- gather that whole contiguous run and
      // split it into two columns rendered side by side, same visual pattern
      // as the single chat's compare rows (.sci-compare-row).
      const turnId = m.turnId;
      const run = [];
      while (i < messages.length && messages[i].compare && messages[i].turnId === turnId) {
        run.push(messages[i]);
        i++;
      }
      const directItems = run.filter((x) => x.mode === 'direct');
      const ragItems = run.filter((x) => x.mode === 'rag');
      const lastDirectSci = lastSciIndex(directItems);
      const lastRagSci = lastSciIndex(ragItems);
      out.push(
        <CompareSwipeRow key={'cmp-' + turnId} className="sci-compare-row-discuss">
          <div className="sci-compare-col">
            <div className="sci-compare-col-label">{tr.replyModeBadgeDirect}</div>
            {directItems.map((mm, k) => renderDiscussItem(mm, 'd' + k, { tr, lang, onBio, typing: streaming && k === lastDirectSci }))}
          </div>
          <div className="sci-compare-col">
            <div className="sci-compare-col-label">{tr.replyModeBadgeRag}</div>
            {ragItems.map((mm, k) => renderDiscussItem(mm, 'r' + k, { tr, lang, onBio, typing: streaming && k === lastRagSci }))}
          </div>
        </CompareSwipeRow>
      );
      continue;
    }
    out.push(renderDiscussItem(m, i, { tr, lang, onBio, onUndo, undoDisabled: streaming, typing: streaming && i === lastSci }));
    i++;
  }
  return out;
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
  onScroll,
  onUndo,
  headRef,
  autoScrollLockRef,
  installedModels, modelOverride, setModelOverride, busy,
  replyMode, setReplyMode,
}) {
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (autoScrollLockRef) autoScrollLockRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { if (autoScrollLockRef) autoScrollLockRef.current = false; });
  }, [messages, streaming]);
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
        <div className="sci-chat-head" ref={headRef}>
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
          <span className="sci-chathead-break-a" aria-hidden="true" />
          <span className="sci-statusdot" title={statusLabel} aria-label={statusLabel}><span className={'sci-dot ' + statusClass} /></span>
          <ModelChip activeModel={activeModel} installedModels={installedModels} modelOverride={modelOverride} setModelOverride={setModelOverride} lang={lang} busy={busy} />
          <ReplyModeChip replyMode={replyMode} setReplyMode={setReplyMode} lang={lang} />
          <span className="sci-chathead-break-b" aria-hidden="true" />
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

        <div className="sci-scroll" ref={scrollRef} onScroll={onScroll}>
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

          <DiscussMessages messages={messages} tr={tr} lang={lang} streaming={streaming} onBio={onBio} onUndo={onUndo} />

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

// Modal list to select a single scientist on mobile (the primary control on mobile,
// where the roster column is hidden).
function SinglePicker({ tr, lang, scientists, selectedId, onSelect, onClose, sortBy, setSortBy, sortOrder, setSortOrder, onBio }) {
  return (
    <div className="sci-modal-backdrop" onClick={onClose}>
      <div className="sci-modal sci-panel-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tr.roster}</h3>
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
        <div className="sci-panel-list">
          {/* Auto-assign option */}
          <button
            className={'sci-panel-item' + (selectedId === AUTO_ID ? ' active' : '')}
            onClick={() => { onSelect(AUTO_ID); onClose(); }}
          >
            <SciAvatar id={AUTO_ID} accent={AUTO_PERSONA.accent} size={34} />
            <span className="who">
              <div className="nm">{nameFor(AUTO_PERSONA, lang)}</div>
              <div className="meta">{fieldsFor(AUTO_PERSONA, lang)}</div>
            </span>
            <span className={'sci-toggle' + (selectedId === AUTO_ID ? ' on' : '')}>
              {selectedId === AUTO_ID && <IconCheck />}
            </span>
          </button>
          
          {scientists.map((s) => {
            const on = s.id === selectedId;
            return (
              <button
                key={s.id}
                className={'sci-panel-item' + (on ? ' active' : '')}
                onClick={() => { onSelect(s.id); onClose(); }}
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
                  <div className="meta">{s.years} · {fieldsFor(s, lang)}</div>
                </span>
                <span className={'sci-toggle' + (on ? ' on' : '')}>
                  {on && <IconCheck />}
                </span>
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

// Asks which lineage of a compare-mode thread (direct / RAG / both, saved
// separately) to keep when "Save" is pressed on a conversation that has any
// compare-mode turns. Shared by the single chat and the Science Dialogue tab.
function SaveCompareModal({ tr, onPick, onClose }) {
  return (
    <div className="sci-modal-backdrop" onClick={onClose}>
      <div className="sci-modal sci-save-choice" onClick={(e) => e.stopPropagation()}>
        <h3>{tr.favCompareTitle}</h3>
        <div className="sci-save-choice-opts">
          <button className="sci-send" onClick={() => onPick('direct')}>{tr.favCompareDirect}</button>
          <button className="sci-send" onClick={() => onPick('rag')}>{tr.favCompareRag}</button>
          <button className="sci-send" onClick={() => onPick('both')}>{tr.favCompareBoth}</button>
        </div>
        <div className="row">
          <button className="sci-iconbtn" onClick={onClose}>{tr.cancel}</button>
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
