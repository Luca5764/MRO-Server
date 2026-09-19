# D1 第 6 步：開戰廣播（多人）

> 狀態：草稿，**只寫文件，未實作**（AGENTS.md「要重構先問」；backlog D1-6，中階撰寫，待 PM／高階審查）。
> 依據：`docs/design/d1-multiplayer-room.md`（§5、§6 step 6/7）、`docs/research/2026-09-18-d1-room-formats/battle-host.md`、`.../game-user-sn-multi.md`、`docs/reference/multiplayer-audit.md`（M2 組）、`rooms.js`、`dispatch/gate.game.dispatch.js`、`dispatch/room.dispatch.js`（`0x00240301`）、`dispatch/room/room-game-user.sender.js`、`config/server.js`、`config/whitelist.js`。
> 範圍：只涵蓋 PvE（房間全紅隊，design §2）。PvP 分隊不在本節。

## 0. 現況的兩條開戰路徑（PM 審查後：已用 log 定案）

**[LOG] 定案：實際生效的是 `gate.game.dispatch.js` 的 `0x00222103`；`0x00240301` 沒有真的被送到伺服器過。**

- [LOG] PM 統計 `logs/session-20260919-012749.jsonl`（ms 452941–1093500）：收到 `0x00222103` ×1、`0x00240301` ×0；送出 `0x00420111`、`0x00222112`、`0x00222111`×2、`0x00222102`、`0x00222104`、`0x00420113`、`0x00420116`、`0x00420118`、`0x00230152`。
- [LOG] 中階複查 `test/golden/pve-full-match/recv.jsonl`：`grep -c 00222103` → 6（`{"op":"0x00222103","hex":"270a000000"}`，同一包因重送/重放樣本重複出現），`grep -c 00240301` → 0。跟 session log 的結論一致。
- [CODE] 交叉核對程式碼路徑，能解釋為什麼：`gate.game.dispatch.js` 的 `SERVER_DRIVEN_START_MODE = 'enabled'`（`gate.game.dispatch.js:109`）恆為真，`0x00222103` handler 進入 `if (SERVER_DRIVEN_START_MODE === 'enabled') { ... return true; }` 分支（`:918-955`）就直接 `return`，不會落到下面舊的 `setTimeout` 疊法分支（`:957-999`，那個分支才會呼叫 `primeReadyHostHandshake`／`schedulePostGameWaitReadyHost`，也就是唯一會呼叫 `sendReadyHostSn`／送出 `Ready_Host_SN 0x00420115` 的地方）。**這解釋了第 1 節第 8 步的更正**：目前線上跑的分支從頭到尾沒有送過 `0x00420115`。
- **結論（本文件採用，不再是 ⬜）：**
  - 多人廣播化的基礎是 `gate.game.dispatch.js` 的 `SERVER_DRIVEN_START_MODE` 分支（`0x00222103`），第 1 節序列表照這條路徑的封包重寫。
  - `room.dispatch.js` 的 `0x00240301`（Game Start CN，`:654-694`）**列為收斂候選**：既沒有 [LOG] 證據顯示客戶端真的會送這個 opcode，也不在目前的執行路徑上。本文件**不在它上面做任何廣播化**，避免維護一條死路徑；是否整段刪除留給後續收斂任務（不在本次 D1-6 契約範圍內，需要另外確認真的沒有客戶端場景會送它，才能刪）。

## 1. 開戰序列（多人）：逐包標「送給誰」

依實際生效路徑（第 0 節，`gate.game.dispatch.js` 的 `0x00222103` `SERVER_DRIVEN_START_MODE` 分支）的單人序列，逐包對照多人時的收件人。**PM 審查更正：單人現況只送 `Ready_Host_SQ`，不送 `Ready_Host_SN`——第 7、8、9 步原本的方向寫反了，已用 DLL 重新核對（見表後說明）。**

