# Backlog：交給中階的契約任務

給 Gemini（Antigravity）、Codex Luna、Claude 子 agent 這些中階執行者用。**先讀 `AGENTS.md`**（工作原則、硬性約束、證據標籤、「只剩中階可用時」一節）。

## 共通規則（每個任務都適用）

- **只做分析，不改程式、不改資料庫、不改 `docs/state.md`、不標 ✅。** 結論一律標 🟡 或「待審」，由 Claude（高階）審查。
- 客戶端與伺服器只有一套，**不要要求操作者測試**，也不要啟動或停止伺服器（tmux `server` 由 Claude 控制）。
- 交付：
  - 原始 decompile／組語存到 `docs/research/2026-09-17-backlog/<任務代號>/`。
  - 一篇日誌 `docs/journal/2026-09-18-NN-<主題>.md`（50–100 行），在 `docs/journal/INDEX.md` 追加一行並標「待審」。
  - commit 在 `flash-wip` 分支（`git checkout flash-wip && git merge reverse-work` 之後再開始），訊息最後一行 `Agent: gemini (中階)`。
- 工具（在 `Metal Rage Online Server/` 底下執行）：`python3 tools/disasm.py {exports|at|func|xref|str} ...`、`tools/ghidra/decompile.sh <va>`（換 DLL：`DLL=Engine.dll`）、`tools/dispatch-map.py`；opcode 名稱查 `docs/client-dispatch-map.md`。客戶端檔案在 `/mnt/c/Games/MetalRage Online/data/`。
- 解密後的客戶端 UnrealScript 原始碼：`~/mro-decrypted/src/<Package>/<Class>.uc`；class 預設值：`tools/uetool/bin/Release/net8.0/uetool ~/mro-decrypted/<Pkg>.u decompile <Class>`。不要讀 `Metal Rage Online Server/static/`。
- **Ghidra 的參數順序常出錯**：封包欄位偏移一律回頭看組語確認，日誌裡寫出你核對的組語位址。
- 遇到跟既有 ✅ 矛盾、需要改程式才能確認、或超出範圍：停下來，在日誌寫疑點，不要自己擴大範圍。

---

## G1（✅ 完成：Gemini 分析，Claude 已審）：Assist_SN `0x00230122` 與 Assist_CN `0x00230121` 的完整格式

- **目標**：確定伺服器收到 `Assist_CN` 後應該回什麼（或不回），以及 `Assist_SN` 的 body 結構與客戶端的處理效果。
- **範圍**：ZNetwork.dll 的 `ZDispatchGame::Assist_CN`（thunk `0x107060eb` → `0x107d9c60`）、`ZDispatchGame::Assist_SN`（用 `disasm.py exports ZNetwork.dll Assist_SN` 找），以及它們在腳本端的呼叫者／事件（grep `Game_Campaign_Damage`、`Assist` 於 `~/mro-decrypted/src`）。
- **背景**：`docs/journal/2026-09-17-13-death-assist-cn.md`。PvE 中客戶端（host）送 `Assist_CN`，body 7 bytes，例如 `0000 0100 04 01 50`；伺服器目前回 16 bytes 全 0 的 `Assist_SN`。body+0／+2 語意、body+6 是否為 HP％ 都未確認。
- **限制**：同共通規則。
- **交付**：Assist_CN 每個欄位（偏移、型別、來源參數、語意）與 Assist_SN 每個欄位（偏移、型別、寫入到哪個函式／欄位、客戶端效果）的表格，附組語位址；建議伺服器的正確回應（待審）。
- **完成條件**：兩個封包的每個 body 偏移都有組語位址佐證，或明確標出哪幾個無法確認、卡在哪裡。

## G2（✅ 完成：Gemini 分析，Claude 已審）：Death_SN `0x00230124` body 與伺服器目前送法的比對

- **目標**：核對伺服器送的 `Death_SN`（`dispatch/lobby.dispatch.js` 的 `case 0x00230123`，body 0x51 bytes）每個欄位是否跟客戶端 handler 讀取的一致，特別是 AI 被擊殺（類型 0x0b、0x15 等）時客戶端做了什麼。
- **範圍**：ZNetwork.dll `ZDispatchGame::Death_SN`；它呼叫的 `UZNetwork_DJ` 函式（例如 `Game_User_*`、`Game_Score_*`、respawn 狀態）；腳本端對應的事件處理。
- **背景**：`docs/journal/2026-09-17-13-death-assist-cn.md`（Death_CN：body+0 擊殺者、+2 被擊殺者、+4 類型，1～4 = 玩家）。伺服器程式碼註解說「Death_SN 把 game user 從 alive(2) 改成 respawnable(1)」，未必正確。
- **限制**：同共通規則。**只讀伺服器程式，不改**。
- **交付**：Death_SN body 欄位表（偏移、型別、去向，附組語位址）；伺服器目前寫的每個欄位對或錯；AI 被擊殺時伺服器該不該送 Death_SN、送了會不會有副作用（待審）。
- **完成條件**：body 0x00～0x50 中客戶端實際讀取的偏移全部列出並附位址。

