# 朋友端安裝套件（client-kit）

給拿到全新解壓縮客戶端資料夾（archive.org 上的 `MetalRage Online.rar`，見 `docs/reference/setup.md`）的朋友用。跟著這頁做完，就能透過 VPN 連進我們的伺服器。

## 開始之前

1. 已經連上跟主機同一個 VPN（或同一個區網）。
2. 已經把你的遊戲名稱告訴 Lucas，讓他加進伺服器的白名單（沒有密碼，只認名稱）。
3. 已經把整個客戶端資料夾解壓縮好，例如 `C:\Games\MetalRage Online`。

## 步驟

1. 把這個 `client-kit` 資料夾整個複製到客戶端根目錄裡面，變成：
   `C:\Games\MetalRage Online\client-kit\`
   （跟 `data\` 資料夾、`Play Metal Rage Online.bat` 同一層的下面）。
2. 用**系統管理員身分**開 PowerShell。
3. 切到客戶端根目錄，執行安裝腳本（IP 換成 Lucas 給你的伺服器位址）：
   ```powershell
   cd 'C:\Games\MetalRage Online'
   .\client-kit\setup-client.ps1 -ServerIp <Lucas 給的 IP>
   ```
   - 如果你們是用 VPN 而不是同一個家用網路，可能要多加 `-HostSubnet`，例如：
     ```powershell
     .\client-kit\setup-client.ps1 -ServerIp <IP> -HostSubnet 10.8.0.0/24
     ```
     （VPN 的網段是多少，問 Lucas；沒填的話預設是 `192.168.1.0/24`，同一個家用網路不用管這個參數。）
   - 用 Tailscale 當 VPN 的完整設定步驟（桌機端要開哪些防火牆規則、伺服器設定要改什麼）見 `docs/reference/vpn-guide.md`（🟡 尚未實測，Lucas 那邊在弄）。
4. 腳本跑完會印一段摘要，確認沒有紅字的錯誤訊息。
5. 如果它問你要不要把網路設成「私人」，選 `y`（P2P 對戰的連線只有在私人網路才會放行）。
6. 第一次玩，對 `Play Metal Rage Online.bat` 按右鍵、選「以系統管理員身分執行」（要寫一個登錄檔設定，只有第一次需要）。之後直接點兩下就好。

腳本會自動判斷你是 Win10 還是 Win11，換上正確的 `MetalRage.exe`（Win11 的修改版拿去 Win10 跑會直接閃退），並且把伺服器位址寫進三個地方（啟動 bat、`MetalRage.ini`、`Default.ini`）。改過的檔案都會先備份到 `client-kit-backup\`，重跑一次不會壞掉（idempotent）。

## 想不玩了，恢復原狀

一樣用系統管理員 PowerShell，在客戶端根目錄執行：
```powershell
cd 'C:\Games\MetalRage Online'
.\client-kit\uninstall-client.ps1
```
會把 exe、兩個 ini、啟動 bat 還原成備份，並移除防火牆規則。

## 中文介面

遊戲**先關掉**，點兩下客戶端根目錄的 `switch.cmd` 就能切中英文；再點一次切回去。開著遊戲切會沒有用（檔案被遊戲鎖住）。

## 已知狀況

| 狀況 | 說明 |
|---|---|
| 房間裡約 80 秒沒動作就被踢出 | 原版的防掛機設計，動一下滑鼠就好，不是斷線。 |
| 大廳按「上一頁」整個卡住 | 目前已知的問題，還沒修好。**不要等**，直接關掉遊戲重開。 |
| 想當房主（開戰讓別人加入你的房間） | 把你的（VPN 或區網）IP 告訴 Lucas，他要把它填進白名單你的帳號設定，並且重啟伺服器才會生效。🟡 PM 建議：多人一起玩時，由電腦最穩、上傳頻寬最好的那台當房主（其他人是連過去的一方，房主網路品質差會拖累所有人），不一定要固定是某個人，看那天誰的網路狀況最好。 |
| Win10 用錯 exe：一開遊戲就當掉 | 症狀：Windows 事件檢視器出現事件 ID 1000、錯誤代碼 `0xc0000005`、錯誤模組 unknown，`data\System\xigncode.log` 沒有更新時間。代表跑到的是 Win11 版的 exe。正常情況 `setup-client.ps1` 會自動換好，如果還是這樣，把腳本的輸出貼給 Lucas。 |

## `[IpDrv.TcpNetDriver]`（頻寬設定，待 NET 實驗結論）

`MetalRage.ini` 開頭可能有一段：
```ini
[IpDrv.TcpNetDriver]
MaxClientRate=100000
MaxInternetClientRate=100000
```
這是為了改善多人戰鬥時的延遲在測試中的設定，**還沒驗證有沒有效**（待 NET 實驗結論）。`setup-client.ps1` 不會動這一段，維持你 ini 檔案原本的樣子；如果 Lucas 之後確認有效，會再更新這份 README。
