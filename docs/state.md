# 現況（state）

> **這份是現況，不是歷史。** 錯了就直接改，並在日誌留下更正依據。只有高階可以改（見 `AGENTS.md`）。
> 上限約 300 行；超過就依命名空間拆成 `docs/state/<命名空間>.md`。
> 每一條都附依據：日誌檔名或 DLL 位址。細節回日誌查，不要把細節搬進來。
>
> 最後整理：2026-09-17，從凍結的 `opcode-ledger.md` 與 `research/2026-09-17-ledger-migration/opcode-inventory.md` 整理，並重跑 `tools/dispatch-map.py` 核對。

狀態：✅ 已確認／🟡 假設／⬜ 未知／❌ 已排除

---

## 1. 查 opcode 名稱的權威來源

- **伺服器→客戶端的名稱，以 `tools/dispatch-map.py` 的輸出為準**（`docs/client-dispatch-map.md` 是它的存檔）。2026-09-17 重跑 `ZDispatchGame`（`0x1070139d`）、`ZDispatchLobby`（`0x10706a7d`）、`ZDispatchCommunity`（`0x1070871a`），結果跟存檔一致。✅ [DLL]
- **客戶端→伺服器（CQ／CN／CA）不會出現在 dispatcher 裡。** 查這類要搜尋把 opcode 寫進 Format 的指令（方法見 `journal/2026-09-16-18-scene-6-three-cn-messages.md`）。在 dispatch map 查不到，不代表它不存在。
- ⚠️ **舊台帳約第 696–736 行的「完整映射（29/29）」表是錯的**，把多個 CN 的奇數 opcode 標成了 SN。那張表的內容不要再引用。❌ [DLL] 重跑工具確認
- ⚠️ **伺服器送出不在 dispatch map 裡的 opcode，客戶端會直接忽略。** 程式碼裡有好幾處這種「送了等於沒送」的封包，見第 5 節。

## 2. 協定層的硬限制與陷阱

| 項目 | 狀態 | 依據 |
|---|---|---|
| 客戶端拒收整包超過 **0x400 bytes** 的 frame，這條連線之後的封包全部卡住 | ✅ [DLL][LOG] | `ZNetwork.dll 0x107f8fad`；`journal/2026-09-17-01-review-iteminfo-stall-root-cause.md` |
| ItemInfo 卡住的原因是大小，不是 slot 3／5 的內容 | 🟡 強假設，待單變數測試 | 同上；`docs/next-test.md` 測試 B |
| 「body rows（part_slot=0）放進 ItemInfo 會斷線」這條舊說法，可能也是大小問題（32 筆＝1142 bytes） | 🟡 未驗證 | 同上 |
| `ZDispatchGame` 的 handler 只在場景 6 生效，其他場景收到會直接丟棄 | ✅ [DLL] | `journal/2026-09-16-13-battle-start-is-scene-driven.md`；`Assist_SN 0x1070a425` 的 `this[4]` 檢查 |
| `Game_Info_SN 0x00222111` 有兩個 handler（Waiting＝場景 1、Game＝場景 6） | ✅ [DLL] | `journal/2026-09-16-10-two-game-info-sn-handlers-diff.md` |
| 客戶端換地圖時會斷線重連，連線上的狀態要靠 `session.js` 延續 | ✅ [TEST] | `journal/2026-09-15-02-state-lost-on-reconnect-blocks-game.md` |
| Map ID 是 Cache.Bin table 1 的真實 ID | ✅ [DLL][CACHE] | `journal/2026-09-15-10-map-id-always-wrong-root-cause.md` |
| Ghidra 的參數順序與 stack 偏移會錯，封包偏移一律回頭看組語 | ✅ [DLL] | `journal/2026-09-16-05-game-info-sn-body-structure-ghidra.md`、`journal/2026-09-16-21-game-user-sn-record-layout-confirmed.md` |
| `type & 0x80` 會把低位元組 bit7 為 1 的 opcode 誤當成系統層訊息（目前會 dump，但仍會誤攔） | ⚠️ 已知陷阱 | `journal/2026-09-15-22-known-code-level-pitfalls.md` |
| keepalive 早於 time sync 曾導致整個 process 崩潰；已修，但沒有全域 `uncaughtException` 防護 | ⚠️ 已知陷阱 | 同上 |
| 截圖要看完整遊戲畫面；曾把只框到標題列的截圖誤判為「白畫面」 | ❌ 已撤回的誤判 | `journal/2026-09-16-08-retraction-white-screen-never-happened.md` |
| WSL 對客戶端注入鍵盤、滑鼠都無效，只有截圖可用 | ✅ [TEST] | `journal/2026-09-16-12-observing-client-from-wsl.md` |

