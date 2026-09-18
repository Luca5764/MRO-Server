# D1-A：多人時 Game_User_SN 怎麼送

狀態：🟡（中階分析；高階抽驗了 `0x107d8baf push 0x1e5` 和 `0x10734401` 依 UserIndex 比對、stride 0xEC；未經跨公司審查）。

- handler `0x107d8ae0`（thunk `0x1070920a`）：body+0x00 旗標（讀了沒用）、body+0x01 筆數；外層迴圈每筆 `0x1E5`（485）bytes（`0x107d8baf`），跑滿筆數才結束（`0x107d8f67`）。
- 每筆呼叫 `Game_User_Add`（`0x107029ff` → `0x107343e0`）：陣列在 `this+0x1040`，stride `0xEC`；**依 UserIndex 找，找到就先移除，再加到陣列尾端**（upsert）。跟 ItemInfo 的 `Item_Add` 是同一種模式，用的也是同一個成長 import `[0x1091b8a0]`。
- 整張表只會被 `Game_Data_Clear`（`0x1072cbf0`）清空，已知的呼叫點是 `ZDispatchRoom::Game_Wait_SN`（`0x107ecde0`）和 `ZDispatchWaiting::Game_Info_SN`（`0x107f09ae`）；另有兩個呼叫點 `0x10730247`、`0x10730620` 還沒認出是誰 ⬜。
- 大小：2＋N×485，所以 N=1 是 487、N=2 是 972、N=3 是 1457，超過 0x400。
- **建議送法：** 每個連線都送 N 包，每包 count=1，一人一筆（487 bytes）；而且要排在該連線的 `Game_Wait_SN`／`Game_Info_SN` 之後，不然會被清掉。
- 矛盾：`room-game-user.sender.js:7-8` 的註解說 `Game_User_Team_Get` 查的是 `this+0x1034`、stride 0x80、由 `Game_User_Add` 寫入。但 `Game_User_Add` 實際寫的是 `+0x1040`，`+0x1034` 由誰寫入 ⬜。R11／team=0 的結論靠的是實測，所以不受影響。
