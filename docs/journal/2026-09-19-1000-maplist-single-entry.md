# MAPLIST 實作：SN_MAP_CHANGE_ALL 單筆模式（中階，🟡，未經跨公司審查）

狀態：🟡 待審。開關 `mapAllSingleEntryMode`（`room-map.sender.js`）預設 `disabled`，行為完全不變；未實機測試，等高階排實測。

## 根因（高階已核對）

- [SRC] `~/mro-decrypted/src/ZGameMainMenu/ZPage_Room.uc:654-686` `UpdateRoomInfo()` 對 `MapInfo[0..5]` 逐筆處理：每一筆 `Index` 非 0 的地圖都會執行 `p_PVE.m_Difficulty = MapInfoList[j].PlayPve`，迴圈沒有 `break`。所以清單裡**最後一筆非 0** 的地圖才決定難度燈，不是玩家實際選的那筆。
- [DLL] 客戶端只存清單前 `MAX_MAP_COUNT=6` 筆（`0x107ebc1d`，`research/2026-09-18-map-list-zero/`）。
- [CODE] 現行 `Map_Change_All_SN 0x00220226` 固定送 `CAMPAIGN_MAP_ALL_HINTS = MAP_IDS_PVE`（9001..9012，`room.dispatch.js:178-189`），共 12 筆，客戶端只吃前 6 筆——這 6 筆幾乎不可能剛好是玩家選的那筆排在最後。這是 H6「難度燈慢一拍／跳到別的值」現象的候選根因之一（`docs/backlog.md` H6）。

## 修改（一個變數：ALL 封包的筆數／內容）

- `Metal Rage Online Server/dispatch/room/room-map.sender.js`
  - 新開關 `mapAllSingleEntryMode`（`let` + `isMapAllSingleEntryEnabled()` + `_setMapAllSingleEntryModeForTests()`，跟 `rooms.js` 的 `roomJoinMode` 同一套寫法，讓 `packetlog.js` 的 `SWITCH_RE`（camelCase `xxxMode`）掃得到），第 30-40 行左右，預設 `'disabled'`。
  - `sendRoomMapPackets()`（約第 102-160 行）新增 `allMapList`／`allEffectiveSelectedIdx`：enabled 時把送進 `sendMapChangeAllPacket()` 的清單縮成 `[mapList[effectiveSelectedIdx]]`（也就是目前實際選的地圖，來源同 `Game_Info_SN` 用的 `campaignMapCacheKey`／`client.campaignMapCacheKey_`，見 `room.dispatch.js:1482-1490` 的註解與 `journal/2026-09-18-08-room-map-sync.md`），selectedIdx 固定 0。`sendMapChangeOnePacket()` 呼叫不變，仍用原本完整 `mapList`／`effectiveSelectedIdx`。
  - 唯一一筆的 record+0x04（selected 旗標欄位）寫法沒動：因為 `i === effectiveSelectedIdx` 在單筆模式下 `i=0, effectiveSelectedIdx=0`，跟原本邏輯算出的結果一樣是 1。**沒有動 record+0x04 代表什麼的問題**——state.md 4b 節標它是 Round 而非選中旗標，這裡照舊維持原值，不下新結論。
  - `sendRoomMapPackets()` 只在 `client.isTrueCampaign_`（PvE 房）為真時才會跑到這段（函式開頭就 `if (!client.isTrueCampaign_) return`），所以 PvP 房本來就不會呼叫到這個 sender，不需要另外判斷。
  - 沒有動 `MAP_ALL_HEADER_MODE`／`MAP_ALL_SEND_TWICE`／`MAP_CHANGE_ONE_SETTINGS_MODE`／`MAP_CHANGE_ORDER_MODE`（R7/R7b，維持 disabled）、`ROOM_MAP_SYNC_MODE`（R1）。
- 新增 `Metal Rage Online Server/test/map-list-single.js`。

## 驗證

```
node test/replay-golden.js        # 全綠，pve-full-match 8383 packets PASS（disabled，逐位元組同前）
node test/map-list-single.js      # 2 案例 PASS：disabled count=12（原 12 筆 hint list 不變）；enabled count=1、mapId=選中值、selected=1
node test/console-commands.js / exception-guard.js / extra-lives.js / login-token.js /
     room-chat.js / room-join.js / rooms.js / round-advance.js / whitelist.js
                                   # 全部 PASS（未受影響）
```

