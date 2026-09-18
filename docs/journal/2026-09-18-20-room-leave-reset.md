# L1 Leave_CQ 0x00220234 未重設房間狀態 → 大廳機庫商城空白

狀態：✅ Claude 高階裁定＋實測；`ROOM_LEAVE_RESET_MODE` 預設 enabled。

## 症狀

- [OBS] T2（2026-09-18）：先在 PvE 房內、後回大廳進機庫，商城都沒有商品。

## 根因

- [LOG] `session-20260918-220544.jsonl`：`Hangar Open_CQ 0x00240101` 三次都只回 14-byte 的 `Open_SA 0x00240102`，沒有 PackageMoney／ItemInfo／WearInfo／ShopList `0x00240241`。伺服器 console 印出 `Suppressed Hangar bootstrap in campaign room`。
- [CODE] `room.dispatch.js` 的 `0x00240101` 在 `client.campaignRoom_ && client.createdRoomIndex_ != null` 時直接 return（原作者 `e01f1bb` 加入，原因未記載）。
- [LOG] 按「返回」離開房間時，客戶端送的是 `0x00220234`。[DLL] `tools/dispatch-map.py`：回應 `0x00220235` 是 `ZDispatchRoom::Leave_SA`，所以 `0x00220234` 就是離開房間的 CQ。
- [CODE] `gate.game.dispatch.js` 對 `0x00220234` 只回 SA，不呼叫 `resetRoomSessionState`；後者只掛在 `0x00240111`。因此 `campaignRoom_` 在回大廳後仍是 true。

## 修正與實測

- 收到 `0x00220234` 回完 SA 之後呼叫 `resetRoomSessionState(client)`（單一變數）。
- [LOG] `session-20260918-221216.jsonl:89`：收到 `0x00220234`；行 99 起送出完整的 `ShopList 0x00240241`。
- [OBS] 回大廳後進機庫，商城正常顯示商品。

## 未處理

- 🟡 在房間內開機庫仍然被抑制（原作者刻意寫的規則）。原廠是否允許在房內開商城，⬜ 未查。
- `0x00220234` handler 的註解仍寫「EXPERIMENT, purpose unconfirmed」，實際上已由 dispatch map 對上 Leave_SA；本篇不改那段註解。
