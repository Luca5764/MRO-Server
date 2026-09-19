# D1 第 6 步：開戰廣播（多人）

> 狀態：草稿，**只寫文件，未實作**（AGENTS.md「要重構先問」；backlog D1-6，中階撰寫，待 PM／高階審查）。
> 依據：`docs/design/d1-multiplayer-room.md`（§5、§6 step 6/7）、`docs/research/2026-09-18-d1-room-formats/battle-host.md`、`.../game-user-sn-multi.md`、`docs/reference/multiplayer-audit.md`（M2 組）、`rooms.js`、`dispatch/gate.game.dispatch.js`、`dispatch/room.dispatch.js`（`0x00240301`）、`dispatch/room/room-game-user.sender.js`、`config/server.js`、`config/whitelist.js`。
> 範圍：只涵蓋 PvE（房間全紅隊，design §2）。PvP 分隊不在本節。

## 0. 現況的兩條開戰路徑（重要，會影響第 1 節）

現在的程式碼有**兩個地方**在處理「按 F5 開戰」，這件事本身是 D1-6 落地前要先讓 PM／高階裁決的問題，不是本文件能解的：

- `gate.game.dispatch.js` 的 `0x00222103`（Room Game Start CQ，ZDispatchGame 這條，只在場景 6 生效）：目前有 `SERVER_DRIVEN_START_MODE` 分支和舊的 timer 分支，兩邊都各自送 `Game_Wait_SN`、`Game_User_SN`、`Game_Info_SN`、`Game_Ready_SN`/`Game_Start_SN`、`Ready_Host_SQ`，時序靠一串 `setTimeout`（60/150/300/400/450/600ms）疊出來的，還留著好幾個 `_EXPERIMENT_MODE` 開關。
- `room.dispatch.js` 的 `0x00240301`（Game Start CN，`room.dispatch.js:654-694`）：另一條路徑，送 `0x00240302`、`Ready_Success_SN 0x00420116`、`BeginRound_SN 0x00230152`，不送 `Ready_Host_SQ`／`Ready_Host_SN`。

⬜ **這兩條路徑哪一條是實際生效的、彼此如何互動（是否同一次開戰兩邊都會跑到）**，本文件沒有重新驗證，只依 battle-host.md 記錄的單人實測序列（第 1305 行附近）為準，因為那是唯一附了 [LOG] 的完整序列。第 1 節的「單人序列」欄位以 battle-host.md 的序列為準；`gate.game.dispatch.js`／`room.dispatch.js` 目前各自的 `setTimeout` 疊法在多人廣播化時大機率要整併，這是實作階段的架構決策，本文件只標出需要決定，不代寫決定。

## 1. 開戰序列（多人）：逐包標「送給誰」

依 battle-host.md 第 5、35-38 行的單人序列，逐包對照多人時的收件人：

| # | 封包 | 觸發 | 單人（現況） | 多人：送給誰 | 依據 |
|---|---|---|---|---|---|
| 1 | `Game_Start_CN 0x00222103`（或 `0x00240301`） | 房主按 F5 | C→S | — | 只有房主能觸發；⬜ 非房主送這個 CQ 該怎麼處理（忽略？現在的 handler 不檢查是不是房主） |
| 2 | `Game_Wait_SN 0x00420111` | 上面那包 | S→C（觸發者） | **全房廣播**（`room.sendAll`） | design §5 表；把觸發者踢進場景 6 是每個成員都要做的事，不只房主 |
| 3 | `Game_User_SN 0x00222112` | 進場景 6 之後 | 每連線一包，count=1 | **每個連線各收 N 包**（N＝房內人數），順序見第 2 節 | game-user-sn-multi.md、design §5 表 |
| 4 | `Game_Info_SN 0x00222111` | 同上 | S→C（觸發者） | **全房廣播**，body 對所有人相同（房間層級設定，不是掛在單一 client 上） | multiplayer-audit M2 第一列；design §1「狀態從 client 搬到 Room」 |
| 5 | `Ready_Host_SQ 0x00420113` | Game_Info_SN 之後 | S→C（觸發者） | **只送給房主**（`room.hostAccountId` 那條連線） | battle-host.md 第 9-13、29-36 行：收到這包的客戶端會呼叫 `Game_Ready_P2P` 變成 P2P 房主 |
| 6 | `Game_Ready_SN 0x00222102`／`Game_Start_SN 0x00222104` | 同上 | S→C（觸發者） | **全房廣播** | design §5 表（Game_Start 同列） |
| 7 | `Ready_Host_SN 0x00420115` | Ready_Host_SQ 之後（房主端）／或直接（其他成員） | S→C（觸發者，body 是自己的 IP） | **房主：不送這包**（房主不需要「去連誰」）。**其他成員：各收一包，body＝房主的 IP＋Port 30907＋Map**（ANSI "IP/Map"，battle-host.md 第 38 行） | battle-host.md 第 17-27、36-38 行 |
| 8 | `0x00420114`（C→S，回報 Port） | 收到 Ready_Host_SN 之後 | C→S（觸发者） | 房主不會收到這包（因為沒收 Ready_Host_SN）；其他成員各自送 | 同上；⬜ 這包在多人時伺服器要不要做什麼（目前單人只是回送） |
| 9 | `Ready_Success_SN 0x00420116` | 上面那包之後 | S→C（觸發者） | **全房廣播**（或至少廣播給非房主成員；房主沒有等待 host-ready 的理由，但送給它也不會錯，待實作時用回歸測試決定） | battle-host.md 序列；⬜ 房主是否也需要收到這包才會離開 Loading，沒有反向驗證 |
| 10 | `BeginRound_SN 0x00230152` | 約 6 秒後 | S→C（觸發者） | **全房廣播** | battle-host.md 序列；design §5 表隱含（EndGame／Death 都是全房） |

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

