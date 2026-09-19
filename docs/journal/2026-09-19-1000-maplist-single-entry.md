# MAPLIST 實作：SN_MAP_CHANGE_ALL 單筆模式（中階，🟡，未經跨公司審查）

狀態：🟡 待審。開關 `mapAllSingleEntryMode`（`room-map.sender.js`）預設 `disabled`，行為完全不變；未實機測試，等高階排實測。

## 根因（高階已核對）

- [SRC] `~/mro-decrypted/src/ZGameMainMenu/ZPage_Room.uc:654-686` `UpdateRoomInfo()` 對 `MapInfo[0..5]` 逐筆處理：每一筆 `Index` 非 0 的地圖都會執行 `p_PVE.m_Difficulty = MapInfoList[j].PlayPve`，迴圈沒有 `break`。所以清單裡**最後一筆非 0** 的地圖才決定難度燈，不是玩家實際選的那筆。
- [DLL] 客戶端只存清單前 `MAX_MAP_COUNT=6` 筆（`0x107ebc1d`，`research/2026-09-18-map-list-zero/`）。
- [CODE] 現行 `Map_Change_All_SN 0x00220226` 固定送 `CAMPAIGN_MAP_ALL_HINTS = MAP_IDS_PVE`（9001..9012，`room.dispatch.js:178-189`），共 12 筆，客戶端只吃前 6 筆——這 6 筆幾乎不可能剛好是玩家選的那筆排在最後。這是 H6「難度燈慢一拍／跳到別的值」現象的候選根因之一（`docs/backlog.md` H6）。

## 修改（一個變數：ALL 封包的筆數／內容）

- `Metal Rage Online Server/dispatch/room/room-map.sender.js`
  - 新開關 `mapAllSingleEntryMode`（`let` + `isMapAllSingleEntryEnabled()` + `_setMapAllSingleEntryModeForTests()`，跟 `rooms.js` 的 `roomJoinMode` 同一套寫法，讓 `packetlog.js` 的 `SWITCH_RE`（camelCase `xxxMode`）掃得到），第 30-40 行左右，預設 `'disabled'`。
  - `sendRoomMapPackets()`（約第 102-160 行）新增 `allMapList`／`allEffectiveSelectedIdx`：enabled 時把送進 `sendMapChangeAllPacket()` 的清單縮成 `[mapList[effectiveSelectedIdx]]`（也就是目前實際選的地圖，來源同 `Game_Info_SN` 用的 `campaignMapCacheKey`／`client.campaignMapCacheKey_`，見 `room.dispatch.js:1482-1490` 的註解與 `journal/2026-09-18-08-room-map-sync.md`），selectedIdx 固定 0。`sendMapChangeOnePacket()` 呼叫不變，仍用原本完整 `mapList`／`effectiveSelectedIdx`。
  - 唯一一筆的 record+0x04（selected 旗標欄位）寫法沒動：因為 `i === effectiveSelectedIdx` 在單筆模式下 `i=0, effectiveSelectedIdx=0`，跟原本邏輯算出的結果一樣是 1。**沒有動 record+0x04 代表什麼的問題**——state.md 4b 節標它是 Round 而非選中旗標，這裡照舊維持原值，不下新結論。
  - `sendRoomMapPackets()` 只在 `client.isTrueCampaign_`（PvE 房）為真時才會跑到這段（函式開頭就 `if (!client.isTrueCampaign_) return`），所以 PvP 房本來就不會呼叫到這個 sender，不需要另外判斷。
  - 沒有動 `MAP_ALL_HEADER_MODE`／`MAP_ALL_SEND_TWICE`／`MAP_CHANGE_ONE_SETTINGS_MODE`／`MAP_CHANGE_ORDER_MODE`（R7/R7b，維持 disabled）、`ROOM_MAP_SYNC_MODE`（R1）。
- 新增 `Metal Rage Online Server/test/map-list-single.js`。

## 驗證

```
node test/replay-golden.js        # 全綠，pve-full-match 8383 packets PASS（disabled，逐位元組同前）
node test/map-list-single.js      # 2 案例 PASS：disabled count=12（原 12 筆 hint list 不變）；enabled count=1、mapId=選中值、selected=1
node test/console-commands.js / exception-guard.js / extra-lives.js / login-token.js /
     room-chat.js / room-join.js / rooms.js / round-advance.js / whitelist.js
                                   # 全部 PASS（未受影響）
```

`node --check dispatch/room/room-map.sender.js` 通過。

## 待實測（高階排場次）

1. 開 PvE 房，開關切 enabled 後看房間面板中間的地圖清單是否只剩 1 筆（而不是 12 筆裡挑一筆顯示）。
2. 只點一次「初級」，看難度燈是否**第一次就**亮初級、目標回合是否立刻顯示 5（不用再點第二次）。
3. 再點一次「高級」，看是否立刻變 10，不再出現 H6 記錄的「跳到另一個值」（`session-20260919-012749.jsonl:124,148`）。
4. 若還是慢一拍或跳值，代表根因不只是清單筆數，還有其他寫入／重繪順序因素（R7/R7b 已排除「ALL 排在 ONE 之後」這條路，此開關不改送出順序，只改 ALL 的內容）。

## 限制與未做

- 未實機測試，未跨公司審查，不標 ✅／❌。
- 沒有動 `sendMapChangeOnePacket()`、送出順序、`R7/R7b` 的 `MAP_CHANGE_ORDER_MODE`。
- 沒有處理「record+0x04 其實是 Round」的線索（backlog H6 停放清單提到的另一個變數），留給後續任務。
- worktree：`~/mro-wt/maplist`，分支 `flash-wip-maplist`，未合併、未重啟伺服器。

## 實機驗證（2026-09-19，單人，Claude 高階）

- build：`test-server@f2a31c9 dirty=true nonDefault=[GAME_INFO_TIME_LIMIT_MODE, PVE_ROUND_ADVANCE_MODE, mapAllSingleEntryMode, lobbyRoomListMode] … pveExtraLives=7`（`/reload` 後）。
- [OBS] (1) 中間清單只剩 1 筆 ✅；(2) 按一次「初級」燈號第一次就對、目標回合 5 ✅；(3) 「高級」燈號與 10 回合正確 ✅。→ H6 根因（最後一筆非 0 的 MapInfo 決定燈號）成立。
- [OBS] ❌ **回歸：房內「選擇地圖」下拉選單只剩「潛入作戰」**，換不到別張地圖。state.md 4b「下拉選單全由客戶端從 Cache 算」看來不完全成立：下拉選項似乎也取自 MapInfo 清單。已派 MAPLIST-2 分析下拉資料來源與「每張地圖一筆」的送法。**在找到能同時滿足下拉與燈號的送法之前，這個開關不能設為預設。**
- [OBS] H7（設定對話框地圖清單空）沒有變化。
- 未經跨公司審查。
