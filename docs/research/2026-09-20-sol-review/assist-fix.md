# SOL-REVIEW-7：ASSIST-FIX 高階審查

審查範圍：`assist-fix` commit `bc01df1`；直接核對 DLL 組語、實際 log 與程式 diff。定向測試 `node test/assist-sn-format.js` 三案皆通過，但短 body 案的期望值本身不安全。

1. **通過 — 回抄欄位對應與寬度。** Assist_CN sender `0x107d9c60` 寫 body `+0x00/+0x02` 兩個 u16、`+0x04/+0x05/+0x06` 三個 u8；Assist_SN handler `0x107d5fa0` 分別從 body `+0x0A/+0x0C/+0x0E/+0x0F/+0x10` 以相同寬度讀取。`dispatch/lobby.dispatch.js:211-230` 的 LE 讀寫與此一致，且 25-byte body 覆蓋最後的 `+0x18`。實際 [LOG] `session-20260919-200917.jsonl` ms 335944 的 `00000300040150` 亦逐欄相符。

2. **通過 — Exp／Point 寫 0 對玩家數值安全。** `0x107d6134`（u16 status）與 `0x107d613b`（u32 result）皆為 0 才進成功路徑；該路徑在 `0x107d6142-0x107d614e` 只取兩組 Exp／Point，再呼叫兩次 `Game_User_Assist_Set`。`0x1072d8b0`、`0x1072d8c2`、`0x1072d8d4` 均為 `add`，所以四欄為 0 不改玩家數值。找到的其餘成功路徑效果只有 type/action/HP 的解碼與 log；`[this+0x1030] |= 1` 的髒旗標不論索引是否命中都會設，但舊 16-byte 零回覆已經會觸發，並非本修正新增的數值副作用。

3. **通過（理由需限縮）— 本 commit 同時擴長與回抄索引是正確且最安全的交付。** 若只先回抄真實索引，舊 16-byte body 外的垃圾 Exp／Point 可能命中真實列並被累加，確實不可接受。不過「絕不能拆 commit」不是邏輯必然：先單獨擴成 25 bytes、仍送零索引及零分數，再於下一 commit 回抄索引也安全；危險的是索引先於長度修正生效。`bc01df1` 沒有這個問題。

4. **需修改 — 短 body fallback 不安全。** `dispatch/lobby.dispatch.js:233-240` 在開關已開、CN 少於 7 bytes 時仍送 16-byte 全零成功包；客戶端 `0x107d5fa0` 因 status/result 都為 0，照樣讀到 body `+0x18`，正是本修正要消除的越界讀。`test/assist-sn-format.js:118-136` 目前把此缺陷當成正確結果。建議短 CN 仍回精確 25-byte 全零 body（零索引不會命中玩家列），並將測試改驗 25 bytes；若要回錯誤碼，須先確認客戶端錯誤語意。

5. **通過 — 開關關閉時 wire bytes 不變。** `rooms.js:218-225` 預設 `disabled`，`rooms.js:467-476` 測試重設亦回到 disabled；關閉時仍走 `dispatch/lobby.dispatch.js:236-240` 的 `getMessageBuffer(0x00230122, 0x6)`，產生與舊版相同的 16-byte 全零 body。定向測試逐 byte 驗證通過；差異只含 log／註解，不改封包。

## GO / NO-GO

**NO-GO。** 先修正開關啟用時的短 body 路徑，使它不再發出 16-byte 成功包，並更新對應測試；其餘四項不阻擋 live test。
