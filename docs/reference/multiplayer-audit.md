# 單人假設盤點（S1）

日期：2026-09-18
狀態：🟡 待審。本篇只讀 `dispatch/`（含 `room/`）、`session.js`、`server.js`、`client.js`，沒有改任何程式、資料庫或開關。
掃描範圍：`Metal Rage Online Server/dispatch/*.js`、`dispatch/room/*.js`、`session.js`、`server.js`、`client.js`。行號對照 `reverse-work` 分支 2026-09-18（commit `a28acfd`）。

## 結構性事實（兩組都會用到）

- `server.js` 的 `DispatchServer` 對每個連線各自 `new NetworkClient(...)`，`this.clients` 陣列存在（`server.js:17,71,78-79`），但只用來記錄連線數/log，**從未傳進任何 dispatch handler**。`dispatch.js`／`game.js` 建立的 service 實例呼叫 `service.dispatch(client, type, data)`（`server.js:40-52`），簽名只有觸發訊息的那一個 `client`。
- 全 `dispatch/` 目錄搜尋 `.clients`／broadcast／room-members 陣列：沒有任何跨連線送封包的機制。房間、隊伍、user index 完全沒有共享資料結構，只掛在觸發者自己的 `client` 物件上。
- `session.js` 用 `accountId_` 當 key 把部分欄位（`roomIndex_`、`campaignRoom_`、`mapId_` 等，清單見 `session.js:23-39`）在斷線重連間搬移；如果 `accountId_` 配錯（見 M1 第 3 列），這個跨連線持久層會直接把 A 的房間狀態發給 B。

以下依 `docs/roadmap.md` 分兩組。

## M1：兩個人在房間互相看得到、房間聊天互通