### 3.2 缺漏時的行為

依 PM 裁決（battle-host.md 第 43 行）：**設定缺漏時，明確拒絕該帳號當房主開戰並寫 log，不可退回 localAddress。**

- 判斷時機：房主人選確定之後（`room.hostAccountId` 解析出帳號名稱）、送出第 1 節第 5 步 `Ready_Host_SQ` 之前。查 `getHostAddress(hostUsername)`，若為 `null`：
  - 不送 `Ready_Host_SQ`、不送 `Ready_Host_SN`、不送 `Ready_Success_SN`、不送 `BeginRound_SN`（開戰序列整段中止在第 4 步 `Game_Info_SN` 之後）。
  - 寫一筆醒目 log（帳號名稱、房間 id、"host address not configured, refusing battle start"）。
  - ⬜ **要不要送 `Ready_Failed_SN 0x00420112` 通知客戶端**：見下面 3.3，目前只有部分格式，若客戶端沒收到任何後續封包，行為是卡在 Loading（跟 `sendReadyHostSn` 註解裡記錄過的舊 crash/掛住案例類似），比送一個不確定格式的封包更安全但體驗差。**保守做法**：先只做「送 log＋不送開戰序列」，不送 `Ready_Failed_SN`；等 3.3 的格式再核對一次（跨連線送一個沒把握的 opcode 給客戶端，如果解讀錯欄位，代價是連線卡死或掉線）。
  - 單人時：目前 `sendReadyHostSn` 用 `client.socket_.localAddress`（自己），不受這個新檢查影響 —— **前提是單人開戰路徑不查白名單 hostAddress，只有多人分支（房內人數>1，或者更保守地說「非房主連線存在」）才啟用這個檢查**。單人時房主就是唯一連線，沒有「其他成員需要連過去」，繼續用現有的 localAddress 邏輯，不查設定檔。

### 3.3 `Ready_Failed_SN 0x00420112` 格式（[DLL] 部分確認）

- handler thunk `0x10702ff9`（exports 表 `?Ready_Failed_SN@ZDispatchGame@@...`）→ `0x107d5930`。
- [DLL] `0x107d5930`（`tools/ghidra/decompile.sh 0x107d5930`）：
  - `*(param_1 + 4)`（讀到的旗標位元組）== 0 → 只寫 log（`"ZDispatchGame::Ready_Failed_SN"` info 等級），`return`，**不改場景、不觸發任何事件**。
  - 非 0 → 寫 error log；若 `GIsClient==0`（listen server／dedicated 端）呼叫 `UZNetwork_DJ::Dedi_End`，`Scene_Change(1)`；否則（一般客戶端，這是我們要送的目標）呼叫 `Event_Call("NETWORK_GAME_LEAVE", "HOST_NOTING")`，`Scene_Change(5)`。
  - ⬜ `param_1+4` 相對「封包 body」的偏移**沒有交叉核對**：`param_1` 是 dispatch 傳進來的 frame/`Format::System::Share*` 指標，不確定是 `body-4` 還是別的基準（跟本文件引用的其他 handler，例如 `sendOkSa` 系列 body+0x00 u16／+0x02 u32 的慣例不是同一顆函式，不能直接套）。**只知道有一個位元組欄位，非 0 會讓一般客戶端觸發 `NETWORK_GAME_LEAVE` 並切到 scene 5**；不知道 body 總長度、其他欄位、以及 body+0x00 實際對不對得上這個位元組。
  - scene 5 的語意（是否＝房間畫面）本文件沒有交叉核對，標 ⬜。
