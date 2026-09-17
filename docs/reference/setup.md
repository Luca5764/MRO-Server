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

## 資料庫

MySQL，資料表：`accounts`、`records`、`mech_levels`、`mech_licenses`、`items`、`tutorials`、`maps`、`friends`。

`account.dispatch.js` 在 DB 不可用時會送出硬編碼的預設值以避免客戶端崩潰。這是暫時性措施，不要把它當成正常路徑。

## 環境

- MySQL 已裝好、schema 已匯入(用 `metalrageserver.sql`,不是 `database/schema.sql`)
- 伺服器跑在 tmux session `server`;使用者已明確授權 Codex 控制 tmux（包含重啟伺服器），使用者仍可手動介入。客戶端遊戲操作仍由使用者執行。
- Ghidra 12.1.3 在 `~/tools/ghidra_12.1.3_PUBLIC`,專案在 `~/tools/mro-ghidra-proj`
- `tools/win/shot.sh` 截圖**可用**;`tools/win/drive.sh` 送輸入**無效**(前景視窗與 IME 都試過了,
  點擊也不進去)。**遊戲操作一律請使用者手動執行**,你只能觀察。
