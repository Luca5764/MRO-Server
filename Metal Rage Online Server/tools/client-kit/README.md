# 朋友端安裝套件（client-kit）

給拿到全新解壓縮客戶端資料夾（archive.org 上的 `MetalRage Online.rar`，見 `docs/reference/setup.md`）的朋友用。跟著這頁做完，就能透過 VPN 連進我們的伺服器。（英文版、Radmin VPN 導向的精簡版見 `docs/reference/join-guide.en.md`。）

## 開始之前

1. 已經連上跟主機同一個 VPN（或同一個區網）。如果是 VPN，步驟大致是：
   1. 裝 Lucas 指定的那套 VPN 軟體（ZeroTier／Radmin VPN／Tailscale 之類，實際用哪個問 Lucas，見
      `docs/research/2026-09-20-vpn-choice/notes.md` 的比較——這份 README 沒有寫死是哪一套）。
   2. 跟 Lucas 要「network ID」（或 network 名稱＋密碼，依工具而定）並加入。
   3. **等 Lucas 核准你的裝置**（多數 VPN 工具要 network 擁有者手動核准新加入的裝置，才會真的通；
      Radmin VPN 這種用共用密碼的則不用等）——沒核准之前這台機器連不到伺服器，屬於正常現象，不是你
      設定錯了。
   4. 核准後查一下自己拿到的**虛擬 IP**（各家工具查法不同，例如 ZeroTier 是 `zerotier-cli listpeers`
      或看 Central 網頁；Radmin VPN、Tailscale 各自的主視窗都會顯示）；下面的 `-ServerIp` 要填的是
      Lucas 那台的虛擬 IP，不是他的區網 IP。
   5. 🟡 Windows 可能把這套 VPN 新加的虛擬網卡歸類成「公用網路」，這樣防火牆規則不會生效。用系統管理
      員 PowerShell 跑 `Get-NetConnectionProfile` 檢查，虛擬網卡那一列如果不是 `Private`，改成
      `Private`（例：`Set-NetConnectionProfile -InterfaceAlias "<虛擬網卡名稱>" -NetworkCategory
      Private`）——這一步沒有實機驗證過每一套 VPN 工具的預設值，只是先提醒。
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
   - 如果你們是用 VPN 而不是同一個家用網路，一定要多加 `-HostSubnet`（不加的話，你如果之後要當房主，
     P2P 對戰的防火牆規則只會放行區網那段，VPN 那邊的隊友連不進來），例如：
     ```powershell
     .\client-kit\setup-client.ps1 -ServerIp <IP> -HostSubnet 10.147.0.0/16
     ```
     （VPN 的網段是多少，問 Lucas——他會照 `docs/reference/setup.md`「跨網路連線（VPN）」那節的設定告
     訴你；沒填的話預設是 `192.168.0.0/24`，同一個家用網路不用管這個參數。）
   - 伺服器端（Lucas 那邊）完整的 VPN 設定步驟見 `docs/reference/setup.md`「跨網路連線（VPN）」一節；
     另外 Tailscale 專用的操作流程見 `docs/reference/vpn-guide.md`（🟡 尚未實機驗證過完整流程）。
4. 腳本跑完會印一段摘要，確認沒有紅字的錯誤訊息。
5. 如果它問你要不要把網路設成「私人」，選 `y`（P2P 對戰的連線只有在私人網路才會放行）。
6. 第一次玩，對 `Play Metal Rage Online.bat` 按右鍵、選「以系統管理員身分執行」（要寫一個登錄檔設定，只有第一次需要）。之後直接點兩下就好。

