# Backlog：交給中階的契約任務

給 Gemini（Antigravity）、Codex Luna、Claude 子 agent 這些中階執行者用。**先讀 `AGENTS.md`**（工作原則、硬性約束、證據標籤、「只剩中階可用時」一節）。

## 共通規則（每個任務都適用）

- **不改 `docs/state.md`、不標 ✅／❌、不改資料庫。** 結論一律標 🟡 或「待審」，由高階審查。
- 分析任務不改程式。契約明寫允許實作的任務，新行為一律放在**預設關閉的開關**後面（例如 `const XXX_MODE = 'disabled'; // 'disabled' | 'enabled'`），commit 時一定是關閉。開關預設值只有高階能改。
- 客戶端與伺服器只有一套。**不要要求操作者測試**，也不要啟動、停止或 `/reload` 伺服器（tmux `server` 由高階控制）。實測由高階安排。
- 工作位置：`git -C /home/lucas/mro-reverse worktree add -b <分支> ~/mro-wt/<名稱> reverse-work`，只在那個 worktree 裡動檔案。**不要在主目錄切分支**，也不要用 `/tmp`。
- 交付：
  - 原始 decompile／組語存到 `docs/research/<日期>-<主題>/`。
  - 一篇日誌 `docs/journal/<日期>-<HHMM>-<主題>.md`（50–100 行）。在 `docs/journal/INDEX.md` 追加一行，**5 欄**：日期｜檔名｜opcode｜`—`｜一句話（第 4 欄是舊的狀態欄，新列一律填 `—`，狀態記在 state.md／backlog）。
  - commit 最後一行 `Agent: <工具> (中階)`。
- 資料庫變更寫成 `tools/` 下的腳本，由高階執行，不直接下 SQL。
- 工具（在 `Metal Rage Online Server/` 底下執行）：`python3 tools/disasm.py {exports|at|func|xref|str} ...`、`tools/ghidra/decompile.sh <va>`（換 DLL：`DLL=Engine.dll`）、`tools/dispatch-map.py`、`tools/item-names.py <編號或名稱>`；opcode 名稱查 `docs/client-dispatch-map.md`。客戶端檔案在 `/mnt/c/Games/MetalRage Online/data/`。
- 解密後的客戶端 UnrealScript 原始碼：`~/mro-decrypted/src/<Package>/<Class>.uc`；class 預設值：`tools/uetool/bin/Release/net8.0/uetool ~/mro-decrypted/<Pkg>.u decompile <Class>`。不要讀 `Metal Rage Online Server/static/`。
- **Ghidra 的參數順序常出錯**：封包欄位偏移一律回頭看組語確認，日誌裡寫出你核對的組語位址。
- 一次只改一個變數。遇到跟既有 ✅ 矛盾、需要超出範圍的改動或架構決策：停下來回報，不要自己擴大範圍。

---

## 優先（roadmap M0–M2）

依 `docs/roadmap.md`。A 線要用客戶端，一次只做一件；B 線可以平行。

### 佔位常數中與多人有關的（優先查）

出自 `docs/reference/placeholder-audit.md`，以下幾筆跟 user index、隊伍、人數有關，排在其他 (c) 類前面：
- `gate.dispatch.js:51`：Gate Enter_SA +0x06 送 `0xDEADBEEF`（測試用的 account index）。
- `room.dispatch.js:620-621`：Ready 回送固定 slot `0`。
- `lobby.dispatch.js:314-316`：`Room_List_SN 0x00230103` 固定送空清單（flag／count／size 都是 0）。
- `room/room-user.sender.js`：`User_Default_SN 0x00220233` +0x15、`User_State_SN 0x00220401` count `1`、`User_Master_SN 0x00220319` 的 state 來源。
- `room/room-game-user.sender.js:125-144`：`Game_User_SN 0x00222112` 的 record header count。
- `room/room-state.sender.js:55-60`：`Room_Default_SN 0x00220203` 房間旗標 +0x09 等欄位。
- `gate.game.dispatch.js:654-657`：Create_SA +0x0B。

### 停放清單（不影響多人打完一場，不刪）

H1、H3、H6、P1、P1b、Legend 機體授權、exp 公式、房間頭像（R14／R15，`journal/2026-09-18-2305`）。

---

## T1：困難模式時間上限跟隨房間設定（A 線）

> **狀態：2026-09-18 開立。先做組語確認，再實作並實測。**

- **目標：** `Game_Info_SN 0x00222111` 的 TimeLimit 改用房間的 PlayTime，不再寫死 10 分鐘。
- **範圍：** 只動 `gate.game.dispatch.js` 的 `timeLimitMinutes`。
- **背景：** `journal/2026-09-18-18-pve-hard-flow.md`：困難房在 547 秒左右停住。
- **限制：** 只改這一個變數，放在預設關閉的開關後面。PlayTime 的單位和它在 body 裡的偏移要先確認，並附組語位址，不可以從 CQ 的值直接類推。
- **交付：** 一篇日誌，加上一次實測：開 9012 困難房，看能不能打超過 10 分鐘、會不會出現 Campaign／EndGame。
- **完成條件：** 有 [LOG] 和 [OBS]；或者明確寫出「時間上限不是停住的原因」，並附上證據。

## A6b：回歸測試補一個 PvE 整場樣本（B 線最優先）

> **狀態：2026-09-18 開立。**

- **目標：** 新增一個黃金樣本，走完這條流程：建房 → F5 開始 → `Game_User_SN` → `Game_Info_SN` → BeginRound → Respawn → 幾次 Death／ChangeSlot → `Campaign_CN` → `EndGame_SN` → 回房間 → Leave_CQ。
- **範圍：** 從現有 session log 切一段完整通關的場次，例如 `session-20260918-205012.jsonl` 那場 9010 簡單房。
- **背景：** `Metal Rage Online Server/test/README.md` 的「Not covered yet」一節。
- **限制：** 不改 dispatch 的程式。伺服器行為如果帶計時器，要用假時鐘，不可以用 sleep 等過去。fake-db 缺資料就補 fixture，不連真的資料庫。
- **交付：** 樣本本身，加上 README 的更新。
- **完成條件：** 未改動的程式跑出來全綠；`Game_User_SN` 和 `EndGame_SN` 各改一個 byte，兩次都要變紅，兩種結果的輸出都要附上。

## S1：單人假設盤點（B 線，唯讀）

> **狀態：2026-09-18 開立。**

- **目標：** 列出 `dispatch/` 和 `session.js` 裡所有假設「只有一個玩家」的地方。
- **範圍：** 寫死的 user index 或隊伍；只回送給來源連線的 SN；掛在單一連線上的房間狀態（例如 `campaignRoom_`）；`Game_User_SN`、`User_Default_SN`、`Room_List_SN` 的筆數；房主怎麼判定；`Ready_Host_SN 0x00420115` 帶的 IP 從哪裡來。
- **限制：** 不改程式。不確定的項目標不確定，不要猜。
- **交付：** `docs/reference/multiplayer-audit.md`。每一列寫明「檔案:行號、現在的行為、多人時應該怎麼做、依據」，分成「M1 兩個人在房間裡互相看得到」和「M2 兩個人打完一場」兩組。
- **完成條件：** M1 那一組可以直接拿去排工。

## N0：第二台主機連到伺服器（B 線）

> **狀態：2026-09-18 開立。**

- **目標：** 同一個區網的第二台主機，用 TCP 連得到 WSL2 裡的 9211 和 30907。
- **範圍：** Windows portproxy 或 WSL mirrored networking，加上防火牆規則。
- **限制：** 不改 `server.js`。需要系統管理員權限的指令寫成腳本，交給操作者執行。**只對區網開放**（硬性約束第 2 條）。
- **交付：** 做法寫進 `docs/reference/setup.md`，附一個可以還原設定的腳本。
- **完成條件：** 在第二台主機上執行 `Test-NetConnection`，兩個埠都成功，而且 session log 看得到連線來源是區網 IP。

## X1：伺服器全域例外防護（B 線）

> **狀態：2026-09-18 開立。**

- **目標：** 任何一條連線的 handler 丟出例外時，只關掉那一條連線，並留下完整的 hex dump 和堆疊，整個伺服器程序不能掛掉。
- **範圍：** dispatch 入口的 try/catch；`process.on('uncaughtException'／'unhandledRejection')` 只寫紀錄，不吞掉錯誤，log 裡要有一筆醒目的 marker。
- **背景：** 多人時，一個怪封包會讓所有人一起斷線。
- **限制：** 正常路徑的行為不變，不要順手重構。
- **完成條件：** 回歸測試全綠；另外寫一個測試：故意送一個會讓 handler 丟例外的封包，確認伺服器程序還活著，log 裡也有 dump。

## W1：帳號白名單（排在 X1 之後，M3 之前）

> **狀態：2026-09-18 開立，操作者已同意。**

- **目標：** 只有列在設定檔裡的帳號名稱，才能登入或自動建立帳號。
- **範圍：** 登入 handler（`CQ_LOGIN_WASABII` 那條路徑）；新增設定檔 `config/allowed-users.json`，不進版控，repo 裡附一份 example。
- **背景：** 硬性約束第 2 條；roadmap M3。
- **限制：**
  - 設定檔不存在時維持現在的行為，但啟動時要印出醒目的警告，build 事件也要記錄白名單是開還是關。開發和回歸測試都不受影響。
  - 拒絕登入前，要先查出 DLL 裡登入失敗的 SA 格式，並附位址。查不到就只關閉連線，不要自己猜一個失敗封包的格式。
  - 被拒絕的嘗試要寫進 log，記下帳號名稱和來源 IP。
- **完成條件：** 回歸測試全綠（設定檔不存在的情況）；另外寫兩個測試：白名單內的帳號可以登入；白名單外的帳號不會建立帳號，DB 裡沒有新增資料列。

## K1：安裝包（M3 的時候再做）

> **狀態：記錄用，M3 前不動。**

- 寫一個 `set-server-ip.bat`：一次改掉客戶端的 `ip=` 啟動參數、`MetalRage.ini` 和 `Default.ini` 的 `ServerIP` 三處（見 `docs/reference/client.md`）。
- 附一頁安裝說明。朋友遠端安裝時，不能指望他們自己手動改 ini。
- **偵測作業系統版本**：Win10 的 build 號碼小於 22000。依結果自動選對應的 exe，至少要印出提示。安裝包要同時附上兩個版本的 exe（雜湊見 `reference/setup.md`「依作業系統選 exe」）。
- **修掉 `Play Metal Rage Online.bat` 的 bug**：內層的 `if %ERRORLEVEL% NEQ 0` 包在 `if ( ... )` 區塊裡，`%ERRORLEVEL%` 在剖析整個區塊時就已經展開成外層的非零值，所以檢查 `reg add` 有沒有成功的那一行等於失效：永遠判斷成失敗、印出 FIRST RUN 然後離開。改用 `if errorlevel 1`，或開啟 delayed expansion 改用 `!ERRORLEVEL!`。
- **字型檢查**：第二台的 `Window Font Count` 是 347，主機是 512。切中文介面前，要確認有安裝「繁體中文補充字型」（Windows「選用功能」）。

## E1：物品「擁有」與「裝在哪台」拆開（IsShare）

> **狀態：2026-09-19 操作者同意 DB 結構改動並要求優先做，實作已派出（flash-wip-e1，開關 ITEM_EQUIPS_MODE）。遷移腳本由高階在 Sol 審過、先備份後才執行。**
>
> **原狀態：2026-09-19 開立，等 PM 排序、操作者同意 DB 結構改動。** 來源：[OBS] 操作者的哥哥（玩過原版）回報「以前輔助武器、裝備買了以後所有機體都能用，現在每台都要各買一次」。

