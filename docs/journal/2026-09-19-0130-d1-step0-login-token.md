# D1 第 0 步：Gate Leave_SA 帶 (accountId, key)，30907 用它認人（🟡 待審）

> **本步驟沒有經過跨公司審查（Sol 無額度），待 Sol 恢復後補審 diff。**
> **PM 只做過組語位址的機械式核對：`0x10715f70`、`0x107dc823`–`0x107dc846`、`0x107c3ef5`／`0x107c3f00`，三處都跟 `journal/2026-09-18-2350-game-login-token-chain.md` 的描述相符。** 本篇的程式改動與測試結論尚未經過任何人審查，一律視為待審。

分支：`flash-wip-d1s0`（worktree `~/mro-wt/d1s0`），**未合併、未 push、未重啟伺服器**。依 `docs/design/d1-multiplayer-room.md` §6 第 0 步、`docs/backlog.md` D1-0 契約執行。

## 背景

`journal/2026-09-18-2350-game-login-token-chain.md` 已用 DLL 證實身分鏈存在：Gate `Leave_SA 0x00220132` 成功時 body+0x06／+0x0A 的 u32 會被客戶端存進 `Certify_Away_Set`（`0x10715f70`），之後每次連 30907 送 `Login_Again_CQ 0x00110124`（含換地圖重連）都會原樣帶回同一組值。伺服器原本送全 0，30907 端用 `SELECT * FROM accounts ORDER BY last_login DESC LIMIT 1` 猜帳號——兩人都在線時會認錯人。

## 改動

- 新模組 `Metal Rage Online Server/auth-tokens.js`（**故意放在 `dispatch/` 外**：`server.js` 的 `/reload` 只清 `dispatch/`、`dispatch.js`、`game.js` 的 require cache，放外面才不會被熱重載清掉）：`Map<accountId, key>`＋`Set<accountId>`（記錄本次程序啟動以來登入過的相異帳號）。
  - `issueKey(accountId)`：`crypto.randomInt(1, 0xFFFFFFFF)` 產生 key（範圍排除 0），覆蓋該帳號的舊 key（同一帳號下次 Gate 登入才輪替，換地圖重連沿用同一組值，滿足「不是一次性」的條件）。
  - `lookup(accountId, key)`：body 全 0 或 key 不符回 `null`。
  - `seenAccountCount()`：給 fallback 判斷用。
  - `setKeyGenerator`／`resetKeyGenerator`／`resetForTest`：只給測試用，正式路徑不呼叫。
- `dispatch/gate.dispatch.js`：`CQ_LEAVE`（客戶端離開 Gate 準備連 30907 時觸發）分支呼叫 `authTokens.issueKey(client.accountId_)`，把 accountId／key 寫進 `SA_LEAVE 0x00220132` body+0x06／+0x0A（原本兩個欄位都是硬寫 0）。
- `dispatch/gamelogin.dispatch.js`：`Login_Again_CQ 0x00110124` 處理讀 body+0／+4，查 `authTokens.lookup`：
  - 命中 → `db.getAccountById(tokenAccountId)` 取帳號。
  - 沒命中且本次程序只見過 ≤1 個相異帳號 → 退回原本的 `ORDER BY last_login` 查詢，並寫一筆 `packetlog.marker('WARNING: ...')`。
  - 沒命中且已見過 ≥2 個相異帳號 → `client.socket_.destroy()` 關閉連線並寫一筆 `packetlog.marker('!!! REFUSING ...')`（含 body hex 與已見帳號數），**不猜**。
- `database/db.js` 新增 `getAccountById(accountId)`（`SELECT * FROM accounts WHERE id = ?`），`module.exports` 補上。
- `test/fixtures/fake-db.js` 補 `getAccountById`；`test/fixtures/fake-client.js` 的假 `socket_` 補 `destroy()`（原本沒有，測試會直接炸）。
- `test/replay-golden.js`：每個樣本重播前呼叫 `authTokens.resetForTest()` 並把 key generator 釘死成 `() => 0x11223344`，理由跟 `resetModulesWithFixtureDb` 同一行註解一致——每個黃金樣本模擬一次獨立的伺服器啟動。

