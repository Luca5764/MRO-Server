# RANK：結算評等永遠是 F 的原因（中階分析，高階抽驗；🟡 未經跨公司審查）

- [SRC] `ZPage_PveResult.uc:113-165`：`m_TotalScore = GameInfo.WinTeamScore`；`m_Rank.Score = GameInfo.WinTeamRank - 1`（註解寫「F:1 ~ SS:11」，範圍限制在 0..10）。**評等完全由伺服器指定的 WinTeamRank 決定**，客戶端沒有自己的公式。
- [DLL] `GAME_INFO.WinTeamRank` 唯一的寫入者是 `Game_Result_Set`（`0x10707275` → `0x1071b4b0`），整個 DLL 只有一個呼叫點 `0x107ecff6`（高階用 xref 查過），就在 **`ZDispatchRoom::User_Score_SN 0x00222221`**（thunk `0x107051b9` → `0x107ece60`，高階查過）裡。
- **直接原因：伺服器從來沒有送過 0x00222221** → WinTeamRank 維持 0 → 0-1 限制到 0 → Rank F。
- User_Score_SN body（中階逐指令讀出，🟡）：+0x00 u16 WinTeamIndex、+0x02 u16 **WinTeamRank（1＝F … 11＝SS）**、+0x04 u32 **WinTeamScore**、+0x08 與 +0x16 兩組 Game_Score_Set 區塊（跟 EndGame 相同：u16 Team、u16 Score、u8 Round、u8 Alive、u16 Try、u16 Goal、u32 Exp）、+0x24 起是 u8 筆數＋每人一筆（stride 可能是 0x4B）⬜。
- ⬜ 逐人資料的格式；count=0 是否安全；m_TotalPoint（本隊成員 ScoreBattle＋ScoreAssist＋ScoreMission）的來源；ZDispatchRoom 在戰鬥場景（6）下是否還會處理。
- **評等要用什麼公式，沒有 DLL 依據，由伺服器決定（設計決策）。**
