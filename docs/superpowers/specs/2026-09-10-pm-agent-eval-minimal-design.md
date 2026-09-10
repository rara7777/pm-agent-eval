# pm-agent-eval 最小可跑版 —— 設計

日期：2026-09-10
依據：`~/dev/my-works/ironman2026/notes/agent-brief.md`、`notes/facts.md`、已發布的 `articles/day02`／`day04`、草稿 `day09`／`day10`／`day11`
決定確認：已與 ironman2026 寫作 session 逐條核對（五條全同意，含三項修正，見下方「與文章的對應」）

## 目標

09-09／10 那格的「醜但能動」：repo 骨架、`FakeStore`、agent loop、7 個 tool（唯讀四個先固定回傳）、
優惠碼那張卡、goal state scorer 跑出第一份 diff。只跑一張卡，只呼叫一種模型。

不在這一版：`RedmineStore`、合成化腳本、fixture 錄放、precision／recall、成本與延遲計量。

## 已定案的五條

| # | 決定 | 理由 |
|---|---|---|
| 1 | LLM 走 `LlmClient` 介面，第一個實作打 OpenAI 相容 `/v1/chat/completions` | token 可能是 ollama 或 openai；不綁廠商，`fetch` 直打零依賴 |
| 2 | AC 標註由 `update_ticket` 寫回；`replace_acceptance_criteria` 只覆寫 AC 原文 | 標註若算 AC 的一部分，每跑一筆都撞 gate，Day 22「第一次真的被擋下來」就從事件變成常態 |
| 3 | 三類 AC 問題用英文 enum `conflict`／`unverifiable`／`mismatch`；五類 category 也用英文 id | 中文只在報表映射回去；順帶避開 Day 2 已發布的「無法驗證／不可驗證」兩種寫法 |
| 4 | case 檔用 YAML，一筆一檔 | 輸入本體是整張卡多行原文；手標 20+ 筆時 JSON 的 `\n` 逃脫字串讀不動、改一字 diff 整行紅 |
| 5 | `exact_set` 就是字串相等（正規化只做 trim／全形半形／連續空白） | 期望值住在 dataset，不寫進判定程式；容忍度一旦進 scorer，鬆緊改了不會留紀錄 |

「壞輸入」一詞已廢，code、註解、README 一律不得出現 bad input 或其直譯。

## 架構

```
src/
  llm/client.ts          LlmClient 介面：chat(messages, tools) → { text, toolCalls }
  llm/openai-compat.ts   fetch /v1/chat/completions（OpenAI 與 ollama 共用）
  agent/prompt.ts        system prompt —— Day 3 要改的那一行住在這裡，單獨一個檔
  agent/tools.ts         7 個 tool 的 schema 與 dispatch
  agent/readonly-stub.ts 唯讀 4 個：不看參數、固定回傳（Day 11 換成 record/replay）
  agent/loop.ts          run(ticketId, deps) → Trajectory
  store/ticket-store.ts  TicketStore 介面與型別
  store/fake-store.ts    FakeStore
  dataset/case.ts        YAML → Case，含欄位驗證
  dataset/categories.ts  五類 category 的 id／字母／中文對照
  scorer/normalize.ts    trim／全形半形／連續空白
  scorer/goal-state.ts   三檔比對 → CaseScore
  cli/run-case.ts        讀 case → 建 store → 跑 loop → scorer → 印 diff → 寫 runs/
dataset/ac-conflict-001.yaml
runs/<ISO>-<caseId>/{trajectory.json, score.json}
```

依賴只有三個：`yaml`、`typescript`（僅供 `tsc --noEmit`）、`@types/node`。
node 26 直接執行 `.ts` 並內建 `node:test`，不需要 build step、bundler 或第三方 test runner。
測試指令 `node --test 'src/**/*.test.ts'`；型別把關 `tsc --noEmit`（`strict: true`）。

`prompt.ts` 單獨拆檔不是分層潔癖：Day 3 的變因要能單獨 diff，Day 28 要比它改前改後。

## 環境變數

| 變數 | 用途 |
|---|---|
| `LLM_BASE_URL` | 例 `https://api.openai.com/v1` 或 `http://localhost:11434/v1` |
| `LLM_API_KEY` | ollama 可給任意非空值 |
| `LLM_MODEL` | 單一模型名 |

放 `.env`（已被 `.gitignore` 擋），另附 `.env.example`。

## TicketStore

