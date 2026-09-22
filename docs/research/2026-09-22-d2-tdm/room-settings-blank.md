# PvP 房中央設定欄全空：五題調查（中階 explorer，唯讀，🟡 未經跨公司審查）

任務來源：主力交辦，查「TDM 房設定欄（選擇地圖/遊戲類型/人數/目標分數/遊戲時間/目標回合/隊伍平衡）為何幾乎全空」。
不標 ✅／❌，不提實作方案。封包偏移凡本檔引用者，均已用 `tools/disasm.py at` 本次重新核對（見各節標註），
未特別標「未重新核對」的既有引用一律沿用原始日誌的核對狀態。

---

## Q1. 哪個 S→C 封包填這塊設定欄？逐欄位對應

**這不是單一封包，是兩個封包共同餵一個客戶端原生陣列 `RoomInfo.MapInfo[]`**（最多 6 筆，24-byte
stride），UI 端讀取邏輯在 `~/mro-decrypted/src/ZGameMainMenu/ZPanel_RoomInfo.uc`
（`UpdateRoomInfo()` :561、`SetRoomInfo()` :361）：

- **`Room_Default_SN 0x00220203` body+0x20 起的 6 筆 9-byte entry**（我方送出：
  `dispatch/room/room-state.sender.js:204-214`）。**本次用 `tools/disasm.py at 0x107ea5e0 130` 重新核對**
  `ZDispatchRoom` 對應本體 `0x107ea601-0x107ea653` 的複製迴圈：entry+0x00(u16 Index)→`MapInfo[n]+0x00`；
  entry+0x02(u16，我方填 0)→`MapInfo[n]+0x0C`；entry+0x04(u8，我方填 1)→`MapInfo[n]+0x08`；
  entry+0x05(u16，我方填 `selectedMech+i`)→`MapInfo[n]+0x10`；entry+0x07(u16，我方填 0)→`MapInfo[n]+0x14`。
  **確認過，跟既有 ❌ 日誌 `docs/journal/2026-09-18-11-room-default-map-entry.md` 的偏移表完全一致。**
- **`Map_Change_One_SN 0x00220223`**（我方送出：`dispatch/room/room-map.sender.js:66-106`）。
  **本次用 `tools/disasm.py at 0x107eb730 90` 重新核對** `0x107eb771-0x107eb7a0`：
  body+0x00(b0 槽位)、body+0x01(w1/MapIndex)→`MapInfo[b0]+0x00`、body+0x03(w2/MapTime)→record+0x3c、
  body+0x05(b5/MapRound)→record+0x38、body+0x06(w6/MapKill)→record+0x40、body+0x08(w8/Goal)→record+0x44。
  **跟既有 ✅ 日誌 `docs/journal/2026-09-18-12-map-change-one-sn-settings.md` 的欄位表一致**（該篇 record+0x38/0x3c
  是「SA 交叉驗證」的另一種編號，與本次 disasm 直接對上，同一組值）。

**UI 端讀取（`ZPanel_RoomInfo.uc`，逐欄位對應到 `RoomInfo.MapInfo[]`）：**

| UI 欄位 | 來源 | 出處行 |
|---|---|---|
| 選擇地圖（co_Map，只有名稱） | 另一條獨立路徑（見 Q1 附註） | `:756-780` |
| 遊戲類型（co_Mode） | `Cache.MapList[n].MapType`，用 `RoomInfo.MapInfo[SelectedNumber].Index` 查表得到 | `:391`（`Mode = MapList[n].MapType`）、`:694-698`（`SetRoomInfo(MapIndex)` 填 `co_Mode`） |
| 人數（co_Limit） | `Limit` 初值 = `RoomInfo.MaxUser`（Room_Default_SN body+0x07），但下拉選項清單 `co_Limit_Data` **只在 `SetRoomInfo()` 查表成功時**被填，:714 才把 `Limit` 套進去 | `:604`、`:450-484`、`:711-716` |
| 目標分數（Capture，Goal） | `RoomInfo.MapInfo[SelectedNumber].Goal` 直接讀 | `:690` |
| 遊戲時間（co_Time） | `RoomInfo.MapInfo[SelectedNumber].Time` 直接讀；下拉清單 `co_Time_Data` 同樣只在 `SetRoomInfo()` 成功時被填 | `:688`、`:786-793` |
| 目標回合（co_Round） | `RoomInfo.MapInfo[SelectedNumber].Round` 直接讀；`co_Round_Data` 同上 | `:691`、`:843-848` |
| 隊伍平衡（co_Balance） | **不經過 `SetRoomInfo()`**，直接讀 `RoomInfo.IsBalance`（`Room_Option_SN 0x00220217` 的 bit），`UpdateRoomInfo():731` 無條件 `co_Balance.SetIndex(Balance)` | `:602-621`、`:731` |

