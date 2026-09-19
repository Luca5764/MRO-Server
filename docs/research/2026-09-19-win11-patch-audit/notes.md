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

## 對照上游原始碼（https://github.com/shanzenos/Metal-Rage-Online-Win11-Fix ，2026-04-14 版）

- `patch_metalrage.py` 的三個 patch 與我們 exe 的 6 個位元組完全對得上（第 3 個是把 NRV 來源位址從 `0x400000` 改成 ImageBase；我們的 ImageBase 是 `0x10900000`）。第 4 個 DllCharacteristics 在我們的檔案原本就是 0，所以沒變。→ 我們用的就是這一套。
- `wow64log.c` 的註解：作者在 Win11 量到 y0da 的 8 條監控執行緒 120 秒內呼叫 `NtQueryInformationThread` 232,874 次（約每秒 1,940 次）、`NtSuspendThread` 98 次。這個 DLL 原本是想讓 y0da 的迴圈讓出 CPU，用來繞過一個 heap race；wiki 後來說那個 crash 其實是 DxDiag 造成的（`docs/client-notes-upstream.md`）。
- wiki「Required-Patches」的 Launcher Resume Loop：**「y0da occasionally suspends the main game thread」**，作者的 launcher 每 1 秒掃一次，把被暫停的執行緒 `resume()` 回來。我們是用 bat 直接開 `MetalRage.exe`，沒有這個 launcher。
- 🟡 [GUESS] 新假設 H-Y0DA：Win11 的卡頓是 y0da 定期暫停主執行緒（上游量到 120 秒 98 次 `NtSuspendThread`，約每 1.2 秒一次）。解釋得了「Win11 兩台都卡、Win10 不卡」，但上游沒有說 Win10 的次數，也沒有說每次停多久。
  - 驗證方式（純觀察，不碰行程）：用 Windows 內建的 WPR 錄 CPU／context switch 的 ETW trace，再用 WPA 看卡頓時主執行緒是不是處於 Suspended 等待。
  - **不採用** launcher 的 resume loop：從外部 `ResumeThread` 保護殼暫停的執行緒，等於干預反作弊的運作，超出硬性約束 1 的「純分析」範圍，要做必須先問操作者。

## 外部旁證：上游作者的遊玩影片（操作者 2026-09-20 經 PM 轉達）
- [OBS] 外部影片，不是我們的量測：操作者看了上游 Win11 修正作者自己的遊玩影片，對方也有同樣的不定時卡頓。對方用的是他自己的 launcher，裡面有「每秒 resume 主執行緒」。**影片連結與時間點待操作者提供** ⬜。
- 推論（PM，🟡）：
  1. 對方的環境跟我們完全不同，共同點只有「Win11＋y0da 保護的 exe＋這組修正」。所以卡頓跟我們的伺服器、網路設定、WSL 無關的可能性更高。
  2. **「每秒 resume」不是解法**：作者用了還是卡。我們沒用 launcher，遊戲也只是卡一下、不會永久凍結。所以主執行緒如果真的被暫停，是 y0da 自己的監控執行緒做完事之後放行的；launcher 的輪詢最多只是把停頓縮到 1 秒內。之前列給操作者的選項 (a)「採用 resume」價值很低，降到最後。
  3. WPR trace 仍然是決定性的一步。要量的東西：
     - 主執行緒 Suspended 的**週期**和**每次持續多久**；
     - 誰 suspend、誰 resume（同行程的哪條執行緒）；
     - 監控執行緒在暫停期間做什麼（大量 Sleep 等待，還是真的在算 CRC）。
     - 如果是 Sleep 為主，可以從環境面試緩解，例如 Win11 的計時器解析度行為（不碰 y0da、不碰 exe）；如果是 CPU 在算，就只剩「接受」或「由 Win10 機器當房主」。
  4. 對 M3／K1 的影響：Win11 的朋友很可能都會卡，他們當房主時整房都會受影響。K1 的建議寫成「**優先由 Win10 的人開房，其次是最不卡的那台**」。約束 1 不變：不碰 `MetalRage.exe` 的 y0da。