| # | 封包 | 觸發 | 單人（現況） | 多人：送給誰 | 依據 |
|---|---|---|---|---|---|
| 1 | `Game_Start_CN 0x00222103` | 房主按 F5 | C→S | — | 只有房主能觸發；`0x00240301` 是收斂候選，見第 0 節，不在此列。⬜ 非房主送 `0x00222103` 的處理見第 3.2 節（新增：忽略＋log） |
| 2 | `Game_Wait_SN 0x00420111` | 上面那包 | S→C（觸發者） | **全房廣播**（`room.sendAll`） | design §5 表；把觸發者踢進場景 6 是每個成員都要做的事，不只房主 |
| 3 | `Game_User_SN 0x00222112` | 進場景 6 之後 | 每連線一包，count=1 | **每個連線各收 N 包**（N＝房內人數），順序見第 2 節 | game-user-sn-multi.md、design §5 表 |
| 4 | `Game_Info_SN 0x00222111` | 同上 | S→C（觸發者，現況送兩次：150ms 首送＋600ms 重送） | **全房廣播**，body 對所有人相同（房間層級設定，不是掛在單一 client 上） | multiplayer-audit M2 第一列；design §1「狀態從 client 搬到 Room」；[LOG] 第 0 節 session 統計「×2」 |
| 5 | `Game_Ready_SN 0x00222102`／`Game_Start_SN 0x00222104` | Game_Info_SN 之後 | S→C（觸發者） | **全房廣播** | design §5 表（Game_Start 同列） |
| 6 | `Ready_Host_SQ 0x00420113` | 同上 | S→C（觸發者） | **只送給房主**（`room.hostAccountId` 那條連線） | battle-host.md 第 9-13、29-36 行：收到這包的客戶端會呼叫 `Game_Ready_P2P` 變成 P2P 房主 |
| 7 | `Ready_Host_CA 0x00420114`（C→S，房主回應 SQ） | 收到 Ready_Host_SQ 之後 | C→S（觸發者＝當時的唯一連線，也就是房主） | **只有房主會送**（因為只有房主收到 SQ）；伺服器讀出 body+0x06 的**房主實際監聽埠**，見下方 DLL 核對 | [DLL] `ZDispatchGame::Ready_Host_CA` `0x107050a6`，見表後說明；[LOG] `000000000000bb78` |
| 8 | `Ready_Host_SN 0x00420115` | 收到房主的 `0x00420114` 之後 | **單人現況不送這包**（`sendReadyHostSn` 只存在於 `SERVER_DRIVEN_START_MODE` 以外的死分支，見第 0 節） | **只送給非房主成員**，body＝`hostAddress`（第 3 節設定檔）＋房主在 `0x00420114` 回報的**實際埠**（不寫死 30907）＋Map（ANSI "IP/Map"） | battle-host.md 第 17-27 行（body 格式）；第 0 節（單人現況不送的證據）；本次 PM 更正（埠不寫死） |
| 9 | `Ready_Success_SN 0x00420116` | 房主的 CA 之後（單人）／`Ready_Host_SN` 送出後（多人非房主，⬜ 見下） | S→C（觸發者，由 `community.dispatch.js` 收到 `0x00420114` 後送出） | **房主**：收到自己的 `0x00420114` 後即送。**非房主**：⬜ 沒有 CA 可等（它們沒收到 SQ、不會送 CA），提案是送完 `Ready_Host_SN` 就直接跟著送，不等額外的 CQ；需要下一輪用雙連線實測確認客戶端是否真的不需要先送什麼 | [CODE] `community.dispatch.js:120-125`（`sendReadySuccessAndBeginRound`）；⬜ 非房主分支未實測 |
| 10 | `BeginRound_SN 0x00230152` | `Ready_Success_SN` 之後 | S→C（觸發者） | **全房廣播** | design §5 表隱含（EndGame／Death 都是全房）；[LOG] 第 0 節 session 序列尾端就是這包 |

### `Ready_Host_CA 0x00420114` 組包位址與欄位核對（[DLL]，PM 要求的新查證）

