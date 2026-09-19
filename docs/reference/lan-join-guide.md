# 同區網連線步驟（給玩家）

適用：跟伺服器主機在同一個家用網路（192.168.1.x）。伺服器主機是 Lucas 那台（`192.168.1.105`）。

## A. 伺服器主機（Lucas）：每次開玩前

1. 確認伺服器在跑（tmux `server`，AI 會處理）。
2. **WSL 重開過才需要：** 用系統管理員 PowerShell 跑 `tools\win\lan-open.ps1`。
3. 新玩家第一次來：把他的遊戲名稱加進 `config/allowed-users.json`。
   - 要讓他當房主開戰，就用 `{ "name": "名稱", "hostAddress": "他的區網IP" }` 格式。
   - 改完要重啟伺服器（AI 處理）。

## B. 玩家電腦：只做一次

1. **裝客戶端**：解壓到 `C:\Games\MetalRage Online`。
2. **選對 exe**：
   - **Win11**：不用動。
   - **Win10**：把 `data\System\_original_backup\MetalRage.exe` 複製到 `data\System\`，覆蓋原本的 `MetalRage.exe`。用錯的話，遊戲一開就閃退。
3. **改伺服器位址**，三個地方都改成 `192.168.1.105`：
   - `Play Metal Rage Online.bat` 最後一行的 `ip=127.0.0.1` → `ip=192.168.1.105`
   - `data\System\MetalRage.ini` 的 `ServerIP=`
   - `data\System\Default.ini` 的 `ServerIP=`
4. **網路設成私人網路**：設定 → 網路和網際網路 → 目前的 Wi-Fi／乙太網路 → 網路設定檔類型選「私人」。
5. **開戰鬥用的防火牆**：用系統管理員身分開 PowerShell，貼上：
   ```
   New-NetFirewallRule -DisplayName "MRO-P2P-UDP-30907" -Direction Inbound -Protocol UDP -LocalPort 30907 -Profile Private -RemoteAddress 192.168.1.0/24 -Action Allow
   ```
6. **第一次開遊戲**：對 `Play Metal Rage Online.bat` 按右鍵，選「以系統管理員身分執行」。只有第一次需要這樣，之後直接點兩下就好。
7. （選用）**中文介面**：遊戲關著時，點兩下遊戲資料夾裡的 `switch.cmd`。再點一次切回英文。

## C. 每次玩

1. 點兩下 `Play Metal Rage Online.bat`。
2. 登入：名稱填白名單裡的那個，**沒有密碼**。
3. 大廳 → 建房或加入房間 → 加入的人按 F5 準備 → 房主按 F5 開始。

## 常見狀況

| 狀況 | 原因／處理 |
|---|---|
| 登入時被拒絕 | 名稱不在白名單。請 Lucas 加上後重啟伺服器。 |
| 大廳看不到房間 | 先回大廳重新整理。還是不行就跟 Lucas 說。 |
| 在房間裡約 80 秒沒動作就被踢出 | 原版的防掛機設計。偶爾動一下滑鼠就好。 |
| 開戰後讀取一下又回到房間 | 先**不要關遊戲**，跟 Lucas 說，他要讀你的 log。 |
| 遊戲關掉後還在背景跑 | 用工作管理員結束 `MetalRage.exe`。 |

目前還沒完成：打完一場後的死亡數和結算，只有房主那邊是正確的。
