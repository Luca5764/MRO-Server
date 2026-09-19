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
可使用既有的 `pico_drive.sh`（介面與原本的 `drive.sh` 完全一致）：

```bash
# 按鍵
tools/win/pico_drive.sh key F5           # 按下並放開 F5 (準備/開始)
tools/win/pico_drive.sh key ENTER        # 按下 Enter (登入)

# 按住按鍵 (戰鬥中移動/開火)
tools/win/pico_drive.sh press W 2000     # 前進 2 秒
tools/win/pico_drive.sh press SPACE 300  # 跳躍

# 點擊 (以 MetalRage 遊戲視窗為基準座標)
tools/win/pico_drive.sh click 512,300

# 打字 (發送聊天室 marker)
tools/win/pico_drive.sh type "test automated marker"
```

### 一次送出多個指令（batch）
因為每次呼叫 `powershell.exe` 都要付開機成本，需要連續送多個原始指令時用 `batch`，同一次 PowerShell 呼叫裡送完：

```bash
python3 tools/pico/pico_ctl.py batch "PING" "KEY F5" "PRESS W 1500"
```

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

## 常見問題排查

1. **序列埠自動偵測不到板子怎麼辦？**
   * 在 Windows 裝置管理員確認板子出現的 COM port 編號，然後用 `pico_ctl.py set_port COMx` 固定下來。
2. **如果 WiFi 沒連上怎麼辦？**
   * 沒關係，序列埠模式不需要 WiFi。板子即使沒連上 WiFi，也會自動持續監聽 USB CDC 序列埠（console）。
3. **需要安裝任何驅動程式嗎？**
   * 完全不需要。Windows 10/11 會自動載入原廠 USB HID 複合驅動與 CDC 序列埠驅動。