| 檔案:行號 | 目前行為 | 多人時應該怎麼做 | 依據 | 確定度 |
|---|---|---|---|---|
| `dispatch/gate.dispatch.js:46-53` | Gate `Enter_SA 0x00220112` +0x06 對**每個連線**固定送 `0xDEADBEEF` 當 account index，跟登入的是誰無關。 | 至少要送每個連線／帳號各自不同的 index（例如 `accounts.id`），否則兩個玩家的 account index 相同。 | `[CODE]` 本行；`[REF]` `docs/reference/placeholder-audit.md:68`（同一筆已列為 (c)，本次確認行為未變） | 確定（值本身）；client 是否真的把它當 user index 用，需 `[DLL]` 核對，不確定 |
| `dispatch/gamelogin.dispatch.js:83-92` | 遊戲伺服器（30907）登入用 `SELECT * FROM accounts ORDER BY last_login DESC LIMIT 1` 抓「全站最後登入」的帳號，不是依連線本身的身份。 | 用 `CQ_GAME_LOGIN`（0x00110124）body 裡的識別資訊，或某種跨連線的 session token，取代這個 heuristic；否則第二個玩家一登入，第一個玩家下一次因換地圖重連（`session.js:1-21` 已記錄這是常態）就會被指派到第二個玩家的帳號。 | `[CODE]` 本行；`[CODE]` `session.js:1-21`（描述換地圖必斷線重連） | 確定（SQL 邏輯就是這樣寫）；`CQ_GAME_LOGIN` body 是否帶識別碼未查（body 參數整個沒被解析，`gamelogin.dispatch.js:65` 的 `body` 只用來 log hex），需 `[DLL]` |
| 全 `dispatch/`（見上方結構性事實） | `client.accountIndex_` 從未在任何 handler 賦值；全部程式碼一律 `client.accountIndex_ \|\| client.accountId_ \|\| 1` 退回 DB 主鍵。 | 確認 client 端讀的 user index 欄位寬度／合法範圍，決定要不要用另一套 1..N index，還是 DB 主鍵本身就夠。 | `[CODE]` `grep -rn "accountIndex_" dispatch/` 只找到 fallback 用法，沒有賦值處 | 確定（沒有賦值這件事）；是否需要另一套 index 需 DLL |
| `dispatch/lobby.dispatch.js:94-104,310-320,368-373`（`sendEmptyRoomList`） | `Room_List_SN 0x00230103` 永遠回空清單（flag/count/size 都是 0）。 | 維護一個房間清單（房號、名稱、人數、地圖），依實際存在的房間回傳，否則第二個玩家在大廳完全看不到第一個玩家開的房。 | `[CODE]` 本三處；`[REF]` `docs/reference/placeholder-audit.md:32` | 確定 |
| `dispatch/gate.game.dispatch.js:73,571-650`（`CQ_CREATE` 建房） | 建房收到的所有房間設定（`roomName_`、`mapId_`、`campaignRoom_`、`maxPlayers_`、`playRound_` 等）全部寫在觸發連線自己的 `client` 物件上；`nextRoomIndex`（第 73 行）只是模組層級的遞增計數器，不存房間內容。 | 需要一個獨立於任何單一連線的 Room 物件（見 D1），第二個玩家的連線才有地方可以讀到第一個玩家建的房間。 | `[CODE]` 本段 | 確定 |
| `dispatch/room.dispatch.js:535-539`（`0x00240101` Room Enter CQ） | 沒有 `roomIndex_` 時直接假設「你進的就是房間 1」（`client.roomIndex_ = 1; client.roomType_ = 2; client.mapId_ = 1;`），不分辨這條連線是不是真的加入了別人建立的房間。 | 需要先查 Room 清單，依實際加入哪一間房設定這些欄位。 | `[CODE]` 本段 | 確定 |
| `dispatch/room/room-user.sender.js:34-52`（`User_Default_SN 0x00220233`）、`:75-83`（`User_State_SN 0x00220401`） | `count` 欄位固定 `1`，一次只送「自己」這一筆記錄，且只 `client.send` 給觸發者自己。 | 房間有多人時要送每個成員各一筆記錄，並廣播給房內所有連線（不只是自己）。 | `[CODE]` 本兩處；`[REF]` `docs/reference/placeholder-audit.md:35` | 確定 |
| `dispatch/room/room-game-user.sender.js:124-126`（`Game_User_SN 0x00222112`） | header `count` 固定 `1`，每個連線各自只收到「自己」一筆 user record。 | `Game_User_Team_Get` 搜的陣列（sender.js 註解第 7-10 行）要包含房內每個玩家，否則隊友在對方的用戶端裡不存在。 | `[CODE]` 本行；`[CODE]` 檔案開頭註解 7-10 行解釋這個陣列的用途 | 確定 |
| `dispatch/room.dispatch.js:1506`（`const currentUsers = 1;`） | 房間目前人數寫死 `1`，餵給 `SN_ROOM_BOUNDARY 0x00220213` 的 `current` 欄位（`room/room-state.sender.js:112-118`）與 `roomSettingGoal` 計算（`room.dispatch.js:1547`）。 | 改讀真正的房間成員數。 | `[CODE]` `room.dispatch.js:1506,1547,1559`；`room/room-state.sender.js:112-118` | 確定 |
| `dispatch/room.dispatch.js:621-646`（`0x00240201` Ready CN） | Slot index 固定回 `0`（`respBody.writeUint32LE(0, 0)`），Ready 狀態只 `client.send` 回發送者自己，不广播。 | 用真正的房間成員 slot，並廣播「這個 slot 玩家 ready 了」給房間所有人。 | `[CODE]` 本段；`[REF]` `docs/reference/placeholder-audit.md:100` | 確定 |
| `dispatch/room.dispatch.js:652-698`（`0x00240301` Game Start CN） | 任何送出這個封包的連線都被當房主：直接設 `gameStarted_`/`campaignStarted_`，`Game_Start_SA`／`Ready_Success_SN`／`BeginRound_SN` 全部只回給自己；沒有「你不是房主，不能開始」的檢查，也沒有通知房間其他成員一起開始。 | 需要房主判定（見下一列）＋對房間全體成員廣播開始序列。 | `[CODE]` 本段 | 確定 |
| `dispatch/room/room-user.sender.js:85-102`（`User_Master_SN 0x00220319`） | 每次都拿觸發連線自己的 `accountIndex` 當房主送出，等於「誰進房間，誰就看到自己是房主」，沒有跟第一個建房的人比較。函式註解本身也寫「Always, not once per connection」，是刻意設計成單人重送用的。 | 房主要從 Room 物件的建立者／目前指定房主讀，只有真正的房主收到「你是房主」的通知。 | `[CODE]` 本段含註解 85-94 行 | 確定 |
| `dispatch/gate.game.dispatch.js:972-991`（`0x00220507`／`0x00220509`，程式註解稱 `Chat_Game_Team_CN`／`Chat_Game_All_CN`） | 收到聊天封包後把 body 原封不動 `client.send` 回**發送者自己**（`const [msg, respBody] = getExactMessageBuffer(type, body.length); body.copy(respBody); client.send(msg);`），不會送到房間或隊伍的其他成員。 | 房間聊天要廣播給同房間（或同隊）其他連線，不能只 echo 給自己。 | `[CODE]` 本段 | 確定（目前不廣播這件事）；opcode 命名疑點見下一列 |
| 整個 `dispatch/` 目錄 | `grep -rn "0x00220503\|0x00220505\|Chat_Room" dispatch/` 沒有任何結果：`docs/client-dispatch-map.md:78-79` 列出的 `Chat_Room_Team_SN 0x00220503`／`Chat_Room_All_SN 0x00220505`（房間內聊天，相對於上一列的 game/戰鬥聊天）完全沒有 handler，會落到 `gate.game.dispatch.js:994-1012` 的 default（奇數 opcode 自動回 ACK，但不會送給任何其他人）。 | 需要新增房間聊天 handler，並廣播給房間其他成員；這是 M1「房間聊天互通」最直接對應的缺口。 | `[CODE]` grep 結果；`[REF]` `docs/client-dispatch-map.md:78-79`（opcode 名稱） | 確定「目前完全沒有 case、不會廣播」；不確定 client 送出房間聊天時實際用的 CQ opcode 是否真的是這兩個值本身（`client-dispatch-map.md` 是 server→client 表，client 送出用的 CQ 編號需要 DLL 核對，且 `gate.game.dispatch.js` 那組是用 SN 編號當 CN 在處理，兩者是否對稱未查） |
| `dispatch/gate.game.dispatch.js:168-210`（`sendReadyHostSn`，`Ready_Host_SN 0x00420115`） | IP 來源是 `client.socket_.localAddress`，也就是**這條連線在伺服器端的本地位址**（伺服器自己的 bind 位址），不是「host 玩家」的位址；目前架構是所有玩家都連同一個集中式伺服器（不是 P2P host migration）。 | 區網 M1/M2 應該沒差（因為本來就是連同一台伺服器）；但 VPN／M3 情境下這個位址必須是所有玩家都連得到的伺服器對外位址，不能是 127.0.0.1 或內網位址，要另外設定或偵測。 | `[CODE]` 本段 | 確定「目前送的值是什麼」；VPN 情境下是否要改，待 M3 實測，不確定 |

