# G6d：商店完整 catalog 送出開關（待審）

## 契約與範圍

- 本輪接續 G6c，只改 `Metal Rage Online Server/dispatch/room.dispatch.js`。
- 新增 `SHOP_FULL_CATALOG_MODE = 'disabled'`；預設關閉，未動
  `SHOP_UNBLOCK_MODE` 或 `SHOP_COMPAT_EXPERIMENT`。
- 沒有改 DB、schema、G6 save handler、ItemInfo 分包、
  `PVE_SLOT_SELECT_FLOW`、`Grade_Info_SN`、`Death_SN` 或 G7。
- 沒有開 server，也沒有請操作者重啟或實測；本篇是實作交付，不是 G6d 實測結果。

## 實作

- `buildShopItems()` 在開關 enabled 時，仍先取 catalog `category_type 2..6`，
  再以 `item_id` 去重並升冪排序，直接回傳完整清單；不讀 selected slot、
  `mech_type`、owned items 或 `mainFamily`，也不呼叫 `interleaveShopFamilies()`。
- disabled 時保留原本 `mech_type === selectedSlot`、family fallback、
  `interleaveShopFamilies()` 的路徑。
- `sendShopList()` disabled 分支保留原本每分類單 frame、既有
  `CAT_LIMIT`、point/cash 成對送出的行為。
- enabled 時每分類以最多 45 筆切 frame，仍使用現有 3-byte body header、
  20-byte entry、`ShopList_SN 0x00240241` 的 `P` 與
  `CashShopList_SN 0x00240242` 的 `C` 尾碼。
- enabled 分支沒有改送出時機、分類排序、`IsShow=+0x0D`、價格欄位或 repaint
  schedule；cash frame 使用未修改的同一批商品。

## 分包依據

- `[DLL]` `ShopList_SN 0x107e2890`／`CashShopList_SN 0x107e2ac0` 每收到一個
  frame，就逐筆呼叫 `Item_ShopList_Add`／`Item_CashShopList_Add`。
- `[DLL]` `Item_ShopList_Add 0x10732f00` 維護 native list count/array，先以
  `ItemIndex` 找既有列並移除，再將目前列追加；不是把整個 list 替換成最後
  一個 frame。Cash add `0x107332e0` 有同樣的 list 行為。
- 因此 enabled 分類超過 45 筆時可以分包；每包 frame body 為
  `3 + 20*n`，保守使用 45 筆上限，避免超過專案要求的 `0x400` frame 限制。

## G6c 既有證據（本輪未重測）

- `[LOG]` `logs/session-20260917-231213.jsonl` 的 G6c 實驗中，
  `ShopList_SN 0x00240241` 第一列由 `21100101` 換為 `22100101` 後顯示，
  其餘 21x 列仍未顯示。
- `[OBS]` G6c 操作結果是主武器頁恰好一件「輕量型來福機槍 1000G」；
  `[SHOT]` 證據為 `shots/g6c-shop.png`。
- `[LOG]` 同一實驗維持原本 Open_SA 後約 65ms 的送出時序，且
  `IsShow=+0x0D` 沒改；G6c 因此排除了時序與旗標偏移替代解釋。
- G6d 只把伺服器篩選移除，讓相容性決策回到客戶端
  `ZPanel_ShopItems.ItemSubordinateCheck()`；沒有把 21x 強行改成 221x。

## 靜態驗證與交付

- `node --check Metal Rage Online Server/dispatch/room.dispatch.js` 通過。
- `git diff --check` 通過。
- 未產生新的 `[OBS]`／`[SHOT]`；實測由 Claude 高階與操作者另行安排。
- INDEX 以「待審」列出；等待高階確認開關 enabled 後再進行四分頁實測。
