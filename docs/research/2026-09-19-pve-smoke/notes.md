# PvE 各模式冒煙測試：可行性（explorer 2026-09-19，中階，待審；高階存檔）

- 地圖：9001–9012 只有 4 張戰役地圖，各 3 檔難度（`(MapIndex-9001)/3`，[SRC] `ZGameMainMenu/ZPanel_PVE.uc:328`）。
  - 9001-3 Map_PC01、9004-6 Map_PC03、9007-9 Map_PC02、9010-12 Map_PC04。
  - 中文名稱對應是依清單順序推測的，沒有逐筆核對 🟡。
  - 沒有 Boss／TwoBoss／Escort／Tutorial 專屬的 map id。9004-6「援救基地戰」像 Escort，但沒有證據 ⬜。
- 選圖：房內「選擇地圖 ▼」會開 `ZPopup_MapSelect` 彈窗，送 `0x00220221` → 伺服器回 `0x00220223` ✅（journal 2026-09-19-1000）。難度鈕 ✅。◀▶ 箭頭沒單獨測過 ⬜。
  - 「房間設定變更」對話框的 `Room_Map_Change_All_CQ 0x00220224` 沒有 handler，冒煙測試不要走這條。
- 只有 9010-12 跑過整場；9001-9 只驗過封包和選圖。
- 目前做不到：
  - Boss／TwoBoss：map id 未知；`Boss_SN`／`TwoBoss_SN` 伺服器從沒送過。
  - Escort 的觸發機制：`TriggerTouch_SN` 從沒送過。
  - Tutorial：見下。
- Tutorial：從大廳「教學模式」按鈕進，走客戶端本機 travel（`ZPage_Lobby.uc:1664,1961-1967`、`ZPage_TutorialTGS.uc:145-158`，地圖 `Map_Ptuto`），不建房。
  - [DLL] `Tutorial_Start_CN` `0x1070534e`→`0x107e9b70` 寫 `0x00260121`；`Tutorial_End_CN` `0x10702d4c`→`0x107e9c30` 寫 `0x00260122`；`Mech_License_CQ` `0x107058c6`→`0x107e9cf0` 寫 `0x00260111`。
  - **跟伺服器標籤矛盾（待審）**：`community.dispatch.js:55-61` 把 `0x00260121` 當成 `CQ_LICENSE_QUERY`，把 `0x00260111/0x00260112` 當成 quest complete。要用 xref 核對之後才能改（backlog TUT-LABEL）。
- 冒煙測試建議：每組地圖用 MapSelect 選一張 → F5 → 看 `Game_Info_SN` 的 mapCacheKey 和 `BeginRound_SN`，以及客戶端 log 的 `start ... Map_PCxx` → 開場 60 秒 → GameCampaign 打完。
