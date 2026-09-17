# ItemInfo 分包（讓機庫顯示機體的第一步）（2026-09-17）

## 背景

- [OBS] 機庫看不到機體（`2026-09-17-19`）。
- ✅ [DLL] 單一 frame > 0x400 會卡住（`0x107f8fad`），每包最多 28 筆（`state.md` 第 4 節）；分包累加 ✅ [DLL]（`2026-09-17-03`）。
- [DB] `lucas` 有 8 台機 × 4 列（part_slot 0 機體、1 主武器、2 左、4 推進器）= 32 列。目前兩條登入路徑（`gamelogin.dispatch.js`、`account.dispatch.js`）都只送 part_slot≠0 的 24 列（848 bytes）；32 列一包是 1142 bytes，會卡住。
- 🟡 假設：機庫需要機體本體列（part_slot 0）才會顯示機體。

## 分兩步，一次一個變數

- **H1（這次）：只驗證分包本身。** 新增 `dispatch/item-info.sender.js`，兩條登入路徑共用；內容跟原本一樣（24 列、不含機體列），但每包 12 筆，分成 2 包送出。預期：機庫武器顯示跟原本一樣、登入不卡、PvE 照常。
- **H2（H1 通過後）：** `ITEM_INFO_INCLUDE_BODY = true`，32 列分 3 包。預期：機庫出現機體。

伺服器 20:5x 重啟。待測：`docs/next-test.md` 測試 H1。

## H1 結果（20:48–，`session-20260917-204753.jsonl`）

- ✅ [LOG] 兩條路徑都分包送出：`[account]: 24 items in 2 packet(s)`、`[gamelogin]: 24 items in 2 packet(s)`；登入沒有卡住，接著建房、開局，戰鬥中收到 29 筆 Death_CN。
- [OBS] 操作者回報「測完了」，沒有提到機庫或登入異常（🟡 視為機庫武器顯示與原本相同，未逐項確認）。
- ✅ 分包本身可用。

## H2（進行中）

- `ITEM_INFO_INCLUDE_BODY = true`：32 列（含 8 筆機體列），每包 12 筆 → 3 包。伺服器 21:0x 重啟。

## H2 結果（20:55–20:58，`session-20260917-205346.jsonl`）

- ✅ [LOG] `[account]`／`[gamelogin]` 都送出 `34 items in 3 packet(s)`（DB 目前 34 列，多出的 id 218／219 是 equipped=0 的物品）；沒有斷線、沒有超過 0x400。
- ✅ [OBS]（隊伍／大廳聊天 marker）：「沒卡登入」「**進機庫直接有機體了**」「**切換第二台有跟著換**」。
- ✅ 結論：**機庫看不到機體的原因就是 ItemInfo 沒送機體本體列（part_slot 0）**；分包送出後機庫正常顯示。舊說法「body rows 放進 ItemInfo 會斷線」其實是大小問題（32 筆一包 1142 bytes）。
- [OBS] 但「進去 PVE 還是第一台」；在房間「選擇第三台」後開始，「還是第一台」。
- [LOG] 機庫切換機體時客戶端**沒有送任何封包**（只有 `0x00240101` Open、`0x00240103` Close）；房間選第三台時也沒有新封包。伺服器 `Game_User_SN` 的機體來自 `client.currentHangarSlot_ || 1`，只有收到 `Slot_Change_CQ 0x00240107` 才會改，所以一直是 1。
- [SRC] `ZGameMainMenu/ZPage_Hangar.uc:1876`：機庫切換只呼叫 `My_Slot_SelectedNumber_Set`（本地保存），只有機體跟槽位裡的不同時才 `SlotChangeSend`。`ZBase/DefaultPlayerController.uc:925` 在戰鬥中用 `Game_Slot(ServerIndex, SlotIndex)`（host 才能呼叫，對應 `ChangeSlot_CN 0x00230101`）。🟡 推測原版是在 PvE 開局的選機體頁（`ZGameMidMenu.ZSlotSelectPage`，我們的流程跳過了）或開局封包裡帶出選擇的槽位，待查（backlog G5）。
- 另外：伺服器 `room.dispatch.js` `case 0x00240112` 處理的其實是 SA 的編號；DLL 裡 DefaultSlot_Change 的 CQ 是 `0x00240111`（`0x107dd5b3` 寫入 opcode，`0x107e0f7c` 以 `0x240112` 等回應）。未改。
