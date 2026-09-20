# SOL-REVIEW-1 batch 1

部分成立 — `Campaign_CN 0x00230139` → `EndGame_SN 0x00222213` 進結算／回房 — `0x107d7ed0` 讀 30-byte 計分區，`0x107d8078` 呼叫 Game_End_Battle、`0x107d80ba` 切 scene 5；`session-20260917-195021.jsonl:208-209` 有 `010002` → EndGame，journal 記錄實機進結算再回房。但 state 所稱「每場第一回合結算／最後一回合時機未實測」已過期：`session-20260919-090430.jsonl:3256-3258`（ms 2296184）明確是 cleared=5/5 後送 EndGame；該完整場同時開了 `pveExtraLives=7`。

成立 — `EndRound_SN 0x00222211` 推進回合 — `0x107d7a91` 起讀 WinTeam 與兩個 14-byte team block，`0x107d7c0d` 呼叫 Game_End_Round；`session-20260919-083650.jsonl:1450-1453`（ms 1320127–1320137）為 Campaign `010001` → 30-byte EndRound `000000000000000000000000000000000100000000000000000000000000` → 10 ms 後 `BeginRound_CN 0x00230151`，且此輪 build 未開 `pveExtraLives`。

部分成立 — `pveExtraLives` 寫 `Game_User_SN` rec+0x64，命數為 3＋設定且每回合補滿 — `0x107d8d63`–`0x107d8d9f` 的 push 順序證明 rec+0x64 是 Game_Item_Add p8，`0x10734495`–`0x10734499` 將 p8 寫到 entry+0xe0；`session-20260919-090430.jsonl:1604` 的 rec+0x64 是 `07000000`。`ZModePve.uc:473-474` 明寫 DefNumLive＋PveRespawnAddCount，`:116` 後明寫成功回合 `SetNumLive(GetDefaultNumLive())`。HUD 顯示 10 只有 journal 的事後 [OBS]，沒有可獨立看的 shot；該輪相對前一輪只新增 extra-lives，但觀察完整 5 回合時 round-advance 與 extra-lives 兩者皆在作用。

成立 — `Game_Info_SN 0x00222111` 時限跟隨房間 — `0x107d4fa7` 從 frame+0x23（body+0x13）讀 u16，`DefaultGameInfo.uc:369` 以 `60 * TimeLimit` 使用；`session-20260919-012749.jsonl:138,167,171,178,502` 顯示房間值 `0x003c`、兩包 Game_Info body+0x13=`3c00`，開戰至 Campaign 為 639808 ms。build `:2` 的 nonDefault 只有 `GAME_INFO_TIME_LIMIT_MODE=room`，符合單變數。

部分成立 — Gate token 身分鏈 — `0x107dc823`/`0x107dc82a` 檢查 0/0，`0x107dc831`/`0x107dc834` 讀 body+0x06/+0x0A，`0x107dc846` 呼叫 thunk；`0x10715f70` 將兩參數存到 `0x108e5504/08`，`0x107c3ef5`/`0x107c3f00` 原樣組成 Login_Again_CQ。`session-20260919-012749.jsonl:26,32` 的 `01000000dde7ba25` 完全一致。惟 state 的「目前伺服器送 0、用 last_login」已失實：同一 log 已送非零 token，現行 `gate.dispatch.js`／`gamelogin.dispatch.js` 也已走 token（只有單帳號缺 token 才 fallback）。

部分成立 — 區網第二台登入、大廳／商城與來源 IP — `session-20260919-002245.jsonl:2-3,21,26,32,82-93` 證明 build 使用 `publicHost=192.168.0.10`＋白名單，dusk 從同一 peer `192.168.208.1` 連到 9211/30907、帳號 3，且進到商城路徑並收到 `0x00240241/42`。但「需要 portproxy＋publicHost＋白名單」一次改了三個外部條件，log 不能各自建立必要性；畫面實際進大廳／商城也只有 journal [OBS]、沒有 shot。

