# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 交接快照（2026-09-19 02:30，Claude 高階組長，額度約剩 11%）

> **目標與里程碑：`docs/roadmap.md`**。PM 是 Fable（tmux `fable`，session 名 `mro-reverse-68`，可以用 SendMessage 溝通）。高階組長負責派工、審查、合併、部署；實作和分析都交給 `.claude/agents/` 的 Sonnet 子 agent。
> 規則：本段每次交接**整段改寫**。規則看 `AGENTS.md`（`mro-config` 管版本），現況看 `docs/state.md`，任務看 `docs/backlog.md`。
> **跨公司審查暫缺**（Sol 無額度）：新標的 ✅ 一律加註「未經跨公司審查」，Sol 恢復後用 `grep -rl 未經跨公司審查 docs/` 補審。

### 環境

- 主目錄固定停在 `reverse-work`。執行者各開 `~/mro-wt/<名稱>`，**子 agent 絕對不可以動主目錄的工作區**（已經發生兩次誤寫主目錄再用 checkout 還原的事，契約裡要寫明）。
- 伺服器：tmux `server`，跑在 `~/mro-wt/test`（`test-server@df89287`，**dirty**：`GAME_INFO_TIME_LIMIT_MODE='room'` 開著，沒有 commit，build 事件有記錄）。`config/server.json`（publicHost=192.168.1.105）、`config/allowed-users.json`（Lucas、dusk）、`database/config.json` 放在主目錄，worktree 用 symlink 指過去。portproxy 已由操作者用 `lan-open.ps1` 開啟。
- 改 `dispatch/` 以內的檔案 → `/reload`；改 `rooms.js`、`auth-tokens.js`、`server.js`、`packetlog.js`、`config/`、`db.js` → 要完整重啟，操作者要重登。
- console 指令：`/reload`、`/conns`、`/drop <accountId>`。
- 測試：在 `Metal Rage Online Server/` 底下執行 `node test/replay-golden.js`（4 個黃金樣本）以及 `test/*.js` 的 7 個單元測試，合併前都要全綠。
- push：`reverse-work` 領先 origin 53 個 commit。這個 shell 沒有 GitHub 憑證，請操作者執行 `! git -C /home/lucas/mro-reverse -c credential.helper= -c credential.helper="/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe" push origin reverse-work`。

### 這一輪完成（M0 結案）

C1 開關收斂、A6b PvE 黃金樣本、X1 例外防護、W1 白名單、N0／N1 區網連線（第二台 dusk 已實際登入遊玩）、T1 時間上限跟隨房間 ✅、D1 第 0 步 token（單人實測帶回的值完全一致 ✅）、第 1 步 rooms.js、第 2 步房間聊天（單人實測 ✅）、K2 console 指令、E1 設計（ShareType +0x4F；IsShare 由客戶端自己查 Cache 算出）。全部未經跨公司審查。

### 更正過的錯誤結論（接手的人要知道）

- 「換地圖會斷線重連」、「客戶端被斷線後會自動重連」**都是錯的**：每一條 30907 連線前面都有完整的 9211 登入（`journal/2026-09-19-0230` 更正段）。所以不需要寬限時間，斷線就等於離開房間。
- P2 的「ShareType 是根因」❌。

### 進行中（交接時還在跑）

1. **D1 第 4 步修正**（worker，`~/mro-wt/d1s4`，分支 `flash-wip-d1s4`，目前到 `c7ecc45`）：PM 核對後要修兩項：(1) `enter-sa.md` 55–59 行：Room_Open 的 index 是 Enter_CQ 的 RoomIndex，客戶端用它查本地大廳清單拿房名（`0x107086c5` 待確認）；(2) `rooms.js` 的 `roomJoinMode`／`lobbyRoomListMode` 要能在 build 事件的 nonDefault 裡看到，也要確認 `ROOM_TEAM_CHAT_MODE`（let）還掃得到。**修完 → 送 PM 機械核對 → 才合併。** 如果 worker 的回報遺失，照 PM 在上一則訊息開的這兩點重新派人。
2. **R-ROUND 分析**（explorer，唯讀，回報可能遺失）：每一場 PvE 都只打一回合，因為伺服器對任何 `Campaign_CN(1)` 都回 `EndGame_SN`。要找出觸發 `EndRound_BD` 的 SN（候選 `EndRound_SN 0x00222211`）。契約在 backlog R-ROUND。回報遺失的話，照契約重新派。

### 下一步（照 PM 定的順序）

1. D1 第 4 步合併 → 完整重啟 → 只開 `LOBBY_ROOM_LIST_MODE`，單人確認大廳看得到自己的房間、房名和人數正確（截圖）。
2. 再開 `ROOM_JOIN_MODE`，兩台進同一房（**M1 主測**）：房名、槽位互見、聊天互通、離開時對方看得到。同時補 D1 第 0 步兩人版驗收：兩人帶回的 key 各自等於伺服器最近一次發給自己的那一組。
3. R-ROUND 實作（開關 `PVE_ROUND_ADVANCE_MODE`，用初級 5 回合測），排在 M1 之後、D1 第 6 步之前。
4. D1 第 5 步（房主、斷線即離開，已部分做在第 4 步）→ 第 6 步（開戰廣播；房主由收到 `Ready_Host_SQ` 決定，房主 IP 走設定檔、缺漏就拒絕開戰；每人一包 Game_User_SN）→ N2（房主 UDP 30907 防火牆，先用 netstat 確認埠）。
5. 收斂：C2（T1 開關，09-26 前）；ROOM_CHAT_BROADCAST_MODE（實測通過後 7 天內）。
6. E1（M2 之後）；P2 剩 `m_MySlot` 候選；H6 有新觀察（「按初級卻跳到高級」）。

### 等操作者的

- 第二台 `data\System\xigncode.log` 的修改時間（M3 前要有答案）。
- `.claude/agents/verifier.md` 要不要加 PM 建議的檢查：「A 之後發生 B」的敘述必須附間隔時間和目的埠。這是設定檔，要操作者同意。

