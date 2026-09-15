# MRO-Server — Metal Rage Online 伺服器模擬器

## 這個專案是什麼

2009 年韓國 GameHi 開發的機甲 TPS《Metal Rage Online》（台版《鐵影特攻 Online》）的伺服器模擬器，Node.js 撰寫。原廠伺服器已於 2011 年停運，**沒有任何原始伺服器程式碼或歷史封包紀錄存在**。

因此這不是一般的功能開發專案，而是**逆向工程專案**。唯一的事實來源是客戶端執行檔本身的行為。所有關於協定的「知識」都是從客戶端 `ZNetwork.dll` 的殘留字串與實際封包觀察反推而來的假設。

---

## 最重要的工作原則

1. **不要把推測寫成事實。** 如果某個 opcode 的用途是猜的，就在註解與 `docs/opcode-ledger.md` 裡標記為假設，並寫下依據（DLL 字串？客戶端行為？猜的？）。錯誤的「已確認」比「未知」傷害更大，因為它會讓後面的推論整串歪掉。
2. **客戶端行為 > 我們的假設。** 任何衝突一律以客戶端實際反應為準。
3. **未知封包一定要留下完整 hex dump，絕對不要靜默吞掉。** 現有程式碼刻意保留這個行為，那是主要的資料來源。
4. **不要做大範圍重構。** 這是觀測型專案，log 格式與封包流程的穩定性比程式碼美觀重要得多。要重構請先問。
5. **每次修改 handler，請一併記錄是「客戶端做了什麼動作」觸發的。** 沒有這個上下文，三週後沒人看得懂為什麼要這樣寫。

---

## 執行方式

程式碼在子資料夾 `Metal Rage Online Server/`（名稱含空格，路徑要引號），指令都在那裡面跑：

```bash
cd "Metal Rage Online Server"
npm install
npm start        # 啟動雙伺服器（9211 + 30907）
npm run http     # 啟動 launcher/patch 用的 HTTP 服務
```

相依套件：`express`、`mysql2`。
MySQL 連線設定在 `database/config.json`（預設 `127.0.0.1:3306`，database 名稱 `mro`）。
資料表由 `metalrageserver.sql` / `database/schema.sql` 建立。

**目前沒有自動註冊機制，帳號必須手動寫進 `accounts` 資料表。**

---

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
tools/slice.js   紀錄檔的查詢／切片工具
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

---

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

### ⚠️ Header 是 BE，body 幾乎都是 LE

這是最容易踩的雷。header 欄位用 `writeUint16BE`／`writeUint32BE`，但 body 內的欄位普遍是 `writeUint16LE`／`writeUint32LE`。字串則是 **UTF-16LE 且以 `\0` 結尾**（例如房間名稱）。

### 兩種 buffer 取得方式，行為不同

| 函式 | 位置 | 是否補齊 16-byte 對齊 |
|---|---|---|
| `client.getMessageBuffer(type, size)` | `client.js` | **會**補齊 |
| `getExactMessageBuffer(type, bodySize)` | `room.dispatch.js:175`／`community.dispatch.js:15`（**同一份實作重複定義兩次**） | **不會**補齊 |

某些封包客戶端會嚴格檢查長度，選錯會直接被斷線。修改既有程式碼時不要隨手替換。

---

## 封包紀錄（觀測工具）

`packetlog.js` 在 `client.js` 的收發咽喉點各掛一個 hook，把**每一個封包、雙向**寫成 JSONL，一行一筆。這是加在既有 console 輸出**旁邊**的，那 190 多個 `console.log` 一個都沒動。

每筆帶：時間戳、相對毫秒、連線編號、port、方向、opcode、長度、完整 body hex，以及當下的場景狀態快照（`accountId`／`roomIndex`／`mapId`／`gameMode`／`gameStarted` 等，沒設的欄位自動省略）。另外會記 `connect`／`close`／`marker`，以及沒有任何 service 認領的 `unhandled`。

**寫入是同步的，這是刻意的。** 一個 session 裡最有價值的封包通常是客戶端崩潰前的最後一個，那正是有緩衝的 stream 會弄丟的那一個。

### Marker：把「我做了什麼」釘進時間軸

