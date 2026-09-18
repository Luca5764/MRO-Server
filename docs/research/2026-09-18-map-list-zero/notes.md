# Map_Change_All_SN (0x00220226) 與 地圖清單 0 筆根因分析

- 日期：2026-09-18
- 分析者：Antigravity (中階)
- 狀態：🟡 待審

## 1. ZDispatchRoom::Map_Change_All_SN (0x107ebab0 - 0x107ebc31)

### Body 結構
- Header (2 bytes):
  - body + 0x00: uint8 Flag (0x107ebb5c -> pRoom[0x24])
  - body + 0x01: uint8 Count (0x107ebb63 -> pRoom[0x2c])
- Record (每筆 9 bytes, 起始於 body + 0x02 + i * 9):
  - record + 0x00: uint16 LE MapID (0x107ebbaf -> ebp+0x00 / MAP_INFO.Index)
    - 經 0x107ebbf0 比對 Cache.Bin Table 1 (Map) entry[0]，查到則以 entry[0x18] 填入 ebp+0x04 / MAP_INFO.Mode
  - record + 0x02: uint16 LE Time (0x107ebbb6 -> ebp+0x0c / MAP_INFO.Time)
  - record + 0x04: uint8 Round (0x107ebbbd -> ebp+0x08 / MAP_INFO.Round)
  - record + 0x05: uint16 LE Kill (0x107ebbc3 -> ebp+0x10 / MAP_INFO.Kill)
  - record + 0x07: uint16 LE Goal (0x107ebbca -> ebp+0x14 / MAP_INFO.Goal)

### 提前 return 的所有條件
1. 0x107ebab6: this[4] == 0 (未啟用)，記錄 "ZDispatchRoom::Map_Change_All_SN" / L"Failed - Active" 並於 0x107ebae6 ret 8。
2. 0x107ebb19: pRoom == NULL (0x107ebb12 Room_Info_Get 回傳 0)，記錄 "ZDispatchRoom::Map_Change_All_SN" / L"Failed - pRoom" 並於 0x107ebb4b ret 8。
函式其餘路徑無任何提前 return，結尾於 0x107ebc31 ret 8。

### 迴圈與儲存限制
- 0x107ebc1d: cmp ecx, 6 / jl 0x107ebb82。客戶端寫入目標為 pRoom + 0x30 (即 UnrealScript ZNetwork_DJ.ROOM_INFO.MapInfo[MAX_MAP_COUNT]，常數 MAX_MAP_COUNT = 6)。因此即使封包送 12 筆，客戶端也只解析並寫入前 6 筆，其餘捨棄。

## 2. 我們送的內容對不上的地方
1. 欄位語意錯誤：
   - 伺服器在 record + 0x04 填入 `i === effectiveSelectedIdx ? 1 : 0`，誤以為是 selected flag。
   - 實際上組語 0x107ebbbd 讀取該 byte 寫入 ebp+0x08，對應 MAP_INFO.Round！非選中地圖被寫入 Round=0。
   - record + 0x02 (Time), record + 0x05 (Kill), record + 0x07 (Goal) 目前伺服器皆填 0。
2. 筆數：
   - 伺服器送 count=12，但 pRoom.MapInfo 只有 6 格 (MAX_MAP_COUNT=6)。

## 3. 面板清單與 m_MapInfoList / lb_MapList 的關係（核心根因）
- **不是同一份資料！**
- 面板清單（房間中間 6 列）：來自 `MyRoomInfo.MapInfo[0..5]`，確實由 `Map_Change_All_SN 0x00220226` 正確寫入。
- 設定對話框 (`ZPopup_RoomSet.uc:568`) 與選擇彈窗 (`ZPopup_MapSelect.uc:168, 259`) 的地圖清單：
  - 來自 `CacheManager.GetSortMapInfoList()` 經 `ZNetwork_DJ.static.Account_MapList_Check(MapIndex)` 過濾。
  - `Account_MapList_Check` (ZNetwork_DJ.uc:1094) 檢查 `default.m_MapList` (MAP_LIST_INFO 陣列)。
  - `m_MapList` 只能由 `UZNetwork_DJ::Account_Map_Add` (0x107323e0) 新增。
  - 而 `Account_Map_Add` 在整個客戶端中**唯二**的引用為自身 thunk (0x107018fc) 與 `ZDispatchAccount::MapInfo_SN` (0x107c4cd3，對應 opcode `0x00210115`)。
  - 伺服器在登入流程（`gamelogin.dispatch.js`）**從未送出 `0x00210115`**！
  - 導致客戶端 `m_MapList` 永遠為 0 筆，`Account_MapList_Check` 全部回傳 false，對話框地圖清單全部被濾除為 0 筆！
