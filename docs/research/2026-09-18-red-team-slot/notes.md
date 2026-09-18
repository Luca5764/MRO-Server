# RED TEAM 槽位空白 — 原始 disasm 與封包 dump（中階子 agent，🟡 待審）

範圍：唯讀。來源：
- ZNetwork.dll `Room_Default_SN@ZDispatchRoom`，thunk `0x10706d7f`（純 `jmp 0x107ea3e0`，無參數處理），
  本體 `0x107ea3e0`，`tools/disasm.py at 0x107ea3e0 260` + `at 0x107ea685 200` 讀到 `ret 8`（`0x107ea6d4`）。
- User_Default_SN 本體 `0x107ee2d0`，`tools/disasm.py at 0x107ee2d0 60`（只為確認 body 指標的 +0x10 慣例，未整份讀）。
- `~/mro-decrypted/src/ZGameMainMenu/ZPage_Room.uc:2456-2470`（Red/Blue 比對邏輯）。
- `~/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc:558-588`（`ROOM_INFO` struct 宣告，`MAX_MAP_COUNT=6`）。
- `Metal Rage Online Server/dispatch/room/room-state.sender.js`、`dispatch/gate.game.dispatch.js:568-616`。
- `Metal Rage Online Server/logs/session-20260918-180349.jsonl`（實際封包 hex，含 CQ_CREATE / SN_ROOM_DEFAULT / SN_USER_DEFAULT）。

## 提前 return 清單（0x107ea3e0 → 0x107ea6d4 全函式）
1. `0x107ea3e6 test al,al; jne 0x107ea419`：`al=[ecx+4]`（dispatcher this 指標欄位，非封包內容）。`al==0` → `0x107ea3ea-0x107ea416 ret 8`（錯誤訊息分支，字串常數 `0x108365b8`/`0x108365d8`）。
2. `0x107ea479 test esi,esi; jne 0x107ea4ae`：`esi = call 0x10703de6` 回傳值（RoomInfo 指標）。`esi==0` → `0x107ea47d-0x107ea4ab ret 8`（另一組錯誤字串 `0x1083663c`/`0x1083665c`）。
兩個提前 return 都跟封包欄位值無關（是狀態／指標檢查），**封包內容本身沒有任何分支會提前結束**，body 一路解到 `0x107ea6d4 ret 8`。

## 關鍵組語（原始位址，未套用任何偏移換算）
```
0x107ea426  mov   ebx, dword ptr [esp + 0x14]      ; ebx = 傳入指標（非直接等於 body[0]，見下方換算）
0x107ea4ae  movzx eax, word ptr [ebx + 0x12]
0x107ea4b2  mov   dword ptr [esi + 4], eax
0x107ea4b5  movzx eax, byte ptr [ebx + 0x14]        ; RoomType remap 來源（既有研究已定位此位址範圍）
...
0x107ea4f1  movzx ecx, word ptr [ebx + 0x20]
0x107ea4f5  mov   dword ptr [esi + 0xc0], ecx        ; <-- 候選 RedTeamIndex
0x107ea4fb  movzx edx, word ptr [ebx + 0x22]
0x107ea4ff  mov   dword ptr [esi + 0xc4], edx        ; <-- 候選 BlueTeamIndex
...
0x107ea601  lea   ebp, [ebx + 0x34]
0x107ea604  add   esi, 0x30                          ; esi 現在 = RoomInfo+0x30（MapInfo[6] 陣列起點）
0x107ea607  movzx edx, byte ptr [ebx + 0x2f]          ; entryCount，迴圈上界比對
0x107ea632  movzx eax, word ptr [ebp - 4]; mov [esi], eax     ; entry.Index，第一筆讀 ebx+0x30
0x107ea6a1  add ebp, 9
0x107ea6a4  add esi, 0x18
0x107ea6a7  cmp eax, 6; jl 0x107ea607                  ; 迴圈跑滿 6 次 = MAX_MAP_COUNT
```

## 指標換算（推論，非直接看到單一行組語寫死）
`ebx`（`[esp+0x14]`）不是 wire body 的第 0 byte，而是 **body 指標 + 0x10**。依據（多欄位交叉驗證，見下方 python 實測比對）：
- entry 迴圈第一筆讀 `ebx+0x30`（`ebp-4`），迴圈跑 6 次、每筆 9 bytes——與 `room-state.sender.js` 的
  `entryOffset = 0x20 + i*9`、`MAX_MAP_COUNT=6` **只有在假設 wire = ebx-0x10 時才完全對得上**（`ebx+0x30-0x10=0x20`）。
