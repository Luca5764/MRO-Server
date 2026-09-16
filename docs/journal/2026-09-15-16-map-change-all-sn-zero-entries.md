# ⬜ `0x00220226` Map_Change_All_SN — 客戶端解析出 0 筆（實驗進行中）

> 從 docs/opcode-ledger.md 第 631–663 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。房主修正生效後首次成功按下「遊戲開始」，客戶端仍以預設值組 URL 並崩潰。客戶端 log 指出原因：

```
Error: ZPopup_MapSelect Package.ZPopup_MapSelect
  (Function ZGameMainMenu.ZPopup_MapSelect.OnDraw_Preview:07DD)
  Accessed array 'm_MapInfoList' out of bounds (0/0)     ← 出現 10 次
ScriptLog: MyRoomInfo.MapInfo[0].Round=1
ScriptLog: [ ZPage_Room ][ GameStart ]  start Store_01?...?team=255
```

`m_MapInfoList` **0 筆**：我方送出的 12 筆地圖清單被解析成空的。房間「目前地圖」有設定（畫面正確顯示動力奪取戰、`MyRoomInfo.MapInfo[0]` 存在），但「可選清單」是空的——兩者來源不同。

### 假設：header 多了 4 bytes

我方原本的 body 為 `flag(1) + count(1) + uint32(4)` 再接 9-byte 記錄（記錄起點 `0x06`）。兩個獨立證據指向記錄應從 `0x02` 開始：

1. **`User_Default_SN`（已由反組譯驗證）**：`flag(1) + count(1)` 之後記錄**緊接**在 `0x02`，無空隙。
2. **`Map_Change_One_SN`（`0x00220223`）**：body 恰為 10 bytes = `flag(1)` + 一筆 9-byte 記錄，同樣無空隙。

若慣例一致，多出的 4 bytes 會讓整批記錄偏移，客戶端解析出垃圾。

**實驗（已上線）**：`MAP_ALL_HEADER_MODE = 'compact'`，記錄改從 `0x02` 開始，body 由 `6+N*9` 變為 `2+N*9`（12 筆時 114 → 110）。`'padded'` 可回退。

> 原程式碼註解宣稱 `0x06` 是「客戶端解析器期待的格式」，但同一作者在 `User_Default_SN` 的欄位排列是錯的，該註解不足採信。

### ⬜ 仍未解決：`team=255`

`User_Default_SN` 欄位修正後玩家仍不在使用者陣列中（URL 仍為 `team=255`）。房主判定已通過（`Room_Master_Check` 只比對兩個整數，不需要陣列），但 `Game_User_Team_Get` 仍找不到本地玩家。原因未明。

---

