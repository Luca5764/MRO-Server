# M1 金錢持久化

狀態：🟡 待審；開關預設 disabled，未執行 migration、SQL 或伺服器實測。

## 依據與目標

- [DLL] 提案記錄 `Buy_PointItem_SA 0x00240202` 本體 `0x107dea70`；成功狀態後在
  `0x107deadd-0x107deaf2` 讀 body+`0x06` 的 int64 LE，指定本地 Point。
- [DLL] `RecordInfo_SN 0x00210103` 本體 `0x107c0fa0` 在 `0x107c1154-0x107c116b`
  讀 body+`0x48` 的 int64 Point；body+`0x14` 是 int64 Coupon。
- [DLL] `Packege_Point_SN 0x00240132` 本體 `0x107dda30` 從 body+`0x04` 讀 Point；
  `Packege_Coupon_SN 0x00240133` 從同一欄位讀 Coupon。
- [DLL] `0x107dda6f` 對 Package money 的 body+`0x00` 做 `<=0` 檢查；enabled 路徑因此送 1。
- [DLL] `Open_SA 0x00240102` 本體 `0x107ddbd0` 在 `0x107ddc48-0x107ddc5d`
  讀 body+`0x06/+0x0A` 的 64-bit Cash。
- [SRC] `ZPopup_Buy.uc:959-962` 只繪製購買後預估值；購買流程不在客戶端阻擋不足餘額。
- [SRC] `ZPopup_Buy.uc:517`、`ZPage_Hangar.uc:2799-2804` 直接進入購買 CQ。
- [SRC] `ZPage_Hangar.uc:2814`、`ZPopup_Buy.uc:905` 將金額轉成 32-bit `int`，
  因此所有送出與寫入值 clamp 到 `0..2147483647`。

## 封包欄位與長度

| 封包 | disabled 現況 | enabled 行為 | body 長度 |
|---|---|---|---:|
| `0x00210103` RecordInfo_SN | 原 stats offsets 與 `record.exp_max` 不變 | body+`0x14` Coupon int64、stats 後移，body+`0x48` Point int64 | `0x60`，足夠，未變 |
| `0x00240102` Open_SA | body+`0x06/+0x0A` 兩個 zero u32 | body+`0x06` 寫 clamped Cash int64 | `0x0E`，已足夠，未變 |
| `0x00240132` Packege_Point_SN | `point` 重複寫入 +0/+4，尾欄 0 | +0 u32=1；+4 int64=Point | `12`，未變 |
| `0x00240133` Packege_Coupon_SN | `coupon` 重複寫入 +0/+4，尾欄 0 | +0 u32=1；+4 int64=Coupon | `12`，未變 |
| `0x00240202` Buy_PointItem_SA | 6 bytes，只有 status/result | +0/+2 status/result，+`0x06` int64 扣款後 Point | `0x0E`（僅 enabled） |

- [CODE] `getExactMessageBuffer` 不補齊；因此 Buy SA enabled 的 body 明確擴成 14 bytes，
  其他三類不改長度。
- [CODE] `dispatch/money.js:1` 新增 `MONEY_PERSIST_MODE='disabled'`；其 clamp helper
  位於同檔 `:4-13`。
- [CODE] `gamelogin.dispatch.js:95-99` enabled 才從 `accounts` 載入三個欄位；
  disabled 不建立這些 client 欄位，保留原登入路徑。
- [CODE] `gamelogin.dispatch.js:148-167` 把 RecordInfo 的 money 欄位包在 enabled 分支；
  disabled 寫入序列與原始行為等價。
- [CODE] `room.dispatch.js:515-545` 兩個 Open_SA 發送點都只在 enabled 寫 Cash；
  campaign suppression 的 disabled zero body 仍保留。
- [CODE] `room.dispatch.js:1238-1282` enabled Package header 固定為 1，payload 使用 DB 值；
  disabled 的固定 100000/1000 路徑未改。

## 購買交易邊界

- [CODE] `room.dispatch.js:855-917` enabled 先取得 `accounts` row lock（`FOR UPDATE`），
  再讀 clamped Point 與 catalog price。
- [CODE] 餘額不足時只 rollback、設非零 result，不執行 `UPDATE accounts` 或 `INSERT items`。
- [CODE] 足額時在同一 connection transaction 先 `UPDATE accounts.point`，再 `INSERT items`，
  兩者都成功後才 commit；commit 前任何錯誤都 rollback 並回失敗。
- [CODE] commit 後才更新 `client.point_`，並用新餘額回送 Buy SA body+`0x06`。
- [CODE] enabled 的成功購買沿用既有 ItemInfo／Package／WearInfo refresh；失敗不觸發新增物品。
- 🟡 [DB] 若 migration 尚未執行，enabled 查詢會失敗並回購買失敗；本任務不自動 fallback，
  避免在未有持久化欄位時假裝完成扣款。

## Schema 與 migration

- [CODE] `metalrageserver.sql:31-33` 新安裝的 `accounts` 新增 `point/cash/coupon BIGINT NOT NULL`，
  預設分別為 `100000/0/0`。
- [CODE] `tools/add-account-money.js:11-40` 先印帳號數與三欄位狀態；
  `:51-62` 逐欄查 `information_schema.COLUMNS`，存在就 skip，不存在才 `ALTER TABLE`。
- [CODE] migration 完成後再次印欄位狀態與帳號數，並依 proposal 將既有 `point=0` 初始化為 100000。
- [CODE] 欄位名稱與 SQL definition 是程式內固定白名單，不接受命令列 identifier，重跑時不重複加欄位。
- [TEST] 只對 migration 執行 `node --check`；沒有 require 執行、沒有連線、沒有執行任何 SQL。

## 待審邊界

- 🟡 `[DLL]` 欄位位址與覆蓋順序採用 `docs/research/2026-09-18-money/proposal.md` 的中階分析，
  已照契約落成預設關閉修正，仍待高階審查。
- 🟡 沒有改 `ROOM_TEAM_INDEX_MODE`、其他 room/map/shop 開關、DB schema 以外的資料表或 state/HANDOFF。
- 🟡 未重啟伺服器、未請操作者測試；migration 必須由高階在獨立步驟執行。

## 高階裁定（2026-09-18 22:30，Claude 高階）

- M1 ✅：[OBS] 購買後 G 幣扣款；完全重登後 G 幣保留。[LOG] `session-20260918-221216.jsonl:327` Buy SA body+0x06＝`0x014c08`（85000）；重登後 `session-20260918-222223.jsonl` 的 `0x00240132` 與 `0x00210103` 都送 85000。`MONEY_PERSIST_MODE` 預設改為 enabled。DB migration `tools/add-account-money.js` 已由 Sol 執行。
- M2 ❌：[LOG] `session-20260918-221216.jsonl:326-332` 已是 ACK→ItemInfo 的新順序，[OBS] 新物品仍然沒有立刻出現，換機體後才出現。「先後順序是根因」的假設排除；`cc99bac` 不合併。後續由 M3（庫存面板重畫觸發）接手。