- `ebx+0x14`（RoomType remap 來源）在 wire=ebx-0x10 假設下 = body+0x04，**跟實際封包 dump `body[0x04]=1`
  （sender 寫的 `roomType`）完全吻合**，也跟既有研究 `docs/research/2026-09-18-room-setting/notes.md:158-165`
  獨立得出的「body+0x04」結論一致（等於互相佐證，不是同一次分析）。
- `ebx+0x20/0x22`（候選 RedTeamIndex/BlueTeamIndex）在此假設下 = **body+0x10 / body+0x12**，
  跟實際封包 dump 完全吻合：見下方數字比對。
- 反例／未解：`ebx+0x2f`（entryCount 迴圈上界）在同一假設下 = body+0x1F，但 `room-state.sender.js:81-83`
  的註解宣稱「body+0x2F 才是真正的 slot-count 欄位」。這次測試封包裡 body[0x1F] 與 body[0x2F] **剛好都是 6**
  （entryCount 本身=6，兩處寫入同值），**無法用這次封包區分兩個假設何者為真**，待其他不同 entryCount 的封包驗證。
  這點沒有解決，見下方「不確定」。

## 實測封包比對（`logs/session-20260918-180349.jsonl`，2026-09-18T10:06:16-17Z）
CQ_CREATE `0x00220201`（recv, 51 bytes）：`createWord1=readUInt16LE(2)=9010(0x2332)`，`createWord2=readUInt16LE(4)=60(0x3C)`
（`dispatch/gate.game.dispatch.js:576-577`）。

SN_ROOM_DEFAULT `0x00220203`（send, 538 bytes，兩筆內容相同）：
- `body[0x10:0x12] LE = 9010` —— 與 CQ_CREATE 的 `createWord1` 完全一致，證實 sender 確實把
  `client.createWord1_` 原封寫回這個位置（`room-state.sender.js:61`）。
- `body[0x12:0x14] LE = 60` —— 同理對應 `createWord2_`（`room-state.sender.js:62`）。
- `body[0x04] = 1`（roomType，與 sender 一致）。

SN_USER_DEFAULT `0x00220233`（send, 54 bytes）：`record+0x11`（= body+0x13）= `0x00` → **TeamIndex = 0**
（與任務描述的已知資訊一致，這次用 hex 直接複驗過）。

## 結論代入 ZPage_Room.uc:2456-2470
```
if( PlayerList[Count].TeamIndex == TempRoomInfo.RedTeamIndex )       // 0 == 9010 ? 否
else if( PlayerList[Count].TeamIndex == TempRoomInfo.BlueTeamIndex ) // 0 == 60   ? 否
// 兩個分支都不成立 → 這名玩家完全沒有被塞進 p_Red 或 p_Blue 陣列的任何一格
```
**這次實測封包裡，玩家會兩隊都進不去**（不是「被分到藍隊」，是紅藍都比對失敗），與操作者截圖
「RED TEAM 全空」的症狀一致（若藍隊畫面同樣沒人，這個解釋可以完全涵蓋症狀；本次子 agent 沒有看到
藍隊部分的截圖描述，待主力核對）。

## 待審 / 不確定
- 🟡 `ebx = bodyPtr+0x10` 這個換算是**多欄位交叉比對推論出來的**，不是單一行組語明文寫「+0x10」；
  没有找到／没有時間找對應的呼叫端（`ZDispatchRoom` 主 dispatch loop）確認這個 0x10 從哪裡來
  （猜測：16-byte 訊息 header 或某個 wrapper struct，需要另外反查 dispatch loop 本體，這次沒做）。
- 🟡 entryCount 迴圈上界讀 `body+0x1F` 還是 `body+0x2F`，這次封包無法區分（兩處剛好同值）。
  不影響本題結論（RedTeamIndex/BlueTeamIndex 的欄位辨識跟這個無關），但跟 sender.js 既有註解可能矛盾，
  留給主力／下一輪驗證（建議送一個 entryCount 與尾端 byte 明顯不同的封包來源測試）。
- ⬜ 沒有反查 `Room_Option_SN`(0x00220217)／`Room_State_SN`(0x00220214)／`Room_Boundary_SN`(0x00220213)
  是否也會寫到 `RoomInfo+0xc0/0xc4`——body 都只有 2-4 bytes，容量上不太可能塞下兩個 team index，
  但這次没有實際反組譯這三個 handler 排除，是推論不是驗證。
- ⬜ 沒有查 `record+0x13`（State 欄位錯位）跟「完全不顯示」有沒有因果關係——這次確認的是
  「不顯示」的根因在 team 比對，state 欄位錯位（目前 raw=0）另外只影響 ready/game-playing 圖示，
  不會讓 `RefreshData()` 本身被跳過（`UpdateTeamMember()` 裡沒有看到 State 相關的 early-continue）。
