# P3 step 3：對局結果寫回 DB — 實作（中階，🟡 待審，未經跨公司審查）

> 只實作、只跑過測試（fake pool／fake db，全部沒有連真的 MySQL），**沒有對真實資料庫跑過
> migration，沒有部署，所有開關預設關閉**。跟 `docs/design/p3-step1-writeback.md`（step 1 設計稿，
> 高階已審過一輪）比對；本文件記錄實際實作跟設計稿哪裡一致、哪裡因為設計稿本身沒定案而由本次
> 實作做了選擇，全部列在第 6 節給 Sol／高階審。
>
> **2026-09-20 更新（SOL-REVIEW-6 修正批次）：** 這份文件原本描述的實作已經照
> `docs/research/2026-09-20-sol-review/p3.md` 的「需修改」項目改過（單一 transaction、
> affectedRows 檢查、timezone、`--dry-run` 放寬、`match_participants.account_id` 改
> `ON DELETE SET NULL`）。第 1／2／3 節內文已同步更新成修正後的樣子；第 6 節保留原始的
> 待審清單，新加「已回應」標記指向對應的修正。第 8 節是這批修正的摘要，**仍然是中階實作，未經
> 跨公司審查**。

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
    `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `match_id`     BIGINT UNSIGNED NOT NULL,
    `account_id`   INT UNSIGNED    NULL,
    `team`         TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `kills`        INT UNSIGNED    NOT NULL DEFAULT 0,
    `deaths`       INT UNSIGNED    NOT NULL DEFAULT 0,
    `exp_gained`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `point_gained` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `result`       TINYINT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY `uq_match_participants_match_account` (`match_id`, `account_id`),
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

套用的更正（高階審查 2026-09-20，設計稿 §6 review point 5）：`started_at`/`ended_at` 用
`DATETIME` 不是 `TIMESTAMP`；`matches.host_account_id` 允許 NULL、`ON DELETE SET NULL`。
`is_test`／`suspicious` 兩表都留（設計稿原樣）。`room_id` 沒有 FK——grep 過
`metalrageserver.sql`，**整個 schema 沒有 `rooms` 表**（房間是純記憶體物件，`rooms.js`），
跟設計稿本來就沒替 `room_id` 設 FK 一致，不是遺漏。

**已裁定（操作者 2026-09-20，經協調者轉達，解決 Sol batch6 review point 11／原第 6 節開放問題
4）：** `match_participants.account_id` 的 FK 從原本的 `ON DELETE CASCADE` 改成
`ON DELETE SET NULL`，跟 `matches.host_account_id` 同一個方向——理由：這是小社群，刪掉一個帳號
不能連帶抹掉「跟這個帳號同場玩過」的其他玩家的參戰紀錄。因為 `account_id` 現在允許 NULL，不能
再是複合主鍵的一部分（MySQL 的 PK 欄位不能是 NULL）；`match_participants` 因此改成 surrogate
`id`（`BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`），`(match_id, account_id)` 改成一般
`UNIQUE KEY`（MySQL 的 UNIQUE 索引把 NULL 視為互不相同，所以同一場裡有多筆 `account_id` 被
SET NULL 的歷史列不會撞 unique 限制）。`database/db.js` 的 `insertParticipantRows()`
INSERT 欄位清單不受影響（本來就沒有寫入 `id`，也沒有依賴舊的複合 PK）。**此項已解決，不再是
開放問題**——原本這裡討論的「刪帳號要不要留參戰列」已由操作者裁定，不需要再等審查；下一步（若有）
是決定要不要順便存一份帳號 nickname 快照，讓 `account_id=NULL` 的歷史列還能顯示是誰玩的——本次
沒有做，操作者也沒有要求。

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
  `CREATE TABLE`**。**已依 Sol batch6 review 放寬（docs/research/2026-09-20-sol-review/p3.md
  「疑點 -- --dry-run」／原第 6 節開放問題 2「可放寬」）：** 不再要求
  `ALLOW_REAL_DB_WRITE`/`P3_BACKUP_CONFIRMED` 兩個環境變數，改成 `checkEnvGuards(dryRun, env)`
  這個 pure function，`dryRun===true` 時直接放行；只有真正要送 `CREATE TABLE`（沒有
  `--dry-run`）才還是要求兩個環境變數都設好，跟原本一樣。**此項已解決，不再是開放問題**。
- 沒有 `--force`：三張表的建立沒有任何會衝突的情境（`IF NOT EXISTS` 已經是最終防線），跟 E1
  migration 需要 `--force` 才能重跑（因為那個腳本會插入資料列）不同。

### 1.3 測試涵蓋（`test/p3-match-tables-migration.js`，fake pool，4 案例）

全新建立（三張依序建立，`matches` 先建）／冪等重跑（第二次不建立任何東西）／部分已建（只建缺的
那幾張）／`--dry-run`（完全不呼叫 `CREATE TABLE`，fake pool 若被呼叫會直接丟錯）。

## 2. `database/db.js`：`recordMatchWithAccumulation()`

**已依 Sol batch6 review 修正（docs/research/2026-09-20-sol-review/p3.md 「需修改 --
整場寫回不是原子操作」／「需修改 -- UPDATE 靜默零列」，原第 6 節開放問題 1）：** 原本的
`recordMatch(match, rounds, participants)` 跟 `applyMatchAccumulation(accountId, delta)`
兩個各自開 transaction 的函式，已經合併成一個
`recordMatchWithAccumulation(match, rounds, participants, accumulations)`，內部用
`insertMatchRow`/`insertRoundRows`/`insertParticipantRows`/`insertAccumulation` 四個私有
helper（都吃同一個已開好的 `conn`）。**不改 schema。**

### 2.1 `recordMatchWithAccumulation(match, rounds, participants, accumulations)`

一個 transaction：`INSERT INTO matches`（1 筆）→ 迴圈 `INSERT INTO match_rounds`（N 筆）→
迴圈 `INSERT INTO match_participants`（N 筆）→ 迴圈對 `accumulations` 的每一筆呼叫
`insertAccumulation`（見 2.2）→ commit；任何一步丟錯（包含 `insertAccumulation` 內部的
affectedRows 檢查）就 rollback 整個 transaction 再往外拋。回傳 `matches.id`
（`result.insertId`）。`accumulations` 是跟 `participants` 分開傳入的陣列，不在函式內部從
`participants` 推導——呼叫端（`match-stats.js`）在 is_test 場傳空陣列，藏著「三表照寫、零次
累加」這個既有的 Lead decision。

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
`Date`）。**已依 Sol batch6 review 修正（「疑點 -- 時間欄位」，原第 6 節開放問題 5）：** pool
現在明確指定 mysql2 的 `timezone: 'Z'`（UTC）選項——這是 mysql2 client 端 JS `Date` ↔ SQL 字串
轉換的設定，不是 MySQL session 的 `SET time_zone`，也跟 `NOW()`/`CURRENT_TIMESTAMP`
（`completeTutorial()`／`updateLastLogin()` 用的）無關，那兩個函式仍然是 server-side 算的。
grep 過整個程式庫，除了本次新增的三張表以外，沒有任何地方把 TIMESTAMP/DATETIME 欄位讀回應用邏輯
（`accounts.created_at`/`last_login`、`tutorials.completed_at` 都只用 `NOW()` 寫，從來沒被
讀出來用過），所以這個 pool 層級的設定對現有行為沒有可觀察的影響。**仍然沒有對真的 MySQL 做
round-trip 驗證**（fake pool 只能證明「綁了一個 `Date` 物件、`timezone` 選項有設定」，不能證明
落地後的實際值），這部分留在第 6 節，等 disposable MySQL 環境。

### 2.2 `insertAccumulation(conn, accountId, delta)`（原 `applyMatchAccumulation`）

永遠 `UPDATE records SET exp = exp + ?, wins = wins + ?, losses = losses + ?,
draws = draws + ?, kills = kills + ?, deaths = deaths + ? WHERE account_id = ?`；只有
`delta.mechType`（1..8）有給值時才另外 `UPDATE mech_levels SET exp = exp + ?, kills = kills + ?,
deaths = deaths + ?, sorties = sorties + ? WHERE account_id = ? AND mech_type = ?`。兩句都是
`col = col + ?`，**沒有任何一句是覆寫**（符合設計稿 §2.2 point 3 的要求）。

**已依 Sol batch6 review 修正（「需修改 -- UPDATE 靜默零列」，原第 6 節開放問題未列出但審查有點
名）：** 兩句 UPDATE 現在都檢查 `affectedRows`——`records` 那句必須恰好影響 1 列，
`mech_levels`（有給 `mechType` 時）也必須恰好影響 1 列，否則丟出一個包含 `account_id`（跟
`mech_levels` 時的 `mech_type`）的錯誤。因為現在整個函式跑在 `recordMatchWithAccumulation()`
共用的同一個 transaction 裡，這個錯誤會讓整場（`matches`/`match_rounds`/`match_participants`
也一起）rollback，不是只有這一個 UPDATE 失敗。

### 2.3 測試涵蓋（`test/p3-db-recordmatch.js`，fake pool，直接檢查 SQL 文字與參數順序）

`recordMatchWithAccumulation()` 的插入順序（matches → rounds(N) → participants(N) →
accumulation UPDATEs(N)）與 transaction／rollback；`records` 永遠累加、`mech_levels` 只在給
`mechType` 時才動；**新增**：一個 accumulation 的 UPDATE affectedRows 不是 1（`records` 或
`mech_levels`）會丟錯，且讓整個 transaction rollback（含已經插入的 matches/rounds/
participants，用呼叫序列證明是先插入成功、後被 rollback 復原，不是被跳過沒跑）。

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

### 3.3 現在是同一個 transaction（已依 Sol batch6 review 修正）

**原第 6 節開放問題 1 已解決：** `scheduleMatchWriteback()` 現在建一個 `accumulations`
陣列（`isTest` 為 `true` 時是空陣列），呼叫**一次** `db.recordMatchWithAccumulation(matchPayload,
roundsPayload, participantsForDb, accumulations)`——`matches`/`match_rounds`/
`match_participants` 的 INSERT 跟每一筆 `accumulations` 的 UPDATE 都在同一個
`conn`／transaction 裡（見 §2.1）。如果任何一步失敗（含 §2.2 的 affectedRows 檢查），整個
transaction rollback，**不會再出現「有比賽紀錄，但戰績只更新了一部分玩家」的中間狀態**。
`test/p3-db-recordmatch.js` 的 `testFailedAccumulationRollsBackWholeMatch`／
`testZeroAffectedMechLevelsRollsBack` 直接證明：即使 `matches`/`match_rounds`/
`match_participants` 跟第一位玩家的 `records` UPDATE 都已經在同一次呼叫裡「成功執行過」，只要
後面某一步失敗，fake pool 記錄到的最後一個呼叫仍然是 `ROLLBACK`，不是 `COMMIT`。

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
- `is_test`（**Lead decision 2026-09-20，已裁定，取代原本的實作猜測**）：沿用 step 2 既有的
  「host 或任一 participant 是測試帳號，整場就是 `is_test=1`」。`matches`/`match_rounds`/
  `match_participants` 三張表照樣寫入（`is_test=1`，方便除錯整條寫回管線），**但完全跳過這場的
  每一個 `applyMatchAccumulation()` 呼叫**——`records`/`mech_levels` 對這場一律不動。原因：專用
  測試帳號（`docs/reference/unattended-policy.md`、`backlog.md` AUTO 段落）存在的目的就是讓
  無人值守/開作弊指令的場次不污染真實戰績，累加正是那種污染。`scheduleMatchWriteback()` 裡是一個
  明確、有註解的 `if (isTest) { ...; return; }` 分支（不是靜默過濾），註解裡標明這是
  coordinator 2026-09-20 的裁定；`test/match-writeback.js` 的
  `testIsTestMatchRecordedButNotAccumulated` 驗證「三表照寫、零次累加呼叫」。
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
| `test/p3-db-recordmatch.js` | `db.js` 的 `recordMatchWithAccumulation()`，fake pool，檢查 SQL 文字/參數 | INSERT 順序、transaction/rollback、`records`/`mech_levels` 累加寫法、**新增：accumulation affectedRows≠1 讓整場 rollback** |
| `test/match-writeback.js` | `match-stats.js` 的寫回流程，`db.recordMatchWithAccumulation` 整個 mock 掉 | switch off（沒有任何 DB 呼叫，`MATCH-SUMMARY` 不受影響）、完整一場（matches/rounds/participants 欄位、`accumulations[]` 算式）、中斷的場不寫、DB 失敗只記 log 不拋錯、**is_test 的場三表照寫但傳空 `accumulations[]`（Lead decision 2026-09-20）** |

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

## 6. 待審／待決定問題（給 Sol／高階）— 原始清單，附「已回應」標記

1. ~~**`recordMatch()` 跟每個 `applyMatchAccumulation()` 不是同一個 transaction**~~ —
   **已解決（Sol batch6 review「需修改」，見第 8 節）：** 合併成
   `db.recordMatchWithAccumulation()`，單一 transaction，詳見 §2.1／§3.3。
2. ~~**`--dry-run` 仍然要求 `ALLOW_REAL_DB_WRITE`/`P3_BACKUP_CONFIRMED`**~~ — **已解決
   （Sol batch6 review「可放寬」，見第 8 節）：** `--dry-run` 現在不需要任何環境變數，詳見
   §1.2。
3. ~~**`is_test` 不影響是否寫入**~~ — **已裁定（Lead decision，2026-09-20，coordinator）：**
   `matches`/`match_rounds`/`match_participants` 三張表照樣寫入（`is_test=1`），但
   `records`/`mech_levels` **一律不累加**（現在是傳一個空的 `accumulations` 陣列，見 §3.5）。
   詳見 §3.5。此項**已解決，不再是開放問題**。
4. ~~**`match_participants.account_id` 的 FK 維持 `ON DELETE CASCADE`**~~ — **已裁定
   （操作者 2026-09-20，經協調者轉達，見第 8 節）：** 改成 `ON DELETE SET NULL`（跟
   `matches.host_account_id` 同方向），`match_participants` 改用 surrogate PK。詳見 §1.1。此項
   **已解決，不再是開放問題**。
5. ~~**`started_at`/`ended_at` 用 mysql2 原生 `Date` binding，時區行為未驗證**~~ — **部分解決
   （Sol batch6 review「疑點」，見第 8 節）：** pool 已明確 pin `timezone: 'Z'`（UTC），程式行為
   確定；**仍然沒有對真的 MySQL 做 round-trip 驗證**，這部分維持開放（見下面第 7 節與新的開放
   問題）。
6. **`win_team_rank` 永遠 0、`suspicious` 永遠 `false`**（§3.5）：都是設計稿本來就承認的
   「先留欄位」，本次沒有實作對應邏輯，純粹是欄位存在但恆為預設值。**仍是開放問題**，不在本次
   SOL-REVIEW-6 修正範圍內。
7. **沒有真的連過 MySQL**：所有測試都是 fake pool／spy，`tools/migrate-p3-match-tables.js`
   的 SQL、`db.js` 的 SQL，都只驗證過「文字/參數/呼叫順序符合預期」，**沒有驗證過在真的
   MySQL 8（`metalrageserver.sql` 建出來的那個 schema）上實際執行會不會因為某個語法/型別問題失敗
   **（例如 `BIGINT UNSIGNED` 跟 mysql2 回傳型別的相容性、FK 建立順序在真實 `mro` 資料庫上是否
   跟 fake pool 假設的一致，`timezone: 'Z'` pin 之後實際落地的 `DATETIME` 字串是否符合預期）。
   **仍是開放問題**，等 disposable MySQL 環境跑一次真的 migration + round-trip。
8. **新增（本次修正過程中發現，操作者/Sol 尚未裁定）：`point_gained` 語意。**
   `match_participants.point_gained` 目前寫 `kills * POINT_PER_KILL`（`match-stats.js`），但沒有
   對應加進 `accounts.point`（帳號實際可花用的點數）——也就是說這個欄位目前只是「這場算出來的數
   字」，不是「玩家真的拿到的點數」。啟用 `MATCH_WRITEBACK_MODE` 之前需要裁定：(a) 這個欄位永遠
   只是唯讀的統計/紀錄，不影響 `accounts.point`；還是 (b) 之後要在同一個
   `recordMatchWithAccumulation()` transaction 裡也一併加進 `accounts.point`（需要另外設計
   `UPDATE accounts SET point = point + ?` 的 affectedRows 檢查，模式跟 §2.2 一樣）。本次沒有做
   任何選擇，只是把這個問題從 Sol 的逐項裁定（review 檔案「疑點 -- point 語意」）明確列進這裡，
   避免啟用時被忽略。

## 7. 怎麼驗證的（本次實作跑過的指令）

```
node --check "Metal Rage Online Server/dispatch/gate.game.dispatch.js"
node --check "Metal Rage Online Server/dispatch/room/match-stats.js"
node --check "Metal Rage Online Server/dispatch/lobby.dispatch.js"
node --check "Metal Rage Online Server/database/db.js"
node --check "Metal Rage Online Server/tools/migrate-p3-match-tables.js"

