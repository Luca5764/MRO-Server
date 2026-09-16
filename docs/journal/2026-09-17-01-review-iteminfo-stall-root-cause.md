# 2026-09-17 覆核：21:40–21:58 的實測結果，以及 ItemInfo 卡死的真正原因

> 從 docs/opcode-ledger.md 第 1738–1781 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

### ✅ 武器掛載修正已生效
- ✅ 已確認 [SHOT] `shots/current-mission.png`（21:57）：Vanguard、DEFENSE 280，右下 HUD 主武器「輕型來福機槍」，彈藥 080/0720。
- ✅ 已確認 [LOG] 同一輪 `MetalRage.log` 不再出現 `Cannot use Map_PC01.MOC_a`。
- ⬜ 未確認 [OBS] 左鍵是否真的能開火、左右副武器是否掛上、Shift 推進器。截圖只證明主武器 actor 存在。

### ✅ Table 4（DefaultSetList）以獨立解析重新核對
- ✅ 已確認 [CACHE.BIN] 在 `Cache.Bin` file offset `0x37456` 起，32 筆、stride 0x1C、7 個 LE int32。前一段記錄的 8 台一代機配裝**逐筆相符**。另有 8 台二代機（`11200101`…`18200101`），主副武器與推進器和對應一代機相同，只有塗裝不同。
- ⚠️ 更正 [CACHE.BIN] 第二欄先前稱為 `Level`，實際每台機體都只有 1、2 兩筆，其餘欄位完全相同。語意未知（有可能對應 pilot 101/102，屬**猜測**）。
- ⚠️ 不一致 [DB] Table 4 中 4 號機（判官）、5 號機（聖戰士）的 Booster 是 0，6、7 號機的 SubRight 是 0；但 `db.js` 的 `starterLoadouts` 和目前 account 2 的資料都給 4、5 號機推進器（`41100101`／`41200101`）。是否會造成掛載問題**未測**。
- ⚠️ 降級 [LOG] 前文「MOC_a 是 Medium/Heavy 專用」只有 `Small Cannot use` 這行 log 支持，能確定的只有 Small 不能裝。改為 🟡 假設。
- ⚠️ 降級 前文「根因 3：缺 slot 3 導致副武器掛載失敗」未經驗證。`Game_User_SN` 在 DB 沒有 slot 3 時會用 Table 4 的 `31100101` 補上，所以 slot 3 缺不缺未必是原因。改為 🟡 假設。

### ✅ 21:46 登入卡住的原因：客戶端拒收超過 0x400 bytes 的 frame
- 背景：commit `9b1ce3c` 讓 ItemInfo 帶 slot 3／5，共 36 筆（body 1280 bytes，整個 frame 1296 bytes）。`session-20260916-214146.jsonl` 裡客戶端收到後完全不前進：沒有連 30907，只剩 keepalive，約 40 秒後斷線，重登一次結果相同。之後 commit `5627c5b` 把配裝縮回 slot 1／2／4（24 筆、frame 864 bytes）就恢復正常。該 commit 把原因寫成「只允許 24 個標準槽位」。
- ✅ 已確認 [DLL] 客戶端 frame 驗證函式 `0x107f8e00`（接收迴圈 `0x107fa57a` 呼叫）解碼 header 後：
  ```
  0x107f8f93  mov ax, word ptr [edi+6]   ; 長度欄位，byteswap 成 BE
  0x107f8f9f  cmp eax, [esp+0x28]        ; > 目前已收 bytes → 失敗
  0x107f8fad  cmp eax, 0x400             ; > 1024 → 失敗
  0x107f8fb2  ja  0x107f9085
  ```
  失敗時接收迴圈直接跳出（`0x107fa581 je 0x107fa5f6`），資料留在緩衝區、永遠不被消化。這條連線上之後的所有封包也跟著卡住，與觀察到的現象完全一致。接收緩衝本身是 0x1000（`0x107f97b2 mov edi, 0x1000`），不是限制來源。
