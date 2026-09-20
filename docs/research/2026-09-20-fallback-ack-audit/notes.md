# fallback ACK 稽核（MOON-1 c，2026-09-20，explorer；高階已讀報告）

起因：Moon 回報目標類模式的 `0x0023xxxx` 封包在他那邊被 6-byte 通用 ACK 回掉，默默弄壞 `Game_Score_Set`，跟我們的 Death_SN 舊 bug 同一類。

## 結論
1. ✅ **`Special_CN 0x00230125` 確實落到通用 fallback**（`dispatch/lobby.dispatch.js:783-795`），我們回 `Special_SN 0x00230126`，body 補零到 16 bytes。
   - [DLL] handler `0x10702fb8` → `0x107d6300`：前段讀 body+0x00/0x02/0x0a/0x0c（我們的全零回覆讀得到），但**當 status==0 且 error==0 時（正是我們的回覆造成的條件）**，它會讀 `body+0x15` 並把 `body+0x19` 當**指標解參考**。我們只送了 16 bytes（0x00–0x0F），等於讀到封包外的記憶體。
   - 這就是 Death_SN 當初那種失敗形狀：全零、成功碼、長度不足，誘發越界讀。
   - 出現次數少：202 份 log 裡只有 7 次，都在 PvE。
2. ✅ **同類問題在 `Assist_CN 0x00230121` 上更頻繁**：它在我們的程式裡被標成「Lobby Leave CQ (guessed)」（`lobby.dispatch.js:190-198`），是**明確的 case**、不是 fallback，但輸出跟 fallback 一樣（全零 16 bytes 的 `0x00230122`）。
   - [LOG] 它其實是 Assist_CN（body 7 bytes，只在 `gameStarted` 時出現）：5 份戰鬥 log 共 **526 次**。
   - [DLL] `Assist_SN` 的 handler `0x107d5fa0` 成功路徑會讀到 body+0x17/+0x18（word, movsx），同樣超出我們送的 16 bytes。既有 journal `2026-09-17-15-assist-cn-sn-format.md` 已經完整記過這個佈局。
3. ⬜ **Moon 點名的 Bomb／Capture／Conquest／Boss／TwoBoss／TriggerTouch，在我們 202 份 log 裡一次都沒出現過**（那些模式我們根本還沒玩過）。但 [DLL] `Capture_SN 0x107d6490` 的程式形狀跟 Special_SN 一樣（讀到 body+0x19），所以他描述的風險在架構上成立 🟡。
4. 對照組：`Death_CN`（回 96 bytes 真資料）、`Campaign_CN`（41 bytes）、`BeginRound_CN`（精確 6 bytes）都沒問題。
5. 另一種失敗形狀（不在本次範圍）：`0x00230111` 在戰鬥中會被 `return false` 直接略過、完全不回，log 記成 `unhandled`，某一場出現 832 次。

## 需要高階處理
- `docs/state.md` 對 Assist_CN／SN 寫「回應無效果，但無害」。依上面的越界讀證據，「無害」講得太滿（原 journal 自己也只標 🟡「客戶端沒崩潰」）。已追加更正。
- 修法（要先過 PM 的 bytes 關卡）：比照 Death_SN／Assist_SN 的做法，給 `Special_SN` 補上足夠長度且欄位正確的 body；Assist_SN 的佈局既有 journal 已經有了。
- Moon 點名的那幾個目標模式要實測，得先有人玩到那些模式（PvP 或 Boss），目前開不起來。
