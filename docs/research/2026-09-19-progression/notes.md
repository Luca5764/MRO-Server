# P3 結算與成長：封包格式與待決數值（explorer 中階，🟡 待審）

## 封包
- **EndGame_SN 0x00222213**（`0x107d7ed0`）：+0 WinTeamIndex；兩個隊伍區塊各有 Team、Score、Round、Alive、Try、Goal、**Exp u32**。目前 WinTeam 以外全填 0（`lobby.dispatch.js`）。
- **User_Score_SN 0x00222221**：見 `research/2026-09-19-rank/notes.md`。
- **Reward_Record_User_SN 0x00220412**（`0x10705e1b`→`0x107ed440`，[DLL✓]）：offset 跟 `RecordInfo_SN 0x00210103` 相同，也呼叫同一個 setter（`0x10706e24`），也就是打完一場後**重送整份 RECORD_INFO**（等級、勝敗、K/D、Exp、Point、Coupon…）。我們從沒送過。
- **Reward_Levelup_User_SN 0x00222231**（`0x107ed760`，[DLL✓]）：**不讀 body**，只觸發升級提示；升級的數字由客戶端比較 LoginRecord 和 CurrentRecord 得出（`ZPopup_Experience.uc:77`）。
- **Reward_Levelup_Mech_SN 0x00222232**（`0x107ed7f0`，[DLL✓]）：會讀 body：+1 u8 經 8 路跳表變成 1..8（機種勳章類別），+5 u32（推測是勳章等級）。🟡 語意還沒完全追完。
- **Reward_FirstReceiveExp_User_SN 0x00222233**（`0x107ed960`，[DLL✓]）：不讀 body，會呼叫 `Game_Reward_Newbie(true)`。`Game_Reward_Newbie` 不是獨立的 opcode（DLL 裡只有這一個 xref）。
- `Grade_Info_SN` 是 GM 權限，✅ 已結案，跟經驗值無關。
- **重要：** 下一級所需經驗（`RECORD_INFO.LevelExpMax`，`ZNetwork_DJ.uc:253-273`）**由伺服器封包提供**。Cache 的 ExpInfoRecord 只用來決定軍階徽章圖案和號俸數（`ZPanel_LevelUp.uc:119-120`）。→ 經驗曲線要我們自己訂，客戶端沒有表可以對照。

## 目前伺服器的狀況
- 打完一場後**完全不寫回 DB**：整個專案 grep 不到 `UPDATE records` 或 `UPDATE mech_levels`。records／mech_levels 的欄位都有，只是沒用。
- 每殺一人給 exp／point 10，是佔位值。
- **矛盾（要優先處理）：** `account.dispatch.js:525-541`（9211）和 `gamelogin.dispatch.js:212-226`（30907）送的 `RecordInfo_SN 0x00210103` **body 格式不一樣**。9211 還是舊格式：wins 在 +0x14、exp_max 在 +0x48。30907 是 money-fix 之後的格式：coupon 在 +0x14、point 在 +0x48，而且不寫 exp_max。另外 9211 送的資料在切換場景後可能會遺失（跟 H7 同一個機制），所以實際生效的應該是 30907 那份，而那份的 LevelExpMax 是 0。

## 需要操作者決定的數值（原版資料見 `research/2026-09-19-original-features/`）
| 項目 | 原版資料 | 建議 |
|---|---|---|
| 每場 exp | 沒找到數字 | 待決 |
| 每殺 exp | 沒找到（攻略裡的「貢獻度 5」是另一種貨幣） | 暫時維持 10 |
| 每場金錢（依難度） | 玩家說法：高級潛入一場 2800G | 待決 |
| 升級門檻（經驗曲線） | 三個版本都沒找到 | 要自訂 |
| 晉升獎勵 | 韓版官方 1,500／3,000／10,000／10,000／20,000×n；台版玩家說法不同 | 暫用韓版 |
| 勳章門檻 | 27 級貢獻度門檻（韓版和日版一致，見 progression.md） | 用原版 |
| Rank 公式 | 沒找到 | 要自訂 |
| 修理費 | 沒找到 | 待決 |
