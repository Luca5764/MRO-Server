# NETSPEED-HOST-PATCH 設計稿（2026-09-21）

**狀態：設計稿，待 PM 審。尚未套用到任何檔案。**
由 explorer 反組譯、高階重新核對關鍵位址與 file offset 後落檔
（explorer 的角色禁止寫檔，它正確地拒絕並把內容交回）。

## 目標

讓**房主**為每條連線記下的 `CurrentNetSpeed` 變成 100000，而不是現在的 10000。
理由：投射物會掉是因為 `AActor::ProcessRemoteFunction`（`0x105234b0`）的廣播迴圈對每個
connection 查 `IsNetReady`（`0x105236a5`），**門檻吃的就是房主端那條連線的 `CurrentNetSpeed`**。
[TEST] 2026-09-21 已證實在**加入者端**下 `netspeed` 指令對房主記的值無效。

## Handler：`ULevel::NotifyReceivedText`

`Engine.dll` export **`0x1047ec80`** ＝
`?NotifyReceivedText@ULevel@@UAEXPAVUNetConnection@@PBG@Z`。
第一參數就是「哪一條 connection 送來這段文字」。

NETSPEED 分支（**高階親自用 `disasm.py` 重跑核對過**）：

```
0x1047f98b  push 0x106a7fb4          ; "NETSPEED"（UTF-16）
0x1047f991  call edi                 ; ParseCommand
0x1047f998  je   0x1047f9e6          ; 沒中就走別的 token
0x1047f99e  call [0x10679464]        ; atoi → eax = v（客戶端送來的整數）
0x1047f9a4  mov  ecx,[ebx+0x14]      ; NetDriver（🟡 欄位名未查）
0x1047f9a7  mov  ecx,[ecx+0x1168]    ; ecx = MaxClientRate（cap）
0x1047f9b0  cmp  eax,0x708           ; v vs 1800        ← 候選 1 改這裡
0x1047f9b5  jge  0x1047f9be
0x1047f9b7  mov  eax,0x708           ; v<1800 → 1800    ← 候選 1 也改這裡
0x1047f9bc  jmp  0x1047f9c4          ; ★ 跳過 cap 比較
0x1047f9be  cmp  eax,ecx
0x1047f9c0  jl   0x1047f9c4
0x1047f9c2  mov  eax,ecx             ; v>=cap → cap
0x1047f9c4  mov  edx,[ebp+8]         ; Connection*
0x1047f9c8  mov  [edx+0x50],eax      ; ← 寫入 CurrentNetSpeed
0x1047f9cb  push 0x106c5444          ; "Client netspeed is %i"
```

也就是 **`clamp(v, 1800, NetDriver->MaxClientRate)` 寫進 `Connection+0x50`**。

## ⚠️ 關鍵推論：「拉高 cap」這條路已經被既有證據排除

`clamp` **只會往下夾**。既有 [TEST]（`2026-09-20-2153-server-netspeed.md`）：
兩端 `IpDrv.dll` 的 cap 都改成 100000 後，**房主 log 仍印 10000**。

→ 如果 cap 真的是 100000，夾不出「比 100000 小的 v」變成 100000，
也解釋不了結果仍是 10000。**唯一自洽的解釋是 `v` 本身就是 10000。**

→ **任何只改 cap（`+0x1168`／`+0x116c`）的方案都已被證明無效。** 不列為候選。
（這也是為什麼 PM 否決了 `NETSPEED-INIT-2`：追 `v` 的來源要 324 筆，
而直接改寫入點只要一個位址。）

## ✅ 採用：候選 1b（PM 2026-09-21 審查後定案）

**＝候選 1 再加一處：把 `0x1047f9b5` 的 `jge`（`7d 07`）改成 `90 90`（兩個 NOP）。**

| VA | file offset | 原始 bytes | 新 bytes | 作用 |
|---|---|---|---|---|
| `0x1047f9b1` | `0x17f9b1` | `08 07 00 00` | `A0 86 01 00` | `cmp eax,100000` |
| `0x1047f9b5` | `0x17f9b5` | `7d 07` | `90 90` | **NOP 掉 `jge`** |
| `0x1047f9b8` | `0x17f9b8` | `08 07 00 00` | `A0 86 01 00` | `mov eax,100000` |

**共 10 bytes，全部是立即值或 NOP。**

改完之後執行路徑**固定**是 `mov eax,100000` → `jmp 0x1047f9c4`，**不再看 `v`**。
`0x1047f9be`–`0x1047f9c3`（cap 比較那段）變成死碼，但**內容原封不動**——
即使有別處 rel8 短跳進那一段，行為跟原本完全一樣，
**所以不需要候選 2 那個沒做完的 rel8 掃描**。

