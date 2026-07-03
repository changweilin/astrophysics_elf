# Wiki Knowledge Base(wiki-kb)

爬取維基百科「太空 / 天文物理 / 宇宙學 / 相關學科 + 這些領域的科學家與科學史」
條目,建立**知識圖譜 + RAG 檢索庫**,並附**定期更新檢查**。與瀏覽器 demo、
`scientists-backend/` 一樣乾淨隔離:唯一的對外契約是一個小型 HTTP API。

- **零 npm 相依**:儲存用 Node 內建 `node:sqlite`(需 Node >= 22.5;本機為 v24),
  向量嵌入用本機 Ollama(與 scientists-backend 同一台 3060)。
- **語言**:繁中(zh,一律以 `zh-tw` 變體抓取)、英、日、韓、德、法、義、西。
  zh/en 為優先語言 → 走完整分類樹爬取並存**全文**;其餘六語靠 langlink 投影
  繼承同一範圍,預設只存**導言**(可用 `WKB_FULLTEXT_LANGS` 擴大)。
- **禮貌爬取**:序列請求 + 250ms 間隔、描述性 User-Agent、`maxlag=5`、退避重試。

```
crawl.mjs / check-updates.mjs ──> data/kb.sqlite <── server.mjs (:5189, standalone/admin)
      │  MediaWiki + Wikidata API                        ↑
      └─ Ollama /api/embed (bge-m3)                       │ lib/routes.mjs (shared dispatch)
                                                           │
                                    scientists-backend/server.mjs (:5188, merged -- the live app)
```

`lib/routes.mjs` holds the actual route dispatch; `server.mjs` here just wraps
it for standalone use (crawl/admin work via `kb-admin.html`, no Ollama chat
model needed). The live app talks to the merged copy in
`scientists-backend/server.mjs` instead -- see below.

## 快速開始

```powershell
ollama pull bge-m3                # 多語嵌入模型(缺了也能跑,退化為 BM25-only)

cd wiki-kb
node crawl.mjs all --limit 300    # 先小批量試跑(可重複執行、可續傳)
node crawl.mjs all                # 完整管線:discover -> fetch -> langlinks -> graph -> embed
node crawl.mjs status             # 語料統計

node kb-admin.mjs search --q "黑洞的事件視界" --langs zh,en
node server.mjs                   # http://127.0.0.1:5189
```

首次完整爬取請估計數小時(受禮貌速率限制;約 4 req/s)。所有階段都冪等且
可中斷續跑:佇列與內容雜湊都在 SQLite 裡,`--limit` 分批跑到完為止。

## 資料模型(data/kb.sqlite)

| 表 | 內容 | 更新機制 |
|---|---|---|
| `pages` | 條目全文/導言 + **metadata**:語言、QID、kind(topic/scientist/history)、URL、**來源與授權**(wikipedia, CC BY-SA 4.0)、**修訂版本 rev_id / rev_time、crawled_at / updated_at 時間戳** | rev_id 比對,變更才重抓 |
| `page_categories` | 條目的可見分類 | 隨頁面重抓 |
| `chunks` | 依章節切塊的文字 + `text_hash` + 嵌入向量 BLOB | 雜湊比對:內容沒變的段落**保留舊向量**,只重嵌入真正改過的段落 |
| `chunks_fts` | FTS5 全文索引(CJK 以字元 bigram 斷詞,中日韓可搜) | 隨 chunks 重建 |
| `entities` / `edges` | **知識圖譜**:Wikidata 實體(標籤/描述/生卒年)+ 型別化關係邊(師承 P184/P185、影響 P737、發現者 P61、instance-of P31、母天體 P397 ...) | `crawl.mjs graph` / 更新檢查時增量同步 |
| `crawl_queue` | 待抓佇列(含來源 reason:category:… / langlink:…) | 冪等 enqueue |
| `sync_log` | **營運稽核日誌**:added/updated/deleted/discover/update-check | 只增不改 |

## 混合檢索與時間衰減

`lib/retrieve.mjs`:BM25(FTS5)取前 400 候選 + 向量餘弦(語料小時全掃描、
大於 `WKB_SCAN_MAX_CHUNKS` 時只重排 BM25 候選),兩者 min-max 正規化後加權融合
(預設 0.45 / 0.55),再乘上**時間衰減因子**:

```
decay = floor + (1 - floor) * exp(-ln2 * 條目最後修訂年齡 / 半衰期)
```

預設半衰期 3 年(`WKB_DECAY_HALFLIFE_DAYS=1095`)、下限 0.6(`WKB_DECAY_FLOOR`)
—— 久未更新的條目往後排,但經典物理不會被埋掉。Ollama 不在線時自動退化為
BM25-only,檢索永不失敗。

## 定期更新檢查

```powershell
node check-updates.mjs --dry-run              # 只報告,不改資料
node check-updates.mjs --discover             # 修訂比對 + 掃新條目 + 重嵌入
.\schedule-task.ps1                           # 註冊 Windows 工作排程器,每天 03:30
.\schedule-task.ps1 -Weekly -Time "04:00"     # 或每週日
.\schedule-task.ps1 -Unregister               # 移除
```

