/* demo-presets.js — chapter demo "mini-games" shared by the library page and
 * the lab. Each entry is a ready-made lab configuration that showcases one
 * teaching topic; the library renders them as launch buttons per chapter
 * (index.html?demo=<id>) and config.js applies the config on lab boot.
 *
 * Config fields mirror the §06 preset shape (panel-left.jsx): physical mass
 * Msun (solar), dimensionless Q/M and a/M (geometric M = 1), field strength B,
 * central type, optional disc state, overlay flag overrides (sim.flags keys),
 * timescale, and an optional companion for binary demos. Additionally:
 *   bhRegime / smbhStructure — physical mass scale + supermassive structure.
 *   bodies — demo-defined stage (replaces restored bodies; [] = clean scene).
 *   pace — {event, window?, orbits?, r?, post?}: compress the demo clock so
 *          the showcased event ('merger' | 'rlof' | 'disrupt' | 'orbits')
 *          completes in `window` wall seconds (10-30 s), then drop to ×post
 *          slow-motion when it fires. Pure clock compression — the dynamics
 *          stay on the exact GR/Kepler/Peters clock (see KNSim.applyDemoPace).
 * Spatial framing is NOT configured here: every demo queues an auto-fit that
 * frames the real geometric scene for whatever canvas/device renders it.
 */
