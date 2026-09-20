# 現況（state）

> **這份是現況，不是歷史。** 錯了就直接改，並在日誌留下更正依據。只有高階可以改（見 `AGENTS.md`）。
> 上限約 300 行；超過就依命名空間拆成 `docs/state/<命名空間>.md`。
> 每一條都附依據：日誌檔名或 DLL 位址。細節回日誌查，不要把細節搬進來。
>
> 最後整理：2026-09-18（第 2、4 節補 G6 結果，新增第 4b 節房間），從凍結的 `opcode-ledger.md` 與 `research/2026-09-17-ledger-migration/opcode-inventory.md` 整理，並重跑 `tools/dispatch-map.py` 核對。

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
| ItemInfo 卡住的原因是大小，不是內容；分包（每包 ≤28 筆）後含機體本體列也正常 | ✅ [LOG][OBS] 測試 H1／H2 | `journal/2026-09-17-20-iteminfo-chunking.md` |
| 客戶端庫存清單會**跳過 SerialIndex 101–999**（原廠保留給預設組合書），`items.id` 一定要 >999 | ✅ [SRC][OBS] W2 | `ZPanel_InvenItems.uc:408-411`；`journal/2026-09-18-05-g6f-item-serial-reserved-range.md` |
| 「body rows（part_slot=0）放進 ItemInfo 會斷線」這條舊說法是大小問題；機庫要有機體本體列才會顯示機體 | ✅ [OBS] 測試 H2 | 同上 |
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

### 任務結束（2026-09-19 補記）

- 收到 `Campaign_CN 0x00230139` 回 `EndGame_SN 0x00222213` → 會進結算頁、回到房間：✅ [LOG][OBS]（`journal/2026-09-17-14-campaign-result.md`）。加上 R-ROUND 後，最後一回合（cleared=5/5）才送 EndGame 也已實測（`session-20260919-090430.jsonl` ms 2296184；當場同時開著 `pveExtraLives=7`）（Sol 審查 `research/2026-09-19-sol-review/batch1.md`：部分成立，已照意見更新）。
- 回合推進：Campaign_CN 達標但還沒到 MapInfo.Round 時，回 `EndRound_SN 0x00222211`（30 bytes：WinTeam 0、Team A/B TeamIndex 0/1、分數全 0）→ 客戶端進入下一回合：✅ [LOG][OBS]（`session-20260919-083650.jsonl:1450-1453`，`journal/2026-09-19-0900-r-round-impl.md`；開關 `PVE_ROUND_ADVANCE_MODE`；Sol 審查 `research/2026-09-19-sol-review/batch1.md`：成立）。最後一回合改送 EndGame_SN 已實測，見上一條。
- PvE 多命測試設定 `pveExtraLives`（`config/server.json`）：寫在 Game_User_SN rec+0x64＝GAME_ITEM_INFO.PveRespawnAddCount → 命數＝3＋設定值，實測 HUD 顯示 10 ✅ [DLL] `0x10734495`（p8 寫 entry+0xe0）[LOG][OBS]（Sol 審查 `research/2026-09-19-sol-review/batch1.md`：部分成立，HUD 10 只有 [OBS]、沒有截圖）。每回合開始命數會補滿，這是原版設計（`ZModePve.uc` ModeReset_BD）。完整打通初級 5 回合、最後一回合才結算 ✅（`journal/2026-09-19-0900-r-round-impl.md`）。
- 時間上限跟隨房間設定（`GAME_INFO_TIME_LIMIT_MODE='room'`，body+0x13 分鐘）：✅ [LOG] [DLL] `0x107d4fa7` 讀 body+0x13；實測 640 秒沒有停住（`journal/*-t1-time-limit.md`；Sol 審查 `research/2026-09-19-sol-review/batch1.md`：成立）。

### 尚未實作（S→C 名稱已由 DLL 確認）

