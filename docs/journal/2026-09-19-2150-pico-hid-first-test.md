# Pico 2 W 硬體輸入第一次測試

- 板子：Pico 2 W，CircuitPython 10.3.1（`raspberry_pi_pico2_w`），adafruit_hid（bundle 10.x 20260919），`tools/pico/code.py`，沒設 WiFi。Windows 認成 VID_239A PID_8162：HID 鍵盤＋滑鼠，console CDC 在 COM6。主控端走串口（`tools/pico/pico_serial.ps1`，commit 12e085c）；每次呼叫約 1.4–1.9 秒，大部分是 powershell.exe 啟動時間。
- ✅ [TEST] 桌面：`MOVE 100 50` 讓 Windows 游標從 (3643,514) 移到 (3894,639)，硬體輸入有進 Windows。🟡 移動量不等於指令值（+100→+251，反向 -100→-12），疑似 Windows 指標加速或操作者同時在動滑鼠；「推到左上角再相對移動」的點擊法不可靠，要改絕對座標 HID 或關掉指標加速後重測。桌面是兩台 2560×1440 並排。
- ✅ [TEST][SHOT] `shots/pico-chat.png`：遊戲大廳收到 Pico 的鍵盤輸入。`KEY ENTER` 打開聊天輸入框，`TYPE pico test` 被中文輸入法轉成「黑名」留在輸入框（第二個 ENTER 被輸入法拿去選字，沒有送出）。→ 遊戲接受 Pico 的硬體鍵盤輸入，XIGNCODE 沒有擋（這一次）。未經跨公司審查。
- 待辦：打字前要切成英文輸入（或讓操作者把遊戲的輸入法固定成英文）；滑鼠改絕對座標。
