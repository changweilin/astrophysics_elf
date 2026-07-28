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

npm run eval:baseline                     # 凍結目前的檢索基準線(baseline.json)
npm run eval:ab -- no-graph               # 配對 A/B + 顯著性(EVAL3,見下)
npm run eval:gate                         # 阻斷式回歸閘門(EVAL1b,見下)
```

不含 `--gate` 時,退出碼永遠是 0 —— 基準線比較只是報告。

## 配對 A/B 與信賴區間(EVAL3)

黃金測試集只有 69 筆。這個規模下,單看「MRR 0.688 → 0.694」是沒有資訊的:
現行 `rrfK=10` 當初就是拿 0.780 對 0.786 決定的,而那個差距完全在抽樣雜訊裡。
`eval/stats.mjs` 讓每個旋鈕的變動可以被「判定」,而不是被「目測」:

- 每次執行都會在 hitRate/MRR(整體與各 slice)旁印出 **bootstrap 95% 信賴
  區間**。11 筆的 slice 和 69 筆的整體都會給出一個 MRR,只有區間能說明
  哪一個撐得起結論。
- `--ab <variant>` 會用**同一份資料集、同一個順序**再跑一輪對照組,然後逐案
  **配對**比較。配對很重要:此處變異數主要來自「案例本身難易」(paraphrase
  案例對任何設定都難),配對後這一項會被消掉。
- 判定標籤(`negligible` 預設 0.01,約一個 rank-step):

| 標籤 | 意義 |
|---|---|
| `improved` / `regressed` | 差異的信賴區間**不含 0** —— 效果是真的 |
| `no-effect` | 整個區間落在 ±negligible 內 —— **已排除**有意義的變化 |
| `need-more-cases` | 區間含 0 但超出 ±negligible —— 未定案;會一併印出需要多少筆案例才能定案 |

第三個標籤才是重點:今天一次邊際的 sweep 會被讀成「沒變化」,實際上是
「在 n=69 下量不出來」。

可用的 variant:`no-graph`、`qroute`、`fusion=weighted`、`rrf-k=60`、`k=12`。
`--ab` 只在 `--retrieval-only` 下可用(配對的評審跑會讓 LLM 成本翻倍)。

## 回歸閘門(EVAL1b)

`node eval/run-eval.mjs --retrieval-only --gate` 會改變退出碼:

| 退出碼 | 意義 |
|---|---|
| 0 | 沒有超出容差的回歸 |
| 1 | 有回歸 —— 這是唯一的「失敗」 |
| 2 | **無法判定**,不予裁決(見下) |

容差不再是手挑的 0.005:每個 scope 的容差取自 baseline.json 中**該 scope 自己
的 bootstrap 區間寬度的一半**(下限 `WKB_EVAL_GATE_MIN_TOL`)。所以 11 筆的
slice 被允許照它實際的抖動幅度抖,而 69 筆的整體指標則被抓得很緊。

退出碼 2(不予裁決,而不是判定失敗)發生在:

- **Ollama 不可用** —— 嵌入模型連不上時向量通道會靜默退化成 BM25-only,
  所有差值都是假訊號。閘門會先 ping `/api/tags` 再決定要不要裁決。
- **執行設定與 baseline 不同**(fusion/rrfK/graph/k/cases)——不是同一把尺。
- **沒有 baseline.json**。

會誤判的閘門比沒有閘門更糟,所以這三種情況一律拒絕裁決。

結果寫入 `eval_runs` / `eval_cases`(kb.sqlite),在 kb-admin.html 的
「RAG 評估」分頁可瀏覽與逐案檢視;每次 LLM 呼叫也會進「LLM 監測」分頁。

## 指標

| 指標 | 定義 | 成本 |
|---|---|---|
| hit rate | 任一檢索頁命中案例的 ground truth(見下)| 免 LLM |
| MRR | 第一個命中頁的排名倒數 | 免 LLM |
| Context Precision | 評審認定「對回答有用」的 chunk 比例 | 1 次評審呼叫 |
| Context Recall | ground truth 句子可歸因於 context 的比例 | 1 次評審呼叫 |
| Faithfulness | 答案中的 claim 被 context 支持的比例 | 2 次評審呼叫 |
| Hallucination | 1 − Faithfulness | — |

評審輸出解析不到的行一律當「no」——懶惰的評審只會拉低分數,不會灌水。

retrieval 指標另外依 `slices`(golden 的 `tags` + 語言 + QROUTE 的 `route:*`)
分組輸出,所以 paraphrase / multi-hop 子集的 hitRate/MRR 可以和 single-hop
基準分開讀 —— 這正是量測語意召回缺口(RET3)與圖譜通道(KG1)的依據。

## 黃金測試集(golden.jsonl)

每行一筆:`{id, lang, question, ground_truth, expect, expect_qids?, tags?}`。

- `expect_qids`(權威):命中判定用的 **qid 級** ground truth。一個概念的
  zh/en 頁共用同一個 qid,所以這是語言無關且無歧義的信號;有此欄時
  hit/MRR 以 qid 比對。
- `expect`(fallback / 舊版):標題子字串清單(zh/en 都列)。只有在
  `expect_qids` 缺席時才用它做子字串比對,舊種子案例因此不受影響。
- `tags`(選填):評估切片,如 `single-hop` / `multi-hop` / `relational` /
  `graph` / `paraphrase`。`paraphrase` 案例刻意避開目標頁標題用字,用來
  暴露 BM25-only / rerank-only 的語意召回缺口。

目前 69 筆(37 en / 32 zh):14 筆原始手寫種子 + 55 筆語料實證擴充,
每筆的 `expect_qids` 都經 `pages` 表驗證存在。新增案例請沿用同一結構,
`id`/欄位名維持 ASCII,`expect_qids` 需對得上語料中 status='active' 的頁。