`Game_Score_SN 0x00222114`、`EndQuater_SN 0x00222212`、`EndGame_SN 0x00222213`、`InstantRespawn_SN 0x00230106`、`Special_SN 0x00230126`、`Capture_SN 0x00230132`、`Conquest_SN 0x00230134`、`Bomb_SN 0x00230136`、`Boss_SN 0x00230138`、`Campaign_SN 0x0023013a`、`TwoBoss_SN 0x0023013c`、`TriggerTouch_SN 0x0023013e`、`HostChange_SN 0x00420121`、`Leave_SN 0x00420133`、`Ready_Failed_SN 0x00420112`。✅ [DLL] 名稱，body 結構大多未查。

## 4. 登入、機庫與裝備

| 項目 | 狀態 | 依據 |
|---|---|---|
| `ItemInfo_SN 0x00210111`：header 6 bytes，每筆 35 bytes；**單包最多 28 筆** | ✅ [DLL] | `ZDispatchAccount::ItemInfo_SN 0x107095c0`；`journal/2026-09-17-01-review-iteminfo-stall-root-cause.md` |
| ItemInfo 分包送出會不會累加 | ✅ [DLL] 有效物品不同實例 key 追加，同 key 替換單筆；斷線完成／初始化會清庫，未實測分包 | `0x10732616`、`0x1073262d`、`0x1073263e`；`journal/2026-09-17-03-iteminfo-accumulation.md`（Claude 已抽查組語） |
| `WearInfo_SN 0x00210113`：每組是 `[itemIndex, uniqueKey]`，第二個值用來查庫存 | ✅ [DLL][TEST] 機庫點選後正常顯示 | `journal/2026-09-16-27-wearinfo-slot-key-misalignment-fixed.md` |
| `Game_User_SN 0x00222112`：記錄 0x1E5 bytes；socket 從 `rec+0x6D` 起，main／left／right／booster／skin 各 u32 | ✅ [DLL] | `journal/2026-09-16-21-game-user-sn-record-layout-confirmed.md` |
| `team=255` 的原因：玩家表只由 `Game_User_SN` 填入；已修成 team=0 | ✅ [DLL][LOG] | `journal/2026-09-16-19-team-255-root-cause-chain.md` |
| Cache.Bin Table 4（DefaultSetList）在 offset `0x37456`，32 筆 × 7 個 int，是官方預設配裝 | ✅ [CACHE] 2026-09-17 重新解析 | `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md` |
| Table 4 第二欄只有 1、2 兩種值，語意未知 | ⬜（猜 pilot 101／102，[GUESS]） | 同上 |
| 輕型機（Small）不能裝 `MOC_a 21100101`；1 號機正確主武器是 `22100101` | ✅ [LOG][SHOT] | `journal/2026-09-16-33-weapon-model-true-root-cause-verified.md`；`shots/current-mission.png` |
| 「MOC_a 是中、重型機專用」 | 🟡 只證明了 Small 不能裝 | 同上 |
| 主武器已掛上；開火、跳、推進器 | ✅ [OBS]／[SHOT] 進 PvE 就能用。根因：`Grade_Info_SN 0x00510101` 必須送 0。機制（2026-09-20 核對，來源 Moon）：handler `0x107cf3b0` 的跳表把 11→4、12→3、13→1、14→2（跳表資料在 `0x107cf45c`），經 `0x10729b00` 存進 `m_MyAccountLevel`（+0x448），`IsMeGM_BD()` 因此為真 → `PlayerSelectMech.BeginState` 直接 `GotoState('Spectating')`；同一根因還會讓 F1–F5 技能 HUD 不畫、Tab 計分板沒有玩家列。PvE 因為面板來自 `PveRoundManager.Timer()` 而看不出來，PvP 會整個卡住。我方三處 builder 都寫死送 0（`account.dispatch.js:283,399`、`community.dispatch.js:284`） | `journal/2026-09-17-11-grade-info-sn-root-cause.md`、`research/2026-09-20-moon-verify/notes.md` |
| PvE 選機體出擊（開局與陣亡後）：ZSlotSelectPage → `ChangeSlot_CN 0x00230101`（user u16、slot u8 1..8）→ `ChangeSlot_SN 0x00230102`（+0x0A user、+0x0C slot）→ `Respawn_CN`；`Game_User_SN` 必須送 8 個槽位 | ✅ [DLL][LOG][OBS] 測試 T2／T3 | `journal/2026-09-17-22-pve-mech-slot-selection.md` |
| 4、5 號機在 Table 4 沒有推進器，但 DB 有給 | ⚠️ 不一致，影響未測 | `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md` |
| `User_Default_SN 0x00220233`：2 bytes header ＋ 每筆 0x34；暱稱是 ASCII | 🟡 結構已反組譯，行為未全部驗證 | `journal/2026-09-15-13-user-default-sn-body-structure.md` |
| `Map_Change_All_SN 0x00220226`：flag＋count＋每筆 9 bytes；要連送兩次清單才會顯示 | ✅ [DLL][TEST] | `journal/2026-09-15-20-map-change-all-sn-body-confirmed.md`、`journal/2026-09-16-11-room-map-list-shows-after-double-send.md` |
| 選地圖彈窗的 `m_MapInfoList` 仍是 0／0，資料來源跟房間清單不同 | ⬜ | `journal/2026-09-16-11-room-map-list-shows-after-double-send.md` |
| 遊戲內 Team／All 聊天：C→S 與 S→C 共用 `0x00220507`／`0x00220509`，258-byte body 原樣回送後 HUD 正常顯示 | ✅ [DLL][LOG][OBS] V1 | `journal/2026-09-17-23-game-chat-echo-g7.md` |
| 機庫換裝 → 寫入 DB → 完全重登保留 → PvE 出場帶入（`Game_User_SN` slots 送出新 serial） | ✅ [LOG][DB][OBS][SHOT] W3／W4 | `journal/2026-09-18-06-g6-equip-save-verified.md` |
| `items.mech_type` 是**機體槽位 1–8**；`catalog`／`item_catalog.mech_type` 是**武器家族**，兩者不可混用 | ✅ [CODE][DB][OBS] | `journal/2026-09-18-04-g6e-purchase-inventory-classification.md` |
| 商店清單伺服器**不做相容性篩選**，整批送出交給客戶端 `ItemSubordinateCheck` 過濾；送 1541 筆分包（每包 ≤45 筆）正常 | ✅ [LOG][OBS][SHOT] | `journal/2026-09-18-02-g6c-shop-compat-experiment.md`、`-03-g6d-shop-full-catalog.md` |
| 購買：寫 DB 的 `mech_type` 要用當下機庫槽位 | ✅ [LOG][OBS] W1 | `journal/2026-09-18-04-g6e-purchase-inventory-classification.md` |
| 購買後新物品要即時出現：`ItemInfo_SN 0x00210111` 只寫資料、不發 UI 事件；購買成功後補送目前槽位的 `Slot_Change_SA 0x00240108` 才會觸發 `InvenUpdate()`（`POST_BUY_SLOT_REFRESH_MODE`）。「ACK 與 ItemInfo 的先後順序」已排除 | ✅ [DLL][SRC][LOG][OBS] M3a | `journal/2026-09-18-19-m3-inventory-refresh.md`、`-16-money-persistence.md` |
| 登入後預設（1 號機）的 ShopList 會被客戶端漏接，切到別台機再切回來才出現；封包內容兩次完全相同 | 🟡 時機問題，未修 | backlog H1；`journal/2026-09-18-03-g6d-shop-full-catalog.md` |
| G 幣持久化：`accounts` 的 Point／Cash／Coupon 欄位；Buy SA `0x00240202` body+0x06 是新餘額 int64（送 0 客戶端會歸零）；重登後由 `0x00240132`／`0x00210103` 帶回（`MONEY_PERSIST_MODE`） | ✅ [DLL][LOG][DB][OBS] M1 | `journal/2026-09-18-16-money-persistence.md` |
| 庫存同名武器重複：客戶端會依 DefaultSetList 自己合成 `SerialIndex=0` 的預設項，我們建帳時又發了實體列，所以會重複 | 🟡 [SRC][DB] | `ZPanel_InvenItems.uc:338-383`；backlog P1b |
| 物品名稱：Cache.Bin 的 `Spec*Record` 表，用 `tools/item-names.py` 查 | ✅ [CACHE] 駕駛員表 25／25 與獨立 dump 相符 | `docs/reference/item-names.md`、`journal/2026-09-18-2240-item-names.md` |
| `11100101`／`11200101` 這類配對：HighGroup／MiddleGroup 相同、可裝武器相同。**更正（2026-09-19 LEGEND-GRANT-A）：它們不是塗裝變體**，是各自獨立的機體 FGameItemRecord，x2xxxxx 是傳說機體（RAVEN、CRUAL MASSACRE、VALKYRIE、PHANTOM 14300101、ZODIAC、ROXANNE、FENRIS、SPECTOR）；加成由客戶端 class 的 `e_MechSection==MS_Season_01` 決定（`Pawn.uc:350`） | 🟡 [CACHE][SRC] 靜態分析 | `research/2026-09-18-premium-mech/notes.md` |
| Legend（時限）機體有授權機制 `Mech_License_Check`／`IsLicense`（0 無／1 教學／2 購買），對應 DB `mech_licenses`；**填這個欄位的封包未知** | ⬜ | `ZPage_Hangar.uc:1544-1552`、`ZNetwork_DJ.uc:234,1286` |

