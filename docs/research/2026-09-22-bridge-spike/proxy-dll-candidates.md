# Proxy DLL 候選（階段 0，唯讀分析）

來源：`MetalRage.exe` 與 `data/System/*.dll`，讀自主安裝
`/mnt/c/Games/鐵影特攻(MetalRage Online)/data/System`（唯讀，未寫入）。
工具：`pefile 2024.8.26`（`parse_data_directories` 讀 import/export 目錄）。
原始 dump：`import-table-dump.txt`。

## KnownDLLs 查證

`reg.exe query HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs`
（結果見 `knowndlls-reg-dump.txt`）列出的是**原生 64 位元**清單：
kernel32, advapi32, clbcatq, combase, comdlg32, coml2, difxapi, gdi32, gdiplus,
imagehlp, imm32, msctf, msvcrt, normaliz, nsi, ole32, oleaut32, psapi, rpcrt4,
sechost, setupapi, shcore, shell32, shlwapi, user32, wldap32, ws2_32,
wow64*/xtajit*（WOW64 子系統本身）。

`KnownDLLs32` 這個機碼**不存在**（`reg.exe` 回「系統找不到指定的登錄機碼」）。
🟡 **這不代表 32 位元（WOW64）行程對這些 DLL 就沒有等效保護** —— Windows 內部機制是
smss.exe 開機時另外建立 `\KnownDlls32` NT 物件，對一部分核心 DLL（至少 ntdll、
kernel32 等）在 SysWOW64 下做同樣的映射，**不依賴這個機碼是否存在**。
本階段**沒有**用行為測試驗證任何一個候選是否真的能被同名 proxy 蓋過去
——那是階段 1 的「載入是否成功」要驗的事，這裡只先排除「在原生清單裡」的。

## 候選清單（排除 game 自己的 DLL、排除原生 KnownDLLs 裡的名字）

| DLL | 被誰 import | 需要的符號數 | 備註 |
|---|---|---|---|
| **VERSION.dll** | DLLtest.dll、IFC23.dll、InputProcess.dll、JRVoice.dll、NO1_MH.dll、dbghelp.dll、dinterface.original.dll（7 個周邊模組，**不含**核心引擎/繪圖/網路鏈） | 共 5 個不同函式：`GetFileVersionInfoA/W`、`GetFileVersionInfoSizeA/W`、`VerQueryValueA`（逐檔案列表見下） | 真正系統 `version.dll`（SysWOW64）總共只有 17 個 export，用到的只有 5 個，**全部是單純 forward**。周邊模組才用，不在渲染/網路/輸入主線上 |
| WINMM.dll | Core.dll（**OWN 核心引擎，直接 import**）、DefOpenAL32.dll、ImpersonatorLib_rd.dll、JRVoice.dll、binkw32.dll | 3+12+5+13+12 symbols，5 個模組 | Core.dll 直接用，疑似計時（`timeGetTime`/`timeBeginPeriod`），動到遊戲主迴圈計時風險較高 |
| DINPUT8.dll | WinDrv.dll（**OWN 核心視窗/輸入驅動**） | 1 symbol（`DirectInput8Create`） | 符號少、實作簡單，但 WinDrv 是輸入鏈路，出包可能整個操作不了，風險中 |
| DSOUND.dll | ALAudio.dll（音效後端之一，另有 DefOpenAL32.dll 走 OpenAL） | 1 symbol | 出包頂多沒聲音，不影響到登入畫面/操作，風險中低 |
| COMCTL32.dll | DLLtest.dll、JRVoice.dll、NO1_MH.dll、**Window.dll（OWN 核心 UI）**、dinterface.original.dll | Window.dll 只用 1 symbol（多半是 `InitCommonControlsEx`），其餘 21–24 | Window.dll 有觸及，UI 風險，且非核心 DLL 用量大，符號多不好全部正確 forward |
| d3d8.dll / d3d9.dll | D3DDrv.dll / D3D9Drv.dll（繪圖驅動） | 各 1 symbol（`Direct3DCreate9` 等） | **不建議**：出包＝無畫面，連截圖驗證都做不到 |
| wsock32.dll | IpDrv.dll（**OWN 網路驅動，直接 import**） | 26 symbols | **不建議**：這專案的核心就是網路行為，不該拿這條當第一個實驗品 |
| MSACM32.dll / MSVCP60.dll / winspool.drv | 全部只被 `ImpersonatorLib_rd.dll` 或 `dinterface.original.dll` import | — | 🟡 這兩個檔名（`ImpersonatorLib_rd`／`dinterface.dll`+`dinterface.original.dll` 成對出現）疑似與保護機制相關，**不建議**碰它們的依賴鏈，避免踩到 `AGENTS.md` 「不碰 anti-attach」的紅線 |

