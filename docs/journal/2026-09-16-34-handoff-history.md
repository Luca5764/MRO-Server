# 舊交接文件內容（2026-09-16）

> 從 docs/HANDOFF.md 原文搬遷（2026-09-17），內容未改動。這些是已被取代的交接快照與當時的狀態說明。

## 上一版快照（2026-09-16 21:38，已被上段取代）

本輪接手後已徹底查明「武器顯示鷹式榴彈砲、無副武器、無法開火」的根本原因與官方標準解法：
1. **問題定位與實測結果**：
   - 截圖 `shots/shot-211936.png` 確認機體外觀已是 Vanguard (`SA01m`)，防禦值 280。
   - 但 HUD 顯示「鷹式榴彈砲 / ANACONDA II (D)」，且無副武器、不能開火。客戶端 log 依然出現 `WeaponLog=== Small Cannot use Map_PC01.MOC_a`。
2. **根本原因**：
   - 反編譯 `Engine.dll` 解析 `Cache.Bin` 的 Table 7 (`FSpecWeaponMainRecord`) 與 Table 4 (`DefaultSetList`)：
     - `wid=21100101`（`Zweapon.MOC_a`）在台版中文正是「鷹式榴彈砲」，但它是 Medium/Heavy 機體專用武器。Small 機體（Vanguard `SA01m`）裝載時引擎會印出 `Small Cannot use Map_PC01.MOC_a` 並拒絕掛載，導致手部沒有武器 Actor，故**無法開火**。
     - **Table 4 (`DefaultSetList`) 證實 1 號機 Vanguard 正確的主武器是 `22100101` (`MOM_a` / 輕量型來福機槍)**！
     - 左右副武器分別為 `SubLeft=32100101` (`AOM_a` / 簡易機槍) 與 `SubRight=31100101` (`AOC_a` / 輕型主動式加農砲)。先前資料庫缺少 slot 3 且把 31100101 錯塞到 slot 2，導致副武器掛載失敗。
     - 推進器鍵位為 `Shift` (`Key_Booster=16`)，且機體在蹲伏跪地（`Ctrl`, `Key_SitDown=17`）狀態下不可噴射。
3. **已完成套用的修復**：
   - `room-game-user.sender.js` 已套用完整 8 台機體的官方 Table 4 `CANONICAL_LOADOUTS` 作為各槽位保底。
   - `database/db.js` 的 `starterLoadouts` 已更新為 Table 4 官方正版（包含 slot 3 副武器右與 slot 5 塗裝）。
   - MySQL 資料庫 Account 1 & 2 的 `items` 記錄已全數重置為 Table 4 正版預設配裝。

### 待驗證項目（請使用者實測）
1. 登入進戰役房並出擊（Mech 1）。
2. 檢查機體手中是否有主武器（輕量型來福機槍），副武器（簡易機槍 / 輕型主動式加農砲）。
3. 檢查按左鍵能否正常射擊。
4. 站立狀態下按 Shift 檢查是否有推進器噴射效果。
5. 檢查 `MetalRage.log` 是否不再出現 `Cannot use Map_PC01.MOC_a`。


---

## 這是什麼

Metal Rage Online(鐵影特攻 Online),2009 年 GameHi 的機甲 TPS,台灣由紅心辣椒代理,
2011 年收攤。`Metal Rage Online Server/` 是社群的 Node.js 私服模擬器(`shanzenos/MRO-Server`),
目標是讓這款已停運的遊戲重新能玩。客戶端裝在 `/mnt/c/Games/MetalRage Online`(WSL2 看得到)。

**架構重點:這是 listen-server。** 開局時伺服器要客戶端自己當 host
(`?Listen?LPort=30907`),實際戰鬥不見得經過我們的伺服器。我們送的封包主要是在
**推動客戶端的狀態機與 UI**,不是在模擬戰鬥。

---

## 現在的狀態

已經可以:登入 → 大廳 → 房間(地圖列表正常)→ 按 F5 → 客戶端讀進 `Map_PC01`,
顯示 MISSION BRIEFING(CAMPAIGN MODE / Protect the strategy fusion)。

✅ **2026-09-16 已首次成功生成機體。** 正確流程是在客戶端送
`BeginRound_CN 0x00230151` 後回 `BeginRound_SN 0x00230152`，再送成功的
`Respawn_SN 0x00230104`（body +0x0A=user index）。截圖在
`shots/first-mech-spawn.png`，封包記錄 `session-20260916-202706.jsonl`。
先前誤送 `0x00230103`（那是 CN），所以客戶端完全忽略。

