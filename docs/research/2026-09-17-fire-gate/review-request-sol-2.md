# 討論請求：PvE 開局按鍵綁定失效，下一個實驗怎麼設計（給 Codex reviewer Sol，高階）

你是本專案的高階 reviewer。**唯讀**：不改檔、不 commit、不動伺服器與客戶端。先讀 `AGENTS.md`，再讀 `docs/journal/2026-09-17-10-sol-review-input-failure.md`（上次你的審查與之後的測試 F～J）以及 `docs/next-test.md`（Claude 目前提的測試 K）。原始碼在 `~/mro-decrypted/src`，工具同上次（`Metal Rage Online Server/tools/uetool`、`tools/disasm.py`、`tools/ghidra/decompile.sh`）。

## 目標
設計**最少次數、最有區分力**的下一個實驗（或一組實驗），找出「PvE 開局時按鍵綁定為什麼是錯的」。操作者覺得測試 K（Scroll Lock 看 GM 介面）方向怪，請評估它，並提出更好的方案。

## 已知事實（操作者實測）
- F：PvE 內 選項→儲存 → 全部恢復。
- G：儲存後重開客戶端再進 PvE → 又壞。
- H：在 Hangar（開 PvE 前）選項→儲存，再進 PvE → 還是壞。
- I、J：PvE 內 選項→取消 → 恢復（取消也會呼叫 `OptionAll.ApplyOption`→`ApplyControl`，見 `ZPopup_OptionInGame.uc` `OnClick_Main`/`ApplyOption`）；只開關 Esc GAME MENU → 沒用。
- 權限只有 `DefaultInfo_SN` 寫入（`0x107c0e3c`→`Account_UserType_Set 0x10717240`），伺服器送 `"0"`。PvE 執行中 `RadioChat_Sel 0` 有印出（表示 `!PC.IsSpectating()`）。
- 客戶端 `User.ini` 的 `[Engine.Input]` 綁定不會被讀；console 快捷鍵 F24 按不到；拿不到執行期數值，只能靠畫面觀察、封包、客戶端 log（log 只在客戶端結束時寫完）。
- 地圖切換時客戶端會斷線重連伺服器（`session.js` 延續狀態），重連後伺服器會再送 `DefaultInfo_SN` 等登入封包（`logs/session-20260917-131036.jsonl` 可查順序）。

## 想請你評估的假設（可增刪）
1. 開局時 `LevelInfo.GetLocalPlayerController()` 走了 GM 分支（`IsMeGM_BD()` 當下為真，例如重連後 `DefaultInfo_SN` 還沒到／帳號權限暫時是別的值）。
2. 開局時一般 `ApplyControl` 有跑，但之後有東西把綁定改掉或清掉。
3. 開局時根本沒有跑任何 `ApplyControl`（例如 `LocalPlayerController` 早就被設定、或 `ApplyOption` 當下 PC 為 None），綁定是沿用或預設值；但要解釋為什麼 WASD／Q／E／Tab 可用。
4. 其他你看到的可能。

## 可用的實驗手段（請在這些範圍內設計）
- 操作者在遊戲內按鍵觀察畫面、用隊伍聊天當 marker、截圖、關客戶端後讀 `MetalRage.log`。
- 伺服器改動（一次一個變數），例如調整重連後登入封包的順序／時機、補送 `Option_Game_SN 0x00221211`、改 `DefaultInfo_SN` 送出時機等。
- 不能：改客戶端檔案、注入、除錯器、碰反作弊。

## 交付
在終端輸出中文結論（800 字以內）：
- (a) 對測試 K 的評價（能不能區分假設、有沒有更直接的探針）；
- (b) 你建議的實驗（最多 2 個，依序），每個寫清楚步驟、要看什麼、各結果分別支持哪個假設；
- (c) 如果你認為可以直接從封包紀錄或原始碼先排除某些假設（不用操作者），列出來並附證據（檔案:行號、位址或 log 行）。
所有結論附證據標籤，推測標 🟡 [GUESS]。
