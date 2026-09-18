# 房間設定變更對話框調查（中階子 agent 原始筆記，未審查，🟡）

範圍：`AGENTS.md` 契約任務，唯讀。來源：
- ~/mro-decrypted/src/ZGameMainMenu/ZPopup_RoomSet.uc（房間設定變更對話框本體）
- ~/mro-decrypted/src/ZGameMainMenu/ZPopup_MapSelect.uc（另一個彈窗，不是同一個類別）
- ~/mro-decrypted/src/ZGameMainMenu/ZPanel_RoomInfo.uc（主畫面中間地圖清單/左右箭頭）
- ~/mro-decrypted/src/ZGameMainMenu/ZPanel_PVE.uc（戰役難度按鈕）
- ~/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc（native 函式宣告）
- ZNetwork.dll（disasm.py 反查），路徑 /mnt/c/Games/MetalRage Online/data/System/ZNetwork.dll

## Q1. 對話框類別與資料來源
`ZPopup_RoomSet.uc`（class 宣告於檔案第 5 行）。截圖裡「地圖設定」左側 `b_MapSet[0..8]` 是類別鈕
（ZPopup_RoomSet.uc:147-155），中間 `lb_MapList` 是實際地圖清單（listbox，ZPopup_RoomSet.uc:53,193-204），
右側 `lb_SelMapList` 是已選/循環地圖清單（ZPopup_RoomSet.uc:54,206-218）。
`b_MapSet[1]` 與 `b_MapSet[8]`（캠페인모드=戰役模式）共用同一個畫面位置 101,157
（ZPopup_RoomSet.uc:148-149）——操作者截圖只看到「全體地圖／作戰模式」兩列，代表這個房間是
`m_RoomType == PVE_GAME`（戰役房），此時只顯示 `b_MapSet[0]`（全體）與 `b_MapSet[8]`（戰役模式），
1-7 其餘類別被戰役分支跳過（ZPopup_RoomSet.uc:533-547）。

**資料來源全部是 Cache.Bin，不是伺服器封包**：`lb_MapList` 由
`class'CacheManager'.static.GetSortMapInfoList(MapInfoList)`（ZPopup_RoomSet.uc:456）灌入，
`lb_SelMapList`／已選清單由 `ZNetwork_DJ.Room_Info_Get()`（native，客戶端本地房間結構的
`MapInfo[1..5]` 循環地圖欄位）驅動（ZPopup_RoomSet.uc:397-446, UpdateCurrentMap()）。
沒有任何一行讀取 `Map_Change_All_SN`(0x00220226) 或其他封包資料。

## Q2. 為什麼清單是空的
### 左側 lb_MapList 填充鏈（Update_MapList()，ZPopup_RoomSet.uc:448-620+）
1. 從 CacheManager.GetSortMapInfoList() 取全部地圖記錄。
2. MapIndex < 1000 → 跳過。
3. `ZNetwork_DJ.Account_MapList_Check(MapIndex) == false` → 跳過（native，帳號等級/解鎖檢查，
   看不到內部邏輯，需要 DLL 進一步確認，這次未查）。
4. **`MapInfoList[n].UserMin <= nUserMax && nUserMax <= MapInfoList[n].UserMax`**（第 575 行）——
   `nUserMax` 來自 `co_PveUserCount_Data[n].nValue`（PVE 房）或 `co_UserCount_Data[n].nValue`
   （一般/戰隊房），透過比對目前 combobox 顯示文字取得（第 549-556 行 / 495-502 行）。
   若 combobox 文字對不上任何 `co_*_Data` 項目，`nUserMax` 停留在區域變數預設值 0，
   則此條件對大多數 Cache 記錄（UserMin 通常 >=2）會失敗，篩掉全部地圖。
5. 依 `m_RoomType` 再篩 PlayPve/PlayClan 旗標（577-590 行）。

**關鍵缺口，未能從反編譯原始碼確認**：`co_UserCount_Data` 與 `co_PveUserCount_Data`
（`array<ComboData_YC>`，第 41-42 行）在整個 `ZPopup_RoomSet.uc` 裡**沒有任何一行對它們賦值**
（沒有 `.Add`、沒有逐項指定 `[n].szString=`），只有讀取。正常 UnrealScript 會在
`defaultproperties {}` 區塊裡用陣列常數初始化這種欄位，但**這個反編譯出來的整個目錄（含
ZPopup_CreateRoom.uc、ZPage_Room.uc、ZPanel_RoomInfo.uc 等）完全沒有任何一份 `.uc` 檔含
`defaultproperties` 區塊**——這看起來是反編譯工具的系統性缺陷（見 grep 結果，三個檔案都是 0
match），所以**無法從這批原始碼判斷 `co_*_Data` 在執行期到底是空還是有值**。
如果它是空的，`nUserMax` 恆為 0，左側清單恆為空——這與操作者觀察到的現象完全吻合，
但目前只能標 🟡，不能排除是反編譯遺漏造成的假象。**建議下一步：對 ZNetwork.dll 或
`ZGameMainMenu.dll`（若 UI 類在另一個模組）反查 `co_PveUserCount_Data` 對應的
UProperty 預設陣列資料，或直接觀察 log／截圖確認 co_PveUserCount 下拉選單裡實際顯示的文字。**

