# G5：PvE 出擊機體選擇的客戶端路徑（待審）

狀態：🟡 待審。這篇只做 DLL／解密腳本／伺服器唯讀比對，沒有改伺服器、沒有啟動客戶端。

## 結論摘要

- [DLL] 已找到完整的「玩家在 PvE 選機體 → 客戶端送槽位」路徑：
  `ZSlotSelectPage.InternalOnClose()` → `ServerMechWeaponSetIndex_MH()` → native
  `Game_Slot(UserIndex, SlotIndex)` → `ChangeSlot_CN 0x00230101`。
- [DLL] `Game_Slot` 的 wire body 是 3 bytes：`+0x00 u16 LE UserIndex`、
  `+0x02 u8 SlotNumber+1`；總長度欄位是 `0x13`（header 16 + body 3）。
  UnrealScript 內部槽位是 0..7，wire 槽位是 1..8。
- [SRC] PvE 選擇頁把畫面順序重新排列：顯示 0,1,2,3,4,5,6,7 對應內部
  0,1,3,6,5,2,4,7。這是機體類別的 UI 排列，不應直接把畫面 index 當 slot。
- [DLL] 成功的 `ChangeSlot_SN 0x00230102` handler 讀取回應 body 的
  `+0x00 u16 status`、`+0x02 u32 result`、`+0x0A u16 userIndex`、
  `+0x0C u8 slot`；成功後寫入 selected slot／socket，並由 host 觸發
  `Respawn_CN` 或 `InstantRespawn_CN`。
- [OBS][SRC] 本輪測試沒有看到 `0x00230101`，原因與「客戶端不送」不同：
  目前伺服器在 `BeginRound_CN` 後主動送 `Respawn_SN`，直接使用先前
  `Game_User_SN` 安裝好的 selected slot，實際流程跳過了選擇頁。

## 客戶端流程

1. [SRC] `ZPvePlayercontroller.PlayerSelectMech.BeginState()` 在
   `Game_Play_Check()==true` 時開啟 `ZGameMidMenu.ZSlotSelectPage`；Timer
   也會在頁面尚未開啟時補開（`ZPvePlayercontroller.uc:1413-1490`）。
2. [SRC] `ZSlotSelectPage.SlotClick`／`SlotDBClick` 只標記按鈕並呼叫
   `Controller.CloseMenu()`，沒有直接送封包（`ZSlotSelectPage.uc:236-288`）。
3. [SRC] `InternalOnClose` 將選中的畫面 index 轉成內部 `nSelMech`，在
   pawn 尚未存在且機體有效時呼叫 `PC.ServerMechWeaponSetIndex_MH(nSelMech)`；
   不可用時 fallback 到 slot 0（`ZSlotSelectPage.uc:496-575`）。
4. [SRC] `ServerMechWeaponSetIndex_MH` 只有 `SerialIndex>0` 才先送
   `Game_InstantRespawn`；機體槽位本身一律呼叫
   `Game_Slot(ServerIndex_BD, SlotIndex)`（`DefaultPlayerController.uc:916-926`）。
5. [DLL] `execGame_Slot 0x10704278 → 0x1071b790` 解析兩個 int，於
   `0x1071b81c-0x1071b823` 以原順序呼叫 `ChangeSlot_CN 0x10702d51`。

## `ChangeSlot_CN 0x00230101` wire 格式

| frame/body | 型別 | 證據 | 意義 |
|---|---|---|---|
| frame `+0x06` | u16 BE | `0x107d95c8` 寫 `0x13` | 總長度 19 bytes |
| frame `+0x0C` | u32 BE | `0x107d95be` 寫 `0x230101` | `ChangeSlot_CN` |
| body `+0x00` | u16 LE | `0x107d95d1` 寫第一參數 | UserIndex |
| body `+0x02` | u8 | `0x107d95e1..0x107d9620` | internal SlotIndex 0..7 轉成 1..8 |

`ChangeSlot_CN` 先清除 `0x10901f10` 的 buffer；`0x107d9663-0x107d966b`
把該 buffer 交給送出函式。這不是 `0x00240107` 的 hangar loadout 封包。

