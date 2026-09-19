# 房間頭像：R14／R15 實驗都失敗，PilotCode 值不是唯一關卡（已被 2026-09-19-0330-d1-step4-room-join.md 「BOUNDARY-SWAP 實機驗證」更正：頭像不顯示是格子被當成關閉，不是 PilotCode）

## 實驗

- R13（Gemini）主張：送出的 `PilotCode=101` 是創角時的 BeginSet 編號（[SRC] `ZPage_Account.uc:241-247`），`GetImageIndex(101)` 會得到 0，貼圖座標變成負數（[SRC] `ZPanel_TeamMember.uc:278-281`），所以格子空白。
- R14：開關 `ROOM_USER_PILOT_CODE_MODE='item_index'`，101 改送 `51500101`（[CACHE] 預設駕駛員，ImageIndex 9）。[LOG] `session-20260918-222223.jsonl` ms 740175：`0x00220233` 與 `0x00220402` 都送 `45d41103`。[OBS] 仍無頭像。
- R15：同一開關改送 `51100801`（ImageIndex 1，座標等於 `AvatarImage` 預設矩形），用 `/reload` 套用。[OBS] 仍無頭像。

## 已排除（R15 子 agent 靜態核對，🟡 中階結論經高階抽讀）

- 寫入鏈：兩個封包都寫進 room user record+0x38（[DLL] `0x107339e0`、`0x1072c810`），與 `ZNetwork_DJ.uc:404-420` 的 `ROOM_USER_INFO.PilotCode` 位置吻合。
- 封包順序：`User_Default_SN` 送出時就已經帶正確的值。
- UI 閘門：`ZPanel_TeamMember.uc:220-221` 的 `SetAvatarImage(); i_Avatar.Show();` 和名稱顯示在同一個區塊；名稱有出現，這兩行也應該有執行。
- ImageIndex 9 與 1 都失敗，所以「貼圖那一格有問題」的假設排除。

## 剩下的嫌疑（⬜）

- 執行期 `GetImageIndex` 是否真的回傳非 0：不能附加除錯器，無法直接觀察。
- `i_Avatar` 的材質在房間場景是否真的有載入（`Room_04` 在加密的 `.tzp` 裡，尺寸未驗證）。
- 客戶端裡找不到任何「確定能運作」的駕駛員頭像畫面可以對照（大廳那一行是被註解掉的死碼）。原廠這條路徑是否真的用過也存疑。

## 處置

- 暫停。R14 開關維持 disabled，程式留在 `flash-wip-r14`，不合併。
- 下一步需要新證據才值得再試。例如找原廠時期的房間截圖，確認是否真的有頭像；或解出 `Room_04` 材質。
