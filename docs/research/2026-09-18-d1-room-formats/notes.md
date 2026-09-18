# D1 第 3 步：房間清單、加入、離開的封包格式（中階分析，高階抽驗）

狀態：🟡。高階抽驗了 `Enter_CQ` 的 opcode 寫入點 `0x107e5e61`（`mov [0x1090f7ac], 0x220231`），其餘是子 agent 讀組語的結果。

## Room_List_SN `0x00220204`（thunk `0x10702ef0` → `0x107e4640`）

- header：+0x00 u8（讀了但沒用）、+0x01 u8 筆數（上限 255）。
- 每筆：+0x00 u16 RoomIndex；+0x02 u8 UpdateType（1＝新增，後面多一個 u16 RoomNumber；3＝刪除；其他＝部分更新）；接著 u16 FieldMask，後面的欄位依 mask 決定有沒有：
  - bit0：u8 RoomType（`0x107e48ac`）
  - bit1：u8＋u8，matching／playing 相關，第二個 byte 沒被存 ⬜
  - bit2：u8 MaxUser、u8 CurrentUser（`0x107e4a2d`／`0x107e4a4d`）
  - bit3：u8 旗標，bit0＝有密碼、bit3＝Training
  - bit4：2 bytes，讀了就跳過 ⬜
  - bit5：6 bytes，前 u16 是 MapIndex，後 4 bytes 意義不明 ⬜
  - bit8：u16 RoomNameIndex
  - bit9：u8 長度＋N bytes 房名，**ANSI**（`0x107e3840`）
- 對應 `ZNetwork_DJ.uc:533-556` 的 `ROOM_SIMPLE_INFO`，存進 `m_LobbyRoomList`。
- 伺服器目前送的 `0x00230103` 不在客戶端 dispatch map 裡，所以大廳清單一直是空的。

## 加入房間

- `Enter_CQ 0x00220231`（`0x107e5d90`）：+0x00 u16 RoomIndex、+0x02 起 UTF-16 密碼；body 總長固定 0x1D。
- `Enter_SA 0x00220232`（`0x107e4080`）：+0x00 u16 結果碼、+0x02 u32，兩個都要是 0 才算成功（`0x107e40cb`）。成功後呼叫 6 個 setter 寫進 `m_RoomInfo`，每個 setter 對應哪個欄位 ⬜。失敗時 ErrorMessage 可能是 "WRONG_ROOM_PASSWORD"（`ZPage_Lobby.uc:1701`）。

## 離開房間

- `Leave_SN 0x00220236`（`0x107edb70`）：+0x00 u16 UserIndex、+0x02 u8 Kickout。UserIndex 是自己時回大廳；是別人時觸發 `NETWORK_ROOM_USER_LIST`，把那個人從清單移除。

## 大廳使用者清單

- `User_Add_SN 0x00220113`：u8＋u8 筆數，每筆固定 42 bytes（UserIndex／UserType／UserLevel／UserName、Emblem／ClanName），各欄位的精確偏移 ⬜。
- `User_Delete_SN 0x00220116`：+0x00 u16 UserIndex。

## user index

- 封包裡是 u16，客戶端內部比對是 u32（`Room_User_Default_Add` `0x107339e0` 用 `cmp dword`）。房間成員陣列是動態 TArray，沒看到固定上限，人數上限應該就是 MaxUser 欄位 ⬜。

## P2P（M2）

- `Game_Info_URL_Get`（`0x10733cf0`）：房主的 URL 格式在 `0x10814a50`：`start %s?Listen?LPort=%d?...?team=%d`；加入者的在 `0x10814b34`：`start %s:%d/%s?team=%d`（HostIP、HostPort、地圖、隊伍）。
- `Ready_Host_SN 0x00420115`（`0x107d5700`）：+0x00 u16 Port、+0x03 起 ANSI IP（以 \0 結尾，最多 16 字元）→ 寫進 `GAME_INFO.HostIP／HostPort`。**多人時必須送房主客戶端的 IP。**
- LPort 的來源 ⬜：子 agent 說是 `[this+0xfd4]`，但 T1 已確認 `0xfd4`＝TimeLimit，兩者衝突，要重查。遊戲的 UDP 埠 ⬜：ini 裡沒有設定，打算在實測時用 `Get-NetUDPEndpoint`（唯讀）查 MetalRage 行程。
