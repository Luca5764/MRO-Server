# 量房主 FPS 第 1 次實跑：沒量到，但抓到三件事

劇本 `experiments/netspeed-budget-fps.json`，runner 報告 `[FAIL]`，停在步驟 13。
證據截圖在 `shots/budget-fps-salvage-*.png`、`shots/budget-fps-salvage2-*.png`。

## 1. ⚠️ 客戶端主控台的輸入會被中文輸入法吃掉（新陷阱，影響所有 console 指令）

`console_cmd_on(host, 'stat fps')` 的 typed-evidence 截圖
（`shots/budget-fps-salvage-04-console_cmd_on-host-typed.png`）顯示主控台提示字元後面是

    (> 吃ㄅㄣ

**打進去的不是 `stat fps`，是被注音輸入法轉換過的中文**。所以那道指令從來沒有執行，
log 裡也沒有任何 `fps` 痕跡 —— 不是 `stat fps` 不存在，是**根本沒送到引擎**。

- 這不是全域現象：同一天 `WeaponLog`（送給 **joiner**）三輪都正常生效（`HitLoc===` 有出來）。
  Windows 的 IME 狀態是**按視窗／執行緒**的，所以 host（`MetalRage2`）那個視窗處在中文模式、
  joiner（`MetalRage`）在英數模式。
- **影響範圍**：`console_cmd_on` 送出的每一道指令都可能被這樣吃掉，而且
  **`console_cmd_on` 目前不會發現** —— 它只檢查「主控台有沒有開／有沒有關」，
  不檢查**打進去的字對不對**。之前所有靠它送指令的結論，只有在指令有可觀察副作用時
  （`WeaponLog` 有 `HitLoc` 行）才真的被驗證過。
- ⬜ 怎麼修還沒決定。方向：打字前先送一次 `SHIFT`（注音輸入法的中英切換鍵）並用截圖
  確認提示字元後面是 ASCII；或在 `console_cmd_on` 加一道「打完字比對提示列」的檢查。
  **不要直接假設 SHIFT 有效，要實測。**

## 2. `enter_battle(host)` 的完成條件對房主不成立

步驟 13 `enter_battle(host, mech_key=None)` 等了 120.2 秒，
`ChangeSlot_CN/Respawn_CN`（`user_index=6`）**MISSING**，但同一步的畫面檢查是
`battle_hud=battle green_px=6414` —— **房主其實已經在戰鬥裡了**。

也就是說失敗的是**完成條件**，不是狀態。與既有事實一致：`round2-projectile.json`
從來不對 host 呼叫 `enter_battle`，而 `leave_battle(host)` 一直能用。

⬜ 為什麼房主沒有那兩個 CN：可能是房主的機體選擇走別的封包，或那個封包在我們開始等之前
就送完了（查詢窗口錯過）。**沒查**。

## 3. ✅ [TEST] 戰鬥中關不掉客戶端，是因為滑鼠被遊戲抓著 —— 先離開戰鬥就關得掉

兩個客戶端在步驟 13 失敗後留在戰鬥中。`CLOSE_WINDOW` 連續失敗，症狀是**收斂不了**：
`target (1715,145) got (1715,161)` / `got (1716,161)`（固定往下 16px）。

先把兩邊帶離戰鬥（GAME MENU「離開」→ 第二層確認）之後，**同一個 `CLOSE_WINDOW`
一次就成功**（host 3541.5ms、joiner 3401.8ms），兩個行程都正常結束。

這給 HANDOFF 早就寫著的那條經驗補上了 [TEST] 證據，並且指出**根因是滑鼠被遊戲捕獲**
（所以閉迴路移動永遠差一截），不是視窗座標算錯、也不是客戶端當掉。

## 4. 順帶

- `MetalRage2.ini`／`MetalRage.ini` 裡**沒有** vsync 或 frame cap 的設定鍵
  （只有 `MinDesiredFrameRate=35`，那是 UE2 的細節降級門檻，不是上限）。
  → FPS 看起來沒有被鎖，Moon 的高 FPS 情境**不能先驗地排除**在我們這邊發生。
  這讓第 1 步更值得做，而不是更不值得。
