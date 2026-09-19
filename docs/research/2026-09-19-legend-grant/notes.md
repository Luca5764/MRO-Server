# 傳說機發放（LEGEND-GRANT-A，explorer 中階，🟡）

- 原型 → 傳說對照（機種 1–8）：
  - 11100101 → 11200101 RAVEN
  - 12100101 → 12200101 CRUAL MASSACRE
  - 13100101 → 13200101 VALKYRIE
  - 14200101 → 14300101 PHANTOM
  - 15200101 → 15300101 ZODIAC
  - 16200101 → 16300101 ROXANNE
  - 17100101 → 17200101 FENRIS
  - 18100101 → 18200101 SPECTOR

  傳說機是獨立的機體 item（HighGroup=1，MiddleGroup 跟原型相同），每台另有專屬塗裝鎖定它。
- 加成：UC 的 `e_MechSection==MS_Season_01`（`Pawn.uc:350,353`、`HangarMech.uc:79`，各武器檔會依它改數值）。只要穿上就生效，伺服器不用送額外欄位。
- IsLicense：是**槽位**的解鎖旗標，不是傳說機專屬（`ZPage_Hangar.uc:1544-1552`：購買限時傳說機前要先擁有該機種）。我們建帳號時已經給了 8 筆 mech_licenses，所以這一關應該已經過了（🟡）。
- 機庫裡原型機上的「傳說圖示」畫在哪裡，沒找到 ⬜，要靠實測確認。
- 缺口：`account.dispatch.js:52-60`、`gamelogin.dispatch.js:63-72` 登入時 WearInfo 的 `BODY_IDX` 只有 8 台原型加上 PHANTOM；其他 7 台傳說機查不到時會退回原始 item_id，圖示可能顯示錯。`room.dispatch.js` 用的是完整的 `CACHE_INDEX_BY_ITEM_ID`。
- 最小方案：
  1. 對帳號 4 的 items 插入 8 筆傳說機體（equipped=0）；
  2. 登入時的 WearInfo 改用完整 Cache 索引；
  3. 實測：機庫看不看得到、能不能換上（Slot_Change body 部位送的是 serial，E1 已經支援）、出場有沒有加成。

## LEGEND-GRANT-IMPL 實作紀錄（claude-sonnet worker 中階，🟡 待審）

- 分支 `flash-wip-legend`（worktree `~/mro-wt/legend`）。改動：
  `dispatch/cache-index.js`（新檔，`loadCacheIndexByItemId()` 從
  `room.dispatch.js` 原封不動搬出，room.dispatch.js 改成 require 它，golden
  replay 位元級一致 [TEST]）、`dispatch/account.dispatch.js`、
  `dispatch/gamelogin.dispatch.js`（WearInfo body slot 轉換加
  `BODY_INDEX_FULL_CACHE_MODE` 開關，預設 `disabled`）、新工具
  `tools/grant-legend-mechs.js`、新測試
  `test/grant-legend-mechs.js`、`test/body-index-full-cache.js`。

- **推翻上一段第 17 點的前提，待高階裁定**：契約假設
  `CACHE_INDEX_BY_ITEM_ID`（`room.dispatch.js` 既有的 1268-entry Cache.Bin
  掃描）打開開關後，對現有 9 個原型機 body id 會算出**跟舊 `BODY_IDX` 表一樣
  的值**。實際用本 worktree 的真實 `Cache.Bin`（symlink 到
  `/home/lucas/mro-reverse/MetalRage`）跑過 [CACHE][TEST]：**9 個全部不一樣**，
  而且 9 個裡有 4 個（13100101、14300101、17100101、18100101）在那張
  1268-entry 掃描裡根本查不到：
  ```
  11100101: old=84   full-cache=2410
  12100101: old=97   full-cache=2382
  13100101: old=110  full-cache=not found
  14200101: old=123  full-cache=2326
  14300101: old=130  full-cache=not found
  15200101: old=136  full-cache=2298
  16200101: old=149  full-cache=2270
  17100101: old=162  full-cache=not found
  18100101: old=175  full-cache=not found
  ```
  另外發現 `gamelogin.dispatch.js` 原本的 WearInfo body slot（登入
  0x00110124 30907 這條路徑）其實**完全沒做轉換**，直接送 raw item_id——
  不是契約描述的「9-entry BODY_IDX 表」，那個表在這支檔案裡是從來沒被用到
  的 dead code（`account.dispatch.js` 才有真正在用的 inline `BODY_IDX`）。
  用 `--record` 重播 `pve-full-match` golden 樣本、把開關硬開到 `enabled`
  確認過這個差異會反映到真實送出的 bytes（`0x00210113` body slot 從
  `11100101` 變成 `2410`），不是我推算錯。
