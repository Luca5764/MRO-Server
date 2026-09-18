# docs/journal 索引

一件事一行，只追加。這份索引記錄 `docs/opcode-ledger.md` 第 171 行以後、依 `## ` 標題切分出的每一個段落被搬到哪個檔案，供 `grep`／狀態檢索使用。狀態欄若含「待審」，高階接手時要先處理。

格式：`日期 | 檔名 | 相關 opcode | 狀態 | 一句話摘要`。相關 opcode 最多列 4 個，超過以「…」表示；狀態符號取自原標題（✅／🟡／⬜／❌／★等），沒有則為「—」。

> 2026-09-17：以下 57 筆為一次性搬遷產物（機械式拆分 `docs/opcode-ledger.md`，內容未改動、未下新結論），依檔名排序。之後的新增條目請直接追加在表格最後一行之後。

| 日期 | 檔名 | 相關 opcode | 狀態 | 摘要 |
|---|---|---|---|---|
| 2026-09-15 | `2026-09-15-01-real-client-session-observations.md` | `0x00220501`、`0x00220502`、`0x00220505`、`0x00220506`… | — | 記錄首次用台版客戶端跑完登入到建房的完整 session，列出台帳先前未記載的 opcode 觀察。 |
| 2026-09-15 | `2026-09-15-02-state-lost-on-reconnect-blocks-game.md` | `0x00240301`、`0x00222103`、`0x00250102`、`0x00250103` | — | 說明 gameStarted_ 等狀態綁在單一連線上，客戶端切地圖會斷線重連導致狀態遺失。 |
| 2026-09-15 | `2026-09-15-03-campaign-only-start-flow-pvp-blocked.md` | `0x00222103`、`0x00222102`、`0x00222104`、`0x00220201` | — | 記錄 PVP 房按下開始後的封包序列與客戶端反應。 |
| 2026-09-15 | `2026-09-15-04-loading-stall-0x00220234.md` | `0x00220234`、`0x00220235`、`0x00220233` | ⬜ | 記錄按「上一頁」送出 0x00220234 後伺服器未回應、客戶端卡在 Loading 的觀察。 |
| 2026-09-15 | `2026-09-15-05-even-opcodes-silently-swallowed.md` | `0x00220234` | — | 說明六個 dispatch 對偶數 opcode 不回應且不記錄為 unhandled 的問題，以及後續加上的 fallback 記錄修正。 |
| 2026-09-15 | `2026-09-15-06-ready-host-sn-url-truncated-crash.md` | `0x00420115`、`0x00222103`、`0x00420113`、`0x00222111`… | ✅ | 記錄戰役房開始遊戲後客戶端首次執行 ClientTravel 及其崩潰的封包序列分析。 |
| 2026-09-15 | `2026-09-15-07-loading-stall-fix-confirmed.md` | `0x00220234`、`0x00220235` | 🟡 | 記錄對 0x00220234 回覆空 EVENT_INFO 後客戶端不再卡死的試打結果。 |
| 2026-09-15 | `2026-09-15-08-new-opcodes-on-battle-start-path.md` | `0x00230152`、`0x00420111`、`0x00420113`、`0x00420114`… | ⬜ | 列出戰役房開戰過程中觀察到的新 opcode 及其猜測用途。 |
| 2026-09-15 | `2026-09-15-09-how-client-starts-a-game.md` | `0x00420115`、`0x00222111`、`0x00220213` | ★ | 引用客戶端 MetalRage.log 說明按下遊戲開始時客戶端組出的 travel URL 內容。 |
| 2026-09-15 | `2026-09-15-10-map-id-always-wrong-root-cause.md` | `0x00114a50`、`0x00114b34`、`0x0011497c`、`0x00420115`… | ★★ | 整理 Gemini 對 ZNetwork.dll 的反組譯結果，追查地圖識別碼長期錯誤的原因。 |
| 2026-09-15 | `2026-09-15-11-map-id-fix-confirmed.md` | `0x00220203`、`0x00220226`、`0x00220223` | ✅ | 記錄改送真實 Map ID 後房間面板顯示內容的前後對照。 |
| 2026-09-15 | `2026-09-15-12-player-not-placed-in-room-slot.md` | `0x00222101`、`0x00222103`、`0x00222102`、`0x00220203`… | ⬜ | 記錄房間畫面玩家格子空白、按鈕顯示「準備」而非「開始」等症狀，並歸為同一根因。 |
| 2026-09-15 | `2026-09-15-13-user-default-sn-body-structure.md` | `0x00220233`、`0x00222111`、`0x00220319` | 🟡 | 依 Gemini 反組譯結果整理 User_Default_SN 的 body 與使用者記錄欄位結構。 |
| 2026-09-15 | `2026-09-15-14-room-master-state-clobbered-by-resend.md` | `0x00220233`、`0x00220319` | ✅ | 記錄玩家一度成為房主但隨即被覆蓋的觀察，以及重送序列的分析。 |
| 2026-09-15 | `2026-09-15-15-hangar-no-mechs-or-equipment.md` | `0x00210111`、`0x00210113` | ⬜ | 記錄機庫畫面沒有機體與裝備可選的操作者回報。 |
| 2026-09-15 | `2026-09-15-16-map-change-all-sn-zero-entries.md` | `0x00220226`、`0x00220223` | ⬜ | 記錄客戶端解析 Map_Change_All_SN 得到 0 筆資料及對應的客戶端 log 錯誤訊息。 |
| 2026-09-15 | `2026-09-15-17-client-log-names-failing-function.md` | — | — | 說明客戶端 log 除了 ScriptLog/Browse/LoadMap 外，也會記錄 UnrealScript 執行期錯誤的函式與變數名稱。 |
| 2026-09-15 | `2026-09-15-18-battle-opcodes-located-not-0x25xxxx.md` | `0x00250000`、`0x00250203`、`0x00250301`、`0x00222111`… | ★★★ | 說明用反組譯客戶端 dispatcher 的方式定位對戰相關 opcode，發現它們不在 0x25xxxx 範圍。 |
| 2026-09-15 | `2026-09-15-19-full-server-client-opcode-map.md` | `0x00110152`、`0x00110125`、`0x00110131`、`0x00210101`… | ★★★ | 介紹 tools/dispatch-map.py 模擬客戶端分派邏輯得到的完整 opcode 映射表，及各 dispatcher 的 handler 數量。 |
| 2026-09-15 | `2026-09-15-20-map-change-all-sn-body-confirmed.md` | `0x00220226` | ✅ | 以反組譯 Map_Change_All_SN 的組語驗證其 body 結構。 |
| 2026-09-15 | `2026-09-15-21-game-user-sn-record-size-confirmed.md` | `0x00222112`、`0x00230111` | ✅ | 以反組譯結果確認 Game_User_SN 每筆記錄長度為 0x1E5 bytes。 |
| 2026-09-15 | `2026-09-15-22-known-code-level-pitfalls.md` | `0x00020080`、`0x00020084`、`0x00250181`、`0x00020099`… | — | 記錄兩個程式碼層已知陷阱：type&0x80 誤攔 dispatch opcode，以及 Keep Alive 早於 Time Sync 會讓 process 崩潰。 |
| 2026-09-15 | `2026-09-15-23-investigation-queue.md` | — | — | 列出待調查的 opcode 與結構清單。 |
| 2026-09-16 | `2026-09-16-01-game-info-sn-wrong-map-id-field.md` | `0x00222111` | ★★★ | 以反組譯因果鏈追查客戶端崩潰是因 Game_Info_SN 地圖 ID 寫錯欄位。 |
| 2026-09-16 | `2026-09-16-02-game-user-sn-in-room-causes-hang.md` | `0x00222112`、`0x00220234`、`0x00230111` | ❌ | 記錄修正 opcode 後 Game_User_SN 在房間內送出時客戶端變全白視窗停止回應的觀察（後續章節撤回）。 |
| 2026-09-16 | `2026-09-16-03-room-master-prompt-repeats-cost-of-resend.md` | — | — | 說明房主提示重複跳出的成因是房主通知隨房間狀態重送機制而多次觸發。 |
| 2026-09-16 | `2026-09-16-04-game-info-sn-sent-too-late.md` | `0x00220201`、`0x00222103`、`0x00420113`、`0x00222111`… | ★★★ | 重新檢視 fallback URL 的判讀，說明崩潰真正原因是 Game_Info_SN 送出時機太晚而非欄位錯誤。 |
| 2026-09-16 | `2026-09-16-05-game-info-sn-body-structure-ghidra.md` | `0x00222111` | ✅ | 以 Ghidra 反編譯 Game_Info_SN handler 得到的 body 結構。 |
| 2026-09-16 | `2026-09-16-06-game-user-sn-record-structure-ghidra.md` | `0x00222112` | ✅ | 以 Ghidra 反編譯 Game_User_SN 得到記錄的標頭與逐欄結構。 |
| 2026-09-16 | `2026-09-16-07-map-info-list-empty-event-order.md` | — | ★ | 以反編譯 Map_Change_All_SN 追查 m_MapInfoList 為空是因為事件在資料寫入前就先觸發。 |
| 2026-09-16 | `2026-09-16-08-retraction-white-screen-never-happened.md` | `0x00222112`、`0x00222111` | ❌❌ | 撤回先前兩條「客戶端變成全白視窗」的記錄，說明成因是操作者截圖只框到視窗標題列。 |
| 2026-09-16 | `2026-09-16-09-game-info-url-get-full-logic.md` | — | ✅ | 以 Ghidra 反編譯 Game_Info_URL_Get 的完整組 URL 邏輯。 |
| 2026-09-16 | `2026-09-16-10-two-game-info-sn-handlers-diff.md` | `0x00222111`、`0x00222103` | — | 說明 Game_Info_SN 依場景存在兩個 handler，差別在於是否呼叫 Game_Data_Clear。 |
| 2026-09-16 | `2026-09-16-11-room-map-list-shows-after-double-send.md` | — | ✅ | 記錄連送兩次 Map_Change_All_SN 後房間地圖清單開始顯示內容，以及仍未解決的地圖選單彈窗與 GameStart URL 問題。 |
| 2026-09-16 | `2026-09-16-12-observing-client-from-wsl.md` | — | — | 記錄從 WSL 對客戶端截圖與操作（滑鼠/鍵盤）的可行性測試結果。 |
| 2026-09-16 | `2026-09-16-13-battle-start-is-scene-driven.md` | `0x00222111`、`0x00410102`、`0x00410101`、`0x00410103`… | ★★★ | 以反編譯各 dispatcher 的 Check(SCENE_TYPE) 說明開戰流程是由場景旗標驅動。 |
| 2026-09-16 | `2026-09-16-14-battle-start-static-analysis.md` | `0x00420111`、`0x00222111`、`0x00222103` | ★ | 整理各開戰相關 handler 依場景與行為的完整靜態分析結果。 |
| 2026-09-16 | `2026-09-16-15-breakthrough-server-driven-start-no-crash.md` | `0x00222103`、`0x00420111`、`0x00222111`、`0x00222102`… | ★★★ | 記錄啟用伺服器驅動開戰模式後，客戶端第一次沒有崩潰而進入等待狀態的實測。 |
| 2026-09-16 | `2026-09-16-16-entered-battle-map-success.md` | `0x00222103`、`0x00420111`、`0x00222111`、`0x00222102`… | ✅✅✅ | 記錄伺服器驅動開戰流程加上 Ready_Host_SQ 後客戶端成功 travel 進入戰鬥地圖的實測。 |
| 2026-09-16 | `2026-09-16-17-stuck-at-briefing-waiting-spawn.md` | `0x00420114`、`0x00420116`、`0x00420117`、`0x00420118`… | — | 記錄進入地圖後客戶端停在任務簡報畫面、機體未 spawn 的觀察，以及進圖後客戶端送出的封包列表。 |
| 2026-09-16 | `2026-09-16-18-scene-6-three-cn-messages.md` | `0x00230111`、`0x00230151`、`0x00420117`、`0x00230112`… | ✅ | 以反組譯定位場景 6 中客戶端會送出的三個 CN 封包及其送出前提。 |
| 2026-09-16 | `2026-09-16-19-team-255-root-cause-chain.md` | `0x00222112` | ✅ | 以反組譯追查 travel URL 裡 team=255 的成因鏈，追到 Game_User_Team_Get 的查表邏輯。 |
| 2026-09-16 | `2026-09-16-20-game-info-sn-body-confirmed.md` | `0x00222111` | ✅ | 以組語（非反編譯器）核對 Game_Info_SN body 欄位對應到 Game_Info_Set 的參數順序。 |
| 2026-09-16 | `2026-09-16-21-game-user-sn-record-layout-confirmed.md` | `0x00222112` | ✅ | 以組語核對 Game_User_SN 記錄緩衝區各偏移對應的實際讀取指令。 |
| 2026-09-16 | `2026-09-16-22-mech-selection-is-native-unrealscript.md` | `0x00230101`、`0x00230102` | ✅ | 說明選機體呼叫鏈是 UnrealScript native 函式直接呼叫 ChangeSlot_CN，並記錄玩家回憶的進圖流程。 |
| 2026-09-16 | `2026-09-16-23-server-changes-this-round.md` | `0x00230101` | — | 說明本輪同時修改 Game_Info_SN 的 TimeLimit 欄位與啟用 Game_User_SN 的時序這兩項改動，並解釋為何能各自分辨觀察特徵。 |
| 2026-09-16 | `2026-09-16-24-handoff-verification-prep.md` | — | — | 記錄接手前對客戶端 log 路徑、既有 log 基準版本、程式碼語法檢查與 ChangeSlot 相關符號位址的確認清單。 |
| 2026-09-16 | `2026-09-16-25-team-fixed-still-no-mech-select-screen.md` | — | — | 記錄 team 欄位修正後的實測結果，team 已為 0 但選機體畫面仍未出現，並排除「team 修正即可出現選機體」的假設。 |
| 2026-09-16 | `2026-09-16-26-slot-sortie-function-followup-analysis.md` | — | — | 以反組譯追查 Game_Slot_Set、ChangeSlot_SN、Game_User_Sally_Add 等出擊相關函式的行為與欄位。 |
| 2026-09-16 | `2026-09-16-27-wearinfo-slot-key-misalignment-fixed.md` | `0x00240107` | — | 以反組譯定位 WearInfo_SN 記錄與機庫槽位查表用的 key 欄位錯位問題並記錄修正與重播驗證結果。 |
| 2026-09-16 | `2026-09-16-28-wearinfo-fix-still-spectator-respawn-test.md` | `0x00230101`、`0x00230103`、`0x00230104`、`0x00230106`… | — | 記錄 WearInfo 修正後機庫恢復但仍未觸發選槽流程，以及 Respawn_SN/Respawn_CN 相關的反組譯與試打修正。 |
| 2026-09-16 | `2026-09-16-29-first-successful-mech-spawn.md` | `0x00230151`、`0x00230152`、`0x00230104`、`0x00420114` | ✅ | 記錄客戶端送出 BeginRound_CN 後伺服器依序回應並使玩家首次成功生成並持有機體的實測。 |
| 2026-09-16 | `2026-09-16-30-death-respawn-regression-test.md` | `0x00230123`、`0x00230124`、`0x00230104`、`0x00230103` | — | 記錄 Death_CN/Death_SN/Respawn_SN 的反組譯結構與死亡重生流程的回歸實測結果。 |
| 2026-09-16 | `2026-09-16-31-combat-control-and-ai-todo.md` | `0x00020083` | — | 記錄機體可操控與重生後，開火沒有對應封包以及地圖無敵人等待查事項。 |
| 2026-09-16 | `2026-09-16-32-weapon-no-fire-wrong-model-root-cause.md` | — | — | 以客戶端 log 與 Cache.Bin/DLL 分析追查武器無法開火、機體外觀顯示成另一台機體的根因。 |
| 2026-09-16 | `2026-09-16-33-weapon-model-true-root-cause-verified.md` | — | — | 以截圖與 Cache.Bin/DLL 反編譯進一步驗證武器掛載與機體型號問題的真正根因。 |
| 2026-09-17 | `2026-09-17-01-review-iteminfo-stall-root-cause.md` | `0x00230121` | — | 覆核武器掛載修正效果，並以 Cache.Bin Table 4 解析檢視預設配裝資料與資料庫的不一致之處。 |
| 2026-09-17 | `2026-09-17-02-ledger-contradictions-adjudicated.md` | `0x00230103`、`0x00230112`、`0x00222102`、`0x00420116`… | ✅ | 高階逐條裁決舊台帳 8 條矛盾（重跑 dispatch-map 核對），建立 state.md；程式碼未改。 |
| 2026-09-16 | `2026-09-16-34-handoff-history.md` | — | — | 舊版 HANDOFF.md 的交接快照與狀態說明，2026-09-17 原文搬入。 |
| 2026-09-17 | `2026-09-17-03-iteminfo-accumulation.md` | `0x00210111` | ✅ [DLL]；待 Claude 審查 | ItemInfo 依實例 key 追加或替換單筆；追到 Core 陣列增刪與斷線完成、初始化的整庫清空路徑，未改程式或實測。 |
| 2026-09-17 | `2026-09-17-04-changeslot-body-wip.md` | `0x00230102` | 🟡 WIP／待 Claude 審查 | 保存已核對的 status、user、slot 與存入／後續呼叫位址；四個未讀 bytes、精確總長與腳本效果仍未知，未核對的子 agent 搜尋另標待審。 |
| 2026-09-17 | `2026-09-17-05-test-a-no-effect.md` | `0x00020083` | ✅ [LOG]／[SHOT] | 測試 A 第一輪：開火、副武器、推進器都沒送出新封包，彈藥沒減少（文末更正：戰鬥中聊天有送出 `0x00220507`／`0x00220509`／`0x00360601`，所以不是整個輸入被擋）。 |
| 2026-09-17 | `2026-09-17-06-fire-gate-weapon-state.md` | — | ✅ [DLL] 閘門；🟡 原因 | 開火要 `AWeapon+0x41c`=4/0x11（`0x10485563`）；原生碼只在彈藥 9↔4 切換，初始 ready 由讀不到的腳本設定；右鍵是瞄準，副武器是 2／3／4。 |
| 2026-09-17 | `2026-09-17-06-fire-gate-weapon-state.md`（追加 A4） | `0x00230152` | ✅ [LOG]／[DLL] | A4：R、1、左右鍵、2／3／4、Space、F 全部沒反應，只有移動、視角、聊天可用；`BeginRound_SN` 在場景 6 無條件呼叫 `Game_Play_Start`。 |
| 2026-09-17 | `2026-09-17-07-tzp-script-source-decrypted.md` | — | ✅ [DLL]／[TEST] | `.tzp` 以 Core.dll `0x101622d0` 的 XOR 表離線解密，內含 UnrealScript 原始碼（1539 class，不 commit）；開火與跳的閘門候選：`bSetWepComplete`、`bNoInputKey_JW`。 |
| 2026-09-17 | `2026-09-17-08-account-level-gm-keybinds.md` | `0x00210101` | ✅ [SRC]／[DLL]；待測 |（已被 2026-09-17-11-grade-info-sn-root-cause.md 更正） 帳號權限 ≥1 會讓 `LevelInfo` 套用 `ApplyGMControl`（沒有 Fire，左右鍵與 Space 變成切換觀戰視角）；`lucas` 權限改成 0 待測試 C。 |
| 2026-09-17 | `2026-09-17-09-uelib-class-deserialization-fixed.md` | — | ✅ [DLL]／[TEST]（Claude 已審） | UELib 無法讀取 class 物件根因修復：MRO v134/29 未被識別為 UE2_5 世代導致 CppText 多讀與 StructFlags 漏讀；補入 GameBuild.MetalRage 後 class defaultproperties 與屬性全部可讀。 |
| 2026-09-17 | `2026-09-17-10-sol-review-input-failure.md` | — | ✅ 審查（Sol 高階）＋ Claude 抽查＋[OBS] 測試 F | 能用的鍵在 GM 和一般按鍵表都一樣；測試 F：PvE 內按鍵設定頁按儲存（重跑 ApplyControl）後全部按鍵恢復，確認是開局時按鍵表沒套上；`0x00221221`／`0x00221222`／`0x00221211` 格式。 |
| 2026-09-17 | `2026-09-17-11-grade-info-sn-root-cause.md` | `0x00510101`、`0x00210101` | ✅ [DLL]／[OBS]／[SHOT] 測試 M 通過 | 按鍵失效根因：伺服器送 `Grade_Info_SN`=11 → 客戶端權限 4（開發者）→ PvE 開局套用 GM 按鍵表；`DefaultInfo_SN` 那個欄位其實是 UserType（更正 08 篇）。改成送 0。 |
| 2026-09-17 | `2026-09-17-12-pve-round-zero.md` | `0x00222111`、`0x00220201` | ✅ [DLL] 欄位；🟡 Create_CQ 順序；✅ [SHOT] 測試 N 通過（ROUND 1、生怪） | PvE 回合沒啟動：Game_Info_SN body+0x15 是 MapInfo.Round，我們送 0，`ModeReset_BD` 直接 return；改送建房 body[6]（PlayRound=5）。附 GAME_INFO 完整偏移並更正 2026-09-16-05。 |
| 2026-09-17 | `2026-09-17-13-death-assist-cn.md` | `0x00230123`、`0x00230121`、`0x00230104` | ✅ [DLL]；測試 O 斷線→修 client.js；測試 P 未再斷線 ✅ [LOG] | Death_CN：body+0 擊殺者、body+2 被擊殺者、類型 1～4＝玩家；伺服器原本擊殺 AI 也送 Respawn_SN(0)，改成只對玩家死亡重生。Assist_CN 格式初步記錄。 |
| 2026-09-17 | `2026-09-17-14-campaign-result.md` | `0x00230139`、`0x0023013a`、`0x00222213` | ✅ [DLL]／[LOG]／[OBS] 測試 Q：結算頁＋回房間打通 | 測試 P 沒斷線；任務失敗時客戶端送 Campaign_CN（body[2]=1 成功／2 失敗），伺服器沒回應，畫面停在遊戲中；Campaign_SN 只更新分數，結束遊戲推測要 EndGame_SN。 |
| 2026-09-17 | `2026-09-17-15-assist-cn-sn-format.md` | `0x00230121`、`0x00230122` | 🟡 [DLL]；Claude 已抽查 | G1：Assist_CN（body 7 bytes）與 Assist_SN（body ≥25 bytes）完整欄位與組語位址核對；定位 Game_Assist/Game_User_Assist_Set 兩組得分更新。 |
| 2026-09-17 | `2026-09-17-16-death-sn-format-verification.md` | `0x00230123`、`0x00230124` | 🟡 [DLL]；Claude 已抽查 | G2：Death_SN（body 0x51 bytes）所有欄位與組語位址逐一核對；確認 State 切換屬實、AI 擊殺送 Death_SN 無害且能觸發 HUD 廣播。 |
| 2026-09-17 | `2026-09-17-17-game-chat-broadcast-format.md` | `0x00220507`、`0x00220509`、`0x00360601`、`0x00360602` | 🟡 [DLL]；Claude 已抽查 | G3：遊戲內聊天廣播格式組語核對；確認 All/Team 頻道為同 opcode 對稱廣播（258b body、雙空格切分），定位 HUD 顯示路徑。 |
| 2026-09-17 | `2026-09-17-18-create-cq-map-difficulty.md` | `0x00220201`、`0x00220221` | ✅ [DLL]（Claude 核對） | G4：Create_CQ（67b）與 Map_Change_One_CQ（26b）逐欄位組語核對；分析 PvE 難度計算公式與地圖選定傳遞機制。 |
| 2026-09-17 | `2026-09-17-19-pve-map-difficulty-selection.md` | `0x00220201`、`0x00220221`、`0x00222111` | 待測 R | PvE 地圖改用客戶端選的 MapIndex（建房 body[2..3]、Map_Change_One_CQ w1/b5），不再寫死 9001；預設會變成 9010 Map_PC04（ZSetCoreModePve）。 |
| 2026-09-17 | `2026-09-17-20-iteminfo-chunking.md` | `0x00210111` | ✅ [LOG][OBS] H1／H2：分包含機體列後機庫顯示機體；PvE 仍用 1 號機 | ItemInfo 改成共用 sender 並分包（先 12 筆一包、內容不變），驗證分包本身；下一步加入機體列讓機庫顯示機體。 |
| 2026-09-17 | `2026-09-17-21-battle-score-totals.md` | `0x00230124` | ✅ [DLL]／[OBS] S1 通過（有分數） | Game_User_Battle_Set 是直接指定 Kill/Death/Exp/Point，伺服器原本送 0 會清空戰績；改成送累計值（exp/point 暫定每殺 10）。 |
| 2026-09-17 | `2026-09-17-22-pve-mech-slot-selection.md` | `0x00230101`、`0x00230102`、`0x00240111` | ✅ Claude 已審＋實作，測試 T2／T3 通過 | G5：確認 PvE `ZSlotSelectPage` 關閉後經 `Game_Slot` 送 `ChangeSlot_CN` 的 body 與時機；對照 hangar default-slot 路徑、目前 `Game_User_SN` 狀態缺口與跳過選擇頁的實測原因。 |
| 2026-09-17 | `2026-09-17-23-g6-slot-change-save.md` | `0x00240107`、`0x00240108` | 🟡 高階靜態審查通過／實測阻塞／預設關閉 | G6：CQ／SA 欄位已由 DLL 位址核對；商店清單空白且購入物不顯示，客戶端沒有第二件裝備可選，待先修 ShopList／Packege_Item 顯示路徑。 |
| 2026-09-17 | `2026-09-17-23-game-chat-echo-g7.md` | `0x00220507`、`0x00220509` | ✅ [DLL][LOG][OBS] V1 通過 | G7：遊戲內隊伍與全體聊天以相同 opcode／258-byte body 回送，兩頻道均在 HUD 顯示；高階審查修正 disabled fallback 後，預設 enabled。 |
| 2026-09-17 | `2026-09-17-24-g6-unblock-shop-list.md` | `0x00240241`、`0x00240242`、`0x00240131`、`0x00210111` | 🟡 待審／預設關閉 | G6-unblock：定位 ShopList 四個旗標右移造成 `IsShow=false`；保留 Packege 格式，購買成功補送既有 chunked ItemInfo；未取得 Shop handler DLL VA，未實測。 |
| 2026-09-18 | `2026-09-18-01-g6b-shop-list-filter-root-cause.md` | `0x00240241`、`0x00240242`、`0x00240131`、`0x00240102`、`0x00240113` | 🟡 待審／只分析 | G6b：`Item_List_Check` 先以 Cache record 通過；實際送出的 21x 主武器在 `ItemSubordinateCheck` 與 1 號小型機不相容，SQL slot=1 又排除官方 221 family；附完整 DLL 位址、封包 hex、最多兩個單變數實驗，未改程式／DB／未實測。 |
| 2026-09-18 | `2026-09-18-02-g6c-shop-compat-experiment.md` | `0x00240241`、`0x00240242` | ✅ Claude 高階裁定＋實測 | G6c：把 slot=1 主武器清單第一筆由 `21100101` 換成 `22100101` 後該筆立刻在客戶端顯示，其餘 21x 家族仍不顯示，證實商店空白是伺服器 `mech_type` 篩選送出客戶端相容性檢查會擋掉的商品；IsShow 偏移／送出時機／`Item_List_Check` 均排除；開關已還原為 disabled，下一步為 G6d。 |
| 2026-09-18 | `2026-09-18-03-g6d-shop-full-catalog.md` | `0x00240241`、`0x00240242` | ✅ Claude 高階審查／裁定＋實測 | G6d：enabled 送出 1541 筆完整 catalog、每分類最多 45 筆分包後，1 號機主武器商城正常顯示相容商品；G6b/G6c 根因成立。`27430`、強化品同價與購入物未進庫存列 🟡／⬜ 另案。 |
| 2026-09-18 | `2026-09-18-04-g6e-purchase-inventory-classification.md` | `0x00240201`、`0x00240202`、`0x00210111` | ✅ Claude 高階審查＋實測 | G6e：W1 確認購買物寫入當下機庫 `mech_type=1`，購買後重送 37 筆 ItemInfo；庫存仍受 SerialIndex 保留區阻擋，後由 G6f/W2 解決。 |
| 2026-09-18 | `2026-09-18-05-g6f-item-serial-reserved-range.md` | `0x00210111` | ✅ Claude 高階審查＋實測 | G6f：70 筆 `items.id` 由 154–223 搬至 100154–100223，AUTO_INCREMENT=200000；W2 重登後四個庫存面板正常顯示。 |
| 2026-09-18 | `2026-09-18-06-g6-equip-save-verified.md` | `0x00240107`、`0x00240108`、`0x00210111`、`0x00240241`、`0x00240242`、`0x00222112`、`0x00230102` | ✅ Claude 高階審查＋實測 | G6 結案：四層阻塞解除；W3 換裝寫 DB、完全重登後保留 `22100301`，追加 W4 證明 PvE `Game_User_SN`／出場武器也是 `22100301`。 |
| 2026-09-18 | `2026-09-18-07-shop-period-variants.md` | `0x00240241`、`0x00240242` | ✅ Claude 高階審查＋實測 | G6g：Cache.Bin `RepresentIndex` 位於 `+0x04`、期限位於 `+0x43`；全送期限變體但主列表只顯示代表項，購買彈窗仍列完整期限選單。 |
| 2026-09-18 | `2026-09-18-08-room-map-sync.md` | `0x00220203`、`0x00220223`、`0x00220226`、`0x00222111` | 🟡 待審／預設關閉 | R1：房間狀態改以 `campaignMapCacheKey_` 同步實際 9001–9012 map ID；保留 `bodyCache` 的 Cache index 型別，未實測。 |
| 2026-09-18 | `2026-09-18-09-room-string-encoding.md` | `0x0022021A`、`0x00220233`、`0x00220421` | 🟡 待審／預設關閉 | R2：房名加 ANSI 窄字串實驗，User_Default 以共用安全 ASCII 路徑重寫；保留 `0x00220421` 未確認的 UTF-16LE 路徑，未實測。 |
| 2026-09-18 | `2026-09-18-10-map-change-one-sa.md` | `0x00220221`、`0x00220222`、`0x00220223`、`0x00220226` | 🟡 待審／預設關閉 | R3b 更正 R3：`Map_Change_One_SA` enabled 為 6-byte 全零成功標頭＋10-byte payload（共 16 bytes）；disabled 保留舊 10-byte 路徑，未實測。 |
| 2026-09-18 | `2026-09-18-11-room-default-map-entry.md` | `0x00220203` | 🟡 待審／預設關閉 | R4：首筆 entry `body+0x20+0x00` 由 Cache 列索引改為實際 map ID 的預設關閉實驗；與已修正的 `body+0x05 mapIndex` 分開，未實測。 |
| 2026-09-18 | `2026-09-18-12-map-change-one-sn-settings.md` | `0x00220221`、`0x00220223` | 🟡 待審／預設關閉 | R6：依 DLL 交叉確認 Map_Change_One_SN 四個設定欄位；enabled 回送 CQ 採納／伺服器保存值，disabled 保留 0/1/0/0，未實測。 |
| 2026-09-18 | `2026-09-18-13-map-change-order.md` | `0x00220221`、`0x00220222`、`0x00220223`、`0x00220226` | 🟡 待審／預設關閉 | R7b 更正 R7：ONE 先於 ALL 已被實測推翻；enabled 改為換圖回應在 ONE 後補送一次 ALL，初始進房不變，未實測。 |
| 2026-09-18 | `2026-09-18-14-map-info-sn-real-ids.md` | `0x00210115` | 🟡 待審／預設關閉 | R9：MapInfo_SN 原本送 DB row 0..5，客戶端 m_MapList 檢查需要 Cache 的真實 PvE id；新增預設關閉開關，enabled 暫送 9001–9012 全清單，未實測。 |
