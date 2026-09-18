# Dispatch 模式開關盤點

盤點基準：分支建立時的 `reverse-work` HEAD `ea3f1d8`。掃描範圍是
`Metal Rage Online Server/dispatch/`；除 27 個名稱帶 `MODE`／`FLOW` 的宣告外，
也納入 6 個實際控制 alternate path 的常數：`MAP_ALL_SEND_TWICE`、
`GAME_INFO_SN_WITH_ROOM_STATE`、`MAP_CHANGE_ONE_SA_EXPERIMENT`、
`PURCHASE_ITEMINFO_REFRESH`、`SHOP_COMPAT_EXPERIMENT`、`ITEM_INFO_INCLUDE_BODY`。
`ITEM_INFO_CHUNK` 等只調整數值、不選擇程式分支的常數不列入。因此本次實際盤點為 **33 個**。

分類規則照 D1 契約。特別是，只有日誌明載 `[OBS]`／`[LOG]`／`[SHOT]` 的目前分支才列 A；
只有 `[TEST]` 或靜態依據者保守列 D／E，不把推測升成已實測。

| 開關名稱 | 檔案:行號 | 目前值 | 另一條分支存在嗎 | 分類 | 依據 | 收斂後的行為 |
|---|---|---|---|---|---|---|
| `ROOM_DEFAULT_MAP_ENTRY_MODE` | `dispatch/room/room-state.sender.js:11` | `disabled` | yes：`enabled`／`disabled` | B | `2026-09-18-11-room-default-map-entry.md`（R4 實測無可觀察效果） | 刪除開關與 enabled 路徑，保留原 fallback map entry。 |
| `GAME_USER_BOOTSTRAP_MODE` | `dispatch/room/room-game-user.sender.js:94` | `enabled` | yes：enabled／disabled | A | `2026-09-17-22-pve-mech-slot-selection.md`（[LOG][OBS]） | 刪除開關，固定保留 enabled 的 `Game_User_SN` sender。 |
| `MAP_ALL_HEADER_MODE` | `dispatch/room/room-map.sender.js:13` | `compact` | yes：`compact`／`padded` | E | `2026-09-16-07-map-info-list-empty-event-order.md`（[DLL][TEST] 支持 compact） | 刪除開關，固定 `body+0x02` 的 compact record offset；移除 padded offset。 |
| `MAP_ALL_SEND_TWICE` | `dispatch/room/room-map.sender.js:14` | `enabled` | yes：enabled／disabled | D | `2026-09-16-07-map-info-list-empty-event-order.md`（只有 [TEST]，不足以列 A） | 尚不可收斂；保留兩條路徑，待取得符合 A 要求的實測證據。 |
| `ROOM_MAP_SYNC_MODE` | `dispatch/room/room-map.sender.js:18` | `enabled` | yes：enabled／disabled | A | `2026-09-18-08-room-map-sync.md`（[LOG][OBS][SHOT]） | 刪除開關，固定保留依選定 PvE map ID 同步房間地圖的 enabled 路徑。 |
| `MAP_CHANGE_ONE_SETTINGS_MODE` | `dispatch/room/room-map.sender.js:21` | `enabled` | yes：enabled／disabled | A | `2026-09-18-12-map-change-one-sn-settings.md`（[LOG][OBS][SHOT]） | 刪除開關，固定保留 CQ 保存的 time／round／kill／goal 回送路徑。 |
| `MAP_CHANGE_ORDER_MODE` | `dispatch/room/room-map.sender.js:24` | `disabled` | yes：enabled／disabled | B | `2026-09-18-13-map-change-order.md`（R7/R7b 兩次實測失敗） | 刪除開關與 supplemental ONE-after-ALL 路徑，固定不補送該順序。 |
| `ROOM_STRING_ANSI_MODE` | `dispatch/room/room-string.js:4` | `enabled` | yes：enabled／disabled | A | `2026-09-18-09-room-string-encoding.md`（[OBS]，並有 DLL 依據） | 刪除開關，固定以 ANSI 寫房名／使用者字串欄位。 |
| `MAP_INFO_REAL_ID_MODE` | `dispatch/account.dispatch.js:34` | `disabled` | yes：enabled／disabled | B | `2026-09-18-14-map-info-sn-real-ids.md`（R9 實測無可觀察效果） | 刪除開關與 real-ID list 路徑，固定保留目前 legacy `0..MAX_MAP_COUNT` 路徑。 |
| `PVE_SLOT_SELECT_FLOW` | `dispatch/lobby.dispatch.js:12` | `client` | yes：`client`／`auto` | E | `2026-09-17-22-pve-mech-slot-selection.md`（[LOG][OBS]） | 刪除開關，固定等待客戶端選槽 `ChangeSlot_CN`／`Respawn_CN`；移除 auto respawn。 |
| `MAP_CHANGE_ONE_RESEND_MODE` | `dispatch/gate.game.dispatch.js:18` | `map_only` | yes：`full_room`／`map_only`／`none` | E | `2026-09-18-13-map-change-order.md`（相關順序實驗；未單獨證明三選一） | 刪除開關，固定只重送 map-only 封包；移除 full-room／none 分支。 |
| `GAME_START_HANDSHAKE_MODE` | `dispatch/gate.game.dispatch.js:19` | `ready_then_start` | yes：`start_only`／`ready_then_start` | E | `650401e`；`2026-09-16-16-entered-battle-map-success.md`（流程實測但非此開關的獨立標記） | 刪除開關，固定先送 `Game_Ready_SN` 再送 `Game_Start_SN`。 |
| `READY_HOST_GATE_PRIME_MODE` | `dispatch/gate.game.dispatch.js:20` | `enabled` | yes：enabled／disabled | D |  | 尚不可收斂；目前沒有符合要求的獨立實測證據。 |
| `GAME_WAIT_SN_EXPERIMENT_MODE` | `dispatch/gate.game.dispatch.js:21` | `enabled` | yes：enabled／disabled | D |  | 尚不可收斂；保留 Game_Wait experiment 的開關與跳過路徑。 |
| `POST_GAME_WAIT_READY_HOST_MODE` | `dispatch/gate.game.dispatch.js:22` | `enabled` | yes：enabled／disabled | D |  | 尚不可收斂；保留結算後 Ready_Host 的兩條路徑。 |
| `GAME_INFO_SN_EXPERIMENT_MODE` | `dispatch/gate.game.dispatch.js:23` | `enabled` | yes：enabled／disabled | D |  | 尚不可收斂；保留重送 Game_Info 的 experiment 與停用路徑。 |
| `BACK_FROM_ROOM_SA_EXPERIMENT_MODE` | `dispatch/gate.game.dispatch.js:24` | `enabled` | yes：enabled／disabled | D | `2026-09-15-07-loading-stall-fix-confirmed.md`（只有 [TEST]，語意仍未確認） | 尚不可收斂；保留 `0x00220234` 的回覆 experiment 與 fallback。 |
| `READY_HOST_SN_URL_MODE` | `dispatch/gate.game.dispatch.js:25` | `fit` | yes：`fit`／`fixed_0x13` | E | `2026-09-15-06-ready-host-sn-url-truncated-crash.md` | 刪除開關，固定依實際 URL 長度配置 body；移除固定 `0x13` 截斷路徑。 |
| `GAME_CHAT_ECHO_MODE` | `dispatch/gate.game.dispatch.js:26` | `enabled` | yes：enabled／disabled | A | `2026-09-17-23-game-chat-echo-g7.md`（[LOG][OBS]） | 刪除開關，固定原 opcode／原 body echo；移除 `type+1` 空 EVENT_INFO fallback。 |
| `GAME_INFO_SN_WITH_ROOM_STATE` | `dispatch/gate.game.dispatch.js:41` | `enabled` | yes：enabled／disabled | D | `2026-09-16-08-retraction-white-screen-never-happened.md`（僅重新啟用，待觀察） | 尚不可收斂；保留房間狀態時送 Game_Info 與不送兩條路徑。 |
| `SERVER_DRIVEN_START_MODE` | `dispatch/gate.game.dispatch.js:59` | `enabled` | yes：enabled／disabled | D | `2026-09-16-16-entered-battle-map-success.md`（[TEST]，契約要求 A 需 [OBS]/[LOG]/[SHOT]） | 尚不可收斂；保留 server-driven 與舊同步開戰兩條完整流程。 |
| `MAP_CHANGE_SA_ECHO_MODE` | `dispatch/gate.game.dispatch.js:78` | `enabled` | yes：enabled／disabled | A | `2026-09-18-10-map-change-one-sa.md`（[LOG][OBS]） | 刪除開關，固定保留 6-byte zero success header + 10-byte payload。 |
| `MAP_CHANGE_ONE_SA_EXPERIMENT` | `dispatch/gate.game.dispatch.js:79` | `mode: manual` | yes：`echo`／`manual`／fallback | E | `2026-09-18-10-map-change-one-sa.md`（disabled 時保留 manual 路徑） | 刪除物件與選擇，固定保留目前 manual 欄位組裝；移除 echo／zero fallback。 |
| `EQUIP_SAVE_MODE` | `dispatch/room.dispatch.js:86` | `enabled` | yes：enabled／disabled | A | `2026-09-18-06-g6-equip-save-verified.md`（[LOG][DB][OBS][SHOT]） | 刪除開關，固定換裝寫 DB 並沿用持久化路徑。 |
| `SHOP_UNBLOCK_MODE` | `dispatch/room.dispatch.js:90` | `disabled` | yes：enabled／disabled | C | `2026-09-18-01-g6b-shop-list-filter-root-cause.md`（[DLL][SRC]，IsShow 位移被推翻） | 刪除開關與 enabled 的錯誤旗標位移，固定保留 `IsShow=+0x0D` 的 disabled 路徑。 |
| `PURCHASE_MECH_SLOT_MODE` | `dispatch/room.dispatch.js:93` | `enabled` | yes：enabled／disabled | A | `2026-09-18-04-g6e-purchase-inventory-classification.md`（[LOG][OBS]） | 刪除開關，固定以當下機庫槽位寫入購買物 `mech_type`。 |
| `PURCHASE_ITEMINFO_REFRESH` | `dispatch/room.dispatch.js:96` | `enabled` | yes：enabled／disabled | A | `2026-09-18-04-g6e-purchase-inventory-classification.md`（[LOG][OBS]） | 刪除開關，固定購買成功後重送 chunked `ItemInfo_SN`。 |
| `SHOP_COMPAT_EXPERIMENT` | `dispatch/room.dispatch.js:105` | `disabled` | yes：enabled／disabled | B | `2026-09-18-02-g6c-shop-compat-experiment.md`（[LOG][OBS][SHOT]，一次性單變數實驗） | 刪除開關與 21100101→22100101 單筆替換，固定保留未替換的完整 catalog 路徑。 |
| `SHOP_FULL_CATALOG_MODE` | `dispatch/room.dispatch.js:108` | `enabled` | yes：enabled／disabled | A | `2026-09-18-03-g6d-shop-full-catalog.md`（[LOG][OBS][SHOT]） | 刪除開關，固定送出完整 catalog 並讓客戶端做相容性過濾。 |
| `SHOP_PERIOD_REPRESENTATIVE_MODE` | `dispatch/room.dispatch.js:112` | `enabled` | yes：enabled／disabled | A | `2026-09-18-07-shop-period-variants.md`（[LOG][OBS][SHOT]） | 刪除開關，固定全送期限變體、只顯示 Cache `RepresentIndex` 代表項。 |
| `MAP_ID_MODE` | `dispatch/room.dispatch.js:170` | `real` | yes：`real`／`legacy` | E | `2026-09-15-10-map-id-always-wrong-root-cause.md`（[DLL][CACHE][TEST]） | 刪除開關，固定送 Cache.Bin 真實 map ID；移除 legacy cache-index 清單。 |
| `CAMPAIGN_GAME_USER_BOOTSTRAP_MODE` | `dispatch/room.dispatch.js:182` | `disabled` | yes：enabled／disabled | C | `2026-09-16-02-game-user-sn-in-room-causes-hang.md`、`2026-09-16-06-game-user-sn-record-structure-ghidra.md`（房間場景送出被丟棄／錯誤） | 刪除開關與房間場景 enabled call site，固定只在場景 6 的 gate 流程送 `Game_User_SN`。 |
| `ITEM_INFO_INCLUDE_BODY` | `dispatch/item-info.sender.js:20` | `true` | yes：true／false | A | `2026-09-17-20-iteminfo-chunking.md`（[LOG][OBS]） | 刪除開關，固定把 `part_slot=0` 機體本體列納入 ItemInfo 分包。 |

