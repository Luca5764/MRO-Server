# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 交接快照（2026-09-18 23:20，Claude 高階）

> 規則：本段每次交接**整段改寫**，舊內容看 git 歷史。規則看 `AGENTS.md`，現況看 `docs/state.md`，任務看 `docs/backlog.md`。

### 環境

- 主目錄 `/home/lucas/mro-reverse` 固定停在 `reverse-work`，不要在裡面切分支。執行者各開 `~/mro-wt/<名稱>`。
- 伺服器在 tmux `server`，跑在 `~/mro-wt/test`（分支 `test-server`）。session log 集中在主目錄的 `Metal Rage Online Server/logs/`（worktree 用 symlink 指過去）；每份 log 的第一筆是 build 事件（分支、commit、dirty、非預設開關）。
- **每輪實測前，高階先把 `test-server` fast-forward 到 `reverse-work`**（`git -C ~/mro-wt/test merge --ff-only reverse-work`，再 `/reload` 或重啟）。有沒有落後，看 session log build 事件裡的 commit 就知道。
- 改 `dispatch/` 以內的程式：在伺服器 console 輸入 `/reload` 就能熱重載，連線不斷。改 `dispatch/` 以外的檔案（`packetlog.js`、`db.js` 等）才要完整重啟，操作者也要重登。
- AI 設定檔用 `mro-config`（本機 git，`~/mro-agents-config.git`）管版本。
- DB 設定 `database/config.json` 已移出版控。新 worktree 要用 symlink 指到主目錄那份。
- 操作者不喜歡為了驗證而重開客戶端。能用 DB 或 log 驗證的就不要請他重登。

### 今晚完成（都已進 `reverse-work`，細節在 state.md）

R11 紅隊槽、R12 暱稱 ANSI、L1 離開房間重設狀態、M1 G 幣持久化、M3a 購買後立即入庫、`/reload` 熱重載、log build 事件、N1 物品名稱表（`tools/item-names.py`）、P3 困難模式分析、backlog 拆出 `backlog-done.md`、`switch-audit.md` 補合併。回歸確認：`logs/session-20260918-225741.jsonl`（乾淨的 reverse-work，操作者有留 marker）。

### 失敗或暫停

- 房間頭像：R14（改送 51500101）、R15（改送 51100801）都沒有頭像 → 暫停，需要新證據（`journal/2026-09-18-2305`）。程式留在 `flash-wip-r14`。
- M2（ACK 先於 ItemInfo）❌，由 M3a 取代。

### 進行中

- A6 黃金樣本回歸測試：worker 在 `~/mro-wt/replay`（`flash-wip-replay`）。驗收條件：未改動的程式要全綠，故意改一個 byte 要變紅，兩者都要有。
- 合併 A6 之後才能做 C1（開關收斂，期限 2026-09-25）。

### 下一步（依序）

1. 審 A6 並合併 → 指派 C1。
2. P2（PvE 只保留主武器）：先做只讀分析。
3. 困難模式時間上限寫死 10 分鐘（`gate.game.dispatch.js` 的 `timeLimitMinutes`）：開一個單變數任務，改成跟隨房間的 PlayTime。
4. P1b 預設武器不發實體物品（不急）；H1、H3、H6、H7 維持原狀。