- exports：`0x107050a6  ?Ready_Host_CA@ZDispatchGame@@QAEX_N@Z`（`ZDispatchGame::Ready_Host_CA(bool)`）。
- [DLL] `tools/ghidra/decompile.sh 0x107050a6`：`this[4]==0` 時只寫 log 就 return（跟 `Ready_Failed_SN` 那個 `this+4` 檢查是同一種模式，語意未進一步深究）；否則呼叫 `UZNetwork_DJ::Address_Local_Get()` 拿本地位址資訊 `pFVar1`，把整個 0x400 bytes 送出緩衝區清零，再依序寫入：
  - frame+0x0C（body 起點前，標準 opcode 欄位）＝`0x420114`
  - frame+0x06（標準長度欄位）＝`0x18`（24 = 0x10 header + **8 bytes body**，跟 `docs/state.md:51` 記的「8 bytes」一致）
  - **body+0x00（u16 LE）＝0**（固定值，語意未知，🟡 可能是保留欄位）
  - **body+0x02（u32 LE）＝`param_1` 為 true（成功）時 0，為 false（失敗）時 `0xFFFFFFFF`** —— 這是結果碼
  - **body+0x06（u16 LE）＝`*(pFVar1+0xc)`**，即 `Address_Local_Get()` 回傳結構偏移 0xC 處的值，轉型 u16 —— 這是**房主自己本地位址資訊裡的埠號**
- [LOG] 核對：PM 給的 body hex `000000000000bb78` 拆成 `0000`(body+0x00) `00000000`(body+0x02) `bb78`(body+0x06)。`bb78` 轉 u16 LE＝`0x78bb`＝**30907**，與 body+0x02＝0（成功）完全對上 DLL 讀出的欄位語意。
- **結論：body+0x06 的 u16 LE 就是房主回報的實際監聽埠，多人時第 8 步的 `Ready_Host_SN` 要用這個值，不能寫死 30907**（雖然目前實測剛好都是 30907，但格式上這是可變欄位，寫死是巧合不是保證）。
- ⬜ 沒有查到的：`this[4]` 的語意、`Address_Local_Get()` 結構其餘欄位、body+0x00 固定 0 的用途、這個函式在客戶端被誰呼叫觸發（呼叫點沒追，只確認了它是組出 `0x00420114` 的那個函式）。

## 2. `Game_User_SN 0x00222112`：多人送法

依 game-user-sn-multi.md：

- 每筆記錄固定 `0x1E5`（485）bytes；一包 `count=1` 是 487 bytes，`count=N` 會超過客戶端 0x400 的收包上限（N≥3 時，2+3×485=1457）。**所以絕對不能合成 count=N 的一包**，這點design 已經寫了，本節重申並定順序。
- 客戶端陣列（`Game_User_Add`，stride 0xEC）用 UserIndex（＝`accountId`）做 upsert，不是覆蓋整包；表**不會**在 `Game_User_SN` handler 內被清空（PM 審查已核對 `Game_Data_Clear` 的四個呼叫點都不在這個 handler 裡），所以送 N 包、每包一人是安全的，不用擔心後面的包把前面的沖掉。
- **排序限制**：每個連線的 `Game_User_SN` 系列必須排在**該連線自己**收到的 `Game_Wait_SN`／`Game_Info_SN`（scene 6 handler）之後，因為 handler 只在場景 6 生效（AGENTS.md 陷阱表）。這代表第 1 節第 3 步的「每個連線各收 N 包」，只有在該連線已經收到第 2、4 步之後才能送。

**實際送出順序（提案）**：對房間 `members`（Map，插入順序＝加入順序）做外層迴圈，對每個活著的連線 `target` 做內層迴圈，送 `members` 全體（含 `target` 自己）：

```
for target of room.members:
    if !target.client: continue
    for source of room.members:
        send Game_User_SN(to=target.client, subject=source) // count=1, userIndex=source.accountId
```

- 每包的**來源資料**＝該 `source` 成員的 DB 配裝：`db.getItems(source.accountId)`（沿用 `sendGameUserBootstrap` 現有的查法，`room-game-user.sender.js:113-120`），nickname／pilot／selectedMech 也要改成讀 `source` 而不是永遠讀 `client`（目前 `ctx` 全部來自觸發連線的 `client.xxx_`，`gate.game.dispatch.js:275-285`）。
- 一人房（現況）時，`room.members` 只有一筆，內層迴圈跑一次，輸出跟現在完全一樣 —— 這是第 5 節單人不變切分的關鍵前提。

