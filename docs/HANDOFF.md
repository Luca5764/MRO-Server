# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## 目前交接快照（2026-09-17，請以此段為準）

- **本輪收尾（依操作者指示停止）：** 任務 1 已完成並 commit；任務 2 以 wip 保存，未完成完整 body 定義。沒有繼續 DLL 調查或開新子 agent；程式、測試設定、操作者剛提交的規則／Codex 設定均未改，不 push。
- **ItemInfo：** `journal/2026-09-17-03-iteminfo-accumulation.md`。✅ [DLL] 不同實例 key 追加、同 key 替換單筆；斷線完成／初始化會清庫。待 Claude 審查，分包尚未實測。
- **ChangeSlot：** `journal/2026-09-17-04-changeslot-body-wip.md`。🟡 WIP：已核對主要欄位、slot／socket 寫入與後續呼叫；`+0x06..+0x09`、精確總長及腳本效果仍 ⬜；子 agent 的負搜尋結果未獨立覆核。
- **分析交接契約（由 Claude 接手）：**
  - 目標：審查上述兩篇的結論與證據，裁決 wip 未完成項。
  - 範圍：兩篇日誌、各自 research、對應 state 格；不動 handler。
  - 背景：任務 1 已有追加／替換結論；任務 2 因操作者收尾指示停止。
  - 限制：沒有新實測；保留未知，不能以負搜尋斷言格式不存在。
  - 交付：審查／更正日誌與對應 state 更新。
  - 完成條件：每個採用結論能對回 DLL 位址；未完成 body 格式保持 WIP。

- **紀錄結構已改（2026-09-17）：** 現況看 `docs/state.md`，歷史看 `docs/journal/`（索引 `INDEX.md`）。`opcode-ledger.md` 已凍結。規則在 `AGENTS.md`。
- **下一步（契約）：**
  - 目標：完成 `docs/next-test.md` 的測試 A（開火、副武器、推進器）。
  - 範圍：操作者實測，AI 讀 session 紀錄、`MetalRage.log`、截圖。
  - 背景：主武器掛載與重生已驗證；開火、副武器、推進器仍待觀察。
  - 限制：測試 A 期間不改任何程式碼。
  - 交付：一篇日誌，記錄每個動作對應的 opcode 與客戶端 log；由高階更新 `state.md` 第 4 節。
  - 完成條件：三個動作各有明確的「有／沒有新封包、有／沒有錯誤 log」結論。

- ✅ 2026-09-16 21:57 實測：Vanguard 手上已是正確的主武器「輕型來福機槍」，`Cannot use MOC_a` 消失（`shots/current-mission.png`）。死亡／重生正常。
- ✅ 2026-09-16 21:46 登入卡住已找到原因：客戶端拒收整包超過 **0x400 bytes** 的 frame（`ZNetwork.dll 0x107f8fad`）。36 筆 ItemInfo 是 1296 bytes，所以卡住。**不是**「只能有 24 個槽位」。`client.js` 現在遇到超大封包會警告並寫 marker。
- ✅ Table 4 已獨立重新解析核對（`Cache.Bin` 0x37456，32 筆）。
- ⬜ 待測：開火、副武器、推進器；以及大小和 slot 內容的單變數測試。步驟見 `docs/next-test.md`。
- ⚠️ 設計任何新封包前先算大小：**header + body ≤ 1024 bytes**。
- 已知不一致：4、5 號機在 Table 4 沒有推進器，但 DB 有給。見 `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md`。
