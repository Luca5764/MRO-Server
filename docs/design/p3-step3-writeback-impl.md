# P3 step 3：對局結果寫回 DB — 實作（中階，🟡 待審，未經跨公司審查）

> 只實作、只跑過測試（fake pool／fake db，全部沒有連真的 MySQL），**沒有對真實資料庫跑過
> migration，沒有部署，所有開關預設關閉**。跟 `docs/design/p3-step1-writeback.md`（step 1 設計稿，
> 高階已審過一輪）比對；本文件記錄實際實作跟設計稿哪裡一致、哪裡因為設計稿本身沒定案而由本次
> 實作做了選擇，全部列在第 6 節給 Sol／高階審。

## 0. 檔案清單

| 檔案 | 角色 |
|---|---|
| `tools/migrate-p3-match-tables.js`（新增） | 建 `matches`／`match_rounds`／`match_participants` 三張表；**沒有跑過**，只有 fake pool 測試 |
| `database/db.js`（新函式） | `recordMatch()`、`applyMatchAccumulation()`；不改任何既有函式或 schema |
| `dispatch/room/match-stats.js`（沿用 step 2 的模組，本次加 `MATCH_WRITEBACK_MODE`） | 從 `emitMatchSummary()` 觸發 fire-and-forget 寫回；`EXP_PER_KILL`/`POINT_PER_KILL` 從 `lobby.dispatch.js` 搬過來，單一來源 |
| `dispatch/lobby.dispatch.js`（呼叫端，一行改動） | `Death_CN` 的 exp/point 常數改讀 `matchStats.EXP_PER_KILL`/`POINT_PER_KILL`，數值不變（10/10） |
| `test/p3-match-tables-migration.js` | migration 對 fake pool：全新建立、冪等重跑、部分已建、`--dry-run` |
| `test/match-writeback.js` | `match-stats.js` 的寫回流程，`db.recordMatch`/`db.applyMatchAccumulation` 整個換成 spy（不管 SQL） |
| `test/p3-db-recordmatch.js` | `db.js` 兩個新函式本身的 SQL 文字／參數／transaction／rollback，對 fake pool |

四個 commit（migration / db.js / match-stats+lobby / tests）都在 `p3-step3` 分支上，各自獨立。

## 1. Migration：`tools/migrate-p3-match-tables.js`

### 1.1 SQL（跟設計稿 §3 比對，已套用高階審查更正）

