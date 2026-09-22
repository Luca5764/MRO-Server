# D2 TDM 設計稿素材：三張對照表

中階 explorer 2026-09-22 整理，**未經高階逐條核對**（表 A 來自我方程式碼，表 B 全部 🟡 外部來源）。
高階落檔（explorer 是唯讀角色，契約當時的「寫進這個檔案」條款是矛盾的，它正確拒絕）。

## 表 A：我們現在一場 PvE 實際送出什麼（房主按開始 → 結算回房）

檔案路徑相對於 `Metal Rage Online Server/`。

| # | opcode | 名稱 | 送給誰 | 檔案:行 | 觸發 |
|---|---|---|---|---|---|
| 1 | `0x00222103` | Game_Start_CN | C→S（收） | `dispatch/gate.game.dispatch.js:1513` | 房主按 F5 |
| 2 | `0x00222102` | Game_Ready_SN | 全房或房主 | `gate.game.dispatch.js:1792-1796`／`:1873` | 緊接 #1 |
| 3 | `0x00222104` | Game_Start_SN | 全房或房主 | `gate.game.dispatch.js:1793,1796`／`:1875,1881` | 緊接 #2 |
| 4 | `0x00420111` | Game_Wait_SN | 全房 | `gate.game.dispatch.js:1753,1755`；函式 `:478-483` | 收到 #1 後立即，推進場景 6 |
| 5 | `0x00222112` | Game_User_SN | 全房，每成員一包 | 呼叫 `gate.game.dispatch.js:1768-1772`；送出 `room/room-game-user.sender.js:226` | +60ms，場景 6 的玩家表 |
| 6 | `0x00222111` | **Game_Info_SN** | 全房或房主 | 函式 `gate.game.dispatch.js:607-702`；呼叫 `:1779,1781`／`:1859` | +150ms，**客戶端從這裡讀 mapId 決定 ClientTravel 目標** |
| 7 | `0x00420113` | Ready_Host_SQ | 房主 | `gate.game.dispatch.js:332-338`；呼叫 `:1826,1831` | +450ms |
| 8 | `0x00420115` | Ready_Host_SN | 房主／各加入者 | `gate.game.dispatch.js:391-476` | 房主回 `0x00420114` |
| 9 | `0x00230101`→`0x00230102` | ChangeSlot_CN→SN | C→S→原 client | `lobby.dispatch.js:173-185` | 玩家選機 |
| 10 | `0x00230151`→`0x00230152` | BeginRound_CN→SN | C→S(房主)→全房 | `lobby.dispatch.js:261-356` | 非房主送來會被忽略（306-309） |
| 10b | `0x00230104` | Respawn_SN（auto 模式） | 房主 | `lobby.dispatch.js:373-380` | BeginRound_CN 後 250ms |
| 11 | `0x00230121`→`0x00230122` | Assist_CN→SN | C→S(房主)→房主 | `lobby.dispatch.js:197-249` | 房主回報輔助 |
| 12 | `0x00230123`→`0x00230124` | Death_CN→SN | C→S(房主)→全房 | `lobby.dispatch.js:618-744` | 非房主送來會被忽略（668-671） |
| 13 | `0x00230139`→`0x00222211` | Campaign_CN→EndRound_SN | C→S(房主)→全房 | `lobby.dispatch.js:411-495` | 中間回合 |
| 14 | `0x00230139`→`0x00222221`→`0x00222213` | Campaign_CN→User_Score_SN→EndGame_SN | C→S(房主)→全房（依序兩包） | `lobby.dispatch.js:517-586` | 最後回合 |
| 15 | `0x00222131`→`0x00222132` | Leave_CQ→Leave_SA | C→S→原 client | `gate.game.dispatch.js:1908-1914` | 戰鬥中 ESC 離開 |
| 16 | （斷線）→`0x00222213` | EndGame_SN | 房主斷線時送其餘成員 | `room/room-leave.js:203-212` | 房主中途離線且 `state==='playing'` |

備註：`0x00220401` User_State_SN 的「準備」廣播（`gate.game.dispatch.js:1463-1507`）
發生在按 F5 之前，不在本表窗口內。

## 表 B：Moon 記錄的 TDM 流程（**全部 🟡，外部來源，我們沒核對**）

來源 `docs/research/2026-09-21-moon-objective-protocol/protocol_objective.en.md`。