- **分析（IS1，🟡，未經跨公司審查）：**
  - [SRC] 客戶端 `ITEM_DETAIL_INFO`（`ZNetwork_DJ.uc:185-220`）沒有「屬於哪台機」的欄位。庫存清單只用 `ItemSubordinateCheck`（`ZPanel_InvenItems.uc:790-847`）比對武器類別和機體類別，所以帳號擁有一件，每台相容的機體都看得到。
  - [SRC] `IsShare`（`GameItemRecord.ShareType==1`，`ZPage_Hangar.uc:505-509`）決定能不能**同時**裝在多台上：非共享物品裝到 B 機時，會從 A 機卸下（`ItemFree`，`ZPage_Hangar.uc:917-924`）；共享物品可以多台同時裝。
  - [CODE] 伺服器的 `items.mech_type` 一件只能綁一台；`saveEquippedLoadout`（`db.js:203-208`）換裝時直接改寫成新的機體；購買不檢查是否已擁有（`room.dispatch.js` 約 884-891）。這些都是 G6e 的做法，G6e 當時只驗證了「買到的東西看得到」，沒有驗證跨機體使用。
- **目標：** 共享物品可以多台同時裝備；非共享物品照原版「裝到 B 就從 A 卸下」；買一次就好。
- **範圍（先分析後實作）：** 從 Cache.Bin 讀出 `GameItemRecord.ShareType`（偏移要用 DLL 或 uetool 確認），列出主武器、副武器、裝備、塗裝各自的 share 狀態；設計「裝備表」（serial、機體槽位、部位），讓同一個 serial 可以出現在多台機體上；遷移腳本（`tools/` 下，冪等）；`WearInfo`、`Game_User_SN`、`Slot_Change` 改從裝備表讀。
- **限制：** DB 結構改動要寫成 commit 進去的腳本，由高階執行，要先經操作者同意；回歸測試的 fixture 要跟著更新；一次一個變數。
- **待確認：** 請操作者的哥哥描述更精確一點：是「換到另一台機時，清單裡看不到」，還是「看得到，但裝上去以後原本那台的就不見了」？
- **完成條件：** 實測時，同一件共享物品可以同時裝在兩台機體上，重登之後都還在。

## R-ROUND：PvE 回合推進（PM 開立 2026-09-19）

> **還沒驗的（PM 2026-09-19）：** (1) 最後一回合 → EndGame_SN 的時機：用初級（5 回合）＋ pveExtraLives 個位數（例如 7）測，這時再開多命就是單變數；(2) BeginRound_SN 回的內容是否該帶回合資訊（現在全 0，客戶端有進入第二回合，所以不擋）；(3) EndRound_SN 分數欄位全 0 對 HUD 的影響（如果回合之間分數歸零，就是這個原因）。全部通過後，7 天內收斂 `PVE_ROUND_ADVANCE_MODE`，並附理由重錄 pve-full-match。

> **2026-09-19 實測 ✅（已由 Sol batch1 審查，成立，見 `research/2026-09-19-sol-review/batch1.md` 第 2 條）：** EndRound_SN 讓 PvE 進入第 2 回合（`session-20260919-083650.jsonl:1450-1453`，`journal/2026-09-19-0900-r-round-impl.md`）。剩下：打到最後一回合，確認結算（EndGame_SN）；多命 pveExtraLives=7 另外單獨驗證。

> **2026-09-19 分析完成**（`docs/research/2026-09-19-r-round/notes.md`，🟡）：✅ [DLL] Campaign_CN body 固定是 `01 00 01／02`，**沒有回合數**（高階抽驗 `0x107dac1e`–`0x107dac43`）→ 伺服器要自己記錄回合。候選回應是 `EndRound_SN 0x00222211`（`0x107d7a50`）；⬜ 還沒證明它會觸發 EndRound_BD，body 格式 🟡。實驗設計寫在 notes 最後。

> **狀態：分析已派出（唯讀）。實作與實測排在 M1 主測之後、D1 第 6 步之前**（第 6 步要廣播的就是這段開戰／結算流程，先把單人的流程弄對再廣播）。

- **目標：** 清完一回合後進入下一回合，打滿 MapInfo.Round（初／中／高分別是 5／8／10）才結算。
- **背景：**
  - [LOG] 三份 log 裡的每一場都只有 1 次 `BeginRound_CN 0x00230151`，第一個 `Campaign_CN 0x00230139` 一來就結束（012749：1／1／1；002245：開戰 8、BeginRound 8、Campaign 3；205012：開戰 6、BeginRound 6、Campaign 4；高階 2026-09-19 重算）。不分難度、不分 Round 值。
  - [SRC] `ZNetwork_DJ.uc:1903`：Game_Campaign(ActionType) 的 1＝목표달성（目標達成）、2＝실패（失敗，遊戲結束）。`ZModePve.uc:1155-1160`：進入下一回合時送 Game_Campaign(1)；`:1127-1129`：`MapInfo.Round == GetPveCurrentRound_BD()` 時才 EndGame；`:716-722` 的 `EndRound_BD()` 註解寫「回合結束時由 Network 呼叫」→ ModeReset_BD(true)；`:128` 則在 `CurrentRound >= MapInfo.Round` 時 return。
  - 🟡 推論：伺服器對任何 `Campaign_CN` 都回 `EndGame_SN 0x00222213`（`lobby.dispatch.js:211-224`），所以每一場都在第一回合就結束。應該回一個「回合結束」的 SN（候選 `EndRound_SN 0x00222211`，state.md 列為未實作），只有最後一回合才回 EndGame。`Campaign_CN` 的 body[0..1]＝`0100` 可能就是目前回合數。
- **範圍：** (1) DLL：哪個 SN handler 會呼叫腳本的 EndRound_BD（EndRound_SN `0x00222211`、EndQuater_SN `0x00222212`、Campaign_SN `0x0023013a`），body 格式逐欄附位址；(2) `Campaign_CN` body[0..1] 的來源；(3) [SRC] 誰遞增 CurrentRound；(4) `lobby.dispatch.js:211-224`。
- **限制：** 先分析。實作放在預設關閉的開關後面（例如 `PVE_ROUND_ADVANCE_MODE`），只改「Campaign_CN 成功、但還沒到最後一回合時回什麼」這一個變數；失敗路徑不動；開關關閉時 pve-full-match 必須全綠；不動 Assist／Death／計分。
- **實測：** 用初級（5 回合），或只看第二個 BeginRound_CN 有沒有出現。
- **完成條件：** 指出觸發 EndRound_BD 的 opcode 和 body 格式（附位址），或者明確寫出卡在哪裡。

## C2：收斂 T1 開關

> **狀態：T1 2026-09-19 ✅；期限 2026-09-26。**

- 刪掉 `GAME_INFO_TIME_LIMIT_MODE`，保留 'room' 路徑。**前提：** 這個開關翻掉要能讓回歸測試變紅；pve-full-match 樣本的 body+0x13 會從 0x0a 變成 0x3c（T1 worker 驗證過），所以收斂時要附理由重錄那個樣本。

## C3：收斂 D1 第 6 步的開關（總任務）

> **狀態：PM 2026-09-19 開立，等 D1 第 6 步的開關逐一驗證。**

- D1 第 6 步會新增 5 個開關（`docs/design/d1-step6-battle-broadcast.md` 第 5 節）；另外 `ROOM_JOIN_MODE`、`LOBBY_ROOM_LIST_MODE`、`ROOM_CHAT_BROADCAST_MODE`、`ROOM_TEAM_CHAT_MODE` 也在同一批。
- 規則：每個開關實測 ✅ 後 7 天內收斂，一個開關一個 commit，每個都要跑回歸測試；開關翻掉不會讓回歸測試變紅的，要先補樣本。
- 同時列入收斂候選：`lobby.dispatch.js` 的 `0x00230131`「Lobby Room Create CQ (guessed)」路徑（[LOG] 86 份 log 都沒出現過，而且它不註冊 Room）；`room.dispatch.js` 的 `0x00240301` 開戰路徑（[LOG] PvE 開戰實際走的是 `0x00222103`，`0x00240301` 在 session-20260919-012749 裡從沒被觸發過）。

**待審（中階，2026-09-20，worktree `~/mro-wt/conv-c` 分支 `conv-c`）：** `readyHostSplitMode`／`roomBattleStartBroadcastMode`／`battleEndBroadcastMode`／`roomReadyStateMode` 四個已收斂（各一個 commit，`node test/*.js` 與 `node test/replay-golden.js` 全綠）。`lobbyRoomListMode` 卡住：拔掉開關後 `test/replay-golden.js` 三個樣本在 send #15 出現 byte diff（多送一筆 `Room_List_SN 0x00220204`，來源是 `gamelogin.dispatch.js` 的 channel-enter 送出點）——原因是 golden 樣本用 `rooms._resetForTests()` 強制把這個開關重設回 `disabled`，跟「拿掉 default 值」不同，這次是拿掉開關本身，讓 golden 樣本永遠測不到 `disabled` 那條路。正式伺服器的預設值本來就已經是 `enabled`（更早一輪收斂已經翻過 default），所以懷疑是 golden 樣本沒跟著重錄，不代表拔掉開關會動到「已驗證的 enabled 路徑」。契約要求「golden 有 byte diff 就停下回報」，所以沒有重錄，留給主力判斷要不要重錄 golden 或改用別的收斂方式。`roomJoinMode` 完全還沒動——它是其餘所有開關共用的基礎判斷，call site 比 `lobbyRoomListMode` 更多，很可能踩到同一類問題（甚至更大），這次沒有嘗試。

## RANK-FORMULA：結算評等的真正計算公式（`pveFixedRank` 只是固定值，不是公式）

> **狀態：2026-09-21 中階 verifier 開立，未指派。**

- 背景：RANK 開關（`pveFixedRank`，commit `e5f176f`）已驗證能讓結算頁顯示非 F 的評等（[SHOT] `shots/campaign-result-screen.png` 顯示 S；正式設定 `pveFixedRank: 10`；結案見 `docs/backlog-done.md`），但那是寫死的常數，不是依表現算出來的。
- 目標：訂出一套依擊殺、任務分數、通關時間、難度等實際表現算 WinTeamRank（1=F…11=SS，`ZPage_PveResult.uc:113-165`）的公式，取代固定值。
- 依據：`docs/research/2026-09-19-rank/notes.md` 已查過原版公式無法從網路資料還原（找不到官方門檻），所以公式必須是自訂的，文件裡要標明不是原版公式。
- 前提：算公式需要真的分數資料（擊殺、任務進度等），這批資料目前歸「P3 戰績寫回」（`docs/design/p3-step1-writeback.md`／`p3-step3-writeback-impl.md`）在處理；寫回落地前，公式只能先用 in-memory 的分數（例如 Death_SN 累計的 exp/point）當輸入。
- 限制：先設計、不落地成新開關前要有人審；不得動到已收斂的 `pveFixedRank` 分支或 `Campaign_CN` 既有行為。
- 交付：一份設計稿（多少分對應哪個 Rank、輸入從哪個資料結構來），加上跟 P3 寫回時序的相依說明。
- 完成條件：公式有明確輸入輸出對照表，且指出它依賴 P3 哪一步資料就緒；若 P3 資料還沒可用，列出可以先用哪些替代資料源做初版。

## D1：多人房間模型設計稿（C 線，高階自己做）