**關鍵：`SetRoomInfo(MapIndex)`（:361-438）是唯一的閘門**——它拿 `MapIndex`（＝`RoomInfo.MapInfo[SelectedNumber].Index`，
:687）去掃 `CacheManager.GetMapInfoList()` 的整張表，找 `MapList[n].MapIndex == FindMapIndex` 且 `MapIndex>=1000`
（:391-392，`< 1000` 直接 `continue`）；找不到就 `bFind=false`，**`:437 if(!bFind) return;`**——`co_Mode`／`co_Limit_Data`／
`co_Time_Data`／`co_Round_Data` 四個清單全部沒機會被填。這就是「遊戲類型/人數/目標分數/遊戲時間/目標回合」五格
**同時**空白、但「隊伍平衡」單獨有值的根因：後者是唯一不走這條查表路徑的欄位。

**附註（選擇地圖 co_Map 為什麼有值，本題唯一存疑處）**：`co_Map` 的設定邏輯（:756-767）用同一個 `MapIndex`
（`RoomInfo.MapInfo[SelectedNumber].Index`）去掃 `MapList[n].MapIndex==MapIndex` 找對應名稱、再用名稱字串比對填入
下拉框；如果 `MapIndex` 是垃圾值（見 Q2），這個迴圈同樣找不到匹配，**`co_Map.SetIndex` 就不會被呼叫**——但
`co_Map` 沒有在別處被清空，所以它會**維持前一次的值**（很可能是玩家在建房對話框自己選 TDM 地圖時，客戶端本地已經
把 `co_Map` 設成「落日大道」，房間畫面開啟後這條查表失敗，但沒人清掉它，畫面上就繼續顯示舊值）。
**這點本次沒有找到 UC 或 DLL 證據直接證實「建房對話框會先設定同一個 co_Map 元件」**——只是讀完 `UpdateRoomInfo()`
後找不到任何路徑會在查表失敗時清空 `co_Map`，是唯一合理的解釋，**標成待確認，不是結論**。

---

## Q2. 我方對 PvE／PvP 送這組封包有什麼不同？為什麼 PvE 有值、PvP 是空的

**`Room_Default_SN` 本身兩種房型都會送**（`dispatch/room.dispatch.js:1556`，不分房型）。但它 body+0x20 第一筆
entry 的 Index（`primaryBodyCacheIndex`）在 `ROOM_DEFAULT_MAP_ENTRY_MODE='disabled'`（現行值，`room-state.sender.js:17`）
時，兩種房型都是同一種 Cache.Bin 行號（例如 58），**不是任何 ≥1000 的真實 MapIndex**——單靠這個封包，PvE／PvP
的 `SetRoomInfo()` 查表都會失敗。PvE 之所以最後有值，**是因為另外多送了一組 `Map_Change_All_SN`/`Map_Change_One_SN`**，
把 `MapInfo[0]` 整筆用真實資料覆寫過去。

**真正的分岔點：`dispatch/room/room-map.sender.js:140-142`**

```js
if (!ctx.isTrueCampaign) {
    return;
}
```

`sendRoomMapPackets()`（送 `Map_Change_All_SN` + `Map_Change_One_SN` 的唯一函式）在 `ctx.isTrueCampaign` 為假時
**直接不送任何封包**。`ctx.isTrueCampaign` 來自 `client.isTrueCampaign_`（`room.dispatch.js:1548`），
而這個欄位在建房時由 `gate.game.dispatch.js:1267,1315` 設定：

