# ★★★ 完整的 server→client opcode 地圖：`docs/client-dispatch-map.md`

> 從 docs/opcode-ledger.md 第 738–772 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。14 個 dispatcher、**273 筆映射**，由 `tools/dispatch-map.py` 模擬客戶端自己的分派邏輯得出。

| Dispatcher | handler 數 | | Dispatcher | handler 數 |
|---|---|---|---|---|
| `ZDispatchRoom` | 50 | | `ZDispatchCard` | 15 |
| `ZDispatchClan` | 49 | | `ZDispatchFriend` | 13 |
| `ZDispatchHangar` | 40 | | `ZDispatchLobby` | 12 |
| `ZDispatchGame` | 29 | | `ZDispatchWaiting` | 3 |
| `ZDispatchCommunity` | 25 | | `ZDispatchGate` / `Quest` / `Base` | 0 ⬜ |
| `ZDispatchAccount` | 21 | | | |
| `ZDispatchPostbox` | 16 | | | |

⬜ `Gate`／`Quest`／`Base` 解出 0 筆，其分派形式與其他不同，模擬器尚未支援。**不代表它們沒有 handler。**

### 經此確認為正確的既有實作

我方送出的 opcode 中，以下**全部與客戶端一致**（先前多為 🟡 `[DLL]` 推測，現可升 ✅）：

- **Account**：`0x00110152` Login_Wasabii_SA、`0x00110125` Login_Again_SA、`0x00110131` Wait_SN、`0x00210101`~`0x00210105`、`0x00210111` ItemInfo_SN、`0x00210112` ExpirationItem_SN、`0x00210113` WearInfo_SN、`0x00210115` MapInfo_SN、`0x00210121` Complete_SN、`0x00210202` Create_SA、`0x00260101` LicenseInfo_SN
- **Room**：`0x00220203` Room_Default_SN、`0x00220213` Room_Boundary_SN、`0x00220214` Room_State_SN、`0x00220217` Room_Option_SN、`0x0022021A` Room_Name_SN、`0x00220223` Map_Change_One_SN、`0x00220226` Map_Change_All_SN、`0x00220233` User_Default_SN、`0x00220319` User_Master_SN、`0x00220401` User_State_SN、`0x00220402` User_Pilot_SN、`0x00220421` User_Name_SN、`0x00222102` Game_Ready_SN、`0x00222104` Game_Start_SN、`0x00420111` Game_Wait_SN
- **Hangar**：`0x00240131`~`0x00240133` Packege_*_SN、`0x00240241` ShopList_SN、`0x00240242` CashShopList_SN、`0x00240102` Open_SA、`0x00240108` Slot_Change_SA、`0x00240113` DefaultSlot_Change_SN
- **Lobby**：`0x00220101` Server_Add_SN、`0x00220102` Channel_Add_SN
- **Game**：`0x00222111` Game_Info_SN、`0x00420113` Ready_Host_SQ、`0x0023013A` Campaign_SN

> **意義：** 機庫顯示不出機體與裝備、地圖清單為空，**都不是 opcode 錯**——那些封包客戶端確實在聽。問題出在 body 結構，與 `User_Default_SN` 的欄位錯位同一類。

### 順帶澄清

- 台帳原記「`0x240521` → Packege_Item_SN 已排除」：正確。`0x00240522` 實為 `Send_UserItem_SA`。
- 台帳原記四個 `CQ_COMPLETE` 候選查不到：正常。dispatcher 只處理客戶端**收到**的封包。

---

