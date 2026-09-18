# S1：單人假設盤點（多人路線先行分析）

日期：2026-09-18
狀態：🟡 待審（中階，唯讀分析，未改程式／資料庫／開關）
交付：`docs/reference/multiplayer-audit.md`（本篇只放摘要與連結，完整表格在該檔）

## 範圍與方法

依 `docs/backlog.md` S1 契約，掃描 `Metal Rage Online Server/dispatch/`（含 `room/`）、`session.js`、`server.js`、`client.js`，找出所有「假設只有一個玩家」的地方。用 `grep -rn` 找寫死的 index／slot／count，逐一回檔案核對上下文；沒有跑組語反編譯，DLL 相關的不確定點都在表格裡標出來，沒有猜。

## 最關鍵的發現（詳細見 `docs/reference/multiplayer-audit.md`）

1. **完全沒有跨連線廣播機制。** `server.js` 的 `DispatchServer.clients` 陣列存在但只給 log 用，`dispatch(client, type, data)` 的簽名只有觸發訊息的那個 `client`；`dispatch/` 全目錄沒有任何送給「其他連線」的程式碼。
2. **建房狀態全部掛在建房者自己的 `client` 物件上**（`gate.game.dispatch.js:571-650`），沒有獨立的 Room 物件；`Room_List_SN` 永遠回空清單（`lobby.dispatch.js` `sendEmptyRoomList`），第二個玩家在大廳看不到第一個玩家開的房。
3. **遊戲伺服器（30907）登入用 `ORDER BY last_login DESC LIMIT 1` 抓帳號**（`gamelogin.dispatch.js:83-92`），不是依連線本身的身份；兩人同時在線、或任一人因換地圖斷線重連（`session.js` 已證實是常態），都有機會被指派成另一人的帳號。這是目前找到最嚴重的一個根因，直接影響 M1 和 M2。
4. **Gate Enter_SA 對每個連線固定送 `0xDEADBEEF` 當 account index**（`gate.dispatch.js:46-53`），若 client 真的拿它當 user index 用，兩個玩家的 index 會相同。
5. **Game_User_SN／User_Default_SN header count 固定 1**（`room-game-user.sender.js:124-126`、`room-user.sender.js:34-52`），每個連線只看得到「自己」一筆記錄，隊友在對方用戶端裡不存在；Death_SN 的擊殺/死亡統計（`lobby.dispatch.js:259-274`）也是掛在單一連線的 `client.battleStats_` 上，只送回觸發回報的那個連線，另一方永遠收不到。

## M1／M2 分組結果

- **M1（兩個人在房間互相看得到、房間聊天互通）**：15 列，每列都是具體的檔案:行號＋現在行為＋應該怎麼做，可以直接排工。
- **M2（兩個人打完一場 PvE）**：8 列，多數依賴 M1 的 Room 模型／廣播機制先做好；額外發現 Death_SN、Campaign_CN→EndGame_SN、Game_Info_SN 都只送給觸發者自己。

## 沒查到的

- `CQ_GAME_LOGIN`（0x00110124）body 完全沒解析，不確定裡面有沒有能取代 `last_login` heuristic 的識別資訊；需要 DLL 才能確認，是 M1 第 2 條能不能修的關鍵。
- 房間聊天 `0x00220503`／`0x00220505` 與遊戲內聊天 `0x00220507`／`0x00220509` 的 CQ／SN 對稱關係沒有用 DLL 核對，只確認了「伺服器目前完全不會廣播」這件事本身。
- 隊伍分配（紅/藍）與 money.js 的雙人風險沒有深入查，留給 D1 或後續任務。

## 給 D1 的建議起點

Room 物件（成員清單、user index 分配、房主）＋「送給房內所有人／排除自己」的輔助函式，是解掉 M1 表格裡至少 8 列的共同前置需求；建議 D1 設計稿先處理這個，再逐一對表格裡的 SN 決定要不要改成廣播。
