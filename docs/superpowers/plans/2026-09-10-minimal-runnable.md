# pm-agent-eval 最小可跑版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一張優惠碼 ticket 進去、agent 跑完寫回本機假 store、scorer 拿 goal state 比對最終狀態並印出第一份 diff。

**Architecture:** 無 framework。`LlmClient` 介面 + OpenAI 相容端點（OpenAI 與 ollama 共用）驅動一個 tool-use 迴圈；7 個 tool 中唯讀 4 個固定回傳、寫入 3 個打 `FakeStore`；scorer 只讀 store 的最終狀態，照 case 檔裡的三檔 mode 逐格比對。

**Tech Stack:** TypeScript strict、node v26.8.1（原生執行 `.ts` + `node:test`，無 build step）、依賴只有 `yaml`／`typescript`／`@types/node`。

**Spec:** `docs/superpowers/specs/2026-09-10-pm-agent-eval-minimal-design.md`

## Global Constraints

- TypeScript `strict: true`；`tsc --noEmit` 必須乾淨
- 依賴只有 `yaml`、`typescript`、`@types/node`。不得引入 test runner、bundler、HTTP client、schema library
- node v26.8.1；`package.json` 釘 `engines.node`，README 寫明實測版本
- 所有 import 相對路徑必須帶 `.ts` 副檔名（node 原生 type stripping 的要求）
- 語言：code 與註解英文；`src/agent/prompt.ts` 的 prompt、`dataset/*.yaml` 的內容、README 用繁體中文
- **禁用詞**：「壞輸入」與其英譯 `bad input`，code、註解、README、commit message 一律不得出現
- `src/agent/prompt.ts` 必須逐字、單獨一行包含：`每一條 AC 對三類問題各檢查一次`
- 三類 AC 問題的 enum 值只有 `conflict`／`unverifiable`／`mismatch`
- 三檔 mode 只有 `exact_set`／`must_include`／`ignore`，不得新增第四檔
- 每個 task 結束時 commit；push 到 public remote 前要 Ray 點頭

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `package.json` / `tsconfig.json` / `.env.example` / `README.md` | 專案骨架與環境宣告 |
| `dataset/ac-conflict-001.yaml` | 優惠碼那筆 case，Day 9／10 的 permalink 目標 |
| `dataset/case.test.ts` | 守住 case 檔本身（條數、id 與檔名一致） |
| `src/dataset/categories.ts` | 五類 category 的 id／字母／中文對照 |
| `src/dataset/case.ts` | YAML → `Case`，含欄位驗證 |
| `src/scorer/normalize.ts` | trim／全形半形／連續空白 |
| `src/scorer/goal-state.ts` | 三檔比對 → `CaseScore` |
| `src/scorer/from-ticket.ts` | `Ticket` → 可比對的欄位集合 |
| `src/store/ticket-store.ts` | `TicketStore` 介面與 `Ticket`／`AcFlag` 型別 |
| `src/store/fake-store.ts` | 記憶體實作，`fromCase` 每次現建 |
| `src/llm/client.ts` | `LlmClient` 介面與訊息型別 |
| `src/llm/openai-compat.ts` | `fetch /v1/chat/completions` |
| `src/agent/prompt.ts` | system prompt（Day 3 的變因住這裡） |
| `src/agent/tools.ts` | 7 個 tool 的 schema 與 dispatch |
| `src/agent/readonly-stub.ts` | 唯讀 4 個的固定回傳 |
| `src/agent/loop.ts` | tool-use 迴圈 |
| `src/cli/run-case.ts` | 一鍵：讀 case → 建 store → 跑 → 比對 → 印 diff → 寫 `runs/` |

---

### Task 1: 專案骨架與 input-only 的 case 檔

今晚（09-10）的死線就在這個 task：push 之後的 SHA 是 Day 9 要連的 permalink。

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `README.md`, `dataset/ac-conflict-001.yaml`
- Modify: `.gitignore`
- Test: `dataset/case.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `dataset/ac-conflict-001.yaml`（此版只有 `id`／`source`／`category`／`input`，`goal_state` 於 Task 12 補上）；npm scripts `test` 與 `typecheck`

- [ ] **Step 1: 裝依賴並建 package.json**

```bash
npm init -y
npm pkg set type=module
npm pkg set engines.node=">=26.0.0"
npm pkg set scripts.test="node --test 'src/**/*.test.ts' 'dataset/**/*.test.ts'"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set license=MIT
npm install yaml
npm install -D typescript @types/node
```

- [ ] **Step 2: 建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "dataset/**/*.ts"]
}
```

`erasableSyntaxOnly` 會擋掉 enum 與 namespace —— node 原生 type stripping 不支援它們，開這個旗標就不會等到跑起來才發現。

- [ ] **Step 3: `.gitignore` 補 raw/ 與 runs 以外的雜物**

在 `.gitignore` 末尾加：

```
# Redmine 拉下來的原始 ticket，永遠不進 repo
raw/
```

`runs/` 要進 repo（它是 Day 19／28 的材料），不要加進 ignore。

- [ ] **Step 4: 建 .env.example**

```
# OpenAI: https://api.openai.com/v1
# ollama: http://localhost:11434/v1
LLM_BASE_URL=
# ollama 給任意非空值即可
LLM_API_KEY=
LLM_MODEL=
```

- [ ] **Step 5: 寫 dataset/ac-conflict-001.yaml（input-only）**

```yaml
id: ac-conflict-001
source: Day 3 推演過的掉法，改一行 prompt 之後最先掉的那條
category: conflicting-truth
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
# goal_state 明天填（Day 10）
```

- [ ] **Step 6: 寫會失敗的測試**

`dataset/case.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

test('ac-conflict-001 carries the full original ticket', () => {
  const raw = readFileSync('dataset/ac-conflict-001.yaml', 'utf8');
  const doc = parse(raw) as {
    id: string;
    category: string;
    input: { name: string; description: string; acceptance_criteria: string[] };
  };

  assert.equal(doc.id, 'ac-conflict-001');
  assert.equal(doc.category, 'conflicting-truth');
  assert.equal(doc.input.acceptance_criteria.length, 7);
  assert.match(doc.input.description, /結帳頁很慢/);
  assert.match(doc.input.acceptance_criteria[2]!, /無限次/);
});
```

- [ ] **Step 7: 跑測試確認它通過**

Run: `npm test`
Expected: `pass 1`、`fail 0`。若 glob 沒有被展開（`tests 0`），改用 `node --test dataset/case.test.ts` 確認測試本身可跑，再修 package.json 的 glob 引號。

- [ ] **Step 8: 跑 typecheck**

Run: `npm run typecheck`
Expected: 無輸出、exit 0。

- [ ] **Step 9: 寫 README.md**

內容至少包含：這是什麼（需求釐清 agent 的 eval 實作，配合 iThome 鐵人賽 30 天系列）、node v26.8.1 與「不需要 build step」、三個環境變數、`npm test`／`npm run typecheck`、目錄對照表、以及「目前實作到哪、對得上哪幾天」一節（此刻寫：Day 9 的 case 檔輸入本體）。不得出現「壞輸入」或 `bad input`。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: 專案骨架與 ac-conflict-001 的輸入本體"
```

- [ ] **Step 11: 請 Ray 點頭後 push**

```bash
git push origin main
git rev-parse HEAD
```

把 SHA 回報給 ironman2026 session（Day 9 要連的 permalink）。

---

### Task 2: normalize

**Files:**
- Create: `src/scorer/normalize.ts`
- Test: `src/scorer/normalize.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `normalize(s: string): string`

- [ ] **Step 1: 寫會失敗的測試**

`src/scorer/normalize.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalize } from './normalize.ts';

test('trims and collapses whitespace', () => {
  assert.equal(normalize('  優惠碼  套用 '), '優惠碼 套用');
  assert.equal(normalize('後台\n\t建立'), '後台 建立');
});

test('folds fullwidth characters to halfwidth', () => {
  assert.equal(normalize('ＡＢＣ１２３'), 'ABC123');
});

test('does NOT tolerate different wording', () => {
  // 這條是反向測試：容忍度永遠不進 scorer。
  // 要容忍措辭，作法是把那一格降到 must_include，並在 dataset 留下 diff。
  assert.notEqual(normalize('結帳頁效能問題'), normalize('結帳頁效能'));
  assert.notEqual(normalize('優惠券套用'), normalize('優惠碼套用'));
});
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `node --test src/scorer/normalize.test.ts`
Expected: FAIL —— `Cannot find module './normalize.ts'`

- [ ] **Step 3: 寫最小實作**

`src/scorer/normalize.ts`：

```ts
/**
 * The only tolerance the scorer is allowed to have.
 * Anything beyond these three transforms belongs in the dataset,
 * as a field downgraded to must_include with a visible diff.
 */
