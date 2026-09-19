# PvE 子模式怎麼開始（Boss／TwoBoss／Escort／Tutorial／Campaign）— explorer 調查，中階，未審查，🟡

任務：找出從客戶端角度，Boss/TwoBoss/Escort/Tutorial/Campaign 各自的 UI 觸發路徑、map id、GameInfo class、
伺服器目前支援狀態，供 Pico 60 秒冒煙測試腳本使用。全部只讀，未改任何檔案。

## 權威來源：Cache.Bin Table 1（42 筆，已有文件）

`docs/gemini-gameinfo-findings.md`（2026-09-15，Gemini，已被 Claude/後續工作採用，`docs/journal/2026-09-15-10-map-id-always-wrong-root-cause.md`
抄錄了其中 14 筆並標「已驗證」）。這是每個 real Map ID → GameInfo class 的完整表，`ZNetwork.dll`
`Game_Info_URL_Get`（VA `0x10733cf0`）用 `cmp [eax], edx` 比對 `entry[0]`（Map ID）找這張表（[SRC] 該檔 §3.2 組語節錄）。
GameInfo class 字串本身**由客戶端從 Cache.Bin 查出，伺服器只送 Map ID**，不送 class 字串——這點很重要：
只要伺服器送對 Map ID，client 自己會拼出正確的 `Game=` URL 參數。

## 各模式

### Campaign（已可玩，✅ 既有結論）
- Map ID 9001-9003（`Map_PC01` 動力奪取戰）、9004-9006（`Map_PC03` 援救基地戰）、9010-9012（`Map_PC04` 潛入作戰）。
- GameInfo：`ZModePve.ZModePve`（9001-9006）、`ZModePve.ZSetCoreModePve`（9010-9012）。
- UI：房內「選擇地圖 ▼」→ `ZPopup_MapSelect`，`m_RoomType==PVE_GAME` 時只列 `MapType==9`（[SRC] `ZPopup_MapSelect.uc:149-158`）；
  難度鈕 초급/중급/고급 對應 `PlayPve` 欄位 1/2/3（[SRC] `ZPanel_PVE.uc:307-329`），同地點三難度以 `(MapIndex-9001)/3` 分組（`ZPanel_PVE.uc:328`）。
- 伺服器：`room.dispatch.js:179` `MAP_IDS_PVE = [9001..9012]`；`gate.game.dispatch.js:1262-1264` 把 Create_CQ 選到的 map id
  clamp 在 9001-9012（否則退回 9001）。9010-9012 已整場跑通（`docs/journal/2026-09-17-18-create-cq-map-difficulty.md`）。

### Escort（防衛作戰）—— map id 已在既有清單裡，未被特別測過，跟舊筆記矛盾
- **Map ID 9007-9009**（`Map_PC02` 防衛作戰 易/中/難），GameInfo **`ZModeEscortPve.ZModeEscortPve`**
  （[SRC] `docs/gemini-gameinfo-findings.md` 表格第 35-37 列；`ZModeEscortPve.uc:1` `class ZModeEscortPve extends ZModePve`，
  `ZModeEscortPve.uc:8-20` 有 `MRPorterAiController`/`SetAiOrder` 之類 Escort 專屬邏輯，確認這是獨立 GameInfo，不是純 Campaign 皮膚）。
- **跟 `docs/research/2026-09-19-pve-smoke/notes.md` 矛盾**：該筆記猜「9004-6 援救基地戰像 Escort，但沒有證據」。
  實際上 9004-9006 的 GameInfo 是 `ZModePve.ZModePve`（跟 9001-9003 相同的標準 Campaign class），
  真正的 Escort 是 **9007-9009**（`Map_PC02` 防衛作戰）。這點待 pve-smoke 筆記的作者或高階更正。
- UI 路徑：跟 Campaign **完全相同**——房內「選擇地圖 ▼」，`(MapIndex-9001)/3==2` 那組（第三張地圖卡／地圖預覽的第 3 個位置或用 ◀▶ 切到第 3 張），
  難度鈕一樣。不需要另開分頁或按鈕。
- 伺服器支援：`MAP_IDS_PVE`（`room.dispatch.js:179`）**已經包含 9007/9008/9009**，`gate.game.dispatch.js:1262-1264` 的 clamp
  範圍（9001-9012）也涵蓋它們。理論上「選 9007-9009 建房／換圖」現在就送得出正確 Map ID，client 会自己用 Cache.Bin 查到
  `ZModeEscortPve` 並帶入 travel URL。**但從未有人實際測過選這三個 id**（`docs/research/2026-09-19-pve-smoke/notes.md` 只驗過 9001-9 的封包和選圖，
  整場跑完的只有 9010-9012）——所以「開始」這一步大機率沒有已知阻礙，但沒有 [LOG]/[OBS] 證據，仍是 ⬜ 待測，不是 ✅。
- Escort 玩法本身依賴 `TriggerTouch_SN 0x0023013e`（護送目標的觸發事件），伺服器從未送過、dispatch 目錄裡沒有任何 handler
  （`grep -rn "0x0023013e" dispatch/` 無結果）。但這只影響「能不能正常玩下去」，不影響「能不能開始」這個冒煙測試的判準。

