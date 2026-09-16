# MRO-Server — Metal Rage Online 伺服器模擬器

## 這個專案是什麼

2009 年韓國 GameHi 開發的機甲 TPS《Metal Rage Online》（台版《鐵影特攻 Online》）的伺服器模擬器，Node.js 撰寫。原廠伺服器已於 2011 年停運，**沒有任何原始伺服器程式碼或歷史封包紀錄存在**。

因此這不是一般的功能開發專案，而是**逆向工程專案**。唯一的事實來源是客戶端執行檔本身的行為。所有關於協定的「知識」都是從客戶端 `ZNetwork.dll` 的殘留字串與實際封包觀察反推而來的假設。

---

## 最重要的工作原則

1. **不要把推測寫成事實。** 如果某個 opcode 的用途是猜的，就在註解與紀錄（見「協作與紀錄規則」）裡標記為假設，並寫下依據（DLL 字串？客戶端行為？猜的？）。錯誤的「已確認」比「未知」傷害更大，因為它會讓後面的推論整串歪掉。
2. **客戶端行為 > 我們的假設。** 任何衝突一律以客戶端實際反應為準。
3. **未知封包一定要留下完整 hex dump，絕對不要靜默吞掉。** 現有程式碼刻意保留這個行為，那是主要的資料來源。
4. **不要做大範圍重構。** 這是觀測型專案，log 格式與封包流程的穩定性比程式碼美觀重要得多。要重構請先問。
5. **每次修改 handler，請一併記錄是「客戶端做了什麼動作」觸發的。** 沒有這個上下文，三週後沒人看得懂為什麼要這樣寫。

---

## 協作與紀錄規則（所有 AI 都適用）

這個專案由好幾個 AI 輪流推進（Claude、Codex、Gemini），同一時間只有一個在動。這一節定下怎麼接手、怎麼交接、誰可以下結論。**本檔是唯一的規則檔**：Codex 與 Antigravity 直接讀 `AGENTS.md`，Claude Code 透過 `CLAUDE.md` 引入本檔。不要另外建 `GEMINI.md`。

### 等級與權限

| 等級 | 目前的模型 |
|---|---|
| **高階** | Claude 主力、Codex 主力（GPT-6 Astra）、Codex 的 reviewer（Astra） |
| **中階** | Gemini（Antigravity）、Codex 的 Luna 子 agent、Claude 的 Sonnet 子 agent |

**權限依「能不能下結論」來分，不依公司分。** 這個專案最貴的錯誤是把推測寫成已確認，錯的 ✅ 會讓後面整串推論跟著歪。

| 動作 | 高階 | 中階 |
|---|---|---|
| 提假設、設計實驗、解讀組語 | 可以 | 可以提，但要標「待審」 |
| 標 ✅ 已確認／❌ 已排除 | 可以 | **不可以** |
| 改 `docs/state.md` | 可以 | **不可以** |
| 寫日誌 `docs/journal/` | 可以 | 可以，結論一律標 🟡 或「待審」 |
| 存原始資料到 `docs/research/` | 可以 | 可以 |
| 改 handler 的預設行為 | 可以 | **不可以**，只能加預設關閉的開關 |
| 推翻已標 ✅ 的結論 | 可以，用追加更正的方式 | 只能寫疑點，等審查 |

**審查要跨公司：** Codex 做的由 Claude 審，Claude 做的由 Codex 的審查用模型審。Gemini 做的由下一個接手的高階審。審查時要核對「結論和證據對不對得上」，不只是程式對不對：

- 引用的 DLL 位址是否真的在做描述的事
- 引用的 log 行、封包、截圖是否真的存在
- 是否同時改了兩個變數
- 每個 ✅ 是否都有證據標籤

### 紀錄檔的結構

```
docs/
  HANDOFF.md          交接快照，最上面一段永遠是最新狀態
  state.md            現況：每個 opcode 一列，上限約 300 行，錯了就直接改（只有高階能改）
  backlog.md          已經寫成契約、可以直接交給中階做的任務
  journal/
    INDEX.md          一件事一行，只追加
    <日期>-<主題>.md   一個調查或實驗一個檔，50–100 行，只追加
  research/<日期>-<主題>/   decompile 輸出、hex dump 等大段原始資料
```