> **狀態：等 S1 交付。屬於「要重構先問」：PM 審查、操作者同意之後才能實作。**

- 內容：Room 物件（成員、user index 分配、房主、紅藍隊）；「送給房內所有人／所有人但排除自己」的輔助函式；斷線和重連時怎麼處理成員資格（客戶端換地圖會斷線重連）；哪些 SN 要改成廣播（每一個都附 opcode 和依據）。
- 交付：約兩頁，放在 `docs/design/`。實作要拆成單人行為不變的小步驟，每一步回歸測試都保持全綠。

---

## H1：登入後 1 號機商店清單漏接

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出重新登入進機庫後，1 號機商店清單沒有顯示、但切到 2 號機再切回就出現的真正原因，提出最小修正；新行為須放在預設關閉的開關後。

### 範圍

- 客戶端腳本 `ZPanel_ShopItems` 的 `ShopUpdate`、`ListLoad` 呼叫時機與頁面初始化狀態。
- 客戶端是否送出「商店開啟」或其他商店請求 CQ，以及伺服器對應的接收路徑。
- `Metal Rage Online Server/dispatch/room.dispatch.js` 中
  `Delayed ShopList refresh (initial default) slot=1 after 500ms` 路徑、`Slot_Change_SA` 後送出時機與相關 log／封包。
- 最近 session 中登入初始 1 號機與切換機體後的 `ShopList_SN 0x00240241`／`CashShopList_SN 0x00240242`。

### 背景

- [OBS] 2026-09-18 實測：重新登入進機庫後，1 號機主武器頁空白，只剩一個 `»X«` 佔位圖；證據為 [SHOT] `/home/lucas/mro-reverse/shots/g6d-relogin.png`。
- [OBS][SHOT] 切到 2 號機時商店正常滿列，證據為 `shots/g6d-mech2.png`；再切回 1 號機後清單出現。
- [LOG] 子 agent 比對 `session-20260918-071737.jsonl` 兩段連線，同位置 frame 逐位元組相同；筆數差異只對應購買觸發的 repaint，伺服器送出內容沒有差別。
- [CODE] `room.dispatch.js` 有 `Delayed ShopList refresh (initial default) slot=1 after 500ms`，目前懷疑送出時客戶端商店頁尚未建立。

### 限制

- 只做分析，不改程式、不改資料庫、不改 `docs/state.md`、不標 ✅。
- 不啟動或重啟伺服器，不請操作者測試；伺服器由 Claude 高階控制。
- 不先假定是時序問題；若需修改，只提出預設關閉開關的單一最小方案。
- 既有 ShopList 欄位偏移、G6d 完整 catalog 與 G6e 購買路徑不在本任務擴大修改。

### 交付

- 日誌 50–100 行，`docs/journal/INDEX.md` 追加一行並標「待審」，逐段對照登入與切換機體的實際 frame、客戶端腳本呼叫與 DLL／封包證據。
- 原始 decompile／組語與必要的封包 hex 存入 `docs/research/2026-09-17-backlog/H1/`。
- 提出最多兩個單變數實驗，並列出最小修正與預設關閉開關名稱；不實作、不測試。

### 完成條件

能以實際 session、腳本或組語證據說明為何登入初始 1 號機漏接而切換後恢復；若無法確認，明確列出未知點與阻塞，不猜時序或封包格式。

## H3：catalog 髒資料

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

查明商店 catalog 中非法 ItemIndex 與期限／價格排序異常的來源，判斷是否應在送出前過濾非法項目、是否只販售代表項，並提出價格排序修法建議，不修改資料。

### 範圍

- catalog／item_catalog 表及其 seed、匯入或生成來源；追查 `ItemIndex=27430` 對應列與相關 item_id／category 欄位。
- `ShopList_SN 0x00240241`、`CashShopList_SN 0x00240242` 的建構路徑、ItemIndex 合法性與價格欄位。
- 2026-09-18 session 中 cat2 第一包及同一武器強化等級 01–08 的實際封包、log 與客戶端畫面。
- 若能取得原廠資料或客戶端 catalog／腳本，只作對照，不把推測當成原廠規則。

### 背景

- [LOG] 2026-09-18 送出的 cat2 第一包第一筆 `ItemIndex=27430`，不是合法 8 位 item id。
- [OBS] 商店中同一把武器的強化等級 01–08 價格全是 1000G。
- G6d 已確認完整 catalog 能讓客戶端自行過濾相容商品，但髒資料與強化品是否應顯示尚未裁定。
- [OBS][LOG] G6g 彈窗顯示 `3Day 62,210G` 高於 `30Day 27,650G`；`catalog` 價格依 item_id 末碼遞增填寫，但末碼順序不是期限天數順序（`08` 是 3 天）。
- [CACHE] `GameItemRecord +0x44` 有隨期限的值：1 天 337、3 天 1012、7 天 2362、15 天 5062、30 天 10125、60 天 20250、90 天 30375，永久為 0；兩把不同武器數值完全相同，因此 🟡／⬜，不可當成單品價格。

### 限制

- 只做分析與建議，不改資料庫、不改程式、不改資料、不改 `docs/state.md`、不標 ✅。
- 不啟動或重啟伺服器，不請操作者測試；未知資料保留完整 hex 與原始列值。
- 不擅自過濾商品、不改價格、不改 `SHOP_FULL_CATALOG_MODE` 或任何其他開關。
- 不把「合法 8 位」直接當成充分的客戶端合法性規則，必須提供 DLL／catalog／實際反應證據。

### 交付

- 日誌 50–100 行，`docs/journal/INDEX.md` 追加一行並標「待審」，列出髒資料來源、完整欄位、實際封包與客戶端處理結果。
- 原始 SQL／catalog 摘錄、decompile／組語與完整相關 hex 存入 `docs/research/2026-09-17-backlog/H3/`。
- 最多提出兩個單變數建議實驗，分別針對非法 ItemIndex 過濾與強化等級顯示；只提出方案，不執行。

### 完成條件

能追到 `27430` 與期限價格排序異常的資料來源，並以證據提出是否過濾／如何排序價格的待審建議；若真正價格欄位無法確認，明確保留未知，不猜 `+0x44` 的資料意義。

- **待審價格資料**：`catalog` 表價格與 Cache.Bin `DisplayPoint` 不一致，趨勢同構但數字約差 10%；分析是否應改用 Cache 的數字，暫不修改資料或程式。

## H6：房間難度燈慢一拍

> **2026-09-19 新觀察（[OBS] `session-20260919-012749.jsonl` 第 124 行 marker，01:33:13）：** 操作者原文：「剛剛按下初級，燈號跳到高級」；第 148 行（01:34:18）：「重新切回初級再切回高級才變成10回合」。這是「跳到另一個值」，不只是「慢一拍」。第 138 行伺服器收到的 `Map_Change_One_CQ` 是 `0034233c000a…`（9012、60、10）。

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出房間設定中難度燈慢一拍的真正原因，讓第一次按初級／中級／高級後，燈號立即對應所選 PvE map 的 `PlayPve` 值；只提出最小修正，先不擴大到其他房間 UI。

### 範圍

- 追蹤 `ZPage_Room.uc:680`、`ZPanel_PVE.uc` 的難度燈讀值，以及 `SN_MAP_CHANGE_ALL 0x00220226`／`SN_MAP_CHANGE_ONE 0x00220223` 到 `MapInfoList` 的寫入與事件觸發順序。
- 對照 `docs/journal/2026-09-18-13-map-change-order.md` 的 ALL／ONE 實測 frame、客戶端 log 與既有 `room-map.sender.js` 順序。
- 查明值已正確但畫面更新延遲一個選擇的原因；必要時保存完整 frame 與事件 log。

### 背景

- [OBS] R6 後目標回合已正確顯示 5／8／10，但難度燈仍慢一拍。
- [OBS][LOG] R7 與 R7b 都證明只要 ALL 排在 ONE 後就會覆蓋地圖選擇；因此送出順序不是可直接採用的修正，R7 開關維持 disabled。
- [SRC] 難度燈由 `MapInfoList[j].PlayPve` 驅動；目前缺的是事件、寫入與重繪之間的精確先後。

### 限制

- 先做 DLL／腳本／session 分析，不直接改程式、不改資料庫、不改 `docs/state.md` 或 `docs/HANDOFF.md`。
- 不把 R7/R7b 的失敗再標成成功；不得把 `MAP_CHANGE_ORDER_MODE` 打開。
- 不啟動或重啟伺服器，不請操作者測試；若提出實驗，最多兩個單變數、預設關閉。

### 交付

- 50–100 行日誌與 INDEX 待審列，列出難度燈讀值、ALL／ONE 完整封包與事件順序證據。
- 原始組語、腳本摘錄、完整相關 hex 存入 `docs/research/` 對應目錄。
- 最多兩個單變數修正／實驗建議；若無法定位，明確列出缺失證據，不猜時序。

### 完成條件

能以客戶端腳本或 DLL 證明燈號慢一拍的具體觸發點，並提出不改地圖選擇語意的最小預設關閉修正；否則只交分析與阻塞。

## H7：房間設定對話框地圖清單為空

> 2026-09-19 補：**目前房內無法用下拉換圖**（下拉一直是空的，按了客戶端就在本地放棄，不送封包；見 ROOM-OPT 調查）。M2 後重排優先序時提前。

> **待觀察**（2026-09-18 roadmap 重排）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出 `ZPopup_RoomSet`／地圖選擇對話框清單仍為空的最後一個篩選關卡，讓 PvE 地圖可列出且人數控制切換到 PvE 版本；提出最小修正，不重做已驗證的房間同步路徑。

### 範圍

- 追蹤 `Account_MapList_Check`／`m_MapList`、人數範圍篩選與 `g_SelectMapInfo` 設定者的完整鏈。
- 對照 `docs/research/2026-09-18-room-setting/`、`docs/research/2026-09-18-map-list-zero/`，以及 R4／R9 日誌與實測結果。
- 查明 `g_SelectMapInfo` 何時、由哪個 Cache record 或事件設定；保留 `MapIndex < 1000`、人數陣列與 map type 的原始證據。

### 背景

- [OBS] R4 把 `SN_ROOM_DEFAULT` 首筆 entry 改成真實 map id 後仍是 4 VS 4、清單空；R9 已送 `MapInfo_SN 0x00210115` 的 9001–9012 十二筆仍無效果。
- [DLL][SRC] `Account_MapList_Check`／`m_MapList` 只是其中一關；完整鏈還包含人數範圍，而只有 `g_SelectMapInfo` 命中才切 PvE 人數陣列。
- [OBS] Gemini「伺服器從未送出 `0x00210115`」已由 session log 推翻；不要回到該錯誤前提。

### 限制

- 只做分析與最小方案，不改資料庫、不改 `state.md`／`HANDOFF.md`，不先動已驗證的四個 enabled 開關。
- 不重開伺服器、不請操作者測試；未知封包保留完整 hex，不猜 `g_SelectMapInfo` 的寫入格式。
- 若需修正，只提出預設關閉單變數開關；不得修改 `PVE_SLOT_SELECT_FLOW`、ItemInfo、G6、G7 或 `Grade_Info`。

### 交付

- 50–100 行日誌與 INDEX 待審列，逐關列出 `m_MapList`、人數範圍、`g_SelectMapInfo` 與清單生成條件。
- 原始反組譯、腳本摘錄、Cache／封包資料存入 `docs/research/` 對應目錄。
- 最多兩個單變數實驗建議；若無法確認最後關卡，只交分析及需要高階裁決的阻塞。

### 完成條件

