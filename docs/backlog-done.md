# Backlog：已結案的契約

這份檔案收錄 `docs/backlog.md` 中已完成或已被裁定結案（含 ❌ 排除）的契約，內容自 `docs/backlog.md` 原樣搬遷，未改動任何文字（只在每段前加一行「結案」說明）。判斷依據見各段第一行；共通規則見 `docs/backlog.md` 開頭。

---

> 結案：2026-09-17，依據 `docs/journal/2026-09-17-15-assist-cn-sn-format.md`（INDEX 已標 🟡［DLL］；Claude 已抽查）

## G1（✅ 完成：Gemini 分析，Claude 已審）：Assist_SN `0x00230122` 與 Assist_CN `0x00230121` 的完整格式

- **目標**：確定伺服器收到 `Assist_CN` 後應該回什麼（或不回），以及 `Assist_SN` 的 body 結構與客戶端的處理效果。
- **範圍**：ZNetwork.dll 的 `ZDispatchGame::Assist_CN`（thunk `0x107060eb` → `0x107d9c60`）、`ZDispatchGame::Assist_SN`（用 `disasm.py exports ZNetwork.dll Assist_SN` 找），以及它們在腳本端的呼叫者／事件（grep `Game_Campaign_Damage`、`Assist` 於 `~/mro-decrypted/src`）。
- **背景**：`docs/journal/2026-09-17-13-death-assist-cn.md`。PvE 中客戶端（host）送 `Assist_CN`，body 7 bytes，例如 `0000 0100 04 01 50`；伺服器目前回 16 bytes 全 0 的 `Assist_SN`。body+0／+2 語意、body+6 是否為 HP％ 都未確認。
- **限制**：同共通規則。
- **交付**：Assist_CN 每個欄位（偏移、型別、來源參數、語意）與 Assist_SN 每個欄位（偏移、型別、寫入到哪個函式／欄位、客戶端效果）的表格，附組語位址；建議伺服器的正確回應（待審）。
- **完成條件**：兩個封包的每個 body 偏移都有組語位址佐證，或明確標出哪幾個無法確認、卡在哪裡。


> 結案：2026-09-17，依據 `docs/journal/2026-09-17-16-death-sn-format-verification.md`（INDEX 已標 🟡［DLL］；Claude 已抽查）

## G2（✅ 完成：Gemini 分析，Claude 已審）：Death_SN `0x00230124` body 與伺服器目前送法的比對

- **目標**：核對伺服器送的 `Death_SN`（`dispatch/lobby.dispatch.js` 的 `case 0x00230123`，body 0x51 bytes）每個欄位是否跟客戶端 handler 讀取的一致，特別是 AI 被擊殺（類型 0x0b、0x15 等）時客戶端做了什麼。
- **範圍**：ZNetwork.dll `ZDispatchGame::Death_SN`；它呼叫的 `UZNetwork_DJ` 函式（例如 `Game_User_*`、`Game_Score_*`、respawn 狀態）；腳本端對應的事件處理。
- **背景**：`docs/journal/2026-09-17-13-death-assist-cn.md`（Death_CN：body+0 擊殺者、+2 被擊殺者、+4 類型，1～4 = 玩家）。伺服器程式碼註解說「Death_SN 把 game user 從 alive(2) 改成 respawnable(1)」，未必正確。
- **限制**：同共通規則。**只讀伺服器程式，不改**。
- **交付**：Death_SN body 欄位表（偏移、型別、去向，附組語位址）；伺服器目前寫的每個欄位對或錯；AI 被擊殺時伺服器該不該送 Death_SN、送了會不會有副作用（待審）。
- **完成條件**：body 0x00～0x50 中客戶端實際讀取的偏移全部列出並附位址。


> 結案：2026-09-17，依據 `docs/journal/2026-09-17-17-game-chat-broadcast-format.md`（INDEX 已標 🟡［DLL］；Claude 已抽查）

## G3（✅ 完成：Gemini 分析，Claude 已審）：遊戲內聊天廣播（`0x00220507`／`0x00220509`／`0x00360601`）

- **目標**：確定要讓聊天訊息顯示在畫面上，伺服器該回哪個 opcode、body 格式是什麼。
- **範圍**：客戶端送出的 CN／CQ（`0x00220507` Team、`0x00220509` All、`0x00360601` Clan）的建構函式；客戶端 dispatcher 裡 `Chat_Game_Team_SN`、`Chat_Game_All_SN`（`0x00220507`、`0x00220509`，名稱見 `docs/client-dispatch-map.md`）、`Chat_Clan_All_SN 0x00360602` 的 handler；腳本端顯示聊天的路徑。
- **背景**：`docs/journal/2026-09-17-05-test-a-no-effect.md`（聊天 body 258 bytes：開頭 0、ASCII 暱稱、兩個空白、Big5 文字）。目前伺服器回 `0x00220508`／`0x0022050a`／`0x00360602` 的 16 bytes 空包，訊息沒有顯示；`0x00220508`、`0x0022050a` 不在客戶端 dispatcher。
- **限制**：同共通規則。
- **交付**：每個頻道「客戶端送的封包格式」與「伺服器應回的 opcode ＋ body 格式」表格，附組語位址；注意字串編碼（ASCII／Big5／UTF-16）與長度上限（整包 ≤ 0x400 bytes，見 `docs/state.md`）。
- **完成條件**：Team 與 All 兩個頻道的 SN body 每個欄位都有組語佐證。


> 結案：2026-09-17，依據 `docs/journal/2026-09-17-18-create-cq-map-difficulty.md`（INDEX 已標 ✅［DLL］，Claude 核對）

## G4（✅ 完成：Gemini 分析，Claude 已審）：建房 Create_CQ `0x00220201` 組語核對，以及地圖／難度怎麼傳