## 3. 已打通的開戰流程（戰役房，2026-09-16 實測）

依據：`logs/session-20260916-215019.jsonl`，以及 `journal/2026-09-16-15-breakthrough-server-driven-start-no-crash.md`、`journal/2026-09-16-16-entered-battle-map-success.md`、`journal/2026-09-16-29-first-successful-mech-spawn.md`、`journal/2026-09-16-30-death-respawn-regression-test.md`。

| # | 方向 | opcode | 名稱 | 狀態 |
|---|---|---|---|---|
| 1 | C→S | `0x00222103` | 房主按 F5 開始（名稱未確認） | ✅ [LOG] 觸發點 |
| 2 | S→C | `0x00420111` | `Game_Wait_SN`：清資料並切到場景 6 | ✅ [DLL][TEST] |
| 3 | S→C | `0x00222112` | `Game_User_SN`：填玩家表，決定 team 與機體 | ✅ [DLL][TEST] |
| 4 | S→C | `0x00222111` | `Game_Info_SN`：地圖、模式、TimeLimit | ✅ [DLL][TEST] |
| 5 | S→C | `0x00222102` | `Game_Ready_SN` | ✅ [DLL] 名稱 |
| 6 | S→C | `0x00222104` | `Game_Start_SN` | ✅ [DLL] 名稱 |
| 7 | S→C | `0x00420113` | `Ready_Host_SQ` | ✅ [DLL][TEST] |
| 8 | C→S | `0x00420114` | 對 SQ 的回應（Ready_Host_CA，名稱依慣例推定） | ✅ [LOG] 會送 |
| 9 | S→C | `0x00420116` | `Ready_Success_SN` | ✅ [DLL] 名稱 |
| 10 | C→S | `0x00420117` | `Battle_Success_CN`（地圖載入完成） | ✅ [DLL] |
| 11 | C→S | `0x00230151` | `BeginRound_CN` | ✅ [DLL][LOG] |
| 12 | S→C | `0x00230152` | `BeginRound_SN` | ✅ [DLL][TEST] |
| 13 | S→C | `0x00230104` | `Respawn_SN`：`+0x0A` 是 user index，生成機體 | ✅ [DLL][SHOT] |

`Ready_Host_SN 0x00420115` 帶的是給其他玩家連線用的 `IP:Port/Map` 字串，曾因長度截斷導致崩潰（已修）。✅ [DLL][TEST] `journal/2026-09-15-06-ready-host-sn-url-truncated-crash.md`

### 戰鬥中

| 方向 | opcode | 名稱 | 目前伺服器行為 | 狀態 |
|---|---|---|---|---|
| C→S | `0x00230123` | `Death_CN`：attacker u16、victim u16、type u8… | 回 `Death_SN` | ✅ [DLL][TEST] |
| S→C | `0x00230124` | `Death_SN`：victim 在 `+0x0C` | 5 秒後補送 `Respawn_SN` | ✅ [DLL][TEST] 會重生 |
| C→S | `0x00230103` | `Respawn_CN` | 立即回 `Respawn_SN` | ✅ [DLL] |
| C→S | `0x00230121` | `Assist_CN`：`+2` user、`+4` type、`+6` 數值 | 回空的 `Assist_SN`，實際無效果 | ✅ [DLL] 格式；🟡 語意 |
| S→C | `0x00230122` | `Assist_SN`：`+0x0A`／`+0x0C` 兩個 user、兩組數值 | — | ✅ [DLL] |
| C→S | `0x00230111` | `Timeout_CN`：場景 6、host、遊戲進行中才送；實測在地圖內每秒一次 | 遊戲中不回（交給 fallback） | ✅ [DLL] |
| C→S | `0x00230101` | `ChangeSlot_CN`（選機體時由 `execGame_Slot` 送出） | 回空 body，未照 DLL 結構實作 | ✅ [DLL] 名稱；🟡 回應分析 WIP，完整格式仍未知（`journal/2026-09-17-04-changeslot-body-wip.md`） |

`Assist_CN` 的觀察：死亡前連送 5 次，數值 80→60→40→20→0，接著環境死亡（type 3）。語意 🟡 未確認。依據 `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md`。

### 尚未實作（S→C 名稱已由 DLL 確認）

