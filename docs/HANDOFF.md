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

### 投射物消失（最有價值的未結案）

今天換了量測方法之後有實質進展。**方法本身值得先讀**（`journal/2026-09-20-1820-projectile-loss-counted.md`）：

- 客戶端主控台指令 `WeaponLog`（`ZBase/W_DPCForWeapon.uc:1011`）打開後，`MetalRage.log` 每發寫一行開火動畫；**主武器**（InventoryGroup==1）另外寫一行 `HitLoc=== >`。
- 開火動畫只在生成函式 `FireProjectileCenterLoc_UJ` 內播（`W_BaseProjectile_Weapon.uc:910`），`HitLoc===` 在本機無條件寫（`BaseProjectile_Fire.uc:135-139`）。**兩者相減＝缺口**，不需要任何人數發數。
- **分母一律用 `HitLoc===` 的行數，不要用 HUD 彈藥數**：雙臂武器一次扣兩發。今天連續兩次踩這個坑，第二次害我下錯結論。
- 射手必須是**加入者**；房主自己開槍是本機直接生成，看不出東西。
- log 每 4 KB 才寫檔，測完要離開戰場、必要時關掉遊戲才會 flush 完。

量到的（射手＝加入者，走 VPN）：

| | 扣扳機 | 缺口 | 失敗串 |
|---|---|---|---|
| 輔武 ACH | 70 | 10% | — |
| 主武 MTE 基準 | 48 | **20.8%** | `1,3,2,2,1,1` |
| 主武 MTE ＋ `sup1`（無限彈） | 90 | **8.9%** | `1×8`（全是孤立單發） |

- ❌ **H-SPAWN-FAIL 排除**：缺的那些發**連開火動畫都沒有**，而動畫在 `Spawn()` 之前播，所以不是生成失敗，是整個生成函式沒被呼叫。
- ✅ **去程 100%**：角色對調（Lucas 當房主並開 `WeaponLog`、完全不開火，筆電當射手打空一個彈匣）後，房主端收到 34/34。**缺口全部在回程** `ClientFireProjectileCenterLoc_MH`（`reliable ToAll`）。
- ❌ **不是線路掉包**：兩個 VPN IP 之間 `ping -n 200` 遺失 0%（抖動 20–189 ms）。
- ❌ **`ToAll` 沒有拿掉可靠性**：`FunctionFlags` 顯示 `NetReliable` 有設。`ToAll` ＝ bit `0x00400000`、`ToTheOthers` ＝ `0x00800000`（三組函式對照吻合）。
- ❌ **收端沒有閘門**：`ClientFireProjectileCenterLoc_MH` 唯一的條件是 `Weapons_UJ[i] != none`，三個 `FireProjectileCenterLoc_UJ` 實作都把 `PlayFireAnim()` 放在第一或第二個敘述，武器類別沒有任何 `state`。所以不是「抖動讓下一發撞上冷卻」。
- 🟡 **H-AMMO-DESYNC 可能解釋一部分**：`sup1` 把缺口 20.8%→8.9%（Fisher p≈0.06），而且**成串失敗全部消失、只剩孤立單發**。

目前最自洽的是**雙成因**：成串失敗 ← `HasAmmo()` 閘門（彈藥不同步）；殘留的約 9% 孤立單發 ← 回程 `ToAll`。

還沒做的兩項（PM 排的四項對照裡的第 2 項＋樣本數）：

1. **區網基準**：同樣的量測，筆電接回家裡網路不走 VPN。孤立單發也接近 9% → 與線路無關，是引擎固有行為，直接標成已知限制；掉到 0 → 線路品質問題，緩解方向明確（選線路好的當房主）。
2. **慢速射擊對照**（同一場、VPN 上）：連按到底 vs 每發間隔一秒，各約 100 次扣扳機。腳本層已確認沒有閘門（❌ H-CLIENT-GATE，見下），但引擎層的頻寬／可靠佇列仍可能在連發時丟呼叫，只有這個對照分得出來。
3. **`sup1` 樣本加大**：同一場打兩段各 100 次扣扳機。現在操作者自己能開主控台，不需要 AI 介入。

之後才考慮反組譯引擎處理 `0x00400000` 的送出路徑（PM 設上限半天，排在上面兩項之後）。

PM 對影響面的判斷：這 13%（修正後 9–21%）**不擋 M3**，若根因在客戶端引擎我們改不了，只能緩解；四項做完就把結論寫進 K1 的「已知限制」與 `PROTOCOL-SUMMARY.en.md`，然後往下走（VPN 完整場、第三人、ASSIST-FIX、P3）。

### 等操作者的

1. **區網基準＋慢速射擊對照**（做法全寫在 `docs/next-test.md`，已整份改寫）——最有價值，一場就能跑完兩項。
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
- 機器：主機 Lucas（Win11，有線）、第二台 dusk（Win10，要用原廠 exe）、筆電 test（Win11）。筆電的客戶端 log 可以從它的 `MROLog` 共享讀（主機已存帳密）。**客戶端 log 每 4 KB 才寫檔**：出事時先別關遊戲，請操作者進出機庫把緩衝擠出來；要完整資料就關掉遊戲。
- 戰鬥是 P2P，房主監聽 UDP 30907。每台可能當房主的機器都要跑 `tools/win/p2p-open.ps1`，網路要設成 Private。
- 資料庫備份：`~/mro-backups/mro-before-e1-20260919-170807.sql`。
- push：`reverse-work` 領先 origin 很多，請操作者執行 `! git -C /home/lucas/mro-reverse -c credential.helper= -c credential.helper="/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe" push origin reverse-work`。
