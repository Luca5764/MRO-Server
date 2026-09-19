# SOL-REVIEW-4（2026-09-19）

- 通過 — (1) switch-off byte-identity／async ordering — `database/db.js:16,193-213` 在 disabled 時 `getItemsWithEquipViews()` 原樣回傳 `getItems()`；三個已接線的 WearInfo 生成器（`account.dispatch.js:657-713`、`gamelogin.dispatch.js:252-294`、`room.dispatch.js:1068-1114`）、`room-game-user.sender.js:127-141`、`room.dispatch.js:828-854` 因而沿用相同列與組包碼。第 4 個 WearInfo 生成器 `room.dispatch.js:1342-1439` 未改且無呼叫點，關閉時亦相同。`item-info.sender.js:37-75` 在 disabled 分支進入第一個 `await` 前已同步送完所有 ItemInfo chunk，三個 caller 加 `await`（`account.dispatch.js:641`、`gamelogin.dispatch.js:236`、`room.dispatch.js:967`）只把後續程式排入 microtask，不會讓下一個 socket I/O 插隊；ItemInfo、Slot_Change_SA、Game_User_SN 與四份 WearInfo 的 wire 欄位均未改。
- 通過 — (2) Cache.Bin ShareType／UseTime 偏移 — `database/item-share-type.js:22-26,77-84` 的 `+0x4f`／`+0x43` 對應 `CacheManager.uc:148-153` 的 UseType、UseCount、UseTime、RequestLevel、FunctionIndex、ShareType 順序。直接抽查：`26300101@0xe685` 為 UseTime=0/ShareType=0；`32100101@0x11a05`、`33800101@0x13a35` 為 0/1；`41100101@0x160d5` 為 0/0；`41100102@0x1613c` 為 86400/1。stride `0x67` 與欄位尾端吻合。
- 需修改 — (3) saveEquippedLoadout／舊欄位 — `database/db.js:309-327` 在同一 DML transaction 內先刪 target mech，再對 ShareType=0 刪同 serial 的所有 mech，最後 insert；ShareType=1 不刪其他 mech，且 migration 的 unique key 是 `(account_id,mech_slot,part_slot)`（`tools/migrate-e1-item-equips.js:46-55`），核心裝備表行為正確。但 enabled 時仍先執行 `db.js:266-280` 的舊 `items.equipped` 清除，再於 `:290-294` 設回 selected serial；`items.mech_type` 不再更新，`items.equipped` 也可能在 shared serial 仍裝於別台時變成 0。這兩欄因此是 stale legacy state，不可再當裝備來源；目前仍有讀者，見 (6)，且日後重跑 migration 會把 stale state 當真。
- 通過 — (4) purchase dedup／permanent 判定 — `room.dispatch.js:917-937` 只在 mode enabled、ShareType=1、UseTime=0 時重用既有 serial；其他情況維持 insert。全 2112 筆 Cache 交叉統計中，ShareType=1 且 UseTime=0 的 24 筆全是 UseType=4；ShareType=1 且 UseTime>0 的 210 筆全是 UseType=2，沒有模糊案例。UseType 的語意仍未獨立驗證，但已確認的期限欄位 `+0x43` 足以安全區分這份 Cache 的永久／限時共享品；未知 item 同時會由 `getShareType()` 保守回 0（`item-share-type.js:91-116`），不會誤 dedup。
- 需修改 — (5) migration — 精確重跑在未變動資料上可跳過同 serial，異 serial 佔同 slot 會 throw（`tools/migrate-e1-item-equips.js:61-105`），且只選 `equipped=1`、part 0..5。可是 `CREATE TABLE` 位於 `beginTransaction()` 之後（`:42-55`）；MySQL DDL 會隱式 commit，首次執行時後續 insert 回到 autocommit，collision 後的 rollback 無法保證撤回先前列，故不符合 transactional／fail-atomically。另印出的 `mysqldump ... items item_equips`（`:38-40`）在目前 `item_equips` 尚不存在時會報錯，不能作為可靠的 migration 前備份。source SELECT 也未拒絕 mech_slot 不在 1..8 的列（`:61-64`），雖現況沒有這種資料。
- 通過 — (5) 現況唯讀預演 — 2026-09-19 對真 DB 只下 SELECT：目前 `item_equips` table count=0；全庫 130 筆 `equipped=1`，非法 mech／part 各 0，所有帳號均無 `(account_id,mech_type,part_slot)` collision。帳號 1、3、4 各 slot group 的 count 全為 1，collision 清單皆空；所以修正 migration 原子性後，現有資料可直接搬 130 列。
- 需修改 — (6) mode-on 仍讀舊裝備位置 — active `room.dispatch.js:1213,1220-1223` 的 `buildShopItems()` 仍以 `db.getItems()` 的 `items.mech_type/equipped` 找 selected mech 主武器；開啟 E1 後可能依 stale legacy state 選錯 shop family。兩個目前無 caller 的生成器 `room.dispatch.js:1301-1339,1342-1439` 亦仍以舊欄位產生 ItemInfo/WearInfo；若日後接線會立刻繞過 E1。`item-info.sender.js:65-67` 保留 record+0x10 `mech_type` 是已知未知語意，不等同伺服器裝備查詢，但應持續列為 wire 疑點。

## Must fix before migration

- 把 `CREATE TABLE IF NOT EXISTS item_equips` 移到 transaction 前，建表完成後重新 `beginTransaction()` 再做全部 SELECT／INSERT；collision 時才能整批 rollback。
- 把備份提示改成在「表尚不存在」時也必定成功的命令（例如整庫 dump 或只 dump `items`），並檢查備份命令退出碼由操作者確認後才遷移。
- source rows 應先驗證／拒絕 `mech_type NOT BETWEEN 1 AND 8`，不可靜默寫非法 `mech_slot`。
- mode-on 前把 active `buildShopItems()` 改讀 equip view／`item_equips`；並決定舊 `items.equipped/mech_type` 是完全停止維護，或每次 transaction 後可靠同步，避免讀者與 migration 重跑誤用 stale state。

## 疑點

- Migration 只逐列保存現有 serial，不會合併同 catalog item 的歷史重複購買；這不破壞 unique key，但 E1 上線後舊帳號仍可能同時持有多個相同共享品 serial。是否清併屬資料政策，現規格未授權腳本處理。

## 高階處理（Claude）
- 四項 must-fix 全部採納，交原 worker 修。另外決定：mode 開啟時完全停止維護 `items.equipped`／`mech_type`，`item_equips` 是唯一來源；migration 在 `item_equips` 非空時拒絕重跑（除非 `--force`）。
- 備份由高階在遷移前用整庫 mysqldump 自己做。
- 歷史重複購買的合併：屬資料政策，要問操作者，不在這次範圍。
