# ⬜ 目前阻塞點：玩家沒有被放進房間格子

> 從 docs/opcode-ledger.md 第 522–551 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[OBS]` 2026-09-15。三個症狀經判定為**同一個根因**：

1. 房間畫面 RED TEAM 的格子**全部是空的**，玩家只出現在左下角個人資訊欄
2. 按鈕是「準備」而非「遊戲開始」——客戶端不認為本地玩家是房主
3. travel URL 的 `team=255`——`Game_User_Team_Get` 在房間使用者陣列裡找不到本地玩家就回傳 255

按「準備」送出 `0x00222101`（body `270a000001`，與按開始的 `0x00222103` body `270a000000` 僅末位元組不同），伺服器回 `0x00222102` 後無下文。按 F5 送出的也是 `0x00222101`，客戶端**完全沒有提供「開始」這個動作**。

> 已排除：與我方封包變更無關。有「遊戲開始」與只有「準備」的兩個 session，房間封包 diff 後**只有 `0x00220203` 的 mapIndex 不同**，`User_Master_SN`、`User_Default_SN`、`Room_State_SN` 全部 byte 相同。行為改變是客戶端對「合法地圖」的反應。

### 線索：`Room_User_Add` 的函式簽名

`ZNetwork.dll` 匯出符號（已確認存在）：

```
?Room_User_Add@UZNetwork_DJ@@QAEXHHHHHPBGHHH
```

解讀為 `void Room_User_Add(int,int,int,int,int, const wchar_t*, int,int,int)`——5 個 int、**一個寬字串**、再 3 個 int。

我方 `User_Default_SN`（`room-user.sender.js`）目前把暱稱寫成 **ASCII** 且放在 body **最後**（offset `0x1D`）。若 body 欄位順序對應該呼叫順序，暱稱應在第 5 個整數之後、最後 3 個整數之前，且為 UTF-16。

⬜ **未驗證**，需反組譯 `ZDispatchRoom::User_Default_SN` 的欄位擷取才能確定。目前 `0x00220233` 的 body 結構在台帳中仍為 🟡 `[DLL]`。

其他相關符號（皆存在於 DLL）：`Room_Team_Set`、`Room_User_Delete`、`Room_User_State_Set`、`Room_User_Mech_Set`、`Room_User_Team_Change`、`Master_Change_CQ/SA@ZDispatchRoom`、`Game_Info_Team_Set`。

---