```sql
CREATE TABLE IF NOT EXISTS `matches` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `room_id`         INT UNSIGNED    NULL,
    `map_id`          INT UNSIGNED    NOT NULL,
    `difficulty`      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `round_target`    TINYINT UNSIGNED NOT NULL,
    `host_account_id` INT UNSIGNED    NULL,
    `started_at`      DATETIME        NOT NULL,
    `ended_at`        DATETIME        NULL,
    `result`          TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `win_team_rank`   TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `is_test`         TINYINT(1)      NOT NULL DEFAULT 0,
    `suspicious`      TINYINT(1)      NOT NULL DEFAULT 0,
    FOREIGN KEY (`host_account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `match_rounds` (
    `match_id`         BIGINT UNSIGNED NOT NULL,
    `round_number`     TINYINT UNSIGNED NOT NULL,
    `started_at`       DATETIME        NOT NULL,
    `duration_seconds` INT UNSIGNED    NOT NULL DEFAULT 0,
    `death_cn_count`   INT UNSIGNED    NOT NULL DEFAULT 0,
    `suspicious`       TINYINT(1)      NOT NULL DEFAULT 0,
    PRIMARY KEY (`match_id`, `round_number`),
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `match_participants` (
    `match_id`     BIGINT UNSIGNED NOT NULL,
    `account_id`   INT UNSIGNED    NOT NULL,
    `team`         TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `kills`        INT UNSIGNED    NOT NULL DEFAULT 0,
    `deaths`       INT UNSIGNED    NOT NULL DEFAULT 0,
    `exp_gained`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `point_gained` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `result`       TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`match_id`, `account_id`),
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

套用的更正（高階審查 2026-09-20，設計稿 §6 review point 5）：`started_at`/`ended_at` 用
`DATETIME` 不是 `TIMESTAMP`；`matches.host_account_id` 允許 NULL、`ON DELETE SET NULL`。
`is_test`／`suspicious` 兩表都留（設計稿原樣）。`room_id` 沒有 FK——grep 過
`metalrageserver.sql`，**整個 schema 沒有 `rooms` 表**（房間是純記憶體物件，`rooms.js`），
跟設計稿本來就沒替 `room_id` 設 FK 一致，不是遺漏。

`match_participants.account_id` 的 FK 維持 `ON DELETE CASCADE`（不是
`ON DELETE SET NULL`）——這跟 `matches.host_account_id` 的更正方向看起來不一致，但原因是
`account_id` 是 `match_participants` 複合主鍵的一部分，MySQL 的 PK 欄位不能是 NULL，所以
`SET NULL` 在這裡技術上不成立；`CASCADE` 在這裡的意思只是「這個人自己的那筆參戰紀錄跟著帳號
一起消失」，波及範圍比 `matches.host_account_id` 原本的 `CASCADE`（整場紀錄，包含其他玩家的
參戰紀錄）小很多。這是本次實作做的判斷，**沒有明確的審查依據**，列進第 6 節。

### 1.2 冪等性／環境變數／`--dry-run`

- 三張表都是新表，**沒有舊資料要搬**（grep 過，沒有任何既有表格是這三張表的前身），所以「冪等」
  在這裡等於「`CREATE TABLE IF NOT EXISTS`，重跑不會出錯，也不會做任何事」——跟
  `tools/migrate-e1-item-equips.js` 那種「要搬資料、要防止重複插入」的冪等不是同一類問題，比較
  簡單。
- 沿用 `tools/migrate-e1-item-equips.js`／`tools/merge-e1-shared-duplicates.js` 的環境變數
  防呆：`ALLOW_REAL_DB_WRITE=1` + `P3_BACKUP_CONFIRMED=1`（新變數名稱，跟 E1 的
  `E1_BACKUP_CONFIRMED` 同一個機制，不共用同一個變數，避免「E1 已經備份過」被誤認成「P3 也
  備份過」）。
- `--dry-run`：只查 `information_schema.TABLES`，印出哪些表已存在、哪些會被建立，**完全不送
  `CREATE TABLE`**。跟 `tools/merge-e1-shared-duplicates.js` 的既有慣例一樣，`--dry-run` 仍然
  要求兩個環境變數都設好（因為還是要開一個真的連線去讀 `information_schema`）——這點列進第 6
  節，因為嚴格來說 `--dry-run` 本身不寫東西，要求備份確認是不是太保守，留給 Sol 判斷要不要放寬。
- 沒有 `--force`：三張表的建立沒有任何會衝突的情境（`IF NOT EXISTS` 已經是最終防線），跟 E1
  migration 需要 `--force` 才能重跑（因為那個腳本會插入資料列）不同。

### 1.3 測試涵蓋（`test/p3-match-tables-migration.js`，fake pool，4 案例）

全新建立（三張依序建立，`matches` 先建）／冪等重跑（第二次不建立任何東西）／部分已建（只建缺的
那幾張）／`--dry-run`（完全不呼叫 `CREATE TABLE`，fake pool 若被呼叫會直接丟錯）。

## 2. `database/db.js`：`recordMatch()` / `applyMatchAccumulation()`

兩個新函式，**不改任何既有函式、不改 schema**。

### 2.1 `recordMatch(match, rounds, participants)`

一個 transaction：`INSERT INTO matches`（1 筆）→ 迴圈 `INSERT INTO match_rounds`（N 筆）→
迴圈 `INSERT INTO match_participants`（N 筆）→ commit；任何一步丟錯就 rollback 整個
transaction 再往外拋。回傳 `matches.id`（`result.insertId`）。

```sql
INSERT INTO matches
    (room_id, map_id, difficulty, round_target, host_account_id,
     started_at, ended_at, result, win_team_rank, is_test, suspicious)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

INSERT INTO match_rounds
    (match_id, round_number, started_at, duration_seconds, death_cn_count, suspicious)
VALUES (?, ?, ?, ?, ?, ?)

INSERT INTO match_participants
    (match_id, account_id, team, kills, deaths, exp_gained, point_gained, result)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

`started_at`/`ended_at` 用 `new Date(ms)` 直接綁進去（mysql2 對 DATETIME 欄位支援原生 JS
`Date`，用連線 session 的時區轉換），沒有自己手刻格式化字串——**這是本次實作的選擇，沒有跟任何
既有程式碼的慣例比對過**（`completeTutorial()`／`updateLastLogin()` 用的是 SQL `NOW()`，不是
綁參數的 `Date`），列進第 6 節。

### 2.2 `applyMatchAccumulation(accountId, delta)`

一個 transaction：永遠 `UPDATE records SET exp = exp + ?, wins = wins + ?, losses = losses + ?,
draws = draws + ?, kills = kills + ?, deaths = deaths + ? WHERE account_id = ?`；只有
`delta.mechType`（1..8）有給值時才另外 `UPDATE mech_levels SET exp = exp + ?, kills = kills + ?,
deaths = deaths + ?, sorties = sorties + ? WHERE account_id = ? AND mech_type = ?`。兩句都是
`col = col + ?`，**沒有任何一句是覆寫**（符合設計稿 §2.2 point 3 的要求）。

### 2.3 測試涵蓋（`test/p3-db-recordmatch.js`，fake pool，直接檢查 SQL 文字與參數順序）

`recordMatch()` 的插入順序與 transaction／rollback（強制第 2 個 round 插入失敗，證明整個
transaction 回滾、`match_participants` 迴圈完全沒跑到）；`applyMatchAccumulation()` 的
`records` 永遠累加、`mech_levels` 只在給 `mechType` 時才動。

## 3. `dispatch/room/match-stats.js`：`MATCH_WRITEBACK_MODE`

### 3.1 開關

`MATCH_WRITEBACK_MODE`（`'disabled'`/`'enabled'`，預設 `'disabled'`），跟 `MATCH_STATS_MODE`
（step 2）是**兩個獨立開關**：`MATCH_STATS_MODE` 單獨開著＝只在記憶體累計＋寫
`MATCH-SUMMARY`/`MATCH-ABORTED` log，完全不碰 DB；只有兩個開關都開，`emitMatchSummary()`
最後才會排入 DB 寫回。這樣「先驗證回合計時，再驗證 DB 寫回」可以分兩晚跑（跟 AUTO 段落
Pico 夜跑排序一致）。

### 3.2 觸發點與 fire-and-forget

`emitMatchSummary()`（`EndGame_SN` 送出後才會被呼叫，見 `lobby.dispatch.js:539`）在送出
`MATCH-SUMMARY` marker**之後**呼叫 `scheduleMatchWriteback()`。這個函式本身是同步函式，內部
包一個 `(async () => {...})()` IIFE、**不 `await`、不回傳 Promise**——呼叫端（`dispatch()`）
早就跑完了，DB 寫入是純粹的背景工作，不可能拖慢或擋住封包路徑。IIFE 內部整段包在
`try/catch`：成功印 `MATCH-WRITEBACK-OK` marker，失敗印 `MATCH-WRITEBACK-FAILED` marker +
`console.error`，**兩種結果都不會有任何例外傳回呼叫端**（`test/match-writeback.js` 的
`testDbErrorIsLoggedAndSwallowed` 直接用 `assert.doesNotThrow` 證明 `emitMatchSummary()` 本身
的同步呼叫不拋錯）。

中斷的場（`emitMatchAborted()`）**完全不會走到 `scheduleMatchWriteback()`**——這個函式只在
`emitMatchSummary()` 裡被呼叫一次，`emitMatchAborted()` 裡沒有任何對它的呼叫，`
ABORTED_MATCHES_ARE_NOT_PERSISTED` 因此是「這樣寫就自動成立」，不是額外的 if 判斷（操作者
2026-09-20 裁定，見 `p3-step1-writeback.md` 文末）。

### 3.3 兩個 DB 呼叫不是同一個 transaction

`scheduleMatchWriteback()` 依序 `await db.recordMatch(...)`，成功後**逐一** `await
db.applyMatchAccumulation(accountId, delta)`（每個 participant 各自一次呼叫，各自一個
transaction）。這代表：如果 `recordMatch` 失敗，完全不會有累加更新（`test/match-writeback.js`
的 `testDbErrorIsLoggedAndSwallowed` 證明了這點）；但如果 `recordMatch` 成功、累加迴圈跑到一半
才失敗（例如第 2 個玩家的 `applyMatchAccumulation` 丟錯），**`matches`/`match_rounds`/
`match_participants` 已經寫進去了，但只有第 1 個玩家的 `records`/`mech_levels` 被更新**——這是
一個已知、沒有解決的落差，列進第 6 節第一條，请 Sol 判斷要不要用單一 transaction 包起來（技術上
可行：`recordMatch`/`applyMatchAccumulation` 目前各自 `pool.getConnection()`，改成接受一個外部
傳入的 `conn` 就能合併，但這次沒有做這個改動，因為契約要求「兩個函式」分開、且要避免同時改太多
東西）。

### 3.4 `EXP_PER_KILL`/`POINT_PER_KILL` 搬家

`lobby.dispatch.js` 的 `Death_CN` handler（S1，`journal/2026-09-17-21-battle-score-totals.md`）
本來自己宣告 `const EXP_PER_KILL = 10; const POINT_PER_KILL = 10;`。這次把它搬進
`match-stats.js`（因為 DB 寫回的 `exp_gained`/`point_gained`/`records.exp` 也需要同一個數字），
`lobby.dispatch.js` 改成讀 `matchStats.EXP_PER_KILL`/`matchStats.POINT_PER_KILL`。**數值完全
沒變（還是 10/10）**，`node test/*.js` 全綠、`test/replay-golden.js` 的 8384 封包樣本也逐位元組
相同，證明這個搬動是 byte-identical 的重構，不是行為改動。**這兩個數字本身仍然是設計稿 §4 標記
的「沒找到台版數字」佔位值**，不是本次實作新確認的原廠數據。

### 3.5 `matches`/`match_participants` 欄位怎麼填（本次實作的選擇，列進第 6 節）

- `win_team_rank`：永遠 0。`lobby.dispatch.js` 的 `pveFixedRank` 沒有傳進
  `emitMatchSummary()`——這次沒有把它接起來（會多動一個檔案的一段邏輯，超出契約給的「call site」
  範圍的最小改動精神），留給下一步。
- `suspicious`（`matches`/`match_rounds`都）：永遠 `false`。P7 的門檻邏輯還沒做，`backlog.md`
  AUTO 段落本來就只要求「先留欄位」，本次沒有實作任何判定。
- `is_test`：沿用 step 2 既有的「host 或任一 participant 是測試帳號，整場就是 `is_test=1`」，
  **不會因為 `is_test=1` 就跳過寫入**——`matches`/`match_rounds`/`match_participants` 照樣寫，
  `records`/`mech_levels` 照樣累加。理由：`is_test` 欄位存在的目的（`backlog.md` AUTO 段落「比賽
  紀錄要帶測試標記，避免污染戰績」）讀起來像是「讓之後的排行榜/戰績查詢可以用這個欄位過濾掉」，
  不是「乾脆不寫」。但**這個判斷本身沒有被操作者或高階明確確認過**，是本次實作的解讀，列進第 6
  節。
- `mech_levels` 累加用哪個 `mech_type`：讀 `member.client.currentHangarSlot_`（跟
  `gate.game.dispatch.js` 既有的 `selectedMech` 欄位同一個來源），沒有的話（`undefined`）整個
  跳過那個帳號的 `mech_levels` 更新（`records` 還是照樣更新）——不是猜一個預設值。
- `team`：直接讀 `member.team || 0`。PvE 目前所有真人玩家事實上都是同一隊打 AI，`result`
  （win/loss）因此**每個 participant 都跟整場 `result` 相同**，沒有「隊伍互相對抗、各自輸贏」
  的概念——這是 PvE-only 的簡化，PvP 若要用這幾張表需要重新設計 `result` 怎麼算。

## 4. 測試總表

| 檔案 | 對象 | 涵蓋 |
|---|---|---|
| `test/p3-match-tables-migration.js` | migration，fake pool | 全新建立、冪等重跑、部分已建、`--dry-run` |
| `test/p3-db-recordmatch.js` | `db.js` 的兩個新函式，fake pool，檢查 SQL 文字/參數 | INSERT 順序、transaction/rollback、`records`/`mech_levels` 累加寫法 |
| `test/match-writeback.js` | `match-stats.js` 的寫回流程，`db.recordMatch`/`applyMatchAccumulation` 整個 mock 掉 | switch off（沒有任何 DB 呼叫，`MATCH-SUMMARY` 不受影響）、完整一場（matches/rounds/participants 欄位、累加算式）、中斷的場不寫、DB 失敗只記 log 不拋錯 |

跑過的指令與結果：

```
node test/*.js        # 逐一執行 35 個檔案，全部 exit 0（見下方「怎麼驗證」）
node test/replay-golden.js   # ALL SAMPLES PASS，8384 封包的 PvE 整場樣本逐位元組相同
```

兩個開關預設都是 `'disabled'`，所以以上測試證明的是「這次改動對現有行為零影響」，不是「DB 寫回
本身在真實 DB 上跑起來沒問題」——後者完全沒有被驗證過（見第 6 節）。

## 5. 跟設計稿的對照

| 設計稿 §2.3 建議拆分 | 本次實作 |
|---|---|
| 回合計時、DB 寫回、封包回送可以分開驗證 | 回合計時＝step 2（`MATCH_STATS_MODE`，已合併）；DB 寫回＝本次（`MATCH_WRITEBACK_MODE`）；封包回送（`Reward_Record_User_SN`）＝**沒有做**，留給下一步 |
| §2.2 point 4「回到房間送 `Reward_Record_User_SN`」 | 沒做。本次只做到「DB 有正確的一筆」，客戶端看不看得到要等下一步 |
| §2.2 point 5「升級提示 `Reward_Levelup_User_SN`」 | 沒做，同上 |
| §6 review point 7「實作順序：1. 修 9211 builder 2. Room 層統計 3. migration+寫回 4. Reward_Record_User_SN」 | 步驟 1（9211 builder 舊佈局）**沒有動**——這是既有缺口，本次契約範圍明確限定在 migration/db.js/match-stats.js/tests，沒有觸碰 `account.dispatch.js`。步驟 2 已經是 step 2。步驟 3 是本次。步驟 4 待下一步 |

## 6. 待審／待決定問題（給 Sol／高階）

1. **`recordMatch()` 跟每個 `applyMatchAccumulation()` 不是同一個 transaction**（§3.3）：
   `recordMatch` 成功、累加迴圈中途失敗，會留下「有比賽紀錄，但戰績只更新了一部分玩家」的不一致
   狀態。目前的處理是整個 `scheduleMatchWriteback` 失敗時只記 log（`MATCH-WRITEBACK-FAILED`），
   不會重試、不會回滾已經寫進去的 `matches`/`match_rounds`/`match_participants`。**需要 Sol／
   操作者決定**：接受這個落差（機率低、影響僅限資料一致性，不影響封包路徑），還是要求改成單一
   transaction（技術可行，但會改動 `recordMatch`/`applyMatchAccumulation` 的簽章，讓它們可以
   共用一個外部傳入的 connection）。
2. **`--dry-run` 仍然要求 `ALLOW_REAL_DB_WRITE`/`P3_BACKUP_CONFIRMED`**（§1.2）：沿用
   `merge-e1-shared-duplicates.js` 的既有慣例，但嚴格說 `--dry-run` 不寫任何東西，要求備份確認
   可能過度保守。維持現狀等 Sol 表態要不要放寬。
3. **`is_test` 不影響是否寫入**（§3.5）：`matches`/`records`/`mech_levels` 對測試帳號照樣寫入
   累加，只是打上 `is_test=1` 供之後查詢過濾。這是本次實作的解讀，**沒有操作者或高階的明確確認**
   ——如果原意其實是「is_test 的場完全不要動 `records`/`mech_levels`」，這裡要改。
4. **`match_participants.account_id` 的 FK 維持 `ON DELETE CASCADE`**（§1.1），跟
   `matches.host_account_id` 改成 `ON DELETE SET NULL` 方向不一致——原因是複合主鍵欄位不能為
   NULL（技術限制，非選擇），但這個推論沒有被覆核過。
5. **`started_at`/`ended_at` 用 mysql2 原生 `Date` binding，不是 `NOW()` 或手刻字串**（§2.1）：
   跟 `completeTutorial()`/`updateLastLogin()` 用 `NOW()` 的既有慣例不同（那两個函式沒有
   ms-精度的「這件事發生在客戶端回報的哪個時間點」需求，`recordMatch()` 有），時區行為依賴 mysql2
   /MySQL session 的預設設定，**沒有特別驗證過落地後的實際時區是否符合預期**（只驗證了「有綁一個
   `Date` 物件」，見 `test/p3-db-recordmatch.js`）。
6. **`win_team_rank` 永遠 0、`suspicious` 永遠 `false`**（§3.5）：都是設計稿本來就承認的
   「先留欄位」，本次沒有實作對應邏輯，純粹是欄位存在但恆為預設值。
7. **沒有真的連過 MySQL**：所有測試都是 fake pool／spy，`tools/migrate-p3-match-tables.js`
   的 SQL、`db.js` 兩個函式的 SQL，都只驗證過「文字/參數/呼叫順序符合預期」，**沒有驗證過在真的
   MySQL 8（`metalrageserver.sql` 建出來的那個 schema）上實際執行會不會因為某個語法/型別問題失敗
   **（例如 `BIGINT UNSIGNED` 跟 mysql2 回傳型別的相容性、FK 建立順序在真實 `mro` 資料庫上是否
   跟 fake pool 假設的一致）。這是 Sol 審查／下一步在測試環境跑 `--dry-run` 時要抓的第一件事。

## 7. 怎麼驗證的（本次實作跑過的指令）

```
node --check "Metal Rage Online Server/dispatch/room/match-stats.js"
node --check "Metal Rage Online Server/dispatch/lobby.dispatch.js"
node --check "Metal Rage Online Server/database/db.js"
node --check "Metal Rage Online Server/tools/migrate-p3-match-tables.js"

cd "Metal Rage Online Server"
for f in test/*.js; do node "$f"; done   # 35 個檔案（不含 extract-golden.js，那不是測試）全部 exit 0
node test/replay-golden.js               # ALL SAMPLES PASS
```

沒有跑過、也不准跑的：`tools/migrate-p3-match-tables.js` 對真實 DB（沒有設
`ALLOW_REAL_DB_WRITE`/`P3_BACKUP_CONFIRMED`，程式本身會拒絕）；`tools/win/drive.sh`；任何
啟動/重啟伺服器的操作。
