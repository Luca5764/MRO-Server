# 開戰流程目前只支援戰役房（PVP 走不通）

> 從 docs/opcode-ledger.md 第 235–269 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。session 狀態修好之後的第一次實測。

操作：建立 **PVP 房** → 按開始。觀察到：

```
122.992s  C-->S 0x00222103 (5b)  270a000000     按下開始
122.993s  [auto] gameStarted_ false -> true     狀態正確設定
123.393s  S-->C 0x00222102 (6b)                 Game_Ready_SN
123.495s  S-->C 0x00222104 (6b)                 Game_Start_SN
          （之後伺服器與客戶端皆無任何動作）
```

當下的 client 狀態：`gameMode=0`、`roomType=2`、`isTrueCampaign=False`、**`campaignStarted=False`**。

`campaignStarted_` 的判定是 `rawRoomType_ === 1 || gameMode_ === 4 || gameMode_ === 5`，PVP 房三個條件都不成立。而 `gate.game.dispatch.js` 裡開戰後的**每一個**步驟都以它為前提：

| 函式 | `campaignStarted_ === false` 時 |
|---|---|
| `scheduleGameInfoSnExperiment` | 直接 return |
| `primeReadyHostHandshake` | 直接 return |
| `scheduleGameWaitSnExperiment` | 直接 return |
| `schedulePostGameWaitReadyHost` | 直接 return |

其中 `Game_Info_SN` 最關鍵——程式碼註解明載客戶端要從它讀 mapId 才能決定 `ClientTravel` 的目標地圖。沒有它，客戶端收到 `Game_Start_SN` 也不知道要去哪裡，所以停在原地。

**結論：要取得戰鬥封包，必須開戰役房，不是 PVP。** PVP 的開戰路徑尚未實作，不是壞掉。

⬜ 另外觀察到：PVP 房內按「選擇地圖」**不產生任何封包**，地圖清單是空的。地圖清單從何而來、是否與房型有關，未查。

⬜ 建房請求 `0x00220201` body 開頭：`02 10 63 1b 03 00 02 00 00 00 00 01 05 00 00 00`（PVP、roomType=2）。與戰役房的對應 body 比對後應可定出房型欄位的位置。

---

