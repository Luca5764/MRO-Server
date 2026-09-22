# 階段 1 計畫

依據 `docs/backlog.md` BRIDGE-SPIKE 契約 2026-09-22 修訂：
proxy DLL 載入 `frida-gadget-*-windows-x86.dll`，過關條件是「開到登入畫面、
掛 5 分鐘不被砍」。以下段落原本是計畫，**階段 0 不執行任何一步**；
下方新增「BRIDGE-STAGE1-PROXY 執行結果（中階，待審）」一節記錄實際編譯與
靜態驗證的結果，**還沒做過任何執行期測試（沒碰 `/mnt/c/Games/`，沒有
wine，WSL 端只能做靜態驗證）**。

## BRIDGE-STAGE1-PROXY 執行結果（中階 `claude-worker` 2026-09-22，🟡 待審）

原始碼與建置腳本在 `tools/bridge/proxy-version/`（forwarder 版，**建議採用**）
與 `tools/bridge/proxy-version-thunk/`（手寫 thunk 版，對照組）。

### 結論：forwarder 與 thunk 兩種都可行，forwarder 版更簡單、建議用它

1. **PE forwarder（`.def` 的 `Foo=VERSION_ORIG.Foo` 語法）mingw 的
   `i686-w64-mingw32-ld`（GCC 10-win32 20220113 附帶）完全支援**，不用改
   手寫 thunk。用 `objdump -p` 與 `pefile` 都確認匯出表裡是真正的
   Forwarder RVA（`pefile` 的 `exp.forwarder` 欄位讀出
   `b'VERSION_ORIG.GetFileVersionInfoA'`，`objdump` 印
   `Forwarder RVA -- VERSION_ORIG.GetFileVersionInfoA`），不是一般函式位址。
   → `stage1-plan.md` 原本寫的「🟡 待確認：GNU ld 對 PE forwarder RVA
   支援度不確定」**這條疑點已解除，改用 forwarder**。
2. **手寫 thunk 版也編得出來、export 表也對**，但過程中踩到一個真的會
   讓實機載入失敗的坑，記在下面「踩到的坑」，已修正。
3. **兩版的 export 表最終都是 6 個 plain（不帶 `@N`）名字**：
   `GetFileVersionInfoA`、`GetFileVersionInfoSizeA`、`GetFileVersionInfoSizeW`、
   `GetFileVersionInfoW`、`VerQueryValueA`、`VerQueryValueW`（比契約要求的
   5 個多轉發了 `VerQueryValueW`，契約說可以多轉不會錯）。
   用 `objdump -p` 的 `[Ordinal/Name Pointer] Table` 確認，兩版一致。

### 踩到的坑：`__declspec(dllexport)` 的 `__stdcall` 函式預設會匯出成帶 `@N` 的名字

手寫 thunk 版第一次編出來，`objdump -p` 顯示匯出名字是
`GetFileVersionInfoA@16`、`VerQueryValueA@16` 這種帶 stdcall 參數位元組數
尾巴的形式，**跟真正的系統 `version.dll`（SysWOW64，17 個 export 全部是
plain 名字，已用 `pefile` 讀 `/mnt/c/Windows/SysWOW64/version.dll` 核對）
對不上**——客戶端那幾個周邊模組是用
`GetProcAddress(hVersion, "VerQueryValueA")`（plain 名字）在找函式，
帶 `@16` 的匯出名字會讓 `GetProcAddress` 找不到、拿到 `NULL`，等於白轉發。
**修法**：`gcc -shared` 加 `-Wl,--kill-at`，只影響 DLL 自己匯出表寫出的
名字，不影響函式內部呼叫慣例。修完後 `objdump -p` 確認兩版一致為 plain 名字。
這一步已經寫進 `tools/bridge/proxy-version-thunk/build.sh`，不用每次手動加。

### 靜態驗證怎麼做的（WSL 沒有 `wine`，**沒有做過任何執行期測試**）

1. 兩版 proxy `VERSION.dll` 都用 `objdump -p` 和 `pefile` 讀匯出表，
   確認：機器碼是 `0x14c`（i386，32 位元，不是 x86_64）；6 個匯出名字
   跟真正系統 `version.dll` 的名字完全一致（plain，無 `@N`）；forwarder
   版的每個匯出都指到 `VERSION_ORIG.<函式名>`。
2. 寫了一支最小測試 exe
   （`tools/bridge/proxy-version/test/test_import.c`），implicit-link
   `GetFileVersionInfoSizeW`、`VerQueryValueA` 這 2 個符號（5 個裡的 2 個，
   達到契約「至少 2 個」的要求）。