```js
const isTrueCampaign = (roomType === 1) || (gameMode === 4 || gameMode === 5);
...
client.isTrueCampaign_ = isTrueCampaign;
```

`roomType` 是 Create_CQ body[0]（PvP 觀察值 2，不等於 1）；`gameMode` 是 `createWord4 & 0xFF`，
`createWord4 = body.readUInt16LE(9)`（`:1243,1246`）。依 `docs/research/2026-09-22-d2-tdm/pvp-start-gap.md` Q4
已查過：**這個 body+9..10 依 ✅ 核對過的 Create_CQ 欄位表（`docs/journal/2026-09-17-18-create-cq-map-difficulty.md`）
其實是 `PlayGoal`，不是任何遊戲模式旗標**，且所有已錄到的真實封包這裡都是 `00 00`——**所以 `gameMode` 對 PvE／PvP
永遠是 0，`isTrueCampaign` 事實上只由 `roomType===1` 決定**。PvP 的 `roomType=2`，因此 `isTrueCampaign` 恆為 false，
`sendRoomMapPackets()` 恆早退。

**回答「欄位沒填、填了 0、還是查不到」**：三者都不是——**是我方根本沒有送出能填這個表的封包**（`Map_Change_All_SN`／
`Map_Change_One_SN` 對 PvP 房次數＝0），跟 Cache.Bin 查得到查不到無關（因為連查表用的 `MapInfo[0].Index` 都沒被
寫成真實值）。這一點跟 `docs/research/2026-09-22-d2-tdm/pvp-start-gap.md` Q2 提到的「地圖選單」空白是**同源但不同層**
的問題：Q2 講的是 `ZPopup_MapSelect` 的 `Account_MapList_Check`（登入時 `MapInfo_SN` 快取），本題是 `ZPanel_RoomInfo`
的 `RoomInfo.MapInfo[]`（房內即時封包），兩者互不影響，但根因都指向「PvP 沒有被接上該有的封包/資料」。

---

## Q3. 這些值應該從哪來？我方有沒有存住 Create_CQ 的值？為什麼戰場對了、房間畫面空著

**Create_CQ `0x00220201` body 欄位（已由高階 ✅ 核對，`docs/journal/2026-09-17-18-create-cq-map-difficulty.md`）**：
`+0x02..03 MapIndex(u16)`、`+0x04..05 PlayTime(u16)`、`+0x06 PlayRound(u8)`、`+0x07..08 PlayKill(u16)`、
`+0x09..0A PlayGoal(u16)`。

**我方 handler（`gate.game.dispatch.js` case CQ_CREATE，:1237-1315）確實存住了 PlayTime／PlayRound**：

- `client.createPlayTime_ = createWord2`（`:1304`），`createWord2 = body.readUInt16LE(4)`（`:1240`）——跟確認過的
  `+0x04..05 PlayTime` 位置一致，這個存法本身沒問題。
- `client.playRound_ = body[6]`（`:1283`，註解也標明「body[6] is PlayRound」）——跟確認過的 `+0x06 PlayRound` 一致。

**但同一個 handler 另外把 `body[6]` 讀成 `mapId`**（`:1236-1241`，變數名 `mapId`，註解寫「The selected map is the byte
at body[6]」），存進 `client.mapId_`（`:1279`）。依 ✅ 核對過的欄位表，`body+0x06` 是 `PlayRound`（1 byte），
**不是任何地圖欄位**；真正的 MapIndex 在 `body+0x02..03`，同一個 handler 裡另外用 `pickedMap =
body.readUInt16LE(2)`（`docs/research/2026-09-22-d2-tdm/pvp-start-gap.md` Q4 已指出，行號約 `:1263-1267`）讀出、
只用來設 `client.campaignMapCacheKey_`（且限定 9001-9012 才採用，PvE-only）。**這是既有 ✅ 欄位表跟目前 handler
讀法之間的落差，本次只發現、沒有重新對 `0x107e5b60` 做逐指令 disasm 覆核（該位址本身在 2026-09-17-18 日誌已被
核對過，落差是「這支 handler 讀的欄位跟確認表對不上」，不是欄位表本身有問題）——標記為疑點，交高階判斷。**

**為什麼戰場時限對了、房間畫面空著**：兩者是**完全不同的資料路徑**，只是恰好都源自同一個 `client.createPlayTime_`：

