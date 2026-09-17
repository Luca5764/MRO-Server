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

## 測試 Q 結果（20:18–20:24，`session-20260917-195021.jsonl`）

- ✅ [OBS]／[LOG] 任務失敗：12:23:00 客戶端送 `Campaign_CN 01 00 02` → 伺服器送 `EndGame_SN`（WinTeam=1）→ **客戶端進到結算頁**（沒有分數，因為我們送的分數全是 0），之後**出場回到房間**。12:24:16 客戶端送 `0x00220234`，伺服器照舊回空的 `0x00220235`。客戶端 log 有 `ScriptLog: EndGame_BD()`。
- ✅ 結論：**任務結束 → 結算頁 → 回房間的流程打通了。** 還缺：結算分數（EndGame_SN 分數塊、Death_SN 戰績塊，見 `2026-09-17-16`）。
- [OBS] 敵人兩種：`R-1`（看到玩家會自爆，否則直直走向核心自爆）、`War D…`（會對玩家開槍，後期也變成往核心自爆的行為）。🟡 AI 行為是 host 客戶端腳本控制的（`ZBase/MRAiController.uc` 等），暫時不當成伺服器問題。
- [OBS] 遊戲中有間歇性卡頓，原因不明。
  - [LOG] 伺服器端沒有看到網路停頓：每筆 Death_CN／Assist_CN 都在 1 ms 內回應。`0x00020083` 的間隔最長 98 秒，但它是「10 秒內沒有其他封包才送」的閒置 keepalive（每次間隔都剛好是最後一個封包之後 10 秒），不能拿來當成客戶端卡住的證據。
  - 🟡 候選：客戶端載入缺少的資源（log 有 `can not find the packet`、`Mesh''None`）、AI 生怪波次、每次擊殺收到 Death_SN 時的 HUD 處理。需要操作者觀察卡頓是否跟擊殺或生怪同時發生。
- ⬜ 選機體小測試：操作者沒有回報結果。
