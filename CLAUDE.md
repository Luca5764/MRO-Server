@AGENTS.md

# Claude Code 專用補充

專案規則全部在 `AGENTS.md`，三家共用，**要改規則就改那份，不要改這裡**。這裡只放 Claude Code 特有的做法。

- Claude 主力是**高階**，依 `AGENTS.md` 的權限表行事。
- 大量讀取（整份紀錄、長篇 decompile、舊台帳搜尋）交給 `.claude/agents/` 裡的 Sonnet 子 agent，主力只讀摘要，把額度留給判斷和審查。子 agent 屬於**中階**，交代任務時用 `AGENTS.md` 的契約格式。
- commit 訊息最後一行寫 `Agent: claude (高階)`。
