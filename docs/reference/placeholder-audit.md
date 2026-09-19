# dispatch 封包字面常數盤點（H5）

日期：2026-09-18
狀態：🟡 待審；本篇只盤點，沒有修改任何程式、資料庫、開關或封包值。

## 判定方法與範圍

盤點範圍是 `Metal Rage Online Server/dispatch/` 下 15 個 `*.js`，包括所有 `*.sender.js`、dispatch 內直接呼叫 `getMessageBuffer`／`getExactMessageBuffer` 並寫 body 的地方。機械搜尋共找到 566 行 `write*`／`Buffer.fill`；下表把同一個欄位在登入 fallback、重送與共用 helper 的重複寫入合併，但每個來源檔案與行號範圍都列出。

本篇的「候選常數」是直接寫入 body 的 literal、literal fallback、以及會影響 body 欄位的固定資料表值。opcode、body size、欄位 offset、迴圈步長與 enum 名稱本身不是欄位值，另在「未列入」說明；動態 DB／client 值只在它旁邊有 literal fallback 時列入。

- **(a)** 有 DLL、Cache、腳本、已核對日誌或協定文件依據，能說明該欄位目前應送這個值。
- **(b)** DLL 明確不讀、保留／padding／未使用欄位，送 0 有依據。
- **(c)** 語意、合法值或 default 尚未查過；即使目前看起來合理也列 (c)。(c) 的「依據」欄留空，缺的證據寫在影響與待補證據欄。

## (a) 有依據的固定值