### 右側 lb_SelMapList（已選/循環清單）
`UpdateCurrentMap()`（397-446 行）：若 `NetRoomInfo.MapInfo[1].Index == 0`（代表房間目前沒有登錄
第二張循環地圖）就直接 `return`，清單維持空白（第 407-408 行）。**這是設計上的正常空清單**——
新建房間預設只有單一地圖（`MapInfo[0]`），右側清單本來就該是空的，要按「登錄▶」才會加進去。
不是 bug。

### 與既有筆記 `2026-09-16-11` 的關係
該筆記提到的 `ZPopup_MapSelect.m_MapInfoList`（0/0）**是另一個 class**（`ZPopup_MapSelect.uc:4`,
`m_MapInfoList` 宣告於第 28 行），跟這次截圖的 `ZPopup_RoomSet`（房間設定變更對話框）**不是同一個彈窗**、
不是同一個變數。`ZPopup_MapSelect` 的清單一樣是 `CacheManager.GetSortMapInfoList()` 灌入
（ZPopup_MapSelect.uc:110），也讀了 `Room_Info_Get()`（第 98 行），跟舊筆記提到的
「`Event_Call(NETWORK_ROOM_INFO)` 在 native 寫入 `FROOM_INFO` 之前觸發」時序 bug
（docs/journal/2026-09-16-07…md）可能有關，但這次沒有重新驗證，只確認「不是同一個 class」。

## Q3. 按確認後送什麼 CQ
`ZPopup_RoomSet` 的 `ChangeOption()` → `ChangeMap()`（1359-1445 行左右）：
- **關鍵短路**：`ChangeMap()` 開頭 `if( lb_SelMapList.List.ItemCount == 0 && ListMapIndex.Length == 0 )`
  → 直接呼叫 `RecvMapChange("")` 並 `return`，**完全不送任何封包**（第 1391-1394 行附近）。
  `ListMapIndex` 是跟 `lb_MapList` 同步填的陣列（Q2 的左側清單），若左側清單因為 Q2 的 bug 是空的，
  這個 guard 一定成立——**這正是操作者實測「換地圖沒有送出任何封包」的直接原因**，跟伺服器端無關，
  是客戶端本地判斷就放棄送出。
- 若清單不空且有變化：
  - 單一地圖：`ZNetwork_DJ.Room_Map_Change_All_Data(0, MapIndex, PlayTime, PlayKill, PlayCapture, PlayRound)`
    接著 `Room_Map_Change_All(1)`（第 1439-1440 行）。
  - 多筆循環地圖（`lb_SelMapList.List.ItemCount > 1`）：對每筆呼叫 `Room_Map_Change_All_Data(n, ...)`
    再呼叫 `Room_Map_Change_All(RotateCount)`（第 1403-1412 行）。
  - 隊伍平衡/戰鬥中參加變更會先送 `Room_Option_Change(IsBalance, IsIntrude)`（第 1367/1373 行）。

**opcode 確認（`tools/disasm.py at`，已反查組語，非 Ghidra 命名猜測）**：
- `Room_Option_Change` → CQ **`0x00220215`**，body 長度常數 `0x13`（19）。
  反查位址：`Option_Change_CQ@ZDispatchRoom` 導出於 `0x10708bac`（thunk）→ 實作
  `0x107eeb80`，組語 `mov dword ptr [0x10914e4c], 0x220215` / `mov word ptr [...], 0x13`。
  **伺服器目前有處理**：`Metal Rage Online Server/dispatch/gate.game.dispatch.js:920`
  （`case 0x00220215:` → 回 `0x00220216` Option_Change_SA）。
- `Room_Map_Change_All` → CQ **`0x00220224`**，body 長度常數 `0x48`（72）。
  反查位址：`Map_Change_All_CQ@ZDispatchRoom` 導出於 `0x10707f63`（thunk）→ 實作
  `0x107eed10`，組語 `mov dword ptr [0x109157ec], 0x220224` / `mov word ptr [...], 0x48`。
  **伺服器目前完全沒有處理這個 opcode**（`grep -rn "220224" dispatch/` 零結果）——沒有 case、
  沒有 fallback log 特別標註，會走到 dispatch 檔案末端的通用 fallback（未逐一確認每個
  dispatch 檔案的預設分支，但確定沒有專屬 case）。
