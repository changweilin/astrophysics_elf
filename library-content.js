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
        en: 'This library explains, in pictures and a little math, every physical phenomenon you can switch on in the lab — from the event horizon to relativistic jets. Start here, then jump to any chapter from the index on the right.',
        zh: '這座圖書館用圖與少量數學，說明你在實驗室裡能開啟的每一種物理現象——從事件視界到相對論性噴流。先讀這裡，再從右側索引跳到任一章節。',
        ja: 'この入門書は、図と少しの数式で、研究室で切り替えられるあらゆる物理現象を——事象の地平面から相対論的ジェットまで——解説します。まずここを読み、右の索引から任意の章へ進んでください。',
        ko: '이 입문서는 그림과 약간의 수식으로, 실험실에서 켤 수 있는 모든 물리 현상을——사건의 지평선부터 상대론적 제트까지——설명합니다. 여기서 시작한 뒤 오른쪽 색인에서 원하는 장으로 이동하세요.',
        de: 'Diese Einführung erklärt mit Bildern und etwas Mathematik jedes physikalische Phänomen, das du im Labor einschalten kannst — vom Ereignishorizont bis zu relativistischen Jets. Beginne hier und springe dann über das Verzeichnis rechts zu jedem Kapitel.',
        fr: 'Ce guide explique, en images et avec un peu de mathématiques, chaque phénomène physique que vous pouvez activer dans le laboratoire — de l’horizon des événements aux jets relativistes. Commencez ici, puis accédez à n’importe quel chapitre depuis l’index à droite.',
        es: 'Esta introducción explica, con imágenes y algo de matemáticas, cada fenómeno físico que puedes activar en el laboratorio — desde el horizonte de sucesos hasta los chorros relativistas. Empieza aquí y luego salta a cualquier capítulo desde el índice de la derecha.',
        it: 'Questa introduzione spiega, con immagini e un po’ di matematica, ogni fenomeno fisico che puoi attivare nel laboratorio — dall’orizzonte degli eventi ai getti relativistici. Comincia qui, poi salta a qualsiasi capitolo dall’indice a destra.'
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
          { en: 'Each chapter ends with a <span class="term">TRY IT IN THE LAB</span> box pointing to the exact toggle or control that demonstrates it.',
            zh: '每章結尾都有 <span class="term">在實驗室中試試</span> 方塊，指出能演示該現象的開關或控制項。',
            ja: '各章の終わりには <span class="term">研究室で試そう</span> の囲みがあり、それを実演する正確なトグルや操作を示します。',
            ko: '각 장의 끝에는 <span class="term">실험실에서 해보기</span> 상자가 있어, 그것을 보여 주는 정확한 토글이나 컨트롤을 알려 줍니다.',
            de: 'Jedes Kapitel endet mit einem Kasten <span class="term">IM LABOR AUSPROBIEREN</span>, der auf den genauen Schalter oder die Steuerung verweist.',
            fr: 'Chaque chapitre se termine par un encadré <span class="term">À ESSAYER DANS LE LABORATOIRE</span> indiquant le bouton ou la commande exacte qui l’illustre.',
            es: 'Cada capítulo termina con un recuadro <span class="term">PRUÉBALO EN EL LABORATORIO</span> que señala el interruptor o control exacto que lo demuestra.',
            it: 'Ogni capitolo termina con un riquadro <span class="term">PROVALO IN LABORATORIO</span> che indica l’interruttore o il comando esatto che lo dimostra.' },
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
          en: 'If you read only three chapters, read <b>1 (the three parameters)</b>, <b>2 (the horizon)</b>, and <b>6 (the ISCO)</b> — together they explain most of what you see moving on screen.',
          zh: '若只讀三章，請讀<b>第 1 章（三個參數）</b>、<b>第 2 章（事件視界）</b>與<b>第 6 章（ISCO）</b>——三者合起來就能解釋畫面上大部分的運動。',
          ja: '三章だけ読むなら、<b>第1章（三つのパラメータ）</b>・<b>第2章（地平面）</b>・<b>第6章（ISCO）</b>を。これらで画面上の動きの大半を説明できます。',
          ko: '세 장만 읽는다면 <b>1장(세 매개변수)</b>, <b>2장(지평선)</b>, <b>6장(ISCO)</b>을 읽으세요. 이들만으로 화면에서 움직이는 것 대부분을 설명할 수 있습니다.',
          de: 'Wenn du nur drei Kapitel liest, lies <b>1 (die drei Parameter)</b>, <b>2 (der Horizont)</b> und <b>6 (die ISCO)</b> — zusammen erklären sie das meiste, was du dich auf dem Bildschirm bewegen siehst.',
          fr: 'Si vous ne lisez que trois chapitres, lisez le <b>1 (les trois paramètres)</b>, le <b>2 (l’horizon)</b> et le <b>6 (la ISCO)</b> — ensemble, ils expliquent l’essentiel de ce que vous voyez bouger à l’écran.',
          es: 'Si solo lees tres capítulos, lee el <b>1 (los tres parámetros)</b>, el <b>2 (el horizonte)</b> y el <b>6 (la ISCO)</b> — juntos explican casi todo lo que ves moverse en pantalla.',
          it: 'Se leggi solo tre capitoli, leggi il <b>1 (i tre parametri)</b>, il <b>2 (l’orizzonte)</b> e il <b>6 (la ISCO)</b> — insieme spiegano gran parte di ciò che vedi muoversi sullo schermo.'
        }}
      ]
    },

    // ============================ CHAPTERS ============================
    chapters: [
      // ---- 1. Kerr-Newman spacetime & the three parameters ----
      {
        id: 'kn-spacetime', no: 1,
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

      // ---- 2. Event horizon ----
      {
        id: 'horizons', no: 2,
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

      // ---- 3. Ergosphere & Penrose process ----
      {
        id: 'ergosphere', no: 3,
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
            en: 'Outside the horizon of a spinning hole lies the <span class="term">ergosphere</span>. Inside it, frame dragging (Chapter 4) is so strong that <b>no observer can remain at rest</b> relative to distant stars — you are forced to co-rotate, even moving at the speed of light against the spin. Yet you can still escape: the horizon is deeper in.',
            zh: '旋轉黑洞的視界之外環繞著<span class="term">能層（ergosphere）</span>。在其中，參考系拖曳（第 4 章）強到<b>沒有任何觀測者能相對遠方恆星保持靜止</b>——你被迫隨之共轉，即使以光速逆著自轉方向移動也一樣。但你仍可逃離：視界還在更深處。',
            ja: '回転するブラックホールの地平面の外側に<span class="term">エルゴ球（ergosphere）</span>が広がります。その内部では参照系の引きずり（第4章）が非常に強く、<b>どの観測者も遠方の星に対して静止していられません</b>——自転に逆らって光速で動いても、共回転を強いられます。それでも脱出は可能です。地平面はさらに奥にあります。',
            ko: '회전하는 블랙홀의 지평선 바깥에 <span class="term">에르고구(ergosphere)</span>가 펼쳐집니다. 그 안에서는 좌표계 끌림(4장)이 너무 강해 <b>어떤 관측자도 먼 별에 대해 정지해 있을 수 없습니다</b>——스핀을 거슬러 광속으로 움직여도 함께 회전하도록 강요받습니다. 그래도 탈출은 가능합니다. 지평선은 더 깊은 곳에 있습니다.',
            de: 'Außerhalb des Horizonts eines rotierenden Lochs liegt die <span class="term">Ergosphäre</span>. In ihr ist das Mitführen der Bezugssysteme (Kapitel 4) so stark, dass <b>kein Beobachter relativ zu fernen Sternen in Ruhe bleiben kann</b> — du wirst zum Mitrotieren gezwungen, selbst wenn du dich mit Lichtgeschwindigkeit gegen den Spin bewegst. Dennoch kannst du entkommen: Der Horizont liegt tiefer.',
            fr: 'Au-delà de l’horizon d’un trou en rotation s’étend l’<span class="term">ergosphère</span>. À l’intérieur, l’entraînement des référentiels (chapitre 4) est si fort qu’<b>aucun observateur ne peut rester au repos</b> par rapport aux étoiles lointaines — vous êtes forcé de co-tourner, même en vous déplaçant à la vitesse de la lumière contre le spin. Pourtant, vous pouvez encore vous échapper : l’horizon est plus profond.',
            es: 'Más allá del horizonte de un agujero en rotación se extiende la <span class="term">ergosfera</span>. Dentro de ella, el arrastre de los sistemas de referencia (capítulo 4) es tan intenso que <b>ningún observador puede permanecer en reposo</b> respecto a las estrellas lejanas — te ves obligado a co-rotar, incluso moviéndote a la velocidad de la luz contra el espín. Aun así puedes escapar: el horizonte está más adentro.',
            it: 'Oltre l’orizzonte di un buco rotante si estende l’<span class="term">ergosfera</span>. Al suo interno, il trascinamento dei sistemi di riferimento (capitolo 4) è così forte che <b>nessun osservatore può restare in quiete</b> rispetto alle stelle lontane — sei costretto a co-ruotare, anche muovendoti alla velocità della luce contro lo spin. Eppure puoi ancora fuggire: l’orizzonte è più in profondità.'
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

      // ---- 4. Frame dragging ----
      {
        id: 'frame-dragging', no: 4,
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

      // ---- 5. Photon sphere & shadow ----
      {
        id: 'photon-sphere', no: 5,
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

      // ---- 6. ISCO ----
      {
        id: 'isco', no: 6,
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

      // ---- 7. Redshift & time dilation ----
      {
        id: 'redshift', no: 7,
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
            en: 'Redshift and time dilation are two faces of the same effect: stretched light <i>is</i> slowed time. The accretion-disc colours in the lab encode it — the side rotating toward you is brighter and bluer (Chapter 10).',
            zh: '紅移與時間膨脹是同一效應的兩面：被拉長的光<i>就是</i>變慢的時間。實驗室中吸積盤的顏色即編碼了這點——朝你旋轉的一側更亮、更藍（第 10 章）。',
            ja: '赤方偏移と時間の遅れは同じ効果の二つの顔です：伸びた光<i>こそ</i>遅れた時間です。研究室の吸積円盤の色がこれを符号化しています——あなたへ向かって回転する側はより明るく、より青くなります（第10章）。',
            ko: '적색편이와 시간 지연은 같은 효과의 두 얼굴입니다: 늘어난 빛이 <i>곧</i> 느려진 시간입니다. 실험실의 강착 원반 색이 이를 부호화합니다——당신 쪽으로 회전하는 면이 더 밝고 더 푸릅니다(10장).',
            de: 'Rotverschiebung und Zeitdilatation sind zwei Seiten desselben Effekts: gedehntes Licht <i>ist</i> verlangsamte Zeit. Die Farben der Akkretionsscheibe im Labor codieren das — die auf dich zu rotierende Seite ist heller und blauer (Kapitel 10).',
            fr: 'Le décalage vers le rouge et la dilatation du temps sont deux faces du même effet : la lumière étirée <i>est</i> du temps ralenti. Les couleurs du disque d’accrétion dans le laboratoire l’encodent — le côté qui tourne vers vous est plus brillant et plus bleu (chapitre 10).',
            es: 'El corrimiento al rojo y la dilatación del tiempo son dos caras del mismo efecto: la luz estirada <i>es</i> tiempo ralentizado. Los colores del disco de acreción en el laboratorio lo codifican — el lado que rota hacia ti es más brillante y más azul (capítulo 10).',
            it: 'Lo spostamento verso il rosso e la dilatazione del tempo sono due facce dello stesso effetto: la luce allungata <i>è</i> tempo rallentato. I colori del disco di accrescimento nel laboratorio lo codificano — il lato che ruota verso di te è più luminoso e più blu (capitolo 10).'
          }}
        ]
      },

      // ---- 8. Gravitational lensing ----
      {
        id: 'lensing', no: 8,
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

      // ---- 9. Tidal forces & spaghettification ----
      {
        id: 'tidal', no: 9,
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

      // ---- 10. Accretion disc ----
      {
        id: 'accretion', no: 10,
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

      // ---- 11. Relativistic jets ----
      {
        id: 'jets', no: 11,
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

      // ---- 12. Gravitational waves & inspiral ----
      {
        id: 'gravitational-waves', no: 12,
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

      // ---- 13. Geodesics & orbits ----
      {
        id: 'geodesics', no: 13,
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

      // ---- 14. Charge & the Reissner-Nordstrom limit ----
      {
        id: 'charged', no: 14,
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
      }
    ]
  };
})();
