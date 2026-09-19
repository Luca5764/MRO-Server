# P3 step 1：對局結果寫回 DB — 設計稿（中階，🟡 待審，未經跨公司審查）

> 2026-09-20：引用已做機械核對（`research/2026-09-19-p3-writeback/verify-2026-09-20.md`）。32 項中 27 項相符；trace 的兩處位址寫錯，但結論不受影響（見 trace 檔末更正）；另有 1 項無法確認。EndGame_SN 欄位表漏列 A 隊 +0x18／B 隊 +0x26（u16）。推論審查與 Sol 審查仍待做，**DB 結構實作等 Sol**。

> 只設計，不實作、不跑 migration、不改 DB。所有結論一律 🟡；矛盾或無法定位的地方標 ⬜，不裁定。

## 0. 背景與既有基礎

- `docs/research/2026-09-19-progression/notes.md`（explorer 中階，高階已部分抽驗）已經確認：
  - `RecordInfo_SN 0x00210103`（`0x107c0fa0`）body 佈局：+0x00 Level u32、+0x14 Coupon i64
    （`0x107089cc`）、+0x40 LevelExp i64、+0x48 Point i64（`0x10706e24`）。
  - 30907 版 builder（`gamelogin.dispatch.js:210-224`）已經是校正過的佈局：wins +0x1C、draws
    +0x20、losses +0x24、kills +0x28、deaths +0x2C（跟 M1 金錢修正同一批）。9211 版 builder
    （`account.dispatch.js:518-531`）**仍是舊的錯誤佈局**（wins/draws 寫在 +0x14/+0x18，會蓋到
    Coupon；exp_max 寫在 +0x48，其實是 Point）——這是既有 🟡 缺口，本文件不動它，只在下面
    §2 標出來，等高階裁定要不要一起修。
  - `Reward_Record_User_SN 0x00220412`（`0x10705e1b` → `0x107ed440`，[DLL]）跟 `RecordInfo_SN`
    呼叫同一個 setter（`0x10706e24`），是**在 `ZDispatchRoom`（房間場景）重送整份 RECORD_INFO**
    的機制，欄位中段整體往前移 8 bytes、不設 Coupon、不呼叫 `Account_Record_Login_Save`——這是
    「打完一場後更新客戶端顯示」的正確管道，我們從沒送過。
- M1 金幣持久化（`docs/journal/2026-09-18-16-money-persistence.md`）已經是 ✅ 的先例，模式可以
  直接照搬：`accounts` 表已有 `point/cash/coupon` 欄位、`money.js` 開關模組、
  `tools/add-account-money.js` 冪等 migration 腳本（先印狀態、逐欄查
  `information_schema.COLUMNS`、存在就 skip）。本設計稿的 migration 計畫沿用這個腳本形狀。
- `records`／`mech_levels` 兩張表在 `metalrageserver.sql:38-61` 已經存在（帳號總計欄位：
  level/exp/exp_max/wins/losses/draws/kills/deaths），但 `docs/research/2026-09-19-progression/notes.md`
  已確認 **grep 不到任何 `UPDATE records`／`UPDATE mech_levels`**——打完一場後完全沒有寫回，這是
  P3 要補的核心缺口。

## 1. 客戶端結算頁讀哪些欄位

### 1.1 EndGame_SN 0x00222213（`0x1070a182` → `0x107d7ed0`，本次重新核對 [DLL]）

body（+0x10 起，frame 相對 param_2）兩個隊伍區塊，逐一核對組語：

| 偏移 | 型別 | 語意 |
|---|---|---|
| +0x12 | u16 | Team A: TeamIndex/Score（第一個 `Game_Score_Set` 參數 uVar6） |
| +0x14 | u16 | Team A: Round |
| +0x16 | u8 | Team A: Alive |
| +0x17 | u8 | Team A: Try |
| +0x1a | u16 | Team A: Goal |
| +0x1c | u32 | Team A: Exp |
| +0x20..+0x2a | 同上一組五個欄位 | Team B |

呼叫序列：`Game_Score_Set(TeamA)` → `Game_Score_Set(TeamB)` → `Game_Score_Update()` →
`Game_End_Battle` → `Community_Chat_Clear` → `Event_Call("NETWORK_GAME_END")` →
`Scene_Change(5)`（換到結算場景）。**這一路完全沒有讀取伺服器送的 Exp/Point 直接顯示在畫面上**
——`Event_Call` 觸發的是腳本端事件，實際結算頁畫什麼欄位要看 UnrealScript（見 §1.4）。

