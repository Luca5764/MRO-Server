# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 交接快照（2026-09-19 晚，Claude 高階組長）

> 目標與里程碑看 `docs/roadmap.md`。PM 是 Fable（tmux `fable`；SendMessage 名稱會跟著 session 標題變，2026-09-20 是 `xigncode bypass script`，連不到就先 ListAgents），只在四個關卡找他（實作前核 bytes、合併前機械核對、里程碑判定、跟 ✅ 衝突），有進度時另外主動回報一則。
> 跨公司審查：Sol（tmux `sol`，Codex gpt-5.6-sol）**目前沒額度**。沒額度期間，高階自審的項目在 `docs/research/2026-09-19-sol-review/` 的處置段落裡寫明「高階自審」，等 Sol 恢復後補審。已審過的是 batch1–5。
> 本段每次交接**整段改寫**。

### 2026-09-20 凌晨：無人時段（操作者在睡覺，結論一律 🟡）
- **客戶端**：XIGNCODE 修補已還原成原版（00:50）；軟體輸入和 taskkill 修補前後都無效，AI 操作遊戲只能走 Pico。
- **Pico runner 全部實跑 PASS**：U-pve-fullmatch（原版客戶端）、U-shop-tabs、U-shop-tabs-idle（閒置 120 秒沒被踢）、U-pve-escort（護送 9007，新的地圖無關戰場判斷）。登入動作會處理注音輸入法（第一次被吃掉就按 SHIFT 重試一次）。見 `journal/2026-09-19-2230-unattended-trial-01.md`、`journal/2026-09-20-0110-escort-smoke.md`。
- **等操作者醒著才做**：
  1. 計畫性重開＋自動登入的第一次實測（`U-relaunch-login`，會用 Pico 點 X 關掉客戶端）→ 通過之後才能跑 H1 ×20；
  2. `U-pve-fail`（GameCampaign 2）：不在核准清單上；
  3. **P3 第 1、2 步在分支 `p3-step12`（worktree `~/mro-wt/p3-step12`，f56b43e＋94be5b7），PM 已過 bytes 關卡，但規定等操作者說一聲才合併、`/reload`，再跑 U-pve-fullmatch 並看機庫數字**。第 1 步會改 9211 的 RecordInfo_SN（修正舊的錯誤佈局，每次登入都會送），第 2 步 MATCH_STATS_MODE 預設關閉。
  4. 卡頓 trace 要管理員權限：最高權限排程工作要不要建；
  5. 上游作者卡頓影片的連結；
  6. AGENTS 第 1 條補「靜態分析 y0da 可以，修改不行」；
  7. 中斷的場不寫戰績（`match-stats.js` 的 `ABORTED_MATCHES_ARE_NOT_PERSISTED`）要操作者拍板。
- P3 第 3 步（migration）等 Sol。Y0DA-STUTTER、BOSS 已開 backlog。

### 環境

- 主目錄固定停在 `reverse-work`。執行者各自開 `~/mro-wt/<名稱>`，新開的 worktree 要 symlink `MetalRage`（不然 golden 會壞）和 `node_modules`。子 agent 絕對不可以動主目錄的工作區。
- 伺服器：tmux `server`，跑在 `~/mro-wt/test`（dirty＝一堆驗證中的開關，開關收斂任務進行中，見「進行中」）。設定檔都在主目錄，用 symlink 指過去：
  - `config/server.json`：publicHost 192.168.0.10、pveExtraLives 7、pveFixedRank 10
  - `config/allowed-users.json`：dusk、Lucas 帶 hostAddress 192.168.0.10、test 帶 hostAddress 192.168.0.30
  - `database/config.json`
- 動 `dispatch/` 以內的檔案 → `/reload`；動 `rooms.js`、`database/db.js`、`config/`、`server.js`、`packetlog.js` → 要完整重啟，操作者要重登。重啟前先下 `/conns` 確認沒人在線。
- 機器：
  - 主機 Lucas（Win11，192.168.0.10，有線）
  - 第二台 dusk（Win10，要用原廠 exe）
  - 筆電 test（Win11，192.168.0.30）。筆電的客戶端 log 可以從 `\\192.168.0.30\MROLog` 讀（主機已經存好帳密）。客戶端 log 每 4 KB 才寫一次檔：出事時先別關遊戲，請操作者進出機庫把緩衝擠出來。
