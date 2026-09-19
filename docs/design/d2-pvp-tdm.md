# D2 PvP 死鬥（TDM）開戰格式與流程分析

> 狀態：草稿，**只有文件，還沒實作**。由 explorer（中階）撰寫、高階存檔，全篇 🟡 待審；實作前要先過 Sol 審查（roadmap 原則 1）。依據列在各節。

## 0. PvP 現在為什麼完全開不了戰

1. **`campaignStarted_` 的閘門**：`gate.game.dispatch.js` 約 1198、1246 行（CQ_CREATE）和約 1727、1841 行（0x00222103）。`isTrueCampaign = (roomType === 1) || (gameMode === 4 || gameMode === 5)`，PvP 房（roomType 2）永遠不成立，所以不會送 `Game_Info_SN`。這跟 `journal/2026-09-15-03-campaign-only-start-flow-pvp-blocked.md` 的結論一致；在目前的程式碼上重新核對過，仍然成立。
2. **新發現**：約 1254-1258 行的 `campaignMapCacheKey_` 只接受 9001..9012，選 PvP 地圖（1011..1081）時會默默退回 PvE 的預設地圖，`room.mapId` 也跟著變成 PvE 地圖。
- `[LOG]` 從 2026-09-15 之後沒有再做過 PvP 開戰測試。**實作前先請操作者用目前的程式碼重測一次 PvP 開戰**，因為可能還有沒碰到的阻擋點。

## 1. 跟 PvE 相同的封包

`Game_Wait_SN 0x00420111`、Ready_Host 系列（`0x00420113`／`0x00420114`／`0x00420115`／`0x00420116`）、`BeginRound_SN 0x00230152`：都已經能廣播（`design/d1-step6-battle-broadcast.md` §1），沒有找到 PvP 專屬的欄位。

## 2. 要依模式填不同值的封包

- **`Game_Info_SN 0x00222111`**（`0x107079af`→`0x107d4f50`）：
  - body+0x11 MapId：要填 1011..1081；
  - body+0x13 TimeLimit：TDM 預設 20；
  - body+0x15／+0x16／+0x18 是三個 GoalScore 候選欄位，現在都填 0。Cache 裡 map 1011 的目標是 150，三個都寫 150 比較保險；
  - body+0x04／+0x06 紅藍隊 index 是 0／1，不用改。
- **`Game_User_SN 0x00222112`** rec+0x02 TeamIndex（`journal/2026-09-16-21`）：現在全部寫 0（紅）；TDM 要依成員輪流填 0／1。
- **`Room_Default_SN`** body+0x10／+0x12：紅藍槽位 index 是 ✅ 0／1（`journal/2026-09-18-15`）。
- **`Team_Change_All_SN 0x00222121`**：Game 那邊是 `0x10704683`→`0x107d8170`，Room 那邊是 `0x107099c1`→`0x107ec140`。body 格式完全沒記錄，伺服器也沒實作。很可能是房間裡換隊的機制，⬜。
- **`User_Score_SN 0x00222221`**（`0x107051b9`→`0x107ece60`）：只知道前面幾個欄位（`research/2026-09-19-rank/notes.md`）。
- **`Game_Score_SN 0x00222114`**（`0x10709485`→`0x107d5130`）：只讀了一部分，看起來是每人一筆、長度 0x12 的紀錄迴圈，跟 EndGame 的兩隊區塊格式不同。實作前要完整反編譯，⬜。

## 3. 擊殺與結束

- **`Death_SN 0x00230124`**（`lobby.dispatch.js` 的 0x00230123 case）：已經實作，也能廣播。只有個人 K/D，沒有隊伍總分。TDM 要在房間層級加一個隊伍擊殺計數器。
- **`EndRound_SN`／`EndQuater_SN`／`EndGame_SN`**（`0x107d7a50`／`0x107d7c90`／`0x107d7ed0`）：frame+0x10 是 WinTeamIndex，接著兩個 14 bytes 的隊伍區塊，共 30 bytes；跟 PvE 用的格式相同，只是要填真正的勝方和分數。
- **誰決定比賽結束：還不知道。** PvE 是房主客戶端送 `Campaign_CN`。TDM 的判斷在 `ZTeamDM::CheckScore`（`ZGame/ZTeamDM.uc:880-895`，達到 GoalScore 或時間到就呼叫 EndGame），但 `ZTeamDM.uc`／`DefaultGameInfo.uc` 裡找不到任何 `NETWORK_*` Event_Call，不確定房主會不會送 CN 通知伺服器。**比較保險的做法**：比照 `PVE_ROUND_ADVANCE_MODE`，由伺服器從 Death_CN 串流自己計算擊殺數和時間，再決定何時送 EndGame_SN。實作時要監看 log，看有沒有不認得的 CN 出現。

## 4. 原版規則參考

韓版官方在 2009-02-24 把 TDM 預設從 10 分鐘／100 殺改成 **20 分鐘／150 殺**（`research/2026-09-19-original-features/pvp-modes.md`），跟 Cache 裡 map 1011 的值（`journal/2026-09-15-10`）一致。

## 5. 最小實作計畫（一步一個開關，開關關閉時 PvE 的 golden 必須逐位元組不變）

1. `PVP_ROOM_CAMPAIGN_GATE_MODE`：讓 PvP 房的 0x00222103 也能走到開戰序列。
2. `PVP_MAP_ID_RANGE_MODE`：接受 1011..1081。
3. `GAME_INFO_TDM_GOAL_MODE`：GoalScore 三個欄位寫 150、TimeLimit 寫 20。
4. `ROOM_TEAM_ASSIGN_MODE`：Game_User_SN 的 TeamIndex 依成員輪流填 0／1。
5. `TDM_KILL_TRACKING_MODE`：房間層級計算隊伍擊殺數，達到目標或時間到就送 EndGame_SN（填真正的 WinTeam）。
6. 另開任務：解 `Team_Change_All_SN`、`User_Score_SN`、`Game_Score_SN` 的格式（房內換隊、計分板）。

## 6. 風險

- §3「誰決定結束」還不知道，伺服器自己判斷只是設計上的選擇。
- 格式沒解完的封包不要猜 offset。
- 重測之前，§0 列的阻擋點可能還不完整。