(function () {
  var DEMOS = {
    // §1 Kerr-Newman spacetime — the full three-parameter hole vs the baseline.
    'kn-full': {
      chapter: 'kn-spacetime',
      label: { en: 'The full Kerr-Newman hole', zh: '完整 Kerr-Newman 黑洞' },
      hint: { en: 'Mass + spin + charge, all layers visible', zh: '質量+自轉+電荷,所有結構層一次看' },
      config: { Msun: 10, Q: 0.47, a: 0.6, B: 0.4,
        flags: { showErgo: true, showHorizon: true, showISCO: true, showPhoton: true },
        pace: { event: 'orbits', orbits: 3, r: 12, window: 20 } },
    },
    'no-hair-baseline': {
      chapter: 'kn-spacetime',
      label: { en: 'Schwarzschild baseline', zh: 'Schwarzschild 基準' },
      hint: { en: 'Turn spin and charge to zero — what remains?', zh: '把自轉與電荷歸零——還剩下什麼?' },
      config: { Msun: 10, Q: 0, a: 0, B: 0,
        flags: { showErgo: true, showHorizon: true, showISCO: true },
        pace: { event: 'orbits', orbits: 3, r: 12, window: 20 } },
    },

    // §2 horizons
    'horizons-merge': {
      chapter: 'horizons',
      label: { en: 'Two horizons, nearly one', zh: '兩層視界,幾乎合而為一' },
      hint: { en: 'Near-extremal spin pushes r- up towards r+', zh: '近極端自轉讓內視界 r- 逼近外視界 r+' },
      config: { Msun: 10, Q: 0, a: 0.97, B: 0.1,
        flags: { showHorizon: true, showErgo: true },
        pace: { event: 'orbits', orbits: 3, r: 8, window: 18 } },
    },
    'naked-singularity': {
      chapter: 'horizons',
      label: { en: 'Over the edge: naked singularity', zh: '越過極限:裸奇異點' },
      hint: { en: 'a² + Q² > M² — the horizons vanish', zh: 'a² + Q² > M²——視界消失' },
      config: { Msun: 5, Q: 1.0, a: 0.8, B: 0,
        flags: { showHorizon: true },
        pace: { event: 'orbits', orbits: 3, r: 8, window: 18 } },
    },

    // §3 ergosphere
    'ergosphere-wide': {
      chapter: 'ergosphere',
      label: { en: 'The widest ergosphere', zh: '最寬的能層' },
      hint: { en: 'High spin bulges the ergosphere at the equator', zh: '高自轉讓能層在赤道最寬' },
      config: { Msun: 10, Q: 0, a: 0.9, B: 0.2,
        flags: { showErgo: true, showHorizon: true, showDragField: false },
        pace: { event: 'orbits', orbits: 3, r: 6, window: 15 } },
    },

    // §4 frame dragging
    'frame-drag-field': {
      chapter: 'frame-dragging',
      label: { en: 'Spacetime whirlpool', zh: '時空漩渦' },
      hint: { en: 'Watch the drag field lines swirl at a/M = 0.95', zh: '在 a/M = 0.95 觀察拖曳場的迴旋' },
      config: { Msun: 10, Q: 0, a: 0.95, B: 0.2,
        flags: { showDragField: true, showErgo: true, showOrbits: true },
        pace: { event: 'orbits', orbits: 4, r: 5, window: 16 } },
    },

    // §5 photon sphere
    'photon-ring': {
      chapter: 'photon-sphere',
      label: { en: 'Where light orbits', zh: '光繞行之處' },
      hint: { en: 'The photon-sphere ring around a spinning hole', zh: '自轉黑洞周圍的光子球環' },
      config: { Msun: 10, Q: 0, a: 0.7, B: 0.1,
        flags: { showPhoton: true, showHorizon: true, showISCO: false },
        pace: { event: 'orbits', orbits: 3, r: 12, window: 20 } },
    },

    // §6 ISCO
    'isco-disc-edge': {
      chapter: 'isco',
      label: { en: 'The disc’s inner edge', zh: '吸積盤的內緣' },
      hint: { en: 'The accretion disc truncates exactly at the ISCO', zh: '吸積盤正好截止於 ISCO' },
      config: { Msun: 10, Q: 0, a: 0.8, B: 0.3, disc: true,
        flags: { showISCO: true, showHorizon: true },
        pace: { event: 'orbits', orbits: 4, r: 2.91, window: 18 } },
    },

    // §7 gravitational redshift
    'redshift-disc': {
      chapter: 'redshift',
      label: { en: 'Light climbing out', zh: '光的爬坡' },
      hint: { en: 'Disc glow reddens near the horizon', zh: '越靠近視界,盤面輝光越紅' },
      config: { Msun: 10, Q: 0, a: 0.9, B: 0.2, disc: true,
        flags: { showISCO: true, showHorizon: true },
        pace: { event: 'orbits', orbits: 4, r: 2.32, window: 15 } },
    },

    // §8 lensing
    'lensing-on': {
      chapter: 'lensing',
      label: { en: 'Gravity bends the sky', zh: '重力折彎星空' },
      hint: { en: 'Toggle GR light-bending over the starfield', zh: '在星空上開啟廣義相對論光偏折' },
      config: { Msun: 10, Q: 0, a: 0.6, B: 0.1,
        flags: { showLensing: true, showHorizon: true, showPhoton: true },
        pace: { event: 'orbits', orbits: 3, r: 12, window: 20 } },
    },

    // §9 tidal forces — a star is dropped on a plunging orbit and shredded at
    // its tidal radius (~3 M) in front of the camera; slow-motion at the snap.
    'tidal-stress': {
      chapter: 'tidal',
      label: { en: 'Spaghettification lab', zh: '義大利麵化實驗' },
      hint: { en: 'A star plunges in and is shredded — drop more yourself', zh: '恆星墜入即被撕裂——也可以自己再丟幾顆' },
      config: { Msun: 5, Q: 0, a: 0.3, B: 0,
        flags: { showTidal: true, showHorizon: true, showOrbits: true },
        bodies: [{ name: 'TDE-01', kind: 'star', radius: 0.6, binding: 5.0,
                   x: 26, y: 0, vx: 0, vy: 0.05 }],
        pace: { event: 'disrupt', window: 16, post: 1 } },
    },

    // §10 accretion disc
    'agn-disc': {
      chapter: 'accretion',
      label: { en: 'Feeding the monster', zh: '餵養巨獸' },
      hint: { en: 'A bright alpha-disc around a heavy, fast-spinning hole', zh: '大質量高自轉黑洞的明亮吸積盤' },
      config: { Msun: 150, Q: 0, a: 0.8, B: 0.75, disc: true,
        flags: { showISCO: true, showHorizon: true },
        pace: { event: 'orbits', orbits: 4, r: 2.91, window: 18 } },
    },
    // NS X-ray binary: a Sun-like donor spirals in until it overflows its
    // Roche lobe onto the neutron star — gas stream, accretion disc, X-ray
    // bursts. The pace watcher drops to slow-motion the moment RLOF ignites.
    'ns-xray-binary': {
      chapter: 'accretion',
      label: { en: 'Neutron-star X-ray binary', zh: '中子星 X 光雙星' },
      hint: { en: 'Roche overflow feeds a disc onto a neutron star', zh: '洛希瓣溢流把吸積盤餵給中子星' },
      config: { Msun: 1.4, type: 'ns', Q: 0, a: 0, B: 0.5,
        flags: { showRoche: true, showOrbits: true, showTidal: false },
        bodies: [],
        binary: { type: 'ms', M2sun: 1.0, d: 56, inspiralRate: 60 },
        pace: { event: 'rlof', window: 16, post: 2 } },
    },

    // §11 jets
    'mhd-jet': {
      chapter: 'jets',
      label: { en: 'Launching a jet', zh: '點燃噴流' },
      hint: { en: 'Spin + strong field + disc = Blandford-Znajek jet', zh: '自轉+強磁場+吸積盤 = BZ 噴流' },
      config: { Msun: 10, Q: 0, a: 0.9, B: 0.9, disc: true,
        flags: { showHorizon: true, showErgo: true },
        pace: { event: 'orbits', orbits: 4, r: 2.32, window: 18 } },
    },

    // §12 gravitational waves — the last ~3000 M of a GW150914-like pair.
    // d = 22 M is the late inspiral: paced so the chirp, merger and ringdown
    // land inside one ~25 s take, then slow-motion for the flash.
    'gw-inspiral': {
      chapter: 'gravitational-waves',
      label: { en: 'A binary spiralling in', zh: '雙星旋近' },
      hint: { en: 'Two black holes, chirping toward merger', zh: '兩顆黑洞,啁啾邁向合併' },
      config: { Msun: 36, Q: 0, a: 0.3, B: 0,
        flags: { showGW: true, showOrbits: true },
        binary: { type: 'bh', M2sun: 29, d: 22 },
        pace: { event: 'merger', window: 25, post: 1 } },
    },
    // Supermassive pair — same GR, colossal clock: each wall second of this
    // demo shows ~45 minutes of real time (the pace log prints the mapping).
    'smbh-merger': {
      chapter: 'gravitational-waves',
      label: { en: 'Supermassive merger', zh: '超大質量黑洞合併' },
      hint: { en: 'Two galactic-core holes complete their coalescence', zh: '兩顆星系核黑洞完成合併' },
      config: { Msun: 4.15e6, Q: 0, a: 0.6, B: 0.2,
        bhRegime: 'supermassive', smbhStructure: 'smbh',
        flags: { showGW: true, showOrbits: true, showHorizon: true },
        bodies: [],
        binary: { type: 'bh', M2sun: 2.6e6, d: 20, a2: 0.5 },
        pace: { event: 'merger', window: 22, post: 1 } },
    },

    // §13 geodesics & orbits
    'geodesic-zoo': {
      chapter: 'geodesics',
      label: { en: 'Orbit zoo', zh: '軌道動物園' },
      hint: { en: 'Precessing rosettes around a spinning hole', zh: '自轉黑洞旁的進動玫瑰線' },
      config: { Msun: 10, Q: 0, a: 0.7, B: 0.1,
        flags: { showOrbits: true, showISCO: true, showHorizon: true },
        pace: { event: 'orbits', orbits: 3, r: 10, window: 20 } },
    },

    // §14 charge
    'rn-charged': {
      chapter: 'charged',
      label: { en: 'The charged hole', zh: '帶電黑洞' },
      hint: { en: 'Q/M = 0.8 reshapes every critical radius', zh: 'Q/M = 0.8 改寫每一個臨界半徑' },
      config: { Msun: 10, Q: 0.8, a: 0, B: 0.1,
        flags: { showHorizon: true, showISCO: true, showPhoton: true },
        pace: { event: 'orbits', orbits: 3, r: 10, window: 20 } },
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
