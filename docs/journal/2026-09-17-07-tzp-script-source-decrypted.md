# 客戶端腳本包解密成功，UnrealScript 原始碼可讀（2026-09-17）

## 合規

- 純離線檔案分析：只讀 `Core.dll` 的常數表和 `data/MUD/*.tzp`，產生解密後的副本。沒有改客戶端、沒有注入、沒有附加除錯器，也沒碰 XIGNCODE，符合硬性約束 1。
- 解出來的是原廠程式碼，**不 commit**。輸出放在 repo 外的 `~/mro-decrypted/`（約 1.2GB），可以用 `Metal Rage Online Server/tools/tzp-extract.py` 重建。

## 解密方式

- ✅ [DLL] `Core.dll` `FArchive::Decrypt_MH` `0x101622d0`（組語 `0x101622f0`–`0x1016231f`）：`buf[i] ^= byte [0x10181380 + (([this+0x48] << 10) + (pos & 0x3ff)) * 4]`，其中 `pos` 是 `[this+0x4c]`，每處理一個 byte 加 1。
- ✅ [TEST] 每個檔案用不同的 key 索引（`[this+0x48]`）。用「解出開頭是 package magic `C1832A9E`」來暴力找 key，所有 `.tzp` 都找得到（`ZModePve`=85、`ZBase`=4、`Engine`=28、`Core`=72…）。
- ✅ [TEST] 解密後是標準 Unreal package：version 134、licensee 29。
- ✅ [TEST] **封包裡保留了原始碼文字（TextBuffer）**，註解是 EUC-KR 韓文。總共抽出 1539 個 class，例如 `ZModePve/ZPvePlayercontroller.uc`、`ZBase/DefaultPlayerController.uc`、`Engine/PlayerController.uc`。
- 05、06 篇子 agent 說的「`.tzp` 只有貼圖、腳本讀不到」**錯誤**：`MUD/ZBase.tzp` 等就是腳本包，只是加了密。

## 立刻看到的線索（都還沒驗證）

- 🟡 [SRC] `ZBase/W_DPCForWeapon.uc:834` `SwitchWeapon`：只有 `DefaultMech(Pawn).bSetWepComplete` 為真時才換武器。
- 🟡 [SRC] 這個旗標只在 `ZBase/W_DefaultMechForWeapon.uc:352` 設成 true，也就是 `SetMechWeapon()`（第 179 行）的結尾；呼叫者包括 `ZBase/DefaultMech.uc:742`。
- 🟡 [SRC] `ZBase/DefaultPlayerController.uc:1468` `Jump`：要 `bJumppreparation_JW` 為真，而且 `!bNoInputKey_JW`。`bNoInputKey_JW` 由 `SetNoInputState_JW`（第 545 行）設定，呼叫點在第 2317、5203、5343 行。
- 🟡 [SRC] 腳本有用到 `Game_Play_Check()`：`ZPvePlayercontroller.uc:1426`、`:1463`，`DefaultPlayerController.uc:4236`、`:4280`，都在 `state PlayerSelectMech` 裡。
- 下一步：從 `DefaultMech.uc:742` 往回追 `SetMechWeapon` 在我們的流程中有沒有被呼叫、卡在哪個條件；同時查 `bNoInputKey_JW` 在第 2317／5203／5343 行的觸發條件。

## 其他檔案盤點（同日）

- ✅ [TEST] `data/MUD` 共 445 個 `.tzp`，**全部**用同一種方式解開，包括地圖 `Map_PC01.tzp` 等 34 張、貼圖、模型、特效（`~/mro-decrypted/*.u`）。地圖包沒有原始碼文字，但擺放的 actor 和屬性（例如 `ZPveEvent`、重生點、AI）要用 UE2 工具讀。
- ✅ [TEST] 以下本來就是明文，不用解密：`data/MUZ/*.mra`（186 個，開頭直接是 `C1832A9E`）、`Resource/**/*.sou`（RIFF／WAV）、`*.dds`／`*.c_dds`（DDS）、`System/*.twt`／`*.c_twt`（UTF-16 文字）、`Music/*.ogg`。
- `System/*.xem` 是 PE 執行檔（反作弊相關模組），**不碰**。
