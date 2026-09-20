# NetSpeed init — raw disasm excerpts（中階，唯讀）

DLL：`/mnt/c/Games/MetalRage Online/data/System/Engine.dll`（sha256 fc51fe12…，原廠）、
`IpDrv.dll`（sha256 dbc7b34c…，原廠）。ImageBase Engine.dll = 0x10300000（`tools/disasm.py sections` 核對過，
不是 docstring 範例的 0x10400000，本輪一開始算檔案 offset 因此錯了一次，已用正確 base 重算）。

## 1. `ULevel::Listen`（export VA 0x1047a5e0，file 0x17a5e0）

```
0x1047a730  mov eax,[edi+0x40]        ; NetDriver
0x1047a733  mov ecx,[eax+0x116c]      ; MaxInternetClientRate
0x1047a739  cmp ecx,[eax+0x1168]      ; vs MaxClientRate
0x1047a73f  jge 0x1047a74f            ; MaxInternetClientRate >= MaxClientRate 就跳過
0x1047a741  cmp ecx,0x9c4             ; 2500
0x1047a747  jle 0x1047a74f
0x1047a749  mov [eax+0x1168],ecx      ; MaxClientRate = MaxInternetClientRate  ← 無條件（不受下面 >16 判斷保護）

0x1047a74f  mov eax,[edi+0x30]
0x1047a752  mov eax,[eax]
0x1047a754  mov ecx,[eax+0x630]
0x1047a75a  cmp ecx,ebx               ; ebx=0（函式開頭 xor ebx,ebx）
0x1047a75c  je 0x1047a782
0x1047a75e  cmp dword ptr [ecx+0x4fc],0x10   ; >16 才觸發
0x1047a765  jle 0x1047a782
0x1047a767  mov ecx,[edi+0x40]
0x1047a76a  mov eax,[ecx+0x1168]
0x1047a770  cmp eax,0x2710            ; 10000
0x1047a775  jle 0x1047a77c
0x1047a777  mov eax,0x2710
0x1047a77c  mov [ecx+0x1168],eax      ; MaxClientRate = min(MaxClientRate,10000)，>16 才跑
```

`edi`＝`this`＝ULevel（export 名稱確認：0x1047a5e0 對應到 `?Listen@ULevel@@UAEHAAVFString@@@Z`，
`tools/disasm.py exports Engine.dll | grep 0x1047a5e0`）。函式在字串上核對得很清楚：
`"ini:Engine.Engine.NetworkDevice"`（0x106c41a8）、`"NetListen"`（0x106c41e8）、
`"NetAlready"`（0x106c41fc）、`"Failed to listen: %s"`（0x106c4178）、`"lanplay"`（0x106aa8b0，
config 選項名）——這些都是 UT2004 系引擎 `Listen()` 的典型除錯字串，函式邊界用
`tools/disasm.py exports` 對 0x1047a5e0 排序後一筆對應一個 export，起點就是 0x1047a5e0
（前一個位元組是上一個 export `?WelcomePlayer@ULevel` 的 int3 padding）。

**兩段不是同一件事：** 第一段（0x1047a730-749）無條件執行（只要 `edi+0x40` 有 NetDriver 且
MaxInternetClientRate 落在 `(2500, MaxClientRate)` 之間），把 MaxClientRate 從編譯期常數
15000 覆寫成 MaxInternetClientRate=10000。第二段（0x1047a75e-77c）才是有 `>16` 條件的
「再夾一次到不超過 10000」，觸發物件（`[[edi+0x30]]+0x630`）+0x4fc 未定名。**因為第一段
已經把 MaxClientRate 變成 10000，第二段有沒有觸發在原廠設定下沒有差別**（都是 10000）。

原廠代入：MaxInternetClientRate(10000) < MaxClientRate(15000) 且 > 2500 → 第一段執行 →
`Listen()` 一結束，房主自己這個 NetDriver 實例的 `MaxClientRate` 就已經是 **10000，不是
15000**。這發生在**開房當下**，跟後面有沒有玩家加入、房間人數多少無關（第一段不看人數）。

## 2. 客戶端自己 ServerConnection 的建構鏈（追到 `InitOut` 為止，仍未找到寫 +0x50 的點）

`IpDrv.dll` `UTcpNetDriver::InitConnect`（export VA 0x10714ff0）：

```
0x107150a9  push 0x10735db0
0x107150ae  call [0x1071c354]         ; StaticConstructObject 類的建構呼叫（8 個 push 參數）
0x107150b9  test eax,eax
0x107150bb..e6  組 4-dword 的 URL/位址結構，push esi(NetDriver)，call 0x10714880  ; ecx=剛建好的 connection
0x107150f8  mov [esi+0x3c],eax        ; NetDriver->ServerConnection = 新 connection
0x107150fb  mov eax,[eax+0x50]        ; 建完後立刻讀 +0x50（此時已經有值——寫入點在 0x10714880 或更早）
```