- 因為前提是假的，**沒有寫「9 個值不變」的斷言**（那樣寫會是假的
  ✅）。`test/body-index-full-cache.js` 改成寫「canary」：斷言目前
  disabled 模式跟舊表完全一致（這條為真），並記錄 enabled 模式目前仍然
  跟舊表 9 個全部對不上（這條也為真，當作已知缺口存證，之後對得上了這條
  測試會失敗提醒回來看）。
- 開關預設維持 `disabled`，golden replay 與 `test/*.js` 全綠，跟這次改動
  之前位元級一致 [TEST]。所以這次改動本身不影響現行行為，只是把管線接
  起來、把假設證偽記下來。
- **懸而未決，需要高階判斷**：`84/97/110/123/130/136/149/162/175` 這串舊
  值到底是從哪張表算出來的，兩張已知表（`indexByItemId` 1268-entry 掃描、
  `representByItemId` GameItemRecord 2112-entry 表）都對不上、也不是
  item_id 本身。在查清楚（或改用別的驗證方式，例如直接請操作者實測登入
  截圖比對機庫圖示）之前，`BODY_INDEX_FULL_CACHE_MODE` 不應該打開，7 台
  傳說機的機庫圖示轉換問題仍未解決。
- 帳號 1／3／4 的 dry-run（真實 DB，SELECT-only，`--dry-run` 沒有任何
  transaction／write [TEST]）：三個帳號都有全部 8 張 `mech_licenses` 與全部
  8 個原型機 body（`part_slot=0`），`grant-legend-mechs.js --dry-run` 對三個
  都回報「8 個傳說機全部可發放、0 個跳過」，發放清單為
  `11200101,12200101,13200101,14300101,15300101,16300101,17200101,18200101`。
  跑完後再 SELECT 確認 `items` 裡這三個帳號沒有任何一筆這 8 個 item_id
  （驗證 dry-run 真的沒寫入）。
- 工具本身的 gating（`ALLOW_REAL_DB_WRITE`／`LEGEND_BACKUP_CONFIRMED`）還沒
  被設過，沒有對真實 DB 做過寫入測試；寫入路徑只在 fake pool
  （`test/grant-legend-mechs.js`）驗證過（插 8 筆、equipped=0/part_slot=0/
  slot=0/mech_type 正確、重跑 no-op、已擁有的單一 legend id 會被跳過但不擋
  其他 7 個、缺 license／缺原型機各自標不同 skip reason）。真的要對帳號
  1/3/4 寫入前，需要高階（或操作者）先確認要不要備份、以及上面那個「舊表
  來源不明」的問題要不要先解決，否則發下去的圖示可能是錯的。

## 上一段「舊表來源不明」已由主力找到（claude-sonnet worker 中階記錄，🟡 待審）

- 主力回報公式：`bodyIndex = GameItemRecord 表（起點 0x2294、每筆 0x67、共
  2112 筆）裡 item_id 第一次出現的 position + 84`。用本 worktree 真實
  `Cache.Bin` 全部核對過 [CACHE][TEST]：
  - 舊表 9 個 id **完全對上**（11100101 pos0+84=84、12100101 pos13+84=97、
    13100101 pos26+84=110、14200101 pos39+84=123、14300101 pos46+84=130、
    15200101 pos52+84=136、16200101 pos65+84=149、17100101 pos78+84=162、
    18100101 pos91+84=175）；
  - 7 台傳說機也對上主力給的值（11200101 pos7+84=91、12200101
    pos20+84=104、13200101 pos33+84=117、15300101 pos59+84=143、16300101
    pos72+84=156、17200101 pos85+84=169、18200101 pos98+84=182）。
    `+84` 本身意義未知（🟡，可能是某個 client 端前置清單的固定筆數），
    `dispatch/cache-index.js` 的 `GIR_BODY_INDEX_OFFSET` 註解已標註。