### Boss（BOSS任務）—— 不在 PVE 分頁，需要新的 map id 且被伺服器 clamp 擋住
- **Map ID 4011**（`Map_C09` D-Day），GameInfo **`ZmodeBot.BossMission`**（[SRC] `docs/gemini-gameinfo-findings.md` 第 14 列）。
- 這不是 `RoomType==PVE_GAME`（協力模式）底下的地圖。`MapType` 欄位（Boss=4）只在 `m_RoomType==NORMAL_GAME||ATTACK_GAME`
  時的地圖選單裡出現（[SRC] `ZPopup_MapSelect.uc:216-224`：`case 4: nMapType=4; //보스미션`，這個 case 只在
  `NORMAL_GAME`/`ATTACK_GAME` 分支底下），`PVE_GAME` 分支（`ZPopup_MapSelect.uc:150-158`）**只有 `nMapType==9`（Campaign）**。
  `ZPopup_RoomSet.uc:467` 註解直接列出完整 MapType 表：`0:팀데스매치 1:데스매치 2:점령1 3:점령2 4:보스 5:탈취 6:폭파 7:서든데스 8:레이지 9:캠페인`。
- UI 路徑：大廳「建立房間」→ `b_Normal`（一般戰）分頁，不是 `b_PVE`（[SRC] `ZPopup_CreateRoom.uc:232-242,263-273`，`m_RoomType = NORMAL_GAME`）
  → 進房後「選擇地圖」→ 地圖分類選「보스미션」(Boss Mission，第 5 個分類鈕，`nTypeCount` case 4，`ZPopup_MapSelect.uc:220`) → 選 `Map_C09`。
- 伺服器支援：**目前擋死**。`gate.game.dispatch.js:1262-1264` 把 Create_CQ 帶的 MapIndex clamp 在 9001-9012，
  4011 會被硬改成 `MAP_ID_DEFAULT_CAMPAIGN`(9001)；`MAP_IDS_PVE`（`room.dispatch.js:179`）也沒有 4011。
  要能測 Boss，至少要放寬這個 clamp（或做一條平行路徑），這是程式改動，不只是送一個 id 的問題。
  `effectiveRoomType` 邏輯（`gate.game.dispatch.js:1197-1198`）對 `roomType==0`（Normal）本身沒有特別擋，
  但沒有證據顯示 Normal 類房間（TeamDM/占領/爆破等）曾經被跑過整場——`docs/state.md` 全文 grep 不到任何
  TeamDM／一般戰／NORMAL_GAME 的 ✅ 紀錄，這是額外風險，不只是 map id 的問題。
- 需要但未實作的 opcode：`Boss_SN 0x00230138`（`docs/client-dispatch-map.md:127`）——dispatch 目錄 grep 不到，未實作。

### TwoBoss —— 在 Cache.Bin 42 筆表裡完全找不到對應地圖，⬜ 且理由明確
- `ZNetwork_DJ.uc` 有 `Game_TwoBoss`/`Game_TwoBoss_Damage`/`Game_TwoBoss_Heal`（native 함수，`ZNetwork_DJ.uc:1898-1900`）
  和 `TWOBOSS_ACTION_REDDIE/BLUEDIE` enum（`ZNetwork_DJ.uc:86-87`），這是網路層的殘留/預留邏輯。
- 但 `docs/gemini-gameinfo-findings.md` 的 42 筆完整表（Cache.Bin Table 1 全部項目）**沒有任何一筆 GameInfo class 含
  "TwoBoss"**，`ZPopup_MapSelect.uc`／`ZPopup_RoomSet.uc:467` 的 MapType 0-9 枚舉也沒有 TwoBoss 對應值。
  `~/mro-decrypted/src` 裡沒有 `ZModeTwoBoss` 之類的 package/class（比對 `ZModeEscortPve`/`ZModeBot` 都有獨立資料夾，
  TwoBoss 沒有）。
- 結論：**這台 TW client 沒有任何地圖走 TwoBoss GameInfo**，UI 也沒有分類可以選到它。⬜ 無法開始，理由是
  「找不到 map id／GameInfo class／UI 入口」，不是伺服器沒實作。除非之後在別的 Cache.Bin 表或 `.ini`（`GameMode.ini`）
  找到隱藏項目，否則這條路目前打不開。
- 需要但未實作的 opcode（若日後找到地圖）：`TwoBoss_SN 0x0023013c`（`docs/client-dispatch-map.md:129`），未實作。