能以 DLL／腳本／實際 log 證明清單在哪一關被丟掉，並給出不影響現有房間地圖同步的最小預設關閉修正；若不能確認，不猜格式、不改程式。

## P1：基礎主武器在庫存顯示兩把

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 操作者回報，未指派；先分析**

### 目標

找出庫存中基礎主武器看似出現兩把，是資料重複、不同 item 共用名稱／圖示，或客戶端重複列示；先不修改資料。

### 範圍

- 對照 account 1 的 `ItemInfo_SN 0x00210111`、`WearInfo_SN 0x00210113`、Package item 與 DB rows。
- 解析畫面上兩列對應的 serial、item_id、RepresentIndex、名稱與 ImageIndex；需要畫面辨識時請操作者提供完整截圖。
- 檢查 starter loadout、購買 insert 與 ItemInfo refresh 是否可能各建立同一件基礎武器。

### 背景

- [OBS] 一位不熟悉逆向進度的實際玩家指出基本主武器在庫存顯示兩把。
- [DB] account 1 的 mech 1／part 1 目前有七筆，但沒有相同 `item_id` 重複；`22100101` 只有 serial `100155` 一筆。
- [LOG] 登入 ItemInfo 與 WearInfo 均引用實際 serial；僅憑畫面相同不能判定 DB 重複。

### 限制

- 只分析，不刪 DB row、不改 starter data、sender、開關或 Cache，不標 ✅。
- 未取得兩列的 item_id／serial 前，不把「兩把」解讀成重複資料。
- 不掃描整個 `static/`；只讀與候選 item 直接相關的 Cache record。

### 交付

- 一篇待審日誌與 INDEX 待審列，列出兩列從 UI 到 ItemInfo／DB／Cache 的映射。
- 原始 packet／Cache 摘錄存 `docs/research/<日期>-duplicate-basic-main/`。
- 若確認重複，只提出一個單變數、可回復的後續修正。

### 完成條件

能指出兩列各自的 serial 與 item_id，並以資料鏈判定是合法不同物品、顯示碰撞或真正重複；證據不足時明列缺少的截圖或欄位。

## P2：PvE 只保留主武器、輔武與裝備回預設

> **2026-09-19 PM 裁決：P2 停止靜態分析，改成重現協定。** 等操作者或 dusk 下次玩的時候順手做，不另外安排場次。
> - 線索：[LOG] slot 3 的 `Slot_Change_CQ 0x00240107` 本身就是 right=0、equipment=0，代表至少 slot 3 在機庫階段、客戶端送出 CQ 時就已經掉了，跟 PvE 出場無關。玩家原話是「**其他機體**換裝後」。🟡 [GUESS]：客戶端對非目前機體的槽位資料不完整（`m_MySlot`／`WearInfo_SN 0x00210113`）。
> - **協定：** 選 **3 號機**，依序換 main、left、right、equipment 四個部位，每換一個就在聊天或 console 留一筆 marker；接著進 PvE 選 3 號機出場，截圖武器列。
> - **交付：** 逐步對照表，每一步都列出：Slot_Change_CQ 的七個欄位、Slot_Change_SA 回了什麼、DB 該槽位的 equipped、WearInfo_SN 送出的該槽位內容、Game_User_SN 該槽位的六個部位、畫面上實際的裝備。第一個出現 0 的那一步就是斷點。
> - 待釐清：「slot 1 掉了 left／right／equipment」目前**沒有直接的 [OBS] 或 [SHOT]**，是從玩家口述和 log 推出來的，重現時一併確認 1 號機到底有沒有掉。

> **2026-09-19 IS2（🟡）：** 客戶端出場配裝路徑對六個部位完全對稱：`Game_User_SN` handler（`0x107d8ae0`，`0x107d8e15`–`0x107d8ebe`）照 (body, main, left, right, equipment, skin) 的順序傳給 `Game_Slot_Set`（`0x1072de30`，六個部位同一套寫法、沒有任何條件判斷）→ `ServerMechWeaponSet_MH` 對 Part[1..4] 一視同仁。Part 1 跟 Part 2–4 之間找不到差別。還剩一個沒排除的候選：`m_MySlot`（`ZNetwork_DJ.uc:843`，型別 SLOT_DETAIL_INFO，可能綁在 `WearInfo_SN 0x00210113` 或本機的 `Game_Slot` 切換上）⬜。

> **2026-09-19：** ❌ ShareType 單獨解釋 P2（[DB]＋[CACHE] +0x4F：left 33800101=1、right 33800201=1、equipment 41200201=**0** 也掉了；main 22600101=0 保留）。觀察：掉裝的範圍＝Part 2–4 全部，Part 1 保留（[LOG]／[DB]）。下一步的問題改成「Part 1 跟 Part 2–4 在出場配裝時走的路徑差在哪」。

> **2026-09-18 分析完成（🟡，高階初審）：** `Game_User_SN 0x00222112` 在 `session-20260918-214305.jsonl:522` 的 8 個 slot、6 個部位都送了非預設值；[SRC] `DefaultPlayerController.uc:874-907` 的 `ServerMechWeaponSet_MH` 會讀 Part[1..4] 全部武器欄位。伺服器端路徑沒找到錯誤。剩下沒排除的是「戰鬥中切換機體」（`Game_Slot` 由客戶端在本機切換，不經過伺服器）。**下一步：** 操作者在 PvE 裡切換到另一台已完整裝備的機體，截圖看武器，同時看 log 有沒有新封包。另外 `database/db.js:267` 的註解把 part 4／5 的標籤寫反了（數值沒錯），收斂時順手修正。

> **狀態：2026-09-18 操作者回報，未指派；先分析**

### 目標

找出機庫完整換裝已保存、但 PvE 出場只套用主武器的原因；區分 CQ 保存、DB、`Game_User_SN` 組包及遊戲生成機體四層。

### 範圍

- 以 `session-20260918-214305.jsonl` 的兩筆 `Slot_Change_CQ 0x00240107`、DB equipped rows與 `Game_User_SN 0x00222112` 做逐欄重播。
- 追蹤 `GAME_ITEM_INFO.Slot[].Part[]` 到 `DefaultGameInfo.RestartPlayer()`／`ServerMechWeaponSet_MH()` 的讀取順序。
- 核對 `Game_Slot_Set` 六個欄位的 part 語意與 sender 的 body/main/left/right/equipment/skin 對應。
- `Game_UserSocket_Set` 是強化石 socket 候選，不得未經讀取端證據就改成武器欄位。

### 背景

- [OBS] 其他機體完成裝配後進 PvE，只有主武器保留，輔助武器與裝備回到預設。
- [LOG] slot 1 CQ 最終送 `body=100154 main=200013 left=100219 right=200003 equipment=200005 skin=0`；slot 3 送 `body=100162 main=200010 left=200001 right=0 equipment=0 skin=0`。
- [DB] slot 1 五個非零欄位皆已保存；slot 3 保存 body/main/left，CQ 對 right/equipment 本來就是 0。
- [LOG][CODE] 開戰 `Game_User_SN` 從 DB 分別寫出 main／left／right／booster／skin，並非只組主武器。

### 限制

- 先分析，不改 DB、canonical defaults、`Game_User_SN` 或 slot change handler，不標 ✅。
- 不用 slot 1 與 slot 3 的觀察互相代替；每台機體逐欄對照。
- 若提出實驗，只能預設關閉且一次改一個 part offset／值。

### 交付

- 待審日誌、INDEX 待審列與一份 slot record 解碼表，附 DLL／SRC 位址及本場 hex。
- 說明資料第一次偏離使用者選擇的位置；最多提出一個單變數實驗。
- 原始重播資料放 `docs/research/<日期>-pve-loadout-parts/`。

### 完成條件

能逐一證明 body/main/left/right/equipment 從 CQ 到 PvE pawn 的值，定位第一個錯誤轉換；無法定位則列出必須再錄的單一機體／單一 part 測試。

## P3：困難潛入作戰實際仍走簡單流程

> ⚠️ **分析測試帳號戰績時要注意**：戰鬥中途離開**會有懲罰**（客戶端自己的確認對話框寫著
> 「結束將會有懲罰。」，[OBS] 操作者 2026-09-21）。我們的自動化劇本（`dual-netspeed-*`）
> **每一輪都會中途離開戰場**，所以 `mrotest`／`mrotesthost` 的戰績會累積這個影響。
> **看到奇怪的數字先想到這個，不要當成寫回的 bug。**

> **2026-09-19 結案：** 根因是每一場都只打一回合，已由 R-ROUND 修正並實測（`journal/2026-09-19-0900-r-round-impl.md`）。

> **2026-09-19 改指向 R-ROUND：** 「困難模式只打到簡單段落」的真正原因很可能是**每一場都只打一回合**（見下方 R-ROUND）；「547 秒停住」由 T1（時間上限寫死 10 分鐘）解釋。本節保留作歷史紀錄。

> **狀態：分析已交付（`docs/journal/2026-09-18-18-pve-hard-flow.md`，🟡 高階初審／只分析），根因與修正仍未裁定，未指派後續**

### 目標

找出房間已選 `9012／Round 10`、開戰 GameInfo 也正確後，實際仍只有三命且通關只涵蓋簡單段落的原因。

### 範圍

- 從 `Map_Change_One_CQ 0x00220221`、`Game_Info_SN 0x00222111`、travel URL 到 `ZSetCoreModePve`／`PveRoundManager` 逐段追蹤難度資料。
- 核對 `GameInfo.MapInfo.Round`、`DefNumLive`、`PveRespawnAddCount`、Campaign_CN／EndGame_SN 與主機端結束條件。
- 比較同一 `Map_PC04` 的 9010／9011／9012 Cache records，找出除 MapIndex／GoalDefault 外是否還有難度欄位或 URL option。
- 檢查是否由伺服器過早回 EndGame、客戶端 round manager 只建立五回合，或 map package 另需初始化資料；保留完整事件時間線。

### 背景

- [OBS] 玩家選困難後仍只有三條命，打通關內容只到簡單段落；中級／困難理應有後續階段與更多命。
- [LOG] 最後選擇 CQ `0034233c000a00000000`＝MapIndex 9012、Time 60、Round 10；SA／SN 也回 9012／10。
- [LOG] 開戰前兩次 `Game_Info_SN` body `010000000000010000000000000000020034230a000a00000000`＝map 9012、time 10、round 10。
- [SRC] `ZModePve.ModeReset_BD()` 以 `GameInfo.MapInfo.Round` 判斷完成；命數由 `DefNumLive + GAME_ITEM_INFO.PveRespawnAddCount` 設定，現行 bonus 為 0。

### 限制

- 不回頭改已證明正確的 room map CQ／SA／SN 或把 9012 降回 9010；不標 ✅。
- 先分析，不改 `Game_Info_SN`、Campaign handler、命數或 map package。
- 不把三命單獨視為 map 載錯；必須同時對照 round manager 與結束事件。

### 交付

- 一篇待審日誌、INDEX 待審列與完整的選難度→開戰→通關時間線。
- 9010／9011／9012 Cache 欄位差異表，以及 `DefNumLive`／round 上限來源說明。
- 最多兩個互斥、單變數且預設關閉的實驗建議；原始資料放 `docs/research/<日期>-pve-hard-flow/`。

### 完成條件

能指出 9012／Round 10 在哪一層失去作用，並提出不破壞已驗證房間同步的最小實驗；若證據不足，明列需要補錄的 Campaign／round／client log。

## P1b：預設武器不發實體物品（不急）

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增；操作者同意可改但不急。未指派。**

### 目標