## G3（✅ 完成：Gemini 分析，Claude 已審）：遊戲內聊天廣播（`0x00220507`／`0x00220509`／`0x00360601`）

- **目標**：確定要讓聊天訊息顯示在畫面上，伺服器該回哪個 opcode、body 格式是什麼。
- **範圍**：客戶端送出的 CN／CQ（`0x00220507` Team、`0x00220509` All、`0x00360601` Clan）的建構函式；客戶端 dispatcher 裡 `Chat_Game_Team_SN`、`Chat_Game_All_SN`（`0x00220507`、`0x00220509`，名稱見 `docs/client-dispatch-map.md`）、`Chat_Clan_All_SN 0x00360602` 的 handler；腳本端顯示聊天的路徑。
- **背景**：`docs/journal/2026-09-17-05-test-a-no-effect.md`（聊天 body 258 bytes：開頭 0、ASCII 暱稱、兩個空白、Big5 文字）。目前伺服器回 `0x00220508`／`0x0022050a`／`0x00360602` 的 16 bytes 空包，訊息沒有顯示；`0x00220508`、`0x0022050a` 不在客戶端 dispatcher。
- **限制**：同共通規則。
- **交付**：每個頻道「客戶端送的封包格式」與「伺服器應回的 opcode ＋ body 格式」表格，附組語位址；注意字串編碼（ASCII／Big5／UTF-16）與長度上限（整包 ≤ 0x400 bytes，見 `docs/state.md`）。
- **完成條件**：Team 與 All 兩個頻道的 SN body 每個欄位都有組語佐證。

## G4（✅ 完成：Gemini 分析，Claude 已審）：建房 Create_CQ `0x00220201` 組語核對，以及地圖／難度怎麼傳

- **目標**：用組語確認建房封包的欄位順序，並找出伺服器應該把哪個值當成地圖編號送進 `Game_Info_SN body+0x11`，讓客戶端選的地圖／難度生效。
- **範圍**：`ZDispatchLobby::Create_CQ`（`0x107e5b60`）與 `UZNetwork_DJ::execLobby_Room_Create`（`0x10718740`）的組語 push／mov 順序；腳本 `ZGameMainMenu/ZPopup_CreateRoom.uc`（約 506 行）、`ZPanel_RoomInfo.uc`（地圖清單、難度 `m_Difficulty`、`PlayPve`）；房間內改地圖／選項的 CQ（`Option_Change_CQ` 等）。
- **背景**：`docs/journal/2026-09-17-12-pve-round-zero.md`。Ghidra 推測 body[1]=MaxUser、[2..3]=MapIndex、[4..5]=PlayTime、[6]=PlayRound、[7..8]=Kill、[9..10]=Goal，**尚未核對組語**。實際封包 `01 10 3223 3c00 05 ...` 的 MapIndex 是 9010，但伺服器寫死送 9001（`dispatch/gate.game.dispatch.js` 約 613 行 `campaignMapCacheKey_ = 9001`）。地圖表參考 `docs/journal/2026-09-15-10-map-id-always-wrong-root-cause.md`。
- **限制**：同共通規則。
- **交付**：Create_CQ body 欄位表（附組語位址）；房間內變更地圖／難度時送的封包與欄位；建議伺服器怎麼取地圖編號與回合數（待審）。
- **完成條件**：body[0..13] 每個偏移都有組語佐證。

---

## 目前由 Claude（高階）自己做，中階不要碰

- 任務結束流程：`Campaign_CN 0x00230139` → `Campaign_SN 0x0023013a` → `EndGame_SN 0x00222213` → 結算頁 → 回房間（`docs/journal/2026-09-17-14-campaign-result.md`）。
- 所有伺服器程式修改與實測。

## G5：PvE／戰鬥用哪一台機體，客戶端怎麼告訴伺服器

