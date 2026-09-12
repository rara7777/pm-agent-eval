# Redmine issue 怎麼變成一張 Ticket

eval 跟 production 跑的是同一個 loop、同一份 prompt、同一顆模型，差別只在誰來回答那四個
查資料的工具、以及卡從哪裡來。這份文件是「卡從哪裡來」那一半的對應規則。

## 欄位對應

| Redmine | `Ticket` | 說明 |
|---|---|---|
| `id` | `id` | 轉成字串，`#4821` 的 `4821` |
| `subject` | `name` | 原樣 |
| `description` | `description` | 切掉 AC 區塊之後剩下的部分 |
| `description` 或 custom field | `acceptanceCriteria` | 見下 |
| — | `goal`／`scopeIn`／`scopeOut`／`acFlags` | 一律空的，這四格是 agent 要填的 |
| — | `comments` | 空的。journals 先不拉 |

拉進來的卡跟 dataset 裡的 case 進到 loop 時形狀完全一樣，所以 agent 分不出這張卡是合成的
還是真的。這是刻意的：eval 量到的東西才有資格拿來預測 production 的表現。

## AC 怎麼從 description 切出來

切別人的排版是猜測，所以規則故意收窄，寧可回報「這張卡沒有 AC」也不從散文裡編出 AC。

1. **找標題行**。`AC`、`Acceptance Criteria`、`驗收條件`、`驗收標準`、`完成條件`、`驗收項目`，
   前面可以有 `#`～`######`、textile 的 `h1.`～`h6.`、或 `**`，後面可以有半形或全形冒號。
   大小寫不分。有多個就取第一個。
2. **往下收清單項目**，直到遇到下一個標題或檔尾。認得的項目符號是 `-`、`*`、`+`、
   `- [ ]` 勾選框、`1.`、`1)`、`(1)`、`（1）`。
3. **一項都沒認到就整張不動**，`acceptanceCriteria` 回空陣列，description 原封不動。
4. 切走的區塊會從 description 移除，其餘（包含 AC 之後的「備註」那類段落）留著。

**已知的取捨**：`#` 開頭的行一律當成 markdown 標題，所以 textile 的數字清單（也是 `#`）
會被當成區塊結束而不是 AC。一行文字沒辦法分辨這兩者，等真的遇到用 textile 的卡再說。

## custom field 優先

如果 issue 有一個名字命中上面那組標籤的 custom field，而且值不是空的，就用它，不切
description（description 保持完整）。欄位值一行一條，有沒有項目符號都吃。

理由是：有那個欄位的專案，AC 的正式來源就是那個欄位，description 裡重複的那份通常是舊的。

## production 模式為什麼不需要攔截層

三個寫回工具在 production 模式下什麼都不用改。這一趟本來就跑在記憶體裡的 store 上，
Redmine 從頭到尾沒有被碰過 —— 攔截層就是那個 store 本身。跑完之後把最終狀態寫成
`proposal.md` 給人看，人說可以才由另一個步驟寫回去。

`replace_acceptance_criteria` 走的是另一條線：它在 gate 就被擋下，兩個模式都一樣，
而且永遠不會被 apply，只會在建議留言裡列出整理過的 AC 讓人自己貼。

## 產物放哪裡

production 的 `runs-private/` 已經進 `.gitignore`，裡面有真實卡片的內容。
進版控的只有 `docs/production-runs.md` 那種不含卡片內容的統計（耗時、token、apply 與否）。
