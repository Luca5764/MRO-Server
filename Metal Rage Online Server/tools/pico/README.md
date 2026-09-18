# Raspberry Pi Pico 2 W 硬體 USB HID 自動化指南

這套工具使用 **Raspberry Pi Pico 2 W（RP2350）** 作為實體 USB 鍵盤與滑鼠控制器。

因為指令是由微控制器硬體透過物理 USB 傳輸線發出，Windows 核心與 XIGNCODE 只能看到標準的物理 USB 裝置（真實硬體 VID/PID、標準 HID 報告），**完全不觸發反作弊軟體模擬輸入阻擋（`LLKHF_INJECTED`）**，完全合乎 `AGENTS.md` 規則。

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

### 3. 複製控制器主程式與 WiFi 設定
1. 將本專案中的 `Metal Rage Online Server/tools/pico/code.py` 複製到 `CIRCUITPY/` 根目錄（取代既有的 `code.py`）。
2. 將 `settings.toml.example` 複製到 `CIRCUITPY/settings.toml`，並用文字編輯器填寫家中的 WiFi 帳號與密碼：
   ```toml
   WIFI_SSID = "你的WiFi名稱"
   WIFI_PASSWORD = "你的WiFi密碼"
   HTTP_PORT = 8080
   ```
3. 存檔後板子會自動重啟。板子上的綠燈或 Serial 會顯示連線成功取得的 IP（例如 `192.168.1.50`）。

---

## 主控端（WSL2 / Linux）使用方式

### 1. 綁定 Pico IP
只需設定一次，IP 會自動被記在 `tools/pico/.pico_ip`：
```bash
python3 tools/pico/pico_ctl.py set_ip 192.168.1.50
```

### 2. 測試連線（Ping）
```bash
python3 tools/pico/pico_ctl.py ping
# 預期輸出: [PICO PONG] PONG uptime=12.5s mem_free=184320B (15.2ms roundtrip)
```

### 3. 透過命令列操作遊戲
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

---

## 常見問題排查

1. **如果 WiFi 沒連上怎麼辦？**
   * 板子即使沒連上 WiFi，也會自動持續監聽 USB CDC 虛擬串口（COM Port）。
   * 在 Windows 裝置管理員中確認 COM Port 編號，亦可透過串口直接下送命令。
2. **需要安裝任何驅動程式嗎？**
   * 完全不需要。Windows 10/11 會自動載入原廠 USB HID 複合驅動。

