/* library-terms.js — glossary that maps the library's technical terms to nodes
 * in the wiki-kb knowledge graph (see kg-view.js / kb-config.js).
 *
 * library.js uses this twice per chapter:
 *   1. every <span class="term"> the content already marks up is turned into a
 *      link that opens the graph view centered on the matching entity;
 *   2. any remaining glossary term found in the chapter's prose is linked on
 *      its FIRST occurrence in that chapter (chapters 11-24 predate the
 *      <span class="term"> convention, so they get their links this way).
 *
 * `qid` is the Wikidata id used as the primary key in wiki-kb (verified against
 * wiki-kb/data/kb.sqlite). Entries without a qid fall back to a label search on
 * /api/entities, so a term is still useful before its entity is crawled.
 *
 * Surface forms are matched after normalisation (lower-cased, parentheticals
 * stripped, dashes unified, trailing plural 's' tried) so "Gravitational
 * lensing", "gravitational lenses" and "重力透鏡（gravitational lensing）" all
 * resolve from the single entry below. Add variants only when normalisation
 * cannot get there on its own.
 *
 * ASCII-only ids/keys (repo guardrail); surface forms are localized.
 */
(function () {
  window.KN_LIB_TERMS = [
    // ---- sky, instruments, history ----
    { qid: 'Q12134', en: ['celestial sphere'], zh: ['天球'] },
    { qid: 'Q31759', en: ['guest star'], zh: ['客星'] },
    { qid: 'Q3937', en: ['supernova', 'supernovae'], zh: ['超新星'] },
    { qid: 'Q165800', en: ['geocentrism', 'geocentric model'], zh: ['地心說'] },
    { qid: 'Q103983', en: ['heliocentrism', 'heliocentric model'], zh: ['日心說'] },
    { qid: 'Q83219', en: ["Kepler's laws", "Kepler's laws of planetary motion"], zh: ['克卜勒定律'] },
    { qid: 'Q134465', en: ['law of universal gravitation'], zh: ['萬有引力定律'] },
    { qid: 'Q166530', en: ['escape velocity'], zh: ['逃逸速度', '逃脫速度'] },
    { qid: 'Q184274', en: ['celestial mechanics'], zh: ['天體力學'] },

    // ---- light and spectra ----
    { qid: 'Q311552', en: ['Fraunhofer lines'], zh: ['Fraunhofer 譜線', '夫朗和斐譜線'] },
    { qid: 'Q483666', en: ['spectroscopy'], zh: ['光譜學'] },
    { qid: 'Q212111', en: ['spectral line'], zh: ['譜線'] },
    { qid: 'Q76436', en: ['Doppler effect'], zh: ['都卜勒效應'] },
    { qid: 'Q3198', en: ['photon'], zh: ['光子'] },
    { qid: 'Q76250', en: ['redshift'], zh: ['紅移'] },
    { qid: 'Q105902', en: ['luminosity'], zh: ['光度'] },
    { qid: 'Q1705752', en: ['relativistic beaming', 'Doppler beaming'], zh: ['相對論性聚束'] },
    { qid: 'Q177625', en: ['electromagnetic field'], zh: ['電磁場'] },

    // ---- stars ----
    { qid: 'Q3450', en: ['main sequence'], zh: ['主序'] },
    { qid: 'Q3270143', en: ['Hertzsprung-Russell diagram', 'HR diagram'], zh: ['赫羅圖'] },
    { qid: 'Q6472', en: ['stellar evolution'], zh: ['恆星演化'] },
    { qid: 'Q13082', en: ['nuclear fusion', 'subatomic energy source'], zh: ['核融合', '次原子能量來源'] },
    { qid: 'Q1057093', en: ['stellar nucleosynthesis'], zh: ['恆星核合成'] },
    { qid: 'Q223073', en: ['proton-proton chain', 'proton-proton chain reaction'], zh: ['質子-質子鏈'] },
    { qid: 'Q222971', en: ['CNO cycle'], zh: ['CNO 循環', '碳氮氧迴圈'] },
    { qid: 'Q904993', en: ['electron degeneracy pressure'], zh: ['電子簡併壓力'] },
    { qid: 'Q5871', en: ['white dwarf'], zh: ['白矮星'] },
    { qid: 'Q51366', en: ['Chandrasekhar limit'], zh: ['錢德拉塞卡極限'] },
    { qid: 'Q4202', en: ['neutron star'], zh: ['中子星'] },
    { qid: 'Q4360', en: ['pulsar'], zh: ['脈衝星'] },
    { qid: 'Q329273', en: ['gravitational collapse'], zh: ['重力塌縮', '引力坍縮'] },
    { qid: 'Q654396', en: ['stellar wind'], zh: ['星風'] },
    { qid: 'Q853005', en: ['Eddington luminosity', 'Eddington limit'], zh: ['愛丁頓光度'] },
    // no crawled entity yet -- searched by label until one exists
    { en: ['quantum tunnelling', 'quantum tunneling'], zh: ['量子穿隧'] },
    { en: ['Coulomb repulsion'], zh: ['庫侖排斥力'] },

    // ---- galaxies and cosmology ----
    { qid: 'Q318', en: ['galaxy', 'galaxies'], zh: ['星系'] },
    { qid: 'Q188593', en: ['Cepheid variable'], zh: ['造父變星'] },
    { qid: 'Q932938', en: ['standard candle'], zh: ['標準燭光'] },
    { qid: 'Q179916', en: ["Hubble's law", 'Hubble-Lemaitre law'], zh: ['哈伯定律'] },
    { qid: 'Q1129469', en: ['expanding universe', 'expansion of the universe'], zh: ['膨脹宇宙'] },
    { qid: 'Q79925', en: ['dark matter'], zh: ['暗物質'] },
    { qid: 'Q18343', en: ['dark energy'], zh: ['暗能量'] },
    { qid: 'Q59151', en: ['cosmological constant'], zh: ['宇宙常數', '宇宙學常數'] },
    { qid: 'Q323', en: ['Big Bang'], zh: ['大霹靂', '大爆炸'] },
    { qid: 'Q15605', en: ['cosmic microwave background'], zh: ['宇宙微波背景'] },
    { qid: 'Q185243', en: ['gravitational lensing', 'gravitational lens'], zh: ['重力透鏡'] },
    { qid: 'Q40392', en: ['supermassive black hole'], zh: ['超大質量黑洞'] },
    { qid: 'Q83373', en: ['quasar'], zh: ['類星體'] },
    { qid: 'Q42294636', en: ['multi-messenger astronomy', 'electromagnetic/optical counterpart'], zh: ['多信使天文學', '光學對應體'] },

    // ---- relativity ----
    { qid: 'Q11455', en: ['special relativity'], zh: ['狹義相對論'] },
    { qid: 'Q11452', en: ['general relativity', 'general theory of relativity'], zh: ['廣義相對論'] },
    { qid: 'Q210546', en: ['equivalence principle'], zh: ['等效原理'] },
    { qid: 'Q757269', en: ['metric tensor', 'tensor calculus'], zh: ['度規張量', '張量微積分'] },
    { qid: 'Q464794', en: ['Minkowski spacetime', 'flat spacetime'], zh: ['閔考斯基時空'] },
    { qid: 'Q5196078', en: ['curved spacetime', 'curved space'], zh: ['彎曲時空', '彎曲空間'] },
    { qid: 'Q213488', en: ['geodesic', 'geodesic curve'], zh: ['測地線'] },
    { qid: 'Q1188682', en: ['gravitational time dilation'], zh: ['時間膨脹'] },
    { qid: 'Q656181', en: ['gravitational redshift'], zh: ['重力紅移', '引力紅移'] },
    { qid: 'Q223325', en: ['tidal force'], zh: ['潮汐力'] },
    { qid: 'Q788017', en: ['spaghettification'], zh: ['麵條化'] },
    { qid: 'Q1200279', en: ['Killing vector field', 'Killing vector'], zh: ['基靈向量場'] },

    // ---- black holes ----
    { qid: 'Q589', en: ['black hole'], zh: ['黑洞'] },
    { qid: 'Q181741', en: ['event horizon'], zh: ['事件視界'] },
    { qid: 'Q72755', en: ['Schwarzschild radius', 'gravitational radius'], zh: ['史瓦西半徑', '重力半徑'] },
    { qid: 'Q742969', en: ['Schwarzschild metric', 'Schwarzschild solution'], zh: ['史瓦西度規'] },
    { qid: 'Q1068747', en: ['Kerr metric', 'Kerr solution'], zh: ['克爾度規'] },
    { qid: 'Q1190600', en: ['Kerr-Newman metric', 'Kerr-Newman solution'], zh: ['克爾-紐曼度規'] },
    { qid: 'Q540664', en: ['Reissner-Nordstrom metric', 'Reissner-Nordstroem metric'], zh: ['萊斯納-諾德斯特洛姆度規'] },
    { qid: 'Q1316152', en: ['charged black hole'], zh: ['帶電黑洞'] },
    { qid: 'Q1376515', en: ['no-hair theorem'], zh: ['無毛定理'] },
    { qid: 'Q656650', en: ['ergosphere'], zh: ['能層'] },
    { qid: 'Q15149343', en: ['frame-dragging', 'frame dragging', 'Lense-Thirring effect'], zh: ['參考系拖曳'] },
    { qid: 'Q2361910', en: ['photon sphere'], zh: ['光子球'] },
    { qid: 'Q25110047', en: ['innermost stable circular orbit', 'ISCO'], zh: ['最內穩定圓軌道'] },
    { qid: 'Q201721', en: ['gravitational singularity', 'singularity'], zh: ['奇異點', '奇點'] },
    { qid: 'Q17105538', en: ['ring singularity'], zh: ['環奇點'] },
    { qid: 'Q285949', en: ['naked singularity'], zh: ['裸奇異點'] },
    { qid: 'Q2470767', en: ['Cauchy horizon', 'inner horizon'], zh: ['柯西視界', '內視界'] },
    { qid: 'Q1876815', en: ['closed timelike curve'], zh: ['封閉類時曲線'] },
    { qid: 'Q616172', en: ['Penrose process'], zh: ['潘羅斯過程'] },
    { qid: 'Q497396', en: ['Hawking radiation'], zh: ['霍金輻射'] },
    { qid: 'Q911284', en: ['black hole thermodynamics'], zh: ['黑洞熱力學'] },
    { qid: 'Q1471710', en: ['black hole information paradox', 'information paradox'], zh: ['黑洞資訊悖論'] },
    { qid: 'Q7544', en: ['wormhole'], zh: ['蟲洞'] },

    // ---- accretion, jets, plasma ----
    { qid: 'Q237604', en: ['accretion disc', 'accretion disk'], zh: ['吸積盤'] },
    { qid: 'Q419978', en: ['accretion'], zh: ['吸積'] },
    { qid: 'Q284657', en: ['relativistic jet', 'astrophysical jet'], zh: ['相對論性噴流', '噴流'] },
    { qid: 'Q4925027', en: ['Blandford-Znajek process', 'Blandford-Znajek mechanism'], zh: ['布蘭德福–日納傑過程'] },
    { qid: 'Q2549249', en: ['magnetohydrodynamics', 'MHD'], zh: ['磁流體力學'] },
    { qid: 'Q15850900', en: ['tidal disruption event'], zh: ['潮汐撕裂事件'] },
    { qid: 'Q5961', en: ['X-ray binary'], zh: ['X射線聯星'] },

    // ---- gravitational waves and observatories ----
    { qid: 'Q190035', en: ['gravitational wave'], zh: ['重力波'] },
    { qid: 'Q2302080', en: ['gravitational-wave detector'], zh: ['重力波偵測器', '重力波探測器'] },
    { qid: 'Q255371', en: ['LIGO', 'Laser Interferometer Gravitational Wave Observatory'], zh: ['雷射干涉引力波天文臺'] },
    { qid: 'Q22683173', en: ['GW150914'], zh: ['GW150914'] },
    { qid: 'Q38080891', en: ['GW170817'], zh: ['GW170817'] },
    { qid: 'Q42266247', en: ['neutron star merger'], zh: ['中子星碰撞'] },
    { qid: 'Q14468623', en: ['kilonova'], zh: ['千新星'] },
    { qid: 'Q3944788', en: ['Event Horizon Telescope', 'EHT'], zh: ['事件視界望遠鏡'] },
    { qid: 'Q1148351', en: ['very-long-baseline interferometry', 'VLBI'], zh: ['特長基線干涉技術', '甚長基線干涉測量'] },
    { qid: 'Q237284', en: ['Sagittarius A*'], zh: ['人馬座A*'] },
    { qid: 'Q332674', en: ['Cygnus X-1'], zh: ['天鵝座X-1'] },
    { qid: 'Q14041', en: ['Messier 87', 'M87'], zh: ['M87'] },
  ];
})();
