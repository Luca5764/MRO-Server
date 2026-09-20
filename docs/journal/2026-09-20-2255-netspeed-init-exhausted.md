# CurrentNetSpeed=10000 寫入點：兩條候選路徑排完，字面值窮舉掃描也排除，卡住（2026-09-20 22:55）

中階唯讀分析任務，承 `2026-09-20-2223-netspeed-init.md`。🟡 全部待審，不標 ✅／❌。原始資料
`docs/research/2026-09-20-netspeed-init/exhausted-scan.md`（不覆蓋 `notes.md`）。

## 1. 兩條候選路徑：完整看完，都排除

**`IpDrv.dll 0x10714880`（前人判斷是 `UNetDriver::InitConnect` 一類函式）：** 前人只看到
`0x10714931`，本輪補看尾段到 `0x10714a3e`（`int3 int3` 收尾，緊接下一函式的 SEH prologue
`push ebp; push -1; push 0x1071a999`，確認函式邊界到此為止）。全函式對 `+0x50` **零引用**。
尾段呼叫的三個子函式也都看過：`0x10717c2c` 其實不是函式，是一段 IAT 風格的 `jmp` thunk 表；
`0x107172d0` 是 4 行的 `*(ptr)=value; ret`，寫的是 `[esi+0x4f90]`（不是 `+0x50`）；`0x107018a0`
是一段位址解析（DNS/字串轉 IP）函式，`ret 4` 在第 49 行結束，前 120 行無 `+0x50`。整段程式碼
其實是在解析 URL 主機字串是不是純數字 IP，跟 netspeed 無關。**此函式徹底排除。**

**`Engine.dll UNetPendingLevel::NotifyReceivedText`（`0x104c6960`）：** 完整反組譯 2000 行
（涵蓋約 `0x104c6960`–`0x104c8150`，跨多個 token 分支）。對 `+0x50` 全函式只有一筆引用：
`0x104c7019 mov edx, dword ptr [esi + 0x50]`——**確認是讀不是寫**（dest 是暫存器）。

順帶回答主力這輪追加的問題：`esi` 是什麼物件？往回追到 `0x104c7016 mov esi,[ebp+8]`，
`[ebp+8]` 就是函式一開始（`0x104c6984`）已經斷言過「等於 `NetDriver->ServerConnection`
（`+0x3c`）」的那個 Connection 參數（斷言失敗會呼叫 `0x10679180`）。所以 `esi` 型別是
`UNetConnection*`，不是 `UPlayer`／`UViewport`——沿用前人假設沒有問題，但這次是逐指令追出來
而非假設。函式其餘 4 筆 `0x50` 出現處都是 `[ebp-0x50]`（區域變數，跟物件欄位無關）。
**此路徑也排除**——找不到「第一次寫入」的痕跡，只有讀取。

## 2. 全檔案窮舉掃描：字面值 10000 寫入 `+0x50` 假說排除

對 `Engine.dll`、`Core.dll`、`IpDrv.dll` 三個 DLL 做位元組層級掃描（`pefile` 讀 PE 結構，手動
解 `0xC7 /0` 的 ModRM/SIB），涵蓋 `mov dword ptr [addr+0x50], imm32` 的四種編碼形式：
disp8、disp8+SIB、disp32、disp32+SIB，`addr` 涵蓋所有一般暫存器組合。**三個 DLL 合計 0 筆**
把字面值 `10000`（`0x2710`）寫進任何物件的 `+0x50`。`Engine.dll` 的 disp8 變形另外找到 10 筆
（imm 值 2600/1000000×2/1/0×4/0x12345678/256），全部跟 netspeed 無關。這排除了「某處有一條
寫死 10000 的指令只是還沒找到」的可能，因為窮舉掃描理論上不會漏掉任何一種標準編碼。

也對 `mov dword ptr [reg+0x50], reg32`（非立即值來源，opcode `0x89`）做了同樣掃描，`Engine.dll`
單檔命中 **324 筆**，量太大無法逐筆核對。嘗試用「附近有沒有讀 `NetDriver+0x116c`
(`MaxInternetClientRate`)」交叉篩選：全檔案只有 17 筆 `0x116c` 字面位移，抽查其中落在
`0x1047e259`／`0x1047e266` 的一組，核對後發現是完全不相關的另一個布林旗標 toggle（不同類別
剛好也用到 `+0x116c` 這個 offset）。**offset 數字本身在不同類別間會撞號，這個篩選方式不可靠，
放棄**。324 筆候選集合目前沒有找到有效的縮小方法，留給下一位。

## 3. uetool 查解密腳本包：`CurrentNetSpeed` 不是 UProperty，CDO 複製假說排除

`~/mro-decrypted/Engine.u` 用 `tools/uetool decompile Engine.NetConnection` 只印出
`class NetConnection;`——空類別本體，沒有任何 `var`、沒有 `defaultproperties`。
`get Engine.NetConnection CurrentNetSpeed` 回 `no property CurrentNetSpeed`。對照組確認
uetool／腳本包本身沒問題：`get Engine.Player ConfiguredInternetSpeed` 正確讀到 `9636`，
`get Engine.Player ConfiguredLanSpeed` 讀到 `20000`（都跟已知 `.ini` 出廠值一致）。

同時排查了 `Engine.Player`／`Engine.Actor`／`Engine.Viewport`（此版沒有獨立的
`Engine.LocalPlayer` 類別）對 `CurrentNetSpeed`／`ConfiguredInternetSpeed`／`ConfiguredLanSpeed`
／`NetSpeed` 四個名字的查詢，**全部回 `no property`**（`ConfiguredInternetSpeed`／
`ConfiguredLanSpeed` 只掛在 `Engine.Player`，前面已列出）。

**結論：`CurrentNetSpeed` 在任何一個查過的類別（`NetConnection`／`Player`／`Actor`／`Viewport`）
都不是腳本可見的 UProperty**，所以前面猜的「CDO→instance 大結構複製樣板碼」這條理論可以排除
——沒有對應的 defaultproperties 可以複製。

## 4. 矛盾（給下一位或高階審查）

`CurrentNetSpeed` 既不是腳本屬性，理論上一定要有某條純 C++ 的 store 指令在某處寫入它，但本輪
在 `Engine.dll`／`Core.dll`／`IpDrv.dll` 三個 DLL 窮舉掃描字面值 10000 都找不到任何寫入
`+0x50` 的指令。可能性：(a) 寫入的不是字面值 10000，是某個運算/複製結果（324 筆非立即值候選
裡的某一筆，還沒篩出來）；(b) 寫入發生在我沒掃描到的模組（`MetalRage.exe` 本體，或另一個
未知名稱的 DLL）；(c) 純靜態手段已經接近用盡，要靠 runtime 觀測才能定案（本契約排除 attach
debugger，未嘗試）。

## 5. 下一步建議

1. 324 筆非立即值候選需要更聰明的篩選（例如從已知一定會呼叫到 `ServerConnection` 建構的
   call graph 往下限定範圍，而不是對整個 3MB DLL 做字面比對）。
2. 如果要繼續猜可能的 store 位置，`MetalRage.exe` 本體目前完全沒掃過（本輪只查了三個 DLL）。
3. 若靜態手段真的走到盡頭，這題要不要動用 runtime 記憶體觀測，需要跟操作者另外談
   （硬性約束仍禁止 attach debugger）。
4. 跟既有 ✅ 沒有矛盾，本輪是排除法，縮小了搜尋空間，沒有推翻任何已標結論。
