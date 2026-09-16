# ★ `m_MapInfoList` 為空：事件在寫入之前就觸發

> 從 docs/opcode-ledger.md 第 1035–1070 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16，Ghidra 反編譯 `ZDispatchRoom::Map_Change_All_SN`（`0x107ebab0`）：

```c
Event_Call(this, L"NETWORK_ROOM_INFO", 0);      // ← 先通知腳本
pRoom = Room_Info_Get(this);
if (pRoom == NULL) { log; return; }             // 無房間資訊則丟棄

pRoom[0x24] = body[0x00];
count       = body[0x01];
pRoom[0x20] = 0;  pRoom[0x28] = 0;
pRoom[0x2c] = count;
p = body + 0x06;  dst = pRoom + 0x30;
do {
    dst[0x00] = *(ushort*)(p - 4);   // body+0x02  地圖 ID
    dst[0x0c] = *(ushort*)(p - 2);   // body+0x04
    dst[0x08] = *(byte  *) p;        // body+0x06
    dst[0x10] = *(ushort*)(p + 1);   // body+0x07
    dst[0x14] = *(ushort*)(p + 3);   // body+0x09
    ...
```

**兩項確認：**

1. **記錄確實從 `body+0x02` 起、每筆 9 bytes**，欄位配置與我方實作一致——`MAP_ALL_HEADER_MODE = 'compact'` 正確。
2. **`Event_Call(NETWORK_ROOM_INFO)` 在寫入 `FROOM_INFO` 之前觸發。** 腳本在該事件裡讀房間資訊，讀到的是**上一次的內容**。第一個封包送達時那是空的——正好對應客戶端回報的 `ZPopup_MapSelect` 走訪 `m_MapInfoList` 得到 `0/0`。

**實驗（已上線）**：同一個封包**連送兩次**（`MAP_ALL_SEND_TWICE = 'enabled'`）。第二次的事件觸發時，第一次寫入的清單已經就位。

⬜ 若無效，代表腳本並非在該事件讀取，或另有前置條件。

> `Room_Info_Get()` 回傳 NULL 時整個封包被丟棄且只留一行 log——若未來地圖清單完全沒反應，這是要先排除的可能。

---