新帳號不再把官方預設配裝（DefaultSetList）發成 `items` 實體列，改由客戶端自己合成的 `SerialIndex=0` 預設項承擔，消除庫存中同名預設武器重複（例如 1～5 號機各一把 `32100101`，共五把）。

### 範圍

- `database/db.js` `createAccount()` 的 `starterLoadouts`；WearInfo／`Game_User_SN 0x00222112`／`Slot_Change_SA 0x00240108` 中 part serial 為 0 時的語意。
- 先確認：WearInfo 送 serial 0 時，客戶端是否把它當成「裝備預設武器」並正確顯示與出場（`ZPanel_InvenItems.uc:338-383` 會合成 serial 0 項；`SlotInfo.Part[].SerialIndex == 0` 會標成 SORT_WEAR）。

### 背景

- [DB][LOG] P1 調查（2026-09-18）：帳號 1 的 `32100101` ×5 分別對應 mech 1～5 的 SubLeft，符合 DefaultSetList（`journal/2026-09-16-33`）。每筆 DB 列只送一次。
- [SRC] `ZPanel_InvenItems.uc:338-383`：客戶端依 DefaultSetList 為目前機體強制加入 `SerialIndex=0` 的預設項；伺服器送的 `HaveList` 另外列出，不依 `items.mech_type` 篩選。
- 另有舊測試殘留：`22100201`（serial 100221 mech 2、100222 mech 1）、`24100301`（200011、200012），另案清理。

### 限制

- 單變數：先只做「serial 0 能否代表預設武器」的離線／實測驗證，不動既有帳號資料；DB 變更一律寫成腳本；新行為放在預設關閉的開關後。

### 交付

- 待審日誌，含 serial 0 路徑的 SRC／DLL 證據；一個預設關閉的實驗開關提案。

### 完成條件

能證明（或否定）serial 0 足以讓預設武器顯示、裝備、出場；否定時寫明原因。

## C1：收斂 2026-09-18 通過的開關（期限 2026-09-25）

> **狀態：Claude 高階開立；前置條件 A6 黃金樣本回歸測試（`flash-wip-replay`）要先合併。未指派。**

### 目標

刪掉下列已 ✅ 的開關，只保留驗證過的那條路：`ROOM_TEAM_INDEX_MODE`（R11）、`ROOM_USER_NAME_ANSI_MODE`（R12）、`ROOM_LEAVE_RESET_MODE`（L1）、`MONEY_PERSIST_MODE`（M1）、`POST_BUY_SLOT_REFRESH_MODE`（M3a）。依據見 `docs/state.md` 第 4、4b 節。

### 範圍

- 只動這五個開關與它們的 disabled 分支；其他開關（含 `docs/reference/switch-audit.md` 裡確定不能開的）另開任務。
- 一併更新 `gate.game.dispatch.js` 的 `0x00220234` 註解（約第 915 行）與 marker 文字（約第 944 行）：目前寫「EXPERIMENT, purpose unconfirmed」，但 state.md 已確認它是 `Leave_CQ`（回 `Leave_SA 0x00220235`，依據 `journal/2026-09-18-20-room-leave-reset.md`）。這是純註解與 log 文字，單獨一個 commit；marker 文字改了會影響回歸樣本，要在遮罩或樣本說明裡註明。
- 在 `~/mro-wt/<名稱>` 開 worktree 做，不要在主目錄切分支。

### 限制

- 一個開關一個 commit。每個 commit 都要跑黃金樣本回歸，全綠才算數，並把回歸測試的輸出附在 commit 訊息裡。
- **只收斂「翻掉會讓回歸測試變紅」的開關。** 翻掉之後還是綠的，代表回歸測試沒涵蓋到它，這種開關先不動，等 A6b 做完再收。
- 不改任何行為。收斂後的輸出要跟開關為 enabled 時逐位元組相同。

### 交付

- 五個 commit，外加回歸測試輸出摘要。

### 完成條件

五個開關都從程式中移除；回歸測試全綠；`switch-audit.md` 對應列標為已收斂。

## S2：遊戲系統覆蓋率盤點（PM 2026-09-19 開立，B 線、唯讀、中階）

> **狀態：已派出（worker，只寫 `docs/reference/system-coverage.md`）。**

- 目標：列出客戶端支援的所有遊戲系統，標出我們各做到哪裡，得到一張可以直接排工作的覆蓋率表。
- 範圍：
  - (1) S→C：`docs/client-dispatch-map.md` 依 ZDispatch* 分組，每個 opcode 標 ✅／🟡／⬜（空包或 fallback）／❌（從沒送過）。
  - (2) C→S：統計所有 session log 裡客戶端送過的 opcode，以及伺服器怎麼回；沒出現在 log 的，用 `ZNetwork_DJ.uc` 的 native 宣告補上。
  - (3) 依玩家看得到的系統分類。
- 限制：只盤點，不實作；不確定一律標 ⬜；不要從名稱猜語意。
- 交付：`docs/reference/system-coverage.md`，最上面放總表，每個系統一節（opcode、現況、UI 入口、S/M/L、相依）。
- 完成條件：dispatch map 裡每個 opcode 都歸到某一列。

## 留門（不擋 M2/M3，排進空檔）

- (a) 全部 DB 查詢是否參數化，出一張清單。
- (b) accounts 表和白名單預留密碼雜湊欄位（只加欄位和腳本，不改登入行為；**DB 結構變更要先經操作者同意**）。
- (c) 找出寫死 192.168.1.x、WSL、portproxy 的假設，讓伺服器之後能原生跑在 Linux VPS 上。

## INTRUDE：戰鬥中參與（中途插入）（PM 2026-09-19 開立）

> **狀態：唯讀分析已派出。實作排在 M2 之後、PvP 之前。**

- 客戶端：`ZPanel_RoomInfo.uc` 的 co_Intrude（:66、:355-357）讀 `RoomInfo.IsIntrude`（:618、:629），會依房型顯示或隱藏。`Room_Option_Change_CQ 0x00220215` body+2 = IsIntrude（sender `0x107eeb80`）。字串 `RAGEMODE_INTRUDE_ONLY` 表示某些模式強制允許插入。伺服器完全沒處理。
- 分析要回答：
  - (1) IsIntrude 在哪個 SN 的哪個欄位；
  - (2) **現在就存在的漏洞**：房間開戰後，Enter_CQ 會發生什麼事？Enter_SA 的失敗碼是什麼？Room_List_SN 有沒有「遊戲中」的狀態？
  - (3) 允許插入時，中途加入者需要的序列，跟 D1-6 比較（只寫設計）；
  - (4) RAGEMODE_INTRUDE_ONLY。
- 過渡規則（PM）：INTRUDE 做完之前，**playing 中的房間一律拒絕加入**。失敗碼要照 DLL，查不到就讓房間不顯示成可加入。

## LOBBY-BACK：大廳「上一頁」卡在讀取中（2026-09-19 開立，不擋 M2）

- [OBS] 在大廳按「上一頁」後一直停在讀取中，不會回到頻道選擇或登入畫面。
- [LOG] 最新 session：按下後伺服器**一個封包都沒收到**。30907 沒有新的 recv，也沒有斷線；9211 也沒有新連線。Lucas（conn12）最後一個請求是 ms 3268245 的 Leave_CQ。
- 🟡 推測：客戶端要回到頻道選擇時，會重新連 Gate 取頻道或伺服器清單，用的是某個封包給它的位址（`m_GateInfo`／SERVER_INFO）。如果那個位址或埠不對，就會連不上而一直卡著。
- 要查的東西：UC 裡大廳「上一頁」的處理（ZPage_Lobby 的返回按鈕 → ZNetwork_DJ 的 Gate／Channel 函式）、需要哪個位址、我們有沒有送；另外在筆電開 netstat，看按下後客戶端有沒有嘗試連線。

> **LOBBY-BACK 分析（2026-09-19，explorer 🟡）：**
> - 大廳上一頁 → `ZPage_Lobby.uc:1954` SendBack() → `Scene_Back`（`0x10716800`）→ scene 4 時走 `0x107e6020`。這個函式只在 ZDispatchLobby 的 `[this+4]` 旗標為真時，才在**現有連線**送 `Leave_CQ 0x00220114`，不會開新連線。旗標是假的時候只寫 log、什麼都不送。
> - 旗標由 `ZDispatchLobby::Check`（`0x107e38d0`）設定：`sceneParam == 4（LOBBY）&& *[0x1091b884] != 0`。`0x1091b884` 是 Core.dll 的 **GIsClient**（`research/2026-09-19-ready/notes.md` 第一輪已識別），一般客戶端恆為真。
> - 高階判讀：所以旗標是假的，代表**客戶端的 ZDispatchLobby 沒有收到 scene 4 的 Check**，也就是我們進大廳的流程沒讓客戶端正式進入 Lobby 場景（參考 state.md 第 5 節：`0x00230112` 不是 Lobby Enter SA）。下一步：查 ZDispatchLobby::Check 是由哪個場景切換呼叫、進大廳時客戶端的 scene 是多少、原版的 Lobby Enter 流程是什麼。另外 `Leave_CQ 0x00220114` 送出後，伺服器要回什麼也還沒查。

## NET：連線與卡頓（操作者 2026-09-19 提出）

1. **dusk 不能當房主**：白名單 dusk 沒有 hostAddress（HOST_ADDRESS_REQUIRE 會擋掉開戰）。需要他那台的區網 IP，並在他那台跑 p2p-open（UDP 30907、網路設為 Private）。改白名單要完整重啟。
2. **dusk 連 Lucas 當主機時，怪多就延遲**（優先處理）：
   - 高階發現：主機的 `MetalRage.ini` **沒有 `[IpDrv.TcpNetDriver]` 這一段**。第 182 行的 `MaxClientRate=25000` 在 `[Engine.DemoRecDriver]`（錄影用）底下，Default.ini 也一樣。所以實際的網路 driver 用的是**編譯時的預設值**（UE2 常見是 MaxClientRate 15000、MaxInternetClientRate 10000），之前把數字改成 100000 很可能沒有生效（檔案目前顯示的也還是 25000）。
   - 單變數測試：在**主機**的 MetalRage.ini 加上 `[IpDrv.TcpNetDriver]`，`MaxClientRate=100000`、`MaxInternetClientRate=100000`，其他不動。改之前先備份 ini。只改 ini，不碰程式。🟡 這一段在這個客戶端是否有效，要實測才知道。
3. **Lucas 這台不定時卡頓**（從一開始就有；dusk 的 Win10 沒遇到）：
   - 懷疑方向一：伺服器和遊戲跑在同一台，機庫一次送約 1850 包，每包都印 console log，戰鬥中每次擊殺也印很多。
   - 懷疑方向二：Win11 本身。
   - 查法：卡的時候在聊天打「卡」當 marker，高階對照伺服器 log 和 CPU。如果跟伺服器有關，就減少 log；無關的話再試關閉全螢幕最佳化、改用高效能電源計畫。暫時擱置，操作者之後再處理。

