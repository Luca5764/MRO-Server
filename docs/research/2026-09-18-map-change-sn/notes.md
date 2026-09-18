# Map_Change_One_SN 0x00220223 handler disasm (🟡 待審，子 agent 產出，唯讀)

## dispatch 解析
- [DLL] `tools/dispatch-map.py 0x10709507` (ZDispatchRoom::Dispatch) 對到：
  - Room_Default_SN 0x00220203 -> thunk 0x10706d7f -> body 0x107ea3e0
  - Map_Change_One_SA 0x00220222 -> thunk 0x107068e3 -> body 0x107eb510
  - Map_Change_One_SN 0x00220223 -> thunk 0x10708ae4 -> body 0x107eb6f0  (以上 thunk 位址是一段 jmp table，各 opcode 走到裡面不同的 jmp 條目)
  - Map_Change_All_SA 0x00220225 -> thunk 0x1070187f -> body 0x107eb870
  - Map_Change_All_SN 0x00220226 -> thunk 0x10703ca1 -> body 0x107ebab0

## Map_Change_One_SN body 0x107eb6f0 全函式（開頭到所有 ret）
```
0x107eb6f0  mov al,[ecx+4]; test al,al; jne 0x107eb711      ; ecx=this(0xeac-based obj)；flag==0 分支只做 log
  分支A(al==0): call 0x10703f4e(log,字串@0x10837550/0x10837574) -> jmp 0x107eb758(共用尾端，ret 8，無資料寫入)
0x107eb711  分支B(al!=0，正常路徑):
  push 0/字串@0x10837594 -> mov ecx,0x108e9b70 -> call [0x1091b990] -> call 0x107097ff
  mov ecx,0x108e9b70 -> call [0x1091b990] -> call 0x10703de6      ; 0x10703de6 -> 0x10718d00: lea eax,[ecx+0xeac]; ret
  test eax,eax; jne 0x107eb76c                                    ; eax 非0(取得 room 結構)才進主流程
  分支C(eax==0): log(字串@0x108375b8) -> jmp 0x107eb758 -> ret 8 (無資料寫入)
0x107eb76c  主流程(eax = this+0xeac，即房間/MyRoomInfo 相關結構指標):
  push esi; mov esi,[esp+8]                     ; esi = 封包指標(第二個參數)，body 從 esi+0x10 開始
  movzx ecx, byte [esi+0x10]                     ; ecx = body+0x00 = b0
  movzx edx, word [esi+0x11]                     ; edx = body+0x01(2B) = w1
  push edi
  lea edi,[ecx+ecx*2+6]; mov [eax+edi*8],edx      ; MapInfo[b0].+0x00 (=eax+0x30+24*b0) = w1
  movzx edx, word [esi+0x13]                      ; edx = body+0x03(2B) = w2
  lea ecx,[ecx+ecx*2]; lea edi,[eax+ecx*8]        ; edi = eax+24*b0
  mov [edi+0x3c], edx                             ; MapInfo[b0].+0x0c = w2
  movzx eax, byte [esi+0x15]                      ; eax(被覆寫!) = body+0x05(1B) = b5
  mov [edi+0x38], eax                             ; MapInfo[b0].+0x08 = b5
  movzx ecx, word [esi+0x16]                      ; ecx = body+0x06(2B) = w6
  mov [edi+0x40], ecx                             ; MapInfo[b0].+0x10 = w6
  movzx edx, word [esi+0x18]                      ; edx = body+0x08(2B) = w8
  mov [edi+0x44], edx                             ; MapInfo[b0].+0x14 = w8
  call [0x1091ba60]                                ; 全域函式指標，呼叫時 ecx 仍是 w6 殘值，非正常 this——語意不明
  test eax,eax; jne 0x107eb7db
  分支D(eax==0，call 回傳 false): log(字串@0x108375fc) -> call 0x10709156(字串@0x10837620) -> pop edi; pop esi; ret 8
    (寫入已發生，但不做後面的 map-list 反查)
0x107eb7db  分支E(eax!=0):
  push ebx; mov ebx,[eax+0x84]                     ; 原始 eax 已被覆寫成 b5；這裡的 eax 其實是分支D之前的殘值——
                                                     ; 需注意：0x107eb7db 執行時 eax 早在 0x107eb78e 已改成 b5 (byte)，
                                                     ; 這裡 [eax+0x84] 用的是「b5 當指標」，明顯是 Ghidra/我方手動追蹤
                                                     ; 該處反組譯需要再核對一次——見下方「不確定」
  xor ecx,ecx; test ebx,ebx; jle 0x107eb816(直接 ret，不寫入 entry+0x04)
  mov eax,[eax+0x80]                                ; list 陣列基底
  movzx esi, word [esi+0x11]                        ; esi 被重用 = w1(mapId)，覆寫掉原本的封包指標！
  迴圈: cmp dword[edx], esi; je 命中 -> ecx*0xbc; eax=[ecx+eax+0x18]; mov [edi+0x34],eax  ; MapInfo[b0].+0x04 = 命中元素+0x18
       未命中: edx+=0xbc; ecx++; ecx<ebx 繼續，否則 pop pop pop ret 8（不寫 entry+0x04）
  結束: pop ebx; pop edi; pop esi; ret 8
```