腳本會自動判斷你是 Win10 還是 Win11，換上正確的 `MetalRage.exe`（Win11 的修改版拿去 Win10 跑會直接閃退），換上修好開火問題的 `Engine.dll`（見下一節），並且把伺服器位址寫進三個地方（啟動 bat、`MetalRage.ini`、`Default.ini`）。改過的檔案都會先備份到 `client-kit-backup\`，重跑一次不會壞掉（idempotent）。

## 開火偶爾打不到人的修正（2026-09-22）

有時候明明瞄準了、扳機也扣了，敵人卻沒事，連續開火尤其容易發生——這不是你的瞄準或網路延遲的問題，是遊戲本身在連續開火時，偶爾會把「打中了」這個訊息漏掉，房主那邊沒送出去。

**這個包已經內建修好的 `Engine.dll`，`setup-client.ps1` 會自動幫你換上，你不用自己動手。**

改了什麼：`Engine.dll` 這個遊戲檔案裡，有兩個地方控制「這台電腦一次可以送出多少對戰資料」的數字，原本卡得很死，這次調高了；另外三個地方放寬了「允許臨時超額一點點」的空間，這樣連續開火瞬間資料量衝高時，不會被直接丟掉。

實測效果：原廠設定下，連續開火 34 次，平均約有 10 次左右沒有真的命中（接近三分之一打空）；換成這個修補版本後，連續開火 34 次全部命中，一次都沒漏掉。

**房主跟加入的人都要套用同一份**（也就是每個人都要用這個 client-kit 跑過 `setup-client.ps1`）。這一點提醒一下：我們自己只在「房主端套用」的情況下量到上面那個效果，「加入的人也要套用」是採信提供這個修補構想的外部玩家（Moon）的說法，我們自己還沒有實測數據證明加入端套了有沒有差。如果之後還是有人回報打不到人，這是第一個要重新檢查的地方。

**怎麼確認你拿到的檔案沒被亂改：** `setup-client.ps1` 換檔案前後都會自己核對 sha256（一種檔案指紋），兩邊只要有一個對不上就會直接停下來、什麼都不會動，並且在畫面上印出來，不會悄悄裝一個不明的檔案給你。想自己手動核對，用系統管理員 PowerShell：
```powershell
Get-FileHash 'C:\Games\MetalRage Online\data\System\Engine.dll' -Algorithm SHA256
```
- 換之前應該是原廠：`FC51FE1240EE34111FC1A483E74A1B131D4B69F2B2A0940ADBB4A860A138D24E`
- 換之後應該是修補版：`F4B253A3606243A0AA41101B812A1BEC9DCA79AB3DE91818C024E458F14B4970`

**想恢復原廠檔案：** 跟其他被改過的檔案一樣，執行下面「想不玩了，恢復原狀」那節的 `uninstall-client.ps1` 就會一起還原，或者自己從 `client-kit-backup\Engine.dll.bak` 複製回 `data\System\Engine.dll`。

<details>
<summary>技術細節（給想自己核對位元組的人看，一般不需要點開）</summary>

修補內容是 `tools/patch_netspeed_host.py --value 30000 --budget` 產生的，兩組共 6 處位元組修改（file offset 是相對 `Engine.dll` 檔頭的位置）：

netspeed（連線速率上限，兩處立即數）：
- `0x17f9b1`：`08 07 00 00` → `30 75 00 00`（`cmp eax,0x708` 的比較值，1800→30000 的判斷改成跟 30000 比）
- `0x17f9b8`：`08 07 00 00` → `30 75 00 00`（寫進連線物件 `+0x50` 的值，1800→30000）
- （還有一處 `0x17f9b5` 的 `7d 07`→`90 90` 是配套的條件跳躍 NOP，不是獨立數值）

budget（頻寬暫存空間放寬，三處）：
- `0x12e1f8`：`dc c0 8b 8e 4c 01 00 00` → `e9 23 a9 24 00 90 90 90`（跳到新增的一小段程式碼）
- `0x378b20`：`.text` 段尾端本來全零的填充區，寫入 27 bytes 的新程式碼
- `.text` 節區表的 `VirtualSize` 欄位：`0x377b1e` → `0x378000`（把上面那段填充區正式標記成程式碼的一部分）

出處與逐位元組核對見我方（我們自己驗）與 Moon（外部）的兩份記錄：`docs/research/2026-09-21-netspeed-host-patch/design.md`、`docs/research/2026-09-22-netspeed-budget/high-tier-review.md`。

</details>

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
| 想當房主（開戰讓別人加入你的房間） | 把你的（VPN 或區網）IP 告訴 Lucas，他要把它填進白名單你的帳號設定，並且重啟伺服器才會生效。🟡 PM 建議：多人一起玩時，**優先由 Win10 的人開房**（Win11 上已知有不定時卡頓，房主卡頓會影響整房，見 `docs/research/2026-09-19-win11-patch-audit/notes.md`），其次由電腦最穩、上傳頻寬最好的那台當房主（其他人是連過去的一方，房主網路品質差會拖累所有人），不一定要固定是某個人，看那天誰的網路狀況最好。 |
| Win10 用錯 exe：一開遊戲就當掉 | 症狀：Windows 事件檢視器出現事件 ID 1000、錯誤代碼 `0xc0000005`、錯誤模組 unknown，`data\System\xigncode.log` 沒有更新時間。代表跑到的是 Win11 版的 exe。正常情況 `setup-client.ps1` 會自動換好，如果還是這樣，把腳本的輸出貼給 Lucas。 |

## `[IpDrv.TcpNetDriver]`（頻寬設定，待 NET 實驗結論）

`MetalRage.ini` 開頭可能有一段：
```ini
[IpDrv.TcpNetDriver]
MaxClientRate=100000
MaxInternetClientRate=100000
```
這是為了改善多人戰鬥時的延遲在測試中的設定，**還沒驗證有沒有效**（待 NET 實驗結論）。`setup-client.ps1` 不會動這一段，維持你 ini 檔案原本的樣子；如果 Lucas 之後確認有效，會再更新這份 README。

## 卡頓修正（2026-09-20，建議每台都做一次）

有些電腦上，Windows 會在遊戲每次丟出保護殼的例外時，自動寫一個約 29 MB 的當機傾印檔，寫檔期間整個遊戲會凍結約 0.25 秒。玩起來就是不定時的卡頓；當房主時，房裡其他人還會看到怪物瞬移、子彈沒傷害。

**檢查有沒有中招：** 打開 `%LOCALAPPDATA%\CrashDumps`（在檔案總管網址列貼上），如果裡面一直有新的 `MetalRage.exe*.dmp`，就是這個問題。

**修正**（以系統管理員身分開 PowerShell，貼一次就好）：
```powershell
New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\MetalRage.exe' -Force | Out-Null
New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\MetalRage.exe' -Name DumpCount -Value 0 -PropertyType DWord -Force | Out-Null
Remove-Item "$env:LOCALAPPDATA\CrashDumps\MetalRage.exe*.dmp" -Force -ErrorAction SilentlyContinue
```
只影響這個遊戲，其他程式的當機回報不變；想還原就把那個機碼刪掉。依據見 `docs/journal/2026-09-20-1240-stutter-root-cause.md`。
