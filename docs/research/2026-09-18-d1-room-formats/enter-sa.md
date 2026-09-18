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
      uVar3 = (uint)*(ushort *)(param_3 + 0x10);      // param_3（=edx）自己的 body+0x00，跟 param_2
                                                         // （=esi，成功判斷讀的那個）不是同一個欄位；
                                                         // 已更正，見下方 2026-09-19 說明：param_3 是
                                                         // 客戶端剛送出的 Enter_CQ，這裡讀的是 RoomIndex
      RoomList_Name_Get(pUVar1, uVar3);                // 用 Enter_CQ 的 RoomIndex 在本地 m_LobbyRoomList 查房名
      FUN_107e3780();                                  // 房名字串複製到 local_34，上限 25（notes.md 已知）
      FUN_107e3840();                                  // 另一段字串複製，上限 11，來源是 param_3（Enter_CQ）
                                                         // body+2（密碼欄位），不是連線物件欄位，已更正
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

> **2026-09-19 中階更正（🟡，待審）：** 以上這一段錯了，原因是把 `edx` 和 `esi` 當成同一個指標。
> 本次用 `python3 tools/disasm.py at 0x107e4080 120` 與 `tools/ghidra/decompile.sh 0x107e4080` 逐條
> 核對（兩者一致）：這個函式是 `ret 8`（兩個顯式參數）。`0x107e40b9 mov edx,[esp+0x54]`
> （在 `sub esp,0x4c` 之後、任何 `push` 之前）→ `edx` = 第二個參數，之後沒有任何指令改寫它。
> `0x107e40bf push esi` 之後 `0x107e40c0 mov esi,[esp+0x54]`（`push esi` 已讓 `esp` 少 4，所以這個
> `[esp+0x54]` 指到另一個位置）→ `esi` = 第一個參數，就是收到的 `Enter_SA` 本身
> （`esi+0x10`／`esi+0x12` 是成功判斷讀的 status/result，Ghidra 標成 `param_2`）。也就是說 `edx`
> 和 `esi` 是**兩個不同的參數**，`edx` 從未被成功判斷（`0x107e40cb`／`0x107e40d6`，讀的是 `esi`）
> 動過，「index 恆為 0」的推論不成立。
>
> `0x107e40fc movzx ebp, word ptr [edx+0x10]` 讀的是 `edx`（第二個參數）的 body+0，不是 `esi`。
> `edx` 是什麼：`0x107e4134 mov edi,[esp+0x64]` 這行，把 esp 相對位移換算回去正好等於函式一開始
> `mov edx,[esp+0x54]` 讀的同一個記憶體位址——也就是重新把 `edx` 的原始值讀回 `edi`，再
> `add edi,0x12`（body+2），配上 `0x107e3840` 複製 0xb（11）字元。對照 `notes.md`：
> `Enter_CQ 0x00220231`（`0x107e5d90`）body 固定 0x1D，+0x00 u16 RoomIndex、+0x02 起 UTF-16
> 密碼——body+2 正好是密碼欄位起點，長度上限也對得上剩餘 body 長度。**結論：`edx`＝客戶端自己
> 剛送出的 `Enter_CQ`（RoomIndex＋密碼），`esi`＝伺服器回的 `Enter_SA`。`Room_Open`/
> `Location_Room_Set` 的 `index`＝`Enter_CQ` 裡玩家選的 `RoomIndex`，不是常數 0。**
>
> **`0x107086c5` 是什麼：** `tools/ghidra/decompile.sh` 把它解成
> `UZNetwork_DJ::RoomList_Name_Get`（thunk `0x107086c5` → `jmp 0x1072c010`；真正函式本體在
> `0x1072c010`，AGENTS.md 提醒過的「匯出表位址是 thunk」在這裡再次成立）。`0x1072c010` 的組語：
> `edx=[ecx+0xe8c]`（筆數）、`esi=[ecx+0xe88]`（陣列起點，元素大小 `0x4c`＝76 bytes），逐筆
> `cmp dword[entry],edi`——`edi` 是呼叫端傳進來的索引，也就是上面確認的 `Enter_CQ` `RoomIndex`。
> 對照 `~/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc` 的 `ROOM_SIMPLE_INFO`（欄位順序
> `RoomIndex`／`RoomNumber`／`RoomType`／`RoomName`／...），第一個欄位就是 `RoomIndex`，所以比對
> 用的是 **`RoomIndex`**，不是 `RoomNumber`。找到就回傳 `entry+0xc`（`RoomName` 在欄位順序上正好
> 是第 4 個 4-byte 欄位，offset 0xc）；找不到就回傳指向一段全零靜態資料（`0x10814584`，反組譯出來
> 是連續 `00 00` 位元組）的指標，`0x107e3780` 拿它當來源字串複製，效果是房名複製成空字串（不是
> `edi==0`／NULL，是指到一段空字串資料）。
>
> **對 D1-4 實作的意義：** 加入房間時 `Room_Open` 能不能顯示正確房名，取決於客戶端「自己本地」的
> `m_LobbyRoomList` 快取（由 `Room_List_SN 0x00220204` 填入，見 `notes.md`）裡有沒有一筆
> `RoomIndex` 等於這次 `Enter_CQ` 送的 `RoomIndex`，而且那筆的 `RoomName`（ANSI，`0x107e3840`）
> 已經正確送過——目前 `LOBBY_ROOM_LIST_MODE`／`room-list.sender.js` 送的正是這兩個欄位。
> `Room_List_SN` 的 `RoomNumber`（`UpdateType=1` 才送）與 `RoomNameIndex`（bit8）目前只是回填
> `RoomIndex` 的值（`journal/2026-09-19-0330-d1-step4-room-join.md`「不確定／待審處」），這次沒有
> 找到任何客戶端讀取路徑用到它們兩個，**仍是 ⬜**，跟 `RoomList_Name_Get` 用的
> `RoomIndex`／`RoomName` 是兩組不同欄位，不要互相替代驗證。

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

- ~~`FUN_107e3840()`（上限 11 字元那段）來源是 `[esp+0x64]+0x12`，不是封包，這次沒有繼續追是什麼
  欄位（大概率是連線物件自己記的某個簡短字串，例如 IP 片段或縮寫），跟 Enter_SA 的實作無關，未追。~~
  **已更正（2026-09-19）：** 來源就是 `param_3`（客戶端自己送的 `Enter_CQ`）body+2，即密碼欄位，
  詳見上方「2026-09-19 中階更正」。這是封包資料，不是連線物件欄位。
- Event_Call 的數字→錯誤字串對照表沒有找到，見上面「失敗分支」。這個仍未解決。
