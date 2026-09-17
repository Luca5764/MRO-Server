# G6e：購買物品的機體槽位分類與 ItemInfo 重送（待審）

## 目標

- 修正「買到的東西哪台機都看不到」的兩個可獨立測試因素。
- 第一個因素控制購買寫入 `items.mech_type` 是否採用當下機庫槽位。
- 第二個因素控制購買成功後是否重送既有分包的 `ItemInfo_SN 0x00210111`。
- 兩個開關均預設關閉，實測由 Claude 高階執行；本篇不下已確認結論。

## 背景證據（Claude 高階已核對）

- [LOG] `logs/session-20260918-071737.jsonl` 第 443／465 行的重新登入連線，
  `ItemInfo_SN 0x00210111` 第 3 個 12 筆分包含新買武器：
  `id=221 item_id=22100201 equipped=0 mech_type=2 part_slot=1 useType=0 qty=1`。
- 同包可顯示的 `22100101` 是 `id=155 item_id=22100101 equipped=1 mech_type=1
  part_slot=1 useType=2 qty=1`；差異為 `equipped` 與 `mech_type`。
- [CODE] `items.mech_type` 在 `room.dispatch.js:909`、`:1037`、`:1235`／`:1237`
  作機體槽位 1–8 使用；種子 `items.id=155,159,…,183` 的值正是 1..8。
- [CODE] 購買原路徑 `room.dispatch.js:791` 取 `db.getItemCatalog()`，
  `database/db.js:365-383` 的 catalog `mech_type` 直接進 INSERT，未讀當下機庫槽位。
- [OBS] 操作者在 1 號機購買後，1 號機與 2 號機都看不到；2 號機商店顯示近戰機用鋸子。
- [CODE] 原有購買後 ItemInfo 重送位於 `room.dispatch.js:814-826`，被
  `SHOP_UNBLOCK_MODE` 條件包住；因此預設 disabled 時同一連線不更新，重開才可能看到。

## 實作

- 在 `room.dispatch.js:93` 新增 `PURCHASE_MECH_SLOT_MODE = 'disabled'`。
- enabled 時購買 INSERT 的 `mech_type` 使用 `Number(client.currentHangarSlot_) || 1`；
  取不到當下槽位時回退 1，`part_slot`、`quantity`、`equipped` 與 SQL 不變。
- disabled 時仍直接使用 `(Number(item.mech_type) || 0)`，即原 catalog 分類表達式。
- 在 `room.dispatch.js:95` 新增 `PURCHASE_ITEMINFO_REFRESH = 'disabled'`。
- 購買成功後，enabled 時呼叫既有 `require('./item-info.sender').sendItemInfo()`，
  沿用 `ITEM_INFO_CHUNK=12`、35-byte record 與既有 `0x00210111` sender。
- 舊 `SHOP_UNBLOCK_MODE` 的 ItemInfo refresh 觸發仍保留在同一條條件中；其值與
  `room.dispatch.js:292-299` 的 ShopList 欄位路徑均未改動，避免打開已被否決的重排。
- 因此只開 `PURCHASE_MECH_SLOT_MODE` 不會重送 ItemInfo，只開
  `PURCHASE_ITEMINFO_REFRESH` 不會改購買寫入的 mech_type。

## 限制核對

- 沒有修改既有 DB 資料或 schema；錯誤分類的 `items.id=221` 保留作為對照組。
- 沒有改 `EQUIP_SAVE_MODE`、`SHOP_UNBLOCK_MODE`、`SHOP_FULL_CATALOG_MODE`、
  `ItemInfo` 分包本身、`PVE_SLOT_SELECT_FLOW`、`Grade_Info_SN`、`Death_SN` 或 G7。
- 工作樹原本的 `SHOP_FULL_CATALOG_MODE = 'enabled'` 保持 enabled，未納入本輪意圖變更。
- disabled 路徑未新增任何 DB 寫入、sender 呼叫或欄位改寫；原 catalog mech_type
  表達式與原 SHOP_UNBLOCK_MODE refresh 行為均保留。

## 靜態驗證與待實測

- `node --check Metal Rage Online Server/dispatch/room.dispatch.js` 通過。
- [TEST] 尚未由 Codex 啟動伺服器、重啟客戶端或執行實測；實測結果留待高階回填。
- 待測一：只開 `PURCHASE_MECH_SLOT_MODE`，確認 1 號機購買的新物品寫入 `mech_type=1`。
- 待測二：只開 `PURCHASE_ITEMINFO_REFRESH`，確認同一連線收到分包後庫存立即更新。
- [⬜] 是否能在商店與左下庫存顯示，是否能被換裝保存流程選取，均待實測。
- 本篇結論維持 🟡 待審；沒有新增 `docs/state.md` 確認標記。
