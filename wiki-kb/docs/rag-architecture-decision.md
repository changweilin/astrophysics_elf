# 進階 RAG 架構選型:GraphRAG vs LightRAG vs HippoRAG

日期:2026-07-08
狀態:已定案並實作(`lib/graph-rank.mjs` + `lib/retrieve.mjs` 圖譜通道)

## 專案場景約束

- 語料:110k+ Wikipedia 頁面、數十萬 chunks(zh/en 全文,其餘 6 語 intro)。
- **知識圖譜已存在**:Wikidata 同步的 `entities`(110k+)與 `edges`(師承、影響、
  天體從屬等型別化關聯),品質高於任何 LLM 自動抽取。
- 運算資源:本地 RTX 3060 + Ollama 8B 級模型;LLM 吞吐是最稀缺資源
  (聊天、翻譯、生成共用一個 busy gate)。
- 工程約束:node:sqlite 零依賴、無 Python、無向量資料庫、無 Docker。
- 查詢型態:單點事實/概念問答(家教式聊天),少有「整個語料庫的全域主題
  總結」需求。

## 三者比較

| | GraphRAG (Microsoft) | LightRAG | HippoRAG |
|---|---|---|---|
| 索引方式 | LLM 對每個 chunk 抽實體+關係,Leiden 社群偵測,LLM 寫社群摘要 | LLM 對每個 chunk 抽關鍵詞/實體建圖 | 離線 KG(原版用 OpenIE 抽)+ 查詢時 PPR |
| 索引 LLM 成本 | 每 chunk ≥1 次呼叫 + 摘要(**本地 8B 需數週**) | 每 chunk 1 次呼叫(同樣不可行) | **0 —— 圖已由 Wikidata 提供** |
| 查詢時成本 | 高(map-reduce 過社群摘要) | 中(LLM 抽查詢關鍵詞) | 低(實體連結 + PPR,純計算) |
| 強項 | 全域式「這個語料庫在講什麼」問題 | 輕量雙層(實體/主題)檢索 | 多跳事實關聯(sense-making 單點問答) |
| 與現有系統的疊合 | 需重建整套索引 | 需重建圖 | **直接複用 entities/edges** |

## 結論:HippoRAG 式圖增強檢索

決定性理由:HippoRAG 的離線知識圖譜這一步,本專案已經用 Wikidata 做完了
(而且是人工策展品質,勝過 OpenIE/LLM 抽取)。剩下要補的只有查詢時的兩件事:

1. **實體連結**(query → 圖上節點):查詢 n-gram 對實體標籤匹配 + 混合檢索
   Top-N 命中頁的 QID 作為種子。
2. **Personalized PageRank**(damping ≈ 0.5,同 HippoRAG 論文):在記憶體
   鄰接表上做有界冪迭代,讓與種子 1–2 跳相連的頁面得分上浮。

融合方式(`retrieve.mjs`):

- 候選 chunk 的最終分數 `score *= 1 + wGraph × g`(g 為 min-max 正規化的
  PPR 分數)。乘法式加成 → 沒有 QID 的手動筆記排序完全不受影響,
  `WKB_W_GRAPH=0` 可整體停用(fail-open,任何錯誤都退回純混合檢索)。
- **多跳擴充**(吸收 LightRAG 的 dual-level 概念):PPR 高分但不在
  BM25/向量候選中的頁面,拉入至多 `graphExpandPages`(預設 2)個代表
  chunk —— 這是詞彙/向量通道天生看不到的多跳關聯內容。

新增設定(`config.mjs → retrieve`):`wGraph`、`graphSeedPages`、
`graphExpandPages`、`graphExpandScore`、`pprAlpha`、`pprIters`,
全部可用 `WKB_*` 環境變數覆寫。

## 驗證方式

`eval/run-eval.mjs` 支援 `--no-graph` A/B:同一黃金測試集分別跑圖譜通道
開/關,比較 hit rate / MRR(免 LLM)與 Context Precision/Recall、
Faithfulness(LLM 評審)。結果存 `eval_runs`,可在 kb-admin.html
「RAG 評估」分頁對照。

## 未採納方案的保留價值

- GraphRAG 的社群摘要:若未來出現「幫我總結整個相對論知識域」這類全域
  需求,可對 `entities.category` 子樹做離線摘要,以夜間批次跑本地 LLM,
  不需要 GraphRAG 全套。
- LightRAG 的查詢關鍵詞抽取:若實體連結召回不足,可加一次輕量 LLM 呼叫
  抽查詢實體,插進 `graph-rank.mjs` 的種子集合即可(介面已預留 `seedQids`)。
