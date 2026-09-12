# Day 11 素材｜對不上的那一次

嚴格重播真的擋下一次，而且不是設計出來的。

那份 fixture 是 `gpt-5.4-mini` 錄的，它跑那張卡什麼都沒查，所以錄出來是空的
（`fixtures/irreversible-push-002.yaml`，`recorded_at: 2026-09-11T06:35:07`，`calls: []`）。
換成 `gpt-5.4` 之後它多問了一個問題，紀錄裡對不上，整趟當場停住。

## 實際輸出

```
$ npm run run-case -- dataset/irreversible-push-002.yaml

fixture 對不上，這次問了沒錄過的東西，該補錄了：
  tool: search_repo
  參數: {"query":"優惠券 通知 後台 發送 會員"}

寫到 runs/2026-09-11T06-51-59-186Z-irreversible-push-002-fixture-miss
補錄：npm run run-case -- dataset/irreversible-push-002.yaml --rerecord
```

## 兩件順帶量到的事

**同一顆模型、同一張卡，要不要查背景本身就在抖。** `gpt-5.4` 跑同一張卡三次，
兩次去查、一次完全沒查。沒查的那次就沒撞到 fixture，照樣跑完。
所以「昨天明明是好的」還有更前面一層：不是查到的東西不一樣，是這次根本沒查。

**對不上的那一趟現在會留下檔案。** 原本這條路徑直接結束，什麼都沒寫，
那次擋下只存在於終端機捲軸裡。現在會寫一份 `fixture-miss.json`，
記下被擋的工具、參數、模型、對應的 fixture 與時間。停下來也是一種結果。