- 改法：`dispatch/cache-index.js` 的 `loadCacheIndexByItemId()` 同一次
  GameItemRecord 掃描順手記 `girPositionByItemId`（第一次出現的 position），
  新增 `getBodyIndexFromGir(itemId)` 回傳 `position+84`（查不到回 `null`）。
  開關改名 `BODY_INDEX_GIR_MODE`（原 `BODY_INDEX_FULL_CACHE_MODE`，
  `_setBodyIndexFullCacheModeForTests` 同步改名
  `_setBodyIndexGirModeForTests`），預設仍是 `disabled`。
  `account.dispatch.js`／`gamelogin.dispatch.js` 都改成：`enabled` 時先查
  `getBodyIndexFromGir`，查不到才退回原本各自的 fallback（前者是舊
  9-entry 表，後者是 raw item_id，兩者都跟開關關閉時完全一樣）。
  `test/body-index-full-cache.js` 整支換掉，改成
  `test/body-index-gir.js`：斷言預設 `disabled`、`enabled` 時對 9 個舊 id
  跟 7 個傳說 id 的值都精準等於上面那串數字、查不到的 id 回 `null`。
- **golden replay 用真實 Cache.Bin 跑過兩種狀態**（開關切 `enabled` 只是暫時
  改本機檔案測試，測完就切回 `disabled`，不留在 commit 裡）：
  - `disabled`（預設，commit 裡的狀態）：`node test/replay-golden.js` 全綠
    ×2（改動前後都跑過），四個樣本（`login-dispatch`、`login-room-game`、
    `login-room-shop-buy`、`pve-full-match`）位元級一致。
  - `enabled`：`login-dispatch`（走 `account.dispatch.js` 的 9211 登入
    WearInfo）**位元級一致**，因為公式算出的值跟舊 9-entry 表完全相等；
    `login-room-game`／`login-room-shop-buy`／`pve-full-match`（都走
    `gamelogin.dispatch.js` 的 30907 WearInfo）**不是位元級一致**——
    body slot 從 raw item_id（`11100101`）變成 `84`，因為這條路徑本來就
    是本輪才發現的「完全沒做轉換」的缺口（見上一段），開下去本來就會改
    bytes，這是修正缺口的正常結果，不是回歸。主力訊息裡「replay-golden
    on/off 都要位元級一致」這條，對 `account.dispatch.js` 的路徑成立，對
    `gamelogin.dispatch.js` 的路徑因為上述已知缺口而不成立；已如實記在
    這裡，開關預設仍是 `disabled` 沒有變更現行行為，等主力裁定是否要開。
- 其餘不變：帳號 1/3/4 dry-run 結果、grant 工具測試、寫入 gating 均同上一段。

## 實際發放（高階，2026-09-19 19:14）
- 備份：`~/mro-backups/mro-before-legend-20260919-191426.sql`。帳號 4 當時離線（`/conns` 只有 dusk、Lucas）。
- `tools/grant-legend-mechs.js --account 4`：插入 8 筆，serial 200118–200125，equipped=0。重跑 dry-run 全部顯示 already-owned，確認冪等。
- 伺服器維持目前版本；`BODY_INDEX_GIR_MODE` 關閉。30907 登入時的 WearInfo 身體欄位原本就送原始 item_id，8 台原型機一直顯示正常，所以先照原樣看傳說機會不會顯示。如果圖示錯了，再打開開關（公式 GIR 位置 + 84 已經對 16 個 id 驗證過）。
- 待實測：用 test 登入後，機庫看不看得到傳說機、能不能換上、出場有沒有加成。
- ✅ [OBS] 2026-09-19：操作者用 test 帳號實測，回報「看起來是通過了」，傳說機可以使用（未經跨公司審查）。
- 19:37 發給帳號 1（Lucas）和 3（dusk）。備份在 `~/mro-backups/mro-before-legend-all-20260919-193749.sql`，各插入 8 筆；重跑 dry-run 16 筆全部顯示 already-owned。兩人當時在線上，要重新登入才看得到。
- ✅ [LOG][OBS] Lucas 看不到第 7、8 台傳說機：原因是 `Packege_Item_SN 0x00240131` 在程式裡寫死最多 63 筆（沒有依據），他的帳號有 65 件物品，最後兩筆被切掉（session-20260919-184235.jsonl ms 3347413，count 0x3f）。上限改成依 frame 大小計算（125 筆，commit 35a1af4）後，[OBS]「兩台都出現了」。（未經跨公司審查）另外也確認：機庫裡「持有的機體」這份清單，至少有一部分是來自 Packege_Item_SN。
