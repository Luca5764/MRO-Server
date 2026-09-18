# 戰役房 UI 來源調查（原始筆記，未審查，🟡）

來源檔案（唯讀）：
- ~/mro-decrypted/src/ZGameMainMenu/ZPage_Room.uc
- ~/mro-decrypted/src/ZGameMainMenu/ZPanel_PVE.uc
- ~/mro-decrypted/src/ZGameMainMenu/ZPanel_RoomInfo.uc（僅 grep，未細讀）
- ~/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc
- Metal Rage Online Server/dispatch/room/room-state.sender.js
- Metal Rage Online Server/dispatch/room/room-user.sender.js
- Metal Rage Online Server/dispatch/room/room-map.sender.js
- Metal Rage Online Server/logs/session-20260918-130902.jsonl（進房 opcode 序列）

## RED TEAM 槽位
ZPage_Room.uc:2430 `PlayerList = ZNetwork_DJ.Room_UserList_Get()`（回傳 m_RoomUserList，ZNetwork_DJ.uc:864/1451）。
p_Red[n].RefreshData(...) 於 ZPage_Room.uc:2472。
m_RoomUserList 只有 Get/Find（ZNetwork_DJ.uc:1453,1471-1505），沒有任何 UnrealScript 端的寫入 —— 是 native 從封包直接灌進去的，UC 反編譯看不到寫入點，需要 DLL 確認寫入時機。
ROOM_USER_INFO 欄位（UserIndex/UserName/UserType/UserLevel/MechType/MechLevel/ClanInfo/TeamIndex/PilotCode/State/IP，ZNetwork_DJ.uc:404-427）與 room-user.sender.js 送的 SN_USER_DEFAULT(0x00220233) body 欄位逐一對得上。

## 任務簡報／地圖預覽／難度
ZPanel_PVE.UpdateRoomInfo()（ZPanel_PVE.uc:216-309）：
- 全部資料來自 `CacheManager.GetPveUIPanelInfo()`，用 `RoomInfo.MapInfo[0].Index`（伺服器送的地圖 index）去比對 PveUIPanelInfo.PveMapIndex（Cache 表，不是封包）。
- 성공/실패조건圖片：mText tile，index = PveUIPanelInfo.MissionImgIndex（純圖片，非文字封包）。
- 작전 시놉시스文字：`szSynopsis[]` 是 `localized string`（語言檔，不是 Cache.Bin 也不是封包），用 PveUIPanelInfo.Synopsis 比對 SynopNumber 選字串。
- 難度鈕 m_Difficulty：不是獨立欄位，是 ZPage_Room.UpdateRoomInfo() line 680 `p_PVE.m_Difficulty = MapInfoList[j].PlayPve`，j 是用 MyRoomInfo.MapInfo[0].Index 在 Cache MapInfoRecord 表裡查到的那一列；同地點三個難度的 MapIndex 疑似以 /3 分組（ZPanel_PVE.uc:328-329 `(MapIndex-9001)/3`）。

## 房間設定欄（人數/目標擊殺/目標回合/戰鬥中參加）
- 人數(인원수) ← ROOM_INFO.MaxUser，room-state.sender.js:35 body+0x07（SN_ROOM_DEFAULT 0x00220203）。
- 目標擊殺/目標回合疑似 ← ROOM_INFO.MapInfo[0].{Kill,Round}（ZNetwork_DJ.uc struct MAP_INFO, line 238-245），但 sender 端目前是把 roomSettingGoal/roomSettingTime/roomSettingRound 當純量寫進 SN_ROOM_DEFAULT body+0x1C/0x1D/0x1E（room-state.sender.js:46-48）。**這個 body offset → MAP_INFO 欄位的對應沒有用 tools/disasm.py 反查組語確認過，是这次調查中唯一沒有嚴格驗證的偏移。**
- 전투중참여(戰鬥中參加) ← 疑似 ROOM_INFO.IsIntrude，透過 SN_ROOM_OPTION(0x00220217) 的 bit mask（room-state.sender.js 內註解稱「Static analysis: body+0x10~0x13 對應 bit 0x01/0x02/0x04/0x20」，是前人做過的 DLL 靜態分析，這次沒有重新覆核）。
- Map_Change_All_SN/One_SN (0x00220226/0x00220223) 送的是 9-byte 一筆的「可選地圖清單」（cacheIndex/selected flag），欄位數對不上 MAP_INFO 的 6 個 int，判斷這不是同一份資料 —— 也就是說目標擊殺/目標回合大概率不是從這兩個封包來的。

## Session 送出序列（進房，logs/session-20260918-130902.jsonl 05:14:11~05:14:12）
0x00220202(40B) → 0x00220203(538B, SN_ROOM_DEFAULT) → 0x0022021a(50B, SN_ROOM_NAME) →
0x00220213(2B, BOUNDARY) → 0x00220217(4B, OPTION) → 0x00220214(2B, STATE) →
0x00220226×2(110B, MAP_CHANGE_ALL, 故意送兩次) → 0x00220223(10B, MAP_CHANGE_ONE) →
0x00220233(54B, USER_DEFAULT) → 0x00220421(78B, USER_NAME) → 0x00220402(6B, USER_PILOT) →
0x00220401(8B, USER_STATE) → 0x00220319(6B, USER_MASTER) → 0x0023013a(41B, Campaign_SN) →
0x00222111(26B, Game_Info_SN)
沒有看到任何「任務簡報」專屬封包 —— 與 ZPanel_PVE 全部吃 Cache 的結論一致。