`node --check dispatch/room/room-map.sender.js` 通過。

## 待實測（高階排場次）

1. 開 PvE 房，開關切 enabled 後看房間面板中間的地圖清單是否只剩 1 筆（而不是 12 筆裡挑一筆顯示）。
2. 只點一次「初級」，看難度燈是否**第一次就**亮初級、目標回合是否立刻顯示 5（不用再點第二次）。
3. 再點一次「高級」，看是否立刻變 10，不再出現 H6 記錄的「跳到另一個值」（`session-20260919-012749.jsonl:124,148`）。
4. 若還是慢一拍或跳值，代表根因不只是清單筆數，還有其他寫入／重繪順序因素（R7/R7b 已排除「ALL 排在 ONE 之後」這條路，此開關不改送出順序，只改 ALL 的內容）。

## 限制與未做

- 未實機測試，未跨公司審查，不標 ✅／❌。
- 沒有動 `sendMapChangeOnePacket()`、送出順序、`R7/R7b` 的 `MAP_CHANGE_ORDER_MODE`。
- 沒有處理「record+0x04 其實是 Round」的線索（backlog H6 停放清單提到的另一個變數），留給後續任務。
- worktree：`~/mro-wt/maplist`，分支 `flash-wip-maplist`，未合併、未重啟伺服器。

## 實機驗證（2026-09-19，單人，Claude 高階）

- build：`test-server@f2a31c9 dirty=true nonDefault=[GAME_INFO_TIME_LIMIT_MODE, PVE_ROUND_ADVANCE_MODE, mapAllSingleEntryMode, lobbyRoomListMode] … pveExtraLives=7`（`/reload` 後）。
- [OBS] (1) 中間清單只剩 1 筆 ✅；(2) 按一次「初級」燈號第一次就對、目標回合 5 ✅；(3) 「高級」燈號與 10 回合正確 ✅。→ H6 根因（最後一筆非 0 的 MapInfo 決定燈號）成立。
- [OBS] ❌ **回歸：房內「選擇地圖」下拉選單只剩「潛入作戰」**，換不到別張地圖。state.md 4b「下拉選單全由客戶端從 Cache 算」看來不完全成立：下拉選項似乎也取自 MapInfo 清單。已派 MAPLIST-2 分析下拉資料來源與「每張地圖一筆」的送法。**在找到能同時滿足下拉與燈號的送法之前，這個開關不能設為預設。**
- [OBS] H7（設定對話框地圖清單空）沒有變化。
- 未經跨公司審查。

## 更正（2026-09-19，MAPLIST-2 分析＋高階核對）

- **「下拉選單變空是這次的回歸」是錯的。** 房間裡有兩個獨立的地圖元件：
  - `lb_MapList`（中間清單，`ZPanel_RoomInfo.uc:647-678`）：由 `RoomInfo.MapInfo[0..5]` 填入，也就是 Map_Change_All_SN 的內容；點擊只會切換本地顯示，不送封包。單筆模式讓它剩 1 筆，這是預期結果。
  - `co_Map`（「選擇地圖」下拉與 ◀▶ 箭頭）：只在 `InitRoomInfo()`（`:307-348`）從 Cache 填一次，條件是 MapIndex ≥ 1000 且 **`Account_MapList_Check`** 通過（高階核對 `:320-345`）；箭頭在 `co_Map.List.ItemCount <= 1` 時直接 return（`:1072`）。
