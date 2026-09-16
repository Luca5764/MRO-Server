# `Game_User_SN` (0x00222112) 記錄布局 ✅ 已確認 [DLL]

> 從 docs/opcode-ledger.md 第 1501–1550 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

來源:`ZDispatchGame::Game_User_SN` thunk `0x1070920a` → `0x107d8ae0`。
記錄緩衝區在該 frame 的 `esp+0xA8`;以下每個偏移都對應一條實際讀取它的指令。

```
body+0x00 u8   flag(未讀)
body+0x01 u8   記錄數
body+0x02      記錄陣列,每筆 0x1E5

rec+0x00 u16      Game_User_Add p1,其餘所有呼叫的 key
rec+0x02 u16      Game_User_Add p7 → entry+0x34  ★ TEAM
rec+0x04 u32      Game_User_Add p3 → entry+0x14
rec+0x08 u32      Game_Item_Add p2
rec+0x0C u32      此處未讀
rec+0x10 u32      Game_Slot_Selected_Set,1..7 → 0..6,其餘 7
rec+0x14 u32      Game_User_Clan_Set p3
rec+0x18 u32      Game_User_Clan_Set p2
rec+0x1C char[2]  atoi → Game_User_Add p2 → entry+0x10,等級
rec+0x1E char[25] 轉寬字元 → Game_User_Add p6 → entry+0x04,暱稱
rec+0x37 char[25] 轉寬字元 → Game_User_Clan_Set p4,戰隊名
rec+0x50..0x68    七個 u32 → Game_Item_Add p6,p5,p7,p3,p4,p8,p9
rec+0x6C u8       槽位數
rec+0x6D + n*0x2F 槽位記錄(最多 8)

slot+0x00 u32  槽位索引,1..7 → 0..6,其餘 7
slot+0x04 u32  Game_Slot_Set p3 → row+0x0C
slot+0x08 u8   此處未讀(就是這個 byte 讓後面所有 u32 都不對齊)
slot+0x09 u32  Game_UserSocket_Set p3
slot+0x0D u32  Game_UserSocket_Set p4
slot+0x11 u32  Game_UserSocket_Set p5
slot+0x15 u32  Game_Slot_Set p4 → row+0x10
slot+0x19 u32  Game_Slot_Set p5 → row+0x14
slot+0x1D u32  Game_Slot_Set p6 → row+0x18
slot+0x21 u32  Game_Slot_Set p7 → row+0x1C
slot+0x25 u32  Game_Slot_Set p8 → row+0x20
```

結構是緊密打包、沒有對齊洞——這正是驗算:`0x6D + 8 × 0x2F = 0x1E5`,分毫不差等於記錄大小。

⚠ 注意 Ghidra 對這個函式的 stack 變數命名有誤(`iStack_1dc` 實際是 `rec+0x08` 而非 `+0x0C`,
槽位陣列起點是 `rec+0x6D` 而非 `+0x71`)。**以組語為準。**

處理順序:`Game_User_Add` → `Game_User_Clan_Set` → `Game_Item_Add` → `Game_UserSocket_Add`
→(每槽:`Game_Slot_Set`、`Game_UserSocket_Set`)→ `Game_Slot_Selected_Set`
+ `Game_UserSocket_Selected_Set`。`Game_Slot_Set` 寫 `[0x1040]`(stride 0xEC,每槽 0x18,
六個 int),而那張表由同一封包裡的 `Game_UserSocket_Add` 建立——所以**選機體 UI 也依賴這個封包**。

---

