# Account_Record_Set 0x10717260 — 手動組語追蹤（中階，🟡 低信心，未經 verifier 覆核）

任務：P3 step1 contract 要求追 `Account_Record_Set` 的 push 順序（`docs/research/2026-09-19-progression/notes.md` 列的缺口）。
工具：`tools/disasm.py at <addr> <count>`（在 `Metal Rage Online Server/` 下執行）。

## 警告

這份追蹤是手動逐指令算 `[esp+N]` 位移，跨越多次 `push`／`add esp`，**很容易算錯**（`AGENTS.md`
已經警告過 Ghidra 這類反編譯常錯，這裡連反編譯都沒有，是純手動讀組語）。目前只有這份研究筆記
自己交叉檢查過一次，**不要直接拿來寫封包 offset**；要用之前，先用 `tools/disasm.py` 重新走一遍，
最好找 verifier 子 agent 用不同方法（例如動態下中斷點看實際暫存器值）覆核。

## 呼叫端：`ZDispatchAccount::RecordInfo_SN 0x107c0fa0`

在 `0x107c1082`–`0x107c1106` 有 14 個 `push`，緊接著在 `0x107c1107`–`0x107c1114` 用
`UClass::GetDefaultObject` 取得 `this`（`UZNetwork_DJ` 的 default object）再
`call 0x107056aa`（thunk → `0x10717260`）。`0x107056aa` 前面還有一段（`0x107c10b8`–`0x107c10c6`）
是一次 debug log 呼叫（`call 0x10709156`，之後 `add esp, 0x40` 清掉 16 個 push），跟實際傳給
`Account_Record_Set` 的參數無關，只是把同一批欄位又印一次 log。

推算出的 14 個 push（依執行順序，push 早的會是 callee 較後面的 stack 參數；body 位移是相對
`RecordInfo_SN` 封包 body）：

| push 順序 | 值來源（body 位移） | callee 端 `[ebp+X]` |
|---|---|---|
| 1 | body+0x3c | ebp+0x3c |
| 2 | body+0x38 | ebp+0x38 |
| 3 | body+0x34 | ebp+0x34 |
| 4 | body+0x30 | ebp+0x30 |
| 5 | body+0x2c | ebp+0x2c |
| 6 | body+0x64 | ebp+0x28 |
| 7 | body+0x60 | ebp+0x24 |
| 8 | body+0x54 | ebp+0x20 |
| 9 | body+0x50 | ebp+0x1c |
| 10 | body+0x20 | ebp+0x18 |
| 11 | body+0x1c | ebp+0x14 |
| 12 | body+0x18 | ebp+0x10 |
| 13 | body+0x14 | ebp+0xc |
| 14 | body+0x10 | ebp+0x8 |

## 被呼叫端：`0x10717260`（`Account_Record_Set` 本體，`0x107056aa` 只是 thunk）

`ret 0x38` = 14 個 stack 參數（0x38/4），跟上面表格對得上。`this`（存進 `esi`）欄位寫入：

- `esi+0x518` = `[ebp+8]`（單一 dword，直接存）
- `esi+0x51c` = 0（固定清零，不是參數）
- `esi+0x538` = 由 `[ebp+0x24]`／`[ebp+0x28]` 算出，經過兩次 clamp（`0..450`、`0..100`）
- `esi+0x53c` = `[ebp+0x2c]`（直接存）
- `esi+0x540` = `[ebp+0x30]`（直接存）
- `esi+0x544` = `[ebp+0x34]`（直接存）
- `esi+0x548` = `[ebp+0x38]`（直接存）
- `esi+0x54c` = `[ebp+0x3c]`（直接存）
- `esi+0x550` = `[ebp+0x2c] + [ebp+0x30] + [ebp+0x34]`（三個欄位相加，🟡 疑似「總場次」＝ wins+losses+draws 或 kills 的某種合計）
- `esi+0x554` = `[ebp+0x2c] * 100 / esi+0x550`（🟡 疑似「勝率百分比」，`[ebp+0x2c]` 疑似 wins）
- `esi+0x3d8` 的 bit 1：`[ebp+0x1c] | [ebp+0x20] == 0` 時設定（旗標，語意不明）

套用上表把 `[ebp+X]` 換回 body 位移：`esi+0x53c`＝body+0x2c、`esi+0x540`＝body+0x30、
`esi+0x544`＝body+0x34（這三個相加得 `esi+0x550`「總場次」）；`esi+0x548`＝body+0x38、
`esi+0x54c`＝body+0x3c；`esi+0x538` 的勝率相關計算吃 body+0x60／body+0x64。

## 跟既有 ✅／🟡 記錄的關係