- `Account_MapList_Check` 比對的是 `m_MapList`，這份清單只由登入時的 `MapInfo_SN 0x00210115` 填入；`account.dispatch.js:37` `MAP_INFO_REAL_ID_MODE='disabled'` 送的是 0–5 → 每張 PvE 地圖都被擋掉 → **下拉清單在改動之前就一直是空的**（與 H7 同一條鏈）。
- R9 當時開過這個開關，但觀察的是另一個對話框（ZPopup_RoomSet，多了人數篩選），`co_Map` 從沒單獨測過。
- [CACHE] 9001–9012 每 3 筆是同一張地圖的初／中／高：9001-3 Map_PC01、9004-6 Map_PC03、9007-9 Map_PC02、9010-12 Map_PC04（`ZPanel_PVE.uc:328-329` 的 `(MapIndex-9001)/3` 相符）。`room.dispatch.js:180` 的註解「9001 = 動力奪取戰」跟截圖（9001 群組顯示「潛入作戰」）不一致，待核對。
- 下一個單變數實驗：只把 `MAP_INFO_REAL_ID_MODE` 改成 enabled（需要重新登入，因為 MapInfo_SN 是登入時送的），看 `co_Map` 能不能列出 4 張地圖、箭頭能不能換圖。

## MAP_INFO_REAL_ID_MODE 實驗（2026-09-19）

- [LOG] `session-20260919-100817.jsonl:645`：重新登入後 MapInfo_SN 送了 12 筆 0x2329–0x2334（9001–9012）。
- [OBS] 下拉選單和 ◀▶ 箭頭仍然無效；客戶端完整重開後（`session-20260919-103330.jsonl` 200 行 marker）也一樣。H7 沒有變化。
- ❌ 單靠送真實 map id 不夠。🟡 推測：`co_Map` 只在 `InitComponent` 時填一次，可能早在登入前就建立了；或 `Account_MapList_Check` 還比對了其他欄位。擱置，開關關回 disabled。

## H7 重新調查（2026-09-19 晚，explorer 三輪＋高階抽驗，🟡）

- **更正目標：** 房間的地圖欄按下去**不是**展開 `co_Map` 下拉清單，而是開 `ZPopup_MapSelect` 視窗。`ZPanel_RoomInfo.uc` 約 260-285 的 handler 會開這個視窗，`ZGUIComboBox.uc:138` 刻意不畫 co_Map 的清單。所以「清單是空的」指的是 `ZPopup_MapSelect`。
- `ZPopup_MapSelect.InitButton()` 只在 InitComponent 建一次，資料來源是 `CacheManager.GetSortMapInfoList()`。篩選條件：
  - MapIndex ≥ 1000；
  - `Account_MapList_Check`（UC `ZNetwork_DJ.uc:1093`，只比對 `m_MapList[n].Index`）；
  - PvE 房（RoomType==2）時 MapType==9；
  - 相同 MapDescription 去重。
  它**不看人數**。
- [CACHE] 9001–9012 的 MapType=9、PlayPve=1/2/3，都會通過篩選；UserMin=UserMax=16。
- [DLL] `Room_Default_SN` body+4 經跳表（`0x107ea4b5` → `0x107ea6d8`）把 raw 1 轉成 RoomType 2，所以 RoomType 沒問題（高階抽驗）。
- **矛盾未解：** REAL_ID 實驗（`session-20260919-100817.jsonl:645`，12 筆 9001–9012、格式正確）照理已經通過所有篩選，實測卻還是空的。下一步重測時要截圖，並確認視窗是在 REAL_ID 登入之後才第一次建立。
- `ZPopup_RoomSet.Update_MapList()`（:571）另外要求 `UserMin ≤ nUserMax ≤ UserMax`，也就是 nUserMax 必須剛好是 16。伺服器的 PvE `maxPlayers` 寫死 8（`gate.game.dispatch.js` 約 1163-1165）。16/2＝8 格，跟原版截圖開 8 格一致。→ 另一個單變數實驗：PvE MaxUser 送 16。

## H7-MAPINFO-30907 實作（中階，🟡，未經跨公司審查）

狀態：🟡 待審。新開關 `mapInfoOnGameLoginMode`（`gamelogin.dispatch.js`）預設 `disabled`，行為完全不變；未實機測試。