| 位置（檔案:行號） | opcode／欄位 | 目前固定值 | 分類 | 依據 |
|---|---|---:|:---:|---|
| `community.dispatch.js:26-27,95-96,147-148,183-184,198-199`；`game.dispatch.js:43-44,50-51,64-65,73-74,103-104`；`gate.game.dispatch.js:141-142,150-151,736-737,951-952,968-969,997-998`；`gate.social.dispatch.js:65-66`；`lobby.dispatch.js:98-99,137-138,346-347,367-368,383-384`；`room.dispatch.js:306-307,589-590,647-648,687-688,770-771,788-789`；`gamelogin.dispatch.js:72-73,335-336,385-386,399-400,406-407`；`account.dispatch.js:161-162,196-197,348-349,449-450,681-682` | 多個 CQ→SA，FNETWORK_EVENT_INFO +0x00/+0x02 | `u16=0, u32=0` | (a) | `[PROTO] docs/reference/protocol.md:145-146` 定義 EventMessage/ErrorMessage 的 0 為 OK；`[DLL]` 各成功 handler 依同一 6-byte header 消費。 |
| `lobby.dispatch.js:137-138` | `0x00230122` Leave_SA | +0x00/+0x02 `0/0` | (a) | `[PROTO]` 標準成功回應；`[CODE]` 只有清理 session 另在成功回應後做。 |
| `lobby.dispatch.js:174-176,313-320` | `0x00230104` Respawn_SN +0x00/+0x02 | `0/0` | (a) | `[PROTO]` 標準成功回應；`[DLL]` `docs/research/2026-09-17-ledger-migration/opcode-inventory.md:164`。 |
| `lobby.dispatch.js:239-241` | `0x00230124` Death_SN | +0x00 `0`、+0x02 `0` | (a) | `[DLL]` `docs/journal/2026-09-17-16-death-sn-format-verification.md:7-14`：Status／Result 必須為 0。 |
| `lobby.dispatch.js:239-241` | `0x00230124` Death_SN | +0x06..09 `0` | (b) | `[DLL]` 同上：四 bytes 無讀取，明確是保留欄位。 |
| `gate.game.dispatch.js:937-938` | `0x00220222` Map_Change_One_SA | +0x00/+0x02 `0/0` | (a) | `[DLL]` `0x107eb56d-0x107eb578` 檢查 6-byte 成功標頭；`docs/journal/2026-09-18-10-map-change-one-sa.md`。 |
| `gate.game.dispatch.js:654-657` | `0x00220202` Room/Create_SA +0x02 | `0` | (a) | `[PROTO]` +0x02 是標準 ErrorMessage。 |
| `account.dispatch.js:310-312,440-442`；`gamelogin.dispatch.js:312-314,372-374`；`item-info.sender.js:36-38`；`room.dispatch.js:1197-1199,1247-1249` | `0x00210111` ItemInfo_SN | +0 `SuccessFlag=1`、+1 count 動態、+2 account key 動態 | (a) | `[DLL]` ItemInfo handler `0x107c4560` 在 `docs/journal/2026-09-17-03-iteminfo-accumulation.md:20-30` 以此 header 讀 count／記錄。 |
| `account.dispatch.js:597-599`; `community.dispatch.js:174-176`; `gamelogin.dispatch.js:249-251` | `0x00260101` LicenseInfo_SN 每筆 +0x04 | `0` | (b) | `[DLL]` license entry 是 `[u32 mech][u8 pad][u32 type]`；`SN_LICENSE_INFO` handler 不讀該 pad byte。 |
| `account.dispatch.js:654-665`; `gamelogin.dispatch.js:216-228`; `room.dispatch.js:978-989,1305-1316` | `0x00210113` WearInfo_SN | Cache.Bin body item index 表：`11100101→84`、`12100101→97`、`13100101→110`、`14200101→123`、`14300101→130`、`15200101→136`、`16200101→149`、`17100101→162`、`18100101→175` | (a) | `[CACHE]` sender 內明列的 Cache.Bin body mapping；`[DLL]` WearInfo 欄位順序與 item index／unique key 依 `docs/research/2026-09-17-ledger-migration/opcode-inventory.md:63` 核對。 |
| `room/room-game-user.sender.js:22-30,171-192` | `0x00222112` Game_User_SN | `CANONICAL_LOADOUTS` 的 body／weapon／assist／booster／skin IDs；缺 booster/right 時的 `0` | (a) | `[CACHE]` Table 4 DefaultSetList；sender 註解與 `docs/journal/2026-09-17-22-pve-mech-slot-selection.md:126-131`。0 是 Cache 預設表對應的合法空槽，不是任意 padding。 |
| `room/room-map.sender.js:141-159` | `0x0023013A` Campaign_SN | action header +0x00/+0x02 `0/0`、成功 action +0x0C `1`、隊伍／結果固定欄位的 `1/2` | (a) | `[DLL][SRC]` `docs/journal/2026-09-17-14-campaign-result.md:12,29`：Campaign action 1/2 與 EndGame 路徑已核對；其餘成功 header 依標準格式。 |
| `gate.game.dispatch.js:242-302` | `0x00222111` Game_Info_SN | `redTeamIndex=0`、`blueTeamIndex=1`、`body+0x0F=2`；`MAP_IDS_PVE=9001..9012` | (a) | `[DLL]` `Game_Info_SN` `0x107d4f50`、Game_User_Team_Get 對照；`docs/journal/2026-09-17-12-pve-round-zero.md`；`[CACHE]` 9001..9012 由 Cache.Bin 核對。 |
| `gate.game.dispatch.js:189-192` | `0x00420115` Ready_Host_SN port | `30907` | (a) | `[SETUP]` `docs/reference/setup.md` 的 game port。 |
| `gate.game.dispatch.js:189-192` | `0x00420115` Ready_Host_SN +0x02 | `0` | (b) | `[CODE]` body +0x02 是 URL 字串起點前的 NUL 分隔 byte。 |
| `room/room-user.sender.js:35-41,63-74` | `0x00220233`／`0x00220401` | user index、pilot、team、state 等皆為 ctx 動態值；固定 status `0`、count `1` | (a) | `[DLL]` `docs/research/2026-09-18-room-user/disasm.txt` 與 sender 的欄位註解；status/count 是 handler 建立 user record 的 header。 |

## (b) 已知為保留／未讀，送 0 正確