## 3. 房主 IP 設定檔格式

### 3.1 提案：擴充 `config/allowed-users.json`（PM 裁決：跟白名單同一份設定）

現況（`config/whitelist.js:20-59`、`config/allowed-users.example.json`）：

```json
{ "users": ["Lucas"] }
```

`users` 是字串陣列，`isAllowed()` 對每個元素做 `String(u).toLowerCase()`。提案改成陣列元素可以是字串**或**物件，兩種混用：

```json
{
    "users": [
        "Lucas",
        { "name": "dusk", "hostAddress": "192.168.1.42" }
    ]
}
```

- 字串元素＝舊格式，行為完全不變（沒有 hostAddress）。
- 物件元素：`name` 必填（比對邏輯同字串，小寫比對），`hostAddress` 選填（IPv4 字串）。
- `whitelist.js` 的 `load()` 把 `users` 正規化成 `Map<lowercaseName, { hostAddress: string|null }>`，取代現有的 `Set`；`isAllowed(username)` 改成 `map.has(...)`（行為不變）；新增 `getHostAddress(username)`，查不到回 `null`。
- **長度限制**：`Ready_Host_SN` 的 body 目前是 `ip + '/' + mapName`，`READY_HOST_SN_URL_MODE==='fixed_0x13'` 時整段只有 16 bytes 可用（`gate.game.dispatch.js:228-246`）；`config/server.js` 對 `publicHost` 也有 15 字元上限（同樣理由，`config/server.js:36-45`）。`hostAddress` 應該套用一樣的長度檢查與警告寫法（[CODE] `config/server.js:36-46` 的先例），不是本文件重新設計，照抄現有模式即可。

### 3.2 缺漏時的行為（PM 審查後：檢查時機提前）

依 PM 裁決（battle-host.md 第 43 行）：**設定缺漏時，明確拒絕該帳號當房主開戰並寫 log，不可退回 localAddress。**

- **檢查時機（PM 更正）：收到 `0x00222103`（第 1 節第 1 步）的當下、送出任何封包之前**——不是等到第 6 步 `Ready_Host_SQ` 前才查。條件：房間內有非房主成員（`room.members.size > 1`）**且**房主帳號在設定檔裡查不到 `hostAddress`。同一個 handler 入口，順便處理另一個新規則：
  - **非房主連線送 `0x00222103` → 忽略＋log**（現在的 handler 完全不檢查是不是房主，第 1 節第 1 步原本留的 ⬜ 現在有明確規則了）。
  - **房主送 `0x00222103` 但缺 `hostAddress`（且房內有其他人）→ 不開戰**：不送 `Game_Wait_SN` 起的整段序列（第 1 節第 2–10 步全部不送），寫一筆醒目 log（帳號名稱、房間 id、"host address not configured, refusing battle start"），所有連線（含房主自己）留在房間畫面，因為根本沒送 `Game_Wait_SN` 把大家踢進場景 6。
  - 單人時（`room.members.size === 1`，房主＝唯一成員）：不觸發這個檢查，沿用現有的 `sendReadyHostSn`／CA 流程；只是依第 0、1 節的更正，單人現況本來就不送 `Ready_Host_SN`，這條路徑目前用不到 `hostAddress`。
- **`Ready_Failed_SN 0x00420112` 因此不在 M2 關鍵路徑上**（PM 裁決）：因為缺漏檢查提前到「送任何封包之前」，伺服器可以直接用「什麼都不送」＋log 來讓客戶端留在房間，不需要送一個格式沒完全確認的 opcode 去主動通知。3.3 節維持 ⬜，本節不再需要它。

### 3.3 `Ready_Failed_SN 0x00420112` 格式（[DLL] 部分確認，⬜ 不在 M2 關鍵路徑上，暫緩）

