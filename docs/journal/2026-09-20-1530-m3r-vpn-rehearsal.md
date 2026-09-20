# M3-R：筆電＋手機熱點的 VPN 預演（2026-09-20）

契約見 PM 的 M3-R。目的：在筆電離開家用區網（走手機行動網路，電信級 NAT）的條件下，完成 M2 的全部內容。

## 設定
- VPN：**Radmin VPN**（操作者選；ZeroTier 免費版 10 台、Tailscale 6 人，Radmin 官網宣稱不限人數，見 `research/2026-09-20-vpn-choice/notes.md`）。
- 位址：桌機 `26.252.21.150`、筆電 `26.98.113.112`。
- 伺服器：`config/server.json` 的 `publicHost` 與白名單的 `hostAddress` 全部改成 VPN 位址，完整重啟。
- 連接埠轉發本來就綁 `0.0.0.0`，所有介面通用，不用改。
- 防火牆：`lan-open.ps1 -VirtualSubnet 26.0.0.0/8`、`p2p-open.ps1 -VirtualSubnet 26.0.0.0/8` 另外建一組規則，原本的區網規則不動。筆電另外加一條 UDP 30907 的入站規則。Radmin 介面在兩台都是「私人網路」。
- 腳本要從 `C:\Users\<user>\...` 執行：PowerShell 的執行原則會擋掉 `\\wsl.localhost` 上的未簽署腳本。

## 結果 ✅（未經跨公司審查）
- [LOG] `session-20260920-140707.jsonl`：筆電（test）經 VPN 登入 9211 成功。
- [LOG] 同檔 06:51:42：Lucas 當房主，`Ready_Host_SN 0x00420115` body 帶 `26.252.21.150`，筆電連過去，兩人同房開戰、互相看得到。
- [LOG] `session-20260920-152820.jsonl` 07:32:36：**反方向**，筆電當房主，`Ready_Host_SN` 帶 `26.98.113.112`，桌機連過去；07:32:45 兩邊都收到 `BeginRound_SN`。[OBS] 兩邊都能正常操控。
- 結論：**遠端玩家透過 VPN 連線（含 P2P 戰鬥）在兩個方向都成立。**

## 過程中修掉的問題
1. 大廳看不到別人新開的房間 → `room-leave.js` 補送完整清單（26be66c，`research/2026-09-20-roomlist-empty/notes.md`）。
2. 只做 `/reload` 導致 `whitelist.isTestAccount is not a function`、暱稱變 `Player` → 完整重啟。

## 還沒做
- 延遲、是直連還是中繼（Radmin 介面上可以看）、開戰載入時間，都沒量。下次連線時補。
- dusk（Win10）還沒加入 VPN；他的「沒射出／沒傷害」在卡頓修正後是否消失，也還沒測。