| 位置（檔案:行號） | opcode／欄位 | 目前固定值 | 分類 | 依據 |
|---|---|---:|:---:|---|
| `item-info.sender.js:44`；`room.dispatch.js:1206,1257` | `0x00210111` ItemInfo_SN 每筆 +0x0C | `u32=0` | (b) | `[DLL]` Item_Add 解析與 `docs/journal/2026-09-17-24-g6-unblock-shop-list.md:78` 將此列為 reserved u32；沒有讀取分支。 |
| `lobby.dispatch.js:241` | `0x00230124` Death_SN +0x06..09 | 4 bytes `0` | (b) | `[DLL]` `docs/journal/2026-09-17-16-death-sn-format-verification.md:14` 明列無讀取。 |
| `room/room-game-user.sender.js:186` | `0x00222112` Game_User_SN slot+0x08 | `u8=0` | (b) | `[DLL]` `0x107d8ae0` 的 slot parser 只讀 slot+0x00、+0x04、+0x09、+0x0D、+0x11、+0x15、+0x19、+0x1D、+0x21、+0x25；sender 註解也標為 unread。 |
| `room/room-game-user.sender.js:138` | `0x00222112` record+0x0C | `u32=0` | (b) | `[DLL]` 同一 `Game_User_SN` handler 的 record layout 沒有讀取 rec+0x0C；未把它誤解成 clan／slot 欄位。 |
| `docs/journal/2026-09-17-17-game-chat-broadcast-format.md:26,49` 所描述的 sender 需求 | `0x00360602` Clan chat +0x04..+0x1C | 25 bytes zero | (b) | `[DLL]` `0x107cfc48` 從 +0x1D 才讀文字；中間 25 bytes 是未讀保留區。現行 `gate.game.dispatch.js` 只 pass-through game chat，沒有另外組此封包。 |

## (c) 未查過語意的固定值（按影響面排序）

下表先列影響最高的 10 項；「待補證據」是後續應查的 DLL／腳本／session／schema，不是本次推論依據。

