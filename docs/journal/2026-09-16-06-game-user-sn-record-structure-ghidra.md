# ✅ `0x00222112` Game_User_SN 記錄結構（Ghidra 反編譯）

> 從 docs/opcode-ledger.md 第 1003–1034 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。`ZDispatchGame::Game_User_SN`（`0x107d8ae0`）：body 為 2 bytes 標頭（`0x00` 旗標、`0x01` 筆數），記錄自 `body+0x02` 起、每筆 `0x1E5`，整筆 `memcpy` 後逐欄使用。

由堆疊變數佈局還原的記錄欄位：

| 記錄 | 型別 | 備註 |
|---|---|---|
| `0x00` | uint16 | |
| `0x02` | uint16 | |
| `0x04` | uint32 | |
| `0x0C` | int | |
| `0x10` | int | |
| `0x14` | int | |
| `0x18` | int | |
| `0x1C` | char[2] | 等級文字，以 `atoi()` 解析 |
| `0x1E` | char[25] | **暱稱**，ASCII，經 `winToUNICODE` 轉寬字串 |
| `0x37` | char[29] | 第二個字串（公會名？），同樣經 `winToUNICODE` |
| `0x54`~ | int ×7 | |
| `0x70` | byte | |
| `0x75` | int[92] | 368 bytes，至 `0x1E5` 結束 |

我方既有實作前半段（至 `0x37`）大致吻合，差異：

- 我方在 `0x08` 寫 pilotId，反編譯**看不到該欄位**（`0x04` 與 `0x0C` 之間為空）
- 我方 `0x37` 視為 25 bytes，反編譯為 **29 bytes**
- 我方尾段為 `0x6C` byte + `0x6D` 起的陣列；反編譯為 **`0x70` byte + `0x75` 起的 int[92]**，差 4 bytes

> 堆疊變數佈局是 Ghidra 的推論，仍有對齊造成偏差的可能。**在有真正的對戰可送之前，此封包維持停用**（`GAME_USER_BOOTSTRAP_MODE = 'disabled'`）。

---

