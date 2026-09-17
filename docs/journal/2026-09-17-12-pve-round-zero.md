# PvE 回合系統沒有啟動：Game_Info_SN 的 Round 送 0（2026-09-17）

目標：PvE 復原的第 1 步，靜態核對 `ZModePve` 開始回合的兩個條件。

## 條件 1：`Game_Master_Team() != 255`（`ZModePve/ZModePve.uc:68-93` PostBeginPlay）

- [SRC] `ZNetwork/ZNetwork_DJ.uc:1789`：比對 `m_GameInfo.MasterTeamIndex` 和 `ClientRedIndex`／`ClientBlueIndex`。
- ✅ [DLL] `GAME_INFO` 在 `UZNetwork_DJ` 內的位置（對照 script struct 順序與寫入點）：`+0xfac` IsHost（bit）、`+0xfb0` HostIP、`+0xfbc` HostPort、`+0xfc0` BattleIndex、`+0xfc4` IsClan／IsQuater（bit0／bit1）、`+0xfc8` MapInfo.Index、`+0xfcc` Mode（從 Cache.Bin 取）、`+0xfd0` **Round**、`+0xfd4` Time、`+0xfd8` Kill、`+0xfdc` Goal、`+0xfe0` MasterUserIndex、`+0xfe4` MasterTeamIndex、`+0xfe8` IsPlay、`+0xfec/ff0/ff4` Client Quater/Red/Blue、`+0xff8/ffc/1000` Server Quater/Red/Blue。依據：`Game_Info_Set` `0x1072cca0`、`Game_Info_Team_Set` `0x1071a420`（`+0xffc/+0x1000`）、`Game_Info_Quater_Set` `0x1071a440`（`+0xff8`）、`Game_Play_Start` `0x10734050`（server→client 複製）、`Game_Play_Check` 讀 `+0xfe8`。
- ✅ [DLL] `ZDispatchWaiting::Game_Info_SN`（`0x107f0910`）內的 log 格式字串 `0x1083a240`：`Battle : %d, Clan : %d, Quater : %d, Map : %d, Round : %d, Time : %d, Kill : %d, Goal : %d`，依組語推回 body 偏移：Battle `+0x00` u32、Clan `+0x0E` u8、Quater `+0x0F`==2、Map `+0x11` u16、**Round `+0x15` u8**、Time `+0x13` u16、Kill `+0x16` u16、Goal `+0x18` u16；Red `+0x04`、Blue `+0x06`（`0x1083a318`：`RedTeamIndex : %d, BlueTeamIndex : %d`）；MasterUser `+0x0A`、MasterTeam `+0x0C`。
- ✅ 我方送 red=0、master team=0 → `Game_Master_Team()` = 0，**條件 1 通過**。
- 更正：05 篇（2026-09-16-05）表格把 `[0xfd4]` 標成「body+0x0F==2 的布林」、`[0xfd8]`／`[0xfdc]` 的對應也不對；實際上 `fd4`=Time（+0x13）、`fd8`=Kill（+0x16）、`fdc`=Goal（+0x18）、Quater 布林進 `fc4` bit1。

## 條件 2：`CurrentRound < MapInfo.Round`（`ZModePve.uc` ModeReset_BD 約 128 行）

- ✅ [程式碼] 伺服器 `dispatch/gate.game.dispatch.js` `sendGameInfoSn` 在 `+0x15` 寫的是 `goalScore = 0` → **Round = 0** → `ModeReset_BD` 一進來就 return，回合、AI、任務目標全都不會開始。**這就是條件 2 沒過。**

## Round 應該送多少

- [SRC] `ZGameMainMenu/ZPanel_RoomInfo.uc:984`：campaign（mode 9）的 `MapRound = MapInfoRecord.GoalDefault`；`ZPopup_CreateRoom.uc:506` 呼叫 `Lobby_Room_Create(RoomType, Name, Password, MaxUser, MapIndex, PlayRound, PlayTime, PlayKill, PlayGoal)`。
- 🟡 [DLL] `ZDispatchLobby::Create_CQ`（`0x107e5b60`，decompile `docs/research/2026-09-17-fire-gate/Lobby_Create_CQ.c`）：body[1]=MaxUser、body[2..3]=MapIndex、body[4..5]=PlayTime、**body[6]=PlayRound**、body[7..8]=Kill、body[9..10]=Goal。參數順序來自 Ghidra 與 exec wrapper（`0x10718740`）的讀取順序，**組語 push 順序尚未逐一核對**。
- [LOG] 實際的建房 body `01 10 3223 3c00 05 0000 0000 ...` → MaxUser 0x10、MapIndex 0x2332（9010）、PlayTime 60、**PlayRound 5**，語意吻合。伺服器原本把 body[6] 當成 `mapId`（=5）。
- ⚠️ MapIndex 9010 跟我們送的 campaign map key 9001 不一樣，之後要查（另一個變數，這次不動）。

## 改動（單一變數：Game_Info_SN Round）

- 建房時記下 `client.playRound_ = body[6]`，`session.js` 跨重連保存；`sendGameInfoSn` 在 `+0x15` 改送 `playRound_`（原本是 0）。其他欄位不變。
- 伺服器 18:50 重啟（`session-20260917-185036.jsonl`）。待測：`docs/next-test.md` 測試 N。