- 戰鬥是 P2P，房主監聽 UDP 30907。每台可能當房主的機器都要跑 `tools/win/p2p-open.ps1` 或同效果的規則，而且網路要設成 Private。
- 頻寬：dusk 的 `User.ini` Configured*Speed 和主機 `MetalRage.ini` MaxClientRate 都改成 100000，閃現改善了（🟡）。
- 資料庫備份：`~/mro-backups/mro-before-e1-20260919-170807.sql`（E1 遷移前）。
- push：`reverse-work` 領先 origin 100 多個 commit，請操作者執行 `! git -C /home/lucas/mro-reverse -c credential.helper= -c credential.helper="/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe" push origin reverse-work`。

### 今天達成（細節在 `journal/2026-09-19-0330-d1-step4-room-join.md`）

- M1 ✅。房間：踢人、準備 READY、難度／地圖同步、登入後就看得到房間列表、中文介面（`switch.cmd`）。
- **BOUNDARY-SWAP**：Room_Boundary_SN 兩個欄位寫反，16 格全部關掉。修好後頭像、READY 都正常。R14／R15 和 SELF-AVATAR 的推論都已經更正。
- **兩人同場：** D1-6 step 1/2/4/5 開戰廣播，加上三個修正：
  - RHSN-MAP：地圖名稱；
  - RHSN-IP：非房主只送 IP，因為客戶端自己組 `%s:%d/%s`；
  - RESPAWN-IDX：Respawn_SN 讀 body 的 UserIndex。
  → 兩人一起打完 5 回合。Rank 固定成 S 也有效。
- D1-6 step 3（結算廣播）已上線，但**兩人都進結算這件事還沒實測** → 這是 M2 最後一項。
- **E1**：item_equips 已在真 DB 遷移，並合併了 23 個重複的共享副武器（`journal/2026-09-19-1710-e1-migration-run.md`）。
- **H7 換圖**：MapInfo_SN 在 30907 登入時要再送一次（9211 那次會在切場景時遺失）。選圖視窗和換圖都可以用，加入者會同步。ROOMSET MaxUser 16 讓「房間設定變更」列出地圖。
- 機庫 WearInfo 欄位順序：live bug，已修。

### 進行中

1. **ROOMNAME-BIG5**（worker，`flash-wip-roomname`）：房名改用原始 Big5 bytes，並補上 `Name_Change_CQ 0x00220218` 的 handler。現在按「房間設定變更」的確認會卡在載入中，要等這個修好；之後可能還要處理 `0x00220215`、`0x00220224`。
2. **SWITCH-CONVERGE**（worker，`flash-wip-converge`）：把驗證過的開關預設改成 enabled，讓測試伺服器不再 dirty。PM 要求 M2 判定前，nonDefault 只能剩當輪在驗的那一個。
3. **P1b**（程式已合併，開關關著）：清理腳本 `tools/p1b-remove-default-items.js`。Sol batch5 的 NO-GO 兩點已修。下一步是停機、備份，只對帳號 4（test）試跑，再實測機庫預設裝備和出場武器。

### 下一步

1. 合併上面兩個 worker 的分支，完整重啟，請操作者兩人打完一整場 → 確認兩人都進結算、回房間 → 找 PM 判定 M2。
2. 房間設定視窗剩下的 CQ（Room_Option_Change 0x00220215、Room_Map_Change_All 0x00220224：格式已查到，還沒實作）。
3. P1b 試跑。
4. 收斂或刪除：ROOM_SELF_RECORD_RESEND_MODE（沒用）；其他開關 ✅ 後 7 天內處理。

### 客戶端狀態變更（2026-09-19）

- **主力客戶端的 XIGNCODE 修補已還原（2026-09-20 00:50）**：修補後軟體輸入與 taskkill 仍然無效，為了跟朋友的客戶端一致而還原；修補版留在 `ZNetwork.dll.patched`。修補版只跑過 2026-09-19 23:54–2026-09-20 00:50。見 `journal/2026-09-19-2350-disable-xigncode-patch.md` 末段。
- y0da 不受影響：`MetalRage.exe` 仍不能 attach debugger、不能改 `.text`。
- **規則已放寬（操作者 2026-09-20 同意）**：`AGENTS.md:23` 從「不繞過反作弊」改成「XIGNCODE 旁路已放寬」——AI 可協助逆向定位、維護 `tools/patch_disable_xigncode.py`、在已停用 XIGNCODE 的客戶端上做軟體輸入分析；仍不碰 y0da（`.text`／監控執行緒）、anti-attach 不硬繞。之前的「中階越權」疑慮就此解除。那篇 journal 仍 🟡 待審，因為 3 項待驗證還沒回報，不是因為規則問題。

### 等操作者的

- push reverse-work。