3. **關鍵的第二個坑**：一開始用 `dlltool --add-stdcall-alias` 產生測試用
   import library，結果匯出 EXE 的 import 表 Hint/Name 欄位裡塞的是
   `GetFileVersionInfoSizeW@8`（帶裝飾），這**不是**我們的 proxy DLL 有問題，
   是這份「拿來測試用」的 import library 產生方式不對——跟真正 mingw-w64
   系統內建的 `/usr/i686-w64-mingw32/lib/libversion.a`（展開後同一個符號的
   `.idata$6` section 內容是 `03 00 "GetFileVersionInfoSizeW" 00`，plain）
   逐 byte 比對後找出來的：正確做法是 `.def` 裡符號名**寫成裝飾過的**
   （`GetFileVersionInfoSizeW@8`），dlltool 加 `--kill-at`（不要加
   `--add-stdcall-alias`），這樣產生的 archive member 內部連結符號保留
   `_GetFileVersionInfoSizeW@8`（跟 gcc 呼叫端的 undefined reference 對得上），
   但寫進最終 exe import 表的 Hint/Name 字串是 plain 的，跟系統版一致。
   這個修法只影響 `tools/bridge/proxy-version/test/`（拿假 import library
   來測試我們的名字格式對不對），**跟真正安裝到客戶端目錄的兩個 `VERSION.dll`
   本身無關**——那两個 DLL 的匯出表從頭到尾都是對的（forwarder 版本來就是
   plain，thunk 版用 `--kill-at` 修正過），這一步只是在驗證「如果有一支真的
   implicit-link 這幾個符號的 exe，它產生的 import 表長什麼樣」，確認跟
   官方 mingw-w64 系統 import library 的行為一致，增加信心。
4. `diff` 兩支測試 exe（一支連我們的假 import library、一支連系統真正的
   `libversion.a`）的 `objdump -p ... VERSION.dll` 區塊，**Member-Name 欄位
   完全一致**（`GetFileVersionInfoSizeW`、`VerQueryValueA`），只有
   VMA／Hint 數值不同（那是不同 EXE 版面與不同目標 DLL 匯出序號造成的，
   不影響 Windows loader 的名字比對邏輯，loader 找不到 hint 對應的序號時
   會退回用名字全表比對）。
5. **沒有做過的事**：沒有在 Windows／wine 上實際跑起來過任何一支 DLL 或
   exe，WSL 上沒裝 `wine`／`wine64`（`command -v` 查無）。「DllMain 真的
   會被呼叫」「LoadLibraryW 載入 gadget 真的成功」「forwarder 在真正的
   Windows loader 上真的能解析到 `VERSION_ORIG.dll`」這三件事**都還沒驗證
   過**，要等主力在 `MetalRage-bridge` 專用副本上實跑才知道。

## 安裝說明（給主力照抄執行，🟡 中階寫的，操作前自行核對）

**前提**：已經有一份跟主安裝隔離的 `MetalRage-bridge` 專用副本（複製，
不是連結/共用），且該副本 `LocalDumps` 已關閉（見「執行前檢查清單」）。
以下路徑一律指該副本的 `data/System/`，**不要對主安裝或 HOST-PATCH 用的
副本做任何一步**。

1. **選一版 proxy DLL**——建議用 forwarder 版
   （`tools/bridge/proxy-version/VERSION.dll`，執行 `build.sh` 產生，或直接
   commit 進 repo 的那份）。手寫 thunk 版
   （`tools/bridge/proxy-version-thunk/VERSION.dll`）留作 forwarder 版
   實機失敗時的備案，兩版介面（export 名字）完全一樣，可以直接互換測試，
   不用重做其他步驟。
2. **備份原始檔案**（還原用）：
   ```
   copy "<副本>\data\System\VERSION.dll" "<副本>\data\System\VERSION.dll.orig-backup"
   ```
   算一次 sha256 記下來（跟 `docs/research/2026-09-22-bridge-spike/` 底下
   之後要留的證據比對用，本次任務沒有做這一步，因為沒有 Windows 端環境）。
3. **改名原始 `VERSION.dll` 成 `VERSION_ORIG.dll`**（forwarder 版要用；
   thunk 版**不需要**這步，因為 thunk 版寫死用絕對路徑
   `C:\Windows\SysWOW64\version.dll`，不吃同目錄的 `VERSION_ORIG.dll`）：
   ```
   ren "<副本>\data\System\VERSION.dll" "VERSION_ORIG.dll"
   ```