- **目標**：找出玩家選的出擊機體（槽位 1～8）是透過哪個封包、在哪個時機傳給伺服器，讓伺服器 `Game_User_SN 0x00222112` 送出正確的機體與配裝。
- **範圍**：腳本 `ZGameMainMenu/ZPage_Hangar.uc`（約 1860–1890 行 `My_Slot_SelectedNumber_Set`、`SlotChangeSend`）、房間頁面的機體選擇（grep `m_SelUnitSlot`、`SlotNumber`、`My_Slot_Selected` 於 `ZGameMainMenu`）、`ZGameMidMenu/ZSlotSelectPage.uc`、`ZBase/DefaultPlayerController.uc:925`（`Game_Slot`）；ZNetwork.dll 的 `My_Slot_SelectedNumber_Set`／`_Get`、`Hangar_Slot_Select`（`DefaultSlot_Change_CQ 0x00240111`，opcode 寫入點 `0x107dd5b3`）、`Game_Slot`→`ChangeSlot_CN 0x00230101`、以及開局相關 CQ（`Game_Start` `0x00222103` body、`Room_Ready` 等）有沒有帶槽位；`Game_User_SN` 的 selected mech 欄位（`docs/journal/2026-09-16-21-game-user-sn-record-layout-confirmed.md`）。
- **背景**：`docs/journal/2026-09-17-20-iteminfo-chunking.md` 最後一節。機庫切換機體時客戶端沒送任何封包；房間選第三台也沒有新封包；伺服器只在收到 `Slot_Change_CQ 0x00240107` 時更新 `currentHangarSlot_`。ChangeSlot_SN 相關的未完成分析在 `docs/journal/2026-09-17-04-changeslot-body-wip.md`。
- **限制**：同共通規則（只分析、不改程式、結論待審）。
- **交付**：流程圖（文字即可）：玩家在機庫／房間／開局選機體 → 客戶端呼叫哪些函式 → 送出哪個 opcode（附組語位址與 body 欄位）→ 伺服器應該怎麼更新狀態與回應；列出本次實測「沒有送封包」的原因（例如只在某個按鈕、某個場景才送）。
- **完成條件**：至少確認一條「客戶端把選擇的槽位送到伺服器」的路徑（opcode＋body 偏移＋組語位址），或明確證明原版是由伺服器在別處決定、客戶端不送。

---

## 2026-09-17 21:40 新增（Claude 額度將盡，交給 Codex Luna／Gemini）

**這兩個任務允許改伺服器程式**，但依 `AGENTS.md` 中階規則：
- 所有新行為都放在**預設關閉的開關**後面（例如檔案頂端 `const EQUIP_SAVE_MODE = 'disabled'; // 'disabled' | 'enabled'`），commit 時一定是關閉。
- 在 `flash-wip` 分支工作；**實測時**可以在工作目錄暫時打開開關、請操作者重啟伺服器並測試，測完把開關改回關閉再 commit，並在日誌寫明「打開開關時的測試結果」。
- 伺服器在 tmux `server` session 跑（`cd "Metal Rage Online Server" && npm start`），重啟前先跟操作者說一聲。
- 資料庫變更寫成 `tools/` 下的腳本，不直接下 SQL。
- 一次只改一個變數；每個實測寫一篇日誌、在 `INDEX.md` 標「待審」。
- 審查：由 Codex reviewer（Sol，高階）或下一個接手的 Claude 審；審過才能把開關預設打開。

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

---

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
## H1：登入後 1 號機商店清單漏接

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出重新登入進機庫後，1 號機商店清單沒有顯示、但切到 2 號機再切回就出現的真正原因，提出最小修正；新行為須放在預設關閉的開關後。

### 範圍

- 客戶端腳本 `ZPanel_ShopItems` 的 `ShopUpdate`、`ListLoad` 呼叫時機與頁面初始化狀態。
- 客戶端是否送出「商店開啟」或其他商店請求 CQ，以及伺服器對應的接收路徑。
- `Metal Rage Online Server/dispatch/room.dispatch.js` 中
  `Delayed ShopList refresh (initial default) slot=1 after 500ms` 路徑、`Slot_Change_SA` 後送出時機與相關 log／封包。
- 最近 session 中登入初始 1 號機與切換機體後的 `ShopList_SN 0x00240241`／`CashShopList_SN 0x00240242`。

### 背景

- [OBS] 2026-09-18 實測：重新登入進機庫後，1 號機主武器頁空白，只剩一個 `»X«` 佔位圖；證據為 [SHOT] `/home/lucas/mro-reverse/shots/g6d-relogin.png`。
- [OBS][SHOT] 切到 2 號機時商店正常滿列，證據為 `shots/g6d-mech2.png`；再切回 1 號機後清單出現。
- [LOG] 子 agent 比對 `session-20260918-071737.jsonl` 兩段連線，同位置 frame 逐位元組相同；筆數差異只對應購買觸發的 repaint，伺服器送出內容沒有差別。
- [CODE] `room.dispatch.js` 有 `Delayed ShopList refresh (initial default) slot=1 after 500ms`，目前懷疑送出時客戶端商店頁尚未建立。