| # | opcode／主題 | 說明 | 出處行 |
|---|---|---|---|
| B1 | `0x00230139`/`0x0023013A` Campaign_CN/SN | CN 只回純計分更新；回合推進靠 EndRound_SN，最後一回合送 EndGame_SN | `:168-171` |
| B2 | `0x00222211` EndRound_SN | `ZTeamDM.EndRound_BD` 註解「called from Network on round end」→ 原廠就是伺服器送 | `:180-181` |
| B3 | `0x00222213` EndGame_SN | 比賽結束 | `:170-171` |
| B4 | `0x00230111`/`0x00230112` **Timeout_CN/SN** | 時間到房主送 Timeout_CN（空 body）；Timeout_SN（0x26 body）**只更新分數、不結束任何東西**，**勝負由伺服器自訂規則決定**；TDM/Rage ＝ 擊殺數／貢獻度較多者贏 | `:199-215` |
| B5 | `0x00230123`/`0x00230124` Death_CN/SN | 擊殺回報，戰績走 running-total | `:84-86` |
| B6 | `0x00230121`/`0x00230122` Assist_CN/SN | **對加入者安全**（無 GameInfo script event） | `:246-257` |
| B7 | `0x00222221` User_Score_SN | 只能在 EndGame_SN 的 Scene_Change(5) 之後被接受；body：`+0x00 WinTeamIndex, +0x02 WinTeamRank, +0x04 WinTeamScore, +0x08/+0x16 兩組記錄, +0x24 userCount, +0x25+i*0x3A 逐人` | `:223-238` |
| B8 | 14-byte score record | `+0x00 team, +0x02 score, +0x04 round, +0x05 alive, +0x06 try, +0x08 goal, +0x0A exp` | `:58-70` |
| B9 | `0x00222114` Game_Score_SN | 他自己標「未確認候選」，可能是唯一能不靠 script event 把個人 K/D 送給加入者的包 | `:262-263`、open items `:277` |
| B10 | `syncTeamScoreToPeers` | 每次擊殺後把隊伍分數同步給非房主 | `:253` |
| B11 | **加入者安全總規則** | **不要把 Death_SN 或 objective SN 送給加入者**（handler 結尾呼叫 GameInfo script event，加入者沒有 `Level.Game`）；只有 Timeout_SN 與 Assist_SN 確認安全 | `:242-251` |
| B13 | Time-up 勝負規則表 | TDM/Rage ＝ 擊殺數／貢獻度較多者贏（表列 6 種模式） | `:205-212` |

## 表 C：差集（表 B 有、我方沒有）

| # | opcode | 名稱 | 我們目前知道什麼 |
|---|---|---|---|
| C1 | `0x00230111`／`0x00230112` | Timeout_CN／SN | ⚠️ **我方目前把 `0x00230111` 當成「Lobby Enter CQ」在用**（`state.md:192`），但 DLL 與 Moon 都說真名是 `Timeout_CN`。`state.md:68-69,190-192` 已標這個矛盾、⬜ 未解。**TDM 靠這對封包在時間到時判勝負，我方完全沒有對應邏輯。** |
| C2 | `0x00222114` | Game_Score_SN | ⬜ 未知。`state.md:83` 列在「尚未實作」。Moon 自己也標未確認 —— **雙方都不確定，不是我方獨缺** |
| C3 | `0x0023013A` | Campaign_SN | 🟡 `room.dispatch.js:76` 定義了常數 `SN_CAMPAIGN` 但**全 repo 沒有呼叫點**。我方 PvE 直接送 EndRound_SN／EndGame_SN 繞過它，且有 5 回合實測佐證可行。TDM 需不需要它 ⬜ |

## explorer 整理時發現的矛盾（高階待處理）

1. **`state.md:83` 把 `EndGame_SN 0x00222213` 列在「尚未實作」，與程式碼直接矛盾** ——
   `lobby.dispatch.js:573-586` 明確在送，且 `journal/2026-09-19-0900-r-round-impl.md` 佐證跑通。
   很可能是 R-ROUND 實作後沒回頭更新。**高階要核對後更正。**
2. `0x00230111`／`0x00230112` 的命名衝突在 `state.md` 標了 ⬜，但**沒有連到「TDM 需要它判時間到勝負」**——
   這其實是 D2 動工前的硬性缺口，不只是命名細節。
3. **Moon 文件第 9 節 Code map 引用的是他自己那份實作的檔名／函式名**
   （`OBJECTIVE_SN`、`handleObjectiveCq`…），我方 `dispatch/` grep 零命中。
   照著他的 code map 來我方檔案裡找對應會撲空，設計稿要提醒一句。
4. `SN_CAMPAIGN = 0x0023013A` 是定義了從未使用的死常數，是舊實驗殘留還是「本來要接沒接」⬜。
