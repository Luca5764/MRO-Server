# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 高階交接：Claude → Codex Sol（2026-09-18 深夜，請以此段為準）

Claude 主力額度將盡，高階位置交給 Sol。**接手第一件事：驗證下面標 ✅ 的其中一兩條**（規則見 `AGENTS.md`「接手時」）。

### 今天完成、已合併 `reverse-work`、已推上 GitHub fork

1. **G6 機庫換裝備存檔**（merge `fb6c6ef`）：換裝 → 寫 DB → 完全重登保留 → PvE 出場帶入。四層阻塞，日誌 `2026-09-18-02` ～ `-06`。最隱蔽的一層：客戶端 `ZPanel_InvenItems.uc:408-411` 跳過 **SerialIndex 101–999**，`items.id` 全落在裡面 → `tools/renumber-item-serials.js` 已執行（冪等），主鍵搬到 100000+。
2. **商店一把一列 ＋ 期限選單**（merge `6b5e889`）：item_id 末兩碼是**持有期限**（`GameItemRecord +0x43`），同家族共用 `RepresentIndex`（+0x04）。全部送出、只讓代表項 `IsShow=1`。
3. **房間四項修正**（merge `315819c`）：面板地圖與開戰一致、房名改 ANSI、`Map_Change_One_SA` 補 6-byte 成功標頭、`SN_MAP_CHANGE_ONE` 不再洗掉房間設定。
4. **H5 佔位常數盤點**（`docs/reference/placeholder-audit.md`）：566 行寫入分類後，**56 筆未查過語意**。
5. **D1 開關盤點**（`flash-wip-switch-audit` 分支，`docs/reference/switch-audit.md`）：33 個開關分成 A12／B4／C2／D8／E7。

### 待實測（分支上，開關預設 disabled，**明天第一輪一起測**）

| 分支 | 內容 | 測法 |
|---|---|---|
| `flash-wip-room-team` | RED TEAM 槽位空白：`SN_ROOM_DEFAULT` body+0x10／+0x12 被寫入 `createWord1_/createWord2_`（實測值 9010／60），玩家 `TeamIndex=0` 紅藍都配不上。改送 Red=0／Blue=1 | 開 `ROOM_TEAM_INDEX_MODE`，建房看頭像有沒有出現在第一格 |
| `flash-wip-money` | 金錢持久化。**根因**：`Buy SA 0x00240202` 只送 6 bytes，客戶端在 `0x107deadd` 讀 body+0x06 的 int64 當新餘額 → 讀到 0 → 買完 G 幣歸零 | 先跑 `tools/add-account-money.js`（冪等，需高階執行），再開 `MONEY_PERSIST_MODE`，買一件東西看扣款與重登保留 |

兩者觀察點不重疊，可同一輪測。

### 技術債收斂（已規劃、未執行）

操作者同意先清債。建議**第一批 13 個開關**：B 全部 4 個 ＋ C 全部 2 個（只刪危險分支）＋ A 裡彼此不相依的 7 個（`ROOM_STRING_ANSI_MODE`、`GAME_CHAT_ECHO_MODE`、`ITEM_INFO_INCLUDE_BODY`、`EQUIP_SAVE_MODE`、`PURCHASE_MECH_SLOT_MODE`、`PURCHASE_ITEMINFO_REFRESH`、`SHOP_PERIOD_REPRESENTATIVE_MODE`）。
**只往目前預設值收斂＝純刪沒在跑的分支，行為在構造上不變**，不需重測；驗證用 `node --check` ＋ 啟動伺服器 ＋ `tools/test_replay.js` 離線重播比對。
A 剩 5 個（房間地圖組、商店組）同屬一條流程，第二批單獨做。E 的 7 個是「選定變體」，那是決策不是清理，最後處理。**C 的兩個絕對不要打開**：`SHOP_UNBLOCK_MODE` 含已被組語推翻兩次的 IsShow 重排；`CAMPAIGN_GAME_USER_BOOTSTRAP_MODE` 會在場景 5 送只有場景 6 處理的封包。

### 環境與協作（重要）

- **伺服器由高階自己控**（操作者明確要求），tmux `server`，主目錄 `/home/lucas/mro-reverse/Metal Rage Online Server`，現在跑主線。
- **主工作目錄是共用的**：Codex Luna 會在裡面切分支。今天已經發生過一次「commit 掉到別人的分支上」（已用 cherry-pick 修回）。**每次 commit 前先 `git branch --show-current`。**
- tmux：`codex`（Luna 中階）、`sol`、`antigravity`（Gemini 中階，今天兩份分析品質最好：`Map_Change_All_SN` 欄位表、金錢鏈）。**已開的 session 不要關。**
- GitHub：`origin` = 操作者的 fork `Luca5764/MRO-Server`（`reverse-work` 已推），`upstream` = `shanzenos/MRO-Server`（停在 2026-06-13）。
- **`AGENTS.md`／`CLAUDE.md`／`.claude`／`.codex` 已改為不受版控**（公開 fork 時移除，檔案仍在本機）。改規則不再有歷史，需另行備份。
- 原作者聯繫中：`moonlight776`（上游 PR #2 作者）在 2026-08-11 於 PR 底下回報三個問題——「地圖只載入部分」「變更房間設定跳錯誤」「進遊戲後機體選擇面板不顯示」。**後兩個我們有答案**（分別是 SA 成功標頭、以及 G5 的 `PVE_SLOT_SELECT_FLOW`）。操作者已在 YouTube 留言，等回覆。

### 下一步優先序