目前伺服器（`lobby.dispatch.js` 既有邏輯，`docs/research/2026-09-19-rank/notes.md` 引用）只填
WinTeam 相關欄位，其餘全 0——跟 progression notes 的既有結論一致，未矛盾。

### 1.2 User_Score_SN 0x00222221（`0x107051b9` → `0x107ece60`）

`docs/research/2026-09-19-rank/notes.md` 已核對：body +0x00 u16 WinTeamIndex、+0x02 u16
**WinTeamRank**（1=F…11=SS，唯一寫入 `GAME_INFO.WinTeamRank` 的地方是這個 handler 的
`Game_Result_Set`）、+0x04 u32 WinTeamScore、+0x08/+0x16 兩組 `Game_Score_Set` 區塊（跟
EndGame 一樣的五欄結構）、+0x24 起 u8 筆數 + 每人一筆（stride 疑似 0x4B，⬜ 逐人欄位未拆）。

**伺服器目前完全沒送過這個封包** → WinTeamRank 恆為 0 → `ZPage_PveResult.uc:113-165`
`m_Rank.Score = WinTeamRank - 1` clamp 到 0 → 結算頁 Rank 永遠 F（既有 ✅，見
`docs/state.md` RANK 條目與 `journal/2026-09-19-1013-rank-fixed-experiment.md`）。**本設計稿不
改這個已確認的結論，只把它納入寫回流程：P3 要送這個封包時，WinTeamRank 要跟寫回 DB 的勝負
一致。**

### 1.3 RecordInfo_SN 的 9 個未解 u32（`Account_Record_Set`）

契約要求追 `Account_Record_Set 0x107056aa`（thunk → `0x10717260`）的 push 順序。已手動逐指令
追過一次，完整過程與表格見
`docs/research/2026-09-19-p3-writeback/account-record-set-trace.md`（🟡 低信心，未經覆核）。
**結論：算出來的參數表跟目前 dispatch code 已經在用、且被 M1 驗證過的 body+0x1c/0x20/0x24/0x28/0x2c
（Win/Draw/Lose/Kill/Death）有重疊但對不齊**（例如推算出的參數涵蓋 body+0x2c/0x30/0x34/0x38/0x3c
等，body+0x28 反而沒出現）——**這是矛盾，不裁定，標 ⬜**，按契約「跟既有 ✅ 矛盾要停下來回報」
處理：見本文件最後一節。目前看起來 `Account_Record_Set` 寫入的是客戶端本地一個獨立的統計/勝率
快取結構（`esi+0x518..0x554`，內部算 `wins*100/total` 這類勝率），不是我們要對齊的封包欄位；
**P3 寫回不需要理解這個函式的內部欄位**，只要保證 body+0x1c/0x20/0x24/0x28/0x2c 五個計數正確，
勝率是客戶端自己算的。

### 1.4 Account_Record_Set 的 push 順序 — 開放項狀態

如上，已產出一份追蹤但信心低、且跟既有欄位對不齊，**沒有解決**。不建議下一輪投入更多時間在
純手動反組譯上（風險：跟 AGENTS.md 提醒的「Ghidra 參數順序常出錯」一樣的問題，這次連 Ghidra
都沒用，更容易錯）；比較穩的下一步是動態除錯（下斷點看真實暫存器值）或找 `ZPage_PveResult.uc`
/`ZPopup_Experience.uc` 這類腳本端讀取邏輯反推，而不是繼續啃組語。

### 1.5 Account_Record_Set 的 push 順序（原契約用語：Account_Record_Set 推送順序）—— 補充

契約還要求追「Account_Record_Set 的 push 順序」用來理解 `Account_Record_Set 0x107ed570-0x107ed5b4`
（`Reward_Record_User_SN` 那份）跟 `RecordInfo_SN` 那份（`0x107c1082-0x107c1107`）的差異。本輪
只追了 `RecordInfo_SN` 那份（見 §1.3/§1.4），`Reward_Record_User_SN` 那份因為同樣的信心/時間
考量沒有重複追——`docs/research/2026-09-19-progression/notes.md` 既有的描述（「中段欄位整體往前
移 8 bytes、不設定 Coupon、不呼叫 Login_Save」）暫時當作唯一依據，本文件不新增矛盾。

## 2. 伺服器端資料流提案

### 2.1 現有的資料點

