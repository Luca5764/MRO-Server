# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 交接快照（2026-09-20 晚上，Claude 高階組長）

> 目標與里程碑看 `docs/roadmap.md`。PM 是 Fable（SendMessage 的名稱會跟著它的 session 標題變，連不到先 ListAgents 或問操作者）。
> 跨公司審查：Sol（tmux `sol`，Codex gpt-5.6-sol）**2026-09-20 起有額度**。今天新標的結論都註「未經跨公司審查」，等 Sol 補審（`grep -rl 未經跨公司審查 docs/`）。
> 待審清單見 `research/2026-09-20-review-status/pending.md`（真正沒人審過的還有 66 處）。
> 本段每次交接**整段改寫**。

### 2026-09-20 完成的

1. **卡頓根因解決** — 不是網路、不是我們的伺服器：保護殼每 4–5 分鐘丟一次無害例外，第三方程式留下的 `LocalDumps` 機碼讓 Windows 每次寫 29 MB 傾印檔、凍結整個行程 140–273 ms。解法 `LocalDumps\MetalRage.exe` 的 `DumpCount=0`。`journal/2026-09-20-1240-stutter-root-cause.md`。H-Y0DA ❌、H-ASSIST-AV ❌。
2. **M3-R 預演成功**（PM 判定 ✅）— 筆電走手機熱點＋VPN，兩個方向都開房、開戰、可操控。**M3 還差**：VPN 上打完整一場（含結算回房）＋真正的第三人照 K1 自己裝起來。
3. **投射物消失第一次量得出來**（見下一節，最有價值）。
4. **操作者現在能自己開客戶端主控台** — Pico 韌體加了 ScrollLock → F24（`tools/pico/code.py` 的 `poll_led_hotkey`，commit 742eb6d）。USB 主機會把鍵盤 LED 狀態廣播給所有鍵盤，Pico 因此看得到操作者按 ScrollLock，再送出真實 F24。之前只能請 AI 送鍵（要遊戲在前景、每次約 3 秒，戰鬥中不可行）。筆電沒有 Pico，備案是 `tools/win/f24-on.reg`（驅動層 scancode 改鍵，未實測）。
5. **兩支新工具**：`tools/chat-markers.js`（把戰鬥中的聊天 0x00220507／0x00220509 離線解成 marker——`packetlog.js` 的 `CHAT_CQ` 只認大廳與房內，戰鬥中的那兩個沒進去；修 `CHAT_CQ` 要完整重啟，所以先離線解）；`tools/uetool` 加了 `flags` 指令（印 `FunctionFlags`）。
6. **Pico 自動化完整可用**、**測試帳號 `mrotest`** 已建並標 `isTest`。政策見 `reference/unattended-policy.md`。
7. **P3（戰績寫回）第 1–3 步完成並經 Sol 審查**，已合併但**開關全部關閉**。第 3 步 Sol 判定：合併 GO、執行 migration 或開 `MATCH_WRITEBACK_MODE` **NO-GO**，還要補 schema 後檢查、真 MySQL 驗證、`point_gained` 語意。
8. **ASSIST-FIX** 已實作、開關 `ASSIST_SN_FORMAT_MODE` 預設關。Sol 第一輪 NO-GO 的那一項（短 body fallback）已修，**還沒回送 Sol 確認**。
9. **對外**：README 改寫、`docs/PROTOCOL-SUMMARY.en.md`、`reference/join-guide.en.md`、里程碑 tag 都已 push。文件裡的區網 IP 一律用佔位值，**不要寫回真實 IP**。
10. **與上游作者 Moon 的交流**：他更正了 `Game_User_Add` 是 `0x10734140`（`0x107343e0` 是道具清單），核對成立。

### 投射物消失 — 成因已定位（2026-09-20 晚）

**結論：不是網路，是引擎的送出預算。** 完整經過見 `journal/2026-09-20-1820-projectile-loss-counted.md` 與 `journal/2026-09-20-2030-same-machine-and-netspeed.md`。

機制（`Engine.dll` `AActor::ProcessRemoteFunction` VA `0x105234b0`，位址已核對）：
- `0x10523597`／`0x10523633` 用 `0xc00000`（ToAll|ToTheOthers）選廣播分支
- `0x105236a5` 廣播迴圈對**每個 connection** 呼叫 `IsNetReady(0)`
- `0x105236ad` 回 false 就**跳過該 connection —— 不排隊、不重傳**
- → 宣告的 `reliable` 只在封包送出之後才算數