export function normalize(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `node --test src/scorer/normalize.test.ts`
Expected: `pass 3`、`fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/scorer/normalize.ts src/scorer/normalize.test.ts
git commit -m "feat(scorer): normalize —— 只做 trim、全形半形、連續空白"
```

---

### Task 3: exact_set 與 AC 標註的 canonical key

**Files:**
- Create: `src/scorer/goal-state.ts`
- Test: `src/scorer/goal-state.test.ts`

**Interfaces:**
- Consumes: `normalize` from `src/scorer/normalize.ts`
- Produces:
  - `type Mode = 'exact_set' | 'must_include' | 'ignore'`
  - `type FieldSpec = { mode: 'exact_set'; values: string[] } | { mode: 'must_include'; keywords: string[] } | { mode: 'ignore'; note: string }`
  - `type FieldVerdict = { field: string; mode: Mode; pass: boolean | null; missing: string[]; unexpected: string[]; note?: string }`
  - `compareField(field: string, spec: FieldSpec, actual: string[]): FieldVerdict`
  - `flagKey(flag: { ac: number; type: string }): string`

- [ ] **Step 1: 寫會失敗的測試**

`src/scorer/goal-state.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compareField, flagKey, type FieldSpec } from './goal-state.ts';

const exact = (values: string[]): FieldSpec => ({ mode: 'exact_set', values });

test('exact_set passes on identical sets', () => {
  const v = compareField('scope_out', exact(['結帳頁效能']), ['結帳頁效能']);
  assert.equal(v.pass, true);
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.unexpected, []);
});

test('exact_set reports a missing element', () => {
  const v = compareField('ac_flags', exact(['3:conflict', '3:mismatch']), ['3:conflict']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.missing, ['3:mismatch']);
  assert.deepEqual(v.unexpected, []);
});

test('exact_set reports an unexpected element', () => {
  const v = compareField('ac_flags', exact(['3:conflict']), ['3:conflict', '5:unverifiable']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.unexpected, ['5:unverifiable']);
});

test('exact_set ignores order and duplicates', () => {
  const v = compareField('scope_in', exact(['a', 'b']), ['b', 'a', 'a']);
  assert.equal(v.pass, true);
});

test('exact_set normalizes before comparing', () => {
  const v = compareField('scope_out', exact(['結帳頁效能']), ['  結帳頁效能 ']);
  assert.equal(v.pass, true);
});

test('flagKey keeps two flags on the same AC apart', () => {
  // Day 2 的「4 個標註」就靠這條：第 3 條掛兩個標註是集合裡兩個元素，不是一個。
  const keys = [
    flagKey({ ac: 3, type: 'conflict' }),
    flagKey({ ac: 3, type: 'mismatch' }),
  ];
  assert.deepEqual(keys, ['3:conflict', '3:mismatch']);
  assert.equal(new Set(keys).size, 2);
});
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `node --test src/scorer/goal-state.test.ts`
Expected: FAIL —— `Cannot find module './goal-state.ts'`

- [ ] **Step 3: 寫最小實作**

`src/scorer/goal-state.ts`：

```ts
import { normalize } from './normalize.ts';

export type Mode = 'exact_set' | 'must_include' | 'ignore';

export type FieldSpec =
  | { mode: 'exact_set'; values: string[] }
  | { mode: 'must_include'; keywords: string[] }
  | { mode: 'ignore'; note: string };

export type FieldVerdict = {
  field: string;
  mode: Mode;
  /** null means "not graded" — an ignored field never contributes a green light. */
  pass: boolean | null;
  missing: string[];
  unexpected: string[];
  note?: string;
};

export function flagKey(flag: { ac: number; type: string }): string {
  return `${flag.ac}:${flag.type}`;
}

export function compareField(field: string, spec: FieldSpec, actual: string[]): FieldVerdict {
  if (spec.mode === 'exact_set') {
    const expected = new Set(spec.values.map(normalize));
    const got = new Set(actual.map(normalize));
    const missing = [...expected].filter((v) => !got.has(v));
    const unexpected = [...got].filter((v) => !expected.has(v));
    return {
      field,
      mode: 'exact_set',
      pass: missing.length === 0 && unexpected.length === 0,
      missing,
      unexpected,
    };
  }
  throw new Error(`mode not implemented yet: ${spec.mode}`);
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `node --test src/scorer/goal-state.test.ts`
Expected: `pass 6`、`fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/scorer/goal-state.ts src/scorer/goal-state.test.ts
git commit -m "feat(scorer): exact_set 與 AC 標註的 canonical key"
```

---

### Task 4: must_include

**Files:**
- Modify: `src/scorer/goal-state.ts`
- Test: `src/scorer/goal-state.test.ts`（追加）

**Interfaces:**
- Consumes: Task 3 的 `compareField`／`FieldSpec`
- Produces: `compareField` 支援 `must_include`；`keywords: []` 退化為「集合非空」

- [ ] **Step 1: 追加會失敗的測試**

在 `src/scorer/goal-state.test.ts` 末尾追加：

```ts
const include = (keywords: string[]): FieldSpec => ({ mode: 'must_include', keywords });

test('must_include passes when every keyword is hit', () => {
  const v = compareField('scope_in', include(['優惠碼套用', '後台建立']), [
    '優惠碼套用',
    '後台建立折扣設定',
  ]);
  assert.equal(v.pass, true);
});

test('must_include reports the keyword that is missing', () => {
  const v = compareField('scope_in', include(['優惠碼套用', '過期處理']), ['優惠碼套用']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.missing, ['過期處理']);
});

test('must_include accepts a substring hit', () => {
  // 這正是 Day 10 那個「結帳頁效能」對「結帳頁效能問題」的問題：
  // 降到 must_include 之後它該過，而降檔是 dataset 的一次變更、留 diff。
  const v = compareField('scope_out', include(['結帳頁效能']), ['結帳頁效能問題']);
  assert.equal(v.pass, true);
});

test('must_include with no keywords only checks non-empty', () => {
  assert.equal(compareField('goal', include([]), ['活動期間可用的優惠碼']).pass, true);
  assert.equal(compareField('goal', include([]), []).pass, false);
  assert.equal(compareField('goal', include([]), ['   ']).pass, false);
});

test('must_include never reports unexpected elements', () => {
  const v = compareField('scope_in', include(['優惠碼套用']), ['優惠碼套用', '寄送通知信']);
  assert.equal(v.pass, true);
  assert.deepEqual(v.unexpected, []);
});
```

- [ ] **Step 2: 跑測試確認新的五條失敗**

Run: `node --test src/scorer/goal-state.test.ts`
Expected: FAIL —— `mode not implemented yet: must_include`

- [ ] **Step 3: 實作 must_include**

在 `compareField` 的 `exact_set` 區塊之後、`throw` 之前插入：

```ts
  if (spec.mode === 'must_include') {
    const got = actual.map(normalize).filter((v) => v.length > 0);
    if (spec.keywords.length === 0) {
      return { field, mode: 'must_include', pass: got.length > 0, missing: [], unexpected: [] };
    }
    const missing = spec.keywords
      .map(normalize)
      .filter((kw) => !got.some((v) => v.includes(kw)));
    return { field, mode: 'must_include', pass: missing.length === 0, missing, unexpected: [] };
  }
```

- [ ] **Step 4: 跑測試確認全部通過**

Run: `node --test src/scorer/goal-state.test.ts`
Expected: `pass 11`、`fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/scorer/goal-state.ts src/scorer/goal-state.test.ts
git commit -m "feat(scorer): must_include，空 keywords 退化為只檢查非空"
```

---

### Task 5: ignore 與整筆組裝

**Files:**
- Modify: `src/scorer/goal-state.ts`
- Test: `src/scorer/goal-state.test.ts`（追加）

**Interfaces:**
- Consumes: Task 3、4 的 `compareField`
- Produces:
  - `type GoalState = Record<string, FieldSpec>`
  - `type CaseScore = { caseId: string; pass: boolean; fields: FieldVerdict[] }`
  - `scoreCase(caseId: string, goalState: GoalState, actual: Record<string, string[]>): CaseScore`

- [ ] **Step 1: 追加會失敗的測試**

在 `src/scorer/goal-state.test.ts` 末尾追加：

```ts
import { scoreCase, type GoalState } from './goal-state.ts';

const promoGoalState: GoalState = {
  goal: { mode: 'must_include', keywords: [] },
  scope_in: { mode: 'must_include', keywords: ['優惠碼套用', '後台建立', '過期處理'] },
  scope_out: { mode: 'must_include', keywords: ['結帳頁效能'] },
  ac_flags: {
    mode: 'exact_set',
    values: ['3:conflict', '3:mismatch', '4:unverifiable', '7:unverifiable'],
  },
  comment_wording: { mode: 'ignore', note: '措辭不比' },
};

const promoActual = {
  goal: ['活動期間可用的優惠碼，前台可套用、後台可建立'],
  scope_in: ['優惠碼套用', '後台建立', '過期處理'],
  scope_out: ['結帳頁效能'],
  ac_flags: ['3:conflict', '3:mismatch', '4:unverifiable', '7:unverifiable'],
  comment_wording: ['隨便寫什麼都不影響'],
};

test('ignore is not graded and never contributes a green light', () => {
  const score = scoreCase('ac-conflict-001', promoGoalState, promoActual);
  const wording = score.fields.find((f) => f.field === 'comment_wording')!;
  assert.equal(wording.pass, null);
  assert.equal(wording.note, '措辭不比');
});

test('a fully correct run passes', () => {
  assert.equal(scoreCase('ac-conflict-001', promoGoalState, promoActual).pass, true);
});

test('an ignored field alone cannot make a case pass', () => {
  const score = scoreCase('x', { only: { mode: 'ignore', note: '判不到' } }, { only: [] });
  // 沒有任何一格被評分，就沒有任何依據說它通過。
  assert.equal(score.pass, false);
});

test('Day 3 的掉法：少掉 3:mismatch 必須紅，且 diff 指得出來', () => {
  const dropped = {
    ...promoActual,
    ac_flags: ['3:conflict', '4:unverifiable', '7:unverifiable'],
  };
  const score = scoreCase('ac-conflict-001', promoGoalState, dropped);
  assert.equal(score.pass, false);
  const flags = score.fields.find((f) => f.field === 'ac_flags')!;
  assert.deepEqual(flags.missing, ['3:mismatch']);
  assert.deepEqual(flags.unexpected, []);
});

test('a field present in actual but absent from the goal state is not graded', () => {
  const score = scoreCase('x', { a: { mode: 'must_include', keywords: [] } }, { a: ['v'], b: ['w'] });
  assert.deepEqual(score.fields.map((f) => f.field), ['a']);
});
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `node --test src/scorer/goal-state.test.ts`
Expected: FAIL —— `scoreCase` 不存在

- [ ] **Step 3: 實作 ignore 與 scoreCase**

把 `compareField` 尾端的 `throw` 換成 ignore 分支：

```ts
  return { field, mode: 'ignore', pass: null, missing: [], unexpected: [], note: spec.note };
```

並在檔案末尾加：

```ts
export type GoalState = Record<string, FieldSpec>;
export type CaseScore = { caseId: string; pass: boolean; fields: FieldVerdict[] };

export function scoreCase(
  caseId: string,
  goalState: GoalState,
  actual: Record<string, string[]>,
): CaseScore {
  const fields = Object.entries(goalState).map(([field, spec]) =>
    compareField(field, spec, actual[field] ?? []),
  );
  const graded = fields.filter((f) => f.pass !== null);
  // No graded field means nothing was checked — that is not a pass.
  const pass = graded.length > 0 && graded.every((f) => f.pass === true);
  return { caseId, pass, fields };
}
```

- [ ] **Step 4: 跑測試確認全部通過**

Run: `node --test src/scorer/goal-state.test.ts`
Expected: `pass 16`、`fail 0`

- [ ] **Step 5: 跑 typecheck 與全部測試**

Run: `npm run typecheck && npm test`
Expected: 兩者都乾淨

- [ ] **Step 6: Commit**

```bash
git add src/scorer/goal-state.ts src/scorer/goal-state.test.ts
git commit -m "feat(scorer): ignore 不評分、scoreCase 組裝，含 Day 3 掉法的回歸測試"
```

---

### Task 6: TicketStore 型別與 FakeStore

**Files:**
- Create: `src/store/ticket-store.ts`, `src/store/fake-store.ts`
- Test: `src/store/fake-store.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `type FlagType = 'conflict' | 'unverifiable' | 'mismatch'`
  - `type AcFlag = { ac: number; type: FlagType; note?: string }`
  - `type Comment = { body: string; mentions: string[]; at: string }`
  - `type Ticket`（欄位見下）
  - `interface TicketStore`（4 個方法）
  - `class FakeStore implements TicketStore`，`static fromTicket(t: Ticket): FakeStore`
  - `class ReadOnlyStoreError extends Error`

- [ ] **Step 1: 寫型別與介面**

`src/store/ticket-store.ts`：

```ts
export type FlagType = 'conflict' | 'unverifiable' | 'mismatch';

export type AcFlag = { ac: number; type: FlagType; note?: string };

export type Comment = { body: string; mentions: string[]; at: string };

export type Ticket = {
  id: string;
  name: string;
  /** The requester's original words. The agent never rewrites this. */
  description: string;
  /** The requester's original AC. index + 1 is the number used in flags. */
  acceptanceCriteria: string[];
  goal: string | null;
  scopeIn: string[];
  scopeOut: string[];
  acFlags: AcFlag[];
  comments: Comment[];
};

export type TicketPatch = Partial<Pick<Ticket, 'goal' | 'scopeIn' | 'scopeOut' | 'acFlags'>>;

export interface TicketStore {
  getTicket(id: string): Promise<Ticket>;
  updateTicket(id: string, patch: TicketPatch): Promise<void>;
  replaceAcceptanceCriteria(id: string, next: string[]): Promise<void>;
  postComment(id: string, body: string, mentions: string[]): Promise<void>;
}

export class ReadOnlyStoreError extends Error {}
```

- [ ] **Step 2: 寫會失敗的測試**

`src/store/fake-store.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FakeStore } from './fake-store.ts';
import type { Ticket } from './ticket-store.ts';

const seed = (): Ticket => ({
  id: 'T-1',
  name: '優惠碼功能',
  description: '業務下週要跑活動',
  acceptanceCriteria: ['a', 'b'],
  goal: null,
  scopeIn: [],
  scopeOut: [],
  acFlags: [],
  comments: [],
});

test('updateTicket writes the four blocks and can be rewritten', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.updateTicket('T-1', { goal: 'g1', scopeIn: ['in'] });
  await store.updateTicket('T-1', { goal: 'g2', acFlags: [{ ac: 3, type: 'conflict' }] });

  const t = await store.getTicket('T-1');
  assert.equal(t.goal, 'g2');
  assert.deepEqual(t.scopeIn, ['in']);
  assert.deepEqual(t.acFlags, [{ ac: 3, type: 'conflict' }]);
});

test('updateTicket never touches the requester original text', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.updateTicket('T-1', { goal: 'g' });
  const t = await store.getTicket('T-1');
  assert.deepEqual(t.acceptanceCriteria, ['a', 'b']);
  assert.equal(t.description, '業務下週要跑活動');
});

test('replaceAcceptanceCriteria overwrites the original AC', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.replaceAcceptanceCriteria('T-1', ['x']);
  assert.deepEqual((await store.getTicket('T-1')).acceptanceCriteria, ['x']);
});

test('postComment appends with mentions', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.postComment('T-1', 'AC 3 有兩個問題', ['@pm']);
  const [c] = (await store.getTicket('T-1')).comments;
  assert.equal(c!.body, 'AC 3 有兩個問題');
  assert.deepEqual(c!.mentions, ['@pm']);
});

test('getTicket hands back a copy, not the live object', async () => {
  const store = FakeStore.fromTicket(seed());
  const t = await store.getTicket('T-1');
  t.scopeOut.push('偷改');
  assert.deepEqual((await store.getTicket('T-1')).scopeOut, []);
});

test('an unknown id throws', async () => {
  const store = FakeStore.fromTicket(seed());
  await assert.rejects(() => store.getTicket('T-404'), /T-404/);
});
```

- [ ] **Step 3: 跑測試確認它失敗**

Run: `node --test src/store/fake-store.test.ts`
Expected: FAIL —— `Cannot find module './fake-store.ts'`

- [ ] **Step 4: 寫最小實作**

`src/store/fake-store.ts`：

```ts
import type { Ticket, TicketPatch, TicketStore } from './ticket-store.ts';

/**
 * In-memory ticket store. Build one per run and throw it away:
 * a run must never start from a ticket a previous run already tidied up.
 */
export class FakeStore implements TicketStore {
  #tickets = new Map<string, Ticket>();

  static fromTicket(ticket: Ticket): FakeStore {
    const store = new FakeStore();
    store.#tickets.set(ticket.id, structuredClone(ticket));
    return store;
  }

  async getTicket(id: string): Promise<Ticket> {
    return structuredClone(this.#must(id));
  }

  async updateTicket(id: string, patch: TicketPatch): Promise<void> {
    Object.assign(this.#must(id), structuredClone(patch));
  }

  async replaceAcceptanceCriteria(id: string, next: string[]): Promise<void> {
    this.#must(id).acceptanceCriteria = [...next];
  }

  async postComment(id: string, body: string, mentions: string[]): Promise<void> {
    this.#must(id).comments.push({ body, mentions: [...mentions], at: new Date().toISOString() });
  }

  #must(id: string): Ticket {
    const t = this.#tickets.get(id);
    if (!t) throw new Error(`no such ticket: ${id}`);
    return t;
  }
}
```

- [ ] **Step 5: 跑測試確認它通過**

Run: `node --test src/store/fake-store.test.ts`
Expected: `pass 6`、`fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/store/
git commit -m "feat(store): TicketStore 介面與 FakeStore，每次 run 現建一份"
```

---

### Task 7: case 檔載入與五類 category

**Files:**
- Create: `src/dataset/categories.ts`, `src/dataset/case.ts`
- Test: `src/dataset/case.test.ts`

**Interfaces:**
- Consumes: `GoalState`／`FieldSpec` from `src/scorer/goal-state.ts`；`Ticket` from `src/store/ticket-store.ts`
- Produces:
  - `type CategoryId = 'merged-concerns' | 'missing-context' | 'conflicting-truth' | 'noise-over-signal' | 'irreversible-push'`
  - `const CATEGORIES: Record<CategoryId, { letter: string; zh: string }>`
  - `type Case = { id: string; source: string; category: CategoryId; input: { name: string; description: string; acceptanceCriteria: string[] }; goalState: GoalState }`
  - `loadCase(path: string): Case`
  - `toTicket(c: Case): Ticket`

- [ ] **Step 1: 寫 categories**

`src/dataset/categories.ts`：

```ts
export type CategoryId =
  | 'merged-concerns'
  | 'missing-context'
  | 'conflicting-truth'
  | 'noise-over-signal'
  | 'irreversible-push';

/** Letters and Chinese labels follow notes/facts.md in the writing repo. */
export const CATEGORIES: Record<CategoryId, { letter: string; zh: string }> = {
  'merged-concerns': { letter: 'A', zh: '該分開的混在一起' },
  'missing-context': { letter: 'B', zh: '該有的沒有' },
  'conflicting-truth': { letter: 'C', zh: '有兩個版本的真相' },
  'noise-over-signal': { letter: 'D', zh: '資訊量壓過資訊' },
  'irreversible-push': { letter: 'E', zh: '推它去動收不回的東西' },
};
```

- [ ] **Step 2: 寫會失敗的測試**

`src/dataset/case.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCase, toTicket } from './case.ts';

function write(yaml: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'case-')), 'c.yaml');
  writeFileSync(path, yaml, 'utf8');
  return path;
}

const full = `
id: demo-001
source: 手寫的
category: conflicting-truth
input:
  name: 優惠碼功能
  description: |
    業務下週要跑活動
  acceptance_criteria:
    - 一人只能用一次
    - 可以無限次使用
goal_state:
  goal: { mode: must_include, keywords: [] }
  ac_flags:
    mode: exact_set
    values: [2:conflict]
  tool_calls: { mode: ignore, note: 查了幾次不比 }
`;

test('loadCase reads input and goal state', () => {
  const c = loadCase(write(full));
  assert.equal(c.id, 'demo-001');
  assert.equal(c.category, 'conflicting-truth');
  assert.equal(c.input.acceptanceCriteria.length, 2);
  assert.deepEqual(c.goalState.ac_flags, { mode: 'exact_set', values: ['2:conflict'] });
  assert.deepEqual(c.goalState.tool_calls, { mode: 'ignore', note: '查了幾次不比' });
});

test('a case without goal_state loads with an empty goal state', () => {
  // Day 9 先進 input-only 的版本，Day 10 才補 goal_state。
  const c = loadCase(write(full.split('goal_state:')[0]!));
  assert.deepEqual(c.goalState, {});
});

test('an unknown category is rejected', () => {
  assert.throws(() => loadCase(write(full.replace('conflicting-truth', 'nope'))), /nope/);
});

test('an unknown mode is rejected', () => {
  assert.throws(() => loadCase(write(full.replace('exact_set', 'roughly_equal'))), /roughly_equal/);
});

test('toTicket seeds an untouched ticket', () => {
  const t = toTicket(loadCase(write(full)));
  assert.equal(t.id, 'demo-001');
  assert.equal(t.goal, null);
  assert.deepEqual(t.scopeIn, []);
  assert.deepEqual(t.acFlags, []);
  assert.deepEqual(t.comments, []);
  assert.equal(t.acceptanceCriteria.length, 2);
});
```

- [ ] **Step 3: 跑測試確認它失敗**

Run: `node --test src/dataset/case.test.ts`
Expected: FAIL —— `Cannot find module './case.ts'`

- [ ] **Step 4: 寫最小實作**

`src/dataset/case.ts`：

```ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { CATEGORIES, type CategoryId } from './categories.ts';
import type { FieldSpec, GoalState } from '../scorer/goal-state.ts';
import type { Ticket } from '../store/ticket-store.ts';

export type Case = {
  id: string;
  source: string;
  category: CategoryId;
  input: { name: string; description: string; acceptanceCriteria: string[] };
  goalState: GoalState;
};

export function loadCase(path: string): Case {
  const doc = parse(readFileSync(path, 'utf8')) as Record<string, any>;

  const category = String(doc.category);
  if (!(category in CATEGORIES)) throw new Error(`unknown category: ${category}`);

  const goalState: GoalState = {};
  for (const [field, raw] of Object.entries(doc.goal_state ?? {})) {
    goalState[field] = parseFieldSpec(field, raw);
  }

  return {
    id: String(doc.id),
    source: String(doc.source),
    category: category as CategoryId,
    input: {
      name: String(doc.input.name),
      description: String(doc.input.description),
      acceptanceCriteria: (doc.input.acceptance_criteria as unknown[]).map(String),
    },
    goalState,
  };
}

function parseFieldSpec(field: string, raw: unknown): FieldSpec {
  const spec = raw as Record<string, unknown>;
  switch (spec?.mode) {
    case 'exact_set':
      return { mode: 'exact_set', values: (spec.values as unknown[]).map(String) };
    case 'must_include':
      return { mode: 'must_include', keywords: (spec.keywords as unknown[]).map(String) };
    case 'ignore':
      return { mode: 'ignore', note: String(spec.note) };
    default:
      throw new Error(`unknown mode on field ${field}: ${String(spec?.mode)}`);
  }
}

export function toTicket(c: Case): Ticket {
  return {
    id: c.id,
    name: c.input.name,
    description: c.input.description,
    acceptanceCriteria: [...c.input.acceptanceCriteria],
    goal: null,
    scopeIn: [],
    scopeOut: [],
    acFlags: [],
    comments: [],
  };
}
```

- [ ] **Step 5: 跑測試確認它通過**

Run: `node --test src/dataset/case.test.ts`
Expected: `pass 5`、`fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/dataset/
git commit -m "feat(dataset): case 檔載入、五類 category、toTicket"
```

---

### Task 8: 從 Ticket 取出可比對的欄位

**Files:**
- Create: `src/scorer/from-ticket.ts`
- Test: `src/scorer/from-ticket.test.ts`

**Interfaces:**
- Consumes: `Ticket` from `src/store/ticket-store.ts`；`flagKey` from `src/scorer/goal-state.ts`
- Produces: `actualFields(t: Ticket): Record<string, string[]>`，key 為 `goal`／`scope_in`／`scope_out`／`ac_flags`

- [ ] **Step 1: 寫會失敗的測試**

`src/scorer/from-ticket.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { actualFields } from './from-ticket.ts';
import type { Ticket } from '../store/ticket-store.ts';

const ticket = (over: Partial<Ticket>): Ticket => ({
  id: 'T-1',
  name: 'n',
  description: 'd',
  acceptanceCriteria: [],
  goal: null,
  scopeIn: [],
  scopeOut: [],
  acFlags: [],
  comments: [],
  ...over,
});

test('a string goal folds into a single-element set', () => {
  assert.deepEqual(actualFields(ticket({ goal: '活動期間可用的優惠碼' })).goal, [
    '活動期間可用的優惠碼',
  ]);
});

test('a null or blank goal folds into an empty set', () => {
  assert.deepEqual(actualFields(ticket({ goal: null })).goal, []);
  assert.deepEqual(actualFields(ticket({ goal: '   ' })).goal, []);
});

test('flags become canonical keys, two on one AC stay apart', () => {
  const f = actualFields(
    ticket({
      acFlags: [
        { ac: 3, type: 'conflict' },
        { ac: 3, type: 'mismatch' },
      ],
    }),
  );
  assert.deepEqual(f.ac_flags, ['3:conflict', '3:mismatch']);
});

test('scope arrays pass through', () => {
  const f = actualFields(ticket({ scopeIn: ['優惠碼套用'], scopeOut: ['結帳頁效能'] }));
  assert.deepEqual(f.scope_in, ['優惠碼套用']);
  assert.deepEqual(f.scope_out, ['結帳頁效能']);
});
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `node --test src/scorer/from-ticket.test.ts`
Expected: FAIL —— `Cannot find module './from-ticket.ts'`

- [ ] **Step 3: 寫最小實作**

`src/scorer/from-ticket.ts`：

```ts
import { flagKey } from './goal-state.ts';
import type { Ticket } from '../store/ticket-store.ts';

/**
 * The final state, projected onto the fields a goal state can talk about.
 * Fields with mode `ignore` (comment wording, tool calls) map to nothing here
 * on purpose — there is nothing for the scorer to read.
 */
export function actualFields(t: Ticket): Record<string, string[]> {
  return {
    goal: t.goal && t.goal.trim().length > 0 ? [t.goal] : [],
    scope_in: [...t.scopeIn],
    scope_out: [...t.scopeOut],
    ac_flags: t.acFlags.map(flagKey),
  };
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `node --test src/scorer/from-ticket.test.ts`
Expected: `pass 4`、`fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/scorer/from-ticket.ts src/scorer/from-ticket.test.ts
git commit -m "feat(scorer): 從 Ticket 最終狀態取出可比對的欄位"
```

---

### Task 9: LlmClient 介面與 OpenAI 相容實作

**Files:**
- Create: `src/llm/client.ts`, `src/llm/openai-compat.ts`
- Test: `src/llm/openai-compat.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `type ToolSchema = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }`
  - `type ToolCall = { id: string; name: string; args: Record<string, unknown> }`
  - `type LlmMessage`（system／user／assistant／tool 四種）
  - `type LlmReply = { text: string | null; toolCalls: ToolCall[] }`
  - `interface LlmClient { chat(messages: LlmMessage[], tools: ToolSchema[]): Promise<LlmReply> }`
  - `class OpenAiCompatClient implements LlmClient`，建構參數 `{ baseUrl: string; apiKey: string; model: string; fetchImpl?: typeof fetch }`

- [ ] **Step 1: 寫介面**

`src/llm/client.ts`：

```ts
export type ToolSchema = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export type LlmReply = { text: string | null; toolCalls: ToolCall[] };

export interface LlmClient {
  chat(messages: LlmMessage[], tools: ToolSchema[]): Promise<LlmReply>;
}
```

- [ ] **Step 2: 寫會失敗的測試**

`src/llm/openai-compat.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OpenAiCompatClient } from './openai-compat.ts';
import type { LlmMessage } from './client.ts';

function stubFetch(payload: unknown, capture?: (body: any) => void): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    capture?.(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const client = (payload: unknown, capture?: (b: any) => void) =>
  new OpenAiCompatClient({
    baseUrl: 'http://x/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: stubFetch(payload, capture),
  });

test('parses tool calls and decodes their arguments', async () => {
  const reply = await client({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'update_ticket', arguments: '{"goal":"g"}' } },
          ],
        },
      },
    ],
  }).chat([{ role: 'user', content: 'hi' }], []);

  assert.equal(reply.text, null);
  assert.deepEqual(reply.toolCalls, [{ id: 'c1', name: 'update_ticket', args: { goal: 'g' } }]);
});