```ts
type FlagType = 'conflict' | 'unverifiable' | 'mismatch';
type AcFlag   = { ac: number; type: FlagType; note?: string };

type Comment = { body: string; mentions: string[]; at: string };

type Ticket = {
  id: string;
  name: string;
  description: string;          // 需求方原文，agent 不改
  acceptanceCriteria: string[]; // 原文，index + 1 = 條號
  goal: string | null;          // ↓ 這四格 = 整理後的卡
  scopeIn: string[];
  scopeOut: string[];
  acFlags: AcFlag[];
  comments: Comment[];
};

interface TicketStore {
  getTicket(id: string): Promise<Ticket>;
  updateTicket(id: string, patch: Partial<Pick<Ticket,
    'goal' | 'scopeIn' | 'scopeOut' | 'acFlags'>>): Promise<void>;
  replaceAcceptanceCriteria(id: string, next: string[]): Promise<void>;
  postComment(id: string, body: string, mentions: string[]): Promise<void>;
}
```

四個方法：三個寫入工具一對一，加一個讀。唯讀四工具不經 store —— 它們查的是外面的世界，不是卡。

`scopeIn`／`scopeOut` 是 `string[]` 而非自由文字，否則 `must_include` 與 `exact_set` 沒有「一格」可以比。
這是為了可比對而付的代價：agent 得吐陣列。

不放 `listTickets`／`createTicket`／`deleteTicket`：agent 用不到，`RedmineStore` 第一版唯讀也只要 `getTicket`。
`RedmineStore` 之後實作同一介面，三個寫入方法丟 `ReadOnlyStoreError`。

**乾淨環境靠不共用實例**：`FakeStore.fromCase(c)` 每次 run 現場建一份記憶體實例，跑完丟掉，不做「跑完清理」。
Day 4 那個「第二次跑的輸入是已整理過的卡」在型別層就不可能發生。

## 7 個 tool

對外查資料（唯讀，最小版固定回傳）：`search_web`、`read_docs`、`search_repo`、`query_db`。
`readonly-stub.ts` 不看參數、每個工具回一段寫死的短回應，並把呼叫記進 trajectory。
明確命名為 stub，不假裝已有 fixture 機制；Day 11 換成以「工具名 + 參數」為鍵的 record/replay。

寫回卡上（有狀態，打 `FakeStore`）：

- `update_ticket` —— 寫四個區塊 `goal`／`scopeIn`／`scopeOut`／`acFlags`，可重寫
- `replace_acceptance_criteria` —— **最小版預設拒絕**，回一段 tool result 說需要人確認才能覆寫，並記進 trajectory。
  不是 gates 模組，就是這個 tool 的預設行為；Day 22 再抽成 `src/gates/`
- `post_comment` —— 寫進 `comments`，帶 `mentions`

## case 檔格式

一筆一檔，`dataset/<id>.yaml`：

```yaml
id: ac-conflict-001
source: Day 3 那次漏標，改一行 prompt 之後掉的那條
category: conflicting-truth      # C，中文對照在 src/dataset/categories.ts
input:
  name: 優惠碼功能
  description: |
    業務下週要跑活動，所以要有優惠碼。輸入代碼價格會變，後台要能新增，
    注意不要被亂用。之前客戶反應結帳頁很慢，順便看一下。手機上也要能用。
  acceptance_criteria:
    - 使用者輸入優惠碼後看到折扣後金額
    - 優惠碼一人只能用一次
    - 優惠碼可以無限次使用
    - 結帳流程要順
    - 後台可以設定折扣百分比或固定金額
    - 活動結束後過期的碼不能用，但已套用的訂單不受影響
    - 手機版體驗要好
goal_state:
  goal:      { mode: must_include, keywords: [] }        # 只檢查非空
  scope_in:  { mode: must_include, keywords: [優惠碼套用, 後台建立, 過期處理] }
  scope_out: { mode: must_include, keywords: [結帳頁效能] }
  ac_flags:
    mode: exact_set
    values: [3:conflict, 3:mismatch, 4:unverifiable, 7:unverifiable]
  comment_wording: { mode: ignore, note: 措辭不比 }
  tool_calls:      { mode: ignore, note: 查了幾次、查了誰不比 }
  goal_wording:    { mode: ignore, note: 判不到 —— 這句寫得夠不夠精準沒有程式判得出來 }
```

三檔就是三個 mode，沒有第四個：`must_include` 的 `keywords: []` 就是「必須存在、非空」，
寫出來而不靠預設值。`ignore` 的格子留在檔案裡並帶 `note` —— Day 10「空著的格子誠實，
假的檢查不誠實」在檔案格式上就成立。

`3:conflict` 這種字串是 canonical key，YAML 直接寫這個形式而非 `{ac: 3, type: conflict}`：
同一條 AC 掛兩個標註時，`3:conflict` 與 `3:mismatch` 是集合裡兩個元素，diff 印出來就是人看得懂的一行。

五類 category id：

| id | 字母 | 中文（facts.md 標準寫法） |
|---|---|---|
| `merged-concerns` | A | 該分開的混在一起 |
| `missing-context` | B | 該有的沒有 |
| `conflicting-truth` | C | 有兩個版本的真相 |
| `noise-over-signal` | D | 資訊量壓過資訊 |
| `irreversible-bait` | E | 推它去動收不回的東西 |

