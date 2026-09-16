# 本輪伺服器改動(一次改兩項,但可分辨)

> 從 docs/opcode-ledger.md 第 1566–1584 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

1. `Game_Info_SN` 的 `+0x13` 由 `quarterIndex=1` 改為 `timeLimitMinutes=10`,
   GoalScore 三格同時寫 0。
2. `Game_User_SN` 由 disabled 改 enabled,並從 `room.dispatch.js` 的房間狀態
   (場景 5,handler 必定丟棄)移到 `gate.game.dispatch.js` 的 server-driven 序列,
   在 `Game_Wait_SN` 之後 60ms 送出(場景 6),早於 450ms 的 `Ready_Host_SQ`。

ledger 的「一次只改一個變數」原則在此是有意放寬的:兩項的觀察特徵互斥且各自獨立——
第 1 項只會表現在 URL 的 `TimeLimit=` 與 `Timeout_CN` 是否洪水,
第 2 項只會表現在 URL 的 `team=` 是 0 還是 255、以及是否出現選機體畫面。
任一項失敗都能單獨歸因。

### 下一次測試要看的三件事
- `MetalRage.log` 裡 travel URL 的 `team=` — 應為 `0`,不再是 `255`
- 同一行的 `TimeLimit=` — 應為 `10`
- 進圖後是否出現選機體畫面;若出現,客戶端應送 `ChangeSlot_CN 0x00230101`
  (目前無 handler,會落到 unhandled logger 並 dump body)

