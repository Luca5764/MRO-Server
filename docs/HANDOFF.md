# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## ⚡ 高階交接：Codex Sol → 下一位高階（2026-09-18 22:02，請以此段為準）

### 接手規則已履行

- Sol 已依序讀完交接／state／INDEX，並獨立重驗上一位兩條 ✅：
  - `Map_Change_One_SA 0x00220222` 本體 `0x107eb510` 確實要求 body 前 6 bytes 全 0；非零跳 `0x107eb683` 直接返回。
  - `Room_Name_SN 0x0022021A` 本體 `0x107ea7d0` 對 body 字串呼叫 `winToUNICODE`，欄位確為 ANSI。
- 兩條都不需更正。下一位仍須照 `AGENTS.md`「接手時」再抽驗本段最新 ✅；不要只沿用結論。

### 測試環境與分支（先看這裡）

- 共用主工作目錄最後觀察在 `flash-wip-room-team`；Gemini 可能正在做 R12/R13。**提交前一定先 `git branch --show-current`，不要在主工作目錄直接寫高階文件。**
- Sol 的文件 worktree：`/tmp/mro-sol-doc`，分支 `reverse-work`。
- 隔離測試 worktree：`/tmp/mro-sol-test.eudtCb`，分支 `sol-test-room-money`；含 R11、M1、測試開關與已審 M2。
- tmux `server` 現在由該測試 worktree 執行，監聽 `0.0.0.0:9211`、`0.0.0.0:30907`；目前 log 為 `logs/session-20260918-214305.jsonl`。
- DB migration `tools/add-account-money.js` 已由 Sol 執行：accounts 新增 Point/Cash/Coupon，預設 `100000/0/0`。不要重做非冪等 SQL；資料庫變更仍須腳本。

### R11 房間玩家槽：部分成功，拆成 R12/R13

- [OBS][LOG] `ROOM_TEAM_INDEX_MODE` enabled 後玩家已進紅隊第一格，能看到 ID 第一字 `L` 與房主圖示；證明 Red=0／Blue=1 的核心修正生效。完整頭像尚未出現。
- [DLL] `User_Name_SN 0x00220421` 本體 `0x107eb050`：`lea esi,[eax+0x2b]`＝body+0x1B，隨後呼叫 `winGetSizeUNICODE`／`winToUNICODE`。目前 sender 在該處送 UTF-16LE，恰好解釋只顯示 `L`；R12 已交 Gemini 做預設關閉的 ANSI 單變數修正。
- [DLL] `User_Pilot_SN 0x00220402` export `0x10706866` → `0x1072c810`，會按 user index 將 pilot 寫入 room user record+0x38；wire layout 現行正確。
- [SRC] 房間槽用 `CacheManager.GetImageIndex(PilotCode)` 畫頭像；此函式只有 HighGroup 5 查 pilot record。現行 `PilotCode=101/102` 是否是有效 Cache ItemIndex 尚未確認，R13 僅分析，禁止猜值修改。
- 契約：`docs/backlog.md` R12、R13。Gemini 組語結論仍必須由高階重驗。

### M1/M2 金錢與購買刷新

- [OBS] G 幣已確實從 100000 扣成 99000；購買 transaction 與 DB 餘額路徑成立。
- [OBS][LOG] 新物品購買當下未出現在庫存，離開再進格納庫後出現；舊 log 顯示含新 serial 的 `ItemInfo_SN 0x00210111` 先於 Buy ACK `0x00240202`。
- Gemini commit `cc99bac` 將成功 ACK 移到 ItemInfo 前。Sol 已審：程式是純區塊搬移，成功／失敗分支和資料內容未變，`node --check`／`diff --check` 通過；已 cherry-pick 為測試分支 `0830b55` 並重啟 server。
- **尚未實測 M2 後物品是否立即出現。** Gemini 日誌把時序假設寫成根因，證據過強；M2R 契約要求改回 🟡，不要先標 ✅。
- 契約：`docs/backlog.md` M2R。

### 2026-09-18 新玩家盲測：三個新問題

一位完全不知道逆向進度的玩家實際操作，回報以下三點。這種盲測比熟悉 workaround 的操作者更容易抓到真實 UX 缺口；目前都只標 [OBS]。

1. **基本主武器在庫存看起來有兩把。**
   - [DB] account 1 的 mech 1／part 1 有多個不同武器，但沒有相同 item_id 重複；基礎 `22100101` 只有 serial `100155` 一筆。
   - 因此不能先刪資料；要取得兩列各自 serial/item_id，排除不同 item 共用名稱／圖示或 WearInfo 重複列示。契約 P1。
2. **其他機體換裝後，PvE 只有主武器保留，輔助武器與裝備回預設。**
   - [LOG] 本場 slot 1 最終 CQ：`body=100154 main=200013 left=100219 right=200003 equipment=200005 skin=0`；slot 3：`body=100162 main=200010 left=200001 right=0 equipment=0 skin=0`。
   - [DB] slot 1 五項非零都已保存；slot 3 保存 body/main/left，right/equipment 在 CQ 本來就是 0。故「saveEquippedLoadout 只存 main」已被排除。
   - [LOG][CODE] 開戰 `Game_User_SN 0x00222112` 從 DB 組 main/left/right/booster/skin。下一步應追 `Game_Slot_Set` 到 `ServerMechWeaponSet_MH()` 的讀取端；三個 `Game_UserSocket_Set` 欄位是強化石 socket 候選，不要直接塞武器。契約 P2。
3. **潛入作戰選困難，實戰仍只有三命且通關只到簡單段落。**
   - [LOG] 最後 CQ `0034233c000a00000000`＝MapIndex 9012、Time 60、Round 10；SA／SN 也回 9012／10。
   - [LOG] 開戰兩次 `Game_Info_SN` 都是 `map=9012 round=10`，body `010000000000010000000000000000020034230a000a00000000`。
   - 所以**不是房間難度選擇沒保存，也不是 GameInfo 還送 9010**。不要回頭重做 R6/R7。
   - [SRC] `ZModePve.ModeReset_BD()` 以 `GameInfo.MapInfo.Round` 判斷整場完成；命數由 map class 的 `DefNumLive + GAME_ITEM_INFO.PveRespawnAddCount` 設定，現行 bonus=0。要查 9010/9011/9012 Cache 差異、host round manager、Campaign／EndGame 時線與是否另有難度初始化。契約 P3，三案中優先最高。

### 下一步優先序

1. 審 Gemini 的 M2R → R12 → R13；R12 實測時只開名稱 ANSI，不同時動 pilot。
2. 單獨重測 M2：買一件未持有物，確認 ACK 後是否立刻出現在庫存，並核對 Point 再扣一次及重登保留。
3. 先做 P3（困難實戰仍簡單）的只讀時間線／Cache／SRC 分析；已有證據排除 map CQ、SA、SN、GameInfo 四層。
4. 做 P2 的 Game_Slot_Set 讀取端重播；必須逐機體、逐 part，不要只看 summary log 的 body/main。
5. P1 需要完整庫存截圖或能辨識兩列的操作紀錄後再判斷；目前 DB 不支持「同 item 重複」。

### 已新增六項契約

- `docs/backlog.md`：M2R、R12、R13、P1、P2、P3。P1～P3 都先分析、不改程式；若要實驗，另由高階裁成單變數、預設關閉任務。

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
