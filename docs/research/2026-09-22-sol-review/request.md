# 跨公司審查請求（Sol）— 2026-09-22 批次

由 PM（Fable）開立。Sol 自 2026-09-19 起無額度，這段期間標的 ✅ 全部註記「未經跨公司審查」，本批一次補審。
**只審推論與證據對不對得上，不重做逆向。** 機械核對（位址是否真的做描述的事）可用 `Metal Rage Online Server/tools/disasm.py at <va> <n> <dll>`。

## 目標
對下列項目給出三種結論之一：**同意 ✅**／**降為 🟡（寫明缺什麼證據）**／**反對 ❌（寫明矛盾點）**。同意的項目由高階把「未經跨公司審查」註記拿掉。

## 範圍（依重要性排，額度不夠就做到哪算到哪）

### 第一級：會發給朋友的客戶端修補（錯了會讓所有人的客戶端壞掉）
1. **Engine.dll 候選 1b**（房主 netspeed 夾值）：`docs/research/2026-09-21-netspeed-host-patch/design.md`、`docs/journal/2026-09-22-1245-round2-result.md`、`docs/journal/2026-09-22-1345-netspeed-min.md`。
   核對：`0x1047f9b1`／`0x1047f9b5`／`0x1047f9b8` 的原始 bytes 與語意；「加入者端走不到此分支」的依據（`ServerConnection` 閘門 `0x1047ecf5`）；A/B 的唯一變數是否真的只有房主 Engine.dll；30000 的結論是否被人手輪（5.7%）推翻而改為 30000＋budget。
2. **budget patch（外部來源 Moon，我方核對）**：`docs/research/2026-09-22-netspeed-budget/high-tier-review.md`、`disasm-0x1042e1ee.txt`、`threshold-tally.txt`、`docs/journal/2026-09-22-1620-host-fps.md`（含兩段更正）。
   核對：`0x1042e1ee`–`0x1042e224` 是否為 `QueuedBytes` 夾值；cave `0x10678b20` 的 x87 結果是否 `-(2D + NetSpeed/4)`；`[ebp-0x1c]` 借用是否安全；A/B（15000 下 11–13% → 0%）的歸因。
   **請特別看**：函式身分（是否 `UNetConnection::Tick`）我方標 ⬜，若 Sol 能定案最好。

### 第二級：PvP 的前提（錯了 D2 整條線要重做）
3. **加入者收戰鬥封包的安全性**（state.md 第 161–164 列）：`docs/research/2026-09-21-moon-objective-protocol/verify-b-death-sn.md`、`verify-d-endgame.md`。
   核對：`Death_SN` 的 `Game_Host_Check` 閘門（`0x1071a560`、`0x1072e208`）；`EndRound_SN` 的 `LevelInfo+0x630` null 檢查（`Engine.dll 0x1047ab70`）；`Dedi_End`（`0x10716e90`）開頭的 `GIsClient` 早返回；`User_Score_SN`（`0x107ece60`）全函式不碰 Level。
   實跑佐證：`docs/journal/2026-09-22-2230-pvp-2p-first.md`（PvP 2 人加入者存活）。
4. **勝負由伺服器判定（D2 P1）**：`docs/research/2026-09-21-d2-pvp/verify-p1p2.md`。
   核對：`DefaultGameInfo.uc:395-405` 的 `EndGame()` 空殼；Blow 的偵測被註解（`BlowMission.uc:93-117`）vs TDM 偵測鏈仍活（`ZDeathMatch.uc:285`→`ZTeamDM.uc:880-895`）；P2 維持 ⬜ 是否恰當。
5. **TDM 設計稿**：`docs/design/d2-pvp-tdm.md`（v2，PM 已審、要求 4 處修改）。審整體推論，特別是 §5 兩來源矛盾的處置與 §7 的步驟順序。

### 第三級：其餘 state.md 註記列（131、149、167、173）與 P3 設計（`docs/design/p3-*.md`、`e1-item-ownership.md`）
有餘裕再看；沒有就留到下一批。

## 限制
- 不改任何檔案。結論寫到 `docs/research/2026-09-22-sol-review/verdict.md`，一項一節，每節開頭寫結論、接著寫依據（位址、行號、檔名）。
- 對外部來源（Moon）的說法，審的是**我方的核對**是否成立，不是 Moon 本人。
- 發現同一份證據被兩個結論引用、或引用的檔案不存在，直接列出，不要替它補證據。

## 完成條件
`verdict.md` 對第一、二級每一項都有結論；第三級做到哪寫到哪。