- `client.battleStats_`（`lobby.dispatch.js`）：`BeginRound_CN 0x00230151` 時清空，`Death_CN`
  時累加 kills/deaths（`journal/2026-09-17-21-battle-score-totals.md`）。**這是目前唯一在戰鬥中
  即時累積的統計**，但只到「這一回合」的粒度，回合切換會被清空、沒有累計到整場。
- `Campaign_CN 0x00230139`（`lobby.dispatch.js`，PVE_ROUND_ADVANCE_MODE）：伺服器自己數目前
  回合，跟 `MapInfo.Round` 比對決定回 `EndRound_SN` 還是 `EndGame_SN`（R-ROUND，
  `journal/2026-09-19-0900-r-round-impl.md`）。**這是唯一知道「整場真的結束了」的地方。**
- 現況：`EndGame_SN` 送出之後，`client.battleStats_` 沒有被讀取寫回任何地方；`records`／
  `mech_levels` 表完全沒被更新。

### 2.2 提案：在哪裡持久化、什麼時機

1. **場次累計（跨回合）：** 在 `client.battleStats_` 之外，新增一個「整場累計」物件
   （例如 `client.matchStats_`），在房主送出**開戰**（`0x00222103`，跟現有 `battleStats_` 重設同
   一個觸發點附近）時建立；每次 `Death_CN` 時同時累加到 `battleStats_`（回合用）和
   `matchStats_`（全場用），不改變 `battleStats_` 既有語意（單一變數原則）。
2. **回合邊界（給 P7 合理性檢查用）：** `BeginRound_CN` 被接受時，記錄
   `roundStartedAt = Date.now()`；`Campaign_CN` 進到 R-ROUND 的「回合結束」分支時，計算
   `durationSeconds = (Date.now() - roundStartedAt) / 1000`，連同這一回合的 `Death_CN` 封包計數
   （新增一個小計數器，回合開始清零，每收到一次 `Death_CN` 就 +1；跟 kills/deaths 分開算，因為
   PM 要的是「這回合到底有沒有真的打」的訊號，不是輸贏）寫進待寫回佇列。這個計數器只是
   `Death_CN` 封包次數，不是傷害或擊殺數，避免跟 `battleStats_` 的語意混在一起。
3. **寫回時機：** `EndGame_SN` 送出的**同一個 dispatch 分支**，在送完封包之後（不擋封包送出，
   寫 DB 失敗不能讓玩家卡在結算頁）非同步寫入：
   - `matches` 一筆（整場）；
   - `match_rounds` N 筆（每回合一筆，R-ROUND 已經在算回合數，直接沿用）；
   - `match_participants`（房間內每個 client 一筆，回房間人數從 Room 物件拿，跟 D1 的
     Room 模型共用）；
   - `records`／`mech_levels` 的累加更新（`UPDATE ... SET exp = exp + ?, kills = kills + ?, ...`，
     不是覆寫——`docs/journal/2026-09-17-21-battle-score-totals.md` 已經確認 `Death_SN` 本身是
     直接覆寫每一場的暫時值，但寫回 DB 的账户总计要用累加，否則每場都会覆盖历史总计）。
4. **回推給客戶端：** 寫回 DB 成功後，等玩家**回到房間**（`User_State_SN 0x00220401` 廣播那個
   時間點附近，`journal/2026-09-19-2120-m2-acceptance.md` 觀察到的「結算後在房間按準備」序列）
   送 `Reward_Record_User_SN 0x00220412`（§0 已確認格式跟 `RecordInfo_SN` 只差中段位移 8
   bytes、不設 Coupon），讓客戶端不用重新登入就看到更新後的等級/經驗——這是唯一一個明確
   在「戰鬥結束後」語意上合理的封包（DLL 位址已核對），比等下次登入送 `RecordInfo_SN` 更即時。
5. **升級提示：** `Reward_Levelup_User_SN 0x00222231`（`0x107ed760`，不讀 body）如果偵測到這場
   後 Level 有變化就補送一次，觸發客戶端自己比較 LoginRecord／CurrentRecord 顯示升級動畫
   （`ZPopup_Experience.uc:77`，既有分析）。

### 2.3 開關

比照 M1 的 `MONEY_PERSIST_MODE`，這批改動應該包在一個新的預設關閉開關（暫定
`MATCH_WRITEBACK_MODE = 'disabled'`），關閉時維持現有行為（完全不寫 DB、不送
`User_Score_SN`／`Reward_Record_User_SN`）。實作時再細分要不要拆成多個小開關（回合計時、
DB 寫回、封包回送可以分開驗證）——這個拆分決定留給實作者，本文件不預先裁定。

