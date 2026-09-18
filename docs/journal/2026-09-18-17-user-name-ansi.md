# R12 User_Name_SN 改送 ANSI 名稱

狀態：🟡 待審；開關預設 disabled，未啟動伺服器實測。

## 依據與目標

- [OBS] R11 修正 `SN_ROOM_DEFAULT` 隊伍槽後，玩家頭像槽位正常進入，房主標記顯示，但玩家暱稱只顯示第一個字母 `L`。
- [LOG] `User_Name_SN 0x00220421` 目前為 78-byte（`0x4E`）exact body，body+0x1B 寫入 `4c 00 75 00 63 00 61 00 73 00...`（UTF-16LE）。
- [DLL] handler 本體 `0x107eb050`（`ZDispatchRoom::User_Name_SN`）：
  - `0x107eb09b`：`mov eax, dword ptr [esp + 0x44]` 取封包 wrapper 指標（body 位於 `eax + 0x10`）。
  - `0x107eb09f`：`movzx ebp, word ptr [eax + 0x10]` 取 body+0x00 的 user index。
  - `0x107eb0a3`：`lea esi, [eax + 0x2b]`，`0x2b - 0x10 = 0x1b`，對應 body+0x1B 名稱指標。
  - `0x107eb0aa-0x107eb0b3`：呼叫 `[0x1091b834]`（`winGetSizeUNICODE(const char*)`），按 NUL 結尾計算窄字串長度。
  - `0x107eb0b6`：`cmp eax, 0x19`，最大截斷長度為 25 字元。
  - `0x107eb0ce`：呼叫 `[0x1091b830]`（`winToUNICODE`），將 ANSI 字串轉換為 UTF-16LE 寫入 stack buffer `[esp + 0x0c]`。
  - `0x107eb0d7`：`mov word ptr [esp + edi*2 + 0xa], 0` 補寬字元 NUL 結尾。
- 結論：客戶端期望 body+0x1B 為 ANSI 窄字串，伺服器送出 UTF-16LE 時，`winGetSizeUNICODE` 在第二個 byte `0x00` 即判定字串結束，長度算為 1，因此僅顯示首字 `L`。

## 封包欄位與離線驗證

| 欄位 | 偏移 | 型別 | disabled 現況 | enabled 行為 |
|---|---|---|---|---|
| UserIndex | +0x00 | u16LE | `accountIndex` | `accountIndex`（不變） |
| Reserved | +0x02..0x1A | bytes | 25 bytes 0x00 | 25 bytes 0x00（不變） |
| Nickname | +0x1B | string | UTF-16LE（`Lucas\0`） | ANSI（`Lucas\0`） |
| Body Length | — | — | exact 0x4E（78 bytes） | exact 0x4E（78 bytes） |

### 離線 Hex 比對（以 `accountIndex=1`, `nickname="Lucas"` 為例）

- disabled（舊）:
  `0100 00000000000000000000000000000000000000000000000000 4c007500630061007300000000000000...`
- enabled（新）:
  `0100 00000000000000000000000000000000000000000000000000 4c756361730000000000000000000000...`

## 實作與開關

- [CODE] `Metal Rage Online Server/dispatch/room/room-user.sender.js:8`：
  新增 `const ROOM_USER_NAME_ANSI_MODE = 'disabled'; // 'disabled' | 'enabled'`。
- [CODE] 同檔 `:57-63`：
  enabled 時呼叫 `writeAnsiStringField(respBody, nickname, 0x1B, 0x4E - 0x1B)`；disabled 時維持原 `respBody.write(nickname + '\0', 0x1B, 'utf16le')`。
- [TEST] `node --check` 通過；sender 離線執行比對，disabled 時 byte-for-byte 完全吻合舊封包，enabled 時 body 長度仍為 78 bytes，userIndex 保持 1，0x1B 寫入 ANSI 字串。

## 待審邊界

- 🟡 僅修改 `User_Name_SN 0x00220421` 名稱欄位編碼，未修改 user index、pilotId、teamIndex、state、master、封包順序或任何其他封包。
- 🟡 房間槽未顯示完整頭像（PilotCode）屬獨立問題，由 R13 分析。
- 🟡 開關預設 disabled，未啟動伺服器，等待下一輪單變數實測驗證。

## 高階審查與實測（2026-09-18 22:10，Claude 高階）

- [DLL] 重驗：`0x107eb0a3 lea esi,[eax+0x2b]` 後，`0x107eb0b1` 呼叫 import `0x1091b834`＝`Core.dll!winGetSizeUNICODE(const char*)`，`0x107eb0ce` 呼叫 `0x1091b830`＝`Core.dll!winToUNICODE(wchar*, const char*, int)`；`0x107eb0b6 cmp eax,0x19` 上限 25 字，與 `writeAnsiStringField` 的 25 字截斷一致。
- [LOG] `session-20260918-220544.jsonl:66`：`0x00220421` body+0x1B＝`4c75636173 00…`（ANSI `Lucas`）。
- [OBS] T1：房間紅隊第一格顯示完整 `Lucas`（原本只有 `L`）。
- 結論：✅ `User_Name_SN 0x00220421` 名稱欄位是 ANSI。**預設改為 enabled。**
