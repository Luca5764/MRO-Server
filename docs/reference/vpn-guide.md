# M3：朋友遠端連線（VPN，Tailscale）

> 🟡 **整份指南尚未實測（2026-09-19 撰寫）。** 第一次測試的情境是操作者自己的兩台設備：桌機（伺服器主機，Win11，區網 `192.168.1.105`）留在家用網路，筆電切到**手機行動熱點**充當「遠端朋友」。每一條網段／連接埠的主張都附了引用；沒有引用的地方標 🟡／[GUESS]，代表只是照既有腳本行為推論，還沒有實機驗證過。跑完第一次測試後，這份指南要回頭勘誤。
>
> 為什麼選 Tailscale：操作者要求「工具不重要，簡單就好」；Tailscale 裝完登入同一個帳號就自動組網，不用自己開 VPN Server、設路由，比 WireGuard/OpenVPN 手動配置的門檻低。

## 名詞

- **tailnet**：所有裝置用同一個 Tailscale 帳號登入後組成的私人網路，裝置間可以直接用 Tailscale 配到的 IP 互連。
- **Tailscale IP**：每台裝置拿到的 `100.x.y.z` 位址（CGNAT 保留範圍 `100.64.0.0/10`；🟡 [GUESS] 這是 Tailscale 官方文件的通說，本專案沒有另外查證），裝置只要不登出通常不會變。

## 前提

- 桌機（伺服器主機）跟筆電（朋友端）都要能上網（不需要同一個實體網路）。
- 已經照 `docs/reference/setup.md` 把伺服器跑起來、DB 建好。
- 想讓朋友端能玩，白名單一定要先設定：`docs/reference/lan-join-guide.md` 那句「開放區網之前一定要設定」同樣適用於 VPN。

## 步驟 A：桌機（伺服器主機）裝 Tailscale

1. 到 Tailscale 官網下載 Windows 版，安裝後用一個帳號登入（例如操作者自己的帳號；筆電之後要用同一個帳號登入，或用該帳號邀請筆電加入同一個 tailnet）。
2. 開 PowerShell（不需要系統管理員）跑：
   ```powershell
   tailscale ip -4
   ```
   記下這台的 Tailscale IP，以下稱 `<桌機TS-IP>`。
3. 🟡 [GUESS] Tailscale 會在 Windows 加一張虛擬網卡（常見別名是 `Tailscale`），第一次出現時 Windows 的網路設定檔類型很可能被歸類成「公用」（Public）。這件事很重要：`tools/win/lan-open.ps1` 的防火牆規則預設只套用在 `Private`/`Domain`（腳本 `-FirewallProfile` 參數預設值 `@('Private', 'Domain')`），`tools/win/p2p-open.ps1` 也只套用在 `-Profile Private`；規則掛在 Public 類別的介面上不會生效。用系統管理員 PowerShell 檢查：
   ```powershell
   Get-NetConnectionProfile
   ```
   找到 `InterfaceAlias` 是 Tailscale 那一列，如果 `NetworkCategory` 是 `Public`，手動改成 `Private`：
   ```powershell
   Set-NetConnectionProfile -InterfaceAlias "Tailscale" -NetworkCategory Private
   ```
   （介面別名如果不是 `Tailscale`，用 `Get-NetConnectionProfile` 印出來的實際名稱替換。）
   🟡 這台機器上 Tailscale 介面實際叫什麼、預設分類是什麼，都還沒有實測過——第一次測試時請截圖或貼 `Get-NetConnectionProfile` 的輸出。

## 步驟 B：筆電（朋友端）裝 Tailscale，切到手機熱點

1. 筆電切到手機的行動熱點（不是家用 Wi-Fi），確認已經不在 `192.168.1.x` 網段（可以用 `ipconfig` 確認目前的區網 IP 變了）。這是為了讓第一次測試盡量貼近真正「不同網路的遠端朋友」的情境。
2. 同樣安裝 Tailscale，用同一個帳號登入（或接受桌機那個帳號的邀請），確認加入同一個 tailnet。
3. 跑 `tailscale ip -4`，記下筆電的 Tailscale IP，以下稱 `<筆電TS-IP>`。

## 步驟 C：先驗證 tailnet 通不通，別急著碰遊戲

在筆電（或桌機）上：
```powershell
tailscale ping <對方的TS-IP>
tailscale status
```
- `tailscale ping` 的輸出會標示是 `direct`（直連）還是經由某個 `DERP(...)` 中繼站。
- 🟡 手機行動熱點多半是電信商 CGNAT，NAT 打洞常常失敗，預期會落在 DERP 中繼——**連得到，但延遲比家用區網高**，且延遲取決於 DERP 節點跟兩端的地理距離。這只影響延遲，不影響「連不連得到」。如果之後 P2P 對戰的 UDP 表現不好，先看 `tailscale status` 是不是在走中繼，不要先懷疑封包格式（跟 `AGENTS.md`「客戶端行為 > 我們的假設」同一個精神：先確認網路層，再往上查）。
- `tailscale status` 也能看兩台是不是同一個 tailnet、彼此在線。

