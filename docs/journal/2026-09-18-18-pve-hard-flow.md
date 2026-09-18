# P3 困難潛入作戰「只打到簡單段落」：log 不支持「難度沒生效」

狀態：🟡 高階初審（Claude）；只分析，未改程式。子 agent（explorer，中階）做時間線與 SRC 追蹤，高階抽驗後重新解讀了 session 對應。

## 結論

1. **兩個症狀出自兩場不同的 session，而且各自都跟伺服器送出的難度一致。**
   - [LOG] `session-20260918-205012.jsonl`（測試 worktree `/tmp/mro-sol-test.eudtCb`）：建房 CQ `0x00220201`（行 1256、9319）與唯一一筆 `Map_Change_One_CQ 0x00220221`（行 1288）都是 `0x2332`＝**9010、Round 5（簡單）**；所有 `Game_Info_SN 0x00222111` 都是 `…0032230a0005…`＝9010／5。三次 `Campaign_CN 0x00230139` body `010001`（成功，行 1601、8143、9231）加一次 `010002`（失敗，行 6938），每次都有回 `EndGame_SN 0x00222213`。→ **通關的那幾場本來就是簡單房。**
   - [LOG] `session-20260918-214305.jsonl`：最後一次 CQ 選 9012／Round 10，`Game_Info_SN` 送 `…0034230a000a…`＝9012／Time 10／Round 10。429–547 秒之間有 27 筆 `Death_CN 0x00230123`，之後到 1351 秒都只剩心跳，**完全沒有 `Campaign_CN`、`EndGame_SN`、`Timeout_CN 0x00230111`**。→ **困難那場沒有打通，也沒有結束，只是停住了。**
   - 因此「選了困難卻只打到簡單段落」目前沒有任何一場 log 能對上。這可能是兩場的觀察被混在一起。⬜ 需要找盲測玩家確認。
2. **三條命是全難度共用的設計值，不是 bug。**
   - [SRC] `ZModePve.u` defaultproperties `DefNumLive=3`（`tools/uetool decompile ZModePve.ZModePve` 第 17 行，高階重跑確認）。`ZSetCoreModePve` 沒有覆寫。
   - [SRC] `~/mro-decrypted/src/ZModePve/ZModePve.uc:473-474`：`SetNumLive(DefNumLive + ItemInfo.PveRespawnAddCount)`，沒有任何地方依難度或 Round 調整命數。
3. [SRC] `ZModePve.uc:128`：`bSuccess && PRManager.CurrentRound >= GameInfo.MapInfo.Round` 才算整場完成，而 Round 已正確送 10。

## 另案：TimeLimit 寫死 10 分鐘

- [CODE] `gate.game.dispatch.js` 的 `const timeLimitMinutes = 10;` 不跟隨房間的 PlayTime（困難房選的是 60）。這屬於 H5 那一類佔位值。
- [SRC] `DefaultGameInfo.uc:395-404`：因 TimeLimit 結束時，走的是 `Game_Timeout()`，不是 `Game_Campaign()`。
- 214305 那場在 547 秒就停止了，還沒到 600 秒，所以跟本案無關。**但困難模式十個回合很可能打不完就撞到 10 分鐘上限**，值得另開一案。

## 缺口

- ⬜ `PveRoundManager` 換回合的條件：解密出來的 src 沒有這份原始碼，uetool 只能還原 defaultproperties（`BaseRoundTime=180.0`）。
- ⬜ 214305 那場在 547 秒後停住的原因：可能是三條命用完，也可能是回合卡住。要逐筆解讀那 27 筆 Death_CN 的 victim，欄位定義見 `2026-09-17-13`。

## 下一步（單變數）

- 請操作者開一場困難房，照常打，並用 marker 記下命數用完的時間點與畫面，以區分「命用完」和「回合卡住」。
- TimeLimit 跟隨 PlayTime 另開一案，放在預設關閉的開關後面。
