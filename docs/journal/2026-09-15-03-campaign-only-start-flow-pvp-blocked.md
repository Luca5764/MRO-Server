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


## 更正（2026-09-22）：本篇的診斷已經不是 live 路徑

本篇說「開戰後的每一個步驟都以 `campaignStarted_` 為前提」，並列了四個函式。
**那四個函式在現行組態下永遠不會執行。**

`SERVER_DRIVEN_START_MODE`（`gate.game.dispatch.js`，硬編碼 `'enabled'`，
`reference/switch-audit.md` 標「D 暫不動」）在 `case 0x00222103` 內提早 `return true`，
**那四個閘門與它們的呼叫點全部在這個 return 之後**。真正 live 的開戰序列是
`SERVER_DRIVEN_START_MODE` 自己那條分支，它**完全不看 `campaignStarted_`**，
不分房型都會無條件送出 `Game_Wait_SN`／`Game_User_SN`／`Game_Info_SN`。

所以 PvP 房開戰走不通的**實際**原因只有兩個（`research/2026-09-22-d2-tdm/pvp-start-gap.md`）：

1. `MAP_INFO_REAL_IDS` 只有 PvE 的 9001–9012，**從沒送過任何 PvP 地圖 id**
   → 客戶端 `Account_MapList_Check` 擋掉 PvP 地圖選單（`map-info.sender.js:20`）。
2. `campaignMapCacheKey_` 在建房時**不分房型無條件退回 9001**
   → 就算其他都對，送過去的還是 PvE 地圖（`gate.game.dispatch.js:1263-1267`）。

兩者都已在 `PVP_START_FLOW_MODE`（預設關閉）後面補上，
見 `journal/2026-09-22-2015-pvp-start-flow.md`。

**教訓**：本篇寫於 2026-09-15，`SERVER_DRIVEN_START_MODE` 是之後才加的。
引用舊日誌的診斷前，要先確認它描述的路徑現在還走不走得到。
2026-09-22 的 PvP 契約就是整份建立在這個過時前提上（派工的是高階）。