- 戰場：`sendGameInfoSn`（`gate.game.dispatch.js:718-730`）在沒有更明確來源時 fallback 讀 `client.createPlayTime_`，
  寫進 `Game_Info_SN body+0x13`（TimeLimit，已由 `docs/journal/2026-09-18-2334-t1-time-limit.md` ✅ 核對過單位是分鐘）。
  **這條路完全不經過 `RoomInfo.MapInfo[]`**，不受 Q2 的 `isTrueCampaign` 閘門影響，`Game_Info_SN` 兩種房型都會送。
- 房間畫面：`co_Time` 只讀 `RoomInfo.MapInfo[SelectedNumber].Time`（Q1），**這個值只能透過 `Map_Change_One_SN`
  寫入**，而 `Map_Change_One_SN` 被 Q2 的閘門擋住，PvP 完全沒送。

**結論**：`client.createPlayTime_`（以及 `client.playRound_`）在伺服器記憶體裡本來就是對的，也已經被用在戰場
封包上——**缺的不是資料，是把這份資料轉送進 `Map_Change_One_SN`（進而寫入 `RoomInfo.MapInfo[]`）這條路徑，而這條
路徑目前整個被 `isTrueCampaign` 閘門關掉，PvP 房完全沒有走到。**

---

## Q4. 「遊戲類型」空白是不是因為客戶端不知道這房是 TDM？

**不完全是。** `Room_Default_SN body+0x04`（roomType）確實有送，且客戶端明顯認得出這是非戰役房——
`ZPanel_RoomInfo.uc:602-633`（`UpdateRoomInfo()`）依 `RoomInfo.RoomType` 分支，`PVE_GAME` 分支才會
`co_Balance.HideAll(); co_Time.HideAll();`；PvP 房落在 `NORMAL_GAME/ATTACK_GAME/CLAN_GAME` 分支（跟
`docs/research/2026-09-22-d2-tdm/pvp-start-gap.md` Q2 重新核對過的跳表結果一致：raw 2 → internal 0 NORMAL_GAME），
這個分支才會 `co_Balance.ShowAll()`——**這正是「隊伍平衡」欄位在 PvP 房有值、PvE 房沒有的原因，也證明客戶端
在 RoomType 這一層確實把它當成非戰役房處理**。

「遊戲類型」（co_Mode，TDM/殊死戰/占領…的文字標籤）是完全不同的另一個東西——它不是 `RoomInfo.RoomType`，
是 `Cache.MapList[n].MapType`（`ZPanel_RoomInfo.uc:391`），**查表鍵是 `RoomInfo.MapInfo[].Index`**，跟 Q1/Q2
講的同一個查表閘門。所以空白的直接原因跟 Q2/Q3 相同：`MapInfo[0].Index` 沒有被寫成真實 TDM 地圖 id
（`MAP_IDS_PVP = [1011,1021,1031,1041,1051,1061,1071,1081]`，`room.dispatch.js:180`，
`docs/research/2026-09-22-d2-tdm/pvp-start-gap.md` Q3 已列出對應表，落日大道＝1071）。

**該送什麼**：把玩家實際建房選的 TDM 地圖 id（不是 PvE 的 9001-9012 fallback）送進 `Map_Change_One_SN` body+0x01，
讓 `MapInfo[0].Index` 命中 `MapType==0`（TDM）那一列，`SetRoomInfo()` 的 `bFind` 才會成立。

---

## Q5. 最小改動點清單（只列位置與原因，不提方案細節）

1. **`dispatch/room/room-map.sender.js:140-142`**——`sendRoomMapPackets()` 對 `!ctx.isTrueCampaign` 直接
   `return`，是唯一阻止 `Map_Change_All_SN`／`Map_Change_One_SN` 送到 PvP 房的地方；這兩個封包是目前唯一會
   把真實 Time/Round/Kill/Goal 寫進 `RoomInfo.MapInfo[]` 的封包（Q1 的 disasm 確認）。
