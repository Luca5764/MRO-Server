# M3 機庫購買後庫存面板即時重繪機制分析

狀態：🟡 待審；純分析與證據保存，未修改伺服器程式碼或資料庫。

## 依據與目標

- [OBS] 實測 M2（`session-20260918-221216.jsonl:326-332`）：`Buy_PointItem_CQ 0x00240201` → `Buy SA 0x00240202`（14 bytes, Point=85000）→ 5 包 `ItemInfo_SN 0x00210111`（含新物品）；新物品未立即出現在庫存面板，切換機體後才出現。M2「ACK 必須先於 ItemInfo」之因果假設已被排除 ❌。
- 本任務透過客戶端腳本（`~/mro-decrypted/src/`）與 `ZNetwork.dll` 反組譯，找出購買成功後客戶端庫存面板重繪之完整呼叫鏈、靜默原因與觸發機制。

## 完整呼叫鏈與封包行為核對

1. **`ItemInfo_SN 0x00210111` 純資料寫入，零 UI 事件 [DLL]**：
   - 導出 thunk `0x107095c0` → 實作 `0x107c4560`（`ZDispatchGame::ItemInfo_SN`）。
   - 迴圈解析每個 entry 後呼叫 `0x10732450`（`UZNetwork_DJ::Item_Add`），寫入客戶端內部 `HaveList` 陣列（`+0x81c`）。
   - `0x107c4680 - 0x107c468c` 及 `0x107327a1 - 0x107327ca`：函式清理堆疊後直接 `ret 8` / `ret 0x24`。
   - **完全沒有呼叫 `QueueNetworkMessage`（`0x10728d50`）或任何事件分發**。客戶端收到 `ItemInfo_SN` 時，UnrealScript UI 完全不知情。

2. **`Buy_PointItem_SA 0x00240202` 唯一發出購買完成事件 [DLL][SRC]**：
   - 實作 `0x107dea70`（`ZDispatchHangar::Buy_PointItem_SA`）。
   - 當 `Status == 0 && Result == 0` 時，更新金錢（`0x107deae5`），並於 `0x107deb16` 呼叫 `0x10728d50` 推送事件字串 `0x108314b4`（`"NETWORK_HANGAR_ITEM_BUY"`）與空錯誤訊息（`0x10815410`）。
   - `ZGUIController.uc:266, 814` 將 `"NETWORK_HANGAR_ITEM_BUY"` 分發給當前焦點頁面 `ZPopup_Buy.uc`。
   - `ZPopup_Buy.uc:627-635`：
     ```unrealscript
     case "NETWORK_HANGAR_ITEM_BUY":
         if( ErrorMessage == "" && ParentPage.Class == class'ZPage_Hangar' ) {
             ZPage_Hangar(ParentPage).RecvItemBuy();
             ThisPageClose();
         }
     ```
   - `ZPage_Hangar.uc:2706-2785`（`RecvItemBuy()`）：
     - 第 2715 行：`CashUpdate();`
     - 第 2724 行：`NotifyPageOpen("HANGAR_ITEM_BUY", szItemName);`（彈出「購買完成」提示框）。
     - 第 2781-2784 行：`SlotUpdate(false); PreviewLoad(); InvenUpdate();`。

3. **庫存面板重繪機制 [SRC]**：
   - `ZPage_Hangar.uc:1255-1264`（`InvenUpdate()`）：對 4 個 `p_InvenItem[i]` 面板依序呼叫 `Update(m_SelUnitSlot, ...)`。
   - `ZPanel_InvenItems.uc:173-194`（`Update()`）：呼叫 `ListLoad()` 與 `ListUpdate()`。
   - `ZPanel_InvenItems.uc:387`（`ListLoad()`）：呼叫 `ItemList = class'ZNetwork.ZNetwork_DJ'.static.HaveList_Get();`，並以 `ItemSubordinateCheck(ItemIndex)` 篩選當前機體相容裝備加入顯示清單。

## 換機體立即生效之原因

