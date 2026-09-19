# 客戶端（逆向對象）

> 參考文件，需要時才讀。規則與陷阱摘要在 `AGENTS.md`。
> 2026-09-17 從 `AGENTS.md`「客戶端（逆向對象）」 原文搬來。

## 客戶端（逆向對象）

完整筆記見 `docs/client-notes-upstream.md`（上游 Win11 Fix 附的文件原文，非我們自己的發現）。以下是對逆向工作影響最大的幾點。

### 啟動與連線

客戶端的伺服器位址**同時**由命令列參數與 ini 決定：

```
MetalRage.exe -globalid=TW&ip=127.0.0.1&port=9211&age=30
```

`globalid=TW` 就是台版（鐵影特攻）。另外 `MetalRage.ini` 與 `Default.ini` **兩個檔案都**要設 `ServerIP`，原廠預設值是 `172.31.23.56`，不改會連錯地方。

客戶端原本會連的網域：`mr.wasabii.com.tw`、`patchmr.wasabii.com.tw`、`loginmr.wasabii.com.tw`。Wasabii 就是台灣代理商紅心辣椒——這也解釋了為什麼登入 opcode 叫 `CQ_LOGIN_WASABII`。

### ⚠️ 保護機制決定了哪些逆向手段可行

客戶端有四層保護，這直接限制了「能不能動態觀察客戶端」：

| 層 | 內容 | 對我們的意義 |
|---|---|---|
| y0da Protector v1.03 | 監控 `MetalRage.exe` 整個 `.text` 的 CRC | **改 `.text` 任何一個 byte → 約 5 秒後崩潰** |
| Themida ×2 | 保護 `ZNetwork.dll`（2009 層 import 虛擬化 + 2010 層完整性檢查） | 我們的 opcode 名稱來源就是這個 DLL，靜態分析困難 |
| xsign | 攔截遊戲行程內的檔案建立 | 想讓客戶端自己吐 log 不可行 |
| Anti-Attach | 阻擋執行期附加除錯器 | **不能直接 attach debugger** |

**可行的切入點**（文件明列為 safe）：vtable／data patch、DLL hook（掛在companion DLL，不要碰 `MetalRage.exe`）、`VirtualAllocEx` 的 shellcode cave。

> y0da 的監控執行緒**不要砍**——文件明講停掉它們反而會崩潰。

這些合起來解釋了為什麼這個專案只能從伺服器端觀察封包：客戶端那側幾乎所有常規手段都被擋住了。**伺服器 log 就是我們唯一的窗口**，這也是為什麼封包紀錄值得做得這麼講究。

> **主力客戶端目前是原廠狀態（XIGNCODE 啟用）。** 2026-09-19 23:54 到 2026-09-20 00:50 之間曾用 `ZNetwork.dll` 1-byte patch 停用 XIGNCODE，但修補後軟體輸入（drive.sh）與 taskkill 仍然無效（[TEST] journal 2026-09-19-2350 末段、2026-09-19-2230），沒有已驗證的好處，操作者同意還原；修補版留在 `data\System\ZNetwork.dll.patched`。那段時間的 session log 要跟其他時段分開看。y0da（`MetalRage.exe` 反除錯、`.text` CRC）一直都在，不受影響。AI 操作遊戲走 Pico（`tools/pico/`）。

## 第二份客戶端：台版舊版本（2026-09-19 取得）

- 位置：`C:\Games\鐵影特攻(MetalRage Online)`（WSL：`/mnt/c/Games/鐵影特攻(MetalRage Online)`），約 1.9 GB。操作者從巴哈 2022 年的分享下載。
- 版本比我們主力用的 `C:\Games\MetalRage Online` 舊：`ZNetwork.dll`、`Core.dll`、`Engine.dll` 都是 2010-09-05 版（主力是 2010-11 版），`MetalRage.exe` 2010-07-20 原版，`Build.ini` Label `MR_Build_[2009-12-10_09.30]`。
- `Cache.Bin` 2010-09-05，439516 bytes，和主力的不同（sha1 前綴 `1f0284ed29bb` vs `704275e19f09`）。
- `MetalRage.ini` 的 `ServerIP=172.31.23.56`（內網位址）、`ServerPort=9211`、`GamePort=30907`，和主力相同。
- `data/Log/MetalRage.log` 是空的；`xigncode.log`（2010-08-04）內容是加密或二進位，讀不出東西。
- 用途：只當參考資料，拿來對照舊版 DLL、Cache.Bin 和 UnrealScript 的差異（例如駕駛員代碼、頭像、台版中文字串）。**不要拿來連我們的伺服器**，協定可能不同，除非另外確認過。
