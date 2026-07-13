/* library-asks.js — the scientist who closes each chapter of the library.
 *
 * Keyed by chapter id (same ids as window.KN_LIBRARY.chapters, plus
 * 'prologue'), exactly like KN_CHAPTER_GAMES in demo-presets.js. library.js
 * renders the entry as a card at the end of the chapter: the scientist's
 * avatar (/avatars/<id>.png) plus a few follow-up questions they offer the
 * reader. Each question deep-links to the Scientists page
 * (scientists.html?sci=<id>&ask=<question>), which selects that persona and
 * asks the question for the reader.
 *
 * `sci` MUST be an id from scientists-backend/personas/scientists.mjs (ASCII);
 * `name` is duplicated here on purpose so the card renders with no backend
 * running. Questions are written in the scientist's own voice ("ask me...")
 * and stay short enough to fit a chip. en/zh only -- other locales fall back
 * to en, like the rest of the library.
 */
(function () {
  window.KN_LIB_ASKS = {
    prologue: {
      sci: 'sagan', name: { en: 'Carl Sagan', zh: '薩根' },
      qs: [
        { en: 'Why should anyone care about black holes?', zh: '為什麼我們該在乎黑洞？' },
        { en: 'What does it actually feel like to think in curved spacetime?', zh: '用彎曲時空來思考，究竟是什麼感覺？' },
        { en: 'Where should a beginner start with this subject?', zh: '初學者該從哪裡開始學這個主題？' },
      ],
    },

    'ancient-astronomy': {
      sci: 'galileo', name: { en: 'Galileo Galilei', zh: '伽利略' },
      qs: [
        { en: 'How did ancient astronomers predict eclipses without a telescope?', zh: '古代天文學家沒有望遠鏡，怎麼預測日月食？' },
        { en: 'Why did the "perfect unchanging heavens" idea survive so long?', zh: '「完美不變的天穹」這個想法為何能撐這麼久？' },
        { en: 'What did your telescope show that broke Aristotle\'s sky?', zh: '你的望遠鏡看到了什麼，打破了亞里斯多德的天空？' },
      ],
    },

    'copernican-revolution': {
      sci: 'copernicus', name: { en: 'Nicolaus Copernicus', zh: '哥白尼' },
      qs: [
        { en: 'If the Earth moves, why do we not feel it?', zh: '如果地球在動，為什麼我們感覺不到？' },
        { en: 'What made your model better than Ptolemy\'s epicycles?', zh: '你的模型比托勒密的本輪好在哪裡？' },
        { en: 'Why did it take a century for anyone to believe it?', zh: '為什麼隔了一個世紀才有人相信？' },
      ],
    },

    'newtonian-gravity': {
      sci: 'newton', name: { en: 'Isaac Newton', zh: '牛頓' },
      qs: [
        { en: 'How does one law explain both an apple and the Moon?', zh: '同一條定律，怎麼同時解釋蘋果與月亮？' },
        { en: 'Where exactly does Newtonian gravity stop working?', zh: '牛頓重力究竟在哪裡失效？' },
        { en: 'What is escape velocity, in plain words?', zh: '用白話說，逃逸速度是什麼？' },
      ],
    },

    'stellar-spectroscopy': {
      sci: 'cannon', name: { en: 'Annie Jump Cannon', zh: '坎農' },
      qs: [
        { en: 'How can a dark line in a spectrum name an element?', zh: '光譜裡的一條暗線，怎麼認出一種元素？' },
        { en: 'What does a star\'s spectral class actually tell us?', zh: '恆星的光譜分類到底告訴我們什麼？' },
        { en: 'How do we measure a star\'s motion from its light?', zh: '我們怎麼從星光量出恆星的運動？' },
      ],
    },

    'general-relativity': {
      sci: 'einstein', name: { en: 'Albert Einstein', zh: '愛因斯坦' },
      qs: [
        { en: 'Explain the equivalence principle with a thought experiment.', zh: '用一個思想實驗解釋等效原理。' },
        { en: 'What does "spacetime tells matter how to move" really mean?', zh: '「時空告訴物質如何運動」究竟是什麼意思？' },
        { en: 'Why is gravity not a force in your theory?', zh: '在你的理論裡，重力為什麼不是一種力？' },
      ],
    },

    'galaxies-expanding-universe': {
      sci: 'hubble', name: { en: 'Edwin Hubble', zh: '哈伯' },
      qs: [
        { en: 'How did Cepheid variables settle the "island universe" debate?', zh: '造父變星如何解決「島宇宙」之爭？' },
        { en: 'Is the universe expanding into something?', zh: '宇宙是往「什麼東西裡面」膨脹嗎？' },
        { en: 'What does redshift really measure?', zh: '紅移實際上量的是什麼？' },
      ],
    },

    'dark-matter': {
      sci: 'rubin', name: { en: 'Vera Rubin', zh: '魯賓' },
      qs: [
        { en: 'What did flat rotation curves force us to admit?', zh: '平坦的旋轉曲線逼我們承認了什麼？' },
        { en: 'Could modified gravity replace dark matter?', zh: '修改重力理論有可能取代暗物質嗎？' },
        { en: 'How does lensing weigh something we cannot see?', zh: '重力透鏡怎麼秤出看不見的東西？' },
      ],
    },

    'stellar-fusion': {
      sci: 'feynman', name: { en: 'Richard Feynman', zh: '費曼' },
      qs: [
        { en: 'How does quantum tunnelling let the Sun burn at all?', zh: '量子穿隧為何是太陽能夠燃燒的關鍵？' },
        { en: 'Why does fusion stop at iron?', zh: '核融合為什麼停在鐵？' },
        { en: 'What keeps a star from collapsing while it burns?', zh: '恆星燃燒時，是什麼撐住它不塌？' },
      ],
    },

    'stellar-collapse': {
      sci: 'chandrasekhar', name: { en: 'Subrahmanyan Chandrasekhar', zh: '錢德拉塞卡' },
      qs: [
        { en: 'Why is there a maximum mass for a white dwarf?', zh: '白矮星為什麼有質量上限？' },
        { en: 'What decides whether a star ends as a neutron star or a black hole?', zh: '什麼決定一顆恆星最後是中子星還是黑洞？' },
        { en: 'How did the community react to your limit at first?', zh: '當年學界最初怎麼看待你的質量極限？' },
      ],
    },

    'kerr-newman-family': {
      sci: 'thorne', name: { en: 'Kip Thorne', zh: '索恩' },
      qs: [
        { en: 'Why can a black hole only have mass, spin and charge?', zh: '黑洞為什麼只能有質量、自旋與電荷？' },
        { en: 'Are real black holes charged at all?', zh: '真實的黑洞真的帶電嗎？' },
        { en: 'Which member of the family best matches a real black hole?', zh: '這個家族裡，哪一種最接近真實的黑洞？' },
      ],
    },

    'kn-spacetime': {
      sci: 'einstein', name: { en: 'Albert Einstein', zh: '愛因斯坦' },
      qs: [
        { en: 'How should I read a metric like a map?', zh: '該怎麼把度規當成一張地圖來讀？' },
        { en: 'What is the difference between coordinate time and proper time?', zh: '座標時與固有時差在哪裡？' },
        { en: 'Why do a spinning hole\'s coordinates mix space and time?', zh: '旋轉黑洞的座標為何會把空間與時間混在一起？' },
      ],
    },

    horizons: {
      sci: 'hawking', name: { en: 'Stephen Hawking', zh: '霍金' },
      qs: [
        { en: 'What would I actually see falling through a horizon?', zh: '穿過視界時，我實際上會看到什麼？' },
        { en: 'Why does spin shrink the outer horizon?', zh: '自旋為什麼會縮小外視界？' },
        { en: 'Is a horizon a real place or just a coordinate artefact?', zh: '視界是真實的地點，還是座標的假象？' },
      ],
    },

    ergosphere: {
      sci: 'thorne', name: { en: 'Kip Thorne', zh: '索恩' },
      qs: [
        { en: 'Can you really extract energy from a spinning black hole?', zh: '真的能從旋轉黑洞裡抽出能量嗎？' },
        { en: 'Why is standing still impossible inside the ergosphere?', zh: '在能層裡為什麼不可能靜止不動？' },
        { en: 'How much of a hole\'s mass is spin energy?', zh: '黑洞質量中有多少是自旋能量？' },
      ],
    },

    'frame-dragging': {
      sci: 'noether', name: { en: 'Emmy Noether', zh: '諾特' },
      qs: [
        { en: 'Which symmetry gives us conserved energy near a black hole?', zh: '黑洞附近的能量守恆來自哪一個對稱性？' },
        { en: 'Why is angular momentum still conserved if space is dragged?', zh: '若空間被拖曳，角動量為何仍然守恆？' },
        { en: 'What does Gravity Probe B actually measure?', zh: '重力探測器B實際上量到了什麼？' },
      ],
    },

    'photon-sphere': {
      sci: 'maxwell', name: { en: 'James Clerk Maxwell', zh: '馬克士威' },
      qs: [
        { en: 'Why can light orbit but never rest there?', zh: '光為何能繞行光子球，卻無法停留？' },
        { en: 'How does the photon sphere create the black hole\'s shadow?', zh: '光子球如何造出黑洞的陰影？' },
        { en: 'Do prograde and retrograde light orbits differ?', zh: '順行與逆行的光軌道有何不同？' },
      ],
    },

    isco: {
      sci: 'kepler', name: { en: 'Johannes Kepler', zh: '克卜勒' },
      qs: [
        { en: 'Why do stable orbits simply end at the ISCO?', zh: '穩定軌道為什麼會在 ISCO 直接終止？' },
        { en: 'How would my third law fail near a black hole?', zh: '我的第三定律在黑洞附近會如何失效？' },
        { en: 'Why does spin move the last stable orbit inward?', zh: '自旋為何會把最後的穩定軌道往內推？' },
      ],
    },

    redshift: {
      sci: 'hubble', name: { en: 'Edwin Hubble', zh: '哈伯' },
      qs: [
        { en: 'How do I separate gravitational redshift from Doppler shift?', zh: '重力紅移與都卜勒位移該怎麼分開？' },
        { en: 'Why does a clock near a horizon appear to stop?', zh: '視界附近的時鐘為何看起來會停下來？' },
        { en: 'What makes one side of an accretion disc brighter?', zh: '吸積盤的一側為什麼比較亮？' },
      ],
    },

    lensing: {
      sci: 'einstein', name: { en: 'Albert Einstein', zh: '愛因斯坦' },
      qs: [
        { en: 'Why is the light bending twice the Newtonian value?', zh: '光的偏折為何是牛頓值的兩倍？' },
        { en: 'What is an Einstein ring and when do we see one?', zh: '什麼是愛因斯坦環？何時看得到？' },
        { en: 'How does lensing let us see the far side of a disc?', zh: '透鏡效應如何讓我們看見吸積盤的背面？' },
      ],
    },

    tidal: {
      sci: 'newton', name: { en: 'Isaac Newton', zh: '牛頓' },
      qs: [
        { en: 'Why are tides about the gradient, not the strength, of gravity?', zh: '潮汐為何取決於重力的梯度，而不是重力大小？' },
        { en: 'Why is a supermassive black hole gentler at its horizon?', zh: '超大質量黑洞的視界處為何反而比較溫和？' },
        { en: 'What tears a star apart in a tidal disruption event?', zh: '潮汐撕裂事件中，是什麼把恆星撕開？' },
      ],
    },

    accretion: {
      sci: 'zwicky', name: { en: 'Fritz Zwicky', zh: '茲維基' },
      qs: [
        { en: 'Why is accretion the most efficient engine we know?', zh: '吸積為何是我們已知最有效率的引擎？' },
        { en: 'What actually makes gas lose angular momentum and fall in?', zh: '氣體到底怎麼失去角動量、掉進去？' },
        { en: 'Why does an accretion disc glow in X-rays?', zh: '吸積盤為什麼發出 X 射線？' },
      ],
    },

    jets: {
      sci: 'maxwell', name: { en: 'James Clerk Maxwell', zh: '馬克士威' },
      qs: [
        { en: 'How do magnetic fields launch a jet from a black hole?', zh: '磁場如何從黑洞發射出噴流？' },
        { en: 'What is the Blandford-Znajek process, simply put?', zh: '簡單說，布蘭德福–日納傑過程是什麼？' },
        { en: 'Why are jets so straight over such vast distances?', zh: '噴流為何能在極遠距離上維持筆直？' },
      ],
    },

    'gravitational-waves': {
      sci: 'thorne', name: { en: 'Kip Thorne', zh: '索恩' },
      qs: [
        { en: 'What is actually waving in a gravitational wave?', zh: '重力波裡「波動」的到底是什麼？' },
        { en: 'How does LIGO measure a strain smaller than a proton?', zh: 'LIGO 如何量出比質子還小的形變？' },
        { en: 'What can a chirp tell us about the two black holes?', zh: '一段啁啾訊號能告訴我們兩顆黑洞的什麼？' },
      ],
    },

    geodesics: {
      sci: 'noether', name: { en: 'Emmy Noether', zh: '諾特' },
      qs: [
        { en: 'Why is a free-falling path the straightest line available?', zh: '自由落體的路徑為何是「最直」的線？' },
        { en: 'Which conserved quantities make orbits solvable?', zh: '哪些守恆量讓軌道得以求解？' },
        { en: 'What is the Carter constant hiding?', zh: '卡特常數背後藏著什麼？' },
      ],
    },

    charged: {
      sci: 'maxwell', name: { en: 'James Clerk Maxwell', zh: '馬克士威' },
      qs: [
        { en: 'Why can a real black hole never stay charged for long?', zh: '真實黑洞為何無法長時間保持帶電？' },
        { en: 'How does charge change the horizon structure?', zh: '電荷如何改變視界的結構？' },
        { en: 'What happens if charge exceeds the extremal limit?', zh: '若電荷超過極端極限，會發生什麼事？' },
      ],
    },

    'neutron-stars-pulsars': {
      sci: 'bell', name: { en: 'Jocelyn Bell Burnell', zh: '貝爾·伯奈爾' },
      qs: [
        { en: 'How did you know the pulses were not made by people?', zh: '你怎麼判斷那些脈衝不是人為訊號？' },
        { en: 'What holds a neutron star up against gravity?', zh: '是什麼撐住中子星、抵抗重力？' },
        { en: 'How close is a pulsar to becoming a black hole?', zh: '脈衝星距離變成黑洞還有多遠？' },
      ],
    },

    'black-hole-discovery': {
      sci: 'chandrasekhar', name: { en: 'Subrahmanyan Chandrasekhar', zh: '錢德拉塞卡' },
      qs: [
        { en: 'How do we weigh an object we cannot see?', zh: '我們怎麼秤出一個看不見的天體？' },
        { en: 'What made Cygnus X-1 convincing?', zh: '天鵝座X-1 為何具有說服力？' },
        { en: 'When did black holes stop being a mathematical curiosity?', zh: '黑洞是什麼時候不再只是數學上的奇談？' },
      ],
    },

    'big-bang-cmb': {
      sci: 'lemaitre', name: { en: 'Georges Lemaitre', zh: '勒梅特' },
      qs: [
        { en: 'What was the "primeval atom" you proposed?', zh: '你提出的「原始原子」是什麼？' },
        { en: 'Why is the CMB the strongest evidence for a hot beginning?', zh: '宇宙微波背景為何是熾熱起源最強的證據？' },
        { en: 'Did the Big Bang happen somewhere, or everywhere?', zh: '大霹靂發生在某一點，還是到處都是？' },
      ],
    },

    'dark-energy': {
      sci: 'leavitt', name: { en: 'Henrietta Swan Leavitt', zh: '利維特' },
      qs: [
        { en: 'How does a standard candle measure cosmic distance?', zh: '標準燭光怎麼量出宇宙距離？' },
        { en: 'How did supernovae reveal an accelerating universe?', zh: '超新星如何揭露宇宙正在加速膨脹？' },
        { en: 'Is dark energy just the cosmological constant?', zh: '暗能量就只是宇宙常數嗎？' },
      ],
    },

    'multimessenger-astronomy': {
      sci: 'thorne', name: { en: 'Kip Thorne', zh: '索恩' },
      qs: [
        { en: 'What did GW170817 teach us in a single night?', zh: 'GW170817 在一夜之間教了我們什麼？' },
        { en: 'Why do we need gravitational waves AND light?', zh: '為什麼我們同時需要重力波與光？' },
        { en: 'Where do the heavy elements like gold come from?', zh: '像金這樣的重元素從哪裡來？' },
      ],
    },

    'eht-shadow': {
      sci: 'hawking', name: { en: 'Stephen Hawking', zh: '霍金' },
      qs: [
        { en: 'What exactly are we looking at in the EHT image?', zh: '事件視界望遠鏡的影像裡，我們究竟在看什麼？' },
        { en: 'Why is the shadow bigger than the horizon itself?', zh: '陰影為什麼比視界本身還大？' },
        { en: 'What would falsify general relativity in that picture?', zh: '那張影像中的什麼特徵，能推翻廣義相對論？' },
      ],
    },
  };
})();
