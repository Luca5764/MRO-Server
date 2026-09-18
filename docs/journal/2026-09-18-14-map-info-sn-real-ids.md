# R9：MapInfo_SN 改送真實 PvE map id（實測未通過）

- 日期：2026-09-18
- 分析／實作者：Codex（中階）
- 狀態：❌ 實測未通過；預設開關維持關閉。

## 觀察到的封包

- [LOG] `logs/session-20260918-184521.jsonl` 記錄登入時送出 `MapInfo_SN 0x00210115`。
- [LOG] 該筆 frame/body 記為 32 bytes；語意前 26 bytes 是 `00 06` 加六個 u32LE：`0, 1, 2, 3, 4, 5`，後 6 bytes 是補齊零。
- [CODE] `account.dispatch.js:543-556` 原本從 `db.getMaps(accountId)` 的結果逐筆寫入 `map.map_id`。
- [CODE] `database/db.js:91-96` 的查詢是 `SELECT * FROM maps WHERE account_id = ? ORDER BY map_id`。
- [CACHE] `metalrageserver.sql:96-103` 的 `maps.map_id` 沒有 Cache 外鍵；建帳號程序 `:500-504` 明確插入 0、1、2、3、4、5。

## 客戶端檢查鏈

- [DLL] `ZDispatchAccount::MapInfo_SN` 本體 `0x107c4c00`，匯出 thunk `0x10704d04`。
- [DLL] `0x107c4c73` 以封包 count 迴圈；`0x107c4c8c` 讀每筆 4 bytes，`0x107c4cd3` 呼叫 `UZNetwork_DJ::Account_Map_Add`。
- [DLL] `Account_Map_Add` 本體 `0x107323e0`、thunk `0x107018fc`；`0x10732401` 以 4-byte 值和既有 m_MapList 比對，命中才更新，否則追加。
- [DLL] `xref 0x107018fc` 只見 `MapInfo_SN` 這個外部呼叫者；因此此清單就是 m_MapList 的輸入來源。
- [SRC] `ZNetwork_DJ.uc:1094` 的 `Account_MapList_Check(MapIndex)` 以 `default.m_MapList` 比對 map index。
- [SRC] `ZPopup_RoomSet.uc:568` 與 `ZPopup_MapSelect.uc:259` 的清單路徑都呼叫這個檢查；同一路徑先跳過 `MapIndex < 1000`。
- [SRC] 所以 Cache 清單的真實 PvE id（9001–9012）拿去檢查時，m_MapList 的 0..5 不會命中；這是「送了清單但 UI 被全數濾除」的靜態解釋，仍待實測。

## 送出時機與欄位保持

- [CODE] 既有帳號登入與建立帳號後都進入 `sendAccountData()`，所以正常 DB 路徑在載入帳號資料後送一次 `0x00210115`。
- [CODE] DB 失敗的兩個 fallback 也各自送一次同 opcode；本修正一併套用，避免同一開關在不同登入結果產生兩種格式。
- [DLL] body +0 是成功／旗標 byte，body +1 是 count byte；從 body +2 起每筆固定 4 bytes little-endian。
- [DLL] `0x107c4c84-0x107c4c91` 對每筆以長度 4 讀取，沒有證據顯示需要改成 Cache entry index 或改變端序。
- [LOG] 目前六筆語意資料的 header 是 `00 06`，因此修正只替換 count 與其後的 u32LE 內容。
- [🟡] enabled 的十二筆語意 body 為 `00 0c` 加 `29230000 2a230000 2b230000 2c230000 2d230000 2e230000 2f230000 30230000 31230000 32230000 33230000 34230000`。
- [⬜] 這組十二筆是否能讓兩個 UI 清單實際顯示，仍須由操作者另行實測；本次不啟動伺服器。

## 0..5 與真實 id 的取捨

- [CODE] `room.dispatch.js:122-148` 的 `CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID` 是 campaign map key 到 Cache entry index 的表，不是 DB row 0..5 到 9001–9012 的對照表。
- [CODE] `room.dispatch.js:164` 的 `MAP_IDS_PVE` 已由 Cache.Bin 證據定義為 9001 至 9012；它沒有提供 DB 0..5 的逐項語意。
- [⬜] 目前沒有可靠證據可以把 DB row 0、1、2、3、4、5 各自指定成哪六個真實 PvE id；硬湊會把未確認的 row 語意寫成事實。
- [🟡] 因此 enabled 實驗送完整的 `MAP_IDS_PVE` 十二筆：`[9001,9002,9003,9004,9005,9006,9007,9008,9009,9010,9011,9012]`。這是暫時的覆蓋式實驗清單，不是 DB row 對照結論。

## 修正

- [CODE] 新增 `MAP_INFO_REAL_ID_MODE`，位於 `account.dispatch.js:30`，預設為 `'disabled'`。
- [CODE] enabled 時三個 `MapInfo_SN` fallback／帳號資料送出點都改寫同一組十二筆真實 id；disabled 時保留原本硬編碼 0..5 或 DB `map_id` 的路徑。
- [CODE] enabled body 仍是 `flag(u8)=0 + count(u8)=12 + 12*u32LE`，語意長度為 50 bytes；disabled 的既有 DB 六筆語意長度仍為 26 bytes，client buffer 的補齊行為不變。
- [CODE] 沒有修改 DB schema、`Map_Change_All/One`、`SN_ROOM_DEFAULT` 或其他既有開關值。

## 更正與驗證

- [OBS] 先前 Gemini「伺服器從未送出 `0x00210115`」的說法被上述 session log 推翻；伺服器確實送出，問題是內容為 DB row index。
- [🟡] `Account_Map_Add` 唯一外部呼叫者、m_MapList 過濾鏈與 row/id 不匹配是靜態證據；尚未宣稱 UI 實測通過。
- [TEST] `node --check 'Metal Rage Online Server/dispatch/account.dispatch.js'` 通過。
- [TEST] `git diff --check` 通過；本任務沒有啟動伺服器，也沒有要求操作者實測。

## 收尾實測

- [LOG] 開啟 R9 時確實送出 `0x00210115 count=12`，ids 為 9001–9012；hex 為 `000c29230000 2a230000 ... 34230000`。
- [OBS] 設定對話框仍顯示 4 VS 4，地圖清單仍空；只補齊 m_MapList 並不足以通過完整篩選鏈。
- [OBS] Claude 高階判定 m_MapList 不是唯一關卡；後續還有人數範圍篩選，而 PvE 人數陣列要等 `g_SelectMapInfo` 命中才會切換。
- [OBS] 缺口是誰設定 `g_SelectMapInfo`，相關研究在 `docs/research/2026-09-18-room-setting/` 與 `docs/research/2026-09-18-map-list-zero/`。
- [OBS] Gemini「伺服器從未送出 `0x00210115`」仍是錯誤；本次 log 再次證明伺服器確實送出，錯的是後續篩選未完成。
- [TEST] Claude 高階已完成實測；R9 維持 disabled，未把靜態假設寫成成功。
