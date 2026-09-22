# PresentMon — 外部量 FPS，取代截圖判讀

契約：`docs/backlog.md` 的 `FPS-PRESENTMON`。本檔記工具裝在哪、版本、權限需求、
怎麼用 `fps.sh`，以及已知限制。中階子 agent 產出，🟡 待審（`docs/journal/INDEX.md` 對應條目）。

## 為什麼

量掛鉤對 FPS 的影響，之前只能用 `stat fps` 的畫面 overlay + 截圖判讀：
- 只有單一瞬間的值，看不到 frame-time 分布與卡頓；
- 截圖檔名會被下一輪覆蓋；
- 分母（待機值 vs 實戰值、房主 vs 加入者）拿錯導致連續兩次更正
  （`docs/journal/2026-09-22-1620-host-fps.md`）。

PresentMon（Intel，開源）從外部用 ETW 讀目標行程的 Present 事件，**不注入、不改客戶端任何檔案**，
符合 `AGENTS.md` 硬性約束 1。

## 版本與下載（已驗證 sha256，2026-09-22）

| 項目 | 值 |
|---|---|
| 版本 | v2.6.0（GitHub release 發布於 2026-09-21T17:30:36Z） |
| 下載網址 | `https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe` |
| 檔案大小 | 980320 bytes |
| sha256 | `b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af` |
| 來源 repo | `GameTechDev/PresentMon`（Intel 官方，GitHub release，非 intel.com 鏡像） |

sha256 是直接從 GitHub release API 的 asset `digest` 欄位取得，**且下載後本機重算過一次，兩邊一致**
（`sha256sum` 對照，見下方「怎麼裝的」）。只下載了單一 exe（`PresentMon-2.6.0-x64.exe`，standalone
console 版），沒有下載同一個 release 裡的 `PresentMon-2.6.0.msi`（GUI/Service 安裝包，體積大很多，
這個任務只需要 CLI）或 `ReleaseSymbols.zip`（除錯符號，不需要）。

**版本是釘死的**（`fps.sh` 開頭 `PM_VERSION`/`PM_SHA256` 常數）。要升級：手動下載新版、
用 `sha256sum` 核對 GitHub release 頁面上的 digest、同時更新 `fps.sh` 的常數與這份表格，
不要讓腳本在執行期自動抓新版（避免供應鏈風險，也避免版本跟這份 README 的紀錄兜不起來）。

## 怎麼裝的

**不進 git**，裝在 Windows 使用者設定檔底下（跟 `logwatch.sh` 把編譯出的 `LogWatch.exe`
放在 `%USERPROFILE%\mro-logwatch\` 是同一個理由：`fps.sh` 用 WSL 對 `/mnt/c/...` 路徑的
direct-exec 直接執行這個 exe，不透過 `powershell.exe`/`csc.exe`，避免那兩支工具對
`\\wsl` UNC 路徑不可靠的已知問題）：

```
%USERPROFILE%\mro-presentmon\PresentMon-2.6.0-x64.exe
```

已經放好了（這次任務裡從 WSL 直接 `curl` 下載、`sha256sum` 核對後複製過去，見上表）。
`fps.sh` 每次 `start`/`stop` 前都會重新算一次 sha256 跟腳本裡釘死的值比對，
不符會直接失敗並印出期望值/實際值，不會執行未知版本的二進位檔。

**要移除**：直接刪除 `%USERPROFILE%\mro-presentmon\` 整個資料夾即可，沒有安裝到系統其他地方
（沒跑過 `.msi`，沒有登錄檔項目，沒有服務）。輸出資料在 `%USERPROFILE%\mro-fps\`，
移除時要不要保留另外決定。

## ⚠️ 權限需求（已查證，這台機器目前不符合，需要操作者動作）

引用自 PresentMon 官方 README（`README.md` "Troubleshooting → User access denied" 一節，
v2.6.0 tag）：

> PresentMon needs to be run by a user who is a member of the "Performance Log Users" user
> group. If neither of these are true, you will get an error "failed to start trace session
> (access denied)".
>
> If PresentMon is not run with administrator privilege, it will not have complete process
> information for processes running on different user accounts or for processes that are
> short-lived. Such processes will be listed in the console and CSV as "\<unknown>", and they
> cannot be targeted by name (`--process_name`).

也就是說要嘛：
1. **用系統管理員身分執行**（每次都要，或至少那個 session），或
2. **把操作者的帳號加進「Performance Log Users」本機群組**（一次性設定，之後不用再提權）：
   1. 用系統管理員身分開 `compmgmt.msc`；
   2. 「系統工具」→「本機使用者與群組」→「群組」；
   3. 雙擊「Performance Log Users」→「新增」；
   4. 輸入操作者的帳號名稱 → 確定；
   5. **登出再登入**才會生效。

**[TEST] 2026-09-22（這次任務裡實測，這台機器目前的狀態）：** 用這台機器目前的（非提權）帳號
對 `dwm.exe`（Windows 桌面合成器，本來就一直在跑，用來測試不會碰到客戶端）跑：

```
PresentMon-2.6.0-x64.exe --process_name dwm.exe --output_file <path> \
    --session_name mro-fps-test --stop_existing_session --no_console_stats --timed 5 --terminate_after_timed
