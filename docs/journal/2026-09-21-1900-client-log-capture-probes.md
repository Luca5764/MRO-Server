# 兩條「即時拿到客戶端 log」的路都堵死（2026-09-21 19:00，探針）

起因：客戶端執行期間讀不到它的 log 檔（L4），所有客戶端 log 的驗證都得等關掉客戶端才能做。
操作者提議「攔截 log 寫入事件」，PM 提議「摳 `-log=` 視窗的文字」。
在投資那半天工之前，先測兩條更便宜的路。**兩條都不通，但兩個負面結果都有價值。**

## 探針 A：`OutputDebugString` —— ❌ 不是 log 行的路徑

`Engine.dll` 確實 import `KERNEL32!OutputDebugStringA`（IAT `0x10679d10`），
但整個 DLL 對它只有**一個真正的呼叫點** `0x105bcf7e`（另一個 `0x1063e0ee` 是 MSVC 的
import thunk，本身沒有任何 `call` 指向它）。

那個呼叫點在小函式 `0x105bcf60` 裡（sprintf 到 `0x800` 緩衝 → `OutputDebugStringA` →
`Sleep(2)`，**不是** `ExitProcess`）。它只有三個呼叫者，全在同一個函式內
（`0x105bd08b`／`0x105bd09f`／`0x105bd0cc`），形狀是 `cmp; jne skip; push <msg>; call`
的守衛式判斷，看起來是留在 release build 裡的 debug assert。三個字串是：
`ConvolutionKernel::GetKernelExtents() You must initialize th[e kernel]`／
`...Kernel has no elements`／`...Input pointer is null!`——**影像處理的參數檢查，
跟封包、協定、一般 log 行完全無關**，正常遊玩幾乎不會觸發。

→ DebugView 那種被動監聽收不到我們要的東西。**不值得投資。**

⬜ 只查了 `Engine.dll`。`ZNetwork.dll` 與 exe 本體有沒有自己的 `OutputDebugStringA`
沒查（`Core.dll` 完全沒有這個 import，而寫 log 檔的邏輯在 Core，所以機率低）。

## 探針 B：Windows 端直接讀檔 —— ❌ 是真正的獨佔鎖

**這一項修正了一個我們先前的推測。** 2026-09-21 早先記的是「從 WSL `cat` 回
`Permission denied`」，當時懷疑可能只是 WSL 的 drvfs 轉譯層限制、Windows 端未必讀不到。

實測（客戶端執行中，副本的 `run-185020.66.log`）：
- WSL `cat` → `Permission denied`（重現既有結論）
- **原生 PowerShell** `[System.IO.File]::Open(path,'Open','Read','ReadWrite')`
  → `System.IO.IOException`，`HRESULT = 0x80070020` = **`ERROR_SHARING_VIOLATION`**

**分類是 sharing violation，不是 access denied。** 意思是客戶端開這個 log 檔時
**完全沒有帶 `FILE_SHARE_READ`**（獨佔開啟），所以不管從哪一層去讀，只要行程還開著
就是打不開。WSL 那個 `Permission denied` 應該就是 drvfs 把同一個
`ERROR_SHARING_VIOLATION` 轉譯成 `EACCES`——兩邊講的是同一件事。

因為連開檔都失敗，**沒有進到「tail 延遲」那一步**，也沒讀到任何內容。

→ 「執行期間直接讀檔」這條路在原生層一樣不通。**不值得投資。**

## 這兩個負面結果改變了什麼

1. **L4 的根因從「推測」變成「已知」**：不是 WSL 的問題，是客戶端自己獨佔開檔。
   以後不要再寫「從 WSL 讀不到」這種會誤導的講法。
2. **PM 提的 `WM_GETTEXT` 摳視窗文字，現在是唯一還活著的路**——而且它繞過檔案鎖的
   理由更清楚了：文字在 EDIT 控制項的記憶體裡，根本不經過那個被鎖住的檔案。
3. 還沒試過的替代：複製既有 handle（`handle.exe` 類手法）、或找客戶端有沒有第二個
   不獨佔的輸出目的地。兩者都比 `WM_GETTEXT` 麻煩。

## 過程

全程照既有路徑開關客戶端（`runner.py preflight` 全綠 → `client_ctl.py launch` →
停在登入畫面、不登入、不送其他輸入 → `client_ctl.py close`），只用副本實例，
主安裝沒動。客戶端已關閉、行程確認消失。**沒有注入程式碼、沒有 hook API、
沒有碰 `MetalRage.exe` 本體。**

---

## 追加（2026-09-21 19:10）：`WM_GETTEXT` 這條路**證實可行**

第一階段探針成功，**8/8 次獨立執行都拿到真實的客戶端 log 文字**，沒有任何被擋的跡象。

- 視窗結構（實測，不是推測）：頂層視窗 class 是 **`MetalRage2UnrealWLog`**，
  子控制項 class 是 **`MetalRage2UnrealWEditTerminal`**。
  ⚠️ **class name 帶行程名前綴**，所以主安裝那邊會是 `MetalRageUnrealWLog`／
  `MetalRageUnrealWEditTerminal`——**不要寫死字串**，要從行程名組出來。