- handler thunk `0x10702ff9`（exports 表 `?Ready_Failed_SN@ZDispatchGame@@...`）→ `0x107d5930`。
- [DLL] `0x107d5930`（`tools/ghidra/decompile.sh 0x107d5930`）：
  - `*(param_1 + 4)`（讀到的旗標位元組）== 0 → 只寫 log（`"ZDispatchGame::Ready_Failed_SN"` info 等級），`return`，**不改場景、不觸發任何事件**。
  - 非 0 → 寫 error log；若 `GIsClient==0`（listen server／dedicated 端）呼叫 `UZNetwork_DJ::Dedi_End`，`Scene_Change(1)`；否則（一般客戶端，這是我們要送的目標）呼叫 `Event_Call("NETWORK_GAME_LEAVE", "HOST_NOTING")`，`Scene_Change(5)`。
  - ⬜ `param_1+4` 相對「封包 body」的偏移**沒有交叉核對**：`param_1` 是 dispatch 傳進來的 frame/`Format::System::Share*` 指標，不確定是 `body-4` 還是別的基準（跟本文件引用的其他 handler，例如 `sendOkSa` 系列 body+0x00 u16／+0x02 u32 的慣例不是同一顆函式，不能直接套）。**只知道有一個位元組欄位，非 0 會讓一般客戶端觸發 `NETWORK_GAME_LEAVE` 並切到 scene 5**；不知道 body 總長度、其他欄位、以及 body+0x00 實際對不對得上這個位元組。
  - scene 5 的語意（是否＝房間畫面）本文件沒有交叉核對，標 ⬜。
- **結論**：格式**查到了一半**，跟 3.2 節的判斷一致——因為它已經不在 M2 的必經路徑上，暫緩不繼續查，精確 body 留給真的需要「主動通知」的情境（例如戰鬥中途失敗，而不是開戰前就擋下）再另開契約。

## 4. `Death_SN`／`EndGame_SN` 廣播與 battleStats 共享儲存

依 multiplayer-audit.md M2 組：

- **現況**：`client.battleStats_`（`lobby.dispatch.js:264`）掛在觸發 `Death_CN` 的那條連線上；`Death_SN`／`EndGame_SN` 都只 `client.send()` 給觸發者自己（`lobby.dispatch.js:216-229`、`231-279`）。
- **改法（提案，未實作）**：
  - `battleStats_` 搬到 Room 物件：`room.battleStats = Map<accountId, {kills, deaths}>`（跟 rooms.js 現有的 `Map<accountId, Member>` 同一種存法）。`statFor(accountId)` 從 room 讀，不再從 `client` 讀。
  - `Death_SN` 改用 `room.sendAll`（design §5 表已列 `0x00230124` 為全房），body 不變，只是收件人變成全房。
  - `Campaign_CN 0x00230139 → EndGame_SN 0x00222213` 同樣改 `room.sendAll`（multiplayer-audit 第 43 行、design §5 表）。
  - `attackerIndex`／`victimIndex` 目前是 body 裡的 u16（`lobby.dispatch.js:233-236`），這兩個值已經是「UserIndex」＝`accountId`（第 2 節同一套值域），不用轉換，只是統計表要用它們查 room-level 的 Map，而不是 client-level 的物件。
- **EndGame／EndRound 時機**：backlog R-ROUND 尚未定案（`Campaign_CN` body 沒有回合數，伺服器要自己記錄回合，候選 `EndRound_SN 0x00222211` 還沒驗證格式）。**本節不決定「什麼時候送 EndGame vs EndRound」**，只確定「送的時候要送給全房」這一件事——`Campaign_CN` handler 目前的 `action===1 → winTeam=0 / else winTeam=1` 判斷邏輯本身，待 R-ROUND 完成後可能整個改掉，跟廣播與否是兩個獨立變數。

## 5. 單人行為不變的切分（3–5 個小步驟）

沿用 design §1「每一步都要讓單人行為逐位元組不變，用 `node test/replay-golden.js` 證明」。房內人數固定為 1 時，`room.sendAll`／`sendOthers`（rooms.js 已有）跑出來的收件人集合只有觸發者自己，所以下面每一步都可以先在「1 人房」上做回歸，再談多人。