### Tutorial（教學模式）—— 純本機 travel，跟既有筆記一致，已核對
- Map `Map_Ptuto`（id 101）／`Map_Ptuto2`（id 102），GameInfo **`ZModeTutorial.ZModeTutorial`**——這是客戶端寫死在
  URL 字串裡的（不是查 Cache.Bin），[SRC] `ZPage_TutorialTGS.uc:145-158`：
  `URL="start Map_Ptuto?Game=ZModeTutorial.ZModeTutorial?MaxPlayers=32?GoalScore=100?TimeLimit=20?BalanceTeams=0?numbots=0?team=0?tutortype=SmallEvent"`（依按鈕不同 `tutortype` 換成 AssaultEvent/SniperEvent/EngineerEvent，
  `Map_Ptuto2` 的另外四個按鈕 `BlastEvent/HeavyEvent/ArtilleryEvent/ObserverEvent` 只在
  `Publisher_Type_Get() != PUBLISHER_WASABII` 時才啟用，`ZPage_TutorialTGS.uc:150-158`——**TW client 的 Publisher_Type 是否為
  WASABII 沒有查證，若是，教學模式只有 4 個機體選項可選，不是 8 個**，⬜）。
  Cache.Bin 表裡 `Map_Ptuto`/`Map_Ptuto2` 這兩筆的 GameInfo 欄位是 `(None)`（`docs/gemini-gameinfo-findings.md` 第 1、3 列）——
  這不矛盾，因為 Tutorial 根本不走 `Game_Info_URL_Get` 查表，URL 是寫死的常數字串。
- UI 路徑：大廳上方「教學模式」快捷鈕 → `OPEN_TUTORIAL` → `TutorialOpen()`：僅在 `Scene_Get()==SCENE_LOBBY` 時執行，
  先送 `Tutorial_Open()`（伺服器通知，非戰鬥開始），再本機開 `ZPage_TutorialTGS` 頁（[SRC] `ZPage_Lobby.uc:1664`
  `case "OPEN_TUTORIAL": TutorialOpen(); break;`，`ZPage_Lobby.uc:1961-1967` 定義 `TutorialOpen()`）→
  頁面上 4（或 8）個機體按鈕 `b_SelMech[0..7]`，各自組上面那條 `start` URL，**不經過伺服器建房流程**。
  跟 `docs/research/2026-09-19-pve-smoke/notes.md` 的既有結論一致，行號重新核對過。
- 伺服器 opcode（[DLL] 既有紀錄，未重新反組譯，沿用 pve-smoke 筆記）：`Tutorial_Start_CN 0x1070534e→0x107e9b70` 寫
  `0x00260121`；`Tutorial_End_CN 0x10702d4c→0x107e9c30` 寫 `0x00260122`；`Mech_License_CQ 0x107058c6→0x107e9cf0` 寫
  `0x00260111`。這些跟 `community.dispatch.js:55-61` 現有標籤矛盾（該檔案把 `0x00260121` 當 `CQ_LICENSE_QUERY`）——
  pve-smoke 筆記已經記過，待審，本次沒有重新驗證。

## 不確定 / 矛盾彙整

1. **與 `docs/research/2026-09-19-pve-smoke/notes.md` 矛盾**：Escort 的真實地圖是 9007-9009（`ZModeEscortPve`），
   不是該筆記猜測的 9004-9006（那組其實是普通 `ZModePve`）。9007-9009 已經在伺服器的 `MAP_IDS_PVE` 清單裡，
   理論上可以直接測——這跟該筆記「Escort map id 未知」的結論不一致，需要更正或至少加註。
2. TW client 的 `Publisher_Type_Get()` 實際值沒有查（教學模式機體選項數量 4 或 8 顆按鈕，⬜）。
3. Escort（9007-9009）能否真的整場跑完（含 `TriggerTouch_SN`）沒有 [LOG]/[OBS]，只確認「map id 存在且已在允許清單」。
4. Normal-type 房間（Boss 所需的 `RoomType==0`）是否有任何一次完整跑過，state.md 沒有紀錄；`body[6]`／`body[2..3]`
   在 Create_CQ 裡對 Normal 房間的實際語意（跟 Campaign 房間是否共用同一組欄位偏移）沒有另外驗證，
   照抄 Campaign 的偏移是 🟡 假設。
5. 本次沒有用 `tools/disasm.py` 重新驗證任何 DLL 封包偏移——引用的偏移全部沿用既有已核對過的日誌
   （`docs/journal/2026-09-15-10-map-id-always-wrong-root-cause.md`、`2026-09-17-18-create-cq-map-difficulty.md`），
   沒有自己新增未驗證的 DLL 偏移宣稱。

## 給主力的下一步建議

- Escort（9007-9009）看起来是「幾乎零成本」可以先測的一個：跟現有 Campaign smoke test 走同一條路徑，只是在
  「選擇地圖」時挑第 3 組（防衛作戰），不需要改任何伺服器程式碼。可以先排進 Pico 腳本，最有機會 60 秒內看到
  `start ... Map_PC02 ... ZModeEscortPve` 出現在客戶端 log。
- Boss 和 TwoBoss 目前都不是「送對 map id 就能測」的等級：Boss 需要先解除 `gate.game.dispatch.js:1262-1264` 的
  9001-9012 clamp（且對應的 UI 路徑是完全沒驗證過的 Normal 房間流程），TwoBoss 在這個 client 版本裡根本找不到
  可用的地圖／GameInfo，建議先排除在這輪冒煙測試之外，除非之後找到隱藏地圖的證據。
- pve-smoke 筆記裡「9004-6 像 Escort」那句建議由審查者更正為「9004-6 是 ZModePve 標準 Campaign（援救基地戰），
  真正 Escort 是 9007-9009」。
