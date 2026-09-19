# VPN 選型調查（M3-R 前置）

🟡 中階（Claude worker sub-agent）產出，未經審查。任務來源：M3-R 契約「Prepare everything for
rehearsing M3 on a phone hotspot」。目的：核對 PM 建議「ZeroTier 優先、Radmin VPN 備援」的事實面，
不是做最終決定——選型仍要主力／操作者拍板。

所有事實都是本次（2026-09-20）用 `curl` 抓官方頁面後手動解析文字得到的，不是憑記憶寫的；每條都附
URL 和抓取日期。抓不到的（例如虛擬網卡在 Windows 的預設網路類別）明確標「未查到官方文件」，不用猜測
湊數。

## 事實表

| 項目 | ZeroTier | Radmin VPN | Tailscale | Hamachi |
|---|---|---|---|---|
| 免費方案限制 | Personal：10 台裝置、1 個 network、僅限非商業用途 | 官網首頁明講「不限制玩家數量」（"Free Radmin VPN does not limit the number of gamers"）；沒找到官方公布的裝置／network 數字上限 | Personal：裝置數不限，但**帳號數上限 6 人**（"Up to 6 users"） | 免費上限 **5 台電腦／network**；要背景常駐（unattended service 模式）才需要付費方案 |
| 成員加入方式 | 裝置 join 一個 network ID 後預設「Not Authorized」，要 network **擁有者**在 Central 手動 Authorize 才能通（New Central／Legacy Central 兩版都一樣的流程） | 建 network 時設「Network name + Password」，之後任何人只要知道這兩個值就能直接 join，**沒有逐台裝置的擁有者核准步驟** | 裝置用同一個帳號登入即自動加入 tailnet；另外有「Share」功能，Owner/Admin 可以把**單一台機器**分享給 tailnet 外的人（受邀者只看得到那一台，且該機器預設被「隔離」成只能被動接收連線，不能主動對外連） | 沒有另外查證加入流程（本次沒有找到官方文件頁），只查了免費方案的數量上限 |
| 直連 vs 中繼 | 預設嘗試直連（P2P NAT 打洞）；打不通時經由 ZeroTier 維護的全域 root server 中繼（文件裡叫 "roots"，舊稱 "planet/moon"） | 文件明講失敗會退回 **Relay/TCP**；官方 troubleshooting 頁直接說「大部分連線都是 Relay/TCP 的話，通常是你的 ISP 那邊的問題」 | 預設嘗試直連（WireGuard 打洞）；打不通時退回 DERP 中繼站（這點跟專案既有 `docs/reference/vpn-guide.md` 步驟 C 的敘述一致，該文件本身沒附官方連結，這次也沒有另外重新查證） | 沒有查 |
| 虛擬網卡在 Windows 的預設網路類別（Private/Public） | **未查到官方文件**；ZeroTier 的 Windows FAQ 只提到防毒軟體可能誤判成要接管防火牆，沒提網路類別分類 | **未查到官方文件明講預設值**，但 help 頁的協力廠商防火牆設定步驟（Avast／Kaspersky／ESET）全部要求手動把 "Famatech Radmin VPN Ethernet Adapter" 改成「私人／受信任」類別，側面暗示預設不是 Private | **未查到官方文件**；`docs/reference/vpn-guide.md` 步驟 A.3 已經把這點標成 🟡 [GUESS]，本次沒有補上官方引用 | 沒有查 |
| 虛擬 IP 段格式範例（給 `hostAddress`／`publicHost` 相容性用） | Quickstart 文件範例：`10.171.176.172`（New Central）、`192.168.191.242`（Legacy Central）——可配置的自訂 IPv4 pool，不是固定一段 | Windows 防火牆設定範例（Kaspersky 那段）出現 `26.0.0.0/8`，是 Radmin VPN 常見的預設段 | `100.x.y.z`（CGNAT 保留段 `100.64.0.0/10`）——沿用 `docs/reference/vpn-guide.md` 既有的 🟡 [GUESS]，本次沒有另外查證 | 沒有查（記憶中是 `25.0.0.0/8`，但這次沒有查到官方來源可以引用，不列進表格） |
| 來源 URL（抓取日 2026-09-20） | `zerotier.com/pricing/`、`docs.zerotier.com/quickstart/`、`docs.zerotier.com/roots/`、`docs.zerotier.com/faq/` | `radmin-vpn.com/`、`radmin-vpn.com/help/` | `tailscale.com/pricing`、`tailscale.com/docs/features/sharing`（跳轉自 `tailscale.com/kb/1084/sharing`） | `vpn.net/`（頁尾版權寫 2003-2018，疑似頁面本身沒更新，只引用內文的方案數字） |