1. **Game_User_SN 廣播化（第 2 節）**：把 `sendGameUserSn` 從讀 `client.xxx_` 改成讀 `room.members`，外層/內層迴圈改起。開關（例：`GAME_USER_SN_BROADCAST_MODE = 'disabled'`）：disabled 時完全走舊路徑（單連線、單筆），enabled 時走 room 迴圈但**1 人房時迴圈只跑一次**，理論上 bytes 相同。回歸方法：跑 `test/replay-golden.js`（不 `--record`），比對 `pve-full-match`／既有 room-start 相關樣本，開關切 enabled 也要全綠（1 人房場景）；另外新增一個 `test/room-game-user-broadcast.js`：兩個 fake client 進同一 room，斷言每個連線各收到 2 包、userIndex 分別是兩個 accountId。
2. **Game_Info_SN／Game_Wait_SN／Game_Ready/Start_SN 廣播化**：把觸發連線的單發改成 `room.sendAll`。開關（例：`ROOM_BATTLE_START_BROADCAST_MODE`）。回歸：1 人房全綠是必要條件；另外量測「送出封包數」——1 人房開關切開後，封包數應該跟切開前相同（因為 `sendAll` 對 1 人房等於單發）。
3. **Death_SN／EndGame_SN 廣播化＋battleStats 搬家（第 4 節）**：`battleStats_` 從 client 搬到 room，`Death_SN`／`EndGame_SN` 改 `room.sendAll`。開關（例：`BATTLE_STATS_ROOM_MODE`）。回歸：既有 `pve-full-match`／A6b 黃金樣本（若已交付）在 1 人房下必須逐位元組不變；新增測試：兩個 fake client 在同一 room 互相攻擊，斷言雙方都收到同一筆 `Death_SN`、kills/deaths 累計在 room 而非各自歸零。
4. **房主判定與 Ready_Host 系列拆兩條路（第 1 節第 6、7、8 步；PM 審查後：前提改變，不再是例外）**：`Ready_Host_SQ` 只送房主（現況已是如此，單人時房主＝唯一連線）；新增讀取房主 `0x00420114` 回報的埠（第 1 節表後的 DLL 核對）；`Ready_Host_SN` 只送非房主。開關（例：`READY_HOST_SPLIT_MODE`）。**PM 更正後的前提：單人現況本來就只送 `Ready_Host_SQ`、不送 `Ready_Host_SN`（第 0 節已用 log 定案），所以 1 人房下這一步理論上可以逐位元組不變**——不再是 design §1「只有第 0 步例外」之外的第二個例外。回歸方法：跑 `test/replay-golden.js`（不 `--record`），1 人房場景開關切 enabled 後必須全綠；新增測試：兩個 fake client 進同一 room，房主收到 `Ready_Host_SQ` 後回一個帶假埠的 `0x00420114`，斷言非房主連線收到的 `Ready_Host_SN` body 裡的埠等於那個假埠（不是寫死的 30907）。
5. **白名單 hostAddress 查詢＋拒絕路徑（第 3.2 節；PM 審查後：檢查點提前）**：在收到 `0x00222103` 的當下、送出任何封包之前，先判斷「是不是房主」和「房內是否有其他人且房主缺 `hostAddress`」；非房主送 `0x00222103` 直接忽略＋log；房主缺設定就整段不開戰＋log。開關（例：`HOST_ADDRESS_REQUIRE_MODE`）。1 人房不受影響（房內只有房主自己，不觸發查詢）；回歸：黃金樣本全綠；新增測試：(a) 白名單無 `hostAddress` 的帳號在 2 人房當房主，斷言完全沒有任何連線收到 `Game_Wait_SN` 起的任何開戰封包，log 出現拒絕字樣；(b) 非房主連線送 `0x00222103`，斷言被忽略，房主與其他成員都沒收到任何開戰封包。

## 6. 風險與 ⬜ 清單

