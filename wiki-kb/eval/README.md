# RAG 評估 pipeline

RAGAS 風格指標,全部在本地執行(judge = 本地 Ollama 聊天模型),
不引入 Python/RAGAS/DeepEval 依賴 —— 指標定義對齊 RAGAS,之後若要改用
真正的 RAGAS,黃金測試集(golden.jsonl)可直接沿用。

## 執行

```powershell
node eval/run-eval.mjs                    # 完整:檢索 + LLM 評審(佔用 LLM 數分鐘)
node eval/run-eval.mjs --retrieval-only   # 只算檢索指標,免 LLM,幾秒完成
node eval/run-eval.mjs --no-graph         # A/B:停用圖譜通道(對照組)
node eval/run-eval.mjs --limit 3 --k 8
node eval/run-eval.mjs --judge llama3 --answer phi4
```

結果寫入 `eval_runs` / `eval_cases`(kb.sqlite),在 kb-admin.html 的
「RAG 評估」分頁可瀏覽與逐案檢視;每次 LLM 呼叫也會進「LLM 監測」分頁。

## 指標

| 指標 | 定義 | 成本 |
|---|---|---|
| hit rate | 任一檢索頁標題命中 `expect` 清單 | 免 LLM |
| MRR | 第一個命中頁的排名倒數 | 免 LLM |
| Context Precision | 評審認定「對回答有用」的 chunk 比例 | 1 次評審呼叫 |
| Context Recall | ground truth 句子可歸因於 context 的比例 | 1 次評審呼叫 |
| Faithfulness | 答案中的 claim 被 context 支持的比例 | 2 次評審呼叫 |
| Hallucination | 1 − Faithfulness | — |

評審輸出解析不到的行一律當「no」——懶惰的評審只會拉低分數,不會灌水。

## 黃金測試集(golden.jsonl)

每行一筆:`{id, lang, question, ground_truth, expect}`。
`expect` 是檢索命中判定用的標題子字串(zh/en 都列,因為 zh 查詢會
fallback 到 en 語料)。

目前是 14 筆手寫種子(7 en / 7 zh,涵蓋黑洞/緻密星/觀測史)。

### 擴充(暫緩項目)

大規模資料集生成(例如從語料抽 100+ 題)屬於高 LLM 工作量,依指示
**暫緩**;工作流程已就緒:

1. 從 `pages` 抽樣高品質頁(zh/en 全文、有 QID)。
2. 用 LLM(上限 Opus 級模型,或本地模型夜間批次)對每頁 summary 出
   1–2 題 + ground truth。
3. 人工抽查後 append 到 golden.jsonl —— runner 與 UI 無需任何改動。