伺服器跑起來後，直接在 console 打字再按 Enter，那行字就會插進紀錄裡。**在客戶端做動作前先打**，之後就能精準切出那個動作造成的封包：

```
> 進訓練場
> 開第一槍
```

（非互動終端會自動略過，用 .bat 或背景跑不受影響。）

### 查紀錄

```bash
cd "Metal Rage Online Server"
node tools/slice.js                        # 列出所有 session
node tools/slice.js <檔名>                  # marker 清單 + opcode 統計
node tools/slice.js <檔名> -m 2             # 切出 marker 2 到 marker 3 之間
node tools/slice.js <檔名> -m 2 -s          # 同上，只要 opcode 次數
node tools/slice.js <檔名> --unhandled      # 只看沒人認領的
node tools/slice.js <檔名> --op 0x00250102  # 只看某個 opcode
node tools/slice.js <檔名> --dump           # hex 改用 offset dump 排版
```

> **注意：`send` 方向的長度是實際上線位元組，含填充。** `getMessageBuffer` 會補到 16-byte 對齊，所以一個邏輯上 6 bytes 的 EVENT_INFO 在紀錄裡會顯示 16 bytes、後面拖 10 個 `00`。這是對的（線上真的是這樣），但不要誤判成 body 結構。

---

## 系統層訊息（不會進到 dispatch）

`type & 0x80` 為真的訊息由 `client.js` 的 `onInternalMessage()` 直接處理：

| Opcode | 用途 |
|---|---|
| `0x00020080` | Handshake（客戶端發起） |
| `0x00020081` | Handshake response（含 secret 與 salt 素材） |
| `0x00020082` | Time sync，需驗證 secret 相符 |
| `0x00020083` | Keep alive，客戶端約每 30 秒送一次 |
| `0x00020084` | Acknowledge |

---

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

---

## 資料庫

MySQL，資料表：`accounts`、`records`、`mech_levels`、`mech_licenses`、`items`、`tutorials`、`maps`、`friends`。

`account.dispatch.js` 在 DB 不可用時會送出硬編碼的預設值以避免客戶端崩潰。這是暫時性措施，不要把它當成正常路徑。

---

## 目前進度與主要缺口

**可運作：** 帳號登入、頻道進入、房間建立與配對、好友、進入訓練模式。

**主要缺口：實際戰鬥（`0x25xxxx`）。**
`game.dispatch.js` 目前只真正處理三個 opcode：

- `0x00250102` 遊戲場景進入通知
- `0x00250204` Ready_Host_CA
- `0x00250202` 其他玩家準備通知（忽略）

其餘一律落入 default 分支，用「奇數就回 `type+1` 加一個空的 EVENT_INFO」矇混過去，只為了不讓客戶端卡死。

從 DLL 字串已知存在但**完全未實作**的：`Death_CN/SN`、`Respawn_CN/SN`、`Assist_CN/SN`、`Bomb_CN/SN`、`Capture_CN/SN`、`Conquest_CN/SN`、`Boss_CN/SN`、`Campaign_CN/SN`、`ChangeSlot_CN/SN`、`Game_Score_SN`、`Game_User_SN`、`EndRound_SN`、`EndGame_SN` 等。

這些的難點不在於「客戶端會送什麼」（可以逼它送），而在於「伺服器該回什麼」——傷害結算、死亡判定、分數同步的規則只存在於已消失的伺服器裡，只能靠試錯逼近。

---

## 調查新 opcode 的標準流程

1. 啟動伺服器，**先在 console 打一行 marker** 描述你接下來要做什麼
2. 在客戶端做一個**單一、明確**的動作，然後再打下一個 marker
3. `node tools/slice.js <檔名> -m <編號>` 切出那個動作造成的所有封包
4. 用 `--unhandled` 找出沒人認領的，記下：觸發動作、opcode、body 長度、hex
5. 比對 DLL 字串裡的候選名稱，形成假設
6. 寫一個最小回應試打，觀察客戶端是否前進或斷線
7. 不論成功與否，都把結果寫進 `docs/opcode-ledger.md`

**失敗的嘗試和成功的一樣有價值**，請一併記錄，避免未來重複試同一條死路。
