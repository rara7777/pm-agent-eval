# Day 12 素材｜判別力檢查

把 system prompt 裡「每一條 AC 對三類問題各檢查一次」那一行刪掉，其他一個字不動，
對 `ac-conflict-001` 各跑三次，看分數掉不掉。這也是 Day 28 前後對照的第一筆。

- 原版　　prompt `cd590b9ba593`　`runs/2026-09-11T04-08-22-054Z-ac-conflict-001-k3-cd590b9ba593`
- 刪一行　prompt `64ab4d919668`　`runs/2026-09-12T14-10-36-688Z-ac-conflict-001-k3-64ab4d919668`
- 變體 prompt 存在 `prompts/no-per-ac-check.txt`，25 行變 24 行，差的就是那一行
- 模型 `gpt-5.4-mini`，同一份 fixture，k=3

## 掉了

| | 原版 | 刪掉那行 |
|---|---|---|
| 標對（3 次合計） | 8 | 5 |
| 漏報 | 4 | 7 |
| 多報 | 9 | 8 |
| precision | 47% | 38% |
| recall | 67% | 42% |
| 過/次 | 0/3 | 0/3 |

**recall 掉了 25 個百分點，pass 一動也不動。** 兩邊都是 0/3，通過率這個數字對這次改動
完全沒有反應。看得出差別的是逐條算的那組數字，不是 case 層級的過或不過。

這正是判別力要問的問題：把一個明顯變壞的版本餵進去，這份資料集有沒有回應。
以 pass 來看它沒有回應，以 precision／recall 來看它有。

## 掉在哪一格

| | 原版漏的 | 刪掉那行之後漏的 |
|---|---|---|
| run 1 | `3:mismatch` | `3:mismatch`、`7:unverifiable` |
| run 2 | `3:mismatch`、`7:unverifiable` | `3:mismatch`、`7:unverifiable` |
| run 3 | `3:mismatch` | `3:mismatch`、`4:unverifiable`、`7:unverifiable` |

掉的是 `unverifiable` 那一類：`7:unverifiable` 從三次漏一次變成三次全漏，
`4:unverifiable` 從沒漏過變成漏一次。

**跟推演的預期不一樣。** 原本推的是最先掉「與描述不符」，但 `3:mismatch` 原版三次就全漏了，
它沒有空間再掉。刪掉那一行實際打到的是「逐條掃過去」這個動作本身，
而最依賴逐條掃的是 `unverifiable` —— 那是一條一條看寫得清不清楚才發現得了的，
不像 `conflict` 兩條擺在一起就跳出來。

`3:mismatch` 在兩個版本、六次跑裡一次都沒被標到。那一格不是被這行指示守住的，
它從來就沒有被守住過。
