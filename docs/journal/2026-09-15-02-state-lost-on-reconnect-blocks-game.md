# ⚠️ 阻塞 `0x25xxxx` 的真正原因：狀態活不過重連

> 從 docs/opcode-ledger.md 第 209–234 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。這是為什麼對戰封包一直挖不出來——**對戰從來沒有被觸發過**，不是封包難解。

`gameStarted_` 由 `0x00240301`（`room.dispatch.js`）或 `0x00222103`（`gate.game.dispatch.js`）設定，而它掛在 `NetworkClient` 實例上，也就是綁在單一 TCP 連線上。但客戶端切換到遊戲地圖時會**整個斷線重連**（原廠是 `ClientTravel` 到 `IP:Port/MapName`）。

實際觀察到的序列：

```
166.742s  conn 2  CONNECT 30907
276.703s  conn 2  C-->S 0x00222103   gameStarted_ = true（在 conn 2 上）
330.084s  conn 2  CLOSE              狀態隨連線消滅
386.842s  conn 3  CONNECT 9211       客戶端重新登入
386.941s  conn 4  CONNECT 30907
387.585s  conn 4  C-->S 0x00250102   新物件，gameStarted_ === undefined
387.585s  conn 4  S-->C 0x00250103   → 回大廳 ACK，而非 Ready_Host_SQ
```

`game.dispatch.js` 的 `0x00250102` 分支只在 `client.gameStarted_` 為真時送 `Ready_Host_SQ` 開始對戰流程。重連後該旗標必為 falsy，所以永遠走大廳分支。

操作者在此期間於遊戲內死亡，**伺服器收到 0 個封包**——客戶端不認為自己在一場伺服器管理的對戰裡。

**待決定：** 要讓對戰能開始，per-connection 狀態必須改為以帳號為鍵、能跨重連存活。這是架構性改動，依 CLAUDE.md 原則 #4 需先討論。

---