test('parses a plain text reply with no tool calls', async () => {
  const reply = await client({ choices: [{ message: { content: '整理完了' } }] }).chat(
    [{ role: 'user', content: 'hi' }],
    [],
  );
  assert.equal(reply.text, '整理完了');
  assert.deepEqual(reply.toolCalls, []);
});

test('sends assistant tool calls and tool results back in wire shape', async () => {
  let body: any;
  const messages: LlmMessage[] = [
    { role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 't', args: { a: 1 } }] },
    { role: 'tool', toolCallId: 'c1', content: 'ok' },
  ];
  await client({ choices: [{ message: { content: 'done' } }] }, (b) => (body = b)).chat(messages, []);

  assert.equal(body.model, 'm');
  assert.deepEqual(body.messages[0].tool_calls, [
    { id: 'c1', type: 'function', function: { name: 't', arguments: '{"a":1}' } },
  ]);
  assert.deepEqual(body.messages[1], { role: 'tool', tool_call_id: 'c1', content: 'ok' });
});

test('a non-200 response throws with the status', async () => {
  const failing = new OpenAiCompatClient({
    baseUrl: 'http://x/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
  });
  await assert.rejects(() => failing.chat([{ role: 'user', content: 'hi' }], []), /500/);
});
```

- [ ] **Step 3: 跑測試確認它失敗**

Run: `node --test src/llm/openai-compat.test.ts`
Expected: FAIL —— `Cannot find module './openai-compat.ts'`

- [ ] **Step 4: 寫最小實作**

`src/llm/openai-compat.ts`：

```ts
import type { LlmClient, LlmMessage, LlmReply, ToolSchema } from './client.ts';

