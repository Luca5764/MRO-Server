# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 交接快照（2026-09-20 深夜，Claude 高階組長）

> 目標與里程碑看 `docs/roadmap.md`。PM 是 Fable（tmux `fable`；SendMessage 的名稱會跟著它的 session 標題變，連不到先 ListAgents 或問操作者）。
> 跨公司審查：Sol（tmux `sol`，Codex gpt-5.6-sol）**2026-09-20 起有額度**，今天做了三份：`research/2026-09-20-sol-review/{p3.md,p3-round2.md,assist-fix.md}`。
> 待審清單見 `research/2026-09-20-review-status/pending.md`（真正沒人審過的還有 66 處，最大宗是 `journal/2026-09-19-0330-d1-step4-room-join.md`）。
> 本段每次交接**整段改寫**。

### 今天（2026-09-20）完成的

1. **卡頓根因解決** — 不是網路、不是我們的伺服器：保護殼每 4–5 分鐘丟一次無害例外，而第三方藍牙程式建立的 `LocalDumps` 機碼讓 Windows 每次都寫 29 MB 傾印檔、凍結整個行程 140–260 ms。解法：`LocalDumps\MetalRage.exe` 的 `DumpCount=0`。`journal/2026-09-20-1240-stutter-root-cause.md`、K1 說明已寫入。H-Y0DA ❌、H-ASSIST-AV ❌。
2. **M3-R 預演成功**（PM 判定 ✅）— 筆電走手機熱點＋Radmin VPN，兩個方向都開房、開戰、可操控。`journal/2026-09-20-1530-m3r-vpn-rehearsal.md`。**M3 本身還差**：VPN 上打完整一場（含結算回房）＋真正的第三人照 K1 自己裝起來。
3. **Pico 自動化完整可用** — 登入（含注音重試）、整場 PvE、商店、護送地圖、計畫性重開客戶端（Pico 點 X 關閉，因為 taskkill 被拒）。執行腳本自己判定每步成敗，模型不在迴圈裡。政策見 `reference/unattended-policy.md`。
4. **測試帳號 `mrotest`** 已建，白名單標 `isTest`，之後無人清單都用它。
5. **修掉的 bug**：離開房間回大廳看不到別人的房（26be66c，已上線）、登入顯示 `Player`（/reload 版本不同步，已完整重啟修正）、Pico 打字會丟掉所有符號。
6. **P3（戰績寫回）第 1–3 步全部完成並經 Sol 審查**，已合併但**開關全部關閉**：
   - 第 1 步（9211/30907 共用 RecordInfo builder）已上線驗證 ✅；
   - 第 2 步（Room 層統計，只寫 marker）已上線、開關 `MATCH_STATS_MODE` 目前在測試樹是開的；
   - 第 3 步（三張表 migration＋寫回）**Sol：合併 GO、執行 migration 或開 `MATCH_WRITEBACK_MODE` NO-GO**，還要補 schema 後檢查、真 MySQL 驗證、`point_gained` 語意。
7. **ASSIST-FIX**（每場 500 次的 `Assist_SN` 回覆長度不足造成客戶端越界讀）已實作、開關 `ASSIST_SN_FORMAT_MODE` 預設關。Sol 第一輪 NO-GO 的那一項（短 body fallback）已修，**還沒回送 Sol 確認**。
8. **對外**：README 改寫、`docs/PROTOCOL-SUMMARY.en.md`（16 條給其他實作者）、`reference/join-guide.en.md`（給遠端測試者的英文說明）、里程碑 tag `m1-two-clients-one-room`／`m2-two-player-pve-match`，都已 push（github.com/Luca5764/MRO-Server）。文件裡的區網 IP 換成佔位值、寫死的 Windows 使用者名稱改成執行時取得。
9. **與上游作者 Moon 的技術交流**（信由 PM 寫、操作者寄）：他更正了我們一個位址標籤（`Game_User_Add` 是 `0x10734140`，`0x107343e0` 是道具清單），我們核對成立；我們則找到他可能也有的高頻 bug（Assist_SN）。

