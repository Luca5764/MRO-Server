# 已知陷阱（程式碼層）

> 從 docs/opcode-ledger.md 第 1363–1404 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

### `type & 0x80` 會誤攔 dispatch opcode

`client.js` 的 `onData()` 用 `if (type & 0x80)` 決定訊息走系統層還是 dispatch chain，測的是**完整 32-bit opcode 的低位元組**。真正的系統訊息是 `0x00020080`~`0x00020084`，但**任何低位元組 bit 7 有設的 opcode 都會被一起攔走**，直接送進 `onInternalMessage()`。

原本 `onInternalMessage()` 的 switch 沒有 default 分支，這種封包會靜默掉地上。log 裡只剩 `RECV:` 那一行（有 type 跟長度，沒有 hex dump、也沒有任何「它沒進 dispatch」的訊號），很容易被誤讀成客戶端根本沒送這個封包。

**已修**（`client.js`，加 default 分支）：現在會印出完整 hex dump，且若 opcode 不在 `0x000200XX` 範圍內會額外標示是被誤攔的。**誤攔行為本身沒有改**——只是不再無聲。

`[TEST]` 用合成封包驗證過三種情況：

| 餵入 opcode | 進 dispatch chain？ | 現在的 log |
|---|---|---|
| `0x00250181` | ❌ 否（被誤攔） | dump + 誤攔警告 |
| `0x00020099` | ❌ 否（系統層未知訊息） | dump |
| `0x00250102` | ✅ 是 | 正常 |

**對逆向工作的影響：** 目前台帳裡所有已確認 opcode 的低位元組都 < 0x80，所以還沒實際咬到。但 `0x25xxxx` 有 28 個 ID、大半未定位，若其中有落在此區間者，在修正前是查不到的。之後若在 log 看到誤攔警告，該 opcode 要當成**正常 dispatch 訊息**登錄，並考慮是否要改分流條件（改動前先確認不會影響握手）。


### Keep Alive 早於 Time Sync 會打死整個 process

`client.js` 的 `getLocalTime()` 回傳 `Date.now() - this.start_`，而 `start_` 只在收到 **Time Sync（`0x00020082`）** 時才被設定，初始值是 `0`。

若客戶端在 time sync 之前送 **Keep Alive（`0x00020083`）**，`getLocalTime()` 會回傳 `Date.now()` 本身（約 1.79e12），塞不進 Acknowledge body 的 uint32。`writeUint32BE` 是**拋例外**而不是截斷，而這個例外沒有任何地方捕捉——結果是整個 process 死亡：兩個 listener 一起沒、所有連線一起掉、當下的封包紀錄就此中斷。

`[TEST]` 實際觸發過：合成客戶端在 time sync 前送 keepalive，server 立刻 `ERR_OUT_OF_RANGE` 崩潰。

**已修**（`client.js` `getLocalTime()`）：`start_` 未設定時回 `0`，並把結果夾在 `0 ~ 0xFFFFFFFF`。

| 情境 | 修正後 |
|---|---|
| keepalive 先於 time sync | ACK 回 0，不崩潰 ✅ |
| 正常流程（time sync 在前） | ACK 回真實經過毫秒 ✅ |

**對逆向工作的影響：** 正常客戶端會先 time sync，所以平常不會踩到。但逆向過程中會刻意送順序異常或畸形的封包試探，那時整個 session 連同紀錄一起消失的代價很高。

> 同類問題可能還有：dispatch handler 裡任何未捕捉的例外都會打死整個 process。目前**沒有**全域 `uncaughtException` 防護網。要不要加是獨立的決定（加了會讓錯誤更難被注意到）。

---