- 🟡 **兩條開戰路徑並存**（第 0 節，已用 [LOG] 定案，不再是 ⬜；中階撰寫，跨公司審查前仍標 🟡）：`0x00222103` 是實際生效路徑；`0x00240301` 沒有 [LOG] 證據顯示客戶端會送，列為收斂候選，本文件不在它上面做廣播化。
- ⬜ **UDP 30907 防火牆（N2）**：battle-host.md 第 44 行已排這個後續任務；房主機器要開 Windows 防火牆 UDP inbound，只限 Private profile、只限區網網段（依硬性約束第 2 條，不能對外開）。
- **房主在戰鬥中離開（保守行為，PM 要求先定案）：該場戰鬥直接結束，其餘成員送回房間畫面，不嘗試房主轉移／P2P 重新握手。** 理由：P2P 的「誰是 host」是客戶端本地狀態（`[this+9]`，只有 `HostChange_SN 0x00420121` 會寫），戰鬥中途換房主需要新房主重新走一次 `Ready_Host_SQ`／其餘人重新 `Ready_Host_SN` 連過去的完整握手，而 `HostChange_SN` 的 body 格式（`0x107d5a00`／`0x107d5a69`）本文件沒有查，貿然在戰鬥中途送一個沒把握的 opcode 風險比「這場結束，回房間重開」更高。⬜ 「回房間」要送什麼封包組合（比照 `EndGame_SN` 那條路，還是需要新的中斷通知）留給實作階段，本節只定「不做房主轉移」這個範圍限制。
- ⬜ **`0x00420114`（C→S port 回報）多人時的處理**：現在只是收到後不做事；多人時是否要記錄每個非房主連線「已完成 P2P 連線」作為某種 ready gate，未分析。
- ⬜ **`Ready_Failed_SN` 精確 body**（第 3.3 節）：只確認了一個非 0/0 的旗標位元組語意，偏移基準未交叉核對，不能直接照抄組包；因為已不在 M2 關鍵路徑（第 3.2 節），優先度降低。
- ⬜ **`Ready_Success_SN` 是否要送給非房主**（第 1 節第 9 步）：非房主沒有 CA 可等，提案是送完 `Ready_Host_SN` 就跟著送，未經雙連線實測確認。
- ⬜ **NAT／portproxy 後房主 IP 的可靠性**：design §7「不特別處理同一 NAT 後面兩人」跟本節的 `hostAddress` 手動設定表是同一個限制的兩個層面；`hostAddress` 是靜態設定，換了網路（例如朋友換了 IP）就要手動更新設定檔，沒有自動偵測。
- （PM 審查裁決排除，不列為風險）**`Game_User_SN` N² 包的頻寬**：8 人房、每連線收 8 包 × 487 bytes＝3896 bytes，64 包總量對區網 TCP 不構成問題，不需要另外設計批次或節流。

**五個新開關的收斂節奏**：第 5 節列的 5 個開關（`GAME_USER_SN_BROADCAST_MODE`、`ROOM_BATTLE_START_BROADCAST_MODE`、`BATTLE_STATS_ROOM_MODE`、`READY_HOST_SPLIT_MODE`、`HOST_ADDRESS_REQUIRE_MODE`）都可以先各自預設關閉上線；每個開關**驗證通過後 7 天**，另開一個收斂任務把 disabled 分支砍掉（跟 `docs/backlog.md` C1／C2 現有的收斂任務是同一種模式），本文件不逐一預先排定日期。

> **PM 核對通過（2026-09-19）。實作提醒：** 房主的 `Ready_Host_CA 0x00420114` 若 result＝0xFFFFFFFF（開 Listen 失敗，`0x107d918b` 寫到 +0x12），不要對其他人送 `Ready_Host_SN`，走「不開戰＋log」。實作排在 M1 主測和 R-ROUND 之後。

## 補充：戰鬥中離開（2026-09-19，explorer 🟡）

- `Leave_CQ 0x00222131`（`0x107db1f0`）沒有 body。伺服器回 `Leave_SA 0x00222132` 0/0，客戶端就切回 SCENE_ROOM（`0x107d8250`）；我們現在是靠 fallback 回這個封包。
- `Leave_SN 0x00420133`（`0x107d8390`）：body+0 是 u16 slot id。如果是自己的 id，就回到房間；不是自己的話，只把那個人從本地名單移除，**不會切換場景**。→ 非房主中途離開時，回 0x00222132 給他本人，再對其他人廣播 `0x00420133`（離開者的 id），room.state 維持 playing。
- 房主中途離開（§6 已定案：該場直接結束，其他人回房間）：候選做法是對其他人送 EndGame_SN 0x00222213，或各自送自己 id 的 `Leave_SN`。⬜ 待決定，要實測確認。