目前待確認：WASD／瞄準／射擊是否正常，以及死亡後重生流程。

根因已經查清楚(詳見 ledger「`team=255` 的成因鏈」):travel URL 的 `team=%d` 來自
`Game_User_Team_Get(自己的 account index)`,它查 `[this+0x1034]` 這張表,查不到就回 255。
那張表只有 `Game_User_SN (0x00222112)` 會填,而該封包先前是關閉的。

**2026-09-16 已實測：兩項修改生效，但仍未出現選機體畫面。**
記錄 `session-20260916-200401.jsonl`，travel URL 已為 `team=0`、`TimeLimit=10`，
客戶端也記錄 `InTeam=0`。截圖 `shots/team0-first-test.png` 仍為任務簡報。
因此隊伍表問題已修好，但不能把缺少機體完全歸因於 team；下一步查槽位資料與選機體 UI 的觸發條件。

**最新待測修改：** `WearInfo_SN` 每組裝備原送 `[uniqueKey, itemIndex]`，組語確認
第二個值才是 `Slot_Info_Set` 查庫存用的 uniqueKey。兩條登入路徑已交換欄位；
真實封包離線重播的庫存配對由 0 → 24。尚未實測 UI。
機體本體仍被 ItemInfo 的 `part_slot=0` 過濾排除，是下一個獨立待查問題，不能把本次修正當作已能出擊。

已生效的兩項修改:
1. `Game_User_SN` 打開,並從房間(場景 5,handler 必定丟棄)移到場景 6 的開局序列
2. `Game_Info_SN` 的 `+0x13` 原本誤寫 `quarterIndex=1`,那其實是 TimeLimit(分鐘),改成 10

---

## 開局驗證步驟（上述兩項已通過，供後續回歸使用）

請使用者開伺服器(`tmux` session 名為 `server`,`npm start`)、開客戶端、登入、建房、按 F5。
然後看三件事:

1. `/mnt/c/Games/MetalRage Online/data/Log/MetalRage.log` 裡的 travel URL
   - `team=` 應該從 `255` 變成 `0`
   - `TimeLimit=` 應該從 `1` 變成 `10`
2. 進圖後是否出現**選機體畫面**
3. 封包記錄:`node tools/slice.js`(見下方工具清單)

如果 `team=0` 但還是沒有選機體畫面,下一個要查的是 `Game_User_SN` 記錄裡
`rec+0x10`(selected slot)與槽位陣列的內容是否讓客戶端認得出機體。

**如果出現選機體畫面**,客戶端按下去會送 `ChangeSlot_CN 0x00230101`
(這是 UnrealScript native `execGame_Slot` 直接呼叫的,見 ledger)。目前沒有 handler,
會落到 unhandled logger 並 dump body。拿那個 body 去反編譯 `ChangeSlot_SN 0x00230102`
的 handler,做出回應。

---

## 再下一步:RESPAWN 0 → 4

使用者看過舊影片,確認流程是:任務簡報動畫 → 選機體 → 右側 F1~F5 技能列
(消耗 SP 30/30/50/200/300:攻擊力、防禦力、裝填、核心 EMP、憤怒模式),
標籤 `RESPAWN 0 / KILL 0`;**RESPAWN 變成 4 之後才能操控機體**。

DLL 側的候選符號(都還沒驗證):
- `UZNetwork_DJ::Game_User_Sally_Add` — sally = 出撃,最像 spawn
- `UZNetwork_DJ::Game_Item_InstantRespawn_Get/Set`
- `UZNetwork_DJ::Item_InstantRespawnCount_Get` — `Game_Info_SN` 的最後一行就呼叫它
- `UZNetwork_DJ::Game_User_State_All_Set` — `Game_Play_Start` 以 `(1, false)` 呼叫

再往後是戰鬥封包。2026-09-16 重新執行 dispatcher 恢復工具確認：
`Respawn_CN/SN = 0x00230103/04`、`InstantRespawn_CN/SN = 0x00230105/06`、
`Death_CN/SN = 0x00230123/24`、`Assist_CN/SN = 0x00230121/22`。
舊 ledger 曾把多個 CN 奇數 opcode 誤標為 SN；以 `tools/dispatch-map.py 0x1070139d ZNetwork.dll` 輸出為準。