## 4b. 房間（戰役房）

依據：`journal/2026-09-18-08` ～ `-14`、`research/2026-09-18-room-*`。2026-09-18 實測。

| 項目 | 狀態 | 依據 |
|---|---|---|
| 任務簡報、難度鈕、地圖下拉**全部是客戶端自己從 Cache 算的**，伺服器只要把 `MapInfo[0].Index` 送對 | ✅ [SRC][OBS] | `ZPanel_PVE.uc:216-309`、`ZPage_Room.uc:680` |
| 房間面板的地圖要跟 `Game_Info_SN` 用同一個來源（`campaignMapCacheKey_`），否則面板顯示 A、實際打 B | ✅ [LOG][OBS][SHOT] | `journal/2026-09-18-08-room-map-sync.md` |
| `Room_Name_SN 0x0022021A` 送 **ANSI**；送 UTF-16LE 只會顯示第一個字 | ✅ [DLL]（`0x107ea7d0` → `winToUNICODE`）[OBS] | `journal/2026-09-18-09-room-string-encoding.md` |
| `Map_Change_One_SA 0x00220222` body 是 **16 bytes**：`u16 0` ＋ `u32 0` ＋ 10 bytes payload。標頭非 0 客戶端就靜默放棄（`0x107eb683`） | ✅ [DLL]（`0x107eb510`）[OBS] | `journal/2026-09-18-10-map-change-one-sa.md` |
| `Map_Change_One_SN 0x00220223` **不需要**成功標頭；payload 從 body+0x00：b0 槽位／w1 MapIndex／w2 **MapTime**／b5 **MapRound**／w6 **MapKill**／w8 **Goal**，直接寫進 `MapInfo[b0]` | ✅ [DLL]（`0x107eb6f0`）[OBS] | `journal/2026-09-18-12`、`-13` |
| **`Map_Change_All_SN 0x00220226` 會寫入選中狀態，不只是重繪**；排在 `Map_Change_One_SN` 之後（取代或補送都一樣）會覆蓋地圖選擇 | ✅ [OBS] R7／R7b 兩次實測 | `journal/2026-09-18-13-map-change-order.md` |
| `Map_Change_All_SN` 每筆 9 bytes，record+0x04 是 **Round** 不是選中旗標；客戶端只存前 **6** 筆（`MAX_MAP_COUNT=6`，`0x107ebc1d`） | 🟡 [DLL] Gemini 分析，未實測 | `research/2026-09-18-map-list-zero/` |
| 難度鈕的燈慢一拍（值正確、時機不對）。已排除送出順序 | ⬜ | backlog H6 |
| 房內換圖（H7）：選圖視窗 `ZPopup_MapSelect` 和房間 `co_Map` 都要 `Account_MapList_Check` 通過，**需要兩個條件同時成立**：(a) `MapInfo_SN 0x00210115` 送真的 map id 9001–9012（`MAP_INFO_REAL_ID_MODE`）；(b) 30907 登入時再送一次（`MAP_INFO_ON_GAME_LOGIN_MODE`），因為 9211 那次會在切換場景後遺失（機制 ⬜）。兩個都開之後，選圖視窗列出 4 張 PvE 圖，換圖會經 `0x00220221`→`0x00220223` 同步給加入者。「房間設定變更」視窗另外還要 PvE MaxUser=16（`PVE_MAXUSER_WIRE_MODE`）才會列出地圖；按確認會送 `Name_Change_CQ 0x00220218`（handler 實作中） | ✅ [SHOT] `shots/mapselect-after-30907.png`、`shots/roomset-stuck.png` [LOG][OBS]（未經跨公司審查）。R9 當時只開 (a)，所以無效 | `journal/2026-09-19-1000-maplist-single-entry.md` |
| 紅隊槽顯示玩家：`Room_Default_SN 0x00220203` body+0x10／+0x12 是 Red／Blue TeamIndex，送 0／1（原本誤送建房選項）（`ROOM_TEAM_INDEX_MODE`） | ✅ [LOG][OBS] | `journal/2026-09-18-15-room-team-index.md` |
| `User_Name_SN 0x00220421` body+0x1B 暱稱送 **ANSI**（上限 25 字） | ✅ [DLL]（`0x107eb0ce` → `winToUNICODE`）[OBS] | `journal/2026-09-18-17-user-name-ansi.md` |
| 房間槽頭像不顯示。PilotCode 101 是 BeginSet 編號；改送 `51500101`／`51100801` 也都沒有頭像，所以值不是唯一關卡 | ❌ R14／R15（改值）；根因 ⬜ | `journal/2026-09-18-2305-room-avatar-experiments.md` |
| 離開房間是 `Leave_CQ 0x00220234`（回 `Leave_SA 0x00220235`）；要重設房間狀態，否則 `campaignRoom_` 殘留，大廳機庫會跳過初始化、商城空白（`ROOM_LEAVE_RESET_MODE`）。房內開機庫仍刻意被擋（原作者 `e01f1bb`） | ✅ [DLL][LOG][OBS] L1 | `journal/2026-09-18-20-room-leave-reset.md` |
| 協力模式的**建房對話框沒有任務選項**，任務只能在房內改 | ✅ [SHOT] | `shots/create-room-dialog.png` |