4. **複製檔案到 `<副本>\data\System\`**（四個檔案，forwarder 版路線）：
   - `tools/bridge/proxy-version/VERSION.dll`（我們編的 proxy，取代步驟 3
     搬走後空出來的名字）
   - `VERSION_ORIG.dll`（步驟 3 已經在原地改名，不用複製，留意路徑一致）
   - `tools/bridge/frida-gadget-17.18.0-windows-x86.dll`（本目錄現成，不改名）
   - `tools/bridge/frida-gadget-17.18.0-windows-x86.config`
     **本次任務沒有建立這個檔案**（`stage1-plan.md` 只有草案 JSON，見下面
     「要放的檔案」第 3 項），主力要先落地這個檔案才能讓 gadget 真的載入
     腳本；DLL 本身沒有這個 `.config` 也能 `LoadLibraryW` 成功（gadget 找
     不到 `.config` 時的行為**沒有查證過**，可能是靜默不啟用腳本、也可能
     報錯，這是階段 1 實跑時要觀察的東西之一）。
   - `bridge-stage1.js`（同上，本次沒有建立，草案內容見第 4 項，先放一個
     空檔或 `console.log(...)` 都符合「能被載入就算數」的最低要求）。
5. **環境變數（可選）**：預設 `bridge.log` 寫在 proxy DLL 自己所在目錄
   （也就是 `<副本>\data\System\bridge.log`）。如果想改路徑，執行遊戲前
   設定 `MRO_BRIDGE_LOG`（例如指到桌面方便看），Windows 下：
   ```
   set MRO_BRIDGE_LOG=C:\Users\<你>\Desktop\bridge.log
   ```
   不設就用預設路徑，不用特別處理。
6. **啟動客戶端，觀察**：`<副本>\data\System\bridge.log`（或
   `MRO_BRIDGE_LOG` 指定的路徑）有沒有出現
   `VERSION.dll proxy attached, self=...` 那一行，以及
   `gadget LoadLibraryW OK/FAILED, ...` 那一行。這是階段 1「載入成功」
   的第一層驗證，其餘驗證方式見本檔「怎麼驗證『載入成功』」一節。

### 怎麼還原（用不了或要收工都照這個順序）

1. 關閉客戶端（如果還開著）。
2. 刪除以下這幾個檔案（複製進去的，不是原本就有的）：
   - `<副本>\data\System\VERSION.dll`（我們編的 proxy）
   - `<副本>\data\System\frida-gadget-17.18.0-windows-x86.dll`
   - `<副本>\data\System\frida-gadget-17.18.0-windows-x86.config`（如果有建立）
   - `<副本>\data\System\bridge-stage1.js`（如果有建立）
   - `<副本>\data\System\bridge.log`（如果 `MRO_BRIDGE_LOG` 沒有另外指路徑）
3. **把 `VERSION_ORIG.dll` 改名回 `VERSION.dll`**：
   ```
   ren "<副本>\data\System\VERSION_ORIG.dll" "VERSION.dll"
   ```
4. 用步驟 2 算的 sha256（如果有算）核對還原後的 `VERSION.dll` 跟原始一致。

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
   - 6 個 export（`GetFileVersionInfoA/W`、`GetFileVersionInfoSizeA/W`、
     `VerQueryValueA/W`——契約只要求前 5 個，`VerQueryValueW` 沒有 consumer
     用到，但一併轉發不會錯）**轉發**到系統原本的 `version.dll`——原檔案先
     改名成 `VERSION_ORIG.dll` 放在同一資料夾。
     🟡 待審（中階做的，靜態驗證，非執行期測試）：**GNU ld 支援 PE forwarder RVA**：
     `.def` 用 `Foo=VERSION_ORIG.Foo` 語法，`i686-w64-mingw32-gcc`
     （GCC 10-win32 20220113）編出來的 `VERSION.dll`，`objdump -p` 印出
     `Forwarder RVA -- VERSION_ORIG.GetFileVersionInfoA`，`pefile` 讀
     `exp.forwarder` 也對得上，**不用寫手動轉呼叫 thunk**，原始碼與建置
     腳本在 `tools/bridge/proxy-version/`。手寫 thunk 版本也編出來放在
     `tools/bridge/proxy-version-thunk/` 當對照組（過程中踩到
     `__declspec(dllexport)` 的 `__stdcall` 函式預設會把 export 名字寫成
     帶 `@N` 尾巴的形式，需要 `-Wl,--kill-at` 修正，見同目錄 `build.sh`
     註解），**兩版都只做過靜態驗證，沒有實機測試過**，細節見本檔前面
     「BRIDGE-STAGE1-PROXY 執行結果」一節。
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
