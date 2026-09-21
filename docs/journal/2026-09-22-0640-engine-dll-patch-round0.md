# 2026-09-22 06:40 第 0 輪：副本 `Engine.dll` 套候選 1b，客戶端沒有完整性檢查

## 背景

`2026-09-21-2230-netspeed-answer.md` 定案：`netspeed` 不會在對戰中跟房主重新協商，
房主每條連線的送出預算在加入當下就固定在 10000，而投射物的 `IsNetReady` 看的正是那個值。
要把預算推上去，只剩改房主那一份 `Engine.dll` 的路
（設計稿：`docs/research/2026-09-21-netspeed-host-patch/design.md`，候選 1b，PM 已核准 bytes）。

改客戶端二進位檔之前有一個 ⬜：**客戶端會不會檢查 `Engine.dll` 有沒有被動過。**
先前只知道副本的 `IpDrv.dll` 被修補是可容忍的，`Engine.dll` 沒人試過。
第 0 輪就是專門測這一格：只換檔、只開到登入畫面、不登入、不送任何輸入。

## 做了什麼

新增 `Metal Rage Online Server/tools/patch_netspeed_host.py`（子 agent 實作，中階）。
驗雜湊 → 逐 byte 比對三處原始值 → 備份 → 寫入 → 印新雜湊，預設 dry-run，有 `--restore`。
`--target` 必填無預設；basename 是主安裝時**硬拒絕、無旗標可繞**。

套用對象只有副本 `C:\Games\MetalRage Online 2\data\System\Engine.dll`。

## 證據

**[TEST] 修補結果（高階獨立驗證，不採用工具自己印的值；用另一支 python 重讀檔案）**

| | sha256 | `0x17f9b1` / `0x17f9b5` / `0x17f9b8` |
|---|---|---|
| 副本 current | `a007507d23ebdabe…` | `a0860100` / `9090` / `a0860100` |
| 副本備份 ×3 | `fc51fe1240ee3411…` | `08070000` / `7d07` / `08070000` |
| **主安裝 current** | `fc51fe1240ee3411…` | `08070000` / `7d07` / `08070000` |

`a0860100` = LE 0x000186a0 = 100000，`9090` = `jge` 被 NOP 掉。三處都是候選 1b 的值。
**主安裝維持原廠雜湊，沒有被碰到**（AGENTS.md 政策：修補只限副本）。
檔案大小三者皆 5390336，未變。

> 旁註：`C:\Games\鐵影特攻(MetalRage Online)\data\System\Engine.dll` 是**不同的 build**
> （size 5386240、sha256 `660cec0ce783b18d…`、那三個 offset 的內容完全不同）。
> 這份修補的 offset **不適用於它**，工具的逐 byte 比對會擋下來。不要拿這裡的 offset 去套它。

**[SHOT] `shots/round0-login.png`** —— `screens.py classify` 回 `name=login score=0.00`
（與登入畫面參考圖的 MAD 為 0，次佳 `lobby` 為 32.10）。
`launch` 回報 `READY pid=70704 hwnd=75825446 client=1600x1200`。

**[LOG] `C:\Games\MetalRage Online 2\data\System\run-64919.70.log`**（執行中檔案被獨佔鎖住，
用 `tools/win/logwatch.sh` 從 log 視窗 `WM_GETTEXT` 摳出，107 行）：

- `Init: Base directory: C:\Games\MetalRage Online 2\data\System\` ← 確認是副本這一份
- `Init: Version: 3369 (134.29)`
- 走到 `ScriptLog: START MATCH` 並停在 `>`（＝登入場景已載完）
- 全檔只有 4 條 warning，全是素材／材質類（`Missing FinalBlend`、`Missing MeshNormalShader`、
  `Material''None'呼叫失敗`、`NULL 呼叫失敗': 找不到封包名稱`），
  **沒有任何 checksum／integrity／tamper／XIGNCODE 相關訊息**

## 結論

✅ **客戶端對 `Engine.dll` 沒有啟動期完整性檢查**（未經跨公司審查）。
修補過的 `Engine.dll` 可以正常載入並走到登入畫面。

範圍要講清楚，不要外推：
- 這只證明**啟動到登入畫面**這一段沒有被擋。登入之後、進戰場之後會不會有別的檢查 ⬜。
- 這是副本安裝、XIGNCODE 狀態照舊。沒有測主安裝，也沒有打算測。
- 沒有驗證修補**有沒有達到預期效果**（房主端預算變成 100000）——那是第 1 輪的事。

## 順帶測到的

**[TEST] `CLOSE_WINDOW` 這次收斂成功**：3549.1 ms、落在 screen(1819,216)，行程在 20 秒內退出。
`2026-09-21-2120-dual-pico-bc.md` 記的那次收斂失敗（12 次都停在 y=232、要操作者手動關）
因此**不是系統性問題**，成因仍 ⬜，但不必當成阻塞。

## 操作紀錄

還原指令：

```
python3 "Metal Rage Online Server/tools/patch_netspeed_host.py" \
  --target "/mnt/c/Games/MetalRage Online 2" --restore
```

副本目錄裡有三份 stock 備份（`.bak-netspeed`、`.bak-netspeed-host-20260922-064357`、
`.bak-netspeed-host-20260922-064503`），內容一致，暫不清理。
