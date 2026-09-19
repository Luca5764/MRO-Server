# SOL-REVIEW-4b（2026-09-19）

- 通過 — (1) batch4 must-fix — migration 已把 DDL 移到 transaction 前（`tools/migrate-e1-item-equips.js:58-74`；DML transaction 自 `:93` 開始），於 `:99-122` 拒絕 mech_slot 1..8 外的 source row，於 `:83-90` 在已有資料時拒絕無 `--force` 重跑；CLI 同時要求 `ALLOW_REAL_DB_WRITE=1` 與 `E1_BACKUP_CONFIRMED=1`（`:169-192`）。Mode-on 的 `saveEquippedLoadout` 只改 `item_equips`、不再碰 legacy 三欄（`database/db.js:266-327`），disabled 舊路徑保留；active `buildShopItems` 已改用 `getItemsWithEquipViews`（`room.dispatch.js:1213-1229`）。兩個未接線的舊 generator 仍只加警告註解（`:1305-1456`），不影響現有路徑。
- 通過 — (2) merge 範圍與資料完整性 — `merge-e1-shared-duplicates.js:81-117` 僅規劃同 account/item_id、ShareType=1、UseTime=0 的重複 serial，優先保留已有 equip row 者再取最低 id；`:139-150` 先把 removed serial 的全部 `item_equips` repoint，再刪 `items`。grep `metalrageserver.sql:77-87`、`database/schema.sql:93-104` 及 database/dispatch/tools：沒有其他資料表保存 `items.id`；唯一持久引用是新 `item_equips.item_id`。刪除後 ItemInfo 擁有筆數按目的減少，purchase 的 account/item_id 查詢仍命中 kept row，Wear/Game_User/Slot_Change 經 repoint 後都送 kept serial，不會形成 orphan。
- 通過 — (2) atomicity／idempotence（無併行寫入前提）— 所有 UPDATE/DELETE 都在同一 transaction（`merge-e1-shared-duplicates.js:135-166`），錯誤會整批 rollback；完成後每組只剩一筆，第二次 count>1 plan 為空。`--dry-run` 在 `:126-133` 於 beginTransaction 前返回，只有 SELECT。
- 疑點 — (2) 併行寫入 — plan 的 items/item_equips SELECT 在 transaction 外（`:75-117`），服務若同時換裝，可能在 repoint 後、DELETE 前新增 removed serial 的 equip row，留下 orphan；已登入 client 也可能繼續送被刪 serial。腳本應只在服務停止 DB 寫入、client 全部重登的維護窗執行；若要支援線上執行，需把 plan 讀取移入 transaction 並鎖住相關 rows。
- 通過 — (3) 真 DB SELECT-only 預演 — 現在 `item_equips` 尚不存在；以下 keeper 依「先 migration legacy equipped=1，再執行 merge」規則推算，未寫 DB。
- 帳號 1：`32100101 [100156,100160,100164,100168,100172] → keep 100156`；`33800101 [100219,200065] → keep 100219`；`33800201 [200003,200066,200101] → keep 200003`。
- 帳號 3：`32100101 [200019,200023,200027,200031,200035] → keep 200031`；`33800101 [200051,200058,200062] → keep 200051`；`33800201 [200052,200059,200063] → keep 200052`。
- 帳號 4：`32100101 [200071,200075,200079,200083,200087] → keep 200071`。

**GO（有條件）—** 先完成並驗證全庫備份，停止 server／所有 DB writer，依序執行 migration → merge `--dry-run` 核對上述 plan → merge 正式執行；完成後再啟動並要求 client 重登。若不能保證無併行寫入，則 **NO-GO**。