- ✅ 已確認 [LOG] 全部 31 個 session 中，伺服器送出的最大 frame 是 848 bytes body（ItemInfo 24 筆）。唯一超過 0x400 的就是 21:46 那兩次，也就是唯一卡住的兩次。
- 🟡 結論（強假設）：卡住的原因是**封包大小**，不是 slot 3／5 的內容。兩個變數在那次是一起改的，要單變數實測才能完全排除（見 `docs/next-test.md`）。
- ⚠️ 連帶疑點：`account.dispatch.js` 與 `gamelogin.dispatch.js` 註解說「body rows (part_slot=0) 放進 ItemInfo 會斷線」，這是 upstream `e01f1bb` 留下的，沒有紀錄。24 筆裝備加 8 筆本體＝32 筆＝frame 1142 bytes，同樣超過 0x400。**這條舊結論很可能也是同一個大小限制**，未驗證。
- 推論：ItemInfo 單包最多 28 筆（16 + 6 + 35×28 = 1002，補齊到 1008）。要送更多就必須分包。`ItemInfo_SN`（`0x107095c0`）逐筆呼叫 `Item_Add`，handler 本身沒有清空清單的動作，所以分包**可能**會累加。`Item_Add` 內部是否去重或清空未查。
- 🔧 [CODE] `client.js` 的 `send()` 遇到超過 0x400 bytes 的 frame 時，會在 console 印錯誤，並寫一個 `src: auto` marker。**送出的 bytes 完全沒變**，只是讓這類問題不再無聲無息。已用假 socket 離線驗證：1296 bytes 會觸發、864 bytes 不會。

### 🟡 `Assist_CN 0x00230121` 首次出現
- ✅ 已確認 [LOG] `session-20260916-215019.jsonl` 有兩段 Assist_CN 連發，每段緊接一個 `Death_CN`（type 3，環境死亡）：
  ```
  392.6s  00 00 02 00 04 01 50
  392.9s  00 00 02 00 04 01 3c
  393.6s  00 00 02 00 04 01 28
  394.6s  00 00 02 00 04 01 14
  394.9s  00 00 02 00 04 01 00   → 同一刻 Death_CN 0000020003000000000000
  ```
  第二段（460.7s）是從 0x28 開始，一樣遞減到 0 後死亡。
- ✅ 已確認 [DLL] `Assist_CN`（`0x107060eb`）的 body 是 `+0 u16`、`+2 u16`（用 `Game_User_Check` 檢查的 user index，這裡是 2＝自己）、`+4 u8 type`（原值 1–4 直接照送，其他值會重新對應）、`+5 u8`（參數為 1 時送 1，否則送 2）、`+6 u8` 數值。只有 host 且遊戲進行中才會送出。Ghidra 的參數名稱可能錯位，**以 offset 為準**。
- ✅ 已確認 [DLL] `Assist_SN`（`0x1070a425`）：status／error 必須都是 0，接著讀 `+0x0A u16 userA`、`+0x0C u16 userB`、`+0x11/+0x13` 與 `+0x15/+0x17` 兩組數值，分別呼叫 `Game_User_Assist_Set`。後者依 user key 找到 `[this+0x1034]` 表，把數值累加到分數與統計欄位。
- 🟡 [TEST] 目前的 handler（`lobby.dispatch.js` 的 case `0x00230121`，註解還寫著舊猜測「Lobby Leave」）回的是 6 bytes 的零 body。依上面的讀法，userA／userB 都是 0，只會對 key 為 0 的使用者加 0，**實際上沒有作用**，客戶端也沒有異常。
- 🟡 假設：數值每次減 20、減到 0 就死亡，看起來像某種倒數或耐久（例如離開戰區警告），不像一般的助攻計分。沒有對應的操作 marker，**未確認**。decompile 輸出存於 `docs/research/2026-09-17-assist/`。
