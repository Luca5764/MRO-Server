# 協定與伺服器架構

> 參考文件，需要時才讀。規則與陷阱摘要在 `AGENTS.md`。
> 2026-09-17 從 `AGENTS.md`「架構」「線路格式」「Session 狀態」「系統層訊息」「Opcode 命名慣例」與 `docs/HANDOFF.md`「協定備忘」 原文搬來。

## 架構

單一 process 內開兩個 TCP listener（`server.js`）：

| Port | 名稱 | 負責 |
|---|---|---|
| 9211 | DispatchServer | 帳號登入、Gate（伺服器／頻道選擇） |
| 30907 | GameServer | 大廳、房間、對戰、社群等 |

服務註冊在 `dispatch.js`（9211）與 `game.js`（30907）。

**dispatch 順序有意義**：每個服務的 `dispatch()` 回傳 `true` 代表已處理，第一個回傳 true 的就結束。例如 `ZGameLoginDispatch` 必須排在 `ZGateGameDispatch` 前面，因為前者只攔截 `0x110124` 與 `0x220111`，剩下的 `0x22xxxx` 才交給後者。改動順序會造成難以察覺的行為變化。

```
client.js        連線狀態、封包組frame、握手／keepalive
message.js       pack / unpack / peekLength（混淆與 CRC）
packetlog.js     結構化封包紀錄（JSONL）
session.js       跨重連存活的帳號 session 狀態
tools/slice.js   紀錄檔的查詢／切片工具
tools/create-account.js  建立可登入的帳號
tools/disasm.py          反組譯客戶端 DLL（sections/exports/at/func/xref/str）
tools/dispatch-map.py    還原 opcode → handler 映射
tools/ghidra/            Ghidra headless 反編譯（decompile.sh <位址>）
tools/win/               從 WSL 截圖與操作 Windows 上的客戶端
shots/                   截圖輸出（已 gitignore）
logs/            紀錄輸出（已 gitignore）
dispatch/        各命名空間的 handler
dispatch/room/   房間相關的 SN 送出邏輯（被 room.dispatch.js 呼叫）
database/db.js   MySQL 存取
static/          客戶端 patch 檔與遊戲資源（約 1.2GB）
```

> **注意：`static/` 約 1.2GB，不要整包掃描或讀取。** 需要時只針對特定檔案操作。
>
> 本機目前用 sparse checkout 把它排除在工作目錄外（`.git` 裡仍有 blob）。要取回：
> ```bash
> git sparse-checkout set --no-cone '/*'
> ```
> 要再次排除：
> ```bash
> git sparse-checkout set --no-cone '/*' '!/Metal Rage Online Server/static'
> ```

## 線路格式（wire format）

### Header：固定 16 bytes（0x10）

| Offset | 型別 | 內容 |
|---|---|---|
| 0x00 | uint32 **BE** | CRC32 校驗碼 |
| 0x04 | uint16 **BE** | sequence |
| 0x06 | uint16 **BE** | 封包總長度（含 header） |
| 0x0C | uint32 **BE** | message type（opcode） |
| 0x10 | — | body 起點 |

### 混淆與校驗（`message.js`）

不是真正的加密，而是拿 CRC32 查表當 keystream：

```
對 i 從 4 到 len-1：
    byte[i] ^= (crc_table[i & 0xff] ^ salt) & 0xFF
CRC32 計算範圍為 bytes[4 .. len-1]，以 BE 寫入 offset 0x00
```

- `salt` 初始值 `0xf0f00f0f`
- 握手完成後改為 4 個隨機 byte 的 `readUint32LE ^ readUint32BE`
- `peekLength()` 用來在不破壞緩衝區的情況下解出長度欄位（offset 6–7）
- TCP 可能黏包或斷包，`client.js` 用 `recvbuf_` 累積後逐 frame 處理

### ⚠️ 客戶端拒收超過 0x400 bytes 的 frame

`ZNetwork.dll 0x107f8fad`：header 長度欄位大於 `0x400`（1024，含 16 bytes header）就驗證失敗。失敗的 frame 不會被消化，**這條連線之後的所有封包也全部卡住**，客戶端不會斷線也不會報錯，看起來只是「沒反應」。`client.js` 的 `send()` 遇到這種封包會印 `!!` 並寫一個 auto marker。清單類封包（例如 ItemInfo 一筆 35 bytes，單包最多 28 筆）必須注意大小。

### ⚠️ Header 是 BE，body 幾乎都是 LE

這是最容易踩的雷。header 欄位用 `writeUint16BE`／`writeUint32BE`，但 body 內的欄位普遍是 `writeUint16LE`／`writeUint32LE`。字串則是 **UTF-16LE 且以 `\0` 結尾**（例如房間名稱）。

### 兩種 buffer 取得方式，行為不同

| 函式 | 位置 | 是否補齊 16-byte 對齊 |
|---|---|---|
| `client.getMessageBuffer(type, size)` | `client.js` | **會**補齊 |
| `getExactMessageBuffer(type, bodySize)` | `room.dispatch.js:175`／`community.dispatch.js:15`（**同一份實作重複定義兩次**） | **不會**補齊 |

某些封包客戶端會嚴格檢查長度，選錯會直接被斷線。修改既有程式碼時不要隨手替換。

## Session 狀態（`session.js`）

**客戶端在一次遊玩中不會只用一條連線。** 切換到遊戲地圖時它會斷線並重新登入（原廠是 `ClientTravel` 到 `IP:Port/MapName`）。

