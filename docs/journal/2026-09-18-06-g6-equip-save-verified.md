# G6：機庫換裝備存檔結案（Claude 高階實測裁定）

## 結案範圍

- 本篇回填 G6d、G6e、G6f 後的完整機庫流程，並記錄 G6 換裝保存的 W3 實測。
- G6 的四層阻塞依序為：商店篩選錯、購入物分類錯、購買後沒有重送 ItemInfo、
  SerialIndex 落在客戶端保留區。
- 本篇實測與裁定均由 Claude 高階操作伺服器、操作者操作客戶端；Codex 未重啟伺服器。

## 四層阻塞與修正

1. [LOG][OBS][SHOT] G6d 證明 `ShopList_SN 0x00240241`／`CashShopList_SN 0x00240242`
   不應由 catalog `mech_type` 先按槽位篩選；完整 catalog 送出後客戶端能顯示相容商品。
   證據與 1541 筆、45 筆分包記錄在 `2026-09-18-03-g6d-shop-full-catalog.md`。
2. [LOG] G6e W1 的 `Shop Buy stored item: account=1 item_id=22100201 mech=1 part=1`
   證明購入物改用當下機庫槽位，不再被 catalog 的 `mech_type=2` 分到錯誤機體。
3. [LOG] W1 同場送出 `Sent SN_ITEM_INFO [shop-purchase]: 37 items in 4 packet(s)`，
   證明購買後使用既有 `ItemInfo_SN 0x00210111` 分包 sender 立即更新同一連線。
4. [SRC][OBS] G6f 找到 `ZPanel_InvenItems.uc:408-411` 丟棄 SerialIndex 101–999；
   搬移 DB `items.id` 後，庫存面板才真正能列出物品。

## G6f 搬號結果

- [TEST] 搬號前：`min=154 max=223 rows=70 below-100000=70`。
- [TEST] 搬號後：`min=100154 max=100223 rows=70 below-100000=0`，AUTO_INCREMENT=200000。
- [OBS][SHOT] `shots/w2-inventory.png`：重新登入後主武器、輔助武器 L/R、裝備四個面板
  均顯示多筆；主武器為 1 件裝備中與 3 件 NEW，共 4 件。
- Claude 高階裁定：庫存不顯示的根因是客戶端保留區過濾，伺服器不需要在封包中做 serial 偏移。

## W3 換裝保存實測

- [LOG] `Saved Slot_Change_CQ 0x00240107: slot=1 body=100154 main=100223 left=100156 right=0 equipment=100157 skin=0`。
- [DB] 1 號機 `part_slot=1` 的 equipped 從 `100155`（`22100101`）移到
  `100223`（`22100301`），表示 CQ serial 已寫入正確 owned item。
- [OBS][SHOT] `shots/w3-equipped.png`：機體外觀與「裝備中」標記均換到新武器。
- [OBS] 操作者完全關閉客戶端後重新開啟登入，1 號機主武器仍為 `22100301`。
- Claude 高階裁定：G6「換裝 → 寫入 DB → 完全重登後保留」完成。

## 開關收尾

- `EQUIP_SAVE_MODE`、`PURCHASE_MECH_SLOT_MODE`、`PURCHASE_ITEMINFO_REFRESH`、
  `SHOP_FULL_CATALOG_MODE` 已依高階實測結果固定為 enabled。
- `SHOP_UNBLOCK_MODE` 與 `SHOP_COMPAT_EXPERIMENT` 維持 disabled；沒有重新打開已被組語否決的
  ShopList 欄位重排，也沒有保留一次性 21x→221x 實驗。
- ItemInfo 分包、`PVE_SLOT_SELECT_FLOW`、`Grade_Info_SN`、`Death_SN` 與 G7 未改動。
- [⬜] 尚未驗證 PvE 出場時手上是否為機庫換上的新武器，另列 backlog H4。
- G6 實測結論由 Claude 高階裁定，INDEX 以「✅ Claude 高階審查＋實測」記錄；未修改 `state.md` 或 `HANDOFF.md`。

## 交接

- 後續只需依 H4 驗證 PvE 出場武器，不應回頭改動已通過的四層 G6 路徑。
- 本篇沒有新增資料庫 migration，也沒有改 ItemInfo 分包或任何未授權範圍。
