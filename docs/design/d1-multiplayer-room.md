# D1：多人房間模型設計稿

> 狀態：**草稿，待 PM 審查、操作者同意後才實作**（AGENTS.md「要重構先問」）。作者：Claude（高階），2026-09-18。
> 依據：`docs/reference/multiplayer-audit.md`（S1）、`journal/2026-09-18-2350-game-login-token-chain.md`、`docs/client-dispatch-map.md`。
> 目標：roadmap M1（兩個人在同一個房間互相看得到、房間聊天互通）→ M2（兩個人打完一場 PvE）。

## 1. 原則

- **每一步都要讓單人行為逐位元組不變**，用 `node test/replay-golden.js` 證明。只有第 0 步會刻意改變一個封包，要在 commit 裡寫明理由並重錄基準。
- **user index 直接用 `accounts.id`**。目前單人送的是 1，也就是帳號 1 的 id，所以單人的 bytes 不會變。不另外建一套 1..N 的編號，除非 DLL 證明客戶端有值域限制（⬜，第 3 步前要查）。
- 狀態從「掛在 client 物件上」搬到「掛在 Room 物件上」。client 只保留 `roomId` 參照。

## 2. 物件模型

```
rooms.js（模組層級，同一個 Node 程序內共用；9211 和 30907 本來就是同一個程序）
  Room { id, name, mapId, playTime, playRound, maxPlayers, campaign,
         hostAccountId, members: Map<accountId, Member>, state: 'lobby'|'playing' }
  Member { accountId, nickname, team (0 紅／1 藍), slot, ready, client (目前的連線或 null), disconnectedAt }
  byAccount: Map<accountId, roomId>
```

- 房主是建房的人。房主離開時，交給加入最早的成員，並送 `User_Master_SN 0x00220319`。
- 隊伍：PvE 全部在紅隊（`team=0`，R11 驗證過紅隊槽）；PvP 輪流分配紅藍（M4 再做）。
- `nextRoomIndex`（`gate.game.dispatch.js`）改由 rooms.js 產生。

## 3. 廣播輔助

`room.sendAll(build)`、`room.sendOthers(except, build)`：`build(client)` 對每個成員的連線各自產生 buffer。不能共用同一個 buffer，因為 `client.getMessageBuffer` 是依連線做混淆。成員的連線是 null（換地圖中）就跳過。

## 4. 斷線與重連（換地圖一定會斷）

- **身分**：第 0 步先修。Gate `Leave_SA 0x00220132` 的 body+0x06 放 `accountId`、+0x0A 放每次登入隨機產生的 key；30907 收到 `Login_Again_CQ 0x00110124` 時用 (accountId, key) 查表，取代 `ORDER BY last_login`。[DLL] `0x107dc831`–`0x107dc846` → `Certify_Away_Set` `0x10715f70` → `0x107c3ef5`。key 查不到（例如舊客戶端狀態）就退回舊的 last_login 行為並寫 log。
- **成員資格不跟著連線**：斷線時只把 `member.client = null`、記下 `disconnectedAt`，不移出房間。同一帳號重新連上時綁回原本的成員。超過寬限時間（預設 60 秒，要能設定）還沒回來，才當作離開（第 4 步）。
- `session.js` 繼續負責「每條連線自己的旗標」；房間層級的欄位（地圖、時間、回合、房主）改從 Room 讀。`campaignRoom_`、`mapChangeOneTime_` 這類欄位最後會從 session 的延續清單移除（第 5 步）。

## 5. 要改成廣播的封包