- **結論**：格式**查到了一半**——知道「送非 0 的某個位元組會讓客戶端離開戰鬥準備、回到某個 scene」，但不知道封包總長度與精確偏移，不足以直接照抄組出 body。依任務指示的備案：**先採「只寫 log＋不送開戰」的保守做法**，`Ready_Failed_SN` 的精確 body 留給下一輪 DLL 分析（需要找到 dispatch table 呼叫這個 handler 的地方，確認 `param_1` 的基準）。

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
4. **房主判定與 Ready_Host 系列拆兩條路（第 1 節第 5、7 步）**：`Ready_Host_SQ` 只送房主、`Ready_Host_SN` 只送非房主。開關（例：`READY_HOST_SPLIT_MODE`）。1 人房時房主＝唯一成員＝收 `Ready_Host_SQ`、不收 `Ready_Host_SN`——**這跟現況不同**（現況單人兩包都收，battle-host.md 第 38 行的序列本身就是單人下兩包都送給同一人）。這一步**不可能對單人 bytes 完全不變**，是本文件唯一預期會改變單人封包數的步驟，必須：(a) 单独 commit，(b) 附理由重錄基準，(c) 操作者實測單人開戰仍然能打（跟 design §1「只有第 0 步會刻意改變一個封包」的例外條款是同一種處理方式，只是這次是第 6 步而非第 0 步，需要 PM 在審查時額外確認是否接受這個例外）。
5. **白名單 hostAddress 查詢＋拒絕路徑（第 3 節）**：只有「非房主成員存在」時才查 `hostAddress`；查不到就中止序列＋寫 log。開關（例：`HOST_ADDRESS_REQUIRE_MODE`）。1 人房不受影響（沒有非房主成員，不觸發查詢）；回歸：黃金樣本全綠；新增測試：白名單無 `hostAddress` 的帳號在 2 人房當房主，斷言序列止步於 `Game_Info_SN`，log 出現拒絕字樣，且沒有任何連線收到 `Ready_Host_SQ`／`Ready_Host_SN`。

## 6. 風險與 ⬜ 清單

- ⬜ **兩條開戰路徑並存**（第 0 節）：`0x00222103` 與 `0x00240301` 目前都在處理「按 F5」，廣播化前要先確認哪條是實際生效路徑，或兩條是否需要合併——這是架構決策，超出本文件範圍。
- ⬜ **UDP 30907 防火牆（N2）**：battle-host.md 第 44 行已排這個後續任務；房主機器要開 Windows 防火牆 UDP inbound，只限 Private profile、只限區網網段（依硬性約束第 2 條，不能對外開）。
- ⬜ **房主在戰鬥中離開 → `HostChange_SN 0x00420121`**：`[this+9]` 唯一寫入點就是這包（battle-host.md 第 35 行），`0x107d5a00`／`0x107d5a69`。本文件沒有查它的 body 格式；房主離開時的交接邏輯（design §2「房主離開時交給加入最早的成員」）在戰鬥中該怎麼跟 P2P 的「誰是 host」同步，是新的複雜度——房主換人不只是 `User_Master_SN`，還要讓新房主重新 `Ready_Host_SQ`、其餘人重新 `Ready_Host_SN` 連過去，這段完整握手本文件未設計，留給下一份契約。
- ⬜ **`0x00420114`（C→S port 回報）多人時的處理**：現在只是收到後不做事；多人時是否要記錄每個非房主連線「已完成 P2P 連線」作為某種 ready gate，未分析。
- ⬜ **`Ready_Failed_SN` 精確 body**（第 3.3 節）：只確認了一個非 0/0 的旗標位元組語意，偏移基準未交叉核對，不能直接照抄組包。
- ⬜ **`Ready_Success_SN` 是否要送給房主**（第 1 節第 9 步）：battle-host.md 的序列是單人（房主＝觸發者）下觀察到的，房主分支要不要一樣收這包沒有反向驗證。
- ⬜ **NAT／portproxy 後房主 IP 的可靠性**：design §7「不特別處理同一 NAT 後面兩人」跟本節的 `hostAddress` 手動設定表是同一個限制的兩個層面；`hostAddress` 是靜態設定，換了網路（例如朋友換了 IP）就要手動更新設定檔，沒有自動偵測。
- ⬜ **`Game_User_SN` 多包對連線頻寬/延遲的影響**：N 個成員時，每個連線要收 N 包（總共 N² 包），沒有評估過量測。