2. **`dispatch/gate.game.dispatch.js:1267,1315`**——`isTrueCampaign` 的計算式與賦值點；它同時被
   `sendGameInfoSn`／`sendReadyHostSn` 的 `campaignMapCacheKey_` 9001-9012 clamp（`pvp-start-gap.md` Q4）依賴，
   語意是「PvE-only」，不能直接改成「PvP 也算 true」，否則會牽動那條 PvE 專屬假設；需要判斷是加一個新旗標
   還是調整這個布林的下游用法。
3. **`dispatch/room/room-map.sender.js` 的 `sendMapChangeOnePacket()`（:66-106）取值來源**——目前 `mapChangeOneTime`/
   `mapChangeOneRound`/`mapChangeOneGoal` 等候選欄位（`client.mapChangeOneTime_` 等）只在 `Map_Change_One_CQ`
   handler 裡才會被設，PvP 房建立當下還沒有任何 `Map_Change_One_CQ`，需要一個「建房當下」的初始值來源
   （候選：Create_CQ 已存的 `client.createPlayTime_`／`client.playRound_`／PvP 對應的 kill/goal 欄位，或直接
   查 Cache.Bin 該地圖的 Default 值，見 `pvp-start-gap.md` Q3 的 Cache 表）。
4. **`dispatch/gate.game.dispatch.js:1241`（`const mapId = body.length > 6 ? body[6] : 1;`）**——跟 ✅ 核對過的
   Create_CQ 欄位表對不上（該位置應為 PlayRound，不是地圖欄位），本題不是這個 bug 的調查範圍，但任何要在 PvP
   房接上真實地圖 id 的改動，如果經過 `client.mapId_` 這個變數，會先踩到這個既有落差，值得在動手前先請高階排查
   或重新 disasm `0x107e5b60` 確認。
5. **`dispatch/room/room-state.sender.js:204-214`（Room_Default_SN entry 填值迴圈）**——即使只解決 Index
   欄位（`ROOM_DEFAULT_MAP_ENTRY_MODE`），Time/Round/Kill/Goal 四個子欄位仍是寫死的 `0,1,selectedMech+i,0`
   （Q1 disasm 已確認它們落在跟 Map_Change_One_SN 相同的 record 槽位）；R4 日誌已證實單改 Index 對它測試的畫面
   （`ZPopup_RoomSet`）沒有效果，**但 R4 測的是另一個 UI（設定變更彈窗），不是本題的 `ZPanel_RoomInfo` 房間主畫面
   ——兩者是否共用同一份 `RoomInfo.MapInfo[]` 資料本次沒有查證，是後續要先確認的點，不能直接套用 R4「無效」的結論**。

---

## 給主力的摘要

最關鍵的缺口是單一行：**`dispatch/room/room-map.sender.js:140-142` 的 `if (!ctx.isTrueCampaign) return;`**——
它讓 `Map_Change_One_SN 0x00220223`（唯一會把真實 Time/Round/Kill/Goal 寫進客戶端 `RoomInfo.MapInfo[]` 的封包，
本次用 disasm 重新核對過 `0x107eb771-0x107eb7a0`）對所有 PvP 房次數為零。客戶端 `ZPanel_RoomInfo.SetRoomInfo()`
（`~/mro-decrypted/src/ZGameMainMenu/ZPanel_RoomInfo.uc:361-438`）用這個陣列的 `Index` 去查 Cache.Bin，查不到
（`bFind=false`）就整批不填「遊戲類型/人數/目標分數/遊戲時間/目標回合」五個欄位並提早 return；「隊伍平衡」不經過
這條查表，所以獨立有值。伺服器端其實已經存了 Create_CQ 送來的 `client.createPlayTime_`／`client.playRound_`，
也已經用在戰場的 `Game_Info_SN`（所以戰場時限對），只是這份資料從未被送進 `Map_Change_One_SN`，因為那個函式
被 `isTrueCampaign` 擋住了。`isTrueCampaign` 目前完全等同 `roomType===1`（PvE），與 `gameMode` 無關——後者依
`pvp-start-gap.md` Q4 已查出恆為 0（因為它讀的 body+9..10 實際是 PlayGoal 不是模式旗標）。