## 3. Schema 草稿（僅供審查，不執行）

沿用 `records`／`mech_levels` 既有表（不改欄位，只補上「有人寫」這件事），新增三張表：

```sql
-- Migration draft: match writeback tables (P3 step 1, NOT applied)
-- Idempotent pattern follows tools/add-account-money.js: check
-- information_schema.TABLES/COLUMNS before CREATE/ALTER, print before/after
-- state, no destructive drops. Actual migration script committed separately
-- once this design is reviewed.

CREATE TABLE IF NOT EXISTS `matches` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `room_id`         INT UNSIGNED    NULL,          -- Room 物件 id，D1 交付後才有穩定值
    `map_id`          INT UNSIGNED    NOT NULL,       -- GameInfo.MapInfo.MapIndex
    `difficulty`      TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 9010/9011/9012 之類，🟡 待對照
    `round_target`    TINYINT UNSIGNED NOT NULL,       -- MapInfo.Round（5/8/10）
    `host_account_id` INT UNSIGNED    NOT NULL,
    `started_at`      TIMESTAMP       NOT NULL,
    `ended_at`        TIMESTAMP       NULL,
    `result`          TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 0=未知 1=win 2=fail（Campaign_CN body[2]）
    `win_team_rank`   TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 對應 User_Score_SN WinTeamRank，1=F 我方公式決定
    `is_test`         TINYINT(1)      NOT NULL DEFAULT 0, -- 測試帳號跑的場次；不計入戰績/排行
    `suspicious`      TINYINT(1)      NOT NULL DEFAULT 0, -- P7 合理性檢查標記，見下方 match_rounds
    FOREIGN KEY (`host_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `match_rounds` (
    `match_id`         BIGINT UNSIGNED NOT NULL,
    `round_number`      TINYINT UNSIGNED NOT NULL,   -- 伺服器自己數的回合數（R-ROUND）
    `started_at`        TIMESTAMP       NOT NULL,
    `duration_seconds`  INT UNSIGNED    NOT NULL DEFAULT 0,
    `death_cn_count`     INT UNSIGNED    NOT NULL DEFAULT 0, -- 這回合收到的 Death_CN 封包次數（不分敵我）
    `suspicious`         TINYINT(1)      NOT NULL DEFAULT 0, -- duration/death_cn_count 低於門檻（P7 待訂）
    PRIMARY KEY (`match_id`, `round_number`),
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `match_participants` (
    `match_id`     BIGINT UNSIGNED NOT NULL,
    `account_id`   INT UNSIGNED    NOT NULL,
    `team`         TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `kills`        INT UNSIGNED    NOT NULL DEFAULT 0,
    `deaths`       INT UNSIGNED    NOT NULL DEFAULT 0,
    `exp_gained`    BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `point_gained`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `result`        TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 0=未知 1=win 2=loss 3=draw
    PRIMARY KEY (`match_id`, `account_id`),
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

備註：

- `is_test` 放在 `matches`（整場層級），不是逐欄位，因為 AUTO（Pico）跑的測試帳號整場都不該
  計入戰績——跟 backlog AUTO 段落「比賽紀錄要帶測試標記」的要求一致。
- `suspicious` 同時放在 `matches`（整場彙總）和 `match_rounds`（逐回合），因為 P7 的合理性檢查
  描述的是「每回合秒數與 Death_CN 數，低於門檻標 suspicious」——逐回合判定，整場的
  `suspicious` 可以是「任一回合 suspicious 就整場 suspicious」的彙總欄位，方便查詢；判定邏輯本
  身（門檻數字）留給 P7，這裡只留欄位。
- `records`／`mech_levels` 的 `UPDATE` 語句不在這份 migration 裡（不改既有表結構），寫在 P3
  實作階段的 dispatch 程式碼裡，用契約 §2.2 point 3 的累加寫法。

## 4. 操作者要決定的數值

沿用 `docs/research/2026-09-19-progression/notes.md` 已列的清單，附上原版資料來源与可信度
（詳細出处见 `docs/research/2026-09-19-original-features/economy.md`、`progression.md`）：

| 項目 | 原版資料（可信度） | 目前伺服器 | 建議 |
|---|---|---|---|
| 每殺 exp／point | 沒找到台版數字；玩家攻略（可信度：玩家說法，不確定）「打掉一台滿血敵機約得 15 貢獻，其中傷害 1～10、擊殺加 5」（`rank/notes.md` 引用） | 每殺固定 10（`journal/2026-09-17-21-battle-score-totals.md`，佔位值） | 待操作者決定；沒有強依據可以直接沿用 |
| 每場 G 幣（依難度） | 台版玩家說法（多人一致）：高級潛入 R9/R10 一場 2,800 G；憤怒模式一場 1,440 G（`economy.md` §2，BH-1721/1757/1950） | 無 | 可以拿玩家說法當參考值，但要標「非官方數字，玩家估計」 |
| 升級門檻（經驗曲線） | 三版都沒找到（`progression.md` §1「門檻經驗值：⬜」；韓版軍階頁是圖片，Wayback 沒存到） | `LevelExpMax` 目前兩個 builder 都沒送（🟡 §0 提到的既有缺口） | 要自訂，且要決定 exp_max 由誰送（9211 vs 30907 兩份目前不一致，見 §0） |
| 晉升獎勵 | 韓版官方（KR-F13/KR-U11）：이등병 1,500 / 일병 3,000 / 상병·병장 各 10,000 / 하사起 各 20,000；台版玩家說法「1500 3000 5000 10000 20000」（`progression.md` §2） | 無 | 可暫用韓版官方數字當起點，台版玩家版本作為備案 |
| Rank（F～SS）公式 | 沒找到（`rank/notes.md`：抓了約 560 個 Netmarble 存檔頁，涵蓋 2010-03 排行榜公告但圖片沒存到） | 恆送 0（未送封包） | 要自訂，公式應該跟難度/地圖/通關時間/死亡數掛勾（`rank/notes.md` 建議方向），要在文件裡標明是自訂 |
| 進階機體執照價格 | 台版玩家說法（多人一致）150,000 G（`economy.md` §2） | 無現金商店流程覆蓋此項 | P6/商店階段再處理，這裡只記錄 |

**標記規則：** 上表「原版資料」欄一律附可信度（官方／玩家實測／玩家說法），沒有找到就寫「沒找到」，
不能省略成建議值本身看起來像官方數字。

## 5. Pico 夜間跑 (U-pve-fullmatch) 怎麼驗證寫回

依 `docs/backlog.md` AUTO 段落（P3 排序 1）：

1. Pico 腳本用 F24 console + `GameCampaign 1`（`docs/research/2026-09-19-dev-grade-cheats/notes.md`
   已確認這條指令沒有任何權限檢查、host 且 `Game_Play_Check()` 為真就會送 `Campaign_CN`）跑完
   `MapInfo.Round` 次，觸發 `EndGame_SN` → 結算 → 回房間。
2. 驗證點（跑完後由下一輪 AI 對照，而非跑腳本本身即時判定）：
   - `matches` 新增一筆，`is_test = 1`（腳本用的帳號要在設定檔標記成測試帳號，見下）；
   - `match_rounds` 筆數等於 `MapInfo.Round`，每筆有非零 `duration_seconds`；
   - `match_participants` 有這個測試帳號一筆；
   - `records`／`mech_levels` 對應帳號的 exp/kills/deaths 有增加（累加，不是清零重算）；
   - 若當時 §2.3 的 `MATCH_WRITEBACK_MODE` 是 enabled，回到房間後客戶端應該收到
     `Reward_Record_User_SN`（`[LOG]` 核對 opcode 即可，不需要畫面判讀）。
3. **測試帳號標記機制（提案，沿用現有 `config/whitelist.js` 的檔案式設定，不新增資料庫欄位）：**
   在 `config/allowed-users.json`（已經是 gitignored、per-operator 的檔案）的使用者物件上加一個
   `isTest: true` 欄位，登入時讀進 `client.isTestAccount_`，`matches.is_test` 直接寫這個值。這樣
   不用改 `accounts` 表 schema，也跟現有「hostAddress 掛在使用者物件上」的形狀一致（見
   `config/whitelist.js` 開頭註解）。**這只是提案，沒有寫代碼，要實作前請高階確認要不要用這個
   機制或改用 `accounts` 表欄位。**
4. Pico 用 `GameCampaign 1` 跑出來的場次，`match_rounds.duration_seconds` 會非常短（cheat 直接
   達標，不是真的打），`suspicious` 判定門檻（P7 待訂）不能拿這批資料當「正常對局」的基準——
   這點應該在 P7 訂門檻時特別排除測試帳號的資料，避免用作弊出來的極端值污染門檻計算。

## 6. 需要高階裁定的矛盾（按契約規則，不自行裁定）

- **§1.3/§1.4：** 手動追出來的 `Account_Record_Set` 參數表跟既有已驗證（M1 ✅）的 body+0x1c/0x20/
  0x24/0x28/0x2c 對不齊。本文件的判斷是「這個函式操作的是客戶端本地快取，不影響 P3 寫回範圍」，
  但這個判斷本身沒有 DLL 層級的直接證據（只是推論），**請高階或 verifier 用動態除錯重新核對**，
  或者確認「不需要理解它」這個結論是否站得住。
- **§0：** 9211 版 `RecordInfo_SN` builder（`account.dispatch.js:518-531`）仍是舊佈局，跟 30907
  版（已修正、M1 ✅ 涵蓋）不一致——這是既有缺口，不是本次新發現，但 P3 若要送
  `Reward_Record_User_SN`／`RecordInfo_SN` 的一致更新，這個舊 builder 遲早要一起修，順序留給
  高階排。


## 更正（2026-09-20）
§1 提到的 Account_Record_Set「欄位對不齊」是偏移算錯了（多算了 0x10），見 `research/2026-09-19-p3-writeback/account-record-set-trace.md` 文末的更正。修正後它跟 RecordInfo_SN 的 Win/Draw/Lose/Kill/Death 完全對齊，是客戶端的勝率快取，直接吃同一組欄位。§1 的實務結論（伺服器只要送對 W/D/L/K/D）不變。

## 高階推論審查（Claude，2026-09-20；未經跨公司審查，Sol 回來要再審）

整體方向可以：只在 EndGame 那一支寫回、預設關閉的開關、`is_test`／`suspicious` 預留欄位、用 Pico 夜跑驗證。下面幾點要在實作前改掉：

1. **§2.2-1 統計的粒度錯了（必改）。** `client.matchStats_` 掛在收到 `Death_CN` 的那條連線上，但 `Death_CN` 只有房主會送（Sol batch3 之後已加 host gate），所以多人時只會累積在房主身上。
   - 改法：整場累計要放在 **Room 物件**上（例如 `room.matchStats`），用 `Death_CN` body 裡的擊殺者／受害者 user index 對應到房間成員，再分給各 participant。
   - `battleStats_` 目前的語意（回合、廣播用）不動。
2. **§2.2-3 缺「沒打完的場」。** 以下情況都不會走到 EndGame 的寫回：
   - 任務失敗（`GameCampaign 2`／`Campaign_CN` 010002）；
   - 房主中途離開；
   - 全員離開、斷線。
   - 要定義：失敗要寫（result=2）；中斷的場寫 `result=0` 加上 `ended_at`，還是乾脆不寫？這要**操作者決定**：中斷的場要不要給部分獎勵。建議先「失敗照寫、中斷不寫」，而且要在 `battleLeaveMode` 的離場路徑上確定不會留下半筆資料。
3. **`is_test` 的判定規則要寫死：** 房主或任何一位參與者是測試帳號，整場都算 `is_test=1`。建議用 `allowed-users.json` 的 `isTest`，不改 `accounts` 表，同意這個提案。
4. **`difficulty` 不用「待對照」：** PvE 地圖 id 每 3 個一組（`ZPanel_PVE.uc:328` 的 `(MapIndex-9001)/3` 是地圖組），所以難度＝`(map_id-9001)%3`（0 初級、1 中級、2 高級）。9007–9009（護送）也適用（`journal/2026-09-20-0110-escort-smoke.md`）。
5. **Schema 細節：**
   - `started_at TIMESTAMP NOT NULL` 在 MySQL 的嚴格模式下沒有預設值，會有自動更新的陷阱，建議改成 `DATETIME NOT NULL`；
   - `host_account_id ... ON DELETE CASCADE` 會讓刪帳號時連同一起打過的整場紀錄也刪掉，建議把 matches 的 host 外鍵改成 `ON DELETE SET NULL`（欄位要允許 NULL）。
6. **§6 的兩項矛盾：** 第一項已被 2026-09-20 的更正解決（偏移多算了 0x10）。第二項（9211 builder 的舊佈局）要在送 `Reward_Record_User_SN` 之前一起修，列為 P3 實作的第一個小步驟，獨立一個 commit。
7. **實作順序建議：**
   1. 修 9211 builder；
   2. 做 Room 層統計＋回合計時（只記在記憶體、寫 log，不寫 DB）；
   3. migration＋寫回（開關關著）；
   4. `Reward_Record_User_SN`。
   - 每一步都用 Pico 的 `U-pve-fullmatch` 驗證。第 3 步起動 DB 結構，要等 Sol 審過。