dispatch handler 的狀態全部掛在 `NetworkClient` 上，所以那一斷就全沒了。`gameStarted_` 尤其致命：`game.dispatch.js` 只在它為真時才開始 ready／round 流程，重連後它是 `undefined`，於是伺服器把場景進入通知當成大廳訊息回應，**對戰永遠不會開始**。這就是 `0x25xxxx` 長期挖不動的真正原因。

`session.js` 改以 `accountId` 為鍵保存這些狀態，在 `handleGameLogin()` 設定 `client.accountId_` 的那一刻還原。

### ⚠️ 哪些帶、哪些不帶

**帶**（意圖與位置）：`gameStarted_`、`campaignStarted_`、`isTrueCampaign_`、`roomIndex_`、`roomType_`、`rawRoomType_`、`roomName_`、`mapId_`、`mapSeed_`、`gameMode_`、`maxPlayers_`、`campaignRoom_`、`campaignMapCacheKey_`、`currentHangarSlot_`

**不帶**，理由很重要：

- `roomMasterSent_`、`roomEnterAcked_`、`gameUserBootstrapSent_`、`readyHostHandshakeSent_` 等——這些是「**這條連線**已經送過」的旗標。新連線什麼都沒送過，帶過去會讓它跳過該送的 bootstrap。
- `roomStateRetryTimers_`——裝的是屬於舊連線的 timer handle。
- `accountId_`、`nickname_`、`pilot_`、`username_`——重新驗證時本來就會從 DB 重建。

兩條規則：儲存時**只存有定義的值**（沒有房間概念的連線不會清掉別人記下的狀態）；還原時**新連線自己設過的值優先**（這條連線上真實發生的改變不會被舊值蓋掉）。

> `session.js` 不改變伺服器送出任何東西，它只改變狀態存放的位置。它也應該永遠只做這件事。

## 系統層訊息（不會進到 dispatch）

`type & 0x80` 為真的訊息由 `client.js` 的 `onInternalMessage()` 直接處理：

| Opcode | 用途 |
|---|---|
| `0x00020080` | Handshake（客戶端發起） |
| `0x00020081` | Handshake response（含 secret 與 salt 素材） |
| `0x00020082` | Time sync，需驗證 secret 相符 |
| `0x00020083` | Keep alive，客戶端約每 30 秒送一次 |
| `0x00020084` | Acknowledge |

## Opcode 命名慣例

來自客戶端 DLL 的字串，字尾代表方向：

| 後綴 | 意義 |
|---|---|
| `CQ` | Client Question（客戶端請求） |
| `SA` | Server Answer（伺服器回應請求） |
| `SN` | Server Notification（伺服器主動推送） |
| `CN` | Client Notification（客戶端主動推送） |
| `CA` | Client Answer（客戶端回應伺服器詢問） |
| `SQ` | Server Query（伺服器詢問客戶端） |

**慣例：奇數 opcode 為 CQ，其 SA 為 `opcode + 1`。** 現有程式碼多處利用這點做 fallback 自動回應。

標準回應 body（`FNETWORK_EVENT_INFO`，6 bytes）：

```
uint16 LE  EventMessage   // 0 = OK
uint32 LE  ErrorMessage   // 0 = OK
```

### 命名空間

> ⚠️ **這張表是伺服器端 dispatch 檔的分法，不是客戶端的。** 客戶端實際上：`0x0023xxxx` 大多屬於 `ZDispatchGame`（對戰），`0x0025xxxx` 屬於 `ZDispatchCard`，對戰在 `0x0022xxxx`／`0x0023xxxx`／`0x0042xxxx`。見 `docs/state.md` 第 1、5 節。

| 前綴 | 對應 dispatch |
|---|---|
| `0x11xxxx` | Login（含遊戲伺服器重新驗證） |
| `0x21xxxx` | Account（資訊／建立） |
| `0x22xxxx` | Gate（伺服器／頻道、房間建立、社群） |
| `0x23xxxx` | Lobby |
| `0x24xxxx` | Room（含 Hangar） |
| `0x25xxxx` | Game（對戰中） |
| `0x26xxxx` | Quest / License |
| `0x31xxxx` | Postbox |
| `0x32xxxx` | Card |
| `0x36xxxx` | Clan |
| `0x41/42/51xxxx` | Community 其他 |

注意：房間相關的 SN 有部分實際走 `0x2202xx`／`0x2203xx`／`0x2204xx`，不是 `0x2405xx`。詳見 `room.dispatch.js` 開頭註解。

## 協定備忘

- 16-byte header:CRC32 @0x00(BE)、sequence @0x04(BE)、length @0x06(BE)、opcode @0x0C(BE)
- **body 欄位幾乎全是 LE**。混淆是 CRC32 table 當 keystream 做 XOR,不是加密
- opcode 慣例:奇數 = CQ/CN,SA/SN = opcode+1
- **場景閘門**:每個 `ZDispatch*::Check(SCENE_TYPE)` 設 `*(this+4)`,每個 handler 都先測它。
  `ZDispatchWaiting`=場景 1,`ZDispatchRoom`=場景 5 或 6,`ZDispatchGame`=**場景 6**。
  送錯場景的封包會被靜默丟棄——這是本輪 `Game_User_SN` 失效的原因之一,務必先確認場景。
- `ZNetwork.dll` ImageBase `0x10700000`,所有 section 的 RVA == 檔案偏移