## 4c. 多人化

| 項目 | 狀態 | 依據 |
|---|---|---|
| 30907 登入的身分：Gate `Leave_SA 0x00220132` body+0x06／+0x0A 兩個 u32，客戶端透過 `Certify_Away_Set`（`0x10715f70`）存起來，再放進 `Login_Again_CQ 0x00110124` body+0／+4 原樣帶回。伺服器已改成送非零 token 並用它認人（只有單帳號缺 token 時才退回 last_login） | ✅ [DLL] `0x107dc7d3`–`0x107dc846`、`0x10715f70`、`0x107c3ef5`；[LOG] 帶回的值完全一致（`session-20260919-012749.jsonl:26,32`）（Sol 審查 `research/2026-09-19-sol-review/batch1.md`：部分成立，原文「目前送 0」已過期，已更正） | `journal/2026-09-18-2350-game-login-token-chain.md` |
| 房間聊天：客戶端送 `0x00220505`（258 bytes，與 SN 同 opcode），伺服器目前只回 ACK、不廣播 | ✅ [LOG] | `logs/session-20260918-225741.jsonl` |
| 單人假設清單（M1 15 列、M2 8 列） | 🟡 [CODE] | `docs/reference/multiplayer-audit.md` |
| 區網第二台可以登入並進大廳、商城：portproxy（N0）＋ `publicHost`（N1，`Server_Add_SN 0x00220101` 原本寫死 127.0.0.1）＋白名單**這個組合可用**（三者是一起加上的，個別是否必要沒有分開驗證）。經過 portproxy 後來源 IP 全是 `192.168.208.1`，不能用 IP 認人 | ✅ [LOG][OBS]（Sol 審查 `research/2026-09-19-sol-review/batch1.md`：部分成立，已照意見改寫） | `journal/2026-09-19-0030-second-host-first-login.md` |
| 房間格子開放數：`Room_Boundary_SN 0x00220213` body+0 CurrentUser、+1 MaxUser（原本寫反）；UC `ZPage_Room.uc:768` `m_MaxUser = MaxUser/2`，超過的格子 bClosed，頭像、等級、READY 都不畫。對調後雙方頭像與 READY（`User_State_SN 0x00220401` raw 2）都正常顯示 | ✅ [DLL] `0x107ea95d`/`0x107ea964`（PM 機械核對）；[SHOT] `shots/room-ready-host.png`（修正前 16 格全關）、`shots/room-after-boundary-swap.png`（修正後開 4 格、兩個頭像、test 有 READY）（Sol 審查 `research/2026-09-19-sol-review/batch1.md`：成立） | `journal/2026-09-19-0330-d1-step4-room-join.md` |
| `Room_Default_SN 0x00220203` body+7 是 CurrentUser、+8 是 MaxUser（`0x107ea50f`/`0x107ea516`），伺服器目前在 +7 寫 max、+8 寫 gameMode；目前被後送的 Boundary 蓋掉 | 🟡 [DLL]，待另開單變數任務修 | 同上 |
| 房主踢人：`Kickout_CQ 0x00220337` body u16 UserIndex；回房主 `Kickout_SA 0x00220338` 0/0，對被踢者送 `Leave_SN 0x00220236`（UserIndex＝自己、Kickout=1）→ 客戶端跳「被強制離開房間」並回大廳；其他人收 `Leave_SN`（Kickout 位元組不讀）。被踢者可重新加入 | ✅ [DLL] `0x107eeed0`、`0x107ebe30`、`0x107edc40`（PM 機械核對）；[LOG][OBS] `session-20260919-111258.jsonl` ms 2829050、2876878（Sol 審查 `research/2026-09-19-sol-review/batch1.md`：成立） | `journal/2026-09-19-0330-d1-step4-room-join.md` |
| 投射物消失：加入者開火時約 10% 的發數在自己這台**完全沒有生成**——連 `FireProjectileCenterLoc_UJ` 內 (`ZBase/W_BaseProjectile_Weapon.uc:910`) 的開火動畫都沒播。❌ **排除 H-SPAWN-FAIL**（`Spawn()` 失敗會留下「有動畫、沒爆炸」的殘缺組，一組都沒有）。剩下的解釋是房主端沒送出 `ClientFireProjectileCenterLoc_MH`，該呼叫被 `HasAmmo()` 包著（`W_DefaultMechForWeapon.uc:1324-1336`）→ H-AMMO-DESYNC 🟡 | ✅ [OBS] 彈藥 70→0 即 70 次扣扳機；[LOG] 客戶端 `MetalRage.log` 只有 63 組完整的 `Fire→爆炸→ReLoad`（**未經跨公司審查**） | `journal/2026-09-20-1820-projectile-loss-counted.md` |

