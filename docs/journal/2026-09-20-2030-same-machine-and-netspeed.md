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
