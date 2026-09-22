# 高階覆核：Moon 的 budget 修補

verifier 的逐指令核對在 `disasm-0x1042e1ee.txt`。這份只記**高階自己重算的部分**。

## 1. 語意確實是 Moon 說的 clamp（核對成立）

```
0x1042e1ee  fimul [esi+0x50]      ; ST0 = DeltaTime * CurrentNetSpeed = D
0x1042e1f1  fld   st(0)           ; ST0=D  ST1=D
0x1042e1f3  call  0x1063e244      ; eax = (int)D   （ftol 類 helper，會 pop）
0x1042e1f8  fadd  st(0),st(0)     ; ST0 = 2D
0x1042e1fa  mov   ecx,[esi+0x14c] ; ecx = QueuedBytes
0x1042e200  sub   ecx,eax         ; ecx = QueuedBytes - D
0x1042e202  fchs                  ; ST0 = -2D
0x1042e204  mov   [ebp-0x1c],ecx
0x1042e207  fild  [ebp-0x1c]      ; ST0 = (float)(QueuedBytes-D)  ST1 = -2D
0x1042e20a  mov   [esi+0x14c],ecx ; 無條件寫回
0x1042e210  fcomp st(1)           ; 比較後 pop → 堆疊頂剩 -2D
0x1042e217  jp    0x1042e226      ; 不需夾 → 0x1042e226 fstp st(0) 丟掉 -2D
0x1042e219  call  0x1063e244      ; 需要夾 → eax = (int)(-2D)
0x1042e21e  mov   [esi+0x14c],eax ; QueuedBytes = -2D
```

＝ `QueuedBytes -= D; if (QueuedBytes < -2D) QueuedBytes = -2D`，與 Moon 的偽代碼一致。
實作是**先無條件寫 `QueuedBytes-D`、再視比較覆寫**，不是單一路徑寫入 —— 不影響結論，
但改動時要知道有兩個寫入點。

`[esi+0x50]` 就是我們自己確認過的 `CurrentNetSpeed`（`2026-09-22-0703`，`mov [edx+0x50],eax`
@ `0x1047f9c8`），偏移相同、讀寫方向相反。`[esi+0x14c]` 在這段三次存取全是整數 `mov`，
沒有 x87 直接碰它 → 在這段裡是整數欄位。

⬜ **函式身分確認不了**：往前最近的 prologue 在 `0x1042dda0`（MSVC SEH，`ecx`→`esi` 當 this，
開頭就 `call [eax+0x84]` 走 vtable），指令流連續到目標、中間無 `ret`，所以**同一個函式**成立；
但 xref 只找到兩筆 `.rdata` dword（研判 vtable slot），**沒有任何字串或 RTTI 把它綁到
`UNetConnection::Tick`**。風格相符，名稱未證。這不影響機制判讀。

> **更正（2026-09-23，Sol 跨公司審查）：此 ⬜ 已解除。** `Engine.dll` 的匯出表直接把
> `0x1042dda0` 命名為 `?Tick@UNetConnection@@UAEXXZ`，目標區間在同一函式內、中間無 `ret`，
> 所以這就是 `UNetConnection::Tick`。當初漏掉是因為只查了 xref 與字串，沒有查匯出表。

## 2. 跳轉算術（高階自己算的，verifier 沒算這段）

- 去程 `0x1042e1f8: E9 23 A9 24 00` → 下一條 `0x1042e1fd` + `0x0024a923` = **`0x10678b20`** ✅
- 回程 cave 尾 `E9 C5 56 DB FF`（在 `0x10678b36`）→ 下一條 `0x10678b3b` + `(-0x0024a93b)`
  = **`0x1042e200`** ＝ `sub ecx,eax` ✅

cave 解碼：
```
DC C0              fadd st(0),st(0)      ; 2D          （重現被覆蓋的第一條）
8B 4E 50           mov  ecx,[esi+0x50]   ; CurrentNetSpeed
C1 E9 02           shr  ecx,2            ; NetSpeed/4
89 4D E4           mov  [ebp-0x1c],ecx
DB 45 E4           fild [ebp-0x1c]       ; ST0 = NetSpeed/4  ST1 = 2D
DE C1              faddp st(1),st(0)     ; ST0 = 2D + NetSpeed/4
8B 8E 4C 01 00 00  mov  ecx,[esi+0x14c]  ; 重現被覆蓋的第二條
E9 C5 56 DB FF     jmp  0x1042e200
```
回到 `0x1042e202 fchs` 後 ST0 ＝ **`-(2D + CurrentNetSpeed/4)`**，效果與 Moon 的描述一致。

**`[ebp-0x1c]` 的重用是安全的**（這點要記下來，是最容易出事的地方）：cave 借用這個 slot
放 `NetSpeed/4`，但原程式在 `0x1042e204` 會**先寫入**再於 `0x1042e207` `fild`，
cave 的使用在返回前就結束，兩者不重疊。

## 3. cave 位置與 section（重算）

Engine.dll 的 image base 推得是 **`0x10300000`**（`.text` RVA `0x1000` → VA `0x10301000`；
VirtualSize `0x377b1e` → 結尾 VA `0x10678b1e`，與 verifier 的數字自洽）。
cave `0x10678b20` ＝ RVA `0x378b20`，落在 VirtualSize 之外 2 bytes、raw size 之內，
屬於 `.text` 自己的檔案填充區；`.rdata` 從 RVA `0x379000` 才開始，**不會蓋到下一個 section**。

SectionAlignment 0x1000 下，`.text` 實際映射到 RVA `0x379000`，所以 cave **本來就會被映射**；
把 VirtualSize 改成 `0x378000` 是讓它明確落在宣告範圍內、避免被視為未初始化。
兩者都不越界。

## 4. 結論

機制面 **核對成立**（`🟡` → 可以進實跑）。bytes、跳轉、cave 語意、scratch slot、section
邊界五項都自己算過。**仍未證明的是它在我們這邊有沒有用** —— 那要先量房主 FPS。
