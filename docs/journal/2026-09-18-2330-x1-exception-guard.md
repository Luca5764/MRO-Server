# X1 伺服器全域例外防護

狀態：🟡 待審（中階實作，`flash-wip-x1`）；已跑黃金樣本回歸與新增的端對端例外測試，皆綠，等高階審查。

## 目標與依據

`docs/backlog.md` X1：任何一條連線的 handler 丟出例外時，只關掉那一條連線並留下完整 hex dump／堆疊，整個伺服器程序不能掛掉。背景：多人時一個怪封包會讓所有人一起斷線（`server.js`／`client.js` 原本完全沒有 try/catch，`client.js:getLocalTime()` 的註解已經明說這種歷史事故發生過一次）。

## 改了什麼

工作位置：`~/mro-wt/x1`，分支 `flash-wip-x1`。

1. **`Metal Rage Online Server/server.js`**
   - `DispatchServer.onConnection()` 的 dispatch 迴圈：`service.dispatch(client, type, data)` 包 try/catch。丟例外時呼叫新方法 `onDispatchException(client, type, data, err)`：console.error 醒目訊息、`packetlog.connection('exception', ...)` 記完整 op/hex/stack、`packetlog.marker(...)` 留一筆自動 marker，最後 `client.socket_.destroy()` 只關掉這條連線。
   - 若 `service.dispatch()` 回傳值是 thenable（目前 `dispatch.js`／`game.js` 底下所有 dispatch() 都是同步回傳布林值，這個分支現在打不到，是為了未來防呆），`.catch()` 掛同一個 `onDispatchException`。
   - `process.on('uncaughtException')`／`process.on('unhandledRejection')`：只記 console.error＋`packetlog.marker`，不 `process.exit()`，不靜默吞掉。這兩個是最後一道網，不是主要防護；主要防護是上面那個 try/catch，能對應回連線並關掉它。process 層抓到的例外（例如 handler 排進 `setTimeout` 後才丟出的）**沒有連線可以關**，只能記錄——這是已知限制，不是漏做。
   - 把原本直接跑在 module 頂層的「兩個 `DispatchServer` 各自 `start()`、`/reload`、marker 監聽」整段包進 `function main() { ... }`，只在 `require.main === module` 時呼叫。這是唯一超出「加 try/catch」範圍的改動：純粹為了讓 `test/exception-guard.js` 能 `require('../server.js')` 拿到 `DispatchServer` class 卻不連帶把真正的 9211/30907 綁死一次。`node server.js`（唯一的實際啟動方式，`Start Server.bat`／`package.json` 的 `start` 都是這樣呼叫）時 `require.main === module` 為真，行為與改之前逐行相同。
   - 檔尾新增 `module.exports = { DispatchServer }`；沒有任何現有程式 `require('./server.js')`，純加項。

2. **`Metal Rage Online Server/client.js`**
   - `onData()` 整個處理迴圈（`Buffer.concat` 累積、`peekLength`／CRC 檢查、`onInternalMessage`、`callback_`）包進 try/catch，當備援網：`service.dispatch()` 本身的例外已經被 server.js 的 try/catch 接住不會傳到這裡，這一層抓的是 frame 解析本身或未來防護出現漏洞時的例外。同樣的處理方式：`packetlog.connection('exception', ...)`＋marker＋`this.socket_.destroy()`，只丟現有 `recvbuf_` 的 hex（可能包含還沒消化的下一個 frame）。

## 驗證

1. `node test/replay-golden.js`：兩個樣本 `login-dispatch`／`login-room-game`／`login-room-shop-buy` 全部 `PASS`，`ALL SAMPLES PASS`（exit 0）。這個 harness 直接呼叫 `dispatch/*.js`，不經過 `server.js`/`client.js`，所以只證明「沒動到 handler 本身」，不驗證這次改的 try/catch 路徑。
2. 新增 `Metal Rage Online Server/test/exception-guard.js`：起一個真正的 `DispatchServer`（`server.listen(0, ...)`，OS 隨機分配埠號，絕不是 9211/30907），注入一個測試用假 service（不是任何真的 `dispatch/*.js`），對 opcode `0x00ee0001` 一定丟例外、對 `0x00ee0002` 回 `true`。流程：
   - 連線 A 送 `0x00ee0001` → 斷言 socket 在逾時內收到 `close`（伺服器端 `destroy()` 的結果）。
   - 連線 A 斷線之後才建立連線 B，送 `0x00ee0002` → 300ms 內斷言 B 沒被關掉。
   - 兩者皆通過，`process.exit(0)`；主控台可見例外堆疊正確指到 `server.js:79`（`service.dispatch()` 呼叫點）與注入的假 service，`[X1-TestServer] Connection closed (0 remaining)` 證明只有 A 被移除。
   - 另外用 `node -e "require('./server.js')"` 確認單純 require 不會綁埠、進程立刻正常退出，證明 `require.main === module` guard 生效，不會跟 tmux 裡的正式伺服器搶埠。

## 限制（沒做完 / 需要高階判斷的事）

- **`setTimeout`／其他非同步回呼裡的例外無法對應回連線。** 這類例外只會走到 `process.on('uncaughtException')`，該處拿不到 `client`／`connId`，只能整包記進 marker，不能單獨關掉肇事連線。契約裡已預告這個限制；若要做到「連對應」，需要每個排 timer 的 handler 自己包 try/catch 並回頭找到 client（那會動到 `dispatch/` 底下每個檔案，超出本任務範圍）。
- 為了讓 `test/exception-guard.js` 能用真正的 `DispatchServer` 而不是重寫一份邏輯，動了 `server.js` 的模組層結構（`main()` + `require.main === module`），比原契約列的「dispatch 迴圈／process 層」再多一點；行為上對 `node server.js` 的唯一啟動路徑沒有差異，但這是一個結構性改動，請高階確認是否可接受，或要求改成別的測試方式。
- 沒有另外驗證「同一條連線先前已存在的 `campaignRoom_` 等狀態，在被 `destroy()` 之後不會透過 `session.save` 污染其他帳號」——`session.js:save()` 本來就以 `accountId_` 隔離，例外路徑沒有呼叫 `session.save()`（跳過它直接 return），理論上安全，但沒有另外寫測試覆蓋。