## M2：兩個人打完一場 PvE

| 檔案:行號 | 目前行為 | 多人時應該怎麼做 | 依據 | 確定度 |
|---|---|---|---|---|
| `dispatch/gate.game.dispatch.js:242-313`（`sendGameInfoSn`，`Game_Info_SN 0x00222111`） | `mapId`、`timeLimitMinutes`、`playRound` 全部只從觸發連線自己的 `client.xxx_` 讀，且只 `client.send` 給這一個連線。 | 房間層級要有共享的地圖/回合設定（不是掛在單一 client 上），兩個玩家進同一場戰鬥時都要拿到一致的 `Game_Info_SN`。 | `[CODE]` 本段 | 確定 |
| `dispatch/room/room-game-user.sender.js:124-126,196`（`sendGameUserBootstrap`） | 每個連線各自呼叫一次，header count 固定 1，只送「自己」的 user record 給自己。 | PvE 若兩人一起打，`Game_User_Team_Get` 搜的陣列在每個玩家的用戶端裡都要包含隊友的記錄；需要把房間全體的 user record 廣播給房間全體。 | `[CODE]` 本段 | 確定 |
| `dispatch/room.dispatch.js:652-698`（同 M1 Game Start CN） | 只有觸發者收到 `Game_Start_SA`／`Ready_Success_SN`／`BeginRound_SN`。 | PvE 要兩人一起開戰，開始序列要廣播給房間全體，且要跟房主判定（M1）串起來。 | `[CODE]` 同 M1 一列 | 確定 |
| `dispatch/lobby.dispatch.js:226-279`（`0x00230123` Death_CN → `Death_SN 0x00230124`） | `client.battleStats_`（第 259 行）是**掛在觸發回報 death 事件的那條連線自己身上**的物件；`Death_SN` 也只 `client.send(deathMsg)` 給這一條連線。若 A 殺了 B，分數只記在 A 的 `client.battleStats_`，B 完全收不到這個 `Death_SN`，也不會有自己的死亡/擊殺紀錄，除非 B 自己也各自送一次 Death_CN，兩邊各記各的、永遠對不起來。 | Death 事件要廣播給房間/戰鬥雙方，擊殺/死亡統計要用共享的（依房間或依帳號，而非依連線）資料結構。 | `[CODE]` `lobby.dispatch.js:226-279`，尤其 259-274 行 | 確定 |
| `dispatch/lobby.dispatch.js:211-224`（`0x00230139` Campaign_CN → `EndGame_SN 0x00222213`） | 只回給觸發這個 CN 的連線（PvE host）自己。 | 通關結算要廣播給房間全體，否則隊友端不會收到 `EndGame_SN`，無法一起回到房間。 | `[CODE]` 本段 | 確定 |
| `dispatch/gamelogin.dispatch.js:83-92`（同 M1 第 2 列） | last_login heuristic 選帳號。 | 在 M2 更致命：兩人一起打一場的過程中，任一人若因換地圖而斷線重連（`session.js` 已證實這是常態），有機會被指派錯帳號，直接讓整場資料互相污染。 | 同 M1 列 | 確定（機制上會發生）；實際發生機率/時機未經雙人測試，不確定 |
| `dispatch/gate.game.dispatch.js`（room-map 相關 resend：`resendRoomState`/`resendRoomMapOnly`，約 484-560 行） | 這些重送函式接收單一 `client` 參數，內部一路 `client.send`；沒有任何地方對房間其他成員重送。 | 房間設定變動（地圖、回合、選項）要同步廣播給房間所有人，不只是觸發變動的那個連線。 | `[CODE]` `gate.game.dispatch.js:484-560` 函式簽名與內部呼叫 | 確定（沒有廣播這件事）；哪些欄位真的需要廣播未逐一列出，因為屬於 D1 設計範圍 |
| `dispatch/lobby.dispatch.js:267-270`（Death_SN 分數 `EXP_PER_KILL`/`POINT_PER_KILL = 10`） | 分數是 placeholder（`docs/reference/placeholder-audit.md` 已列為 (c)），且如上一列，統計掛在單一連線上。 | 待 D1／H 類任務決定真正計分規則；本篇只指出它目前沒有跨連線的共享儲存。 | `[REF]` `docs/reference/placeholder-audit.md:85` | 不確定（分數規則本身），確定（儲存位置是單一連線） |