## 5. 程式碼裡已知錯誤的名稱與無效封包（尚未修正）

這些是文件已經確認、但程式碼註解或行為還沒跟上的地方。**改之前要單獨測**，不要順手一起改。

| 位置 | 程式碼現況 | 實際（依據） | 影響 |
|---|---|---|---|
| `room.dispatch.js` `sendLobbyBootstrapAfterRoomLeave()` | 送 `0x00230103`，標為「Lobby Room_List_SN」 | `0x00230103` 是 `Respawn_CN`，客戶端沒有這個 handler。真正的 `Room_List_SN` 是 `0x00220204`。✅ [DLL] | 送了等於沒送 |
| 同一函式，以及 `gamelogin.dispatch.js` 的 `SA_LOBBY_ENTER` | 送 `0x00230112`，標為「Lobby Enter SA」 | `0x00230112` 是 `Timeout_SN`（`ZDispatchGame`），不在場景 6 時會被丟棄。`ZDispatchLobby::Enter_SA` 是 `0x00220232` ✅ [DLL]，但它進的是大廳還是房間 ⬜。 | 在大廳送等於沒送；在場景 6 送可能會觸發逾時處理 ⬜ |
| `lobby.dispatch.js` case `0x00230111` | 大廳中當成「Lobby Enter CQ」回應 | `Timeout_CN`，只在場景 6 送出。✅ [DLL] | 大廳時的分支可能永遠不會觸發 ⬜ |
| `lobby.dispatch.js` case `0x00230101` | 註解「Possible Lobby Enter」，回空的 `0x00230102` | `ChangeSlot_CN`／`ChangeSlot_SN`。✅ [DLL] | 選機體的回應內容不對 |
| `lobby.dispatch.js` case `0x00230121` | 註解「Lobby Leave (guessed)」 | `Assist_CN`。✅ [DLL] | 回應無效果，但無害 | **更正 2026-09-20：「無害」講得太滿。**[DLL] `Assist_SN` handler `0x107d5fa0` 的成功路徑會讀到 body+0x17/+0x18，超出我們送的 16 bytes 全零回覆（每場 500 次以上）；`Special_SN 0x107d6300` 更會把 body+0x19 當指標解參考。跟 Death_SN 當初同一類失敗，見 `research/2026-09-20-fallback-ack-audit/notes.md`。
| `lobby.dispatch.js` 檔名與整段 `0x23xxxx` | 叫 lobby | 整段屬於 `ZDispatchGame`；檔內註解已自行承認 | 只是名稱誤導 |
| `game.dispatch.js` 攔截整段 `0x25xxxx` 並稱為「對戰」 | — | 客戶端的 `0x0025xxxx` handler 全屬 `ZDispatchCard`；對戰在 `0x0022xxxx`／`0x0023xxxx`／`0x0042xxxx`。✅ [DLL] | 名稱誤導 |
| `game.dispatch.js` 對 C→S `0x00250102` 回 `0x00250103` | 客戶端確實會送 `0x00250102` ✅ [LOG] | `0x00250103` 不在 dispatch map，回應會被忽略 ✅ [DLL]；`0x00250102` 的真名 ⬜ | 回應無效果 |
| `gate.game.dispatch.js` 約第 714 行 | 對 `0x00222101` 回 `0x00222102`，標為 `Room_Enter_SN` | `0x00222102` 是 `Game_Ready_SN`。✅ [DLL]；在該時機送出是否恰當 ⬜ | 可能是不該送的 Game_Ready |
| 對 `0x00420117` 的 fallback 回 `0x00420118` | — | `0x00420118` 不在 dispatch map。✅ [DLL] | 回應無效果 |
| 對大廳／房間聊天 `0x00220501`／`0x00220505` 回 `0x00220502`／`0x00220506` | — | 這兩個回應 opcode 客戶端都沒有 handler ✅ [DLL]。遊戲內 Team／All 已確認同 opcode回送有效，但大廳／房間尚未實作。 | 大廳／房間聊天仍只當 marker；遊戲內聊天已修 |