## 步驟 D：伺服器設定要改的值（操作者自己動手，這份指南只列值）

以下都要**操作者**自己改，本指南和撰寫它的 agent 都不動這兩個檔案：

1. `Metal Rage Online Server/config/server.json`：
   ```json
   { "publicHost": "<桌機TS-IP>" }
   ```
   依據：`docs/reference/setup.md`「讓第二台連進遊戲伺服器（publicHost）」一節——登入伺服器用 `Server_Add_SN 0x00220101` 把這個值告訴客戶端，是遊戲伺服器（第二個埠）真正連線用的位址。**改完要完整重啟伺服器**（不是 `/reload`）。
2. `Metal Rage Online Server/config/allowed-users.json`：幫筆電那個朋友帳號加進白名單；如果這台之後要**當房主**，一起填 `hostAddress`：
   ```json
   { "name": "<朋友的遊戲帳號名稱>", "hostAddress": "<筆電TS-IP>" }
   ```
   依據：`Metal Rage Online Server/config/whitelist.js` 的 `HOST_ADDRESS_MAX_CHARS = 15` 與 `IPV4_LITERAL_RE`（要求四段式 dotted IPv4）。Tailscale IP 是 `100.x.y.z` 這種四段式字串，長度通常 11–14 字元，靜態核對格式檢查應該會過。🟡 沒有實際填一個 Tailscale IP 進這個欄位跑過，只核對過正則式跟長度上限，不是實機驗證。改完要重啟伺服器。

## 步驟 E：桌機防火牆／portproxy — 開放 Tailscale 網段

在**桌機**用系統管理員 PowerShell（`Metal Rage Online Server/tools/win/`，跟 `docs/reference/setup.md`「第二台主機」段落同一組腳本）：

```powershell
cd '\\wsl.localhost\Ubuntu\home\lucas\mro-reverse\Metal Rage Online Server\tools\win'
.\lan-open.ps1 -Subnet 100.64.0.0/10
```

- 依據：`tools/win/lan-open.ps1` 本來就支援 `-Subnet` 覆寫自動偵測的網段（`docs/reference/setup.md`「自動偵測抓錯網段時可以用 `-Subnet 192.168.1.0/24` 這種參數覆寫」）。
- **這裡務必手動指定 `-Subnet`，不要靠自動偵測。** 腳本的 `Get-LanSubnetCidr` 只用 `InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Tap|VPN|Virtual'` 排除虛擬介面（見腳本原始碼），Tailscale 介面的別名（很可能是 `Tailscale`）不在這個排除清單裡，會被當成候選網卡；如果它跟真正的實體區網卡同時被偵測到，腳本只會取第一個候選並印警告，可能選錯（`Get-LanSubnetCidr` 函式裡 `$list.Count -gt 1` 的分支）。
- 這支腳本開的是 **TCP** 9211／30907 的 portproxy＋防火牆規則，跟下面的 UDP 30907 P2P 規則是兩回事、不衝突（`docs/reference/setup.md`「戰鬥 P2P（N2）」）。

如果桌機這次**要當房主**（本次測試的規劃角色），另外開 UDP 30907：
```powershell
.\p2p-open.ps1 -RemoteSubnet 100.64.0.0/10
```
依據：`tools/win/p2p-open.ps1`，房主的 `MetalRage.exe` 進戰場才會監聽 UDP 30907（`docs/reference/setup.md`「戰鬥 P2P（N2）」，2026-09-19 單人戰 `Get-NetUDPEndpoint` 實測）。

如果之後改成**筆電當房主**，不要在桌機另外跑 `p2p-open.ps1`——改用步驟 F 的 client-kit 在筆電上開。

🟡 **WSL2 收不收得到經 Tailscale 介面進來的封包，沒有實測過。** `lan-open.ps1` 的 portproxy 規則用 `netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 ...`（見腳本原始碼），`0.0.0.0` 理論上涵蓋 Windows 上所有介面收到的封包，應該包含 Tailscale 虛擬網卡配到的 `<桌機TS-IP>`——但這只是照 `0.0.0.0` 的一般網路行為推論，跟區網那次已完成的驗證（`docs/reference/setup.md`「怎麼在 session log 確認連線來源」）不是同一件事，沒有針對 Tailscale 介面單獨測過。第一次測試要看 session log 的 `peer` 欄位確認連線真的進得來；`peer` 顯示的來源位址是什麼也要記下來——`docs/reference/setup.md` 第 137 行已經有一條 `[GUESS]`/⬜ 未驗證，說 `netsh interface portproxy` 可能不保留原始來源 IP，如果 WSL 這邊看到的 `peer` 不是筆電真正的 Tailscale IP，屬於同一個已知限制，不用因此去改 `server.js`。

