# Win11 修正版逐檔稽核（2026-09-19，Lucas 桌機 `C:\Games\MetalRage Online\data\System`）

目的：操作者懷疑修正版造成 Win11 兩台的遊戲中卡頓。純靜態分析，沒有執行或修改任何檔案。

## 改過的檔案（對照 `_original_backup\`，`cmp -l`）

| 檔案 | 改了幾個位元組 | 內容 | 什麼時候作用 |
|---|---|---|---|
| `MetalRage.exe` | 6 | file 0x160–0x161：SizeOfImage `0x6C0CF`→`0x6D000`；0x19213：`EB 1E`→`90 90`（y0da 入口原本依 PEB 跳過 XOR 0x21 解密，改成一律解密）；0x19237–0x19238：`61 21`→`B1 31`，在 XOR 0x21 加密區內，解密後是 `mov esi, imm32` 的常數 `0x00400000`→`0x10900000`（NRV 解壓的來源位址，對應 upstream 筆記的 Patch 3，但實際做法是改常數，不是 launcher 預先配置） | 只在啟動、解殼時 |
| `D3D9Drv.dll` | 8 | file 0xF040：DxDiag 函式改成 `mov al,1; ret 4`，與 `docs/client-notes-upstream.md` Fix 2 完全一致 | 初始化時跳過 DxDiag。Win10 的 dusk 也用這個檔（只換 exe） |

## 新增的檔案（原版沒有）

| 檔案 | 是什麼 | 有沒有被載入 |
|---|---|---|
| `wow64log.dll`（x64，PE timestamp 1774739677） | WoW64 記錄 hook。`Wow64LogInitialize`（0x180001030）用 GetModuleFileNameW 判斷是否為 MetalRage.exe，是才啟用；`Wow64LogSystemService`（0x180001140）每個系統呼叫 `lock inc` 計數，系統呼叫編號 0x25 時呼叫 `SwitchToThread`（IAT 0x18000f018）。一初始化就寫 `C:\wow64log_beacon.txt` | **沒有**：WoW64 只從 System32 載入 `wow64log.dll`，System32／SysWOW64 都沒有這個檔，`C:\wow64log_beacon.txt` 也不存在。看起來是作者開發時留下的工具 |
| `dxdiagn.dll`、`dxdiag_local.dll`（x86，兩個檔 SHA1 相同 `e4e0ea07…`） | DxDiag COM 的假實作，載入時寫 `D:\dxdiagn_stub.log` | **沒有**：D3D9Drv 已經跳過 DxDiag，COM 也會依登錄檔去載 System32 的正版；D: 槽存在但沒有 `D:\dxdiagn_stub.log` |

`dinterface.dll`／`dinterface.original.dll` 在 2022 年巴哈分享的舊客戶端就有，不是這次修正加的。

## 結論 🟡

在遊戲中還會持續執行的只有 D3D9Drv 的 DxDiag 跳過，而它 Win10 那台也有。exe 的三處修改只在解殼時作用；唯一會在執行期介入的 `wow64log.dll` 在這台沒有載入。**從檔案內容看不出修正版會造成遊戲中卡頓。**
沒驗證的：筆電有沒有把 `wow64log.dll` 裝進 System32（可以看筆電有沒有 `C:\wow64log_beacon.txt`）。
