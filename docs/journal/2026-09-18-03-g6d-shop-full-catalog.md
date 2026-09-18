# G6d：商店完整 catalog 送出開關（Claude 高階實測裁定）

## 契約與範圍

- 本輪接續 G6c，只改 `Metal Rage Online Server/dispatch/room.dispatch.js`；本次文件更新不改程式。
- `SHOP_FULL_CATALOG_MODE` 的 enabled 路徑送出 category 2..6 完整 catalog，disabled 路徑保持原行為。
- 沒有改 DB、schema、G6 save handler、ItemInfo 分包、`PVE_SLOT_SELECT_FLOW`、
  `Grade_Info_SN`、`Death_SN` 或 G7。
- 本篇實測由 Claude 高階在伺服器與客戶端操作；Codex 未自行啟動伺服器或要求重啟。

## 實測環境

- [LOG] 伺服器從本 worktree 啟動，基線為 commit `f4c40e5`，工作樹暫時將
  `SHOP_FULL_CATALOG_MODE` 改成 `enabled`；該值仍未提交。
- G6c 啟動時 worktree 缺少 repo 根目錄 `MetalRage` symlink，曾記錄
  `Cache.Bin index load failed: ENOENT`；本場先補上 symlink。
- [LOG] 本場啟動訊息為 `Loaded 1268 Cache.Bin item indexes`，所以與 G6c 不是同一 CACHE 環境。
- 此差異只影響 `CACHE_INDEX_BY_ITEM_ID`（`room.dispatch.js:914`、`1229`、`1240`），
  即機體本體 `slot===0` 的 index 轉換；不改本場商店清單結論的送出開關。

## 實際送出與分包

- [LOG] `Metal Rage Online Server/logs/session-20260918-071737.jsonl`。
- 伺服器送出 `ShopList_SN 0x00240241` 共 1541 筆、5 個分類，並以每包最多 45 筆分包。
- 分包觀察為 cat2 多包、cat4 2 包、cat5 4 包、cat6 15 包；
  `CashShopList_SN 0x00240242` 同步送出同量資料。
- cat2 第一包第一筆 `ItemIndex=27430`，其後包含 `21100101`、`21100102`…`21200405`，
  並含強化等級 01–08。
- `27430` 不是合法 8 位 item id，屬 catalog 髒資料疑點，標 🟡 待查；本篇不據此推論根因。
- 強化等級 01–08 全部填 1000G，也是 🟡 catalog 資料疑點，不在本次修正範圍。

## 客戶端結果

- [SHOT] `/home/lucas/mro-reverse/shots/g6d-main.png`：1 號機 G 幣商城的主武器頁不再空白。
- 畫面可見 8 件同名「輕量型來福機槍」1000G，以及「重型來福槍」1000G 與 1150G；
  右側捲軸表示仍有更多商品。
- 送出的 21x 家族沒有出現在該頁，與客戶端 `ItemSubordinateCheck` 會過濾不相容商品相符。
- [OBS][SHOT] 操作者購買「重型來福槍」1000G 後成功扣除 G 幣，1000→0；證據為
  `/home/lucas/mro-reverse/shots/g6d-after-buy.png`。
- [LOG] 伺服器 console 出現 `Repaint ShopList fill (post purchase) slot=1 after 100ms`。
- 但左下主武器庫存仍只有原本 1 件，新買物品沒有出現；原因未在本篇判定，另案調查。

## DLL／分包依據

- [DLL] `ShopList_SN 0x107e2890` 與 `CashShopList_SN 0x107e2ac0` 收到 frame 後，
  逐筆呼叫 `Item_ShopList_Add`／`Item_CashShopList_Add`。
- [DLL] `Item_ShopList_Add 0x10732f00` 以 `ItemIndex` 找既有列並移除後追加目前列；
  `Item_CashShopList_Add 0x107332e0` 有同樣 list 行為，因此 enabled 可按 45 筆分包。
- 每包 body 為 `3 + 20*n`，沿用 `IsShow=+0x0D`、價格欄位與既有 P/C 尾碼，未改送出時機。
- cat6 連送 15 個 frame、cat5 連送 4 個 frame 後仍正常顯示，暗示客戶端會累加多個
  `ShopList_SN` frame；本場沒有做針對性單變數實驗，維持 🟡。

## 結論與交付狀態

- ✅ [LOG][OBS][SHOT]（Claude 高階裁定）移除伺服器 `catalog.mech_type` 槽位篩選，
  將可販售商品整批送出後，1 號機主武器頁能顯示相容商品；G6b/G6c 根因判定成立。
- 🟡 多 frame 累加行為只是本場觀察，尚無針對性實驗。
- 🟡 `ItemIndex=27430` 與強化品同價是 catalog 資料疑點，待另案查證。
- ⬜ 購入物未進左下庫存；本篇只記錄現象，不推論 ItemInfo 或購買流程原因。
- `docs/journal/INDEX.md` 已將本篇由「待審」更新為 Claude 高階審查／裁定與實測。
- 本次只提交上述兩個 `docs/` 檔案；不改 `SHOP_FULL_CATALOG_MODE` 值，也不提交程式檔。
