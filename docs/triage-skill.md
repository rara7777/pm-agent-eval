# `/triage` skill 的草稿

**這份還沒生效。** 要啟用就把下面的內容存成 `.claude/skills/triage/SKILL.md`。
放在 `docs/` 是因為加一個 skill 等於改這個 repo 的 Claude Code 設定，那要作者自己點頭。

---

```markdown
---
name: triage
description: 用需求釐清 agent 整理一張 Redmine ticket，產出提案給人看過，人說可以才貼回 Redmine。Use when the user asks to triage, 整理, or 釐清 a Redmine issue by number, or says /triage <issue-id>.
---

# Triage 一張 Redmine ticket

三步，中間一定要停。

## 1. 把卡拉下來寫成檔案

用 `mcp__redmine-uccu__redmine_request` 讀 issue（`GET /issues/<id>.json`），
把回來的 JSON 原樣存成 `runs-private/inbox/<id>.json`。

不要自己改寫卡的內容，也不要只存摘要 —— agent 要讀的是需求方原本寫的字。

## 2. 跑 agent

    npm run triage -- --ticket runs-private/inbox/<id>.json

它會在 `runs-private/<時間>-<id>/proposal.md` 產出提案，並印出耗時與 token。
**這一步不會碰 Redmine。** agent 跑在記憶體裡的 store 上，沒有任何一條線通到 Redmine。

## 3. 停下來，把提案給人看

把 `proposal.md` 的內容貼給使用者，然後停住。

**未經使用者在這一輪明確說可以，不得貼任何東西回 Redmine。**
「他上次說可以」不算，「這張看起來沒問題」不算，「他叫我 triage 就是要我貼」也不算。
沒有得到這一輪的同意就結束，把提案留在檔案裡。

得到同意之後，用 `mcp__redmine-uccu__redmine_request` 加一則 comment
（`PUT /issues/<id>.json`，body 放 `{"issue":{"notes":"..."}}`），內容就是提案裡的「建議留言全文」。

## 永遠不做的事

- **不覆寫需求方寫的 AC。** 整理過的 AC 只能在留言裡當建議列出來，讓人自己決定要不要改。
  agent 本體那條 gate 也會擋，這裡是第二道。
- **不改 issue 的 description**，除非使用者這一輪明講要改。
- **不 tag 任何人**，除非使用者這一輪明講要 tag 誰。tag 出去收不回。

## 卡的內容不要外流

`runs-private/` 已經在 `.gitignore` 裡。真實卡片的內容不要複製到 `docs/`、`runs/`、
commit message 或任何會進版控的地方。要記統計就只記耗時、token、有沒有 apply。
```
