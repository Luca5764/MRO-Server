# 測試 A 第一輪：開火、副武器、推進器都沒反應（2026-09-17）

紀錄：`Metal Rage Online Server/logs/session-20260917-123655.jsonl`（12:36 開伺服器，12:38 開局）。

## 觀察

- [OBS] 操作者回報 A1 開火、A2 副武器、A3 推進器「每一步都沒效果」。
- ✅ [LOG] session 從 `Respawn_SN 0x00230104`（ms=72976）到操作者回報為止，client→server 只有週期性 `0x00020083`（每 10 秒一次）。三個動作都**沒有**送出新的 opcode。
- ✅ [LOG] 同一段時間也沒有聊天封包，也沒有任何 marker（只有兩個 auto marker）。在戰鬥場景用聊天框打 marker 不會送到伺服器，所以這一輪沒辦法切段。之後的 marker 改成由伺服器 console（tmux）打。
- ✅ [SHOT] `shots/testA-now.png` 的彈藥是 `080 /0720`，跟前一天的 `shots/current-mission.png` 一樣，可見左鍵沒有消耗彈藥。
- ⬜ [LOG] `MetalRage.log` 目前停在 8192 bytes（寫到 `PRELoadAllMesh_BD` 附近），看起來是緩衝還沒寫出去，要等客戶端結束後才看得到戰鬥中的 WeaponLog。

## 目前能說的

- 🟡 [GUESS] 移動和準心能動，但開火、推進器、聊天全部沒反應，比較像「輸入或回合狀態被整個擋住」，不像單一武器沒掛上。還沒有證據，要等完整的客戶端 log。

## 下一步

1. 請操作者結束客戶端，讓 log 寫完，讀 `WeaponLog`、`Cannot use`、`Accessed None`。
2. 看 log 的結果，再決定要查 DLL（輸入或開火的前置條件），還是做單變數測試。