## 步驟 F：筆電（朋友端）用 client-kit

在筆電：
```powershell
cd 'C:\Games\MetalRage Online'
.\client-kit\setup-client.ps1 -ServerIp <桌機TS-IP> -HostSubnet 100.64.0.0/10
```
- 依據：`Metal Rage Online Server/tools/client-kit/setup-client.ps1` 本來就支援 `-HostSubnet`（給這台之後可能當房主時開 UDP 30907 inbound，範圍限定在這個參數指定的網段）；`tools/client-kit/README.md` 原本就寫了「VPN 情境要多帶 `-HostSubnet`」，只是範例網段是區網的 `10.8.0.0/24`，這裡換成 Tailscale 的 `100.64.0.0/10`。
- 腳本跑完會檢查目前網路設定檔（`Test-NetworkProfile` 函式），如果偵測到 `Public` 類別的介面會問要不要切成 `Private`。🟡 沒實測過 `Get-NetConnectionProfile` 在筆電上會不會把 Tailscale 介面也列進去——如果有列進去，這裡就順便處理掉了；如果沒有，還是要照步驟 A 的方式手動檢查、手動切。

## 步驟 G：驗證

1. 筆電上跑 `tailscale ping <桌機TS-IP>`，確認 tailnet 本身通（步驟 C 已經做過一次，這裡是遊戲設定改完後的複查）。
2. 筆電上跑：
   ```powershell
   Test-NetConnection <桌機TS-IP> -Port 9211
   Test-NetConnection <桌機TS-IP> -Port 30907
   ```
   兩個都要 `TcpTestSucceeded : True`。跟 `docs/reference/setup.md`「第二台主機怎麼驗證」同一招，只是把區網 IP 換成 Tailscale IP。
3. 筆電開遊戲、登入（帳號要在白名單裡）、進大廳、跟桌機一起打完一場 PvE，對照 M3 的完成條件：「一位遠端朋友透過 VPN 完成 M2 的全部內容」（`docs/roadmap.md`）。
4. 看 session log 的 `peer` 欄位確認連線來源（步驟 E 最後一段）。
5. 如果 P2P 戰鬥卡頓、延遲高，先回頭看 `tailscale status` 是不是在走 DERP 中繼（步驟 C），排除是不是這個原因，不要先懷疑封包格式或 handler。

## 還原

不需要繼續用 VPN 連線時，在**桌機**用系統管理員 PowerShell：
```powershell
.\lan-close.ps1
.\p2p-close.ps1
```
（兩支都是既有腳本的既有行為：`lan-close.ps1` 移除 9211/30907 的 portproxy 與 `MRO-LAN-*` 防火牆規則；`p2p-close.ps1` 移除 `MRO-P2P-*` 防火牆規則，兩者都跟網段參數無關，一次全清。）

在**筆電**：
```powershell
cd 'C:\Games\MetalRage Online'
.\client-kit\uninstall-client.ps1
```
（還原 exe／ini／bat，並移除 client-kit 加的防火牆規則，見 `tools/client-kit/README.md`「想不玩了，恢復原狀」。）

設定檔部分：操作者視情況決定要不要把 `config/server.json` 的 `publicHost`、`config/allowed-users.json` 該帳號的 `hostAddress` 改回去／刪掉，改完一樣要重啟伺服器。

Tailscale 本身：`tailscale down`（暫時斷開，不解除安裝）或直接解除安裝；步驟 A 手動切過的網路設定檔類型（Private）不影響其他用途，通常不需要特別改回去。

## 開放問題（留給主力決定或下一輪實測補）

- Tailscale 介面在這台桌機／筆電上實際叫什麼名字、預設 `NetworkCategory` 是什麼——沒查過，第一次測試才知道。
- `lan-open.ps1` 的 `Get-LanSubnetCidr` 在同時看到實體 LAN 卡和 Tailscale 卡時是否真的會選錯——這份指南要求一律手動帶 `-Subnet`，繞過了這個問題，沒去驗證自動偵測本身的行為。
- portproxy 轉發到 WSL2 之後，session log 的 `peer` 欄位在 Tailscale 路徑下會顯示什麼（筆電真實 Tailscale IP，還是像區網那樣被 portproxy 蓋掉）——setup.md 137 行那條既有 `[GUESS]` 同樣適用，但沒有專門針對 Tailscale 驗證過。
- `allowed-users.json` 的 `hostAddress` 格式檢查（`IPV4_LITERAL_RE`）實際餵一個 Tailscale IP 有沒有問題——只做過靜態核對正則式，沒跑過。
- 手機熱點 CGNAT 造成的 DERP 中繼延遲，對戰鬥 P2P（UDP 30907）的實際手感影響多大——要打過一場才知道。
