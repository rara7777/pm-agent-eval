# Day 19 素材｜同一張卡跑三次

批次目錄 `runs/2026-09-11T04-08-22-054Z-ac-conflict-001-k3-cd590b9ba593`。
同一顆模型 `gpt-5.4-mini`、同一個 prompt 版本 `cd590b9ba593`、同一份 fixture、
同一張卡 `ac-conflict-001`，連跑三次。輸入那一半跟外面那個世界都固定住了，
剩下的差異只有模型自己。

## 三次並排

| | 工具呼叫 | 查背景 | 標了幾個 | 過不過 |
|---|---|---|---|---|
| run 1 | 1 次（`update_ticket`） | 0 次 | 7 | FAIL |
| run 2 | 1 次（`update_ticket`） | 0 次 | 6 | FAIL |
| run 3 | 1 次（`update_ticket`） | 0 次 | 4 | FAIL |

三次都停在 `no_tool_calls`，三次都是 3 個 step。

**三次都沒有查背景。** 四個對外查資料的工具一次都沒被呼叫，四個步驟裡的第 2 步整步跳過。
這不是這一天的重點，但它解釋了為什麼 fixture 在這批裡是空的。

## 標註集合每次都不一樣

作者標的是 `3:conflict`、`3:mismatch`、`4:unverifiable`、`7:unverifiable`。

```
run 1  1:unverifiable  2:mismatch  3:conflict  4:unverifiable  5:mismatch  6:mismatch  7:unverifiable
run 2  2:conflict      3:conflict  4:unverifiable  5:mismatch  6:mismatch  7:mismatch
run 3  2:conflict      3:conflict  4:unverifiable  7:unverifiable
```

| | 標對 | 漏 | 多 |
|---|---|---|---|
| run 1 | 3 | 1 | 4 |
| run 2 | 2 | 2 | 4 |
| run 3 | 3 | 1 | 1 |

七個標註、六個標註、四個標註，沒有兩次一樣。run 3 看起來最接近，只多標了一個 `2:conflict`。

**`3:mismatch` 三次都漏。** 這一格不是抖動，是穩定地掉 —— 三次都看得出第 3 條跟第 2 條打架，
三次都沒有回頭讀 description。

## 三個數字

| | |
|---|---|
| pass@1 | 0/3 = 0% |
| pass@3 | ✗（三次裡沒有任何一次過） |
| pass^3 | ✗ |

pass@3 與 pass^3 這次同時是 ✗，看不出兩者的差別。要看出差別得等分數不是零的那批 ——
pass@3 ✓ 而 pass^3 ✗ 才是「跑一次會過、跑三次不一定」的那個狀況。

k 是重跑的次數，這批 k 是 3。