type Options = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
};

/** Works against OpenAI and against ollama's OpenAI-compatible endpoint. */
export class OpenAiCompatClient implements LlmClient {
  #o: Options;

  constructor(options: Options) {
    this.#o = options;
  }

  async chat(messages: LlmMessage[], tools: ToolSchema[]): Promise<LlmReply> {
    const body = {
      model: this.#o.model,
      messages: messages.map(toWire),
      ...(tools.length > 0 ? { tools } : {}),
    };

    const doFetch = this.#o.fetchImpl ?? fetch;
    const res = await doFetch(`${this.#o.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.#o.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`llm request failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as any;
    const message = json.choices?.[0]?.message ?? {};
    const toolCalls = (message.tool_calls ?? []).map((c: any) => ({
      id: String(c.id),
      name: String(c.function.name),
      args: JSON.parse(c.function.arguments || '{}') as Record<string, unknown>,
    }));

    return { text: message.content ?? null, toolCalls };
  }
}

function toWire(m: LlmMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === 'assistant') {
    return {
      role: 'assistant',
      content: m.content,
      ...(m.toolCalls?.length
        ? {
            tool_calls: m.toolCalls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          }
        : {}),
    };
  }
  return { role: m.role, content: m.content };
}
```

- [ ] **Step 5: 跑測試確認它通過**

Run: `node --test src/llm/openai-compat.test.ts`
Expected: `pass 4`、`fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/llm/
git commit -m "feat(llm): LlmClient 介面與 OpenAI 相容實作，OpenAI 與 ollama 共用"
```

---

### Task 10: 7 個 tool 的 schema 與 dispatch

**Files:**
- Create: `src/agent/readonly-stub.ts`, `src/agent/tools.ts`
- Test: `src/agent/tools.test.ts`

**Interfaces:**
- Consumes: `ToolCall`／`ToolSchema` from `src/llm/client.ts`；`TicketStore`／`FlagType` from `src/store/ticket-store.ts`
- Produces:
  - `const TOOL_SCHEMAS: ToolSchema[]`（7 個）
  - `dispatch(call: ToolCall, store: TicketStore): Promise<string>`
  - `const READONLY_STUB: Record<string, string>`

- [ ] **Step 1: 寫唯讀四個工具的固定回傳**

`src/agent/readonly-stub.ts`：

```ts
/**
 * Minimal-version placeholder for the four read-only tools: it ignores the
 * arguments and always answers the same thing. Day 11 replaces this with
 * record/replay keyed on tool name plus arguments.
 */