## 各類別小計

| 分類 | 數量 | 名稱 |
|---|---:|---|
| A | 12 | `GAME_USER_BOOTSTRAP_MODE`、`ROOM_MAP_SYNC_MODE`、`MAP_CHANGE_ONE_SETTINGS_MODE`、`ROOM_STRING_ANSI_MODE`、`GAME_CHAT_ECHO_MODE`、`MAP_CHANGE_SA_ECHO_MODE`、`EQUIP_SAVE_MODE`、`PURCHASE_MECH_SLOT_MODE`、`PURCHASE_ITEMINFO_REFRESH`、`SHOP_FULL_CATALOG_MODE`、`SHOP_PERIOD_REPRESENTATIVE_MODE`、`ITEM_INFO_INCLUDE_BODY` |
| B | 4 | `ROOM_DEFAULT_MAP_ENTRY_MODE`、`MAP_CHANGE_ORDER_MODE`、`MAP_INFO_REAL_ID_MODE`、`SHOP_COMPAT_EXPERIMENT` |
| C | 2 | `SHOP_UNBLOCK_MODE`、`CAMPAIGN_GAME_USER_BOOTSTRAP_MODE` |
| D | 8 | `MAP_ALL_SEND_TWICE`、`READY_HOST_GATE_PRIME_MODE`、`GAME_WAIT_SN_EXPERIMENT_MODE`、`POST_GAME_WAIT_READY_HOST_MODE`、`GAME_INFO_SN_EXPERIMENT_MODE`、`BACK_FROM_ROOM_SA_EXPERIMENT_MODE`、`GAME_INFO_SN_WITH_ROOM_STATE`、`SERVER_DRIVEN_START_MODE` |
| E | 7 | `MAP_ALL_HEADER_MODE`、`PVE_SLOT_SELECT_FLOW`、`MAP_CHANGE_ONE_RESEND_MODE`、`GAME_START_HANDSHAKE_MODE`、`READY_HOST_SN_URL_MODE`、`MAP_CHANGE_ONE_SA_EXPERIMENT`、`MAP_ID_MODE` |
| **合計** | **33** | |