> **LOBBY-ENTRY-A 分析（2026-09-19，explorer 🟡）：**
> - SCENE：0 SERVER、1 WAIT、2 ACCOUNT、3 GATE、4 LOBBY、5 ROOM、6 GAME。`Scene_Change`（`0x1070148d`→`0x10738910`）每次都會對已註冊的所有 ZDispatch* 呼叫 Check(scene)。
> - 新登入**唯一**進 scene 4 的路徑：`ZDispatchGate::Enter_SA 0x00220112`（`0x107dc630`）成功分支，會依序執行 Account_Index_Set、Location_Channel_Set、Gate_Data_Save、**Lobby_Data_Clear()**、Event_Call NETWORK_GOTO_LOBBY，最後 Scene_Change(4)。我們在 30907 對 Channel_Enter_CQ 0x00220111 回全 0 的 0x00220112，符合成功條件，所以**進大廳的路徑本身是對的**（大廳功能正常）。
> - `Lobby_Data_Clear()`（`0x1070192e`→`0x1072b010`）每次登入都會清空 CDO 上兩個元素大小 0x4c 的 TArray。它是不是 m_MapList 遺失的根因 ⬜：元素大小不一樣（MAP_LIST_INFO 只有 4 bytes），所以可能性不高。
> - `Leave_CQ 0x00220114` 的回應是 **`Leave_SA 0x00220115`**（`0x107e4250`，6 bytes 全 0 表示成功）。成功後客戶端 Event_Call NETWORK_GOTO_GATE → 回到頻道選擇（scene 3）。**伺服器目前沒有 0x00220114 的 handler。**
> - LOBBY-BACK 的謎：ZDispatchLobby 的旗標只有在 Scene_Change(4) 那一刻它已經註冊時才會成立。如果 ZPage_Lobby／ZDispatchLobby 是在 Scene_Change(4) **之後**才建立，旗標就是假的，這是客戶端的時序問題，伺服器可能修不了。
> - 最小修法：(a) 補上 0x00220114 → 0x00220115 的 handler（便宜、獨立）；(b) 用客戶端 log 或反組譯確認註冊時序。每次登入都會走這條路，所以 0x00220112 維持不動。

## 小項（M2 驗收場記錄，2026-09-19）
- 戰鬥內隊伍聊天 0x00220507：改成對同隊廣播（目前只回送給自己）；房內隊伍頻道要先拿到一筆 [LOG]，才開 ROOM_TEAM_CHAT_MODE。
- 能量柱沒有 HP 條（高級第 9 回合）：歸在 P4，可能跟 Assist_SN／Campaign_Damage 系列有關，現在不追。
- NET 實驗表加一欄「房主是誰」。

> **NET 更新（2026-09-19，M2 同一輪）：** dusk 當房主時，Lucas 這個加入者沒有任何症狀；Lucas 當房主時，dusk 有閃現、沒射出的問題。→ NET-2 和 NET-3 合併成「Lucas 這台（Win11）當 listen server 時的效能問題」。下一個實驗（一次只改一項，都在 Lucas 這台上做，而且都由 Lucas 當房主）：
> (1) 對 MetalRage.exe 停用全螢幕最佳化；
> (2) 電源計畫改成高效能；
> (3) 測試時暫停 WSL 的其他負載（例如子 agent 跑的工作）。
> 每次都記下 dusk 當加入者時的感受。

## AUTO：Pico 無人回歸測試（PM 2026-09-19 排序）
- 依據：`journal/2026-09-19-2230-unattended-trial-01.md`、`reference/unattended.md`、`research/2026-09-19-dev-grade-cheats/notes.md`。
- 優先序：
  1. 整場流程回歸：`GameCampaign 1` ×N → EndGame → 結算 → 回房間。P3 做好之後，同一支腳本順便驗 DB 寫回。目標是每晚跑。
  2. `GameCampaign 2` 失敗路徑（目前只有單元測試，沒有實機驗過）。
  3. `delTest` 驗死亡／重生封包。
  4. `CoreHpMax`／`GiveMeAmmo` 撐長時間的場，配 PresentMon／WPR 量卡頓。
  - 不用 `PveNextRound_BD`：可能只在客戶端跳回合，會跟伺服器的回合計數不一致。
- 約束：
  - 只做單人。
  - 只用**專用測試帳號**跑（要開一個，加進白名單，名稱一看就是測試用）。
  - P3 寫回 DB 時，比賽紀錄要帶「測試」標記，避免污染戰績。
- P3 schema 先留欄位：每回合秒數、該回合 Death_CN 數、suspicious 旗標（給 P7 的合理性檢查用）。
- [LOG] 目前所有帳號的 Grade_Info_SN 都寫死送 0（`dispatch/account.dispatch.js:283,399`、`community.dispatch.js:284`）。這次測試用的是 Lucas（accountId 1），也就是 **Grade 0 帳號就能用 F24 + GameCampaign**。

## TUT-LABEL：`0x00260111`／`0x00260121` 標籤疑點（explorer 2026-09-19，待審）
- 目標：確認 `0x00260121` 是 `Tutorial_Start_CN`（DLL `0x107e9b70`），`0x00260111` 是 `Mech_License_CQ`（`0x107e9cf0`）；而伺服器 `community.dispatch.js:55-61` 目前分別把它們當成 License query、Quest complete。
- 做法：用 `tools/disasm.py` 查兩個函式的所有呼叫端（xref），並逐一核對 body 欄位。動 handler 之前先交審。依據：`research/2026-09-19-pve-smoke/notes.md`。
- **核對結果（verifier 2026-09-19，高階採納）：DLL 部分 CONFIRMED。**
  - `0x00260121`＝Tutorial_Start_CN、`0x00260122`＝Tutorial_End_CN，都是只有 header 的單向 CN（寫入點 `0x107e9bba`／`0x107e9c7a`，size 0x10），呼叫端分別在 `0x10724ad8`／`0x10724c2c`。
  - `0x00260111`＝Mech_License_CQ，body 是 (mechType u32, 1 u32)，送出前 push 了預期回覆 `0x00260112`（`0x107e9d54`、`0x107e9d59`、`0x107e9d8a`），呼叫端在 `0x10718432`。
  - [LOG] 192 份 session log 裡這四個 opcode 全部 0 筆，所以現在的錯誤標籤還沒被觸發過。
  - 風險：一旦 `0x00260111` 真的送來，`community.dispatch.js:94-108` 會把 mechType 當成 tutorialId 寫進教學完成表。
  - 修正契約：改標籤；`0x00260111` 改成只記 hex、不寫 DB；`0x00260121` 不回 `0x00260122`，因為客戶端不等回覆，而且客戶端的 S→C 表裡有沒有 `0x00260122` 也還沒驗證 ⬜。優先度低，等教學模式（P4）時一起做。
- 高階決定（2026-09-20）：4 個開關已合併，合併後主目錄的回歸測試全綠。
  - `lobbyRoomListMode` 卡在 golden：那幾個樣本是用 `_resetForTests()`（disabled）錄的，而正式預設是 enabled，進頻道時會多送一筆 `Room_List_SN 0x00220204`。這是已經實機驗證過的行為（登入後看得到大廳清單），**不是 regression**。
  - 處理方式：用 enabled 下的新 session log 重新擷取 golden 樣本（tools/extract-golden.js），再套用 patch `~/mro-wt/conv-c-lobbyRoomList.patch`。
  - `roomJoinMode` 等上一項做完再收斂。
  - 部署：這批改到 rooms.js，下次必須**完整重啟**伺服器。

## Y0DA-STUTTER：Win11 不定時卡頓 — **已解決，2026-09-20**
> 根因不是 y0da 暫停執行緒，而是 Windows 的本機當機傾印：保護殼丟出無害的例外（0xc0000005 @ 0x3），Windows 每次寫一個 29 MB 傾印檔，期間暫停整個遊戲行程 140–260 ms。解法：`LocalDumps\MetalRage.exe` 的 `DumpCount=0`。證據與量測見 `journal/2026-09-20-1240-stutter-root-cause.md`。**層級 1–3（讀 y0da、外部干預、改監控行為）全部取消，不需要做。** 殘留的輕微卡頓另案，優先度低。
> 以下為原本的分層計畫，保留供參考：

## Y0DA-STUTTER（原計畫，已不執行）
- 依據：`research/2026-09-19-win11-patch-audit/notes.md`（H-Y0DA 與外部旁證）、`journal/2026-09-19-2120-m2-acceptance.md`。操作者 2026-09-20 同意下面的分層**順序**（經 PM 轉達）；約束 1 目前不變。
- **層級 0（現在就做，不用改規則）：**
  - 用 WPR＋PresentMon 錄 trace，量以下幾件事：
    - 主執行緒 Suspended 的週期；
    - 每次持續多久；
    - 誰 suspend、誰 resume（同行程的哪條執行緒）；
    - 監控執行緒在那段時間是 Sleep 為主，還是 CPU 在算。
  - 再逐一試環境面的緩解，一次一個變數，用同一種量法前後比較：
    - 計時器解析度；
    - affinity；
    - 只對 MetalRage.exe 關掉 Win11 的視窗化最佳化與 VRR；
    - 相容性設定；
    - 程序優先權。
  - 使用面的繞法已經有了：優先由 Win10 的人開房。
  - 前提：錄 trace 要管理員權限，等操作者決定要不要建最高權限排程工作。
- **層級 1（層級 0 不夠才做，純靜態，不用改規則）：** 讀懂 y0da 監控迴圈在做什麼。要請操作者在 AGENTS.md 第 1 條補一句「靜態分析 y0da 可以，修改不行」（規則檔由操作者本人改）。
- **層級 2（外部干預：launcher 式預配置、調監控執行緒優先權、resume）／層級 3（改變監控行為：data／vtable patch、companion DLL）：都要先改規則，現在不做。**
  - 到時候把層級 0／1 的證據、成功機率、預估時間交給操作者決定。
  - 規則要寫明這幾點：
    - 允許到哪一層；
    - 仍然不做的事：砍監控執行緒、改 `.text`，已知一定會崩；
    - 時間上限，以及做不出來的退路：Win10 開房；
    - 保留原廠 exe 與雜湊，隨時可還原；
    - 穩定之前不放到朋友的機器上。
  - resume 的價值已經降級：上游作者自己用了還是卡。
- **完成條件：**
  - 一份 trace 報告，回答「卡頓是不是主執行緒被同行程的執行緒暫停？週期和時長是多少？」；
  - 層級 0 每種緩解的前後對照表。
  - 結論交給 PM，由 PM 整理成選項給操作者。

## BOSS：Boss 任務（地圖 4011，一般房）
- 依據：`research/2026-09-20-pve-modes-ui/notes.md`。
- 阻擋點：
  - Create_CQ 的地圖被限制在 9001–9012（`gate.game.dispatch.js:1262-1264`）；
  - 一般房（非協力）從沒完整跑過；
  - `Boss_SN 0x00230138` 沒實作。
- 先做唯讀格式分析，再決定。排在 P4。

## SHARE-UPSTREAM：分享給上游的發現
- Win11 卡頓的根因與一行檢查法（`%LOCALAPPDATA%\CrashDumps` 是否一直產生 MetalRage 傾印檔），見 `journal/2026-09-20-1240-stutter-root-cause.md`。上游 Win11 修正的作者自己也有這個卡頓。
- 等操作者跟 moonlight 的對話有進展再送出；一併放進之後要寫的 `docs/PROTOCOL-SUMMARY.en.md`。

## FW-NARROW：防火牆規則收斂到白名單成員（PM 2026-09-20）
- 現況：`lan-open.ps1 -VirtualSubnet 26.0.0.0/8`、`p2p-open.ps1` 同樣。26.x 是 Radmin 全體使用者共用的位址空間，太寬。
- 目標：腳本直接讀 `config/allowed-users.json`，把每個帳號的 `hostAddress` 逐一列進 `-RemoteAddress`，新增成員時重跑腳本即可。防火牆、白名單、VPN 成員三層用同一份名單（硬性約束 2）。
- 另外：確認 Radmin 網路本身是設密碼的私人網路，寫進 `reference/setup.md`。