## 驗證

1. **回歸測試**：`node test/replay-golden.js`
   - `login-dispatch`（唯一會走到 `0x00220132` 的樣本）**刻意變紅**：`accountId=1, key=全0` → `accountId=1, key=0x11223344`。用固定 key generator `--record login-dispatch` 後重錄基準，符合契約「刻意改變並附理由」。
   - 其餘三個樣本（`login-room-game`、`login-room-shop-buy`、`pve-full-match`，`Login_Again_CQ` body 都是 `0000000000000000`）**全綠未變**：因為它們的 fixture 只有帳號 #1，`seenAccountCount()` 恆為 1，走 fallback 分支，結果跟改動前逐位元組相同。
   - 全跑一次：`[login-dispatch] PASS (14 packets)`、`[login-room-game] PASS (50 packets)`、`[login-room-shop-buy] PASS (363 packets)`、`[pve-full-match] PASS (8383 packets)`、`ALL SAMPLES PASS`。
2. **新測試** `test/login-token.js`（`node test/login-token.js` → `ALL CHECKS PASS`）：
   - (a) A 登入→B 登入→A 用自己的 (accountId, key) 重連，仍被認成帳號 #1（`SN_DEFAULT_INFO` 暱稱＝`Lucas`）；同一序列下直接呼叫舊的 `ORDER BY last_login` 查詢，斷言其結果是 `Dusk`——證明這是真的修正，不是恰好一致。
   - (b) 同一個 token 連續用兩次（模擬兩次換地圖）都成功解回帳號 #1。
   - (c) 兩個帳號都登入過（`seenAccountCount()===2`）後送全 0 body：`client.destroyed_===true`、`client.accountId_` 維持 `undefined`、有符合 `/REFUSING Login_Again_CQ/` 的 marker。
   - (d) 只有一個帳號登入過時送全 0 body：連線不關、`client.accountId_===1`（fallback 成功）、有符合 `/WARNING: Login_Again_CQ token missing\/invalid/` 的 marker。
3. `node test/whitelist.js` 仍 `ALL CHECKS PASS`（確認共用的 `fake-client.js` 改動沒有連帶破壞既有測試）。

## 實機測試步驟（PM 規定，尚未執行）

1. Lucas 登入 → 建 PvE 房 → 開戰。
2. 戰鬥中，dusk 登入（第二台主機或第二個客戶端）。
3. Lucas 打完結束回房。
4. 對照伺服器 session log：Lucas 每一次 `0x00110124` 的 body 都應該是同一組 `(1, 同一 key)`，且都被 `[ZGameLoginDispatch]` 認成帳號 #1；同時可觀察 dusk 的 `0x00220132` 是否確實帶了不同的 accountId／key。

## 未解決 / 交回審查的點

- **未跨公司審查**：本篇與對應 diff 尚未經 Codex reviewer（Sol）核對，只有 PM 的組語位址機械核對，見檔案開頭。
- **未實機測試**：上面「實機測試步驟」尚未由操作者執行；目前的證據只到回歸測試＋新單元測試（fixture DB，非真實連線）。
- `client.socket_.destroy()` 用的是硬斷（跟 `client.js` 例外守門用同一種方式），沒有送任何失敗封包告知客戶端——這跟現有的 `client.disconnect()`（`socket_.end()`，優雅關閉）是兩種不同語意，沿用契約字面「socket destroy」的選擇，但沒有 DLL 證據說明客戶端收到硬斷線時的反應（可能直接卡在載入畫面），留給高階／PM 裁決是否要換成 `disconnect()` 或先送一個失敗 SA。
- `authTokens.issueKey` 在 `client.accountId_` 未設定時送 `accountId=0, key=0`（理論上不會發生，因為 Gate `CQ_LEAVE` 只會在 9211 登入成功後才送出），沒有另外處理，因為契約沒要求。
