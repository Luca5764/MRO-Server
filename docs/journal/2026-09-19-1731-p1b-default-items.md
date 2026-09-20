# P1B-IMPL：起始帳號重複預設裝備清理（2026-09-19）

> 🟡 假設／實作，中階完成。已由 Sol batch5（`research/2026-09-19-sol-review/batch5.md`，SOL-REVIEW-5）審查：預設表、Serial-0/spawn 通過；清理規則/交易有疑點；**hangar WearInfo 欄位順序是 live bug，登入 token 測試噪音需修**，裁定 **NO-GO**——account 4 cleanup 在這兩項修好前不可實跑（詳見高階處理段）。依 `docs/backlog.md` P1b 契約執行（操作者已核准修這個問題），四項工作都在 worktree `~/mro-wt/p1b`（分支 `flash-wip-p1b`）完成，未合併、未重啟伺服器。

## 背景

上一輪分析（🟡）發現 `createAccount()`（`database/db.js` 原 406–455 行 `starterLoadouts`）把每台機體的 DefaultSetList 全部當成真的 `items`/`item_equips` 列發放，導致玩家背包裡同一件裝備（例如 `41100101` 助推器）出現在好幾台機的清單上——因為客戶端庫存介面本來就會列出每台相容機體上「每一份擁有的副本」。但客戶端自己在 Cache Table 4 DefaultSetList 已經會合成一筆 `SerialIndex=0` 的「預設」項目（`ZPanel_InvenItems.uc:338-383`），`Slot_Change_CQ` 送 `serial=0` 就是「穿預設」。`room-game-user.sender.js` 的 `Game_User_SN` 也已經對沒有裝備列的部位落回 `CANONICAL_LOADOUTS`。

## 做了什麼

1. **修 mech4/5 起始助推器 bug**（`61ddd39`，預設開）：`starterLoadouts` 原本給 4 號（NB01m）發 `41100101`、5 號（TB01m）發 `41200101`，但 ✅ Table 4 dump（`docs/journal/2026-09-16-33-weapon-model-true-root-cause-verified.md`）與 `CANONICAL_LOADOUTS` 都說這兩台的 Booster=0。刪掉這兩筆起始列。這是資料正確性修正，有 ✅ 日誌背書，維持預設開。`replay-golden`（不帶 `--record`）全綠。

2. **新開關 `P1B_NO_DEFAULT_ITEMS`**（`867e994`，預設 `disabled`）：開啟後 `createAccount()` 整段 `starterLoadouts` 插入迴圈直接跳過，帳號的六個部位全部留空。

   查證 WearInfo_SN 空部位的欄位：`account.dispatch.js`／`gamelogin.dispatch.js` 兩條登入路徑（✅ 已修正過的正確順序，見 `docs/journal/2026-09-16-27-wearinfo-slot-key-misalignment-fixed.md`）對沒有裝備列的部位都用 `mechSlots` 預設值 `{uniqueKey:0, itemIndex:0}`，兩個欄位都寫 0——也就是 `[itemCode=0, serial=0]`。`Slot_Change_CQ` 送 serial 0 的行為早就是對的：`saveEquippedLoadout()`（`ITEM_EQUIPS_MODE` 開啟時）先整台機清空 `item_equips`，只對非零 serial 重新插入，等於「serial=0 的部位不會被重建」，不需要另外修。

   ⚠ 附帶發現（未修，跟既有 ✅ 矛盾，留給高階判斷）：`dispatch/room.dispatch.js` 的 `sendHangarWearInfo()`（機庫互動用的第二條 WearInfo 寄送路徑）把 `[uniqueKey, itemIndex]` 的順序寫反了——`uniqueKey` 先寫在 `offset+4+s*8`、`itemIndex` 寫在 `+4+s*8+4`，跟上面那份 ✅ 日誌記載的 DLL 位置（`rec+0x08` 才是 key）相反，也跟 `account.dispatch.js`/`gamelogin.dispatch.js` 兩份「已修正」的順序不一致。對空部位（兩欄都是 0）沒有實際影響，所以沒有擋到這次的開關測試，但機庫互動時非空部位可能又是「拿 item code 查實例表，槽位全空」的舊 bug。沒有動這段程式碼，也沒有查是不是本來就是 `sendHangarWearInfo()` 自己的獨立問題還是 E1 之後漏改。

3. **清理工具 `tools/p1b-remove-default-items.js`**（`7f94cf6`）：把 `room-game-user.sender.js` 的 `CANONICAL_LOADOUTS` 搬到 `database/default-loadouts.js`（純搬遷，值與行為不變），清理腳本用同一份表判斷「這筆 `item_equips` 是不是預設」。規則：`(mech_slot, part_slot, items.item_id)` 等於該機預設值的 `item_equips` 列一律刪；序號的 `items` 列只在「至少一筆被刪、且刪完後沒有剩下任何 `item_equips` 列」時才刪——買來沒裝的多餘副本、或在別的機上非預設裝著的序號都留著。`ALLOW_REAL_DB_WRITE=1`+`P1B_BACKUP_CONFIRMED=1` 才能真的寫，`--dry-run` 純 `SELECT`。

