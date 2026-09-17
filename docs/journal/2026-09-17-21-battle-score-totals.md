# 結算分數 S1：Death_SN 送出累計戰績（2026-09-17）

依據：G2（`2026-09-17-16-death-sn-format-verification.md`，Gemini 分析，Claude 已抽查）。

## DLL 核對（Claude）

- ✅ [DLL] `ZDispatchGame::Death_SN`（`0x107db4d0`）：`0x107db8a5`–`0x107db8c5` 讀 body+0x31 u16、+0x33 u16、+0x39 u32、+0x3d u32，連同 ebp（Kill User）呼叫 `Game_User_Battle_Set`（thunk `0x1070571d`）；`0x107db8ca`–`0x107db8ea` 讀 body+0x41、+0x43、+0x49、+0x4d，連同 edi（Death User，前面 `0x107db8a0` 也把 edi 傳給 `Game_User_State_Set`）再呼叫一次。
- ✅ [DLL] `UZNetwork_DJ::Game_User_Battle_Set`（`0x1072d720`）：在玩家表 `[this+0x1034]`（stride 0x80）找 UserIndex，**直接指定**（不是累加）：`+0x38` = 參數 3、`+0x40` = 參數 4、`+0x54` = 參數 5、`+0x5c` = 參數 6，並算 `+0x48` = Exp×5（mode 9，campaign）− `+0x50` − `+0x4c`。對照 `ZNetwork_DJ.uc` `GAME_USER_INFO`：`+0x38` Kill、`+0x40` Death、`+0x48` ScoreBattle、`+0x4c` ScoreAssist、`+0x50` ScoreMission、`+0x54` Exp、`+0x5c` Point（🟡 依欄位順序對應，未逐一核對 struct 偏移）。
- 所以伺服器原本每次都送 0，會把擊殺者與被擊殺者的戰績清成 0（G2 的疑點成立）。

## 改動（單一變數：Death_SN 戰績塊填累計值）

- `dispatch/lobby.dispatch.js`：
  - `BeginRound_CN 0x00230151` 時重設 `client.battleStats_`。
  - `Death_CN` 時累加：擊殺者 kills+1（自殺不算）、被擊殺者 deaths+1；`Death_SN` body+0x31（擊殺者）與 +0x41（被擊殺者）寫入 kills、deaths、exp、point。
  - 🟡 exp／point 每殺 10 是暫定值，不是原廠數值。
- `EndGame_SN` 的隊伍分數塊這次**不改**。
- 伺服器 21:01 重啟（`session-20260917-210116.jsonl`）。待測：`docs/next-test.md` 測試 S1。

## S1 結果（21:0x，`session-20260917-210116.jsonl`）

- ✅ [OBS] 操作者：「有分數了」。
- ✅ [LOG] 最後幾筆 `Death_SN`：`attacker=1, victim=0, killer K/D=62/2`，接著玩家陣亡 `attacker=0, victim=1, K/D(對 AI index 0)=3/62`，然後 `Campaign_CN action=2 → EndGame_SN`。玩家本場 62 殺、3 死。
- 備註：所有 AI 在 Death_CN 裡都是 index 0，伺服器把它們的累計合併在 `battleStats_[0]`；index 0 不是玩家，客戶端會跳過，無害。
- 🟡 結算頁顯示了哪些欄位（擊殺、經驗、分數、隊伍分數）操作者沒細說，`EndGame_SN` 的隊伍分數塊仍全 0。
