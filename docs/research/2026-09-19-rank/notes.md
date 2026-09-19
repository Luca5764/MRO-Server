# RANK：結算評等永遠是 F 的原因（中階分析，高階抽驗；🟡 未經跨公司審查）

- [SRC] `ZPage_PveResult.uc:113-165`：`m_TotalScore = GameInfo.WinTeamScore`；`m_Rank.Score = GameInfo.WinTeamRank - 1`（註解寫「F:1 ~ SS:11」，範圍限制在 0..10）。**評等完全由伺服器指定的 WinTeamRank 決定**，客戶端沒有自己的公式。
- [DLL] `GAME_INFO.WinTeamRank` 唯一的寫入者是 `Game_Result_Set`（`0x10707275` → `0x1071b4b0`），整個 DLL 只有一個呼叫點 `0x107ecff6`（高階用 xref 查過），就在 **`ZDispatchRoom::User_Score_SN 0x00222221`**（thunk `0x107051b9` → `0x107ece60`，高階查過）裡。
- **直接原因：伺服器從來沒有送過 0x00222221** → WinTeamRank 維持 0 → 0-1 限制到 0 → Rank F。
- User_Score_SN body（中階逐指令讀出，🟡）：+0x00 u16 WinTeamIndex、+0x02 u16 **WinTeamRank（1＝F … 11＝SS）**、+0x04 u32 **WinTeamScore**、+0x08 與 +0x16 兩組 Game_Score_Set 區塊（跟 EndGame 相同：u16 Team、u16 Score、u8 Round、u8 Alive、u16 Try、u16 Goal、u32 Exp）、+0x24 起是 u8 筆數＋每人一筆（stride 可能是 0x4B）⬜。
- ⬜ 逐人資料的格式；count=0 是否安全；m_TotalPoint（本隊成員 ScoreBattle＋ScoreAssist＋ScoreMission）的來源；ZDispatchRoom 在戰鬥場景（6）下是否還會處理。
- **評等要用什麼公式，沒有 DLL 依據，由伺服器決定（設計決策）。**

## 網路資料調查（RANK-WEB，中階 general-purpose，🟡 待審）

**結論：沒有找到 Rank（F～SS）的評分公式或門檻。** 能確認的只有下面幾點（韓國 Netmarble 官方公告，全部透過 Wayback 讀取）：

- PvE 有 S 評價，而且算難拿，官方拿來當活動條件：
  - 2009-06-12：在「難攻不落」PvE 高級任務拿到一次 S 就發獎勵（`notice_no=09061200000000000002`）。
  - 2009-09-23：Banded（PvE 3）活動，其中一週的條件是「在 Banded 拿到 S」→ 評價跟地圖、難度一起看（`notice_no=09092300000000000002`）。
- PvE 會給經驗值、點數、卡片優惠券：
  - 要打到結束才拿得到，輸了也算；PvE 的 K/D 和勝敗不計入戰績（2009-05-15 `update notice_no=09051500000000000003`）。
  - 2009-05-19 修正了「PvE 拿不到獎勵」的錯誤（`09051900000000000002`）。
- 2009-07-13：調整「PvE 各難度獲得的貢獻度」→ 貢獻度隨難度變（MR Focus `09071300000000000003`）。
- 2009-12-18：PvE 4 Quinie 主打「跟時間賽跑」，是唯一提到通關時間的官方資料，沒有說跟評價有關（`09121800000000000002`）。
- 2010-03-19：PvE 排行榜上線，評分標準只放在圖片裡，Wayback 沒存到。同一篇還寫到「PvE 命數 +1」道具，讓每回合復活次數從 3 次變 4 次（`10031900000000000002`）。
- 🟡 一篇玩家攻略（PvP，作者自己說不確定）：打掉一台滿血敵機約得 15 貢獻，其中傷害 1～10、擊殺加 5。
- 沒找到的地方：
  - 台灣：巴哈 bsn=16400、wasabii 官網都沒有評價門檻；
  - 日本：沒有相關資料；
  - namu.wiki：被 Cloudflare 擋（403），沒讀到。
  - 另外，搜尋結果裡的「Valkyrie 14 分鐘 = SS」講的是 CrossFire 的 Metal Rage 模式，**不是這款遊戲，不要採用**。
- 涵蓋範圍：抓了 Netmarble 1883 個存檔網址中的約 560 個；約 180 個因為 Wayback 逾時失敗，沒有重試。

對本專案的意義：評價是伺服器算的（見上方 `User_Score_SN` 分析），公式失傳。可以採用的方向是自訂一個跟「難度、地圖、通關時間、死亡數」有關的公式，並在文件裡標明**是我們自己訂的**，不是原版公式。