## `ChangeSlot_SN 0x00230102` 回應讀取

- [DLL] thunk `0x107044c6` 跳到 handler `0x107db2f0`。
- [DLL] `0x107db3a5`／`0x107db3ac` 要求 status/result 為零；
  `0x107db336` 讀 body `+0x0A` user index，`0x107db32c` 讀 body `+0x0C`
  的 raw slot。
- [DLL] raw slot 1..7 映射內部 0..6；其他值（包含 8）映射內部 7。
- [DLL] 成功時 `0x107db3c2` 呼叫 `Game_Slot_Selected_Set`，接著呼叫
  `Game_UserSocket_Selected_Set`；`0x107db3fd` 檢查 host，再於
  `0x107db40c`／`0x107db419` 送 `Respawn_CN`／`InstantRespawn_CN`。
- ⬜ handler 實際讀到的欄位已列完，但 body `+0x04..+0x09` 與 `+0x0E` 後的
  預期填充值、完整 response body 長度仍未知；不能用 6-byte EVENT_INFO
  空 body 當作已確認格式。

## Hangar 路徑與本輪實測的區別

- [SRC] 機庫切換機體時 `ZPage_Hangar.uc:1876` 先呼叫
  `My_Slot_SelectedNumber_Set`（本地值）；只有機體 item 改變時才在
  `:1881` 呼叫 `SlotChangeSend`，其 native 是 `Hangar_Slot_Change`，不是
  `Game_Slot`。
- [DLL] 另有 `Hangar_Slot_Select 0x10709c1e → 0x1071f090`，再呼叫
  `DefaultSlot_Change_CQ 0x107066f9 → 0x107e0e60`；它送
  `0x00240111`、body `u32` 的 1-based slot、總長度 `0x14`，server answer
  是 `0x00240112`。這是 hangar default-slot 路徑，不是 PvE 出擊選槽。
- [DLL][SRC] 因此目前 `room.dispatch.js:598` 監聽 `0x00240112` 並回
  `0x00240113`，與 DLL 的 CQ→SA 方向不符；程式內沒有對應的
  `0x00240111` 接收分支。這是 hangar 路徑的獨立落差，不是本次 PvE
  `0x00230101` 缺槽位的直接證據。
- [OBS][LOG] H2 測試記錄只有 hangar open/close，機庫選第二台後進 PvE
  仍是第一台；房間選第三台也沒有新封包（`2026-09-17-20`）。
- [SRC][TEST] 這與目前 server-driven 流程吻合：`lobby.dispatch.js:128-160`
  在 `BeginRound_CN` 後 250ms 直接送 `Respawn_SN`，而該 handler 使用
  `Game_User_SN` 已裝好的 selected slot，不等待 `ZSlotSelectPage` 的
  `Game_Slot`。

## 伺服器比對與待審建議

- [SRC] `gate.game.dispatch.js:231` 將 `client.currentHangarSlot_ || 1`
  傳給 `Game_User_SN`；sender 在 record `+0x10` 寫入它（
  `room/room-game-user.sender.js:145-146`）。
- [SRC] `currentHangarSlot_` 現在只在 `room.dispatch.js:618-623` 收到
  `0x00240107` hangar `Slot_Change_CQ` 時更新，沒有處理 in-game
  `ChangeSlot_CN 0x00230101`。
- [DLL][SRC] server 的 `lobby.dispatch.js:97-109` 目前把 `0x00230101`
  當 lobby request，回 6-byte `0x00230102`；client map 明確列它為
  `ZDispatchGame::ChangeSlot_SN`。這是活的 opcode／body 落差。
- 🟡 待審實作方向：接收 `0x00230101` 時，以 body `+0x00` 的 user index
  對應玩家狀態，將 body `+0x02` 的 1-based slot 保存，讓後續
  `Game_User_SN` 使用同一槽位；不要把畫面 index 或 `0x00240107` 的
  loadout payload 混用。成功後應回送符合 `ChangeSlot_SN` 讀取偏移的
  結構，精確長度需先獨立核對／測試。

原始組語摘錄：[G5 raw evidence](../research/2026-09-17-backlog/G5/slot-selection-evidence.txt)