- `UNetConnection` 無參數建構式（export `??0UNetConnection@@QAE@XZ`，VA 0x1042e3a0-0x1042e536）：
  逐行看過，**全程沒有任何 `mov [reg+0x50], ...`**。如果 `StaticConstructObject` 呼叫的是這個
  預設建構式（UE2 反射系統的一般行為），+0x50 建構完當下是 0，不是任何非零預設值。
- `0x10714880`（IpDrv.dll 內部函式，非 export）：設定 socket 相關欄位、vtable 覆寫、緩衝區大小
  （`[esi+0xc8]=0x200`、`[esi+0xcc]=0x20`），呼叫 `[0x1071c6e4]`。用檔案位移直接讀 IAT
  hint/name（`data[0x2bea0:]` → `V\x15?InitOut@UNetConnection@@UAEXXZ`）確認這是
  **`UNetConnection::InitOut()`**（Engine.dll export VA 0x1042b320）。
- `UNetConnection::InitOut`（VA 0x1042b320-0x1042b6xx，看了 260 instr）：**同樣沒有任何
  `mov [reg+0x50], ...`**——是配置封包緩衝區/序號表，跟 netspeed 無關。
- `0x10714880` 剩下的尾段（0x10714931 之後，含對 0x107018a0 的呼叫）**沒有在時間內看完**，
  是最可能藏著那個寫入的地方，也可能是還沒追到的別處。

## 3. 前一位找到、本次核對過仍成立的：`UNetConnection(UNetDriver*, FURL&)` 建構式

VA 0x1042e540（export `??0UNetConnection@@QAE@PAVUNetDriver@@ABVFURL@@@Z`）：

```
0x1042e7ec  push 0x106a7fac           ; "LAN"（字串核對：file 0x3a7fac 開始是 UTF-16 "LAN\0"，
                                        緊接著 +8 bytes 是 "NETSPEED\0"，即已知的 0x106a7fb4）
0x1042e7f3  call 0x1057e950           ; 疑似 FURL::HasOption("LAN")
0x1042e7f8  test eax,eax
0x1042e7fa  je 0x1042e807
  found  : mov edx,[0x109570ec]; mov eax,[edx+0x58]     ; 全域物件 +0x58
  ¬found : mov eax,[0x109570ec]; mov eax,[eax+0x54]     ; 全域物件 +0x54
0x1042e80f  test eax,eax
0x1042e811  mov [esi+0x50],eax
0x1042e814  jne 0x1042e81f
0x1042e816  mov [esi+0x50],0xa28      ; =0 時預設 2600
0x1042e81f  cmp eax,0x708             ; 1800
0x1042e824  jge 0x1042e82b
0x1042e826  mov eax,0x708
0x1042e82b  mov [esi+0x50],eax        ; 下限 1800，沒有上限
```

**這個全域 `0x109570ec`+0x54/+0x58 確認就是 `[Engine.Player] ConfiguredInternetSpeed /
ConfiguredLanSpeed`**——不是用命名推測，是用 `netspeed <n>` 主控台指令那段程式碼交叉核對出來的：
`UViewport::Exec`（export VA 0x104154f0）處理 `netspeed` 的分支（VA 0x104156b9-0x10415742）
對同一個全域位址、同樣的 +0x54/+0x58、同樣先檢查 URL 是否有 `"LAN"` option，寫入使用者輸入的
值，緊接著呼叫 `SaveConfig`（`[0x106796e0]`，flags 0x4000）——這正是「`netspeed` 指令會把值寫回
User.ini 的 `[Engine.Player]`」的那段程式碼，方向與本節建構式相反（一個讀一個寫），欄位偏移對得上。

**矛盾點（本節與 [TEST] 不合，故本節建構式大概率不是實際跑到的路徑）：** 若這個建構式真的
是加入者 ServerConnection 的初始化來源，非零時的值應該等於 `ConfiguredInternetSpeed`
（出廠 9636，見 `DefUser.ini.bak-20260920`），不會是整數 10000；而且改 `User.ini`／
`DefUser.ini` 的 `ConfiguredInternetSpeed` 到 100000（[TEST] 2026-09-20 21:10，兩端都改）
對觀察到的 10000 完全沒有影響。兩者合起來看，這個建構式很可能**沒有**在client 建立
ServerConnection 這條路徑上執行（也許只用在別的連線型態，例如 demo 或 local connection），
或者它讀到的值在更後面被覆寫。**沒有直接證據支持任何一種解釋，留給下一輪。**
