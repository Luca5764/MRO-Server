# Pico 2 W 硬體輸入第一次測試

- 板子：Pico 2 W，CircuitPython 10.3.1（`raspberry_pi_pico2_w`），adafruit_hid（bundle 10.x 20260919），`tools/pico/code.py`，沒設 WiFi。Windows 認成 VID_239A PID_8162：HID 鍵盤＋滑鼠，console CDC 在 COM6。主控端走串口（`tools/pico/pico_serial.ps1`，commit 12e085c）；每次呼叫約 1.4–1.9 秒，大部分是 powershell.exe 啟動時間。
- ✅ [TEST] 桌面：`MOVE 100 50` 讓 Windows 游標從 (3643,514) 移到 (3894,639)，硬體輸入有進 Windows。🟡 移動量不等於指令值（+100→+251，反向 -100→-12），疑似 Windows 指標加速或操作者同時在動滑鼠；「推到左上角再相對移動」的點擊法不可靠，要改絕對座標 HID 或關掉指標加速後重測。桌面是兩台 2560×1440 並排。
- ✅ [TEST][SHOT] `shots/pico-chat.png`：遊戲大廳收到 Pico 的鍵盤輸入。`KEY ENTER` 打開聊天輸入框，`TYPE pico test` 被中文輸入法轉成「黑名」留在輸入框（第二個 ENTER 被輸入法拿去選字，沒有送出）。→ 遊戲接受 Pico 的硬體鍵盤輸入，XIGNCODE 沒有擋（這一次）。未經跨公司審查。
- 待辦：打字前要切成英文輸入（或讓操作者把遊戲的輸入法固定成英文）；滑鼠改絕對座標。

## 重測（操作者手離開滑鼠）
- ✅ [TEST] 三次 `MOVE 100 0` → `MOVE -100 0`：每次都是 +246／-246，完全重現；4 次 `MOVE 5 0` 共 +15。→ 是 Windows「增強指標準確度」（`HKCU\Control Panel\Mouse` MouseSpeed=1, T1=6, T2=10）的加速曲線。第一次的「-100→-12」是操作者同時在動滑鼠。
- ✅ [TEST][SHOT] `shots/pico-cursor-crop.png` 與 `shots/pico-hover-crop.png`：用「相對移動＋讀回 OS 游標位置」的閉迴路，2 次修正就把 OS 游標停在「建立房間」按鈕中心（螢幕 1751,286＝視窗 1000,205），按鈕出現滑過的亮起效果。→ 大廳 UI 跟著 OS 游標走，絕對座標 HID 可行；閉迴路相對移動現在就能用（每次修正約 2 秒）。截圖（CopyFromScreen）拍不到游標本身。
- 點擊還沒測（會改變遊戲狀態）。