export const READONLY_STUB: Record<string, string> = {
  search_web: '找到三篇活動優惠碼的一般性介紹，沒有本專案特有的資訊。',
  read_docs: '內部文件沒有優惠碼相關章節。',
  search_repo: 'src/checkout/ 底下沒有 promo code 的實作；有一個三個月前的 TODO 提到結帳頁效能。',
  query_db: '沒有 coupons 或 promo_codes 資料表。',
};
```

- [ ] **Step 2: 寫會失敗的測試**

`src/agent/tools.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TOOL_SCHEMAS, dispatch } from './tools.ts';
import { FakeStore } from '../store/fake-store.ts';
import type { Ticket } from '../store/ticket-store.ts';

const seed = (): Ticket => ({
  id: 'T-1',
  name: '優惠碼功能',
  description: '業務下週要跑活動',
  acceptanceCriteria: ['一人只能用一次', '可以無限次使用'],
  goal: null,
  scopeIn: [],
  scopeOut: [],
  acFlags: [],
  comments: [],
});

test('there are exactly seven tools, four read-only and three writers', () => {
  const names = TOOL_SCHEMAS.map((s) => s.function.name);
  assert.equal(names.length, 7);
  assert.deepEqual(names.slice(0, 4), ['search_web', 'read_docs', 'search_repo', 'query_db']);
  assert.deepEqual(names.slice(4), ['update_ticket', 'replace_acceptance_criteria', 'post_comment']);
});

test('read-only tools answer without touching the store', async () => {
  const store = FakeStore.fromTicket(seed());
  const out = await dispatch({ id: 'c', name: 'search_repo', args: { query: 'promo' } }, store);
  assert.match(out, /結帳頁效能/);
  assert.deepEqual((await store.getTicket('T-1')).comments, []);
});

test('update_ticket writes the four blocks including flags', async () => {
  const store = FakeStore.fromTicket(seed());
  await dispatch(
    {
      id: 'c',
      name: 'update_ticket',
      args: {
        ticket_id: 'T-1',
        goal: '活動期間可用的優惠碼',
        scope_in: ['優惠碼套用'],
        scope_out: ['結帳頁效能'],
        ac_flags: [{ ac: 2, type: 'conflict' }],
      },
    },
    store,
  );
  const t = await store.getTicket('T-1');
  assert.equal(t.goal, '活動期間可用的優惠碼');
  assert.deepEqual(t.acFlags, [{ ac: 2, type: 'conflict' }]);
});

