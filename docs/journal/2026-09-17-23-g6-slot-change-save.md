# G6：機庫換裝備保存（2026-09-17）

狀態：🟡 待高階審查；本篇由 Codex 中階在 `flash-wip` 完成，沒有把開關預設打開。

## 分析

- [SRC] 解密客戶端 `ZPage_Hangar.uc:1183-1209` 的 `SlotChangeSend` 先從
  `My_Slot_Get(SlotIndex).Part[n].SerialIndex` 複製六個值，再呼叫
  `Hangar_Slot_Change(SlotIndex, Data[0], ..., Data[5])`。
- [SRC] 同檔 `MyItem` 將欄位明名為 `SerialIndex`（唯一序號）與
  `RepresentIndex`（物品屬性）；因此 `0x00240107` 的 7 個 dword 是
  `slot + body/main/left/right/equipment/skin` 的 item serial，不是 catalog
  item code。
- [SRC] 客戶端換機體時 `PartIndex == 0` 會把 skin `Data[5]` 清成 0；因此
  server 必須允許任一 part serial 為 0，不能把它當成格式錯誤。
- [SRC] 客戶端 `SlotChangeRecv` 在 `0x00240108` 成功後重新呼叫
  `SlotUpdate`、`PreviewLoad`、`InvenUpdate`、`ShopUpdate`；所以回應要保留
  現有 7 dword loadout payload，而不是只回 6-byte generic SA。
- [DLL] `Slot_Change_CQ` export thunk `0x10701429` 跳到本體
  `0x107e0c50`。`0x107e0cbb`--`0x107e0d30` 把腳本傳入的 slot 0..6 映成
  線上值 1..7（其他值映成 8）；`0x107e0d3c`--`0x107e0d7c` 依序把六個
  參數寫到 frame，`0x107e0dbb` 寫入 SA opcode `0x00240108` 後送出 CQ。
- [DLL] `Slot_Change_SA` export thunk `0x10705d30` 跳到本體
  `0x107dde80`。成功條件在 `0x107ddee5`--`0x107ddefd` 檢查
  EventMessage／ErrorMessage 都為 0；`0x107ddf03`--`0x107ddfe9` 從 payload
  的 slot 與後續六個 dword 逐一更新本地槽位。因此完整 body 是 6-byte
  `FNETWORK_EVENT_INFO` 加 0x1c-byte payload，共 0x22 bytes。

## 實作決定

- `database/db.js` 新增交易函式 `saveEquippedLoadout`。它先確認所有非零
  serial 屬於目前帳號，再清除目標機體 0..5 part 的 equipped，清除選中 serial
  在其他位置的 equipped，最後以 `mech_type`／`part_slot` 寫回六個位置。
- `room.dispatch.js` 的 `EQUIP_SAVE_MODE` 預設為 `'disabled'`。開啟時才在
  `0x00240107` 收到後呼叫 DB 函式；成功回 `0x00240108` status/result=0，
  DB 失敗回 status/result=1，兩者都保留 0x1c-byte payload。
- `buildSlotChangePayload` 與既有 ItemInfo 分包、G5 `PVE_SLOT_SELECT_FLOW`
  和 Grade_Info_SN 沒有改動。

## 驗證與限制

- [TEST] 尚未啟動伺服器或操作客戶端；需要操作者在開關暫時改成 enabled 後
  實測：換主武器、重登、進 PvE。
- [TEST] 先完成 `node --check` 與 diff review，再請操作者重啟 tmux `server`。
- 協作：本回合沒有可用的 `spawn_agent` 工具，未宣稱有子 agent 審查。

## 高階靜態審查（Codex Sol）

- [DLL] 已依上列位址核對 CQ／SA 欄位；腳本 `SerialIndex` 與 native 的參數
  搬移相符。靜態格式審查通過，行為仍須實測後才能標 ✅。
- [TEST] `node --check database/db.js`、`node --check dispatch/room.dispatch.js`
  與 `git diff --check 6f8a564..1af0ffd` 通過。
- [TEST] diff 僅改 `database/db.js`、`dispatch/room.dispatch.js` 與本篇紀錄；
  未改 ItemInfo 分包、`PVE_SLOT_SELECT_FLOW`、Grade_Info_SN 或 Death_SN 戰績。
- [TEST] 沒有 schema 變更；沿用既有 `items.equipped/mech_type/part_slot`，因此
  不需要資料庫 migration 腳本。開關在提交內容中仍預設 `disabled`。

## 實測 U1：被商店／庫存前置條件阻塞

- [TEST] 暫時把 `EQUIP_SAVE_MODE` 改為 `enabled` 並重啟伺服器；測試結束後
  已恢復 `disabled`。
- [LOG] `logs/session-20260917-220519.jsonl`：購買 `41200101` 時收到
  `0x00240201`，伺服器成功新增 account 1 的 items row，庫存由 34 增至 35；
  該物品是 part 4（推進器），不是主武器。
- [OBS][SHOT] 操作者重新登入後仍看不到新物品；主武器頁右側商店清單完全
  空白，左下庫存只有目前裝備的一把，見 `shots/shot-221153.png`。
- ⬜ 因客戶端沒有第二件可選裝備，無法觸發帶不同 serial 的
  `Slot_Change_CQ 0x00240107`，所以「換裝顯示／重登保留／PvE 武器」三項
  尚未測到。G6 靜態審查通過，但不能開預設；需先另案修正既有
  `ShopList_SN`／`Packege_Item_SN` 顯示路徑，再續測 G6。