`Game_Score_SN 0x00222114`、`EndRound_SN 0x00222211`、`EndQuater_SN 0x00222212`、`EndGame_SN 0x00222213`、`InstantRespawn_SN 0x00230106`、`Special_SN 0x00230126`、`Capture_SN 0x00230132`、`Conquest_SN 0x00230134`、`Bomb_SN 0x00230136`、`Boss_SN 0x00230138`、`Campaign_SN 0x0023013a`、`TwoBoss_SN 0x0023013c`、`TriggerTouch_SN 0x0023013e`、`HostChange_SN 0x00420121`、`Leave_SN 0x00420133`、`Ready_Failed_SN 0x00420112`。✅ [DLL] 名稱，body 結構大多未查。

## 4. 登入、機庫與裝備

| 項目 | 狀態 | 依據 |
|---|---|---|
| `ItemInfo_SN 0x00210111`：header 6 bytes，每筆 35 bytes；**單包最多 28 筆** | ✅ [DLL] | `ZDispatchAccount::ItemInfo_SN 0x107095c0`；`journal/2026-09-17-01-review-iteminfo-stall-root-cause.md` |
| ItemInfo 分包送出會不會累加 | ✅ [DLL] 有效物品不同實例 key 追加，同 key 替換單筆；斷線完成／初始化會清庫，未實測分包 | `0x10732616`、`0x1073262d`、`0x1073263e`；`journal/2026-09-17-03-iteminfo-accumulation.md`（待 Claude 審查） |
| `WearInfo_SN 0x00210113`：每組是 `[itemIndex, uniqueKey]`，第二個值用來查庫存 | ✅ [DLL][TEST] 機庫點選後正常顯示 | `journal/2026-09-16-27-wearinfo-slot-key-misalignment-fixed.md` |
| `Game_User_SN 0x00222112`：記錄 0x1E5 bytes；socket 從 `rec+0x6D` 起，main／left／right／booster／skin 各 u32 | ✅ [DLL] | `journal/2026-09-16-21-game-user-sn-record-layout-confirmed.md` |
| `team=255` 的原因：玩家表只由 `Game_User_SN` 填入；已修成 team=0 | ✅ [DLL][LOG] | `journal/2026-09-16-19-team-255-root-cause-chain.md` |
| Cache.Bin Table 4（DefaultSetList）在 offset `0x37456`，32 筆 × 7 個 int，是官方預設配裝 | ✅ [CACHE] 2026-09-17 重新解析 | `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md` |
| Table 4 第二欄只有 1、2 兩種值，語意未知 | ⬜（猜 pilot 101／102，[GUESS]） | 同上 |
| 輕型機（Small）不能裝 `MOC_a 21100101`；1 號機正確主武器是 `22100101` | ✅ [LOG][SHOT] | `journal/2026-09-16-33-weapon-model-true-root-cause-verified.md`；`shots/current-mission.png` |
| 「MOC_a 是中、重型機專用」 | 🟡 只證明了 Small 不能裝 | 同上 |
| 主武器已掛上；開火、副武器、推進器 | ⬜ 待測 | `docs/next-test.md` 測試 A |
| 4、5 號機在 Table 4 沒有推進器，但 DB 有給 | ⚠️ 不一致，影響未測 | `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md` |
| `User_Default_SN 0x00220233`：2 bytes header ＋ 每筆 0x34；暱稱是 ASCII | 🟡 結構已反組譯，行為未全部驗證 | `journal/2026-09-15-13-user-default-sn-body-structure.md` |
| `Map_Change_All_SN 0x00220226`：flag＋count＋每筆 9 bytes；要連送兩次清單才會顯示 | ✅ [DLL][TEST] | `journal/2026-09-15-20-map-change-all-sn-body-confirmed.md`、`journal/2026-09-16-11-room-map-list-shows-after-double-send.md` |
| 選地圖彈窗的 `m_MapInfoList` 仍是 0／0，資料來源跟房間清單不同 | ⬜ | `journal/2026-09-16-11-room-map-list-shows-after-double-send.md` |

## 5. 程式碼裡已知錯誤的名稱與無效封包（尚未修正）

這些是文件已經確認、但程式碼註解或行為還沒跟上的地方。**改之前要單獨測**，不要順手一起改。

