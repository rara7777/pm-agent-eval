# Day 15 素材｜第一份 diff

第一次真的把 agent 接上 LLM 跑 `ac-conflict-001`，結果是 FAIL。
run 目錄 `runs/2026-09-11T01-47-45-125Z-ac-conflict-001`，模型 `gpt-5.4-mini`，
prompt 版本 `cd590b9ba593`，整趟 9 秒、5 steps、2 次 `update_ticket`，沒查過背景。

## 可貼的片段

```
FAIL  ac-conflict-001
  ✓ goal (must_include)
  ✗ scope_in (must_include)
      - 後台建立
      - 過期處理
  ✓ scope_out (must_include)
  ✗ ac_flags (exact_set)
      - 3:mismatch
      - 4:unverifiable
      + 2:mismatch
      + 4:mismatch
      + 5:unverifiable
      + 6:mismatch
  · comment_wording (ignore)  措辭不比
  · tool_calls (ignore)  查了幾次、查了誰不比
  · goal_wording (ignore)  判不到 —— 這句寫得夠不夠精準沒有程式判得出來
```

`-` 是 goal state 期望而沒拿到的，`+` 是沒期望卻冒出來的。

## `ac_flags` 那一格

作者標了 4 個：`3:conflict`、`3:mismatch`、`4:unverifiable`、`7:unverifiable`。
agent 標了 6 個，其中對的只有 2 個。

| | |
|---|---|
| 標對 | `3:conflict`、`7:unverifiable` |
| 漏掉 | `3:mismatch`、`4:unverifiable` |
| 多標 | `2:mismatch`、`4:mismatch`、`5:unverifiable`、`6:mismatch` |

**漏掉的那個 `3:mismatch` 就是推演過會掉的那一格。** 它看出第 3 條「可以無限次使用」
跟第 2 條「一人只能用一次」打架，但沒有回頭讀 description 裡「不要被亂用」那句，
所以第 3 條身上的第二個標註沒有出現。第 4 條它也標了，但標成 `mismatch` 而不是 `unverifiable`。

## `scope_in` 那一格：判紅了，可是概念都在

這一格值得單獨記一筆，因為紅的原因可能不在 agent 身上。

goal state 的關鍵字是 `優惠碼套用`、`後台建立`、`過期處理`，agent 實際寫回去的 `scope_in` 是：

```
使用者可在結帳時輸入優惠碼
系統可依優惠碼套用折扣後金額
後台可新增優惠碼
後台可設定折扣百分比
後台可設定固定金額折扣
優惠碼有使用限制機制
活動結束後優惠碼失效
已套用優惠碼的既有訂單不受失效影響
手機版可使用優惠碼
手機版結帳流程可正常操作
```

「後台建立」對應的是「後台可新增優惠碼」，「過期處理」對應的是「活動結束後優惠碼失效」。
概念兩個都在，只是換了措辭。`must_include` 目前是 normalize 之後做字面 substring
（`src/scorer/normalize.ts` 只做 NFKC 與收空白），對不上就算 missing。

改不改由作者決定，這裡只記證據。要注意的是兩個方向都有代價：比對放寬會讓「判得到」這件事
自己變成一個要判的東西，維持字面則要求 goal state 的關鍵字寫得跟輸出的措辭同一套。