成立 — `Room_Boundary_SN 0x00220213` 欄位順序 — `0x107ea95d` 讀 body+0 到 ROOM_INFO+0x1c（CurrentUser），`0x107ea964` 讀 body+1 到 +0x18（MaxUser）；`ZNetwork_DJ.uc:558-566` 的 struct 與 `ZPage_Room.uc:768` 的 `MaxUser/2` 相符。`session-20260919-122616.jsonl:2760,2801` 在 cb0a8bb 後分別送 `0108`、`0208`。

成立 — READY 是 `User_State_SN 0x00220401` raw state 2 — `0x107eaf67`/`0x107eaf75` 證明 body 是 flag、count、每筆 u16 user＋u32 state；`0x107eaf86` 的 raw−2 跳表（`0x107eaff8`）把 raw 2 對到 `0x107eaf95` 的 1，`ZNetwork_DJ.uc:422` 定義 1=READY，`ZPage_Room.uc:2450` 以 State==1 畫 READY。`session-20260919-122616.jsonl` ms 6037989–6037990 也確有 `0001040002000000` 廣播。

成立 — 房主踢人 `0x00220337/38`＋`Leave_SN 0x00220236` — `0x107eeed0` 函式內 `0x107eef21/2b/34` 組 opcode、總長 0x12、u16 target；`0x107ebe97`/`0x107ebea1` 要 0/0 才成功；`0x107edbc2/c6` 讀 Leave 的 u16 user/u8 kickout，`0x107edc40` 僅 self 分支讀 kickout。`session-20260919-111258.jsonl` ms 2829050–51、2876878 的 CQ/SA/Leave hex 全相符，ms 2853745–46 證明被踢者重入；marker ms 2840598、2901899、2908433 記錄成功、強制離房提示與人數回 1。

成立 — `BOUNDARY-SWAP 實機驗證` 的可見結果 — `shots/room-ready-host.png` 確實 16 格皆黃黑關閉（只有 Lucas/test 名字），`shots/room-after-boundary-swap.png` 確實前 4 格開放、兩個頭像、test 顯示 READY、Lucas 有房主圖示；同 session 在 reload cb0a8bb 前送 `0801/0802`、後送 `0108/0208`（`session-20260919-122616.jsonl:62,238,2089,2760,2801`）。前後 build 的其他 nonDefault 值相同，未見第二個實驗變數同時切換。

## 新疑點

- `docs/research/2026-09-19-ready/notes.md` 寫 state 落在 stride 0x50 的 `+0x3c`，但 `0x1072c841`–`0x1072c84c` 實際寫 `[array + index*0x50 + 0x38]`；raw 2→READY 的結論不受影響，offset 應更正。
- `docs/state.md:76-77` 的 R-ROUND 未實測文字與 `:78`、`session-20260919-090430.jsonl` 自相矛盾；最後一回合時機已測，但該場有 `pveExtraLives=7` 同時作用（相對前一輪只新增這一個設定），解讀時應保留此條件。
- LAN 首次成功把 portproxy、publicHost、白名單一起投入，適合確認「組合可用」，不適合把三者各自標成已證明的必要條件。

## 高階處理（Claude，2026-09-19）

- 成立與部分成立的項目，都已照意見改寫 `docs/state.md`，並拿掉「未經跨公司審查」。
- 新疑點 1（state 寫在 +0x38）**不成立**：`User_State_SN` 呼叫的是 `0x10705add` → `0x1072c870`，`0x1072c8ac` `mov [eax+esi+0x3c], ecx`。`0x1072c841`–`0x1072c84c` 是前面另一個函式（寫 +0x38，也就是 PilotCode 欄位）。notes.md 的 +0x3c 維持不變。
- 新疑點 2（R-ROUND 文字過期）、3（LAN 三條件）已經在 state.md 更正。