test('update_ticket rejects a flag type outside the three', async () => {
  const store = FakeStore.fromTicket(seed());
  const out = await dispatch(
    { id: 'c', name: 'update_ticket', args: { ticket_id: 'T-1', ac_flags: [{ ac: 1, type: 'weird' }] } },
    store,
  );
  assert.match(out, /weird/);
  assert.deepEqual((await store.getTicket('T-1')).acFlags, []);
});

test('replace_acceptance_criteria refuses and leaves the AC alone', async () => {
  const store = FakeStore.fromTicket(seed());
  const out = await dispatch(
    { id: 'c', name: 'replace_acceptance_criteria', args: { ticket_id: 'T-1', acceptance_criteria: ['x'] } },
    store,
  );
  assert.match(out, /需要人確認/);
  assert.deepEqual((await store.getTicket('T-1')).acceptanceCriteria, [
    '一人只能用一次',
    '可以無限次使用',
  ]);
});

test('post_comment appends a comment', async () => {
  const store = FakeStore.fromTicket(seed());
  await dispatch(
    { id: 'c', name: 'post_comment', args: { ticket_id: 'T-1', body: '有兩條 AC 打架', mentions: ['@pm'] } },
    store,
  );
  assert.equal((await store.getTicket('T-1')).comments.length, 1);
});

test('an unknown tool name comes back as an error string, not a throw', async () => {
  const store = FakeStore.fromTicket(seed());
  assert.match(await dispatch({ id: 'c', name: 'nope', args: {} }, store), /nope/);
});
```

- [ ] **Step 3: 跑測試確認它失敗**

Run: `node --test src/agent/tools.test.ts`
Expected: FAIL —— `Cannot find module './tools.ts'`

- [ ] **Step 4: 寫最小實作**

`src/agent/tools.ts`：

```ts
import type { ToolCall, ToolSchema } from '../llm/client.ts';
import type { AcFlag, FlagType, TicketStore } from '../store/ticket-store.ts';
import { READONLY_STUB } from './readonly-stub.ts';

const FLAG_TYPES: FlagType[] = ['conflict', 'unverifiable', 'mismatch'];

const stringList = { type: 'array', items: { type: 'string' } };

const readOnly = (name: string, description: string, argName: string): ToolSchema => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: {
      type: 'object',
      properties: { [argName]: { type: 'string' } },
      required: [argName],
    },
  },
});

export const TOOL_SCHEMAS: ToolSchema[] = [
  readOnly('search_web', '搜尋網路上的公開資料。', 'query'),
  readOnly('read_docs', '讀內部文件。', 'path'),
  readOnly('search_repo', '搜尋 codebase。', 'query'),
  readOnly('query_db', '對資料庫下唯讀查詢。', 'sql'),
  {
    type: 'function',
    function: {
      name: 'update_ticket',
      description: '寫回整理後的卡：Goal、Scope in、Scope out、AC 標註。可以重複呼叫覆寫自己寫過的內容。',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          goal: { type: 'string' },
          scope_in: stringList,
          scope_out: stringList,
          ac_flags: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ac: { type: 'integer', description: 'AC 條號，從 1 開始' },
                type: { type: 'string', enum: FLAG_TYPES },
                note: { type: 'string' },
              },
              required: ['ac', 'type'],
            },
          },
        },
        required: ['ticket_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_acceptance_criteria',
      description: '覆寫需求方親手寫的 AC 原文。破壞性、不可逆，必須先得到人的同意。',
      parameters: {
        type: 'object',
        properties: { ticket_id: { type: 'string' }, acceptance_criteria: stringList },
        required: ['ticket_id', 'acceptance_criteria'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_comment',
      description: '在卡上留言。tag 到的人會立刻收到通知，送出後收不回。',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          body: { type: 'string' },
          mentions: stringList,
        },
        required: ['ticket_id', 'body'],
      },
    },
  },
];

export async function dispatch(call: ToolCall, store: TicketStore): Promise<string> {
  const stub = READONLY_STUB[call.name];
  if (stub !== undefined) return stub;

  const args = call.args as Record<string, any>;
  const ticketId = String(args.ticket_id ?? '');

  try {
    switch (call.name) {
      case 'update_ticket': {
        const flags = args.ac_flags as AcFlag[] | undefined;
        if (flags) {
          for (const f of flags) {
            if (!FLAG_TYPES.includes(f.type)) {
              return `錯誤：標註類別只能是 ${FLAG_TYPES.join('、')}，收到 ${String(f.type)}`;
            }
          }
        }
        await store.updateTicket(ticketId, {
          ...(args.goal !== undefined ? { goal: String(args.goal) } : {}),
          ...(args.scope_in !== undefined ? { scopeIn: (args.scope_in as unknown[]).map(String) } : {}),
          ...(args.scope_out !== undefined ? { scopeOut: (args.scope_out as unknown[]).map(String) } : {}),
          ...(flags !== undefined ? { acFlags: flags } : {}),
        });
        return '已寫回卡上。';
      }

      case 'replace_acceptance_criteria':
        // Day 22 會把這條抽成 src/gates/。最小版就先拒絕，
        // 不能推一個預設會覆寫需求方 AC 的東西到公開 repo。
        return '拒絕：覆寫需求方寫的 AC 是不可逆的動作，需要人確認之後才能執行。請改用 post_comment 說明你想改什麼。';

      case 'post_comment':
        await store.postComment(ticketId, String(args.body), (args.mentions ?? []).map(String));
        return '留言已送出，tag 到的人已經收到通知。';

      default:
        return `錯誤：沒有這個工具 ${call.name}`;
    }
  } catch (err) {
    return `錯誤：${err instanceof Error ? err.message : String(err)}`;
  }
}
```

- [ ] **Step 5: 跑測試確認它通過**

Run: `node --test src/agent/tools.test.ts`
Expected: `pass 7`、`fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/agent/tools.ts src/agent/readonly-stub.ts src/agent/tools.test.ts
git commit -m "feat(agent): 7 個 tool 的 schema 與 dispatch，唯讀四個先固定回傳"
```

---

### Task 11: system prompt 與 agent loop

**Files:**
- Create: `src/agent/prompt.ts`, `src/agent/loop.ts`
- Test: `src/agent/loop.test.ts`, `src/agent/prompt.test.ts`

**Interfaces:**
- Consumes: `LlmClient`／`ToolCall`／`ToolSchema`／`LlmMessage` from `src/llm/client.ts`；`TicketStore` from `src/store/ticket-store.ts`；`TOOL_SCHEMAS`／`dispatch` from `src/agent/tools.ts`
- Produces:
  - `const SYSTEM_PROMPT: string`
  - `type TrajectoryStep`／`type Trajectory = { ticketId: string; steps: TrajectoryStep[]; stoppedBy: 'no_tool_calls' | 'max_turns' }`
  - `runAgent(opts: { ticketId: string; store: TicketStore; llm: LlmClient; maxTurns?: number }): Promise<Trajectory>`

- [ ] **Step 1: 寫 prompt 與守住那一行的測試**

`src/agent/prompt.ts`：

```ts
/**
 * Day 3 changes exactly one line in here, Day 12 deletes it, Day 28 shortens it.
 * Every one of those has to show up as a single-line diff, so keep one
 * instruction per line and never reflow this string.
 */
export const SYSTEM_PROMPT = `你是需求釐清 agent。你的工作是把需求方寫的雜亂 ticket 整理成結構化的 ticket，並標出 AC 裡有問題的那幾條。

四個步驟：
1. 拆 description：哪句講目標、哪句畫範圍、哪句其實是其他 ticket 的事
2. 查背景：需要什麼就用對外查資料的工具去查，查幾次由你決定
3. 逐條檢查 AC：每一條 AC 對三類問題各檢查一次
4. 寫回去：用 update_ticket 把結果寫回卡上

三類問題：
- conflict：這條 AC 跟另一條互相打架
- unverifiable：這條 AC 沒有寫清楚怎樣算做完
- mismatch：這條 AC 跟 description 說的不一樣

整理後的卡有四個區塊，全部用 update_ticket 寫回：
- goal：這張卡要做什麼，一句話
- scope_in：做的範圍，一項一個字串
- scope_out：不做的範圍，一項一個字串
- ac_flags：標註，每個標註是 { ac: 條號, type: 類別 }。同一條 AC 可以有多個標註。

規則：
- scope_in 與 scope_out 是字串陣列，不要把好幾件事塞進同一個字串
- 不要覆寫需求方寫的 AC 原文
- 寫回去之後就結束，不要再呼叫工具`;
```

`src/agent/prompt.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SYSTEM_PROMPT } from './prompt.ts';

test('the Day 3 line exists verbatim on a line of its own', () => {
  // Day 12 刪掉這一行再跑，Day 28 把它收短前後各跑 k 次。
  // 兩天都要求它在 diff 裡是單獨一行的變更，所以它不能被折進段落。
  const lines = SYSTEM_PROMPT.split('\n').map((l) => l.trim());
  assert.ok(
    lines.some((l) => l.endsWith('每一條 AC 對三類問題各檢查一次')),
    'the line must stay on its own line',
  );
});