1. 明天一輪測完 room-team ＋ money
2. 開關收斂第一批（13 個，行為不變）
3. `placeholder-audit.md` 的 56 筆照影響面往下打——那是目前最密集的 bug 來源
4. H1 登入後商店漏接 / H3 catalog 價格 / H6 難度燈慢一拍 / H7 設定對話框地圖清單（H6、H7 建議等 Pico 2 W 到貨後再打，需要反覆試假設；`tools/pico/` 已進版控）

### 今天最值得記住的一件事

七個 bug **全是同一個形狀**：不是邏輯錯，是**當初不知道欄位語意時填的佔位值沒跟著更新**。程式裡用 `b0/w1/w2` 這種偏移當變數名的地方，就是「還沒查過語意」的記號。`placeholder-audit.md` 就是為此做的。

---

## 目前交接快照（2026-09-17 21:30，Claude 高階，請以此段為準）

### 今天完成的（全部已實測，細節看各篇日誌）

| 項目 | 日誌 |
|---|---|
| 客戶端腳本包 `.tzp` 離線解密，UnrealScript 原始碼可讀（`~/mro-decrypted/src`，**不 commit**，用 `tools/tzp-extract.py` 重建）；class 預設值用 `tools/uetool`（UELib 需套 `tools/uetool/uelib-metalrage.patch`） | `2026-09-17-07`、`-09` |
| PvE 按鍵失效根因：`Grade_Info_SN 0x00510101` 送 11＝開發者權限 → 套 GM 按鍵表；改送 0。`DefaultInfo_SN` 那個欄位其實是 UserType（性別），不是權限 | `-11`（更正 `-08`） |
| PvE 回合沒啟動：`Game_Info_SN` body+0x15 是 MapInfo.Round，原本送 0；改送建房的 PlayRound。附 GAME_INFO 完整偏移 | `-12` |
| 伺服器切 frame bug（補齊到 16 吃掉下一個封包 → 戰鬥中斷線）已修 | `-13` |
| Death_CN：body+0 擊殺者、+2 被擊殺者、+4 類型（1～4＝玩家）；AI 被殺不排程重生 | `-13` |
| 任務結束：`Campaign_CN 0x00230139`（body[2] 1 成功／2 失敗）→ 伺服器回 `EndGame_SN 0x00222213` → 結算頁 → 回房間 | `-14` |
| PvE 地圖／難度照客戶端選的（建房 body[2..3]、`Map_Change_One_CQ` w1/b5）| `-18`（G4）、`-19` |
| ItemInfo 分包（每包 ≤28 筆，現在 12）並送機體本體列 → 機庫顯示機體 | `-20` |
| Death_SN 戰績塊送累計值（`Game_User_Battle_Set` 是直接指定，送 0 會清空）→ 有分數 | `-16`（G2）、`-21` |
| PvE 選機體：`PVE_SLOT_SELECT_FLOW='client'`，開局與陣亡後走 ZSlotSelectPage → `ChangeSlot_CN` → `ChangeSlot_SN` → `Respawn_CN`；`Game_User_SN` 送 8 個槽位 | `-22`（G5） |

### 目前可玩的範圍

登入 → 機庫（看得到 8 台機）→ 建 PvE 房（選地圖／難度）→ 選機體出場 → 開火／跳／推進器 → 敵人與回合 → 擊殺計分 → 陣亡後重選機體 → 任務失敗／成功 → 結算頁 → 回房間。已實測地圖：9001 `Map_PC01`（動力奪取戰）、9010 `Map_PC04`（潛入作戰）。

### 已知問題（未處理）

- 結算頁隊伍分數塊全 0；exp／point 每殺 10 是暫定值（`lobby.dispatch.js`）。
- `Assist_SN 0x00230122` 仍回 16 bytes 空包（正確格式見 G1 `-15`）。
- 遊戲內聊天不顯示（伺服器回了客戶端不認得的 opcode；做法見 G3 `-17`）。
- 機庫換裝備沒有存 DB；`room.dispatch.js` 把 `0x00240112` 當 CQ（DLL 的 DefaultSlot CQ 是 `0x00240111`）。
- 間歇性卡頓，伺服器端看不出網路停頓，疑似客戶端本身。
- `room.dispatch.js` `sendRoomState` 的房間資訊地圖仍固定 9001／舊 index 58，目前沒看到影響。
- Map_PC04 客戶端 log 有 `MRNavigation ... Accessed None 'NodeActor'` 警告。

### 協作狀態

- 分支：`reverse-work`（主線）；中階成果應 commit 到 `flash-wip` 再由高階合併。
- tmux：`server`（伺服器）、Codex session（操作者 2026-09-17 21:45 把原本的 `sol` 關掉，改開 Codex 主力做 backlog）。Sol（高階 reviewer）額度約剩 30%，只留給重要審查；已開的 Codex session 不要隨便關，cache 會掉。
- `docs/backlog.md` 的 G1～G5 都已完成並審查。

### 下一步

- **Claude 額度將盡**，操作者決定交給 Codex（Luna，中階）或 Gemini（中階）：做 `docs/backlog.md` 的 **G6（機庫換裝備存檔）**，有餘力再做 **G7（遊戲內聊天顯示）**。兩個都允許改伺服器，但新行為要放在預設關閉的開關後面、在 `flash-wip` 分支、實測時暫時打開，規則寫在 backlog「2026-09-17 21:40 新增」。
- 審查：Codex reviewer Sol（需要時用 `codex -m gpt-5.6-sol` 另開，額度約 30%）或下一個接手的 Claude。審過才把開關預設打開並合併回 `reverse-work`。
- 之後的候選：結算細節（EndGame_SN 隊伍分數、exp／point 真實算法、遊戲結束後取消殘留重生）、`Assist_SN` 照 G1 補格式。
