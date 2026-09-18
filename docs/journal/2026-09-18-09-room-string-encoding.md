# R2 房名與房間暱稱窄字串路徑（待審）

狀態：🟡 待審；本次只加入預設關閉的編碼路徑，未啟動伺服器，等待操作者實測。

## 契約與現況

- [OBS][SHOT] R2 指派記錄 `shots/room-ours.png`、`shots/room-settings.png`：房名輸入 `Lucas`，畫面只顯示 `L`；RED TEAM 槽位也呈空白。
- [CODE] `room-state.sender.js:73` 原本以 `utf16le` 寫 `SN_ROOM_NAME 0x0022021A` body+0x00。
- [CODE] 現有 HEAD 的 `room-user.sender.js:43` 已以 `ascii` 寫 `SN_USER_DEFAULT 0x00220233` 的 body+0x1D，即每筆 record+0x1B；這不是契約文字所說的 UTF-16LE 現況。
- [CODE] 同檔 `room-user.sender.js:52` 實際是另一個 `SN_USER_NAME 0x00220421`，仍是 `utf16le`；本任務沒有足夠 DLL 證據把它改成 ANSI，故保留。
- [DOC] `AGENTS.md:37` 目前寫著「房間名稱是 UTF-16LE、User_Default_SN 暱稱是 ASCII」；本任務只記錄 R2 對房名的新疑點，不修改規則檔。

## DLL 證據

- [DLL] R2 契約給出的 `Room_Name_SN` thunk `0x1070532b` → 本體 `0x107ea7d0`；本體把 body 起點當 `const char*`。
- [DLL] `0x1091b834` 是 `Core.dll!winGetSizeUNICODE(const char*)`，`0x1091b830` 是 `winToUNICODE(WCHAR*, const char*, int)`。
- [DLL] `0x107ea829` 呼叫 `winGetSizeUNICODE`，`0x107ea845-0x107ea847` 將窄字串送入 `winToUNICODE`；長度在 `0x107ea82f` 與 `0x107ea859` 限至 `0x19`。
- [DLL] `docs/research/2026-09-18-room-user/disasm.txt:5` 另記錄相同本體的 export thunk 為 `0x10705326`；與 R2 指派的 `0x1070532b` 有 5-byte 位址落差，本文不自行裁決。
- [DLL] `User_Default_SN` thunk `0x1070979b` → 本體 `0x107ee2d0`；`0x107ee45e-0x107ee498` 讀 record+0x1B 並走 `winGetSizeUNICODE`／`winToUNICODE`，支持窄字串，而非 UTF-16LE。
- [DLL] `0x107ee46c` 對暱稱長度作 `0x19` 上限；來源 raw disasm 亦列 `0x1091b834`／`0x1091b830`。

## 為何 `Lucas` 只剩 `L`

- [GUESS→DLL] UTF-16LE 的 `Lucas\0` bytes 是 `4c 00 75 00 63 00 61 00 73 00 00 00`。
- [DLL] 若 handler 將 body 當 ANSI `char*`，第二個 byte `00` 會在第一個字元後終止 C 字串，因此客戶端只收到 `L`。
- [DLL] handler 自己再把 ANSI 窄字串轉成顯示用寬字串；網路欄位不是因為顯示層使用 `WCHAR` 就應該在線上送 UTF-16LE。

## 修正設計

- 新增共用 `dispatch/room/room-string.js`，開關為 `ROOM_STRING_ANSI_MODE = 'disabled'`；兩個 sender 由同一來源讀取，避免值漂移。
- enabled 使用 ASCII 窄字串：DLL 證據是 `const char*`，而目前 `User_Default_SN` 已明確使用 ASCII；選 ASCII 而非直接使用 latin1，可把超出 7-bit 的字元明確替換成 `?`，不依賴 Node／Windows code page 差異。
- `writeAnsiStringField()` 先清零整個欄位，再逐 Unicode code point 保留最多 25 個字元；非 ASCII 以 `?` 替換，不拋例外。
- `SN_ROOM_NAME 0x0022021A` enabled 寫 body+0x00、欄位範圍 0x32 bytes；封包 body size 仍為 0x32。
- `SN_USER_DEFAULT 0x00220233` enabled 寫 body+0x1D（record+0x1B）、欄位範圍 0x19 bytes；封包 body size 仍為 0x36。
- disabled 保留原有房名 UTF-16LE 寫法與 User_Default ASCII 寫法，沒有改其它 record 欄位。
- `ROOM_MAP_SYNC_MODE` 目前由操作者開啟，工作樹中的 enabled 值未修改；商店、ItemInfo、G7 也未觸碰。

## 範圍界線

- [CODE] 沒有改 `SN_USER_NAME 0x00220421` 的 body offset、長度或 UTF-16LE 寫法。
- [CODE] 沒有改 `SN_USER_DEFAULT` 的 status、count、pilot、level、state、team、rank 或 IP 欄位。
- [CODE] 沒有改 `SN_ROOM_NAME` 的 opcode、body 起點、body size 或送出順序。
- [CODE] helper 只處理字串 bytes；它不改 `client.roomName_`／`client.nickname_` 的來源。
- [CODE] 超過 25 個 Unicode code point 的尾端會被截斷；非 ASCII code point 以單一 `?` byte 替換。
- [CODE] 欄位清零範圍是房名 body+0x00..0x31、暱稱 body+0x1D..0x35，不越過封包欄位。
- 🟡 因 `SN_USER_DEFAULT` 在現有 HEAD 已是 ASCII，enabled 對純 ASCII 暱稱的 bytes 與 disabled 相同；差異在清零與非 ASCII 替換／截斷。
- ⬜ `SN_USER_NAME` 是否也由同一窄字串路徑消費，留待另一個有 DLL 證據的任務，不在 R2 猜測。

## 驗證與待審

- [TEST] `node --check` 將在 commit 前對兩個 sender、共用 helper 與受影響的 room dispatch 執行。
- [TEST] `git diff --check` 將在 commit 前執行；本次不開伺服器、不請操作者重啟。
- 🟡 待實測：房名 `Lucas` 是否由單字元恢復完整顯示，以及 RED TEAM 暱稱是否出現。
- ⬜ 待高階裁決：R2 指派的 `0x1070532b` 與已存 raw disasm 的 `0x10705326` 哪一個是正確 thunk 起點。
