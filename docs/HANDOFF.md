# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## 🟡 中階交接：Codex（2026-09-17，G6-unblock）

- 工作區／分支：`/home/lucas/mro-reverse-g6-unblock`／`flash-wip-g6-unblock`。
- 已完成靜態分析與預設關閉修正：`ZPanel_ShopItems.ListLoad()` 先檢查
  `IsShow`，既有 `ShopList_SN` sender 把 `IsShow/IsNew/IsHot` 寫在
  `+0x0d..+0x0f`，造成每列在 client 被丟棄；enabled path 改為
  `+0x0c..+0x0e`，`IsSale=0` 在 `+0x0f`。
- `Packege_Item_SN 0x00240131` 保持原本 `count + (serial,itemIndex)` 8-byte
  rows，因目前 research 沒有它的 handler 組語，不猜格式。購買成功在
  `SHOP_UNBLOCK_MODE='enabled'` 時重用既有 chunked `ItemInfo_SN` sender，並在
  `0x00240202` 前送出，讓 `RecvItemBuy()` 的 `HaveList` 有新列。
- 證據／差異：`docs/journal/2026-09-17-24-g6-unblock-shop-list.md`、
  `Metal Rage Online Server/dispatch/room.dispatch.js`。`node --check`、
  `git diff --check` 已過；未開 server、未啟用開關、未實測。
- 下一步契約：高階核對 ShopList handler 的 DLL VA／原始 bytes；核對後才能在
  客戶端手動實測多件主武器、購買後 selectable、再續 G6 換裝保存。不要改
  `state.md`、G6 save handler 或資料庫 schema。

---

## ⚡ 高階主力交接：Codex Sol（2026-09-17 22:30）

- **G7 已完成並合併 `reverse-work`**：Gemini 實作，高階審查修正 disabled
  fallback；Team／All `0x00220507`／`0x00220509` 均實測在 HUD 顯示，預設
  已開啟。證據見 `2026-09-17-23-game-chat-echo-g7.md`。
- **G6 靜態審查通過、實測阻塞**：CQ 本體 `0x107e0c50`、SA 本體
  `0x107dde80` 已核對，開關維持預設關閉。主武器商店清單空白、購入物重登
  後仍不顯示，客戶端沒有第二件裝備可選。先另案修正 `ShopList_SN`／
  `Packege_Item_SN` 顯示路徑，再續測換裝、重登與 PvE 武器。G6 審查 commit
  在 `flash-wip` 的 `6180060`，尚未合併 G6 程式到主線。
- `server` tmux 目前跑 G7 worktree；後續工作前切回
  `/home/lucas/mro-reverse/Metal Rage Online Server` 的 `reverse-work`。

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