流程:(1) 每 50 頁一批比對 `rev_id`,變更 → 重抓重切塊(未變段落保留向量),
維基上已刪除 → 軟刪除;(2) `--discover` 淺層重掃種子分類撿新條目,新頁面再做
langlink 投影;(3) 同步新 QID 的圖譜、嵌入新段落;(4) 全部寫入 `sync_log`。
日誌檔:`data\update-check.log`。

## CRUD 營運(kb-admin.mjs)

```powershell
node kb-admin.mjs stats                                   # 總覽
node kb-admin.mjs list --lang zh --kind scientist         # 查詢(C/R)
node kb-admin.mjs get --lang zh --title "史蒂芬·霍金" --chunks
node kb-admin.mjs add --lang en --title "Kerr metric"     # 手動收錄(C)
node kb-admin.mjs refresh --id 12                         # 強制重抓(U)
node kb-admin.mjs delete --id 12          # 軟刪除(D;--hard 徹底清除)
node kb-admin.mjs reembed                 # 補嵌入(--all 全部重嵌)
node kb-admin.mjs entity --qid Q937       # 愛因斯坦的實體 + 關係邊
node kb-admin.mjs graph --qid Q937 --depth 2
node kb-admin.mjs export --out corpus.jsonl --lang zh     # 匯出(可餵微調)
node kb-admin.mjs log --limit 50          # 同步稽核日誌
node kb-admin.mjs vacuum
```

## HTTP API(server.mjs,:5189)

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/health` | 存活 + 語料計數 + 嵌入模型狀態 |
| GET | `/api/stats` | 完整統計 |
| GET | `/api/search?q=&langs=zh,en&k=8&kind=` | 混合檢索結果(含分數/衰減/來源) |
| GET | `/api/context?q=&lang=zh&maxChars=1500` | 可直接注入 prompt 的引用區塊(含標題/語言/修訂日期) |
| GET/POST/DELETE | `/api/page` | 條目 CRUD(POST `{lang,title,force}` 收錄;DELETE `?id=&hard=1`) |
| GET | `/api/entity?qid=` | 知識圖譜實體(出邊/入邊/對應條目) |
| GET | `/api/graph?qid=&depth=` | 子圖(給視覺化用) |

### 接上 Scientists 聊天後端

KB 已經**合併進 `scientists-backend/server.mjs`**(:5188)同一個行程 ——
`lib/routes.mjs` 的路由分派同時被這裡的 `server.mjs`(獨立執行,給
`kb-admin.html` 與爬蟲/管理用)與 `scientists-backend/server.mjs`(合併執行,
給正式站用)引用。開啟 RAG 只需要:

```powershell
$env:SCI_WIKI_RAG = "1"
npm run dev:all
```

不用再另開終端跑 `wiki-kb/server.mjs`,也不用設定 `SCI_WIKI_KB_URL` —— 兩邊
現在共用同一個行程與同一顆 `data/kb.sqlite`(WAL 模式,兩個連線並存沒問題)。
`scientists-backend/knowledge/wiki.mjs` 會**先問本地 KB**(直接呼叫
`lib/retrieve.mjs`,不再走 HTTP),任何錯誤或空結果都退回原本的線上維基路徑
—— fail-open,聊天永不因 KB 掛掉而中斷。

若只是要做爬蟲/管理工作(`kb-admin.html`、`npm run kb:crawl` 等),不需要
Ollama 聊天模型跑起來,仍然可以獨立執行 `npm run kb:serve`(:5189)。

## 範圍與擴充

種子分類與排除規則在 `lib/seeds.mjs`(排除科幻/影視/遊戲/音樂/占星/列表/
消歧義等)。不改程式碼即可擴充:

```powershell
$env:WKB_EXTRA_SEEDS  = "en|Category:Radio astronomy|2;zh|Category:射电天文学|2"
$env:WKB_EXCLUDE_EXTRA = "(pattern|to|exclude)"
```

主要環境變數(完整見 `config.mjs`):`WKB_DB`、`WKB_LANGS`、`WKB_PRIORITY_LANGS`、
`WKB_FULLTEXT_LANGS`、`WKB_MAX_PAGES_PER_LANG`、`WKB_EMBED_MODEL`、`WKB_OLLAMA_URL`、
`WKB_TOP_K`、`WKB_W_BM25`/`WKB_W_VEC`、`WKB_DECAY_HALFLIFE_DAYS`、`WKB_DECAY_FLOOR`、
`WKB_PORT`。

## 驗證

```powershell
npm run check        # node --check 所有模組
```

內容授權:維基百科文字為 **CC BY-SA 4.0**,每筆 `pages` 都記錄來源與授權欄位;
對外展示時請保留出處(`/api/context` 的引用頭已含標題與修訂日期)。