- 依據 `[LOG]` `session-20260919-170919.jsonl` ms 457523：MapInfo_SN 只在 9211 連線送過一次；`[LOG]` 客戶端 `MetalRage.log`（17:16:19 這場）：每次開房間地圖選擇器，`ZPopup_MapSelect` 都記 `Accessed array 'm_MapInfoList' out of bounds (0/0)`，`ZPanel_RoomInfo` 的 `co_Map` 篩選鏈也是空的，兩條篩選鏈唯一共用的是 `Account_MapList_Check`（`ZNetwork_DJ.uc:1093`，比對 `default.m_MapList`）。🟡 假設：9211 登入後的關卡移動（Browse Index.tzp / Store_01）把 `ZNetwork_DJ` 的 default-object 資料重置，`m_MapList` 因此遺失；同一個 30907 登入送的 ItemInfo/WearInfo 卻能存活，所以嘗試在 30907 登入也重送一次 MapInfo_SN。
- 改動：
  - 新增 `dispatch/map-info.sender.js`：把原本在 `account.dispatch.js` 重複三次的 MapInfo_SN 位元組寫法（含 `MAP_INFO_REAL_ID_MODE`／`MAP_INFO_REAL_IDS`）抽成共用的 `sendMapInfoSN()` / `resolveRealMapIds()`，行為完全不變（三個呼叫點改寫後的輸出跟原本逐位元組相同，見下方驗證）。
  - `account.dispatch.js`：三個 SN_MAP_INFO 區塊改呼叫共用函式，不改任何邏輯。
  - `gamelogin.dispatch.js`：新開關 `mapInfoOnGameLoginMode`（`let` + `_setMapInfoOnGameLoginModeForTests()`，同 `room-map.sender.js` 的寫法），預設 `disabled`。開啟時，在 `Login_Again_CQ 0x00110124`（30907 登入）的帳號存在分支裡，SN_LICENSE_INFO 之後補送一次 MapInfo_SN，跟 9211 用同一個 `resolveRealMapIds()` 判斷。
- 驗證：`node test/replay-golden.js`（4 個 golden 全過，含 `pve-full-match` 8383 packets）；`node test/map-info-game-login.js`（新測試，兩案例：disabled 預設不送；enabled + REAL_ID enabled 送 1 筆、count=12、ids=9001..9012）；`test/*.js` 全部跑過，`extract-golden.js` 是 CLI 工具不是測試（無參數本來就 exit 1，未改動樹上也一樣）。
- 未做：未實機測試；不知道這個假設是否真能修好 H7（`co_Map`／`ZPopup_MapSelect` 空清單），只證明位元組正確。開關 disabled 是預設，不影響任何既有行為。
- worktree：`~/mro-wt/mapinfo`，分支 `flash-wip-mapinfo`，未合併、未重啟伺服器。

## H7 實測：選地圖視窗出現地圖了（2026-09-19 晚）

- ✅ [SHOT] `shots/mapselect-after-30907.png`（test-server@11300d4，`MAP_INFO_REAL_ID_MODE` 和 `MAP_INFO_ON_GAME_LOGIN_MODE` 都開、重新登入後）：
  - `ZPopup_MapSelect` 列出「協力」類的 4 張圖：動力奪取戰、援救基地戰、防衛作戰、潛入作戰（已勾）；
  - 房間的「選擇地圖」欄也顯示「潛入作戰」。
  （未經跨公司審查）
- 結論：9211 登入時收到的 `MapInfo_SN` 在之後的場景切換中遺失。30907 登入時再送一次，`m_MapList` 就能保留。🟡 遺失的機制（哪個動作清掉了 CDO 資料）沒有查到，DLL 裡也掃不到直接清空的地方。只在 9211 送的其他帳號資料也可能有同樣問題，要列清單檢查。
- 下一步：在視窗裡換一張圖，確認房主和加入者都會切換。
- ✅ [LOG][OBS] 換圖也成功：房主在視窗裡選圖，客戶端送的是同一個 `Room_Map_Change_One_CQ 0x00220221`（ms 1410404 起，map 0x232c→0x232f→0x2332→0x2334→0x232b→0x232a），ROOM-OPT-BC 會把 `0x00220223` 轉送給加入者 conn8。[OBS] marker ms 1433212「筆電那邊有跟著換」。（未經跨公司審查）H7 核心症狀解除；「房間設定變更」視窗（ZPopup_RoomSet，需要 MaxUser=16）另外追蹤。

## ROOMSET-MAXUSER 實作（中階，🟡，未經跨公司審查）