- **目標**：用組語確認建房封包的欄位順序，並找出伺服器應該把哪個值當成地圖編號送進 `Game_Info_SN body+0x11`，讓客戶端選的地圖／難度生效。
- **範圍**：`ZDispatchLobby::Create_CQ`（`0x107e5b60`）與 `UZNetwork_DJ::execLobby_Room_Create`（`0x10718740`）的組語 push／mov 順序；腳本 `ZGameMainMenu/ZPopup_CreateRoom.uc`（約 506 行）、`ZPanel_RoomInfo.uc`（地圖清單、難度 `m_Difficulty`、`PlayPve`）；房間內改地圖／選項的 CQ（`Option_Change_CQ` 等）。
- **背景**：`docs/journal/2026-09-17-12-pve-round-zero.md`。Ghidra 推測 body[1]=MaxUser、[2..3]=MapIndex、[4..5]=PlayTime、[6]=PlayRound、[7..8]=Kill、[9..10]=Goal，**尚未核對組語**。實際封包 `01 10 3223 3c00 05 ...` 的 MapIndex 是 9010，但伺服器寫死送 9001（`dispatch/gate.game.dispatch.js` 約 613 行 `campaignMapCacheKey_ = 9001`）。地圖表參考 `docs/journal/2026-09-15-10-map-id-always-wrong-root-cause.md`。
- **限制**：同共通規則。
- **交付**：Create_CQ body 欄位表（附組語位址）；房間內變更地圖／難度時送的封包與欄位；建議伺服器怎麼取地圖編號與回合數（待審）。
- **完成條件**：body[0..13] 每個偏移都有組語佐證。


> 結案：2026-09-17，依據 `docs/journal/2026-09-17-22-pve-mech-slot-selection.md`（INDEX 已標 ✅ Claude 已審＋實作，測試 T2／T3 通過）

## G5：PvE／戰鬥用哪一台機體，客戶端怎麼告訴伺服器

- **目標**：找出玩家選的出擊機體（槽位 1～8）是透過哪個封包、在哪個時機傳給伺服器，讓伺服器 `Game_User_SN 0x00222112` 送出正確的機體與配裝。
- **範圍**：腳本 `ZGameMainMenu/ZPage_Hangar.uc`（約 1860–1890 行 `My_Slot_SelectedNumber_Set`、`SlotChangeSend`）、房間頁面的機體選擇（grep `m_SelUnitSlot`、`SlotNumber`、`My_Slot_Selected` 於 `ZGameMainMenu`）、`ZGameMidMenu/ZSlotSelectPage.uc`、`ZBase/DefaultPlayerController.uc:925`（`Game_Slot`）；ZNetwork.dll 的 `My_Slot_SelectedNumber_Set`／`_Get`、`Hangar_Slot_Select`（`DefaultSlot_Change_CQ 0x00240111`，opcode 寫入點 `0x107dd5b3`）、`Game_Slot`→`ChangeSlot_CN 0x00230101`、以及開局相關 CQ（`Game_Start` `0x00222103` body、`Room_Ready` 等）有沒有帶槽位；`Game_User_SN` 的 selected mech 欄位（`docs/journal/2026-09-16-21-game-user-sn-record-layout-confirmed.md`）。
- **背景**：`docs/journal/2026-09-17-20-iteminfo-chunking.md` 最後一節。機庫切換機體時客戶端沒送任何封包；房間選第三台也沒有新封包；伺服器只在收到 `Slot_Change_CQ 0x00240107` 時更新 `currentHangarSlot_`。ChangeSlot_SN 相關的未完成分析在 `docs/journal/2026-09-17-04-changeslot-body-wip.md`。
- **限制**：同共通規則（只分析、不改程式、結論待審）。
- **交付**：流程圖（文字即可）：玩家在機庫／房間／開局選機體 → 客戶端呼叫哪些函式 → 送出哪個 opcode（附組語位址與 body 欄位）→ 伺服器應該怎麼更新狀態與回應；列出本次實測「沒有送封包」的原因（例如只在某個按鈕、某個場景才送）。
- **完成條件**：至少確認一條「客戶端把選擇的槽位送到伺服器」的路徑（opcode＋body 偏移＋組語位址），或明確證明原版是由伺服器在別處決定、客戶端不送。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-06-g6-equip-save-verified.md`（標題本身已標「✅ 已完成並實測」）

## G6（✅ 已完成並實測 2026-09-18，證據見 journal 2026-09-18-06）：機庫換裝備存檔

> **注意**：`flash-wip` 分支停在 `cd7faf5`，**缺少 2026-09-17 下午之後所有伺服器修正**（Grade_Info_SN、Round、選機體、ItemInfo 分包、戰績等）。開工前先 `git merge reverse-work`（在 `flash-wip` 上），否則會在舊程式上改、而且重啟伺服器會跑舊程式。


- **目標**：在機庫替某台機換主武器／左右武器／推進器後，伺服器把新配裝存進 DB；重新登入仍保留；PvE 出場時手上是新武器。
- **範圍**：
  - 客戶端 → 伺服器：`Slot_Change_CQ 0x00240107`（`Metal Rage Online Server/dispatch/room.dispatch.js` 約 618 行 `case 0x00240107`，7 個 dword：slot、mech、main、left、right、equipment、skin——這些值是 item serial（`items.id`）還是 item index，**要先從 DLL 確認**）。腳本端 `~/mro-decrypted/src/ZGameMainMenu/ZPage_Hangar.uc`（`SlotChangeSend`、約 1860–1890 行）。
  - 伺服器 → 客戶端：`Slot_Change_SA 0x00240108`（目前 `buildSlotChangePayload` 從 DB 讀 `equipped` 回填）；DLL handler 用 `tools/dispatch-map.py`／`docs/client-dispatch-map.md` 找。
  - DB：`items` 表（`id, account_id, item_id, slot, mech_type, part_slot, quantity, equipped`），`database/db.js`。
  - 之後會讀 DB 的地方：`dispatch/item-info.sender.js`（ItemInfo）、`dispatch/room/room-game-user.sender.js`（Game_User_SN 8 槽位，`equippedBySlot`）、WearInfo `0x00210113`。
- **背景**：`docs/HANDOFF.md` 快照、`docs/journal/2026-09-17-20-iteminfo-chunking.md`（機庫已能顯示 8 台機）、`-22-pve-mech-slot-selection.md`（Game_User_SN 8 槽位）、`-04-changeslot-body-wip.md`（舊的未完成分析）、`2026-09-16-27-wearinfo-slot-key-misalignment-fixed.md`。注意 ItemInfo 單 frame ≤ 0x400 bytes（每包 ≤ 28 筆）。
- **限制**：同上方「新增」規則。**不要動** `PVE_SLOT_SELECT_FLOW`、ItemInfo 分包、Grade_Info_SN 等已實測通過的行為。武器是否能裝在某台機（例如輕型機不能裝 `MOC_a 21100101`，`state.md` 第 4 節）由客戶端判斷，伺服器先照收。
- **交付**：
  1. 分析日誌：`Slot_Change_CQ` 7 個欄位的語意（附組語位址）、`Slot_Change_SA` 完整格式、客戶端換裝後期望伺服器回什麼。
  2. 實作（開關預設關閉）：收到 CQ 時更新 DB `equipped`（同一台機同一 part_slot 只能一件 equipped=1），SA 回傳新配裝。
  3. 實測日誌（開關打開時）：換一把主武器 → 機庫顯示 → 重登是否保留 → PvE 出場手上的武器。
- **完成條件**：實測三項都有 [OBS]／[LOG] 證據；或明確寫出卡在哪（例如 CQ 欄位不是 serial、SA 格式不明）。


> 結案：2026-09-17，依據 `docs/journal/2026-09-17-23-game-chat-echo-g7.md`（INDEX 已標 ✅［DLL][LOG][OBS] V1 通過，預設 enabled）

## G7：遊戲內聊天顯示（指派：Gemini）

> **與 G6（Codex）同時進行的注意事項**
> - **不要跟 Codex 共用工作目錄。** 請建獨立 worktree 與分支（從 `reverse-work` 開，不是舊的 `flash-wip`）：
>   `git -C /home/lucas/mro-reverse worktree add /home/lucas/mro-reverse-g7 -b flash-wip-g7 reverse-work`，
>   之後所有編輯與 commit 都在 `/home/lucas/mro-reverse-g7`。不要在 `/home/lucas/mro-reverse` 切分支。
> - 解密原始碼、客戶端檔案路徑不變（`~/mro-decrypted`、`/mnt/c/Games/MetalRage Online/data/`）；工具用 worktree 內的 `Metal Rage Online Server/tools/`。worktree 需要 `node_modules`：`ln -s "/home/lucas/mro-reverse/Metal Rage Online Server/node_modules" "/home/lucas/mro-reverse-g7/Metal Rage Online Server/node_modules"`。
> - **伺服器只有一個（tmux `server`）、客戶端只有一套，實驗不能跟 G6 同時跑。** 要實測時先問操作者；輪到你時由操作者在 tmux `server` 停掉伺服器，改從 worktree 啟動（`cd "/home/lucas/mro-reverse-g7/Metal Rage Online Server" && npm start`），測完換回。
> - commit 訊息最後一行 `Agent: gemini (中階)`。


- **目標**：戰鬥中隊伍／全體聊天的訊息顯示在畫面上。
- **範圍**：伺服器目前處理 `0x00220507`（Team）、`0x00220509`（All）、`0x00360601`（Clan）的地方（grep `0x00220507`、`0x00220508`、`0x0022050a` 於 `Metal Rage Online Server/dispatch/`；目前是 fallback 回客戶端不認得的 `0x00220508`／`0x0022050a`）。
- **背景**：`docs/journal/2026-09-17-17-game-chat-broadcast-format.md`（G3，Claude 已抽查）：Team／All 用**同一個 opcode、同樣 258 bytes body** 原樣回送；Clan 回 `0x00360602`，文字從 body+0x1D 開始。
- **限制**：同上方「新增」規則。只做 Team 與 All 兩個頻道；單人測試就回送給自己即可（多人廣播之後再做）。
- **交付**：實作（開關預設關閉）＋實測日誌（開關打開時：戰鬥中打 Team、All 各一句，是否出現在畫面、有沒有亂碼或斷線）。
- **完成條件**：兩個頻道都有 [OBS] 結果。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-01-g6b-shop-list-filter-root-cause.md`（標題本身已標「✅ 已完成」）

