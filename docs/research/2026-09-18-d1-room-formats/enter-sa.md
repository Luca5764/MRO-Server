# D1-4 Part A：Enter_SA 六個 setter 分析（中階，待審）

狀態：🟡。這篇補完 `docs/research/2026-09-18-d1-room-formats/notes.md` 留下的「⬜ 每個 setter 對應哪個欄位」。用
`tools/ghidra/decompile.sh 0x107e4080` 搭配 `tools/disasm.py at` 的原始組語核對，兩者一致。

## 結論（提要）

**Enter_SA `0x00220232` 的六個 setter 都不是「從封包欄位寫 ROOM_INFO 個別欄位」。** 它們是：
清空快取（3 個）→ 用玩家自己本地快取的房間資料開房（`Room_Open`）→ 設定目前所在房間（`Location_Room_Set`）
→ 切場景（`Scene_Change(5)`）。Enter_SA 的封包內容本身**不帶 RoomIndex／房名／人數等資料**，
和 `sendOkSa` 目前用的 6-byte 0/0 body 完全相容。房間的實際內容（名稱、地圖、人數、成員）
全部由 Enter_SA **之後**送的 SN 廣播（Room_Default_SN 等）決定，這正是 backlog D1-4 Part B 原本要走的路。

## 反編譯（`tools/ghidra/decompile.sh 0x107e4080`）

```c
void __thiscall FUN_107e4080(int param_1,int param_2,int param_3)
{
  if (*(char *)(param_1 + 4) == '\0') { /* Log_Set/Log_Write "ZDispatchLobby::Enter_SA"; return */ }

  if (((param_3 != 0) && (*(short *)(param_2 + 0x10) == 0)) && (*(int *)(param_2 + 0x12) == 0)) {
      // local_34: 52-byte (26 x u16) 緩衝區，先清零 — 房名暫存
      uVar3 = (uint)*(ushort *)(param_3 + 0x10);      // == body+0x00，還是同一個「必須是0」的狀態欄
      RoomList_Name_Get(pUVar1, uVar3);                // 用「房間索引」在本地 m_LobbyRoomList 查房名
      FUN_107e3780();                                  // 房名字串複製到 local_34，上限 25（notes.md 已知）
      FUN_107e3840();                                  // 另一段字串複製，上限 11，來源是連線物件自己的欄位
                                                         // （[esp+0x64]+0x12），不是封包
      Lobby_Data_Clear(pUVar1);        // ← 0x1070192e
      Room_Data_Clear(pUVar1);         // ← 0x10709bbf
      Community_Chat_Clear(pUVar1);    // ← 0x107080d0
      Room_Open(pUVar1, uVar3, local_34); // ← 0x10703d8c  (index, roomName buffer)
      Location_Room_Set(pUVar1, uVar3);   // ← 0x1070117c  (index)
      Scene_Change(pUVar1, 5);            // ← 0x1070148d  (常數 5 = 房間場景)
  }
  // 成功／失敗都會走到這裡：
  Event_Call(pUVar1, "NETWORK_LOBBY_ROOM_ENTER", param_2+0xc, (ushort)*(param_2+0x10), *(int*)(param_2+0x12));
}
```

原始組語核對（`tools/disasm.py at 0x107e4080 260`）：body+0x00（status u16）/+0x02（result u32）
兩者都要是 0 才進成功分支（對應 `esi+0x10`／`esi+0x12`，因為 `esi` 指到完整訊息 buffer，+0x10 才是
body 起點——和這個 repo 的 `getExactMessageBuffer`/`client.getMessageBuffer` 約定一致）。

六個 setter 的位址（thunk）與真正函式本體：

| thunk | 本體 | 名稱（Ghidra 解出） | 參數 |
|---|---|---|---|
| `0x1070192e` | `0x1072b010` | `Lobby_Data_Clear` | 無（只有 `this`） |
| `0x10709bbf` | `0x1072c260` | `Room_Data_Clear` | 無 |
| `0x107080d0` | `0x1072e830` | `Community_Chat_Clear` | 無 |
| `0x10703d8c` | `0x10718d30`（thiscall 那一段） | `Room_Open` | `(index, nameBuffer)` |
| `0x1070117c` | `0x10716f70` | `Location_Room_Set` | `(index)` |
| `0x1070148d` | `0x10738910` | `Scene_Change` | `(sceneId=5)` |

`Room_Open`/`Location_Room_Set` 傳進去的 `index` 組語上是 `movzx ebp, word ptr [edx+0x10]`——
`edx` 在此之前完全沒有被重新賦值，還是同一個訊息指標，所以這個值**跟成功判斷讀的是同一個欄位**，
在成功分支裡恆為 0。也就是說 `Room_Open`/`Location_Room_Set`/`RoomList_Name_Get` 用的「索引」
不是從封包資料算出來的變數，是編譯器重用了已知為 0 的暫存值——這三個呼叫的語意其實是
**常數 0**，不是可變的 RoomIndex。合理解讀：客戶端一次只會有一個「目前正在嘗試進入的房間」
概念（單一 room slot），`RoomList_Name_Get(0)`／`Room_Open(0, ...)` 用的 0 不是「陣列第 0 筆」，
是「這個連線的房間 slot」固定代號。

## 對 D1-4 實作的意義

- **Enter_SA 不需要額外欄位。** 6-byte 0/0（跟現有 `sendOkSa`/`getExactMessageBuffer` 用的所有其他
  `_SA` 一樣）就能讓客戶端切到房間場景。不用猜任何新的 body 佈局。
- **房間內容要靠後續 SN 廣播。** `Room_Open`/`Location_Room_Set` 只是把場景切過去、清空舊快取，
  真正的 RoomIndex／房名／人數／地圖／成員全部要靠 `Room_Default_SN`、`Room_Name_SN`、
  `Room_Boundary_SN`、`Room_Option_SN`、`Room_State_SN`、`User_Default_SN`／`_Name`／`_Pilot`／
  `_State`／`_Master`——這正是目前 `sendRoomStatePackets`/`sendRoomUserPackets`（房主那套 sender）
  已經在送的東西，只是資料來源要從 `client.xxx_` 換成 `Room` 物件。
- **失敗分支**：兩個分支都會呼叫 `Event_Call("NETWORK_LOBBY_ROOM_ENTER", ..., status, result)`；
  `ZPage_Lobby.RecvRoomEnter(ErrorMessage)`（`ZPage_Lobby.uc:1701`）收到非空字串時，
  只有字面等於 `"WRONG_ROOM_PASSWORD"` 才會開密碼房彈窗，其他任何非空字串都走
  `NotifyPageOpen(ErrorMessage)`（通用提示彈窗）。**`status`/`result` 數字要怎麼映射成這些字串，
  不在這次反編譯範圍內**（是另一個全域的錯誤碼→字串表，這次沒追）。⬜
  失敗時先照這個 repo 既有慣例送 `status=1, result=1`（跟 `room.dispatch.js` 的
  `handleShopPurchase` 等處理一致），**不保證彈出的文字是哪一句**，只保證彈出某個非空提示、
  不會讓客戶端卡住。

## 沒有解決、留給高階或後續任務的

- `FUN_107e3840()`（上限 11 字元那段）來源是 `[esp+0x64]+0x12`，不是封包，這次沒有繼續追是什麼
  欄位（大概率是連線物件自己記的某個簡短字串，例如 IP 片段或縮寫），跟 Enter_SA 的實作無關，未追。
- Event_Call 的數字→錯誤字串對照表沒有找到，見上面「失敗分支」。
