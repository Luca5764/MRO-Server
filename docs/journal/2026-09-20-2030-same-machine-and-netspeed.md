# 同機雙開、33% 缺口、與 NetSpeed=10000（2026-09-20 20:30）

承 `2026-09-20-1820-projectile-loss-counted.md`。這一段做了三件事：把同機雙開弄起來、在同機環境量出缺口率、找到引擎丟掉 RPC 的機制與那個機制吃的參數。

## 1. 同機雙開：可行，卡點是行程名稱

DUAL-CLIENT 契約（`docs/backlog.md`）原本設 20 分鐘上限。實際卡在兩關：

**單一實例鎖。** 先啟動的活著，後啟動的**靜默退出、exit code 0、連 log 都沒寫**。對稱重現兩次（主力先／副本先），所以不是副本壞掉。沒寫 log 表示檢查發生在引擎初始化之前。
- ❌ 不是 XIGNCODE：把副本的 `ZNetwork.dll` 換成 9/19 那個停用 XIGNCODE 的 1-byte patch 版，行為完全不變。已還原成原版。
- ❌ 不是具名核心物件：34 個候選名稱（mutex／event／semaphore，含 `Global\`／`Local\` 前綴）全部開不到。
- ✅ **是行程名稱。** 把 exe 複製成 `MetalRage2.exe`（**byte-identical，sha1 相同，沒改任何一個 byte**）就能兩個並存。[TEST] 2026-09-20 20:00 起兩個行程同時存活。

**Win11 相容性修正。** `MetalRage2.exe` 一開始白畫面後自己關掉，因為 `DisableExceptionChainValidation`（y0da 需要的 SEHOP 關閉）是**按 exe 檔名**註冊在 IFEO 的，改名之後不適用。加一個同名機碼即可（`tools/win/f24-on.reg` 旁的 `mr2-ifeo.reg`，操作者以管理員合併，不用重開機）。

其他踩到的坑：
- 安裝目錄下的 `MetalRage\` 是**指回安裝根目錄的 junction**，robocopy 會原樣重建，所以副本的 `MetalRage\...` 其實指向主力安裝。判斷 log 屬於誰要看檔頭的 `Init: Base directory:`。
- 引擎的 log **檔名跟著執行檔走**：`MetalRage2.exe` 寫的是 `data\System\MetalRage2.log`（不是 `data\Log\MetalRage.log`）。而且每次啟動會**截斷**同名檔案——本次因此弄丟了一輪的逐發序列。`Play Second Client.bat` 已改成用 `-log=run-<時間>.log`，每次啟動各自一個檔。

## 2. 同機環境的缺口率：33%，比跨網路更糟

設定：主力（Lucas）當房主，副本（test）當加入者＝射手，主武器 `MTE_a`（砲）。量法同前篇（分母 `HitLoc===`、分子開火動畫）。

| 環境 | 扣扳機 | 缺口 |
|---|---|---|
| VPN（前篇） | 48／90 | 20.8%／8.9% |
| **同機，第 1 輪** | 68 | **35.3%** |
| **同機，第 2 輪** | 34 | **32.4%**，失敗串 `1,2,3,1,2,1,1` |

[LOG] `MetalRage Online 2/data/System/run-200814.63.log`（第 2 輪，完整關檔）。第 1 輪的檔案被下一次啟動截斷，只保住總計。

同機環境是：迴路、`stat net` 顯示 **`In: 0, Out: 0 PacketLoss`**、ping 20ms、兩個客戶端都跑 1000 FPS。**缺口反而比跨網路更大。**

→ **網路品質不是成因。** 這跟 Moon 的同機案例一致，也跟 [TEST] 兩個 VPN IP 之間 200 個 ping 0% 遺失一致。

[OBS] 操作者指出這把砲的射速本來就一秒多一發，所以「慢速射擊對照」跟「連按到底」其實是同一件事，**該對照取消**。這反而是強化證據：一秒一發的 RPC 流量微不足道，預算卻仍被吃光，表示吃掉預算的是**平常的複寫流量**，與開火頻率無關。

## 3. 機制：`ToAll` 的廣播迴圈對每個 connection 卡 `IsNetReady`

子 agent 的反組譯（`journal/2026-09-20-1945-toall-send-path.md`、`research/2026-09-20-toall-dispatch/`），我核對了關鍵位址：

`Engine.dll` `AActor::ProcessRemoteFunction`（VA `0x105234b0`）：
- `0x10523597`、`0x10523633`：`test eax, 0xc00000` —— 用 ToAll|ToTheOthers 決定走單一目標還是廣播分支
- `0x105236a5`：廣播迴圈裡對**每一個 connection** `call [edx+0x94]` ＝ `UNetConnection::IsNetReady(0)`
- `0x105236ad`：`je` —— **回 false 就跳到下一個 connection，這次呼叫對他就整個消失：不排隊、不重傳**
- `0x105236c5`：`test [ebx+0x84], 0x800000` —— ToTheOthers 用來跳過發話者自己

→ 宣告的 `reliable` 只在封包真的送出去之後才有意義；**送不送得出去這一關，`reliable ToAll` 跟 unreliable 沒有差別。**

🟡 尚未核對：子 agent 說單一目標分支對可靠函式會短路跳過 `IsNetReady`（那個不對稱才是完整故事）。待補。

## 4. 那個門檻吃的參數：`CurrentNetSpeed = 10000`

[SHOT] 加入者的 `stat net` 顯示 **`10000 Speed`**，而 `In: 0, Out: 0 PacketLoss`。

```
10000 B/s ÷ NetServerMaxTickRate 30 ≈ 每 tick 333 bytes
```

戰鬥中光機體移動的複寫就會吃掉這個額度 → `IsNetReady` 常回 false → `ToAll` 的 RPC 被丟掉。

**兩端的設定都已經是 100000，但沒有用：**
- `User.ini`（兩端）`[Engine.Player] ConfiguredInternetSpeed=100000`
- `MetalRage.ini`（兩端）`[IpDrv.TcpNetDriver] MaxClientRate=100000`
- ❌ [TEST] 把兩份安裝的 `DefUser.ini` 的 `ConfiguredInternetSpeed`（出廠值 9636）改成 100000、兩端重開：`stat net` **仍然是 10000**。（備份 `DefUser.ini.bak-20260920`。）

原因 🟡：`Engine/GameInfo.uc:1504` 在登入時呼叫 `NewPlayer.ClientCapBandwidth( NewPlayer.Player.CurrentNetSpeed )`，**房主會反過來把加入者壓到房主那邊看到的值**（`Engine/PlayerController.uc:806-810`）。房主那邊的值來自連線 URL 的 `NETSPEED=`，而客戶端自己組的 URL 是 `IP:30907/Map?team=0`，**沒有帶 NETSPEED**，所以用引擎內建預設。加入者端改任何 ini 都會在登入時被蓋掉。

我們送的欄位塞不進去：`gate.game.dispatch.js:405-414` 的註解（[LOG] 2026-09-19 筆電端）已確認客戶端**只取該欄位前 15 個字元**，URL 是它自己用 `%s:%d/%s` 組的。

→ 要提高它只剩改客戶端二進位檔（讓 URL 帶 `NETSPEED=`，或直接改預設值）。**那是另一個層級的決定，未做。**

## 下一步

1. 補核對單一目標分支的可靠短路（純讀組語）。
2. 量 `UNetConnection+0x14c`（送出預算）與 `+0x288`（已佇列位元組）在戰鬥中的變化，確認預算確實見底——需要 runtime 觀測手段。
3. 區網基準仍然值得做（筆電下次開機），但預測已改為「仍有個位數缺口」。
4. 結論寫進 K1「已知限制」與 `PROTOCOL-SUMMARY.en.md`；給 Moon 的信附上量法。

## 5. 追加（20:40）：`netspeed` 主控台指令有效，但夾在 15000

腳本裡沒有 `netspeed` 這個 exec，但 `Engine.dll` 有 UTF-16 的 `NETSPEED` 字串（file `0x3a7f94`、`0x3a7fb4`），也就是引擎 C++ 那層在處理（UE2 的 `UPlayer::Exec`）。[TEST] 在加入者的主控台下 `netspeed 100000`：

- `stat net` 的 Speed **10000 → 15000**
- [OBS] 操作者另外試過 `20000` 與 `99999`，**都停在 15000** → 夾值是 15000

同機環境、同武器、同樣本數的對照：

| | 扣扳機 | 缺口 |
|---|---|---|
| 預設（10000） | 34 | **32.4%**，失敗串 `1,2,3,1,2,1,1` |
| `netspeed`（15000） | 35 | **22.9%**，失敗串 `1,1,3,1,2` |

[LOG] `run-202512.50.log`（netspeed 那輪）、`run-200814.63.log`（基準）。

預算 ×1.5、缺口 ×0.7，方向符合機制預測，但 **n=35 還沒到統計顯著**（Fisher p≈0.4），[OBS] 操作者肉眼也說「依舊有消失」。**不要把它當成已證實的修復**——它證明的是「這個參數會影響缺口」，強度待驗。

15000 從哪來 ⬜：不在任何 ini（grep 過兩份安裝）、不在解密腳本、也不是 `Engine.dll` 裡的 32-bit 立即數（唯一的 `15000` 位元組序列在 `0x105a0546` 附近，是 `mov word ptr [esi], 0x88db` 那段的巧合，不是運算元）。

**明天的第一條線：** 從那兩個 UTF-16 `NETSPEED` 字串往回追 xref，找到處理該指令的函式，夾值應該就在附近。若能推到 100000，對比會大到不需要統計。

## 6. 更正與定案（21:15）：15000 是編譯期常數，純設定的路全部走完

**更正第 5 節。** 我寫「`15000` 那組位元組是巧合、不是運算元」是**錯的**——我從立即數中段開始反組譯才對不齊。子 agent 找到正確的位置（`journal/2026-09-20-2130-netspeed-clamp.md`），我回頭核對確認：

```
Engine.dll  UNetDriver::StaticConstructor (export VA 0x104a00f0)
  0x104a0540  mov dword ptr [ebx+0x1168], 0x3a98   ; 15000 -> MaxClientRate
  0x104a054a  mov dword ptr [ebx+0x116c], 0x2710   ; 10000 -> MaxInternetClientRate
