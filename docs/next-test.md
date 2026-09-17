# 下一輪要測的（2026-09-17 18:45）

測試 M 已通過（`journal/2026-09-17-11-grade-info-sn-root-cause.md`）：PvE 開局即可開火、跳、推進器。

候選（尚未排定，由高階決定）：
1. 測試 B（ItemInfo 大小 vs slot 內容），見 `journal/2026-09-17-03`、`-01`。
2. 地圖沒有敵人／`PreLoadallPveAI_BD ... DefaultPawnClass` 錯誤（可用 `tools/uetool` 讀 `Map_PC01.u` 的 actor）。
3. 遊戲內聊天回送（`0x00220507`／`0x00220509` 以同 opcode 廣播），見 `journal/2026-09-17-05`。
4. 整理 `DefaultInfo_SN` 的 UserType 欄位命名與 DB 欄位（目前誤叫 account_level）。