### 投射物問題（最有價值的未結案）

症狀定案 [OBS]：**發射端看不到自己的投射物；被打的那端看得到、但沒有受到傷害**。
機制已查清（`research/2026-09-20-projectile-replication/notes.md`）：投射物不是複寫的 actor，而是房主用 `ClientFireProjectileCenterLoc_MH`（reliable ToAll）通知所有人**各自本地生成**；傷害只由開槍者自己那顆（`bMyProj`）申報。所以「看不到」與「沒傷害」必然成對。
- ❌ 複寫飢餓（NetPriority）、❌ 視覺呈現問題、❌ H-AMMO-DESYNC（房主有 spawn 就代表 HasAmmo 為真）。
- 🟡 **H-SPAWN-FAIL（目前最有力）**：生成座標是開火當下的世界座標，RPC 繞一圈回來時開槍者已移動，生成點可能落在自己機體碰撞體內 → `Spawn()` 失敗。指紋：**移動中開火容易失敗、站著幾乎不會**。
- 下一步就是 `docs/next-test.md` 的三組各 20 發（站定／橫移／前進），每發記「自己看到／對方看到／目標掉血」。還沒查的：投射物碰撞設定、`Spawn()` 回 None 時腳本怎麼走、前推距離。

### 等操作者的

1. **投射物三組各 20 發的計數測試**（`docs/next-test.md`）——最有價值。
2. VPN 上打完整一場（含結算回房），M3 就少一項。
3. 重跑防火牆腳本收斂：`lan-open.ps1 -FromWhitelist`、`p2p-open.ps1 -FromWhitelist`（腳本已複製到 `%USERPROFILE%\mro-fw`），跑完確認舊的 26.0.0.0/8 規則消失而不是並存。
4. Moon 的連線（英文說明已備好：`reference/join-guide.en.md`）。
5. `stat net`／`stat fps` 能不能用（新動作，第一次要他在場）。

### 還沒做完的工作

- ASSIST-FIX 送 Sol 複審那一項；通過後才實測（基準已存：`shots/assist-base-res-2.png`，結算全 0）。
- P3 第 3 步的三項 must-fix（schema 後檢查、真 MySQL、`point_gained`）。
- RELOAD-GUARD（`/reload` 偵測 dispatch 以外的變更就拒絕）。
- E1 遷移的事後審查、D2 PvP 設計稿（等 Moon 的目標類封包表）。
- `trace-task` worktree 還在（SYSTEM 版排程腳本，操作者決定不建排程，可留可刪）。

### 環境

- 主目錄固定停在 `reverse-work`。執行者各自開 `~/mro-wt/<名稱>`，新開的 worktree 要 symlink `MetalRage`（不然 golden 會壞）和 `node_modules`。子 agent 絕對不可以動主目錄的工作區。
- 伺服器：tmux `server`，跑在 `~/mro-wt/test`（dirty＝一堆驗證中的開關，開關收斂任務進行中，見「進行中」）。設定檔都在主目錄，用 symlink 指過去：
  - `config/server.json`：publicHost 192.168.0.10、pveExtraLives 7、pveFixedRank 10
  - `config/allowed-users.json`：dusk、Lucas 帶 hostAddress 192.168.0.10、test 帶 hostAddress 192.168.0.30
  - `database/config.json`
- 動 `dispatch/` 以內的檔案 → `/reload`；動 `rooms.js`、`database/db.js`、`config/`、`server.js`、`packetlog.js` → 要完整重啟，操作者要重登。重啟前先下 `/conns` 確認沒人在線。　**2026-09-20 又踩一次：`/reload` 之後 dispatch 新程式呼叫 `config/whitelist.js` 的新函式，但那個模組沒被重載，登入整批掉進「DB unavailable」備援、暱稱顯示成 `Player`。合併內容只要碰到 dispatch 以外的檔案，一律完整重啟。**
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