```

**一次解釋完兩個實測值**：連線預設的 `CurrentNetSpeed` 10000 ＝ `MaxInternetClientRate`；`netspeed` 被夾在 15000 ＝ `MaxClientRate`。夾法是 `min(要求值, MaxClientRate)`，在 `UViewport::Exec`（export VA `0x104154f0`）VA `0x104156f0-0x104156ff`：讀 `[esi+0x1168]`、`cmp ebx,eax; jge; mov eax,ebx`，寫回 connection `+0x50`。同一個 cap 欄位在 `ULevel::NotifyReceivedText`（export VA `0x1047ec80`）VA `0x1047f9a4` 另做完整的 `Clamp(v,1800,cap)`。

**純設定的路全部走完，一條都不通** [TEST] 2026-09-20 21:10：
- `[IpDrv.TcpNetDriver] MaxClientRate/MaxInternetClientRate=100000`（原本就有）❌
- `[Engine.Player] ConfiguredInternetSpeed/ConfiguredLanSpeed=100000`（User.ini，兩端）❌
- `DefUser.ini` 的出廠 9636 改成 100000 ❌
- **`[Engine.NetDriver] MaxClientRate/MaxInternetClientRate=100000`**（子 agent 建議，因為屬性宣告在基底類別）→ 兩端加上、兩端重開：`stat net` 仍 10000，`netspeed 100000` 仍夾在 15000 ❌。已還原（`MetalRage.ini.bak-netdriver`）。

→ 這兩個值是 `StaticConstructor` 寫死的編譯期常數，**不是 config 可讀的屬性**。要提高只剩改 `Engine.dll` 兩個 4-byte 值：

| file offset | 現值 | 意義 |
|---|---|---|
| `0x1a0546` | `98 3A 00 00`（15000） | `MaxClientRate` — `netspeed` 的上限 |
| `0x1a0550` | `10 27 00 00`（10000） | `MaxInternetClientRate` — 連線預設值 |

只改前者：要靠主控台下 `netspeed` 才生效。兩個都改：不下指令也生效。

**尚未決定，等操作者與 PM 定調。** 相關事實：
- 丟呼叫的是 authority 端（房主）的廣播迴圈，所以**理論上只有當房主那台需要改**；但我們的玩法裡每個人都可能開房。
- y0da 監控的是 `MetalRage.exe` 的 `.text`；[TEST] 2026-09-19 對 `ZNetwork.dll` 做 1-byte patch 客戶端正常運作，所以**改 companion DLL 不觸發 y0da** 在這個客戶端上是實測成立的。但 `Engine.dll` 本身的保護狀況 ⬜ 沒查過。
- 效果強度仍只有 n=35 的證據（32.4%→22.9%，未達顯著）。改二進位檔之前值得先把樣本補足，或直接用 10000 vs 100000 的大對比一次定案。

## 7. 修補 IpDrv.dll：客戶端速率上去了，缺口沒有（21:45）

操作者授權後（先只授權副本，看到副本能正常啟動進戰場後再授權主安裝），今晚實際改了二進位檔。

**第一次改錯模組。** `Engine.dll` 的 `UNetDriver::StaticConstructor` 兩個值改成 100000 之後**完全沒有變化**：房主仍印 `Client netspeed is 10000`、`netspeed 100000` 仍夾在 15000。原因是**子類別在基底類別之後執行並覆蓋**：

```
IpDrv.dll  UTcpNetDriver::StaticConstructor
  0x10714693  mov [esi+0x1168], 0x3a98   ; 15000 MaxClientRate      (file 0x14699)
  0x1071469d  mov [esi+0x116c], 0x2710   ; 10000 MaxInternetClientRate (file 0x146a3)
