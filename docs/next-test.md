# 下一輪要測的（2026-09-17）

前一版（伺服器驅動開戰）已驗證成功，內容見 `journal/2026-09-16-29-first-successful-mech-spawn.md`。

**先重啟伺服器**，`client.js` 有改。改動只多了一個「封包超過 0x400 bytes」的警告，送出的內容沒變。

## 測試 A：武器與操控（不用改任何設定）

在遊戲聊天框打字當 marker，**一次只做一件事**：

1. 打 `A1 開火` → 按住左鍵約 3 秒 → 打 `A1 end`
2. 打 `A2 副武器` → 試右鍵，以及其他武器鍵（依 `OptionAll_Default.ini`）→ 打 `A2 end`
3. 打 `A3 推進器` → **站著**按 Shift → 打 `A3 end`
4. 每一步都截圖：`tools/win/shot.sh`

要看的：
- `node tools/slice.js <檔名> -m <n>`：每一段有沒有出現新的 client→server opcode
- `MetalRage.log`：有沒有 `Cannot use`、`Accessed None`

## 測試 B：ItemInfo 卡住，是大小問題還是 slot 內容問題

只有在測試 A 做完後才做，**一次只改一個變數**。

- **B1（只改大小）**：先照原樣把 slot 1／2／4 的 24 筆送出，再把其中 12 筆複製一次（`id` 要不同），湊成 36 筆，整包超過 0x400。
  **預期**：console 出現 `!! frame ... > 0x400`，客戶端卡在登入。
- **B2（只改內容）**：送 slot 1／2／3／4／5，但每台機只留一部分，讓總數 ≤ 28 筆（例如只送 1–4 號機，共 20 筆）。
  **預期**：如果原因真的是大小，應該能正常登入。

B2 能過，就可以做分包的 ItemInfo（單包 ≤ 28 筆），再把 slot 3／5 和機體本體（part_slot=0）都加回來。