| 排名 | 位置（檔案:行號） | opcode／欄位 | 目前固定值 | 分類 | 可能影響／待補證據 |
|---:|---|---|---|:---:|---|
| 1 | `gate.game.dispatch.js:289-300` | `0x00222111` Game_Info_SN +0x13/+0x16/+0x18、+0x0A/+0x0C | time `10`、goal `0`、purpose unknown 欄 `0` | (c) | 直接影響 PvE 時間／目標與開局；需 `Game_Info_SN` handler 的 Cache mode 分支與實際腳本 GoalDefault 對照。 |
| 2 | `room/room-map.sender.js:64-68` | `0x00220223` Map_Change_One_SN | fallback `mapTime=0,mapRound=1,mapKill=0,mapGoal=0` | (c) | R6 已證明 0/1/0/0 會洗掉房間設定；需確認每個 Cache map 的 GoalDefault／MapTime／Round／Kill／Goal 來源。 |
| 3 | `room/room-map.sender.js:86-90` | `0x00220226` Map_Change_All_SN 每筆 +0x02/+0x05/+0x07 | `0/0/0` | (c) | 直接影響房間地圖列的時間、回合、擊殺、目標；需 `0x107ebab0` 全欄位語意與 client script 讀值，不能因目前畫面有地圖就視為 padding。 |
| 4 | `room/room-state.sender.js:55-60,63` | `0x00220203` Room_Default_SN +0x09、+0x0A..0x0E、+0x1B | `3`、`0,0,0,0,0` | (c) | 會影響房間模式、選項、狀態或未命名旗標；R4 只確認首筆 index，不能外推這些欄位。需 `0x107ea3e0` 全部讀取與腳本 struct 對照。 |
| 5 | `room/room-state.sender.js:77-80` | `0x00220203` entry +0x02/+0x04/+0x07 | `0/1/0` | (c) | 可能影響地圖 entry 的時間／回合／旗標／目標；R4 實測只否定首筆 map id 修正，未查這三欄。需 Cache entry table 與 `RoomInfo.MapInfo` 欄位對照。 |
| 6 | `room.dispatch.js:1164-1174` | `0x00240132`／`0x00240133` Package_Point/Coupon +0x00/+0x04/+0x08 | point `100000`、coupon `1000`、尾欄 `0` | (c) | 直接影響機庫金錢顯示與持久化；H2 已指出 G 幣重登回復，需 client handler 與 DB account 欄位／購買 log 對照。 |
| 7 | `room.dispatch.js:510-513,529-534` | `0x00240102` Open_SA +0x06/+0x0A | `0/0` | (c) | 機庫開啟時 point/cash 來源可能被清成固定值；需 `Open_SA` DLL 顯示欄位與後續 Package money 更新的時序。 |
| 8 | `room.dispatch.js:978-982,1305-1309`；`account.dispatch.js:656-658`；`gamelogin.dispatch.js:218-220` | `0x00210113` WearInfo_SN header | pilotSerial `0`、selectedMech `1`、部分 pilot index `0` | (c) | 可能影響重登裝備、目前機體與機庫／PvE 初始槽位；需 WearInfo handler 對 pilot indices／selected mech 的完整 DLL 讀取。 |
| 9 | `room.dispatch.js:343-363` | `0x00240241`／`0x00240242` ShopList/CashShop 每筆 +0x0C..+0x13 | disabled 路徑 +0x0C `0`；+0x10 `1`；+0x12/+0x13 `0`；community 舊路徑亦有同形欄位 | (c) | 會影響商品顯示、期限代表項、購買／貨幣／分類；G6 只確認 +0x0D 顯示旗標與代表項，需剩餘四 bytes 的 DLL／腳本 `ListLoad`／購買 handler。 |
| 10 | `room/room-game-user.sender.js:134-144,182-192` | `0x00222112` Game_User_SN rec+0x14/+0x18、socket defaults | clan/emblem `0`、未命名 socket 來源 | (c) | 可能影響隊伍、機體 socket、武器／加成初始化；需 `Game_User_Add`、`Game_Item_Add`、`Game_UserSocket_Set` 的完整參數語意與 Cache 對照。 |

### 其餘 (c) 候選完整清單

