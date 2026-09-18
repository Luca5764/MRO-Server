# G6g：商店期限變體全送但只顯示代表項（Claude 高階實測裁定）

## 目標與根因

- 新增預設關閉的 `SHOP_PERIOD_REPRESENTATIVE_MODE`，只控制主商店列表的 `IsShow`。
- enabled 時仍送出完整家族，僅讓 Cache.Bin `ItemIndex == RepresentIndex` 的代表項顯示。
- 筆數、順序、價格、ShopList／CashShopList 送出時機與分包均不得改變。
- [CODE] 現況 `room.dispatch.js:291` 無條件寫 `const isShow = 1`，所以 8 個期限變體都顯示。

## Cache.Bin 證據

- [CACHE] 正確的 GameItemRecord 表起點是 `0x2294`，每筆 `0x67` bytes，共 2112 筆；
  最後一筆起點 `0x373ed`，後面的 `0x37456` 是已知 DefaultSetList。
- [CACHE] `0x7c4d`、`0x7cb4`、`0x7d1b`、`0x7d82`、`0x7de9`、`0x7e50`、`0x7eb7`、
  `0x7f1e` 是 22100101 家族在這張 GameItemRecord 表內的記錄位置。
- 原本 header 82、entry 103、itemId offset 96 的 1268 筆 body-index loader 保留不動，
  只供 `slot===0` 的 Cache index 轉換，不能拿來解析 GameItemRecord。
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

- `room.dispatch.js:111` 的 `SHOP_PERIOD_REPRESENTATIVE_MODE` 經實測後固定為 enabled。
- `loadCacheIndexByItemId()` 同一次讀檔保留原 `itemId -> cache index`，另以具名常數
  `0x2294`／`0x67`／`2112` 掃 GameItemRecord，建立 `CACHE_REPRESENT_INDEX_BY_ITEM_ID`。
- 首筆 ItemIndex 必須是 `11100101`，否則整張代表對照表留空；Cache 讀取失敗或沒有某筆
  對照時，代表判定回退為 `IsShow=1`，維持現行安全行為。
- 啟動時印出 `Cache.Bin represent samples`，抽樣格式為
  `22100102->rep 22100101 period 86400`。
- `writeShopListBody()` 依 `ItemIndex == RepresentIndex` 寫入 `IsShow`；disabled 時仍無條件寫 1。
- 沒有改 `buildShopItems()` 的 item_id 去重／排序，也沒有少送任何期限變體。
- `SHOP_UNBLOCK_MODE`、`SHOP_COMPAT_EXPERIMENT` 與其他 G6 開關值均未改動。

## 實測回填（Claude 高階執行）

- `node --check Metal Rage Online Server/dispatch/room.dispatch.js` 通過。
- [LOG] `logs/session-20260918-130902.jsonl` 啟動訊息抽樣為
  `22100101->rep 22100101 period 0`、`22100102->rep 22100101 period 86400`、
  `22100103->rep 22100101 period 604800`、`22100104->rep 22100101 period 1296000`，
  後續 05–08 依序為 2592000、5184000、7776000、259200 秒。
- [OBS][SHOT] `/home/lucas/mro-reverse/shots/s1-shop-period.png`：主武器頁每個代表家族只剩一列，
  共顯示輕量型來福機槍、重型來福機槍、自動機槍、高速格林機槍、高級格林機槍砲、
  颶風狙擊砲、暴風式連發機槍、量子雷射砲，不再出現 8 個同名項。
- [OBS] 點選「高級格林機槍砲」後，`ZPopup_Buy` 仍列出 1group 1,000G、
  1Day 1,150G、3Day 62,210G、7Day 7,660G、15Day 15,550G、30Day 27,650G。
- Claude 高階裁定：整個期限家族確實送到客戶端，主列表只顯示共同 `RepresentIndex` 的代表項。
- ✅ [CACHE][LOG][OBS][SHOT] item_id 末兩碼是持有期限變體，期限欄位為 `+0x43`；
  先前「強化等級」推測排除，先前 `+0x4c` 欄位報告更正為錯誤（實測全為 0）。
- [TEST] 本篇實測由 Claude 高階與操作者完成；Codex 未啟動伺服器或重啟。

## 交付邊界

- 價格與 Cache `DisplayPoint` 的差異只追加至 backlog，未在本任務調整 catalog 或封包價格。
- 本輪未啟動伺服器、未改資料庫，也未改 `state.md`、`HANDOFF.md` 或其他開關。