```

結果（exit code 6，約 1 秒內結束，沒有寫出 CSV）：

```
error: failed to start trace session: access denied.
       PresentMon requires either administrative privileges or to be run by a user in the
       "Performance Log Users" user group.  View the readme for more details.
```

**這台機器目前的操作者帳號兩個條件都不符合**，`fps.sh start` 現在會可靠地偵測到這個失敗
（進程 1 秒內自己結束，見下方 `fps.sh` 說明）並印出這節的提示，但**還沒辦法實際量到任何真實資料**。
需要操作者依上面兩個做法之一動作。**這個子 agent 沒有嘗試提權、沒有繞過 UAC**——`start` 不會加
`--restart_as_admin`（PresentMon 自己支援的自動彈 UAC 提示旗標）；沒有用這個旗標是刻意的：
背景無人值守跑會被 UAC 對話框卡住等不到人按，而且擅自加會偏離契約「不要自己嘗試提權」。
如果操作者之後想手動加這個旗標自己跑一次來測，可以照 `fps.sh` 的 `ARGS=(...)` 那行手動組指令，
不需要改腳本。

## `fps.sh` 用法

跟既有的 `tools/win/logwatch.sh` 同一種介面（`start`/`stop`/`status` 對 `--proc`，pidfile
放在 `%USERPROFILE%\mro-fps\`）：

```bash
tools/win/fps.sh start --proc MetalRage2
tools/win/fps.sh start --proc MetalRage2 --out /path/to/out.csv --max-seconds 300
tools/win/fps.sh status --proc MetalRage2
tools/win/fps.sh stop --proc MetalRage2
tools/win/fps.sh summary /path/to/out.csv
```

- `start`：背景啟動 PresentMon，對 `--process_name <PROC>` 開一個獨立的 ETW session
  （`mro-fps-<PROC>`，同時對不同行程名各開各的，房主／加入者兩台可以同時錄）。
  沒給 `--out` 就自動存到 `%USERPROFILE%\mro-fps\out\<PROC>-<時間戳>.csv`（**檔名帶行程名跟時間戳，
  不會覆蓋前一次**）。`--max-seconds` 是安全上限（`--timed N --terminate_after_timed`），
  不是主要的停止手段——正常應該用 `stop`；這個上限只是防止忘記 `stop` 或呼叫端當掉時
  PresentMon 永遠跑下去。
  **啟動後 1 秒會自我檢查**：PresentMon 遇到 access denied 等啟動失敗會在 ~1 秒內自己結束，
  `start` 會抓到這個情況、印出 `.stdout.log` 路徑跟上面權限一節的提示，不會回報一個其實已經死掉的 pid。
- `stop`：**優雅停止**——不是直接 kill 背景行程，而是另外短暫起一個 PresentMon 實例帶
  `--terminate_existing_session`，請正在跑的那個 session 自行結束（WSL 沒辦法對它 direct-exec
  起來的 Windows 行程送 Ctrl+C 這個 console control event，這是 PresentMon 文件裡唯一另外提到的
  乾淨關閉方式，見官方 README "Shutting down PresentMon on Windows 7"；`--terminate_existing_session`
  是唯一可腳本化的優雅停止路徑）。🟡 這條路徑對「真的跑出資料的長時間錄製」CSV 是否會正常收尾
  沒有實測過（這次任務全程卡在 access denied，沒有任何一次成功錄到資料的 session 可以拿來測
  `stop`）——**這是本次任務沒驗完的部分**，下一輪拿到管理員權限後第一件事應該是驗這條路徑。
- `status`：印 `running (pid N)` 或 `not running`。
- `summary <csv路徑>`：呼叫 `presentmon_summary.py`，印偵測到的欄位名稱、樣本數、時間範圍、
  frame time（ms）的 avg/median/p1/p99，以及對應的瞬時 fps 統計。**p1/p99 是對每幀各自算的百分位數，
  不是拿 avg frame time 去換算**，兩者不完全等價（p1 fps ≈ 業界說的「1% low」）。

`presentmon_summary.py` 是純 stdlib（不用裝套件），欄位偵測用跟既有
`tools/win/trace-analysis/analyze_presentmon.py` 同樣的大小寫不分、子字串比對邏輯，
因為 PresentMon 1.x/2.x 欄位名稱不同、CLI 參數（`--v1_metrics`/`--v2_metrics`/`--track_*`）
也會改變實際欄位集合，寫死欄位名稱會很脆弱。

## 有沒有真的跑起來過

- ✅ 跑過 `--help`，二進位檔本身可執行（WSL direct-exec `/mnt/c/...exe` 沒問題）。
- ✅ 跑過真實的 `fps.sh start/stop/status` 三個子命令，目標是 `dwm.exe`（不是客戶端、不是 Pico），
  **正確地偵測並回報了 access denied 這個失敗路徑**（見上方「權限需求」的 [TEST] 記錄）。
- ✅ 跑過 `fps.sh summary`，對照的是**這個任務裡自己生成的假 CSV**（600 幀、模擬 120fps
  基準加週期性卡頓），不是真實 PresentMon 輸出，欄位名稱照官方文件手打
  （`CPUStartTime`／`MsBetweenPresents`），數字算出來合理（avg≈120fps、p1 fps 抓到卡頓拉低的部分）。
- ❌ **沒有跑過成功錄到真實資料的完整路徑**（`start` 成功啟動 → 真的錄到 CSV → `stop` 優雅收尾
  → `summary` 讀真實 CSV）。卡在這台機器目前的帳號沒有權限，見上方「權限需求」一節，
  **需要操作者先做那兩個動作之一**。真實欄位名稱是否跟官方文件、跟 `presentmon_summary.py`
  猜的一致，也還沒有真的驗證過（跟 `analyze_presentmon.py` 當初的處境一樣）。

## 已知限制

- 只測過 CLI 版（standalone exe），沒裝 GUI/Service 版（`.msi`），沒有即時 overlay 可看，
  只能錄完再用 `summary` 看統計。
- `stop` 的優雅收尾路徑沒有拿真實資料驗過（見上）。
- 非提權帳號下，短命／跨帳號的行程在 PresentMon 眼裡是 `<unknown>`，**`--process_name` 抓不到**；
  MetalRage 是長時間執行的行程，這點理論上不影響，但也還沒實測。
- 沒有接進 Pico runner（backlog 契約第 3 點「接進 Pico runner」不在這次任務範圍內，
  見這次任務的派工訊息，只做了 `fps.sh` 本身）。
- 沒有做 backlog 完成條件 3「拿它重量一次今天的四組掛鉤對照」——那需要成功錄到真實資料，
  卡在權限問題，見上。
