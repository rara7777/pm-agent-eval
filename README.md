# pm-agent-eval

一隻**需求釐清 agent**，以及用來驗收它的 eval。

agent 吃需求方丟來的雜亂 ticket，產出結構化的 ticket，並標出 AC（acceptance criteria）裡有問題的那幾條。
eval 的部分回答的是：**改了一行 prompt 之後，怎麼確定它還是對的。**

這個 repo 是 2026 iThome 鐵人賽系列〈30 天 AI eval 實戰〉的實作。文章只貼片段，
完整的檔案一律用帶 commit SHA 的 permalink 連過來。

## 跑起來

實測環境 **node v26.8.1**。node 原生執行 `.ts` 並內建 `node:test`，
所以**沒有 build step**，沒有 bundler，也沒有第三方 test runner。

```bash
npm install
npm test          # 跑測試
npm run typecheck # tsc --noEmit
```

真的驅動 agent 需要一個 OpenAI 相容的端點（OpenAI 或 ollama 都可以）。
複製 `.env.example` 成 `.env` 並填三個變數：

| 變數 | 說明 |
|---|---|
| `LLM_BASE_URL` | 例 `https://api.openai.com/v1` 或 `http://localhost:11434/v1` |
| `LLM_API_KEY` | ollama 給任意非空值即可 |
| `LLM_MODEL` | 單一模型名 |

## 目錄

| 目錄 | 內容 |
|---|---|
| `src/agent/` | agent loop、7 個 tool 的定義與 schema |
| `src/store/` | `TicketStore` 介面與本機假 store |
| `src/scorer/` | goal state 比對 |
| `dataset/` | 一筆一檔的 case：輸入原文、來源、類別、goal state |
| `runs/` | 每次跑的分數與 trajectory |

## 這隻 agent

7 個工具，依**可重跑性**分兩層：

- **對外查資料**（非決定性，之後錄成 fixture 重播）：`search_web`、`read_docs`、`search_repo`、`query_db`
- **寫回卡上**（有狀態，打本機假 store）：`update_ticket`、`replace_acceptance_criteria`、`post_comment`

四個步驟：拆 description → 查背景 → 逐條檢查 AC → 寫回去。
整理後的卡有四個區塊：Goal、Scope in、Scope out、AC 標註。
三類 AC 問題：彼此衝突（`conflict`）、無法驗證（`unverifiable`）、與描述不符（`mismatch`）。

## 目前實作到哪

| 已經有的 | 對應到哪一天 |
|---|---|
| `dataset/ac-conflict-001.yaml` 的輸入本體 | Day 9 |

尚未實作：agent loop、7 個 tool、假 store、goal state scorer、fixture 錄放（Day 11）、
`RedmineStore`（Day 25）。

## 資料

`dataset/` 裡的內容全部是合成的。真實 ticket 在進入這個 repo 之前一律換掉專案名、人名、
產品詞與數字，原文留在本機的 `raw/`（已被 gitignore，永遠不進 repo）。

## 授權

MIT