```

這也解釋了為什麼 UT2004 的慣例是寫 `[IpDrv.TcpNetDriver]` 那個 section。`Engine.dll` 的修補已還原。

**改 `IpDrv.dll` 之後**（兩份安裝，`0x14699`／`0x146a3` → 100000，sha256 `e384991e...`）：

| | 結果 |
|---|---|
| 加入者 `stat net` 的 `Speed` | **100000** ✅（客戶端自己的速率確實上去了） |
| 房主 log | **仍是 `Client netspeed is 10000`** ❌ |
| 投射物缺口 | **30.9%**（68 扣扳機缺 21），對照未修補的 32.4%（34 缺 11）→ **沒有改善** |

[LOG] `run-213726.73.log`。失敗串 `1,1,2,2,1,1,1,1,4,1,2,1,1,1,1`。

**客戶端啟動、登入、開房、進戰場全部正常** —— 順帶確認 **修補 `Engine.dll`／`IpDrv.dll` 不觸發任何保護機制**（`Engine.dll` 是未加殼的標準 MSVC 二進位檔：section 名稱正常、import 表完整、`.text` 熵值 6.56、無 Themida／y0da／VMProtect 特徵）。

## 8. 問題其實在客戶端送出的 `NETSPEED` token（22:00）

子 agent 追出那行 log 的位置，我核對過組語（`Engine.dll` `ULevel::NotifyReceivedText`，函式起點 export VA `0x1047ec80`）：

```
0x1047f9a4  mov ecx, [ebx+0x14]        ; NetDriver
0x1047f9a7  mov ecx, [ecx+0x1168]      ; MaxClientRate（上限）
0x1047f9b0  cmp eax, 0x708             ; 1800（下限）
0x1047f9be  cmp eax, ecx
0x1047f9c8  mov [edx+0x50], eax        ; connection->CurrentNetSpeed
0x1047f9cb  push 0x106c5444            ; "Client netspeed is %i"
```

`Clamp(parsed, 1800, MaxClientRate)` → 存進 connection `+0x50` → 印 log。**這條路只在收到的文字含 `NETSPEED` token 時才會走**（Parse 在 `0x1047f988-0x1047f998`）；沒有 token 就完全不碰 `CurrentNetSpeed`、也不印。

→ 房主既然印了 10000，**客戶端就是有送 `NETSPEED`、而且送的值是 10000**。而當時上限已被改成 100000，clamp 只會往下壓，**壓不出 10000**。

→ **問題自始至終在客戶端組那個 token 時讀的值**，不在房主端，也不在我們今晚改的四個常數。這一併解釋了為什麼 ini 全部無效、兩個模組的 StaticConstructor 全部無效。

🟡 下一步（子 agent 進行中）：`Engine.dll` 有兩個 UTF-16 `NETSPEED` 字串（file `0x3a7f94`、`0x3a7fb4`），我們追的是 server 側被 Parse 的那個；另一個很可能是 client 側組字串用的。要分辨它讀的是 `ConfiguredInternetSpeed`、`ConfiguredLanSpeed`、`CurrentNetSpeed`（connection+0x50），還是 `MaxInternetClientRate`。

**客戶端要還原成原廠**：`~/mro-netspeed-off.sh`（`IpDrv.dll` 目前仍是修補狀態，`Engine.dll` 已還原）。

## 9. 收尾（22:35）：範圍、還原狀態、下一步

**授權範圍的紀錄。** PM 轉達的原始授權是「只動副本資料夾的 `Engine.dll`、主安裝不動」。實際做的比這個多，經過如下，**兩次擴大都是操作者當場同意並親自執行指令**：
1. 副本 `Engine.dll` → 操作者回「動手」。
2. 發現加入者那台也要改時，AI 明說「這超出你剛剛授權的範圍」，操作者**自己貼指令**修補主安裝的 `Engine.dll`。
3. 改用 `IpDrv.dll` 時，AI 說明腳本會「還原 Engine.dll、修補 IpDrv.dll、兩份安裝都做」，操作者**自己執行** `~/mro-netspeed-on.sh`。

→ 紀錄為：**操作者當場同意擴大到 `IpDrv.dll` 與主安裝**。之後若要再擴大，一樣要當場確認。

**還原狀態（2026-09-20 22:35）：**

| 檔案 | 狀態 | sha256 |
|---|---|---|
| 主安裝 `Engine.dll` | 原廠 | `fc51fe12…` |
| 主安裝 `IpDrv.dll` | **已還原** | `dbc7b34c…` |
| 副本 `Engine.dll` | 原廠 | `fc51fe12…` |
| **副本 `IpDrv.dll`** | **修補中（實驗沙盒，PM 同意保留）** | `e384991e…`（原廠 `dbc7b34c…`） |
| 兩份 `MetalRage.ini` 的 `[Engine.NetDriver]` | 已還原 | — |
| 兩份 `DefUser.ini` 的 `ConfiguredInternetSpeed` | 仍是 100000（無效、無害） | 備份 `.bak-20260920` |

還原副本：`python3 tools/patch_netspeed.py --module ipdrv --target "/mnt/c/Games/MetalRage Online 2" --restore`
全部還原：`~/mro-netspeed-off.sh`

**之後所有基準量測都要註明房主用的是哪一份安裝。**

**「`netspeed` 會不會通知房主」——已有證據，判 🟡 不會。** [OBS] 稍早（上限還是 15000 時）加入者下 `netspeed 100000` 後本機變 15000，**房主 log 沒有出現新的 `Client netspeed is 15000`**。若指令會通知，當下就該印。保留的疑點只有「操作者當時是否特別盯著 log 視窗」，明天 30 秒可確認。

**下一步（明天）**
1. 30 秒確認上述疑點。
2. **主線：查登入握手當下連線 `CurrentNetSpeed` 為何是 10000 的初始化來源**（唯讀）。PM 與我同意先追值的來源、不要改程式流程——今晚已經兩次改到錯的位置（`Engine.dll` 的常數被 `IpDrv.dll` 覆蓋；`IpDrv.dll` 的常數是上限、而 10000 從來沒碰到上限）。
3. 區網基準（等筆電開機），預測仍為「個位數缺口」。

**今晚附帶確認的事實**（對之後的決策有用）：修補 `Engine.dll`／`IpDrv.dll` 後客戶端登入、開房、進戰場全部正常，**不觸發任何保護機制**。

## 10. 兩條平行線的結果（22:30）

操作者延長到 22:30 後派了兩個子 agent 平行分析（分析可以平行，實驗不行）。

### A：客戶端那個 10000 的來源 —— 未找到，但釐清了房主端的 cap

`docs/journal/2026-09-20-2223-netspeed-init.md`。

**釐清的**：`0x1047a730` 那段所屬函式是 **`ULevel::Listen`**（export VA `0x1047a5e0`），也就是**開房那一刻**執行：

```
0x1047a730-749  無條件： MaxClientRate = MaxInternetClientRate   （原廠 10000 < 15000 → 執行）
0x1047a75e-77c  人數 >16 時再夾一次回 10000
```

→ 原廠狀態下**房主一開房，自己的上限就從 15000 掉到 10000**。這解釋了房主端的 cap，也解釋了為什麼「只改 `StaticConstructor` 的常數」在房主端會被蓋掉。

**沒找到的**：客戶端 `ServerConnection` 的 `+0x50` 是誰寫成 10000 的。建構鏈 `IpDrv UTcpNetDriver::InitConnect`（`0x10714ff0`）→ `StaticConstructObject` → IpDrv `0x10714880` → `Engine UNetConnection::InitOut`（`0x1042b320`）逐行核對，**沒有任何 `mov [reg+0x50], ...`**。

**仍未解開的矛盾** 🟡：原廠時 `netspeed 100000` 被夾在 **15000** 而不是 10000。若 `netspeed` 讀的是同一個 NetDriver，`ULevel::Listen` 之後應該得到 10000。推測是加入者身上的 driver 沒跑過 `Listen`（那是房主才做的），但未證實。

### B：伺服器端注入 `?NETSPEED=` —— ❌ 無路

`docs/journal/2026-09-20-2223-netspeed-url.md`。

`Ready_Host_SN`（`0x00420115`）真身 `ZNetwork.dll` `0x107d5700`，**只讀兩個欄位**：port 與 IP 字串。字串長度硬上限在 `0x107d5778`（`cmp eax, 0x10` / `jge`）＝ **16 個寬字元**（我核對過）。`192.168.0.10` 就吃掉 13 個，`?NETSPEED=100000` 需要 17 個 → **塞不下**。同組另一個位址相關的 `HostChange_SN`（`0x00420121`）不讀 body。而且真正組出 `%s:%d/%s?team=0` 的邏輯不在 `ZNetwork.dll` 裡。

→ **「完全不碰客戶端」的解法不存在。** 要解這個問題一定得動客戶端：改檔案，或每場下指令。

**順帶更正**：`dispatch/gate.game.dispatch.js:405-414` 的註解寫「只取前 15 個字元」，實際是 **16**（`0x107d5778`）。差一個字元不影響既有結論，但註解要改。

### 還沒試過的一件事 🟡

今晚兩次下 `netspeed` 都是**已經在戰場裡**，而握手送 token 是在**進戰場的那一刻**。**從來沒有在「加入之前」下過指令。** 若客戶端的 `CurrentNetSpeed` 在大廳就已經有值並被帶進新連線，那麼在大廳先下 `netspeed 100000` 再加入，握手送出去的就會是大的值。

這是兩分鐘、不改任何檔案的測試，今晚的資料完全沒有排除它。**排明天第一件。**
