# Astro ELF · 克爾–紐曼黑洞實驗室

> Kerr–Newman Black Hole Laboratory — 一套在瀏覽器中即時運行的互動式黑洞物理沙盒。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![No Build Step](https://img.shields.io/badge/build-none-success.svg)](#系統需求與安裝步驟)
[![React 18](https://img.shields.io/badge/React-18-149eca.svg)](https://react.dev/)

**Astro ELF** 是一個以瀏覽器為平台、零建置流程（no-build）的天體物理教學與展示專案。它在
**克爾–紐曼（Kerr–Newman）度規**的背景下，即時模擬帶電、旋轉黑洞周遭的測試粒子運動、潮汐效應、
吸積盤與相對論性噴流，並提供一個可拖曳、可調參數的視覺化儀器面板。

整個前端透過 **瀏覽器內的 Babel 即時轉譯**搭配 **React 18 UMD**（皆由 CDN 載入）運作，因此
**不需要打包工具、不需要編譯步驟**，只要一個靜態伺服器即可啟動。專案另附一個獨立、已基準測試
（benchmark）的高擬真物理核心 `full-physics/`，作為高精度計算的穩定來源。

---

## 核心功能特性

### 物理模擬
- **克爾–紐曼時空**：以質量 `M`、電荷 `Q`、自旋 `a` 為核心參數，計算外/內視界、靜止極限
  （動圈 / ergosphere）、ISCO、光子球與視界角速度等臨界面。
- **多種中心天體**：除黑洞（`bh`）外，亦支援中子星（`ns`）、白矮星（`wd`）、主序星（`ms`）。
- **相對論性增強的動力學**：在牛頓重力基礎上加入參考系拖曳（Lense–Thirring）、帶電粒子的
  庫侖交互作用，以及延展天體的潮汐應力與「拉麵化」判定。
- **吸積盤與噴流（MHD）**：α–黏滯內旋、磁旋轉不穩定性（MRI）、磁重聯閃焰，以及
  Blandford–Znajek 噴流功率、勞侖茲因子與張角等診斷指標。
- **重力波與雙星**：可放置伴星形成雙星系統，觀察重力波衰減與旋近（inspiral）。

### 互動與介面
- **天體庫拖放**：從物件庫拖入岩質行星、氣態巨行星、彗星、載人飛船、帶電探測器等，
  以彈弓式（slingshot）瞄準設定初速。
- **即時遙測與診斷**：徑向距離、比能、角動量、區域分類、潮汐本徵值與穩定性分析。
- **視覺圖層切換**：視界、動圈、ISCO、光子軌道、拖曳場、重力波、軌跡、潮汐、標籤。
- **參考系鎖定**：可將鏡頭鎖定於主星、伴星或質心（COM），或自由平移縮放。
- **響應式雙版面**：桌面版（多面板儀器台）與行動版（分頁抽屜）於執行期依視窗自動切換。
- **八國語系**：英文、繁體中文（台灣）、日文、韓文、德文、法文、西班牙文、義大利文。

### 高擬真物理核心（`full-physics/`）
- Boyer–Lindquist 座標下的完整克爾–紐曼幾何。
- 由局部 ZAMO 正交標架初始化的類時 / 類光運動。
- 透過漢米頓量 `H = ½ gᵃᵇ(Pₐ − qAₐ)(P_b − qA_b)` 描述帶電測試粒子，並以 RK4 積分。
- ISCO / 光子軌道診斷、潮汐張量、薄盤粒子初始化、噴流功率，以及單位換算與守恆量基準測試。

---

## 系統需求與安裝步驟

### 系統需求
- **[Node.js](https://nodejs.org/) 18 或以上版本** — 用於啟動靜態伺服器（`serve.mjs`）與
  執行 `full-physics/` 的基準測試／範例腳本。
- **現代瀏覽器**（Chrome、Edge、Firefox、Safari 皆可）— 需支援 ES Modules 與
  `<script type="text/babel">`。
- 無需任何打包工具或編譯步驟。

### 安裝步驟

```bash
# 1. 取得原始碼
git clone https://github.com/changweilin/astrophysics_elf.git
cd astrophysics_elf

# 2.（選用）安裝相依套件
#    執行階段 React／Babel 皆由 CDN 載入，靜態伺服器本身不需任何套件；
#    僅在需要本機 @babel/standalone 時才需要安裝。
npm install
```

---

## 快速上手與使用範例

### 啟動開發伺服器

```bash
# 預設監聽 http://127.0.0.1:5184/
npm run dev

# 或指定埠號
PORT=7000 node serve.mjs
```

啟動後於瀏覽器開啟 **http://127.0.0.1:5184/** 即可進入實驗室。
拖入一個天體、放開以放置，再從天體拖曳設定發射向量；雙擊可將其吸附至穩定圓軌道。

> `serve.mjs` 是一個僅綁定 `127.0.0.1` 的靜態檔案伺服器；對外的 HTTPS 由
> `tailscale serve` 終結（詳見 `serve.mjs` 檔頭說明）。

### 完成修改前的驗證

```bash
# 語法檢查
node --check physics.js
node --check sim.js
node --check disc.js
node --check serve.mjs

# 物理回歸基準測試（變更物理／目錄／單位／積分後務必執行）
node ./full-physics/run-benchmarks.mjs

# 冒煙測試範例
node ./full-physics/run-sample.mjs
node ./full-physics/run-object-mhd-sample.mjs
node ./full-physics/run-units-sample.mjs
```

### 直接呼叫高擬真物理核心

```js
import { KerrNewmanSimulator } from "./full-physics/kn-full-physics.mjs";

const sim = new KerrNewmanSimulator({ M: 1.5, Q: 0.2, a: 1.0, B: 0.4 });

sim.addCircularOrbit({ name: "ship", kind: "ship", r: 8, prograde: true, radius: 0.02, binding: 8 });

const frames = sim.run({ steps: 1000, stepSize: 0.02, recordEvery: 100 });
console.log(frames.at(-1));
```

### 部署
推送至 `main` 分支會透過 GitHub Actions（`.github/workflows/deploy.yml`）自動部署至
**GitHub Pages**。由於是零建置的靜態網站，工作流程僅將原始碼樹（排除工具目錄）直接發佈。

---

## 專案架構說明

```text
astrophysics_elf/
├── index.html              # 進入點：載入 CDN 依賴、依視窗挑選桌面／行動版面
├── serve.mjs               # 靜態檔案伺服器（綁定 127.0.0.1）
├── package.json            # 專案中繼資料與 npm scripts（dev / start）
│
├── physics.js              # 物理基礎：視界、動圈、ISCO… → window.KNphysics
├── sim.js                  # Canvas 渲染器 + 積分器 → window.KNSim
├── disc.js                 # MHD 吸積盤與噴流引擎 → window.KNDisc
│
├── app.jsx                 # 桌面版根元件 → window.App
├── panel-left.jsx          # 左側面板（中心天體與參數）
├── panel-right.jsx         # 右側面板（天體清單與遙測診斷）
├── panel-bottom.jsx        # 底列（天體庫、時間控制、About Me）
├── tidal-scope.jsx         # 潮汐顯微鏡視覺元件
├── mhd-monitor.jsx         # MHD／噴流監視器元件
│
├── mobile-app.jsx          # 行動版根元件 → window.MobileApp
├── mobile-panels.jsx       # 行動版分頁內容
├── ios-frame.jsx           # iOS 機身外框預覽
│
├── styles.css              # 桌面版樣式
├── mobile-styles.css       # 行動版樣式
│
├── i18n.js                 # 多語系層 → window.tr / window.trp / window.KNi18n
├── i18n-dict.js            # 八國語系字典
│
├── full-physics-bridge.mjs # 將 full-physics 核心橋接到瀏覽器（window.KNFull）
├── full-physics/           # 附加式、已基準測試的高擬真物理核心（ES modules .mjs）
│   ├── kn-full-physics.mjs       # 核心克爾–紐曼模擬器
│   ├── physics-engine.mjs        # 引擎門面（新工作的進入點）
│   ├── engine-contract.md        # 引擎介面契約
│   ├── kerr-schild-geodesics.mjs # Kerr–Schild 座標測地線與視界穿越
│   ├── tidal-tensor.mjs          # 潮汐張量
│   ├── mhd-jet-engine.mjs        # MHD 噴流診斷
│   ├── orbit-diagnostics.mjs     # ISCO／光子軌道診斷
│   ├── ray-tracing.mjs           # 光線追蹤
│   ├── radiation-models.mjs      # 輻射模型
│   ├── units.mjs                 # 單位換算
│   ├── object-library.mjs        # 物件目錄
│   ├── run-*.mjs                 # 範例與基準測試腳本
│   └── README.md                 # 核心專屬說明
│
├── logos/ · favicon.ico · site.webmanifest   # 圖示與 PWA 資源
└── .github/workflows/deploy.yml               # GitHub Pages 部署流程
```

### 架構重點
- **根目錄檔案 = 瀏覽器展示版**：純 `.js` / `.jsx`，由 `index.html` 以瀏覽器內 Babel + React
  UMD 載入，無打包工具、無建置步驟。
- **`full-physics/` = 附加式物理核心**：以 ES modules（`.mjs`）撰寫，是高精度計算的穩定來源；
  新的引擎工作應透過 `full-physics/physics-engine.mjs` 進行。
- **執行期版面切換**：`index.html` 透過 `window.__knIsMobile()` 在桌面（`window.App`）與
  行動（`window.MobileApp`）版面間即時切換，並同步替換對應樣式表。
- **全域命名空間**：引擎掛載於 `window.KNphysics`、`window.KNSim`、`window.KNDisc`，
  UI 根元件為 `window.App` 與 `window.MobileApp`。

---

## 授權條款

本專案採用 **GNU 通用公共授權條款第 3 版（GNU General Public License v3.0, GPLv3）** 釋出。

您可以自由地使用、研究、散布與修改本軟體，惟任何衍生作品在散布時必須同樣以 GPLv3
（或相容之後續版本）授權，並保留原始的版權與授權聲明。本軟體不附帶任何擔保。

授權條款全文請參閱 [GNU GPLv3 官方文本](https://www.gnu.org/licenses/gpl-3.0.html)。

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
