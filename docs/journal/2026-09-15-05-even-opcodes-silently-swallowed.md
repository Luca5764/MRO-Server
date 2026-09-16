# ⚠️ 六個 dispatch 都會靜默吞掉偶數 opcode

> 從 docs/opcode-ledger.md 第 294–307 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

每個 dispatch 都宣告整個命名空間並以 default 收尾，只對**奇數** opcode 回 `type+1` + 空 `EVENT_INFO`，偶數則什麼都不回。兩種情況都 `return true`，所以 `server.js` 永遠不會記為 unhandled。

奇數那種只是「回了一個沒有意義的答案」，偶數那種**會讓客戶端無限等待**——`0x00220234` 的卡死就是這樣來的，而當時 log 看起來完全正常。

**已修**：六個 dispatch（`ZGateGameDispatch`、`ZRoomDispatch`、`ZLobbyDispatch`、`ZGameDispatch`、`ZDispatch*` community、`ZGate*` social）的 default 都會寫 `fallback` 記錄，標明 opcode、body、以及回了什麼或沒回。沒回應的情況會在 console 直接警告。

`[TEST]` 5 項驗證通過，涵蓋奇數會回應、偶數不回應且觸發警告。

用 `node tools/slice.js <檔名> --unhandled` 一次列出所有「沒人真正理解」的封包。

---