## RELOAD-GUARD：`/reload` 自我檢查（PM 2026-09-20）
- 問題：`/reload` 只重載 `dispatch/`，但合併內容常碰到 `rooms.js`、`config/`、`database/`、`server.js`、`packetlog.js`。2026-09-20 因此出過兩次事故（最近一次登入暱稱變 `Player`）。
- 目標：`/reload` 比對啟動時記下的檔案 mtime（或 git 狀態），若 `dispatch/` 以外有變更就**拒絕熱重載**並提示完整重啟。靠人記規則遲早再漏。
- 排空檔做。

## MOON-1：核對上游作者 Moon 回信的更正與新資料（B 線，唯讀先行）
外部來源一律先標 🟡，核對過才升級。來源：Moon（上游 Win11 修正／PR 作者），經 PM 轉達 2026-09-20。

- **(c) 最優先 — fallback ACK 稽核**：Moon 說目標類模式的封包（Bomb／Capture／Conquest／Boss／TwoBoss／TriggerTouch／Special，`0x0023xxxx`，真實 body 0x1D–0x3B）在他那邊被 6-byte 通用 ACK 回掉，**默默弄壞 Game_Score_Set**，跟 Death_SN 同一類失敗。我們也有「奇數 CQ 自動回 CQ+1」的 fallback。要從 PvE session log 統計：戰鬥中送過哪些 `0x0023xxxx` 的 CN 落到 fallback、我們回了什麼 opcode 與長度、handler 期待多長。長度不符的列清單。可能跟「能量柱沒有 HP 條」、HUD 分數、非房主傷害有關。
- **(a) 位址標籤更正**：Game_User_Add 的 upsert 是 `0x10734140`（使用者清單 +0x1034、stride 0x80）；我們引用的 `0x107343e0` 其實是 GAME_ITEM_INFO 清單（+0x1040、stride 0xEC）。結論（每人一包）不變，只是標籤錯。核對後在 `game-user-sn-multi.md`、D1／D1-6 設計稿、`state.md` 追加更正。
- **(b) 14-byte 分數記錄欄位**：+0 u16 team、+2 u16 score、+4 u8 round、+5 u8 alive、+6 u16 try、+8 u16 goal、+0xA u32 exp（EndRound／EndGame／Death／Bomb／Timeout 共用，都餵 Game_Score_Set）。核對後 EndRound_SN／EndGame_SN／Death_SN 就能填真值。
- **(d)** 核對我們送的 `EndGame_SN 0x00222213` body 是否符合 0x1E 佈局（u16 WinTeamIndex＋兩筆 14-byte），handler `0x107D7ED0`。
- **(e) Grade 11 完整機制**：`Grade_Info_SN 0x107CF3B0` 的跳表把 11..14 對到 GM → `m_MyAccountLevel`(+0x448) → `IsMeGM_BD()` → `PlayerSelectMech.BeginState` 直接 `GotoState('Spectating')`；PvE 看不出來（面板來自 `PveRoundManager.Timer()`），PvP 會卡住；同根因也讓 F1–F5 技能 HUD 不畫、Tab 計分板沒有玩家列。確認我們沒有任何路徑會送 11..14，並把機制記進 `state.md` 的 Grade 列。
- **(f) 給 dusk 的測試協定（2026-09-20 更新，症狀已有精確描述）**
  - [OBS] 操作者與 dusk 看了 Moon 的影片（youtu.be/OHvI8RcJKLQ，同一台電腦開兩個視窗），確認跟 dusk 當加入者時是同一現象：**加入者端彈藥有消耗但看不到投射物；房主端看得到那名加入者的投射物正常飛行**。
  - ❌ 2026-09-20 更正：PM 原本的「複寫飢餓（NetPriority 讓短命 actor 被擠掉）」機制與實際程式路徑對不上。投射物不是複寫的 actor，而是房主用 `ClientFireProjectileCenterLoc_MH`（reliable ToAll）通知所有客戶端各自本地生成；傷害也只由開槍者自己那顆副本申報（`bMyProj`）。所以「看不到」與「沒傷害」是同一個根因。詳見 `research/2026-09-20-projectile-replication/notes.md`。新假設 H-RPC-DROP 🟡：那個 reliable RPC 沒及時送達加入者。
  - 重測（Lucas 房主＋卡頓已修＋dusk 加入），**兩端分別記**：
    - 加入者端：有沒有看到自己的投射物、彈藥有沒有扣、敵人有沒有掉血；
    - 房主端：有沒有看到加入者的投射物。
    - 投射物與 hitscan 各測、同一種敵人；怪少與怪多各一輪。
  - **量客觀數字**：那一場由 Pico 在房主端主控台輸入 `stat net`（與 `stat fps`）並截圖，看 out bytes/s 有沒有頂到上限、丟包、channel 數。`stat` 是引擎原生指令、不在腳本裡，所以要實測確認這個客戶端還有沒有。這是新 runner 動作，第一次要操作者在場。
  - NET 實驗表加兩欄：房主 `[IpDrv.TcpNetDriver]` 的 MaxClientRate／NetServerMaxTickRate／LanServerMaxTickRate 實際值、加入者的 ConfiguredInternetSpeed／LanSpeed。**先用預設值測一輪當基準**（之前調到 100000 是在「以為是網路問題」時做的），再一次改一個變數。
  - K1 說明頁在第 3 點有結果之前，不要寫任何頻寬建議值。

- 之後：`docs/PROTOCOL-SUMMARY.en.md`（Moon 這週會讀我們的 docs），排在 (c) 之後。

> **更正（2026-09-20，來源：上游作者 Moon，我方 verifier 已核對）：** 本文把 `0x107343e0` 標成 Game_User 的 upsert 是**錯的**。`disasm.py exports` 顯示 `0x10703850 Game_User_Add → jmp 0x10734140`（清單在 `[ebp+0x1034]`、count `[ebp+0x1038]`、stride `0x80`），而 `0x107029ff Game_Item_Add → jmp 0x107343e0`（清單 `[esi+0x1040]`、count `[esi+0x1044]`、stride `0xEC`），後者是 GAME_ITEM_INFO，不是使用者清單。**結論（每人一包 Game_User_SN、依 UserIndex upsert）不變**，只是引用的位址標錯。詳見 `research/2026-09-20-moon-verify/notes.md`。

### NET 出廠值盤點（2026-09-20，[OBS]＋檔案）
- 主力客戶端 `Default.ini` **沒有 `[IpDrv.TcpNetDriver]` 區段**，出廠狀態用引擎內建預設。看到的 `MaxClientRate=25000`、`NetServerMaxTickRate=30`、`LanServerMaxTickRate=30` 都在 `[Engine.DemoRecDriver]`（錄影驅動），跟對戰連線無關。
- `MetalRage.ini` 最上方的 `[IpDrv.TcpNetDriver] MaxClientRate=100000 / MaxInternetClientRate=100000` 是操作者 2026-09-19 手動加的。
- `User.ini`：`ConfiguredInternetSpeed=100000`、`ConfiguredLanSpeed=100000`。
- [OBS] dusk 那台也已經調成 100000。
- → 兩端都是 10 萬，所以「速率上限太低」不足以單獨解釋投射物消失，除非引擎實際採用的不是這組值（加入者走哪一組速率、URL 有沒有 ?LAN 正在查，`research/2026-09-20-projectile-replication/`）。實驗仍照 PM 的三段式，但基準要用「目前值」而不是「出廠值」，並註明出廠值其實是引擎內建。

## NETSPEED-INIT-2：客戶端送出的 10000 是誰寫的（唯讀，可給中階）

開立：2026-09-20 高階。承 `journal/2026-09-20-2255-netspeed-init-exhausted.md`。

### 目標

找出客戶端 `ServerConnection` 的 `CurrentNetSpeed`（物件 `+0x50`）初值 10000 的寫入指令。

### 範圍

`Engine.dll` 靜態反組譯。**只走一條路**：上一輪掃出的 324 筆
`mov dword ptr [reg+0x50], reg32`（非立即值）候選，用 **call graph 由上而下限定範圍**——
從客戶端連線建立的已知入口（`UNetDriver::InitConnect`、`UNetPendingLevel` 建構、
`UGameEngine::Browse`）往下走，只看實際可達的函式，不要再對整個 3 MB DLL 做字面比對。

### 背景

已排除（不要重做）：
- `IpDrv.dll 0x10714880` 全函式與三個子呼叫：無 `+0x50` 寫入。
- `Engine.dll UNetPendingLevel::NotifyReceivedText 0x104c6960`：對 `+0x50` 只有一筆**讀取**
  （`0x104c7019`），`esi` 已逐指令確認是 `UNetConnection*`（函式開頭用 `NetDriver+0x3c`
  ＝`ServerConnection` 做過斷言）。
- `Engine.dll`／`Core.dll`／`IpDrv.dll` 窮舉掃描「字面值 10000 寫進 `+0x50`」：**零命中**
  （涵蓋 disp8／disp32／SIB 全變形）。
- `CurrentNetSpeed` 不是腳本 UProperty（`Engine.NetConnection` 是空殼；`Engine.Player` 只有
  `ConfiguredInternetSpeed=9636`、`ConfiguredLanSpeed=20000`）→ CDO 複製理論排除。

**最有鑑別力的一條 [TEST]（2026-09-20，`journal/2026-09-20-2153-server-netspeed.md`）**：
把兩份安裝的 `IpDrv.dll` 的 `MaxClientRate`／`MaxInternetClientRate` 都改成 100000 後，
加入者 `stat net` 顯示 **Speed = 100000**，但**房主的 log 仍印 `Client netspeed is 10000`**。
→ 任何候選答案都必須同時解釋這兩件事。最省事的解釋是「`stat net` 顯示的欄位」與
「join 時送進 NETSPEED token 的欄位」**不是同一個**，或送出時間早於該值被設定。
**先用一個小時去驗證這個解釋**（比對 `stat net` 讀的是哪個物件的哪個偏移），
可能比繼續掃 324 筆更快到答案。

### 限制

唯讀。不 attach debugger（客戶端有 anti-attach）。不啟動遊戲。不標 ✅。
位址一律完整 8 位 hex。找不到就寫清楚排除了什麼、卡在哪，不要猜。

### 交付

`docs/journal/<日期>-<HHMM>-netspeed-init-3.md` ＋ `INDEX.md` 追加一列（標「🟡 待審」），
大段輸出放 `docs/research/2026-09-20-netspeed-init/`。

### 完成條件

找到寫入指令（VA ＋ 所屬函式 ＋ 值的來源），或明確證明「靜態手段已用盡」並列出
還沒排除的最後候選集合。**上面那條 [TEST] 的矛盾一定要有交代。**

## LOGIN-RACE：單客戶端的 `login()` 有跟 `login_as()` 一樣的焦點競態（未修）

開立：2026-09-21 高階。

### 目標

把 `login_as()` 的焦點驗證（探測字元）套用到單客戶端的 `login()`，或確認它不需要。

### 背景

2026-09-21 C 段第二次實跑，`login_as()` 的點擊沒落在帳號欄，`mrotesthost` 打進密碼欄、
`x` 打進帳號欄，認證失敗（[SHOT] `shots/dual-netspeed-c-06-login_as-lobby-4.png`）。
**這是隨機競態**——同樣的程式碼在 B 段連續成功六次。

`login_as()` 已修（`_confirm_account_focus()`：打一個丟棄用探測字元，比對密碼欄
stddev 差值，不通過就重試點擊一次、再不過就失敗，絕不送真帳密）。