- 實際擷取到的內容（樣本）：
  ```
  Log: Log file open, 09/21/26 19:03:57
  Init: Name subsystem initialized
  Init: Detected: Microsoft Windows NT 6.2 (Build: 9200)
  ...
  Log: Finished precaching textures in 0.032 seconds
  ScriptLog: START MATCH
  ```
- PM 的三個技術判斷**全部成立**：(1) 是普通 Win32 EDIT 控制項，不是 D3D 視埠；
  (2) 客戶端以提升權限執行、呼叫端一般權限，`WM_GETTEXT` 確實在 UIPI 允許清單裡，沒被擋；
  (3) **XIGNCODE 沒有干擾**——唯讀查詢不是注入，實測沒被攔。

**這推翻了 L4 的實務影響**：客戶端 log 檔雖然被獨佔鎖住（上面探針 B 已確認），
但**同樣的內容可以即時從視窗拿到**。`Client netspeed is N`、`HitLoc===`、
`ScriptWarning`、`START MATCH` 這些訊號都不必再等關掉客戶端。

### 第二階段卡住（未解，留給下一位）

把同樣的呼叫放進功能較完整的 `tools/win/logwatch.ps1`（WIP，**已標 `STATUS: NOT WORKING YET`**）
之後，`powershell.exe` 會**可靠地崩潰**在 `WM_GETTEXT` 那一步（無 .NET 例外、性質像原生
access violation）。最小探針腳本反覆跑 15 次以上完全沒事，只有放進那支腳本才炸。

已排除：delegate 被 GC 回收（強制 `[GC]::Collect()` 後探針仍正常）、連續兩次呼叫同一訊息
（探針連呼兩次都成功）、`EnumChildWindows` 的巢狀 vs 事後呼叫寫法（兩種都炸）。
移除主迴圈前的 `Write-JsonLine` 會改變行為（第一次呼叫變成合法逾時）但第二次仍炸。

**下一步建議**：不要繼續在 PowerShell 裡查。改寫成**用 in-box `csc.exe` 編譯的獨立
C# 小程式**，完全繞開 PowerShell 的 script-block／delegate marshaling 這一層——
第一階段已經證明 Win32 這邊沒問題，問題在宿主。

---

## 追加（2026-09-21 19:45）：工具做好了，並記兩個環境事實

`tools/win/logwatch.cs` ＋ `logwatch.sh`（用 in-box `csc.exe`
`/mnt/c/Windows/Microsoft.NET/Framework/v4.0.30319/csc.exe` 編成 `-target:winexe`，
編譯產物不進 repo）。PowerShell 版已刪除（git history 保得住）。

**實測**：對真實客戶端跑 65 秒拿到 **108 行**真實 log，未觸發 rebaseline。
**干擾驗證通過**：logwatch 在背景跑的同時 `client_ctl.py close` 仍正常關閉客戶端——
證明它不影響 Pico 的前景閘門與點擊。XIGNCODE 無任何反應。

### 環境事實 1：這台機器的 `.bat` 關聯是「用記事本開啟」，不是「執行」

操作者看到螢幕突然跳出記事本。查證後分兩件事：
- 當下那一個**是子 agent 自己開的**（它拿 `notepad.exe` 當離線測試的替身目標，
  因為記事本有原生 Edit 控制項）。它已承認並改掉做法。
- 但機器上另外兩個 `Notepad.exe` 是**昨天**留下的，命令列是
  `Notepad.exe "C:\Games\MetalRage Online\Play Metal Rage Online.bat"`
  ——代表 **`.bat` 目前被關聯到記事本**。

⚠️ **任何工具若把 `.bat` 路徑當「開啟」而非「執行」丟給系統，就會跳出記事本搶前景。**
而我們的 Pico 前景閘門以「前景必須是遊戲視窗」為條件——這會在實驗中途打斷整輪。
（今天已經被 Chrome 遠端桌面搶前景害掉一整輪實跑，同一類問題。）
`client_ctl.py` 的 launch 走的是明確的執行路徑，不受影響。

**規則**：任何 AI 在這台機器上都不要用會觸發預設檔案關聯的方式碰檔案。
看內容用 `cat`／`type`，編譯明確呼叫 `csc.exe`。

### 環境事實 2：`SMTO_ABORTIFHUNG` 對「已標記無回應」的視窗會**秒退**

實測兩次 exit 4，都不是等滿 2000ms：客戶端剛啟動（訊息佇列瞬間被判定無回應）、
以及客戶端正在關閉、視窗即將銷毀的那一瞬間，兩者都在 300ms 內返回失敗。
**這是正常行為不是 bug**——但代表「剛 READY 就起 logwatch」會撞到，等幾十秒再起就正常。

### 未實測

`exit 3`（有視窗但找不到 Edit 子控制項）與 `exit 5`（文字長度 300 秒不變）
**只有程式碼路徑分析，沒有實測**。前者因為新限制不便再開 GUI 程式去湊情境，
後者要真的空等五分鐘。
