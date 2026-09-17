# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## 目前交接快照（2026-09-17 晚，請以此段為準）

- **中階 Gemini（Antigravity）已完成 `docs/backlog.md` 契約任務 G1～G4（在 `flash-wip` 分支，全部標「待審」）：**
  - **G1（Assist_CN / Assist_SN）**：`journal/2026-09-17-15-assist-cn-sn-format.md`。Assist_CN 7b（攻擊者、被擊者、型別、Action、HP% 0..100）；Assist_SN ≥25b。核對組語並定位腳本 `Game_Assist` 與 `Game_User_Assist_Set`。
  - **G2（Death_SN 比對）**：`journal/2026-09-17-16-death-sn-format-verification.md`。Death_SN 0x51b 組語逐欄位核對；確認 `+0x15..+0x50` 全 0 會覆蓋擊殺者與受害者戰績；確認 AI 擊殺送 Death_SN 無害（觸發 HUD 擊殺廣播與任務目標），但切勿對 AI 排程 Respawn_SN。
  - **G3（遊戲內聊天廣播）**：`journal/2026-09-17-17-game-chat-broadcast-format.md`。Team（`0x00220507`）與 All（`0x00220509`）客戶端 handler 組語核對；確認是同 opcode 對稱廣播（258b body、雙空格切分字串）；`0x00220508`/`0x0022050a` 不存在於客戶端 dispatch。
  - **G4（Create_CQ 與地圖／難度機制）**：`journal/2026-09-17-18-create-cq-map-difficulty.md`。Create_CQ 67b 與 Map_Change_One_CQ 26b 組語逐欄位核對；分析 PvE 難度計算公式 `(MapIndex - 9001) / 3`；指出伺服器硬寫死 9001 導致選圖選難度失效之處與修改建議。
- **原始研究檔案**：存於 `docs/research/2026-09-17-backlog/{G1,G2,G3,G4}/`。
- **日誌索引**：已追加至 `docs/journal/INDEX.md` 條目 15～18（標「待審」）。
- **未改動任何伺服器程式與資料庫**，所有提交均在 `flash-wip` 分支。

- **下一步（給高階 Claude 審查契約）：**
  - 目標：審查 `flash-wip` 上的 G1～G4 分析結論與組語證據，決定是否合併至 `reverse-work` 並採納建議。
  - 範圍：`docs/journal/2026-09-17-15` 至 `18`、`docs/research/2026-09-17-backlog/`。
  - 交付：由高階裁定後更新 `docs/state.md`，並將合適之修改套用至伺服器程式碼。

- ✅ 2026-09-16 21:57 實測：Vanguard 手上已是正確的主武器「輕型來福機槍」，`Cannot use MOC_a` 消失（`shots/current-mission.png`）。死亡／重生正常。
- ✅ 2026-09-16 21:46 登入卡住已找到原因：客戶端拒收整包超過 **0x400 bytes** 的 frame（`ZNetwork.dll 0x107f8fad`）。36 筆 ItemInfo 是 1296 bytes，所以卡住。**不是**「只能有 24 個槽位」。`client.js` 現在遇到超大封包會警告並寫 marker。
- ✅ Table 4 已獨立重新解析核對（`Cache.Bin` 0x37456，32 筆）。
- ⬜ 待測：開火、副武器、推進器；以及大小和 slot 內容的單變數測試。步驟見 `docs/next-test.md`。
- ⚠️ 設計任何新封包前先算大小：**header + body ≤ 1024 bytes**。
- 已知不一致：4、5 號機在 Table 4 沒有推進器，但 DB 有給。見 `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md`。