**但單客戶端的 `login()` 是完全相同的序列**（`click_at(LOGIN_ACCOUNT_FIELD)` →
`type_text(account)` → `TAB` → `type_text(dummy)` → `ENTER`），甚至更簡陋——
連 `account_field_state()` 的清空判斷都沒有。**理論上有一模一樣的競態風險。**

### 範圍

`Metal Rage Online Server/tools/pico/actions.py` 的 `login()`。
用到它的劇本：`U-relaunch-login.json`（以及任何呼叫 `relaunch_client` 的）。

### 限制

- 這條路徑**已被既有劇本驗證過**，改動要證明逐字不變（`git stash` 對照 validate 與 dry-run）。
- 不放寬任何護欄。唯讀驗證，不啟動客戶端。

### 交付

commit ＋ 離線測試（比照 `test_login_as_focus_probe.py`）。

### 完成條件

`login()` 有焦點驗證，或明確寫出「為什麼它不需要」的依據（例如它的呼叫時機保證焦點狀態）。

### 為什麼沒有現在做

C 段是今天的優先；在實跑前動一條已驗證的路徑是不必要的風險。
**但這是個潛伏 bug，會在某次單客戶端無人跑時隨機咬人，而且症狀會很莫名其妙。**

## BRIDGE-SPIKE：行程內橋接 DLL 的可行性驗證（PM 開立 2026-09-21，操作者已同意）

**排序：`NETSPEED-HOST-PATCH` 的第 0、1 輪之後。** 平日 06:30–18:30 時段內可自己跑。

> ### ⚠️ 2026-09-22 修訂（操作者決定，PM 轉達）——**改用 Frida Gadget，不自己寫 C DLL**
>
> 契約其餘不變，以下取代對應段落：
>
> - **階段 1**：同名 proxy DLL（候選**仍從 import 表選**，階段 0 不變）載入
>   `frida-gadget-*-windows-x86.dll`（**32 位元**），config 設 script 路徑，
>   `runtime` 用 `v8` 或 `qjs` 皆可。**過關條件不變**：開到登入畫面、掛 5 分鐘不被砍。
>   被砍就記下結束碼與 log 尾段後**停下來**，不要繞。
>   **不要用 attach 模式** —— anti-attach 還在（`reference/client.md`）。
> - **階段 2**：JS 每秒寫 ZNetwork 場景編號到 `bridge.log`；另外再加一支**計數腳本**
>   掛 `ServerFire`／`ClientFire`（位址自己定位），量法照 Moon 的：**加入者端送出 vs 收到**。
>   用它跑 `NETSPEED-BUDGET` 的 A/B，數字就能跟 Moon 直接比。
> - **階段 3**：從 JS 呼叫主控台指令（`UObject::ScriptConsoleExec` 或 `UViewport::Exec`），
>   **只出設計，不實作**。
> - **與 NETSPEED-BUDGET 的順序**：BUDGET 的第 1、2 步（量 FPS、驗組語）**先做**；
>   BUDGET 的實跑那步**等 Gadget 階段 1 的結果** —— 過了就用 Frida 計數，
>   沒過就照原本的 log 計數。
> - gadget 下載放 `tools/bridge/`，**版本號記進日誌**。

### 目標

回答**一個問題**：我們自己寫的 DLL，能不能在客戶端行程內載入、持續把狀態寫成文字檔，
而且不被保護機制砍掉。**限時 1 個工作天。**
最後給出「做得到／做不到／卡在哪」的結論，**不要求做出成品**。

### 範圍（分階段，每階段過關才進下一階段，失敗就停下來回報）

**階段 0（唯讀）**
- 列出 `MetalRage.exe` 與 `System/*.dll` 的 import，找出**不是 KnownDLLs** 的系統 DLL
  ——那些是可以被同名 proxy 取代的候選（`version.dll`／`winmm.dll`／`dinput8.dll`／
  `dsound.dll`／`d3d8/9.dll` 之類）。**實際以 import 表為準，不要猜。**
- 確認 WSL 有沒有 32 位元工具鏈（`i686-w64-mingw32-gcc`）。沒有就請操作者自己裝。
- **首選是同名 proxy DLL**（放進 System，export 全部轉發給真正的系統 DLL）——
  這個方式**不用改任何既有檔案**。
- 備案（改 IpDrv 的 import 表、code cave 呼叫 LoadLibrary）**只有 proxy 走不通才評估**。

**階段 1：載入**
- 最小 DLL，`DllMain` 只往 `bridge.log` 寫一行（pid、時間、自己的路徑）。
- **過關條件**：客戶端能正常開到登入畫面、log 有那一行、**掛著 5 分鐘沒被砍**。

**階段 2：持續讀狀態**
- DLL 裡開一條執行緒，每秒寫一行「ZNetwork 目前的場景編號」。
- 場景變數位址自己定位（`ZDispatchRoom::Check 0x107e9eb0` 讀的就是它）。
- 讀取前確認 `ZNetwork.dll` 已載入；**讀取一律用 SEH 或 `IsBadReadPtr` 保護**，
  不要因為讀失敗把遊戲弄崩。
- **過關條件**：登入→大廳→房間，場景編號跟著變，**且對得上伺服器 session log**。

**階段 3：控制（只出設計，不實作）**
- 評估「從行程內執行主控台指令」怎麼做（哪個 export、執行緒安全）。交付一頁設計。

### 背景

Pico 加截圖這條路又慢又脆，**操作者本人是瓶頸**。之後商城、卡片、公會的測試量會很大。
行程內橋接如果做得成，**文字狀態**與**控制**兩個需求都能解。

### 限制

- **只在一份新的專用副本上做**（例如 `MetalRage-bridge`）——
  **不能跟 HOST-PATCH 用的副本混在一起**，一次只改一個變數。**不碰主安裝。**
- **不改 `MetalRage.exe`。不 attach debugger。**
- **被保護機制砍掉就記錄並停**：結束碼、事件檢視器記錄、客戶端 log 最後幾行。
  **這次不往 XIGNCODE 旁路升級**——要不要升級由 PM 與操作者決定。
- ⚠️ **`LocalDumps` 要維持關閉**，否則 dump 會造成凍結、把結果弄混
  （見 `journal/2026-09-20-1240-stutter-root-cause.md`）。
- 實作交給 worker，高階負責審。

### 交付

原始碼與建置腳本 `tools/bridge/`；各階段證據 `docs/research/2026-09-22-bridge-spike/`；
一篇日誌。**結論一律標 🟡 或 [TEST]。**

### 完成條件

每個階段都有明確的「過／沒過」並附證據檔名；或 1 天時限到，回報做到哪、卡在哪。

---

---

## NETSPEED-BUDGET — Moon 的第二個修補在我們這邊必不必要（PM 2026-09-22 開的任務）

### 目標

判定 Moon 提供的 `UNetConnection::Tick` 頻寬銀行修補（放寬 `QueuedBytes` 下限）
**在我們的條件下是否必要、是否安全**。結論要分開寫「我們條件下」與「高 FPS 房主下」，
不要只寫「有效」。

### 範圍

1. **先量我們房主的 FPS**（`stat fps`，或 log 的 tick 資訊），對照 Moon 的 1000–1800。
   這一步決定後面怎麼解讀，先做。
2. **verifier 用 disasm 確認** `Engine.dll 0x1042e1ee`–`0x1042e224` 的語意真的是
   `QueuedBytes -= D; if (QueuedBytes < -2D) QueuedBytes = -2D`（D = DeltaTime × CurrentNetSpeed），
   且 `[esi+0x14c]` ＝ `QueuedBytes`、`[esi+0x50]` ＝ `CurrentNetSpeed`（後者已知）。
3. **修補工具加第二個獨立開關**（`--budget`）：先驗雜湊、逐 byte 比對、可 `--restore`，
   **section header 的改動要一起還原**。
4. **實跑，只改這一個變數**：房主 30000＋budget vs 房主 30000 不加，自動化各 3 輪。
   預期兩組都 0%（因為我們 FPS 低）；這一輪的重點是**證明加了不會壞**
   （第 0 輪：能開到登入、能打完一場）。
5. 若第 1 步量到我們房主 FPS 也很高，或想重現 Moon 的 22%：
   **關掉房主 vsync／解除 FPS 上限再跑一次 A/B**，這輪才有鑑別力。

### 背景

**外部來源，🟡。** Moon 套我們的 netspeed 修補後遺失率只從 84–87% 降到 **22%（7/32）**，
再加這個修補才 **0/40**。他給的成因：`UNetConnection::Tick` 裡
`QueuedBytes -= D; if (QueuedBytes < -2D) QueuedBytes = -2D`，連線只能存**兩個 tick** 的頻寬；
他房主 1000–1800 FPS，銀行只剩 110–260 bytes，任何 send 之後緊接的 RPC 都被 `IsNetReady` 擋掉。
他推測**我們房主 FPS 低，所以 netspeed 單獨就夠** —— 這正是第 1 步要量的。

**他的修補（bytes 由 PM 機械核對過，機制推論要我們自己驗）**：

| 位址 | 原始 | 修補後 |
|---|---|---|
| `0x1042e1f8` | `DC C0 8B 8E 4C 01 00 00` | `E9 23 A9 24 00 90 90 90`（jmp `0x10678b20`） |
| cave `0x10678b20` | 全零（`.text` 尾端） | `DC C0 8B 4E 50 C1 E9 02 89 4D E4 DB 45 E4 DE C1 8B 8E 4C 01 00 00 E9 C5 56 DB FF` |
| section header | `.text` VirtualSize `0x377b1e` | `0x378000` |

效果 ＝ 下限從 `-2D` 改成 `-(2D + CurrentNetSpeed/4)`。**房主與加入者都要套**（他的說法）。

PM 已核對：`0x1042e1f8` 原始 bytes 相符、`0x10678b20` 起 32 bytes 全零、
VirtualSize `0x377b1e`／raw `0x378000`、cave 尾 jmp 回 `0x1042e200`（`sub ecx,eax`）正確、
cave 重現了被覆蓋的 `fadd` 與 `mov`。

我們這邊的既有結論：房主 netspeed 30000 時自動化 36/36、缺口 0.0%
（`journal/2026-09-22-1345-netspeed-min.md`），所以**我們的起點跟他的 22% 完全不同**。

### 限制

- **只在副本 `C:\Games\MetalRage Online 2`**，不碰主安裝、不碰 `MetalRage.exe`。
- **加入者先不套**，只套房主測；加入者那份另開一輪（一次只改一個變數）。
- 外部來源的 bytes 與機制**都先標 🟡**，我們自己的 disasm 與實跑過了才升級。
- 實跑之前不要改 DB、不要改劇本；跑到一半更不要動。
- 每輪開跑前獨立驗一次房主 `Engine.dll` 的 sha256 並記進台帳。

### 交付

- `docs/research/2026-09-22-netspeed-budget/`（disasm、逐輪台帳、FPS 證據）
- 一篇日誌
- `docs/state.md` 一列，**標明外部來源，並寫清楚我們條件下的結果**

### 完成條件

1. 房主 FPS 有數字與證據檔名。
2. `0x1042e1ee`–`0x1042e224` 的語意有我們自己的 disasm 佐證（或指出與 Moon 說法不符之處）。
3. `--budget` 開關有離線測試，含 section header 的還原。
4. A/B 各 3 輪有逐輪數字；第 0 輪證明套了之後能開到登入、能打完一場。
5. 結論寫成「我們條件下必要／不必要，但高 FPS 房主下必要（外部 🟡）」這種形式，
   不要只寫「有效」。