`VERSION.dll` 實際被 import 的函式（逐檔案，來自 import 表）：

```
DLLtest.dll             -> VerQueryValueA, GetFileVersionInfoSizeA, GetFileVersionInfoA
IFC23.dll                -> GetFileVersionInfoA, GetFileVersionInfoSizeA, VerQueryValueA
InputProcess.dll          -> VerQueryValueW, GetFileVersionInfoW, GetFileVersionInfoSizeW
JRVoice.dll              -> VerQueryValueA, GetFileVersionInfoSizeA, GetFileVersionInfoA
NO1_MH.dll               -> VerQueryValueA, GetFileVersionInfoSizeA, GetFileVersionInfoA
dbghelp.dll              -> GetFileVersionInfoW, GetFileVersionInfoSizeW, GetFileVersionInfoSizeA,
                             VerQueryValueA, GetFileVersionInfoA
dinterface.original.dll  -> VerQueryValueA, GetFileVersionInfoSizeA, GetFileVersionInfoA
```

## 建議的第一候選：`VERSION.dll`

理由（🟡 待階段 1 實測驗證）：
1. **不在原生 KnownDLLs 清單**（已用 `reg.exe` 查證，見上）。
2. **只被周邊模組用**（語音、除錯輔助、輸入處理小工具），**不在** Core/Engine/
   WinDrv/IpDrv/D3D*Drv 這條核心鏈上 —— proxy 寫錯，最壞情況是版本資訊查詢失敗，
   不太可能直接讓客戶端開不起來或連不上伺服器。
3. **forward 面很小**：系統版只有 17 個 export，客戶端鏈只吃其中 5 個，
   而且全是單純轉發（無回呼、無狀態），`.def` 用
   `EXPORTS\nGetFileVersionInfoA=VERSION_ORIG.GetFileVersionInfoA` 這種寫法就能做完，
   實作複雜度低，適合當階段 1 的「先求能載入」實驗品。
4. 被 7 個不同模組 import，行程啟動早期大機率會被載入到，方便驗證
   「DllMain 有沒有跑」。

**次選：`DINPUT8.dll`**（符號更少，只 1 個，但踩在 WinDrv 輸入鏈上，出包可能操作不了，
留作 VERSION.dll 不通時的備案）。

**明確不建議先試**：`wsock32.dll`（網路本線）、`d3d8/d3d9.dll`（畫面本線）、
`ImpersonatorLib_rd.dll`/`dinterface.dll` 依賴鏈（疑似保護相關）。

## 已知限制 / 未驗證事項

- ⬜ **`MetalRage.exe` 本身的靜態 import 表幾乎是空的**（只有 `KERNEL32.DLL`／
  `USER32.DLL` 各 1 個符號，且本身有 1 個 export——214KB 的執行檔這樣不正常）。
  這強烈暗示 EXE 被封裝/保護過，真正的依賴在執行期用 `LoadLibrary`/`GetProcAddress`
  動態解析，**靜態分析看不到**。本檔的候選排序是根據「誰載入了哪個周邊 DLL、
  那個 DLL 又 import 了什麼系統 DLL」推出來的，**不是** MetalRage.exe 的直接依賴表。
- ⬜ 沒有做任何載入測試（把假 DLL 放進 System 資料夾看會不會被吃掉）——
  那是階段 1 的事，這裡只做了靜態表格分析。
- 🟡 `dinterface.dll`（97KB，22 export）與 `dinterface.original.dll`（1.3MB，
  同樣 22 export，import 表大很多）成對存在，形態很像既有的「用小 shim 頂替原始
  DLL」——如果屬實，代表這個客戶端**已經有人（原廠或之前修補者）用過同名 proxy
  手法**，可以佐證這條路線可行，但**沒有進一步逆向確認其用途**，本次任務範圍不含
  深入分析它，僅記錄觀察。
