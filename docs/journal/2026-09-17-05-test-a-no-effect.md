# 測試 A 第一輪：開火、副武器、推進器都沒反應（2026-09-17）

紀錄：`Metal Rage Online Server/logs/session-20260917-123655.jsonl`（12:36 開伺服器，12:38 開局）。

## 觀察

- [OBS] 操作者回報 A1 開火、A2 副武器、A3 推進器「每一步都沒效果」。
- ✅ [LOG] session 從 `Respawn_SN 0x00230104`（ms=72976）到操作者回報為止，client→server 只有週期性 `0x00020083`（每 10 秒一次）。三個動作都**沒有**送出新的 opcode。
- ✅ [LOG] 同一段時間也沒有聊天封包，也沒有任何 marker（只有兩個 auto marker）。在戰鬥場景用聊天框打 marker 不會送到伺服器，所以這一輪沒辦法切段。之後的 marker 改成由伺服器 console（tmux）打。**（更正見文末：操作者其實沒打字。）**
- ✅ [SHOT] `shots/testA-now.png` 的彈藥是 `080 /0720`，跟前一天的 `shots/current-mission.png` 一樣，可見左鍵沒有消耗彈藥。
- ✅ [LOG] `MetalRage.log` 在客戶端執行中停在 8192 bytes，是緩衝還沒寫出。12:41 客戶端結束後寫完，共 237 行。
- ✅ [LOG] 結束後的完整 log：`Game class is 'ZModePve'`、`START MATCH`、`MyHud: ZPveHud`、`Pawn: SA01m`、controller 是 `ZPvePlayercontroller`。從 `START MATCH` 到結束，**沒有任何** `WeaponLog`、`Cannot use`、`Accessed None`，也沒有跟輸入有關的訊息。`Cannot use MOC_a` 確實已經消失。
- [LOG] 載入階段仍有 `PreLoadallPveAI_BD ... Accessed null class context 'DefaultPawnClass'`（兩次）和 `AI_Boat_k` 找不到，跟 2026-09-16-31 記錄的相同。

## 目前能說的

- 🟡 [GUESS] 移動和準心能動，但開火、推進器、聊天全部沒反應，比較像「輸入或回合狀態被整個擋住」，不像單一武器沒掛上。還沒有證據，要等完整的客戶端 log。

## 下一步

1. 客戶端 log 沒有錯誤，所以接下來做靜態分析：找出 `ZPvePlayercontroller` 或 Pawn 的開火與推進器，要先滿足哪些狀態（回合或遊戲狀態旗標、ZNetwork 的狀態），以及是誰設定這些狀態的。
2. 分析有結論之前不做新的實測。

## 更正（同日）

- [OBS] 操作者事後說明：這一輪**沒有在遊戲裡打字**。所以「戰鬥中打聊天不會送到伺服器」**沒有證據**，改成 ⬜ 未知；上面「聊天全部沒反應」的推論也不成立。
- 開火和推進器沒有送出封包，以及彈藥沒減少，這兩點不受影響。
