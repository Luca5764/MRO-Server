# R11 SN_ROOM_DEFAULT 隊伍索引修正

狀態：🟡 待審；預設開關維持 disabled，未實測。

## 目標與背景

- [OBS] `shots/room-ours.png` 顯示房間 RED TEAM 格子全空。
- [LOG] `logs/session-20260918-180349.jsonl` 的 `SN_ROOM_DEFAULT 0x00220203` body+`0x10` 是
  `9010`、body+`0x12` 是 `60`；同場 `SN_USER_DEFAULT 0x00220233` 的 record+`0x11`
  （body+`0x13`）是 `0`。
- [CODE] `gate.game.dispatch.js:576-577` 將 CQ_CREATE body+`0x02`／+`0x04` 存成
  `client.createWord1_`／`client.createWord2_`；原 sender 在 room-state.sender.js:61-62
  把兩者原封寫入 Room_Default 的兩個欄位。
- [SRC] `ZNetwork_DJ.uc:558-588` 的 `ROOM_INFO` 在六筆 `MapInfo` 後宣告
  `RedTeamIndex`、`BlueTeamIndex`；這與兩個欄位位於 `RoomInfo+0xc0`／+`0xc4` 相符。

## DLL 證據與 body 換算

- [DLL] `Room_Default_SN 0x00220203` thunk `0x10706d7f` 跳到本體 `0x107ea3e0`；
  `0x107ea4f1-0x107ea4ff` 讀 `[ebx+0x20]`／`[ebx+0x22]`，寫入 `[esi+0xc0]`／`[esi+0xc4]`，
  對應候選 Red/Blue team index。
- [DLL] `0x107ea601-0x107ea653` 以每筆 9 bytes 處理六筆 MapInfo；
  `0x107ea6d4` 是本體返回點（`ret 8`）。
- 🟡 [DLL][INFER] `ebx = wire body + 0x10` 是多欄位交叉比對結果，不是主 dispatch loop
  已確認的單一指標換算；因此 `[ebx+0x20]`／+`0x22` 以 wire body+`0x10`／+`0x12` 記錄為待驗證。
- [LOG] 同一封包的 body+`0x04` 等於 sender 的 roomType，body+`0x10`／+`0x12` 又分別等於
  CQ_CREATE 的兩個 word，支持上述換算，但沒有把推論升成已確認。

## TeamIndex 值域查證

- [DLL] `SN_USER_DEFAULT 0x00220233` 本體 thunk `0x1070979b` → `0x107ee2d0`；原始組語存於
  `docs/research/2026-09-18-red-team-slot/notes.md` 與既有
  `docs/research/2026-09-18-room-user/disasm.txt`。
- [DLL] `0x107ee3f7-0x107ee44c` 的 jump table 是另一個 byte 欄位（機體類型的 1–8 fallback），
  不是 TeamIndex；TeamIndex 解析後沒有看到 `cmp`／`test`／範圍分支或 `0` 特殊 return。
- [DLL] 呼叫 `Room_User_Add` 前，解析出的 record 欄位直接作為參數傳入；沒有把 TeamIndex
  正規化成別的值。故本次沒有發現「0 代表未分隊而不可用」的特殊語意。
- [SRC] `ZNetwork_DJ.uc:404-427` 把 `ROOM_USER_INFO.TeamIndex` 宣告為整數；沒有額外的
  sentinel 說明。
- [SRC] `ZPage_Room.uc:2456-2470` 先比較 `PlayerList[Count].TeamIndex == RedTeamIndex`，
  再比較 `== BlueTeamIndex`；兩者都不成立時沒有 else，該玩家不會放入任何隊伍陣列。
- [SRC] `Game_Info_SN` 的既有 sender 在 `gate.game.dispatch.js:249-250` 使用 red=`0`、blue=`1`；
  本修正採用相同的已存在隊伍常數。

## SN_ROOM_OPTION 獨立性複驗

- [CODE] `room-state.sender.js:111-125` 組 `SN_ROOM_OPTION 0x00220217` 時直接讀
  `client.createWord2_`，以 bit `0x01/0x02/0x04/0x20` 轉成四個 flag。
- [CODE] 本修正只改 `SN_ROOM_DEFAULT 0x00220203` body+`0x10`／+`0x12` 的局部變數，沒有改
  `client.createWord2_` 的保存、`optionMask` 計算或 `SN_ROOM_OPTION` body。
- [SRC] `ZNetwork_DJ.uc:1549` 將 `Room_Option_Change` 定義為獨立的 balance/intrude API；
  沒有證據顯示它會回讀 Room_Default 的兩個 team index 欄位。

## 程式變更與邊界

- 新增 `ROOM_TEAM_INDEX_MODE = 'disabled'` 於 `room-state.sender.js`。
- disabled 保留原行為：body+`0x10`／+`0x12` 仍送 `createWord1_`／`createWord2_`，含 fallback 0。
- enabled 才送 `ROOM_RED_TEAM_INDEX=0`／`ROOM_BLUE_TEAM_INDEX=1`；只替換這兩個欄位。
- [CODE] body 其他 offsets、body size `0x021A`、entry loop、slot-count、其他 room 開關均未改。
- 沒有啟動伺服器、沒有重啟伺服器、沒有要求操作者測試。

## 驗證與待審

- [TEST] `node --check Metal Rage Online Server/dispatch/room/room-state.sender.js` 通過；
  `git diff --check` 通過；本次只做靜態改動，未做客戶端實測。
- 🟡 [INFER] body 指標 `ebx = body+0x10` 仍依紅／藍欄位、roomType、MapInfo loop 與 session hex 交叉比對，
  後續高階審查應決定是否需要反查主 dispatch loop。
- 🟡 [TEST] 啟用 `ROOM_TEAM_INDEX_MODE` 後，預期 Room_Default 的兩欄為 0／1，讓 User_Default 的
  TeamIndex=0 命中 RedTeamIndex；是否完整顯示仍待操作者實測。