## 跟本專案的相容性

- `config/whitelist.js` 的 `hostAddress` 檢查：長度 ≤15 字元、格式是四段式 dotted IPv4（`IPV4_LITERAL_RE`，四段各 0-255）。上表四種 VPN 的虛擬 IP 都是這種格式，長度也都在 15 字元以內（最長案例 `192.168.191.242` 剛好 15 字元，卡在門檻上但沒超過）。**這只是靜態核對格式／長度，沒有拿真的 VPN IP 實際填進去跑過**，跟 `docs/reference/vpn-guide.md` 既有那條 🟡 一樣的保留態度。
- `config/server.json` 的 `publicHost` 用的是同一種「四段式 IPv4 字串」假設（`docs/reference/setup.md`「讓第二台連進遊戲伺服器」），沒有另外的長度檢查程式碼可查，但既有先例（`hostAddress`）都是 15 字元上限，沿用同一個假設。
- 這四種 VPN 都不需要改動任何 server 端程式碼——都只是「多一個能連到 Windows 主機的網段」，跟現有 `publicHost` / `hostAddress` 機制本來就相容。**如果之後想依「來源網段」自動選不同 `publicHost`，那才需要改 server 端程式碼——本次任務刻意不做這件事（契約限制），遇到就停下來回報。**

## 對 PM 建議（ZeroTier 優先、Radmin 備援）的核對

不是本子 agent 的權限去下結論（中階不能標 ✅），只列出跟 `AGENTS.md` 硬性約束 #2（「不要把伺服器暴露到不信任的網路」，邊界＝私人網路＋擁有者對成員的核准）對得上/對不上的地方，留給主力判斷：

- **支持 ZeroTier 優先**：它是四者裡唯一一個「每台新裝置預設不通、要 network 擁有者手動 Authorize」的設計，跟這個專案既有的 `allowed-users.json` 白名單哲學（預設拒絕、擁有者逐一加入）精神一致，邊界最清楚。
- **對 ZeroTier 不利的點**：免費方案硬性 10 台裝置上限，且明講「僅限非商業、非商用」——`docs/roadmap.md` M3 之後的目標是「邀請制小社群私服，規模幾十人」，10 台裝置到時候會不夠，屆時要嘛升級付費方案要嘛換方案，這是**之後的決策點，不影響 M3-R 這次的一對一排練**。
- **Radmin VPN 備援的疑慮**：它是「network 名稱 + 密碼」模型，沒有逐台裝置的擁有者核准步驟——只要密碼沒外流，效果上也是「私人網路」，但跟 ZeroTier 的核准機制比起來，邊界仰賴密碼保密程度而非可撤銷的裝置清單。免費版沒有官方公布的數量上限，比較適合未來擴大到「幾十人」規模。這個取捨（核准機制 vs. 規模彈性）留給主力／操作者決定，不是本子 agent 該下的結論。
- **Tailscale**：專案裡已經有一份完整到 vpn-guide.md 的 Tailscale 操作指南（🟡 尚未實測），免費方案 6 人夠用（M3 只是一位朋友），但如果之後真的要衝到「幾十人」，6-user 上限比 ZeroTier 的 10-device 上限更早卡住（人數 vs 裝置數是不同單位，不能直接比較，但同樣都會在小社群規模卡住）。它的「Share」單機分享功能理論上能繞過 6-user 上限（分享單一台機器不佔用戶額度），但這條路徑比整網加入複雜很多，沒有官方文件明講能不能拿它當長期的「邀朋友入群」機制來用，本次沒有深入查證，列為待查。
- **Hamachi**：免費版 5 台電腦封頂，四者裡最早卡到規模瓶頸，且沒有找到 network 建立/加入流程的官方文件可以核對「擁有者核准」這件事——資訊最不完整，不建議優先投入時間查它。