### 限制

- 只做分析，不改程式、不改資料庫、不改 `docs/state.md`、不標 ✅。
- 不啟動或重啟伺服器，不請操作者測試；伺服器由 Claude 高階控制。
- 不先假定是時序問題；若需修改，只提出預設關閉開關的單一最小方案。
- 既有 ShopList 欄位偏移、G6d 完整 catalog 與 G6e 購買路徑不在本任務擴大修改。

### 交付

- 日誌 50–100 行，`docs/journal/INDEX.md` 追加一行並標「待審」，逐段對照登入與切換機體的實際 frame、客戶端腳本呼叫與 DLL／封包證據。
- 原始 decompile／組語與必要的封包 hex 存入 `docs/research/2026-09-17-backlog/H1/`。
- 提出最多兩個單變數實驗，並列出最小修正與預設關閉開關名稱；不實作、不測試。

### 完成條件

能以實際 session、腳本或組語證據說明為何登入初始 1 號機漏接而切換後恢復；若無法確認，明確列出未知點與阻塞，不猜時序或封包格式。

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

## H3：catalog 髒資料

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

查明商店 catalog 中非法 ItemIndex 與期限／價格排序異常的來源，判斷是否應在送出前過濾非法項目、是否只販售代表項，並提出價格排序修法建議，不修改資料。

### 範圍

- catalog／item_catalog 表及其 seed、匯入或生成來源；追查 `ItemIndex=27430` 對應列與相關 item_id／category 欄位。
- `ShopList_SN 0x00240241`、`CashShopList_SN 0x00240242` 的建構路徑、ItemIndex 合法性與價格欄位。
- 2026-09-18 session 中 cat2 第一包及同一武器強化等級 01–08 的實際封包、log 與客戶端畫面。
- 若能取得原廠資料或客戶端 catalog／腳本，只作對照，不把推測當成原廠規則。

### 背景

- [LOG] 2026-09-18 送出的 cat2 第一包第一筆 `ItemIndex=27430`，不是合法 8 位 item id。
- [OBS] 商店中同一把武器的強化等級 01–08 價格全是 1000G。
- G6d 已確認完整 catalog 能讓客戶端自行過濾相容商品，但髒資料與強化品是否應顯示尚未裁定。
- [OBS][LOG] G6g 彈窗顯示 `3Day 62,210G` 高於 `30Day 27,650G`；`catalog` 價格依 item_id 末碼遞增填寫，但末碼順序不是期限天數順序（`08` 是 3 天）。
- [CACHE] `GameItemRecord +0x44` 有隨期限的值：1 天 337、3 天 1012、7 天 2362、15 天 5062、30 天 10125、60 天 20250、90 天 30375，永久為 0；兩把不同武器數值完全相同，因此 🟡／⬜，不可當成單品價格。

### 限制

- 只做分析與建議，不改資料庫、不改程式、不改資料、不改 `docs/state.md`、不標 ✅。
- 不啟動或重啟伺服器，不請操作者測試；未知資料保留完整 hex 與原始列值。
- 不擅自過濾商品、不改價格、不改 `SHOP_FULL_CATALOG_MODE` 或任何其他開關。
- 不把「合法 8 位」直接當成充分的客戶端合法性規則，必須提供 DLL／catalog／實際反應證據。

### 交付

- 日誌 50–100 行，`docs/journal/INDEX.md` 追加一行並標「待審」，列出髒資料來源、完整欄位、實際封包與客戶端處理結果。
- 原始 SQL／catalog 摘錄、decompile／組語與完整相關 hex 存入 `docs/research/2026-09-17-backlog/H3/`。
- 最多提出兩個單變數建議實驗，分別針對非法 ItemIndex 過濾與強化等級顯示；只提出方案，不執行。

### 完成條件

能追到 `27430` 與期限價格排序異常的資料來源，並以證據提出是否過濾／如何排序價格的待審建議；若真正價格欄位無法確認，明確保留未知，不猜 `+0x44` 的資料意義。

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

- **待審價格資料**：`catalog` 表價格與 Cache.Bin `DisplayPoint` 不一致，趨勢同構但數字約差 10%；分析是否應改用 Cache 的數字，暫不修改資料或程式。

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

## H6：房間難度燈慢一拍

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出房間設定中難度燈慢一拍的真正原因，讓第一次按初級／中級／高級後，燈號立即對應所選 PvE map 的 `PlayPve` 值；只提出最小修正，先不擴大到其他房間 UI。