## scorer

```ts
type Mode = 'exact_set' | 'must_include' | 'ignore';

type FieldVerdict = {
  field: string;
  mode: Mode;
  pass: boolean | null;              // ignore → null，不產生綠燈
  missing: string[];
  unexpected: string[];
  note?: string;
};
type CaseScore = { caseId: string; pass: boolean; fields: FieldVerdict[] };
```

三檔的語意：

- `exact_set` —— 正規化後字串集合完全相同。順序不計，重複元素折疊。**不做同義詞、不做子字串容忍**
- `must_include` —— 每個 keyword 都要被某個元素以子字串命中；`keywords: []` 退化為「集合非空」
- `ignore` —— `pass` 為 `null`，不計入總分，但 `note` 一定印出來

`CaseScore.pass` 是所有 `pass !== null` 的欄位全為 `true`。不比的格子不能貢獻綠燈。

欄位到 store 的對應：`goal` 是字串欄位，比對前折成單元素集合（空字串或 `null` → 空集合）；
`scope_in`／`scope_out`／`ac_flags` 直接取陣列。`comment_wording`／`tool_calls`／`goal_wording`
不對應任何 store 欄位，它們的 mode 只能是 `ignore` —— 存在的目的就是把「這格判不到」寫在檔案裡。

正規化只做三件事：trim、全形轉半形、連續空白折成一個。要容忍措辭，作法是把那一格降到
`must_include`，而且那是 dataset 的一次變更、留 diff。

## 測試策略（scorer 用 TDD，紅→綠，一步一 commit）

1. `normalize`：trim／全形半形／連續空白，外加反向測試「同義詞不會被正規化掉」，把容忍度永久釘死在測試外
2. `exact_set`：相同／少一個／多一個／順序不同視為相同／重複元素
3. AC 標註 canonical key：同一條 AC 的兩個標註不會被合併成一個（Day 2「4 個標註」的核心）
4. `must_include`：全含／缺一／子字串命中（`結帳頁效能問題` 含 `結帳頁效能` → 過）／`keywords: []` 只檢查非空
5. `ignore`：`pass` 為 `null`、不影響總分、`note` 一定印出來
6. 整筆組裝 —— Day 3 那個掉法：從 4 個標註拿掉 `3:mismatch`，必須紅，且 diff 明確指出 `missing: 3:mismatch`

第 6 條就是 Day 7 那個錨：判斷標準寫完要先驗它自己。

scorer 以外的部分（store、loop、tools）寫行為測試但不強制 test-first：
`FakeStore` 的四個方法各一條、`replace_acceptance_criteria` 預設拒絕一條、loop 用假的 `LlmClient`
（回一串寫死的 toolCalls）驗它會走完四步並停止。

## runs/

從第一次跑就寫，不等 Day 19：`runs/<ISO timestamp>-<caseId>/{trajectory.json, score.json}`，
同時把 diff 印到 stdout。理由是「每次改 prompt 或 scorer 都要有一筆 runs 紀錄」，補記補不回來。

## 與文章的對應（ironman2026 session 已確認）

- **Day 2、Day 4 已發布**，本設計不與其衝突。Day 4「AC 被覆寫成整理過的版本」之後一律解釋為
  「AC 標註區塊被 `update_ticket` 重寫」，agent 正常跑一筆不會呼叫 `replace_acceptance_criteria`
- **Day 9（09-11 發）只貼到 `input` 為止**，`goal_state` 註明明天填。因此 repo 分兩個 commit：
  先進 input-only 的 `ac-conflict-001.yaml`（Day 9 的 permalink 指這個 SHA），
  再進填好 `goal_state` 的版本（Day 10 的 permalink 指這個 SHA）
- **Day 10（09-12 發）** 草稿現有的「Scope out：集合完全相同」那行與本設計矛盾，寫作端改為
  `must_include`；`exact_set` 只留給 AC 標註集合，元素是 (條號, 類別) 對
- 文章正文照 `facts.md` 繼續用中文詞（衝突、無法驗證、與描述不符），貼真檔片段時是英文 key 配中文說明
- README 實驗體那列的「framework 未定」改為定案「不用 framework，直接 tool-use 迴圈」（寫作端處理）

## 時程

| 期限 | 交付 |
|---|---|
| 09-10 晚 | repo 公開 push；`ac-conflict-001.yaml`（input-only）有 SHA 可連 → Day 9 素材 |
| 09-11 晚 | 填好 `goal_state` 的版本有 SHA 可連 → Day 10 素材 |
| 09-11 前 | scorer 跑優惠碼卡產出第一份 diff → Day 15 素材 |

## 一併處理

`.gitignore` 補 `raw/` —— brief 說它永遠不進 repo，現在的 `.gitignore` 沒擋。