- （附帶確認，非本題重點）`Room_Map_Change_One` → CQ `0x00220221`，伺服器已有處理
  （`dispatch/gate.game.dispatch.js:842`），且有專門的 Static-analysis 註解說明 SA 走 0x0A body
  而非泛用 6-byte OK。

## Q4. 地圖預覽左右箭頭
不在 `ZPopup_RoomSet`，而是主畫面 `ZPanel_RoomInfo.uc` 的 `b_Left`/`b_Right`
（宣告於第 56 行，註解「맵리스트 좌,우 버튼」=地圖清單左右鈕）。
點擊進 `OnMapButtonClick()`（第 1068-1098 行）：
```
if( co_Map.List.ItemCount <= 1 )
    return false;
```
**只要 `co_Map`（主畫面地圖下拉選單，跟 `ZPopup_RoomSet.lb_MapList` 是完全不同的變數/清單）
的項目數 ≤1，箭頭點了直接 return false，什麼都不做——連 UI 都不會動，更不會送封包。**
這與操作者觀察「按了沒有任何反應」完全吻合。

`co_Map` 的填充在 `InitRoomInfo()`（ZPanel_RoomInfo.uc:307-348），純粹讀
`CacheManager.GetSortMapInfoList()`，依 `RoomInfo.RoomType` 篩 `PlayNomal/PlayClan/PlayPve`
旗標（無 UserMax 篩選，跟 Q2 的 `UserMin<=nUserMax<=UserMax` 篩選鏈**不是同一條**）。
**矛盾點待查**：操作者觀察「主畫面中間地圖清單有資料」但箭頭沒反應——如果 `co_Map` 走的是
`InitRoomInfo()` 這條純 Cache 路徑，理論上只要 Cache 裡有 ≥2 張戰役地圖、`Account_MapList_Check`
沒擋掉，`co_Map.List.ItemCount` 就會 >1，箭頭應該有反應。這代表：
(a) 操作者看到的「有資料的清單」其實顯示在別的元件（例如 `co_Map` 本身當作 combobox 顯示，
但「潛入作戰／動力奪取戰×2／援救基地戰×3」有可能是另一個由 `Map_Change_All_SN` 驅動的
清單，尚未在這次調查裡定位到確切變數），或
(b) `InitRoomInfo()` 的呼叫時機在 `Map_Change_All_SN` 送達之前，跟 `co_Map` 實際 Runtime 內容
不同步，或
(c) `Account_MapList_Check` 在戰役模式下把大多數地圖擋掉，只剩 1 張可選，`ItemCount<=1`。
**這題沒有查到確切結論，標記為待查，建議主力下一步用截圖 + log 對照 `co_Map` 實際顯示文字
與 `Map_Change_All_SN` 送出的 count/selectedIdx。**

## Q5. 戰役房地圖：建房決定 or 房內可改
兩者皆可，走不同路：
- **建房時**：`ZPopup_CreateRoom.uc` negotiate 初始地圖（這次沒有細看該檔案的地圖選擇邏輯，
  只確認它不含 `co_UserCount_Data`／`ComboData_YC` 相關字串，即左側篩選鏈是 RoomSet 專屬的）。
- **房內可改**（皆註解「방장만 가능」=限房主）：
  1. `ZPanel_PVE` 難度鈕（Easy/Normal/Hard, `b_Easy/b_Normal/b_Hard`，第 183-212 行）→
     `Room_Map_Change_One`（CQ 0x00220221，已確認伺服器有處理）——這是戰役同一任務切換難度
     （MapIndex 9001/9002/9003 一組，ZPanel_PVE.uc:328-329 `(MapIndex-9001)/3` 分組邏輯，來自
     `docs/research/2026-09-18-room-ui/notes.md`）。
  2. `ZPanel_RoomInfo` 左右箭頭 → `ChangeRoomInfo()` → 條件成立時一樣呼叫
     `Room_Map_Change_One`（第 1054 行）。
  3. `ZPopup_RoomSet`「房間設定變更」對話框 → `Room_Map_Change_All`/`_Data`
     （CQ 0x00220224，伺服器未處理，見 Q3）。

## 待審清單（給主力）
- 🟡 `co_UserCount_Data`/`co_PveUserCount_Data` 是否真的空（左側清單 UserMax 篩選失敗的
  root cause 假說），因反編譯全域缺 `defaultproperties`，無法從原始碼確認，需要別的手段
  （DLL 靜態資料段、或操作者截圖確認 combobox 顯示文字）。