## 建議的收斂順序

1. 先收斂沒有互相依賴、且已有合格實測的 A：`ROOM_STRING_ANSI_MODE`、`GAME_CHAT_ECHO_MODE`、`ITEM_INFO_INCLUDE_BODY`、`EQUIP_SAVE_MODE`、`PURCHASE_MECH_SLOT_MODE`、`PURCHASE_ITEMINFO_REFRESH`、`SHOP_PERIOD_REPRESENTATIVE_MODE`。
2. 接著一次處理同一流程的 A：房間地圖組（`ROOM_MAP_SYNC_MODE`、`MAP_CHANGE_ONE_SETTINGS_MODE`、`MAP_CHANGE_SA_ECHO_MODE`），以及商店組（`SHOP_FULL_CATALOG_MODE` 與其購買／ItemInfo 開關）。收斂前要保留同一測試場景的回歸檢查。
3. 可刪的失敗／一次性實驗 B：`ROOM_DEFAULT_MAP_ENTRY_MODE`、`MAP_CHANGE_ORDER_MODE`、`MAP_INFO_REAL_ID_MODE`、`SHOP_COMPAT_EXPERIMENT`。它們各自有失敗或一次性實驗依據，刪除時保留表中指定的目前分支。
4. C 絕對不要打開：`SHOP_UNBLOCK_MODE` 的 enabled 旗標偏移已被 DLL／客戶端欄位分析推翻；`CAMPAIGN_GAME_USER_BOOTSTRAP_MODE` 會在場景 5 送給只在場景 6 處理的 handler。兩者只能在單獨核對後移除危險分支。
5. E 不能和其他開關混合改動：`MAP_ALL_HEADER_MODE`、`PVE_SLOT_SELECT_FLOW`、`MAP_CHANGE_ONE_RESEND_MODE`、`GAME_START_HANDSHAKE_MODE`、`READY_HOST_SN_URL_MODE`、`MAP_CHANGE_ONE_SA_EXPERIMENT`、`MAP_ID_MODE` 都是具名變體，收斂時只能明確選定表中目前分支。
6. D 暫不動：尤其 `MAP_ALL_SEND_TWICE`、`SERVER_DRIVEN_START_MODE`、`GAME_INFO_SN_WITH_ROOM_STATE` 和各個 gate timing experiment，現有資料不足以符合 A 的證據門檻；它們不可和其他改動綁在同一輪。