> **遷移中：** `docs/opcode-ledger.md` 是舊的單一台帳（快 1800 行），正在拆進上述結構。`state.md` 建好之前，以舊台帳為準，但**不要整份讀**，用 grep 找要的段落。舊台帳前後有矛盾（例如第 710 行 `Assist_SN` 的 opcode 已被第 1631 行更正），越後面越新。

**token 花在讀，不花在存。** 記多少都沒關係，重點是每次只讀需要的部分：

- 大段原始資料一律放 `research/`，日誌裡只放連結和一句結論。
- opcode 一律寫完整 8 位 hex（`0x00230121`），DLL 位址一律寫完整（`0x107f8fad`）。這樣 `grep -rl 0x00230121 docs/` 就能找出所有相關的檔。
- git 已經記下的（改了哪幾行、什麼時候改）不要重複寫。日誌只記 git 看不出來的：為什麼、依據是什麼、失敗過什麼。
- 發現舊內容錯了：在日誌追加更正，改 `state.md`，並在原條目加一行「已被 <檔名> 更正」。不刪也不改寫原條目。

### 證據標籤

狀態：`✅ 已確認`／`🟡 假設`／`⬜ 未知`／`❌ 已排除`

每個結論都要標來源：

| 標籤 | 意思 |
|---|---|
| `[DLL]` | 讀過組語或 decompile，附位址 |
| `[CACHE]` | 解析過 Cache.Bin 等客戶端資料檔，附 offset |
| `[LOG]` | 伺服器 session 紀錄或客戶端 `MetalRage.log`，附檔名 |
| `[SHOT]` | 截圖，附路徑 |
| `[OBS]` | 操作者親眼觀察的回報 |
| `[TEST]` | 做了什麼改動、結果如何 |
| `[GUESS]` | 推測，不能標 ✅ |

**沒有證據標籤，就不准標 ✅。** commit 訊息也一樣：只寫「改了什麼」，除非日誌已經有證據，否則不寫「因為什麼」。

### 接手時

依序讀，讀完就停：

1. `docs/HANDOFF.md` 最上面的快照
2. `docs/state.md`（大了之後只讀相關的那一份）
3. `docs/journal/INDEX.md` 最後 20 行
4. 要做哪個 opcode，就 grep 它，只讀找到的檔

然後**先驗證上一位最後標的一兩個 ✅**，再開始新工作。重新看一眼組語或紀錄就好，成本很低，但能擋住錯誤一路往下傳。

### 交接時（額度隨時可能用完，所以隨時都要準備好）

- **每完成一個小段落就 commit**，不要攢到最後。
- 工作目錄必須是乾淨的。沒做完就 commit 成 `wip: ...` 並寫明做到哪。**不准留下沒 commit 的半成品。**
- 更新 `HANDOFF.md` 最上面的快照，寫明下一步。下一步要寫成契約（見下）。
- commit 訊息最後一行加 `Agent: <工具> (<等級>)`，例如 `Agent: codex (高階)`、`Agent: gemini (中階)`。
- 高階的週額度快用完時（剩約 15%，操作者會提醒），除了快照，還要在 `docs/backlog.md` 寫 3–5 個契約任務給中階。

### 任務契約格式

交給別人做的任務，不論是子 agent、下一個 AI 或 backlog，都寫成這六項：

- **目標：** 一個具體結果
- **範圍：** 哪些檔案、哪些位址、哪個 session
- **背景：** 只給完成任務必需的資訊
- **限制：** 不能動什麼
- **交付：** 要回傳或產出什麼
- **完成條件：** 怎麼判斷做完了

執行的一方遇到以下情況要**停下來回報，不要自己擴大範圍**：需要做架構決策、要改範圍外的東西、發現跟既有 ✅ 矛盾、需要更深推理才能繼續。

回報只給結論、檔案路徑、位址或行號、執行過的指令，不要貼大段原始輸出。

### 只剩中階可用時（低額度模式）

- **只做 `docs/backlog.md` 裡的任務。清單做完就停，不要自己找事做。**
- 程式改動放 `flash-wip` 分支，等高階審過再合併。日誌和 research 可以直接 commit 到工作分支。
- 不改資料庫（除非是 commit 進去的腳本）、不改預設行為、不標 ✅。
- 中階寫的東西在 `INDEX.md` 標「待審」。高階回來後的**第一件事**就是清掉待審清單。

### 各工具自己的機制

規則在本檔，怎麼分派子 agent 由各工具自己實作：

