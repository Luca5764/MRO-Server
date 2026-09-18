# D1-C：開戰握手與戰鬥主機

狀態：🟡（中階分析，未經跨公司審查）。

## 單人時的握手序列（[LOG] `session-20260918-225741.jsonl` 約 1295–1308 行）

C→S `0x00222103`（按開始）→ S→C `Ready_Host_SQ 0x00420113`（6 bytes，全 0）→ `Game_Info_SN 0x00222111` → `Game_Ready_SN 0x00222102` → `Game_Start_SN 0x00222104` → `Game_Wait_SN 0x00420111` → `Ready_Host_SN 0x00420115`（u16 Port＋u8 0＋ASCII "IP/Map\0"）→ C→S `0x00420114`（8 bytes，最後 2 bytes 等於剛收到的 Port）→ S→C `Ready_Success_SN 0x00420116` → 約 6 秒後 `BeginRound_SN 0x00230152`。

## 房主判定

- [DLL] `Ready_Host_SQ` handler `0x107d5630` 在 `0x107d56bd` 呼叫 `Game_Ready_P2P`（`0x107087bf` → `0x1072ce10`，`or [ecx+0xfac],1`＝IsHost）。要不要呼叫，看的是客戶端本地的 `byte [esi+9]`，**不看封包內容**。
- ⬜ `[esi+9]` 由誰寫入：交給 D1-C2 查。猜測（🟡）跟 `User_Master_SN 0x00220319` 有關。
- **影響：** 設計稿原本假設「伺服器指定房主」，這個前提要改。房主是誰，可能取決於伺服器先前送的 User_Master_SN。

## 主機位址與埠

- [DLL] `Ready_Host_SN`（`0x107d5700`）寫進 `[this+0xfb0]` HostIP、`[this+0xfbc]` HostPort，這兩個欄位只有**加入者**分支（`start %s:%d/%s?team=%d`）會用到。
- [DLL] 房主分支的 LPort 取自 `[this+0x388]`（`Game_Info_URL_Get` `0x10733cf0`，格式字串在 `0x10814a50`）。`[this+0xfd4]` 是 TimeLimit，**不是** LPort（上一個子 agent 的說法已被推翻）。誰寫入 `+0x388` ⬜。實測 LPort=30907（`journal/2026-09-17-08`）。
- 客戶端的協定裡**沒有**回報自己 IP 的封包；`0x00420114` 看起來只是把 Port 回送回來（⬜ 還沒用不同的 Port 驗證過）。
- 伺服器目前 `sendReadyHostSn` 送的是 `socket.localAddress`，也就是伺服器自己的位址。單人時房主就是自己，這個欄位不會被用到，所以不影響。

## 多人時房主 IP 的可能來源（待裁決）

1. 經過 portproxy 後，TCP 來源全是 `192.168.208.1`，**不能用**。
2. 把 WSL 改成 mirrored networking，伺服器就看得到真實來源 IP，房主的 IP＝房主那條 TCP 連線的 `remoteAddress`。缺點：要改 `.wslconfig` 並重啟 WSL（N0 當時因此沒選它）。
3. 手動設定表：`config/server.json` 加一個 `hostAddresses: { "<帳號>": "<IP>" }`，跟 publicHost 同一種做法。適合少數固定的朋友。
4. 房主的 UDP 監聽埠（LPort，實測 30907）要在房主那台機器的 Windows 防火牆開放 UDP inbound，VPN 也要讓它通。

## D1-C2 補查：誰當房主由伺服器決定（2026-09-19）

- [DLL] `Ready_Host_SQ` handler `0x107d5630`（高階親自讀了 `0x107d5686`–`0x107d56ce`）：
  - `[this+9] != 0` → `Game_Ready_Again`（`0x107016fe`）
  - 否則，若 `GIsClient` → **`Game_Ready_P2P`**（`0x107087bf`，設 IsHost，開 Listen）
  - 否則 → `Game_Ready_Dedi`（`0x107035ee`）
- this＝`ZDispatchGame` 本身（建構子 `0x107d8a90` 把 `[esi+9]` 設為 0，vtable `0x1081775c`）。`[this+9]` 唯一的寫入點是 **`HostChange_SN 0x00420121`**（`0x107d5a00`，`0x107d5a69` 寫 1）；`Ready_Host_SN` 會把它清回 0（`0x107d5819`）。
- **結論（🟡，未經跨公司審查）：收到 `Ready_Host_SQ` 的客戶端就會當 P2P 房主。** 多人時只送給房主；加入者只收 `Ready_Host_SN`（房主的 IP／埠），走 `start IP:Port/Map` 那條路徑。`HostChange_SN` 用在中途換房主（→ `Game_Ready_Again`）。單人時兩個封包都送給同一個人，所以一直沒出問題。
- LPort：`UZNetwork_DJ::System_Init`（`0x10739ad0`）讀 ini `[URL] ServerPort`（命令列可用 `-serverport:` 覆寫），在 `0x10739d0f` 寫入 `[this+0x388]`。所以房主監聽的是自己 ini 裡的 ServerPort（目前 30907）。另有 setter `Address_Local_Set`（`0x10715830`）也會寫這個欄位，但沒找到呼叫者 ⬜。
- `Ready_Host_SN` 的 body 偏移已確認：`0x107d57b8` 讀 frame+0x10＝body+0x00 u16 Port；`0x107d575d` 從 frame+0x13＝body+0x03 開始是 ANSI，經 `winToUNICODE` 轉換。

## PM 審查回覆（2026-09-19）

- PM 問的「[+9]==0 之後的第二個分支」，在上面「D1-C2 補查」那一段已經寫了：`0x1091b884` 是 `Core.dll!GIsClient`（import 名 `?GIsClient@@3HA`）；非 0 → `0x107087bf` `Game_Ready_P2P`，0 → `0x107035ee` `Game_Ready_Dedi`（名稱取自 export 表，高階 2026-09-19 查過）。
- 房主 IP：**PM 裁決走設定檔**（帳號 → host 位址，放進跟白名單同一份設定），不改用 mirrored networking。設定缺漏時，明確拒絕該帳號當房主開戰並寫 log，不可退回 localAddress。
- 埠：還要實測補強。房主在戰鬥中，在那台 Windows 上執行 `netstat -ano | findstr <MetalRage PID>`，確認實際監聽的協定和埠。確認後開 N2（房主機器的防火牆輸入規則，只限 Private、遠端限區網網段）。