| opcode | 名稱 | 觸發 | 送給誰 | 依據 |
|---|---|---|---|---|
| `0x00220505` | Chat_Room_All_SN | 客戶端送同一個 opcode（258 bytes） | 全房 | [LOG] `session-20260918-225741.jsonl`；G7 原樣回送已實測有效（`0x00220507／09`） |
| `0x00220503` | Chat_Room_Team_SN | 同上（隊伍頻道） | 同隊 | [MAP] `client-dispatch-map.md:78`；CQ 是否同 opcode ⬜ |
| `0x00220233` | User_Default_SN | 有人進房 | 新成員收到全房每人各一筆；其他人收到新成員那一筆 | [DLL] `0x107ee2d0`（R13 已追過寫入 record+0x38） |
| `0x00220421`、`0x00220402`、`0x00220401` | User_Name／Pilot／State_SN | 有人進房、狀態改變 | 全房 | 同上 |
| `0x00220319` | User_Master_SN | 進房、換房主 | 全房 | [CODE] `room-user.sender.js:85-102` |
| `0x00220236` | Leave_SN | 有人離房 | 其他人 | [MAP]；body 格式 ⬜ |
| `0x00220204` | Room_List_SN | 大廳開啟、房間增減 | 大廳所有人 | [MAP]；body 格式 ⬜。目前伺服器送的 `0x00230103` **不在客戶端的 dispatch map 裡**，會被忽略 |
| `0x00220232` | Enter_SA（回應加入房間） | 客戶端點房間 | 加入者 | [MAP]；CQ opcode 與 body ⬜ |
| `0x00220223`／`0x00220217`／`0x00220213` | Map_Change_One／Room_Option／Room_Boundary_SN | 房主改設定 | 全房 | ✅ 格式已驗證（state.md 4b） |
| `0x00222104`、`0x00222111`、`0x00222112` | Game_Start／Game_Info／Game_User_SN | 房主按開始 | 全房；Game_User_SN 的 count 改成 N | [CODE] S1 M2 組 |
| `0x00230124`、`0x00222213` | Death_SN、EndGame_SN | 戰鬥中 | 全房 | [CODE] `lobby.dispatch.js:211-279` |

## 6. 實作步驟（每步回歸測試全綠）

0. **身分鏈**：Gate Leave_SA 帶 (accountId, key)，Login_Again 查表，查不到退回舊行為。`login-dispatch` 樣本的 `0x00220132` 會改變 → 附理由重錄。另外補一個測試：兩個帳號交錯登入，各自拿到自己的帳號。
1. **rooms.js ＋ 建房寫入 Room**：`CQ_CREATE` 同時寫 client 欄位和 Room（雙寫）。送出內容不變。
2. **廣播輔助＋房間聊天**：`0x00220505` 從「只 ACK」改成 `room.sendAll` 原樣回送。單人的行為會改變（多了一包自己的聊天回送），但這是 bug 修正，要單獨測試：房間聊天會出現在畫面上，要實測。
3. **分析任務（中階，可以提前平行做）**：用 DLL 查出 `Room_List_SN 0x00220204`、加入房間 CQ／`Enter_SA 0x00220232`、`Leave_SN 0x00220236` 的 body 格式，以及 user index 的值域。
4. **大廳房間清單＋加入房間＋離開房間**：用第 3 步的格式實作。單人：大廳會開始看到自己的房間（實測）。
5. **房主與斷線寬限**：`User_Master_SN` 從 Room 讀；斷線寬限；房間欄位從 session 延續清單移除。
6. **M2：開戰廣播**：Game_Start／Info／User 送給全房，Game_User_SN 的 count 改成 N；Death／EndGame 廣播。
7. **M2 風險：主機（listen server）**：PvE 是其中一個客戶端開 `?Listen`，其他人直接連到它，走 UE2 的 P2P 連線，不經過我們的伺服器。`Ready_Host_SN 0x00420115` 目前送的是伺服器的 `socket.localAddress`（S1），多人時必須改成**房主客戶端的 IP**，而且其他人要連得到（區網或 VPN）。UE 的遊戲埠（預設 UDP 7777）也要開，⬜ 待查客戶端用哪個埠，這可能是 N0 還要補的防火牆規則。

## 7. 不做的事

- 不做跨程序、不做持久化房間（伺服器重啟，房間就沒了）。
- 不做 PvP 分隊邏輯（M4）。
- 同一個 NAT 後面兩人的情境不特別處理：有了 token，就不需要靠 IP 認人。