- 🟡 `co_Map`（主畫面）為何箭頭無反應但清單看似有資料——沒有查到「潛入作戰／動力奪取戰×2」
  這份清單具體對應哪個變數，需要下一步確認。
- ⬜ `Account_MapList_Check` native 函式內部邏輯本次未查。
- ⬜ `ZPopup_CreateRoom.uc` 建房時的地圖選擇邏輯本次未查（只排除了它含 co_*_Data）。

---

# 追加調查：人數陣列選擇與 SN_ROOM_DEFAULT 的 cacheIndex/MapIndex 混淆（🟡 待審）

來源新增：
- ZNetwork.dll `Room_Default_SN@ZDispatchRoom`（thunk `0x10706d7f` → 實作 `0x107ea3e0`），`tools/disasm.py at 0x107ea3e0 200` 反查。
- Metal Rage Online Server/dispatch/room/room-state.sender.js:28-69（SN_ROOM_DEFAULT body 建構）
- Metal Rage Online Server/dispatch/room.dispatch.js:113-148（CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID 表與其註解）

## Q1/Q2：哪個判斷決定用哪個人數陣列，值從哪來
兩個**不同**的判斷點：
1. `SetMaxUserInfo()`（ZPopup_RoomSet.uc:1073）用 `m_RoomType`（NORMAL/CLAN→`co_UserCount_Data`；
   否則→`co_PveUserCount_Data`）。`m_RoomType` 來自 switch(MyRoomInfo.RoomType)（347-361行）。
   **`MyRoomInfo.RoomType` 已用 disasm 確認**是 `SN_ROOM_DEFAULT(0x00220203)` body+0x04 的原始位元組
   經過 native 端一個 remap 表（Room_Default_SN 實作 `0x107ea4b5`-`0x107ea4ea`）：
   `raw1→internal2`、`raw2→internal1`、`raw3→internal3`、`raw4→internal4`、其餘→`internal0`。
   目前伺服器送 `type=1`（room-state.sender.js:34），對照 UnrealScript enum
   （NORMAL_GAME=0,CLAN_GAME=1,PVE_GAME=2）→ **internal=2=PVE_GAME**，`SetMaxUserInfo()` 理論上會選
   `co_PveUserCount_Data`（跟操作者截圖顯示 2 列「全體地圖/作戰模式」一致，即 PVE 分支）。
2. **但 combobox 的顯示/隱藏是另一組判斷**：`SetButtonEnable()`（848-877行）先看
   `g_SelectMapInfo.MapType==8||9`（855行）才會顯示 `co_PveUserCount`／隱藏 `co_UserCount`；
   一進對話框預設值是 853-854 行 `co_PveUserCount.HideAll(); co_UserCount.EnableMe();`——
   **PVE 分支要靠 g_SelectMapInfo.MapType==9 才會覆蓋這個預設值**。
   `g_SelectMapInfo` 只有在 `InternalOnOpen()`（294-318行）找到 Cache 裡
   `MapIndex == MyRoomInfo.MapInfo[0].Index` 才會設定，否則維持全零（`MapType==0`）。

## 關鍵發現：MapInfo[0].Index 被寫入的其實是 Cache 表列索引，不是地圖 MapIndex
用 disasm 追蹤 `Room_Default_SN` 實作（0x107ea601-0x107ea653）：body 裡從 `entryOffset=0x20` 起、
每筆 9 bytes 的清單（room-state.sender.js:52-62 寫入的 `roomDefaultEntryCount` 筆記錄）**直接複製進
`RoomInfo+0x30`**——跟舊筆記（docs/journal/2026-09-16-07…）分析 `Map_Change_All_SN` 寫入的**是同一個
偏移** `pRoom+0x30`。也就是說 `MyRoomInfo.MapInfo[0].Index` 讀到的值＝body+0x20 那筆記錄的
`cacheIndex` 欄位（entryOffset+0x00），而伺服器目前寫進這個欄位的是
`primaryBodyCacheIndex = CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId] || ROOM_DEFAULT_ENTRY_HINTS[0] || 8`
（room.dispatch.js:1398）。`CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID`（122-148行）的註解明講這是
「**cache-entry indexes**」（Cache.Bin 表格列索引，例如 mapId=1→8、代表 Map_C01 那一列），
**不是**地圖真正的 `MapIndex`（如 9001）。房間預設 `mapId=1` 時，`primaryBodyCacheIndex=8`。

