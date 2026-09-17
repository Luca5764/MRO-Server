# 按鍵失效的根因：`Grade_Info_SN` 送 11 = 開發者權限（2026-09-17）

更正 08 篇：08 篇把 `DefaultInfo_SN` 的欄位當成帳號權限是**錯的**。

## 測試 L 結果（18:24–18:34，`session-20260917-131036.jsonl`，隊伍聊天 marker，部分 Big5 字掉了）

- [OBS] 開局左鍵無效；**F1 會叫出按鍵教學**；Scroll Lock 按到第 3 次時 GUI 消失。
- [OBS] Esc→選項→取消後左鍵可用；**F1 不再叫出教學**；Scroll Lock 仍然有效（第 1 次 GUI 出現、第 4 次又消失）。
- ✅ 判讀（Sol 設計）：開局時 Scroll Lock 綁的是 GM 的 `ViewModeUIGM_BD`（只有 `ApplyGMControl` 會綁，`OptionAll.uc:990`），F1 沒被 `ApplyPveController` 改掉 → **開局走了 `LevelInfo.GetLocalPlayerController` 的 GM 分支**（`LevelInfo.uc:518`）。修好後的 `ApplyControl`／`ApplyPveController` 不會解除 Scroll Lock，所以 Scroll Lock 在修好後依然有效。

## 真正的權限來源

- ✅ [DLL] `UZNetwork_DJ::Account_UserType_Set`（`0x10717240`）寫的是 **UserType**（`ZNetwork_DJ.uc` 的註解：`1:男, 2:女`），**不是**權限。08 篇的 `tools/set-account-level.js`、`ACCOUNT_LEVEL_STR` 改的都是 `DefaultInfo_SN` 的 UserType 欄位，命名錯了，這部分作廢；`lucas` 的 `accounts.account_level` 目前是 0。
- ✅ [DLL] 權限（`m_MyAccountLevel`）由 `Account_Grade_Set`（thunk `0x107081de` → `0x10729b00`，寫 `[this+0x448]`，緊鄰 `m_MyUserIndex` `+0x44c`）設定，唯一呼叫者是 `ZDispatchCommunity::Grade_Info_SN`（`0x107cf3b0`，opcode `0x00510101`）。
- ✅ [DLL] `0x107cf3e7`：`value = body[+0] u32; value -= 0xb; if (value > 3) grade = 0; else jump table 0x107cf45c` → **`0xb`→4（開發者）、`0xc`→3、`0xd`→1（觀戰）、`0xe`→2、其他→0（一般）**。
- ✅ [LOG]／程式碼：伺服器在 8 個地方送 `Grade_Info_SN` body `0b000000`（11），而且註解寫成「11 → grade 1」。所以客戶端一直認為自己是**開發者（4）**→ `My_Account_Spectator_Check()` 為真 → `IsMeGM_BD()` 為真 → PvE 開局套用 GM 按鍵表。

## 改動（單一變數：Grade_Info_SN 的值 11 → 0）

- `dispatch/gamelogin.dispatch.js`（4 處）、`account.dispatch.js`（3 處）、`community.dispatch.js`（1 處）：`writeUInt32LE(11, 0)` → `writeUInt32LE(0, 0)`，並更正註解。
- 伺服器已重啟。待測：`docs/next-test.md` 測試 M。
- 注意：權限改成 0 之後，只有開發者才能用的功能（如果有的話）可能會消失，測試時要留意。

## 測試 M 結果（18:38–18:43，`session-20260917-183633.jsonl`）

- ✅ [SHOT] `shots/testM-enter.png`（剛進 PvE，沒開過選項）：彈藥 `068 /0720`（先前一直停在 080），右側出現 `RESPAWN 3 / KILL 0`、`SP 0000`，以及 F1～F5 SP 技能列表（攻擊力增加、防禦力增加、子彈裝填、核心EMP、憤怒模式）。這些都是一般玩家的 PvE HUD，之前不會出現。
- ✅ [OBS] 隊伍聊天：「all step pass, it worked」；「f1 pass, not pop up」（F1 變成 SP 技能，不再叫出按鍵教學）。**不用開選項**，開火、跳、推進器、右鍵都正常。
- ✅ **結論：根因就是 `Grade_Info_SN 0x00510101` 送 11（開發者）；改送 0 後修好。**
- ❌ 測試 L 的 Scroll Lock 指紋有瑕疵：[OBS]「scroll lock still can hide gui」，權限 0 時 Scroll Lock 仍然能隱藏 GUI，所以 Scroll Lock **不是** GM 表獨有的探針（腳本裡只有 `OptionAll.uc:990` 綁它，來源 ⬜，可能是原生程式處理）。測試 L 的結論靠 F1 指紋和測試 M 仍然成立。
- 後續：`DefaultInfo_SN` 的 UserType 欄位（`tools/set-account-level.js`、`ACCOUNT_LEVEL_STR`、DB 欄位名 `account_level`）命名錯誤，要另外整理，而且應該送 1／2（男／女）；目前 `lucas` 送 `"0"`，暫時看不出影響。
