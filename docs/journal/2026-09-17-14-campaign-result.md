# PvE 任務結束：Campaign_CN 送出後伺服器沒有回應（2026-09-17）

## 測試 P（19:38–19:42，`session-20260917-193503.jsonl`）

- ✅ [LOG] **沒有再斷線**（client.js frame 修正後，Death_CN 23 筆、Assist_CN 12 筆都正常處理）。
- ✅ [SHOT] `shots/testP-end.png`：`RESPAWN 0 / KILL 20`，核心在爆炸，`ROUND 1`，畫面停在遊戲中。[OBS] 操作者回報「測完了」（任務失敗）。
- ✅ [LOG] 11:42:13 客戶端送 `0x00230139`，body `01 00 02`，伺服器走 fallback，之後只剩 keepalive。

## Campaign_CN／Campaign_SN（DLL）

decompile：`docs/research/2026-09-17-fire-gate/Campaign_CN_SN.c`。
- ✅ [DLL] `ZDispatchGame::Campaign_CN`（`0x107dab70`）：host 且 IsPlay 時送 `0x230139`，body[0]=1、body[1]=0、**body[2] = 1（目標達成）或 2（失敗）**。對應腳本 `ZNetwork_DJ.uc:1903` `Game_Campaign(int ActionType) // 1:목표달성, 2:실패(게임종료)`，呼叫點：`ZModePve.uc:194`（回合用完）、`:339`、`:377`（成功）、`ZPveTimer.uc:67/70`（時間到）、`ZPvePlayercontroller.uc:1148/1308`。
- ✅ [DLL] `ZDispatchGame::Campaign_SN`（`0x107d7040`，opcode `0x0023013a`）：body+0 u16 status、body+2 u32 result 都要是 0，然後兩組 `Game_Score_Set`（第一組讀 body+0x0d u16、+0x0f u16、+0x11 u8、+0x12 u8、+0x17 u32；第二組讀 +0x1b u16、+0x1d u16、+0x1f u8、+0x20 u8、+0x25 u32），最後呼叫 `Game_Score_Update`。🟡 參數對應（哪個是隊伍、分數、等級）還沒從組語核對。**它只更新分數，看起來不會結束遊戲**。
- 🟡 [GUESS] 結束遊戲、進結算頁，應該要由伺服器送 `EndGame_SN 0x00222213`（state.md 已列名稱，body 未查）。這是下一步。

## EndGame_SN `0x00222213` 格式（組語＋log 字串）

decompile：`docs/research/2026-09-17-fire-gate/EndGame_EndRound_SN.c`。
- ✅ [DLL] `ZDispatchGame::EndGame_SN`（thunk `0x1070a182` → `0x107d7ed0`）。log 字串：`0x1082e78c` `WinTeamIndex : %d`；`0x1082e7d0`／`0x1082e888` `Team : %d, Score : %d, Round : %d, Alive : %d, Try : %d, Goal : %d, Exp : %d`。
- ✅ [DLL] 依組語 `0x107d7f11`–`0x107d7f99`（第一組）、`0x107d7fd0`–`0x107d8025`（第二組）推回 body 偏移（`esi` = 封包指標，body = `esi+0x10`）：
  - `+0x00` u16 **WinTeamIndex**
  - 第一組：`+0x02` u16 Team、`+0x04` u16 Score、`+0x06` u8 Round、`+0x07` u8 Alive、`+0x08` u16 Try、`+0x0A` u16 Goal、`+0x0C` u32 Exp
  - 第二組：`+0x10` Team、`+0x12` Score、`+0x14` u8 Round、`+0x15` u8 Alive、`+0x16` Try、`+0x18` Goal、`+0x1A` u32 Exp
- ✅ [DLL] 兩組各呼叫一次 `Game_Score_Set`、再呼叫 `Game_Score_Update`；接著 client 端（`GIsClient`）：`0x107d8078` 把 WinTeamIndex（保存在堆疊 `[esp+0xc]`）傳給 `Game_End_Battle`（thunk `0x10708fda`）、`Community_Chat_Clear`、`Event_Call("NETWORK_GAME_END")`，最後 `Scene_Change(5)`（結算場景）。dedicated server 分支則是 `Dedi_End` + `Scene_Change(1)`。
- 🟡 Campaign 失敗時 WinTeamIndex 該填什麼還不確定（玩家是 red=0）；結算頁需要哪些後續資料也不知道。

## 改動（單一變數：收到 Campaign_CN 時回 EndGame_SN）

- `dispatch/lobby.dispatch.js` 新增 `case 0x00230139`：成功（body[2]=1）送 WinTeam=0、失敗送 WinTeam=1；第一組 Team=0、第二組 Team=1，其他分數欄位全 0。**不送 Campaign_SN**，也不改任何伺服器狀態旗標。
- 伺服器 19:50 重啟（`session-20260917-195021.jsonl`）。待測：`docs/next-test.md` 測試 Q。