狀態：🟡 待審。新開關 `PVE_MAXUSER_WIRE_MODE`（`dispatch/room/room-state.sender.js`）預設 `disabled`，行為完全不變；未實機測試。

- **`MaxUser` 比對值沒有額外編碼**：重讀 `ZPopup_RoomSet.SetMaxUserInfo(MaxUser)`（`:1068-1104`）確認它直接拿參數 `MaxUser` 逐筆比對 `co_PveUserCount_Data[n].nValue`（`:1094`），沒有乘除或位移；呼叫端 `SetMaxUserInfo( MyRoomInfo.MaxUser )`（`:363`）也是原始值直傳，跟 `Update_MapList()` 用來篩地圖的 `nUserMax`（`:551-556`）走同一份 `co_PveUserCount_Data`。所以「哪個 MaxUser 值會選到 16 那筆」這題等於「`co_PveUserCount_Data` 裡有沒有一筆 `nValue==16`」——這件事**沒有辦法從反編譯原始碼直接確認**：`docs/research/2026-09-18-room-setting/notes.md`（Q2、Q3、Q4）已經記錄整批反編譯的 `ZGameMainMenu` 檔案系統性缺 `defaultproperties` 區塊，`co_UserCount_Data`／`co_PveUserCount_Data`／Cache 的 `UserMin`／`UserMax` 都只有讀取沒有賦值可查，Q4 當時標 ⬜ 未完成。這次沒有找到 Cache.Bin 的 `MapInfoRecord` 解析工具或 `.u`／localization 檔可以另外反查，這個缺口還在。
- **但有兩條獨立佐證支持「16」這個猜測**：(a) `ZPanel_RoomInfo.uc:454-460` 的 `co_Limit`（房內人數上限下拉）用**同一種** `m_LimitPveTextList[n].nValue >= UserMin && <= UserMax` 篩選邏輯，證實 PvE 清單的 `nValue` 就是候選人數，若地圖的 `UserMin==UserMax`，只有 `nValue` 剛好等於那個值的項目會留下——跟 RoomSet 那條篩選鏈同構，互相印證「入口需要精確匹配」這件事，但一樣沒給出實際數值。(b) `ZPage_Room.uc:768`（`m_MaxUser = MyRoomInfo.MaxUser / 2`）是跟 `co_PveUserCount_Data` 完全獨立的另一條讀取路徑，若 wire 值是 16，`16/2=8` 對得上已知的原版 8 格截圖；這條不依賴 `co_PveUserCount_Data` 內容，是目前唯一能獨立驗證「16」不會破壞既有已知行為的證據。
- 結論：**沒有把「16 能讓清單非空」标 ✅ 的能力**，這仍是 🟡 猜測（任務給的 evidence 本身也標 🟡）。開關預設關閉，等操作者實測。
- 改動（唯一變數：`Room_Boundary_SN 0x00220213` body+1，僅限 PvE/戰役房）：
  - `dispatch/room/room-state.sender.js`：新增 `PVE_MAXUSER_WIRE_MODE`（`let` + `isPveMaxUserWireEnabled()` + `_setPveMaxUserWireModeForTests()`，同 `room-map.sender.js` 的 `mapAllSingleEntryMode` 寫法）與 `resolveBoundaryMaxUser(maxPlayers, isTrueCampaign)`。`sendRoomStatePackets()` 的 destructure 新增 `isTrueCampaign`（`ctx` 兩個呼叫端 `room.dispatch.js:1587`、`gate.game.dispatch.js:964` 本來就有填這欄位，只是原本沒被這個 sender 讀）。啟用且 `isTrueCampaign` 為真時，Boundary body+1 送 16，否則維持 `maxPlayers`。**只改這一個欄位**：`Room_Default_SN` body+7（加入人數上限，觸發自 `gate.game.dispatch.js:1163-1165` 的 `isCampaignLike ? 8 : ...`）、`Room_List_SN`、`rooms.js` 的 `room.maxPlayers`、`Game_Info_SN` 全部沒動，加入容量仍是 8。
  - 註解寫明觸發時機（房間 create/enter/resend 共用的同一個 room-state 送出點）與依據（`ZPopup_RoomSet.uc:575` 的篩選式、Cache 假設、`ZPage_Room.uc:768` 的獨立佐證）。
