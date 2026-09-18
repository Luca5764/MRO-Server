# G6g：商店期限變體全送但只顯示代表項（待審）

## 目標與根因

- 新增預設關閉的 `SHOP_PERIOD_REPRESENTATIVE_MODE`，只控制主商店列表的 `IsShow`。
- enabled 時仍送出完整家族，僅讓 Cache.Bin `ItemIndex == RepresentIndex` 的代表項顯示。
- 筆數、順序、價格、ShopList／CashShopList 送出時機與分包均不得改變。
- [CODE] 現況 `room.dispatch.js:291` 無條件寫 `const isShow = 1`，所以 8 個期限變體都顯示。

## Cache.Bin 證據

- [CACHE] `/mnt/c/Games/MetalRage Online/data/System/Cache.Bin` 的 22100101 家族記錄起點為
  `0x7c4d`、`0x7cb4`、`0x7d1b`、`0x7d82`、`0x7de9`、`0x7e50`、`0x7eb7`、`0x7f1e`。
- 每筆記錄大小為 `0x67` bytes；現有 loader 的 record 欄位起點仍是 header 82、entry 103、
  itemId offset 96。
- [CACHE] record `+0x00` 是 ItemIndex，`+0x04` 是 RepresentIndex；8 筆的 RepresentIndex
  全部為 `22100101`，因此代表判定不能用 item_id 末兩碼猜測。
- [CACHE] record `+0x43` 是持有期限秒數：0、86400、604800、1296000、2592000、
  5184000、7776000、259200；`+0x4c` 實測全為 0，不採用先前錯誤報告。
- Claude 高階已裁定 item_id 末兩碼是持有期限變體，不是強化等級。

## 客戶端顯示與購買機制

- [SRC] `~/mro-decrypted/src/ZGameMainMenu/ZPanel_ShopItems.uc:390` 的 `ListLoad()`
  第一個條件是 `if (ItemList[n].IsShow == false) continue;`。
- [SRC] 同檔約 `:520` 以 `GetSpecItemName(Info.RepresentIndex)` 取名稱，所以同家族期限變體同名。
- [SRC] `~/mro-decrypted/src/ZGameMainMenu/ZPopup_Buy.uc:359-456` 以 RepresentIndex
  從 Cache 找同家族期限變體，再用 ItemIndex 對 `Shop_List_Get()` 取價組成天數／價格選單。
- 因此必須全送家族資料讓購買彈窗湊齊選項，但主列表只顯示代表項。
- [SHOT] 目前 8 把同名商品同時顯示的證據為 `shots/g6d-main.png`。

## 實作

- `room.dispatch.js:109` 新增 `SHOP_PERIOD_REPRESENTATIVE_MODE = 'disabled'`。
- `loadCacheIndexByItemId()` 同一次讀檔保留原 `itemId -> cache index`，另建
  `CACHE_REPRESENT_INDEX_BY_ITEM_ID`，讀取 record `+0x04` 的 RepresentIndex。
- 啟動時印出 `Cache.Bin represent samples`，抽樣 22100101–22100108；Cache 讀取失敗或
  沒有某筆對照時，代表判定回退為 `IsShow=1`，維持現行安全行為。
- `writeShopListBody()` 依 `ItemIndex == RepresentIndex` 寫入 `IsShow`；disabled 時仍無條件寫 1。
- 沒有改 `buildShopItems()` 的 item_id 去重／排序，也沒有少送任何期限變體。
- `SHOP_UNBLOCK_MODE`、`SHOP_COMPAT_EXPERIMENT` 與其他 G6 開關值均未改動。

## 靜態驗證與待審

- `node --check Metal Rage Online Server/dispatch/room.dispatch.js` 通過。
- [TEST] 尚未啟動伺服器或實測；待操作者在 enabled 開關下確認主列表只剩代表項、購買彈窗仍列全期限。
- [⬜] Cache sample 的實際啟動 log 與客戶端畫面結果留待實測回填。
- 🟡 本篇只記錄 Cache／腳本證據與預設關閉修正，不標記客戶端實測通過。

## 交付邊界

- 價格與 Cache `DisplayPoint` 的差異只追加至 backlog，未在本任務調整 catalog 或封包價格。
- 本輪未啟動伺服器、未改資料庫，也未改 `state.md`、`HANDOFF.md` 或其他開關。