- `docs/research/2026-09-19-progression/notes.md` 已經確認 body+0x14＝Coupon、body+0x40＝LevelExp、
  body+0x48＝Point（這三個不經過 `Account_Record_Set`，是另外三個呼叫：`0x107089cc`／
  `0x10706e24`／稍後那個 Coupon call）。`gamelogin.dispatch.js`／`account.dispatch.js` 目前寫入
  的 wins/draws/losses/kills/deaths 是 body+0x1c/0x20/0x24/0x28/0x2c（30907 版），跟這份追蹤算出
  的 `Account_Record_Set` 參數（body+0x10/0x14/0x18/0x1c/0x20/0x2c/0x30/0x34/0x38/0x3c/0x50/0x54/0x60/0x64）
  **有重疊但不完全一致**（例如 body+0x1c、body+0x20 兩份都出現，body+0x28 沒有出現在
  `Account_Record_Set` 的參數表裡）——這代表要嘛我的追蹤有算錯的地方，要嘛
  `Account_Record_Set` 和目前 dispatch code 寫入的欄位本來就不是同一組（`Account_Record_Set`
  可能是給另一群 body 位移用的，例如 body+0x50 起那一段目前完全沒人送）。**沒有解決，標 ⬜。**
- 語意上唯一看起來合理的推論：`esi+0x550`「總場次」與 `esi+0x554`「勝率」的算法（`wins*100/total`）
  暗示 `[ebp+0x2c]`（body+0x2c）很可能是 **Win 數**，`[ebp+0x30]`／`[ebp+0x34]`（body+0x30／0x34）
  是另外兩個場次計數（Lose／Draw 或反過來）。但這跟目前已知 body+0x1c=Win（30907 版本，
  `account-dispatch-map.txt`／`gamelogin.dispatch.js:212`）**不一致**——body+0x2c 目前被當成
  Kill 用。**這是矛盾，按契約規則只列出來，不裁定；需要高階或下一輪重新核對。**

## 建議

1. 這份 offset 表不要拿來改 `RecordInfo_SN` 的 body 佈局；已驗證的 body+0x00/0x14/0x1c/0x20/0x24/0x28/0x2c/0x40/0x48
   （`gamelogin.dispatch.js` 30907 版本）維持不動。
2. `Account_Record_Set` 寫入的 `esi+0x518..0x554` 這組欄位，看起來是**客戶端本地端一個獨立的統計
   /勝率快取結構**，不是我們要在 `RecordInfo_SN` 裡對齊的欄位——伺服器只要保證 body+0x1c/0x20/0x24/0x28/0x2c
   （Win/Draw/Lose/Kill/Death）正確，`Account_Record_Set` 內部怎麼用這些值算勝率是客戶端自己的事，
   不需要伺服器額外處理。
3. 若之後要顯示「勝率」，可以直接用伺服器自己存的 wins/losses/draws 算 `wins*100/(wins+losses+draws)`，
   不需要理解 `Account_Record_Set` 的內部欄位。

## 更正（verifier 2026-09-20，高階採納）
- 上表的偏移全部是從 **raw 封包指標**（`eax`）算的；專案慣用的 body＝raw＋0x10，所以每個偏移都要**減 0x10**。
  - 驗證方式：用兩個已經 ✅ 的欄位對照。Coupon 在 `0x107c1170`／`0x107c1174` 讀 raw `eax+0x24/0x28`，等於 body+0x14/0x18；Point 在 `0x107c1154`／`0x107c1158` 讀 raw `eax+0x58/0x5c`，等於 body+0x48/0x4c。
- 修正之後完全對齊：body+0x1c/0x20/0x24/0x28/0x2c＝Win/Draw/Lose/Kill/Death。
  - 對應到被呼叫端：`ebp+0x2c..0x3c` → `esi+0x53c/0x540/0x544/0x548/0x54c`。
  - `esi+0x550` 存總場數，`esi+0x554` 存勝率＝Win*100/total（`0x107173da`）。
  - Kill 在 `0x107c10e7` 讀取，直接存進 `0x10717307`。
- 「矛盾」不存在。反過來說，這是 Win/Draw/Lose/Kill/Death 偏移的第二個獨立佐證。
- `esi+0x51c` 不是固定清零：預設 0（`0x107172da`），但在 `0x10717388` 會用 body+0x04/0x08/0x0c/0x10/0x40/0x44 做 64-bit 相減，結果為正時覆寫。
- Reward_Record_User_SN 的呼叫點（`0x107ed598`）所有欄位整體往前移 8 bytes，跟 progression notes 一致。

> **機械核對更正（verifier，2026-09-20，`verify-2026-09-20.md`）：**
> - 「`0x107c1082–0x107c1106` 有 14 個 push 直接餵給 `Account_Record_Set`」**不成立**：那段的 16 個 push 餵的是 debug log（`call 0x10709156`，之後 `add esp,0x40`）。真正接在 `call 0x107056aa` 前的 14 個 push 在 `0x107c10dd–0x107c1106`。
> - 更正段落引的讀取位址不精確：`0x107c1170/74`、`0x107c1154/58` 是 setter 前讀局部變數的 push；真正讀 raw `[eax+0x24/0x28]` 的是 `0x107c103b/0x107c1042`，讀 `[eax+0x58/0x5c]` 的是 `0x107c1027/0x107c102e`。
> - **最終結論不變**：body+0x1c/0x20/0x24/0x28/0x2c＝Win/Draw/Lose/Kill/Death。verifier 另外從 callee `0x10717260` 的 `esi+0x53c..0x54c` 寫入重新確認過。
> - `esi+0x51c` 64-bit 相減引用的六個 body 偏移**無法確認**，沒有回推來源暫存器 ⬜。
