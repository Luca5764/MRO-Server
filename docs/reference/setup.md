# 環境與執行方式

> 參考文件，需要時才讀。規則與陷阱摘要在 `AGENTS.md`。
> 2026-09-17 從 `AGENTS.md`（原 CLAUDE.md）「執行方式」與 `docs/HANDOFF.md`「環境」 原文搬來。

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

客戶端來源：上游 README 的 archive.org 連結（`https://archive.org/download/metal-rage-online-client/MetalRage%20Online/MetalRage%20Online.rar`）；操作者若記得是別的來源再更正。

**語系：** 現行客戶端同時帶著英文和繁體中文。`data/System/*.twt` 是目前用的語系（UTF-16LE），中文原檔改名成 `*.c_twt` 保留（31 個，只有 `ALAudio.twt` 沒有中文版），另外有 2 個 UI 貼圖 `data/Resource/twt/UI/*.c_dds`。根目錄 `switch.cmd` 依 `current_language.txt`（現在是 `english`）把 `.twt`／`.dds` 在中英文之間改名切換；它只改名、不改內容。要不要切由操作者決定。🟡 y0da 只檢查 `MetalRage.exe` 的 .text，語系檔應該不受影響，但沒實測。

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

## 讓區網第二台主機連進來（N0）

只給**同一個區網**的第二台主機用，不是對外開放。硬性約束第 2 條仍然適用：不要把伺服器暴露到不信任的網路。

### 方案：Windows `netsh interface portproxy` + 防火牆規則（選這個，不用 mirrored networking）

WSL2 預設 NAT 模式下，Windows 只會把 `127.0.0.1` 轉發進 WSL2；區網另一台主機連 Windows 的區網 IP 是連不到 WSL2 裡的伺服器的（這是 NAT 轉發的限制，跟本檔前面 `0.0.0.0` 那個綁定問題是兩回事，`0.0.0.0` 解決的是「Windows 本機連不到」，這裡要解決的是「區網其他機器連不到 Windows」）。

兩個候選方案：

| 方案 | 優點 | 缺點 |
|---|---|---|
| `netsh interface portproxy`（採用） | 不用重啟 WSL，不影響正在跑的伺服器 tmux session；[TEST] 這台機器（Windows 11 build 26200、WSL 2.6.3.0）實測腳本邏輯可行 | WSL2 的 IP（`ip addr` 的 `eth0`，這台機器目前是 `192.168.217.8/20`）每次 WSL 重啟都會變，portproxy 規則指向舊 IP 就失效，要重新執行腳本 |
| WSL2 mirrored networking（`.wslconfig` 加 `networkingMode=mirrored`） | 不會有 IP 漂移問題，區網主機直接連 Windows 的區網 IP | 改 `.wslconfig` 後**要 `wsl --shutdown` 才生效**，會把現在跑著的伺服器 tmux session 一起殺掉；本機另外裝了一張 VPN Client 虛擬網卡（`ipconfig /all` 可見，目前未連線），mirrored 模式下 VPN／虛擬網卡是否會被一併鏡像進 WSL、造成路由或防火牆規則意外命中，沒有把握，需要額外驗證 |

選 portproxy：因為不能重啟 WSL（會中斷伺服器），且「開一次區網、關掉」本來就是 per-session 的操作，重新查詢當下的 WSL IP 並不是額外負擔——腳本本來就會在每次執行時重新偵測 IP。

### 開（`lan-open.ps1`）／關（`lan-close.ps1`）

兩支腳本都在 `tools/win/`，**都要用系統管理員權限的 PowerShell 執行**（腳本開頭會檢查，不是管理員會直接報錯結束）。因為要系統管理員權限，**一律由操作者手動執行，AI 不要跑**。

```powershell
# 開（第二台主機要連進來之前跑一次；WSL 重啟過也要重跑一次）
cd '\\wsl.localhost\Ubuntu\home\lucas\mro-reverse\Metal Rage Online Server\tools\win'
.\lan-open.ps1

# 關（不需要區網存取時跑，會把 portproxy 規則和防火牆規則整個移除）
.\lan-close.ps1
```