### 為什麼不用原本的候選 1（PM 指出的邊界問題）

候選 1 只在 `v < 100000` 時才會強制寫成 100000。**若 `v ≥ 100000`**，`jge` 會跳到
cap 比較，結果是 `min(v, cap)`——原廠 cap 是 10000／15000，**結果反而比 100000 低**。

**而這不是空想**：我們的 `User.ini` 已經把 `ConfiguredInternetSpeed` 設成 100000。
`v` 的來源目前是 ⬜，哪天某個 ini 或修補讓客戶端真的送出 100000，
**房主端會靜默退回 10000，而且沒有任何地方會報錯。**

**這正是今天一整天反覆遇到的那種錯：結果看起來合理，但其實是錯的。**

---

## 候選 1（原始版，已被 1b 取代，保留供對照）：改 clamp 的**下限**，8 bytes

| VA | file offset | 原始 bytes | 新 bytes |
|---|---|---|---|
| `0x1047f9b1` | `0x17f9b1` | `08 07 00 00` | `A0 86 01 00` |
| `0x1047f9b8` | `0x17f9b8` | `08 07 00 00` | `A0 86 01 00` |

**高階已核對**：那兩個 file offset 讀出來確實是 `08 07 00 00`（＝`0x708`＝1800）。

效果：`cmp eax,100000` / `mov eax,100000`。因為實測 `v` 恆為 10000（< 100000），
**一定落進「強制設為 100000」那條分支，接著 `jmp` 跳過 cap 比較**，
所以寫進 `Connection+0x50` 的固定是 100000。

邊角（純理論，目前從未觀察到）：若某天 `v ≥ 100000`，會落進原本的 cap 分支被夾小。

## 候選 2（備案）：整段 20 bytes 換成無條件常數

| VA | file offset | 原始 bytes | 新 bytes |
|---|---|---|---|
| `0x1047f9b0` | `0x17f9b0` | `3D 08 07 00 00 7D 07 B8 08 07 00 00 EB 06 3B C1 7C 02 8B C1` | `B8 A0 86 01 00` ＋ 15×`90` |

`mov eax,0x186A0` ＋ NOP 填滿。無條件 100000，沒有邊角情況。
已用 `xref` 查過 `0x1047f9be`／`0x1047f9c2`／`0x1047f9c4`：**0 筆 call/jmp/dword 引用**，
沒有外部程式碼跳進區塊中段。⚠️ 但該工具**只掃 rel32，沒掃 rel8 短跳**，
風險極低但非 100% 排除——這是候選 2 相對候選 1 多出來的風險。

## 兩者共通的副作用

- **不碰 cap 欄位**（`+0x1168`／`+0x116c`），所以主控台 `netspeed` 指令、
  `UViewport::Exec` 的 clamp、**加入者自己的 `stat net` 顯示**完全不受影響。
  只有房主這個寫入點的結果改變。
- **只需要修補房主那台的 `Engine.dll`**，不必動加入者的安裝。
  （PM 補充：實務上沒差別——每個人拿到同一包 client-kit，誰都可能當房主。）
- 原地覆寫、長度不變，不需處理 relocation 或重算跳轉位移。

## `ULevel::Listen` 那題的答案

`0x1047a730`–`0x1047a77c` 讀寫的是 **`edi+0x40`（已建構好的 NetDriver instance）**
的欄位，**不是直接讀某個 DLL 的編譯常數**。這局實際實例化的是 `UTcpNetDriver`（`IpDrv.dll`），
它的 `StaticConstructor`（`0x10714693`／`0x1071469d`）寫 15000／10000，
與 `Engine.dll` 基底的 `UNetDriver::StaticConstructor`（`0x104a0540`）**數值完全相同**。

→ 🟡 活的 instance 用的是 `IpDrv.dll` 那份（與 2026-09-20 的 [TEST] 吻合）。
**但原廠兩邊數值一樣，所以這題目前沒有實際影響。**
副本先前只改 `IpDrv.dll` **不是選錯 DLL**，錯的是「拉高 cap 這條路本身治標不治本」。

**而且兩個候選都不碰這條 cap 鏈**——所以不管這題答案是哪個 DLL，都不影響候選的有效性。

## ✅ 把關一：加入者端走不到這個分支（2026-09-21 已驗證）

**答案：走不到。** NETSPEED clamp 那幾行只在 host 端執行。

