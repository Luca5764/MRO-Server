# 死亡／重生回歸實測（2026-09-16）

> 從 docs/opcode-ledger.md 第 1648–1655 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [DLL] `Death_CN` 本體 `0x107d99f5` 將 client body 的 attacker u16、victim u16、death type u8、flag u8、part byte u8、auxiliary u32 寫入 `Death_SN` 格式；實測 body `0000020003000000000000` 即 attacker=0、victim=2、environment type=3。
- ✅ 已確認 [DLL] `Death_SN` 本體 `0x107db760` 讀 `body+0x00` status、`+0x02` error、`+0x0A` attacker、`+0x0C` victim、`+0x0E` death type，成功分支用 victim 呼叫 `Game_User_State_Set(victim, 1)` 後執行 `Game_Action_Death`。舊版全零短回覆把 victim 留為 0，故 account 2 的 state 不會變成可重生。
- ✅ 已實作 [TEST] `lobby.dispatch.js` 的 `Death_CN 0x00230123` handler：送 0x51-byte body 的 `Death_SN 0x00230124`，victim 寫在 +0x0C；並在 5 秒後送 `Respawn_SN 0x00230104` 作舊版客戶端的保底。新增 `Respawn_CN 0x00230103` handler，收到客戶端請求時立即送同一個 SN。
- ✅ 已確認 [OBS] 最新記錄 `session-20260916-203513.jsonl`：12:38:37 收到 Death_CN，12:38:37 回 Death_SN（伺服器實際封包因 16-byte 對齊記錄為 96 bytes），12:38:42 回 Respawn_SN；使用者確認「有重生了」。因此死亡讀條卡死已排除。
- ⬜ 未知 [OBS] 5 秒保底是否與所有死亡類型的客戶端讀條長度一致；目前只以環境死亡 type=3 驗證，若日後發現重生過早／過晚再調整，不能先刪除 victim 欄位修正。

