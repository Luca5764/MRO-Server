# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 交接快照（2026-09-18 晚，Claude 高階，請以此段為準）

### 今天完成並合併 `reverse-work`

1. **G6 機庫換裝備存檔**（merge `fb6c6ef`）：換裝 → 寫 DB → 完全重登保留 → PvE 出場帶入。拆掉四層阻塞，詳見 `journal/2026-09-18-02` ～ `-06`。最隱蔽的一層：客戶端 `ZPanel_InvenItems.uc:408-411` 把 **SerialIndex 101–999 當保留區整段跳過**，`items.id` 全落在裡面 → 用 `tools/renumber-item-serials.js` 把主鍵搬到 100000+（已執行，腳本冪等）。
2. **商店一把一列＋期限選單**（merge `6b5e889`）：item_id 末兩碼是**持有期限**（`GameItemRecord +0x43`），同家族共用 `RepresentIndex`（+0x04）。全部送出、只讓代表項 `IsShow=1`，購買彈窗就能組出 1/3/7/15/30/60/90 天選單。
3. **房間修正四項**（merge `315819c`）：面板地圖與實際開戰一致、房名改送 ANSI、`Map_Change_One_SA` 補 6-byte 成功標頭、`SN_MAP_CHANGE_ONE` 不再把房間設定洗成 0/1/0/0。

### 今天失敗的（實作保留、開關預設 disabled，不要直接打開）

- `MAP_CHANGE_ORDER_MODE`（R7／R7b）：換圖封包順序。**兩種做法都失敗**，並因此確認 `Map_Change_All_SN` 會寫入選中狀態，不能排在 `Map_Change_One_SN` 之後。
- `ROOM_DEFAULT_MAP_ENTRY_MODE`（R4）、`MAP_INFO_REAL_ID_MODE`（R9）：都無可觀察效果，證明 `m_MapList` 不是地圖清單空白的唯一關卡。

### 今天學到最重要的一件事

今天六個 bug **全是同一個形狀**：不是邏輯錯，是**當初不知道欄位語意時填的佔位值沒跟著更新**（房間地圖寫死 9001、`isShow=1`、購買 `mech_type` 照抄 catalog、`items.id` 落在保留區、`MapTime=0/Round=1`、`MapInfo_SN` 送列索引 0..5）。程式裡用 `b0/w1/w2` 這種偏移當變數名的地方，就是「還沒查過語意」的記號。已開 backlog **H5：盤點所有 sender 的佔位常數**（Luna 執行中，交付 `docs/reference/placeholder-audit.md`）。

### 下一步

- **H5** 佔位常數盤點（進行中）→ 出來之後照影響面排序逐一處理，很可能是下一批「一改就好」的來源。
- **RED TEAM 槽位不顯示玩家**：客戶端比對 `RoomInfo.RedTeamIndex／BlueTeamIndex`，我們從未送過。子 agent 調查中，原始資料會在 `research/2026-09-18-red-team-slot/`。
- **H6** 難度燈慢一拍、**H7** 設定對話框地圖清單空：都需要反覆試假設，**建議等 Pico 2 W 到貨**（操作者 2026-09-18 下單）。`tools/pico/`、`tools/win/pico_drive.sh` 已經有人寫好但未 commit，能用真實 USB HID 驅動客戶端，硬性約束第 1 條明確允許。那之後「改開關 → 重啟 → 建房 → 點一下 → 截圖」可以自動化，實驗成本從十幾分鐘降到幾十秒。
- 其他未動：**H1** 登入後預設機體商店漏接、**H2** G 幣不持久化、**H3** catalog 價格（3Day 比 30Day 貴）、Legend 機體授權封包、結算頁隊伍分數全 0、`Assist_SN` 格式、PvP 房完全沒碰過。

### 環境與協作

- 伺服器在 tmux `server`，主目錄 `/home/lucas/mro-reverse/Metal Rage Online Server`，**由高階自己控，不要請操作者代勞**。
- worktree `mro-reverse-g6-unblock`、`mro-reverse-g7` 已完成任務，分支都已合併。
- tmux：`codex`（Luna 中階）、`sol`、`antigravity`（Gemini 中階，今天做了 `Map_Change_All_SN` 的組語分析，品質好；它唯一講錯的是「伺服器從未送 `0x00210115`」，log 證明有送）。**已開的 session 不要關。**
- 操作者在 YouTube 留言聯繫原作者（repo 作者 moonlight776，今天仍在推進 P2P／TDM／爆破／佔領模式），等回覆。

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
- tmux：`server`（伺服器）、Codex session（操作者 2026-09-17 21:45 把原本的 `sol` 關掉，改開 Codex 主力做 backlog）。Sol（高階 reviewer）額度約剩 30%，只留給重要審查；已開的 Codex session 不要隨便關，cache 會掉。
- `docs/backlog.md` 的 G1～G5 都已完成並審查。

### 下一步

- **Claude 額度將盡**，操作者決定交給 Codex（Luna，中階）或 Gemini（中階）：做 `docs/backlog.md` 的 **G6（機庫換裝備存檔）**，有餘力再做 **G7（遊戲內聊天顯示）**。兩個都允許改伺服器，但新行為要放在預設關閉的開關後面、在 `flash-wip` 分支、實測時暫時打開，規則寫在 backlog「2026-09-17 21:40 新增」。
- 審查：Codex reviewer Sol（需要時用 `codex -m gpt-5.6-sol` 另開，額度約 30%）或下一個接手的 Claude。審過才把開關預設打開並合併回 `reverse-work`。
- 之後的候選：結算細節（EndGame_SN 隊伍分數、exp／point 真實算法、遊戲結束後取消殘留重生）、`Assist_SN` 照 G1 補格式。