## G6b（✅ 已完成 2026-09-18，證據見 journal 2026-09-18-01）：商店清單為什麼是空的

> 在 worktree `/home/lucas/mro-reverse-g6-unblock`（分支 `flash-wip-g6-unblock`）工作，**不要**在 `/home/lucas/mro-reverse` 切分支。commit 最後一行 `Agent: codex (中階)`。

- **目標**：找出機庫商店（一般 `ShopList_SN 0x00240241`、現金 `CashShopList_SN 0x00240242`）顯示空白的真正原因，並提出最小修正。
- **範圍**：
  - ZNetwork.dll：`ZDispatchHangar::ShopList_SN`（`0x107e2890`）、`CashShopList_SN`（`0x107e2ac0`）；每筆呼叫的 `UZNetwork_DJ::Item_List_Check`（`0x107e2b89` 附近的 call）本體——它比對什麼（Cache.Bin item 表？已擁有物品？）、失敗時整筆被丟掉；`Item_ShopList_Add`／`Item_CashShopList_Add` 寫進哪個陣列。
  - 腳本：`~/mro-decrypted/src/ZGameMainMenu/ZPanel_ShopItems.uc` `ListLoad()`（約 387–405 行）的所有篩選條件（`IsShow`、`HighGroup`、`ItemSubordinateCheck`、分頁／分類、授權、等級），以及它從哪個 native getter 取清單。
  - 伺服器：`Metal Rage Online Server/dispatch/room.dispatch.js` 的 `writeShopListBody`、送出 ShopList 的時機（是否在客戶端開商店**之前／之後**、是否在正確場景），`item_catalog` 表內容（用 `database/db.js` 的 `getItemCatalog` 或唯讀查詢；不改 DB）。
  - 實際封包：`Metal Rage Online Server/logs/` 最近幾個 session 裡的 `0x00240241`／`0x00240242` 送出 hex。