## 沒查到 / 需要主力或後續任務補的

- `CQ_GAME_LOGIN`（0x00110124）body 的實際格式完全沒解析（`gamelogin.dispatch.js:65` 的 `body` 參數只用來印 hex），不確定 DLL 端有沒有在這個封包裡帶帳號/session 識別資訊可以取代 `last_login` heuristic——這是 M1 第 2 列能不能修的關鍵，需要 `[DLL]` 才能確認，建議另開任務查。
- `0x00220503`／`0x00220505`（房間聊天）跟 `0x00220507`／`0x00220509`（遊戲內聊天）在 client 端送出時實際用的 CQ opcode 是否真的等於 `client-dispatch-map.md` 列的 SN 值，本篇沒有核對 DLL，只確認了「伺服器目前完全沒有廣播機制」這件事本身。
- 隊伍（紅/藍）分配目前是 `Game_Info_SN` 固定 `redTeamIndex=0`／`blueTeamIndex=1`（`gate.game.dispatch.js:253-254`，已由 `docs/reference/placeholder-audit.md` 列為 (a) 有依據），但沒有查兩個玩家要怎麼分別分到不同隊；這屬於 D1 房間模型設計的範圍，本篇不展開。
- 沒有查 `money.js`／購買流程在雙人房間下是否有跨帳號污染風險（目前看起來是各自用 `accountId_` 查 DB，理論上獨立），時間關係沒有逐行核對，標不確定。
