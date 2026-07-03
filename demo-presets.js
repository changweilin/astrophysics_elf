/* demo-presets.js — chapter demo "mini-games" shared by the library page and
 * the lab. Each entry is a ready-made lab configuration that showcases one
 * teaching topic; the library renders them as launch buttons per chapter
 * (index.html?demo=<id>) and config.js applies the config on lab boot.
 *
 * Config fields mirror the §06 preset shape (panel-left.jsx): physical mass
 * Msun (solar), dimensionless Q/M and a/M (geometric M = 1), field strength B,
 * central type, optional disc state, overlay flag overrides (sim.flags keys),
 * timescale, and an optional companion for binary demos.
 */
(function () {
  var DEMOS = {
    // §1 Kerr-Newman spacetime — the full three-parameter hole vs the baseline.
    'kn-full': {
      chapter: 'kn-spacetime',
      label: { en: 'The full Kerr-Newman hole', zh: '完整 Kerr-Newman 黑洞' },
      hint: { en: 'Mass + spin + charge, all layers visible', zh: '質量+自轉+電荷,所有結構層一次看' },
      config: { Msun: 10, Q: 0.47, a: 0.6, B: 0.4,
        flags: { showErgo: true, showHorizon: true, showISCO: true, showPhoton: true } },
    },
    'no-hair-baseline': {
      chapter: 'kn-spacetime',
      label: { en: 'Schwarzschild baseline', zh: 'Schwarzschild 基準' },
      hint: { en: 'Turn spin and charge to zero — what remains?', zh: '把自轉與電荷歸零——還剩下什麼?' },
      config: { Msun: 10, Q: 0, a: 0, B: 0,
        flags: { showErgo: true, showHorizon: true, showISCO: true } },
    },

    // §2 horizons
    'horizons-merge': {
      chapter: 'horizons',
      label: { en: 'Two horizons, nearly one', zh: '兩層視界,幾乎合而為一' },
      hint: { en: 'Near-extremal spin pushes r- up towards r+', zh: '近極端自轉讓內視界 r- 逼近外視界 r+' },
      config: { Msun: 10, Q: 0, a: 0.97, B: 0.1,
        flags: { showHorizon: true, showErgo: true } },
    },
    'naked-singularity': {
      chapter: 'horizons',
      label: { en: 'Over the edge: naked singularity', zh: '越過極限:裸奇異點' },
      hint: { en: 'a² + Q² > M² — the horizons vanish', zh: 'a² + Q² > M²——視界消失' },
      config: { Msun: 5, Q: 1.0, a: 0.8, B: 0,
        flags: { showHorizon: true } },
    },

    // §3 ergosphere
    'ergosphere-wide': {
      chapter: 'ergosphere',
      label: { en: 'The widest ergosphere', zh: '最寬的能層' },
      hint: { en: 'High spin bulges the ergosphere at the equator', zh: '高自轉讓能層在赤道最寬' },
      config: { Msun: 10, Q: 0, a: 0.9, B: 0.2,
        flags: { showErgo: true, showHorizon: true, showDragField: false } },
    },

    // §4 frame dragging
    'frame-drag-field': {
      chapter: 'frame-dragging',
      label: { en: 'Spacetime whirlpool', zh: '時空漩渦' },
      hint: { en: 'Watch the drag field lines swirl at a/M = 0.95', zh: '在 a/M = 0.95 觀察拖曳場的迴旋' },
      config: { Msun: 10, Q: 0, a: 0.95, B: 0.2,
        flags: { showDragField: true, showErgo: true, showOrbits: true } },
    },

    // §5 photon sphere
    'photon-ring': {
      chapter: 'photon-sphere',
      label: { en: 'Where light orbits', zh: '光繞行之處' },
      hint: { en: 'The photon-sphere ring around a spinning hole', zh: '自轉黑洞周圍的光子球環' },
      config: { Msun: 10, Q: 0, a: 0.7, B: 0.1,
        flags: { showPhoton: true, showHorizon: true, showISCO: false } },
    },

    // §6 ISCO
    'isco-disc-edge': {
      chapter: 'isco',
      label: { en: 'The disc’s inner edge', zh: '吸積盤的內緣' },
      hint: { en: 'The accretion disc truncates exactly at the ISCO', zh: '吸積盤正好截止於 ISCO' },
      config: { Msun: 10, Q: 0, a: 0.8, B: 0.3, disc: true,
        flags: { showISCO: true, showHorizon: true } },
    },

    // §7 gravitational redshift
    'redshift-disc': {
      chapter: 'redshift',
      label: { en: 'Light climbing out', zh: '光的爬坡' },
      hint: { en: 'Disc glow reddens near the horizon', zh: '越靠近視界,盤面輝光越紅' },
      config: { Msun: 10, Q: 0, a: 0.9, B: 0.2, disc: true,
        flags: { showISCO: true, showHorizon: true } },
    },

    // §8 lensing
    'lensing-on': {
      chapter: 'lensing',
      label: { en: 'Gravity bends the sky', zh: '重力折彎星空' },
      hint: { en: 'Toggle GR light-bending over the starfield', zh: '在星空上開啟廣義相對論光偏折' },
      config: { Msun: 10, Q: 0, a: 0.6, B: 0.1,
        flags: { showLensing: true, showHorizon: true, showPhoton: true } },
    },

    // §9 tidal forces
    'tidal-stress': {
      chapter: 'tidal',
      label: { en: 'Spaghettification lab', zh: '義大利麵化實驗' },
      hint: { en: 'Small hole = savage tides; drop a body in', zh: '小黑洞潮汐最兇——丟顆天體進去試試' },
      config: { Msun: 5, Q: 0, a: 0.3, B: 0,
        flags: { showTidal: true, showHorizon: true, showOrbits: true } },
    },

    // §10 accretion disc
    'agn-disc': {
      chapter: 'accretion',
      label: { en: 'Feeding the monster', zh: '餵養巨獸' },
      hint: { en: 'A bright alpha-disc around a heavy, fast-spinning hole', zh: '大質量高自轉黑洞的明亮吸積盤' },
      config: { Msun: 150, Q: 0, a: 0.8, B: 0.75, disc: true,
        flags: { showISCO: true, showHorizon: true } },
    },

    // §11 jets
    'mhd-jet': {
      chapter: 'jets',
      label: { en: 'Launching a jet', zh: '點燃噴流' },
      hint: { en: 'Spin + strong field + disc = Blandford-Znajek jet', zh: '自轉+強磁場+吸積盤 = BZ 噴流' },
      config: { Msun: 10, Q: 0, a: 0.9, B: 0.9, disc: true,
        flags: { showHorizon: true, showErgo: true } },
    },

    // §12 gravitational waves
    'gw-inspiral': {
      chapter: 'gravitational-waves',
      label: { en: 'A binary spiralling in', zh: '雙星旋近' },
      hint: { en: 'Two black holes, chirping toward merger', zh: '兩顆黑洞,啁啾邁向合併' },
      config: { Msun: 36, Q: 0, a: 0.3, B: 0,
        flags: { showGW: true, showOrbits: true },
        binary: { type: 'bh', M2sun: 29, d: 34 } },
    },

    // §13 geodesics & orbits
    'geodesic-zoo': {
      chapter: 'geodesics',
      label: { en: 'Orbit zoo', zh: '軌道動物園' },
      hint: { en: 'Precessing rosettes around a spinning hole', zh: '自轉黑洞旁的進動玫瑰線' },
      config: { Msun: 10, Q: 0, a: 0.7, B: 0.1,
        flags: { showOrbits: true, showISCO: true, showHorizon: true } },
    },

    // §14 charge
    'rn-charged': {
      chapter: 'charged',
      label: { en: 'The charged hole', zh: '帶電黑洞' },
      hint: { en: 'Q/M = 0.8 reshapes every critical radius', zh: 'Q/M = 0.8 改寫每一個臨界半徑' },
      config: { Msun: 10, Q: 0.8, a: 0, B: 0.1,
        flags: { showHorizon: true, showISCO: true, showPhoton: true } },
    },
  };

  // chapter id -> [demo ids], derived once so the library can render per chapter
  var BY_CHAPTER = {};
  Object.keys(DEMOS).forEach(function (id) {
    var ch = DEMOS[id].chapter;
    (BY_CHAPTER[ch] = BY_CHAPTER[ch] || []).push(id);
  });

  window.KN_DEMOS = DEMOS;
  window.KN_CHAPTER_GAMES = BY_CHAPTER;
})();
