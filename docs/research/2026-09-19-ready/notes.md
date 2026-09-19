# READY（房間準備）調查筆記 — 🟡 待審（explorer 子 agent，中階）

## 第一輪（READY-FMT）

- `0x00222101` 是 `ZDispatchRoom::Game_Ready_CN`（thunk `0x10702847` → 本體 `0x107ef8f0`）。body：+0 u32（`[obj+0x138]` float 轉 int，實測 `0x00000a27`，語意 ⬜），+4 u8 ready。
- 唯一呼叫點 `0x1072cb13`（native `0x1072ca60`）：`[edi+0x44c]==[edi+0xf74]`（🟡 應是「我是房主」）→ `Game_Start_CN`（`0x1070938b`，送 `0x00222103`）；否則 `Game_Ready_CN(true)`，**參數寫死 1**，這條路徑上找不到取消準備（送 0）的呼叫。
- `Game_Ready_SN 0x00222102`（thunk `0x10702086` → `0x107ecc00`）**只寫 log**（呼叫通用 trace `0x10703fe4`→`0x10728d50`），不動 UI。→ READY 字樣不是靠這包。
- 候選：`User_State_SN 0x00220401`（thunk `0x10709d2c` → `0x107eaf30`，逐筆迴圈、每筆呼叫 `0x10705add`）、`Room_State_SN 0x00220214`。交給 READY-FMT-2。
- ZNetwork.dll 裡房主按開始時沒有檢查全員準備；若有這個限制，在 UnrealScript 或伺服器端。
- `gate.game.dispatch.js` 把 `0x00222101` 註解成「場景載入完成」，DLL 自己的名稱是 Game_Ready_CN；現有的重送房間狀態行為是否依賴這個誤解，待確認後再動。
