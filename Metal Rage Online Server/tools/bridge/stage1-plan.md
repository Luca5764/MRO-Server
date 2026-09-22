# 階段 1 計畫（只出計畫，未執行）

依據 `docs/backlog.md` BRIDGE-SPIKE 契約 2026-09-22 修訂：
proxy DLL 載入 `frida-gadget-*-windows-x86.dll`，過關條件是「開到登入畫面、
掛 5 分鐘不被砍」。以下是計畫，**階段 0 不執行任何一步**，全部待審。

## 為什麼不能直接把 gadget 改名成候選 DLL

`frida-gadget-17.18.0-windows-x86.dll` 本身只 export gum/frida 相關符號，
**沒有** `VerQueryValueA` 這類 `VERSION.dll` 的 17 個真正 export。直接改名塞進去，
peripheral 模組呼叫 `GetProcAddress(hVersion, "VerQueryValueA")` 會拿到 NULL，
呼叫端沒做 NULL 檢查的話就是直接崩潰。**必須**有一個小 proxy DLL 頂著候選 DLL 的
名字，自己轉發真正需要的符號，並在 `DllMain` 裡多做一件事：把 gadget
`LoadLibraryW` 進來（gadget 在 `DLL_PROCESS_ATTACH` 時會自己初始化並讀取
同名 `.config`，不需要額外呼叫任何 export）。

## 要放的檔案（`data/System/` 底下，只在 `MetalRage-bridge` 專用副本）

1. **`VERSION.dll`**（我們自己編的 proxy，取代原本同名的系統檔——
   Windows 目錄搜尋順序讓行程優先吃到 EXE 所在目錄/System 資料夾下的同名檔）。
   - `DllMain` 邏輯：`DLL_PROCESS_ATTACH` 時
     a) 往 `bridge.log` 寫一行 pid/時間/自己的路徑（階段 1 過關條件要看的那行）；
     b) `LoadLibraryW(L"frida-gadget-17.18.0-windows-x86.dll")`（相對路徑，
        放在同一個 System 資料夾）。
   - 5 個真正用到的 export（`GetFileVersionInfoA/W`、`GetFileVersionInfoSizeA/W`、
     `VerQueryValueA`）**轉發**到系統原本的 `version.dll`——原檔案先改名成
     `VERSION_ORIG.dll` 放在同一資料夾，我們的 proxy 在啟動時
     `LoadLibraryW(L"VERSION_ORIG.dll")` + `GetProcAddress` 拿到真函式指標，
     每個 export 用一個轉發 thunk（`jmp [real_ptr]`）頂上去。
     🟡 待確認：GNU ld/`dlltool`（mingw 工具鏈）對 PE forwarder RVA
    （`.def` 裡 `Foo=RealDLL.Foo` 那種語法）支援度不確定，**保守做法**是寫
     真正的 C thunk 函式（`GetProcAddress` 後手動轉呼叫），不依賴 forwarder RVA，
     階段 1 動工時先花 10 分鐘確認 mingw 是否支援，不支援就直接用 thunk。
   - 需要的符號列表與各檔案用量見
     `docs/research/2026-09-22-bridge-spike/proxy-dll-candidates.md`。
2. **`frida-gadget-17.18.0-windows-x86.dll`**（本目錄現成，複製過去，不改名——
   Frida 官方建議 gadget 檔名本身可以自訂，但**同名 `.config`** 要對得上，
   保持官方檔名最單純）。
3. **`frida-gadget-17.18.0-windows-x86.config`**（gadget 的設定檔，副檔名把
   `.dll` 換成 `.config`，這是 Frida gadget 找設定檔的規則——🟡 版本 17.18.0
   的確切檔名比對規則待階段 1 動工時對照官方文件再確認一次，不要憑舊版記憶）。
   JSON 內容草案：
   ```json
   {
     "interaction": {
       "type": "script",
       "path": "C:\\Games\\MetalRage-bridge\\data\\System\\bridge-stage1.js",
       "on_change": "ignore"
     },
     "runtime": "qjs"
   }
   ```
   - `runtime` 選 `qjs`（QuickJS）而不是 `v8`：gadget 檔案本身已經內嵌兩種都能跑，
     選 qjs 的理由是**啟動時記憶體/初始化開銷較小**，階段 1 只是要證明「载入+
     存活」，用不到 V8 的效能；如果階段 2 腳本需要更複雜的非同步/npm 生態才考慮
     換 `v8`。🟡 這個取捨沒有實測依據，只是先選一個能動的起點。
   - `on_change: "ignore"`：階段 1 不需要熱重載腳本，先求穩定，之後階段 2 迭代
     腳本時可能改成 `"reload"`。
   - `path` 用絕對路徑，且**不放在客戶端安裝目錄以外**（gadget 讀 script 的路徑
     要能被行程存取，用相對於 `.config` 的路徑也可以，屆時二選一，看哪個
     更方便同步檔案）。