### 範圍

- 追蹤 `ZPage_Room.uc:680`、`ZPanel_PVE.uc` 的難度燈讀值，以及 `SN_MAP_CHANGE_ALL 0x00220226`／`SN_MAP_CHANGE_ONE 0x00220223` 到 `MapInfoList` 的寫入與事件觸發順序。
- 對照 `docs/journal/2026-09-18-13-map-change-order.md` 的 ALL／ONE 實測 frame、客戶端 log 與既有 `room-map.sender.js` 順序。
- 查明值已正確但畫面更新延遲一個選擇的原因；必要時保存完整 frame 與事件 log。

### 背景

- [OBS] R6 後目標回合已正確顯示 5／8／10，但難度燈仍慢一拍。
- [OBS][LOG] R7 與 R7b 都證明只要 ALL 排在 ONE 後就會覆蓋地圖選擇；因此送出順序不是可直接採用的修正，R7 開關維持 disabled。
- [SRC] 難度燈由 `MapInfoList[j].PlayPve` 驅動；目前缺的是事件、寫入與重繪之間的精確先後。

### 限制

- 先做 DLL／腳本／session 分析，不直接改程式、不改資料庫、不改 `docs/state.md` 或 `docs/HANDOFF.md`。
- 不把 R7/R7b 的失敗再標成成功；不得把 `MAP_CHANGE_ORDER_MODE` 打開。
- 不啟動或重啟伺服器，不請操作者測試；若提出實驗，最多兩個單變數、預設關閉。

### 交付

- 50–100 行日誌與 INDEX 待審列，列出難度燈讀值、ALL／ONE 完整封包與事件順序證據。
- 原始組語、腳本摘錄、完整相關 hex 存入 `docs/research/` 對應目錄。
- 最多兩個單變數修正／實驗建議；若無法定位，明確列出缺失證據，不猜時序。

### 完成條件

能以客戶端腳本或 DLL 證明燈號慢一拍的具體觸發點，並提出不改地圖選擇語意的最小預設關閉修正；否則只交分析與阻塞。

## H7：房間設定對話框地圖清單為空

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出 `ZPopup_RoomSet`／地圖選擇對話框清單仍為空的最後一個篩選關卡，讓 PvE 地圖可列出且人數控制切換到 PvE 版本；提出最小修正，不重做已驗證的房間同步路徑。

### 範圍

- 追蹤 `Account_MapList_Check`／`m_MapList`、人數範圍篩選與 `g_SelectMapInfo` 設定者的完整鏈。
- 對照 `docs/research/2026-09-18-room-setting/`、`docs/research/2026-09-18-map-list-zero/`，以及 R4／R9 日誌與實測結果。
- 查明 `g_SelectMapInfo` 何時、由哪個 Cache record 或事件設定；保留 `MapIndex < 1000`、人數陣列與 map type 的原始證據。

### 背景

- [OBS] R4 把 `SN_ROOM_DEFAULT` 首筆 entry 改成真實 map id 後仍是 4 VS 4、清單空；R9 已送 `MapInfo_SN 0x00210115` 的 9001–9012 十二筆仍無效果。
- [DLL][SRC] `Account_MapList_Check`／`m_MapList` 只是其中一關；完整鏈還包含人數範圍，而只有 `g_SelectMapInfo` 命中才切 PvE 人數陣列。
- [OBS] Gemini「伺服器從未送出 `0x00210115`」已由 session log 推翻；不要回到該錯誤前提。

### 限制

- 只做分析與最小方案，不改資料庫、不改 `state.md`／`HANDOFF.md`，不先動已驗證的四個 enabled 開關。
- 不重開伺服器、不請操作者測試；未知封包保留完整 hex，不猜 `g_SelectMapInfo` 的寫入格式。
- 若需修正，只提出預設關閉單變數開關；不得修改 `PVE_SLOT_SELECT_FLOW`、ItemInfo、G6、G7 或 `Grade_Info`。

### 交付

- 50–100 行日誌與 INDEX 待審列，逐關列出 `m_MapList`、人數範圍、`g_SelectMapInfo` 與清單生成條件。
- 原始反組譯、腳本摘錄、Cache／封包資料存入 `docs/research/` 對應目錄。
- 最多兩個單變數實驗建議；若無法確認最後關卡，只交分析及需要高階裁決的阻塞。

### 完成條件

能以 DLL／腳本／實際 log 證明清單在哪一關被丟掉，並給出不影響現有房間地圖同步的最小預設關閉修正；若不能確認，不猜格式、不改程式。
