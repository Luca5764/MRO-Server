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

## 審查（Claude 高階，2026-09-17）

- 流程備註：本篇由 Codex Luna（**中階**）完成，commit 標成 `Agent: codex (高階)`、而且直接 commit 在 `reverse-work`（backlog 規定中階用 `flash-wip`）。內容沒問題，之後調度時再提醒。檔名原為 `2026-09-17-21-…`，與 `2026-09-17-21-battle-score-totals.md` 撞號，已改成 `-22-`。
- ✅ [DLL] 抽查：`0x107d95be` 寫 opcode `0x230101`、`0x107d95c8` 寫長度 `0x13`、`0x107d95d1` 寫 user（`di`）到 body+0、`0x107d95e1` 起 jump table 把 slot 寫成 1..（body+2）；`0x107db32c` 讀 `[ebx+0x1c]`（body+0x0C）raw slot 並 `dec`／`cmp 6`；`0x107db3fd` 檢查 host 後 `0x107db40d` 呼叫 `Respawn_CN`（thunk `0x1070322e`）。與本篇一致。
- 採納：`ChangeSlot_CN` 路徑與 `ChangeSlot_SN` 讀取偏移 ✅；+0x04..+0x09、完整長度仍 ⬜。

## 實作（Claude，測試 T）

- `dispatch/lobby.dispatch.js`：新增 `PVE_SLOT_SELECT_FLOW = 'client'`。
  - `BeginRound_CN` 後**不再自動送 `Respawn_SN`**（改回 `'auto'` 可恢復舊行為）。
  - `case 0x00230101` 原本被當成「Lobby Enter」並回 6 bytes 空包＋房間列表，改成 ChangeSlot：記下 slot 到 `currentHangarSlot_`，回 `ChangeSlot_SN`（status／result 0、+0x0A user、+0x0C slot）。
  - 客戶端之後送 `Respawn_CN 0x00230103`，沿用既有 handler 回 `Respawn_SN`。
- 這是**兩個互相依賴的改動**（沒有自動重生就必須靠 ChangeSlot 路徑出場），無法拆成兩次測試；用旗標保留回退。
- 玩家陣亡後的 5 秒自動重生**沒改**。
- 伺服器 21:2x 重啟。

## 測試 T 結果與修正（21:13–21:20）

- ✅ [OBS] 開局**跳出選機體畫面**，可以選。
- ✅ [LOG]（`session-20260917-211144.jsonl`）13:13:03 `ChangeSlot_CN 010003`（user 1、slot 3）→ 伺服器 `ChangeSlot_SN` → 客戶端立刻送 `Respawn_CN 0x00230103` → 伺服器 `Respawn_SN`；13:13:37 又重複一次。流程完全照 G5 的分析走。
- [OBS] **選完之後機體沒有出來。**
- ✅ 原因（[程式碼]＋[DLL] 2026-09-16-21）：伺服器 `Game_User_SN` 的記錄裡 `rec+0x6C` 槽位數只填 1，只送了 slot 1 的 `Game_Slot_Set` 資料。選 slot 3 時，客戶端沒有那個槽位的機體與武器，`RestartPlayer` 的 `mMechIndex != 0` 條件不成立（`ZBase/DefaultGameInfo.uc` 約 1068 行），所以不會生成機體。🟡 客戶端 log 還沒讀（要關閉客戶端才會寫出）。
- 改動（單一變數：Game_User_SN 送 8 個槽位）：`dispatch/room/room-game-user.sender.js`，`rec+0x6C = 8`，`rec+0x6D + n×0x2F` 依序填 slot 1～8 的機體、主武器、左、右、推進器、skin（DB 有 equipped 資料就用 DB，否則用 `CANONICAL_LOADOUTS`）。記錄本來就是 0x1E5（8 槽）大小，封包長度不變。伺服器 21:2x 重啟。

## 測試 T2 結果（21:15–21:17，`session-20260917-211436.jsonl`）

- ✅ [LOG] `Game_User_SN` 送出 8 個槽位（`slots=1:11100101/22100101 2:… 8:…`）；13:15:32 `ChangeSlot_CN 010004`（slot 4）→ `Respawn_CN`。
- ✅ [OBS]（聊天 marker）「確實是我選的那台機體」。**PvE 選機體出擊可以用了。**
- [OBS]「被打死後是同一台重生」「理論上是要可以換的」。[LOG] 13:16:27 玩家陣亡（Death_CN type 2），伺服器仍在 5 秒後自動送 `Respawn_SN`，跳過了選機體畫面。
- [LOG] 客戶端 log（Map_PC04）有 `MRNavigation ... CalcNodeSort_CoreEscort Accessed None 'NodeActor'` 警告，地圖導航資料相關，先記錄。
- 改動（單一變數）：`PVE_SLOT_SELECT_FLOW === 'client'` 時，玩家陣亡**不再自動排程 `Respawn_SN`**，等客戶端走選機體 → ChangeSlot_CN → Respawn_CN。伺服器 21:2x 重啟。

## 測試 T3 結果（21:19–21:22，`session-20260917-211810.jsonl`）

- ✅ [LOG] 13:19:08 開局選 slot 7（`ChangeSlot_CN 010007` → `Respawn_CN` → `Respawn_SN`）；13:21:18 陣亡；13:21:31 **重新選 slot 8**（`010008` → `Respawn_CN` → `Respawn_SN`），伺服器沒有自動重生。
- ✅ [OBS]「有成功切換到指定機體」。
- ✅ [LOG] 13:22:12 再次陣亡後重生次數用完 → `Campaign_CN 01 00 02` → `EndGame_SN`，流程正常。
- ✅ 結論：**PvE 開局與陣亡後都能透過選機體畫面選任一槽位出擊。** `PVE_SLOT_SELECT_FLOW = 'client'` 保留為預設。
