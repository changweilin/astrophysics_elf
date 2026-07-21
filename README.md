# Astro ELF · 克爾–紐曼黑洞實驗室

> **Kerr–Newman Black Hole Laboratory** — a zero-build, browser-native astrophysics
> sandbox that simulates charged, spinning black holes in real time, paired with a
> teaching library, an AI scientist roundtable, and an offline knowledge base.
>
> 一套零建置、在瀏覽器中即時運行的天體物理沙盒：即時模擬帶電、旋轉黑洞，並結合教學圖書館、
> AI 科學家對談與離線知識庫。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](#授權條款--license)
[![Build: none](https://img.shields.io/badge/build-none-success.svg)](#系統需求與安裝步驟--prerequisites--installation)
[![React 18](https://img.shields.io/badge/React-18-149eca.svg)](https://react.dev/)
[![Node ≥ 18](https://img.shields.io/badge/Node-%E2%89%A518-339933.svg)](https://nodejs.org/)

---

## 專案簡介 · Overview

**Astro ELF** is a browser-based physics education and demonstration project built
around the **Kerr–Newman metric**. It simulates test-particle motion, tidal effects,
accretion discs, and relativistic jets around charged, rotating black holes in real
time, through a draggable, fully parameterized instrument panel.

The front end runs on **in-browser Babel** transpilation with **React 18 UMD** (both
loaded from a CDN), so there is **no bundler and no build step** — a static file
server is all you need. The project ships four cooperating parts: the browser demo,
an additive high-fidelity physics core (`full-physics/`), a local-LLM scientist
backend (`scientists-backend/`), and a Wikipedia-derived knowledge base (`wiki-kb/`).

**Astro ELF** 以**克爾–紐曼（Kerr–Newman）度規**為核心，在瀏覽器中即時模擬帶電、旋轉黑洞
周遭的測試粒子運動、潮汐效應、吸積盤與相對論性噴流，並提供一個可拖曳、可調參數的視覺化儀器
面板。前端透過**瀏覽器內 Babel 即時轉譯**搭配 **React 18 UMD**（皆由 CDN 載入）運作，
因此**不需要打包工具、不需要編譯步驟**，只要一個靜態伺服器即可啟動。專案由四個協作模組組成：
瀏覽器展示版、附加式高擬真物理核心（`full-physics/`）、本機 LLM 科學家後端
（`scientists-backend/`），以及維基百科知識庫（`wiki-kb/`）。

### 頁面總覽 · Pages

| Page · 頁面 | Path · 路徑 | Purpose · 用途 |
|---|---|---|
| Black Hole Lab · 黑洞實驗室 | `index.html` | 主模擬沙盒 / the main simulation sandbox |
| Library · 圖書館 | `library.html` | 雙語教學課程 + 知識圖譜 / bilingual course + knowledge graph |
| Scientists · 科學家對談 | `scientists.html` | AI 物理學家問答與圓桌 / AI physicist chat & roundtable |
| Scientist Profile · 科學家介紹 | `scientist.html` | 科學家檔案頁 / individual scientist profiles |
| KB Admin · 知識庫管理 | `kb-admin.html` | 爬取／監測（直連 URL）/ crawl & monitoring (direct-URL only) |

---

## 核心功能特性 · Features

### 物理模擬 · Physics simulation
- **克爾–紐曼時空 / Kerr–Newman spacetime** — 以質量 `M`、電荷 `Q`、自旋 `a` 為核心參數，
  計算外／內視界、靜止極限（動圈 / ergosphere）、ISCO、光子球與視界角速度等臨界面。
- **多種中心天體 / Central object types** — 黑洞（`bh`）、中子星（`ns`）、白矮星（`wd`）、
  主序星（`ms`）；殘骸依太陽質量自動分類。
- **相對論性增強動力學 / Relativistic dynamics** — 在牛頓重力基礎上加入參考系拖曳
  （Lense–Thirring）、帶電粒子庫侖交互作用，以及延展天體的潮汐應力與「拉麵化」判定。
- **吸積盤與噴流（MHD）/ Accretion disc & jets** — α–黏滯內旋、磁旋轉不穩定性（MRI）、
  磁重聯閃焰，以及 Blandford–Znajek 噴流功率、勞侖茲因子與張角等診斷指標。
- **重力波與雙星 / Gravitational waves & binaries** — 放置伴星形成雙星系統，觀察重力波衰減
  與旋近（inspiral）；亦支援星系／星團合併與 N 體演化情境。
- **重力透鏡 / Gravitational lensing** — 由 Web Worker 離線計算的偏折場，帶動星空扭曲。

### 高擬真物理核心 · High-fidelity core (`full-physics/`)
- Boyer–Lindquist 座標下的完整克爾–紐曼幾何 / full Kerr–Newman geometry.
- 由局部 ZAMO 正交標架初始化的類時／類光運動 / timelike & null init from a local ZAMO frame.
- 帶電測試粒子以漢米頓量 `H = ½ gᵃᵇ(Pₐ − qAₐ)(P_b − qA_b)` 描述，並以 RK4／自適應積分器求解。
- ISCO／光子軌道診斷、潮汐張量、Kerr–Schild 視界穿越、薄盤初始化、噴流功率、單位換算與
  守恆量基準測試 / diagnostics, tidal tensors, horizon crossing, benchmarks.

### AI 科學家對談 · AI scientist backend (`scientists-backend/`)
- 以本機 [Ollama](https://ollama.com) 扮演知名物理學家與天文學家（Einstein、Feynman、
  Hawking、Chandrasekhar、Vera Rubin…）/ roleplays famous physicists via a local LLM.
- **依語言切換模型 / per-language model switch**：繁中 `llama-3-taiwan-8b`、英文 `phi4`，
  未安裝時自動退回本機現有最強模型。
- 自動指派專家、後續問題建議、多科學家圓桌對談、70% 上下文自動摘要重啟。

### 教學與知識 · Teaching & knowledge
- **雙語圖書館 / Bilingual library** — 課程文章與知識圖譜互相連動，`?demo=<id>` 可從章節
  一鍵載入對應模擬情境。
- **維基知識庫 / Wiki knowledge base** (`wiki-kb/`) — 以 Node 內建 `node:sqlite` 建立的
  Wikipedia 爬蟲 + 知識圖譜 + 混合（BM25 + 向量）RAG 檢索庫，離線供 RAG 使用。

### 介面與體驗 · Interface & UX
- **天體庫拖放 / Drag-and-drop catalog** — 拖入岩質行星、氣態巨行星、彗星、飛船、帶電探測器，
  以彈弓式（slingshot）瞄準設定初速。
- **即時遙測 / Live telemetry** — 徑向距離、比能、角動量、區域分類、潮汐本徵值與穩定性分析。
- **3D / 2D 渲染 / Renderers** — 桌面預設 WebGL 3D（Three.js），並保留 Canvas2D 作為
  小視窗與行動版的後備路徑。
- **響應式雙版面 / Responsive layouts** — 桌面（多面板儀器台）與行動（分頁抽屜）於執行期
  依視窗自動切換。
- **八國語系 / Eight locales** — 英文、繁體中文（台灣）、日文、韓文、德文、法文、西班牙文、
  義大利文。

---

## 系統需求與安裝步驟 · Prerequisites & Installation

### 系統需求 · Prerequisites

| Component · 元件 | Requirement · 需求 | Notes · 說明 |
|---|---|---|
| **Node.js** | ≥ 18（靜態伺服器 / static server & benchmarks） | `wiki-kb/` 使用 `node:sqlite`，需 **≥ 22.5**（本機為 v24）。 |
| **瀏覽器 / Browser** | 現代瀏覽器 / any modern browser | 需支援 ES Modules 與 `<script type="text/babel">`。 |
| **Ollama**（選用 / optional） | 執行科學家對談時 / for the Scientists page | 僅 `scientists-backend/` 與知識庫嵌入需要。 |

> 核心黑洞實驗室**無需任何打包工具或編譯步驟**；AI 科學家後端與知識庫為選用的進階模組。
> The core lab needs **no bundler or build step**; the AI backend and KB are optional add-ons.

### 安裝步驟 · Installation

```bash
# 1. 取得原始碼 / clone the repository
git clone https://github.com/changweilin/astrophysics_elf.git
cd astrophysics_elf

# 2.（選用）安裝相依套件 / (optional) install dependencies
#    執行階段 React／Babel 由 CDN 載入，靜態伺服器本身不需任何套件；
#    僅在需要本機 @babel/standalone 時才安裝。
#    React/Babel load from a CDN at runtime; install only for a local @babel/standalone.
npm install
```

---

## 快速上手與使用範例 · Quick Start / Usage

### 1. 啟動實驗室 · Launch the lab

```bash
# 預設監聽 http://127.0.0.1:5184/ · defaults to http://127.0.0.1:5184/
npm run dev

# 或指定埠號 · or set a custom port
PORT=7000 node serve.mjs
```

於瀏覽器開啟 **http://127.0.0.1:5184/** 即可進入實驗室。拖入一個天體、放開以放置，再從天體
拖曳設定發射向量；雙擊可將其吸附至穩定圓軌道。
Open **http://127.0.0.1:5184/** — drag in an object, release to place it, then drag from
it to set the launch vector; double-click to snap it into a stable circular orbit.

> `serve.mjs` 是一個僅綁定 `127.0.0.1` 的靜態檔案伺服器；對外的 HTTPS 由 `tailscale serve`
> 終結（詳見 `serve.mjs` 檔頭說明）。/ `serve.mjs` binds to `127.0.0.1`; public HTTPS is
> terminated by `tailscale serve`.

### 2. 啟動完整 AI 堆疊 · Run the full AI stack（選用 / optional）

需要科學家對談時，先安裝並拉取 Ollama 模型，再以單一指令同時啟動靜態頁面與 LLM 後端。
For the Scientists page, install Ollama and pull the models, then start both servers at once.

```bash
# 安裝 Ollama（https://ollama.com）後拉取模型 / pull models after installing Ollama
ollama pull jcai/llama-3-taiwan-8b-instruct:q4_k_m   # 繁體中文 / Traditional Chinese
ollama pull phi4                                     # 英文 / English (或 qwen3:8b)

# 同時啟動靜態頁面 (5184) + LLM 後端 (5188) / start page + backend together
npm run dev:all
# 開啟 http://127.0.0.1:5184/scientists.html （Ctrl+C 同時停止兩者）
```

分開執行 / run separately： `npm run dev:api`（僅後端 / backend only）。
細節與行動裝置（Tailscale）設定見 [`scientists-backend/README.md`](scientists-backend/README.md)。

### 3. 建立知識庫 · Build the knowledge base（選用 / optional）

```bash
ollama pull bge-m3            # 多語嵌入模型 / multilingual embeddings (缺了也能跑 → BM25-only)
npm run kb:crawl             # 完整爬取管線 / full crawl pipeline (可續傳 / resumable)
npm run kb:stats             # 語料統計 / corpus stats
npm run kb:serve             # 獨立管理伺服器 :5189 / standalone admin server
```

詳見 [`wiki-kb/README.md`](wiki-kb/README.md)。

### 4. 直接呼叫高擬真物理核心 · Call the physics core directly

```js
import { KerrNewmanSimulator } from "./full-physics/kn-full-physics.mjs";

const sim = new KerrNewmanSimulator({ M: 1.5, Q: 0.2, a: 1.0, B: 0.4 });

sim.addCircularOrbit({ name: "ship", kind: "ship", r: 8, prograde: true, radius: 0.02, binding: 8 });

const frames = sim.run({ steps: 1000, stepSize: 0.02, recordEvery: 100 });
console.log(frames.at(-1));
```

### 5. 完成修改前的驗證 · Verify before finishing

```bash
# 語法檢查 / syntax check
node --check physics.js && node --check sim.js && node --check disc.js && node --check serve.mjs

# 完整測試 + 物理回歸基準 / full test suite + physics regression benchmarks
npm test

# 個別冒煙測試 / individual smoke samples
node ./full-physics/run-sample.mjs
node ./full-physics/run-object-mhd-sample.mjs
node ./full-physics/run-units-sample.mjs
```

> 變更物理／目錄／單位／積分後，務必執行 `node ./full-physics/run-benchmarks.mjs`（已包含於
> `npm test`）。/ Always run the physics benchmarks after any physics, catalog, unit, or
> integration change (already part of `npm test`).

### 6. 部署 · Deployment

推送至 `main` 分支會透過 GitHub Actions（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）
自動部署至 **GitHub Pages**。由於是零建置的靜態網站，工作流程僅將原始碼樹（排除工具目錄）直接發佈。
Pushing to `main` auto-deploys the static site to **GitHub Pages**; the workflow publishes the
source tree verbatim (tooling directories excluded) since there is no build step.

---

## 專案架構說明 · Project Structure

```text
astrophysics_elf/
├── index.html              # 進入點：載入 CDN 依賴、依視窗挑選桌面／行動版面
├── serve.mjs               # 靜態檔案伺服器（綁定 127.0.0.1）
├── dev-all.mjs             # 同時啟動靜態頁面 + LLM 後端
├── package.json            # 專案中繼資料與 npm scripts
│
├── physics.js              # 物理基礎：視界、動圈、ISCO…      → window.KNphysics
├── sim.js                  # 模擬迴圈 + 積分器 + 座標轉換       → window.KNSim
├── disc.js                 # MHD 吸積盤與噴流引擎               → window.KNDisc
├── render.js               # Canvas2D 渲染器（後備 / 行動版）
├── render3d.mjs            # WebGL 3D 渲染器（桌面預設）        → window.KNRender3D
├── lensing.js              # 重力透鏡 Worker 橋接               → window.KNLensing
│
├── app.jsx                 # 桌面版根元件                      → window.App
├── panel-left/right/bottom.jsx   # 桌面面板（參數 / 遙測 / 天體庫）
├── tidal-scope.jsx · mhd-monitor.jsx · field-profile.jsx · observer-view.jsx
├── mobile-app.jsx · mobile-panels.jsx · ios-frame.jsx        → window.MobileApp
│
├── i18n.js · i18n-dict.js  # 多語系層與八國語系字典            → window.tr / window.KNi18n
├── styles.css · mobile-styles.css · page-nav.css
│
├── library.html · library.js · library-content.js · kg-view.js   # 教學圖書館 + 知識圖譜
├── scientists.html · scientists.jsx · scientists-data.mjs        # AI 科學家對談前端
├── scientist.html · scientist-page.mjs                           # 科學家介紹頁
├── kb-admin.html · kb-admin.js                                   # 知識庫管理（直連 URL）
│
├── full-physics-bridge.mjs # 將 full-physics 核心橋接到瀏覽器  → window.KNFull
├── full-physics/           # 附加式、已基準測試的高擬真物理核心（ES modules .mjs）
│   ├── kn-full-physics.mjs       # 核心克爾–紐曼模擬器
│   ├── physics-engine.mjs        # 引擎門面（新工作的進入點）
│   ├── engine-contract.md        # 引擎介面契約
│   ├── kerr-schild-geodesics.mjs · tidal-tensor.mjs · mhd-jet-engine.mjs
│   ├── orbit-diagnostics.mjs · ray-tracing.mjs · radiation-models.mjs
│   ├── binary-inspiral.mjs · adaptive-integrator.mjs · units.mjs
│   ├── run-*.mjs                 # 範例與基準測試腳本
│   └── README.md                 # 核心專屬說明
│
├── scientists-backend/     # 本機 LLM（Ollama）科學家後端；REST/SSE API :5188
│   ├── server.mjs · config.mjs · personas/ · knowledge/ · lib/
│   └── README.md
│
├── wiki-kb/                # Wikipedia 爬蟲 + 知識圖譜 + 混合 RAG（node:sqlite）:5189
│   ├── crawl.mjs · server.mjs · kb-admin.mjs · lib/ · eval/
│   └── README.md
│
├── test/                   # physics / interaction / pace-fit / render-smoke / n-body 測試
├── vendor/                 # 內嵌 Three.js（無 CDN 依賴）
└── .github/workflows/deploy.yml   # GitHub Pages 部署流程
```

### 架構重點 · Architecture notes
- **根目錄檔案 = 瀏覽器展示版 / Root files = the browser demo**：純 `.js` / `.jsx`，由
  `index.html` 以瀏覽器內 Babel + React UMD 載入，無打包工具、無建置步驟。
- **`full-physics/` = 附加式物理核心 / additive physics core**：以 ES modules（`.mjs`）撰寫，
  是高精度計算的穩定來源；新的引擎工作應透過 `full-physics/physics-engine.mjs` 進行。
- **乾淨隔離的後端 / cleanly isolated backends**：`scientists-backend/` 與 `wiki-kb/` 與
  瀏覽器 demo **不共用程式碼**，唯一契約是各自的小型 HTTP API。
- **執行期版面切換 / runtime layout switch**：`index.html` 透過 `window.__knIsMobile()` 在
  桌面（`window.App`）與行動（`window.MobileApp`）版面間即時切換，並同步替換樣式表。
- **全域命名空間 / global namespaces**：引擎掛載於 `window.KNphysics`、`window.KNSim`、
  `window.KNDisc`、`window.KNRender3D`；UI 根元件為 `window.App` 與 `window.MobileApp`。

---

## 授權條款 · License

本專案採用 **GNU 通用公共授權條款第 3 版（GNU General Public License v3.0, GPLv3）** 釋出。
This project is released under the **GNU General Public License v3.0 (GPLv3)**.

您可以自由地使用、研究、散布與修改本軟體，惟任何衍生作品在散布時必須同樣以 GPLv3（或相容之
後續版本）授權，並保留原始的版權與授權聲明。本軟體不附帶任何擔保。
You may use, study, share, and modify this software; any distributed derivative work must also
be licensed under GPLv3 (or a compatible later version) and retain the original copyright and
license notices. The software comes with no warranty.

授權條款全文請參閱 [GNU GPLv3 官方文本](https://www.gnu.org/licenses/gpl-3.0.html) /
see the [full license text](https://www.gnu.org/licenses/gpl-3.0.html).

```
Copyright (C) 2026 Chang Wei Lin

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
```
