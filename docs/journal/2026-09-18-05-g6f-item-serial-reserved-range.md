# G6f：搬離客戶端保留 SerialIndex 範圍（待審）

## 根因

- [SRC] `~/mro-decrypted/src/ZGameMainMenu/ZPanel_InvenItems.uc:408-411` 的
  `ListLoad()` 明確跳過 `SerialIndex > 100 && SerialIndex < 1000` 的項目。
- [SRC] 機庫左下主武器、輔助武器 L/R、裝備面板共用這條 `ListLoad()` 路徑。
- [SRC] `ZNetwork_DJ.HaveList_Get()` 位於 `ZNetwork_DJ.uc:1154-1157`，資料由
  `ItemInfo_SN 0x00210111` 填入；[DLL] handler 為 `0x107095c0`。
- [CODE] `dispatch/item-info.sender.js:41` 直接把 `item.id` 寫成 ItemInfo record 的 SerialIndex。
- [OBS][DB] 現有 `items.id` 落在 101–999（例如 155、218、221、222、223），
  所有真實庫存因此被客戶端那一行濾掉，包含 equipped=1 的物品。
- [OBS] 畫面剩下的一格是客戶端 Cache DefaultSetList 合成的佔位項，SerialIndex 為 0，
  不是伺服器實際送出的可選庫存。
- [OBS] W1 實測已修正 mech_type 與購買後 ItemInfo 重送，log 仍有
  `Shop Buy stored item: ... mech=1 part=1` 與 `Sent SN_ITEM_INFO [shop-purchase]: 37 items in 4 packet(s)`，
  庫存仍只有一格；這與保留區過濾根因一致。

## 方案判斷

- 目標是讓所有 `items.id` 大於 999，直接搬 DB 主鍵；不在程式內對 serial 做加減偏移。
- [CODE] ItemInfo 的 SerialIndex、WearInfo 的 `uniqueKey`、Game_User_SN 槽位資料與未來
  `Slot_Change_CQ` 都直接使用 `items.id`；只在某個封包加偏移會造成不同路徑無法對應。
- [CODE] 唯讀檢查 `metalrageserver.sql` 與 `database/schema.sql`，只有 `items.account_id`
  被 `accounts.id` 參照；沒有其他表以 `items.id` 作外鍵或參照。
- [CODE] 伺服器的 `items.id` 用法都是持有者 serial／unique key 的讀寫，未發現需要同步改寫的子表。

## 腳本交付

- 新增 `Metal Rage Online Server/tools/renumber-item-serials.js`，沿用
  `database/db.js` 對 `database/config.json` 的讀法（預設 root@127.0.0.1/mro）。
- 執行前印出 `MIN(id)`、`MAX(id)`、筆數與低於 100000 的筆數；執行後再印同樣統計。
- 先要求操作者輸入精確確認字串 `RENNUMBER`；沒有 `--yes` 或自動略過確認的參數。
- 無 `id < 100000` 時直接視為已完成，重跑不會再次搬號；仍把 AUTO_INCREMENT 設到下限。
- 無 `id + 100000` 衝突時執行 `UPDATE items SET id = id + 100000 WHERE id < 100000`。
- 先檢查主鍵碰撞；若發現碰撞，交易內先搬到高位暫存 serial，再分配不碰撞的新 serial，避免覆蓋資料。
- 交易失敗會 rollback；成功後執行 `ALTER TABLE items AUTO_INCREMENT = 200000`，再印出結果。
- 本次沒有執行腳本、沒有連線查詢現有 DB，也沒有修改既有資料；由 Claude 高階執行。

## 全新安裝 SQL

- `Metal Rage Online Server/metalrageserver.sql` 的 `items` 建表改為
  `AUTO_INCREMENT=100001`，並在建表附近註明 `ZPanel_InvenItems.uc:408-411` 的保留區原因。
- 種子庫存 INSERT 沒有寫死 `items.id`，由 AUTO_INCREMENT 產生；沒有需要另搬的 seed serial。
- 沒有修改 `database/schema.sql`，因專案 setup 規定全新安裝使用 `metalrageserver.sql`。

## 靜態驗證與待審

- `node --check tools/renumber-item-serials.js` 通過；沒有執行腳本或重啟伺服器。
- [TEST] 實測欄位留空，待 Claude 高階執行腳本並回填搬號前後統計與客戶端結果。
- 🟡 本篇只記錄高階已核對的根因、唯讀參照檢查與待執行腳本，不標記 DB 搬號或庫存顯示為已確認。