## C1 收斂：盤點基準之外新增的開關

以下五個開關是在 `ea3f1d8` 之後才新增的（不在上表 33 個之內），2026-09-18 由中階
worker 依 `docs/backlog.md` C1 契約收斂。收斂前用「翻成 disabled、跑
`node test/replay-golden.js`」逐一確認會變紅，證明開關本身是活的（非死碼）。

| ~~開關名稱~~ | 依據 | 已收斂 |
|---|---|---|
| ~~`ROOM_TEAM_INDEX_MODE`（`dispatch/room/room-state.sender.js`）~~ | R11，`journal/2026-09-18-15-room-team-index.md` | 已收斂（C1，`02d4a98`） |
| ~~`ROOM_USER_NAME_ANSI_MODE`（`dispatch/room/room-user.sender.js`）~~ | R12，`journal/2026-09-18-17-user-name-ansi.md` | 已收斂（C1，`8a9dd7f`） |
| ~~`ROOM_LEAVE_RESET_MODE`（`dispatch/gate.game.dispatch.js`）~~ | L1，`journal/2026-09-18-20-room-leave-reset.md` | 已收斂（C1，`e205a49`） |
| ~~`MONEY_PERSIST_MODE`（`dispatch/money.js`）~~ | M1，`journal/2026-09-18-16-money-persistence.md` | 已收斂（C1，`2134182`） |
| ~~`POST_BUY_SLOT_REFRESH_MODE`（`dispatch/room.dispatch.js`）~~ | M3a，`journal/2026-09-18-19-m3-inventory-refresh.md` | 已收斂（C1，`92450ef`） |

另外 `dispatch/gate.game.dispatch.js` 的 `0x00220234` handler 註解與
`packetlog.marker` 文字（原「EXPERIMENT, purpose unconfirmed」）已改寫為已確認的
Leave_CQ 描述，純註解，不影響行為（C1，`59d9843`）。`BACK_FROM_ROOM_SA_EXPERIMENT_MODE`
開關本身未動，仍在上表 D 類，維持不收斂。
