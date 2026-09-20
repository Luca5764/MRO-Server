# 待跨公司審查清單（2026-09-20 review-audit 整理）

給 Sol 恢復額度後用。方法：`grep -rn 未經跨公司審查 docs --include=*.md` 之後，逐一核對每個 marker
旁的內容是否已被 `docs/research/2026-09-19-sol-review/batch1.md`～`batch5.md`（含 `batch4b.md`）或
`docs/research/2026-09-20-moon-verify/notes.md` 涵蓋；已涵蓋的已改寫成「已由 Sol batchN 審查」並附出處，
不再列在這裡。下表是**核對後仍然找不到對應審查記錄**的項目。

一個例外沒列進來：`docs/research/2026-09-19-sol-review/batch1.md:31` 本身還留著這個詞，但那只是在描述
「已經拿掉未經跨公司審查」這個動作的句子本身，不是一個待審張述，不需要處理。

| 檔案 | 主張（一句話） | 為什麼重要（錯了會怎樣） | 優先度 |
|---|---|---|---|
| `docs/journal/2026-09-19-2350-disable-xigncode-patch.md` | 停用 XIGNCODE 的 patch（操作者已審批同意執行） | 直接碰觸硬性約束「不繞過反作弊」的邊界，即使操作者已同意，仍需要跨公司再核對一次「純分析 vs 修改」的界線 | high |
| `docs/journal/2026-09-19-2150-pico-hid-first-test.md` | Pico HID 硬體鍵盤輸入這次沒有被 XIGNCODE 擋下 | 同樣觸及「不偽造輸入來源」的硬性約束邊界；若這個判斷錯，後續 Pico 自動化測試的合法性都要重新檢視 | high |
| `docs/journal/2026-09-19-2230-unattended-trial-01.md` | Pico 用 F24 開主控台送 `GameCampaign 1` 等作弊指令，能無人值守跑完整場 PvE（`U-pve-fullmatch` PASS，含原版客戶端一次） | 同上，涉及反作弊邊界；另外這條路徑等於繞過遊戲進度限制，要確認是否在「純分析可以，修改不行」的界線內 | high |
| `docs/journal/2026-09-20-1530-m3r-vpn-rehearsal.md` | M3r VPN 跨網預演結果（章節「結果 ✅」） | 直接關係到專案終局目標「朋友跨網 VPN 連線」是否可行，判斷錯會誤導後續架構決策 | high |
| `docs/journal/2026-09-19-2120-m2-acceptance.md` | (1) M2 驗收條件「區網兩人完整打完一場 PvE：開始→戰鬥→結算→回房間」達成；(2) dusk 當房主時 `Ready_Host_SQ`／`CA`／`Ready_Host_SN` 角色互換正常 | 這是多人 PvE 的里程碑判定，若條件其實沒有真的滿足（例如封包層級看似對但畫面沒對齊），會讓後續排程建立在錯誤的基礎上 | high |
| `docs/design/p3-step1-writeback.md` | P3 對局結果寫回 DB 的設計稿與高階推論審查（欄位對應、寫回時機、粒度修正） | 文件本身已明寫「DB 結構實作等 Sol」——一旦照這份設計跑 migration，寫壞的是玩家戰績資料，錯了很難回頭 | high |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（M1 實測 1 後修正／D1-4b，89-165 行） | `Room_List_SN` 三個欄位重新拆解的 offset：RoomType raw→norm 對照表、USER_COUNT 兩個 byte 順序對調、MAP 6-byte 區塊 MapIndex 在尾端不在開頭 | 大廳房間清單目前唯一的位元組層級依據；三個 offset 任一個錯，房間列表顯示（type/人數/地圖）就會整批錯 | high |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（D1-4c，184-207 行） | 加入者看到 PvP 畫面（不是 PvE）的根因：`roomType` 欄位語意跟 `Room_List_SN` 的正規化值撞名，且 Enter_CQ 完全沒送地圖／Campaign 封包給加入者 | 這是「加入者能不能正常看到 PvE 房間」的核心修正，錯了會讓多人 PvE 完全不能用 | high |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（J1b，216-283 行） | `resendRoomState()`／`resendRoomMapOnly()` 對非房主重送時，原本錯讀觸發連線自己的 client 欄位（房主/地圖因此錯亂），改成依 `room.hostAccountId` 判斷、從 Room 物件讀 | 影響「非房主按準備鍵」這個高頻操作是否會把房間狀態搞亂；跟上面 D1-4c 是同一類「client 欄位 vs Room 物件」根因，兩處都要核對 | medium |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（READY-IMPL，415-480 行） | 非房主按 F5 送 `Game_Ready_CN`，伺服器用 `User_State_SN` raw=2 對全房廣播 READY 狀態 | 決定「準備」功能的廣播範圍是否正確；已有 [LOG] 證實封包送對但畫面沒畫 READY 字樣（交給 SLOT-DRAW），封包層本身未經審查 | medium |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（ROOM-OPT-BC，376-413 行） | 房主改難度時，新增 `ROOM_MAP_BROADCAST_MODE` 開關把 `Map_Change_One_SN` 轉送給非房主 | 影響房主改變戰役難度時，加入者畫面會不會跟著更新 | medium |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（LOBBY-LIST-LOGIN，547-577 行） | 房間已存在時才登入的連線，在 channel enter 補送一次完整 `Room_List_SN` | 影響「先建房、後登入」這個常見時序下，大廳清單是否完整 | medium |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（SELF-AVATAR-EXP，487-486 行附近） | 「畫面開著時再收一次」的時序假設——這條已經被同一份文件後面的 BOUNDARY-SWAP 段落推翻（真正原因是格子被當成關閉，不是時序） | 風險較低：結論本身已經是「不成立」，留著待審只是為了完整性，不影響現行程式 | low |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（兩人開戰第四/五次與第一次完整場，774/779/785/786 行） | RHSN-IP／RESPAWN-IDX 上線後的雙機實測結果：加入者成功進場同場、完整打完 5 回合並各自看到 EndGame_SN／Rank S | 这些是 RHSN-IP、RESPAWN-IDX 修正（已由 Sol batch3 審查其程式碼本身）在雙機上的**經驗結果**，跟 batch3 審查的是不同層次（代碼正確性 vs 實測是否真的如預期），仍需要人核對 | medium |
| `docs/journal/2026-09-19-0330-d1-step4-room-join.md`（文件開頭 §1 行，Enter_CQ/斷線即離開等 D1-4 主體） | 整份 D1 第 4 步實作（大廳清單、加入、斷線即離開）的原始版本 | 是後續所有 D1-4b/c、J1、J1b、KICK 等段落的地基；地基本身沒有單獨被任何 batch 審查（各 batch 審的是後續修正） | medium |
| `docs/journal/2026-09-19-1000-maplist-single-entry.md` | MAPLIST／H6／H7 地圖選單相關：`Map_Change_All_SN` 單筆模式、下拉選單來源、MapInfo 在 9211→30907 之間遺失的機制、PvE MaxUser=16 讓地圖篩選通過 | 房內選地圖的 UI 是否可用；`docs/state.md:131` 直接引用這份文件的結論 | medium |
| `docs/journal/2026-09-19-1013-rank-fixed-experiment.md` | `User_Score_SN` 固定值實驗（`pveFixedRank`） | 決定 PvE 結算評等（Rank）目前用的是寫死值還是真實計算，影響玩家看到的結算畫面是否合理 | medium |
| `docs/research/2026-09-19-rank/notes.md` | `User_Score_SN` body 佈局（WinTeamRank/WinTeamScore/雙隊 14-byte 記錄）、Rank 永遠 F 的根因（伺服器從未送過 `0x00222221`） | 是上面 RANK 實作的分析基礎；`WinTeamRank` 寫入點 `0x10707275`/`0x1071b4b0` 的 DLL 位址未經第三方核對 | medium |
| `docs/research/2026-09-19-r-round/notes.md` | `Campaign_CN 0x00230139` body 不帶回合數（body[2] 只有 1/2 兩種值）、伺服器自行記錄回合的設計 | R-ROUND 機制的分析基礎（EndRound_SN 本身的「成立」已由 batch1 審查，但這篇 Campaign_CN 送出格式分析是不同位址、未經審查） | medium |
| `docs/reference/multiplayer-audit.md` | RS-AUDIT：掃描所有「對某連線重送房間狀態」的呼叫點，列出哪些讀 Room 物件、哪些讀觸發者 client 欄位 | 這份掃描是 J1b 類 bug（讀錯連線欄位）的預防基礎；掃描本身若有漏網呼叫點，之後還會出現同類 bug | medium |
| `docs/research/2026-09-18-d1-room-formats/battle-host.md` | 「收到 `Ready_Host_SQ` 的客戶端就會當 P2P 房主」（`[this+9]` 旗標，`HostChange_SN` 用於中途換房主） | 決定開戰時誰是 P2P listen host 的核心機制；跟 batch2 審查的 Ready_Host_SN body/gating 是不同的 DLL claim（這篇是「誰變成房主」，batch2 是「CA 格式與 gating」） | medium |
| `docs/journal/2026-09-19-0100-d1-step1-rooms.md` | `rooms.js` 房間登錄表雙寫機制（D1 第 1 步基礎） | 後續所有房間功能（D1-4/4b/4c/6…）都建立在這個 registry 上 | medium |
| `docs/backlog.md`（IS1，125 行） | 客戶端 `ITEM_DETAIL_INFO` 沒有「屬於哪台機」欄位，跨機使用靠 `IsShare`／`ItemSubordinateCheck` 決定 | E1 設計（已由 batch4/4b 審查實作部分）的分析前提；如果這個前提錯，E1 整個資料庫拆表方向就錯了 | high |
| `docs/design/e1-item-ownership.md`（IS2，211 行） | `Item_Add`（`0x10732450`）用 catalog 值在 record+0x4c bit5 自行算出 `IsShare`，伺服器不需要在 35-byte ItemInfo record 裡送這個位元 | 決定 E1 是否需要改動 wire record 本身；如果錯，`ItemList[n].IsShare` 客戶端畫面會依然不對 | medium |
| `docs/journal/2026-09-19-0200-d1-step2-room-chat.md` | 房間聊天封包回送與「聊天內容固定在 UI 上」的畫面判讀（已有操作者二次確認是正常顯示，非顯示 bug） | 房間聊天是否正常廣播；操作者已口頭二次確認，風險較低 | low |
| `docs/journal/2026-09-19-0215-no-reconnect-during-battle.md` ＋ `docs/journal/2026-09-19-0230-reconnect-was-frame-bug.md` | 開戰／結算／換地圖都不會觸發 30907 自動重連；`Login_Again_CQ` 是每條連線標準握手，不是重連事件 | 這兩篇的結論已經寫進 `AGENTS.md` 陷阱表（「30907 斷線後客戶端不會自動連回」），如果錯了，陷阱表本身就是錯的 | medium |
| `docs/journal/2026-09-19-1749-room-name-big5.md` | 房間名 Big5 位元組保真、`Name_Change_CQ 0x00220218` 補 handler、`Name_Change_SA` 格式 | 中文房名建立／改名功能是否正確 | low |
| `docs/research/2026-09-19-legend-grant/notes.md` | 傳說機發放（8 台/帳號）實測通過、`Packege_Item_SN` 63 筆上限 bug 修正（改依 frame 大小算，上限 125 筆） | 影響玩家物品清單是否完整顯示；已有操作者回報「兩台都出現了」 | low |
| `docs/research/2026-09-20-roomlist-empty/notes.md` | LEAVE-LIST 修正：離開房間回大廳時補送一次完整 `Room_List_SN` | 影響離開房間後大廳清單是否完整；已有 2026-09-20 實機驗證 | low |
| `docs/journal/2026-09-19-1249-old-client-inventory.md` | 舊版台版客戶端盤點（唯讀、靜態掃描） | 純資訊蒐集，不影響任何程式行為 | low |
| `docs/journal/2026-09-20-1240-stutter-root-cause.md` | Win11 卡頓「真正的機制」結論（章節「真正的機制」） | 決定要不要繼續往這個方向修卡頓問題；錯了會浪費後續除錯時間，但不影響正確性風險 | medium |
| `docs/roadmap.md` / `docs/state.md:131` | roadmap 的 M1 里程碑「同房互見」整體判定；state.md 的 MAPLIST/H7 條目（措辭已註明「未經跨公司審查」） | 這兩處是彙整性條目，底下引用的多數證據分散在上面各行已個別列出；等各別項目審完，這兩處可以直接收斂 | low |

## 統計

- 原始 33 個檔案帶有 marker。
- 本次改寫（Sol batch1–5 涵蓋）：backlog.md、t1-time-limit.md、d1-step0-login-token.md、r-round-impl.md（3 處）、
  d1-step4-room-join.md 內 7 段（KICK、KICK 實機驗證、BOUNDARY-SWAP 標題與實機驗證、D1-6-IMPL、D1-6 fix round
  措辭澄清、RHSN-MAP）、e1-item-equips.md、p1b-default-items.md。
- 本次改寫（Moon 外部驗證涵蓋）：game-user-sn-multi.md（1 處，附帶位址更正說明）。
- 仍然待審（列在上表）：27 個檔案／約 45 條個別主張（d1-step4-room-join.md 一份文件內拆成多條）。