4. **測試**（`560f460`）：`test/p1b-default-items.js`，全用記憶體 mock pool（跟 `test/item-equips.js` 同技法），沒有碰真的 DB：
   - 開關開＋`createAccount()`：新帳號 0 件裝備。
   - 清理腳本：對照組（帳號4）body/main/left/booster 四筆預設列全刪，對應序號一起刪；多買一份沒裝的助推器副本留著；同一序號在 mech1 是預設、在 mech6 非預設同時裝著，只刪 mech1 那筆 `item_equips`，序號留著。
   - 重跑清理腳本是 no-op。
   - `--dry-run` 不寫入。
   - `saveEquippedLoadout()` 對單一部位送 serial 0，只清那個部位的 `item_equips`，其餘部位／擁有權不受影響，不丟例外。

   `node test/replay-golden.js`（不帶 `--record`）與全部 22 個 `test/*.js`（含新檔）在 worktree 裡全綠。

## 真的資料庫上的 SELECT-only 乾跑數字（帳號 4 `test`）

透過 symlink `database/config.json`（比照 `~/mro-wt/test` 既有做法）直接呼叫 `runCleanup(db.pool, { accountIds: [4], dryRun: true })`——這條路徑在 `dryRun` 時完全不開 transaction、只送 `SELECT`，沒有寫入：

```
[P1B cleanup] account=4: 30 default item_equips row(s) matched, 26 serial(s) to delete (dry-run, no writes)
```

30 筆 `item_equips` 命中預設、26 個 `items` 序號會被刪（4 筆命中的序號在扣掉這次要刪的列之後仍有其他 `item_equips` 列，所以留著）。序號清單見這次呼叫的完整輸出（本檔只記數字，原始列表在對話紀錄裡，需要時可重新跑 `--dry-run` 復現，不需要另存檔案）。

## 沒做完／待高階決定

- `sendHangarWearInfo()` 的 `[uniqueKey, itemIndex]` 順序跟 DLL 已確認的順序不一致（見上），沒有修，需要高階判斷是否是既有問題、要不要開新契約。
- 開關與清理腳本都還沒在真實伺服器上開過／跑過寫入，只有 `--dry-run` 對帳號 4 跑過。
- 沒有實機驗證（沒有連過客戶端）。

## 追加（2026-09-19，HANGAR-WEARINFO-ORDER，🟡 待審）

依 Sol batch5 review（`docs/research/2026-09-19-sol-review/batch5.md` 第 4、5 點）修了上面留的兩個待決問題，在 worktree `~/mro-wt/hangarwear`（分支 `flash-wip-hangarwear`）：

1. `dispatch/room.dispatch.js` 的 `sendHangarWearInfo()`（`~1105-1112`）把寫入順序從 `[uniqueKey, itemIndex]` 改成 `[itemIndex, uniqueKey]`，跟 `account.dispatch.js`／`gamelogin.dispatch.js` 一致，也跟 DLL `WearInfo_SN` `0x107c4877`/`0x107c4a13` 一致。同步改了 `test/item-equips.js` 的 `readSlot()`（原本把錯的順序當預期，現在加註解說明）。
2. `test/login-token.js` 的 fake DB 補了 `getItemsWithEquipViews()`（回傳空陣列，跟既有 `getItems()` 同形狀），並在 `main()` 加了 `console.error` spy，任何含 `DB Error` 的訊息都會讓測試 fail（原本只是印出來、被 `gamelogin.dispatch.js:435-436` 的 catch 吞掉，測試仍 exit 0）。手動移除 mock 驗證過新的斷言真的會抓到（4 筆 swallowed DB Error，測試變 red），復原後綠燈。

**`test/replay-golden.js`（不帶 `--record`）出現差異，沒有重錄：** `login-room-shop-buy` 與 `pve-full-match` 兩個 golden sample 在 `op=0x00210113`（`SN_WEAR_INFO`）都在 byte offset `0x12` 不一致：
```
expected .. 0100000001000000a18601006a090000 ..
got      .. 01000000010000006a090000a1860100 ..
```
這正是機庫路徑欄位順序對調後預期會變的封包，其餘 golden sample（`login-dispatch`、`login-room-game`）不受影響。是否重錄兩份 baseline 留給高階決定。

其餘 `test/*.js` 全綠（`test/extract-golden.js` exit 1 是缺 CLI 參數的既有行為，不是測試失敗）。
