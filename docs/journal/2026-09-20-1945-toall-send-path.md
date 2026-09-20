# `ToAll` 送出路徑：Engine.dll 反組譯（2026-09-20 19:45）

## 任務

中階唯讀反組譯任務（見 PM 派工契約）。問題：以 `reliable ToAll` 宣告的函式，實際送出時走的是不是可靠通道？背景見
`docs/journal/2026-09-20-1820-projectile-loss-counted.md`（去程 100%、缺口全在回程、孤立單發、FunctionFlags 層面
`ToAll`/`ToTheOthers` 都保留 `FUNC_NetReliable`）。

工具：`tools/disasm.py`（exports/at）、`DLL=Engine.dll tools/ghidra/decompile.sh`。原始 decompile／組語存在
`docs/research/2026-09-20-toall-dispatch/`。

## 找到的函式

`AActor::ProcessRemoteFunction`，匯出 `?ProcessRemoteFunction@AActor@@UAEHPAVUFunction@@PAXPAUFFrame@@@Z`，
**VA `0x105234b0`**（Engine.dll）。這是 UE2 net RPC 的送出前置：決定要送給誰、怎麼送。已用
`tools/disasm.py at 0x105234b0 220 Engine.dll` 核對過組語，不是只看 decompile。

FunctionFlags 在 `UFunction+0x84`（與先前 journal 用 `uetool` 讀出的數值吻合：`0x40`=FUNC_Net、`0x80`=NetReliable、
`0x400000`=ToAll、`0x800000`=ToTheOthers）。

## 兩條分支：single-target vs broadcast

`test eax, 0xc00000`（VA `0x10523633`）判斷 `FunctionFlags & (ToAll|ToTheOthers)`，決定走哪條：

**Single-target（沒有 ToAll/ToTheOthers，走 owner connection 一個）**——VA `0x10523662`–`0x1052373c`：
```
mov al, [ebx+0x84]        ; FunctionFlags 低位元組
test al, al
jns 0x1052373c            ; 高位（0x80=NetReliable）沒設 → 才需要往下測
...
call dword ptr [eax+0x94] ; IsNetReady(connection, 0)   ← 只有「不可靠」才需要問
test eax, eax
je 0x1052373c             ; 不可靠又沒 ready → 放棄
0x10523726: call 0x10522560   ; 送
```
`jns` 是「符號位沒設就跳過送出」，符號位對應的就是 `FunctionFlags` 低位元組的 bit 0x80（`(char)flags<0`）。
**可靠函式會短路跳過 `IsNetReady` 直接送**，這是 `||` 的順序保證的。

**Broadcast（有 ToAll 或 ToTheOthers）**——VA `0x10523690`–`0x105236f6`，對 `UNetDriver::ClientConnections`
（`FUN_103a97d0` 從 `*(NetDriver+0x40)+0x30` 複製出來的 TArray）裡每一個 `UNetConnection*` 跑一輪：
```
call dword ptr [edx+0x94]   ; IsNetReady(connection, 0)      ← 無條件要問，沒有可靠短路
test eax, eax
je 0x105236f6               ; 沒 ready → 這個 connection 整個跳過，不送
call 0x1042c330             ; 該 connection 是否已有這個 actor 的 channel（relevancy）
test eax, eax
je 0x105236f6
test dword ptr [ebx+0x84], 0x800000   ; ToTheOthers 才做的：跳過發話者自己的 connection
je 0x105236d6
cmp [ebp-0x18], esi
je 0x105236f6
...
call 0x10522560              ; 送（跟 single-target 呼叫同一個函式）
```

**核心發現：broadcast 迴圈裡完全沒有 single-target 那個「可靠就短路跳過 `IsNetReady`」的判斷。** 不管函式是不是
`reliable`，`ToAll`/`ToTheOthers` 對每一個收件 connection 都先問 `IsNetReady(connection, 0)`，答 false 就整個跳過那個
connection——不送、不排隊、不重試。

`IsNetReady` 已反編譯（`UNetConnection::IsNetReady`，VA `0x1042b450`，匯出名對得上 vtable+0x94，見
`docs/research/2026-09-20-toall-dispatch/vtable-confirmation.txt`）：
```
return (this->SendBudget[+0x14c] + CurrentBitWriter.GetNumBytes()[+0x288]) < 1;
```
是每個 connection 自己的頻寬／已佇列位元組預算檢查，跟可不可靠無關，是「這個 tick 這條線還吃得下嗎」。

