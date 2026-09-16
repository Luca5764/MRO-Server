# `team=255` 的成因鏈 ✅ 已確認 [DLL]

> 從 docs/opcode-ledger.md 第 1439–1470 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`UZNetwork_DJ::Game_Info_URL_Get`(thunk `0x10733e71` → `0x10733cf0`)組 travel URL,
最後一個 `%d` 來自 `Game_User_Team_Get(this, [this+0x44c])`,參數是自己的 account index。

```c
// Game_User_Team_Get, 0x107024d7
iVar1 = 0xff;                       // 預設 255
// 陣列 [this+0x1034],筆數 [this+0x1038],stride 0x80
// 找 entry[0] == accountIndex
teamRaw = entry[0x34];
if (teamRaw == [this+0xff0]) return 0;   // 紅
if (teamRaw == [this+0xff4]) return 1;   // 藍
return 255;
```

`[0x1034]` 這張表**只有** `Game_User_Add`(`0x10703850`)寫,而 `Game_User_Add`
**只有** `ZDispatchGame::Game_User_SN`(`0x00222112`)呼叫。該封包先前是關閉的,
表是空的 → 查無此人 → 255 → UE2 視為未分配隊伍 → 只給 spectator 攝影機,不 spawn pawn。

這也解釋了先前修好 `User_Default_SN` 之後房間裡看得到玩家、進圖卻仍然 `team=255`:
`User_Default_SN` 填的是另一張表(`[this+0xf88]`,stride 0x50),與 `[0x1034]` 無關。

兩個 team ref 的來源:
```
Game_Info_SN → Game_Info_Team_Set(body+0x04, body+0x06) → [0xffc], [0x1000]
             → Game_Play_Start                          → [0xff0]=[0xffc], [0xff4]=[0x1000]
```
所以送 red=0 / blue=1,`Game_User_SN` 記錄的 team 欄位寫 0,就會解析成紅隊。

---