**不確定／矛盾點**：
1. 「選擇地圖」為什麼有值（Q1 附註）——本次判斷是客戶端 UI 元件沒被清空的殘留顯示，不是伺服器正確送值，
   **沒有找到直接證據**，需要操作者在建房前後多截幾張圖或請客戶端 log 佐證。
2. `gate.game.dispatch.js:1241` 的 `mapId = body[6]` 跟 ✅ 欄位表對不上（應為 PlayRound）——這是**新發現的疑點**，
   不在原任務範圍，但會影響任何後續想直接沿用 `client.mapId_` 的修法。
3. R4（`docs/journal/2026-09-18-11-room-default-map-entry.md`，❌ 已測試無效）測的是 `ZPopup_RoomSet`（設定變更
   彈窗），本題是 `ZPanel_RoomInfo`（房間主畫面）；兩者是否共用同一份 `RoomInfo.MapInfo[]`、R4 的「無效」結論
   能不能套用到本題，**沒有查證，需要先確認**，不要直接假設 R4 已經排除了「填 Index」這條路。

---

## Q6（補充，主力交辦）：地圖選不了 —— Map_Change_One_CQ 的 b5 被伺服器改掉

**現象封包**（操作者 2026-09-22，`~/mro-wt/test/Metal Rage Online Server/logs/` 最新 session）：

```
0x00220221 recv  b0=00 w1=1031 w2=20  b5=01 w6=150 w8=0   ← 客戶端選的
0x00220222 send  同一組欄位，但 b5=02
0x00220223 send  同一組欄位，但 b5=02   ← 廣播給全房，也是 b5=02
```

**跑這段代碼的樹**：操作者的 session 來自 `test-server` 分支（`~/mro-wt/test`），該分支的
`dispatch/map-info.sender.js` 把 `PVP_START_FLOW_MODE` 從 `reverse-work` 的預設 `'disabled'`
改成 `'enabled'`（commit `5e2ef01`，訊息明講「這個 commit 只存在 test-server 分支，不要合回
reverse-work」，是刻意的測試設定，不是意外的 dirty tree）。以下根因鏈**在這個 flag 開啟的狀態下才會
如此；`reverse-work` 預設狀態下 `w1` 的回顯行為會不同（見下）**。

### 根因鏈

1. **`gate.game.dispatch.js` case `0x00220221`（`:2220-2255`）收到 CQ 後，只有 `w1` 落在 `9001..9012`
   （PvE 地圖 id 範圍）才會執行更新區塊**（`:2230 if (incomingFields.w1 >= 9001 && incomingFields.w1 <= 9012)`）：
   這個區塊才會把 `incomingFields.b5` 寫進 `client.playRound_`（`:2232`）與
   `client.mapChangeOneRound_`（`:2236`），並鏡射進共享 Room 物件。**TDM 的 `w1=1031` 不在這個範圍，
   整段更新被跳過**——玩家這次選的 `b5=01` 從未被存到任何地方。
2. 緊接著 `buildMapChangeOneSaFields(body, client)`（`:972-991`）組出要回送的欄位。因為
   `MAP_CHANGE_SA_ECHO_MODE === 'enabled'`（`:274`，跟 reverse-work 同值，已核對），走的是
   `:975-991` 這條路：

   ```js
   const adoptedRound = Number(client.playRound_);
   ...
   b5: Number.isInteger(adoptedRound) && adoptedRound >= 0 && adoptedRound <= 0xFF
       ? adoptedRound : incoming.b5,
   ```

   **`client.playRound_` 不是這次 CQ 剛存的值（因為步驟 1 被跳過），是房間建立當下 Create_CQ 存的舊值**
   （`gate.game.dispatch.js:1283`，`client.playRound_ = body[6]`，即 Create_CQ 的 PlayRound 欄位）。
   依 `docs/research/2026-09-22-d2-tdm/pvp-start-gap.md` Q6 的封包表，這個房型（body[0]=2）觀察到的
   PlayRound 就是 `2`——**跟操作者這次看到的回送 `b5=02` 完全吻合**：伺服器不是「改了」b5，是**回送了
   建房當下的舊值，蓋掉了玩家剛剛在房內重新選的值**，因為步驟 1 的更新路徑對 TDM 地圖 id 完全不通。