- **Codex：** `.codex/agents/*.toml` 與 `.agents/skills/astra-orchestrator`。其他工具忽略這兩個目錄。
- **Claude Code：** `.claude/agents/*.md`（explorer、worker、verifier，都用 Sonnet）。
- **Antigravity：** 沒有更高階的模型，只擔任中階。

### 這個專案沒有自動化測試

真正的測試是操作者開遊戲操作。「驗證」在這裡是指：

- 切 session 紀錄、對照客戶端 `MetalRage.log`、看截圖
- 用舊封包離線重播或比對
- 讀組語確認封包偏移

客戶端和伺服器都只有一套，**實驗不能平行**，只有分析工作可以平行。**一次只改一個變數。**

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

### ⚠️ 在 WSL2 跑伺服器、客戶端在 Windows：一定要綁 IPv4

`server.js` 現在明確 `listen(port, '0.0.0.0')`。**不要改回 `listen(port)`。**

Node 的 `listen(port)` 不指定 host 時綁的是 `::`（IPv6 dual-stack），而 WSL2 在預設 NAT 模式下**只會把 IPv4 的監聽轉發給 Windows**。綁在 `::` 的伺服器從 WSL 內部連得到、從 Windows 的 `127.0.0.1` 連不到——症狀看起來完全像客戶端設定錯誤，非常難查。

`[TEST]` 實測（WSL2 NAT 模式 + Windows 11 build 26200）：

| WSL 內監聽位址 | Windows 連 `127.0.0.1` |
|---|---|
| `::`（`listen(port)` 預設） | ❌ 連不到 |
| `0.0.0.0`（明確指定） | ✅ 連得到 |
| WSL IP 直連（如 `192.168.217.8`） | ✅ 連得到，但 IP 每次重啟會變 |

客戶端是 2009 年的遊戲，只用 IPv4，綁 `0.0.0.0` 沒有任何損失。

（另一個解法是在 Windows 的 `%USERPROFILE%\.wslconfig` 加 `networkingMode=mirrored`，但那會影響整台機器的 WSL 網路行為，不如直接綁 IPv4。）

### 本機安裝現況（這台機器）

