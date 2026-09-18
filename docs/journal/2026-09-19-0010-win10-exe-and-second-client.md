# Win10 要用原廠 exe；第二台客戶端的啟動基準

## 依作業系統選 exe

- ✅ [OBS][TEST] 第二台（Win10）用 Win11 修改版的 `MetalRage.exe`（SHA256 `487646b0…`）一啟動就當掉。只把 exe 換成 `_original_backup\MetalRage.exe`（`419d9275…`）、其他檔案都不動之後，就能正常跑到登入畫面。
- 當掉的特徵（給之後比對用）：Windows 事件 ID 1000、錯誤代碼 `0xc0000005`、錯誤模組 unknown、`xigncode.log` 沒有更新。
- 兩個 exe 的差異（`cmp`，高階 2026-09-19 在本機重算）：`0x160–0x161`、`0x19213–0x19214`、`0x19237–0x19238`。
- 🟡 原因推測：第二個 patch 強迫解密，在 Win10 上變成解密兩次。這是從上游文件推的，**沒有驗證**，也不需要驗證，知道哪個作業系統用哪個 exe 就夠了。
- ⬜ patch 過的 `D3D9Drv.dll` 在 Win10 上能跑到登入畫面（`Creating device` 成功），進戰鬥之後有沒有副作用還不知道。
- ⬜ XIGNCODE 在 Win10 上是否完整通過：要看第二台 `data\System\xigncode.log` 的修改時間。

## 第二台客戶端的啟動 log

- [LOG] `research/2026-09-19-second-client-win10/MetalRage.log` 跟主機的 `data/Log/MetalRage.log`，到 `START MATCH`（登入畫面背景的機庫場景）為止逐行一致。唯一差別是 `Window Font Count`：第二台 347、主機 512（字型比較少，現在英文模式沒有影響，切中文時可能會缺字）。
- `Not Register Font:MingLiu`、三行 `ImportText: Bad termination`（上游英文化文字檔的引號問題）、`Browse: Index.tzp?disconnect → failed: return ENTRY.`、`NULL call failed`，這些在主機上也一模一樣，不是 Win10 特有的。
- `appRequestExit(0)`：正常關閉，不是當掉。
- [LOG] **客戶端連不上伺服器時，log 裡不會留下任何網路相關的紀錄。** 排查連線問題要看伺服器的 session log。已寫進 `reference/tools.md`。
- ⚠️ 第二台的啟動參數是 `ip=192.168.1.128`，但這台伺服器主機的區網 IP 是 `192.168.1.105`（[TEST] 高階 2026-09-19 用 `ipconfig.exe` 查到；N0 調查時也是同一個值）。如果 .128 不是別的轉送位址，第二台要改成 `.105`。
