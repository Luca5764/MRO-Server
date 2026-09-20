# SOL-REVIEW-8：P3 Step 2／3 修正複審

範圍：`p3-step12` `bb05357..13e6a01`、`p3-step3` `d933438..3c009bb`，並對照上一輪 `p3.md` 與設計稿 §8。

## 修正逐項裁定

1. **通過 — participant 開場快照。** `match-stats.js:112-175` 在 `startMatch()` 複製當下所有 `room.members` 的 team／mech／is_test，之後 summary 只走 `participantsMeta`（`:286-331`），離場者不再遺失；Death_CN 第一次歸屬中途加入者時由 `ensureParticipantMeta()` 補登（`:231-244`）。`test/match-stats.js:319-382` 覆蓋「先死亡、再離場、結算仍存在」；尚無獨立 mid-join 測試，但實作分支直接且符合契約。

2. **通過 — host 戰鬥中離開的 MATCH-ABORTED。** `gate.game.dispatch.js:1927-1950` 在 `handleBattleLeave()` 前保存 host 身分，且只在該函式確實處理、原本是 host 時呼叫 `emitMatchAborted(..., 'host-left-battle')`；非 host 不會誤中。`test/match-stats.js:439-508` 驗證一個 abort、零 summary。

3. **通過 — 單一交易邊界。** `db.js:726-747` 取得一次 connection，依序在同一個 `BEGIN` 內寫 matches／rounds／participants，再做所有 participant UPDATE，最後才一次 `COMMIT`；任一步丟錯統一 `ROLLBACK`。呼叫端也只呼叫一次 `recordMatchWithAccumulation()`（`match-stats.js:431-447`），原本逐玩家獨立交易的部分成功窗口已消失。

4. **通過（測試證據需限縮）— affectedRows 與 rollback 控制流。** `db.js:649-687` 對 records 與有 mechType 的 mech_levels 都要求 `affectedRows === 1`，否則拋錯進同一交易的 rollback。`test/p3-db-recordmatch.js:213-267` 證明先前 INSERT、第一位 UPDATE 都已送出，最後呼叫為 `ROLLBACK` 且沒有 `COMMIT`；本次重跑通過。惟 fake connection 沒有資料狀態，故它只證明控制流，**不能證明資料真的恢復**；仍須在 disposable MySQL 強制後段失敗後 SELECT 驗證三表與 records／mech_levels 全部未變。

5. **通過 — timezone 固定。** pool 的 `timezone: 'Z'` 位於 config spread 之後，不能被機器設定覆寫（`db.js:60-81`）；P3 綁定的 JS Date 因而固定以 UTC 轉成 DATETIME。真 MySQL round-trip 尚未驗證，列入上線閘門。

6. **通過 — `--dry-run` 不要求寫入環境變數。** `migrate-p3-match-tables.js:163-167,205-217,220-235` 的 dry-run 只查 `information_schema.TABLES`，在 require DB／連線前已略過寫入 gate；非 dry-run 仍同時要求兩個環境變數。對應測試 `test/p3-match-tables-migration.js:128-163` 本次通過。

7. **通過 — participant `SET NULL`／代理主鍵。** DDL `migrate-p3-match-tables.js:98-113` 的 `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`、nullable `account_id`、`UNIQUE(match_id, account_id)` 與 `ON DELETE SET NULL` 語法及型別一致；INSERT 不提供 id，會正常自增（`db.js:623-640`）。MySQL nullable UNIQUE 允許同場多筆帳號刪除後的 NULL 列，因此不會因刪第二個帳號而失敗。新代價是刪帳後無法識別原參與者；若稽核需要人名，另加不可變 nickname snapshot，但不是本裁定的完整性阻擋項。

## 仍需修改／未完成的上一輪閘門

- **仍需修改 — migration 不驗證既有表結構。** `readTableState()` 只查表名（`migrate-p3-match-tables.js:123-136`），`:174-180` 見同名表即跳過；舊版／殘缺表仍會被誤報成功，建立後也未驗欄位、index、FK。應以 `information_schema.COLUMNS/STATISTICS/REFERENTIAL_CONSTRAINTS` 做 post-check 並 fail loudly。fake migration test也沒有斷言新的 surrogate PK／SET NULL DDL。
- **仍需完成 — 真 MySQL 驗證。** 新 DDL、nullable FK、UTC DATETIME round-trip 與實際 rollback 都仍只經 fake pool；不可把目前測試稱為已實證整批資料回滾。

## `point_gained` 建議

**仍需修改後才啟用。** `match-stats.js:325-326` 以未確認的 `10 × kills` 寫非零 `point_gained`，但 `db.js:649-687` 完全不更新 `accounts.point`，欄名因而與實際可花餘額矛盾。建議把 `point_gained` 定義為「實際入帳點數」：目前先寫 0；待操作者裁定公式後，在同一個 `recordMatchWithAccumulation()` transaction 加 `UPDATE accounts SET point = point + ?` 與 `affectedRows === 1`，並讓 participant 欄位記同一 delta。若確實只想存估算值，應在 migration 前改名為 `point_calculated`，不要使用 `gained`。

## GO / NO-GO

**合併預設關閉的修正：GO。執行 migration 或啟用 MATCH_WRITEBACK_MODE：NO-GO。** 先補 schema post-check、disposable MySQL 的 DDL／UTC／真 rollback integration test，並裁定及修正 `point_gained` 語意。定向 DB／migration 測試本次通過；兩個 marker 測試因唯讀 worktree 建立 `logs/session-*.jsonl` 時 EROFS，未取得獨立完整跑完結果。