4. **`bridge-stage1.js`**：階段 1 的最小腳本，只要能被 gadget 載入就算數，
   內容可以先是空檔或 `console.log("bridge stage1 alive")`（gadget 有自己的
   log 出口，Windows 上預設不一定看得到 stdout，**驗證方式改用 DLL 自己寫的
   `bridge.log`，不依賴 gadget 腳本的輸出**，降低一個變數）。

## 怎麼驗證「載入成功」

1. **`bridge.log` 有那一行**（pid、時間戳、`GetModuleFileNameW` 印出的自己路徑）
   ——這是 proxy DLL 自己的 `DllMain` 寫的，不靠 gadget，最基本的訊號。
2. **gadget 自己也有機會留下痕跡**：用 `Process Explorer`（或 `tasklist /m`）
   在客戶端還活著時確認 `frida-gadget-17.18.0-windows-x86.dll` 出現在
   `MetalRage.exe` 的已載入模組清單裡——這一步需要在 Windows 端操作，
   階段 1 執行者要另外請操作者用工作管理員「詳細資料」分頁加「模組」欄位看，
   或用 `tasklist /m frida-gadget*` 之類指令（不 attach debugger，只是列模組，
   不觸及 anti-attach）。
3. 如果第 4 節的腳本有寫東西（例如之後往另一個檔案打點），可以再加一層驗證，
   但階段 1 最低限度只需要 1、2 兩項。

## 怎麼驗證「掛 5 分鐘沒被砍」

1. **客戶端仍在前景、能操作**：畫面沒跳回桌面，`tasklist` 還看得到
   `MetalRage.exe`——這步驟延續現有做法（`tools/win/shot.sh` 截圖 + log），
   不新增機制。
2. **`bridge.log` 的時間戳**：如果階段 1 的腳本或 DLL 有心跳寫入（例如每分鐘
   追加一行），5 分鐘後應該有 5 行左右；階段 1 最低限度只要求開機那一行
   還在（沒被清掉），心跳寫入算加分，不是過關必要條件（契約寫的是「掛 5
   分鐘沒被砍」，不是「持續回報」，那是階段 2 的事）。
3. **被砍的話要記錄什麼**（契約已經寫明，這裡重申備忘）：
   - 客戶端行程結束碼（`echo %ERRORLEVEL%` 或工作管理員看不到行程時的推斷）；
   - Windows 事件檢視器「應用程式」記錄裡對應時間點的錯誤事件
     （Application Error / faulting module 之類）；
   - `MetalRage/data/Log/MetalRage.log` 最後幾行；
   - `LocalDumps` 這次一定要維持關閉（沿用既有結論，見
     `journal/2026-09-20-1240-stutter-root-cause.md`），確認關閉狀態放進階段 1
     的執行前檢查清單，不要重新驗一次要不要開。
4. **不升級到 XIGNCODE 旁路**：如果 5 分鐘內被砍，且懷疑是 XIGNCODE 動的手，
   按契約**先停下來回報**，要不要套旁路由 PM 與操作者決定，執行者不要自己套。

## 執行前檢查清單（給階段 1 執行者，不是本次交付範圍，先列著備忘）

- [ ] 確認在 `MetalRage-bridge` 專用副本操作，不是 `MetalRage Online` 或
      `MetalRage Online 2`（那兩份目前被其他實驗佔用，見任務契約的硬限制）。
- [ ] 確認副本的 `LocalDumps` 關閉。
- [ ] 確認副本與主安裝隔離（複製自主安裝，不是連結/共用同一份檔案）。
- [ ] proxy DLL 的 `VERSION_ORIG.dll`（改名後的真檔）sha256 跟主安裝的
      `version.dll` 一致，作為「轉發目標沒被我們自己改壞」的底線檢查。
- [ ] 建置腳本（mingw 編譯指令）存進 `tools/bridge/`，不要手動編一次就丟。