| 位置 | 程式碼現況 | 實際（依據） | 影響 |
|---|---|---|---|
| `room.dispatch.js` `sendLobbyBootstrapAfterRoomLeave()` | 送 `0x00230103`，標為「Lobby Room_List_SN」 | `0x00230103` 是 `Respawn_CN`，客戶端沒有這個 handler。真正的 `Room_List_SN` 是 `0x00220204`。✅ [DLL] | 送了等於沒送 |
| 同一函式，以及 `gamelogin.dispatch.js` 的 `SA_LOBBY_ENTER` | 送 `0x00230112`，標為「Lobby Enter SA」 | `0x00230112` 是 `Timeout_SN`（`ZDispatchGame`），不在場景 6 時會被丟棄。`ZDispatchLobby::Enter_SA` 是 `0x00220232` ✅ [DLL]，但它進的是大廳還是房間 ⬜。 | 在大廳送等於沒送；在場景 6 送可能會觸發逾時處理 ⬜ |
| `lobby.dispatch.js` case `0x00230111` | 大廳中當成「Lobby Enter CQ」回應 | `Timeout_CN`，只在場景 6 送出。✅ [DLL] | 大廳時的分支可能永遠不會觸發 ⬜ |
| `lobby.dispatch.js` case `0x00230101` | 註解「Possible Lobby Enter」，回空的 `0x00230102` | `ChangeSlot_CN`／`ChangeSlot_SN`。✅ [DLL] | 選機體的回應內容不對 |
| `lobby.dispatch.js` case `0x00230121` | 註解「Lobby Leave (guessed)」 | `Assist_CN`。✅ [DLL] | 回應無效果，但無害 |
| `lobby.dispatch.js` 檔名與整段 `0x23xxxx` | 叫 lobby | 整段屬於 `ZDispatchGame`；檔內註解已自行承認 | 只是名稱誤導 |
| `game.dispatch.js` 攔截整段 `0x25xxxx` 並稱為「對戰」 | — | 客戶端的 `0x0025xxxx` handler 全屬 `ZDispatchCard`；對戰在 `0x0022xxxx`／`0x0023xxxx`／`0x0042xxxx`。✅ [DLL] | 名稱誤導 |
| `game.dispatch.js` 對 C→S `0x00250102` 回 `0x00250103` | 客戶端確實會送 `0x00250102` ✅ [LOG] | `0x00250103` 不在 dispatch map，回應會被忽略 ✅ [DLL]；`0x00250102` 的真名 ⬜ | 回應無效果 |
| `gate.game.dispatch.js` 約第 714 行 | 對 `0x00222101` 回 `0x00222102`，標為 `Room_Enter_SN` | `0x00222102` 是 `Game_Ready_SN`。✅ [DLL]；在該時機送出是否恰當 ⬜ | 可能是不該送的 Game_Ready |
| 對 `0x00420117` 的 fallback 回 `0x00420118` | — | `0x00420118` 不在 dispatch map。✅ [DLL] | 回應無效果 |
| 對聊天 `0x00220501`／`0x00220505` 回 `0x00220502`／`0x00220506` | — | 這兩個回應 opcode 客戶端都沒有 handler ✅ [DLL]。`0x00220501`／`0x00220505` 本身是 `Chat_*_All_SN`，推測伺服器應把同一個 opcode 廣播回去 🟡 | 聊天目前只當 marker 用，影響不大 |

## 6. 待查（依優先順序）

1. **測試 A**：開火、副武器、推進器（`docs/next-test.md`）
2. **測試 B**：ItemInfo 是大小還是內容的問題；如果是大小，就實作分包，再把 slot 3／5 和機體本體加回來
3. `ChangeSlot_SN 0x00230102` 照 DLL 結構實作；目前只保存部分結構與行為證據，待 Claude 審查，未實作（`journal/2026-09-17-04-changeslot-body-wip.md`；前文 `journal/2026-09-16-26-slot-sortie-function-followup-analysis.md`）
4. `Assist_CN` 數值遞減代表什麼
5. `Map_PC01` 沒有敵人：`ZMechanicA call failed`、`PreLoadallPveAI_BD` 讀到 null（`journal/2026-09-16-31-combat-control-and-ai-todo.md`）
6. `Game_Score_SN`、`EndRound_SN`、`EndGame_SN` 的 body 結構
7. 第 5 節那些錯誤名稱與無效封包，逐一單獨測試後修正
8. 四個 `CQ_COMPLETE` 候選（`0x00210122`／`0x00210131`／`0x00210132`／`0x00210141`）是哪一個（`journal/2026-09-15-23-investigation-queue.md`）
9. `0x00220234`（房間按「上一頁」）目前回 `0x00220235` 能讓客戶端前進，但該 opcode 不在 dispatch map，回應是否正確未知（`journal/2026-09-15-07-loading-stall-fix-confirmed.md`）
10. PVP 房的開戰流程（目前只支援戰役房，`journal/2026-09-15-03-campaign-only-start-flow-pvp-blocked.md`）
