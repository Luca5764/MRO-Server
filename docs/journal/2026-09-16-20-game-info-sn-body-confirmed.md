# `Game_Info_SN` (0x00222111) body ✅ 已確認 [DLL]

> 從 docs/opcode-ledger.md 第 1471–1500 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

來源:`ZDispatchGame::Game_Info_SN` thunk `0x107079af` → `0x107d4f50`。
**參數順序取自組語,不是反編譯器**——Ghidra 在這個呼叫上把 p2/p3 與 p8/p9 對調了。

| body | 型別 | → `Game_Info_Set` | → 欄位 |
|---|---|---|---|
| +0x00 | u32 | p1 | `[0xfc0]` battle index |
| +0x04 | u16 | `Game_Info_Team_Set` p1 | `[0xffc]` → `[0xff0]` 紅隊值 |
| +0x06 | u16 | `Game_Info_Team_Set` p2 | `[0x1000]` → `[0xff4]` 藍隊值 |
| +0x0A | u16 | p4 | `[0xfe0]` |
| +0x0C | u16 | p5 | `[0xfe4]` |
| +0x0E | u8 | p2 (bool) | `[0xfc4]` bit0 |
| +0x0F | u16,取 `== 2` | p3 (bool) | `[0xfc4]` bit1 |
| +0x11 | u16 | p6 | **`[0xfc8]` MAP ID** |
| +0x13 | u16 | p7 | **`[0xfd4]` TimeLimit,單位分鐘** |
| +0x15 | u8 | p10 | `[0xfd0]` GoalScore,模式 4/6/7 |
| +0x16 | u16 | p8 | `[0xfd8]` GoalScore,模式 0/1 |
| +0x18 | u16 | p9 | `[0xfdc]` GoalScore,模式 5 |

模式 `[0xfcc]` **不是**這個封包給的,而是 `Game_Info_Set` 依 map id 去 Cache.Bin 該筆
記憶體結構的 `+0x18`(int index 6)取得。Cache.Bin 在磁碟上是變長格式(map 1011 該欄是
`"S"`、9001 是 `"S0b"`),沒辦法用固定 stride 讀出來,所以伺服器改成**三個 GoalScore 欄位
寫同一個值**,哪個模式都對。

**先前的錯誤**:`+0x13` 寫的是 `quarterIndex = 1`,那正是 TimeLimit,所以 URL 出現
`TimeLimit=1`,60 秒後回合結束並開始 `Timeout_CN` 洪水。已改為 10。

---

