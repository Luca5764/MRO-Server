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

## G6：機庫換裝備存檔（指派：Codex）

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

查明商店 catalog 中非法 ItemIndex 與強化等級價格異常的來源，判斷是否應在送出前過濾非法項目、是否只販售等級 01，提出分析與建議，不修改資料。

### 範圍

- catalog／item_catalog 表及其 seed、匯入或生成來源；追查 `ItemIndex=27430` 對應列與相關 item_id／category 欄位。
- `ShopList_SN 0x00240241`、`CashShopList_SN 0x00240242` 的建構路徑、ItemIndex 合法性與價格欄位。
- 2026-09-18 session 中 cat2 第一包及同一武器強化等級 01–08 的實際封包、log 與客戶端畫面。
- 若能取得原廠資料或客戶端 catalog／腳本，只作對照，不把推測當成原廠規則。

### 背景

- [LOG] 2026-09-18 送出的 cat2 第一包第一筆 `ItemIndex=27430`，不是合法 8 位 item id。
- [OBS] 商店中同一把武器的強化等級 01–08 價格全是 1000G。
- G6d 已確認完整 catalog 能讓客戶端自行過濾相容商品，但髒資料與強化品是否應顯示尚未裁定。

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

能追到 `27430` 與強化等級 01–08 的資料來源，並以證據提出是否過濾／是否只送等級 01 的待審建議；若來源或原廠規則無法確認，明確保留未知，不猜格式或資料意義。

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