| 位置（檔案:行號） | opcode／欄位 | 目前固定值 | 分類 | 可能影響／待補證據 |
|---|---|---|:---:|---|
| `gate.dispatch.js:51` | `0x00220112` Gate Enter_SA +0x06 | `0xDEADBEEF` | (c) | 明顯是測試帳號 index；需 Gate Enter_SA handler 的 account index 寬度與登入鏈，不能保留測試 sentinel。 |
| `gate.dispatch.js:65-66` | `0x00220132` Gate Leave_SA +0x06/+0x0A | `0/0` | (c) | leave payload 未查；需 DLL handler 欄位讀取。 |
| `gate.game.dispatch.js:654-657` | `0x00220202` Room/Create_SA +0x0B | `0` | (c) | 可能是 entry-room index／flag 或其他 Create_SA 欄位；需 Create_SA DLL 讀取與實際 body 對照。 |
| `account.dispatch.js:234-241,364-371`；`gamelogin.dispatch.js:126-133,275-278,353-357` | `0x00210102` PlayInfo_SN | time `0/0`、pad `0`、count `1`、value1 `1`、value2 `1`、value3 `0`、value4 `0` | (c) | level／exp／mech／flag 會影響 lobby／房間初始資料；需 `PlayInfo_SN` 完整 DLL handler 與真實登入 frame。 |
| `account.dispatch.js:248,378`; `gamelogin.dispatch.js:284,361` | `0x00210103` RecordInfo_SN fallback level | `1` | (c) | DB 不可用時玩家等級顯示；需 fallback 是否應與 DefaultInfo 等級一致。 |
| `account.dispatch.js:263-267,393-397`; `gamelogin.dispatch.js:299-303` | `0x00210104` MechLevel_SN fallback | count `8`、每 mech level `1` | (c) | 影響可用機體等級／解鎖判定；需 account 等級腳本與 handler 對照，不能只因預設帳號有 8 台就確認。 |
| `account.dispatch.js:288,413` | `0x00210115` MapInfo_SN disabled fallback | map ids `0..5` | (c) | R9 已實測 real-id 9001..9012 仍不足，0..5 也已知不匹配 Cache；需完整 `g_SelectMapInfo` 篩選鏈，不應再猜 mapping。 |
| `account.dispatch.js:300-302,430-432`; `gamelogin.dispatch.js:249-251` | `0x00260101` LicenseInfo_SN fallback | expiry `0xFFFFFFFF`、type `1` | (c) | 會影響永久／期限授權；type mapping 有 handler 線索，但 expiry sentinel 的 Cache／時間語意尚未由 DLL 核對。 |
| `account.dispatch.js:656-658`; `gamelogin.dispatch.js:218-220` | `0x00210113` WearInfo_SN | success `1`、serial `0`、selected mech `1` | (c) | 同第 8 名，header 的 pilot index／selected mech 尚未完整驗證。 |
| `account.dispatch.js:711-715,730-732` | `0x00220101`／`0x00220102` Server_Add/Channel_Add | server type `3`、port `30907`、capacity `128`、flag `1`、channel capacity `1024`、status `0/1` | (c) | Gate UI 是否把 server／channel 視為可用；只確認 port，其他欄位缺 DLL／實際官方資料。 |
| `community.dispatch.js:228-238` | `0x00310201` legacy Hangar Shop item | +0x04 `1`、+0x05 `1`、pad +0x07 `0`、+0x10 `1`、+0x12/+0x13 `0` | (c) | 舊 Hangar shop 路徑與 `0x00240241` 不是同一 handler；需其 DLL `ShopList` record 完整欄位，不能套 G6 結論。 |
| `community.dispatch.js:261-262` | `0x00310202` cash shop header | +0/+4 `0` | (c) | cash shop header 的兩個 dword 語意未查；需 handler 讀取。 |
| `community.dispatch.js:267-269` | `0x00310213` cash shop data | +0/+1/+2 `0` | (c) | empty cash shop 的 flag/count/尾欄未查；需 client handler 與實際 cash catalog。 |
| `game.dispatch.js:43-44,50-51,64-65,73-74,103-104` | `0x00250203`、`0x00250103`、`0x00250201`、`0x00250301` 及 fallback | standard `0/0` | (c) | 雖符合通用 ACK，這些 0x25 handler 的場景／ready 狀態語意未各自由 DLL 核對；若不承認標準 header，應列為待審。 |
| `gamelogin.dispatch.js:140,275-278,353-357` | `0x00210103`／`0x00210102` bulk zero fields | `0` | (c) | bulk zero-fill 可能包含未讀欄，也可能包含等級／統計欄；需逐欄 handler。 |
| `gamelogin.dispatch.js:216-220,298-303` | login fallback WearInfo／MechLevel | `1`、`8`、每台 level `1`、pilot indices `0` | (c) | fallback only，但登入失敗時仍會決定機庫內容；需 fallback path 的 client acceptance log。 |
| `lobby.dispatch.js:154-155` | `0x00230152` BeginRound_SN | +0/+2 `0/0` | (c) | round-start SA body 形式像標準 ACK，但 BeginRound handler 是否把欄位當結果碼需 DLL 位址。 |
| `lobby.dispatch.js:267-270` | `0x00230124` Death_SN score block | EXP/POINT `kills*10` | (c) | `docs/journal/2026-09-17-16-death-sn-format-verification.md` 只確認欄位位置，10 per kill 是伺服器 placeholder；需官方計分規則／session 對照。 |
| `lobby.dispatch.js:302-303` | `0x00230132` Room Create_SA | standard `0/0` | (a) | `[PROTO]` 6-byte success header；同檔非標準欄位另列 c。 |
| `lobby.dispatch.js:314-316` | `0x00230103` empty Room_List_SN | flag/count/size word `0/0/0` | (c) | room list 的 flag、count、續包欄位未由 DLL 完整核對；需 client Room_List parser。 |
| `lobby.dispatch.js:346-347,367-368,383-384` | lobby fallback SA | `0/0` | (a) | `[PROTO]` standard success header。 |
| `room/room-map.sender.js:63` | `0x00220223` Map_Change_One_SN +0x00 | `b0=0` | (c) | MapNumber 目前常為 0，但需確認多地圖 room slot 是否可能非 0；`0x107eb5e0` 只確認它是陣列索引。 |
| `room/room-map.sender.js:79,82,87-90` | `0x00220226` Map_Change_All_SN | flag `0`、optional header `0`、entry time/round/kill/goal `0` | (c) | 已在前 10 展開；需要完整 record field semantics。 |
| `room/room-map.sender.js:141-159` | `0x0023013A` Campaign_SN 未由 DB／戰鬥結果填的欄位 | `0,1,1,0,0,2,0,1,0,0,0` | (c) | 結算頁分數／回合／目標可能被清零；目前只核對 action，需 `Campaign_SN` handler 全欄位。 |
| `room/room-state.sender.js:55-60` | `0x00220203` room flags | `3`、多個 `0` | (c) | 已在前 10 展開；只確認 body+0x05 mapIndex，不可把其餘欄位視為 padding。 |
| `room/room-state.sender.js:77-80,85` | `0x00220203` entry table | +0x02/+0x07 `0`、+0x04 `1`、尾 count | (c) | 已在前 10 展開；需 `Room_Default_SN` 全 entry parser。 |
| `room/room-state.sender.js:131-132` | `0x00220214` Room_State_SN | state `3`、flag `0` | (c) | 可能決定房間頁狀態／ready；需 `0x107ea...` handler 的欄位讀取。 |
| `room/room-user.sender.js:42` | `0x00220233` User_Default_SN +0x15 | rank/substate `0` | (c) | 可能影響名牌、房主／ready 顯示；需 User_Default handler 對 +0x13 的讀取。 |
| `room/room-user.sender.js:71-72` | `0x00220401` User_State_SN | status `0`、count `1` | (c) | header 形式未由 DLL 逐欄核對；需 User_State handler。 |
| `room/room-user.sender.js:92` | `0x00220319` User_Master_SN | state 由 dynamic `userStateRaw`，無固定欄位 | (c) | 若 state fallback 在 ctx 產生固定值，會影響房主 UI；需完整來源與 handler。 |
| `room/room-game-user.sender.js:125-144` | `0x00222112` record header／clan fields | header `0/1`、rec+0x0C/+0x14/+0x18 `0` | (c) | header count 已由 DLL 結構核對，但 0 是預設 user/clan 值，不等於保留欄位；需 Game_User_Add／Clan_Set 的完整語意。 |
| `room.dispatch.js:511-513` | `0x00240102` Open_SA | result/point/cash `0` | (c) | point/cash 已在前 10 展開；需 Open_SA handler。 |
| `room.dispatch.js:620-621` | `0x00240202` ready echo | slot `0`、ready `1` | (c) | 可能只適用 slot 0；需 Ready_SN body parser 與多玩家 room log。 |
| `room.dispatch.js:770-771,788-789` | `0x00240108` Slot_Change_SA fallback | `0/0` | (a) | success fallback header；payload 缺失時是否仍表示成功則需 handler，但標準欄位值有 protocol 依據。 |
| `room.dispatch.js:936-944` | `0x00240241`／`0x00240242` empty shop | success `1`、count `0`、third byte `0` | (c) | shop empty-list header 的三 bytes 未由 ShopList handler 完整核對；需 client parser。 |
| `room.dispatch.js:350-363` | `0x00240241`／`0x00240242` flags and trailing fields | +0x0C..+0x13 literal `0/1/0` 等 | (c) | 已在前 10 展開；G6 只確認顯示 flag +0x0D，不可外推其它 bytes。 |
| `room.dispatch.js:980-982,1307-1309` | `0x00210113` WearInfo_SN | success `1`、count dynamic、pilot indices `0`、selected mech `1` | (c) | 已在前 10 展開；需完整 WearInfo parser。 |
| `room.dispatch.js:1134-1142` | `0x00240131` Packege_Item_SN | count dynamic；`item.id || 0` fallback、`itemIndex` fallback `0` | (c) | serial 0／item id 0 是否代表空槽或非法品未查；需 Packege_Item handler 與 Cache lookup。 |
| `room.dispatch.js:1164-1174` | `0x00240132`／`0x00240133` | point/coupon balances、tail 0 | (c) | 已在前 10 展開；需 currency handler／DB schema。 |
| `room.dispatch.js:1197-1212,1247-1263` | `0x00210111` ItemInfo_SN | reserved +0x0C 已是 (b)；expiration `0xFFFFFFFF` 兩欄 | (c) | 永久期限 sentinel 尚未由 Cache／ExpirationItem handler 核對；錯誤會影響期限物品。 |
| `room.dispatch.js:1305-1316` | `0x00210113` WearInfo_SN | header pilot `0`、selected mech `1` | (c) | 已在前 10 展開。 |
| `account.dispatch.js:711-732` | `0x00220101`／`0x00220102` | server/channel list fixed fields | (c) | 已列完整候選；除 30907 外缺 server/channel DLL parser 與官方資料。 |
| `community.dispatch.js:228-238` | `0x00310201` | active/purchase/show `1`、pad/trailing `0` | (c) | legacy shop handler 未追完；不可套用 G6 的 0x240241 結論。 |
| `community.dispatch.js:133` | `0x00320105` Card_SA | 16-byte `respBody.fill(0)` | (c) | body 欄位尚未逐欄命名；需 Card_SA handler 的逐欄讀取，不能因目前回應未出錯就把整包視為保留區。 |