門檻吃的是 `CurrentNetSpeed`，實測 **10000 B/s**（÷ `NetServerMaxTickRate` 30 ≈ 每 tick 333 bytes），戰鬥中光移動複寫就吃光。

證據：

| 環境 | 缺口 |
|---|---|
| VPN，無 `sup1` | 20.8% |
| VPN，`sup1` | 8.9% |
| **同機雙開（迴路、0% 掉包、ping 20ms）** | **32–35%** |

同機**更糟**，所以網路品質 ❌。去程 100%（房主收到 34/34），缺口全在回程 ❌ 線路掉包（200 ping 0% 遺失）❌ `ToAll` 不可靠（`FunctionFlags` 有 `NetReliable`；`ToAll`=bit `0x00400000`、`ToTheOthers`=`0x00800000`）❌ 收端有時間閘門（進入點只有一個 none 檢查）。🟡 `HasAmmo()` 閘門可能解釋成串的那部分（`sup1` 讓成串失敗消失）。

**改不動的地方：** 加入者端改 ini 無效——`Engine/GameInfo.uc:1504` 的 `ClientCapBandwidth()` 在登入時用房主的值覆蓋加入者，而房主的值來自連線 URL 的 `NETSPEED=`，客戶端自己組 URL 時沒帶。我們送的那個欄位只有 15 字元且由客戶端組 `%s:%d/%s`（`gate.game.dispatch.js:405-414`），塞不進去。[TEST] 兩端 `DefUser.ini` 改成 100000、重開，`stat net` 仍是 10000。→ 要提高只剩改客戶端二進位檔，**那是另一個層級的決定，未做**。

**量測方法**（可重複，只要射手一台，不需要任何人數發數）：
1. 遊戲裡按 **ScrollLock**（Pico 韌體送出真實 F24）開主控台
2. `WeaponLog` → Enter → ESC。**每次重開客戶端都要重開一次**，而且它是 toggle
3. 射手必須是**加入者**，武器必須是**主武器砲類**
4. 打完**關掉客戶端**才會完整 flush（4KB 緩衝，離開戰場不保證）。**而且 `-log=` 產生的
   `data\System\run-*.log` 在客戶端執行期間是鎖住的，從 WSL 連讀都讀不到**（[TEST] 2026-09-20 23:00，
   `cat` 回 `Permission denied`）——不是慢，是根本讀不到
5. 分母 `HitLoc===` 的行數（只有主武器寫），分子開火動畫。**絕對不要用 HUD 彈藥數當分母**——雙臂武器一次扣兩發

### 同機雙開（DUAL-CLIENT，已完成）

