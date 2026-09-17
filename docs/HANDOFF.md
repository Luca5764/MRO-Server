# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## 目前交接快照（2026-09-17 21:30，Claude 高階，請以此段為準）

### 今天完成的（全部已實測，細節看各篇日誌）

| 項目 | 日誌 |
|---|---|
| 客戶端腳本包 `.tzp` 離線解密，UnrealScript 原始碼可讀（`~/mro-decrypted/src`，**不 commit**，用 `tools/tzp-extract.py` 重建）；class 預設值用 `tools/uetool`（UELib 需套 `tools/uetool/uelib-metalrage.patch`） | `2026-09-17-07`、`-09` |
| PvE 按鍵失效根因：`Grade_Info_SN 0x00510101` 送 11＝開發者權限 → 套 GM 按鍵表；改送 0。`DefaultInfo_SN` 那個欄位其實是 UserType（性別），不是權限 | `-11`（更正 `-08`） |
| PvE 回合沒啟動：`Game_Info_SN` body+0x15 是 MapInfo.Round，原本送 0；改送建房的 PlayRound。附 GAME_INFO 完整偏移 | `-12` |
| 伺服器切 frame bug（補齊到 16 吃掉下一個封包 → 戰鬥中斷線）已修 | `-13` |
| Death_CN：body+0 擊殺者、+2 被擊殺者、+4 類型（1～4＝玩家）；AI 被殺不排程重生 | `-13` |
| 任務結束：`Campaign_CN 0x00230139`（body[2] 1 成功／2 失敗）→ 伺服器回 `EndGame_SN 0x00222213` → 結算頁 → 回房間 | `-14` |
| PvE 地圖／難度照客戶端選的（建房 body[2..3]、`Map_Change_One_CQ` w1/b5）| `-18`（G4）、`-19` |
| ItemInfo 分包（每包 ≤28 筆，現在 12）並送機體本體列 → 機庫顯示機體 | `-20` |
| Death_SN 戰績塊送累計值（`Game_User_Battle_Set` 是直接指定，送 0 會清空）→ 有分數 | `-16`（G2）、`-21` |
| PvE 選機體：`PVE_SLOT_SELECT_FLOW='client'`，開局與陣亡後走 ZSlotSelectPage → `ChangeSlot_CN` → `ChangeSlot_SN` → `Respawn_CN`；`Game_User_SN` 送 8 個槽位 | `-22`（G5） |

### 目前可玩的範圍

登入 → 機庫（看得到 8 台機）→ 建 PvE 房（選地圖／難度）→ 選機體出場 → 開火／跳／推進器 → 敵人與回合 → 擊殺計分 → 陣亡後重選機體 → 任務失敗／成功 → 結算頁 → 回房間。已實測地圖：9001 `Map_PC01`（動力奪取戰）、9010 `Map_PC04`（潛入作戰）。

### 已知問題（未處理）

- 結算頁隊伍分數塊全 0；exp／point 每殺 10 是暫定值（`lobby.dispatch.js`）。
- `Assist_SN 0x00230122` 仍回 16 bytes 空包（正確格式見 G1 `-15`）。
- 遊戲內聊天不顯示（伺服器回了客戶端不認得的 opcode；做法見 G3 `-17`）。
- 機庫換裝備沒有存 DB；`room.dispatch.js` 把 `0x00240112` 當 CQ（DLL 的 DefaultSlot CQ 是 `0x00240111`）。
- 間歇性卡頓，伺服器端看不出網路停頓，疑似客戶端本身。
- `room.dispatch.js` `sendRoomState` 的房間資訊地圖仍固定 9001／舊 index 58，目前沒看到影響。
- Map_PC04 客戶端 log 有 `MRNavigation ... Accessed None 'NodeActor'` 警告。

### 協作狀態

- 分支：`reverse-work`（主線）；中階成果應 commit 到 `flash-wip` 再由高階合併。
- tmux：`server`（伺服器，Claude 控制）、`sol`（Codex reviewer，**不要關**，cache 會掉；額度約剩 30%，只留給重要審查）。
- `docs/backlog.md` 的 G1～G5 都已完成並審查。

### 下一步（契約，操作者決定順序）

1. **換裝備存檔**
   - 目標：機庫改武器／推進器後存進 DB，下一局 `Game_User_SN` 與 ItemInfo 反映新配裝。
   - 範圍：`Slot_Change_CQ 0x00240107`（`room.dispatch.js` 約 618 行）、DB `items.equipped`、`ChangeSlot` 未完成分析 `-04`。
   - 限制：先讀 DLL 確認 `Slot_Change_SA 0x00240108` 格式；DB 變更寫成腳本；一次一個變數。
   - 完成條件：機庫換主武器 → 重登仍保留 → PvE 出場手上是新武器。
2. **遊戲內聊天顯示**（小）：照 G3，`0x00220507`／`0x00220509` 同 opcode 原樣回送。完成條件：聊天出現在畫面上。
3. **結算細節**：EndGame_SN 隊伍分數塊、exp／point 真實算法（查腳本 `ScoreBattle` 等）、遊戲結束後取消殘留重生。
4. **Assist_SN** 照 G1 補格式。