## 6. 待查（依優先順序）

1. 登入後預設機體的 ShopList 漏接（backlog H1）、catalog 髒資料（H3）、PvE 輔武／裝備回預設（P2）、困難模式時間上限寫死 10 分鐘（`journal/2026-09-18-18-pve-hard-flow.md`）
2. Legend 機體授權：找出填 `IsLicense` 的封包
3. `ChangeSlot_SN 0x00230102` 照 DLL 結構實作；目前只保存部分結構與行為證據，待 Claude 審查，未實作（`journal/2026-09-17-04-changeslot-body-wip.md`；前文 `journal/2026-09-16-26-slot-sortie-function-followup-analysis.md`）
4. `Assist_CN` 數值遞減代表什麼
5. `Map_PC01` 沒有敵人：`ZMechanicA call failed`、`PreLoadallPveAI_BD` 讀到 null（`journal/2026-09-16-31-combat-control-and-ai-todo.md`）
6. `Game_Score_SN`、`EndRound_SN`、`EndGame_SN` 的 body 結構
7. 第 5 節那些錯誤名稱與無效封包，逐一單獨測試後修正
8. 四個 `CQ_COMPLETE` 候選（`0x00210122`／`0x00210131`／`0x00210132`／`0x00210141`）是哪一個（`journal/2026-09-15-23-investigation-queue.md`）
9. `Leave_SA 0x00220235` 的 body 格式：目前回 6-byte 空標頭能讓客戶端前進，未照 DLL 核對（`journal/2026-09-18-20-room-leave-reset.md`）
10. PVP 房的開戰流程（目前只支援戰役房，`journal/2026-09-15-03-campaign-only-start-flow-pvp-blocked.md`）
