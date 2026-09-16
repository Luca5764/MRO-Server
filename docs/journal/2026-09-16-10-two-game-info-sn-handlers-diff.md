# 兩個 `Game_Info_SN` handler，差別在有沒有清資料

> 從 docs/opcode-ledger.md 第 1116–1132 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。opcode `0x00222111` 有**兩個** handler，依場景啟用（各自開頭檢查 `*(this+4)`）：

| Handler | 位址 | 是否呼叫 `Game_Data_Clear` |
|---|---|---|
| `ZDispatchWaiting::Game_Info_SN` | `0x107f0910` | **是** |
| `ZDispatchGame::Game_Info_SN` | `0x107d4f50` | 否 |

**兩者都從 `body+0x11` 取地圖 ID**（傳給 `Game_Info_Set` 的參數順序不同，但落點同為 `[0xfc8]`）——我方封包內容正確。

在房間場景送出會白畫面，推測是 `ZDispatchWaiting` 版本被啟用並清空了遊戲資料。

**目前策略**：改在收到 `0x00222103`（開始請求）時**同步、第一個**送出，不再延遲 350ms。若 `ZPage_Room` 是在送出請求的當下就組 URL、不等任何回應，則從伺服器端無法補救，地圖必須以其他途徑抵達客戶端。

---