- **背景**：
  - `docs/journal/2026-09-17-24-g6-unblock-shop-list.md` 最後一節（Claude 審查）：**IsShow 在 entry +0x0D 已由組語確認，伺服器舊寫法正確；`SHOP_UNBLOCK_MODE` 的欄位修正不要打開**。每筆 20 bytes：+0x00 ItemIndex、+0x04 DisPrice、+0x08 Price、+0x0C 未讀、+0x0D IsShow、+0x0E IsNew、+0x0F IsHot、+0x10 u8、+0x11 起與 `"P"` 比較。
  - `docs/journal/2026-09-17-23-g6-slot-change-save.md`：購買 `41200101` 有寫 DB（items 34→35）但 UI 不顯示；截圖 `shots/shot-221153.png`。
  - Ghidra 參數順序常錯，偏移一律以組語為準（上面審查就是例子：script struct 順序 ≠ wire 格式）。
- **限制**：只分析，**不改伺服器程式、不改 DB、不開伺服器、不要求操作者測試**。若結論需要實測才能確認，寫成「建議的單變數實驗」。不動 ItemInfo 分包、`PVE_SLOT_SELECT_FLOW`、Grade_Info_SN、Death_SN、G7。
- **交付**：
  1. 日誌 `docs/journal/2026-09-18-01-shop-list-empty-root-cause.md`（50–100 行），INDEX 標「待審」：`Item_List_Check` 的判斷條件（附組語位址）、`ListLoad()` 篩選鏈、目前送出的某幾筆實際 entry 逐條走過這些條件、在哪一關被丟掉。
  2. 原始組語／decompile 存 `docs/research/2026-09-18-shop-list/`。
  3. 最多兩個建議的單變數實驗（改哪個欄位／時機、預期結果），標「待審」。
- **完成條件**：至少對一筆實際送出的商品，給出「在哪個條件被丟掉」並附組語或原始碼行號；或明確證明 ShopList 內容都通過、問題在別處（例如送出時機或場景）並附證據。遇到跟既有 ✅ 矛盾就停下來寫疑點。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-02-g6c-shop-compat-experiment.md`（標題本身已標「✅ 已完成」）

## G6c（✅ 已完成 2026-09-18，證據見 journal 2026-09-18-02）：商店相容性單變數實驗

> 同一個 worktree `/home/lucas/mro-reverse-g6-unblock`（分支 `flash-wip-g6-unblock`）。commit 最後一行 `Agent: codex (中階)`。

- **目標**：用一次實測確認「商店空白是因為伺服器送的商品全都過不了客戶端 `ItemSubordinateCheck`」。
- **背景**：`docs/journal/2026-09-18-01-g6b-shop-list-filter-root-cause.md`（含 Claude 審查）。`item_catalog.mech_type` 其實是武器家族，slot 1 送出的 21x 主武器 Small 機不能裝；Cache 預設配裝 1 號機主武器是 `22100101`。
- **範圍**：`Metal Rage Online Server/dispatch/room.dispatch.js` 的 `buildShopItems()`／ShopList 送出處。
- **實作（開關預設關閉）**：新增 `const SHOP_COMPAT_EXPERIMENT = 'disabled'; // 'disabled' | 'enabled'`。enabled 時**只**把 slot 1 一般商店（`ShopList_SN 0x00240241`）主武器清單的**第一筆** `21100101` 換成 `22100101`，價格、旗標（IsShow 仍在 +0x0D）、筆數、送出時機全部不變。**不要**打開 `SHOP_UNBLOCK_MODE`。
- **實測**（先問操作者、確認沒有別的實驗在跑）：暫時把開關改成 enabled，請操作者重啟 tmux `server`（要從 worktree 啟動：`cd "/home/lucas/mro-reverse-g6-unblock/Metal Rage Online Server" && npm start`，`node_modules` 用 symlink 指到主目錄），進機庫 1 號機 → 商店主武器頁。記錄：是否出現**恰好一件**商品、是哪件；截圖（`tools/win/shot.sh`）；伺服器 log 的 ShopList hex。測完開關改回 disabled、請操作者把 server 換回主目錄。
- **限制**：一次只改這一個變數；不改 DB、不動 G6 save、ItemInfo、`PVE_SLOT_SELECT_FLOW`、Grade、Death_SN、G7。
- **交付**：日誌 `docs/journal/2026-09-18-02-g6c-shop-compat-experiment.md`（標待審，附 [OBS]／[SHOT]／[LOG]）；commit。
- **完成條件**：有「出現幾件、哪件」的實測結果；若 0 件，記錄完整 ShopList hex 與客戶端 log（關閉客戶端後的 `MetalRage.log`）並停下回報。

> 結案：2026-09-18，依據 `docs/journal/2026-09-18-16-money-persistence.md` 高階裁定段落（M1 ✅：以 DB 持久化 Point/Cash/Coupon，購買扣款與完全重登後保留皆已 [OBS][LOG] 驗證，`MONEY_PERSIST_MODE` 預設 enabled，直接解決本任務所問「G 幣沒有持久化」）

## H2：G 幣沒有持久化

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出購買後 G 幣扣款沒有持久化的真正原因，確認金錢的伺服器送出來源與資料庫寫回缺口，提出最小修正並形成可審查的 DB 腳本方案。

### 範圍

- 客戶端收到金錢的 SN 封包、opcode、body 欄位與欄位來源；對照登入與購買後的 `sendPackageMoney` 路徑。
- 伺服器購買 CQ／購買 SA、`sendPackageMoney`、資料庫 account／point 欄位與 `database/db.js` 查詢／更新。
- 2026-09-18 的購買、斷線、重新登入 session log，確認 1000→0 只存在於連線狀態還是已寫入 DB。

### 背景

