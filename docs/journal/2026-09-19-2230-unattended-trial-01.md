# U-20260919-01：有人在旁的無人流程試跑（商店分頁盤點）

計畫：`research/2026-09-19-unattended-trial/plan.md`。操作者在電腦前監看。伺服器沒有改開關、也沒有重啟。

## 結果
- ✅ [TEST] 護欄的「擋下」方向：
  - 第一次 `CLICK_AT` 閉迴路發散，游標跑到 (0,298)；因為沒有收斂，BLOCKED、沒有點擊，session 鎖住。
  - 原因：迴圈直接送像素誤差，沒有扣掉 Windows 指標加速的約 2.46 倍放大（worker 契約裡沒寫清楚，是高階的疏失）。改成依上一步實測估計每軸倍率（0.3–3.0），最多 12 次。
- ✅ [TEST][SHOT] 修正後全部一次命中：
  - 商城／格納庫：`shots/u-20260919-01-01-shop.png`
  - 輔助武器、裝備、道具、M幣商城四個分頁：`shots/u-20260919-01-02-sheet.png`
  - 上一頁回大廳：`shots/u-20260919-01-03-back.png`
  - 每次 `CLICK_AT` 約 2.2–2.6 秒。
- ✅ [TEST] 停止條件：操作者點 VS Code 後送 `KEY ESC` → `[BLOCKED] foreground window belongs to process 'Code'`，第二次送出時回報 session halted。`actions.log` 與伺服器 marker（`pico: KEY ESC -> BLOCKED ...`）都有記錄。
- 截圖座標和 `CLICK_AT` 座標的換算：`shot.sh` 拍的是整個視窗外框（1616×1239），client area 是 1600×1200，相對外框偏移 (8,31)。所以 client 座標＝截圖座標－(8,31)。
- [SHOT] 附帶觀察：商店每樣商品都標 1000G／1000M，是伺服器的預設價格（P3 價格清單要處理）。

## 操作面
- 開始前遊戲必須是前景，AI 無法自己把遊戲切到前景；出門前由操作者點一下遊戲。
- 操作者 2026-09-19 直接確認同意：專用測試帳號給開發者等級、讓 Pico 自動打完整場；從 WSL 重開當掉的客戶端。邊界照 PM 訊息（只給一個設定檔指定的測試帳號；每 session 最多重啟 3 次；同一步連續當掉兩次就停）。開發者功能的唯讀分析進行中。

## 開發者等級／自動過關的唯讀分析（explorer，高階已核對關鍵行）
- 全文：`research/2026-09-19-dev-grade-cheats/notes.md`。
- Grade 11 不解鎖過關指令，只換觀戰鏡頭按鍵表，PvE 還會讓 GM 直接進 Spectating（跟 `journal/2026-09-17-11` 一致）。→ 「專用測試帳號給開發者等級」這條路**用不到**。
- [SRC] `ZModePve/ZPvePlayercontroller.uc:904` `exec function GameCampaign(int Action)` 直接呼叫 `ZNetwork_DJ.Game_Campaign(Action)`，沒有任何權限檢查（高階已看過原始碼）。Action=1 由房主送出 `Campaign_CN 0x00230139`，我們的伺服器收到就回 `EndGame_SN` 判勝利。另有 `PveNextRound_BD`（:1140，原始碼註解明寫是作弊鍵）、`CoreHpMax`（:1151）。
- 卡點：這些 exec 只能從 console 下，console 熱鍵是 `IK_F24`（135），一般鍵盤按不到。**Pico 是 USB 鍵盤，送得出 F24**（adafruit_hid `Keycode.F24`），可能是可行路徑 🟡，還沒測。要先問操作者同意再測。
- 風險（記進 backlog）：任何玩家只要能按 F24（硬體巨集、特殊鍵盤）就能用 `GameCampaign 1` 直接過關，因為伺服器不驗證 Campaign_CN。朋友私服可以接受，但要知道有這件事。
- ✅ [TEST][SHOT] 操作者同意後，韌體 KEY_MAP 加入 F13–F24。在大廳用 Pico 送 `KEY F24`，畫面左側出現主控台提示 `(> _`；送 `KEY ESC` 後提示消失（`shots/f24-compare.png`，上＝F24 之後，下＝ESC 之後）。→ Pico 的 F24 能打開客戶端主控台。還沒有下任何 exec 指令。未經跨公司審查。
- 下一步（要操作者核准清單）：在 PvE 開戰後由房主下 `GameCampaign 1`，確認伺服器收到 `Campaign_CN 0x00230139` body[2]=1 並進入結算。

## GameCampaign 1：Pico 自動打完一場 PvE（操作者核准，他手動開戰，之後手離開）
- ✅ [TEST][LOG] `logs/session-20260919-211100.jsonl`：戰場裡用 Pico 送 `F24` → `TYPE GameCampaign 1` → `ENTER`，伺服器在 ms 5332588 收到 `Campaign_CN 0x00230139` hex `010001`，由 PVE_ROUND_ADVANCE 回 `EndRound_SN 0x00222211`（`R-ROUND: cleared=1 playRound=5`）。之後每約 15 秒送一次，連續 4 次：cleared=2、3、4，第 5 次 `last round, EndGame_SN`。
- [SHOT] `shots/gc-console-small.png`（戰場裡主控台 `(>` 打開）、`shots/gc-after-small.png`（ROUND 2）、`shots/gc-end-small.png`（EndGame 後約 6 秒回到房間）。結算畫面這次沒拍到。
- 結論 ✅：完全不用操作者操作，就能讓一場 PvE 從第 1 回合跑到 EndGame 再回房間；證據是伺服器封包加截圖。未經跨公司審查。這次是房主單人。
- 這條路徑可以拿來做 EndRound → EndGame → 結算 → 寫回 DB（P3）的回歸測試。
