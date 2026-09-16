# WearInfo 槽位關聯鍵錯位：已修，待實測（2026-09-16）

> 從 docs/opcode-ledger.md 第 1607–1622 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

✅ 已確認 [DLL] `WearInfo_SN` 本體 `0x107c46e0`：`0x107c4877` 複製 0x34-byte 記錄到基準 `esp+0x1c`；`0x107c4a13` 讀 `esp+0x24`，即 **rec+0x08**，作為 `Slot_Info_Set(userSlot, 0, key)` 的第三參數。後續裝備取 rec+0x10、+0x18、+0x20、+0x28、+0x30。

`Slot_Info_Set`（thunk `0x10709c32`）先清空機庫槽位，再以此 key 查物品表 `[this+0x81c]` 每筆的第一個 int；找不到便返回。`ItemInfo_SN`（`0x107c4560`）組語確認將 rec+0x00 傳入 `Item_Add` p1，作為該 key。故 WearInfo 的每組第二個 u32 必須是 ItemInfo 的物品實例 ID，而非 item code。

原伺服器的 `[uniqueKey, itemIndex]` 使客戶端拿 item code 查實例表，槽位全空。已在 `account.dispatch.js` 與 `gamelogin.dispatch.js` 同步改成 `[itemIndex, uniqueKey]`，未改 Game_User_SN 或其他開局時序。

✅ 已確認 [TEST] 兩檔通過 `node --check`。取 `session-20260916-200401.jsonl` 兩條連線的真實 ItemInfo/WearInfo，執行修改後的序列化迴圈，再依 DLL 的 key 查找方式重播：每條連線成功配對由 **0 → 24**。

⬜ 未知／下一個獨立問題：兩條登入路徑都刻意過濾 `part_slot=0`，8 個機體本體不在 ItemInfo。此次只修關聯鍵，未解除過濾；因此不能宣稱已解決選機體 UI。程式註解稱本體資料曾造成斷線，需先追清 ItemInfo/Cache 資料再恢復。

✅ 已確認 [OBS] 修正後重新登入，使用者觀察到機庫初始仍未直接顯示內容，但滑鼠移到選單會出現預覽圖；點擊預覽圖後，機體與裝備均正常顯示。伺服器同時收到各槽位的 `Slot_Change_CQ 0x00240107`，並能依槽位填入 body/main/left/equipment。這證明 WearInfo 關聯鍵修正已恢復機庫的實際資料鏈；初始畫面採延遲／互動載入，不能再以「登入瞬間空白」單獨判定資料失敗。

⚠ 上一段「part_slot=0 過濾可能仍阻止 UI」的風險在機庫路徑上已被本次觀察降低：即使 ItemInfo 未列本體，點擊後機體仍能顯示。它是否影響戰鬥選機體仍需新開局單獨確認。

