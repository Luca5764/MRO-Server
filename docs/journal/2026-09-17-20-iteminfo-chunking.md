# ItemInfo 分包（讓機庫顯示機體的第一步）（2026-09-17）

## 背景

- [OBS] 機庫看不到機體（`2026-09-17-19`）。
- ✅ [DLL] 單一 frame > 0x400 會卡住（`0x107f8fad`），每包最多 28 筆（`state.md` 第 4 節）；分包累加 ✅ [DLL]（`2026-09-17-03`）。
- [DB] `lucas` 有 8 台機 × 4 列（part_slot 0 機體、1 主武器、2 左、4 推進器）= 32 列。目前兩條登入路徑（`gamelogin.dispatch.js`、`account.dispatch.js`）都只送 part_slot≠0 的 24 列（848 bytes）；32 列一包是 1142 bytes，會卡住。
- 🟡 假設：機庫需要機體本體列（part_slot 0）才會顯示機體。

## 分兩步，一次一個變數

- **H1（這次）：只驗證分包本身。** 新增 `dispatch/item-info.sender.js`，兩條登入路徑共用；內容跟原本一樣（24 列、不含機體列），但每包 12 筆，分成 2 包送出。預期：機庫武器顯示跟原本一樣、登入不卡、PvE 照常。
- **H2（H1 通過後）：** `ITEM_INFO_INCLUDE_BODY = true`，32 列分 3 包。預期：機庫出現機體。

伺服器 20:5x 重啟。待測：`docs/next-test.md` 測試 H1。

## H1 結果（20:48–，`session-20260917-204753.jsonl`）

- ✅ [LOG] 兩條路徑都分包送出：`[account]: 24 items in 2 packet(s)`、`[gamelogin]: 24 items in 2 packet(s)`；登入沒有卡住，接著建房、開局，戰鬥中收到 29 筆 Death_CN。
- [OBS] 操作者回報「測完了」，沒有提到機庫或登入異常（🟡 視為機庫武器顯示與原本相同，未逐項確認）。
- ✅ 分包本身可用。

## H2（進行中）

- `ITEM_INFO_INCLUDE_BODY = true`：32 列（含 8 筆機體列），每包 12 筆 → 3 包。伺服器 21:0x 重啟。