客戶端裝在 Windows 的 `C:\Games\MetalRage Online`，並已套用 shanzenos 的 Win11 修正（patch 過的 `MetalRage.exe`、`D3D9Drv.dll`、三個 DLL；原檔備份在 `data\System\_original_backup\`）。`MetalRage.ini` 與 `Default.ini` 的 `ServerIP` 都已改為 `127.0.0.1`。

repo 根目錄的 `MetalRage` 是指向它的 symlink（已 gitignore），所以 WSL 裡的伺服器能讀到 `Cache.Bin`——開機時應該看到 `Loaded 1268 Cache.Bin item indexes`。

啟動遊戲用 `C:\Games\MetalRage Online\Play Metal Rage Online.bat`，**第一次必須以系統管理員身分執行**（要寫一個 SEHOP 的 registry key，之後就不用了）。

### Cache.Bin

`room.dispatch.js` 開機時會找客戶端的 `MetalRage/Data/System/Cache.Bin` 來建立道具索引，搜尋順序是：從 cwd 逐層往上找 → `<repo 的上一層>/MetalRage/Data/System/Cache.Bin` → `~/Desktop/MetalRage/Data/System/Cache.Bin`。

找不到只會印一行警告然後繼續跑，不會中斷——但商店的道具索引會是空的。
MySQL 連線設定在 `database/config.json`（預設 `root@127.0.0.1:3306`、無密碼、database 名稱 `mro`）。

### ⚠️ 用 `metalrageserver.sql`，不要用 `database/schema.sql`

兩個檔案**不等價**。`schema.sql` 只建 8 張表，`metalrageserver.sql` 另外建了 `catalog` 與 `item_catalog`——而 `db.js` 的 `getItemCatalog()` 正是 `FROM catalog c LEFT JOIN item_catalog ic`。只灌 `schema.sql` 的話商店會炸在 `ER_NO_SUCH_TABLE`。

```bash
sudo mysql -e "CREATE DATABASE mro CHARACTER SET utf8mb4;"
sudo mysql mro < metalrageserver.sql
```

### 建帳號

**協定裡沒有註冊流程，也沒有密碼驗證——但伺服器會自動建帳號。** `account.dispatch.js` 的 `handleLogin()` 查不到 username 時會直接 `db.createAccount(username, username, 101)`，所以任何沒看過的 username 第一次登入就會成為一個新帳號，nickname 等於 username、pilot 固定 101。

想指定不同的 nickname 或 pilot，就在登入前先用工具建：

```bash
node tools/create-account.js <username> <nickname> [pilot]   # pilot 101 或 102
```

兩條路都是呼叫 `db.createAccount()`，會在同一個 transaction 裡建好 record、8 個機體等級、8 張授權、6 張地圖、4 個教學與初始裝備，帳號權限固定 4（Dev）。工具額外做了重名檢查，以及連不到 DB / 沒有 database / 沒有表三種情況的對應提示。

> **`accounts` 表沒有密碼欄位。** 登入只需要一個存在的 username。這是目前伺服器的設計而非疏漏，但意味著**不要把這個伺服器暴露在你無法控制的網路上**。

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

---

## 客戶端（逆向對象）

完整筆記見 `docs/client-notes-upstream.md`（上游 Win11 Fix 附的文件原文，非我們自己的發現）。以下是對逆向工作影響最大的幾點。

### 啟動與連線

客戶端的伺服器位址**同時**由命令列參數與 ini 決定：

```
MetalRage.exe -globalid=TW&ip=127.0.0.1&port=9211&age=30
```

`globalid=TW` 就是台版（鐵影特攻）。另外 `MetalRage.ini` 與 `Default.ini` **兩個檔案都**要設 `ServerIP`，原廠預設值是 `172.31.23.56`，不改會連錯地方。

客戶端原本會連的網域：`mr.wasabii.com.tw`、`patchmr.wasabii.com.tw`、`loginmr.wasabii.com.tw`。Wasabii 就是台灣代理商紅心辣椒——這也解釋了為什麼登入 opcode 叫 `CQ_LOGIN_WASABII`。

### ⚠️ 保護機制決定了哪些逆向手段可行

客戶端有四層保護，這直接限制了「能不能動態觀察客戶端」：

| 層 | 內容 | 對我們的意義 |
|---|---|---|
| y0da Protector v1.03 | 監控 `MetalRage.exe` 整個 `.text` 的 CRC | **改 `.text` 任何一個 byte → 約 5 秒後崩潰** |
| Themida ×2 | 保護 `ZNetwork.dll`（2009 層 import 虛擬化 + 2010 層完整性檢查） | 我們的 opcode 名稱來源就是這個 DLL，靜態分析困難 |
| xsign | 攔截遊戲行程內的檔案建立 | 想讓客戶端自己吐 log 不可行 |
| Anti-Attach | 阻擋執行期附加除錯器 | **不能直接 attach debugger** |

**可行的切入點**（文件明列為 safe）：vtable／data patch、DLL hook（掛在companion DLL，不要碰 `MetalRage.exe`）、`VirtualAllocEx` 的 shellcode cave。

> y0da 的監控執行緒**不要砍**——文件明講停掉它們反而會崩潰。

這些合起來解釋了為什麼這個專案只能從伺服器端觀察封包：客戶端那側幾乎所有常規手段都被擋住了。**伺服器 log 就是我們唯一的窗口**，這也是為什麼封包紀錄值得做得這麼講究。

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

---

## 封包紀錄（觀測工具）

`packetlog.js` 在 `client.js` 的收發咽喉點各掛一個 hook，把**每一個封包、雙向**寫成 JSONL，一行一筆。這是加在既有 console 輸出**旁邊**的，那 190 多個 `console.log` 一個都沒動。

每筆帶：時間戳、相對毫秒、連線編號、port、方向、opcode、長度、完整 body hex，以及當下的場景狀態快照（`accountId`／`roomIndex`／`mapId`／`gameMode`／`gameStarted` 等，沒設的欄位自動省略）。另外會記 `connect`／`close`／`marker`，以及沒有任何 service 認領的 `unhandled`。

**寫入是同步的，這是刻意的。** 一個 session 裡最有價值的封包通常是客戶端崩潰前的最後一個，那正是有緩衝的 stream 會弄丟的那一個。

### Marker：把「我做了什麼」釘進時間軸

Marker 有三個來源，紀錄裡會標明是哪一種。

**1. 遊戲內聊天（推薦）** — 在遊戲聊天框打的每一句話都會自動成為 marker。不用 alt-tab，而且它就落在自己所描述的封包旁邊。這是實際操作中最好用的方式。

**2. 伺服器 console** — 直接在終端機打字按 Enter。非互動終端會自動略過，用 .bat 或背景跑不受影響。

**3. 自動（`src: auto`）** — 伺服器在自己看得到的狀態轉換時自行標記，操作者不用做任何事。戰鬥中根本沒空打字，所以這些邊界由伺服器自己劃：

- `gameStarted_` 由 false 轉 true
- 跨重連還原 session
- 送出 `Ready_Host_SQ` / `Ready_Success_SN` / `BeginRound_SN` / `Game_Start_SA` / `Game_Start_SN`

**Marker 框的是區間，不是瞬間。** 動作前後各打一個，中間全部就是候選。更有效的做法是**一次 session 只做一件事**——紀錄檔很便宜，髒了就丟掉重錄。

### 自己看畫面

```bash
tools/win/shot.sh                  # 截遊戲視窗
tools/win/shot.sh --full           # 截整個桌面
tools/win/drive.sh click 512,300   # 點擊（視窗相對座標）
tools/win/drive.sh key '{F5}'
tools/win/drive.sh type '進訓練場'  # 打進遊戲聊天框 → 自動成為 marker
```

**為什麼要有這個：** 這個專案的判斷大量依賴「畫面上發生了什麼」，而轉述過的畫面不是觀察。曾有一張只框到標題列的截圖被當成「畫面全白」，據此做了兩次錯誤的回歸判定，再據此建立了一整套錯誤的場景切換理論——台帳裡連續數條記錄因此作廢。

> **`drive.sh` 的鍵盤輸入對本客戶端無效**，成因未定（見台帳）。同樣的方法對記事本完全正常，所以不是工具壞掉。保留是因為它對其他視窗可用，但**不要期待能自動操作遊戲**。截圖才是這組工具的價值所在。
>
> `drive.sh` 會**奪取前景並移動滑鼠**，等於接管機器。操作者正在使用電腦時不要跑。
>
> 只用作業系統層級的輸入，**不注入行程、不附加除錯器**——客戶端有 y0da、Themida 與 anti-attach，那條線本專案不碰。

### 客戶端自己的 log

`C:\Games\MetalRage Online\data\Log\MetalRage.log`（WSL 路徑 `MetalRage/data/Log/MetalRage.log`）。

**不要忽略這個檔案。** 它是單位元組編碼（不是 UTF-16），客戶端持續寫入，內容包含 `ScriptLog` 與引擎的 `Browse`／`LoadMap` 記錄——也就是**客戶端如何理解目前狀態**，這是封包看不出來的。開戰流程卡關的關鍵發現就是從這裡讀到的（客戶端組出的 travel URL 全是預設值）。

崩潰時它也會寫下完整的 `Critical:` 呼叫堆疊。

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

## 目前進度

**不在這裡維護。** 目前狀態看 `docs/HANDOFF.md` 最上面的快照，各 opcode 的狀態看 `docs/state.md`。
規則檔只放不常變動的東西。這裡以前放過一份進度清單，後來過時了還繼續誤導人（例如列為「完全未實作」的 `Death_CN/SN`、`Respawn_CN/SN`、`Game_User_SN` 其實都已經做好了）。

大方向：登入 → 大廳 → 房間 → 進入 `Map_PC01` → 生成機體 → 死亡與重生，這條路已經打通。
接下來的難點不在「客戶端會送什麼」（可以逼它送），而在「伺服器該回什麼」。傷害結算、分數同步、回合結束的規則只存在於已經消失的伺服器裡，只能靠讀 DLL 和試錯逼近。

---

## 調查新 opcode 的標準流程

1. 啟動伺服器，**先在 console 打一行 marker** 描述你接下來要做什麼
2. 在客戶端做一個**單一、明確**的動作，然後再打下一個 marker
3. `node tools/slice.js <檔名> -m <編號>` 切出那個動作造成的所有封包
4. 用 `--unhandled` 找出沒人認領的，記下：觸發動作、opcode、body 長度、hex
5. 比對 DLL 字串裡的候選名稱，形成假設
6. 寫一個最小回應試打，觀察客戶端是否前進或斷線
7. 不論成功與否，都寫一篇日誌（`docs/journal/`）；高階另外更新 `docs/state.md`

**失敗的嘗試和成功的一樣有價值**，請一併記錄，避免未來重複試同一條死路。