3. **`w1`（地圖本身）沒有出現同樣的錯亂**，是因為 `buildMapChangeOneSaFields` 對 `w1` 的 fallback 條件
   （`adoptedMapId >= 9001 && adoptedMapId <= 9012`）本來就會在 `client.campaignMapCacheKey_` 是 PvP 地圖 id
   （1031，不在 9001-9012）時失敗，退回 `incoming.w1`（也就是直接回顯客戶端剛送來的 1031）——**這是巧合，
   不是設計對了**：同一個函式用了兩種語意相反的 fallback（w1 是「不合條件就回顯 CQ 原值」，b5 是「只要是合法
   整數就用舊 client 值」），對 PvE 地圖以外的輸入行為不一致。

### 跟「房間設定欄全空」的關係

**不是同一行程式碼，但是同一種模式**：兩個問題都是「只針對 PvE 地圖 id（9001-9012）寫的條件判斷，
對 PvP 地圖 id（1011-1081）系列沒有對應分支，靜默落到某種舊值或空狀態」——

- 房間設定欄全空（Q1-Q5）：`room-map.sender.js:140-142` 的 `isTrueCampaign` 閘門，擋住**房間建立當下**
  第一次的 `Map_Change_All/One_SN`，導致 `RoomInfo.MapInfo[0]` 從未被寫入真實值。
- 本節（地圖選不了）：`gate.game.dispatch.js:2230` 的 `w1 in [9001,9012]` 閘門，擋住**玩家事後在房內
  重選設定**這條路的欄位更新，導致 SA/SN 回送舊值蓋掉玩家的新選擇。

即使先解決了 Q1-Q5（讓房間建立時就送出正確的 `Map_Change_One_SN`），**這裡的 b5 bug 仍然會讓玩家事後
在房內改設定時被打回舊值**——是同一個「PvP 地圖 id 沒接上」大問題底下兩個獨立的具體卡點，需要分開處理，
不是改一個地方就能兩個都解決。

### b5 語意

依 `docs/journal/2026-09-18-12-map-change-one-sn-settings.md`（✅）與本檔 Q1 的 disasm 核對，
`body+0x05`（b5）是 **MapRound**。本次觀察到的 `w6=150`（依 `pvp-start-gap.md` Q3 對照 Cache.Bin 表，
TDM 地圖組 `GoalMin/GoalMax` 量級相符，判斷是目標擊殺/分數而非回合）與 `w2=20`（PlayTime 分鐘）看起來
都是客戶端自己帶的正確 TDM 預設值（操作者訊息裡提到「韓版原廠 TDM 預設」），**沒有被伺服器動過**——
只有 b5（Round）這一欄被本節查到的機制覆寫。b5=01 究竟對應 TDM 的什麼設定選項（回合數本身，還是某個
子模式/難度）本次沒有進一步查證，只確認了「伺服器把它蓋成舊值」這個機制。

### 待確認

- 「客戶端收到跟自己送出不同的 b5 時會不會把選擇退回」——本次只確認了伺服器行為，**沒有客戶端 UC 或
  截圖證據**證實這就是操作者感覺「地圖選不了」的直接原因；`ZPanel_RoomInfo.uc:1047-1051`
  （`UpdateRoomInfo` 附近的 `if (RoomInfo.MapInfo[MapNumber].Round != MapRound ...)` 這類比對邏輯，
  Q1 讀檔時只看到局部）有沒有「值對不上就送封包/重設 UI」的路徑，需要進一步讀 `ZPanel_RoomInfo.uc:1040-1060`
  附近或請操作者用該房間重試並截圖確認。
- `reverse-work` 預設 `PVP_START_FLOW_MODE='disabled'` 時，`w1` 的回顯行為會不同（`campaignMapCacheKey_`
  在建房當下會落到 `MAP_ID_DEFAULT_CAMPAIGN=9001`，`buildMapChangeOneSaFields` 的 `w1` fallback 條件反而會
  成立，回送 9001 而不是玩家選的 1031）——**這代表 `reverse-work` 現在的預設狀態下，PvP 房的地圖選擇問題只
  會更嚴重（連地圖 id 都會被蓋掉），不是本節描述的「只有 b5 錯」**。這點沒有實測，只是讀程式碼推論，標記
  待確認。