- 驗證：`node test/replay-golden.js`（4 個 golden 全過，含 `pve-full-match` 8383 packets，逐位元組同前，開關預設關閉）；新增 `node test/roomset-maxuser.js`（3 案例 PASS：disabled 不變 Boundary=8／Default+7=8；enabled+PvE 房 Boundary=`01 10`、Default+7 仍是 8；enabled 但非 PvE 房不受影響）；`test/*.js` 全部跑過（`extract-golden.js` 是 CLI 工具非測試，無參數照樣 exit 1，未改動樹上也一樣）。

### 唯讀檢查：對話框按確認後會送什麼

- `Room_Option_Change_CQ 0x00220215`（`tools/disasm.py at 0x107eeb80`）：body 固定 0x13（19 bytes）。只有 body+1（`al`，來自呼叫端 esp+8）＝IsBalance、body+2（`cl`，來自 esp+0xc）＝IsIntrude 兩個 byte 被寫，其餘清零。**伺服器已有處理**：`gate.game.dispatch.js:2220-2230`，但目前完全沒有讀 body 內容——直接回 `Option_Change_SA 0x220216`（status=0,result=0）然後對**自己**呼叫 `resendRoomState()`，沒有解析 IsBalance/IsIntrude、沒有寫回房間的 `optionMask`、也沒有廣播給其他房間成員。要讓設定真的套用並同步給其他人，至少要：(1) 解析 body+1/+2，(2) 把結果寫進共用 `Room` 物件（目前 `optionMask` 來源是 `client.createWord2_`，是建房時的一次性快照，不是可變狀態），(3) 廣播給其他成員（目前只有 `resendRoomState(client, ...)` 送給自己）。這些都沒有做，本次任務範圍是唯讀，未實作。
- `Room_Map_Change_All_CQ 0x00220224`（`tools/disasm.py at 0x107eed10`）：body 固定 0x48（72 bytes）。body+0＝一個 flag byte（呼叫端 `Room_Map_Change_All(flag)` 的參數，UC 對照是 `1`）、body+1＝實際寫入的筆數（迴圈上限 6，對得上 `MAX_MAP_COUNT=6`），body+2 起每筆 9 bytes（最多 6 筆，來源是 UC 本地 20-byte 的 `m_RotateMapInfo` 結構逐欄搬過來，跟 Q3 舊筆記描述的 `Room_Map_Change_All_Data(n, MapIndex, PlayTime, PlayKill, PlayCapture, PlayRound)` 對得上，但沒有進一步逐欄確認）。**伺服器完全沒有處理這個 opcode**（`grep -rn "0x00220224" dispatch/` 零筆），會落到 `gate.game.dispatch.js` 末端的未知封包 fallback（hex dump，沒有靜默吞掉）。要讓「房間設定變更」視窗的地圖清單／循環設定真的套用，需要新增這個 case：解析最多 6 筆記錄、寫回房間的地圖/循環設定、回應對應的 SA、並透過既有的 `sendRoomMapPackets()`／`resendRoomState()` 廣播給其他成員。本次任務範圍是唯讀，未實作。
- worktree：`~/mro-wt/roomset`，分支 `flash-wip-roomset`，未合併、未重啟伺服器。

## ROOMSET-MAXUSER 實測（test-server@7381d27，PVE_MAXUSER_WIRE_MODE 開）

- ✅ [SHOT] `shots/roomset-stuck.png`：「房間設定變更」視窗的地圖清單列出動力奪取戰／援救基地戰／防衛作戰各 N/H/E，房間左側第二排也是開放格。PvE MaxUser=16 讓 ZPopup_RoomSet 的地圖篩選通過。（未經跨公司審查）
- ❌ 按「確認」後卡在「載入中」：[LOG] 客戶端先送 `Name_Change_CQ 0x00220218`（25 bytes，"123"），伺服器沒有 handler、走 fallback 也沒回應，客戶端一直在等 `Name_Change_SA 0x00220219`。→ 已經併進 ROOMNAME-BIG5 任務一起實作。後面應該還會有 `Room_Option_Change_CQ 0x00220215`、`Room_Map_Change_All_CQ 0x00220224`，要依序處理。
