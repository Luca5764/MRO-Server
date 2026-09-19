# Raspberry Pi Pico 2 W 硬體 USB HID 自動化指南

這套工具使用 **Raspberry Pi Pico 2 W（RP2350）** 作為實體 USB 鍵盤與滑鼠控制器。

因為指令是由微控制器硬體透過物理 USB 傳輸線發出，Windows 核心與 XIGNCODE 只能看到標準的物理 USB 裝置（真實硬體 VID/PID、標準 HID 報告）。🟡 **預期**這樣不會觸發反作弊軟體的模擬輸入阻擋（`LLKHF_INJECTED`）——這點還沒有在真正的反作弊環境下驗證過，不算已確認，操作者實測前不要當成事實引用。

---

## 第一次設定步驟（板子到貨後約 5 分鐘完成）

### 1. 燒錄 CircuitPython 韌體
1. 按住 Pico 2 W 板子上的白色 **`BOOTSEL`** 按鈕不放，將 USB 線插上電腦。
2. 電腦會彈出一個名為 **`RP2350`** 或 **`RPI-RP2`** 的隨身碟。
3. 前往官網下載 Pico 2 W 專用的 CircuitPython 韌體（`.uf2` 檔）：
   * 下載頁面：[https://circuitpython.org/board/raspberry_pi_pico2_w/](https://circuitpython.org/board/raspberry_pi_pico2_w/)
   *(若 Pico 2 W 專屬頁面剛出，亦可使用 Pico 2 通用 RP2350 UF2)*
4. 將下載好的 `.uf2` 檔案直接拖入隨身碟中。
5. 板子會在 2 秒後自動重開機，此時隨身碟名稱會變成 **`CIRCUITPY`**。

---

### 2. 放入 `adafruit_hid` 程式庫
1. 前往 Adafruit 官方下載庫包：
   * 下載頁面：[https://circuitpython.org/libraries](https://circuitpython.org/libraries)
   * 下載 **Bundle 9.x (mpy)** 的 zip 壓縮檔。
2. 解壓縮後，在裡面的 `lib/` 目錄中找到 **`adafruit_hid`** 資料夾。
3. 將整個 **`adafruit_hid`** 資料夾複製到 `CIRCUITPY/lib/` 內。

---

### 3. 複製控制器主程式
將本專案中的 `Metal Rage Online Server/tools/pico/code.py` 複製到 `CIRCUITPY/` 根目錄（取代既有的 `code.py`）。存檔後板子會自動重啟。

**這樣就完成了。** 板子不需要設定 WiFi 也能用——它一直在監聽 USB CDC 序列埠（見下一節），只有想額外用 WiFi/HTTP 控制時才需要步驟 4。

---

## 主控端連線方式：USB 序列埠（預設）

`pico_ctl.py` 預設透過 **USB CDC 序列埠（COM port）** 跟 Pico 溝通，不需要 WiFi、不需要 `settings.toml`。

WSL 無法直接開 Windows 的 COM port，所以實際的序列埠存取是由 `tools/pico/pico_serial.ps1`（Windows PowerShell 腳本）執行；`pico_ctl.py` 透過 `powershell.exe` 呼叫它，做法跟 `tools/win/drive.sh` 呼叫 `input.ps1` 一樣（腳本會先被複製到 `C:\Users\su200\`，因為 PowerShell 沒辦法可靠地從 `\\wsl` 路徑執行）。

板子插上 Windows 後，裝置管理員會出現一個對應 VID `239A` / PID `8162`（console CDC 介面）的 COM port（例如 `COM6`）。`pico_serial.ps1` 預設會用這個 VID/PID 自動偵測 COM port，通常不用手動指定；如果自動偵測失敗（例如同時插了不只一個 Pico），可以固定指定：

```bash
python3 tools/pico/pico_ctl.py set_port COM6   # 存進 tools/pico/.pico_port
# 或只在單次指令生效：
PICO_PORT=COM6 python3 tools/pico/pico_ctl.py ping
```

### 測試連線（Ping）
```bash
python3 tools/pico/pico_ctl.py ping
# 預期輸出: [PICO PONG] PONG uptime=12.5s mem_free=184320B (1872.7ms roundtrip)
```
（roundtrip 時間包含每次呼叫 powershell.exe 的啟動成本，約 1–2 秒；這是 PowerShell 進程啟動的固定開銷，不是序列埠本身的延遲。）

### 透過命令列操作遊戲
先開一個 session（見下方「無人值守護欄」），再用既有的 `pico_drive.sh`（介面與原本的 `drive.sh` 完全一致）：

```bash
python3 tools/pico/pico_ctl.py session start "測試 F5 開始"

# 按鍵
tools/win/pico_drive.sh key F5           # 按下並放開 F5 (準備/開始)
tools/win/pico_drive.sh key ENTER        # 按下 Enter (登入)

# 按住按鍵 (戰鬥中移動/開火，最長 5000ms，超過會被韌體截斷)
tools/win/pico_drive.sh press W 2000     # 前進 2 秒
tools/win/pico_drive.sh press SPACE 300  # 跳躍

# 點擊 (以 MetalRage 遊戲視窗客戶區為基準座標，見下方 click_at 說明)
tools/win/pico_drive.sh click 512,300

# 打字 (發送聊天室 marker；只接受可列印 ASCII)
tools/win/pico_drive.sh type "test automated marker"

python3 tools/pico/pico_ctl.py session end
```

### 一次送出多個指令（batch）
因為每次呼叫 `powershell.exe` 都要付開機成本，需要連續送多個原始指令時用 `batch`，同一次 PowerShell 呼叫裡送完（一樣需要先開 session）：

```bash
python3 tools/pico/pico_ctl.py batch "PING" "KEY F5" "PRESS W 1500"
```

### 點擊：`click_at`（閉環校正，取代舊的 `win_click`）
```bash
python3 tools/pico/pico_ctl.py click_at 512,300        # 左鍵，座標=MetalRage 客戶區相對座標
python3 tools/pico/pico_ctl.py click_at 512,300 right   # 右鍵
python3 tools/pico/pico_ctl.py win_click 512,300         # win_click 是 click_at 的別名，行為完全相同
```
座標解析、相對移動、游標讀回校正（最多 6 次迭代收斂到 ±4px 內）都在 `pico_serial.ps1` 同一個 PowerShell 進程內完成，點擊目標超出遊戲視窗客戶區、或收斂失敗，一律 `[BLOCKED]`、不送出 CLICK。舊版 `win_click`（用 `screen.ps1` 抓視窗座標、`MOVE_TO` 盲送、沒有目標驗證）已經移除。

---

## 無人值守護欄（Unattended Safety Guards）

這套工具原本假設操作者會盯著螢幕。現在領頭 AI 有時要在操作者不在（例如上班中）的情況下自己操作遊戲，所以加了幾層**結構性**防呆，讓「按錯視窗」在設計上就不可能發生，而不是靠自覺。

### 1. Session（每次無人操作要明確開關）
所有會送輸入的指令（`key` / `press` / `click` / `click_at` / `win_click` / `move` / `move_to` / `type` / `batch` / 大多數 `raw`）都要求先開一個 session，否則直接 `[BLOCKED]`、結束碼 3：
```bash
python3 tools/pico/pico_ctl.py session start "描述這次要做什麼"
...（操作）...
python3 tools/pico/pico_ctl.py session end
```
Session 狀態存在 `tools/pico/.pico_session`（已加進 `.gitignore`，不進 repo）。`ping`、`raw PING`、`raw RESET` 不需要 session（純診斷／釋放按鍵，不會把輸入送進任何視窗）。

**任何一次 `[BLOCKED]` 都會把目前的 session 標成「halted」**：之後的指令會繼續被拒絕，即使 session 檔案還在，也要明確 `session end` 再 `session start` 一次才能繼續——這是刻意設計成不能自動恢復，逼你（或下一個接手的 AI）先搞清楚剛剛為什麼被擋。

### 2. 前景視窗閘門（在 `pico_serial.ps1` 裡，每個指令送出前都檢查）
除了 `PING`／`RESET`，每個指令送到韌體前，`pico_serial.ps1`（Windows 端）都會在**同一個 PowerShell 進程**裡確認：
- 目前的前景視窗（`GetForegroundWindow`）屬於 `MetalRage` 行程
- 視窗沒有被縮到最小
- 視窗完整落在**主螢幕**（副螢幕放 VS Code / 終端機，不該收到任何按鍵）
- 不是鎖定畫面／安全桌面（前景行程是 `LockApp`／`LogonUI`／`consent` 等）

任一項不成立就印出 `[BLOCKED] <原因> <指令>`，送一個 `RESET`（釋放所有按鍵，盡力而為，失敗也不影響回報的原因）給 Pico，結束碼 3，**整批指令當場停止、不繼續處理**。

**所有檢查都是 fail-closed**：Win32 查詢丟例外、抓不到前景視窗、抓不到 MetalRage 行程……任何查不出「確定沒問題」的情況都當作 `BLOCKED`，不會重試、不會放行。

### 3. 點擊目標閘門（`click_at` / `win_click`）
見上方「點擊」小節：目標必須落在遊戲視窗客戶區內，游標必須真的移動、讀回確認在 ±4px 內才送出 `CLICK`，否則 `[BLOCKED]`。

### 4. 文字閘門（TYPE）
`TYPE` 只接受可列印 ASCII（0x20–0x7E）；有中文或其他非 ASCII 字元會在送到 Pico 之前就被 `[BLOCKED]`（PowerShell 端也會再檢查一次）——中文輸入法會把鍵盤巨集打亂，乾脆不接受。

### 5. 緊急停止（Kill Switch）
以下任一動作都能立刻讓所有輸入指令失效：
- 在 Windows 建立檔案 `C:\Users\su200\mro-pico\STOP`（可以是空檔案），刪掉它才會恢復。
- 直接拔掉 Pico 的 USB 排線。

STOP 檔案的檢查跟前景視窗閘門一樣是 fail-closed、每個指令送出前都查。

### 6. 稽核紀錄
每一個輸入指令，不管成功還是被擋，都會：
- 附時間戳記寫進 `tools/pico/logs/actions.log`（已加進 `.gitignore`）
- 盡力寫成 server 那個 tmux session（`server`）console 裡的一行 marker（`pico: <指令> -> <結果>`），沒有 `server` session 就靜默略過；marker 一律不會以 `/` 開頭。

### 7. 韌體端（`code.py`）
- 開啟硬體看門狗（`microcontroller.watchdog`，8 秒逾時、RESET 模式），主迴圈與長時間的 `PRESS`／`TYPE` 都會分段餵狗；韌體真的卡死會自動重開機，而不是永遠停在某個按鍵按著的狀態。
- `PRESS` 最長截斷在 5000ms。
- 每個指令執行完（不管成功或例外）都會呼叫 `release_all()`，確保不會有按鍵/滑鼠鍵卡在按下狀態。

### 已知限制 / 待決
- 這些護欄都掛在**序列埠傳輸**（`pico_serial.ps1`）上。如果切成 `PICO_TRANSPORT=http`（WiFi 模式），指令直接打去 Pico 的 HTTP handler，**不會經過前景視窗／點擊目標／ASCII 閘門**，只剩 session 這一層（在 `pico_ctl.py`）。無人值守時不要切到 HTTP 模式。
- 前景視窗閘門檢查的是「視窗完整落在主螢幕」，用的是 `GetWindowRect` 的視窗外框（含邊框），不是客戶區；一般情況下夠用，但如果視窗有透明邊框或跨螢幕邊界一兩個像素，行為未驗證過。

---

## 客戶端崩潰偵測與復原（`client_ctl.py`）

`pico_ctl.py` 只管輸入（鍵盤/滑鼠），完全不碰客戶端行程本身。`client_ctl.py` 是另一支獨立工具，負責無人跑步時偵測客戶端卡死／消失，留證據，然後重啟：

```bash
python3 tools/pico/client_ctl.py status
# [OK] running pid=... hwnd=... responding=True rect=...    exit 0
# [WARN] not responding ...                                 exit 1
# [NOT_RUNNING] MetalRage process not found                 exit 2

python3 tools/pico/client_ctl.py evidence "some-label"
# 存整桌面截圖 + MetalRage.log 最後 200 行到
# tools/pico/logs/crash-<時間戳>-<label>/，隨時可安全執行，不會動到客戶端行程。

python3 tools/pico/client_ctl.py restart --step login --reason "卡在登入畫面" --dry-run
python3 tools/pico/client_ctl.py restart --step login --reason "卡在登入畫面"
```

`restart` 一定要先有一個**開著、沒被 halt** 的 pico session（跟 `pico_ctl.py` 共用同一個 `.pico_session`）。依序擋下：STOP 檔案存在、這個 session 已經重啟滿 3 次、或**跟上一次重啟是同一個 step 標籤**（代表同一個點連續崩兩次，八成是迴圈，不值得再自動試）——任何一種都會直接把 session 標成 halted，結束碼非 0，不重試。通過閘門後才會真的動手：先留證據（重啟前的畫面/log），再 `taskkill /IM MetalRage.exe /F`（行程還在才殺）、等它真的退出、用 `Play Metal Rage Online.bat` 重開、等視窗出現（最多 90 秒）。過程中任何一步失敗一樣直接 halt session。**不會自動登入**，登入是後面的 Pico 步驟做的事。

`--dry-run` 會照樣跑完所有閘門檢查、印出「接下來會做什麼」，但完全不碰真正的客戶端、也不改 session 檔案，測試改動時用這個，不要對正在用的客戶端跑真的 `restart`。

---

## 選用：WiFi / HTTP 連線方式

如果不想每次都透過 `powershell.exe` 開序列埠（例如板子離 WSL 主機的 Windows 比較遠、想直接用網路控制），可以額外設定 WiFi，改用 HTTP REST API。**這是選用功能，序列埠模式已經涵蓋所有指令。**

### 4.（選用）設定 WiFi
1. 將 `settings.toml.example` 複製到 `CIRCUITPY/settings.toml`，並用文字編輯器填寫家中的 WiFi 帳號與密碼：
   ```toml
   WIFI_SSID = "你的WiFi名稱"
   WIFI_PASSWORD = "你的WiFi密碼"
   HTTP_PORT = 8080
   ```
2. 存檔後板子會自動重啟。板子上的綠燈或 Serial 會顯示連線成功取得的 IP（例如 `192.168.1.50`）。

### 主控端切換成 HTTP 模式
```bash
python3 tools/pico/pico_ctl.py set_ip 192.168.1.50   # 存進 tools/pico/.pico_ip
PICO_TRANSPORT=http python3 tools/pico/pico_ctl.py ping
```

也可以直接設環境變數 `PICO_TRANSPORT=http` 讓整個 session 都走 WiFi，不用每次都加前綴。

---

## 無模型的決定性實驗跑者（`runner.py`）

`pico_ctl.py`／`client_ctl.py` 只管單一指令或行程重啟。`runner.py` 再往上一層：把一份「劇本」（experiment JSON）從頭跑到尾，**每一步自己判斷成功或失敗**（文字訊號 + 本機圖片比對），完全不呼叫任何模型。跑完寫一份 JSON + 文字報告，操作者／領頭 AI 事後只讀報告。

組成：
- `screens.py` — 螢幕分類器。拿 `shot.sh` 拍的整個遊戲視窗（1616×1239，client area 1600×1200、偏移 (8,31)）跟 `atlas/` 底下的小張參考裁圖比對「平均絕對誤差」（MAD，numpy 算，沒有裝 OpenCV）。`atlas/manifest.json` 記每個標記的裁切框跟門檻，裁圖檔案很小（幾 KB 到幾十 KB），全部進 repo；完整參考截圖留在 `shots/`（已在 `.gitignore`，不進 repo）。
  - `classify_screen(img)` → 回傳 `lobby` / `shop` / `console_open` / `unknown`，附分數、次佳分數的差距（margin）、`gray`（灰色地帶）旗標。
  - `console_state(img)` → 獨立判斷主控台開／關（`open`/`closed`/`unknown`）。
  - `is_tab_active(img, tab_name)` → 商店分頁（`shop_main`/`shop_aux`/`shop_equip`/`shop_item`/`shop_mshop`）目前是否被選取。
  - `python3 screens.py build-atlas --shots-dir <參考截圖目錄>` 重建 atlas；`classify` / `console` / `tab` 三個子指令可以單獨對一張圖片跑分類，方便除錯。
- `actions.py` — 參數化動作：`goto_shop`、`shop_tab(name)`、`back_to_lobby`、`open_console`、`close_console`、`console_cmd(text)`。每個動作＝送指令前先單張截圖檢查前置畫面（不符合就不送任何輸入）→ 呼叫 `pico_ctl.py`（沒改它的行為，直接照 README 的 CLI 呼叫）→ 用 `screens.py` 輪詢確認完成條件，逾時就回報失敗。`購買`／`送禮`等按鈕座標寫死擋掉（`FORBIDDEN_CLICKS`），就算實驗檔手滑寫錯座標也點不到。
- `runner.py run <experiment.json>` — 開 pico session → 檢查起始畫面 → 依序執行每一步 → **任何一步失敗或灰色地帶分類就整個停下**（送 `RESET`、結束 session，不重試、不繼續）→ 寫報告。`--dry-run` 只驗證檔案格式、印出每一步會做什麼，完全不送任何輸入、不開 session。

實驗檔格式（`experiments/*.json`）：`id`／`purpose`／`preconditions.screen`／`steps`（每步 `action` + `params`）／`stop_conditions.max_consecutive_failures`／`max_image_reviews`（**必須是 0**——這版 runner 沒有接模型，非 0 會直接判定檔案無效；欄位保留給以後真的要接模型審查的版本用）。

報告輸出在 `tools/pico/logs/reports/<id>-<時間戳>.json`（結構化：`build_event`、`precondition`、每步 `ok`/`gray`/`duration_s`/`detail`/`screenshot`/`score`、`anomalies`、`result`）與同名 `.txt`（人看的摘要）。`build_event` 是最新 `logs/session-*.jsonl` 裡最後一筆 `{ev:"build"}` 紀錄（伺服器啟動／`/reload` 寫的，見 `packetlog.js` 的 `recordBuild`）；找不到就在 `anomalies` 註明，不是致命錯誤。

```bash
python3 tools/pico/runner.py validate tools/pico/experiments/U-shop-tabs.json
python3 tools/pico/runner.py run tools/pico/experiments/U-shop-tabs.json --dry-run
python3 tools/pico/runner.py run tools/pico/experiments/U-shop-tabs.json   # 真的跑：會開 pico session、送輸入
```

已知限制／待審查（見這次任務的報告，交給主力）：
- `classify_screen` 目前只認得 `lobby`／`shop`／`console_open` 三種畫面，別的畫面一律回 `unknown`（等同灰色地帶，runner 會停）。
- `console_open` 只驗證過「主控台疊在大廳上面」這個組合（`f24-after.png`），疊在商店上面的畫面沒有參考截圖，分類器對那個組合的行為未驗證。
- `console_cmd(text)` 只實作了結構（前置檢查主控台開著、ASCII 檢查、TYPE+ENTER），完成條件是「主控台看起來還開著」，**不驗證指令是否真的執行**——刻意不去猜測任何 opcode 當文字訊號。目前沒有任何實驗檔用到它。
- 文字訊號目前只用 `pico:` marker（送出/被擋），沒有用任何協定層 opcode 當完成訊號，避免在不熟的封包上亂猜。
- 分類器的門檻是拿 2026-09-19 的參考截圖組互相比對出來的（同一批照片，不是獨立驗證集），實機截圖噪訊多大還沒有實測過。

---

## 常見問題排查

1. **序列埠自動偵測不到板子怎麼辦？**
   * 在 Windows 裝置管理員確認板子出現的 COM port 編號，然後用 `pico_ctl.py set_port COMx` 固定下來。
2. **如果 WiFi 沒連上怎麼辦？**
   * 沒關係，序列埠模式不需要 WiFi。板子即使沒連上 WiFi，也會自動持續監聽 USB CDC 序列埠（console）。
3. **需要安裝任何驅動程式嗎？**
   * 完全不需要。Windows 10/11 會自動載入原廠 USB HID 複合驅動與 CDC 序列埠驅動。
