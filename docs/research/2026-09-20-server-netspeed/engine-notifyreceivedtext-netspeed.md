# Engine.dll — 疑似 ULevel::NotifyReceivedText 的 NETSPEED 分支

核對方式：`tools/disasm.py str/xref/at`，逐行核對過（唯讀，未執行客戶端）。

## 字串

| 內容 | 模組 | file offset | VA |
|---|---|---|---|
| `"Client netspeed is %"` (UTF-16) | Engine.dll | 0x3c5444 | 0x106c5444 |
| `"HAVE"` (UTF-16，緊接在前) | Engine.dll | 0x3c5438 | 0x106c5438 |
| `"NETSPEED"` (UTF-16，無 `=`) | Engine.dll | 0x3a7fb4 | 0x106a7fb4 |
| `"NETSPEED %i"` / `"LAN"` (UTF-16，另一叢) | Engine.dll | 0x3a7f94 | 0x106a7f94 |
| `?execSetNetSpeed@APlayerController@@QAEXAAUFFrame@@` (mangled ASCII, debug-only, 0 個組語 xref) | Engine.dll | 0x4a6c4b | 0x107a6c4b |

## 函式（起點 VA `0x1047ec80`，`__thiscall`：ecx→ebx＝this；[ebp+8]＝connection 參數；[ebp+0xc]＝收到的文字）

僅有的 `"Client netspeed is %"` xref：file `0x17f9cc`（VA `0x1047f9cc`），在本函式內。

```
0x1047f988  lea   ecx, [ebp+0xc]
0x1047f98b  push  0x106a7fb4        ; "NETSPEED"
0x1047f990  push  ecx
0x1047f991  call  edi               ; Parse(text, "NETSPEED", &value) 風格
0x1047f993  add   esp, 8
0x1047f996  cmp   eax, esi           ; esi=0
0x1047f998  je    0x1047f9e6         ; 沒找到 → 跳到別的 token 分支，不設 CurrentNetSpeed、不印 log
0x1047f99a  mov   edx, [ebp+0xc]
0x1047f99d  push  edx
0x1047f99e  call  dword ptr [0x10679464]   ; 轉整數（atoi 類）
0x1047f9a4  mov   ecx, [ebx+0x14]    ; this+0x14 → NetDriver 指標
0x1047f9a7  mov   ecx, [ecx+0x1168]  ; NetDriver->MaxClientRate（StaticConstructor 寫死 15000）
0x1047f9b0  cmp   eax, 0x708         ; 0x708=1800
0x1047f9b5  jge   0x1047f9be
0x1047f9b7  mov   eax, 0x708
0x1047f9bc  jmp   0x1047f9c4
0x1047f9be  cmp   eax, ecx
0x1047f9c0  jl    0x1047f9c4
0x1047f9c2  mov   eax, ecx           ; clamp 上限＝MaxClientRate
0x1047f9c4  mov   edx, [ebp+8]       ; connection 參數
0x1047f9c7  push  eax
0x1047f9c8  mov   [edx+0x50], eax    ; connection->CurrentNetSpeed = clamp(parsed,1800,MaxClientRate)
0x1047f9cb  push  0x106c5444         ; "Client netspeed is %"
0x1047f9d0  mov   eax, [0x10679220]
0x1047f9d5  mov   ecx, [eax]
0x1047f9d7  push  ecx
0x1047f9d8  call  dword ptr [0x10679210]   ; debugf 風格 log
0x1047f9de  add   esp, 0xc
0x1047f9e1  jmp   0x10480125
0x1047f9e6  lea   edx, [ebp+0xc]
0x1047f9e9  push  0x106c5438         ; "HAVE"
0x1047f9ee  push  edx
0x1047f9ef  call  edi
...（換下一個 token，不再碰 CurrentNetSpeed / 不印這行 log）
```

**結論（🟡 待審）：** 這個 log 只在收到的文字裡解析到 `"NETSPEED"` token 時才會印，且只在那個分支才會寫 `connection+0x50`（CurrentNetSpeed）。clamp 只會把「超過上限」的值往下夾——10000 本身小於已修補的 100000 上限，夾不出 10000，所以「兩端 IpDrv.dll 都改成 100000 後，房主仍印 10000」這個現象**不能用這段 clamp 解釋**：10000 這個數字本身的來源不在這段程式碼裡，是在呼叫這個 Parse 之前就已經寫進「收到的文字」裡（不管是誰組出來的）。

## IpDrv.dll 交叉核對：+0x1168／+0x116c 只出現一次

```
$ 對 IpDrv.dll 全檔搜尋 dword 0x1168／0x116c 的出現位置
0x14695（+0x1168）／0x1469f（+0x116c）── 唯一一組，就是已知的 UTcpNetDriver::StaticConstructor（VA 0x10714693/0x1071469d）
```

IpDrv.dll 裡**沒有任何其他地方**讀寫這兩個欄位——換句話說，房主端 connection 的 CurrentNetSpeed 預設值（未收到 NETSPEED token 之前是多少）**不是**在 IpDrv.dll 的 InitConnection 之類函式裡從 `+0x116c` 複製過來的（至少不是直接複製；IpDrv.dll 沒有這段程式碼）。若真的有這一步，應該在 Engine.dll 的 base class `UNetConnection` 初始化路徑裡，尚未定位到。

Engine.dll 全檔搜尋「`c7 [modrm] 50 10 27 00 00`」（`mov dword ptr [reg+0x50], 0x2710`，即直接把字面 10000 寫進某物件 +0x50）：**0 筆命中**。也就是說找不到「把 10000 當常數直接寫進 +0x50」的程式碼——10000 若真的作為預設值出現，走的不是這種直接立即數寫入。

## 未完成

- 沒能定位到 `connection+0x50` 的「初始建立時預設值」寫入點（推測在 Engine.dll 的 `UNetConnection::InitConnection` 或建構式，但搜尋 +0x1168/+0x116c 在 Engine.dll 有十幾筆命中，多數看起來是同一份「大結構逐欄位複製」的樣板碼（CDO→instance），沒能在時間內篩出真正對應 InitConnection 的那一筆）。
- 沒能確認客戶端送給房主的登入/文字訊息裡是否真的包含 `"NETSPEED"` token（沒有現成的封包 hex dump 可查；若確認裡面根本沒有這個 token，上面整段 clamp 分支就從未執行，「Client netspeed is 10000」這行 log 的印出機制要另尋別處）。
- `?execSetNetSpeed@APlayerController@@...` 這個字串在 .data 裡沒有任何組語 xref（可能只是連結器留下的除錯符號，不是執行期查表用的字串），沒有再往下查。