cd "Metal Rage Online Server"
for f in test/*.js; do node "$f"; done   # 全部 exit 0（不含 extract-golden.js，那不是測試）
node test/replay-golden.js               # ALL SAMPLES PASS，8384 封包逐位元組相同
```

沒有跑過、也不准跑的：`tools/migrate-p3-match-tables.js` 對真實 DB（沒有設
`ALLOW_REAL_DB_WRITE`/`P3_BACKUP_CONFIRMED`，程式本身會拒絕；`--dry-run` 現在不需要這兩個變數，
但這次也沒有對真的 `mro` 資料庫跑過，即使是唯讀）；`tools/win/drive.sh`；任何啟動/重啟伺服器的
操作。

## 8. SOL-REVIEW-6 修正摘要（2026-09-20，中階實作，🟡 待審／未經跨公司審查）

依 `docs/research/2026-09-20-sol-review/p3.md` 的「需修改」項目逐一修正（commit 分開，各自一個
concern）：

| Review 項目 | 修正 | 對應 commit（p3-step3 分支） |
|---|---|---|
| Step 2／participant 生命週期（開場快照，中途離場不遺失） | `match-stats.js` 的 `startMatch()` 現在 snapshot `room.members` 成 `matchStats.participantsMeta`；`ensureParticipantMeta()` 處理中途加入者 | `match-stats: snapshot participant metadata at match start` |
| Step 2／中斷 marker（host 戰鬥中離場沒有 abort marker） | `gate.game.dispatch.js` 的 `0x00222131` case 現在也呼叫 `matchStats.emitMatchAborted()` | `gate.game.dispatch: emit MATCH-ABORTED on host in-battle Leave_CQ` |
| 整場寫回不是原子操作 | `db.recordMatch()`/`applyMatchAccumulation()` 合併成 `db.recordMatchWithAccumulation()`，單一 transaction | `db.js: merge recordMatch()/applyMatchAccumulation() into one atomic transaction` |
| UPDATE 靜默零列 | `insertAccumulation()` 檢查 `affectedRows === 1`（`records`／`mech_levels`），不符合就丟錯、觸發整個 transaction rollback | 同上（同一個 commit，同一個 concern） |
| 時間欄位／timezone | pool 加上 `timezone: 'Z'`（UTC），grep 確認對現有行為無影響 | `db.js: pin mysql2 pool timezone to UTC` |
| `--dry-run` 過度保守 | `checkEnvGuards(dryRun, env)` pure function，`--dry-run` 不再需要 `ALLOW_REAL_DB_WRITE`/`P3_BACKUP_CONFIRMED` | `migrate-p3-match-tables: relax --dry-run to not require the write env guards` |
| participant FK 刪除政策（§6 開放問題 4） | 操作者裁定改 `ON DELETE SET NULL` + surrogate PK（見上表） | `migrate-p3-match-tables: match_participants.account_id -> ON DELETE SET NULL (operator decision 2026-09-20)` |

沒有處理、留在開放清單（第 6 節）：`win_team_rank`/`suspicious` 佔位值、真的 MySQL round-trip
驗證、新發現的 `point_gained` 語意問題。