## 與既有 journal 交叉核對
- `docs/journal/2026-09-18-10-map-change-one-sa.md` 已記錄 SA (`0x107eb510`) 的 payload 欄位語意表：
  b0=MapNumber/slot、w1=MapIndex(map id)、w2=MapTime(→record+0x3C)、b5=MapRound(→+0x38)、
  w6=MapKill(→+0x40)、w8=MapCapture/Goal(→+0x44)。
- 這次反組譯 SN(`0x107eb6f0`) 得到的 record 內偏移**完全一致**：+0x00(w1)/+0x08(b5)/+0x0c(w2)/+0x10(w6)/+0x14(w8)，
  只是我方是相對 `eax`(=this+0xeac) 直接算 `0x30+24*b0` 起算，SA journal 是相對 MapInfo record 起點算 `+0x38/+0x3C/...`，
  兩者對得上（record 起點 = eax+0x30+24*b0）。
- **新發現**：SN 多了 SA journal 沒提到的一段——用 `[eax+0x80]`(陣列)/`[eax+0x84]`(count)/stride `0xbc` 對 w1(mapId) 做線性搜尋，
  命中則把該元素 `+0x18` 複製進 `entry+0x04`。SA 的 journal 沒記錄這段，不確定 SA body 有沒有等價邏輯（本次沒重讀 SA 尾端）。
  `[eax+0x80]/[eax+0x84]` 疑似與 `docs/journal/2026-09-15-16-map-change-all-sn-zero-entries.md` /
  `2026-09-16-07-map-info-list-empty-event-order.md` 提到的 `m_MapInfoList`（Map_Change_All_SN 解析出 0 筆）是同一個陣列，
  但**沒有實際 xref 或變數名稱佐證，只是位置與行為吻合**，標 🟡。
- `docs/research/2026-09-18-room-setting/notes.md:171-192` 已用 Room_Default_SN 反組譯確認
  `MyRoomInfo.MapInfo[0].Index` 讀到的就是 `pRoom+0x30`（body+0x20 那筆）。本次 SN 反組譯確認 `pRoom+0x30` 正是
  `entry(b0=0)+0x00`，也就是 SN/SA 寫 `w1` 的同一個位置。**三個封包 (Room_Default_SN body+0x20、Map_Change_One_SA
  body+0x06起的w1、Map_Change_One_SN body+0x00起的w1) 最終都寫同一塊記憶體 `pRoom+0x30`**。

## 更正（原稿誤判，已修正）
- 原稿曾誤以為 `0x107eb7db` 用的 `eax` 是殘留的 `b5`（byte）。重新核對組語後：`0x107eb78e` 的 `movzx eax,[esi+0x15]` (=b5)
  之後，`0x107eb7a3 call [0x1091ba60]` 的回傳值 (`eax`) 會覆寫掉 b5，`0x107eb7a9 test eax,eax` 測的就是這個新 eax。
  所以 `0x107eb7db` 起的 `eax` 是 `call [0x1091ba60]` 的回傳值（非空指標），不是 b5。分支 E 的追蹤是對的，**不再是待驗證項**。
- 因此 `call dword ptr [0x1091ba60]` 語意更可能是「取得某個含 `+0x80`(陣列)/`+0x84`(count) 的物件指標」，回傳 NULL 就走分支 D
  （log + 不查表），非單純 bool 旗標。這個物件是否就是 `m_MapInfoList` 仍待驗證（見下）。

## 不確定 / 需要再核對
- `call dword ptr [0x1091ba60]` 的語意未知（回傳值決定要不要做 entry+0x04 查表），沒有確認它是否單純回傳 bool 還是也有副作用（例如標記 UI dirty）。
- 全程沒有看到任何呼叫看起來像「重繪/UI 更新」的函式（沒有典型的 vtable virtual-draw 呼叫），但因為 `[0x1091ba60]`
  語意不明，不能排除它間接觸發重繪。
- 沒有重讀 Map_Change_All_SN(`0x107ebab0`) 或 Room_Default_SN(`0x107ea3e0`) 全文比對 entry+0x04 欄位是否也被這兩個封包寫入。