**函式開頭就有門檻**（已用組語確認）：
```
0x1047ecf2  mov  eax,[ebx+0x14]        ; ebx = this ULevel，+0x14 = NetDriver
0x1047ecf5  cmp  dword ptr [eax+0x3c], esi   ; esi=0；[NetDriver+0x3c] = ServerConnection
0x1047ecf8  je   0x1047f5d5            ; ServerConnection==0 → 跳到 host 路徑
```

`+0x3c` 是 `ServerConnection` **不是猜的**：`UNetPendingLevel::NotifyReceivedText`
（`0x104c6960`）開頭的斷言字串從 `.rdata` 讀出來是
**`"Connection==NetDriver->ServerConnection"`**（`.\UnPenLev.cpp`）。

**誰會填 ServerConnection**（`IpDrv.dll` `UTcpNetDriver`）：
`InitConnect`（`0x10714ff0`，client 連出去時）會建立連線物件；
`InitListen`（`0x10715180`，host 開房時）**全程沒有任何連線物件的建立或賦值**，只做 socket bind/listen。
→ **host 端 `ServerConnection` 維持 0**，與 UE1 標準語意一致。

**控制流可達性**（對 `0x1047ec80`–`0x10480180` 實際跑 BFS，非線性反組譯）：
- `je` 沒跳（`ServerConnection != 0` ＝ **加入者**）→ client 路徑 684 個可達位址，
  **不包含** NETSPEED clamp 區塊
- `je` 跳走（`ServerConnection == 0` ＝ **房主**）→ host 路徑，
  **包含** `0x1047f988`（`"NETSPEED"` 比對）、`0x1047f9b0`／`0x1047f9b5`／`0x1047f9b7` 全部可達
- **兩條路徑互斥**（同一個 `je`），是二選一，不是順序問題

⚠️ 加入者端**會**跑到這支函式（它也有自己的 `ULevel`，其他 token 分支照樣執行），
**但這條 NETSPEED 分支被門檻完全排除**。

### 位址核對（高階親自做過 hex-level 驗證）

設計稿寫的 `0x1047f9b1`／`0x1047f9b8` **是立即值運算元的位址**，不是指令起始
（opcode 在 `0x1047f9b0`／`0x1047f9b7`）；`0x1047f9b5` 本身是指令起始。**三個都對得上。**

## 套用前還要做的一件事（PM 指定）
1. **修補工具照 `tools/patch_netspeed.py` 的寫法**：先驗原始檔 SHA256
   （stock `fc51fe12…38d24e`）→ 逐 byte 比對原始值，不符就中止 → 輸出修補後 SHA256 →
   提供 `--restore`。**只對副本操作。**

## ⬜ 未確認清單（套用前要處理的）

1. 🟡 **`ULevel::NotifyReceivedText` 只在 server/host 端執行**——從類別語意與簽章推論，
   **沒做呼叫者 xref 驗證**。套用前跑一次
   `tools/disasm.py xref 0x1047ec80 Engine.dll` 確認。**很便宜，一定要做。**
2. 🟡 `v` 恆為 10000 是從兩筆既有 [TEST] 反推，不是直接量到的封包內容。
   （但兩個候選都不依賴這題的答案。）
3. 🟡 `0x1047f9a4` 的 `ebx+0x14` 是什麼物件沒反查（不影響候選，候選不讀那個值）。
4. ⬜ **改 `Engine.dll` 會不會被完整性檢查擋下來沒查過。**
   XIGNCODE 已知只掛在 `ZNetwork.dll`；之前只測過改 `IpDrv.dll` 可以。
   **第一次套用時先只看客戶端能不能正常開到登入畫面。**

## 套用後的驗證（PM 指定，**每輪只改一個變數**）

- **第 0 輪**：只換 `Engine.dll`，看能不能開到登入畫面。
  **這一輪測的是完整性檢查會不會擋（⬜）**，不是功能。
- **第 1 輪**：跑雙客戶端 C 段，房主 log 應該印出 `Client netspeed is 100000`。
  房主用**修補過的副本**，加入者用 **stock**。
- **第 2 輪**：用 `WeaponLog` 計數比較**投射物遺失率**，修補前後各跑一次。
  兩次要**同一張地圖、同一把武器、同樣的發數**。
  **這一輪才是用來判定修補有沒有效的**——netspeed 的數字只是中間量。

## 備註（現在不處理，PM 2026-09-21）

100000 是**每條連線**的上限。8 人房的話房主上行最壞約 **800 KB/s**，
走 Hamachi 中繼時可能撐不住。**等第 2 輪證明有效之後**，再開一輪找「夠用的最小值」
（例如 30000 或 50000）。

只在**副本**套用。工具沿用 `tools/patch_netspeed.py` 的模式（驗雜湊→備份→修改→可還原）。
