/* library-content.js — bilingual content for the Black Hole Lab physics library.
 *
 * Every text node is an { en, zh } pair (en = English, zh = Traditional Chinese,
 * Taiwan). These two are the priority locales; library.js renders English for any
 * other selection. Physics notation (M, Q, a, r+, ISCO, Kerr-Newman, ...) is
 * kept identical across languages, per the repo's i18n convention.
 *
 * ASCII-only identifiers/keys (guardrail). Math uses geometrized units G=c=1,
 * so the gravitational radius GM/c^2 is written simply as M and lengths are in
 * units of M. Diagrams are schematic SVG (muted amber/cyan/violet — never neon).
 *
 * Block grammar is documented in library.js. To finish a stubbed chapter, replace
 * its { stub:... } block with real { p / h / eq / fig / call / list } blocks.
 */
(function () {
  // Concentric equatorial-slice "map" used in the prologue. Matches the lab's
  // top-down theta = pi/2 view: singularity at centre, then inner/outer horizon,
  // ergosphere ring, photon sphere, ISCO, with frame-dragging arrows.
  var MAP_SVG = `
  <svg viewBox="0 0 640 360" role="img" aria-label="Map of the regions around a rotating black hole">
    <g transform="translate(220,180)">
      <circle class="dia-isco" r="150"/>
      <circle class="dia-photon" r="118"/>
      <path class="dia-ergo" d="M0,-86 A86,86 0 1 1 0,86 A86,86 0 1 1 0,-86 Z M0,-58 A58,58 0 1 0 0,58 A58,58 0 1 0 0,-58 Z" fill-rule="evenodd"/>
      <circle class="dia-bh" r="58"/>
      <circle class="dia-horizon" r="58"/>
      <circle class="dia-inner" r="30"/>
      <circle r="2.4" fill="var(--warn)"/>
      <!-- frame-dragging arrows -->
      <path class="dia-arrow" d="M0,-104 A104,104 0 0 1 90,-52" marker-end="url(#ah)"/>
      <path class="dia-arrow" d="M104,0 A104,104 0 0 1 52,90" marker-end="url(#ah)"/>
      <!-- a test body on the ISCO -->
      <circle cx="150" cy="0" r="4" fill="var(--cyan)"/>
    </g>
    <defs>
      <marker id="ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="var(--fg-2)"/>
      </marker>
    </defs>
    <g font-family="var(--mono)">
      <line class="dia-axis" x1="222" y1="180" x2="430" y2="70"/>
      <text class="dia-lbl-accent" x="436" y="60">r&#x208A; &middot; event horizon</text>
      <line class="dia-axis" x1="240" y1="150" x2="430" y2="104"/>
      <text class="dia-lbl-dim" x="436" y="100">r&#x208B; &middot; inner horizon</text>
      <line class="dia-axis" x1="295" y1="120" x2="430" y2="140"/>
      <text class="dia-lbl" x="436" y="144" fill="var(--violet)">ergosphere</text>
      <line class="dia-axis" x1="320" y1="100" x2="430" y2="180"/>
      <text class="dia-lbl" x="436" y="184" fill="var(--magenta)">photon sphere</text>
      <line class="dia-axis" x1="350" y1="92" x2="430" y2="222"/>
      <text class="dia-lbl" x="436" y="226" fill="var(--cyan)">ISCO</text>
      <text class="dia-lbl-dim" x="436" y="262">&#x21BB; frame dragging</text>
      <text class="dia-lbl-dim" x="200" y="186">singularity</text>
    </g>
  </svg>`;

  window.KN_LIBRARY = {
    docTitle: { en: 'Black Hole Lab — Library', zh: '黑洞實驗室 · 圖書館' },

    // ============================ PROLOGUE ============================
    prologue: {
      kicker: {
        en: 'A field guide to the Kerr-Newman Black Hole Laboratory',
        zh: 'Kerr-Newman 黑洞實驗室 · 圖書館',
        ja: 'Kerr-Newman ブラックホール研究室・実地ガイド',
        ko: 'Kerr-Newman 블랙홀 실험실 · 현장 안내서',
        de: 'Ein Feldführer zum Kerr-Newman-Schwarze-Löcher-Labor',
        fr: 'Guide de terrain du laboratoire de trous noirs de Kerr-Newman',
        es: 'Guía de campo del laboratorio de agujeros negros de Kerr-Newman',
        it: 'Guida sul campo al laboratorio sui buchi neri di Kerr-Newman'
      },
      title: {
        en: 'Reading the geometry of a black hole',
        zh: '讀懂黑洞的時空幾何',
        ja: 'ブラックホールの幾何学を読み解く',
        ko: '블랙홀의 기하를 읽다',
        de: 'Die Geometrie eines Schwarzen Lochs lesen',
        fr: 'Lire la géométrie d’un trou noir',
        es: 'Leer la geometría de un agujero negro',
        it: 'Leggere la geometria di un buco nero'
      },
      lede: {
        en: 'This library traces the science of black holes — and the astronomy, physics and cosmology around them — from the first skywatchers to today’s telescopes, then explains, in pictures and a little math, every physical phenomenon you can switch on in the lab. Start here, then read on in order, or jump to any chapter from the index on the right.',
        zh: '這座圖書館追溯黑洞的科學——以及環繞著它的天文學、物理學與宇宙學——從最早的觀天者一路到今日的望遠鏡，接著用圖與少量數學，說明你在實驗室裡能開啟的每一種物理現象。先讀這裡，再依序往下讀，或從右側索引跳到任一章節。',
        ja: 'この入門書は、最初の観天者たちから今日の望遠鏡に至るまで、黒洞の科学——そしてそれを取り巻く天文学・物理学・宇宙論——をたどり、続いて図と少しの数式で、研究室で切り替えられるあらゆる物理現象を解説します。まずここを読み、順番に読み進めるか、右の索引から任意の章へ進んでください。',
        ko: '이 입문서는 최초의 관측자들부터 오늘날의 망원경에 이르기까지 블랙홀의 과학——그리고 그것을 둘러싼 천문학, 물리학, 우주론——을 따라간 뒤, 그림과 약간의 수식으로 실험실에서 켤 수 있는 모든 물리 현상을 설명합니다. 여기서 시작해 순서대로 읽거나, 오른쪽 색인에서 원하는 장으로 이동하세요.',
        de: 'Diese Einführung verfolgt die Wissenschaft der Schwarzen Löcher — und die Astronomie, Physik und Kosmologie um sie herum — von den ersten Himmelsbeobachtern bis zu den Teleskopen von heute, und erklärt dann mit Bildern und etwas Mathematik jedes physikalische Phänomen, das du im Labor einschalten kannst. Beginne hier und lies der Reihe nach weiter, oder springe über das Verzeichnis rechts zu jedem Kapitel.',
        fr: 'Ce guide retrace la science des trous noirs — ainsi que l’astronomie, la physique et la cosmologie qui les entourent — depuis les premiers observateurs du ciel jusqu’aux télescopes d’aujourd’hui, puis explique, en images et avec un peu de mathématiques, chaque phénomène physique que vous pouvez activer dans le laboratoire. Commencez ici, puis poursuivez dans l’ordre, ou accédez à n’importe quel chapitre depuis l’index à droite.',
        es: 'Esta introducción recorre la ciencia de los agujeros negros — y la astronomía, la física y la cosmología que los rodean — desde los primeros observadores del cielo hasta los telescopios actuales, y luego explica, con imágenes y algo de matemáticas, cada fenómeno físico que puedes activar en el laboratorio. Empieza aquí y sigue leyendo en orden, o salta a cualquier capítulo desde el índice de la derecha.',
        it: 'Questa introduzione ripercorre la scienza dei buchi neri — e l’astronomia, la fisica e la cosmologia che li circondano — dai primi osservatori del cielo ai telescopi di oggi, poi spiega, con immagini e un po’ di matematica, ogni fenomeno fisico che puoi attivare nel laboratorio. Comincia qui e prosegui in ordine, oppure salta a qualsiasi capitolo dall’indice a destra.'
      },
      blocks: [
        { p: {
          en: 'The lab simulates a <b>Kerr-Newman black hole</b>: the most general stationary black hole in general relativity. Remarkably, just three numbers describe it completely — its mass, its spin, and its electric charge. This is the <span class="term">no-hair theorem</span>: whatever fell in, the outside geometry remembers only these three.',
          zh: '實驗室模擬的是 <b>Kerr-Newman 黑洞</b>：廣義相對論中最一般的穩態黑洞。令人驚訝的是，只要三個數字就能完整描述它——質量、自轉與電荷。這就是 <span class="term">無毛定理（no-hair theorem）</span>：無論掉進去的是什麼，外部時空只記得這三項。',
          ja: '研究室は<b>Kerr-Newman ブラックホール</b>を再現します。これは一般相対論における最も一般的な定常ブラックホールです。驚くべきことに、わずか三つの数——質量・スピン・電荷——でそれは完全に記述されます。これが<span class="term">無毛定理（no-hair theorem）</span>です。何が落ち込もうとも、外部の幾何はこの三つだけを記憶します。',
          ko: '실험실은 <b>Kerr-Newman 블랙홀</b>을 시뮬레이션합니다. 이는 일반 상대성 이론에서 가장 일반적인 정상(stationary) 블랙홀입니다. 놀랍게도 단 세 개의 수——질량, 스핀, 전하——만으로 완전히 기술됩니다. 이것이 <span class="term">무모(no-hair) 정리</span>입니다. 무엇이 떨어졌든, 바깥의 기하는 이 셋만 기억합니다.',
          de: 'Das Labor simuliert ein <b>Kerr-Newman-Schwarzes-Loch</b>: das allgemeinste stationäre Schwarze Loch der allgemeinen Relativitätstheorie. Bemerkenswerterweise beschreiben es nur drei Zahlen vollständig — Masse, Spin und elektrische Ladung. Das ist das <span class="term">Keine-Haare-Theorem</span>: Was auch hineinfiel, die äußere Geometrie erinnert sich nur an diese drei.',
          fr: 'Le laboratoire simule un <b>trou noir de Kerr-Newman</b> : le trou noir stationnaire le plus général de la relativité générale. Remarquablement, trois nombres seulement le décrivent complètement — sa masse, son spin et sa charge électrique. C’est le <span class="term">théorème de calvitie (no-hair)</span> : quoi qu’il soit tombé dedans, la géométrie extérieure ne retient que ces trois-là.',
          es: 'El laboratorio simula un <b>agujero negro de Kerr-Newman</b>: el agujero negro estacionario más general de la relatividad general. Sorprendentemente, solo tres números lo describen por completo — su masa, su espín y su carga eléctrica. Es el <span class="term">teorema de no pelo (no-hair)</span>: caiga lo que caiga, la geometría exterior solo recuerda estos tres.',
          it: 'Il laboratorio simula un <b>buco nero di Kerr-Newman</b>: il buco nero stazionario più generale della relatività generale. Sorprendentemente, bastano tre numeri a descriverlo completamente — la sua massa, il suo spin e la sua carica elettrica. È il <span class="term">teorema dell’assenza di peli (no-hair)</span>: qualunque cosa vi sia caduta, la geometria esterna ricorda solo questi tre.'
        }},
        { eq: 'M  (mass)        a = J / M  (spin)        Q  (charge)',
          where: {
            en: 'Throughout we use geometrized units G = c = 1, so mass, length and time share one scale. Distances are measured in units of M (the gravitational radius GM/c^2).',
            zh: '全文採幾何化單位 G = c = 1，質量、長度與時間共用同一尺度。距離以 M（重力半徑 GM/c²）為單位量度。',
            ja: '本書では一貫して幾何化単位 G = c = 1 を用い、質量・長さ・時間は同一の尺度を共有します。距離は M（重力半径 GM/c^2）を単位として測ります。',
            ko: '전체에 걸쳐 기하 단위 G = c = 1 을 사용하므로 질량·길이·시간이 하나의 척도를 공유합니다. 거리는 M(중력 반지름 GM/c^2) 단위로 측정합니다.',
            de: 'Durchgehend verwenden wir geometrische Einheiten G = c = 1, sodass Masse, Länge und Zeit eine Skala teilen. Entfernungen werden in Einheiten von M (dem Gravitationsradius GM/c^2) gemessen.',
            fr: 'Partout, nous utilisons des unités géométriques G = c = 1, si bien que masse, longueur et temps partagent une même échelle. Les distances sont mesurées en unités de M (le rayon gravitationnel GM/c^2).',
            es: 'En todo el texto usamos unidades geometrizadas G = c = 1, de modo que masa, longitud y tiempo comparten una escala. Las distancias se miden en unidades de M (el radio gravitacional GM/c^2).',
            it: 'In tutto il testo usiamo unità geometrizzate G = c = 1, così massa, lunghezza e tempo condividono un’unica scala. Le distanze si misurano in unità di M (il raggio gravitazionale GM/c^2).'
          }},
        { p: {
          en: 'Those three numbers sculpt a landscape of nested regions. The map below is an equatorial slice — exactly the top-down view the lab draws. Each ring is a surface where something physical changes: where light can no longer escape, where space itself is dragged around faster than light, where a stable orbit becomes impossible.',
          zh: '這三個數字雕塑出一層層巢狀的區域。下圖是赤道切面——正是實驗室採用的俯視視角。每一圈都是某種物理性質改變的界面：光再也無法逃離之處、空間本身被拖曳得比光還快之處、穩定軌道再也無法存在之處。',
          ja: 'この三つの数が、入れ子状の領域からなる地形を彫り出します。下の地図は赤道面の切片——研究室が描くまさにその俯瞰図です。各リングは物理的な何かが変わる面です。光がもはや逃げられなくなる面、空間そのものが光より速く引きずられる面、安定な軌道が不可能になる面。',
          ko: '이 세 수가 겹겹이 중첩된 영역의 지형을 빚어냅니다. 아래 지도는 적도면 단면——실험실이 그리는 바로 그 위에서 본 모습입니다. 각 고리는 물리적인 무언가가 바뀌는 면입니다. 빛이 더는 탈출할 수 없는 곳, 공간 자체가 빛보다 빠르게 끌려가는 곳, 안정한 궤도가 불가능해지는 곳.',
          de: 'Diese drei Zahlen formen eine Landschaft verschachtelter Regionen. Die Karte unten ist ein Äquatorschnitt — genau die Draufsicht, die das Labor zeichnet. Jeder Ring ist eine Fläche, an der sich etwas Physikalisches ändert: wo Licht nicht mehr entkommen kann, wo der Raum selbst schneller als Licht mitgerissen wird, wo eine stabile Umlaufbahn unmöglich wird.',
          fr: 'Ces trois nombres sculptent un paysage de régions emboîtées. La carte ci-dessous est une coupe équatoriale — exactement la vue de dessus que dessine le laboratoire. Chaque anneau est une surface où quelque chose de physique change : où la lumière ne peut plus s’échapper, où l’espace lui-même est entraîné plus vite que la lumière, où une orbite stable devient impossible.',
          es: 'Esos tres números esculpen un paisaje de regiones anidadas. El mapa de abajo es un corte ecuatorial — exactamente la vista cenital que dibuja el laboratorio. Cada anillo es una superficie donde algo físico cambia: donde la luz ya no puede escapar, donde el propio espacio es arrastrado más rápido que la luz, donde una órbita estable se vuelve imposible.',
          it: 'Quei tre numeri scolpiscono un paesaggio di regioni annidate. La mappa qui sotto è una sezione equatoriale — esattamente la vista dall’alto che disegna il laboratorio. Ogni anello è una superficie dove qualcosa di fisico cambia: dove la luce non può più sfuggire, dove lo spazio stesso viene trascinato più veloce della luce, dove un’orbita stabile diventa impossibile.'
        }},
        { fig: MAP_SVG, cap: {
          en: '<b>The anatomy of a rotating black hole.</b> Equatorial slice (theta = pi/2). Toggle each surface in the lab with HORIZON, ERGO, PHOTON, ISCO and DRAG.',
          zh: '<b>旋轉黑洞的構造。</b>赤道切面（θ = π/2）。在實驗室中可用 HORIZON、ERGO、PHOTON、ISCO、DRAG 開關逐一顯示這些界面。',
          ja: '<b>回転ブラックホールの解剖図。</b>赤道面の切片（θ = π/2）。研究室では HORIZON・ERGO・PHOTON・ISCO・DRAG で各面を切り替えられます。',
          ko: '<b>회전하는 블랙홀의 해부도.</b> 적도면 단면(θ = π/2). 실험실에서 HORIZON, ERGO, PHOTON, ISCO, DRAG 로 각 면을 켜고 끌 수 있습니다.',
          de: '<b>Die Anatomie eines rotierenden Schwarzen Lochs.</b> Äquatorschnitt (theta = pi/2). Schalte jede Fläche im Labor mit HORIZON, ERGO, PHOTON, ISCO und DRAG ein.',
          fr: '<b>L’anatomie d’un trou noir en rotation.</b> Coupe équatoriale (theta = pi/2). Activez chaque surface dans le laboratoire avec HORIZON, ERGO, PHOTON, ISCO et DRAG.',
          es: '<b>La anatomía de un agujero negro en rotación.</b> Corte ecuatorial (theta = pi/2). Activa cada superficie en el laboratorio con HORIZON, ERGO, PHOTON, ISCO y DRAG.',
          it: '<b>L’anatomia di un buco nero rotante.</b> Sezione equatoriale (theta = pi/2). Attiva ogni superficie nel laboratorio con HORIZON, ERGO, PHOTON, ISCO e DRAG.'
        }},
        { h: { en: 'How to use this library', zh: '如何使用本圖書館',
          ja: 'この入門書の読み方', ko: '이 입문서를 읽는 법',
          de: 'Wie man diese Einführung liest', fr: 'Comment lire ce guide',
          es: 'Cómo leer esta introducción', it: 'Come leggere questa introduzione' }},
        { list: [
          { en: '<b>Diagrams are schematic</b> — they show topology and ordering of the surfaces, not exact scale. The live lab computes the real radii from M, Q and a.',
            zh: '<b>圖為示意</b>——呈現各界面的拓樸與先後次序，而非精確比例。實驗室會依 M、Q、a 即時計算真實半徑。',
            ja: '<b>図は概念図です</b>——面の位相と順序を示すもので、正確な縮尺ではありません。実際の半径は研究室が M・Q・a から計算します。',
            ko: '<b>그림은 개념도입니다</b>——면의 위상과 순서를 보여 줄 뿐 정확한 축척은 아닙니다. 실제 반지름은 실험실이 M, Q, a 로부터 계산합니다.',
            de: '<b>Diagramme sind schematisch</b> — sie zeigen Topologie und Reihenfolge der Flächen, nicht den genauen Maßstab. Die realen Radien berechnet das Labor aus M, Q und a.',
            fr: '<b>Les schémas sont indicatifs</b> — ils montrent la topologie et l’ordre des surfaces, pas l’échelle exacte. Le laboratoire calcule les rayons réels à partir de M, Q et a.',
            es: '<b>Los diagramas son esquemáticos</b> — muestran la topología y el orden de las superficies, no la escala exacta. El laboratorio calcula los radios reales a partir de M, Q y a.',
            it: '<b>I diagrammi sono schematici</b> — mostrano topologia e ordine delle superfici, non la scala esatta. Il laboratorio calcola i raggi reali da M, Q e a.' },
          { en: 'Chapters that cover a phenomenon the simulator can show end with a <span class="term">TRY IT IN THE LAB</span> box pointing to the exact toggle or control that demonstrates it; earlier chapters, on the history of astronomy and cosmology, do not.',
            zh: '凡涵蓋模擬器能呈現之現象的章節，結尾都有 <span class="term">在實驗室中試試</span> 方塊，指出能演示該現象的開關或控制項；較前面談天文學與宇宙學史的章節則沒有。',
            ja: 'シミュレーターで再現できる現象を扱う章の終わりには <span class="term">研究室で試そう</span> の囲みがあり、それを実演する正確なトグルや操作を示します。天文学・宇宙論の歴史を扱う前半の章にはありません。',
            ko: '시뮬레이터로 재현할 수 있는 현상을 다루는 장의 끝에는 <span class="term">실험실에서 해보기</span> 상자가 있어, 그것을 보여 주는 정확한 토글이나 컨트롤을 알려 줍니다. 천문학·우주론의 역사를 다루는 앞부분의 장에는 없습니다.',
            de: 'Kapitel, die ein vom Simulator darstellbares Phänomen behandeln, enden mit einem Kasten <span class="term">IM LABOR AUSPROBIEREN</span>, der auf den genauen Schalter oder die Steuerung verweist; die früheren Kapitel zur Geschichte der Astronomie und Kosmologie tun das nicht.',
            fr: 'Les chapitres traitant d’un phénomène que le simulateur peut afficher se terminent par un encadré <span class="term">À ESSAYER DANS LE LABORATOIRE</span> indiquant le bouton ou la commande exacte qui l’illustre ; les chapitres précédents, consacrés à l’histoire de l’astronomie et de la cosmologie, n’en ont pas.',
            es: 'Los capítulos que tratan un fenómeno que el simulador puede mostrar terminan con un recuadro <span class="term">PRUÉBALO EN EL LABORATORIO</span> que señala el interruptor o control exacto que lo demuestra; los capítulos anteriores, sobre la historia de la astronomía y la cosmología, no lo tienen.',
            it: 'I capitoli che trattano un fenomeno mostrabile dal simulatore terminano con un riquadro <span class="term">PROVALO IN LABORATORIO</span> che indica l’interruttore o il comando esatto che lo dimostra; i capitoli precedenti, sulla storia dell’astronomia e della cosmologia, non lo hanno.' },
          { en: 'Equations are written in plain notation; you never need them to use the lab, but they show <i>why</i> the pictures look the way they do.',
            zh: '方程式以淺顯記法書寫；使用實驗室完全用不到它們，但它們能說明圖像<i>為何</i>是這個樣子。',
            ja: '数式は平易な記法で書かれています。研究室を使うのに数式は不要ですが、図が<i>なぜ</i>そう見えるのかを示してくれます。',
            ko: '수식은 쉬운 표기로 적혀 있습니다. 실험실을 쓰는 데 수식은 전혀 필요 없지만, 그림이 <i>왜</i> 그렇게 보이는지를 보여 줍니다.',
            de: 'Gleichungen sind in einfacher Notation geschrieben; du brauchst sie nie, um das Labor zu nutzen, aber sie zeigen, <i>warum</i> die Bilder so aussehen.',
            fr: 'Les équations sont écrites en notation simple ; elles ne sont jamais nécessaires pour utiliser le laboratoire, mais elles montrent <i>pourquoi</i> les images sont ainsi.',
            es: 'Las ecuaciones se escriben en notación sencilla; nunca las necesitas para usar el laboratorio, pero muestran <i>por qué</i> las imágenes se ven así.',
            it: 'Le equazioni sono scritte in notazione semplice; non servono mai per usare il laboratorio, ma mostrano <i>perché</i> le immagini appaiono così.' }
        ]},
        { call: 'key',
          title: { en: 'Where to start', zh: '從哪裡開始', ja: 'どこから始めるか', ko: '어디서 시작할까',
                   de: 'Wo anfangen', fr: 'Par où commencer', es: 'Por dónde empezar', it: 'Da dove iniziare' },
          body: {
          en: 'If you read only three chapters, read <b>“Spacetime and the three parameters”</b>, <b>“The event horizon”</b>, and <b>“The innermost stable circular orbit”</b> in the Kerr-Newman deep dive — together they explain most of what you see moving on screen. If you have time for more, start the whole library from the beginning: the history makes the physics click.',
          zh: '若只讀三章，請在 Kerr-Newman 深入篇章中讀<b>「時空與三個參數」</b>、<b>「事件視界」</b>與<b>「最內穩定圓軌道」</b>——三者合起來就能解釋畫面上大部分的運動。若還有餘裕，不妨從頭讀起整座圖書館：先懂歷史，物理才會豁然開朗。',
          ja: '三章だけ読むなら、Kerr-Newman 深掘り章のうち<b>「時空と三つのパラメータ」</b>・<b>「事象の地平面」</b>・<b>「最内安定円軌道」</b>を。これらで画面上の動きの大半を説明できます。余裕があれば図書館全体を最初から読むのがおすすめです——歴史を知ると物理がすっと腑に落ちます。',
          ko: '세 장만 읽는다면 Kerr-Newman 심화 장 중 <b>「시공간과 세 매개변수」</b>, <b>「사건의 지평선」</b>, <b>「최내부 안정 원궤도」</b>를 읽으세요. 이들만으로 화면에서 움직이는 것 대부분을 설명할 수 있습니다. 여유가 있다면 도서관 전체를 처음부터 읽어 보세요——역사를 알면 물리가 훨씬 잘 와닿습니다.',
          de: 'Wenn du nur drei Kapitel liest, lies aus dem Kerr-Newman-Tiefgang <b>„Die Raumzeit und die drei Parameter“</b>, <b>„Der Ereignishorizont“</b> und <b>„Die innerste stabile Kreisbahn“</b> — zusammen erklären sie das meiste, was du dich auf dem Bildschirm bewegen siehst. Wenn du Zeit für mehr hast: Beginne die ganze Bibliothek von vorne — die Geschichte macht die Physik verständlicher.',
          fr: 'Si vous ne lisez que trois chapitres, lisez, dans l’approfondissement Kerr-Newman, <b>«L’espace-temps et les trois paramètres»</b>, <b>«L’horizon des événements»</b> et <b>«L’orbite circulaire stable la plus interne»</b> — ensemble, ils expliquent l’essentiel de ce que vous voyez bouger à l’écran. Si vous avez le temps, commencez toute la bibliothèque depuis le début : l’histoire rend la physique plus claire.',
          es: 'Si solo lees tres capítulos, lee, dentro del recorrido a fondo de Kerr-Newman, <b>«El espacio-tiempo y los tres parámetros»</b>, <b>«El horizonte de sucesos»</b> y <b>«La órbita circular estable más interna»</b> — juntos explican casi todo lo que ves moverse en pantalla. Si tienes tiempo para más, empieza toda la biblioteca desde el principio: la historia hace que la física encaje.',
          it: 'Se leggi solo tre capitoli, leggi, all’interno dell’approfondimento su Kerr-Newman, <b>«Lo spaziotempo e i tre parametri»</b>, <b>«L’orizzonte degli eventi»</b> e <b>«L’orbita circolare stabile più interna»</b> — insieme spiegano gran parte di ciò che vedi muoversi sullo schermo. Se hai tempo per di più, comincia l’intera biblioteca dall’inizio: la storia rende la fisica più chiara.'
        }}
      ]
    },

    // ============================ CHAPTERS ============================
    chapters: [
      // ---- 1. Ancient skywatchers and the celestial sphere ----
      {
        id: "ancient-astronomy", no: 1,
        kicker: { en: "ancient skies", zh: "古代星空" },
        title: { en: "Ancient skywatchers and the celestial sphere", zh: "古代觀天者與天球" },
        sub: { en: "Long before anyone had a telescope, careful eyes and patient centuries turned the night sky into humanity's first dataset.", zh: "早在望遠鏡發明之前，敏銳的雙眼與耐心累積的世紀，早已把夜空變成人類最早的一組資料。" },
        blocks: [
          { p: {
            en: "Before telescopes, before writing itself in some places, human beings were already astronomers. The night sky was the first shared laboratory: no instrument needed, only patience, a clear horizon, and enough generations willing to write down what they saw. Every culture that kept records found the same thing — the stars move together in fixed patterns, while a handful of lights wander against that backdrop, tracing loops and retreats that demanded explanation. To make sense of it, early observers pictured the whole night sky as a vast dome enclosing the Earth — the <span class=\"term\">celestial sphere</span> — with the stars fixed to its inside and everything else moving against that fixed backdrop.",
            zh: "望遠鏡發明之前，甚至在某些地方文字發明之前，人類就已經是天文學家了。夜空是人類共同的第一座實驗室：不需要儀器，只需要耐心、開闊的地平線，以及願意把觀測記錄下來、代代相傳的人。凡是留下觀測紀錄的文明，都發現同一件事——星星彼此以固定的形態一起移動，而少數幾個光點卻在這個背景上遊走，畫出迴圈與倒退的軌跡，需要解釋。為了理解這一切，早期觀測者把整片夜空想像成一個包覆地球的巨大穹頂——<span class=\"term\">天球</span>——星星固定在穹頂內側，其餘一切則相對這個固定背景移動。"
          }},
          { p: {
            en: "The most disciplined record-keepers were in Mesopotamia. Babylonian priest-astronomers tracked the sky for centuries, compiling their observations into star catalogues such as MUL.APIN, first compiled around 1000 BCE. These were not casual notes — they spanned enough time, and enough precision, to reveal the roughly 18-year cycle of lunar eclipses and the repeating periods of the visible planets. Once a pattern repeats reliably, it can be predicted. Babylon turned the sky from a source of omens into a subject of arithmetic.",
            zh: "最有紀律的觀測紀錄來自美索不達米亞。巴比倫的祭司天文學家連續數百年追蹤天象，將觀測彙整成星表，例如約成書於西元前1000年的《MUL.APIN》星表。這些不是隨手的筆記——時間跨度夠長、精確度夠高，足以揭露月食大約每18年一次的循環週期，以及肉眼可見行星的重複週期。一旦某個型態能可靠地重複出現，它就能被預測。巴比倫把天空從占卜的來源，轉變成算術的對象。"
          }},
          { p: {
            en: "Chinese court astronomers kept an equally long watch, and their specialty was the sky's exceptions. For two millennia, imperial records logged <span class=\"term\">guest stars</span> — points of light that appeared where none had been before, brightened, and then faded. The most famous entry is from 1054 CE, in the Song dynasty: a guest star that blazed bright enough to see in daylight for 23 days before slowly dimming from view. Modern astronomers have identified it as a <span class=\"term\">supernova</span> — the explosive death of a star — whose expanding wreckage is now visible as the Crab Nebula.",
            zh: "中國歷代的司天官同樣維持了長達千年的觀測，而他們的專長是天空中的例外事件。兩千年間，歷朝官方紀錄不斷記下<span class=\"term\">客星</span>——原本沒有光點的位置突然出現亮光，先變亮、再轉暗、最終消失。其中最著名的一筆紀錄來自西元1054年的宋代：一顆客星亮到在白晝都能看見，持續23天之後才緩緩黯淡。現代天文學家已確認那正是一次<span class=\"term\">超新星</span>——恆星爆炸性死亡的事件——其膨脹中的殘骸如今仍可見，就是蟹狀星雲。"
          }},
          { h: { en: "A perfect, unchanging heaven", zh: "完美不變的天穹" } },
          { p: {
            en: "Greek philosophy took the sky in a very different direction — toward geometry and permanence. In the 4th century BCE, Aristotle described the heavens as a nested set of perfect, unchanging crystalline spheres carrying the Moon, Sun, planets, and stars around a stationary Earth: an idea now called <span class=\"term\">geocentrism</span>. If the heavens truly were perfect and unchanging, then a new light appearing where nothing had been — a Chinese guest star, a comet — should have been impossible. For more than a thousand years, Aristotle's authority made such events a philosophical embarrassment rather than a discovery.",
            zh: "希臘哲學把天空帶向截然不同的方向——幾何與永恆不變。西元前4世紀，亞里斯多德描述天穹是一層層完美、不變的水晶球殼，分別承載月球、太陽、行星與恆星，環繞靜止不動的地球運行，這個想法如今稱為<span class=\"term\">地心說</span>。如果天穹真的完美不變，那麼在原本空無一物之處出現新的光點——無論是中國記錄的客星還是彗星——理應是不可能的事。在一千多年間，亞里斯多德的權威使這類事件成了哲學上的尷尬，而不是一項發現。"
          }},
          { p: {
            en: "Greek astronomy's technical peak came with Claudius Ptolemy, working in Alexandria around 150 CE. His treatise the <i>Almagest</i> kept Earth at the center but added machinery to match what was actually observed: each planet rode a small circle, an epicycle, whose center itself moved along a larger circle, a deferent, around Earth. The geometry was wrong about what orbited what, but the arithmetic worked — the <i>Almagest</i> predicted planetary positions accurately enough to remain the working standard for over a thousand years.",
            zh: "希臘天文學的技術巔峰出現在托勒密（Claudius Ptolemy）身上，他約於西元150年在亞歷山卓完成論著《天文學大成》（<i>Almagest</i>）。書中仍以地球為中心，但加入了一套幾何機制來配合實際觀測：每顆行星沿著一個小圓（本輪）運行，而小圓的圓心又沿著繞地球的大圓（均輪）移動。這套幾何在「究竟誰繞誰轉」這件事上是錯的，但算出來的結果卻管用——《Almagest》預測行星位置的準確度，足以讓它作為天文學的標準工具沿用超過一千年。"
          }},
          { list: [
            { en: "c. 1000 BCE — Babylonian astronomers compile the MUL.APIN star catalogue, systematic enough to predict eclipse and planetary cycles.", zh: "約西元前1000年——巴比倫天文學家彙整《MUL.APIN》星表，觀測系統化到足以預測日月食與行星週期。" },
            { en: "4th century BCE — Aristotle describes the heavens as perfect, unchanging crystalline spheres around a stationary Earth.", zh: "西元前4世紀——亞里斯多德將天穹描述為環繞靜止地球、一層層完美不變的水晶球殼。" },
            { en: "c. 150 CE — Ptolemy's Almagest formalizes a geocentric model of deferents and epicycles that will stand for over a millennium.", zh: "約西元150年——托勒密的《Almagest》將地心說系統化為本輪與均輪的幾何模型，此後沿用超過千年。" },
            { en: "1054 CE — Song-dynasty astronomers record a guest star visible in daylight for 23 days; it is the supernova that made the Crab Nebula.", zh: "西元1054年——宋代天文官記錄一顆客星在白晝可見長達23天；後世確認那正是造就蟹狀星雲的超新星。" }
          ]},
          { call: 'key', title: { en: "The sky as evidence", zh: "天空即證據" }, body: {
            en: "Long before anyone had a correct model of the solar system, ancient astronomers were already doing real science: keeping systematic records, noticing when the pattern broke, and building models precise enough to predict what would happen next. Ptolemy's geometry was wrong about the center of the universe, but the discipline behind it — patient observation checked against prediction — is the same discipline that will eventually overturn it. That overturning, and the slow return of the Sun to the center of the picture, is where the story goes next.",
            zh: "早在任何人擁有正確的太陽系模型之前，古代天文學家就已經在做真正的科學：系統性地記錄觀測、留意型態何時被打破、並建構出準確到足以預測未來的模型。托勒密的幾何學在「宇宙中心是什麼」這件事上是錯的，但支撐這套幾何學的紀律——耐心觀測、並用預測加以檢驗——正是日後推翻它的同一套紀律。那場推翻，以及太陽緩緩回到宇宙中心位置的過程，就是這個故事接下來的方向。"
          }}
        ]
      },

      // ---- 2. The Copernican Revolution ----
      {
        id: "copernican-revolution", no: 2,
        kicker: { en: "a moving earth", zh: "會動的地球" },
        title: { en: "The Copernican Revolution", zh: "哥白尼革命" },
        sub: { en: "For fourteen centuries the Earth had stood still at the center of the universe — then a canon, an observatory, and a spyglass took it apart.", zh: "地球在宇宙中心靜止不動長達十四個世紀——直到一位教士、一座天文台，以及一支望遠鏡，將這幅圖像徹底拆解。" },
        blocks: [
          { p: {
            en: "For fourteen centuries after Ptolemy, the Earth sat motionless at the center of the cosmos, with the Sun, Moon, planets, and stars carried around it on a nest of circles. Astronomers called that Earth-centered picture <span class=\"term\">geocentrism</span>, and it was not stupid — with enough small circles added on top of the big ones, it predicted eclipses and planetary positions well enough to run a calendar. But the patches kept accumulating, circle upon circle, until the whole apparatus groaned under its own complexity.",
            zh: "自托勒密（Ptolemy）之後，地球在宇宙中心靜止不動長達十四個世紀，太陽、月亮、行星與恆星都被一層層圓圈帶著繞地球運行。天文學家稱這種以地球為中心的圖像為<span class=\"term\">地心說</span>（geocentrism），而它並不愚蠢——只要在大圓上疊加足夠多的小圓，就能相當準確地預測日食與行星位置，足以編製曆法。但補丁不斷堆疊，一圈套著一圈，整套系統終究在自身的複雜性下顯得搖搖欲墜。"
          }},
          { p: {
            en: "Nicolaus Copernicus spent decades reworking that geometry in near-secrecy, moving the Sun to the center and setting the Earth spinning among the other planets — a <span class=\"term\">heliocentrism</span> he was in no hurry to publish. He circulated the idea in manuscript for years before finally letting it into print: <i>De revolutionibus orbium coelestium</i> appeared in 1543, and legend holds that Copernicus saw a bound copy for the first time only on his deathbed. The book did not banish complexity — his planets still moved on perfect circles, so he still needed small circles layered on the big ones to match observation — but it moved the center of the universe, and nothing that came after could simply un-think that.",
            zh: "尼古拉·哥白尼（Nicolaus Copernicus）花了數十年時間，幾乎是秘密地重新設計這套幾何——把太陽移到中心，讓地球和其他行星一起繞著它轉，這就是他遲遲不敢付印的<span class=\"term\">日心說</span>（heliocentrism）。他讓這個想法以手稿形式流傳多年，才終於將其付梓：《天體運行論》（<i>De revolutionibus orbium coelestium</i>）於1543年出版，據傳哥白尼直到臨終前才第一次見到裝訂成冊的印本。這本書並未消除複雜性——他的行星依然沿完美圓形運行，因此仍需在大圓上疊加小圓才能吻合觀測——但它挪動了宇宙的中心，而此後再也沒有人能將這個念頭收回。"
          }},
          { p: {
            en: "The next leap came not from theory but from measurement. Tycho Brahe built an observatory-fortress called Uraniborg and, working without a telescope — none existed yet — recorded planetary positions with a precision no one had achieved before or would need to surpass for another half-century. Tycho himself never accepted a moving Earth; he proposed a hybrid model with the planets circling the Sun and the Sun circling a still-central Earth. But his real legacy was not a cosmology. It was two decades of numbers, accurate to a fraction of a degree, waiting for someone who could read what they meant.",
            zh: "下一次躍進並非來自理論，而是來自測量。第谷·布拉赫（Tycho Brahe）建造了名為烏拉尼堡（Uraniborg）的天文台要塞，在望遠鏡尚未問世的年代，以前所未有、此後半個世紀內也無人超越的精度記錄行星位置。第谷本人始終不接受地球會動的說法；他提出一種折衷模型，讓行星繞太陽運行，而太陽再繞靜止不動的地球運行。但他真正留下的遺產不是宇宙論，而是二十年份、精確到不到一度的數據，等待著能讀懂其中含義的人。"
          }},
          { p: {
            en: "That reader was Johannes Kepler, who inherited Tycho's data and refused to force it into circles. Wrestling for years with the orbit of Mars — which stubbornly would not close into a perfect circle no matter how Kepler adjusted it — he found the shape that fit: an ellipse, with the Sun sitting not at the center but at one focus. He published that result and a second law relating orbital speed to distance from the Sun in <i>Astronomia Nova</i> (1609), then added a third law linking orbital period to orbital size in <i>Harmonices Mundi</i> (1619). Together, <span class=\"term\">Kepler's laws</span> were the first description of the planets that needed no epicycles, no equants, no patchwork at all — just three clean rules and an ellipse.",
            zh: "那位讀懂數據的人是約翰尼斯·克卜勒（Johannes Kepler），他繼承了第谷的數據，並拒絕硬將其套入圓形軌道。他花了數年時間與火星的軌道纏鬥——無論怎麼調整，它都固執地無法收斂成一個完美的圓——最終找到了真正吻合的形狀：橢圓，而太陽不在中心，而在其中一個焦點上。他在《新天文學》（<i>Astronomia Nova</i>，1609年）中發表了這項結果，以及描述公轉速度與日距關係的第二定律；接著又在《世界的和諧》（<i>Harmonices Mundi</i>，1619年）中提出連結公轉週期與軌道大小的第三定律。三條<span class=\"term\">克卜勒定律</span>（Kepler's laws）合在一起，首次不需要本輪、不需要偏心勻速點，完全不需要任何拼補——只需要三條簡潔的規則，和一個橢圓。"
          }},
          { p: {
            en: "While Kepler was refitting the mathematics, Galileo Galilei was dismantling the philosophy. In the winter of 1609-1610 he turned a new instrument — the telescope — on the sky and published what he saw in <i>Sidereus Nuncius</i> (1610): four moons circling Jupiter, proof that not everything in the heavens orbited the Earth; the phases of Venus, which only made sense if Venus orbited the Sun; and mountains and craters scarring the supposedly perfect face of the Moon. None of it was a mathematical proof that the Earth moved. All of it was direct, first-hand evidence that the old, perfect, Earth-centered heavens simply did not match what a person could now see with their own eyes.",
            zh: "當克卜勒重新打造數學工具的同時，伽利略·伽利萊（Galileo Galilei）正在拆解舊有的哲學基礎。1609年至1610年之交的冬天，他將一項新儀器——望遠鏡——指向天空，並在《星際信使》（<i>Sidereus Nuncius</i>，1610年）中發表所見：四顆繞木星運行的衛星，證明天上並非一切都繞著地球轉；金星的盈虧相位，唯有金星繞太陽運行才能解釋；以及月球表面遍布山脈與坑洞，打破了「天界完美無瑕」的舊有信念。這些都不是地球會動的數學證明，卻都是直接、第一手的證據，說明那個古老、完美、以地球為中心的天界，已經無法與人們親眼所見的景象相符。"
          }},
          { list: [
            { en: "1543 — Copernicus publishes De revolutionibus, moving the Sun to the center of the cosmos.", zh: "1543年——哥白尼出版《天體運行論》，將太陽移至宇宙中心。" },
            { en: "Late 1500s — Tycho Brahe, at his observatory Uraniborg, compiles the most precise naked-eye planetary data ever recorded.", zh: "1500年代晚期——第谷·布拉赫在烏拉尼堡天文台，彙編出史上最精確的裸眼行星觀測數據。" },
            { en: "1609 — Kepler's Astronomia Nova gives orbits their true shape: ellipses, not circles.", zh: "1609年——克卜勒的《新天文學》給出軌道的真實形狀：橢圓，而非圓形。" },
            { en: "1609-1610 — Galileo turns a telescope on the sky and publishes Sidereus Nuncius: moons of Jupiter, phases of Venus, mountains on the Moon.", zh: "1609至1610年——伽利略將望遠鏡指向天空，出版《星際信使》：木星的衛星、金星的相位、月球上的山脈。" },
            { en: "1619 — Kepler's Harmonices Mundi adds a third law, linking a planet's period to its distance from the Sun.", zh: "1619年——克卜勒的《世界的和諧》提出第三定律，連結行星公轉週期與其距日距離。" }
          ]},
          { eq: "T² / a³ = constant",
            where: {
              en: "T is a planet's orbital period and a is the size of its orbit (semi-major axis); the ratio is the same for every planet orbiting the same star.",
              zh: "T 為行星的公轉週期，a 為其軌道大小（半長軸）；對繞行同一顆恆星的每顆行星而言，這個比值都相同。"
            }},
          { call: 'key', title: { en: "From shapes to a cause", zh: "從形狀到成因" }, body: {
            en: "Copernicus, Tycho, Kepler, and Galileo did not explain why the planets move the way they do — they only nailed down, with increasing precision, exactly how they move: on ellipses, faster near the Sun, tracing out that same T²/a³ ratio for every world in the solar system. That pattern was a standing invitation for a cause. It would take Isaac Newton, publishing his law of universal gravitation in 1687 — nearly seven decades after Kepler's third law — to show that a single force, falling off with the square of distance, could produce every one of Kepler's ellipses at once.",
            zh: "哥白尼、第谷、克卜勒與伽利略並未解釋行星為何如此運行——他們只是以越來越高的精確度，確立了行星究竟如何運行：沿著橢圓軌道，在靠近太陽時加快速度，並且太陽系中每個天體都遵循相同的 T²/a³ 比值。這個規律形同一份公開邀請，等待有人找出背後的成因。在克卜勒提出第三定律近七十年後，牛頓於1687年發表他的萬有引力定律，證明單一一種隨距離平方遞減的力，就能同時產生克卜勒所有的橢圓軌道。"
          }}
        ]
      },

      // ---- 3. Newton's Law of Universal Gravitation ----
      {
        id: "newtonian-gravity", no: 3,
        kicker: { en: "classical gravity", zh: "古典重力" },
        title: { en: "Newton's Law of Universal Gravitation", zh: "牛頓萬有引力定律" },
        sub: { en: "One equation ties a falling apple to the orbit of the Moon — and, a century later, hints at a star so dense not even light escapes.", zh: "一條方程式，把墜落的蘋果與月球的軌道繫在一起——一個世紀後，它甚至暗示了一顆連光都無法逃脫的緻密星。" },
        blocks: [
          { p: {
            en: "In 1687 Isaac Newton published the <i>Philosophiae Naturalis Principia Mathematica</i> — three volumes that did something no one before him had managed: they showed that the same force pulling an apple to the ground also holds the Moon in its orbit and steers every planet around the Sun. Heaven and Earth, until then two separate physics, became one.",
            zh: "1687年，牛頓（Isaac Newton）出版了《自然哲學的數學原理》（Philosophiae Naturalis Principia Mathematica）——三卷書做到了此前無人做到的事：證明拉蘋果落地的力，與維持月球繞地軌道、驅動行星繞日運行的力，其實是同一種力。天與地，從此不再是兩套物理。"
          }},
          { p: {
            en: "Newton's <span class=\"term\">law of universal gravitation</span> states that every mass attracts every other mass with a force proportional to the product of the two masses and inversely proportional to the square of the distance between them. It is a strikingly simple rule, and from it alone Newton could derive all three of <span class=\"term\">Kepler's laws</span> — elliptical orbits, equal areas swept in equal times, the relation between orbital period and distance — as mathematical consequences rather than empirical fits to Tycho Brahe's observations.",
            zh: "牛頓的<span class=\"term\">萬有引力定律</span>指出：任兩個質量之間，都以正比於兩質量乘積、反比於距離平方的力互相吸引。這條規則簡潔得驚人，牛頓僅憑它便推導出<span class=\"term\">克卜勒定律</span>的全部三條——橢圓軌道、相等時間掃過相等面積、公轉週期與距離的關係——這些不再只是 Tycho Brahe 觀測數據的經驗擬合，而是數學上的必然結果。"
          }},
          { eq: "F = G x M x m / r²",
            where: {
              en: "F is the gravitational force between two masses M and m separated by distance r; G is the gravitational constant, the same everywhere in the universe.",
              zh: "F 為相距 r 的兩質量 M 與 m 之間的重力；G 為重力常數，在宇宙中處處相同。"
            }},
          { p: {
            en: "The law carries a quieter implication. For any mass, there is a speed fast enough to break free of its gravity forever, no matter how far up the projectile is thrown — the <span class=\"term\">escape velocity</span>, v = √(2GM/r). Raise a body's mass, or shrink its radius, and the escape velocity climbs. Newton himself never pushed the idea to an extreme; it took another century for someone to ask what happens if it climbs past the speed of light.",
            zh: "這條定律還藏著一個較不起眼的推論。對任何質量而言，都存在一個特定速度，只要達到它，物體便能永遠擺脫其重力束縛，不論拋射的初始高度為何——這就是<span class=\"term\">逃逸速度</span>，v = √(2GM/r)。質量越大，或半徑越小，逃逸速度就越高。牛頓本人從未把這個概念推向極端；又過了一個世紀，才有人問：如果逃逸速度超過光速，會發生什麼事？"
          }},
          { p: {
            en: "That someone was John Michell, a Yorkshire clergyman and geologist better known today for his work on earthquakes. In a paper read to the Royal Society in 1783, Michell reasoned in pure Newtonian terms: a star with the Sun's density but 500 times its radius would have an escape velocity exceeding the speed of light. Light leaving its surface would be pulled back, like a stone thrown from the Earth that never quite gets away. Such an object, he wrote, would be invisible — its light forever unable to reach a distant observer. He called it a 'dark star'.",
            zh: "這位提問者是 John Michell，一位約克郡的牧師兼地質學家，今日更以地震研究聞名。在1783年向皇家學會（Royal Society）宣讀的一篇論文中，Michell 完全以牛頓力學推理：一顆密度與太陽相同、但半徑為太陽500倍的恆星，其逃逸速度將超過光速。從表面射出的光將被拉回，就像一顆永遠無法真正脫離地球的拋石。他寫道，這樣的天體將是不可見的——它的光永遠無法抵達遠方的觀測者。他稱之為「暗星」（dark star）。"
          }},
          { p: {
            en: "Pierre-Simon Laplace reached the same conclusion independently, publishing it in <i>Exposition du système du monde</i> in 1796. But as the wave theory of light gained ground in the early 1800s, the idea of a fixed 'speed limit' that light itself could be trapped by began to look physically shaky — if light was a wave, not a stream of Newtonian corpuscles, did escape velocity even apply to it? Laplace quietly dropped the passage from later editions.",
            zh: "Pierre-Simon Laplace 獨立得出相同的結論，並於1796年發表在《宇宙系統論》（Exposition du système du monde）中。但隨著光的波動說在19世紀初逐漸站穩腳步，「光本身可能被困在一個固定速度極限之內」的想法開始顯得站不住腳——如果光是一種波，而非牛頓式的粒子流，逃逸速度的概念還適用於它嗎？Laplace 後來悄悄地把這段論述從後續版本中刪除。"
          }},
          { list: [
            { en: "1687 — Newton's Principia unifies falling and orbiting motion under one inverse-square law.", zh: "1687年——牛頓的《自然哲學的數學原理》以同一條平方反比定律，統一了墜落與軌道運動。" },
            { en: "1783 — John Michell, reasoning from escape velocity alone, describes a star too compact for its own light to leave: the first 'dark star'.", zh: "1783年——John Michell 單憑逃逸速度的推理，描述了一顆緻密到連自身光線都無法逃離的恆星：第一顆「暗星」。" },
            { en: "1796 — Laplace publishes the same idea independently in Exposition du système du monde.", zh: "1796年——Laplace 在《宇宙系統論》中獨立發表相同的想法。" },
            { en: "Early 1800s — the wave theory of light undermines the reasoning, and the idea is quietly set aside for over a century.", zh: "19世紀初——光的波動說動搖了這套推理，這個想法就此被靜靜擱置了一個多世紀。" }
          ]},
          { call: 'key', title: { en: "A Right Idea, a Century Too Early", zh: "早了一個世紀的正確直覺" }, body: {
            en: "Michell and Laplace's 'dark star' is not a black hole in the modern sense. Newtonian mechanics has no event horizon and no curved spacetime; in their picture light is simply a stream of ordinary particles, thrown outward like a cannonball, that falls back because it lacks the speed to escape. It would take Einstein's general relativity, over a century later, to show that light does not slow down and fall back at all — gravity traps it through the geometry of spacetime itself, not through Newtonian projectile motion. Still, Michell and Laplace had the essential intuition right: gravity can be strong enough that nothing, not even light, escapes. This library returns to that idea in earnest once it reaches general relativity and the true event horizon.",
            zh: "Michell 與 Laplace 的「暗星」，並不是現代意義上的黑洞。牛頓力學裡沒有事件視界，也沒有彎曲時空；在他們的圖像中，光不過是一束尋常粒子，如同拋出的砲彈一般射向遠方，只因速度不足而墜回。要等到一個世紀後，愛因斯坦的廣義相對論才說明了光根本不會像拋射體那樣減速墜回——重力困住光，靠的是時空本身的幾何，而非牛頓式的拋體運動。儘管如此，Michell 與 Laplace 掌握了最核心的直覺：重力確實可能強大到連光都無法逃脫。本圖書館會在進入廣義相對論、談到真正的事件視界時，重新認真拾起這條思路。"
          }}
        ]
      },

      // ---- 4. Starlight and spectroscopy ----
      {
        id: "stellar-spectroscopy", no: 4,
        kicker: { en: "starlight decoded", zh: "星光解碼" },
        title: { en: "Starlight and spectroscopy", zh: "星光與光譜學" },
        sub: { en: "A prism turns a beam of starlight into a bar code — and the bar code turns out to name every element in the star.", zh: "稜鏡能把一道星光化為一條條暗紋——而這些暗紋，正是恆星裡每種元素的名字。" },
        blocks: [
          { p: {
            en: "In 1814, a 27-year-old Bavarian glassmaker named Joseph von Fraunhofer pointed a prism at sunlight passing through a narrow slit and saw something no one had properly recorded before: the rainbow band of the solar spectrum was crossed by hundreds of thin, dark lines. Fraunhofer had no idea what caused them, but he was methodical enough to catalogue over 570 of these <span class=\"term\">Fraunhofer lines</span> by 1815, labeling the most prominent ones with the letters A through K — a notation astronomers still use today. He had discovered, without knowing it, that starlight carries a code.",
            zh: "1814年，一位27歲的巴伐利亞玻璃工匠 Joseph von Fraunhofer 將稜鏡對準穿過細縫的陽光，看見了前所未有的景象：太陽光譜的彩虹色帶上，橫亙著數百條細窄的暗線。Fraunhofer 當時並不知道這些暗線從何而來，但他仍以嚴謹的態度，在1815年前編錄了超過570條<span class=\"term\">Fraunhofer 譜線</span>，並以字母A到K標示其中最顯著的幾條——這套標記法至今仍為天文學家沿用。他在渾然不覺中，發現了星光原來帶有密碼。"
          }},
          { p: {
            en: "The code was cracked 45 years later. In 1859, the physicist Gustav Kirchhoff and the chemist Robert Bunsen — working together in Heidelberg, Bunsen's new gas burner supplying the clean flame — showed that every chemical element, heated until it glows, emits or absorbs light at its own fixed set of wavelengths, as distinctive as a fingerprint. Sodium always marks the same yellow line; hydrogen always marks the same red, blue-green, and violet set. Fraunhofer's dark lines were absorption fingerprints: cooler gas in the Sun's outer atmosphere swallowing specific wavelengths of the light welling up from below. <span class=\"term\">Spectroscopy</span> — reading a <span class=\"term\">spectral line</span> pattern to identify what is glowing — had turned starlight into a chemical assay a star never has to be visited to perform.",
            zh: "這組密碼在45年後才被破解。1859年，物理學家 Gustav Kirchhoff 與化學家 Robert Bunsen 在海德堡合作——Bunsen 新發明的煤氣燈提供了乾淨無雜光的火焰——證明了每一種化學元素受熱發光時，都會在自己固定的一組波長上發射或吸收光，如同指紋般獨一無二。鈉永遠標記出同一條黃線；氫永遠標記出同一組紅、藍綠與紫線。Fraunhofer 的暗線，正是吸收指紋：太陽外層較冷的氣體，吞噬了由下方湧升之光中特定波長的成分。<span class=\"term\">光譜學</span>（spectroscopy）——藉<span class=\"term\">譜線</span>圖案判讀發光物質成分的技術——讓星光成了一份不必親自登門造訪、就能完成的化學鑑定書。"
          }},
          { p: {
            en: "Spectral lines carry a second kind of information, discovered slightly earlier. In 1842, the Austrian physicist Christian Doppler described how the motion of a wave source shifts the frequency an observer receives — a police siren rising in pitch as it approaches, falling as it recedes. Applied to light, the same effect stretches a star's spectral lines toward the red end of the spectrum as the star recedes, and compresses them toward blue as it approaches. The lines themselves never move from their catalogued wavelengths without cause; a shifted line is a star confessing its velocity. Combined with Kirchhoff and Bunsen's chemical fingerprints, the <span class=\"term\">Doppler effect</span> gave astronomers two readings from a single beam of light: what a star is made of, and how fast it is moving toward or away from Earth.",
            zh: "譜線還攜帶第二種訊息，而這是稍早就被發現的。1842年，奧地利物理學家 Christian Doppler 描述了波源運動如何使觀測者接收到的頻率發生偏移——警笛聲隨著車輛接近而音調升高、隨著遠離而降低。將此原理應用於光，同樣的效應會使遠離中的恆星譜線往光譜紅端偏移，使接近中的恆星譜線往藍端偏移。譜線本身若無外力介入，絕不會偏離其編錄波長；一條偏移的譜線，其實就是恆星在坦承自己的速度。結合 Kirchhoff 與 Bunsen 的化學指紋，<span class=\"term\">都卜勒效應</span>（Doppler effect）讓天文學家能從單一道光中讀出兩種資訊：這顆恆星由什麼組成，以及它正以多快的速度朝地球接近或遠離。"
          }},
          { list: [
            { en: "1814-1815 — Fraunhofer catalogues over 570 dark lines in the solar spectrum, without yet knowing their cause.", zh: "1814-1815年——Fraunhofer 編錄太陽光譜中超過570條暗線，當時尚不知其成因。" },
            { en: "1842 — Christian Doppler shows that motion shifts a wave's observed frequency.", zh: "1842年——Christian Doppler 證明運動會使波的觀測頻率產生偏移。" },
            { en: "1859 — Kirchhoff and Bunsen show each element has its own spectral fingerprint, explaining Fraunhofer's lines as absorption by elements in the Sun's atmosphere.", zh: "1859年——Kirchhoff 與 Bunsen 證明每種元素都有自己的光譜指紋，解釋了 Fraunhofer 譜線正是太陽大氣中元素吸收所致。" },
            { en: "1901-1924 — Annie Jump Cannon's Henry Draper Catalogue sorts hundreds of thousands of stars into the OBAFGKM sequence.", zh: "1901-1924年——Annie Jump Cannon 的 Henry Draper Catalogue 將數十萬顆恆星依OBAFGKM序列分類。" },
            { en: "1911-1913 — Hertzsprung and Russell independently plot luminosity against temperature, revealing the main sequence.", zh: "1911-1913年——Hertzsprung 與 Russell 各自繪出光度對溫度圖，揭示了主序星的存在。" }
          ]},
          { p: {
            en: "Turning spectra into a usable catalogue took decades of painstaking labor, most of it performed by a team of women hired at the Harvard College Observatory as human computers. Among them, Annie Jump Cannon examined and classified the spectra of hundreds of thousands of stars by eye, refining an alphabetical classification scheme into the sequence still taught today: O, B, A, F, G, K, M, ordered not alphabetically but by falling surface temperature, from blistering blue-white O stars to cool red M dwarfs. Published across the multi-volume Henry Draper Catalogue between 1901 and 1924, Cannon's OBAFGKM sequence gave every star a temperature class before a single distance to that star was even known.",
            zh: "要把光譜整理成一份可用的星表，需要數十年的艱苦勞動，其中大半工作由哈佛學院天文台聘僱的一組女性「人力電腦」完成。其中，Annie Jump Cannon 以肉眼檢視並分類了數十萬顆恆星的光譜，將原本按字母排列的分類系統，精煉成至今仍在教授的序列：O、B、A、F、G、K、M——這個順序並非依字母排列，而是依表面溫度遞減排列，從灼熱的藍白色O型星，一路排到低溫的紅色M型矮星。Cannon 的 OBAFGKM 序列發表於1901年至1924年間出版的多卷本 Henry Draper Catalogue，讓每一顆恆星在還未測得任何距離之前，就先擁有了一個溫度分類。"
          }},
          { p: {
            en: "The classification became a discovery in its own right once someone plotted it against brightness. Working independently, the Danish astronomer Ejnar Hertzsprung in 1911 and the American astronomer Henry Norris Russell in 1913 each graphed stars by luminosity on one axis and temperature (or spectral type) on the other. Instead of a random scatter, most stars fell along a single diagonal band running from hot, brilliant stars to cool, dim ones — the <span class=\"term\">main sequence</span>. The resulting <span class=\"term\">Hertzsprung-Russell diagram (HR diagram)</span> remains the single most-used chart in stellar astrophysics: a star's position on it marks a stage in its life, and its motion off the main sequence, decades later, would become the story of how stars die.",
            zh: "一旦有人把這套分類與亮度對照作圖，分類本身就成了一項重大發現。丹麥天文學家 Ejnar Hertzsprung 於1911年、美國天文學家 Henry Norris Russell 於1913年，各自獨立地將恆星依光度為一軸、溫度（或光譜型）為另一軸繪圖。結果並非雜亂散布，絕大多數恆星都落在一條從高溫明亮星延伸到低溫暗淡星的對角帶上——即<span class=\"term\">主序</span>（main sequence）。由此產生的<span class=\"term\">赫羅圖</span>（Hertzsprung-Russell diagram, HR diagram）至今仍是恆星天文物理學中使用最頻繁的圖表：恆星在圖上的位置標示著它生命中的某個階段，而它日後偏離主序的軌跡，將會是恆星如何走向死亡的故事。"
          }},
          { eq: "Δλ / λ = v / c",
            where: {
              en: "Δλ is the shift in a spectral line's wavelength, λ its rest wavelength, v the star's velocity along the line of sight, and c the speed of light; a positive v (receding) redshifts the line, a negative v (approaching) blueshifts it.",
              zh: "Δλ 為譜線波長的偏移量，λ 為靜止波長，v 為恆星沿視線方向的速度，c 為光速；v 為正（遠離）時譜線紅移，v 為負（接近）時譜線藍移。"
            }},
          { call: 'key', title: { en: "Starlight is data", zh: "星光就是資料" }, body: {
            en: "A star is unreachable, but its light is not: a prism turns that light into a readout of composition, temperature, and velocity, all extracted without ever leaving Earth. The OBAFGKM sequence and the HR diagram gave astronomers a map of stellar types before they understood why stars occupied the positions they did — the physics of nuclear fusion, electron degeneracy pressure, and the deaths of stars that explains that map is the subject of the chapters ahead.",
            zh: "恆星遠不可及，但它的光並非如此：稜鏡能把這道光轉譯成成分、溫度與速度的讀數，全程不必離開地球一步。OBAFGKM序列與赫羅圖，讓天文學家在還不明白恆星為何落在圖上特定位置之前，就已經先擁有了一張恆星類型地圖——而解釋這張地圖的物理機制，也就是核融合、電子簡併壓力與恆星死亡的故事，正是後續章節要說的內容。"
          }}
        ]
      },

      // ---- 5. Einstein and General Relativity ----
      {
        id: "general-relativity", no: 5,
        kicker: { en: "the new gravity", zh: "全新的重力" },
        title: { en: "Einstein and General Relativity", zh: "愛因斯坦與廣義相對論" },
        sub: { en: "A falling man feels no weight, and from that single thought, gravity became geometry.", zh: "墜落之人感受不到重量——從這個念頭出發，重力變成了幾何。" },
        blocks: [
          { p: {
            en: "In 1905, at twenty-six, Albert Einstein had already dismantled the old separate notions of space and time. <span class=\"term\">Special relativity</span> fused them into one fabric and showed that nothing outrages it — except gravity. Newton's gravity acted instantly, at a distance, through empty space; special relativity forbade anything from crossing that space faster than light. The two theories could not both be right.",
            zh: "1905 年，26 歲的愛因斯坦已經拆解了空間與時間各自獨立的舊觀念。<span class=\"term\">狹義相對論（special relativity）</span>將兩者融合成一體，卻也暴露出一個例外——重力。牛頓的重力是瞬時的超距作用，穿越虛空不花時間；狹義相對論卻禁止任何東西比光更快穿越空間。兩套理論無法同時成立。"
          }},
          { p: {
            en: "The way out came to him in 1907, in what he later called his <b>happiest thought</b>: a person falling freely off a roof feels no weight at all. Gravity, in that instant, simply vanishes for the faller — locally indistinguishable from floating in empty space. Flip it around: standing in a windowless, accelerating rocket feels exactly like standing on the ground. This is the <span class=\"term\">equivalence principle</span>, and it was the seed of everything that followed: gravity is not a force pulling on objects, it is a property of the arena they move through.",
            zh: "出路在 1907 年浮現，愛因斯坦後來稱之為他一生中<b>最幸福的念頭</b>：一個人從屋頂自由落下時，完全感受不到重量。在那一瞬間，重力對墜落者而言彷彿消失了——與飄浮在虛空中並無二致。反過來說，站在一艘沒有窗戶、正在加速的火箭裡，感覺也與站在地面上完全相同。這就是<span class=\"term\">等效原理（equivalence principle）</span>，也是後續一切的種子：重力不是拉扯物體的一種力，而是物體所處舞台本身的一種性質。"
          }},
          { p: {
            en: "Turning that insight into a working theory took nearly a decade of hard mathematics. Ordinary calculus could not describe a space whose geometry bends from place to place, so from 1912 Einstein worked with his friend and former classmate, the mathematician <b>Marcel Grossmann</b>, to master <span class=\"term\">tensor calculus</span> — the language earlier built by Riemann, Ricci, and Levi-Civita for curved geometry. Einstein tried and discarded field equation after field equation, chasing versions that seemed elegant but predicted the wrong orbit for Mercury, or violated conservation of energy. The search ended in a rush in November 1915, when he presented the final, correct field equations to the Prussian Academy of Sciences in Berlin on the 25th of that month.",
            zh: "把這個洞見變成一套可運作的理論，又花了將近十年的艱辛數學工作。一般的微積分無法描述一個幾何逐點彎曲的空間，於是自 1912 年起，愛因斯坦與他的老同學、數學家<b>Marcel Grossmann</b>合作，鑽研<span class=\"term\">張量微積分（tensor calculus）</span>——這是 Riemann、Ricci 與 Levi-Civita 等人早先為彎曲幾何建立的語言。愛因斯坦一次又一次嘗試又放棄場方程式，有些版本看似優雅，卻算出錯誤的水星軌道，或違反能量守恆。這場追尋在 1915 年 11 月匆促收尾：他於當月 25 日在柏林向普魯士科學院提出最終、正確的場方程式。"
          }},
          { p: {
            en: "The new picture replaced Newton's invisible force with something almost tangible: <span class=\"term\">curved spacetime</span>. A massive object like the Sun does not reach out and pull the Earth; it bends the geometry around itself, and the Earth simply follows the straightest possible path through that bent geometry — a <span class=\"term\">geodesic</span>. What looks like an orbit, or a falling apple, is just inertial motion through a warped arena. Gravity became geometry.",
            zh: "這幅新圖像用一種近乎具體可感的東西，取代了牛頓那看不見的力：<span class=\"term\">彎曲時空（curved spacetime）</span>。像太陽這樣的巨大天體，並不是伸出手去拉扯地球；它彎曲了自身周圍的幾何，而地球只是沿著這彎曲幾何中最直的可能路徑前進——也就是<span class=\"term\">測地線（geodesic）</span>。看似軌道運動的東西，或是一顆墜落的蘋果，其實只是在扭曲舞台中的慣性運動。重力變成了幾何。"
          }},
          { list: [
            { en: "1905 — Special relativity unifies space and time, but leaves gravity out.", zh: "1905 年——狹義相對論統一了空間與時間，卻把重力排除在外。" },
            { en: "1907 — The equivalence principle: free fall feels like weightlessness, gravity's \"happiest thought\".", zh: "1907 年——等效原理：自由落體的感受與失重無異，是愛因斯坦「最幸福的念頭」。" },
            { en: "1912 onward — With Marcel Grossmann, Einstein masters tensor calculus to describe curved geometry.", zh: "1912 年起——愛因斯坦與 Marcel Grossmann 合作，掌握描述彎曲幾何所需的張量微積分。" },
            { en: "25 November 1915 — The final field equations are presented to the Prussian Academy of Sciences in Berlin.", zh: "1915 年 11 月 25 日——最終場方程式於柏林向普魯士科學院提出。" },
            { en: "29 May 1919 — Eddington's eclipse expeditions to Príncipe and Sobral measure starlight bending around the Sun.", zh: "1919 年 5 月 29 日——Eddington 率隊前往 Príncipe 與 Sobral 觀測日食，測得星光在太陽附近的偏折。" }
          ]},
          { p: {
            en: "A theory is only as good as its testable predictions, and general relativity made a sharp one: starlight passing close to the Sun should bend by a precise angle — roughly twice what Newtonian gravity alone would give. The only moment to check it is a total solar eclipse, when the Sun's disc is blocked and stars normally lost in its glare become visible right at its edge. The British astronomer <b>Arthur Eddington</b> led an expedition to observe the eclipse of 29 May 1919, splitting his teams between the island of Príncipe, off West Africa, and Sobral in Brazil; the measured deflection matched Einstein's number, not Newton's. The result was announced that November at a joint meeting of the Royal Society and the Royal Astronomical Society in London, and newspapers around the world ran with it — overnight, Einstein went from a respected physicist to a global celebrity, and Newton's law of universal gravitation, unchallenged for over two centuries, was shown not to be the last word after all.",
            zh: "一套理論的價值取決於它能否被檢驗，而廣義相對論給出了一個明確的預測：掠過太陽邊緣的星光應該偏折一個精確角度——大約是純牛頓重力所給數值的兩倍。唯一能檢驗這件事的時刻，是日全食：太陽的圓面被遮蔽，平常被陽光淹沒的恆星得以在太陽邊緣現身。英國天文學家<b>Arthur Eddington</b>率隊觀測 1919 年 5 月 29 日的日食，將團隊分派至西非外海的 Príncipe 島與巴西的 Sobral；實測的偏折角與愛因斯坦的數字相符，而非牛頓的數字。這項結果當年 11 月在倫敦皇家學會與皇家天文學會的聯合會議上宣布，全球各地的報紙爭相報導——一夜之間，愛因斯坦從一位受敬重的物理學家，變成全球知名的公眾人物，而牛頓的萬有引力定律，儘管兩百多年來屹立不搖，也終究不是最終答案。"
          }},
          { eq: "Gμν = 8πG/c⁴ Tμν",
            where: {
              en: "The Einstein field equations: Gμν, built from the curvature of spacetime, is set equal to Tμν, the density and flow of mass and energy. In short — matter tells spacetime how to curve, and curved spacetime tells matter how to move.",
              zh: "愛因斯坦場方程式：由時空曲率構成的 Gμν，等於物質與能量的密度與流動 Tμν。簡言之——物質告訴時空如何彎曲，彎曲的時空告訴物質如何運動。"
            }},
          { call: 'key', title: { en: "KEY IDEA", zh: "核心觀念" }, body: {
            en: "General relativity is not one prediction among many — it is the single root system that everything downstream grows from. Karl Schwarzschild found the first exact solution to Einstein's equations within weeks of their publication, describing the spacetime around a non-rotating mass. Every later refinement — adding spin, adding charge, all the way to the Kerr-Newman geometry — is still the same 1915 theory, just solved for a more complete object. That thread picks up again once this library reaches the black-hole chapters.",
            zh: "廣義相對論並非眾多預測中的一項——它是後續一切生長出來的單一根系。Karl Schwarzschild 在方程式發表數週內，便找到了第一個精確解，描述了不自轉質量周圍的時空。之後每一次的推廣——加入自轉、加入電荷，一路到 Kerr-Newman 幾何——都仍是同一套 1915 年的理論，只是求解對象變得更完整。這條線索，會在本圖書館進入黑洞相關章節時再度接續。"
          }}
        ]
      },

      // ---- 6. Island Universes: Discovering Other Galaxies ----
      {
        id: "galaxies-expanding-universe", no: 6,
        kicker: { en: "island universes", zh: "孤島宇宙" },
        title: { en: "Island Universes: Discovering Other Galaxies", zh: "孤島宇宙：發現其他星系" },
        sub: { en: "A stopwatch, a spiral smudge of light, and a debate that ended only when someone finally measured how far away the universe really is.", zh: "一支碼表、一團螺旋狀的光斑，以及一場辯論——直到有人終於量出宇宙真正的距離，才畫下句點。" },
        blocks: [
          { p: {
            en: "On a clear night the Milky Way arcs overhead as a single hazy river of light, and for most of human history it was assumed to be the whole of creation. Scattered among the stars, though, telescopes revealed faint, fuzzy smudges — spiral-shaped clouds that nineteenth-century astronomers simply called nebulae, Latin for \"clouds.\" Nobody knew what they were made of, how far away they sat, or whether they belonged to our own star system at all.",
            zh: "晴朗的夜晚，銀河如同一條朦朧的光河橫跨天際，人類歷史上大半時間都以為那就是宇宙的全部。望遠鏡卻在群星之間發現了一些暗淡模糊的斑點——螺旋狀的雲霧，十九世紀的天文學家只簡單稱之為「星雲」（nebulae，拉丁文「雲」之意）。沒有人知道它們的成分為何、距離多遠，甚至不確定它們是否屬於我們自己的恆星系統。"
          }},
          { p: {
            en: "The question came to a head on 26 April 1920, when the National Academy of Sciences in Washington hosted what became known as the Great Debate. Harlow Shapley argued that the spiral nebulae were small, nearby objects, mere clouds of gas within a single enormous Milky Way that filled essentially the whole universe. Heber Curtis argued the opposite: the spirals were separate <span class=\"term\">galaxy</span>-sized systems, \"island universes\" of their own, comparable in size to the Milky Way but sitting at vast distances beyond it. Neither side had a distance measurement precise enough to settle the argument that night.",
            zh: "這個問題在 1920 年 4 月 26 日於華盛頓的美國國家科學院攤牌，後世稱之為「大辯論」（Great Debate）。Harlow Shapley 主張螺旋星雲是鄰近的小型天體，只是單一巨大銀河系內的氣體雲，而銀河系本身幾乎就是整個宇宙。Heber Curtis 則主張相反：這些螺旋是獨立的<span class=\"term\">星系</span>（galaxy）等級系統，各自是一座「孤島宇宙」，大小與銀河系相當，卻位在遠遠超出銀河系之外的地方。當晚雙方都拿不出足夠精確的距離測量來平息爭論。"
          }},
          { p: {
            en: "The tool that would eventually decide the debate had already been built more than a decade earlier, by a woman who was never invited to argue either side. At the Harvard College Observatory, Henrietta Swan Leavitt spent years cataloguing variable stars on photographic plates of the Magellanic Clouds. In 1908, and in a definitive 1912 paper, she found that a class of pulsating stars called <span class=\"term\">Cepheid variables</span> obeyed a strict rule: the longer a Cepheid's pulsation period, the greater its true luminosity. Because all the stars she compared sat at roughly the same distance from Earth, the relationship could not be an accident of geometry — it was a property of the stars themselves. A Cepheid's period, measured with nothing more than a stopwatch and a telescope, revealed how bright it really was, and comparing that to how bright it looked gave its distance. Astronomers had found a <span class=\"term\">standard candle</span>.",
            zh: "最終能為這場辯論一錘定音的工具，其實早在十多年前就已經打造完成，而打造者是一位從未受邀參與任何一方辯論的女性。在哈佛大學天文台，Henrietta Swan Leavitt 花費多年時間，在麥哲倫雲的相片乾版上編錄變星。她在 1908 年、以及 1912 年一篇具決定性的論文中發現，一類稱為<span class=\"term\">造父變星</span>（Cepheid variable）的脈動恆星遵循一條嚴格規律：脈動週期越長，真實光度就越高。由於她比較的所有恆星距離地球大致相同，這個關係不可能只是幾何巧合——它是恆星本身的性質。只要用碼表與望遠鏡量出造父變星的脈動週期，就能得知它真正有多亮；再將其與觀測到的視亮度比較，便能推算出距離。天文學家從此擁有了一把「<span class=\"term\">標準燭光</span>」。"
          }},
          { p: {
            en: "Leavitt's relation sat waiting until Edwin Hubble turned the 100-inch Hooker Telescope at Mount Wilson Observatory on the Andromeda nebula. Between 1923 and 1925, Hubble identified individual Cepheid variables within Andromeda's spiral arms and used their pulsation periods to calculate the nebula's distance. The number he got was staggering: roughly 900,000 light-years, far outside even Shapley's oversized Milky Way. Andromeda was not a gas cloud next door — it was a full galaxy in its own right, and the Milky Way was just one island among many. Curtis had been right, though for the wrong specific reasons in places; Hubble's measurement, not rhetoric, closed the debate.",
            zh: "Leavitt 的關係式靜待多年，直到 Edwin Hubble 將威爾遜山天文台（Mount Wilson Observatory）口徑 100 吋的胡克望遠鏡（Hooker Telescope）對準了仙女座星雲。1923 年到 1925 年間，Hubble 在仙女座的螺旋臂中辨認出個別的造父變星，並利用其脈動週期算出這團星雲的距離。得到的數字令人震驚：約九十萬光年，遠遠超出了即使是 Shapley 所設想的、被過度放大的銀河系範圍。仙女座並非鄰近的氣體雲——它本身就是一整個星系，而銀河系不過是眾多孤島宇宙中的一座。Curtis 的立場是對的，儘管他當初論證的部分細節有誤；真正終結這場辯論的，是 Hubble 的測量數據，而非言辭交鋒。"
          }},
          { list: [
            { en: "1908 / 1912 — Leavitt publishes the Cepheid period-luminosity relation from the Magellanic Clouds, giving astronomers a standard candle.", zh: "1908／1912 年——Leavitt 從麥哲倫雲的觀測發表造父變星週期-光度關係，天文學家從此有了標準燭光。" },
            { en: "26 April 1920 — the Great Debate, Shapley vs Curtis, leaves the true scale of the universe unresolved.", zh: "1920 年 4 月 26 日——Shapley 與 Curtis 的大辯論，未能解決宇宙真正的尺度問題。" },
            { en: "1923-1925 — Hubble measures Andromeda's distance with Cepheids; it lies far beyond the Milky Way.", zh: "1923 至 1925 年——Hubble 用造父變星測出仙女座的距離，證明它遠在銀河系之外。" },
            { en: "1927 — Lemaitre derives an expanding universe directly from Einstein's field equations.", zh: "1927 年——Lemaitre 直接從愛因斯坦的場方程式推導出宇宙正在膨脹。" },
            { en: "1929 — Hubble and Humason show galaxy redshifts grow with distance: Hubble's law.", zh: "1929 年——Hubble 與 Humason 證明星系紅移隨距離增加而增大：哈伯定律。" }
          ]},
          { p: {
            en: "Even before the observations came in, the mathematics had already pointed the same way. In 1927, the Belgian priest and physicist Georges Lemaitre worked through Einstein's own field equations of general relativity and derived a solution Einstein himself had resisted: a universe that could not stay still, one whose recession velocities should grow in direct proportion to distance. Two years later, Hubble and his observing partner Milton Humason supplied the proof. Using <span class=\"term\">spectroscopy</span> — spreading a galaxy's light into a spectrum and measuring how far its dark <span class=\"term\">spectral line</span>s had shifted toward the red end via the <span class=\"term\">Doppler effect</span> — they measured redshifts for dozens of galaxies and plotted them against Hubble's Cepheid distances. The pattern, soon named <span class=\"term\">Hubble's law</span>, was unmistakable: the farther away a galaxy sat, the faster it was receding. Humanity had found its first direct evidence for an <span class=\"term\">expanding universe</span>.",
            zh: "早在觀測數據出爐之前，數學便已指向同一個方向。1927 年，比利時神父兼物理學家 Georges Lemaitre 深入推演愛因斯坦廣義相對論的場方程式，得出了一個連愛因斯坦本人都曾抗拒的解：宇宙不可能靜止不動，而且退行速度應與距離成正比。兩年後，Hubble 與他的觀測搭檔 Milton Humason 提供了證明。他們運用<span class=\"term\">光譜學</span>（spectroscopy）——將星系的光展開成光譜，並透過<span class=\"term\">都卜勒效應</span>量測其暗色<span class=\"term\">譜線</span>朝紅端偏移的程度——測得數十個星系的紅移，再與 Hubble 先前用造父變星求得的距離相互對照。這個規律很快被稱為<span class=\"term\">哈伯定律</span>（Hubble's law），結果一目瞭然：星系距離越遠，退行速度就越快。人類首次找到了<span class=\"term\">膨脹宇宙</span>的直接證據。"
          }},
          { eq: "v = H0 x d",
            where: {
              en: "v is a galaxy's recession velocity, d is its distance from us, and H0 (the Hubble constant) sets how fast that velocity grows with distance — the present-day expansion rate of the universe.",
              zh: "v 為星系的退行速度，d 為它與我們的距離，H0（哈伯常數）決定了速度隨距離增加的快慢——也就是宇宙目前的膨脹速率。"
            }},
          { call: 'key', title: { en: "One galaxy among billions", zh: "億萬星系中的一座" }, body: {
            en: "The Great Debate was never really about nebulae — it was about the size of everything. Leavitt's Cepheids gave astronomers a ruler, Hubble used that ruler to demote the Milky Way from the whole of creation to one galaxy among an uncountable many, and Lemaitre's mathematics — confirmed by Hubble and Humason's redshifts — showed that the space between those galaxies is itself stretching. Every galaxy, every cluster, every structure this library will later trace back toward a single hot beginning sits inside that stretching space.",
            zh: "大辯論的核心從來不只是星雲本身，而是整個宇宙的尺度。Leavitt 的造父變星為天文學家提供了一把量尺，Hubble 用這把量尺把銀河系從「宇宙的全部」降格為億萬星系中的一座；而 Lemaitre 的數學推導——後來由 Hubble 與 Humason 的紅移觀測所證實——顯示這些星系之間的空間本身正在延展。本圖書館後續將追溯回單一炙熱起點的每一座星系、每一個星系團、每一種結構，都座落在這片不斷延展的空間之中。"
          }}
        ]
      },

      // ---- 7. The missing mass: discovering dark matter ----
      {
        id: "dark-matter", no: 7,
        kicker: { en: "missing mass", zh: "消失的質量" },
        title: { en: "The missing mass: discovering dark matter", zh: "消失的質量：暗物質的發現" },
        sub: { en: "Galaxies move as if wrapped in something no telescope has ever seen.", zh: "星系運轉的方式，彷彿被包覆在一層任何望遠鏡都不曾見過的物質之中。" },
        blocks: [
          { p: {
            en: "In 1933 the Swiss astronomer Fritz Zwicky pointed his instruments at the Coma Cluster, a swarm of thousands of galaxies roughly 320 million light-years away, and did something simple: he measured how fast individual galaxies were moving relative to the cluster's center. Using the virial theorem to relate those speeds to the total mass needed to hold the cluster together gravitationally, he found the galaxies moving far too fast — the visible starlight accounted for barely a tenth of the mass required to keep them bound. Zwicky called the shortfall <span class=\"term\">dark matter</span> (in his own German, \"dunkle Materie\"). For decades, almost nobody took the idea seriously.",
            zh: "1933年，瑞士天文學家 Fritz Zwicky 將他的望遠鏡對準后髮座星系團（Coma Cluster）——一個距離地球約3.2億光年、由數千個星系組成的星系團——並做了一件簡單的事：測量星系團中個別星系相對於中心的運動速度。他利用維里定理（virial theorem）將這些速度換算成維持星系團重力束縛所需的總質量，結果發現星系的運動速度快得離譜——可見星光所能提供的質量，還不到所需質量的十分之一。Zwicky 將這缺失的質量稱為<span class=\"term\">暗物質</span>（他原本用德文寫作「dunkle Materie」）。這個想法在往後數十年間，幾乎沒有人當真。"
          }},
          { p: {
            en: "The idea returned to life through painstaking observational work. Starting with the Andromeda Galaxy in 1970, the American astronomer Vera Rubin and her collaborator Kent Ford used <span class=\"term\">spectroscopy</span> to trace how fast gas and stars orbit at different distances from a galaxy's center — reading orbital speed off the <span class=\"term\">Doppler effect</span> shifting the <span class=\"term\">spectral lines</span> in the light each region emits. Through the 1970s they extended the method to dozens of spiral galaxies. The result, plotted as a rotation curve — orbital speed versus distance from the galactic center — refused to behave.",
            zh: "這個想法後來因為精細的觀測工作而重新復甦。從1970年對仙女座星系（Andromeda Galaxy）的觀測開始，美國天文學家 Vera Rubin 與合作者 Kent Ford 利用<span class=\"term\">光譜學</span>追蹤星系中不同距離處的氣體與恆星繞行速度——透過各區域所發出光線中<span class=\"term\">譜線</span>的<span class=\"term\">都卜勒效應</span>位移，讀出軌道速度。整個1970年代，他們將這套方法擴展到數十個螺旋星系。結果畫成的旋轉曲線——軌道速度對星系中心距離的關係圖——卻怎麼也不符合預期。"
          }},
          { eq: "v(r) = √(G × M(r) / r)",
            where: {
              en: "Orbital speed v at radius r depends, via Newton's gravitational constant G, on the mass M(r) enclosed within that radius. Since a spiral galaxy's starlight is concentrated in a compact disc, v should fall once r exceeds the visible disc — instead, Rubin and Ford's curves stayed flat.",
              zh: "軌道速度 v 在半徑 r 處，透過牛頓重力常數 G，取決於該半徑內所包圍的質量 M(r)。由於螺旋星系的星光集中在一個緊緻的盤面內，一旦 r 超出可見盤面範圍，v 理應下降——但 Rubin 與 Ford 量到的曲線卻始終平坦。"
            }},
          { p: {
            en: "A flat curve carries a direct message about where mass actually sits: if starlight traced the mass, orbital speeds would decline outside the visible disc, the way planets slow down the farther they orbit from the Sun. Instead, speeds stayed roughly constant out to the edge of what could be measured. The only way to reconcile that with Newtonian gravity is if each galaxy sits inside a much larger halo of unseen mass — one that keeps extending outward even where the starlight has long since run out.",
            zh: "平坦的旋轉曲線傳遞了一項明確的訊息：質量究竟分布在哪裡。如果星光真的代表質量所在，軌道速度理應在可見盤面之外逐漸下降，就像行星距離太陽越遠、公轉速度越慢一樣。但實際觀測到的速度，卻在能測量到的範圍內幾乎維持不變。要用牛頓重力解釋這個現象，唯一的辦法就是假設每個星系都座落在一個範圍大得多、由看不見的質量構成的暈（halo）之中——即使星光早已消失殆盡，這個暈仍持續向外延伸。"
          }},
          { list: [
            { en: "1933 — Zwicky measures galaxy speeds in the Coma Cluster and finds roughly ten times too little visible mass to hold the cluster together.", zh: "1933年——Zwicky 測量后髮座星系團內星系的運動速度，發現可見質量比維持星系團重力束縛所需的質量少了約十倍。" },
            { en: "1970 — Rubin and Ford's spectroscopy of Andromeda finds its rotation curve staying flat far past the visible disc.", zh: "1970年——Rubin 與 Ford 對仙女座星系的光譜觀測，發現其旋轉曲線在可見盤面之外仍維持平坦。" },
            { en: "1970s-80s — the same flat-curve pattern turns up in dozens more spiral galaxies, moving dark matter from curiosity to consensus.", zh: "1970至1980年代——同樣的平坦曲線模式在數十個螺旋星系中反覆出現，暗物質從一個奇特現象逐漸成為天文學界的共識。" },
            { en: "Late 20th-early 21st century — gravitational lensing by galaxy clusters and the fine structure of the cosmic microwave background independently confirm the same missing mass, at a consistent ratio.", zh: "20世紀末至21世紀初——星系團的重力透鏡效應與宇宙微波背景的精細結構，各自獨立證實了相同比例的消失質量。" }
          ]},
          { p: {
            en: "Two entirely independent techniques, developed decades after Zwicky and Rubin, now converge on the same number. <span class=\"term\">Gravitational lensing</span> — the bending of background light by a cluster's total gravity, visible mass plus dark — lets astronomers map mass directly, without ever measuring a single star's velocity. And the acoustic pattern baked into the <span class=\"term\">cosmic microwave background</span> encodes how much ordinary matter and how much extra gravitating material were present when the universe was only 380,000 years old. Both point to the same conclusion: roughly five times more mass exists in some non-luminous form than in all the ordinary, baryonic matter combined — the atoms that make up stars, planets, and every reader of this page.",
            zh: "兩種完全獨立的技術，都是在 Zwicky 與 Rubin 之後數十年才發展成熟，如今卻指向同一個數字。<span class=\"term\">重力透鏡</span>——星系團（可見質量加上暗物質）的總重力使背景光線彎曲——讓天文學家得以直接繪出質量分布，完全不需測量任何一顆恆星的速度。而烙印在<span class=\"term\">宇宙微波背景</span>（cosmic microwave background, CMB）中的聲學圖樣，則記錄了宇宙年僅38萬歲時，普通物質與額外重力來源各自的比例。兩者都指向同一個結論：以某種不發光形式存在的質量，大約是所有普通重子物質（構成恆星、行星，以及每一位讀者的原子）總質量的五倍。"
          }},
          { p: {
            en: "What dark matter actually is remains one of the open questions in physics. It clumps and pulls gravitationally, shaping how galaxies form and cluster — but it does not emit, absorb, or scatter light, which is precisely why it took a mismatch in orbital speeds, not a telescope image, to reveal it. It is not simply dim ordinary matter, such as failed stars or cold gas; the CMB and lensing evidence rule that out. Candidate particles have names — WIMPs, axions — and dedicated detectors have searched for them for decades, so far without a confirmed signal.",
            zh: "暗物質究竟是什麼，至今仍是物理學懸而未決的問題之一。它會因重力而聚集、牽引，形塑星系形成與聚集的方式——但它既不發光、不吸收光，也不散射光，這正是為什麼揭露它的線索是軌道速度的落差，而不是望遠鏡影像。它也不只是黯淡的普通物質，例如失敗的恆星或冷氣體——CMB 與重力透鏡的證據已排除這種可能。候選粒子已有其名——WIMP、axion——專門的偵測器數十年來持續搜尋，但至今尚未確認任何訊號。"
          }},
          { call: 'key', title: { en: "Gravity's invisible majority", zh: "重力的隱形多數" }, body: {
            en: "Every clue in this chapter — Zwicky's cluster speeds, Rubin and Ford's flat rotation curves, gravitational lensing, the cosmic microwave background — measures what mass does gravitationally, never what it looks like. That distinction becomes the organizing idea for the rest of cosmology: later in this library, the chapters on dark energy and the expanding universe show that gravity has an equally invisible counterpart, pushing space apart rather than pulling matter together.",
            zh: "本章的每一項線索——Zwicky 的星系團速度、Rubin 與 Ford 的平坦旋轉曲線、重力透鏡、宇宙微波背景——量到的都是質量在重力上造成的效應，而不是它看起來的樣子。這個區別，將成為貫穿宇宙學其餘部分的核心觀念：本圖書館稍後談暗能量與膨脹宇宙的章節會說明，重力還有一個同樣隱形的對手——它推開空間，而不是把物質拉在一起。"
          }}
        ]
      },

      // ---- 8. What Powers a Star ----
      {
        id: "stellar-fusion", no: 8,
        kicker: { en: "fusion furnace", zh: "核融合熔爐" },
        title: { en: "What Powers a Star", zh: "恆星的動力來源" },
        sub: { en: "Inside every star, quantum mechanics defeats electric repulsion, and mass quietly turns into light.", zh: "在每一顆恆星內部，量子力學戰勝了電荷斥力，質量悄悄化為光。" },
        blocks: [
          { p: {
            en: "By the early twentieth century, <span class=\"term\">spectroscopy</span> had already told astronomers what stars are made of. Sunlight split into its rainbow carries thousands of dark <span class=\"term\">spectral lines</span>, each one a fingerprint of an element absorbing its own particular colors — and the fingerprints said stars are overwhelmingly hydrogen and helium. But composition was not the same as power. Burning hydrogen the way a candle burns wax could not keep the Sun shining for more than a few thousand years, and geologists already knew Earth's rocks were far older than that.",
            zh: "到了二十世紀初，<span class=\"term\">光譜學</span>已經告訴天文學家恆星的成分。陽光被分解成彩虹光譜後，其中夾雜著成千上萬條暗色<span class=\"term\">譜線</span>，每一條都是某種元素吸收特定顏色光線留下的指紋——而這些指紋顯示恆星絕大部分是氫與氦。但知道成分並不等於知道動力來源。若恆星像蠟燭燃燒蠟一樣「燃燒」氫，太陽發光的時間撐不過幾千年，而地質學家早已證實地球岩石的年齡遠比這古老得多。"
          }},
          { p: {
            en: "Arthur Eddington confronted the mismatch head-on in his 1926 book <i>The Internal Constitution of the Stars</i>. Working out how a star's brightness must depend on its mass — the mass-luminosity relation — he showed that ordinary chemical burning, and even the slow release of gravitational energy as a star contracts, fell hopelessly short of the energy a star like the Sun visibly radiates over its lifetime. Eddington concluded that some <span class=\"term\">subatomic energy source</span> had to be at work deep in stellar cores. He could not yet say what it was; the nuclear physics to answer the question did not exist yet.",
            zh: "Arthur Eddington 在其 1926 年著作《The Internal Constitution of the Stars》中正面處理了這個落差。他推導出恆星亮度必然如何取決於質量——即質光關係（mass-luminosity relation）——並證明無論是一般的化學燃燒，甚至恆星緩慢收縮釋放的重力能，都遠遠不足以支撐太陽這類恆星一生所輻射出的能量。Eddington 因此斷定，恆星核心深處必定存在某種<span class=\"term\">次原子能量來源</span>。當時他還說不出那是什麼——因為足以回答這個問題的核物理學尚未誕生。"
          }},
          { p: {
            en: "The missing physics arrived in pieces. In 1928, George Gamow worked out <span class=\"term\">quantum tunnelling</span> — the startling quantum-mechanical fact that a particle has some probability of crossing an energy barrier it classically should not be able to cross at all. A year later, Robert Atkinson and Fritz Houtermans applied Gamow's result to the interior of stars: two positively charged nuclei repel each other electrically, and stellar cores are, strictly speaking, too cool for that <span class=\"term\">Coulomb repulsion</span> to be overcome by brute thermal force. Tunnelling let nuclei fuse anyway, slipping through the barrier rather than climbing over it.",
            zh: "缺失的物理學是一塊塊拼湊起來的。1928 年，George Gamow 推導出<span class=\"term\">量子穿隧</span>（quantum tunnelling）——這個驚人的量子力學事實指出，粒子有一定機率穿越一道古典力學上完全無法跨越的能量障壁。一年後，Robert Atkinson 與 Fritz Houtermans 把 Gamow 的結果應用到恆星內部：兩個帶正電的原子核會彼此電性排斥，而嚴格來說，恆星核心的溫度並不足以單靠熱運動的蠻力克服這種<span class=\"term\">庫侖排斥力</span>（Coulomb repulsion）。量子穿隧讓原子核得以融合——不是翻過障壁，而是從障壁中穿了過去。"
          }},
          { eq: "E = Δm x c²",
            where: {
              en: "Fusing light nuclei into heavier ones leaves the products very slightly lighter than the reactants; that missing mass Δm reappears as energy E, with c the speed of light. The conversion factor is enormous, which is why a star can shine for billions of years on a tiny fraction of its hydrogen.",
              zh: "輕原子核融合成較重的原子核時，產物的總質量會比反應物略輕；這消失的質量 Δm 便以能量 E 的形式重新出現，c 為光速。由於換算係數極為龐大，恆星只需消耗極小一部分的氫，就能發光長達數十億年。"
            }},
          { p: {
            en: "It was Hans Bethe who worked out exactly how, in a 1939 paper bluntly titled <i>Energy Production in Stars</i>. Bethe laid out the <span class=\"term\">proton-proton chain</span> — the sequence of fusion steps by which four hydrogen nuclei ultimately become one helium nucleus, the dominant process in a star like the Sun — and the <span class=\"term\">CNO cycle</span>, a faster route through carbon, nitrogen, and oxygen that takes over in hotter, more massive stars. Both are forms of <span class=\"term\">nuclear fusion</span>, and together they closed the gap Eddington had identified thirteen years earlier. The work earned Bethe the 1967 Nobel Prize in Physics.",
            zh: "真正解出詳細機制的是 Hans Bethe，他在 1939 年發表了一篇直白地命名為《Energy Production in Stars》的論文。Bethe 提出了<span class=\"term\">質子-質子鏈</span>（proton-proton chain）——四個氫原子核經一連串融合步驟最終變成一個氦原子核的過程，這是太陽這類恆星中的主要機制——以及<span class=\"term\">CNO 循環</span>（CNO cycle），一條經由碳、氮、氧為觸媒、速度更快的路徑，在溫度更高、質量更大的恆星中接手主導。兩者都是<span class=\"term\">核融合</span>的形式，合力補上了 Eddington 十三年前指出的那個缺口。這項成果為 Bethe 贏得了 1967 年諾貝爾物理學獎。"
          }},
          { list: [
            { en: "1926 — Eddington's <i>Internal Constitution of the Stars</i> shows chemistry and gravity alone cannot power a star.", zh: "1926 年——Eddington 的《Internal Constitution of the Stars》證明單靠化學能與重力能無法驅動恆星。" },
            { en: "1928 — Gamow works out quantum tunnelling through a classically forbidden barrier.", zh: "1928 年——Gamow 推導出粒子穿越古典力學禁止障壁的量子穿隧機制。" },
            { en: "1929 — Atkinson and Houtermans apply tunnelling to nuclear fusion in stellar cores.", zh: "1929 年——Atkinson 與 Houtermans 將量子穿隧應用於恆星核心的核融合。" },
            { en: "1939 — Bethe's <i>Energy Production in Stars</i> derives the proton-proton chain and the CNO cycle.", zh: "1939 年——Bethe 的《Energy Production in Stars》推導出質子-質子鏈與 CNO 循環。" },
            { en: "1967 — Bethe receives the Nobel Prize in Physics for this work.", zh: "1967 年——Bethe 因這項成果獲頒諾貝爾物理學獎。" }
          ]},
          { p: {
            en: "Fusion rate depends steeply on core temperature and pressure, both of which climb with a star's mass — so mass is destiny. A star many times the Sun's mass burns its hydrogen at a ferociously higher rate, blazing across the <span class=\"term\">Hertzsprung-Russell diagram</span> (HR diagram) as a hot, luminous main-sequence star and exhausting its core fuel in a few million years. A low-mass star burns modestly and can sip its hydrogen for many billions of years. That single number — mass — is what eventually decides whether a star's <span class=\"term\">stellar evolution</span> ends quietly or explosively, and it is the thread that carries this history forward to white dwarfs, neutron stars, and, at the most extreme masses, black holes.",
            zh: "核融合速率對核心溫度與壓力極為敏感，而兩者都隨恆星質量升高——因此質量幾乎決定了命運。質量是太陽數倍的恆星會以猛烈得多的速率燃燒氫，在<span class=\"term\">赫羅圖</span>（Hertzsprung-Russell diagram，簡稱 HR 圖）上呈現為明亮炙熱的主序星，並在短短數百萬年內耗盡核心燃料。低質量恆星則燃燒得從容許多，能將氫小口小口地維持數十億年。質量這一個數字，最終決定了恆星的<span class=\"term\">恆星演化</span>是平靜落幕還是劇烈終結，也是這段歷史繼續通往白矮星、中子星，乃至於在最極端質量下走向黑洞的那條線索。"
          }},
          { call: 'key', title: { en: "Fuel Is a Clock", zh: "燃料就是時鐘" }, body: {
            en: "Quantum tunnelling lets nuclei fuse despite their electric repulsion, and fusion converts a sliver of mass into the light and heat that hold a star up against its own gravity for as long as the fuel lasts. But fuel is finite, and how fast a star spends it is set by mass alone. What happens when the furnace finally runs low — the collapse of the core, the <span class=\"term\">electron degeneracy pressure</span> that can hold a <span class=\"term\">white dwarf</span> up to the <span class=\"term\">Chandrasekhar limit</span> and no further, the <span class=\"term\">supernova</span> that can leave behind a <span class=\"term\">neutron star</span> or, at the highest masses, a black hole — is where this history goes next.",
            zh: "量子穿隧讓原子核得以克服電荷斥力而融合，核融合則把一小部分質量轉化為光與熱，撐住恆星不被自身重力壓垮，直到燃料耗盡為止。但燃料是有限的，而消耗速度完全由質量決定。當熔爐終於燃料告罄——核心塌縮、<span class=\"term\">電子簡併壓力</span>能撐住<span class=\"term\">白矮星</span>直到<span class=\"term\">錢德拉塞卡極限</span>為止而無法再撐更遠、<span class=\"term\">超新星</span>可能留下一顆<span class=\"term\">中子星</span>，或者在最高質量下留下一個黑洞——這正是這段歷史接下來要走向的地方。"
          }}
        ]
      },

      // ---- 9. The Death of Massive Stars ----
      {
        id: "stellar-collapse", no: 9,
        kicker: { en: "stellar endgames", zh: "恆星終局" },
        title: { en: "The Death of Massive Stars", zh: "大質量恆星之死" },
        sub: { en: "When a star runs out of fuel, gravity always wins the argument — the only question left is what, if anything, can stop it.", zh: "當恆星耗盡燃料，重力終將贏得這場拉鋸——唯一的問題是，究竟還有什麼能夠阻止它。" },
        blocks: [
          { p: {
            en: "Every star is a suspended argument between two forces: gravity pulling inward, and the outward pressure of <span class=\"term\">nuclear fusion</span> burning in its core. For most of a star's life the argument is a stalemate — a stable structure that can shine for millions or billions of years, following a fixed path of <span class=\"term\">stellar evolution</span>. But every fuel supply runs out. When fusion stops, gravity wins outright, and what happens to the exposed core depends on nothing but one number: its mass.",
            zh: "每一顆恆星，一生都在進行一場拉鋸戰：重力向內拉扯，核心的<span class=\"term\">核融合</span>則向外推擠。在恆星生命的大部分時間裡，這場拉鋸戰打成平手——形成一個能穩定發光數百萬甚至數十億年的結構，沿著固定的<span class=\"term\">恆星演化</span>路徑前進。但燃料終究會耗盡。核融合一旦停止，重力便徹底獲勝，而裸露出來的核心接下來的命運，只取決於一個數字：它的質量。"
          }},
          { p: {
            en: "In 1930, the 19-year-old Indian physicist Subrahmanyan Chandrasekhar boarded a ship bound for Cambridge to begin his graduate studies. He spent the voyage working out the mathematics of what holds up a dead, fusion-less star: <span class=\"term\">electron degeneracy pressure</span>, a purely quantum-mechanical resistance to being squeezed, arising because no two electrons can occupy the same state. Chandrasekhar found that this pressure has a limit. Formalized in papers published between 1931 and 1935, his result showed that a <span class=\"term\">white dwarf</span> core can support itself only up to about 1.4 times the mass of the Sun.",
            zh: "1930年，年僅19歲的印度物理學家Chandrasekhar登上一艘駛往劍橋展開研究所生涯的輪船。航行途中，他推導了支撐一顆核融合已經停止的死亡恆星的力量：<span class=\"term\">電子簡併壓力</span>——一種純粹源於量子力學的抗壓力，起因於沒有兩個電子能佔據同一個量子態。Chandrasekhar發現這股壓力有其極限。這項成果整理成1931年至1935年間發表的一系列論文，指出<span class=\"term\">白矮星</span>核心能夠自我支撐的質量上限，大約是1.4倍太陽質量。"
          }},
          { eq: "MCh ≈ 1.4 M☉",
            where: {
              en: "MCh is the Chandrasekhar limit: above this mass, electron degeneracy pressure can no longer balance gravity in a stellar core, and collapse continues. M☉ denotes one solar mass.",
              zh: "MCh 為錢德拉塞卡極限：核心質量一旦超過此值，電子簡併壓力便無法再與重力抗衡，塌縮將持續進行。M☉ 代表一個太陽質量。"
            }},
          { p: {
            en: "The result was not welcomed. In 1935, Sir Arthur Eddington — then the most authoritative astrophysicist in Britain — stood up after Chandrasekhar presented his work to the Royal Astronomical Society and publicly dismissed it, declaring, “I think there should be a law of Nature to prevent a star from behaving in this absurd way!” Eddington's stature delayed serious acceptance of the Chandrasekhar limit for years. Chandrasekhar was, in fact, correct; he was awarded the Nobel Prize in Physics in 1983, nearly half a century later.",
            zh: "這項結果並未受到歡迎。1935年，當時英國最具權威的天文物理學家Eddington爵士，在Chandrasekhar於皇家天文學會發表這項研究後起身公開駁斥，宣稱:「我認為自然界應該有一條定律，禁止恆星以這種荒謬的方式行事!」憑藉其崇高地位，Eddington的反對讓錢德拉塞卡極限延遲多年才被學界認真接受。然而事實證明Chandrasekhar是對的;將近半個世紀後，他於1983年獲頒諾貝爾物理獎。"
          }},
          { p: {
            en: "The year before Eddington's rejection, two astronomers at Caltech had already leaped past the white dwarf entirely. In a short, prescient 1934 paper, Walter Baade and Fritz Zwicky proposed that a <span class=\"term\">supernova</span> — the explosive death of a massive star — marks the collapse of an ordinary stellar core into an object made almost purely of neutrons, so dense that a teaspoon of it would weigh as much as a mountain. They called it a <span class=\"term\">neutron star</span>. No such object had ever been observed; Baade and Zwicky were reasoning from physics alone, 33 years before the first one was actually detected.",
            zh: "就在Eddington駁斥事件的前一年，加州理工學院的兩位天文學家已經直接跳過白矮星、望向更遠的可能性。在1934年一篇簡短卻極具先見之明的論文中，Walter Baade與Fritz Zwicky提出:<span class=\"term\">超新星</span>——大質量恆星爆炸性死亡的過程——標誌著一顆普通恆星核心塌縮成幾乎完全由中子構成的天體，其密度之高，一茶匙的物質便重如一座山。他們將這種天體稱為<span class=\"term\">中子星</span>。當時從未有人觀測到這樣的天體;Baade與Zwicky純粹是從物理推理出發，比人類真正偵測到第一顆中子星早了33年。"
          }},
          { list: [
            { en: "White dwarf — held up by electron degeneracy pressure, stable only below the ~1.4 M☉ Chandrasekhar limit.", zh: "白矮星——由電子簡併壓力支撐，只有在約1.4倍太陽質量的錢德拉塞卡極限以下才能維持穩定。" },
            { en: "Neutron star — when electron degeneracy fails, protons and electrons are crushed together into neutrons; the star is proposed to be held up instead by neutron degeneracy pressure, as Baade and Zwicky suggested in 1934.", zh: "中子星——當電子簡併壓力失效，質子與電子被壓合成中子;學界認為改由中子簡併壓力支撐，此構想由Baade與Zwicky於1934年提出。" },
            { en: "Black hole — push the collapsing mass past even the neutron star's limit, and, as Oppenheimer and Snyder showed in 1939, nothing in general relativity stops the collapse at all.", zh: "黑洞——若塌縮的質量甚至超過中子星的極限，正如Oppenheimer與Snyder於1939年所證明，廣義相對論中沒有任何機制能夠阻止塌縮繼續進行。" }
          ]},
          { p: {
            en: "In 1939, J. Robert Oppenheimer and his student Hartland Snyder took the next step mathematically rather than observationally. In a paper titled On Continued Gravitational Contraction, they used Einstein's field equations to follow an idealized massive, spherical star as it collapsed under its own gravity with no pressure left to resist it. Their result was stark: the star does not stabilize at any radius. It contracts past the boundary where its own light can no longer climb back out to a distant observer — the <span class=\"term\">event horizon</span> — and continues falling inward without limit. Seen from far away, the star appears to freeze and fade at that horizon; seen from the star's own perspective, the collapse simply continues.",
            zh: "1939年，J. Robert Oppenheimer與他的學生Hartland Snyder從數學而非觀測的角度往前跨出一步。在題為On Continued Gravitational Contraction的論文中，他們運用愛因斯坦的場方程式，追蹤一顆理想化的大質量球形恆星，在完全沒有壓力可以抵抗自身重力的情況下持續塌縮。結果十分驚人:這顆恆星不會在任何半徑上穩定下來。它會塌縮超過自身光線再也無法向外傳到遙遠觀測者的那個邊界——也就是<span class=\"term\">事件視界</span>——並且毫無止盡地持續向內墜落。從遠方看，這顆恆星彷彿在這道視界上凝結、逐漸黯淡;但從恆星自身的角度看，塌縮不過是持續進行罷了。"
          }},
          { call: 'key', title: { en: "A black hole, before the name existed", zh: "尚未命名的黑洞" }, body: {
            en: "Oppenheimer and Snyder had, in 1939, essentially derived a collapsing version of a black hole directly from Einstein's equations — decades before the term black hole was even coined. Their collapsing star falls toward exactly the same frozen, infinitely redshifted boundary that Karl Schwarzschild had already found lurking in Einstein's equations back in 1916, as an exact, static solution. The chapters ahead turn to that solution next — the first exact geometry of a black hole, worked out from the trenches of the First World War.",
            zh: "Oppenheimer與Snyder在1939年，等於已經直接從愛因斯坦方程式推導出黑洞的塌縮版本——早在「黑洞」這個名稱被創造出來的數十年之前。他們筆下塌縮的恆星，正墜向與Karl Schwarzschild早在1916年便已在愛因斯坦方程式中發現的那個靜態精確解完全相同的邊界——同一個凝結、無限紅移的表面。本圖書館接下來的章節，將轉向這個解——第一個精確描述黑洞幾何的解，是在第一次世界大戰戰壕中推導出來的。"
          }}
        ]
      },

      // ---- 10. From Schwarzschild to Kerr-Newman: Assembling the Black Hole ----
      {
        id: "kerr-newman-family", no: 10,
        kicker: { en: "exact solutions", zh: "精確解" },
        title: { en: "From Schwarzschild to Kerr-Newman: Assembling the Black Hole", zh: "從史瓦西到 Kerr-Newman：組裝一個黑洞" },
        sub: { en: "Five physicists, forty-nine years, and one metric general enough to describe every black hole this laboratory can simulate.", zh: "五位物理學家、四十九年，以及一個足以描述本實驗室所能模擬之每一個黑洞的度規。" },
        blocks: [
          { p: {
            en: "To find where this exact geometry came from, the story rewinds forty years. Everything so far in this library has moved forward — from Kepler's laws to nuclear fusion lighting up main-sequence stars, from electron degeneracy pressure to the neutron stars and pulsars found spinning in the sky. But the exact mathematics of a black hole's spacetime was not discovered by watching stars collapse. It was worked out on paper, decades earlier, by five physicists who never saw one.",
            zh: "要找出這個精確幾何從何而來，故事得倒轉四十年。本圖書館至此所敘述的一切都是向前推進的——從克卜勒定律，到核融合點燃主序星，從電子簡併壓力，到天空中被發現正在旋轉的中子星與脈衝星。但黑洞時空的精確數學，並不是靠觀測恆星塌縮而發現的。它是由五位從未親眼見過黑洞的物理學家，早在數十年前，就在紙上推導出來的。"
          }},
          { p: {
            en: "In December 1915 — weeks after Einstein published the field equations of general relativity — the German astronomer Karl Schwarzschild found the first exact solution to them while serving as an artillery officer on the Russian front. Working through the mathematics between military duties, he mailed the result to Einstein by letter; Einstein presented it to the Prussian Academy in January 1916. Schwarzschild's solution describes the spacetime around the simplest possible mass: one with no spin and no charge. Its geometry collapses to a single defining number, now called the <span class=\"term\">Schwarzschild radius</span> — the seed of what this laboratory calls the <span class=\"term\">gravitational radius</span>. Schwarzschild never learned what his own solution implied. He died in May 1916, of a skin disease contracted at the front, only months after the letter reached Berlin.",
            zh: "1915 年 12 月——愛因斯坦發表廣義相對論場方程式僅僅數週之後——德國天文學家 Karl Schwarzschild 在俄國前線擔任砲兵軍官期間，找到了這組方程式的第一個精確解。他在軍務之餘完成推導，並以書信將結果寄給愛因斯坦；愛因斯坦於 1916 年 1 月將其呈交普魯士科學院。Schwarzschild 的解描述的是最簡單的質量所產生的時空：不自旋、不帶電。它的幾何完全由單一數字決定，也就是後來所稱的<span class=\"term\">史瓦西半徑</span>——本實驗室所用的<span class=\"term\">重力半徑</span>一詞正源於此。Schwarzschild 本人始終不知道自己的解意味著什麼：1916 年 5 月，就在信寄達柏林後僅僅數月，他便死於前線感染的皮膚疾病。"
          }},
          { list: [
            { en: "1916 — Schwarzschild solves for a non-spinning, uncharged mass; that same year Hans Reissner adds electric charge to the solution.", zh: "1916 年——Schwarzschild 求出不自旋、不帶電質量的解；同一年 Hans Reissner 將電荷加入解中。" },
            { en: "1918 — Gunnar Nordström independently arrives at the same charged solution, giving the Reissner-Nordström metric its final form.", zh: "1918 年——Gunnar Nordström 獨立得到相同的帶電解，Reissner-Nordström 度規自此定型。" },
            { en: "1963 — Roy Kerr solves the far harder case of a rotating, uncharged mass; spin breaks the spherical symmetry that made every earlier solution tractable.", zh: "1963 年——Roy Kerr 解出困難得多的旋轉、不帶電質量問題；自旋破壞了先前所有解都仰賴的球對稱性。" },
            { en: "1965 — Ezra \"Ted\" Newman and collaborators combine spin and charge into the Kerr-Newman metric, the exact solution this laboratory simulates.", zh: "1965 年——Ezra「Ted」Newman 與合作者將自旋與電荷結合，得出 Kerr-Newman 度規，也就是本實驗室所模擬的精確解。" }
          ]},
          { p: {
            en: "The 47-year gap between Schwarzschild and Kerr was not a failure of effort — dozens of physicists tried and failed in between. A non-spinning mass is spherically symmetric: the same in every direction, which reduces Einstein's equations to something a working scientist could solve by hand in wartime. A spinning mass drags the geometry around with it, so the symmetry drops from spherical to merely axial — symmetric only around the rotation axis. That single change turns ten coupled, nonlinear differential equations into a problem nobody could crack for nearly half a century. Kerr's 1963 paper, tellingly, is not titled about black holes at all; it is called \"Gravitational Field of a Spinning Mass as an Example of Algebraically Special Metrics\" — a technical side-door into a result whose importance took years to be fully appreciated.",
            zh: "從 Schwarzschild 到 Kerr 之間的 47 年空窗，並非無人嘗試——中間有數十位物理學家嘗試過都無功而返。不自旋的質量具有球對稱性：任何方向看起來都相同，這讓愛因斯坦方程式簡化到即使在戰時也能靠手算求解的程度。而自旋質量會把周圍幾何一併拖著旋轉，使對稱性從球對稱降為僅剩軸對稱——只在自轉軸方向上保持對稱。就是這一個改變，讓十個耦合的非線性微分方程式變成近半世紀無人能解的難題。耐人尋味的是，Kerr 在 1963 年的論文標題根本沒提到「黑洞」，而是叫做〈作為代數特殊度規範例的自旋質量重力場〉（Gravitational Field of a Spinning Mass as an Example of Algebraically Special Metrics）——一道技術性的側門，其重要性直到多年後才被完全體認。"
          }},
          { p: {
            en: "One more piece completed the picture. Through the following decade, Werner Israel (1967), Brandon Carter (1971), Stephen Hawking (1972) and David Robinson (1975) together proved what is now called the <span class=\"term\">no-hair theorem</span>: any stationary black hole, however it formed, is completely described from the outside by just three numbers — mass, spin, and charge. Whatever fell in, whatever shape the collapsing star had, whatever magnetic fields or asymmetries it carried — none of it survives as separately measurable information once the horizon settles down. Those three numbers are all this laboratory's black holes are made of.",
            zh: "還有一塊拼圖補齊了整個圖像。接下來的十年間，Werner Israel（1967）、Brandon Carter（1971）、Stephen Hawking（1972）與 David Robinson（1975）共同證明了現在所稱的<span class=\"term\">無毛定理</span>：任何穩態黑洞，無論它如何形成，從外部看都完全由三個數字決定——質量、自旋、電荷。無論落入了什麼、塌縮恆星原本是什麼形狀、帶有什麼磁場或不對稱性，一旦視界穩定下來，這些資訊都不再以可個別測量的形式留存。本實驗室的黑洞，就只由這三個數字構成。"
          }},
          { h: { en: "Reading order: concept, not chronology", zh: "閱讀順序：依概念而非依年代" } },
          { p: {
            en: "That makes this a good place to flag something important about what comes next. The chapters immediately following this one — on the horizon, the ergosphere, the Penrose process, the ISCO, the jets — are organized by concept, not by date. It is easy to assume that once Newman finished the mathematics in 1965, everything described in those chapters was promptly confirmed. It was not. Direct detection of <span class=\"term\">gravitational waves</span> from a binary black hole merger did not happen until September 2015, by LIGO, a <span class=\"term\">gravitational-wave detector</span> — fifty years after the Kerr-Newman metric was complete. The first actual image of a black hole's shadow — the supermassive object at the center of galaxy M87 — was not released until April 2019, by the <span class=\"term\">Event Horizon Telescope</span> (EHT). Some of what follows is 1970s theorem; some of it is observation from the last decade; a few pieces are still untested. The concepts are presented in the order that makes them easiest to understand, not the order in which humanity found out they were true.",
            zh: "這也是提醒讀者一件重要事情的好時機。緊接在本章之後的各章——關於事件視界、能層、彭羅斯過程、最內穩定圓軌道（ISCO）、噴流——都是依概念編排，而非依年代。很容易誤以為 Newman 在 1965 年完成數學推導之後，這些章節所描述的一切便隨即獲得證實。事實並非如此。雙黑洞併合所發出的<span class=\"term\">重力波</span>，直到 2015 年 9 月才由<span class=\"term\">重力波偵測器</span> LIGO 首度直接偵測到——距 Kerr-Newman 度規完成已有五十年。黑洞陰影的第一張真實影像——星系 M87 中心的超大質量天體——則要到 2019 年 4 月才由<span class=\"term\">事件視界望遠鏡</span>（Event Horizon Telescope, EHT）公布。接下來的內容，有些是 1970 年代就證明完畢的定理，有些是最近十年才有的觀測結果，還有少數至今仍未經檢驗。這些概念的編排順序，是依照最容易理解的邏輯，而非人類發現它們為真的先後順序。"
          }},
          { call: 'key', title: { en: "One metric, three numbers, decades apart", zh: "一個度規、三個數字，相隔數十年" }, body: {
            en: "Five names span the gap between Schwarzschild's 1915 letter from the front and Newman's 1965 metric: Schwarzschild, Reissner and Nordström, Kerr, Newman. Together with the no-hair theorem proved by Israel, Carter, Hawking and Robinson, they leave a single exact geometry — set by mass, spin, and charge alone — as the complete description of every stationary black hole physics allows. That geometry is what the next chapters take apart piece by piece. Read them as a map of one finished equation, not as a timeline of discovery.",
            zh: "從 Schwarzschild 1915 年在前線寄出的信，到 Newman 1965 年完成的度規，中間橫跨了五個名字：Schwarzschild、Reissner 與 Nordström、Kerr、Newman。再加上 Israel、Carter、Hawking 與 Robinson 所證明的無毛定理，最終只剩下一個精確幾何——僅由質量、自旋、電荷三個數字決定——作為物理學所允許的每一個穩態黑洞的完整描述。接下來的章節，就是把這個幾何逐塊拆解開來閱讀。請把它們當作一個已經完成的方程式的地圖，而不是一份發現先後的年表。"
          }}
        ]
      },

      // ---- 11. Kerr-Newman spacetime & the three parameters ----
      {
        id: 'kn-spacetime', no: 11,
        kicker: { en: 'foundations', zh: '基礎', ja: '基礎', ko: '기초', de: 'Grundlagen', fr: 'fondements', es: 'fundamentos', it: 'fondamenti' },
        title: { en: 'Spacetime and the three parameters', zh: '時空與三個參數',
          ja: '時空と三つのパラメータ', ko: '시공간과 세 매개변수',
          de: 'Die Raumzeit und die drei Parameter', fr: 'L’espace-temps et les trois paramètres',
          es: 'El espacio-tiempo y los tres parámetros', it: 'Lo spaziotempo e i tre parametri' },
        sub: { en: 'Mass M, spin a, charge Q — and nothing else.', zh: '質量 M、自轉 a、電荷 Q——僅此而已。',
          ja: '質量 M、スピン a、電荷 Q——それだけ。', ko: '질량 M, 스핀 a, 전하 Q——그뿐.',
          de: 'Masse M, Spin a, Ladung Q — und sonst nichts.', fr: 'Masse M, spin a, charge Q — et rien d’autre.',
          es: 'Masa M, espín a, carga Q — y nada más.', it: 'Massa M, spin a, carica Q — e nient’altro.' },
        blocks: [
          { p: {
            en: 'A black hole is not an object sitting in space; it is a shape <i>of</i> space and time. General relativity encodes that shape in a <span class="term">metric</span> — a rule for measuring distances and durations near the hole. For the Kerr-Newman family the metric depends on just <var>M</var>, <var>a</var> and <var>Q</var>.',
            zh: '黑洞不是擺在空間裡的一個物體，而是時間與空間<i>本身</i>的一種形狀。廣義相對論用 <span class="term">度規（metric）</span>描述這個形狀——一套量度黑洞附近距離與時間的規則。對 Kerr-Newman 族而言，度規只取決於 <var>M</var>、<var>a</var> 與 <var>Q</var>。',
            ja: 'ブラックホールは空間の中に置かれた物体ではなく、時間と空間<i>そのもの</i>の形です。一般相対論はその形を<span class="term">計量（metric）</span>で表します——ブラックホール近傍の距離と時間を測る規則です。Kerr-Newman 族では、計量は <var>M</var>・<var>a</var>・<var>Q</var> のみに依存します。',
            ko: '블랙홀은 공간 속에 놓인 물체가 아니라, 시간과 공간 <i>그 자체</i>의 한 형태입니다. 일반 상대성 이론은 그 형태를 <span class="term">계량(metric)</span>으로 기술합니다——블랙홀 근처의 거리와 시간을 재는 규칙입니다. Kerr-Newman 족에서 계량은 오직 <var>M</var>, <var>a</var>, <var>Q</var> 에만 의존합니다.',
            de: 'Ein Schwarzes Loch ist kein Objekt, das im Raum sitzt; es ist eine Form <i>von</i> Raum und Zeit. Die allgemeine Relativitätstheorie codiert diese Form in einer <span class="term">Metrik</span> — einer Regel, um Abstände und Zeitdauern nahe dem Loch zu messen. Bei der Kerr-Newman-Familie hängt die Metrik nur von <var>M</var>, <var>a</var> und <var>Q</var> ab.',
            fr: 'Un trou noir n’est pas un objet posé dans l’espace ; c’est une forme <i>de</i> l’espace et du temps. La relativité générale encode cette forme dans une <span class="term">métrique</span> — une règle pour mesurer distances et durées près du trou. Pour la famille de Kerr-Newman, la métrique ne dépend que de <var>M</var>, <var>a</var> et <var>Q</var>.',
            es: 'Un agujero negro no es un objeto que reposa en el espacio; es una forma <i>del</i> espacio y el tiempo. La relatividad general codifica esa forma en una <span class="term">métrica</span> — una regla para medir distancias y duraciones cerca del agujero. Para la familia de Kerr-Newman, la métrica solo depende de <var>M</var>, <var>a</var> y <var>Q</var>.',
            it: 'Un buco nero non è un oggetto posato nello spazio; è una forma <i>dello</i> spazio e del tempo. La relatività generale codifica quella forma in una <span class="term">metrica</span> — una regola per misurare distanze e durate vicino al buco. Per la famiglia di Kerr-Newman, la metrica dipende solo da <var>M</var>, <var>a</var> e <var>Q</var>.'
          }},
          { p: {
            en: 'Two combinations do most of the work. The mass sets the overall size. The spin and charge fight against gravity near the centre, and they enter the geometry through the discriminant below — the quantity under the square root that decides whether a horizon even exists.',
            zh: '其中兩種組合最關鍵。質量決定整體大小；自轉與電荷在中心附近與重力對抗，並透過下方的判別式進入幾何——也就是根號內那個決定「視界是否存在」的量。',
            ja: '主に二つの組み合わせが効きます。質量は全体の大きさを決めます。スピンと電荷は中心付近で重力に抗い、下の判別式——平方根の中の量で、地平面が存在するかどうかを決める——を通じて幾何に入ります。',
            ko: '주로 두 조합이 일을 합니다. 질량은 전체 크기를 정합니다. 스핀과 전하는 중심 근처에서 중력에 맞서며, 아래 판별식——제곱근 안의 양으로, 지평선이 존재하는지를 결정합니다——을 통해 기하에 들어갑니다.',
            de: 'Zwei Kombinationen leisten die meiste Arbeit. Die Masse legt die Gesamtgröße fest. Spin und Ladung wirken nahe dem Zentrum der Gravitation entgegen und gehen über die Diskriminante unten in die Geometrie ein — die Größe unter der Wurzel, die entscheidet, ob überhaupt ein Horizont existiert.',
            fr: 'Deux combinaisons font l’essentiel du travail. La masse fixe la taille globale. Le spin et la charge s’opposent à la gravité près du centre et entrent dans la géométrie via le discriminant ci-dessous — la quantité sous la racine qui décide si un horizon existe seulement.',
            es: 'Dos combinaciones hacen casi todo el trabajo. La masa fija el tamaño global. El espín y la carga se oponen a la gravedad cerca del centro y entran en la geometría a través del discriminante de abajo — la cantidad bajo la raíz que decide si siquiera existe un horizonte.',
            it: 'Due combinazioni svolgono gran parte del lavoro. La massa fissa la dimensione complessiva. Spin e carica contrastano la gravità vicino al centro ed entrano nella geometria tramite il discriminante qui sotto — la quantità sotto radice che decide se un orizzonte esista affatto.'
          }},
          { eq: 'r± = M ± √( M² − a² − Q² )',
            where: {
              en: 'The outer (+) and inner (-) horizon radii. A horizon exists only while M^2 >= a^2 + Q^2. Spin and charge both shrink it.',
              zh: '外（+）與內（−）視界半徑。唯有 M² ≥ a² + Q² 時視界才存在。自轉與電荷都會使其縮小。',
              ja: '外側（+）と内側（−）の地平面半径。地平面は M^2 >= a^2 + Q^2 のときだけ存在します。スピンも電荷もそれを縮めます。',
              ko: '바깥쪽(+)과 안쪽(−) 지평선 반지름. 지평선은 M^2 >= a^2 + Q^2 일 때만 존재합니다. 스핀과 전하 모두 이를 줄입니다.',
              de: 'Die äußeren (+) und inneren (-) Horizontradien. Ein Horizont existiert nur, solange M^2 >= a^2 + Q^2. Spin und Ladung verkleinern ihn beide.',
              fr: 'Les rayons d’horizon externe (+) et interne (-). Un horizon n’existe que tant que M^2 >= a^2 + Q^2. Le spin et la charge le réduisent tous deux.',
              es: 'Los radios de horizonte externo (+) e interno (-). Un horizonte solo existe mientras M^2 >= a^2 + Q^2. El espín y la carga lo reducen ambos.',
              it: 'I raggi dell’orizzonte esterno (+) e interno (-). Un orizzonte esiste solo finché M^2 >= a^2 + Q^2. Spin e carica lo riducono entrambi.'
            }},
          { p: {
            en: 'When <var>M&sup2; = a&sup2; + Q&sup2;</var> the two horizons merge into a single <span class="term">extremal</span> black hole — spinning or charged as hard as it possibly can. Push further and the horizon vanishes, exposing the singularity. The lab’s CLASS chip warns you as you approach that edge.',
            zh: '當 <var>M² = a² + Q²</var> 時，內外視界合而為一，成為<span class="term">極端（extremal）</span>黑洞——自轉或帶電達到極限。再往前推，視界便消失，奇異點外露。實驗室的 CLASS 標籤會在你逼近這條邊界時提出警告。',
            ja: '<var>M&sup2; = a&sup2; + Q&sup2;</var> のとき、二つの地平面は一つに合体し、<span class="term">極限（extremal）</span>ブラックホールになります——可能な限り速く回転、または帯電した状態です。さらに押し進めると地平面は消え、特異点が露わになります。研究室の CLASS チップはこの縁に近づくと警告します。',
            ko: '<var>M&sup2; = a&sup2; + Q&sup2;</var> 일 때 두 지평선은 하나로 합쳐져 <span class="term">극단(extremal)</span> 블랙홀이 됩니다——가능한 한 빠르게 회전하거나 대전된 상태입니다. 더 밀어붙이면 지평선이 사라지고 특이점이 드러납니다. 실험실의 CLASS 칩은 이 경계에 다가가면 경고합니다.',
            de: 'Wenn <var>M&sup2; = a&sup2; + Q&sup2;</var>, verschmelzen die beiden Horizonte zu einem einzigen <span class="term">extremalen</span> Schwarzen Loch — so schnell rotierend oder so stark geladen wie nur möglich. Treibt man es weiter, verschwindet der Horizont und gibt die Singularität frei. Der CLASS-Chip des Labors warnt dich, sobald du diesen Rand erreichst.',
            fr: 'Quand <var>M&sup2; = a&sup2; + Q&sup2;</var>, les deux horizons fusionnent en un unique trou noir <span class="term">extrémal</span> — en rotation ou chargé au maximum possible. Poussez davantage et l’horizon disparaît, exposant la singularité. La puce CLASS du laboratoire vous avertit à l’approche de cette limite.',
            es: 'Cuando <var>M&sup2; = a&sup2; + Q&sup2;</var>, los dos horizontes se fusionan en un único agujero negro <span class="term">extremal</span> — girando o cargado tanto como es posible. Empuja más allá y el horizonte desaparece, exponiendo la singularidad. El chip CLASS del laboratorio te advierte al acercarte a ese borde.',
            it: 'Quando <var>M&sup2; = a&sup2; + Q&sup2;</var>, i due orizzonti si fondono in un unico buco nero <span class="term">estremale</span> — in rotazione o carico al massimo possibile. Spingi oltre e l’orizzonte svanisce, esponendo la singolarità. Il chip CLASS del laboratorio ti avverte quando ti avvicini a quel limite.'
          }},
          { call: 'key', body: {
            en: 'Everything else in this library — horizons, ergosphere, ISCO, jets — is a consequence of these three numbers. Change M, a or Q in the lab and every surface redraws itself.',
            zh: '本圖書館其餘的一切——視界、能層、ISCO、噴流——都是這三個數字的後果。在實驗室中改變 M、a 或 Q，所有界面都會跟著重畫。',
            ja: '本書の他のすべて——地平面、エルゴ球、ISCO、ジェット——はこの三つの数の帰結です。研究室で M・a・Q を変えれば、すべての面が描き直されます。',
            ko: '이 입문서의 다른 모든 것——지평선, 에르고구, ISCO, 제트——은 이 세 수의 결과입니다. 실험실에서 M, a, Q 를 바꾸면 모든 면이 다시 그려집니다.',
            de: 'Alles andere in dieser Einführung — Horizonte, Ergosphäre, ISCO, Jets — ist eine Folge dieser drei Zahlen. Ändere M, a oder Q im Labor, und jede Fläche zeichnet sich neu.',
            fr: 'Tout le reste de ce guide — horizons, ergosphère, ISCO, jets — découle de ces trois nombres. Changez M, a ou Q dans le laboratoire et chaque surface se redessine.',
            es: 'Todo lo demás en esta introducción — horizontes, ergosfera, ISCO, chorros — es consecuencia de estos tres números. Cambia M, a o Q en el laboratorio y cada superficie se redibuja.',
            it: 'Tutto il resto di questa introduzione — orizzonti, ergosfera, ISCO, getti — è conseguenza di questi tre numeri. Cambia M, a o Q nel laboratorio e ogni superficie si ridisegna.'
          }},
          { call: 'lab', body: {
            en: 'Use the left panel sliders for <b>M</b>, <b>a</b> and <b>Q</b>. Watch the CLASS chip (top-right): it flips to a warning as M&sup2; falls below a&sup2; + Q&sup2; (a "naked" singularity).',
            zh: '使用左側面板的 <b>M</b>、<b>a</b>、<b>Q</b> 滑桿。注意右上角的 CLASS 標籤：當 M² 低於 a² + Q² 時，它會切換成警告（即「裸」奇異點）。',
            ja: '左パネルの <b>M</b>・<b>a</b>・<b>Q</b> スライダーを使います。右上の CLASS チップに注目：M&sup2; が a&sup2; + Q&sup2; を下回ると警告に変わります（「裸の」特異点）。',
            ko: '왼쪽 패널의 <b>M</b>, <b>a</b>, <b>Q</b> 슬라이더를 사용하세요. 오른쪽 위 CLASS 칩을 보세요: M&sup2; 가 a&sup2; + Q&sup2; 아래로 떨어지면 경고로 바뀝니다(「벌거벗은」 특이점).',
            de: 'Verwende die Schieberegler für <b>M</b>, <b>a</b> und <b>Q</b> im linken Panel. Beobachte den CLASS-Chip (oben rechts): Er schlägt in eine Warnung um, sobald M&sup2; unter a&sup2; + Q&sup2; fällt (eine „nackte“ Singularität).',
            fr: 'Utilisez les curseurs <b>M</b>, <b>a</b> et <b>Q</b> du panneau de gauche. Observez la puce CLASS (en haut à droite) : elle bascule en avertissement dès que M&sup2; passe sous a&sup2; + Q&sup2; (une singularité « nue »).',
            es: 'Usa los controles deslizantes de <b>M</b>, <b>a</b> y <b>Q</b> del panel izquierdo. Observa el chip CLASS (arriba a la derecha): cambia a una advertencia cuando M&sup2; cae por debajo de a&sup2; + Q&sup2; (una singularidad «desnuda»).',
            it: 'Usa i cursori <b>M</b>, <b>a</b> e <b>Q</b> del pannello sinistro. Osserva il chip CLASS (in alto a destra): passa a un avviso quando M&sup2; scende sotto a&sup2; + Q&sup2; (una singolarità «nuda»).'
          }}
        ]
      },

      // ---- 12. Event horizon ----
      {
        id: 'horizons', no: 12,
        kicker: { en: 'the point of no return', zh: '不歸點', ja: '帰還不能点', ko: '돌아올 수 없는 지점',
          de: 'der Punkt ohne Wiederkehr', fr: 'le point de non-retour', es: 'el punto sin retorno', it: 'il punto di non ritorno' },
        title: { en: 'The event horizon', zh: '事件視界', ja: '事象の地平面', ko: '사건의 지평선',
          de: 'Der Ereignishorizont', fr: 'L’horizon des événements', es: 'El horizonte de sucesos', it: 'L’orizzonte degli eventi' },
        sub: { en: 'A one-way surface in spacetime, not a wall.', zh: '時空中的單向界面，而非一道牆。',
          ja: '時空における一方通行の面であって、壁ではない。', ko: '시공간의 일방통행 면이지, 벽이 아니다.',
          de: 'Eine Einbahnfläche in der Raumzeit, keine Wand.', fr: 'Une surface à sens unique dans l’espace-temps, pas un mur.',
          es: 'Una superficie de un solo sentido en el espacio-tiempo, no un muro.', it: 'Una superficie a senso unico nello spaziotempo, non un muro.' },
        blocks: [
          { p: {
            en: 'The <span class="term">event horizon</span> at <var>r&#x208A;</var> is the surface of no return. Cross it and every future-pointing path leads inward; even light aimed straight out falls back. Nothing dramatic happens locally as you cross — there is no wall — but the causal structure has tipped over so that "out" no longer exists in your future.',
            zh: '位於 <var>r&#x208A;</var> 的<span class="term">事件視界</span>是不歸的界面。一旦越過，所有指向未來的路徑都通往內部；連筆直朝外射出的光也會落回。越界當下在局部不會發生任何戲劇性的事——沒有牆——但因果結構已經傾倒，使得「向外」不再存在於你的未來之中。',
            ja: '<var>r&#x208A;</var> にある<span class="term">事象の地平面</span>は帰還不能の面です。これを越えると、未来へ向かうあらゆる経路は内側へ通じます。まっすぐ外へ放った光さえ落ち戻ります。越える瞬間、局所的には劇的なことは何も起こりません——壁はありません——が、因果構造が倒れ込み、「外」はもはやあなたの未来に存在しなくなります。',
            ko: '<var>r&#x208A;</var> 에 있는 <span class="term">사건의 지평선</span>은 돌아올 수 없는 면입니다. 이를 넘으면 미래를 향한 모든 경로가 안쪽으로 향합니다. 곧장 밖으로 쏜 빛조차 되돌아 떨어집니다. 넘는 순간 국소적으로는 극적인 일이 전혀 일어나지 않습니다——벽은 없습니다——그러나 인과 구조가 기울어져 「바깥」은 더 이상 당신의 미래에 존재하지 않게 됩니다.',
            de: 'Der <span class="term">Ereignishorizont</span> bei <var>r&#x208A;</var> ist die Fläche ohne Wiederkehr. Überquere ihn, und jeder in die Zukunft weisende Pfad führt nach innen; selbst geradeaus nach außen gerichtetes Licht fällt zurück. Lokal geschieht beim Überqueren nichts Dramatisches — es gibt keine Wand —, doch die Kausalstruktur ist umgekippt, sodass „außen“ in deiner Zukunft nicht mehr existiert.',
            fr: 'L’<span class="term">horizon des événements</span> à <var>r&#x208A;</var> est la surface de non-retour. Franchissez-le et tout chemin orienté vers le futur mène vers l’intérieur ; même la lumière dirigée droit vers l’extérieur retombe. Localement, rien de dramatique ne se produit au passage — il n’y a pas de mur — mais la structure causale a basculé, de sorte que « dehors » n’existe plus dans votre futur.',
            es: 'El <span class="term">horizonte de sucesos</span> en <var>r&#x208A;</var> es la superficie sin retorno. Crúzalo y todo camino dirigido al futuro lleva hacia dentro; incluso la luz apuntada recto hacia fuera vuelve a caer. Localmente no ocurre nada dramático al cruzar — no hay muro — pero la estructura causal se ha volcado, de modo que «fuera» ya no existe en tu futuro.',
            it: 'L’<span class="term">orizzonte degli eventi</span> a <var>r&#x208A;</var> è la superficie di non ritorno. Attraversalo e ogni cammino diretto al futuro porta verso l’interno; persino la luce puntata dritta verso l’esterno ricade. Localmente, attraversandolo non accade nulla di drammatico — non c’è alcun muro — ma la struttura causale si è ribaltata, così che «fuori» non esiste più nel tuo futuro.'
          }},
          { fig: `
  <svg viewBox="0 0 640 300" role="img" aria-label="Light cones tipping over at the horizon">
    <line class="dia-axis" x1="60" y1="250" x2="600" y2="250"/>
    <text class="dia-lbl-dim" x="560" y="270">r &#x2192;</text>
    <line class="dia-horizon" x1="300" y1="40" x2="300" y2="250"/>
    <text class="dia-lbl-accent" x="278" y="32">r&#x208A;</text>
    <g class="dia-path" fill="var(--amber)" fill-opacity="0.10">
      <path d="M120,200 L150,150 L90,150 Z"/>
      <path d="M220,200 L262,160 L196,168 Z"/>
      <path d="M380,200 L360,150 L420,178 Z"/>
      <path d="M480,200 L452,156 L520,192 Z"/>
    </g>
    <g class="dia-lbl-dim">
      <text x="96" y="220">far away</text>
      <text x="196" y="220">tilting</text>
      <text x="350" y="220">inside</text>
    </g>
    <text class="dia-lbl" x="100" y="60">light cones tip toward r&#x208A; as you fall in;</text>
    <text class="dia-lbl" x="100" y="80">inside, both edges point inward.</text>
  </svg>`, cap: {
            en: '<b>Tipping light cones.</b> Far out, you can move either way. Near r&#x208A; the future cone tilts inward until, inside, every path ends at the centre.',
            zh: '<b>傾倒的光錐。</b>在遠處你可朝兩邊移動；逼近 r&#x208A; 時未來光錐向內傾斜，到了內部，每條路徑都終結於中心。',
            ja: '<b>傾く光円錐。</b>遠方ではどちらへも進めます。r&#x208A; に近づくと未来円錐は内側へ傾き、内部ではあらゆる経路が中心で終わります。',
            ko: '<b>기울어지는 빛원뿔.</b> 멀리서는 어느 쪽으로든 갈 수 있습니다. r&#x208A; 에 가까워지면 미래 원뿔이 안쪽으로 기울고, 내부에서는 모든 경로가 중심에서 끝납니다.',
            de: '<b>Kippende Lichtkegel.</b> Weit draußen kannst du dich in beide Richtungen bewegen. Nahe r&#x208A; neigt sich der Zukunftskegel nach innen, bis innen jeder Pfad im Zentrum endet.',
            fr: '<b>Cônes de lumière qui basculent.</b> Loin, vous pouvez aller dans les deux sens. Près de r&#x208A;, le cône futur s’incline vers l’intérieur jusqu’à ce que, à l’intérieur, tout chemin finisse au centre.',
            es: '<b>Conos de luz que se inclinan.</b> Lejos, puedes moverte en ambos sentidos. Cerca de r&#x208A; el cono futuro se inclina hacia dentro hasta que, dentro, todo camino termina en el centro.',
            it: '<b>Coni di luce che si inclinano.</b> Lontano, puoi muoverti in entrambi i versi. Vicino a r&#x208A; il cono futuro si inclina verso l’interno finché, all’interno, ogni cammino termina al centro.'
          }},
          { p: {
            en: 'A rotating or charged hole has <i>two</i> horizons: the outer <var>r&#x208A;</var> we can see, and an inner <var>r&#x208B;</var> hidden within. Adding spin or charge pulls them together; at the extremal limit they touch and the horizon is on the verge of disappearing.',
            zh: '旋轉或帶電的黑洞有<i>兩個</i>視界：我們看得到的外視界 <var>r&#x208A;</var>，以及藏在內部的內視界 <var>r&#x208B;</var>。加入自轉或電荷會把它們拉近；在極端極限時兩者相接，視界瀕臨消失。',
            ja: '回転または帯電したブラックホールには<i>二つ</i>の地平面があります。私たちが見る外側の <var>r&#x208A;</var> と、その内に隠れた内側の <var>r&#x208B;</var> です。スピンや電荷を加えると両者は近づき、極限ではそれらが接して地平面は消える寸前になります。',
            ko: '회전하거나 대전된 블랙홀에는 <i>두 개</i>의 지평선이 있습니다. 우리가 보는 바깥쪽 <var>r&#x208A;</var> 와 그 안에 숨은 안쪽 <var>r&#x208B;</var> 입니다. 스핀이나 전하를 더하면 둘이 가까워지고, 극단 한계에서는 맞닿아 지평선이 사라지기 직전이 됩니다.',
            de: 'Ein rotierendes oder geladenes Loch hat <i>zwei</i> Horizonte: den äußeren <var>r&#x208A;</var>, den wir sehen können, und einen inneren <var>r&#x208B;</var>, der darin verborgen ist. Spin oder Ladung ziehen sie zusammen; an der extremalen Grenze berühren sie sich und der Horizont steht kurz vor dem Verschwinden.',
            fr: 'Un trou en rotation ou chargé possède <i>deux</i> horizons : l’externe <var>r&#x208A;</var> que nous voyons, et un interne <var>r&#x208B;</var> caché à l’intérieur. Ajouter du spin ou de la charge les rapproche ; à la limite extrémale ils se touchent et l’horizon est sur le point de disparaître.',
            es: 'Un agujero en rotación o cargado tiene <i>dos</i> horizontes: el externo <var>r&#x208A;</var> que vemos y uno interno <var>r&#x208B;</var> oculto dentro. Añadir espín o carga los acerca; en el límite extremal se tocan y el horizonte está a punto de desaparecer.',
            it: 'Un buco in rotazione o carico ha <i>due</i> orizzonti: quello esterno <var>r&#x208A;</var> che vediamo e uno interno <var>r&#x208B;</var> nascosto all’interno. Aggiungere spin o carica li avvicina; al limite estremale si toccano e l’orizzonte è sul punto di scomparire.'
          }},
          { eq: 'A = 4π ( r₊² + a² )',
            where: {
              en: 'The horizon’s area. Hawking’s theorem says A never decreases in classical processes — the closest thing a black hole has to entropy.',
              zh: '視界的面積。霍金定理指出，在古典過程中 A 永不減少——這是黑洞最接近「熵」的量。',
              ja: '地平面の面積。ホーキングの定理によれば、古典的な過程で A は決して減少しません——ブラックホールがもつ「エントロピー」に最も近い量です。',
              ko: '지평선의 면적. 호킹의 정리에 따르면 고전적 과정에서 A 는 결코 감소하지 않습니다——블랙홀이 가진 「엔트로피」에 가장 가까운 양입니다.',
              de: 'Die Fläche des Horizonts. Hawkings Theorem besagt, dass A in klassischen Prozessen nie abnimmt — das, was einem Schwarzen Loch am nächsten an Entropie kommt.',
              fr: 'L’aire de l’horizon. Le théorème de Hawking affirme que A ne décroît jamais dans les processus classiques — ce qui se rapproche le plus d’une entropie pour un trou noir.',
              es: 'El área del horizonte. El teorema de Hawking dice que A nunca decrece en procesos clásicos — lo más parecido a una entropía que tiene un agujero negro.',
              it: 'L’area dell’orizzonte. Il teorema di Hawking afferma che A non diminuisce mai nei processi classici — ciò che più si avvicina a un’entropia per un buco nero.'
            }},
          { call: 'lab', body: {
            en: 'Toggle <b>HORIZON</b> to draw r&#x208A; (solid) and r&#x208B; (dashed). Raise <b>a</b> or <b>Q</b> and watch the two circles approach each other.',
            zh: '開啟 <b>HORIZON</b> 以繪出 r&#x208A;（實線）與 r&#x208B;（虛線）。提高 <b>a</b> 或 <b>Q</b>，看著兩個圓彼此靠近。',
            ja: '<b>HORIZON</b> を切り替えて r&#x208A;（実線）と r&#x208B;（破線）を描きます。<b>a</b> または <b>Q</b> を上げ、二つの円が互いに近づくのを見てください。',
            ko: '<b>HORIZON</b> 을 켜서 r&#x208A;(실선)과 r&#x208B;(점선)을 그리세요. <b>a</b> 또는 <b>Q</b> 를 올리고 두 원이 서로 가까워지는 것을 보세요.',
            de: 'Schalte <b>HORIZON</b> ein, um r&#x208A; (durchgezogen) und r&#x208B; (gestrichelt) zu zeichnen. Erhöhe <b>a</b> oder <b>Q</b> und beobachte, wie sich die beiden Kreise einander nähern.',
            fr: 'Activez <b>HORIZON</b> pour tracer r&#x208A; (trait plein) et r&#x208B; (pointillés). Augmentez <b>a</b> ou <b>Q</b> et regardez les deux cercles se rapprocher.',
            es: 'Activa <b>HORIZON</b> para dibujar r&#x208A; (línea continua) y r&#x208B; (discontinua). Sube <b>a</b> o <b>Q</b> y observa cómo los dos círculos se acercan.',
            it: 'Attiva <b>HORIZON</b> per disegnare r&#x208A; (linea continua) e r&#x208B; (tratteggiata). Aumenta <b>a</b> o <b>Q</b> e osserva i due cerchi avvicinarsi.'
          }}
        ]
      },

      // ---- 13. Ergosphere & Penrose process ----
      {
        id: 'ergosphere', no: 13,
        kicker: { en: 'extracting energy', zh: '能量萃取', ja: 'エネルギーの抽出', ko: '에너지 추출',
          de: 'Energie gewinnen', fr: 'extraire de l’énergie', es: 'extraer energía', it: 'estrarre energia' },
        title: { en: 'The ergosphere and the Penrose process', zh: '能層與彭羅斯過程',
          ja: 'エルゴ球とペンローズ過程', ko: '에르고구와 펜로즈 과정',
          de: 'Die Ergosphäre und der Penrose-Prozess', fr: 'L’ergosphère et le processus de Penrose',
          es: 'La ergosfera y el proceso de Penrose', it: 'L’ergosfera e il processo di Penrose' },
        sub: { en: 'A region where you cannot stand still — and can mine spin energy.', zh: '一個你無法靜止其中、卻能開採自轉能量的區域。',
          ja: '静止できず、しかも自転エネルギーを採掘できる領域。', ko: '가만히 있을 수 없으면서도 스핀 에너지를 캐낼 수 있는 영역.',
          de: 'Eine Region, in der man nicht stillstehen kann — und Rotationsenergie abbauen kann.',
          fr: 'Une région où l’on ne peut rester immobile — et où l’on peut extraire l’énergie de rotation.',
          es: 'Una región donde no puedes quedarte quieto — y puedes extraer energía de rotación.',
          it: 'Una regione dove non puoi stare fermo — e puoi estrarre energia di rotazione.' },
        blocks: [
          { p: {
            en: 'Outside the horizon of a spinning hole lies the <span class="term">ergosphere</span>. Inside it, frame dragging (Chapter 14) is so strong that <b>no observer can remain at rest</b> relative to distant stars — you are forced to co-rotate, even moving at the speed of light against the spin. Yet you can still escape: the horizon is deeper in.',
            zh: '旋轉黑洞的視界之外環繞著<span class="term">能層（ergosphere）</span>。在其中，參考系拖曳（第 14 章）強到<b>沒有任何觀測者能相對遠方恆星保持靜止</b>——你被迫隨之共轉，即使以光速逆著自轉方向移動也一樣。但你仍可逃離：視界還在更深處。',
            ja: '回転するブラックホールの地平面の外側に<span class="term">エルゴ球（ergosphere）</span>が広がります。その内部では参照系の引きずり（第14章）が非常に強く、<b>どの観測者も遠方の星に対して静止していられません</b>——自転に逆らって光速で動いても、共回転を強いられます。それでも脱出は可能です。地平面はさらに奥にあります。',
            ko: '회전하는 블랙홀의 지평선 바깥에 <span class="term">에르고구(ergosphere)</span>가 펼쳐집니다. 그 안에서는 좌표계 끌림(14장)이 너무 강해 <b>어떤 관측자도 먼 별에 대해 정지해 있을 수 없습니다</b>——스핀을 거슬러 광속으로 움직여도 함께 회전하도록 강요받습니다. 그래도 탈출은 가능합니다. 지평선은 더 깊은 곳에 있습니다.',
            de: 'Außerhalb des Horizonts eines rotierenden Lochs liegt die <span class="term">Ergosphäre</span>. In ihr ist das Mitführen der Bezugssysteme (Kapitel 14) so stark, dass <b>kein Beobachter relativ zu fernen Sternen in Ruhe bleiben kann</b> — du wirst zum Mitrotieren gezwungen, selbst wenn du dich mit Lichtgeschwindigkeit gegen den Spin bewegst. Dennoch kannst du entkommen: Der Horizont liegt tiefer.',
            fr: 'Au-delà de l’horizon d’un trou en rotation s’étend l’<span class="term">ergosphère</span>. À l’intérieur, l’entraînement des référentiels (chapitre 14) est si fort qu’<b>aucun observateur ne peut rester au repos</b> par rapport aux étoiles lointaines — vous êtes forcé de co-tourner, même en vous déplaçant à la vitesse de la lumière contre le spin. Pourtant, vous pouvez encore vous échapper : l’horizon est plus profond.',
            es: 'Más allá del horizonte de un agujero en rotación se extiende la <span class="term">ergosfera</span>. Dentro de ella, el arrastre de los sistemas de referencia (capítulo 14) es tan intenso que <b>ningún observador puede permanecer en reposo</b> respecto a las estrellas lejanas — te ves obligado a co-rotar, incluso moviéndote a la velocidad de la luz contra el espín. Aun así puedes escapar: el horizonte está más adentro.',
            it: 'Oltre l’orizzonte di un buco rotante si estende l’<span class="term">ergosfera</span>. Al suo interno, il trascinamento dei sistemi di riferimento (capitolo 14) è così forte che <b>nessun osservatore può restare in quiete</b> rispetto alle stelle lontane — sei costretto a co-ruotare, anche muovendoti alla velocità della luce contro lo spin. Eppure puoi ancora fuggire: l’orizzonte è più in profondità.'
          }},
          { fig: `
  <svg viewBox="0 0 640 320" role="img" aria-label="Oblate ergosphere meridional cross-section">
    <g transform="translate(230,160)">
      <ellipse class="dia-ergo" rx="120" ry="78"/>
      <circle class="dia-bh" r="78"/>
      <circle class="dia-horizon" r="78"/>
      <line class="dia-axis" x1="0" y1="-110" x2="0" y2="110" stroke-dasharray="3 4"/>
      <circle r="2.4" fill="var(--warn)"/>
      <text class="dia-lbl-dim" x="-18" y="-118">spin axis</text>
    </g>
    <g>
      <line class="dia-axis" x1="350" y1="160" x2="430" y2="160"/>
      <text class="dia-lbl-accent" x="436" y="150">r&#x208A; (poles touch)</text>
      <line class="dia-axis" x1="350" y1="120" x2="430" y2="110"/>
      <text class="dia-lbl" x="436" y="106" fill="var(--violet)">static limit</text>
      <text class="dia-lbl-dim" x="436" y="200">ergosphere bulges</text>
      <text class="dia-lbl-dim" x="436" y="216">at the equator</text>
    </g>
  </svg>`, cap: {
            en: '<b>Meridional slice.</b> The ergosphere (violet) touches the horizon at the poles and bulges out at the equator — an oblate shell. In the lab’s equatorial view it appears as a ring outside r&#x208A;.',
            zh: '<b>子午面切片。</b>能層（紫）在兩極與視界相接、在赤道向外鼓出——呈扁球殼狀。在實驗室的赤道視角中，它顯示為 r&#x208A; 之外的一圈環。',
            ja: '<b>子午面の切片。</b>エルゴ球（紫）は両極で地平面に接し、赤道で外へ膨らみます——扁平な殻です。研究室の赤道視点では r&#x208A; の外側のリングとして現れます。',
            ko: '<b>자오면 단면.</b> 에르고구(보라)는 두 극에서 지평선에 닿고 적도에서 바깥으로 부풉니다——납작한 껍질 모양입니다. 실험실의 적도 시점에서는 r&#x208A; 바깥의 고리로 나타납니다.',
            de: '<b>Meridionalschnitt.</b> Die Ergosphäre (violett) berührt den Horizont an den Polen und wölbt sich am Äquator nach außen — eine abgeplattete Schale. In der Äquatoransicht des Labors erscheint sie als Ring außerhalb von r&#x208A;.',
            fr: '<b>Coupe méridienne.</b> L’ergosphère (violet) touche l’horizon aux pôles et se renfle à l’équateur — une coquille aplatie. Dans la vue équatoriale du laboratoire, elle apparaît comme un anneau à l’extérieur de r&#x208A;.',
            es: '<b>Corte meridional.</b> La ergosfera (violeta) toca el horizonte en los polos y se abomba en el ecuador — una cáscara achatada. En la vista ecuatorial del laboratorio aparece como un anillo fuera de r&#x208A;.',
            it: '<b>Sezione meridiana.</b> L’ergosfera (viola) tocca l’orizzonte ai poli e si gonfia all’equatore — un guscio schiacciato. Nella vista equatoriale del laboratorio appare come un anello fuori da r&#x208A;.'
          }},
          { eq: 'r_ergo(θ) = M + √( M² − Q² − a² cos²θ )',
            where: {
              en: 'The static-limit surface. At the equator (theta = pi/2) it reaches farthest out; at the poles it meets the horizon.',
              zh: '靜止極限面。在赤道（θ = π/2）伸得最遠；在兩極與視界相接。',
              ja: '静止限界面。赤道（θ = π/2）で最も外へ達し、両極で地平面に接します。',
              ko: '정지 한계면. 적도(θ = π/2)에서 가장 멀리 뻗고, 두 극에서 지평선과 만납니다.',
              de: 'Die Statische-Grenze-Fläche. Am Äquator (theta = pi/2) reicht sie am weitesten hinaus; an den Polen trifft sie auf den Horizont.',
              fr: 'La surface de limite statique. À l’équateur (theta = pi/2), elle s’étend le plus loin ; aux pôles, elle rejoint l’horizon.',
              es: 'La superficie de límite estático. En el ecuador (theta = pi/2) alcanza su punto más externo; en los polos se encuentra con el horizonte.',
              it: 'La superficie del limite statico. All’equatore (theta = pi/2) si spinge più all’esterno; ai poli incontra l’orizzonte.'
            }},
          { h: { en: 'Mining the spin: the Penrose process', zh: '開採自轉：彭羅斯過程',
            ja: '自転を採掘する：ペンローズ過程', ko: '스핀 캐내기: 펜로즈 과정',
            de: 'Den Spin abbauen: der Penrose-Prozess', fr: 'Exploiter le spin : le processus de Penrose',
            es: 'Minar el espín: el proceso de Penrose', it: 'Estrarre lo spin: il processo di Penrose' }},
          { p: {
            en: 'Inside the ergosphere, energy itself can be <i>negative</i> as measured from afar. Send in a body, split it so one fragment drops onto a negative-energy orbit and disappears through the horizon, and the other fragment flies out carrying <b>more energy than you sent in</b>. The surplus comes straight out of the hole’s rotation — the <span class="term">Penrose process</span>. Up to about 29% of a Kerr hole’s mass can be extracted this way.',
            zh: '在能層之內，從遠方量度的能量本身可以是<i>負的</i>。送入一個物體，將它一分為二，讓一塊落入負能量軌道並穿過視界消失，另一塊便能帶著<b>比你送入更多的能量</b>飛出。多出的能量直接來自黑洞的自轉——這就是<span class="term">彭羅斯過程（Penrose process）</span>。Kerr 黑洞約有 29% 的質量可藉此萃取。',
            ja: 'エルゴ球の内部では、遠方から測ったエネルギー自体が<i>負</i>になり得ます。物体を送り込み、二つに分けて、一方を負エネルギー軌道に落として地平面の向こうへ消し、もう一方を<b>送り込んだより多くのエネルギー</b>を携えて飛び出させます。その余剰はブラックホールの回転からそのまま生じます——<span class="term">ペンローズ過程（Penrose process）</span>です。Kerr ブラックホールでは質量の約 29% までこの方法で取り出せます。',
            ko: '에르고구 내부에서는 멀리서 측정한 에너지 자체가 <i>음수</i>가 될 수 있습니다. 물체를 들여보내 둘로 나누고, 한 조각을 음에너지 궤도에 떨어뜨려 지평선 너머로 사라지게 하면, 다른 조각은 <b>들여보낸 것보다 더 많은 에너지</b>를 안고 날아갑니다. 그 잉여는 블랙홀의 회전에서 곧바로 나옵니다——<span class="term">펜로즈 과정(Penrose process)</span>입니다. Kerr 블랙홀에서는 질량의 약 29% 까지 이렇게 추출할 수 있습니다.',
            de: 'Innerhalb der Ergosphäre kann die Energie selbst — aus der Ferne gemessen — <i>negativ</i> sein. Schicke einen Körper hinein, teile ihn so, dass ein Bruchstück auf eine Bahn negativer Energie fällt und durch den Horizont verschwindet, und das andere Bruchstück fliegt mit <b>mehr Energie hinaus, als du hineingeschickt hast</b>. Der Überschuss kommt direkt aus der Rotation des Lochs — der <span class="term">Penrose-Prozess</span>. Bis zu etwa 29 % der Masse eines Kerr-Lochs lassen sich so gewinnen.',
            fr: 'Dans l’ergosphère, l’énergie elle-même peut être <i>négative</i> mesurée de loin. Envoyez-y un corps, scindez-le de sorte qu’un fragment tombe sur une orbite d’énergie négative et disparaisse par l’horizon ; l’autre fragment ressort en emportant <b>plus d’énergie que vous n’en avez envoyée</b>. L’excédent provient directement de la rotation du trou — le <span class="term">processus de Penrose</span>. On peut ainsi extraire jusqu’à environ 29 % de la masse d’un trou de Kerr.',
            es: 'Dentro de la ergosfera, la propia energía puede ser <i>negativa</i> medida desde lejos. Envía un cuerpo, divídelo de modo que un fragmento caiga en una órbita de energía negativa y desaparezca por el horizonte, y el otro fragmento sale llevando <b>más energía de la que enviaste</b>. El excedente proviene directamente de la rotación del agujero — el <span class="term">proceso de Penrose</span>. Así se puede extraer hasta cerca del 29 % de la masa de un agujero de Kerr.',
            it: 'Dentro l’ergosfera, l’energia stessa può essere <i>negativa</i> se misurata da lontano. Invia un corpo, dividilo in modo che un frammento cada su un’orbita a energia negativa e scompaia oltre l’orizzonte, e l’altro frammento esce portando <b>più energia di quanta ne hai inviata</b>. L’eccesso proviene direttamente dalla rotazione del buco — il <span class="term">processo di Penrose</span>. Così si può estrarre fino a circa il 29 % della massa di un buco di Kerr.'
          }},
          { call: 'lab', body: {
            en: 'Toggle <b>ERGO</b> with a non-zero <b>a</b>. Increase spin and the violet ring widens beyond the horizon; set a = 0 and it collapses onto r&#x208A; (no ergosphere without rotation, for Q = 0).',
            zh: '在 <b>a</b> 非零時開啟 <b>ERGO</b>。提高自轉，紫色環會擴張到視界之外；設 a = 0 它便塌回 r&#x208A;（在 Q = 0 時，無自轉就無能層）。',
            ja: '<b>a</b> が非ゼロの状態で <b>ERGO</b> を切り替えます。スピンを上げると紫のリングが地平面の外へ広がります。a = 0 にすると r&#x208A; に潰れます（Q = 0 では回転なしにエルゴ球は生じません）。',
            ko: '<b>a</b> 가 0이 아닌 상태에서 <b>ERGO</b> 를 켜세요. 스핀을 올리면 보라색 고리가 지평선 너머로 넓어집니다. a = 0 으로 두면 r&#x208A; 위로 붕괴합니다(Q = 0 에서는 회전 없이는 에르고구가 없습니다).',
            de: 'Schalte <b>ERGO</b> bei einem von null verschiedenen <b>a</b> ein. Erhöhe den Spin, und der violette Ring weitet sich über den Horizont hinaus; setze a = 0, und er fällt auf r&#x208A; zusammen (ohne Rotation keine Ergosphäre, für Q = 0).',
            fr: 'Activez <b>ERGO</b> avec un <b>a</b> non nul. Augmentez le spin et l’anneau violet s’élargit au-delà de l’horizon ; mettez a = 0 et il s’effondre sur r&#x208A; (pas d’ergosphère sans rotation, pour Q = 0).',
            es: 'Activa <b>ERGO</b> con un <b>a</b> distinto de cero. Aumenta el espín y el anillo violeta se ensancha más allá del horizonte; pon a = 0 y colapsa sobre r&#x208A; (sin rotación no hay ergosfera, para Q = 0).',
            it: 'Attiva <b>ERGO</b> con un <b>a</b> diverso da zero. Aumenta lo spin e l’anello viola si allarga oltre l’orizzonte; imposta a = 0 e collassa su r&#x208A; (nessuna ergosfera senza rotazione, per Q = 0).'
          }}
        ]
      },

      // ---- 14. Frame dragging ----
      {
        id: 'frame-dragging', no: 14,
        kicker: { en: 'space in motion', zh: '流動的空間', ja: '動く空間', ko: '움직이는 공간',
          de: 'Raum in Bewegung', fr: 'l’espace en mouvement', es: 'el espacio en movimiento', it: 'lo spazio in movimento' },
        title: { en: 'Frame dragging', zh: '參考系拖曳', ja: '慣性系の引きずり', ko: '좌표계 끌림',
          de: 'Frame-Dragging (Mitführung der Bezugssysteme)', fr: 'L’entraînement des référentiels',
          es: 'Arrastre de los sistemas de referencia', it: 'Trascinamento dei sistemi di riferimento' },
        sub: { en: 'A spinning mass winds spacetime around itself.', zh: '旋轉的質量會把時空捲繞在自己周圍。',
          ja: '回転する質量は時空を自らの周りに巻きつける。', ko: '회전하는 질량은 시공간을 자신 주위로 감는다.',
          de: 'Eine rotierende Masse wickelt die Raumzeit um sich.', fr: 'Une masse en rotation enroule l’espace-temps autour d’elle.',
          es: 'Una masa en rotación enrolla el espacio-tiempo a su alrededor.', it: 'Una massa rotante avvolge lo spaziotempo attorno a sé.' },
        blocks: [
          { p: {
            en: 'A rotating mass does not just curve space — it <i>drags</i> it into rotation, like a spoon turning honey. This <span class="term">Lense-Thirring</span> effect twists the paths of everything nearby, swirling orbits in the direction of spin. Close to the hole the dragging becomes irresistible (that is the ergosphere).',
            zh: '旋轉的質量不只彎曲空間——它還把空間<i>拖</i>進旋轉，就像湯匙攪動蜂蜜。這種 <span class="term">Lense-Thirring</span> 效應扭轉鄰近一切的路徑，使軌道朝自轉方向打旋。靠近黑洞時，拖曳變得無法抗拒（那就是能層）。',
            ja: '回転する質量は空間を曲げるだけでなく——スプーンが蜂蜜をかき回すように——空間を回転へと<i>引きずり</i>ます。この <span class="term">Lense-Thirring</span> 効果は近傍のあらゆるものの経路をねじり、軌道を自転方向へ巻き込みます。ブラックホールに近づくと引きずりは抗えなくなります（それがエルゴ球です）。',
            ko: '회전하는 질량은 공간을 휘게 할 뿐 아니라——숟가락이 꿀을 휘젓듯——공간을 회전 속으로 <i>끌어들입니다</i>. 이 <span class="term">Lense-Thirring</span> 효과는 근처 모든 것의 경로를 비틀어 궤도를 스핀 방향으로 휘감습니다. 블랙홀에 가까워지면 끌림은 거스를 수 없게 됩니다(그것이 에르고구입니다).',
            de: 'Eine rotierende Masse krümmt den Raum nicht nur — sie <i>zieht</i> ihn in Rotation, wie ein Löffel, der Honig rührt. Dieser <span class="term">Lense-Thirring</span>-Effekt verdreht die Bahnen alles Nahen und wirbelt Umlaufbahnen in Spinrichtung. Nahe dem Loch wird das Mitführen unwiderstehlich (das ist die Ergosphäre).',
            fr: 'Une masse en rotation ne fait pas que courber l’espace — elle l’<i>entraîne</i> en rotation, comme une cuillère qui tourne du miel. Cet effet <span class="term">Lense-Thirring</span> tord les trajectoires de tout ce qui est proche, faisant tourbillonner les orbites dans le sens du spin. Près du trou, l’entraînement devient irrésistible (c’est l’ergosphère).',
            es: 'Una masa en rotación no solo curva el espacio — lo <i>arrastra</i> a girar, como una cuchara que remueve la miel. Este efecto <span class="term">Lense-Thirring</span> tuerce las trayectorias de todo lo cercano, arremolinando las órbitas en el sentido del espín. Cerca del agujero el arrastre se vuelve irresistible (eso es la ergosfera).',
            it: 'Una massa rotante non si limita a curvare lo spazio — lo <i>trascina</i> in rotazione, come un cucchiaio che gira il miele. Questo effetto <span class="term">Lense-Thirring</span> torce le traiettorie di tutto ciò che è vicino, facendo vorticare le orbite nel verso dello spin. Vicino al buco il trascinamento diventa irresistibile (è l’ergosfera).'
          }},
          { eq: 'ω(r) = − g_tφ / g_φφ   ≈  2 M a / r³   (far field)',
            where: {
              en: 'The angular velocity that spacetime itself imposes on a "static" observer. It falls off as 1/r^3 far away but diverges in importance near r+.',
              zh: '時空本身強加於「靜止」觀測者的角速度。在遠處以 1/r³ 衰減，但在 r₊ 附近其影響趨於主導。',
              ja: '時空そのものが「静止」観測者に課す角速度。遠方では 1/r^3 で減衰しますが、r+ 付近ではその重要性が発散します。',
              ko: '시공간 자체가 「정지」 관측자에게 부과하는 각속도. 멀리서는 1/r^3 로 감소하지만 r+ 근처에서는 그 중요성이 발산합니다.',
              de: 'Die Winkelgeschwindigkeit, die die Raumzeit selbst einem „statischen“ Beobachter aufzwingt. Sie fällt fern mit 1/r^3 ab, gewinnt aber nahe r+ überragend an Bedeutung.',
              fr: 'La vitesse angulaire que l’espace-temps lui-même impose à un observateur « statique ». Elle décroît en 1/r^3 au loin, mais son importance diverge près de r+.',
              es: 'La velocidad angular que el propio espacio-tiempo impone a un observador «estático». Decae como 1/r^3 a lo lejos, pero su importancia diverge cerca de r+.',
              it: 'La velocità angolare che lo spaziotempo stesso impone a un osservatore «statico». Decade come 1/r^3 lontano, ma la sua importanza diverge vicino a r+.'
            }},
          { fig: `
  <svg viewBox="0 0 640 320" role="img" aria-label="Spacetime swirl from frame dragging">
    <g transform="translate(320,160)">
      <circle class="dia-bh" r="42"/>
      <circle class="dia-horizon" r="42"/>
      <circle r="2.2" fill="var(--warn)"/>
      <g class="dia-arrow" marker-end="url(#fdh)">
        <path d="M0,-70 A70,70 0 0 1 60,-36"/>
        <path d="M0,-105 A105,105 0 0 1 90,-54"/>
        <path d="M0,-140 A140,140 0 0 1 121,-72"/>
        <path d="M70,0 A70,70 0 0 1 36,60"/>
        <path d="M105,0 A105,105 0 0 1 54,90"/>
        <path d="M140,0 A140,140 0 0 1 72,121"/>
      </g>
    </g>
    <defs>
      <marker id="fdh" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="var(--fg-2)"/>
      </marker>
    </defs>
    <text class="dia-lbl-dim" x="470" y="150">dragging grows</text>
    <text class="dia-lbl-dim" x="470" y="168">stronger inward</text>
  </svg>`, cap: {
            en: '<b>Dragged frames.</b> Arrows show the rotation spacetime forces on a hovering observer — gentle far out, overwhelming near the horizon.',
            zh: '<b>被拖曳的參考系。</b>箭頭顯示時空強加於懸停觀測者的旋轉——遠處輕柔，近視界處則勢不可擋。',
            ja: '<b>引きずられる参照系。</b>矢印は、懸停する観測者に時空が強いる回転を示します——遠方では穏やか、地平面近くでは圧倒的です。',
            ko: '<b>끌려가는 좌표계.</b> 화살표는 정지해 떠 있는 관측자에게 시공간이 강요하는 회전을 보여 줍니다——멀리서는 부드럽고, 지평선 근처에서는 압도적입니다.',
            de: '<b>Mitgeführte Bezugssysteme.</b> Die Pfeile zeigen die Rotation, die die Raumzeit einem schwebenden Beobachter aufzwingt — sanft in der Ferne, überwältigend nahe dem Horizont.',
            fr: '<b>Référentiels entraînés.</b> Les flèches montrent la rotation que l’espace-temps impose à un observateur en vol stationnaire — douce au loin, écrasante près de l’horizon.',
            es: '<b>Sistemas de referencia arrastrados.</b> Las flechas muestran la rotación que el espacio-tiempo impone a un observador suspendido — suave a lo lejos, abrumadora cerca del horizonte.',
            it: '<b>Sistemi di riferimento trascinati.</b> Le frecce mostrano la rotazione che lo spaziotempo impone a un osservatore sospeso — delicata lontano, travolgente vicino all’orizzonte.'
          }},
          { call: 'lab', body: {
            en: 'Toggle <b>DRAG</b> to render the frame-dragging field. Sweep <b>a</b> from 0 upward and watch the swirl intensify; reverse the sign of a to flip its direction.',
            zh: '開啟 <b>DRAG</b> 以繪出參考系拖曳場。把 <b>a</b> 從 0 往上調，看漩渦增強；把 a 變號則方向反轉。',
            ja: '<b>DRAG</b> を切り替えて参照系引きずり場を描きます。<b>a</b> を 0 から上げて渦が強まるのを見てください。a の符号を反転すると向きが逆転します。',
            ko: '<b>DRAG</b> 를 켜서 좌표계 끌림 장을 그리세요. <b>a</b> 를 0 에서 올리며 소용돌이가 강해지는 것을 보세요. a 의 부호를 뒤집으면 방향이 반전됩니다.',
            de: 'Schalte <b>DRAG</b> ein, um das Frame-Dragging-Feld darzustellen. Ziehe <b>a</b> von 0 aufwärts und beobachte, wie sich der Wirbel verstärkt; kehre das Vorzeichen von a um, um seine Richtung umzudrehen.',
            fr: 'Activez <b>DRAG</b> pour afficher le champ d’entraînement des référentiels. Faites varier <b>a</b> à partir de 0 et regardez le tourbillon s’intensifier ; inversez le signe de a pour en inverser le sens.',
            es: 'Activa <b>DRAG</b> para representar el campo de arrastre de referencia. Sube <b>a</b> desde 0 y observa cómo se intensifica el remolino; invierte el signo de a para invertir su sentido.',
            it: 'Attiva <b>DRAG</b> per visualizzare il campo di trascinamento dei sistemi di riferimento. Aumenta <b>a</b> da 0 e osserva il vortice intensificarsi; inverti il segno di a per invertirne il verso.'
          }}
        ]
      },

      // ---- 15. Photon sphere & shadow ----
      {
        id: 'photon-sphere', no: 15,
        kicker: { en: 'where light orbits', zh: '光的軌道', ja: '光が周回する場所', ko: '빛이 공전하는 곳',
          de: 'wo Licht umläuft', fr: 'là où la lumière orbite', es: 'donde la luz orbita', it: 'dove la luce orbita' },
        title: { en: 'The photon sphere and the shadow', zh: '光子球與黑洞剪影',
          ja: '光子球と影', ko: '광자구와 그림자',
          de: 'Die Photonensphäre und der Schatten', fr: 'La sphère de photons et l’ombre',
          es: 'La esfera de fotones y la sombra', it: 'La sfera dei fotoni e l’ombra' },
        sub: { en: 'The radius at which gravity bends light into a circle.', zh: '重力把光彎成圓周的半徑。',
          ja: '重力が光を円に曲げる半径。', ko: '중력이 빛을 원으로 휘게 하는 반지름.',
          de: 'Der Radius, bei dem die Gravitation Licht zu einem Kreis biegt.', fr: 'Le rayon où la gravité courbe la lumière en cercle.',
          es: 'El radio al que la gravedad curva la luz en un círculo.', it: 'Il raggio al quale la gravità piega la luce in un cerchio.' },
        blocks: [
          { p: {
            en: 'At one special radius, gravity bends a light ray just enough to send it around the hole in a circle. This is the <span class="term">photon sphere</span>. The orbit is unstable — the slightest nudge sends the photon spiralling in or out — but rays that graze it can loop the hole several times before escaping, painting the bright ring we see in black-hole images.',
            zh: '在某個特殊半徑上，重力把光線彎曲得恰到好處，使它沿圓周繞行黑洞一圈。這就是<span class="term">光子球（photon sphere）</span>。此軌道不穩定——稍有擾動，光子便旋進或旋出——但掠過它的光線可在逃離前繞行黑洞數圈，描繪出我們在黑洞影像中所見的明亮光環。',
            ja: 'ある特別な半径では、重力が光線をちょうど良く曲げ、ブラックホールの周りを円を描いて回らせます。これが<span class="term">光子球（photon sphere）</span>です。この軌道は不安定で——わずかな乱れで光子は内側か外側へ螺旋します——しかしそれをかすめる光線は、脱出する前にブラックホールを数回周回でき、ブラックホール画像で見る明るいリングを描き出します。',
            ko: '어떤 특별한 반지름에서 중력은 광선을 딱 알맞게 휘어 블랙홀 주위를 원을 그리며 돌게 합니다. 이것이 <span class="term">광자구(photon sphere)</span>입니다. 이 궤도는 불안정하여——아주 작은 자극에도 광자가 안이나 밖으로 나선을 그립니다——그것을 스치는 광선은 탈출하기 전에 블랙홀을 여러 바퀴 돌 수 있어, 블랙홀 영상에서 보이는 밝은 고리를 그려냅니다.',
            de: 'Bei einem besonderen Radius biegt die Gravitation einen Lichtstrahl gerade so stark, dass er das Loch auf einem Kreis umrundet. Das ist die <span class="term">Photonensphäre</span>. Die Bahn ist instabil — der kleinste Stoß schickt das Photon spiralförmig hinein oder hinaus —, doch streifende Strahlen können das Loch mehrmals umlaufen, bevor sie entkommen, und malen den hellen Ring, den wir auf Bildern Schwarzer Löcher sehen.',
            fr: 'À un rayon particulier, la gravité courbe un rayon lumineux juste assez pour lui faire faire le tour du trou en cercle. C’est la <span class="term">sphère de photons</span>. L’orbite est instable — la moindre poussée envoie le photon en spirale vers l’intérieur ou l’extérieur — mais les rayons qui la frôlent peuvent faire plusieurs fois le tour du trou avant de s’échapper, peignant l’anneau brillant que l’on voit sur les images de trous noirs.',
            es: 'A un radio especial, la gravedad curva un rayo de luz justo lo suficiente para hacerlo girar alrededor del agujero en un círculo. Esta es la <span class="term">esfera de fotones</span>. La órbita es inestable — el menor empujón envía al fotón en espiral hacia dentro o hacia fuera — pero los rayos que la rozan pueden dar varias vueltas al agujero antes de escapar, pintando el anillo brillante que vemos en las imágenes de agujeros negros.',
            it: 'A un raggio particolare, la gravità piega un raggio di luce quanto basta per farlo girare attorno al buco in cerchio. Questa è la <span class="term">sfera dei fotoni</span>. L’orbita è instabile — la minima spinta manda il fotone a spirale verso l’interno o l’esterno — ma i raggi che la sfiorano possono compiere più giri attorno al buco prima di sfuggire, dipingendo l’anello brillante che vediamo nelle immagini dei buchi neri.'
          }},
          { eq: 'r_ph = 3M        (Schwarzschild; a = Q = 0)',
            where: {
              en: 'Spin splits this into two: a smaller prograde radius (down to M for an extremal Kerr hole) and a larger retrograde one. Charge shrinks it slightly.',
              zh: '自轉把它一分為二：較小的順行半徑（極端 Kerr 可低至 M）與較大的逆行半徑。電荷使其略為縮小。',
              ja: '自転はこれを二つに分けます：より小さい順行半径（極限 Kerr では M まで）と、より大きい逆行半径です。電荷はわずかに縮めます。',
              ko: '스핀은 이를 둘로 나눕니다: 더 작은 순행 반지름(극단 Kerr 에서는 M 까지)과 더 큰 역행 반지름입니다. 전하는 약간 줄입니다.',
              de: 'Der Spin spaltet ihn in zwei: einen kleineren prograden Radius (bis hinab zu M bei einem extremalen Kerr-Loch) und einen größeren retrograden. Die Ladung verkleinert ihn leicht.',
              fr: 'Le spin le divise en deux : un rayon prograde plus petit (jusqu’à M pour un trou de Kerr extrémal) et un rétrograde plus grand. La charge le réduit légèrement.',
              es: 'El espín lo divide en dos: un radio prógrado más pequeño (hasta M para un agujero de Kerr extremal) y uno retrógrado más grande. La carga lo reduce ligeramente.',
              it: 'Lo spin lo divide in due: un raggio prògrado più piccolo (fino a M per un buco di Kerr estremale) e uno retrogrado più grande. La carica lo riduce leggermente.'
            }},
          { fig: `
  <svg viewBox="0 0 640 320" role="img" aria-label="Photon sphere and black hole shadow">
    <g transform="translate(220,160)">
      <circle class="dia-photon" r="96"/>
      <circle class="dia-bh" r="64"/>
      <circle class="dia-horizon" r="64"/>
      <path class="dia-ray" d="M-200,-50 Q-40,-96 60,-30 Q120,16 60,70 Q10,108 -120,150" marker-end="url(#ph)"/>
      <path class="dia-ray" d="M-200,40 C-60,30 -40,-10 0,-96" marker-end="url(#ph)"/>
    </g>
    <defs>
      <marker id="ph" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="var(--cyan)"/>
      </marker>
    </defs>
    <text class="dia-lbl" x="430" y="120" fill="var(--magenta)">r_ph &#x2248; 3M</text>
    <text class="dia-lbl-dim" x="430" y="150">grazing rays</text>
    <text class="dia-lbl-dim" x="430" y="168">loop the hole</text>
    <text class="dia-lbl-accent" x="430" y="200">shadow &#x2248; &#x221A;27 M</text>
  </svg>`, cap: {
            en: '<b>The shadow.</b> Rays inside the photon sphere are captured; those grazing it whirl around. The dark disc an observer sees (radius ~ &#x221A;27 M) is larger than the horizon itself.',
            zh: '<b>黑洞剪影。</b>進入光子球內的光線被捕獲；掠過它的則繞行打轉。觀測者所見的暗盤（半徑 ~ √27 M）比視界本身更大。',
            ja: '<b>影。</b>光子球の内側の光線は捕獲されます。かすめる光線は周回します。観測者が見る暗い円盤（半径 ~ √27 M）は地平面そのものより大きいです。',
            ko: '<b>그림자.</b> 광자구 안쪽의 광선은 포획됩니다. 스치는 광선은 빙빙 돕니다. 관측자가 보는 어두운 원반(반지름 ~ √27 M)은 지평선 자체보다 큽니다.',
            de: '<b>Der Schatten.</b> Strahlen innerhalb der Photonensphäre werden eingefangen; streifende wirbeln herum. Die dunkle Scheibe, die ein Beobachter sieht (Radius ~ √27 M), ist größer als der Horizont selbst.',
            fr: '<b>L’ombre.</b> Les rayons à l’intérieur de la sphère de photons sont capturés ; ceux qui la frôlent tourbillonnent. Le disque sombre que voit un observateur (rayon ~ √27 M) est plus grand que l’horizon lui-même.',
            es: '<b>La sombra.</b> Los rayos dentro de la esfera de fotones son capturados; los que la rozan giran en torno. El disco oscuro que ve un observador (radio ~ √27 M) es mayor que el propio horizonte.',
            it: '<b>L’ombra.</b> I raggi all’interno della sfera dei fotoni vengono catturati; quelli che la sfiorano vorticano attorno. Il disco scuro che un osservatore vede (raggio ~ √27 M) è più grande dell’orizzonte stesso.'
          }},
          { call: 'lab', body: {
            en: 'Toggle <b>PHOTON</b> to draw the photon sphere, and <b>LENS</b> to open the ray-traced observer view where the shadow and ring appear directly.',
            zh: '開啟 <b>PHOTON</b> 繪出光子球，再開 <b>LENS</b> 打開光線追蹤的觀測者視窗，剪影與光環會直接呈現。',
            ja: '<b>PHOTON</b> を切り替えて光子球を描き、<b>LENS</b> を開くと光線追跡の観測者視点が現れ、影とリングが直接見えます。',
            ko: '<b>PHOTON</b> 을 켜서 광자구를 그리고, <b>LENS</b> 를 열면 광선 추적 관측자 시점이 나타나 그림자와 고리가 직접 보입니다.',
            de: 'Schalte <b>PHOTON</b> ein, um die Photonensphäre zu zeichnen, und <b>LENS</b>, um die strahlenverfolgte Beobachteransicht zu öffnen, in der Schatten und Ring direkt erscheinen.',
            fr: 'Activez <b>PHOTON</b> pour tracer la sphère de photons, et <b>LENS</b> pour ouvrir la vue d’observateur en lancer de rayons où l’ombre et l’anneau apparaissent directement.',
            es: 'Activa <b>PHOTON</b> para dibujar la esfera de fotones, y <b>LENS</b> para abrir la vista de observador con trazado de rayos donde la sombra y el anillo aparecen directamente.',
            it: 'Attiva <b>PHOTON</b> per disegnare la sfera dei fotoni, e <b>LENS</b> per aprire la vista d’osservatore con ray tracing dove l’ombra e l’anello appaiono direttamente.'
          }}
        ]
      },

      // ---- 16. ISCO ----
      {
        id: 'isco', no: 16,
        kicker: { en: 'the edge of stability', zh: '穩定的邊界', ja: '安定の縁', ko: '안정의 가장자리',
          de: 'der Rand der Stabilität', fr: 'la limite de stabilité', es: 'el borde de la estabilidad', it: 'il limite della stabilità' },
        title: { en: 'The innermost stable circular orbit', zh: '最內穩定圓軌道',
          ja: '最内安定円軌道', ko: '최내 안정 원궤도',
          de: 'Die innerste stabile Kreisbahn', fr: 'L’orbite circulaire stable la plus interne',
          es: 'La órbita circular estable más interna', it: 'L’orbita circolare stabile più interna' },
        sub: { en: 'The last orbit you can hold before you must plunge.', zh: '你必須墜入之前能維持的最後一條軌道。',
          ja: '墜入する前に維持できる最後の軌道。', ko: '추락하기 전에 유지할 수 있는 마지막 궤도.',
          de: 'Die letzte Bahn, die du halten kannst, bevor du stürzen musst.', fr: 'La dernière orbite que vous pouvez tenir avant de devoir plonger.',
          es: 'La última órbita que puedes mantener antes de tener que caer.', it: 'L’ultima orbita che puoi mantenere prima di dover precipitare.' },
        blocks: [
          { p: {
            en: 'Far from the hole, Newton’s orbits work fine: pick a radius, pick the right speed, circle forever. Closer in, relativity adds an extra inward pull, and below a critical radius <i>no circular orbit is stable</i> — the smallest perturbation sends matter spiralling through the horizon. That critical radius is the <span class="term">innermost stable circular orbit (ISCO)</span>.',
            zh: '在遠離黑洞處，牛頓軌道一切正常：選定半徑、選對速度，就能永遠繞行。越靠近，相對論便額外增添一股向內的拉力；低於某臨界半徑後，<i>沒有任何圓軌道是穩定的</i>——最微小的擾動就會讓物質旋穿視界。這個臨界半徑就是<span class="term">最內穩定圓軌道（ISCO）</span>。',
            ja: 'ブラックホールから遠ければニュートンの軌道で十分です：半径を選び、適切な速度を選べば、いつまでも周回します。近づくと相対論が余分な内向きの引力を加え、ある臨界半径より内側では<i>どの円軌道も安定ではなくなります</i>——最小の摂動で物質は螺旋を描いて地平面を抜けます。その臨界半径が<span class="term">最内安定円軌道（ISCO）</span>です。',
            ko: '블랙홀에서 멀면 뉴턴의 궤도로 충분합니다: 반지름을 고르고 알맞은 속도를 고르면 영원히 돕니다. 가까워지면 상대성 이론이 추가의 안쪽 당김을 더하고, 어떤 임계 반지름 아래에서는 <i>어떤 원궤도도 안정하지 않습니다</i>——아주 작은 섭동에도 물질이 나선을 그리며 지평선을 통과합니다. 그 임계 반지름이 <span class="term">최내 안정 원궤도(ISCO)</span>입니다.',
            de: 'Fern vom Loch funktionieren Newtons Bahnen gut: Wähle einen Radius, wähle die richtige Geschwindigkeit, kreise für immer. Näher dran fügt die Relativität einen zusätzlichen Zug nach innen hinzu, und unterhalb eines kritischen Radius <i>ist keine Kreisbahn mehr stabil</i> — die kleinste Störung schickt Materie spiralförmig durch den Horizont. Dieser kritische Radius ist die <span class="term">innerste stabile Kreisbahn (ISCO)</span>.',
            fr: 'Loin du trou, les orbites de Newton suffisent : choisissez un rayon, la bonne vitesse, et tournez à jamais. Plus près, la relativité ajoute une attraction supplémentaire vers l’intérieur, et en dessous d’un rayon critique <i>aucune orbite circulaire n’est stable</i> — la moindre perturbation envoie la matière en spirale à travers l’horizon. Ce rayon critique est l’<span class="term">orbite circulaire stable la plus interne (ISCO)</span>.',
            es: 'Lejos del agujero, las órbitas de Newton funcionan bien: elige un radio, la velocidad adecuada, y gira para siempre. Más cerca, la relatividad añade un tirón extra hacia dentro, y por debajo de un radio crítico <i>ninguna órbita circular es estable</i> — la menor perturbación envía la materia en espiral a través del horizonte. Ese radio crítico es la <span class="term">órbita circular estable más interna (ISCO)</span>.',
            it: 'Lontano dal buco, le orbite di Newton vanno bene: scegli un raggio, la velocità giusta, e gira per sempre. Più vicino, la relatività aggiunge un’ulteriore attrazione verso l’interno, e sotto un raggio critico <i>nessuna orbita circolare è stabile</i> — la minima perturbazione manda la materia a spirale attraverso l’orizzonte. Quel raggio critico è l’<span class="term">orbita circolare stabile più interna (ISCO)</span>.'
          }},
          { eq: 'r_ISCO = 6M   (Schwarzschild)\nprograde Kerr: → M (extremal)   retrograde: → 9M',
            where: {
              en: 'Spin in the orbit’s direction lets matter orbit much closer; against the spin pushes the ISCO out. This is why spin governs how efficiently a disc radiates.',
              zh: '與軌道同向的自轉讓物質能繞得更近；逆向自轉則把 ISCO 往外推。這正是自轉決定吸積盤輻射效率的原因。',
              ja: '軌道と同じ向きの自転は、物質をはるかに近くで周回させます；自転に逆らうと ISCO は外へ押し出されます。これが、自転が円盤の放射効率を支配する理由です。',
              ko: '궤도와 같은 방향의 스핀은 물질을 훨씬 가까이서 돌게 합니다; 스핀에 거스르면 ISCO 가 밖으로 밀려납니다. 이것이 스핀이 원반의 복사 효율을 좌우하는 이유입니다.',
              de: 'Spin in Bahnrichtung lässt Materie viel näher umlaufen; gegen den Spin schiebt die ISCO nach außen. Deshalb bestimmt der Spin, wie effizient eine Scheibe strahlt.',
              fr: 'Un spin dans le sens de l’orbite permet à la matière d’orbiter bien plus près ; contre le spin, la ISCO est repoussée vers l’extérieur. C’est pourquoi le spin gouverne l’efficacité de rayonnement d’un disque.',
              es: 'Un espín en el sentido de la órbita permite que la materia orbite mucho más cerca; en contra del espín empuja la ISCO hacia fuera. Por eso el espín gobierna la eficiencia con que radia un disco.',
              it: 'Uno spin nel verso dell’orbita consente alla materia di orbitare molto più vicino; contro lo spin spinge la ISCO verso l’esterno. È per questo che lo spin governa l’efficienza con cui un disco irradia.'
            }},
          { fig: `
  <svg viewBox="0 0 640 320" role="img" aria-label="ISCO for prograde and retrograde orbits">
    <g transform="translate(260,160)">
      <circle class="dia-isco" r="58"/>
      <circle class="dia-isco" r="140" stroke-opacity="0.5"/>
      <circle class="dia-bh" r="34"/>
      <circle class="dia-horizon" r="34"/>
      <circle r="2.2" fill="var(--warn)"/>
      <circle cx="58" cy="0" r="4" fill="var(--cyan)"/>
      <path class="dia-orbit" d="M58,0 m0,-10 a10,10 0 1 1 -0.1,0" marker-end="url(#io)"/>
      <circle cx="-140" cy="0" r="4" fill="var(--amber)"/>
    </g>
    <defs>
      <marker id="io" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto">
        <path d="M0,0 L5,3 L0,6 Z" fill="var(--cyan)"/>
      </marker>
    </defs>
    <text class="dia-lbl" x="430" y="120" fill="var(--cyan)">prograde ISCO &#x2192; M</text>
    <text class="dia-lbl" x="430" y="150" fill="var(--cyan)" opacity="0.6">retrograde ISCO &#x2192; 9M</text>
    <text class="dia-lbl-dim" x="430" y="186">inside: must plunge</text>
  </svg>`, cap: {
            en: '<b>Two ISCOs.</b> Orbiting <i>with</i> the spin (cyan) lets you hug the hole; orbiting <i>against</i> it (amber) forces a wide last orbit. Inside the ISCO, stable circles do not exist.',
            zh: '<b>兩個 ISCO。</b><i>順著</i>自轉繞行（青）可緊貼黑洞；<i>逆著</i>它（琥珀）則被迫採用較寬的最後軌道。在 ISCO 之內，穩定圓軌道並不存在。',
            ja: '<b>二つの ISCO。</b>自転<i>と同じ</i>向きの周回（シアン）はブラックホールに密着できます；<i>逆らう</i>周回（琥珀）は広い最後の軌道を強いられます。ISCO の内側に安定な円軌道は存在しません。',
            ko: '<b>두 개의 ISCO.</b> 스핀과 <i>같은</i> 방향의 공전(청록)은 블랙홀에 바싹 붙을 수 있습니다; <i>거스르는</i> 공전(호박색)은 넓은 마지막 궤도를 강요받습니다. ISCO 안쪽에는 안정한 원궤도가 존재하지 않습니다.',
            de: '<b>Zwei ISCOs.</b> Ein Umlauf <i>mit</i> dem Spin (Cyan) lässt dich das Loch umarmen; <i>gegen</i> ihn (Bernstein) erzwingt eine weite letzte Bahn. Innerhalb der ISCO existieren keine stabilen Kreise.',
            fr: '<b>Deux ISCO.</b> Orbiter <i>avec</i> le spin (cyan) permet de serrer le trou ; <i>contre</i> lui (ambre) impose une large dernière orbite. À l’intérieur de la ISCO, il n’existe pas de cercles stables.',
            es: '<b>Dos ISCO.</b> Orbitar <i>con</i> el espín (cian) te permite ceñirte al agujero; <i>en contra</i> (ámbar) obliga a una última órbita ancha. Dentro de la ISCO no existen círculos estables.',
            it: '<b>Due ISCO.</b> Orbitare <i>con</i> lo spin (ciano) ti permette di stringerti al buco; <i>contro</i> di esso (ambra) impone un’ampia ultima orbita. All’interno della ISCO non esistono cerchi stabili.'
          }},
          { call: 'lab', body: {
            en: 'Toggle <b>ISCO</b>. Drop a body just outside it and double-click to circularise — it holds. Place one just inside and it spirals in. Change <b>a</b> to move the ISCO.',
            zh: '開啟 <b>ISCO</b>。在它外側放一個天體並雙擊使之圓化——它會維持住。放在內側則會旋入。改變 <b>a</b> 可移動 ISCO。',
            ja: '<b>ISCO</b> を切り替えます。その外側すぐに天体を落とし、ダブルクリックで円軌道化すると——維持されます。内側すぐに置くと螺旋に落ちます。<b>a</b> を変えると ISCO が移動します。',
            ko: '<b>ISCO</b> 를 켜세요. 그 바깥쪽 바로 옆에 천체를 떨어뜨리고 더블클릭으로 원궤도화하면——유지됩니다. 안쪽 바로 옆에 두면 나선으로 떨어집니다. <b>a</b> 를 바꾸면 ISCO 가 이동합니다.',
            de: 'Schalte <b>ISCO</b> ein. Lass einen Körper knapp außerhalb fallen und doppelklicke zum Zirkularisieren — er hält. Setze einen knapp innerhalb, und er spiralt hinein. Ändere <b>a</b>, um die ISCO zu verschieben.',
            fr: 'Activez <b>ISCO</b>. Lâchez un corps juste à l’extérieur et double-cliquez pour le circulariser — il tient. Placez-en un juste à l’intérieur et il s’enroule vers le centre. Changez <b>a</b> pour déplacer la ISCO.',
            es: 'Activa <b>ISCO</b>. Deja caer un cuerpo justo fuera de ella y haz doble clic para circularizarlo — se mantiene. Coloca uno justo dentro y cae en espiral. Cambia <b>a</b> para mover la ISCO.',
            it: 'Attiva <b>ISCO</b>. Lascia cadere un corpo appena fuori e fai doppio clic per circolarizzarlo — regge. Mettine uno appena dentro e cade a spirale. Cambia <b>a</b> per spostare la ISCO.'
          }}
        ]
      },

      // ---- 17. Redshift & time dilation ----
      {
        id: 'redshift', no: 17,
        kicker: { en: 'time near gravity', zh: '重力旁的時間', ja: '重力のそばの時間', ko: '중력 곁의 시간',
          de: 'Zeit nahe der Gravitation', fr: 'le temps près de la gravité', es: 'el tiempo cerca de la gravedad', it: 'il tempo vicino alla gravità' },
        title: { en: 'Gravitational redshift and time dilation', zh: '重力紅移與時間膨脹',
          ja: '重力赤方偏移と時間の遅れ', ko: '중력 적색편이와 시간 지연',
          de: 'Gravitative Rotverschiebung und Zeitdilatation', fr: 'Décalage gravitationnel vers le rouge et dilatation du temps',
          es: 'Corrimiento al rojo gravitacional y dilatación del tiempo', it: 'Spostamento verso il rosso gravitazionale e dilatazione del tempo' },
        sub: { en: 'Clocks run slow, and light loses energy, deep in the well.', zh: '在重力井深處，時鐘走得慢，光也失去能量。',
          ja: '重力井の深部では、時計は遅れ、光はエネルギーを失う。', ko: '중력 우물 깊은 곳에서는 시계가 느려지고 빛은 에너지를 잃는다.',
          de: 'Tief im Potentialtopf gehen Uhren langsam und Licht verliert Energie.', fr: 'Au fond du puits, les horloges ralentissent et la lumière perd de l’énergie.',
          es: 'En lo hondo del pozo, los relojes van lentos y la luz pierde energía.', it: 'In fondo alla buca, gli orologi rallentano e la luce perde energia.' },
        blocks: [
          { p: {
            en: 'Time itself runs slower deeper in a gravitational well. A clock hovering near the horizon ticks far slower than one far away; in the limit at <var>r&#x208A;</var> it appears, to a distant observer, to freeze. Light climbing out of the well pays an energy toll on the way — its wavelength stretches and it reddens. This is <span class="term">gravitational redshift</span>.',
            zh: '在重力井越深處，時間本身走得越慢。懸停在視界附近的時鐘，比遠處的時鐘慢得多；在 <var>r&#x208A;</var> 的極限下，從遠方觀測者看來它彷彿凍結。爬出重力井的光，沿途要繳「能量過路費」——波長被拉長、變紅。這就是<span class="term">重力紅移</span>。',
            ja: '重力井が深いほど、時間そのものがゆっくり進みます。地平面近くに懸停する時計は、遠方の時計よりはるかに遅く刻みます；<var>r&#x208A;</var> の極限では、遠方の観測者からは凍りついたように見えます。井戸を登る光は途中でエネルギーの通行料を払い——波長が伸びて赤くなります。これが<span class="term">重力赤方偏移</span>です。',
            ko: '중력 우물이 깊을수록 시간 자체가 더 느리게 흐릅니다. 지평선 근처에 떠 있는 시계는 멀리 있는 시계보다 훨씬 느리게 째깍입니다; <var>r&#x208A;</var> 극한에서는 먼 관측자에게 멈춘 것처럼 보입니다. 우물을 기어오르는 빛은 도중에 에너지 통행료를 치릅니다——파장이 늘어나고 붉어집니다. 이것이 <span class="term">중력 적색편이</span>입니다.',
            de: 'Tiefer im Gravitationstopf läuft die Zeit selbst langsamer. Eine nahe dem Horizont schwebende Uhr tickt weit langsamer als eine ferne; im Grenzfall bei <var>r&#x208A;</var> scheint sie für einen fernen Beobachter einzufrieren. Licht, das aus dem Topf klettert, zahlt unterwegs Energiezoll — seine Wellenlänge dehnt sich und es rötet sich. Das ist die <span class="term">gravitative Rotverschiebung</span>.',
            fr: 'Le temps lui-même s’écoule plus lentement au fond d’un puits gravitationnel. Une horloge en vol stationnaire près de l’horizon bat bien plus lentement qu’une horloge lointaine ; à la limite en <var>r&#x208A;</var>, elle semble, pour un observateur lointain, se figer. La lumière qui remonte le puits paie un péage en énergie en chemin — sa longueur d’onde s’étire et elle rougit. C’est le <span class="term">décalage gravitationnel vers le rouge</span>.',
            es: 'El propio tiempo transcurre más lento en lo hondo de un pozo gravitacional. Un reloj suspendido cerca del horizonte avanza mucho más lento que uno lejano; en el límite en <var>r&#x208A;</var> parece, para un observador lejano, congelarse. La luz que sube del pozo paga un peaje de energía en el camino — su longitud de onda se estira y enrojece. Esto es el <span class="term">corrimiento al rojo gravitacional</span>.',
            it: 'Il tempo stesso scorre più lento in fondo a una buca gravitazionale. Un orologio sospeso vicino all’orizzonte batte molto più lentamente di uno lontano; al limite in <var>r&#x208A;</var> sembra, per un osservatore lontano, congelarsi. La luce che risale la buca paga un pedaggio in energia lungo la strada — la sua lunghezza d’onda si allunga e si arrossa. È lo <span class="term">spostamento verso il rosso gravitazionale</span>.'
          }},
          { eq: '1 + z = 1 / √( 1 − 2M/r )      (Schwarzschild)',
            where: {
              en: 'The factor by which wavelengths stretch and clocks slow for a static emitter at radius r. It diverges at r = 2M — the horizon.',
              zh: '半徑 r 處靜止發光源的波長拉伸與時鐘變慢倍率。在 r = 2M（視界）處發散。',
              ja: '半径 r の静止発光源について、波長が伸び時計が遅れる倍率。r = 2M（地平面）で発散します。',
              ko: '반지름 r 의 정지 광원에 대해 파장이 늘어나고 시계가 느려지는 배율. r = 2M(지평선)에서 발산합니다.',
              de: 'Der Faktor, um den sich Wellenlängen dehnen und Uhren verlangsamen für einen statischen Sender bei Radius r. Er divergiert bei r = 2M — dem Horizont.',
              fr: 'Le facteur d’étirement des longueurs d’onde et de ralentissement des horloges pour un émetteur statique au rayon r. Il diverge à r = 2M — l’horizon.',
              es: 'El factor en que se estiran las longitudes de onda y se ralentizan los relojes para un emisor estático en el radio r. Diverge en r = 2M — el horizonte.',
              it: 'Il fattore di cui si allungano le lunghezze d’onda e rallentano gli orologi per un emettitore statico al raggio r. Diverge a r = 2M — l’orizzonte.'
            }},
          { fig: `
  <svg viewBox="0 0 640 300" role="img" aria-label="Light reddening as it climbs out of the gravity well">
    <g transform="translate(110,150)">
      <circle class="dia-bh" r="40"/>
      <circle class="dia-horizon" r="40"/>
      <circle r="2.2" fill="var(--warn)"/>
    </g>
    <path d="M150,150 q20,-22 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0"
      fill="none" stroke="var(--cyan)" stroke-width="2"/>
    <path d="M150,210 q12,-22 24,0 t24,0 t24,0
             M270,210 q18,-22 36,0 t36,0
             M414,210 q28,-22 56,0 t56,0"
      fill="none" stroke="var(--amber)" stroke-width="2"/>
    <text class="dia-lbl-dim" x="150" y="244">emitted (blue)</text>
    <text class="dia-lbl-accent" x="470" y="244">received (red, stretched)</text>
  </svg>`, cap: {
            en: '<b>Climbing out costs energy.</b> A wave emitted near the hole arrives stretched and reddened. The closer to r&#x208A; it starts, the deeper the redshift.',
            zh: '<b>爬出來要付能量。</b>在黑洞附近發出的波，抵達時被拉長、變紅。出發處越靠近 r&#x208A;，紅移越深。',
            ja: '<b>登るとエネルギーがかかる。</b>ブラックホール近くで放たれた波は、伸びて赤くなって届きます。出発点が r&#x208A; に近いほど赤方偏移は深くなります。',
            ko: '<b>기어오르면 에너지가 든다.</b> 블랙홀 근처에서 방출된 파동은 늘어나고 붉어진 채 도착합니다. 출발점이 r&#x208A; 에 가까울수록 적색편이는 깊어집니다.',
            de: '<b>Hinausklettern kostet Energie.</b> Eine nahe dem Loch ausgesandte Welle kommt gedehnt und gerötet an. Je näher an r&#x208A; sie startet, desto tiefer die Rotverschiebung.',
            fr: '<b>Remonter coûte de l’énergie.</b> Une onde émise près du trou arrive étirée et rougie. Plus elle part près de r&#x208A;, plus le décalage vers le rouge est profond.',
            es: '<b>Salir cuesta energía.</b> Una onda emitida cerca del agujero llega estirada y enrojecida. Cuanto más cerca de r&#x208A; parte, más profundo es el corrimiento al rojo.',
            it: '<b>Risalire costa energia.</b> Un’onda emessa vicino al buco arriva allungata e arrossata. Più vicino a r&#x208A; parte, più profondo è lo spostamento verso il rosso.'
          }},
          { call: 'key', body: {
            en: 'Redshift and time dilation are two faces of the same effect: stretched light <i>is</i> slowed time. The accretion-disc colours in the lab encode it — the side rotating toward you is brighter and bluer (Chapter 20).',
            zh: '紅移與時間膨脹是同一效應的兩面：被拉長的光<i>就是</i>變慢的時間。實驗室中吸積盤的顏色即編碼了這點——朝你旋轉的一側更亮、更藍（第 20 章）。',
            ja: '赤方偏移と時間の遅れは同じ効果の二つの顔です：伸びた光<i>こそ</i>遅れた時間です。研究室の吸積円盤の色がこれを符号化しています——あなたへ向かって回転する側はより明るく、より青くなります（第20章）。',
            ko: '적색편이와 시간 지연은 같은 효과의 두 얼굴입니다: 늘어난 빛이 <i>곧</i> 느려진 시간입니다. 실험실의 강착 원반 색이 이를 부호화합니다——당신 쪽으로 회전하는 면이 더 밝고 더 푸릅니다(20장).',
            de: 'Rotverschiebung und Zeitdilatation sind zwei Seiten desselben Effekts: gedehntes Licht <i>ist</i> verlangsamte Zeit. Die Farben der Akkretionsscheibe im Labor codieren das — die auf dich zu rotierende Seite ist heller und blauer (Kapitel 20).',
            fr: 'Le décalage vers le rouge et la dilatation du temps sont deux faces du même effet : la lumière étirée <i>est</i> du temps ralenti. Les couleurs du disque d’accrétion dans le laboratoire l’encodent — le côté qui tourne vers vous est plus brillant et plus bleu (chapitre 20).',
            es: 'El corrimiento al rojo y la dilatación del tiempo son dos caras del mismo efecto: la luz estirada <i>es</i> tiempo ralentizado. Los colores del disco de acreción en el laboratorio lo codifican — el lado que rota hacia ti es más brillante y más azul (capítulo 20).',
            it: 'Lo spostamento verso il rosso e la dilatazione del tempo sono due facce dello stesso effetto: la luce allungata <i>è</i> tempo rallentato. I colori del disco di accrescimento nel laboratorio lo codificano — il lato che ruota verso di te è più luminoso e più blu (capitolo 20).'
          }}
        ]
      },

      // ---- 18. Gravitational lensing ----
      {
        id: 'lensing', no: 18,
        kicker: { en: 'bending starlight', zh: '彎折星光', ja: '星の光を曲げる', ko: '별빛을 휘게 하다',
          de: 'Sternenlicht beugen', fr: 'courber la lumière des étoiles', es: 'curvar la luz estelar', it: 'piegare la luce stellare' },
        title: { en: 'Gravitational lensing', zh: '重力透鏡', ja: '重力レンズ', ko: '중력 렌즈',
          de: 'Gravitationslinsen', fr: 'La lentille gravitationnelle', es: 'La lente gravitacional', it: 'La lente gravitazionale' },
        sub: { en: 'Mass curves the paths of light into arcs and rings.', zh: '質量把光的路徑彎成弧線與環。',
          ja: '質量は光の経路を弧や環に曲げる。', ko: '질량은 빛의 경로를 호와 고리로 휘게 한다.',
          de: 'Masse krümmt die Lichtwege zu Bögen und Ringen.', fr: 'La masse courbe les trajets de la lumière en arcs et en anneaux.',
          es: 'La masa curva las trayectorias de la luz en arcos y anillos.', it: 'La massa piega i percorsi della luce in archi e anelli.' },
        blocks: [
          { p: {
            en: 'Light follows the straightest possible path — but through curved spacetime, "straight" bends. A black hole acts as a <span class="term">gravitational lens</span>: it deflects, magnifies and multiplies the images of whatever lies behind it. A source directly behind the hole smears into a perfect <span class="term">Einstein ring</span>.',
            zh: '光沿著最直的可能路徑前進——但穿過彎曲時空，「直」也會彎。黑洞如同一面<span class="term">重力透鏡</span>：偏折、放大並複製其背後一切的影像。正後方的光源會被抹成一圈完美的<span class="term">愛因斯坦環（Einstein ring）</span>。',
            ja: '光は可能な限り最も真っ直ぐな経路をたどります——しかし曲がった時空では「真っ直ぐ」も曲がります。ブラックホールは<span class="term">重力レンズ</span>として働き、その背後にあるものの像を偏向・拡大・複製します。ブラックホールの真後ろにある光源は、完全な<span class="term">アインシュタイン環（Einstein ring）</span>へと引き伸ばされます。',
            ko: '빛은 가능한 한 가장 곧은 경로를 따릅니다——그러나 휘어진 시공간에서는 「곧음」도 휩니다. 블랙홀은 <span class="term">중력 렌즈</span>로 작용하여 그 뒤에 있는 것의 상을 휘게 하고 확대하며 복제합니다. 블랙홀 바로 뒤의 광원은 완전한 <span class="term">아인슈타인 고리(Einstein ring)</span>로 번집니다.',
            de: 'Licht folgt dem geradestmöglichen Pfad — doch durch die gekrümmte Raumzeit krümmt sich „gerade“. Ein Schwarzes Loch wirkt als <span class="term">Gravitationslinse</span>: Es lenkt ab, vergrößert und vervielfacht die Bilder dessen, was dahinter liegt. Eine genau hinter dem Loch stehende Quelle verschmiert zu einem perfekten <span class="term">Einsteinring</span>.',
            fr: 'La lumière suit le chemin le plus droit possible — mais à travers l’espace-temps courbe, « droit » se courbe. Un trou noir agit comme une <span class="term">lentille gravitationnelle</span> : il dévie, grossit et multiplie les images de ce qui se trouve derrière lui. Une source juste derrière le trou s’étale en un parfait <span class="term">anneau d’Einstein</span>.',
            es: 'La luz sigue el camino más recto posible — pero a través del espacio-tiempo curvo, «recto» se curva. Un agujero negro actúa como una <span class="term">lente gravitacional</span>: desvía, magnifica y multiplica las imágenes de lo que hay detrás. Una fuente justo detrás del agujero se difumina en un perfecto <span class="term">anillo de Einstein</span>.',
            it: 'La luce segue il percorso più dritto possibile — ma attraverso lo spaziotempo curvo, «dritto» si curva. Un buco nero agisce come una <span class="term">lente gravitazionale</span>: devia, ingrandisce e moltiplica le immagini di ciò che gli sta dietro. Una sorgente esattamente dietro il buco si spalma in un perfetto <span class="term">anello di Einstein</span>.'
          }},
          { eq: 'Δφ = 4M / b        (weak deflection, impact parameter b)',
            where: {
              en: 'A ray passing at distance b bends by this angle — twice the Newtonian value, the prediction confirmed in 1919. Close to the photon sphere the bending grows without bound.',
              zh: '以距離 b 通過的光線會偏折此角度——是牛頓值的兩倍，即 1919 年獲證實的預言。逼近光子球時偏折無上限地增大。',
              ja: '距離 b を通過する光線はこの角度だけ曲がります——ニュートン値の2倍で、1919年に確認された予言です。光子球に近づくと曲がりは際限なく増大します。',
              ko: '거리 b 로 지나는 광선은 이 각도만큼 휩니다——뉴턴 값의 두 배로, 1919년에 확인된 예측입니다. 광자구에 가까워지면 휨은 한없이 커집니다.',
              de: 'Ein Strahl, der im Abstand b vorbeiläuft, wird um diesen Winkel gebeugt — doppelt so viel wie der Newton-Wert, die 1919 bestätigte Vorhersage. Nahe der Photonensphäre wächst die Beugung unbegrenzt.',
              fr: 'Un rayon passant à la distance b est dévié de cet angle — le double de la valeur newtonienne, la prédiction confirmée en 1919. Près de la sphère de photons, la déviation croît sans limite.',
              es: 'Un rayo que pasa a la distancia b se desvía este ángulo — el doble del valor newtoniano, la predicción confirmada en 1919. Cerca de la esfera de fotones la desviación crece sin límite.',
              it: 'Un raggio che passa alla distanza b viene deviato di questo angolo — il doppio del valore newtoniano, la previsione confermata nel 1919. Vicino alla sfera dei fotoni la deviazione cresce senza limite.'
            }},
          { fig: `
  <svg viewBox="0 0 640 320" role="img" aria-label="Light rays bending around a black hole forming two images">
    <g transform="translate(330,160)">
      <circle class="dia-photon" r="64"/>
      <circle class="dia-bh" r="40"/>
      <circle class="dia-horizon" r="40"/>
      <circle r="2.2" fill="var(--warn)"/>
    </g>
    <circle cx="40" cy="160" r="4" fill="var(--amber)"/>
    <text class="dia-lbl-dim" x="20" y="186">source</text>
    <path class="dia-ray" d="M40,160 Q220,70 330,96 Q440,116 600,90" marker-end="url(#le)"/>
    <path class="dia-ray" d="M40,160 Q220,250 330,224 Q440,204 600,230" marker-end="url(#le)"/>
    <defs>
      <marker id="le" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="var(--cyan)"/>
      </marker>
    </defs>
    <text class="dia-lbl-dim" x="556" y="80">image 1</text>
    <text class="dia-lbl-dim" x="556" y="250">image 2</text>
  </svg>`, cap: {
            en: '<b>Two paths, two images.</b> Light from one source reaches the observer along several bent routes, producing multiple images — or a full ring when source, hole and observer align.',
            zh: '<b>兩條路徑、兩個影像。</b>來自單一光源的光，沿數條彎曲路線抵達觀測者，產生多重影像——當光源、黑洞與觀測者對齊時則成完整的環。',
            ja: '<b>二つの経路、二つの像。</b>一つの光源からの光は、複数の曲がった経路で観測者に届き、多重像を生みます——光源・ブラックホール・観測者が一直線に並ぶと完全な環になります。',
            ko: '<b>두 경로, 두 상.</b> 한 광원에서 나온 빛이 여러 휘어진 경로로 관측자에게 도달하여 다중 상을 만듭니다——광원, 블랙홀, 관측자가 일직선이면 완전한 고리가 됩니다.',
            de: '<b>Zwei Pfade, zwei Bilder.</b> Licht einer einzigen Quelle erreicht den Beobachter über mehrere gekrümmte Wege und erzeugt mehrere Bilder — oder einen vollen Ring, wenn Quelle, Loch und Beobachter fluchten.',
            fr: '<b>Deux chemins, deux images.</b> La lumière d’une seule source atteint l’observateur par plusieurs trajets courbés, produisant des images multiples — ou un anneau complet quand source, trou et observateur sont alignés.',
            es: '<b>Dos caminos, dos imágenes.</b> La luz de una sola fuente llega al observador por varias rutas curvadas, produciendo imágenes múltiples — o un anillo completo cuando fuente, agujero y observador se alinean.',
            it: '<b>Due percorsi, due immagini.</b> La luce di una sola sorgente raggiunge l’osservatore lungo più tragitti curvati, producendo immagini multiple — o un anello completo quando sorgente, buco e osservatore sono allineati.'
          }},
          { call: 'lab', body: {
            en: 'Toggle <b>LENS</b> to open the ray-traced observer view. Move the camera and watch background stars smear, double, and ring around the shadow. (Ray tracing is heavier, so it runs off the main thread.)',
            zh: '開啟 <b>LENS</b> 打開光線追蹤的觀測者視窗。移動相機，看背景恆星被抹開、成雙，並繞著剪影成環。（光線追蹤較耗資源，故在獨立執行緒上運作。）',
            ja: '<b>LENS</b> を切り替えて光線追跡の観測者視点を開きます。カメラを動かし、背景の星が伸び、二重になり、影の周りで環になるのを見てください。（光線追跡は重いため、メインスレッドの外で動作します。）',
            ko: '<b>LENS</b> 를 켜서 광선 추적 관측자 시점을 여세요. 카메라를 움직여 배경 별이 번지고, 둘로 나뉘고, 그림자 주위로 고리가 되는 것을 보세요. (광선 추적은 무거워서 메인 스레드 밖에서 실행됩니다.)',
            de: 'Schalte <b>LENS</b> ein, um die strahlenverfolgte Beobachteransicht zu öffnen. Bewege die Kamera und beobachte, wie Hintergrundsterne verschmieren, sich verdoppeln und sich um den Schatten ringen. (Strahlenverfolgung ist aufwendiger und läuft daher außerhalb des Haupt-Threads.)',
            fr: 'Activez <b>LENS</b> pour ouvrir la vue d’observateur en lancer de rayons. Déplacez la caméra et regardez les étoiles d’arrière-plan s’étaler, se dédoubler et former un anneau autour de l’ombre. (Le lancer de rayons est plus lourd ; il s’exécute donc hors du fil principal.)',
            es: 'Activa <b>LENS</b> para abrir la vista de observador con trazado de rayos. Mueve la cámara y observa cómo las estrellas de fondo se difuminan, se duplican y forman un anillo alrededor de la sombra. (El trazado de rayos es más pesado, así que se ejecuta fuera del hilo principal.)',
            it: 'Attiva <b>LENS</b> per aprire la vista d’osservatore con ray tracing. Muovi la telecamera e osserva le stelle di sfondo spalmarsi, sdoppiarsi e formare un anello attorno all’ombra. (Il ray tracing è più pesante, quindi gira fuori dal thread principale.)'
          }}
        ]
      },

      // ---- 19. Tidal forces & spaghettification ----
      {
        id: 'tidal', no: 19,
        kicker: { en: 'stretch and squeeze', zh: '拉伸與擠壓', ja: '伸びと圧縮', ko: '늘이기와 짓누르기',
          de: 'dehnen und quetschen', fr: 'étirer et comprimer', es: 'estirar y comprimir', it: 'allungare e comprimere' },
        title: { en: 'Tidal forces and spaghettification', zh: '潮汐力與麵條化',
          ja: '潮汐力とスパゲッティ化', ko: '조석력과 스파게티화',
          de: 'Gezeitenkräfte und Spaghettisierung', fr: 'Les forces de marée et la spaghettification',
          es: 'Las fuerzas de marea y la espaguetización', it: 'Le forze di marea e la spaghettificazione' },
        sub: { en: 'Gravity pulls your feet harder than your head.', zh: '重力拉你的腳比拉你的頭更用力。',
          ja: '重力はあなたの頭より足を強く引く。', ko: '중력은 당신의 머리보다 발을 더 세게 당긴다.',
          de: 'Die Gravitation zieht an deinen Füßen stärker als an deinem Kopf.', fr: 'La gravité tire plus fort sur vos pieds que sur votre tête.',
          es: 'La gravedad tira más fuerte de tus pies que de tu cabeza.', it: 'La gravità tira i tuoi piedi più forte della tua testa.' },
        blocks: [
          { p: {
            en: 'Gravity weakens with distance, so the near side of any falling body is pulled harder than the far side. This <i>difference</i> is the <span class="term">tidal force</span>: it stretches you head-to-toe and squeezes you side-to-side. Near a black hole it grows fierce enough to draw matter into a thin stream — vividly nicknamed <span class="term">spaghettification</span>.',
            zh: '重力隨距離減弱，因此任何墜落物體的近側被拉得比遠側更用力。這個<i>差異</i>就是<span class="term">潮汐力</span>：它把你從頭到腳拉長、從兩側擠壓。在黑洞附近，它強到能把物質拉成細流——生動地俗稱<span class="term">麵條化（spaghettification）</span>。',
            ja: '重力は距離とともに弱まるので、落下する物体の近い側は遠い側より強く引かれます。この<i>差</i>が<span class="term">潮汐力</span>です：頭から足へと引き伸ばし、左右から押しつぶします。ブラックホール近くではそれが激しくなり、物質を細い流れへ引き伸ばします——生き生きと<span class="term">スパゲッティ化（spaghettification）</span>と俗称されます。',
            ko: '중력은 거리에 따라 약해지므로, 떨어지는 물체의 가까운 쪽이 먼 쪽보다 더 세게 당겨집니다. 이 <i>차이</i>가 <span class="term">조석력</span>입니다: 머리에서 발끝까지 늘이고 양옆에서 짓누릅니다. 블랙홀 근처에서는 그것이 사나워져 물질을 가느다란 줄기로 늘입니다——생생하게 <span class="term">스파게티화(spaghettification)</span>라 불립니다.',
            de: 'Die Gravitation wird mit dem Abstand schwächer, daher wird die nahe Seite eines fallenden Körpers stärker gezogen als die ferne. Dieser <i>Unterschied</i> ist die <span class="term">Gezeitenkraft</span>: Sie streckt dich von Kopf bis Fuß und quetscht dich von den Seiten. Nahe einem Schwarzen Loch wird sie heftig genug, um Materie zu einem dünnen Strom zu ziehen — bildhaft <span class="term">Spaghettisierung</span> genannt.',
            fr: 'La gravité faiblit avec la distance, si bien que le côté proche d’un corps en chute est tiré plus fort que le côté lointain. Cette <i>différence</i> est la <span class="term">force de marée</span> : elle vous étire de la tête aux pieds et vous comprime sur les côtés. Près d’un trou noir, elle devient assez féroce pour étirer la matière en un mince filet — surnommée de façon imagée la <span class="term">spaghettification</span>.',
            es: 'La gravedad se debilita con la distancia, así que el lado cercano de cualquier cuerpo en caída es atraído con más fuerza que el lejano. Esta <i>diferencia</i> es la <span class="term">fuerza de marea</span>: te estira de la cabeza a los pies y te comprime por los lados. Cerca de un agujero negro se vuelve tan feroz que estira la materia en un hilo delgado — apodada vívidamente <span class="term">espaguetización</span>.',
            it: 'La gravità si indebolisce con la distanza, perciò il lato vicino di un corpo in caduta è tirato più forte di quello lontano. Questa <i>differenza</i> è la <span class="term">forza di marea</span>: ti allunga dalla testa ai piedi e ti comprime ai lati. Vicino a un buco nero diventa così feroce da tirare la materia in un sottile filo — soprannominata in modo vivido <span class="term">spaghettificazione</span>.'
          }},
          { eq: 'Δg ≈ 2 G M Δr / r³',
            where: {
              en: 'The stretching across a body of size dr at radius r. The 1/r^3 dependence means tides explode near the centre — and, counter-intuitively, are gentle at the horizon of a supermassive hole.',
              zh: '半徑 r 處、尺度 Δr 物體所受的拉伸。1/r³ 的依賴意味潮汐在中心附近暴增——而出人意料地，在超大質量黑洞的視界處反而溫和。',
              ja: '半径 r で大きさ dr の物体にかかる伸び。1/r^3 依存は、潮汐が中心付近で爆発的に強まることを意味します——そして直感に反して、超大質量ブラックホールの地平面では穏やかです。',
              ko: '반지름 r 에서 크기 dr 의 물체에 걸리는 늘임. 1/r^3 의존성은 조석이 중심 근처에서 폭발적으로 커짐을 뜻합니다——그리고 직관과 달리, 초대질량 블랙홀의 지평선에서는 온화합니다.',
              de: 'Die Dehnung über einen Körper der Größe dr beim Radius r. Die 1/r^3-Abhängigkeit bedeutet, dass Gezeiten nahe dem Zentrum explodieren — und, entgegen der Intuition, am Horizont eines supermassereichen Lochs sanft sind.',
              fr: 'L’étirement sur un corps de taille dr au rayon r. La dépendance en 1/r^3 signifie que les marées explosent près du centre — et, contre-intuitivement, sont douces à l’horizon d’un trou supermassif.',
              es: 'El estiramiento a lo ancho de un cuerpo de tamaño dr en el radio r. La dependencia 1/r^3 implica que las mareas explotan cerca del centro — y, contra la intuición, son suaves en el horizonte de un agujero supermasivo.',
              it: 'L’allungamento su un corpo di dimensione dr al raggio r. La dipendenza 1/r^3 significa che le maree esplodono vicino al centro — e, controintuitivamente, sono delicate all’orizzonte di un buco supermassiccio.'
            }},
          { fig: `
  <svg viewBox="0 0 640 300" role="img" aria-label="A body stretched into a stream falling toward a black hole">
    <g transform="translate(110,150)">
      <circle class="dia-bh" r="44"/>
      <circle class="dia-horizon" r="44"/>
      <circle r="2.2" fill="var(--warn)"/>
    </g>
    <g fill="var(--amber)" fill-opacity="0.5" stroke="var(--amber)" stroke-opacity="0.6">
      <circle cx="520" cy="150" r="20"/>
      <ellipse cx="400" cy="150" rx="34" ry="13"/>
      <ellipse cx="290" cy="150" rx="56" ry="7"/>
      <ellipse cx="195" cy="150" rx="62" ry="4"/>
    </g>
    <text class="dia-lbl-dim" x="496" y="190">round, far out</text>
    <text class="dia-lbl-accent" x="150" y="190">stretched thin near r&#x208A;</text>
  </svg>`, cap: {
            en: '<b>Spaghettification.</b> A body falls in round, then stretches along the radial direction and pinches across it as the tide steepens.',
            zh: '<b>麵條化。</b>物體墜入時是圓的，隨潮汐變陡，沿徑向被拉長、橫向被掐細。',
            ja: '<b>スパゲッティ化。</b>物体は丸いまま落ち込み、潮汐が急になるにつれ径方向に伸び、横方向につままれます。',
            ko: '<b>스파게티화.</b> 물체는 둥근 채로 떨어져 들어가다가, 조석이 가팔라질수록 방사 방향으로 늘어나고 가로로 꼬집힙니다.',
            de: '<b>Spaghettisierung.</b> Ein Körper fällt rund hinein, streckt sich dann in radialer Richtung und wird quer dazu eingeschnürt, während die Gezeiten steiler werden.',
            fr: '<b>Spaghettification.</b> Un corps tombe rond, puis s’étire dans la direction radiale et se pince transversalement à mesure que la marée s’accentue.',
            es: '<b>Espaguetización.</b> Un cuerpo cae redondo, luego se estira en la dirección radial y se estrecha transversalmente a medida que la marea se hace más abrupta.',
            it: '<b>Spaghettificazione.</b> Un corpo cade tondo, poi si allunga in direzione radiale e si strozza trasversalmente man mano che la marea si fa più ripida.'
          }},
          { call: 'lab', body: {
            en: 'Toggle <b>TIDAL</b> and open the tidal microscope. Bring a body inward and watch the stretch/squeeze vectors grow; bodies with low binding strength tear apart first.',
            zh: '開啟 <b>TIDAL</b> 並打開潮汐顯微鏡。把天體往內帶，看拉伸／擠壓向量增大；束縛強度低的天體會最先被撕裂。',
            ja: '<b>TIDAL</b> を切り替えて潮汐顕微鏡を開きます。天体を内側へ近づけ、伸び／圧縮ベクトルが大きくなるのを見てください；束縛強度の低い天体が最初に引き裂かれます。',
            ko: '<b>TIDAL</b> 을 켜고 조석 현미경을 여세요. 천체를 안쪽으로 가져가 늘임/짓누름 벡터가 커지는 것을 보세요; 결합 강도가 낮은 천체가 먼저 찢어집니다.',
            de: 'Schalte <b>TIDAL</b> ein und öffne das Gezeitenmikroskop. Bringe einen Körper nach innen und beobachte, wie die Dehnungs-/Stauchungsvektoren wachsen; Körper mit geringer Bindungsstärke zerreißen zuerst.',
            fr: 'Activez <b>TIDAL</b> et ouvrez le microscope de marée. Rapprochez un corps vers l’intérieur et regardez les vecteurs d’étirement/compression croître ; les corps à faible cohésion se déchirent en premier.',
            es: 'Activa <b>TIDAL</b> y abre el microscopio de marea. Lleva un cuerpo hacia dentro y observa cómo crecen los vectores de estiramiento/compresión; los cuerpos de baja cohesión se desgarran primero.',
            it: 'Attiva <b>TIDAL</b> e apri il microscopio di marea. Porta un corpo verso l’interno e osserva i vettori di allungamento/compressione crescere; i corpi a bassa coesione si lacerano per primi.'
          }}
        ]
      },

      // ---- 20. Accretion disc ----
      {
        id: 'accretion', no: 20,
        kicker: { en: 'the glowing spiral', zh: '發光的螺旋', ja: '輝く螺旋', ko: '빛나는 나선',
          de: 'die glühende Spirale', fr: 'la spirale incandescente', es: 'la espiral incandescente', it: 'la spirale incandescente' },
        title: { en: 'The accretion disc', zh: '吸積盤', ja: '降着円盤', ko: '강착 원반',
          de: 'Die Akkretionsscheibe', fr: 'Le disque d’accrétion', es: 'El disco de acreción', it: 'Il disco di accrescimento' },
        sub: { en: 'Infalling gas heats up and shines before it crosses over.', zh: '落入的氣體在越界前升溫發光。',
          ja: '落ち込むガスは越境する前に加熱され輝く。', ko: '떨어져 들어가는 가스는 넘어가기 전에 가열되어 빛난다.',
          de: 'Einfallendes Gas erhitzt sich und leuchtet, bevor es hinüberfällt.', fr: 'Le gaz qui tombe s’échauffe et brille avant de franchir l’horizon.',
          es: 'El gas que cae se calienta y brilla antes de cruzar.', it: 'Il gas che cade si riscalda e brilla prima di varcare l’orizzonte.' },
        blocks: [
          { p: {
            en: 'Matter rarely falls straight in. With even a little angular momentum it settles into a flat, rotating <span class="term">accretion disc</span>. Friction between neighbouring rings — orbiting at different speeds — heats the gas, letting it shed energy and spiral slowly inward. The disc glows hotter and bluer toward the centre, terminating near the ISCO.',
            zh: '物質很少筆直落入。只要帶一點角動量，它便沉澱成一個扁平、旋轉的<span class="term">吸積盤</span>。相鄰環圈以不同速度繞行，彼此摩擦加熱氣體，使其釋出能量、緩緩向內盤旋。吸積盤越靠中心越熱、越藍，並終止於 ISCO 附近。',
            ja: '物質がまっすぐ落ち込むことはまれです。わずかでも角運動量があれば、平らで回転する<span class="term">降着円盤</span>に落ち着きます。異なる速度で周回する隣り合うリング同士の摩擦がガスを加熱し、エネルギーを放出させてゆっくり内側へ螺旋させます。円盤は中心へ向かうほど熱く青くなり、ISCO 付近で途切れます。',
            ko: '물질이 곧장 떨어지는 일은 드뭅니다. 약간의 각운동량만 있어도 평평하고 회전하는 <span class="term">강착 원반</span>으로 자리 잡습니다. 서로 다른 속도로 도는 이웃 고리 사이의 마찰이 가스를 데우고, 에너지를 잃게 하여 천천히 안쪽으로 나선을 그리게 합니다. 원반은 중심으로 갈수록 더 뜨겁고 푸르며, ISCO 근처에서 끝납니다.',
            de: 'Materie fällt selten direkt hinein. Schon mit etwas Drehimpuls legt sie sich in eine flache, rotierende <span class="term">Akkretionsscheibe</span>. Reibung zwischen benachbarten Ringen — die mit unterschiedlicher Geschwindigkeit umlaufen — erhitzt das Gas, lässt es Energie abgeben und langsam nach innen spiralen. Die Scheibe glüht zur Mitte hin heißer und blauer und endet nahe der ISCO.',
            fr: 'La matière tombe rarement tout droit. Avec ne serait-ce qu’un peu de moment cinétique, elle se range en un <span class="term">disque d’accrétion</span> plat et tournant. Le frottement entre anneaux voisins — orbitant à des vitesses différentes — chauffe le gaz, lui fait perdre de l’énergie et spiraler lentement vers l’intérieur. Le disque brille plus chaud et plus bleu vers le centre, et se termine près de la ISCO.',
            es: 'La materia rara vez cae en línea recta. Con apenas un poco de momento angular se asienta en un <span class="term">disco de acreción</span> plano y giratorio. La fricción entre anillos vecinos — que orbitan a distintas velocidades — calienta el gas, le hace ceder energía y espiralar lentamente hacia dentro. El disco brilla más caliente y más azul hacia el centro, y termina cerca de la ISCO.',
            it: 'La materia di rado cade dritta. Con anche solo un po’ di momento angolare si dispone in un <span class="term">disco di accrescimento</span> piatto e rotante. L’attrito tra anelli vicini — che orbitano a velocità diverse — riscalda il gas, gli fa cedere energia e spiraleggiare lentamente verso l’interno. Il disco brilla più caldo e più blu verso il centro, e termina vicino alla ISCO.'
          }},
          { eq: 'T(r) ∝ r^(−3/4)        (thin-disc, far from the edge)',
            where: {
              en: 'The temperature profile of a standard thin disc. Inner rings blaze in UV/X-ray; outer rings glow cooler and redder.',
              zh: '標準薄盤的溫度分佈。內環在紫外／X 光波段熾烈發光；外環則較冷、偏紅。',
              ja: '標準的な薄い円盤の温度分布。内側のリングは紫外／X線で激しく輝き、外側のリングはより冷たく赤く光ります。',
              ko: '표준 얇은 원반의 온도 분포. 안쪽 고리는 자외선/X선으로 강렬하게 빛나고, 바깥 고리는 더 차갑고 붉게 빛납니다.',
              de: 'Das Temperaturprofil einer Standard-Dünnscheibe. Innere Ringe lodern im UV-/Röntgenbereich; äußere Ringe glühen kühler und röter.',
              fr: 'Le profil de température d’un disque mince standard. Les anneaux internes flamboient en UV/rayons X ; les anneaux externes brillent plus froids et plus rouges.',
              es: 'El perfil de temperatura de un disco delgado estándar. Los anillos internos arden en UV/rayos X; los externos brillan más fríos y rojizos.',
              it: 'Il profilo di temperatura di un disco sottile standard. Gli anelli interni divampano nell’UV/raggi X; quelli esterni brillano più freddi e rossi.'
            }},
          { fig: `
  <svg viewBox="0 0 640 300" role="img" aria-label="Accretion disc temperature gradient">
    <defs>
      <linearGradient id="disc" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="var(--cyan)" stop-opacity="0.85"/>
        <stop offset="0.45" stop-color="var(--amber)" stop-opacity="0.8"/>
        <stop offset="1" stop-color="var(--warn)" stop-opacity="0.5"/>
      </linearGradient>
    </defs>
    <g transform="translate(320,150)">
      <ellipse cx="0" cy="0" rx="280" ry="58" fill="none" stroke="url(#disc)" stroke-width="26" stroke-opacity="0.5"/>
      <circle class="dia-isco" rx="0" r="70" transform="scale(1,0.36)"/>
      <circle class="dia-bh" r="30"/>
      <circle class="dia-horizon" r="30"/>
    </g>
    <text class="dia-lbl" x="60" y="60" fill="var(--cyan)">hot &middot; blue (inner)</text>
    <text class="dia-lbl-accent" x="470" y="60">cool &middot; red (outer)</text>
    <text class="dia-lbl-dim" x="270" y="250">inner edge near the ISCO</text>
  </svg>`, cap: {
            en: '<b>A temperature map.</b> The disc runs from a cool red rim to a fierce blue-white inner edge, which sits near the ISCO — so spin (which sets the ISCO) controls the disc’s luminosity.',
            zh: '<b>溫度分佈圖。</b>吸積盤從外緣的冷紅，過渡到內緣熾烈的藍白；內緣位於 ISCO 附近——因此自轉（決定 ISCO）掌控吸積盤的亮度。',
            ja: '<b>温度マップ。</b>円盤は外縁の冷たい赤から、ISCO 付近にある内縁の激しい青白へと移ります——つまり自転（ISCO を決める）が円盤の光度を支配します。',
            ko: '<b>온도 지도.</b> 원반은 바깥 가장자리의 차가운 빨강에서 ISCO 근처에 있는 안쪽 가장자리의 강렬한 청백으로 이어집니다——즉 스핀(ISCO 를 정하는)이 원반의 광도를 좌우합니다.',
            de: '<b>Eine Temperaturkarte.</b> Die Scheibe reicht von einem kühlen roten Rand bis zu einer grellen blauweißen Innenkante nahe der ISCO — der Spin (der die ISCO festlegt) steuert also die Leuchtkraft der Scheibe.',
            fr: '<b>Une carte de température.</b> Le disque va d’un bord rouge froid à une arête interne d’un blanc-bleu intense, située près de la ISCO — c’est donc le spin (qui fixe la ISCO) qui contrôle la luminosité du disque.',
            es: '<b>Un mapa de temperatura.</b> El disco va de un borde rojo frío a un canto interno blanco-azul intenso, situado cerca de la ISCO — así que el espín (que fija la ISCO) controla la luminosidad del disco.',
            it: '<b>Una mappa di temperatura.</b> Il disco va da un bordo rosso freddo a un margine interno bianco-blu intenso, situato vicino alla ISCO — quindi lo spin (che fissa la ISCO) controlla la luminosità del disco.'
          }},
          { call: 'lab', body: {
            en: 'The disc renders by default. Change <b>a</b> to move its inner edge (via the ISCO), and watch the Doppler-brightened side — the half rotating toward you appears brighter and bluer.',
            zh: '吸積盤預設即會繪製。改變 <b>a</b> 以移動其內緣（透過 ISCO），並注意都卜勒增亮的一側——朝你旋轉的那一半看起來更亮、更藍。',
            ja: '円盤は既定で描画されます。<b>a</b> を変えて（ISCO を介して）内縁を動かし、ドップラーで増光した側に注目してください——あなたへ向かって回転する半分がより明るく青く見えます。',
            ko: '원반은 기본으로 그려집니다. <b>a</b> 를 바꿔(ISCO 를 통해) 안쪽 가장자리를 이동시키고, 도플러로 밝아진 쪽을 보세요——당신 쪽으로 회전하는 절반이 더 밝고 푸르게 보입니다.',
            de: 'Die Scheibe wird standardmäßig gezeichnet. Ändere <b>a</b>, um ihre Innenkante (über die ISCO) zu verschieben, und beachte die doppler-aufgehellte Seite — die auf dich zu rotierende Hälfte erscheint heller und blauer.',
            fr: 'Le disque s’affiche par défaut. Changez <b>a</b> pour déplacer son bord interne (via la ISCO) et observez le côté éclairci par effet Doppler — la moitié qui tourne vers vous paraît plus brillante et plus bleue.',
            es: 'El disco se dibuja por defecto. Cambia <b>a</b> para mover su borde interno (a través de la ISCO) y observa el lado realzado por Doppler — la mitad que rota hacia ti se ve más brillante y más azul.',
            it: 'Il disco viene disegnato per impostazione predefinita. Cambia <b>a</b> per spostarne il bordo interno (tramite la ISCO) e osserva il lato schiarito per effetto Doppler — la metà che ruota verso di te appare più luminosa e più blu.'
          }}
        ]
      },

      // ---- 21. Relativistic jets ----
      {
        id: 'jets', no: 21,
        kicker: { en: 'powered by spin', zh: '由自轉驅動', ja: '自転で駆動', ko: '스핀으로 구동',
          de: 'vom Spin angetrieben', fr: 'alimenté par le spin', es: 'impulsado por el espín', it: 'alimentato dallo spin' },
        title: { en: 'Relativistic jets', zh: '相對論性噴流', ja: '相対論的ジェット', ko: '상대론적 제트',
          de: 'Relativistische Jets', fr: 'Les jets relativistes', es: 'Los chorros relativistas', it: 'I getti relativistici' },
        sub: { en: 'Magnetic fields tap the spin and fire beams from the poles.', zh: '磁場汲取自轉，從兩極噴射出束流。',
          ja: '磁場が自転を汲み取り、両極からビームを噴射する。', ko: '자기장이 스핀을 끌어내어 두 극에서 빔을 쏜다.',
          de: 'Magnetfelder zapfen den Spin an und feuern Strahlen aus den Polen.', fr: 'Les champs magnétiques puisent dans le spin et tirent des faisceaux depuis les pôles.',
          es: 'Los campos magnéticos aprovechan el espín y disparan haces desde los polos.', it: 'I campi magnetici attingono allo spin e sparano fasci dai poli.' },
        blocks: [
          { p: {
            en: 'Some black holes launch narrow beams of plasma from their poles at nearly the speed of light, reaching across galaxies. The leading explanation is the <span class="term">Blandford-Znajek mechanism</span>: magnetic field lines, threaded through the hole and anchored in the disc, are wound up by frame dragging and act like a cosmic dynamo — extracting <i>rotational</i> energy and flinging plasma outward along the spin axis.',
            zh: '有些黑洞會從兩極以近光速射出狹窄的電漿束，橫跨整個星系。主流解釋是 <span class="term">Blandford-Znajek 機制</span>：穿過黑洞、錨定於吸積盤的磁力線，被參考系拖曳捲緊，宛如宇宙級發電機——汲取<i>自轉</i>能量，沿自轉軸把電漿向外拋射。',
            ja: '一部のブラックホールは、両極からほぼ光速の細いプラズマのビームを放ち、銀河を横切るほど届かせます。有力な説明は <span class="term">Blandford-Znajek 機構</span>です：ブラックホールを貫き円盤に固定された磁力線が、参照系の引きずりで巻き上げられ、宇宙規模の発電機のように働いて——<i>回転</i>エネルギーを取り出し、自転軸に沿ってプラズマを外へ放り出します。',
            ko: '일부 블랙홀은 두 극에서 거의 광속의 좁은 플라스마 빔을 쏘아 은하를 가로질러 뻗습니다. 유력한 설명은 <span class="term">Blandford-Znajek 메커니즘</span>입니다: 블랙홀을 꿰뚫고 원반에 고정된 자기력선이 좌표계 끌림으로 감기며 우주적 발전기처럼 작동하여——<i>회전</i> 에너지를 추출하고 자전축을 따라 플라스마를 밖으로 내던집니다.',
            de: 'Manche Schwarze Löcher schleudern aus ihren Polen schmale Plasmastrahlen nahezu mit Lichtgeschwindigkeit, die sich über Galaxien erstrecken. Die führende Erklärung ist der <span class="term">Blandford-Znajek-Mechanismus</span>: Magnetfeldlinien, die das Loch durchziehen und in der Scheibe verankert sind, werden vom Frame-Dragging aufgewickelt und wirken wie ein kosmischer Dynamo — sie entziehen <i>Rotations</i>energie und schleudern Plasma entlang der Spinachse hinaus.',
            fr: 'Certains trous noirs lancent depuis leurs pôles d’étroits faisceaux de plasma à une vitesse proche de celle de la lumière, qui traversent des galaxies. L’explication dominante est le <span class="term">mécanisme de Blandford-Znajek</span> : des lignes de champ magnétique, traversant le trou et ancrées dans le disque, sont enroulées par l’entraînement des référentiels et agissent comme une dynamo cosmique — extrayant l’énergie de <i>rotation</i> et projetant le plasma le long de l’axe de spin.',
            es: 'Algunos agujeros negros lanzan desde sus polos estrechos haces de plasma a casi la velocidad de la luz, que cruzan galaxias enteras. La explicación dominante es el <span class="term">mecanismo de Blandford-Znajek</span>: las líneas de campo magnético, que atraviesan el agujero y se anclan en el disco, son enrolladas por el arrastre de referencia y actúan como una dinamo cósmica — extrayendo energía de <i>rotación</i> y lanzando plasma hacia fuera a lo largo del eje de espín.',
            it: 'Alcuni buchi neri lanciano dai loro poli stretti fasci di plasma quasi alla velocità della luce, che attraversano intere galassie. La spiegazione principale è il <span class="term">meccanismo di Blandford-Znajek</span>: le linee di campo magnetico, che attraversano il buco e sono ancorate nel disco, vengono avvolte dal trascinamento dei sistemi di riferimento e agiscono come una dinamo cosmica — estraendo energia di <i>rotazione</i> e scagliando il plasma verso l’esterno lungo l’asse di spin.'
          }},
          { eq: 'P_BZ ∝ B² Φ² Ω_H² ,    Ω_H = a / (2 M r₊)',
            where: {
              en: 'Jet power scales with magnetic flux Phi and the square of the horizon angular velocity Omega_H. No spin (a = 0) means no Blandford-Znajek jet.',
              zh: '噴流功率隨磁通量 Φ 與視界角速度 Ω_H 的平方變化。無自轉（a = 0）就沒有 Blandford-Znajek 噴流。',
              ja: 'ジェット出力は磁束 Φ と地平面角速度 Ω_H の二乗に比例します。自転がない（a = 0）と Blandford-Znajek ジェットは生じません。',
              ko: '제트 출력은 자기 선속 Φ 와 지평선 각속도 Ω_H 의 제곱에 비례합니다. 스핀이 없으면(a = 0) Blandford-Znajek 제트도 없습니다.',
              de: 'Die Jetleistung skaliert mit dem magnetischen Fluss Phi und dem Quadrat der Horizont-Winkelgeschwindigkeit Omega_H. Kein Spin (a = 0) bedeutet keinen Blandford-Znajek-Jet.',
              fr: 'La puissance du jet varie avec le flux magnétique Phi et le carré de la vitesse angulaire de l’horizon Omega_H. Pas de spin (a = 0), pas de jet de Blandford-Znajek.',
              es: 'La potencia del chorro escala con el flujo magnético Phi y el cuadrado de la velocidad angular del horizonte Omega_H. Sin espín (a = 0) no hay chorro de Blandford-Znajek.',
              it: 'La potenza del getto scala con il flusso magnetico Phi e il quadrato della velocità angolare dell’orizzonte Omega_H. Senza spin (a = 0) non c’è getto di Blandford-Znajek.'
            }},
          { fig: `
  <svg viewBox="0 0 640 320" role="img" aria-label="Bipolar jets along the spin axis">
    <g transform="translate(320,160)">
      <path d="M-16,-30 L-40,-150 L40,-150 L16,-30 Z" fill="var(--cyan)" fill-opacity="0.18" stroke="var(--cyan)" stroke-opacity="0.6"/>
      <path d="M-16,30 L-40,150 L40,150 L16,30 Z" fill="var(--cyan)" fill-opacity="0.18" stroke="var(--cyan)" stroke-opacity="0.6"/>
      <ellipse cx="0" cy="0" rx="120" ry="26" fill="var(--amber)" fill-opacity="0.16" stroke="var(--amber)" stroke-opacity="0.5"/>
      <circle class="dia-bh" r="26"/>
      <circle class="dia-horizon" r="26"/>
      <g stroke="var(--violet)" stroke-opacity="0.5" fill="none">
        <path d="M0,-30 C40,-60 40,-120 8,-150"/>
        <path d="M0,30 C40,60 40,120 8,150"/>
      </g>
    </g>
    <text class="dia-lbl" x="430" y="80" fill="var(--cyan)">collimated jet</text>
    <text class="dia-lbl-accent" x="430" y="170">accretion disc</text>
    <text class="dia-lbl" x="430" y="250" fill="var(--violet)">wound field lines</text>
  </svg>`, cap: {
            en: '<b>A spin-powered dynamo.</b> Field lines (violet) twisted by the rotating hole channel energy into two opposed jets (cyan) along the spin axis, fed by the disc.',
            zh: '<b>自轉驅動的發電機。</b>被旋轉黑洞扭轉的磁力線（紫），把能量導入沿自轉軸的兩道相反噴流（青），由吸積盤供給。',
            ja: '<b>自転駆動のダイナモ。</b>回転するブラックホールにねじられた磁力線（紫）が、円盤から供給を受け、自転軸に沿った二本の相反するジェット（シアン）へエネルギーを導きます。',
            ko: '<b>스핀 구동 발전기.</b> 회전하는 블랙홀에 의해 비틀린 자기력선(보라)이 원반의 공급을 받아 자전축을 따라 서로 반대인 두 제트(청록)로 에너지를 보냅니다.',
            de: '<b>Ein spingetriebener Dynamo.</b> Vom rotierenden Loch verdrehte Feldlinien (violett) leiten Energie in zwei entgegengesetzte Jets (cyan) entlang der Spinachse, gespeist von der Scheibe.',
            fr: '<b>Une dynamo alimentée par le spin.</b> Les lignes de champ (violet) tordues par le trou en rotation canalisent l’énergie en deux jets opposés (cyan) le long de l’axe de spin, alimentés par le disque.',
            es: '<b>Una dinamo impulsada por el espín.</b> Las líneas de campo (violeta) retorcidas por el agujero en rotación canalizan la energía en dos chorros opuestos (cian) a lo largo del eje de espín, alimentados por el disco.',
            it: '<b>Una dinamo alimentata dallo spin.</b> Le linee di campo (viola) attorcigliate dal buco rotante incanalano l’energia in due getti opposti (ciano) lungo l’asse di spin, alimentati dal disco.'
          }},
          { call: 'lab', body: {
            en: 'Open the <b>MHD monitor</b> and raise the magnetic field <b>B</b> with a non-zero <b>a</b>. The jet power and Lorentz factor respond live; set a = 0 and the Blandford-Znajek drive vanishes.',
            zh: '打開 <b>MHD 監視器</b>，在 <b>a</b> 非零時提高磁場 <b>B</b>。噴流功率與勞侖茲因子會即時反應；設 a = 0，Blandford-Znajek 驅動便消失。',
            ja: '<b>MHD モニター</b>を開き、<b>a</b> が非ゼロの状態で磁場 <b>B</b> を上げます。ジェット出力とローレンツ因子がリアルタイムで反応します；a = 0 にすると Blandford-Znajek 駆動は消えます。',
            ko: '<b>MHD 모니터</b>를 열고 <b>a</b> 가 0이 아닌 상태에서 자기장 <b>B</b> 를 올리세요. 제트 출력과 로런츠 인자가 실시간으로 반응합니다; a = 0 으로 두면 Blandford-Znajek 구동이 사라집니다.',
            de: 'Öffne den <b>MHD-Monitor</b> und erhöhe das Magnetfeld <b>B</b> bei einem von null verschiedenen <b>a</b>. Jetleistung und Lorentzfaktor reagieren live; setze a = 0, und der Blandford-Znajek-Antrieb verschwindet.',
            fr: 'Ouvrez le <b>moniteur MHD</b> et augmentez le champ magnétique <b>B</b> avec un <b>a</b> non nul. La puissance du jet et le facteur de Lorentz réagissent en direct ; mettez a = 0 et l’entraînement de Blandford-Znajek disparaît.',
            es: 'Abre el <b>monitor MHD</b> y sube el campo magnético <b>B</b> con un <b>a</b> distinto de cero. La potencia del chorro y el factor de Lorentz responden en vivo; pon a = 0 y el impulso de Blandford-Znajek desaparece.',
            it: 'Apri il <b>monitor MHD</b> e aumenta il campo magnetico <b>B</b> con un <b>a</b> diverso da zero. La potenza del getto e il fattore di Lorentz rispondono in tempo reale; imposta a = 0 e l’azionamento di Blandford-Znajek svanisce.'
          }}
        ]
      },

      // ---- 22. Gravitational waves & inspiral ----
      {
        id: 'gravitational-waves', no: 22,
        kicker: { en: 'ripples in spacetime', zh: '時空中的漣漪', ja: '時空のさざ波', ko: '시공간의 잔물결',
          de: 'Wellen in der Raumzeit', fr: 'des ondulations de l’espace-temps', es: 'ondulaciones en el espacio-tiempo', it: 'increspature nello spaziotempo' },
        title: { en: 'Gravitational waves and binary inspiral', zh: '重力波與雙星旋近',
          ja: '重力波と連星のインスパイラル', ko: '중력파와 쌍성 인스파이럴',
          de: 'Gravitationswellen und der Doppel-Inspiral', fr: 'Les ondes gravitationnelles et la spirale binaire',
          es: 'Las ondas gravitacionales y la espiral binaria', it: 'Le onde gravitazionali e la spirale binaria' },
        sub: { en: 'Orbiting masses radiate spacetime ripples and spiral together.', zh: '繞行的質量輻射出時空漣漪，並彼此旋近。',
          ja: '周回する質量は時空のさざ波を放ち、互いに螺旋して近づく。', ko: '공전하는 질량은 시공간의 잔물결을 방출하며 서로 나선을 그리며 가까워진다.',
          de: 'Umlaufende Massen strahlen Raumzeitwellen ab und spiralen aufeinander zu.', fr: 'Des masses en orbite rayonnent des ondulations de l’espace-temps et spiralent l’une vers l’autre.',
          es: 'Las masas en órbita irradian ondulaciones del espacio-tiempo y espiralan juntas.', it: 'Masse in orbita irradiano increspature dello spaziotempo e spiraleggiano l’una verso l’altra.' },
        blocks: [
          { p: {
            en: 'Two masses orbiting each other stir the surrounding spacetime into <span class="term">gravitational waves</span> — ripples that carry energy away at the speed of light. Losing energy, the pair spirals closer, orbits faster, and radiates harder: a runaway <span class="term">inspiral</span> that ends in a merger. The rising tone of frequency and amplitude is the famous "chirp" detectors like LIGO hear.',
            zh: '兩個彼此繞行的質量，會把周圍時空攪動成<span class="term">重力波</span>——以光速帶走能量的漣漪。能量流失使這對天體越旋越近、越繞越快、輻射越強：一場失控的<span class="term">旋近（inspiral）</span>，終結於合併。頻率與振幅同步攀升的聲調，就是 LIGO 等探測器聽到的著名「啁啾（chirp）」。',
            ja: '互いに周回する二つの質量は、周囲の時空をかき乱して<span class="term">重力波</span>を生みます——光速でエネルギーを運び去るさざ波です。エネルギーを失うにつれ、この対は近づき、速く回り、より強く放射します：暴走的な<span class="term">インスパイラル（inspiral）</span>で、合体に終わります。周波数と振幅がそろって上がっていく音色こそ、LIGO のような検出器が聞く有名な「チャープ（chirp）」です。',
            ko: '서로 공전하는 두 질량은 주변 시공간을 휘저어 <span class="term">중력파</span>를 만듭니다——광속으로 에너지를 실어 가는 잔물결입니다. 에너지를 잃으면서 이 쌍은 더 가까워지고, 더 빨리 돌며, 더 강하게 복사합니다: 폭주하는 <span class="term">인스파이럴(inspiral)</span>로, 병합으로 끝납니다. 진동수와 진폭이 함께 치솟는 음이 바로 LIGO 같은 검출기가 듣는 유명한 「처프(chirp)」입니다.',
            de: 'Zwei einander umkreisende Massen versetzen die umgebende Raumzeit in <span class="term">Gravitationswellen</span> — Wellen, die mit Lichtgeschwindigkeit Energie forttragen. Beim Energieverlust spiralt das Paar enger, umkreist sich schneller und strahlt stärker: ein außer Kontrolle geratener <span class="term">Inspiral</span>, der in einer Verschmelzung endet. Der ansteigende Ton aus Frequenz und Amplitude ist der berühmte „Chirp“, den Detektoren wie LIGO hören.',
            fr: 'Deux masses en orbite l’une autour de l’autre agitent l’espace-temps environnant en <span class="term">ondes gravitationnelles</span> — des ondulations qui emportent de l’énergie à la vitesse de la lumière. En perdant de l’énergie, le couple spirale plus près, tourne plus vite et rayonne plus fort : une <span class="term">spirale</span> emballée qui se termine par une fusion. La montée conjointe de fréquence et d’amplitude est le fameux « chirp » qu’entendent les détecteurs comme LIGO.',
            es: 'Dos masas que se orbitan mutuamente agitan el espacio-tiempo circundante en <span class="term">ondas gravitacionales</span> — ondulaciones que se llevan energía a la velocidad de la luz. Al perder energía, la pareja espiral más cerca, gira más rápido e irradia con más fuerza: una <span class="term">espiral</span> desbocada que termina en una fusión. El tono ascendente de frecuencia y amplitud es el famoso «chirp» que oyen detectores como LIGO.',
            it: 'Due masse che si orbitano a vicenda agitano lo spaziotempo circostante in <span class="term">onde gravitazionali</span> — increspature che portano via energia alla velocità della luce. Perdendo energia, la coppia spiraleggia più vicino, ruota più veloce e irradia più forte: una <span class="term">spirale</span> incontrollata che termina con una fusione. Il tono crescente di frequenza e ampiezza è il famoso «chirp» che sentono rivelatori come LIGO.'
          }},
          { eq: 'dE/dt ∝ − (μ² M³) / r⁵ ,     t_merge ∝ r⁴',
            where: {
              en: 'Energy loss climbs steeply as the separation r shrinks, so the final orbits collapse in a flash. Wide binaries take eons; close ones merge in seconds.',
              zh: '能量流失隨間距 r 縮小而急遽攀升，因此末段軌道在瞬間崩塌。寬間距雙星需歷時億萬年；近距者則於數秒內合併。',
              ja: 'エネルギー損失は間隔 r が縮むほど急激に増すため、最後の軌道は一瞬で崩れます。広い連星は悠久の時を要し、近い連星は数秒で合体します。',
              ko: '에너지 손실은 간격 r 이 줄수록 가파르게 커지므로, 마지막 궤도는 순식간에 붕괴합니다. 넓은 쌍성은 영겁이 걸리고, 가까운 쌍성은 수 초 만에 병합합니다.',
              de: 'Der Energieverlust steigt steil an, je kleiner der Abstand r wird, sodass die letzten Bahnen blitzartig kollabieren. Weite Doppelsterne brauchen Äonen; enge verschmelzen in Sekunden.',
              fr: 'La perte d’énergie grimpe fortement à mesure que la séparation r diminue, si bien que les dernières orbites s’effondrent en un éclair. Les binaires larges prennent des éons ; les serrées fusionnent en quelques secondes.',
              es: 'La pérdida de energía sube abruptamente al encogerse la separación r, así que las últimas órbitas colapsan en un instante. Las binarias amplias tardan eones; las cercanas se fusionan en segundos.',
              it: 'La perdita di energia sale ripidamente man mano che la separazione r si riduce, così le ultime orbite collassano in un lampo. I binari larghi impiegano eoni; quelli stretti si fondono in secondi.'
            }},
          { fig: `
  <svg viewBox="0 0 640 300" role="img" aria-label="Inspiral and chirp waveform">
    <g transform="translate(160,150)">
      <path class="dia-orbit" d="M120,0 C120,66 -120,66 -120,0 C-120,-66 120,-66 120,0 Z" opacity="0.4"/>
      <path class="dia-orbit" d="M70,0 C70,40 -70,40 -70,0 C-70,-40 70,-40 70,0 Z" opacity="0.7"/>
      <circle r="2.2" fill="var(--warn)"/>
      <circle cx="120" cy="0" r="6" fill="var(--amber)"/>
      <circle cx="-70" cy="0" r="5" fill="var(--cyan)"/>
    </g>
    <path d="M340,150
             q8,-30 16,0 t16,0
             q7,-44 14,0 t14,0
             q5,-60 10,0 q5,-72 10,0 q4,-80 8,0 q3,-40 6,0 q2,-12 4,0"
      fill="none" stroke="var(--amber)" stroke-width="1.8"/>
    <text class="dia-lbl-dim" x="90" y="280">tightening orbit</text>
    <text class="dia-lbl-accent" x="400" y="280">chirp: faster &amp; louder &#x2192; merger</text>
  </svg>`, cap: {
            en: '<b>The chirp.</b> As the binary tightens (left), the emitted wave sweeps up in frequency and amplitude (right) until the two merge.',
            zh: '<b>啁啾。</b>雙星收緊時（左），所輻射的波在頻率與振幅上同步攀升（右），直到兩者合併。',
            ja: '<b>チャープ。</b>連星が縮まると（左）、放たれる波は周波数と振幅で上昇し（右）、やがて二つは合体します。',
            ko: '<b>처프.</b> 쌍성이 조여들면(왼쪽), 방출되는 파동의 진동수와 진폭이 치솟고(오른쪽) 마침내 둘이 병합합니다.',
            de: '<b>Der Chirp.</b> Während sich der Doppelstern zusammenzieht (links), steigt die ausgesandte Welle in Frequenz und Amplitude (rechts), bis beide verschmelzen.',
            fr: '<b>Le chirp.</b> À mesure que la binaire se resserre (à gauche), l’onde émise monte en fréquence et en amplitude (à droite) jusqu’à la fusion des deux.',
            es: '<b>El chirp.</b> A medida que la binaria se estrecha (izquierda), la onda emitida sube en frecuencia y amplitud (derecha) hasta que ambas se fusionan.',
            it: '<b>Il chirp.</b> Mentre il binario si stringe (a sinistra), l’onda emessa sale in frequenza e ampiezza (a destra) finché i due si fondono.'
          }},
          { call: 'lab', body: {
            en: 'Place a <b>companion</b> star to form a binary, toggle <b>GW</b>, and let it run — the orbit decays and the wave slice steepens. Re-throw the companion to reset the inspiral.',
            zh: '放置一顆<b>伴星</b>組成雙星，開啟 <b>GW</b> 並讓它運行——軌道衰減，重力波切片變陡。重新拋出伴星即可重置旋近。',
            ja: '<b>伴星</b>を置いて連星を作り、<b>GW</b> を切り替えて走らせてください——軌道は減衰し、波形の切片は急になります。伴星を投げ直すとインスパイラルがリセットされます。',
            ko: '<b>동반성</b>을 두어 쌍성을 만들고 <b>GW</b> 를 켜서 진행시키세요——궤도가 감쇠하고 파형 단면이 가팔라집니다. 동반성을 다시 던지면 인스파이럴이 초기화됩니다.',
            de: 'Platziere einen <b>Begleitstern</b>, um einen Doppelstern zu bilden, schalte <b>GW</b> ein und lass es laufen — die Bahn zerfällt und der Wellenschnitt wird steiler. Wirf den Begleiter erneut, um den Inspiral zurückzusetzen.',
            fr: 'Placez une étoile <b>compagne</b> pour former une binaire, activez <b>GW</b> et laissez tourner — l’orbite se désintègre et la coupe d’onde s’accentue. Relancez la compagne pour réinitialiser la spirale.',
            es: 'Coloca una estrella <b>compañera</b> para formar una binaria, activa <b>GW</b> y déjalo correr — la órbita decae y el corte de onda se hace más abrupto. Vuelve a lanzar la compañera para reiniciar la espiral.',
            it: 'Posiziona una stella <b>compagna</b> per formare un binario, attiva <b>GW</b> e lascialo andare — l’orbita decade e la sezione d’onda si fa più ripida. Rilancia la compagna per ripristinare la spirale.'
          }}
        ]
      },

      // ---- 23. Geodesics & orbits ----
      {
        id: 'geodesics', no: 23,
        kicker: { en: 'paths through curvature', zh: '穿越曲率的路徑', ja: '曲率を貫く経路', ko: '곡률을 가로지르는 경로',
          de: 'Pfade durch die Krümmung', fr: 'des trajets à travers la courbure', es: 'trayectorias a través de la curvatura', it: 'percorsi attraverso la curvatura' },
        title: { en: 'Geodesics and orbits', zh: '測地線與軌道', ja: '測地線と軌道', ko: '측지선과 궤도',
          de: 'Geodäten und Umlaufbahnen', fr: 'Les géodésiques et les orbites', es: 'Geodésicas y órbitas', it: 'Geodetiche e orbite' },
        sub: { en: 'Free-fall paths: the straight lines of curved spacetime.', zh: '自由落體路徑：彎曲時空中的直線。',
          ja: '自由落下の経路：曲がった時空における直線。', ko: '자유낙하 경로: 휘어진 시공간의 직선.',
          de: 'Freier-Fall-Bahnen: die Geraden der gekrümmten Raumzeit.', fr: 'Les trajets en chute libre : les droites de l’espace-temps courbe.',
          es: 'Trayectorias en caída libre: las rectas del espacio-tiempo curvo.', it: 'Traiettorie in caduta libera: le rette dello spaziotempo curvo.' },
        blocks: [
          { p: {
            en: 'A freely falling body feels no force — it simply follows a <span class="term">geodesic</span>, the straightest available path through curved spacetime. Around a black hole these paths take three flavours: <b>bound</b> orbits that loop (and, in relativity, slowly precess), <b>scattering</b> paths that swing by and escape, and <b>plunging</b> paths that cross the horizon.',
            zh: '自由落體不感受到任何力——它只是沿著一條<span class="term">測地線</span>前進，也就是彎曲時空中最直的可行路徑。在黑洞周圍，這些路徑分為三類：環繞的<b>束縛</b>軌道（在相對論中會緩慢進動）、掠過後逃逸的<b>散射</b>路徑，以及越過視界的<b>墜入</b>路徑。',
            ja: '自由落下する物体は力を感じません——ただ<span class="term">測地線</span>、すなわち曲がった時空で取り得る最も真っ直ぐな経路をたどるだけです。ブラックホールの周りで、この経路は三種類に分かれます：周回する<b>束縛</b>軌道（相対論ではゆっくり歳差します）、かすめて逃げる<b>散乱</b>経路、そして地平面を越える<b>落下</b>経路です。',
            ko: '자유낙하하는 물체는 어떤 힘도 느끼지 않습니다——그저 <span class="term">측지선</span>, 즉 휘어진 시공간에서 가능한 가장 곧은 경로를 따를 뿐입니다. 블랙홀 주위에서 이 경로는 세 종류로 나뉩니다: 도는 <b>속박</b> 궤도(상대성 이론에서는 천천히 세차합니다), 스치고 달아나는 <b>산란</b> 경로, 그리고 지평선을 넘는 <b>추락</b> 경로입니다.',
            de: 'Ein frei fallender Körper spürt keine Kraft — er folgt einfach einer <span class="term">Geodäte</span>, dem geradestmöglichen Pfad durch die gekrümmte Raumzeit. Um ein Schwarzes Loch gibt es davon drei Arten: <b>gebundene</b> Bahnen, die kreisen (und in der Relativität langsam präzedieren), <b>Streu</b>bahnen, die vorbeischwingen und entkommen, und <b>stürzende</b> Bahnen, die den Horizont überqueren.',
            fr: 'Un corps en chute libre ne ressent aucune force — il suit simplement une <span class="term">géodésique</span>, le chemin le plus droit possible à travers l’espace-temps courbe. Autour d’un trou noir, ces chemins se déclinent en trois types : les orbites <b>liées</b> qui bouclent (et, en relativité, précessent lentement), les trajets de <b>diffusion</b> qui passent et s’échappent, et les trajets <b>plongeants</b> qui franchissent l’horizon.',
            es: 'Un cuerpo en caída libre no siente fuerza alguna — simplemente sigue una <span class="term">geodésica</span>, el camino más recto posible por el espacio-tiempo curvo. Alrededor de un agujero negro estos caminos son de tres tipos: órbitas <b>ligadas</b> que dan vueltas (y, en relatividad, precesan lentamente), trayectorias de <b>dispersión</b> que pasan y escapan, y trayectorias de <b>caída</b> que cruzan el horizonte.',
            it: 'Un corpo in caduta libera non sente alcuna forza — segue semplicemente una <span class="term">geodetica</span>, il percorso più dritto possibile attraverso lo spaziotempo curvo. Attorno a un buco nero questi percorsi sono di tre tipi: orbite <b>legate</b> che girano (e, in relatività, precedono lentamente), traiettorie di <b>diffusione</b> che passano e fuggono, e traiettorie di <b>caduta</b> che attraversano l’orizzonte.'
          }},
          { p: {
            en: 'Unlike Newton’s tidy closed ellipses, relativistic bound orbits do not quite close — the ellipse rotates a little each lap. This <span class="term">perihelion precession</span> was the first triumph of general relativity, explaining the anomalous drift of Mercury’s orbit.',
            zh: '不同於牛頓那整齊閉合的橢圓，相對論的束縛軌道並不完全閉合——橢圓每繞一圈就轉一點。這種<span class="term">近日點進動</span>是廣義相對論的首場勝利，解釋了水星軌道的反常漂移。',
            ja: 'ニュートンの整った閉じた楕円とは違い、相対論の束縛軌道は完全には閉じません——楕円は一周ごとに少しずつ回ります。この<span class="term">近日点歳差</span>は一般相対論の最初の勝利であり、水星軌道の異常な移動を説明しました。',
            ko: '뉴턴의 깔끔하게 닫힌 타원과 달리, 상대론적 속박 궤도는 완전히 닫히지 않습니다——타원이 한 바퀴마다 조금씩 회전합니다. 이 <span class="term">근일점 세차</span>는 일반 상대성 이론의 첫 승리로, 수성 궤도의 변칙적 이동을 설명했습니다.',
            de: 'Anders als Newtons saubere geschlossene Ellipsen schließen sich relativistische gebundene Bahnen nicht ganz — die Ellipse dreht sich pro Umlauf ein wenig. Diese <span class="term">Periheldrehung</span> war der erste Triumph der allgemeinen Relativitätstheorie und erklärte die anomale Verschiebung der Merkurbahn.',
            fr: 'Contrairement aux ellipses fermées et nettes de Newton, les orbites liées relativistes ne se referment pas tout à fait — l’ellipse tourne un peu à chaque tour. Cette <span class="term">précession du périhélie</span> fut le premier triomphe de la relativité générale, expliquant la dérive anormale de l’orbite de Mercure.',
            es: 'A diferencia de las pulcras elipses cerradas de Newton, las órbitas ligadas relativistas no se cierran del todo — la elipse gira un poco en cada vuelta. Esta <span class="term">precesión del perihelio</span> fue el primer triunfo de la relatividad general, al explicar la deriva anómala de la órbita de Mercurio.',
            it: 'A differenza delle ordinate ellissi chiuse di Newton, le orbite legate relativistiche non si chiudono del tutto — l’ellisse ruota un poco a ogni giro. Questa <span class="term">precessione del perielio</span> fu il primo trionfo della relatività generale, spiegando la deriva anomala dell’orbita di Mercurio.'
          }},
          { fig: `
  <svg viewBox="0 0 640 320" role="img" aria-label="Three kinds of geodesic: bound precessing, scattering, plunging">
    <g transform="translate(300,160)">
      <circle class="dia-bh" r="30"/>
      <circle class="dia-horizon" r="30"/>
      <circle r="2.2" fill="var(--warn)"/>
      <path class="dia-orbit" d="M120,0 C120,72 -120,72 -120,0 C-120,-72 120,-72 120,0 Z" transform="rotate(0)"/>
      <path class="dia-orbit" d="M120,0 C120,72 -120,72 -120,0 C-120,-72 120,-72 120,0 Z" transform="rotate(40)" opacity="0.5"/>
      <path class="dia-ray" d="M-260,120 Q-40,70 40,-20 Q80,-70 260,-120" marker-end="url(#ge)"/>
      <path class="dia-path" d="M-250,-150 Q-60,-70 -30,-10 Q-20,10 0,30" marker-end="url(#gp)" stroke-dasharray="5 4"/>
    </g>
    <defs>
      <marker id="ge" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--cyan)"/></marker>
      <marker id="gp" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--amber)"/></marker>
    </defs>
    <text class="dia-lbl" x="470" y="110" fill="var(--cyan-dim)">bound (precessing)</text>
    <text class="dia-lbl" x="470" y="150" fill="var(--cyan)">scattering</text>
    <text class="dia-lbl-accent" x="470" y="190">plunging</text>
  </svg>`, cap: {
            en: '<b>Three geodesics.</b> A precessing bound orbit (rosette), a scattering fly-by, and a plunge through the horizon — set apart only by energy and angular momentum.',
            zh: '<b>三種測地線。</b>進動的束縛軌道（玫瑰花形）、散射式掠過，以及墜穿視界——它們的區別只在於能量與角動量。',
            ja: '<b>三つの測地線。</b>歳差する束縛軌道（バラ模様）、散乱的な通過、そして地平面を貫く落下——区別はエネルギーと角運動量だけです。',
            ko: '<b>세 가지 측지선.</b> 세차하는 속박 궤도(장미 무늬), 산란성 통과, 그리고 지평선을 꿰뚫는 추락——구분은 에너지와 각운동량뿐입니다.',
            de: '<b>Drei Geodäten.</b> Eine präzedierende gebundene Bahn (Rosette), ein Streu-Vorbeiflug und ein Sturz durch den Horizont — unterschieden nur durch Energie und Drehimpuls.',
            fr: '<b>Trois géodésiques.</b> Une orbite liée en précession (rosette), un survol de diffusion et une plongée à travers l’horizon — distinguées seulement par l’énergie et le moment cinétique.',
            es: '<b>Tres geodésicas.</b> Una órbita ligada en precesión (roseta), un sobrevuelo de dispersión y una caída a través del horizonte — distinguidas solo por la energía y el momento angular.',
            it: '<b>Tre geodetiche.</b> Un’orbita legata in precessione (rosetta), un passaggio di diffusione e una caduta attraverso l’orizzonte — distinte solo da energia e momento angolare.'
          }},
          { call: 'lab', body: {
            en: 'Drag from a body to fling it with a chosen velocity, toggle <b>TRAILS</b> to see its geodesic, and toggle the GR preview line to compare against the full relativistic path. Aim for a near-photon-sphere pass to see strong precession.',
            zh: '從天體拖曳以指定速度發射，開啟 <b>TRAILS</b> 觀察其測地線，並開啟 GR 預覽線與完整相對論路徑比較。瞄準接近光子球的掠過，即可看到強烈進動。',
            ja: '天体からドラッグして任意の速度で放ち、<b>TRAILS</b> を切り替えてその測地線を見ます。GR プレビュー線を切り替えると、完全な相対論的経路と比較できます。光子球に近い通過を狙うと強い歳差が見えます。',
            ko: '천체에서 드래그하여 원하는 속도로 던지고, <b>TRAILS</b> 를 켜서 그 측지선을 보세요. GR 미리보기 선을 켜면 완전한 상대론적 경로와 비교할 수 있습니다. 광자구에 가까운 통과를 노리면 강한 세차를 볼 수 있습니다.',
            de: 'Ziehe von einem Körper, um ihn mit gewählter Geschwindigkeit zu schleudern, schalte <b>TRAILS</b> ein, um seine Geodäte zu sehen, und schalte die GR-Vorschaulinie ein, um sie mit dem vollen relativistischen Pfad zu vergleichen. Ziele auf einen Vorbeiflug nahe der Photonensphäre, um starke Präzession zu sehen.',
            fr: 'Faites glisser depuis un corps pour le lancer à la vitesse choisie, activez <b>TRAILS</b> pour voir sa géodésique, et activez la ligne d’aperçu RG pour la comparer au trajet relativiste complet. Visez un passage proche de la sphère de photons pour voir une forte précession.',
            es: 'Arrastra desde un cuerpo para lanzarlo a la velocidad elegida, activa <b>TRAILS</b> para ver su geodésica y activa la línea de vista previa de RG para compararla con la trayectoria relativista completa. Apunta a un paso cercano a la esfera de fotones para ver una fuerte precesión.',
            it: 'Trascina da un corpo per lanciarlo alla velocità scelta, attiva <b>TRAILS</b> per vederne la geodetica e attiva la linea di anteprima RG per confrontarla con il percorso relativistico completo. Mira a un passaggio vicino alla sfera dei fotoni per vedere una forte precessione.'
          }}
        ]
      },

      // ---- 24. Charge & the Reissner-Nordstrom limit ----
      {
        id: 'charged', no: 24,
        kicker: { en: 'the third parameter', zh: '第三個參數', ja: '第三のパラメータ', ko: '세 번째 매개변수',
          de: 'der dritte Parameter', fr: 'le troisième paramètre', es: 'el tercer parámetro', it: 'il terzo parametro' },
        title: { en: 'Charge and the Reissner-Nordstrom limit', zh: '電荷與 Reissner-Nordström 極限',
          ja: '電荷と Reissner-Nordström 極限', ko: '전하와 Reissner-Nordström 극한',
          de: 'Ladung und der Reissner-Nordström-Grenzfall', fr: 'La charge et la limite de Reissner-Nordström',
          es: 'La carga y el límite de Reissner-Nordström', it: 'La carica e il limite di Reissner-Nordström' },
        sub: { en: 'How electric charge reshapes the geometry — and why nature avoids it.', zh: '電荷如何重塑幾何——以及為何自然界避開它。',
          ja: '電荷が幾何をどう作り変えるか——そして自然がそれを避ける理由。', ko: '전하가 기하를 어떻게 다시 빚는가——그리고 자연이 그것을 피하는 이유.',
          de: 'Wie elektrische Ladung die Geometrie umformt — und warum die Natur sie meidet.', fr: 'Comment la charge électrique remodèle la géométrie — et pourquoi la nature l’évite.',
          es: 'Cómo la carga eléctrica remodela la geometría — y por qué la naturaleza la evita.', it: 'Come la carica elettrica rimodella la geometria — e perché la natura la evita.' },
        blocks: [
          { p: {
            en: 'Charge <var>Q</var> is the third hair. A non-rotating charged hole is described by the <span class="term">Reissner-Nordstrom</span> metric; add spin and you have the full Kerr-Newman family the lab simulates. Charge mimics spin in one key way: it adds an outward "pressure" that, like <var>a</var>, shrinks the horizon and creates an inner horizon <var>r&#x208B;</var>.',
            zh: '電荷 <var>Q</var> 是第三根「毛」。不旋轉的帶電黑洞由 <span class="term">Reissner-Nordström</span> 度規描述；再加上自轉，就是實驗室所模擬的完整 Kerr-Newman 族。電荷在一個關鍵點上模仿自轉：它增添一股向外的「壓力」，如同 <var>a</var> 般使視界縮小，並造出內視界 <var>r&#x208B;</var>。',
            ja: '電荷 <var>Q</var> は三本目の「毛」です。回転しない帯電ブラックホールは <span class="term">Reissner-Nordström</span> 計量で記述されます；自転を加えれば、研究室が再現する完全な Kerr-Newman 族になります。電荷はある重要な点で自転を模倣します：外向きの「圧力」を加え、<var>a</var> と同様に地平面を縮め、内側の地平面 <var>r&#x208B;</var> を作ります。',
            ko: '전하 <var>Q</var> 는 세 번째 「털」입니다. 회전하지 않는 대전 블랙홀은 <span class="term">Reissner-Nordström</span> 계량으로 기술됩니다; 스핀을 더하면 실험실이 시뮬레이션하는 완전한 Kerr-Newman 족이 됩니다. 전하는 한 가지 핵심에서 스핀을 흉내 냅니다: 바깥 방향의 「압력」을 더해 <var>a</var> 처럼 지평선을 줄이고 안쪽 지평선 <var>r&#x208B;</var> 를 만듭니다.',
            de: 'Die Ladung <var>Q</var> ist das dritte Haar. Ein nicht rotierendes geladenes Loch wird durch die <span class="term">Reissner-Nordström</span>-Metrik beschrieben; fügt man Spin hinzu, erhält man die volle Kerr-Newman-Familie, die das Labor simuliert. Ladung ahmt den Spin in einem wesentlichen Punkt nach: Sie fügt einen nach außen gerichteten „Druck“ hinzu, der wie <var>a</var> den Horizont verkleinert und einen inneren Horizont <var>r&#x208B;</var> erzeugt.',
            fr: 'La charge <var>Q</var> est le troisième cheveu. Un trou chargé non rotatif est décrit par la métrique de <span class="term">Reissner-Nordström</span> ; ajoutez du spin et vous obtenez la pleine famille de Kerr-Newman que simule le laboratoire. La charge imite le spin sur un point clé : elle ajoute une « pression » vers l’extérieur qui, comme <var>a</var>, rétrécit l’horizon et crée un horizon interne <var>r&#x208B;</var>.',
            es: 'La carga <var>Q</var> es el tercer pelo. Un agujero cargado sin rotación se describe con la métrica de <span class="term">Reissner-Nordström</span>; añade espín y tienes la familia completa de Kerr-Newman que simula el laboratorio. La carga imita al espín en un aspecto clave: añade una «presión» hacia fuera que, como <var>a</var>, encoge el horizonte y crea un horizonte interno <var>r&#x208B;</var>.',
            it: 'La carica <var>Q</var> è il terzo pelo. Un buco carico non rotante è descritto dalla metrica di <span class="term">Reissner-Nordström</span>; aggiungi lo spin e ottieni la famiglia completa di Kerr-Newman che il laboratorio simula. La carica imita lo spin in un punto chiave: aggiunge una «pressione» verso l’esterno che, come <var>a</var>, restringe l’orizzonte e crea un orizzonte interno <var>r&#x208B;</var>.'
          }},
          { eq: 'r± = M ± √( M² − Q² )      (Reissner-Nordstrom, a = 0)',
            where: {
              en: 'Set a = 0 in the Kerr-Newman formula and only charge holds back the horizon. Extremal when |Q| = M.',
              zh: '在 Kerr-Newman 公式中令 a = 0，便只剩電荷在抵抗視界。當 |Q| = M 時為極端。',
              ja: 'Kerr-Newman の式で a = 0 とすると、地平面を抑えるのは電荷だけになります。|Q| = M のとき極限です。',
              ko: 'Kerr-Newman 공식에서 a = 0 으로 두면 지평선을 막는 것은 전하뿐입니다. |Q| = M 일 때 극단입니다.',
              de: 'Setzt man a = 0 in der Kerr-Newman-Formel, hält allein die Ladung den Horizont zurück. Extremal bei |Q| = M.',
              fr: 'Posez a = 0 dans la formule de Kerr-Newman et seule la charge retient l’horizon. Extrémal quand |Q| = M.',
              es: 'Pon a = 0 en la fórmula de Kerr-Newman y solo la carga frena el horizonte. Extremal cuando |Q| = M.',
              it: 'Poni a = 0 nella formula di Kerr-Newman e solo la carica trattiene l’orizzonte. Estremale quando |Q| = M.'
            }},
          { p: {
            en: 'Astrophysical black holes are thought to carry negligible charge: a charged hole quickly attracts opposite charges from its surroundings and neutralises. So <var>Q</var> is best treated as a <i>theorist’s dial</i> — invaluable for exploring the geometry, even if real holes sit near <var>Q = 0</var>.',
            zh: '一般認為天文上的黑洞所帶電荷可忽略：帶電黑洞會迅速從周遭吸引異性電荷而中和。因此 <var>Q</var> 最好視為<i>理論家的旋鈕</i>——對探索幾何極有價值，即使真實黑洞大多落在 <var>Q = 0</var> 附近。',
            ja: '天体物理のブラックホールが帯びる電荷は無視できると考えられています：帯電したブラックホールは周囲から逆符号の電荷を素早く引き寄せて中和します。したがって <var>Q</var> は<i>理論家のダイヤル</i>として扱うのが最適です——たとえ現実のブラックホールが <var>Q = 0</var> 付近にあっても、幾何を探るうえで非常に有用です。',
            ko: '천체물리학적 블랙홀이 띠는 전하는 무시할 만하다고 여겨집니다: 대전된 블랙홀은 주변에서 반대 전하를 빠르게 끌어당겨 중화합니다. 따라서 <var>Q</var> 는 <i>이론가의 다이얼</i>로 다루는 것이 가장 좋습니다——실제 블랙홀이 <var>Q = 0</var> 부근에 있더라도 기하를 탐구하는 데 매우 유용합니다.',
            de: 'Astrophysikalische Schwarze Löcher tragen vermutlich vernachlässigbare Ladung: Ein geladenes Loch zieht rasch entgegengesetzte Ladungen aus seiner Umgebung an und neutralisiert sich. <var>Q</var> behandelt man daher am besten als <i>Theoretiker-Regler</i> — unschätzbar zum Erkunden der Geometrie, auch wenn reale Löcher nahe <var>Q = 0</var> liegen.',
            fr: 'On pense que les trous noirs astrophysiques portent une charge négligeable : un trou chargé attire vite des charges opposées de son entourage et se neutralise. Mieux vaut donc traiter <var>Q</var> comme un <i>bouton de théoricien</i> — précieux pour explorer la géométrie, même si les trous réels se situent près de <var>Q = 0</var>.',
            es: 'Se cree que los agujeros negros astrofísicos portan carga despreciable: un agujero cargado atrae pronto cargas opuestas de su entorno y se neutraliza. Por eso conviene tratar <var>Q</var> como un <i>dial del teórico</i> — valiosísimo para explorar la geometría, aunque los agujeros reales estén cerca de <var>Q = 0</var>.',
            it: 'Si ritiene che i buchi neri astrofisici portino una carica trascurabile: un buco carico attira rapidamente cariche opposte dall’ambiente e si neutralizza. Conviene quindi trattare <var>Q</var> come una <i>manopola del teorico</i> — preziosa per esplorare la geometria, anche se i buchi reali stanno vicino a <var>Q = 0</var>.'
          }},
          { call: 'key', body: {
            en: 'Spin and charge enter the horizon formula together, as a&sup2; + Q&sup2;. The lab lets you trade one for the other and watch the same surfaces respond — a hands-on view of the no-hair theorem.',
            zh: '自轉與電荷以 a² + Q² 的組合一同進入視界公式。實驗室讓你以一者換另一者，看著相同的界面隨之反應——這是無毛定理的親手體驗。',
            ja: '自転と電荷は a&sup2; + Q&sup2; として一緒に地平面の式に入ります。研究室では一方を他方と取り換え、同じ面がどう反応するかを見られます——無毛定理の実地体験です。',
            ko: '스핀과 전하는 a&sup2; + Q&sup2; 로 함께 지평선 공식에 들어갑니다. 실험실에서는 하나를 다른 하나로 바꿔 가며 같은 면이 어떻게 반응하는지 볼 수 있습니다——무모 정리를 직접 체험하는 것입니다.',
            de: 'Spin und Ladung gehen gemeinsam als a&sup2; + Q&sup2; in die Horizontformel ein. Das Labor lässt dich das eine gegen das andere tauschen und beobachten, wie dieselben Flächen reagieren — eine praktische Sicht auf das Keine-Haare-Theorem.',
            fr: 'Le spin et la charge entrent ensemble dans la formule de l’horizon, comme a&sup2; + Q&sup2;. Le laboratoire vous permet d’échanger l’un contre l’autre et de voir réagir les mêmes surfaces — une vision concrète du théorème de calvitie.',
            es: 'El espín y la carga entran juntos en la fórmula del horizonte, como a&sup2; + Q&sup2;. El laboratorio te deja cambiar uno por otro y ver responder las mismas superficies — una visión práctica del teorema de no pelo.',
            it: 'Lo spin e la carica entrano insieme nella formula dell’orizzonte, come a&sup2; + Q&sup2;. Il laboratorio ti permette di scambiare l’uno con l’altro e di vedere reagire le stesse superfici — una visione pratica del teorema dell’assenza di peli.'
          }},
          { call: 'lab', body: {
            en: 'Set <b>a = 0</b> and sweep <b>Q</b>: you have a pure Reissner-Nordstrom hole, and the horizons behave exactly as the formula above predicts. Push |Q| toward M to approach the extremal edge.',
            zh: '設 <b>a = 0</b> 並調動 <b>Q</b>：你得到一個純 Reissner-Nordström 黑洞，視界的行為恰如上方公式所預測。把 |Q| 推向 M，即逼近極端邊界。',
            ja: '<b>a = 0</b> にして <b>Q</b> を動かします：純粋な Reissner-Nordström ブラックホールになり、地平面は上の式の予測どおりに振る舞います。|Q| を M へ近づけると極限の縁に迫ります。',
            ko: '<b>a = 0</b> 으로 두고 <b>Q</b> 를 조절하세요: 순수한 Reissner-Nordström 블랙홀이 되고, 지평선은 위 공식의 예측과 정확히 일치하게 행동합니다. |Q| 를 M 으로 밀면 극단 가장자리에 다가갑니다.',
            de: 'Setze <b>a = 0</b> und variiere <b>Q</b>: Du hast ein reines Reissner-Nordström-Loch, und die Horizonte verhalten sich genau wie die obige Formel vorhersagt. Treibe |Q| gegen M, um dich dem extremalen Rand zu nähern.',
            fr: 'Mettez <b>a = 0</b> et faites varier <b>Q</b> : vous avez un trou de Reissner-Nordström pur, et les horizons se comportent exactement comme le prédit la formule ci-dessus. Poussez |Q| vers M pour approcher la limite extrémale.',
            es: 'Pon <b>a = 0</b> y barre <b>Q</b>: tienes un agujero de Reissner-Nordström puro, y los horizontes se comportan exactamente como predice la fórmula de arriba. Empuja |Q| hacia M para acercarte al borde extremal.',
            it: 'Imposta <b>a = 0</b> e varia <b>Q</b>: hai un buco di Reissner-Nordström puro, e gli orizzonti si comportano esattamente come prevede la formula sopra. Spingi |Q| verso M per avvicinarti al limite estremale.'
          }}
        ]
      },

      // ---- 25. Neutron Stars and Pulsars ----
      {
        id: "neutron-stars-pulsars", no: 25,
        kicker: { en: "radio lighthouses", zh: "無線電燈塔" },
        title: { en: "Neutron Stars and Pulsars", zh: "中子星與脈衝星" },
        sub: { en: "Baade and Zwicky's 1934 prediction sat unconfirmed for thirty-three years — until a Cambridge graduate student caught a star ticking like a clock.", zh: "Baade 與 Zwicky 在 1934 年的預言，整整三十三年無人證實——直到一位劍橋研究生捕捉到一顆如時鐘般規律跳動的星。" },
        blocks: [
          { p: {
            en: "The last several chapters followed a single thread of mathematics: Schwarzschild's 1916 solution, the decades of work that generalized it, and the Kerr and Kerr-Newman geometries that emerged by 1965. That thread describes exact spacetimes with astonishing precision — but it says nothing about whether such objects actually exist. While theorists were solving Einstein's field equations, an entirely separate community of astronomers was hunting for something more modest: the actual collapsed stellar corpses that Walter Baade and Fritz Zwicky had predicted back in 1934, when they coined the term <span class=\"term\">supernova</span> and proposed that some of these explosions leave behind a star made almost entirely of neutrons. This chapter and the next one pick that observational thread back up.",
            zh: "前面幾章追的是一條數學脈絡：從 1916 年 Schwarzschild 的解出發，經過數十年的推廣工作，一路到 1965 年集大成的 Kerr 與 Kerr-Newman 時空幾何。這條脈絡以驚人的精確度描述了精確的時空解——卻完全沒有回答這些天體是否真的存在。就在理論學家忙著求解愛因斯坦場方程式的同時，另一群天文學家正獨立進行一項更務實的搜尋：尋找 Walter Baade 與 Fritz Zwicky 早在 1934 年就已預言存在的恆星塌縮殘骸——他們當時提出了「<span class=\"term\">超新星</span>」（supernova）一詞，並主張某些爆炸會留下幾乎完全由中子構成的星體。本章與下一章，接續的正是這條觀測脈絡。"
          }},
          { p: {
            en: "A <span class=\"term\">neutron star</span> is what remains when a massive star's core collapses past the point where <span class=\"term\">electron degeneracy pressure</span> can hold it up, but stops just short of forming a black hole. Roughly 1.4 to a little over 2 solar masses gets crushed into a sphere only about 10 to 20 kilometers across — city-sized, not planet-sized. What holds it up against its own gravity is neutron degeneracy pressure: the same quantum-mechanical refusal of identical fermions to occupy the same state that gives <span class=\"term\">white dwarfs</span> their <span class=\"term\">Chandrasekhar limit</span>, just pushed to a far higher density. A neutron star is the densest object astronomers can observe with an actual surface. A black hole, by contrast, has no surface at all — only an event horizon, a boundary written into the geometry itself.",
            zh: "<span class=\"term\">中子星</span>是大質量恆星核心塌縮到<span class=\"term\">電子簡併壓力</span>已無法支撐、卻又未能形成黑洞時所留下的殘骸。大約 1.4 到略高於 2 倍太陽質量的物質，被壓縮進一顆直徑僅 10 到 20 公里的球體——城市大小，而非行星大小。支撐它對抗自身重力的，是中子簡併壓力：與<span class=\"term\">白矮星</span>之所以存在<span class=\"term\">錢德拉塞卡極限</span>背後同一種量子力學機制——全同費米子拒絕佔據同一量子態——只是這裡的密度被推向遠高得多的量級。中子星是天文學家能觀測到、確實擁有表面的最緻密天體。相較之下，黑洞完全沒有表面——只有事件視界，一個寫進幾何本身的邊界。"
          }},
          { p: {
            en: "Confirmation came on the night of 28 November 1967, at the Mullard Radio Astronomy Observatory outside Cambridge. Jocelyn Bell Burnell, a PhD student working under Antony Hewish, was combing through miles of chart-recorder paper from a new radio telescope built to study quasars when she noticed a faint, oddly regular scrap of signal she had seen before and dismissed as interference. Recorded at higher time resolution, it resolved into a train of pulses arriving every 1.337 seconds — a regularity that outdid any known astrophysical process. The Cambridge team half-jokingly labeled the source LGM-1, for 'Little Green Men,' before ruling out an artificial origin and identifying it as something stranger and more natural: a rapidly rotating, highly magnetized neutron star. The discovery paper appeared in Nature on 24 February 1968.",
            zh: "確認發生在 1967 年 11 月 28 日夜裡，地點是劍橋郊外的 Mullard Radio Astronomy Observatory。當時的博士生 Jocelyn Bell Burnell，在指導教授 Antony Hewish 底下工作，正逐吋檢視一台原本為研究類星體而建的新電波望遠鏡所記錄下、長達數哩的圖表紙，這時她注意到一段先前被自己當成雜訊而忽略的微弱、卻異常規律的訊號。以更高的時間解析度重新記錄後，訊號解析成一連串每隔 1.337 秒到達一次的脈衝——其規律程度超越任何已知的天文物理過程。劍橋團隊半開玩笑地將這個訊號源稱為 LGM-1（取「小綠人」Little Green Men 之意），直到排除了人造訊號的可能性，並辨認出一種更奇特、卻也更自然的天體：一顆快速自轉、磁場極強的中子星。這篇發現論文於 1968 年 2 月 24 日刊登於《Nature》期刊。"
          }},
          { p: {
            en: "The lighthouse mechanism only works because the star is so compact. A rotating, highly magnetized neutron star channels charged particles along its magnetic poles, producing a narrow beam of radio emission. If that magnetic axis is tilted away from the rotation axis, the beam sweeps around once per rotation — and if Earth happens to lie in its path, radio telescopes catch a pulse once per turn. Hence <span class=\"term\">pulsar</span>, short for 'pulsating radio source.' Only an object as small and dense as a neutron star could spin fast enough, and hold together against the centrifugal stress of doing so, to produce clockwork this precise; an ordinary star spinning once every 1.337 seconds would simply tear itself apart.",
            zh: "這種燈塔機制之所以成立，正是因為星體極度緻密。一顆高速自轉、磁場強大的中子星，會將帶電粒子導引沿磁極方向噴發，形成一道狹窄的電波束。若磁軸與自轉軸並不重合，這道波束就會隨每次自轉掃過周圍空間——若地球恰好落在掃描路徑上，電波望遠鏡便會在每個自轉週期捕捉到一次脈衝。這正是「<span class=\"term\">脈衝星</span>」（pulsar，「pulsating radio source」的縮寫）一詞的由來。唯有像中子星這樣微小而緻密的天體，才能自轉得如此快速、卻仍能抵抗隨之而來的離心應力而不解體，產生如此精準的規律訊號；換作一顆普通恆星，若每 1.337 秒自轉一圈，早已四分五裂。"
          }},
          { list: [
            { en: "1934 — Baade and Zwicky predict that supernovae can leave behind neutron stars, with no observational evidence yet in hand.", zh: "1934 年——Baade 與 Zwicky 預言超新星爆炸可能留下中子星，當時尚無任何觀測證據。" },
            { en: "28 November 1967 — Bell Burnell recognizes a strange, ultra-regular 1.337-second radio pulse in the chart data, nicknamed LGM-1.", zh: "1967 年 11 月 28 日——Bell Burnell 在圖表資料中辨認出一段奇特、極度規律、週期 1.337 秒的電波脈衝，暱稱 LGM-1。" },
            { en: "24 February 1968 — the discovery is published in Nature, identifying the source as a rapidly rotating neutron star.", zh: "1968 年 2 月 24 日——發現論文刊登於《Nature》，確認訊號源為一顆快速自轉的中子星。" },
            { en: "1974 — Antony Hewish receives the Nobel Prize in Physics for the discovery; Bell Burnell, who found the signal, is controversially not included.", zh: "1974 年——Antony Hewish 因此發現獲頒諾貝爾物理獎；實際發現訊號的 Bell Burnell 卻未獲列名，此事引發爭議。" },
            { en: "2018 — Bell Burnell is awarded the Special Breakthrough Prize in Fundamental Physics and donates the prize money to fund scholarships for under-represented students in physics.", zh: "2018 年——Bell Burnell 獲頒 Special Breakthrough Prize in Fundamental Physics，並將全部獎金捐出，用於資助物理領域中弱勢族群學生的獎學金。" }
          ]},
          { eq: "v_esc = √(2GM / R)",
            where: {
              en: "v_esc is the speed needed to escape the star's gravity starting from its surface, G is the gravitational constant, M is the star's mass, and R is its radius. For a typical neutron star (M ~ 1.4 solar masses, R ~ 12 km) this works out to nearly 60 percent of the speed of light — well over half.",
              zh: "v_esc 是從星體表面脫離其重力所需的速度，G 為重力常數，M 為星體質量，R 為其半徑。對一顆典型中子星而言（M ~ 1.4 倍太陽質量，R ~ 12 公里），此逃逸速度接近光速的六成，遠超過光速的一半。"
            }},
          { p: {
            en: "More than three thousand pulsars are now known, and their rotation periods make them extraordinarily precise natural clocks — the fastest, millisecond pulsars, rival atomic clocks in stability. That precision later turned pulsars into instruments in their own right: timing the orbit of a pulsar locked in a binary system with another compact star lets astronomers measure gravity with a precision no laboratory on Earth can match, a technique that becomes central once this history reaches the search for <span class=\"term\">gravitational waves</span>. But neutron stars also mark a boundary. They are the most massive objects held up by any known form of quantum pressure; push much past roughly 2 to 3 solar masses, and neutron degeneracy pressure fails too, leaving nothing left to resist total collapse.",
            zh: "目前已知的脈衝星超過三千顆，其自轉週期使它們成為極其精準的天然時鐘——其中速度最快的毫秒脈衝星，穩定度甚至可媲美原子鐘。這種精準度後來也讓脈衝星本身成為觀測工具：測量與另一顆緻密星互相繞行的聯星脈衝星軌道變化，能讓天文學家以地球上任何實驗室都無法企及的精確度檢驗重力，而這項技術，正是本課程日後談到<span class=\"term\">重力波</span>搜尋時的核心方法。但中子星同時也標誌著一道邊界：它們是已知能靠任何量子壓力支撐的最大質量天體；一旦質量遠超過大約 2 到 3 倍太陽質量，連中子簡併壓力都無法抵擋，便再無任何機制能阻止徹底塌縮。"
          }},
          { call: 'key', title: { en: "A stepping stone, not an endpoint", zh: "墊腳石，而非終點" }, body: {
            en: "Bell Burnell's 1.337-second pulse confirmed what Baade and Zwicky had guessed in 1934: collapsed stellar cores really do exist, and neutron degeneracy pressure really can hold one up. But it also exposed the limit of that support. Above roughly 2 to 3 solar masses, no known form of pressure survives gravity's crush — which is exactly where the observational hunt turns next, from stars that still have a surface to objects that have none at all.",
            zh: "Bell Burnell 記錄下的 1.337 秒脈衝，證實了 Baade 與 Zwicky 在 1934 年的猜想：塌縮的恆星核心確實存在，中子簡併壓力也確實撐得住它。但這項發現同時也揭露了這種支撐力的極限——質量一旦遠超過大約 2 到 3 倍太陽質量，已知的任何壓力都無法抵擋重力的擠壓。而這正是下一階段觀測搜尋的起點：從仍擁有表面的星體，轉向完全沒有表面的天體。"
          }}
        ]
      },

      // ---- 26. From Theory to Observation: The First Black Holes ----
      {
        id: "black-hole-discovery", no: 26,
        kicker: { en: "first black holes", zh: "第一批黑洞" },
        title: { en: "From Theory to Observation: The First Black Holes", zh: "從理論到觀測：第一批黑洞" },
        sub: { en: "For half a century the black hole was pure mathematics — until a quasar's spectrum, a flickering X-ray star, and a radio source at the galaxy's own center made it real.", zh: "黑洞曾有半個世紀只存在於數學之中——直到一個類星體的光譜、一顆閃爍的X光星，以及銀河系核心的一個電波源，讓它成為真實。" },
        blocks: [
          { p: {
            en: "By the early 1960s, the black hole existed only on paper. Karl Schwarzschild's exact solution, and the later work of Oppenheimer, Snyder, and others, said that a sufficiently compact mass must warp spacetime into a one-way surface — but no telescope had ever seen anything that resembled one. Most physicists treated it as a mathematical curiosity, a limiting case unlikely to occur in the messy, rotating, magnetized universe of real stars. That changed within a single decade, as radio and X-ray astronomy — instruments that could see wavelengths the eye never could — turned up objects that ordinary stars could not explain.",
            zh: "到了1960年代初，黑洞還只存在於紙上。Karl Schwarzschild 的精確解，以及 Oppenheimer、Snyder 等人後續的研究都指出：只要質量夠緊緻，就必然把時空扭曲成一個只能進、不能出的表面——但沒有任何望遠鏡真正看過這樣的東西。多數物理學家把它當成數學上的極限情況，認為在真實宇宙中充滿自轉、磁場與各種紊亂的恆星，這種極端狀態不太可能出現。這個看法在短短十年內被推翻，因為電波與X光天文學——能看見肉眼永遠看不到的波段——陸續發現了一般恆星無法解釋的天體。"
          }},
          { p: {
            en: "In 1963, Caltech astronomer Maarten Schmidt sat down with the spectrum of a starlike radio source called 3C 273 and could not make sense of it — the pattern of bright and dark lines matched nothing in any textbook. Then he recognized the ordinary lines of hydrogen, shifted far to the red: this was <span class=\"term\">spectroscopy</span> revealing that 3C 273 was rushing away at nearly 15% of the speed of light, which meant, by the expanding universe's own logic, that it sat billions of light-years away. To look that bright from that far, the object had to outshine an entire galaxy from a region barely larger than the solar system. Schmidt had found the first recognized <span class=\"term\">quasar</span> — though it would take years to understand that the light was pouring out of gas spiraling into a supermassive black hole.",
            zh: "1963年，加州理工學院的天文學家 Maarten Schmidt 拿到一個外觀像恆星的電波源3C 273的光譜，怎麼看都對不起來——那些明暗譜線的排列，在任何教科書裡都找不到對應。後來他認出那其實是氫原子最普通的譜線，只是被大幅紅移了：這正是<span class=\"term\">光譜學</span>告訴我們的事——3C 273正以將近光速15%的速度遠離，而根據膨脹宇宙的邏輯，這代表它遠在數十億光年之外。要在這麼遙遠的距離下依然如此明亮，這個天體發出的光必須超過整個星系，卻只從一個不比太陽系大多少的區域發出。Schmidt找到了第一個被確認的<span class=\"term\">類星體</span>——雖然要再過好幾年，人們才理解這些光其實來自螺旋墜入超大質量黑洞的氣體。"
          }},
          { p: {
            en: "The object causing all this trouble still did not have a name people liked. Physicists had been calling it a 'gravitationally completely collapsed star,' a 'frozen star,' or simply a 'collapsed object' — none of it caught on. At a 1967 lecture, the theorist John Wheeler used a shorter phrase that had been circulating informally: <b>black hole</b>. It was punchy, slightly unsettling, and impossible to forget. Wheeler kept using it in his writing afterward, and within a couple of years it had displaced every more cautious alternative in both the scientific literature and the public imagination.",
            zh: "造成這一切困擾的天體，當時還沒有一個大家喜歡的名字。物理學家曾稱它為「重力完全塌縮星」、「凍結星」，或單純叫「塌縮天體」——沒有一個叫得響。1967年的一場演講中，理論物理學家 John Wheeler 使用了當時已在小圈子裡流傳的一個簡短說法：<b>黑洞</b>（black hole）。這個詞簡潔、帶點不安感，而且讓人過目不忘。此後 Wheeler 持續在著作中使用這個詞，短短幾年內，它就取代了所有更保守的說法，同時攻佔了科學文獻與大眾想像。"
          }},
          { eq: "z = Δλ / λ₀",
            where: {
              en: "z is the redshift; Δλ is how far a spectral line has shifted toward longer (redder) wavelengths; λ₀ is that same line's wavelength measured at rest in a laboratory. It was exactly this number, applied to hydrogen lines in 3C 273, that told Schmidt how far away — and how strange — his object really was.",
              zh: "z 是紅移量；Δλ 是譜線往較長（偏紅）波長偏移的幅度；λ₀ 則是同一條譜線在實驗室靜止狀態下量到的波長。Schmidt正是把這個數字套用在3C 273的氫譜線上，才推算出這個天體有多遠、又有多不尋常。"
            }},
          { p: {
            en: "Quasars proved that black holes could exist at galactic scale, but the first candidate at the scale of a single collapsed star came from X-ray astronomy. In 1971 the Uhuru satellite, the first orbiting observatory built purely to survey the X-ray sky, pinned down the position of a flickering source called Cygnus X-1 precisely enough to match it to a visible blue supergiant, HDE 226868. Watching that star wobble under the pull of an unseen partner, Louise Webster, Paul Murdin, and Tom Bolton calculated a companion far too massive to be a neutron star — it had to be collapsed matter with no surface at all. The case was strong enough, and strange enough, that Stephen Hawking bet Kip Thorne in 1975 that Cygnus X-1 was <i>not</i> a black hole, a wager he only conceded in 1990 as the evidence kept piling up.",
            zh: "類星體證明了黑洞可以存在於星系尺度，但第一個屬於單一恆星塌縮規模的候選者，來自X光天文學。1971年，人類第一顆專門用來巡天X光的軌道天文台Uhuru衛星，精確定出了一個閃爍源Cygnus X-1的位置，並將它與一顆可見的藍色超巨星HDE 226868配對。Louise Webster、Paul Murdin 與 Tom Bolton觀察這顆恆星如何被看不見的伴星拉扯而擺動，計算出這個伴星質量遠遠超過中子星所能承受的上限——它必然是完全塌縮、連表面都不存在的物質。證據強到、也詭異到讓 Stephen Hawking在1975年與 Kip Thorne 打賭Cygnus X-1「不是」黑洞，直到1990年隨著證據持續累積，他才認輸。"
          }},
          { p: {
            en: "The most important black hole of all turned out to be much closer to home. On the nights of 13-15 February 1974, Bruce Balick and Robert Brown used a Green Bank interferometer to survey the crowded radio sky at the center of the Milky Way and found something unusually compact and intense sitting exactly at the galactic core. Brown gave it a name in 1982: Sagittarius A*. Decades of painstaking work tracking individual stars looping around that invisible point — led by Reinhard Genzel and Andrea Ghez, who shared the 2020 Nobel Prize in Physics for it — eventually pinned its mass at about 4.3 million times that of the Sun, packed into a region not much larger than our own solar system.",
            zh: "所有黑洞中最重要的一個，其實就在我們自己的星系裡。1974年2月13日至15日夜間，Bruce Balick 與 Robert Brown 使用 Green Bank 干涉儀巡查銀河系中心擁擠的電波天空，發現一個異常緻密而強烈的訊號，恰好座落在銀河系核心正中央。1982年，Brown 為它取名：Sagittarius A*。此後數十年，天文學家鍥而不捨追蹤環繞這個看不見的點運行的個別恆星軌道——由 Reinhard Genzel 與 Andrea Ghez 領軍，兩人也因此共享2020年諾貝爾物理獎——最終確認其質量約為太陽的430萬倍，卻擠在一個不比我們太陽系大多少的空間之中。"
          }},
          { list: [
            { en: "1963 — Maarten Schmidt decodes the shifted hydrogen lines of 3C 273: not a strange nearby star, but a galaxy-outshining furnace billions of light-years away.", zh: "1963年——Maarten Schmidt 解讀出3C 273被紅移的氫譜線：那不是一顆奇怪的近距恆星，而是數十億光年外、亮度超越整個星系的天體。" },
            { en: "1967 — John Wheeler, in a public lecture, calls the collapsed object a 'black hole' — the name that finally sticks.", zh: "1967年——John Wheeler 在一場公開演講中，把這種塌縮天體稱為「黑洞」——這個名字終於流傳了下來。" },
            { en: "1971-1972 — the Uhuru satellite locates Cygnus X-1; Webster, Murdin, and Bolton weigh its hidden companion and find it too massive to be anything but a black hole.", zh: "1971至1972年——Uhuru衛星定位出 Cygnus X-1；Webster、Murdin 與 Bolton 秤出其隱形伴星的質量，發現重到除了黑洞別無可能。" },
            { en: "1974 — Balick and Brown find a compact radio source at the galactic center; Brown names it Sagittarius A* in 1982.", zh: "1974年——Balick 與 Brown 在銀河系中心發現一個緻密電波源；1982年 Brown 將其命名為 Sagittarius A*。" },
            { en: "1990 — Stephen Hawking concedes his 1975 bet with Kip Thorne: Cygnus X-1 really is a black hole.", zh: "1990年——Stephen Hawking 認輸他1975年與 Kip Thorne 的賭注：Cygnus X-1真的是一個黑洞。" }
          ]},
          { call: 'key', title: { en: "From doubt to detection", zh: "從懷疑到偵測" }, body: {
            en: "Every one of these discoveries used the same trick: watch how matter or light behaves near something you cannot see, and let the motion give the invisible object away — a spectral line rushing to the red, a star wobbling on an unseen leash, a stellar orbit tracing an empty focus. That is still the method behind every black hole confirmed since, from gravitational-wave chirps to horizon-scale images made decades later. The chapters ahead turn that same trick inward, into the exact geometry — mass, spin, and charge — of the object these observations proved was real.",
            zh: "以上每一項發現，用的其實是同一招：觀察看不見的東西周圍，物質或光如何運動，讓「動」洩漏出「不可見者」的存在——一條被推向紅端的譜線、一顆被無形之物拉扯而擺動的恆星、一段繞著空焦點運行的軌道。這正是此後所有黑洞確認方法的原型，從重力波的啁啾訊號，到數十年後拍出的視界尺度影像，都是同一套邏輯的延伸。接下來的篇章，將把同樣的追問轉向內部——探究這些觀測證明真實存在的天體，其質量、自旋與電荷所構成的精確幾何。"
          }}
        ]
      },

      // ---- 27. The Big Bang and the Cosmic Microwave Background ----
      {
        id: "big-bang-cmb", no: 27,
        kicker: { en: "the primeval atom", zh: "原始原子" },
        title: { en: "The Big Bang and the Cosmic Microwave Background", zh: "大霹靂與宇宙微波背景" },
        sub: { en: "A faint microwave hiss, caught by accident in a satellite-communications antenna, turned out to be the afterglow of the universe's own birth.", zh: "一陣在衛星通訊天線中意外捕捉到的微弱微波嘶聲，竟是宇宙自身誕生時遺留下來的餘暉。" },
        blocks: [
          { p: {
            en: "Even as astronomers tightened the net around individual black holes — <b>Cygnus X-1</b> in the early 1970s, and later the compact radio source at the Milky Way's center now known as <b>Sagittarius A*</b> — a far bigger question had already been settled by observation, years before either case closed: not how one star collapses, but how the entire universe began. The answer arrived almost by accident, in 1965.",
            zh: "就在天文學家逐步鎖定個別黑洞的證據之際——1970 年代初的天鵝座 X-1（Cygnus X-1），以及後來銀河系中心那個如今稱為人馬座 A*（Sagittarius A*）的緻密電波源——一個規模大得多的問題早已由觀測拍板定案，而且比這兩個案例都要早上好幾年：不是單一恆星如何塌縮，而是整個宇宙如何開始。答案在 1965 年幾乎是意外降臨的。"
          }},
          { p: {
            en: "The idea was not new. In 1931 the Belgian priest and physicist Georges Lemaître took Einstein's general relativity seriously in the other temporal direction: if the universe is expanding today, then running the clock backward it must once have been compressed into what he called a \"primeval atom\" — an extremely hot, extremely dense state from which space itself has been expanding ever since. Lemaître had, in effect, proposed the <span class=\"term\">Big Bang</span> — though the catchy name came later, coined in 1949 by the astronomer Fred Hoyle, an advocate of the competing steady-state theory, in a phrase that outlived his own model.",
            zh: "這個想法並不新。1931 年，比利時神父兼物理學家 Georges Lemaître 認真地把愛因斯坦的廣義相對論套用到另一個時間方向：如果宇宙今天正在膨脹，那麼把時鐘倒轉回去，它必然曾經被壓縮成他稱為「原始原子」（primeval atom）的狀態——一個極熱、極密的狀態，此後空間本身便持續膨脹至今。Lemaître 實際上已經提出了<span class=\"term\">大霹靂</span>（Big Bang）——儘管這個響亮的名稱是後來才出現的：1949 年由天文學家 Fred Hoyle 提出，他是與之競爭的穩態理論支持者，而這個詞流傳至今，比他自己的理論撐得更久。"
          }},
          { p: {
            en: "If Lemaître was right, the hot early universe should have left a fingerprint. In 1948, physicist George Gamow, working with Ralph Alpher and Robert Herman, worked out the consequence: as the infant universe cooled and expanded, its primordial light should have redshifted into a faint, nearly uniform glow of microwaves, filling every direction of the sky at a temperature of only a few kelvin above absolute zero. It was a precise, falsifiable prediction — and for sixteen years, nobody went looking for it.",
            zh: "如果 Lemaître 是對的，早期灼熱的宇宙就應該留下指紋。1948 年，物理學家 George Gamow 與 Ralph Alpher、Robert Herman 推算出了這個後果：隨著年輕的宇宙冷卻並膨脹，其原初的光應該會紅移成一片微弱、幾乎均勻的微波輝光，佈滿天空每一個方向，溫度僅比絕對零度高出幾克耳文（kelvin）。這是一個精確、可證偽的預測——但接下來十六年，沒有人真的去尋找它。"
          }},
          { p: {
            en: "They found it by accident. In 1964-65, Arno Penzias and Robert Wilson were trying to eliminate every source of noise from a sensitive horn antenna at Bell Labs in New Jersey, built for satellite communication — they even scraped out pigeon droppings, suspecting the birds were the culprit. The hiss would not go away. It came from every direction, day and night, in every season, at a temperature near 3.5 K (the modern precise value is <b>2.725 K</b>). Some 30 miles away, physicists at Princeton were building an instrument to search for exactly this signal; the two teams published back to back in 1965, and Penzias and Wilson had found the <span class=\"term\">cosmic microwave background</span> (CMB) — the afterglow Gamow's group had predicted. They shared the 1978 Nobel Prize in Physics.",
            zh: "他們是意外發現的。1964 至 1965 年間，Arno Penzias 與 Robert Wilson 正試圖排除新澤西州 Bell Labs 一具靈敏喇叭形天線上的每一種雜訊來源——那具天線原本是為衛星通訊建造的；他們甚至刮除了鴿子留下的糞便，懷疑是鳥類造成干擾。但那陣嘶聲怎麼也去不掉。它來自每一個方向，不分晝夜，不分季節，溫度接近 3.5 K（現代精確測得的數值為 <b>2.725 K</b>）。約 30 英里外，普林斯頓大學的物理學家正在建造一套儀器，準備尋找的正是這個訊號；兩個團隊在 1965 年接連發表論文，而 Penzias 與 Wilson 找到的正是<span class=\"term\">宇宙微波背景</span>（cosmic microwave background, CMB）——Gamow 團隊預測的那道餘暉。兩人共享了 1978 年諾貝爾物理學獎。"
          }},
          { eq: "T(z) = T0 x (1 + z)",
            where: {
              en: "T0 ≈ 2.725 K is the CMB's temperature measured today; z is redshift, a measure of how much the universe has expanded since the light was emitted. Run the universe backward, and the afterglow gets hotter in lockstep with the contraction.",
              zh: "T0 ≈ 2.725 K 是宇宙微波背景在今天測得的溫度；z 是紅移，用來衡量自光被發出以來宇宙膨脹了多少倍。把時間倒轉回去，這道餘暉的溫度便會隨著宇宙的收縮同步升高。"
            }},
          { list: [
            { en: "1989-1993 — NASA's COBE satellite confirms the CMB's near-perfect blackbody spectrum and detects its first faint temperature ripples; the discovery earns John Mather and George Smoot the 2006 Nobel Prize in Physics.", zh: "1989-1993 年——NASA 的 COBE 衛星證實宇宙微波背景幾乎完美的黑體光譜，並偵測到最初的微弱溫度漣漪；這項發現為 John Mather 與 George Smoot 贏得 2006 年諾貝爾物理學獎。" },
            { en: "2001-2010 — WMAP maps those ripples in far finer detail, pinning down the universe's age, composition and geometry to percent-level precision.", zh: "2001-2010 年——WMAP 以更高的解析度描繪出這些漣漪，把宇宙的年齡、組成與幾何形狀的測量精度推進到百分之幾的等級。" },
            { en: "2009-2013 — ESA's Planck satellite sharpens the picture further still, delivering the detailed parameters behind today's standard Lambda-CDM model of the cosmos.", zh: "2009-2013 年——歐洲太空總署（ESA）的 Planck 衛星把這幅圖景描繪得更加精細，為今日標準的 Lambda-CDM 宇宙學模型提供了詳細參數。" }
          ]},
          { p: {
            en: "The CMB is, in effect, a baby picture of the universe taken when it was about 380,000 years old — the moment it had cooled enough for electrons and protons to combine into neutral hydrogen, letting light travel freely for the first time. It is extraordinarily uniform, the same temperature to better than one part in a hundred thousand across the whole sky. But not perfectly uniform: the tiny variations that COBE, WMAP and Planck mapped are the gravitational seeds from which every galaxy, every star, and every black hole in this library would eventually condense.",
            zh: "宇宙微波背景實際上是一張宇宙的嬰兒照，拍攝於宇宙大約 380,000 歲的那一刻——當時宇宙剛好冷卻到足以讓電子與質子結合成中性氫原子，光第一次得以自由穿行。它極為均勻，全天各處的溫度差異小於十萬分之一。但並非完美均勻：COBE、WMAP 與 Planck 所描繪出的那些微小變化，正是重力的種子，本圖書館中每一個星系、每一顆恆星，乃至每一個黑洞，最終都是從這些種子凝聚而成。"
          }},
          { call: 'key', title: { en: "A Universe With a Birth Certificate", zh: "宇宙的出生證明" }, body: {
            en: "Black holes are places where spacetime's shape goes to an extreme — collapsed to a point, or nearly so, by gravity acting on a single dying star or a galaxy's central mass. The Big Bang is spacetime's shape taken to the opposite extreme: not a collapse inside the universe, but the origin of the universe's geometry itself, still glowing faintly in every direction as the cosmic microwave background. Later chapters return to that same faint glow to ask what it is made of — for its patterns point to far more matter, and far more energy, than anything that shines.",
            zh: "黑洞是時空形狀走向極端的地方——由重力作用在一顆垂死恆星或星系核心質量上，把時空塌縮成一個點，或近乎一個點。大霹靂則是時空形狀走向另一個極端：那不是宇宙內部的一次塌縮，而是宇宙幾何本身的起源，至今仍以宇宙微波背景的形式，在每個方向上微微發光。本圖書館稍後的章節將回到這道微弱的餘暉，追問它究竟由什麼構成——因為它的圖樣指向遠比任何會發光的東西都更多的物質，以及更多的能量。"
          }}
        ]
      },

      // ---- 28. Dark Energy and the Accelerating Universe ----
      {
        id: "dark-energy", no: 28,
        kicker: { en: "runaway universe", zh: "失速宇宙" },
        title: { en: "Dark Energy and the Accelerating Universe", zh: "暗能量與加速膨脹的宇宙" },
        sub: { en: "In 1998, two teams raced to measure how quickly gravity was slowing the cosmos down — and found instead that it is speeding up.", zh: "1998年，兩支團隊競相測量重力讓宇宙膨脹減速的幅度——結果卻發現，宇宙其實正在加速膨脹。" },
        blocks: [
          { p: {
            en: "By the 1990s, astronomers had a well-posed question left over from Edwin Hubble's discovery of the <span class=\"term\">expanding universe</span>: since gravity pulls every <span class=\"term\">galaxy</span> toward every other, the expansion should be gradually slowing down. Two independent teams set out to measure exactly how much — racing each other to catch and measure faint, faraway <span class=\"term\">supernova</span> explosions before they faded from view.",
            zh: "到了1990年代，天文學家面對一個由 Edwin Hubble 發現<span class=\"term\">膨脹宇宙</span>所留下、定義清楚的問題：既然重力會把每個<span class=\"term\">星系</span>彼此拉近，膨脹的速度理應逐漸減緩。兩支獨立的研究團隊著手直接測量這個減速幅度——彼此競爭，搶在遙遠而暗淡的<span class=\"term\">超新星</span>爆炸消失前捕捉並測量它們。"
          }},
          { p: {
            en: "Their tool was the Type Ia supernova: a <span class=\"term\">white dwarf</span> that has quietly siphoned matter from a companion star until it approaches the <span class=\"term\">Chandrasekhar limit</span>, the mass at which <span class=\"term\">electron degeneracy pressure</span> can no longer hold it up. Past that threshold the star detonates in a thermonuclear runaway bright enough to briefly outshine its entire host galaxy, and — crucially — with a peak brightness that varies little from one such explosion to the next. That made it a reliable <i>standard candle</i>. Combined with <span class=\"term\">spectroscopy</span> of the <span class=\"term\">spectral lines</span> in a supernova's light, which reveals its redshift through the <span class=\"term\">Doppler effect</span>, a single explosion yields both a distance and a recession velocity — extending Hubble's original distance-velocity relation, <span class=\"term\">Hubble's law</span>, far deeper into the universe than Hubble himself could ever reach.",
            zh: "他們使用的工具是Ia型超新星：一顆<span class=\"term\">白矮星</span>持續從伴星緩緩吸積物質，直到質量逼近<span class=\"term\">錢德拉塞卡極限</span>——超過這個質量，<span class=\"term\">電子簡併壓力</span>便再也撐不住星體。一旦越過這個門檻，恆星便以熱核失控反應猛烈爆炸，短暫亮度足以蓋過整個母星系；更關鍵的是，這類爆炸的峰值亮度幾乎不隨個別事件變化，因而成為可靠的「標準燭光」。再結合對超新星光線<span class=\"term\">譜線</span>的<span class=\"term\">光譜學</span>分析（藉由<span class=\"term\">都卜勒效應</span>得出紅移），單一次爆炸就能同時給出距離與退行速度——把 Hubble 最初的距離-速度關係，也就是<span class=\"term\">哈伯定律</span>，延伸到遠比 Hubble 本人所能觸及還要深遠的宇宙深處。"
          }},
          { p: {
            en: "One team, the Supernova Cosmology Project, was led by Saul Perlmutter at Lawrence Berkeley National Laboratory. The other, the High-Z Supernova Search Team, was led by Brian Schmidt and Adam Riess. Working independently and in competition, both groups published their results in 1998 — and both had expected to measure a slowing expansion. Instead they found the opposite.",
            zh: "其中一支團隊「超新星宇宙學計畫」（Supernova Cosmology Project）由 Saul Perlmutter 在 Lawrence Berkeley National Laboratory 領軍；另一支「高紅移超新星搜尋隊」（High-Z Supernova Search Team）則由 Brian Schmidt 與 Adam Riess 領導。兩隊各自獨立、彼此競爭，都在1998年發表了結果——而兩隊原本都預期會測到膨脹減速。結果卻恰恰相反。"
          }},
          { list: [
            { en: "1998 — The High-Z team, led by Schmidt and Riess, finds distant Type Ia supernovae systematically fainter — and so farther away — than a decelerating universe would allow.", zh: "1998年——由 Schmidt 與 Riess 領導的 High-Z 團隊發現，遙遠的Ia型超新星系統性地比一個減速膨脹的宇宙所允許的還要暗淡（也就是距離更遠）。" },
            { en: "1998 — The Supernova Cosmology Project, led by Perlmutter, independently reaches the same startling conclusion.", zh: "1998年——由 Perlmutter 領導的超新星宇宙學計畫，獨立得出同樣驚人的結論。" },
            { en: "The years that follow — independent measurements of the cosmic microwave background corroborate a universe whose expansion is accelerating, not slowing.", zh: "隨後數年——對<span class=\"term\">宇宙微波背景</span>的獨立測量，證實了這是一個加速膨脹、而非減速的宇宙。" },
            { en: "2011 — Perlmutter, Schmidt and Riess share the Nobel Prize in Physics for the discovery.", zh: "2011年——Perlmutter、Schmidt 與 Riess 因這項發現共同獲頒諾貝爾物理學獎。" }
          ]},
          { p: {
            en: "Something was pushing the universe's expansion outward against its own gravity, and cosmologists reached back nearly a century for a name: <span class=\"term\">dark energy</span>. One natural candidate is the <span class=\"term\">cosmological constant</span>, Λ — a term Einstein had inserted into his field equations in 1917 to keep the universe static, then discarded once Hubble showed it was expanding. Reintroduced as a constant energy density that fills space itself, Λ fits the supernova data well. Current estimates attribute roughly 68% of the universe's total energy content to dark energy, with <span class=\"term\">dark matter</span> and ordinary matter making up most of the remainder.",
            zh: "有某種力量正推動宇宙的膨脹、對抗宇宙自身的重力，宇宙學家因此重新啟用了將近一世紀前的一個名字：<span class=\"term\">暗能量</span>。一個自然的候選者是<span class=\"term\">宇宙常數</span> Λ——這是 Einstein 早在1917年為了讓宇宙維持靜態而加入場方程式中的一項，後來在 Hubble 證明宇宙正在膨脹後便捨棄不用。如今將 Λ 重新詮釋為一種瀰漫於空間本身、恆定不變的能量密度，恰好能吻合超新星觀測數據。目前的估計顯示，暗能量約佔宇宙總能量內容的68%，其餘大部分則由<span class=\"term\">暗物質</span>與一般物質構成。"
          }},
          { eq: "ΩΛ + Ωm ≈ 1, with ΩΛ ≈ 0.68",
            where: {
              en: "Ω denotes each component's share of the universe's total energy density relative to the critical density; ΩΛ is dark energy's share and Ωm the combined share of dark and ordinary matter — together they describe a universe that is spatially flat.",
              zh: "Ω 代表宇宙中各成分相對於臨界密度的能量密度占比；ΩΛ 是暗能量的占比，Ωm 則是暗物質與一般物質合計的占比——兩者加總，描繪出一個空間平坦的宇宙。"
            }},
          { p: {
            en: "If dark energy really is a constant, unchanging energy density of space itself, the implications are stark: as the universe grows, matter and radiation dilute away while dark energy does not, so its dominance only grows. Galaxies now visible will eventually recede faster than light can cross the gap, fading from view one by one into an ever colder, ever emptier future. The same general relativity that shapes the spacetime around a single black hole also governs the shape of the universe as a whole — and the era of precision cosmology that followed 1998, from mapping the cosmic microwave background to the gravitational-wave observations of <span class=\"term\">multi-messenger astronomy</span>, has only sharpened that picture.",
            zh: "如果暗能量真的是一種恆定不變、瀰漫於空間本身的能量密度，其後果相當嚴峻：隨著宇宙持續膨脹，物質與輻射的密度會被稀釋，暗能量卻不會，於是它的主導地位只會愈來愈強。今日仍可見的星系，終將以超過光速跨越彼此間隙的速度遠離，一個接一個淡出視野，邁向一個愈來愈寒冷、愈來愈空曠的未來。塑造單一黑洞周圍時空形狀的，正是同一套廣義相對論，也主宰著整個宇宙的形狀——而1998年之後那個講求精密測量的宇宙學時代，從描繪宇宙微波背景，到<span class=\"term\">多信使天文學</span>中的重力波觀測，只是讓這幅圖像愈發清晰。"
          }},
          { call: 'key', title: { en: "A universe pushing back against itself", zh: "與自身重力對抗的宇宙" }, body: {
            en: "The 1998 supernova surveys did not just measure a number; they overturned the default assumption that gravity alone governs cosmic history. Roughly two-thirds of everything in the universe turns out to be a form of energy that works against space's own contraction — dark energy — while dark matter and ordinary matter, gravitationally bound into galaxies and clusters, make up the rest. Later in this library, the same general-relativistic machinery used to describe an accelerating cosmos also describes the sharply curved spacetime around a black hole; the difference is only which solution of Einstein's equations you are standing inside.",
            zh: "1998年的超新星巡天調查所測得的，不只是一個數字，更推翻了「宇宙歷史全由重力主宰」這個預設假說。宇宙中約三分之二的內容，原來是一種會抵消空間自身收縮傾向的能量形式——暗能量；而暗物質與一般物質則以重力束縛成星系與星系團，構成其餘的部分。本圖書館稍後將會看到，描述加速膨脹宇宙的同一套廣義相對論工具，也用來描述黑洞周圍劇烈彎曲的時空——差別只在於，你站在 Einstein 方程式的哪一個解之中。"
          }}
        ]
      },

      // ---- 29. Multi-messenger astronomy: gravitational waves meet light ----
      {
        id: "multimessenger-astronomy", no: 29,
        kicker: { en: "listening to spacetime", zh: "傾聽時空" },
        title: { en: "Multi-messenger astronomy: gravitational waves meet light", zh: "多信使天文學：重力波與光的交會" },
        sub: { en: "For the first time, humanity could hear a cosmic collision and watch it light up the sky in the same breath.", zh: "人類首次得以同時聆聽一場宇宙碰撞，並在同一瞬間看見它照亮夜空。" },
        blocks: [
          { p: {
            en: "In 1916, barely a year after completing general relativity, Einstein found that his own field equations allowed the fabric of spacetime to ripple &mdash; waves of stretching and squeezing space itself, radiating outward at the speed of light. He calculated their effect and despaired: even a violent event like a collapsing star would jostle a laboratory on Earth by a fraction of the width of an atomic nucleus. Einstein doubted anyone would ever measure something so faint.",
            zh: "1916年，愛因斯坦完成廣義相對論僅一年後，便發現自己的場方程式允許時空這塊織物產生漣漪──一種以光速向外傳播、使空間本身伸縮的波動。他計算了這種效應的強度後感到絕望：即使是恆星塌縮這樣劇烈的事件，傳到地球實驗室時造成的形變也只有原子核直徑的一小部分。愛因斯坦懷疑，這麼微弱的訊號永遠不可能被量測到。"
          }},
          { p: {
            en: "The first evidence came sideways. In 1974, Russell Hulse and Joseph Taylor, using the Arecibo radio telescope, discovered PSR B1913+16, a pulsar locked in a tight binary orbit with another neutron star. A pulsar is a natural clock, ticking with each rotation; by timing its pulses with exquisite precision for years, Hulse and Taylor watched the pair's orbit shrink &mdash; slowly, systematically, by exactly the rate general relativity predicts for a system losing energy to gravitational-wave emission. No wave had been caught directly, but its fingerprint was unmistakable. Hulse and Taylor shared the 1993 Nobel Prize in Physics.",
            zh: "第一個證據是間接得來的。1974年，Russell Hulse 與 Joseph Taylor 利用 Arecibo 電波望遠鏡發現了 PSR B1913+16，一顆與另一顆中子星緊密互繞的脈衝星。脈衝星本身就是一座天然時鐘，隨自轉週期規律地發出訊號；Hulse 與 Taylor 多年來以極高精度計時，觀測到這對星體的軌道正逐漸縮小──縮小的速率，恰好與廣義相對論預測「因重力波輻射而損失能量」的結果完全吻合。雖然沒有直接捕捉到重力波本身，但它的指紋已無可辯駁。Hulse 與 Taylor 因此共同獲得1993年諾貝爾物理學獎。"
          }},
          { h: { en: "Direct detection", zh: "直接偵測" } },
          { p: {
            en: "Catching a gravitational wave in the act required an instrument sensitive to changes in length thousands of times smaller than a proton &mdash; across an arm four kilometres long. The <span class=\"term\">gravitational-wave detector</span> that achieved this, LIGO (the Laser Interferometer Gravitational-Wave Observatory), split a laser beam down two perpendicular tunnels, bounced it off mirrors, and recombined it: a passing gravitational wave stretches one arm while squeezing the other, shifting the interference pattern by an almost unimaginably small amount. Two LIGO detectors, in Louisiana and Washington State, watched together so a real signal &mdash; arriving at both, milliseconds apart &mdash; could be told apart from local noise.",
            zh: "要當場捕捉重力波，需要一種能偵測到比質子還小上千倍的長度變化的儀器──而且是在四公里長的臂上量測。達成這項任務的<span class=\"term\">重力波偵測器</span>是 LIGO（雷射干涉重力波天文台）：它將一道雷射光分成兩束，分別射入互相垂直的隧道，經鏡面反射後再合併；當重力波通過時，一條臂會被拉伸、另一條則被壓縮，使干涉條紋產生極其微小的偏移。LIGO 在路易斯安那州與華盛頓州各設有一座偵測器，兩地同步觀測，如此才能將真正的訊號（幾毫秒內同時抵達兩地）與局部雜訊區分開來。"
          }},
          { p: {
            en: "At 09:50:45 UTC on 14 September 2015, both detectors registered the same fleeting chirp &mdash; a signal rising in frequency and amplitude over a fifth of a second before cutting off. GW150914 was the collision of two black holes, about 29 and 36 times the Sun's mass, roughly 1.3 billion light-years away, merging into a single 62-solar-mass black hole and radiating three solar masses' worth of energy as gravitational waves in that instant. The discovery, announced on 11 February 2016, was the first direct detection of gravitational waves and the first direct observation of a black hole merger. Rainer Weiss, Barry Barish and Kip Thorne received the 2017 Nobel Prize in Physics for it.",
            zh: "2015年9月14日世界協調時09:50:45，兩座偵測器同時記錄到相同的短暫「啁啾」訊號──頻率與振幅在五分之一秒內迅速攀升後戛然而止。GW150914 是兩個黑洞的碰撞事件：質量分別約為太陽的29倍與36倍，距離地球約13億光年，合併成一個62倍太陽質量的黑洞，並在那一瞬間以重力波形式輻射出相當於三個太陽質量的能量。這項發現於2016年2月11日對外公布，是人類首次直接偵測到重力波，也是首次直接觀測到黑洞合併事件。Rainer Weiss、Barry Barish 與 Kip Thorne 因此獲得2017年諾貝爾物理學獎。"
          }},
          { list: [
            { en: "17 August 2017, 12:41:04 UTC &mdash; LIGO and Virgo catch GW170817, the unmistakable signature of two neutron stars spiraling together.", zh: "2017年8月17日世界協調時12:41:04──LIGO 與 Virgo 捕捉到 GW170817，兩顆中子星旋近合併的清晰訊號。" },
            { en: "1.7 seconds later, the Fermi and INTEGRAL satellites register a short gamma-ray burst from the same patch of sky.", zh: "1.7秒後，Fermi 與 INTEGRAL 衛星在同一片天區偵測到一道短暫的伽瑪射線暴。" },
            { en: "Within hours, ground-based telescopes worldwide locate an <span class=\"term\">electromagnetic/optical counterpart</span> &mdash; a fading glow called a kilonova, powered by the radioactive decay of heavy elements freshly forged in the merger.", zh: "數小時內，全球地面望遠鏡定位出<span class=\"term\">光學對應體</span>──一團逐漸黯淡的光芒「千新星」（kilonova），能量來自合併瞬間新生成的重元素放射性衰變。" },
            { en: "Over the following days and weeks, X-ray and radio observatories track the same source, filling in a story no single instrument could tell alone.", zh: "接下來數天到數週間，X射線與電波天文台持續追蹤同一個源頭，拼出一則沒有任何單一儀器能獨力講完的故事。" }
          ]},
          { eq: "h = ΔL / L",
            where: {
              en: "h is the dimensionless strain a gravitational wave imprints on space; ΔL is the tiny change it produces in an arm of length L. LIGO's 4-kilometre arms had to resolve a ΔL thousands of times smaller than a proton.",
              zh: "h 是重力波施加在空間上的無因次應變（strain）；ΔL 是它在長度為 L 的臂上造成的微小變化量。LIGO 四公里長的臂必須解析出比質子還小上千倍的 ΔL。"
            }},
          { call: 'key', title: { en: "Two messengers, one event", zh: "兩種信使，同一事件" }, body: {
            en: "Gravitational waves and light are independent messengers: one carries the geometry of colliding masses, the other carries chemistry, temperature, and radiation. GW170817 was the moment they were read together for the first time, launching <span class=\"term\">multi-messenger astronomy</span> &mdash; using gravitational waves, light, and in principle neutrinos and cosmic rays as complementary witnesses to the same cosmic event. The black holes whose horizons, ergospheres, and merging geometries fill the rest of this library are, increasingly, objects we can now hear as well as see.",
            zh: "重力波與光是彼此獨立的信使：一個傳遞碰撞質量的幾何資訊，另一個傳遞化學組成、溫度與輻射。GW170817 是人類首次同時「讀取」兩種信使的時刻，開啟了<span class=\"term\">多信使天文學</span>──以重力波、光，以及原則上的微中子與宇宙射線，共同見證同一個宇宙事件。本圖書館其餘章節所描述的事件視界、能層與合併幾何，如今已是一類我們不只能「看見」、也能「聽見」的天體。"
          }}
        ]
      },

      // ---- 30. Imaging the shadow: the Event Horizon Telescope ----
      {
        id: "eht-shadow", no: 30,
        kicker: { en: "seeing the shadow", zh: "看見陰影" },
        title: { en: "Imaging the shadow: the Event Horizon Telescope", zh: "拍下陰影：事件視界望遠鏡" },
        sub: { en: "A network of radio dishes spanning the planet turns the whole Earth into a single telescope, just precise enough to trace a black hole's silhouette in light.", zh: "一張橫跨全球的無線電天線網路，把整個地球變成一具望遠鏡，精細到足以描繪出黑洞在光中的剪影。" },
        blocks: [
          { p: {
            en: "A black hole's <span class=\"term\">event horizon</span> is almost too small to picture. Seen from Earth, the shadow around the supermassive black hole at the heart of the galaxy M87 spans only a few dozen microarcseconds — famously described as sharp enough to read a newspaper headline in New York from a café terrace in Paris. No single dish, however large, can focus an image that fine. The <span class=\"term\">Event Horizon Telescope (EHT)</span> solves the problem without building a bigger dish at all: it links radio observatories on separate continents into a single synthetic instrument using <span class=\"term\">very-long-baseline interferometry (VLBI)</span>, turning the whole planet into one Earth-sized eye.",
            zh: "黑洞的<span class=\"term\">事件視界（event horizon）</span>幾乎小到難以想像。從地球看去，星系M87中心超大質量黑洞周圍的陰影只有幾十微角秒——常被形容為清晰到能在巴黎街頭咖啡座讀出紐約報紙的頭條標題。再大的單一天線也無法聚焦出如此精細的影像。<span class=\"term\">事件視界望遠鏡（Event Horizon Telescope, EHT）</span>不靠建造更大的天線來解決這個問題，而是運用<span class=\"term\">特長基線干涉技術（very-long-baseline interferometry, VLBI）</span>，把分布在不同大陸的無線電天文台連結成單一合成儀器，讓整個地球變成一隻地球大小的眼睛。"
          }},
          { eq: "θ ≈ λ / B",
            where: {
              en: "θ is the smallest angle a telescope can resolve, λ the observing wavelength, and B the distance between its farthest-apart dishes. At the EHT's 1.3 mm wavelength, a baseline B the size of Earth resolves structure only tens of microarcseconds across — just enough to trace a black hole's shadow.",
              zh: "θ為望遠鏡可分辨的最小角度，λ為觀測波長，B為相距最遠兩座天線之間的距離。在EHT所用1.3公釐的觀測波長下，一條地球尺度的基線B可分辨僅數十微角秒的結構——恰好足以描繪出黑洞的陰影。"
            }},
          { p: {
            en: "The EHT's first target was the black hole anchoring the galaxy M87, some 55 million light-years away in the constellation Virgo — an object astronomers write as <b>M87*</b>. At roughly 6.5 billion solar masses, it is one of the largest black holes known, and its sheer bulk makes its shadow easier to resolve than its distance alone would suggest. Built by the EHT Collaboration under founding director Shepherd Doeleman, the array drew on telescopes across the globe — from the South Pole to Spain, Chile, Hawaii, Arizona and Mexico, with Greenland joining later — including facilities run jointly with Academia Sinica's Institute of Astronomy and Astrophysics (ASIAA) in Taipei. In April 2017, eight of those observatories pointed at once, recording data too voluminous to send over the internet — it was flown out instead on hundreds of hard drives.",
            zh: "EHT首個觀測目標，是位於室女座星系M87中心的黑洞——距離地球約5,500萬光年，天文學家將其標記為<b>M87*</b>。其質量約為65億太陽質量，是已知最大的黑洞之一，龐大的質量使它的陰影比單看距離所預期的更容易分辨。這座陣列由EHT合作團隊建造，創始主任為Shepherd Doeleman，串連起分布全球的望遠鏡——從南極到西班牙、智利、夏威夷、亞利桑那與墨西哥，格陵蘭其後加入——其中也包括與台北中央研究院天文及天文物理研究所（ASIAA）共同運作的設施。2017年4月，其中八座天文台同步觀測，產生的資料量過於龐大，無法透過網路傳輸，只能用數百顆硬碟以飛機運送。"
          }},
          { p: {
            en: "The result, unveiled simultaneously at press conferences worldwide on 10 April 2019 and published as a six-paper series in <i>The Astrophysical Journal Letters</i>, was the first image ever made of a black hole. It showed exactly what strong-field relativity predicted: a dark central disc ringed by a lopsided crescent of glowing plasma from the black hole's own <span class=\"term\">accretion disc</span>, its light bent and brightened by <span class=\"term\">gravitational lensing</span> into the asymmetric halo astronomers had modelled for decades but never seen.",
            zh: "2019年4月10日，這項成果在全球同步舉行的記者會上公布，並以六篇論文的形式發表於《The Astrophysical Journal Letters》期刊，這是有史以來第一張黑洞影像。影像所呈現的，正是強重力場廣義相對論所預測的樣貌：中央一片黑暗圓盤，外圍環繞著一圈明暗不均的新月形光環，那是黑洞自身<span class=\"term\">吸積盤（accretion disc）</span>中發光電漿的光，經<span class=\"term\">重力透鏡（gravitational lensing）</span>彎折並增亮，形成天文學家演算數十年、卻直到此刻才真正看見的不對稱光環。"
          }},
          { list: [
            { en: "April 2017 — the global EHT array observes both M87* and Sagittarius A* during the same campaign; the data, too large to send over the internet, are carried out on hundreds of hard drives.", zh: "2017年4月——EHT全球陣列在同一次觀測活動中同時觀測M87*與Sgr A*；資料量過於龐大無法透過網路傳輸，只能用數百顆硬碟運送。" },
            { en: "10 April 2019 — the EHT Collaboration releases the first image of a black hole: M87*, its shadow ringed by lensed light.", zh: "2019年4月10日——EHT合作團隊發布史上第一張黑洞影像：M87*，呈現出被重力透鏡光環環繞的陰影。" },
            { en: "March 2021 — a polarized-light image of M87* reveals the magnetic field threading the plasma at its edge.", zh: "2021年3月——M87*的偏振光影像揭露出貫穿其邊緣電漿的磁場結構。" },
            { en: "12 May 2022 — the EHT releases a second image: Sagittarius A*, the Milky Way's own central black hole.", zh: "2022年5月12日——EHT發布第二張影像：Sgr A*，銀河系自身的中央黑洞。" }
          ]},
          { p: {
            en: "Sagittarius A*, the Milky Way's own central black hole — first pinned down as a compact radio source in 1974, as told earlier in this library — ought to have been the easier target: at roughly 27,000 light-years away it sits some two thousand times closer than M87*, so its shadow looks nearly as large on the sky. But its mass is only about 4.3 million Suns, a small fraction of M87*'s billions, and lighter black holes evolve faster. Gas near Sagittarius A* completes an orbit in minutes rather than weeks, so its glow flickered and reshuffled within the very night the EHT was recording it, forcing the team to build new imaging algorithms just to keep the picture from blurring. The image was finally released on 12 May 2022.",
            zh: "Sgr A*是銀河系自身的中央黑洞——如本圖書館稍早所述，它早在1974年就已被確認為一個緻密無線電波源——照理說應該是比較容易的目標：距離地球約27,000光年，比M87*近了約兩千倍，因此陰影在天空中看起來幾乎一樣大。但它的質量僅約430萬太陽質量，只是M87*數十億質量中的一小部分，而較輕的黑洞演化得更快。Sgr A*附近的氣體僅需數分鐘便可公轉一圈，而非數週，因此它的光輝在EHT觀測的同一夜之內就不斷閃爍變化，迫使團隊開發新的成像演算法，才能避免影像因此模糊。這張影像終於在2022年5月12日發布。"
          }},
          { call: 'key', title: { en: "The shadow made visible", zh: "看得見的陰影" }, body: {
            en: "The dark disc the EHT photographed is not empty space, and it is not the event horizon itself — it is larger. Whether a ray of light reaches a distant camera or is lost forever depends on how closely it is aimed at the black hole: any ray aimed within a critical distance of the <span class=\"term\">photon sphere</span> — for a non-spinning hole, an impact parameter b = 3√3 M, a boundary explored earlier in this library — spirals in and never comes back out. Gravitational lensing magnifies that capture boundary into the shadow astronomers actually see, a dark disc roughly 2.6 times the size of the horizon itself. What the EHT drew, in other words, is not the horizon's edge but its gravitationally magnified silhouette. Two images, of two black holes wildly different in distance and in mass, trace that identical geometry — a boundary drawn by gravity alone, exactly where general relativity said it would be. From Karl Schwarzschild's first exact solution, worked out on the Russian front in 1916, to a photograph assembled from an Earth-sized array a century later, the black hole had finally been seen.",
            zh: "EHT拍下的暗盤既不是空無一物的空間，也不是事件視界本身——而是比事件視界更大的影像。一道光線最終能否抵達遠方的相機、還是永遠消失，取決於它瞄準黑洞的精準程度：任何瞄準路徑落在<span class=\"term\">光子球（photon sphere）</span>臨界距離之內的光線——對不旋轉的黑洞而言，即瞄準參數b = 3√3 M，這正是本圖書館稍早探討過的邊界——都會盤旋墜入、再也無法脫離。重力透鏡效應將這道捕獲邊界放大，形成天文學家實際看見的陰影：一片直徑約為事件視界本身2.6倍的暗盤。換言之，EHT描繪出的並非事件視界的邊緣，而是它經重力放大後的剪影。這兩張影像，來自距離與質量都相差懸殊的兩個黑洞，描繪出的卻是同一種幾何——一條僅由重力畫出的邊界，恰好落在廣義相對論預言的位置上。從Karl Schwarzschild於1916年在俄國前線求出的第一個精確解，到一個世紀後由地球大小的陣列合成出的一張照片，人類終於親眼看見了黑洞。"
          }}
        ]
      }
    ]
  };
})();
