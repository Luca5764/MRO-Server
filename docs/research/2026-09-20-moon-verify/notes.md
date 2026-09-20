# 機械核對：MOON-1 (a)(b)(d)(e)（verifier 中階，2026-09-20）

方法：`tools/disasm.py at/xref/exports`（在 `Metal Rage Online Server/` 下執行），
`tools/ghidra/decompile.sh` 對 `0x1072cec0` 跑過一次確認。只判斷引用位址是否真的在
做描述的事，不判斷設計。全部針對 ZNetwork.dll（ImageBase 0x10700000，VA=file offset）。

## (a) Game_User_Add / Game_Item_Add 位址對調

- `tools/disasm.py exports` 命中：
  - `0x10703850  ?Game_User_Add@UZNetwork_DJ@@QAEXHHHHHPBGHH0@Z`，xref 顯示
    `0x10703850  jmp 0x10734140`
  - `0x107029ff  ?Game_Item_Add@UZNetwork_DJ@@QAEXHHHHHHHHH@Z`，xref 顯示
    `0x107029ff  jmp 0x107343e0`
- `disasm.py at 0x10734140`：`mov edx,[ebp+0x1038]`（count）→ 迴圈用
  `mov esi,[ebp+0x1034]`、`add esi,0x80` 找既有項→找不到就
  `push 0x80; lea ecx,[ebp+0x1034]; call [0x1091b8a0]`（成長陣列）→
  `shl eax,7`（=×0x80）。**+0x1034，stride 0x80，確認由 `Game_User_Add`
  （`0x10703850`）呼叫**。
- `disasm.py at 0x107343e0`：`mov edx,[esi+0x1044]`（count）→ 迴圈
  `mov edi,[esi+0x1040]`、`add edi,0xec`→ `add esi,0x1040; push 0xec; call
  [0x1091b8a0]` → `imul eax,eax,0xec`。**+0x1040，stride 0xEC，確認由
  `Game_Item_Add`（`0x107029ff`）呼叫，不是 Game_User_Add**。

裁定：**✔ 成立**。Moon 的更正是對的——舊文件（`game-user-sn-multi.md`、
`d1-multiplayer-room.md`、`INDEX.md` 部分列）把 `0x107343e0` 標成
`Game_User_Add`，實際上匯出符號表明確寫著那是 `Game_Item_Add`
（GAME_ITEM_INFO，+0x1040/0xEC）；真正的 `Game_User_Add` 是
`0x10734140`（+0x1034/0x80）。

## (b) 14-byte 分數記錄

`esi`＝訊息 frame 指標；三個 handler 的「記錄起點」都用 movzx 讀出同一種形狀：
u16,u16,u8,u8,u16,u16,u32（record+0/2/4/5/6/8/0xA，共 14 bytes）。

- `EndGame_SN`（`0x107d7ed0`）：WinTeamIndex `movzx edi,word[esi+0x10]`
  （`0x107d7f11`）。Team A 記錄起於 `esi+0x12`：
  `word[+0x12]`(`0x107d7f45`)→rec+0、`word[+0x14]`(`0x107d7f49`)→rec+2、
  `byte[+0x16]`(`0x107d7f4d`)→rec+4、`byte[+0x17]`(`0x107d7f3d`)→rec+5、
  `word[+0x18]`(`0x107d7f39`)→rec+6、`word[+0x1a]`(`0x107d7f41`)→rec+8、
  `dword[+0x1c]`(`0x107d7f64`)→rec+0xA。Team B 起於 `esi+0x20`，同樣寬度／
  順序（`0x107d7fd0-0x107d7fe8`），偏移剛好 +0xE。**與 claim 完全相符。**
- `EndRound_SN`（`0x107d7a50`）：Team A 記錄起於 `esi+0x12`
  （`0x107d7ab5-0x107d7ad7`），同款 u16,u16,u8,u8,u16,u16,u32；Team B 起於
  `esi+0x20`（`0x107d7b59-`）。**相符。**
- `Death_SN`（`0x107db4d0`）：這裡 `esi`＝frame 起點，body 從 `esi+0x10`
  開始（`cmp word[esi+0x10],0` 對應文件的 body+0x00 Status，
  `0x107db6c6`），所以記錄讀取位址要減 0x10 才是 body 偏移。Team A 記錄
  raw 讀在 `esi+0x25..0x2f`（`0x107db6dc-fb`）＝body+0x15..0x1f，寬度／
  順序同上（u16,u16,u8,u8,u16,u16,u32）。跟舊日誌
  `2026-09-17-16-death-sn-format-verification.md`「+0x15..+0x22」一致，
  不是矛盾，只是該日誌用 body 偏移、我這次先看到 raw esi 偏移，兩者差
  0x10（frame header）。**相符。**
- `Game_Score_Set` callee：`0x10706e56 → 0x1072d0e0 → 0x1070657d →
  0x1072cec0`（Ghidra 反編譯 `0x1072cec0` 確認：`__thiscall
  FUN_1072cec0(this, p2..p9)`，用 `(p3,p2)` 當 key 在
  `this+0x1024`（stride 0x20）表裡找/建項，`p4..p9` 六個值減去舊值存進
  該項 +8/+0xc/+0x10/+0x14/+0x18/+0x1c——也就是六個「分數子欄位」的
  **差量**，不是原始值）。**呼叫鏈可達，callee 的 8 個參數確實對應到
  14-byte 記錄裡除了最前面 team key 之外的欄位，但哪個 stack 位置對應
  哪個具體欄位（score/round/try/goal/exp）需要在呼叫端逐一回推 esp
  位移，這次沒有做完，標 `?`**——寬度/順序本身已經在三個 handler 內
  確認一致，語意欄位名稱（team/score/round/alive/try/goal/exp）沿用既有
  文件命名，本次未逐一從 callee 回推驗證。

