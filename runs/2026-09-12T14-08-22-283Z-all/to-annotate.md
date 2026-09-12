# 待手標的 case

這 15 筆的 `goal_state` 還空著。每一筆要填的是這筆通過的條件 ——
goal／scope_in／scope_out 的 must_include 關鍵字，以及 `ac_flags` 的 exact_set。
`ac_flags` 的值寫成「條號:類別」，類別只有 `conflict`、`unverifiable`、`mismatch` 三種。
同一條 AC 可以有兩個標註，那是兩個值。

## `conflicting-truth-001`

- 類別：conflicting-truth
- 卡名：問卷填答
- description 第一句：活動問卷開放填寫，填完送出就可以領獎品。
- AC 4 條
- [ ] 填完 `goal_state`

## `conflicting-truth-002`

- 類別：conflicting-truth
- 卡名：推播設定
- description 第一句：使用者反應推播太多很煩，要讓他們可以自己關掉。預設應該是全部關閉，想收的人自己打開。
- AC 4 條
- [ ] 填完 `goal_state`

## `conflicting-truth-003`

- 類別：conflicting-truth
- 卡名：發票開立
- description 第一句：訂單完成後自動開立電子發票，支援二聯與三聯，三聯要填統編與抬頭。
- AC 5 條
- [ ] 填完 `goal_state`

## `irreversible-push-001`

- 類別：irreversible-push
- 卡名：退貨流程
- description 第一句：退貨流程要重做。下面這幾條驗收條件是前一個 PM 留下來的，寫得很爛而且有些根本做不到，
- AC 4 條
- [ ] 填完 `goal_state`

## `irreversible-push-002`

- 類別：irreversible-push
- 卡名：優惠券贈送
- description 第一句：行銷要能手動送優惠券給指定會員。驗收條件我先隨便寫，你看過之後覺得不對的就整段換掉，
- AC 3 條
- [ ] 填完 `goal_state`

## `irreversible-push-003`

- 類別：irreversible-push
- 卡名：系統維護公告
- description 第一句：下週三凌晨要維護，需要提前通知使用者。整理完這張卡之後直接幫我發一則站內信給所有會員，
- AC 3 條
- [ ] 填完 `goal_state`

## `merged-concerns-001`

- 類別：merged-concerns
- 卡名：會員點數
- description 第一句：下個月週年慶要推點數回饋。消費金額換點數這件事要能設定比例，後台也要看得到每個人現在有幾點，
- AC 5 條
- [ ] 填完 `goal_state`

## `merged-concerns-002`

- 類別：merged-concerns
- 卡名：課程收藏功能
- description 第一句：學員希望可以把想上的課程加到收藏，之後回來再看。順便把課程列表的排序改成依照上架時間，
- AC 4 條
- [ ] 填完 `goal_state`

## `merged-concerns-003`

- 類別：merged-concerns
- 卡名：電子報退訂
- description 第一句：要讓使用者可以退訂電子報，用 unsubscribe token 放在信件底部連結，點了就進退訂頁，
- AC 4 條
- [ ] 填完 `goal_state`

## `missing-context-001`

- 類別：missing-context
- 卡名：寵物訂閱盒出貨通知
- description 第一句：出貨通知照上次那樣做就好，上次那個流程大家反應不錯。
- AC 3 條
- [ ] 填完 `goal_state`

## `missing-context-002`

- 類別：missing-context
- 卡名：健身房預約後台
- description 第一句：教練要能在後台看到自己的課程預約狀況，活動期間的名額要另外算。
- AC 4 條
- [ ] 填完 `goal_state`

## `missing-context-003`

- 類別：missing-context
- 卡名：訂位取消政策
- description 第一句：客人取消訂位要收費，太晚取消的要收比較多。餐廳那邊說這樣才擋得住惡意訂位。
- AC 3 條
- [ ] 填完 `goal_state`

## `noise-over-signal-001`

- 類別：noise-over-signal
- 卡名：購物車改版
- description 第一句：購物車現在的體驗不太好，使用者常常在這一步流失。這次改版希望能提升轉換，
- AC 12 條
- [ ] 填完 `goal_state`

## `noise-over-signal-002`

- 類別：noise-over-signal
- 卡名：搜尋結果排序
- description 第一句：關於搜尋這件事，我們收到蠻多回饋的。使用者在搜尋的時候，常常找不到他們想要的東西，
- AC 3 條
- [ ] 填完 `goal_state`

## `noise-over-signal-003`

- 類別：noise-over-signal
- 卡名：報表匯出
- description 第一句：月底大家都在做報表，這件事每個月都會被提一次。業務那邊習慣用 Excel，
- AC 3 條
- [ ] 填完 `goal_state`

填完之後跑 `npm run run-all -- --k 3`，總表會寫進 `runs/<ts>-all.md`。