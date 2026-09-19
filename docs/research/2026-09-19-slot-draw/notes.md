# 房間格子不畫 READY／頭像 — 調查筆記（🟡 待審）

現象（session-20260919-122616.jsonl）：
- 兩台都收到 `User_State_SN 0x00220401` raw 2，但兩邊都沒有 READY；
- 房主看不到任何頭像；
- 加入者看得到房主的頭像，看不到自己的。

SLOT-DRAW（explorer，中階）：
- `Room_User_Add`（`0x10708d14` → `0x107339e0`）寫入的陣列 [obj+0xf88]／count [obj+0xf8c]、stride 0x50，和 `User_State_SN` 寫入的是同一個陣列。欄位：+0x00 UserIndex、+0x04 UserName、+0x10 UserType、+0x14 UserLevel、+0x18 MechType、+0x1c MechLevel、+0x34 TeamIndex、+0x38 PilotCode、+0x3c State、+0x40 IP；順序和 `ZNetwork_DJ.uc:404-427` 的 `ROOM_USER_INFO` 一致。
- `m_RoomUserList` 在 UC 裡沒有任何賦值（只有 `ZNetwork_DJ.uc:864` 宣告、`:1453` 回傳 default 值）→ 由原生端直接填，也就是上面那個陣列（高階 grep 確認沒有賦值）。
- State 寫入 `0x1072c870` 先用 UserIndex 找記錄，找不到就直接 return、不會新增。
- 伺服器送的 TeamIndex 一律 0，Room 的 RedTeamIndex 也是 0（伺服器程式碼）；**但 DLL 從 `User_Default_SN` 哪個 offset 讀 TeamIndex 沒有核對。**
- `CacheManager.GetImageIndex`（`CacheManager.uc:1267`）先用原生 `GetItemHighGroup` 分類，Pilot 是 5；101 屬於哪一類沒查到。不過加入者畫得出房主的頭像，所以 101 至少在那一格能畫。

高階補查（UC）：
- `RecvRoomUserList`（`ZPage_Room.uc:2053`）→ `UpdatePlayerInfo`（`:1014`，先 ClearData 所有格子，`:1045` 設 `bUpdateTeamMember=true`）→ PreDraw（`:2397`）→ `UpdateTeamMember`。所以每收到一次 USER_LIST 事件，照理會整排重畫。
- 按鈕文字變成「準備完畢」代表 `SetReady()` 有跑，而且讀到自己是已準備。所以這個事件確實有觸發，State 也寫進去了。
- `ZPanel_TeamMember.uc:98-222`：名字、READY、頭像都在同一個 `if (m_UserName != "")` 區塊裡。READY 另外要 `!m_bMaster`。

下一步：需要一張雙機房間畫面的截圖，看格子實際畫了什麼（名字、等級圖示、READY、房主黃底），才能分辨是「整格沒畫」「格子錯位」還是「只有頭像貼圖是空的」。
