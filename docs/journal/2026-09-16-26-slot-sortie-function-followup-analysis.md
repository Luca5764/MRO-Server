# 槽位／出擊函式後續分析（2026-09-16）

> 從 docs/opcode-ledger.md 第 1600–1606 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [DLL] `Game_Slot_Set`（thunk `0x10707a6d`）只將六個輸入 int 寫入 `[this+0x1040]` 使用者記錄的指定槽位；`Game_Slot_Selected_Set`（`0x10703a17`）只寫該記錄 `+0x08`。兩者本身不觸發 UI，也不轉換 item ID。尚需追查讀取端才能判定槽位要用 item code 或 Cache 索引。
- ✅ 已確認 [DLL] `ChangeSlot_SN` thunk `0x107044c6` → 本體 `0x107db2f0`，場景閘門通過後讀取 body `+0x0A` u16 user index、`+0x0C` u8 slot raw（1..7 → 0..6，其餘 → 7）。成功條件為 body `+0x00` u16 與 `+0x02` u32 均為 0。上述偏移已用組語核對；未讀欄位的用途及完整格式仍未知。
- ✅ 已確認 [DLL] 上述成功分支設定 selected slot/socket，若本機為 host，依 `Game_Item_InstantRespawn_Get(user)` 的值送 `InstantRespawn_CN`（非零）或 `Respawn_CN`（零）。因此選槽回應與後續重生存在明確呼叫鏈；尚未收到實際 ChangeSlot_CN，不提前猜造回應。
- ✅ 已確認 [DLL] `Game_User_Sally_Add`（`0x10704c28`）只在使用者表 `[0x1034]` 對應記錄的 `+0x44` 加上傳入值，本身不建立 pawn。先前「最像 spawn」僅依名稱的猜測，不能當作實際生成機體的函式。

