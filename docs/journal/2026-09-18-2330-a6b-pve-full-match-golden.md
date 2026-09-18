# A6b：PvE 整場通關黃金樣本 `pve-full-match`

任務：`docs/backlog.md` A6b。執行者：Claude Sonnet 子 agent（中階），worktree
`~/mro-wt/a6b`（分支 `flash-wip-a6b`）。狀態：🟡 待審（中階不可標 ✅）。

## 樣本來源

`logs/session-20260918-205012.jsonl`，conn 2（game server, port 30907），第
27 行（`0x00110124` 遊戲伺服器再登入）到第 9243 行（`Leave_CQ 0x00220234`）。
用 `node test/extract-golden.js <log> 2 pve-full-match --until 0x00220234`
一次切完，單一 connId、單一連續片段，未拼接。

**[OBS]** 這是 `logs/` 底下唯一出現過 `Campaign_CN 0x00230139` 的 session
（`grep -c '"op":"0x00230139"'` 對其他每個 log 都是 0）；契約點名的 3 次成功
通關（body `010001`）都在這個 log 的第 1601、8143、9231 行，全部在同一個
conn 2 上——玩家在整場 30 分鐘內沒有離開過房間，`Leave_CQ` 只在第三次通關
後送出一次（第 9243 行）。第 6938 行還有第 4 次 `0x00230139`，body 是
`010002`（非 `010001`，猜測是失敗/重試分支，未深究，不在本樣本的驗證範圍）。

## 為什麼是整場三輪，不是單輪

契約寫的流程（建房→F5→…→Campaign_CN→EndGame_SN→回房間→Leave_CQ）在這個
log 裡只有「三輪打完那一次」才會走到 `Leave_CQ`；前兩輪打完後客戶端回的是
`Hangar Open_CQ`（回機庫/商店），不是 `Leave_CQ`，要到第三輪才真的離開房間。
單輪切法（切到第 1601 行左右）拿不到 `Leave_CQ`；把「第一輪」和「第三輪尾端
的 Leave_CQ」兩段拼在一起雖然技術上可行（`Leave_CQ` 只依賴 `campaignRoom_`
等房間旗標，中間兩輪不會改變這些欄位），但契約寫的是「切一段」（單數、連續），
拼接違反這點，而且不算是真的封包序列。所以照 AGENTS.md「客戶端行為 > 我們的
假設」，直接用這個 log 實際發生的樣子：三輪打完才 Leave，樣本就包三輪。

**副作用：`expected.jsonl` 約 13MB**（8383 筆 send，對照其他樣本的幾十到
508K）。主要是 `0x00230123`（recv，約 350 筆，逐一被目前的
`lobby.dispatch.js` case 0x00230123 當成 Death_CN 回 Death_SN）撐大的——這是
現有 dispatch 行為，本任務沒有改它。這個檔案大小是否要收斂（例如另外找/等一
個更短的通關 log），留給審查者判斷；已寫進 `test/README.md`。

## 驗證跑法

```
cd ~/mro-wt/a6b/"Metal Rage Online Server"
node test/replay-golden.js --record pve-full-match   # 8383 packets, 無 UNHANDLED、無例外
node test/replay-golden.js                            # 全部 4 個樣本 PASS
```

改動 `dispatch/room/room-game-user.sender.js` 的 `SLOT_COUNT`
（`Game_User_SN 0x00222112` +0x6C）多寫 1，`pve-full-match` FAIL：
`body mismatch on op=0x00222112 at byte offset 0x6e`。還原後全綠。

改動 `dispatch/lobby.dispatch.js` `EndGame_SN 0x00222213` +0x10
（team B 欄位）由 1 改 2，`pve-full-match` FAIL：
`body mismatch on op=0x00222213 at byte offset 0x10`。還原後全綠，
`git diff` 乾淨（只多出 `test/golden/pve-full-match/` 未追蹤檔）。

## 沒有動到的東西

- `extract-golden.js`、`replay-golden.js`、`fake-client.js`、`fake-db.js`、
  `fake-timers.js`：都不用改，現有機制直接吃得下這個樣本（含
  `saveEquippedLoadout not mocked` 的既有 fallback，會在 log 裡出現多次
  「save failed」但不中斷，不是新問題）。
- 沒發現計時器/`Date.now()` 相關的非決定性邏輯需要額外假時鐘處理——
  `PVE_SLOT_SELECT_FLOW` 預設是 `'client'` 分支，不會走 `lobby.dispatch.js`
  裡那個 250ms `setTimeout` 的 Respawn 路徑；連跑兩次輸出逐位元組相同。
- 沒有改 dispatch 的任何預設行為。

## 待審 / 留給高階的判斷

1. `pve-full-match/expected.jsonl` 約 13MB，是否接受進 git，或改用更短的
   通關 log（目前沒有更短的）、或事後另寫工具裁切掉部份重複的
   `0x00230123`/`Death_SN` 對再重錄基準。
2. 第 6938 行那個 body `010002` 的 `0x00230139`（本樣本內也包含，但沒有
   特別驗證）是什麼含義，不在本任務範圍。
