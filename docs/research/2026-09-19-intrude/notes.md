# INTRUDE 分析（explorer 中階，🟡 待審）

- ROOM_INFO 的 bool bitfield（`ZNetwork_DJ.uc:558-586`）：IsPassword=0x01、IsBalance=0x02、**IsIntrude=0x04**、IsPlaying=0x08、IsMatching=0x10、IsTraining=0x20。這些位元存在 RoomInfo 物件的 `[+0xcc]`。
- `Room_Option_SN 0x00220217`（`0x1070155a`→`0x107ea9f0`）：body+0→0x01、+1→0x02、**+2→0x04（IsIntrude）**、+3→0x20，跟 `room-state.sender.js:187-198` 的寫法一致。
- **Bug：** optionMask 的來源是 `createWord2`＝`client.createPlayTime_`，也就是建房時選的時間（分鐘），不是「戰鬥中參與」的設定。所以畫面上的「可以」是巧合（`gate.game.dispatch.js:1298`）。
- `Room_Default_SN` wire body 0x0B–0x0E 也寫同一組 [+0xcc]。我們送的是 0；後面送的 Option_SN 會蓋掉它。
- **目前的漏洞：** Enter_CQ（`gate.game.dispatch.js` 約 1850-1912）不檢查戰鬥狀態。`rooms.js` 有 `state: 'lobby'|'playing'`，但沒有任何地方會把它設成 playing。`room-list.sender.js:143` 會依 state 送 playing 位元，但因為 state 從不改變，一直是 0。
- Enter_SA（`0x107e4080`）：只有 0/0 算成功，其他值都走共用路徑。UC `ZPage_Lobby.uc:1701` 只有 `WRONG_ROOM_PASSWORD` 有專屬提示，其他非空字串都走一般提示。數值和字串的對照表沒有追到。
- `RAGEMODE_INTRUDE_ONLY`：只有 MapMode==8（憤怒模式地圖）會強制 IsIntrude=true（`ZPanel_RoomInfo.uc:1016-1027`）。
- 中途加入的序列（只是設計）：新加入的人單獨收 Game_Wait → Game_User×N → Game_Info → 直接收 Ready_Host_SN（房主已經是 host）；房主要收新玩家的 Game_User_SN。沒有任何 log 能佐證。
- 暫行規則的建議：開戰時設 `room.state='playing'`，Enter_CQ 在 playing 時回 `sendEnterSa(false)`（1/1，已知不會讓客戶端卡住），大廳列表也會跟著顯示遊戲中。