- [OBS] 2026-09-18 購買扣款正常，畫面由 1000 變 0；重開客戶端登入後又回到 1000。
- G6d／G6e 已記錄購買成功與 `ItemInfo_SN 0x00210111` 路徑，但 G 幣持久化尚未查明。
- [GUESS] 問題可能在購買 handler 只改送出值、未寫回正確資料表或欄位；須由 DB schema、程式與 log 證據確認，不得直接採用此猜測。

### 限制

- 先做分析，不直接下 SQL，不直接改既有資料，不改 `docs/state.md`，結論標 🟡／待審。
- 不啟動或重啟伺服器，不請操作者測試；不得改任何現有開關或其他 G6/G7 行為。
- 若提出資料庫變更，必須寫成可 commit 的 `tools/` 腳本或 migration 草案，不能把手動 SQL 當成完成交付。
- 不動 ItemInfo 分包、ShopList、PVE、Grade_Info、Death_SN 或 G7。

### 交付

- 日誌 50–100 行，`docs/journal/INDEX.md` 追加「待審」列，逐欄列出金錢 SN、body offset／型別、來源函式、DB 欄位與購買前後 log。
- 原始 decompile／組語、封包 hex 與必要 schema 摘錄存入 `docs/research/2026-09-17-backlog/H2/`。
- 提出最小修正；若需要 DB 變更，附可審查、可重複執行的 DB 腳本草案，但不執行它。

### 完成條件