`lan-open.ps1` 會自動抓 WSL2 目前的 IP（`wsl hostname -I`）和 Windows 這台機器的區網網段（排除 WSL 的 `vEthernet`、VPN、loopback 等虛擬介面），對 9211 與 30907 各建一條 `netsh interface portproxy` 轉發規則，並且各加一條 Windows 防火牆 inbound 規則（名稱前綴 `MRO-LAN-`，`RemoteAddress` 限制在偵測到的區網網段、`Profile` 限制在 Private/Domain，不含 Public）。自動偵測抓錯網段時可以用 `-Subnet 192.168.1.0/24` 這種參數覆寫。

`lan-close.ps1` 會刪掉 9211／30907 的 portproxy 規則，以及所有 `MRO-LAN-*` 開頭的防火牆規則，兩支腳本互為還原。

### 第二台主機怎麼驗證

在第二台主機（同一個區網）上，先確認能連到 Windows 主機的區網 IP：

```powershell
Test-NetConnection <Windows 主機的區網 IP> -Port 9211
Test-NetConnection <Windows 主機的區網 IP> -Port 30907
```

兩個都要 `TcpTestSucceeded : True`。

客戶端連線位址由命令列參數和兩個 ini 檔共同決定（見 `docs/reference/client.md`）：

- 啟動參數的 `ip=` 要改成 Windows 主機的區網 IP（不是 `127.0.0.1`）：`MetalRage.exe -globalid=TW&ip=<區網IP>&port=9211&age=30`
- `MetalRage.ini` 與 `Default.ini` 的 `ServerIP` **兩個檔案都要改**成同一個區網 IP。

### 怎麼在 session log 確認連線來源

`server.js` 每條連線建立時會呼叫 `packetlog.connection('connect', connId, { port, peer })`，`peer` 就是 `socket.remoteAddress:remotePort`，session log 裡看得到：

```
{"ev":"connect","conn":1,"port":9211,"peer":"127.0.0.1:32888"}
```

[GUESS]／⬜ 未驗證：`netsh interface portproxy` 在 Windows 上的實作是「代理」（proxy），不是單純的 NAT 轉發；沒有實測過它會不會保留原始來源 IP。如果 WSL 這邊的 `peer` 顯示的是 Windows 那張 WSL 專用虛擬網卡的 IP（這台機器是 `192.168.208.0/20` 網段），而不是第二台主機真正的區網 IP，代表 portproxy 沒有保留來源位址——這不算 bug，只是這個轉發方式的已知限制，不要因此去改 `server.js`。第一次用兩台機器測試時，操作者請截圖或貼 `peer` 欄位的值，確認是哪一種情況。


### 第二台主機的 log 與截圖

第二台的 `data\Log\MetalRage.log` 和截圖，從 WSL 讀不到。建議在第二台把 `C:\Games\MetalRage Online\data\Log` 和一個截圖資料夾設成**只限區網**的共用資料夾（唯讀即可），主機就能從 `\\<第二台IP>\...` 讀取。第二台第一份啟動基準存在 `docs/research/2026-09-19-second-client-win10/`。

## 資料庫

MySQL，資料表：`accounts`、`records`、`mech_levels`、`mech_licenses`、`items`、`tutorials`、`maps`、`friends`。

`account.dispatch.js` 在 DB 不可用時會送出硬編碼的預設值以避免客戶端崩潰。這是暫時性措施，不要把它當成正常路徑。

## 環境

- MySQL 已裝好、schema 已匯入(用 `metalrageserver.sql`,不是 `database/schema.sql`)
- 伺服器跑在 tmux session `server`;使用者已明確授權 Codex 控制 tmux（包含重啟伺服器），使用者仍可手動介入。客戶端遊戲操作仍由使用者執行。
- Ghidra 12.1.3 在 `~/tools/ghidra_12.1.3_PUBLIC`,專案在 `~/tools/mro-ghidra-proj`
- `tools/win/shot.sh` 截圖**可用**;`tools/win/drive.sh` 送輸入**無效**(前景視窗與 IME 都試過了,
  點擊也不進去)。**遊戲操作一律請使用者手動執行**,你只能觀察。

