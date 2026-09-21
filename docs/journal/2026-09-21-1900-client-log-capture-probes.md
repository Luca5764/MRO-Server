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