- `ZPage_Hangar.uc:1860-1896`（`UnitSelect()`）：
  - 若點選同機體或裝備未變（第 1883 行）：直接在本地呼叫 `SlotUpdate(false); PreviewLoad(); InvenUpdate(); ShopUpdate();`。
  - 若切換機體裝備（第 1881 行）：發送 `Slot_Change_CQ 0x00240107`；收到伺服器 `Slot_Change_SA 0x00240108`（`0x107dde80`）後推入 `"NETWORK_HANGAR_SLOT_CHANGE"`（`0x107de00c`）；`ZPage_Hangar.uc:1232`（`SlotChangeRecv()`）呼叫 `SlotUpdate(true); PreviewLoad(); InvenUpdate(); ShopUpdate();`。
- 切換機體發生在購買後數秒，此時 5 包 `ItemInfo_SN` 早已在背景默默寫入 `HaveList`。因此 `InvenUpdate() -> ListLoad()` 查詢 `HaveList_Get()` 時便能成功讀出新物品並繪製。

## 購買當下未重繪根因分析

- **時序脫鉤與靜默更新**：
  - 唯一會觸發購買重繪的事件是 `Buy_PointItem_SA` 帶來的 `NETWORK_HANGAR_ITEM_BUY`。
  - 在 M2 時序中，`Buy_PointItem_SA` 先到，觸發 `RecvItemBuy() -> InvenUpdate()`；但此時含新物品的 5 包 `ItemInfo_SN` 尚未抵達或尚未被 `Item_Add` 寫入 `HaveList`。
  - 當 5 包 `ItemInfo_SN` 隨後抵達時，DLL 僅靜默修改記憶體陣列，沒有發出任何重繪通知。
  - 原廠在 `RecvItemBuy()` 中（第 2737、2752 行）直接依賴 `HaveList_Get()` 尋找剛買的物品（如 License/RandomBox），證明原廠設計時，新物品的庫存資料在 `RecvItemBuy()` 執行時必須已存在。

## 單變數實驗建議（供高階裁決）

1. **實驗一：購買成功封包末尾補發 `Slot_Change_SA 0x00240108`（預設關閉）**：
   - 伺服器在 5 包 `ItemInfo_SN` 發送完畢後，回送一包當前機庫 slot 的 `Slot_Change_SA 0x00240108`（0 成功標頭與當前裝備）。
   - 預期效果：觸發客戶端 `NETWORK_HANGAR_SLOT_CHANGE` → `SlotChangeRecv()` → `InvenUpdate()`，強制在庫存寫入後進行第二次重繪。
2. **實驗二：先送完整 `ItemInfo_SN` 並確保 socket flush 後才送 `Buy_PointItem_SA 0x00240202`（預設關閉）**：
   - 探討 M1 失敗是否因 TCP 封包黏包或同一 tick 處理順序導致 `HaveList` 尚未更新；在 `ItemInfo_SN` 送完並短暫延遲後再送 `Buy SA`。


## 高階審查與實測（2026-09-18 23:00，Claude 高階）

- 呼叫鏈 ✅ [SRC]：購買彈窗由 `ZPage_Hangar.uc:1566` 開啟；`NETWORK_HANGAR_ITEM_BUY` → `RecvItemBuy()` → `InvenUpdate()`（`:2781-2784`）。
- 「ItemInfo 晚到所以沒畫到」這個根因只算 🟡：舊順序（ItemInfo 先、Buy SA 後）時新物品同樣不會立刻出現（M1 第一輪 [OBS]），單靠時序解釋不了。真正原因仍是 ⬜。
- 實驗一（M3a）✅：`POST_BUY_SLOT_REFRESH_MODE` 開啟後，[LOG] `session-20260918-222223.jsonl` 行 845–856：`0x00240201` → `0x00240202` → 5 包 `0x00210111` → 補送 `0x00240108`；[OBS] 新物品立刻出現在庫存。實測時用的是 M2 順序（ACK 先），`reverse-work` 用的是舊順序（ItemInfo 先）。補送一律排在兩者之後，所以不受順序影響（🟡 推論，未在舊順序下實測）。
- 預設改為 enabled。實作見 worker 的 commit `426267e`（flash-wip-m3a）。
