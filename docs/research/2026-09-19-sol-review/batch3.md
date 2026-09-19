# SOL-REVIEW-3（2026-09-19）

## Part A：已合併項目

- 通過 — RHSN-MAP — `Metal Rage Online Server/dispatch/gate.game.dispatch.js:345-353,361-373` 的表與 `Cache.Bin` 原始項目相符；抽查 `9001@0x17b7=Map_PC01`、`9004@0x1a30=Map_PC03`、`9007@0x1ca0=Map_PC02`、`9010@0x1f37=Map_PC04`、`1041@0x449=Map_N05_de`、`1051@0x514=Desert`、`1081@0x77e=Map_N17`。`/mnt/c/Games/MetalRage Online/data/Log/MetalRage.log:115,309,711` 仍有 host 的 `start Map_PC04?Listen`。注意 RHSN-IP 後，non-host 路徑已不再序列化此 map 名稱。
- 通過 — RHSN-IP — `gate.game.dispatch.js:361-413,437-445` 對 non-host 只送裸 IP。DLL `0x107d575d` 取 body+`0x03`，`0x107d5778`/`0x107d57a2` 將複製長度上限截為 `0x10`，`0x107d57b8` 讀 body+`0x00` port；`Game_Info_URL_Get` 實體 `0x10733cf0` 在 `0x10733e88-0x10733eaa` 自行以 `start %s:%d/%s?team=%d` 組 IP、port、map，故送 `IP/M:port/map` 確實錯誤。
- 通過 — RESPAWN-IDX — `Metal Rage Online Server/dispatch/lobby.dispatch.js:505-520` 讀 `Respawn_CN` body+`0x00` 的 u16。DLL sender `0x107d96e0` 在 `0x107d9744` 寫 frame+`0x10`（body+`0x00`）u16 UserIndex；`Respawn_SN` handler `0x107d5b60` 在 `0x107d5b9a` 讀 frame+`0x1a`（body+`0x0a`）作為要生成的 user。

## Part B：flash-wip-d16s3

- 通過 — 開關關閉時 byte-identity — `rooms.js:182-201` 預設 disabled；`lobby.dispatch.js:379-420,467-514,581-618` 關閉時都走原本 client 單播，EndRound／UserScore／EndGame／Death 的 builder 欄位與舊碼一致。`gate.game.dispatch.js:1515-1522` 額外 room 欄位不產生封包；replay 測試亦通過。
- 需修改 — non-host handling — `lobby.dispatch.js:363-372` 正確拒絕房內 non-host 的 `Campaign_CN`，但 `:518-618` 的 `Death_CN` 完全沒有同等 host gate，仍會改 shared `room.battleStats` 並廣播。`test/battle-end-broadcast.js:166-173` 只測 non-host Campaign，Death 測試 `:191-219` 只有 host。實機 `logs/session-20260919-150041.jsonl` ms `3101434-4362230` 的 5 個 Campaign_CN、605 個 Death_CN 全由 host conn12 發出，因此沒有證據支持接受 non-host Death_CN。
- 需修改 — round/reset ownership — `gate.game.dispatch.js:1519-1522` 不受 `BATTLE_END_BROADCAST_MODE` 或 host 身分限制，任何 tracked member 的 battle-start 都可清 room round counter；`lobby.dispatch.js:230-248` 又在 `:250-262` 的 BeginRound host/去重接受判定之前清 `room.battleStats`，被拒絕的重複 BeginRound 仍可能抹掉本回合已累積資料。
- 通過 — joiner 離開戰鬥所需訊息 — DLL `EndGame_SN` handler `0x107d7ed0` 解析雙方結果後，joiner 分支於 `0x107d8078-0x107d808a` 呼叫 `Game_End_Battle`，並於 `0x107d80ba-0x107d80df` 設 Scene 5；`ZGUIController.uc:539-583` 與 `DefaultPlayerController.uc:8590-8641` 接續 PVE result 流程。故廣播 EndGame_SN 足以讓 joiner 進結果流程；同 ms 的 User_Score_SN 提供結果資料。
- 疑點 — Death_SN 是否在 joiner 重複計數 — handler `0x107db4d0` 在 `0x107db8b3-0x107db8ea` 兩次呼叫 `Game_User_Battle_Set`；實體 `0x1072d720` 是覆寫統計欄位，不是累加 K/D，因此單次廣播不會把 K/D 加兩次。但 `0x107db900-0x107db912` 仍呼叫 `Game_Action_Death`，其 `0x1072e153-0x1072e15f` 會遞增另一內部欄位；目前無證據排除 joiner 已由 Unreal/P2P 執行同一副作用，需實機比對一次。缺少 non-host CN gate 也可能實際製造重複 SN。
- 通過 — room 中途刪除 race — 新 Campaign/Death 路徑沒有 timer、await 或 callback；同一 dispatch 內不會被插入 room deletion。`rooms.js:352-363` 最後一人離開才 delete，`:398-405` 的 `sendAll` 重新查 room，已刪除即 no-op，member/client 不存在亦跳過；host 離開但尚有人時會在 `room-leave.js:71-101` 重新指定 host。未見 use-after-delete 或例外路徑。

## Must fix before live test

- 對 `Death_CN 0x00230123` 加上與 Campaign 相同的 current-room-host 驗證，並補 non-host 不改 stats、不送封包的測試。
- 把 `room.battleStats` reset 移到 BeginRound 真正通過 host／去重判定之後。
- `pveRoundsCleared_` 的 battle-start reset 應受本功能開關與 current host 驗證保護，避免 non-host 清 shared state。

## 新疑點

- RHSN-IP 後 non-host 封包不再包含 map 名稱，現有 RHSN-MAP 測試已無法覆蓋 mapping table；表本身此次以 `Cache.Bin` 驗證，但後續新增 map 時容易無測試保護。

## 高階處理（Claude）
- Part B 三項「需修改」＋新疑點（地圖表測試）全部交原 worker 修（commits e2b3334、7fd16d2、01ad9d1、6fb64fd），已合併進 reverse-work（3d685cd）。battleStats 重置現在同時需要 BATTLE_END_BROADCAST_MODE 和 ROOM_BATTLE_START_BROADCAST_MODE，可以接受，因為實際開戰時兩個本來就會一起開。
- Death_SN 在加入者端的 Game_Action_Death 副作用是否重複：留待實機比對。