## 依作業系統選 exe

| 作業系統 | 用哪個 exe | SHA256 |
|---|---|---|
| Win11 | `data\System\MetalRage.exe`（上游 Win11 修改版） | `487646b0aafb9f586126876ef483825f60053e0166f59b74a7ca86ac437021b4` |
| Win10 | `data\System\_original_backup\MetalRage.exe`（原廠） | `419d927517e63fe73172840cf9b2237672b9890a590f16b334bf500d74da14a0` |

- 兩個檔案的差異在 `0x160–0x161`、`0x19213–0x19214`、`0x19237–0x19238`。
- ✅ [OBS] 2026-09-19：dusk 在第二台（Win10、原廠 exe）連續打完多場，保護層通過；xigncode.log 時間戳那一項結案。
- Win10 用錯 exe 時的特徵：Windows 事件 ID 1000、錯誤代碼 `0xc0000005`、錯誤模組 unknown、`xigncode.log` 沒有更新。朋友那邊出事時，先拿這幾項比對。
- Win7／Win8 完全沒有測過。
- 詳情見 `journal/2026-09-19-0010-win10-exe-and-second-client.md`。

### 讓第二台連進遊戲伺服器（publicHost）

登入伺服器會在 `Server_Add_SN 0x00220101` 告訴客戶端遊戲伺服器的位址。預設是 `127.0.0.1`，只有同一台機器連得到。要讓區網或 VPN 上的其他機器連進來，在 `Metal Rage Online Server/config/server.json` 設定：

```json
{ "publicHost": "192.168.1.105" }
```

- 填 Windows 主機在區網（或 VPN）上的 IP，不是 WSL 的 IP。改完要完整重啟伺服器。
- 設定之後，這台主機自己也會經過 portproxy 連進來。執行 `lan-close.ps1` 之前，要先刪掉 `server.json` 並重啟，否則連本機都連不上。
- 白名單：`config/allowed-users.json`（格式見 `allowed-users.example.json`，範例檔本身不會被讀取）。開放區網之前一定要設定。
- 測試 worktree 的這兩個檔案用 symlink 指到主目錄那份。

### PvE 多命測試（pveExtraLives）

同一個 `config/server.json` 可以加 `"pveExtraLives": 97`，讓 PvE 開戰的 `Game_User_SN 0x00222112` 多送一個 `GAME_ITEM_INFO.PveRespawnAddCount`，客戶端命數＝地圖 `DefNumLive`（初級通常 3）＋這個值（`ZModePve.uc:473-474`）。設成 97 大約等於 100 條命，方便測試不用一直重開房。不填或填 0＝行為不變。改完要完整重啟伺服器（不是 `/reload`，這個值只在啟動時讀一次）。依據見 `dispatch/room/room-game-user.sender.js` 的 LIVES 註解。

## 戰鬥 P2P（N2）

- 房主進戰場時，`MetalRage.exe` 會監聽 **UDP 30907**（2026-09-19 單人戰實測：`Get-NetUDPEndpoint` 顯示 `0.0.0.0:30907`）；在大廳時沒有任何監聽。其他玩家直接連房主這台。
- Windows 原本只有 Public 設定檔的 MetalRage 規則，家用網路是 Private，所以 UDP 被擋。每台可能當房主的機器（主機、筆電）都要用系統管理員身分執行 `tools/win/p2p-open.ps1`：加 Inbound UDP 30907、只限 Private、只限 `192.168.1.0/24`。要還原就執行 `p2p-close.ps1`。
- 這和主機上 `lan-open.ps1` 的 **TCP** 30907 portproxy 協定不同，不會衝突。
- 房主的區網 IP 寫在 `config/allowed-users.json` 該帳號的 `hostAddress`（D1-6）。
