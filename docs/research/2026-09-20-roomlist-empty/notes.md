# 大廳看不到別人新開的房間（2026-09-20）

## 症狀
[OBS] 筆電（test）開了一間房，桌機（Lucas）在大廳看不到，重新整理也沒用，因此無法加入、無法測「筆電當房主」的方向。

## 調查（explorer，高階已核對關鍵行）
- [LOG] `session-20260920-140707.jsonl`：06:53:42 Lucas 送 `Leave_CQ 0x00220234` → 收到 `Leave_SA 0x00220235`，接著一個 `Room_List_SN 0x00220204` **len=5**。
- 那一包**不是空清單**，而是「房間 #3 已刪除」的單筆增量更新（`0001030003` = continuation=0、count=1、roomId=3、UpdateType=3）。房間 #4（test 開的）一直都在 `rooms` Map 裡，06:54:39 它被刪除時兩條連線都收到 `0001040003`。
- 根因：`dispatch/room/room-leave.js` 的 `leaveRoomAndNotify()` 只對大廳廣播「自己剛離開那間房」的增量更新，**從不送完整清單**；完整清單只在客戶端送 `0x00230141`（`lobby.dispatch.js` 的 `sendEmptyRoomList`）時才送，而客戶端在 Leave 之後不會自己再要一次。舊 session `session-20260919-184235.jsonl` 也是同樣模式，所以是穩定行為、不是 race。
- 操作者按的「重新整理」送的是 `0x00220141`，伺服器只回 `0x00220142`，不含清單。

## 修正
- `room-leave.js`：離開者回到大廳時，除了原本的增量廣播，再送一次 `sendFullRoomList(leaverClient, rooms.listRooms())`（commit 26be66c，LEAVE-LIST）。只在 `LOBBY_ROOM_LIST_MODE` 開啟時作用；golden 與 4 個相關測試全過。
- ✅ [TEST] 2026-09-20 實機：修正並完整重啟後，操作者離開房間回大廳就看得到筆電開的房間。未經跨公司審查。

## 附帶事故
先只做 `/reload` 導致 `whitelist.isTestAccount is not a function`，登入掉進備援分支、暱稱變 `Player`。完整重啟後正常。見 `journal/2026-09-20-1130-sp-bind-test.md` 末段。