`ZPopup_RoomSet.InternalOnOpen()` 的比對邏輯（296-317行）是拿 Cache 表裡**真正的
`MapIndex`**（全部 ≥1000，296行 `MapIndex<1000 continue`）去跟 `MyRoomInfo.MapInfo[0].Index`
（現在＝8）比對——**8 < 1000，永遠不可能命中**。所以 `g_SelectMapInfo` 恆為零值，
`MapType` 恆為 0，`SetButtonEnable()` 的 855 行分支永遠不會走到，`co_UserCount`（PvP陣列/「N vs N」
格式）就一直留在畫面上——**這應該就是操作者看到「4 VS 4」而不是戰役人數格式的直接成因**，
标🟡（disasm 確認了 MapInfo[0].Index 的寫入路徑與比對邏輯，但「co_UserCount_Data 裡確實有
4vs4這種字串」這件事沒有另外反查字串常數，只是合理推論）。

**注意**：`SN_ROOM_DEFAULT` 另外還有一個**獨立**的 `mapIndex` 欄位在 body+0x05
（room-state.sender.js:35，值是真正的 `MAP_ID_DEFAULT_PVE=9001`），但這個欄位跟
`MapInfo[0].Index`（body+0x20 那組表）**是兩個不同的東西**，disasm 沒看到 body+0x05 這個值
被複製到 `RoomInfo+0x30`（MapInfo 陣列）——它去了 struct 的別處（本次沒有追完整個函式，
`esi+4`／`esi+8`／`esi+0xc0`／`esi+0xc4` 等其他欄位待查）。

## Q3：co_UserCount 初始選中項與「4 VS 4」
`SetMaxUserInfo(MyRoomInfo.MaxUser)`（1068-1104行）用 `MaxUser` 去比對 `co_UserCount_Data[n].nValue`
找對應字串。伺服器送 `max=8`（coordinator提供）。若 `co_UserCount_Data` 是 PvP 房間常見的
「2 VS 2／4 VS 4／6 VS 6／8 VS 8」這種陣列，`nValue==8` 極可能對應到字串「4 VS 4」（4+4=8）——
這跟操作者截圖直接吻合，但**陣列內容本身（字串／數值對照表）沒有查到，因為整批反編譯缺
`defaultproperties`（已在前次筆記說明），只能標🟡待驗證**。

## Q4：Cache 裡 9001-9012 的 UserMin/UserMax
**沒有查到**——沒有現成的 Cache.Bin MapInfoRecord 解析工具（`tools/` 底下沒有 cache dump
腳本），這次沒有時間另外寫 Ghidra struct layout + Cache.Bin 二進位解析，標 ⬜ 未完成。
建議下一步：找既有 CacheManager.MapInfoRecord 的 Ghidra 結構（很可能在別的 research 檔案裡
已經有欄位偏移），或請主力／操作者用已知工具轉存 Cache.Bin 對應表。

## Q5：伺服器有沒有辦法讓清單非空
**有具體可查的線索，但沒有完整驗證**：目前最可疑的兩個獨立缺口——
(a) `primaryBodyCacheIndex` 該送 Cache 表「真正 MapIndex」（如 9001）而不是「Cache 表列索引」
    （如 8），如果 `SN_ROOM_DEFAULT` 的 entryOffset+0x00 也應該放 MapIndex（而不是內部索引），
    這是伺服器端欄位語意錯誤，改法：`primaryBodyCacheIndex` 換成 `MAP_ID_DEFAULT_PVE`(9001) 或
    `client.campaignMapCacheKey_`，需先用 disasm 確認 body+0x20 這個表在原生協定裡到底該放
    「Cache 表列索引」還是「MapIndex」（目前只確認它被複製進 `RoomInfo+0x30`，沒有確認
    UnrealScript 端期待的語意，因為同一個位置在 Map_Change_All_SN 舊分析裡被稱為「cacheIndex」——
    可能兩邊本來就該放列索引，而 `ZPopup_RoomSet.uc` 的比對邏輯本身就要求 MapIndex，
    這代表問題出在 Map_Change_All_SN／SN_ROOM_DEFAULT 這兩個封包對「同一個結構欄位」語意不一致，
    需要更多 disasm 才能下結論）。
(b) `co_UserCount_Data`/`co_PveUserCount_Data` 陣列內容本身無法從反編譯原始碼確認（Q3/前次筆記）。
**沒有足夠證據能斷定「改哪個欄位」就一定解決，這題保持 🟡，建議下一步用 disasm 追完
`Room_Default_SN` 剩餘欄位（esi+4/+8/+0xc0/+0xc4）確認 body+0x20 的表在協定裡真正代表什麼。**