能以程式、schema 與 session log 證明 G 幣顯示值與持久化值在哪一步分離，並給出不改資料庫現況的最小修正方案；若無法確認，列出具體缺失證據與阻塞。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-06-g6-equip-save-verified.md` 追加節（標題本身已標「已完成」）

## H4：驗證 PvE 出場時手上是不是機庫換的新武器

> **狀態：已完成（2026-09-18，證據見 journal 2026-09-18-06 追加節）**

### 目標

確認 G6 W3 已保存的機庫換裝是否一路傳到 PvE 出場，讓玩家在戰鬥中實際拿到換上的新武器；若未生效，定位斷點並提出待審分析，不擅自修正。

### 範圍

- 以 W3 已保存的 1 號機 `main=100223`／`item_id=22100301` 為對照，追蹤進入 PvE 前的 `Game_User_SN 0x00222112`、出場機體與武器欄位。
- 對照 `dispatch/room/room-game-user.sender.js`、`PVE_SLOT_SELECT_FLOW`、開局相關封包與伺服器 log；必要時查看客戶端 `Game_User_SN`／武器初始化後的 log 或畫面。
- 實測流程：完全重登 → 確認 1 號機裝備 `22100301` → 進入 PvE → 截圖／記錄實際手上武器 → 回合結束後保留原狀。

### 背景

- [OBS][SHOT] `shots/w3-equipped.png` 與完全重登結果已證明機庫外觀、裝備標記及 DB 保存為 `22100301`。
- [LOG] W3 的 `Slot_Change_CQ 0x00240107` 含 `main=100223`，G6 已確認換裝保存路徑。
- G6 結案目前只剩 PvE 出場武器未驗證；機庫保存成功不等於戰鬥初始化一定採用同一 serial／item_id。

### 限制

- 只驗證與記錄，不改 `state.md`、`HANDOFF.md`、資料庫或既有程式；不得自行改任何開關值。
- 不改 `PVE_SLOT_SELECT_FLOW`、`Game_User_SN`、ItemInfo 分包、Grade_Info_SN、Death_SN 或 G7。
- 伺服器與客戶端實測由 Claude 高階／操作者控制；未獲指示不得自行重啟伺服器或要求額外測試。
- 若發現 PvE 不使用新武器，先保存完整 log／封包／截圖並回報斷點，不猜欄位格式、不擴大修正範圍。

### 交付

- 一篇 50–100 行日誌，`docs/journal/INDEX.md` 追加一行並標「待審」，列出 W3 保存值、PvE 開局封包欄位、實際武器與任何差異。
- 原始 session log、封包 hex 與截圖存入 `docs/research/2026-09-17-backlog/H4/` 或日誌可追溯的既有證據路徑。
- 若通過，附 `[LOG][OBS][SHOT]` 的完整流程；若未通過，提出最多兩個單變數後續實驗，保持開關與程式不變。

### 完成條件

有證據證明 PvE 出場時實際武器就是已保存的 `22100301`，或明確指出從 DB／`Game_User_SN`／客戶端戰鬥初始化哪一層開始分離，並保留完整未知資料供高階審查。

> 結案：2026-09-18，依據 `docs/reference/placeholder-audit.md`（commit `d515330`，逐檔逐行盤點 (a)/(b)/(c) 分類，符合本任務交付格式）

## H5：盤點 sender 裡的過期佔位常數

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

把所有 sender 與 dispatch 封包組裝處寫死的字面常數盤點、分類，找出仍可能代表「尚未查過語意」的佔位值；只做分析，不修改程式或資料。

### 範圍

- 涵蓋 `dispatch/` 底下所有 `*.sender.js`，以及 dispatch 檔案中直接組裝封包的地方。
- 逐筆記錄檔案與行號、完整 opcode、body 欄位偏移、目前寫入值，判定為：(a) 有組語／日誌依據的確定值；(b) 保留欄位／成功碼而送 0 正確；(c) 尚未查過語意的佔位值。
- 以 `grep -rn "write[A-Za-z0-9]*(\s*[0-9]" dispatch/room/*.js dispatch/*.sender.js` 等搜尋作為起點；若實際範圍比該搜尋更大，仍須涵蓋所有 sender 與 dispatch 組包路徑。
- 對 (c) 類按影響面排序，優先檢查可能影響畫面、房間狀態、購買／庫存或存檔的欄位。

### 背景

2026-09-18 一天之內抓到的五個 bug 全是同一個形狀——**不是邏輯錯，是當初不知道欄位語意時填的佔位值沒有跟著更新**：

- 房間面板地圖寫死 `9001`（實際開戰用 9010）→ 面板永遠顯示錯的任務（R1）。
- `writeShopListBody` 的 `isShow` 無條件 `= 1` → 商店排出 8 把同名武器（G6g）。
- 購買時 `mech_type` 照抄 catalog → 買的東西哪台機都看不到（G6e）。
- `items.id` 落在客戶端保留區 101–999 → 整個庫存被濾掉（G6f）。
- `SN_MAP_CHANGE_ONE` 的 `MapTime=0, MapRound=1, MapKill=0, Goal=0` → 每次換圖洗掉客戶端的房間設定（R6）。

這些欄位當初都以 `b0 / w1 / w2 / b5 / w6 / w8` 這種「用偏移當名字」的方式命名，程式碼註解也自承 `We do not know the real semantics yet`。也就是說，**寫死的字面常數就是「還沒查過語意」的標記**。目前以 `grep` 搜尋房間相關 sender 約有 47 處候選。

### 限制

- 只盤點與分類，**不改任何程式、不改任何值、不改資料庫**；不改 `AGENTS.md`、`docs/state.md` 或既有開關。
- 不確定就歸 (c)，不要為了讓表好看而猜成 (a)；所有未知封包保留完整 hex 與原始列值。
- 不啟動或重啟伺服器，不請操作者測試；不要把分析任務擴大成修正任務。
- 既有 ✅ 結論若與盤點衝突，只列疑點與證據，不自行推翻或標記狀態。

### 交付

- 建立可持續維護的 `docs/reference/placeholder-audit.md`（不是 journal）。
- 每列包含：檔案:行號、opcode、欄位偏移、目前值、分類 (a)/(b)/(c)、依據（日誌檔名或完整 DLL 位址；(c) 依據留空）。
- (c) 類按影響面排序，至少對前 10 名各寫出可能影響與缺少的證據。
- 只新增／更新上述 docs；若有原始資料需要保存，放在 `docs/research/` 對應目錄並由表格或說明連結。
- 交付前做 `git diff --check`；commit 只包含 docs，訊息最後一行依執行者等級填寫 `Agent: ... (中階)`。

### 完成條件

- `placeholder-audit.md` 涵蓋 `dispatch/` 下所有 sender 與 dispatch 組包處，沒有只抽查房間 sender 的缺口。
- 每個候選常數都有 (a)/(b)/(c) 分類與可追溯依據；無法確認語意的項目明確列為 (c)。
- (c) 類至少有前 10 名的影響面說明，並清楚列出需要補查的組語、schema、session log 或客戶端反應。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-16-money-persistence.md` 高階裁定段落（M2 ❌：實測顯示 ACK→ItemInfo 新順序後新物品仍未立即出現，「先後順序是根因」假設已排除，commit `cc99bac` 不合併，後續由 M3 接手）

## M2：購買成功後 ItemInfo 改在 Buy SA 之後送出

> **狀態：2026-09-18 Codex Sol 高階新增，交給 Gemini 中階；待審**

### 目標

修正購買成功當下新物品不會立即出現在庫存、必須離開再進格納庫才顯示的時序問題；只調整既有購買成功封包的送出順序，不改金錢或物品資料語意。

### 範圍

- 在 `flash-wip-money` 分支處理 `Metal Rage Online Server/dispatch/room.dispatch.js` 的 `handleShopPurchase()`。
- 目前實測順序是 `Buy_PointItem_CQ 0x00240201` → transaction commit → `ItemInfo_SN 0x00210111`（已包含新 serial）→ `Buy_PointItem_SA 0x00240202`。
- 最小候選是讓成功 ACK `0x00240202` 先送，再執行購買成功後既有的 ItemInfo refresh；保留其餘 Package／WearInfo／ShopList 流程。
- 對修改檔執行 `node --check` 與 `git diff --check`，不自行啟動客戶端實測。

### 背景

- [OBS] 2026-09-18 第一輪 M1：G 幣由 100000 正常扣成 99000，但新物品未立即出現在庫存；離開再進格納庫後出現。
- [LOG] `/tmp/mro-sol-test.eudtCb/Metal Rage Online Server/logs/session-20260918-205012.jsonl:308-313`：CQ 購買 `item_id=22100077`；四包 `0x00210111` 先送，其中最後一包已含新 serial `200000`，之後才送 14-byte `0x00240202`，body `000000000000b882010000000000`（Point=99000）。
- [LOG] tmux server 顯示 transaction 已 commit；重新進格納庫時 `Packege_Item_SN` 有 39 筆並顯示該物品，故 DB insert 與 serial 保留區都不是本題根因。
- [DLL] `Buy_PointItem_SA 0x00240202` 本體 `0x107dea70`；成功 gate 在 `0x107deacf-0x107deadb`，之後才讀 body+0x06 的 Point。客戶端在 ACK 前是否接受 ItemInfo 尚未由 DLL 確認，因此修正結論維持待審，實測由高階安排。

### 限制

- 一次只改送出順序；不改 transaction、價格、餘額、item_id、serial、`sendItemInfo()` 格式或任何開關值。
- 不改資料庫、migration、`metalrageserver.sql`、`docs/state.md`、`docs/HANDOFF.md`；不標 ✅。
- 不順手重排 `sendPackageMoney()`、`sendPackageItems()`、`sendHangarWearInfo()` 或 ShopList repaint；若認為必須改第二項，停下回報。
- 先執行 `git branch --show-current`，只能在 `flash-wip-money` 工作；不要切換或提交到 `reverse-work`。

### 交付

- 一個只含最小時序修正的 commit，commit 最後一行寫 `Agent: gemini (中階)`。
- 更新 `docs/journal/2026-09-18-16-money-persistence.md`，追加 M2 待審段落；`docs/journal/INDEX.md` 只更新既有 M1 那一行，不新增重複條目。
- 回報修改後的精確封包順序、檔案與行號、`node --check`／`git diff --check` 結果；不要貼大段輸出。

### 完成條件

程式碼構造上保證成功的 `Buy_PointItem_SA 0x00240202` 先於購買後 `ItemInfo_SN 0x00210111` 發送，失敗購買仍不送 ItemInfo，disabled 行為與資料內容不變；提交保持待審，等待 Codex Sol 與操作者實測。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-16-money-persistence.md` 高階裁定段落——M2 已改為如實記錄「先後順序是根因」為已排除假設而非既定根因，M2R 所擔心的過度宣稱因果措辭已不存在於目前文件

## M2R：修正購買刷新日誌的因果措辭

> **狀態：2026-09-18 Codex Sol 高階審查提出，交給 Gemini 中階**

### 目標

修正 M2 日誌把尚未實測的時序假設寫成既定根因的問題；不改已通過程式審查的封包順序。

### 範圍

- 在 `flash-wip-money` 分支只改 `docs/journal/2026-09-18-16-money-persistence.md` 與必要的 `docs/journal/INDEX.md` 文字。
- 保留已存在的 [OBS] 與 [LOG]；把「問題為客戶端在 ACK 前尚未準備好」改成「現象與 ACK／ItemInfo 先後順序相關的待驗假設」。
- 明記 M2 程式碼已由 Codex Sol 靜態審查通過，但購買後立即出現仍待操作者實測。

### 背景

- [LOG] 舊順序確實是 `ItemInfo_SN 0x00210111` 先於 `Buy_PointItem_SA 0x00240202`。
- [OBS] 離開再進格納庫後物品出現，只證明 DB 與後續完整清單可讀到物品，不能單獨證明客戶端在 ACK 前拒收 ItemInfo。
- [REVIEW] commit `cc99bac` 的程式 diff 是純區塊搬移，成功／失敗分支與資料內容未變；`node --check`、`git diff --check` 通過。

### 限制

- 不改任何 `.js`、資料庫、開關、封包格式或順序，不標 ✅。
- 不改 `docs/state.md`／`docs/HANDOFF.md`，不重寫 M1 的 DLL 證據。
- 先執行 `git branch --show-current`；只能留在 `flash-wip-money`。

### 交付

- 一個 docs-only commit，最後一行寫 `Agent: gemini (中階)`。
- 回報修正的句子與 `git diff --check` 結果，不貼整篇日誌。

### 完成條件

所有因果敘述都與現有證據強度一致，M2 維持 🟡 待審，沒有暗示即時刷新已經實測成功。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-17-user-name-ansi.md`（INDEX 已標 ✅ Claude 高階審查＋實測，預設 enabled）

## R12：User_Name_SN 改送 ANSI 名稱

> **狀態：2026-09-18 Codex Sol 高階新增，交給 Gemini 中階；M2R 完成後再做**

### 目標

修正房間玩家槽只顯示暱稱第一個字 `L` 的問題；只把 `User_Name_SN 0x00220421` 的名稱欄位由 UTF-16LE 改為 ANSI，供下一輪單變數實測。

### 範圍

- 在 `flash-wip-room-team` 分支修改 `Metal Rage Online Server/dispatch/room/room-user.sender.js`。
- 保持 exact body 長度 `0x4E`、body+0x00 的 user index 與名稱起點 body+0x1B 不變。
- 新增一個語意明確、預設 `disabled` 的獨立開關；enabled 時才把 `User_Name_SN` 名稱寫成與既有 ANSI helper 相同的窄字串與 NUL／截斷規則。
- 執行 `node --check`、最小 sender 離線檢查與 `git diff --check`，不啟動伺服器。

### 背景

- [OBS] R11 後玩家已進入正確隊伍槽，房主圖示顯示，但 ID 只顯示第一字 `L`。
- [LOG] `User_Name_SN 0x00220421` 目前 78-byte body 從 body+0x1B 寫入 `4c 00 75 00 63 00 61 00 73 00...`。
- [DLL] handler 本體 `0x107eb050`：`0x107eb09b` 取得 wrapper，`lea esi,[eax+0x2b]` 對應 body+0x1B，隨後呼叫 `winGetSizeUNICODE(const char*)` 與 `winToUNICODE`；因此該欄位是 ANSI 輸入，不是 UTF-16LE。
- [DLL] `User_Pilot_SN 0x00220402` 另有獨立正確解析路徑，本任務不處理頭像。

### 限制

- 一次只改名稱編碼；不改 user index、pilot、team、state、master、封包順序或任何既有開關預設值。
- 不改資料庫、`docs/state.md`／`docs/HANDOFF.md`，不標 ✅；新行為必須預設關閉。
- 先執行 `git branch --show-current`，只能在 `flash-wip-room-team` 工作；若該分支有未預期變更，停下回報。

### 交付

- 一個最小程式 commit，最後一行寫 `Agent: gemini (中階)`。
- 新增 50–100 行以內的待審日誌與 INDEX 待審列，附上述 DLL 位址、舊／新欄位 hex 與離線檢查結果。
- 回報開關名稱、檔案／行號與檢查結果，不貼大段反組譯。

### 完成條件

開關 disabled 時 byte-for-byte 保持舊 `User_Name_SN`；enabled 時 body+0x1B 為 `Lucas\0` 的 ANSI bytes、body 仍為 `0x4E`，且沒有改動任何頭像相關值。


> 結案：2026-09-18，依據 `docs/journal/2026-09-18-18-room-pilot-avatar.md`（INDEX：R13（Gemini）：101 是 BeginSet 編號不是駕駛員 ItemIndex；分析結論已交付，後續「預期」欄已被 `docs/journal/2026-09-18-2305-room-avatar-experiments.md` 更正，R14 未合併）

## R13：確認房間頭像需要的 PilotCode

> **狀態：2026-09-18 Codex Sol 高階新增，交給 Gemini 中階；R12 提交後再做，僅分析**

### 目標

確認房間玩家槽沒有頭像是因 `PilotCode=101` 無法映射到 Cache 圖片、封包更新時機，或其他欄位造成；提出一個可驗證的最小單變數實驗，不直接改程式。

### 範圍

- 追蹤 `User_Default_SN 0x00220233` 與 `User_Pilot_SN 0x00220402` 寫入 `ROOM_USER_INFO.PilotCode` 的 DLL 路徑。
- 對照 `ZPage_Room.uc:2455`、`ZPanel_TeamMember.uc:228-288`、`Engine/CacheManager.uc:1267`，確認 UI 以 `GetImageIndex(PilotCode)` 查哪張圖。
- 從 Cache.Bin 的 pilot records 找出有效 ItemIndex／ImageIndex，核對帳號欄位 `101/102` 到底是正式 pilot ItemIndex、簡碼，或舊假設。
- 核對 `User_Pilot_SN` 相對 `User_Default_SN` 與 UI refresh 的先後是否會觸發重繪；原始資料放 `docs/research/`。

### 背景

- [OBS] 玩家槽、ID 第一字與房主圖示已出現，但完整頭像沒有顯示。
- [DLL] `User_Pilot_SN` export `0x10706866` 跳到 `0x1072c810`；函式按 user index 尋找 0x50-byte room user record，將第二參數寫入 record+0x38，即 `PilotCode`。
- [SRC] `ZPage_Room.uc:2455` 直接把 `PlayerList[Count].PilotCode` 傳給槽位；`ZPanel_TeamMember.uc:276` 呼叫 `CacheManager.GetImageIndex(m_Avatar)`。
- [SRC] `CacheManager.GetImageIndex` 只有 `GetItemHighGroup(ItemIndex)==5` 才查 `GetSpecPilotRecord`；現行伺服器與帳號工具使用 `101/102`，是否符合該分類尚未確認。

### 限制

- 本任務只分析與留證據，不改 `.js`、資料庫、帳號值、開關或封包，不標 ✅。
- 不把 `101` 無法查圖寫成事實，除非有 Cache record／函式結果證據；不得直接猜一個 5xxxxxxx 值。
- 不啟動或重啟伺服器、不請操作者測試；遇到 Cache parser 不足，只記錄缺口與所需高階決策。

### 交付

- 一篇 50–100 行待審日誌與 INDEX 待審列；原始 Cache／DLL 證據放 `docs/research/<日期>-room-pilot-avatar/`。
- 列出候選根因、支持與反證；最多提出一個預設關閉、只改單一值或單一時序的後續實驗。
- 一個 docs-only commit，最後一行寫 `Agent: gemini (中階)`。

### 完成條件

能用 DLL＋客戶端腳本＋Cache 證據說明 `PilotCode` 到 avatar atlas 座標的完整鏈，並指出現行 `101` 在鏈上成功或失敗的位置；若證據不足，明確列出缺的 record／映射，不改程式。


## DUAL-CLIENT：同一台電腦雙開客戶端（PM 2026-09-20，**高階帶、操作者在場、15–20 分鐘上限**）

不是中階任務。做不到就停，記下卡在哪。

**目標**：確認操作者這台能不能同時跑兩個客戶端實例。成功的話，(a) 還原上游作者 Moon 的同機情境，取得一個「零延遲、零抖動、零掉包」的投射物缺口率，跟 VPN 的 9–20% 與區網基準並排；(b) 之後大部分兩人測試操作者一個人就能跑，不必等筆電或 dusk。

**範圍**：只動客戶端安裝與啟動方式。不改伺服器程式、不改資料庫、不動保護機制。

**背景**：`journal/2026-09-20-1820-projectile-loss-counted.md`（量測方法與五個已排除的假設）、`research/2026-09-20-projectile-replication/notes.md` 末段（為什麼 Moon 的同機案例是最乾淨的對照組）。客戶端 1.9 GB／2308 個檔，C 槽還有 932 GB，複製一份沒有空間問題。

**限制**：
- 第二個實例若被擋下來（單一實例鎖、XIGNCODE、Win11 相容性修正衝突），**記下現象就停**：錯誤訊息、兩份 `MetalRage.log`、`xigncode.log`。**不要為了雙開去動保護機制**；要不要走硬性約束 1 已放寬的那條路，由操作者另外決定。
- 兩個實例要用**各自的資料夾副本**（例如 `C:\Games\MetalRage Online 2`），否則 `MetalRage.log`、`User.ini`、OptionAll 會互相覆蓋，`WeaponLog` 的量測就作廢。
- 兩個實例用不同帳號（Lucas ＋ mrotest），都設視窗模式並排。
- Pico 送的 F24 只會進到**有焦點**的視窗，所以 `WeaponLog` 要在**射手（加入者）**那個視窗開。

**交付**：
1. 四個觀察寫進日誌：(1) 第二個實例起不起得來；(2) 兩個都登入後同房、開戰是否正常（房主開 UDP 30907，同機加入者連 `hostAddress:30907`）；(3) **沒有焦點的視窗更新率有沒有下降**（`stat fps` 或目測）——這是要跟 [OBS] Moon 影片「兩個視窗速度一樣」對照的那一項；(4) 兩個實例各自的 log 有沒有互相干擾。
2. 可行的話，`reference/setup.md` 補一節「同機雙開」。
3. 不可行的話，日誌寫一句「不可行，卡在哪」就結案。

**完成條件**：上述四項有紀錄，且「可行／不可行」二擇一有明確結論。可行的話另外跑一次同機的投射物計數（射手＝加入者、分母用 `HitLoc===`），數字進 `journal`。

**結果（2026-09-20 20:30，高階＋操作者在場）：可行。**
- 單一實例鎖看的是**行程名稱**；exe 複製成 `MetalRage2.exe`（byte-identical）即可並存。❌ 不是 XIGNCODE、❌ 不是具名核心物件。
- Win11 的 `DisableExceptionChainValidation` 按 exe 檔名註冊，新檔名要自己加一筆 IFEO。
- 四個觀察：(1) 起得來；(2) 同房開戰正常（房主 Lucas 的 hostAddress 指向本機，`test` 綁的是筆電 IP 所以不能當房主）；(3) 兩個視窗更新率**都是 1000 FPS**，沒有失焦降速，與 [OBS] Moon 影片一致；(4) log 互不干擾，但檔名跟著執行檔走且每次啟動截斷，已改用 `-log=run-<時間>.log`。
- 同機投射物計數已跑：缺口 32–35%。見 `journal/2026-09-20-2030-same-machine-and-netspeed.md`。