裁定：**✔ 成立（寬度與順序）／? 未完全驗證（Game_Score_Set 參數與欄位語意的一一對應）**。

## (d) EndGame_SN body = 0x1E

- `disasm.py at 0x107d7ed0`：函式體 gate 檢查後，`esi=[esp+0x20]`（訊息
  body 指標，這裡沒有額外 0x10 header——WinTeamIndex 直接讀在
  `esi+0x10`，跟 EndRound_SN 用同一種 esi 慣例，兩者的「+0x10」就是
  body+0x00）。WinTeamIndex u16 @ body+0x00，Team A 14-byte 記錄
  @ body+0x02..0x0F，Team B 14-byte 記錄 @ body+0x10..0x1D。總長
  0x1E（30 bytes），最後一次讀取是 `esi+0x2a`（B 記錄的 u32 exp，
  `0x107d7fe8`），對應 body+0x1e 前一 byte，body 結尾就是 0x1E。
- 呼叫序列：`Game_Score_Set(A)`（`call 0x10706e56` @ `0x107d7fcb`）→
  `Game_Score_Set(B)`（@ `0x107d8053`）→ `Game_Score_Update`
  （@ `0x107d8065`）。
- 對照 `dispatch/lobby.dispatch.js:516-521` 與
  `dispatch/room/room-leave.js:212-215`：都用
  `getMessageBuffer(0x00222213, 0x1E)` / `getExactMessageBuffer(0x00222213,
  0x1E)`，WinTeamIndex 寫 `+0x00`，Team A TeamIndex 寫 `+0x02`，Team B
  TeamIndex 寫 `+0x10`——跟 DLL 讀取的欄位起點完全對上。

裁定：**✔ 成立**。handler 與伺服器建構的 body 大小/欄位起點一致。

## (e) Grade_Info_SN 跳表 → m_MyAccountLevel(+0x448)

- `tools/disasm.py exports` 命中 `0x10701023
  ?Grade_Info_SN@ZDispatchCommunity@@...`，xref：`0x10701023  jmp
  0x107cf3b0`。**`0x107cf3b0` 就是 handler 本體入口**（scene-gate 檢查
  `mov al,[ecx+4]`）。
- `0x107cf3e7`：`mov eax,[eax+0x10]`——這不是另一個 handler，是
  **同一個函式內部**、gate 通過後讀取封包值的那一行（`0x107cf3e3 mov
  eax,[esp+4]` 取封包指標，`0x107cf3e7` 解參考 `+0x10` 取出 body 的 u32
  值）。所以「文件引用 0x107cf3e7」跟「這次核對 0x107cf3b0」**沒有矛盾
  ——一個是函式入口，一個是函式內部處理該值的指令**，都屬於同一個
  `Grade_Info_SN` 函式體（`0x107cf3b0`–`0x107cf457`）。
- 跳表：`add eax,-0xb; cmp eax,3; ja 0x107cf416（預設 0）; jmp
  [eax*4+0x107cf45c]`。直接讀取 `0x107cf45c` 處的 4 個 dword（跳表資料，
  非程式碼，反組譯器把它印成垃圾指令是正常的）：
  - `0x107cf45c → 0x107cf40f`（`mov esi,4`）— index 0 對應 value 0xb(11)
  - `0x107cf460 → 0x107cf408`（`mov esi,3`）— value 0xc(12)
  - `0x107cf464 → 0x107cf3fa`（`mov esi,1`）— value 0xd(13)
  - `0x107cf468 → 0x107cf401`（`mov esi,2`）— value 0xe(14)
  即 **11→4（開發者）、12→3、13→1（觀戰）、14→2**，其他值（`ja`
  分支）→ 0（一般）。跟既有 journal
  `2026-09-17-11-grade-info-sn-root-cause.md` 記載的映射完全一致。
- 存值：`push esi` → `call 0x107081de`（`disasm.py at 0x107081de` 第一行
  `jmp 0x10729b00`）→ `0x10729b00`：`mov eax,[esp+4]; mov [ecx+0x448],
  eax`。**確認 grade 值寫進 `[this+0x448]`**，跟既有文件說的
  `m_MyAccountLevel` 位置一致（`Account_UserType_Set` 寫的是
  `+0x4d0`/`+0x514`，不同欄位，兩者不會混淆）。

裁定：**✔ 成立**（跳表映射、+0x448 store 都對得上；0x107cf3b0 與
0x107cf3e7 的「兩個位址」是函式入口 vs. 函式內部指令，不是矛盾）。
`IsMeGM_BD()` 是否真的變 true（即 `My_Account_Spectator_Check()` 讀的是
同一個 `+0x448`）本次沒有重新核對——沿用既有 ✅ journal 的結論，未獨立
複查。

## 摘要（僅列不成立與無法驗證項目）

1. **(b) 無法完全驗證**：`Game_Score_Set` 呼叫鏈可達到真正 callee
   （`0x1072cec0`，已用 Ghidra 反編譯確認 8 參數 thiscall、對表格做
   差量寫入），但**呼叫端 7 個 push 值分別對應記錄裡哪個具體欄位
   （score/round/try/goal/exp）這次沒有逐一回推 esp 位移確認**，只確認
   了三個 handler（EndRound_SN/EndGame_SN/Death_SN）各自讀出記錄的
   **寬度與順序**完全符合 claim。
2. 其餘三項（a、d、e）機械核對全部 **✔ 成立**，位址、跳表資料、
   +0x448 store、body 大小與伺服器建構程式碼都對得上。