test('the prompt names the three flag types by their enum values', () => {
  for (const t of ['conflict', 'unverifiable', 'mismatch']) {
    assert.match(SYSTEM_PROMPT, new RegExp(t));
  }
});
```

- [ ] **Step 2: 跑 prompt 測試確認它通過**

Run: `node --test src/agent/prompt.test.ts`
Expected: `pass 2`、`fail 0`

- [ ] **Step 3: 寫 loop 的失敗測試**

`src/agent/loop.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAgent } from './loop.ts';
import { FakeStore } from '../store/fake-store.ts';
import type { LlmClient, LlmMessage, LlmReply } from '../llm/client.ts';
import type { Ticket } from '../store/ticket-store.ts';

const seed = (): Ticket => ({
  id: 'T-1',
  name: '優惠碼功能',
  description: '業務下週要跑活動',
  acceptanceCriteria: ['一人只能用一次', '可以無限次使用'],
  goal: null,
  scopeIn: [],
  scopeOut: [],
  acFlags: [],
  comments: [],
});

class ScriptedLlm implements LlmClient {
  seen: LlmMessage[][] = [];
  #script: LlmReply[];
  constructor(script: LlmReply[]) {
    this.#script = [...script];
  }
  async chat(messages: LlmMessage[]): Promise<LlmReply> {
    this.seen.push([...messages]);
    return this.#script.shift() ?? { text: '沒話說了', toolCalls: [] };
  }
}

test('runs until the model stops calling tools', async () => {
  const llm = new ScriptedLlm([
    { text: null, toolCalls: [{ id: 'a', name: 'search_repo', args: { query: 'promo' } }] },
    {
      text: null,
      toolCalls: [
        {
          id: 'b',
          name: 'update_ticket',
          args: { ticket_id: 'T-1', goal: '優惠碼', ac_flags: [{ ac: 2, type: 'conflict' }] },
        },
      ],
    },
    { text: '整理完了', toolCalls: [] },
  ]);
  const store = FakeStore.fromTicket(seed());

  const traj = await runAgent({ ticketId: 'T-1', store, llm });

  assert.equal(traj.stoppedBy, 'no_tool_calls');
  assert.equal((await store.getTicket('T-1')).goal, '優惠碼');
  assert.deepEqual(
    traj.steps.filter((s) => s.kind === 'tool_result').map((s) => s.name),
    ['search_repo', 'update_ticket'],
  );
});

test('the ticket body reaches the model in the first user message', async () => {
  const llm = new ScriptedLlm([{ text: 'done', toolCalls: [] }]);
  await runAgent({ ticketId: 'T-1', store: FakeStore.fromTicket(seed()), llm });

  const first = llm.seen[0]!;
  assert.equal(first[0]!.role, 'system');
  const user = first[1] as { role: 'user'; content: string };
  assert.match(user.content, /優惠碼功能/);
  assert.match(user.content, /2\. 可以無限次使用/);
});

test('stops at maxTurns instead of looping forever', async () => {
  const forever = new ScriptedLlm(
    Array.from({ length: 20 }, () => ({
      text: null,
      toolCalls: [{ id: 'x', name: 'search_web', args: { query: 'q' } }],
    })),
  );
  const traj = await runAgent({
    ticketId: 'T-1',
    store: FakeStore.fromTicket(seed()),
    llm: forever,
    maxTurns: 3,
  });
  assert.equal(traj.stoppedBy, 'max_turns');
  assert.equal(traj.steps.filter((s) => s.kind === 'assistant').length, 3);
});

test('a tool error is fed back to the model instead of crashing the run', async () => {
  const llm = new ScriptedLlm([
    { text: null, toolCalls: [{ id: 'a', name: 'nope', args: {} }] },
    { text: 'ok', toolCalls: [] },
  ]);
  const traj = await runAgent({ ticketId: 'T-1', store: FakeStore.fromTicket(seed()), llm });
  const result = traj.steps.find((s) => s.kind === 'tool_result')!;
  assert.match(result.result, /nope/);
  assert.equal(traj.stoppedBy, 'no_tool_calls');
});
```

- [ ] **Step 4: 跑測試確認它失敗**

Run: `node --test src/agent/loop.test.ts`
Expected: FAIL —— `Cannot find module './loop.ts'`

- [ ] **Step 5: 寫最小實作**

`src/agent/loop.ts`：

```ts
import type { LlmClient, LlmMessage, ToolCall } from '../llm/client.ts';
import type { Ticket, TicketStore } from '../store/ticket-store.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import { TOOL_SCHEMAS, dispatch } from './tools.ts';

export type TrajectoryStep =
  | { kind: 'assistant'; text: string | null; toolCalls: ToolCall[] }
  | { kind: 'tool_result'; name: string; args: Record<string, unknown>; result: string };

export type Trajectory = {
  ticketId: string;
  steps: TrajectoryStep[];
  stoppedBy: 'no_tool_calls' | 'max_turns';
};

export async function runAgent(opts: {
  ticketId: string;
  store: TicketStore;
  llm: LlmClient;
  maxTurns?: number;
}): Promise<Trajectory> {
  const maxTurns = opts.maxTurns ?? 12;
  const ticket = await opts.store.getTicket(opts.ticketId);

  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: renderTicket(ticket) },
  ];
  const steps: TrajectoryStep[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const reply = await opts.llm.chat(messages, TOOL_SCHEMAS);
    steps.push({ kind: 'assistant', text: reply.text, toolCalls: reply.toolCalls });

    if (reply.toolCalls.length === 0) {
      return { ticketId: opts.ticketId, steps, stoppedBy: 'no_tool_calls' };
    }

    messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls });

    for (const call of reply.toolCalls) {
      const result = await dispatch(call, opts.store);
      steps.push({ kind: 'tool_result', name: call.name, args: call.args, result });
      messages.push({ role: 'tool', toolCallId: call.id, content: result });
    }
  }

  return { ticketId: opts.ticketId, steps, stoppedBy: 'max_turns' };
}

function renderTicket(t: Ticket): string {
  const ac = t.acceptanceCriteria.map((line, i) => `${i + 1}. ${line}`).join('\n');
  return `ticket_id: ${t.id}
name: ${t.name}
description:
${t.description}
AC:
${ac}`;
}
```

- [ ] **Step 6: 跑測試確認它通過**

Run: `node --test src/agent/loop.test.ts`
Expected: `pass 4`、`fail 0`

- [ ] **Step 7: 跑全部測試與 typecheck**

Run: `npm test && npm run typecheck`
Expected: 全綠

- [ ] **Step 8: Commit**

```bash
git add src/agent/
git commit -m "feat(agent): system prompt 與 tool-use 迴圈"
```

---

### Task 12: 一鍵跑一筆 case 並寫 runs/

**Files:**
- Create: `src/cli/run-case.ts`, `src/cli/report.ts`
- Test: `src/cli/report.test.ts`
- Modify: `package.json`（加 `run` script）

**Interfaces:**
- Consumes: `loadCase`／`toTicket`、`FakeStore.fromTicket`、`runAgent`、`actualFields`、`scoreCase`、`OpenAiCompatClient`
- Produces: `formatScore(score: CaseScore): string`；`node --env-file=.env src/cli/run-case.ts dataset/ac-conflict-001.yaml`

- [ ] **Step 1: 寫報表的失敗測試**

`src/cli/report.test.ts`：

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatScore } from './report.ts';

test('a failing field prints what is missing and what was unexpected', () => {
  const out = formatScore({
    caseId: 'ac-conflict-001',
    pass: false,
    fields: [
      { field: 'ac_flags', mode: 'exact_set', pass: false, missing: ['3:mismatch'], unexpected: ['5:conflict'] },
      { field: 'goal', mode: 'must_include', pass: true, missing: [], unexpected: [] },
      { field: 'tool_calls', mode: 'ignore', pass: null, missing: [], unexpected: [], note: '不比' },
    ],
  });

  assert.match(out, /FAIL\s+ac-conflict-001/);
  assert.match(out, /ac_flags/);
  assert.match(out, /-\s*3:mismatch/);
  assert.match(out, /\+\s*5:conflict/);
  assert.match(out, /tool_calls/);
  assert.match(out, /不比/);
});

test('an all-green case prints PASS', () => {
  const out = formatScore({
    caseId: 'x',
    pass: true,
    fields: [{ field: 'goal', mode: 'must_include', pass: true, missing: [], unexpected: [] }],
  });
  assert.match(out, /PASS\s+x/);
});
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `node --test src/cli/report.test.ts`
Expected: FAIL —— `Cannot find module './report.ts'`

- [ ] **Step 3: 寫 report 實作**

`src/cli/report.ts`：

```ts
import type { CaseScore } from '../scorer/goal-state.ts';

