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
- [DLL] `docs/client-dispatch-map.md` 將 `0x00240108` 命名為
  `ZDispatchHangar::Slot_Change_SA`；現有程式實測封包 body 為 0x22 bytes，
  前 6 bytes 是標準 status/result，後 0x1c bytes 是七個 dword。
- ⬜ 本工作區沒有 `ZNetwork.dll`，因此無法可靠補寫 `Hangar_Slot_Change`
  native 的完整組語位址；不捏造位址。既有 DLL 證據只確認 server handler
  名稱與 `0x00240108` 的 dispatcher 入口。

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