## 尚未能分類為固定欄位的值

以下是掃描到但沒有列成 placeholder row 的項目，避免把動態值誤判為 literal：`account.dispatch.js` 的 DB account／record／license／item 欄位、`room.dispatch.js` 的 catalog price／item id／purchase serial、`room/room-user.sender.js` 的 ctx user fields、`room/room-game-user.sender.js` 的 DB equipped loadout、`lobby.dispatch.js` 的 attacker/victim/death input，以及所有 count／body length／offset。它們仍可能有語意錯誤，但本 H5 要追的是寫死值；需要另案建立 dynamic-field audit。

同理，`0xFFFFFFFF`、`0xDEADBEEF`、`30907`、9001–9012 等資料表／sentinel literal 已在上表按「是否證明用途」分類，沒有因為它們是常見常數就自動歸 (a)。

## 結論與待審邊界

- 已有依據的標準成功 header、ItemInfo／Death／Game_User 的明確保留欄位、Cache map／loadout 值分別列為 (a) 或 (b)。
- 房間狀態、地圖設定、貨幣、商店尾欄、WearInfo header、Game_Info 的時間／目標，是目前最可能造成畫面或持久化錯誤的 (c)；沒有因現行測試能登入就升級成確定值。
- 本篇沒有提出程式修改或實驗，也沒有改任何 `dispatch/` 檔案。下一步若要處理 (c)，每次只能選一個欄位，先補 DLL／腳本／實際 frame 證據再改。

## 補充（2026-09-19，D2 PvP 分析）

- `gate.game.dispatch.js` 約 1254-1258 行：`campaignMapCacheKey_` 只接受 9001..9012。PvP 地圖 id（1011..1081）會被**默默換成 PvE 的預設地圖**，`room.mapId` 也會跟著變。這是 PvP 開戰的第二個阻擋點，見 `design/d2-pvp-tdm.md` §0。🟡