`FUN_10522560`（收件端實際組 `FOutBunch` 並呼叫 `UChannel::SendBunch` 的函式，single-target 與 broadcast 兩條路徑
都呼叫它）內部**還是有**「讀 FunctionFlags 高位元組決定 bReliable」這段（`(char)flags<0`，同樣的符號位判斷），代表一旦
真的走到這一步，`bReliable` 的位元確實會照 `FunctionFlags` 設對——問題不在這裡，而在 broadcast 迴圈**有沒有機會把某個
connection 送進來**。

## 回答任務問題

**以 `reliable ToAll` 宣告的函式，實際送出時走的「是」可靠通道——但只限於它真的被送出的那個瞬間。** 引擎不會把
`ToAll` 降級成 unreliable。但 broadcast 迴圈用 `IsNetReady` 當**送不送的門檻**，而且沒有可靠短路：如果某個玩家的
connection 在那個 tick 剛好頻寬滿了（`SendBudget + 已佇列位元組 >= 1`），這一次 `ClientFireProjectileCenterLoc_MH`
對那個玩家就整個不會被呼叫，`FOutBunch` 根本沒被建立，也就沒有東西可以「重傳」——可靠通道的重傳機制保護的是「已經
排進去的 bunch」，這個呼叫連排都沒排進去。

這跟 single-target 的 `ServerFireProjectileCenterLoc_MH`（去程，可靠、非 broadcast）形成對比：single-target 的可靠
函式無條件送（短路跳過 `IsNetReady`），對得上實測「去程 34/34＝100%」。

## 能不能解釋 9–20% 的孤立單發遺失

**能，方向和形狀都對得上，但沒有量化證據，標 🟡：**
- 只影響 broadcast（`ToAll`/`ToTheOthers`），不影響 single-target——對得上「缺口全部在回程」。
- 每個 connection 各自獨立判斷 `IsNetReady`，一次開火可能對 A 玩家送成功、對 B 玩家失敗——對得上「孤立單發、不是整段連續失敗」，也對得上「房主收到 34/34 卻有玩家看不到部分發」。
- `IsNetReady` 是瞬時頻寬快照，實測 RTT 抖動 20/43/189ms 的那條連線更容易在某個 tick 剛好不 ready——方向對，但這份任務沒有去量測「連發時頻寬預算」實際數值，無法從組語直接算出 9–20% 這個比例。

## 不確定／待審

- `FUN_10522560` 的參數對應（Ghidra 標的 `param_1..param_5` 型別跟呼叫端傳的順序對不太上，懷疑是 thiscall 被 Ghidra 拆散），內部「設 `bReliable`」那段的確切記憶體位置（`uStack_12`）沒有完全對到 `FOutBunch` 的欄位偏移，只確認了「有一段用同一個符號位判斷法讀 FunctionFlags」，語意上合理但沒有逐位元組核對 `FOutBunch` struct layout。
- `this+0x7e`（role byte）、`this+0x9c`、`this+0xa0` 這幾個 `AActor`/`ULevel` 欄位偏移沒有逐一核對，只按上下文合理猜測（Authority role、NetDriver 指標鏈），不影響本次結論但不要直接引用當作已確認的欄位表。
- 沒有做任何測試/連線觀察，純讀碼；「IsNetReady 在戰鬥高峰期真的常常是 false」這件事沒有實測支撐。

## 建議下一步

如果要把 🟡 推進成 ✅，需要量到 `IsNetReady` 判斷式左邊那兩個欄位（`UNetConnection+0x14c` 的送出預算、`+0x288` 的
已佇列位元組）在戰鬥時的實際變化——例如在客戶端這條路徑上下斷點或計數（超出這次唯讀任務範圍，且 anti-attach 擋著
runtime attach，需要另外討論）。退而求其次：檢查 `UNetConnection` 的 `CurrentNetSpeed`/`NetSpeed` 設定與伺服器端連線
數，看看多人同場時是否容易把單一 connection 的預算榨乾。

Agent: claude-sonnet (中階)