/** `-` is what the goal state expected and did not get, `+` is what showed up uninvited. */
export function formatScore(score: CaseScore): string {
  const lines = [`${score.pass ? 'PASS' : 'FAIL'}  ${score.caseId}`];

  for (const f of score.fields) {
    const mark = f.pass === null ? '·' : f.pass ? '✓' : '✗';
    lines.push(`  ${mark} ${f.field} (${f.mode})${f.note ? `  ${f.note}` : ''}`);
    for (const m of f.missing) lines.push(`      - ${m}`);
    for (const u of f.unexpected) lines.push(`      + ${u}`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `node --test src/cli/report.test.ts`
Expected: `pass 2`、`fail 0`

- [ ] **Step 5: 寫 run-case.ts**

`src/cli/run-case.ts`：

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase, toTicket } from '../dataset/case.ts';
import { FakeStore } from '../store/fake-store.ts';
import { OpenAiCompatClient } from '../llm/openai-compat.ts';
import { runAgent } from '../agent/loop.ts';
import { actualFields } from '../scorer/from-ticket.ts';
import { scoreCase } from '../scorer/goal-state.ts';
import { formatScore } from './report.ts';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name} (see .env.example)`);
  return v;
}

const casePath = process.argv[2];
if (!casePath) throw new Error('usage: node --env-file=.env src/cli/run-case.ts <case.yaml>');

const testCase = loadCase(casePath);
// A fresh store per run: a run must never start from a ticket a previous run tidied up.
const store = FakeStore.fromTicket(toTicket(testCase));

const llm = new OpenAiCompatClient({
  baseUrl: required('LLM_BASE_URL'),
  apiKey: required('LLM_API_KEY'),
  model: required('LLM_MODEL'),
});

const trajectory = await runAgent({ ticketId: testCase.id, store, llm });
const finalTicket = await store.getTicket(testCase.id);
const score = scoreCase(testCase.id, testCase.goalState, actualFields(finalTicket));

console.log(formatScore(score));

const dir = join('runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${testCase.id}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(trajectory, null, 2));
writeFileSync(join(dir, 'score.json'), JSON.stringify(score, null, 2));
writeFileSync(join(dir, 'final-ticket.json'), JSON.stringify(finalTicket, null, 2));
writeFileSync(join(dir, 'model.json'), JSON.stringify({ model: process.env.LLM_MODEL }, null, 2));
console.log(`\nrun 寫到 ${dir}`);

process.exitCode = score.pass ? 0 : 1;
```

- [ ] **Step 6: 加 npm script**

```bash
npm pkg set scripts.run="node --env-file=.env src/cli/run-case.ts"
```

- [ ] **Step 7: 跑全部測試與 typecheck**

Run: `npm test && npm run typecheck`
Expected: 全綠

- [ ] **Step 8: Commit**

```bash
git add src/cli/ package.json
git commit -m "feat(cli): 一鍵跑一筆 case，印 diff 並寫進 runs/"
```

---

### Task 13: 填 goal_state，跑出第一份 diff

這個 task 的 commit 是 Day 10 要連的 permalink。

**Files:**
- Modify: `dataset/ac-conflict-001.yaml`, `dataset/case.test.ts`, `README.md`
- Create: `runs/<timestamp>-ac-conflict-001/`（跑出來的產物）

**Interfaces:**
- Consumes: Task 12 的 `npm run`
- Produces: 填好 `goal_state` 的 `dataset/ac-conflict-001.yaml`

- [ ] **Step 1: 追加會失敗的測試**

在 `dataset/case.test.ts` 追加：

```ts
import { loadCase } from '../src/dataset/case.ts';

test('ac-conflict-001 pins the four flags as a set', () => {
  const c = loadCase('dataset/ac-conflict-001.yaml');
  assert.deepEqual(c.goalState.ac_flags, {
    mode: 'exact_set',
    values: ['3:conflict', '3:mismatch', '4:unverifiable', '7:unverifiable'],
  });
  // 釘的是集合不是總數：標對 4 個跟標錯 4 個分得出來。
  assert.equal(new Set((c.goalState.ac_flags as { values: string[] }).values).size, 4);
});

test('ac-conflict-001 keeps the ungradable cells written down', () => {
  const c = loadCase('dataset/ac-conflict-001.yaml');
  for (const field of ['comment_wording', 'tool_calls', 'goal_wording']) {
    assert.equal(c.goalState[field]!.mode, 'ignore', `${field} must stay written down`);
  }
});
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `node --test dataset/case.test.ts`
Expected: FAIL —— `goalState.ac_flags` 是 `undefined`

- [ ] **Step 3: 把 goal_state 填進 dataset/ac-conflict-001.yaml**

把檔尾的 `# goal_state 明天填（Day 10）` 換成：

```yaml
goal_state:
  goal:      { mode: must_include, keywords: [] }
  scope_in:  { mode: must_include, keywords: [優惠碼套用, 後台建立, 過期處理] }
  scope_out: { mode: must_include, keywords: [結帳頁效能] }
  ac_flags:
    mode: exact_set
    values: [3:conflict, 3:mismatch, 4:unverifiable, 7:unverifiable]
  comment_wording: { mode: ignore, note: 措辭不比 }
  tool_calls:      { mode: ignore, note: 查了幾次、查了誰不比 }
  goal_wording:    { mode: ignore, note: 判不到 —— 這句寫得夠不夠精準沒有程式判得出來 }
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `npm test`
Expected: 全綠

- [ ] **Step 5: 真的跑一次**

先確認 `.env` 有三個變數，然後：

Run: `npm run dataset/ac-conflict-001.yaml`

Expected: 印出 `PASS` 或 `FAIL` 加逐格 diff，並在 `runs/` 生出一個目錄。**第一次跑很可能是 FAIL，那是正常的** —— 這份 diff 本身就是 Day 15 的材料。不要為了讓它變綠而改 goal state；要改就改 prompt，而且改 prompt 之後要重跑並留下第二筆 `runs/`。

- [ ] **Step 6: 更新 README 的「目前實作到哪」**

改成：Day 9 的 case 檔（輸入本體 + goal state）、Day 10 的 goal state 三檔、Day 2 的 7 個 tool 與四個區塊、Day 4 的多輪 tool-use 迴圈、Day 15 的第一份 diff。唯讀四工具仍是固定回傳，Day 11 的 fixture 錄放尚未實作。

- [ ] **Step 7: Commit**

```bash
git add dataset/ README.md runs/
git commit -m "feat(dataset): ac-conflict-001 的 goal state，並跑出第一份 diff"
```

- [ ] **Step 8: 請 Ray 點頭後 push，並把 SHA 回報給 ironman2026 session**

```bash
git push origin main
git rev-parse HEAD
```

---

## Self-Review

**Spec coverage**

| Spec 段落 | Task |
|---|---|
| 五條定案（LlmClient／標註歸屬／英文 enum／YAML／exact_set） | 9／10／7＋10／1＋7／2–5 |
| 架構檔案表 | 1–13 全部覆蓋，無遺漏檔案 |
| 環境變數 | 1（`.env.example`）、12（`required()`） |
| `TicketStore` 介面與 `Ticket` 型別 | 6 |
| 乾淨環境靠不共用實例 | 6（`fromTicket`）、12（每次 run 現建） |
| 7 個 tool、唯讀固定回傳、`replace_acceptance_criteria` 拒絕 | 10 |
| case 檔格式與五類 category | 1（input-only）、7（loader）、13（goal_state） |
| scorer 三檔與 `CaseScore` | 3／4／5 |
| 欄位到 store 的對應 | 8 |
| TDD 六步順序 | 2（normalize）→3（exact_set＋canonical key）→4（must_include）→5（ignore＋組裝＋Day 3 掉法） |
| `runs/` 從第一次跑就寫 | 12 |
| `.gitignore` 補 `raw/` | 1 |
| prompt 那一行逐字單獨一行 | 11（含守它的測試） |
| `engines.node` 與 README 版本 | 1 |
| 兩個 SHA（Day 9／Day 10） | 1 Step 11／13 Step 8 |

**Placeholder scan:** 無 TBD／TODO；每個 code step 都有可貼上的完整程式碼；沒有「參考 Task N」。

**Type consistency:** `FieldSpec`／`FieldVerdict`／`GoalState`／`CaseScore` 在 Task 3–5 定義，Task 7、8、12 沿用同名；`flagKey` 在 Task 3 定義、Task 8 使用；`FakeStore.fromTicket` 在 Task 6 定義，Task 10、11、12 一致使用（非 `fromCase` —— spec 寫 `fromCase`，計畫改成 `fromTicket` 並由 Task 7 的 `toTicket` 銜接，責任更乾淨）；`TOOL_SCHEMAS`／`dispatch` 在 Task 10 定義，Task 11 使用；`LlmMessage` 的 `toolCallId` 在 Task 9 定義，Task 11 使用同名。

**一處與 spec 的刻意分歧：** spec 寫 `FakeStore.fromCase(case)`，計畫改為 `FakeStore.fromTicket(ticket)` + `toTicket(case)`。理由是 store 不該認識 dataset 的型別；效果相同（每次 run 現建一份），但依賴方向乾淨。