## 使用者側量測 checklist（排練跑起來時操作者自己記）

適用情境：桌機（伺服器主機）留在家用網路，筆電切到手機行動熱點，模擬「不同網路的遠端朋友」
（`docs/reference/vpn-guide.md` 既有的排練設計）。筆電是 Win11——量測結果要先排除「已知的 Win11 卡頓」
再談 VPN／網路造成的問題，見 `docs/research/2026-09-19-win11-patch-audit/notes.md`。

- [ ] `tailscale status`／ZeroTier Central 的連線資訊（視選定的 VPN 而定）：這條連線是 **direct** 還是
      **relay**？截圖或貼文字存證。
- [ ] `tailscale ping <對方IP>` 或等效工具的延遲數字（ms），記錄 direct／relay 各自的數字。
- [ ] 進大廳、開房、開戰——**從按下開始戰鬥到進地圖能操作**的秒數（跟區網基準比較，若有的話）。
- [ ] 戰鬥中是否有卡頓／延遲：**先分清楚**這是全局性的（操作、UI 都頓，疑似 Win11 已知卡頓，
      `docs/research/2026-09-19-win11-patch-audit/notes.md`）還是只有「別人的動作」延遲、自己操作本身
      流暢（疑似網路延遲/P2P 品質）。兩種症狀分開記錄，不要混在一起下結論。
- [ ] 斷線／掉線：發生時馬上記錄 relay/direct 狀態有沒有切換、`tailscale status`（或對應 VPN 工具）
      當下的輸出。
- [ ] session log 的 `peer` 欄位：VPN 路徑下顯示的來源位址是什麼（真實 VPN IP，還是被 portproxy
      蓋掉）——`docs/reference/setup.md` 既有一條 `[GUESS]`/⬜ 未驗證，這次排練是驗證它的機會。
- [ ] 房主端 `Get-NetUDPEndpoint`／`netstat` 確認 UDP 30907 真的在監聽、防火牆規則生效（Private 類別）。

## 開放問題（留給主力／下一輪）

- ZeroTier／Radmin VPN 虛擬網卡在這台桌機／筆電上實際叫什麼名字、Windows 預設分類是 Private 還是
  Public——沒有官方文件可查，只能實測時用 `Get-NetConnectionProfile` 看。
- 最終選哪個 VPN（ZeroTier／Radmin／繼續用既有的 Tailscale 指南）不是本子 agent 能決定的，事實表列出來
  供主力比對取捨；如果決定換成 ZeroTier 或 Radmin，`docs/reference/vpn-guide.md`（Tailscale 專用）要不要
  保留、重寫還是並列，也要主力決定——本次任務範圍只涵蓋 `setup.md` 新增一節＋`client-kit/README.md`
  對應段落，没有動 `vpn-guide.md`。
- Tailscale 的「Share 單機」機制能不能撐到「幾十人」規模、跟本專案「加朋友要改白名單＋重啟伺服器」的
  現有流程搭不搭——沒有深入查，列為待查。
- Hamachi 的成員加入/核准機制沒有查到官方文件，如果之後真的要比較它，需要另外找文件或直接下載實測。