可行。`docs/reference/setup.md` 應補一節。要點：
- 副本 `C:\Games\MetalRage Online 2`（robocopy 整份複製，1.9 GB／8 秒）
- **單一實例鎖看的是行程名稱**：把 exe 複製成 `MetalRage2.exe`（byte-identical）就能並存。不是 XIGNCODE（換成停用版 DLL 行為不變），也不是具名核心物件（34 個候選全部開不到）
- Win11 的 `DisableExceptionChainValidation` 按 exe 檔名註冊，新檔名要自己加一筆（`C:\Users\su200\mr2-ifeo.reg`，管理員合併一次，不用重開機）
- 用副本的 `Play Second Client.bat` 啟動，它會用 `-log=run-<時間>.log` 讓每輪各自一個檔
- **陷阱**：安裝目錄下的 `MetalRage\` 是指回根目錄的 junction，robocopy 原樣重建，所以副本的 `MetalRage\...` 指向主力安裝。判斷 log 屬於誰看檔頭 `Init: Base directory:`
- **陷阱**：引擎 log 檔名跟著執行檔走，`MetalRage2.exe` 寫 `data\System\MetalRage2.log`，而且每次啟動**截斷**同名檔

### 客戶端目前的非原廠狀態（2026-09-20 晚）

| 項目 | 狀態 |
|---|---|
| 副本 `C:\Games\MetalRage Online 2` 的 `IpDrv.dll` | **修補中**（MaxClientRate/MaxInternetClientRate → 100000），sha256 `e384991e…`，原廠 `dbc7b34c…`。**實驗沙盒，之後量測若用副本當房主一定要註明** |
| 主安裝的 `Engine.dll`／`IpDrv.dll` | 原廠（`fc51fe12…`／`dbc7b34c…`） |
| 兩份 `DefUser.ini` 的 `ConfiguredInternetSpeed` | 100000（無效、無害），備份 `.bak-20260920` |
| `MetalRage2.exe`、`Play Second Client.bat`、`Play With Log.bat`、IFEO 機碼 | 雙開與即時 log 視窗要用的，保留 |

還原：`~/mro-netspeed-off.sh`（全部）或 `tools/patch_netspeed.py --module ipdrv --target <安裝> --restore`。

### 等操作者的

1. **明天那一場**：`stat fps` 驗證（一分鐘）→ 區網基準（連按 vs 慢速各 100 次扣扳機）→ DUAL-CLIENT（`docs/backlog.md`，15–20 分鐘上限）。順序與判讀全寫在 `docs/next-test.md`（已整份改寫）。
2. VPN 上打完整一場（含結算回房），M3 就少一項。
3. 重跑防火牆腳本收斂：`lan-open.ps1 -FromWhitelist`、`p2p-open.ps1 -FromWhitelist`（已複製到 `%USERPROFILE%\mro-fw`），跑完確認舊的整段規則消失而不是並存。
4. Moon 的連線（英文說明已備好：`reference/join-guide.en.md`）。`WeaponLog` 這個量法對他特別有用：他同機兩視窗，一個人就能量出自己的缺口率，還能比較房主視窗有焦點／失焦兩種情況。
5. `stat net`／`stat fps` 能不能用（新動作，第一次要他在場）。

### 還沒做完的工作

- ASSIST-FIX 送 Sol 複審；通過後才實測（基準已存：`shots/assist-base-res-2.png`，結算全 0）。
- P3 第 3 步的三項 must-fix（schema 後檢查、真 MySQL、`point_gained`）。
- RELOAD-GUARD（`/reload` 偵測 dispatch 以外的變更就拒絕）。
- E1 遷移的事後審查、D2 PvP 設計稿（等 Moon 的目標類封包表）。
- `packetlog.js` 的 `CHAT_CQ` 補上 0x00220507／0x00220509（要完整重啟，所以留到下次重啟時順手做；在那之前用 `tools/chat-markers.js`）。
- `trace-task` worktree 還在（可留可刪）。

### 進行中

1. **ROOMNAME-BIG5**（worker，`flash-wip-roomname`）：房名改用原始 Big5 bytes，並補 `Name_Change_CQ 0x00220218` 的 handler。現在按「房間設定變更」的確認會卡在載入中，要等這個修好。
2. **SWITCH-CONVERGE**（worker，`flash-wip-converge`）：把驗證過的開關預設改成 enabled，讓測試伺服器不再 dirty。
3. **P1b**（程式已合併，開關關著）：清理腳本 `tools/p1b-remove-default-items.js`。下一步是停機、備份，只對測試帳號試跑。

### 環境

- 主目錄固定停在 `reverse-work`。執行者各自開 `~/mro-wt/<名稱>`，新開的 worktree 要 symlink `MetalRage` 和 `node_modules`。子 agent 絕對不可以動主目錄的工作區。
- 伺服器：tmux `server`，跑在 `~/mro-wt/test`。設定檔都在主目錄，用 symlink 指過去（`config/server.json`、`config/allowed-users.json`、`database/config.json`；這些檔不進 repo，裡面是真實 IP）。
- 動 `dispatch/` 以內的檔案 → `/reload`；動 `rooms.js`、`database/db.js`、`config/`、`server.js`、`packetlog.js` → **要完整重啟**，操作者要重登。重啟前先 `/conns` 確認沒人在線。2026-09-20 踩過兩次。
- 機器：主機 Lucas（Win11，有線）、第二台 dusk（Win10，要用原廠 exe）、筆電 test（Win11）。筆電的客戶端 log 可以從它的 `MROLog` 共享讀（主機已存帳密）。**客戶端 log 每 4 KB 才寫檔**：出事時先別關遊戲，請操作者進出機庫把緩衝擠出來；要完整資料就關掉遊戲。注意這條講的是筆電經 `MROLog` 共享讀 `data\Log\MetalRage.log` 的情況；**主機本地用 `-log=` 產生的 `data\System\run-*.log` 在執行期間是鎖住的，讀都讀不到**（[TEST] 2026-09-20）。
- 戰鬥是 P2P，房主監聽 UDP 30907。每台可能當房主的機器都要跑 `tools/win/p2p-open.ps1`，網路要設成 Private。
- 資料庫備份：`~/mro-backups/mro-before-e1-20260919-170807.sql`。
- push：`reverse-work` 領先 origin 很多，請操作者執行 `! git -C /home/lucas/mro-reverse -c credential.helper= -c credential.helper="/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe" push origin reverse-work`。
