# 舊版台版客戶端盤點（OLD-CLIENT）

- 契約：PM 裁決的 B 線盤點（唯讀、靜態、不執行任何 exe），由 explorer 子 agent（中階）完成，高階整理。🟡 未經跨公司審查。
- 位置：`/mnt/c/Games/鐵影特攻(MetalRage Online)`（見 `docs/reference/client.md` 第二份客戶端）。

## 七項結論

1. **版本：** 兩份 `Build.ini` 都是 `MR_Build_[2009-12-10_09.30]`，這是固定字串，看不出新舊。實際差異看檔案日期：舊版 2010-09-05，現行 2010-11。兩個 exe 都找不到「Compiled」字串。
2. **雜湊：** 都在 `data/System/`。
   - `MetalRage.exe`：同樣 214184 bytes，舊版 sha256 `419d9275…`（就是 setup.md 記的「Win10 要用的原版 exe」），現行 `4876460b…`，只差 6 bytes（offset 353-354、102932-102933、102968）。
   - `ZNetwork.dll`：舊 1,302,528 bytes、sha256 `47cef154…`；現行 2,076,672 bytes、`6b07758e…`。
   - `Core.dll`、`D3D9Drv.dll`：大小相同，雜湊不同。`Engine.dll` 大小略有差異。
   - `Cache.Bin`：舊 439,516 bytes（2010-09-05），現行 484,086 bytes。
   - `.xem`：現行多一個 `xdna.xem`。
3. **ZNetwork.dll 保護程度：** 兩版都是一般 MSVC section（.text .rdata .data .idata .reloc），.text 熵約 5.6，import、export 都完整（舊 1331 個具名 export、現行 1360 個），進入點是標準 CRT 開頭，handler 本體是可讀的一般 x86 → **舊版沒有比較好讀**。
   - ⚠️ 這跟 `docs/reference/client.md`「Themida ×2 保護 ZNetwork.dll」不一致：至少磁碟上的檔案看不出 Themida 特徵。只抽查了進入點和一個 handler，沒有掃完整個 .text，**先記疑點，不改 client.md**，等高階或 verifier 深入確認。
   - 現行版的 import 多了 `OLEAUT32.dll`、`nmcogame.dll`，後者 ⬜ 不在 client.md 的保護清單裡。
4. **export 差異（ZDispatch*／UZNetwork_DJ）：**
   - 只有舊版有：5 個。其中 `Game_Item_Add` 是 8 個 int 參數的版本，現行版是 9 個；還有 `execCertify_Is_RealServerPatch`。
   - 只有現行版有：38 個，包括：
     - NexonJapan 登入系列；
     - TwoBoss／TriggerTouch 頭目機制；
     - Tutorial_Start／End；
     - 違禁字檢查（Wrong_Word_Check 等，可能跟聊天「test」被換成 `????` 有關）；
     - `Reward_FirstReceiveExp_User_SN`、`Game_Reward_Newbie`、`Mech_Attack_License_Count_Get`。
5. **腳本包：** `data/MUD/*.tzp` 舊版 418 個、現行 445 個，舊版用 `tzp-extract.py` 同一套演算法可以解開。抽查 4 個包，只有 3 個檔案行數不同（地雷類 +5、`BaseGun_Attachment` +1），沒有全面比對。
6. **中文語系：** 舊版的 `data/System/*.twt` 是原始繁體中文（UTF-16LE）。現行版其實也保留了同一份中文，改名成 `*.c_twt`，`*.twt` 是英文；`switch.cmd` 依 `current_language.txt` 切換。→ 中文介面在現行客戶端就能切回來，舊版可以當作沒被動過的對照。
7. **現行版缺的東西：** 沒有。沒有專用伺服器／UCC 執行檔、沒有額外文件或工具，地圖（MUZ，186 個檔）檔名完全相同。反過來，現行版多了 `ZServerUI.tzp` 和 `xdna.xem`。

## 分級

- **立即有用：** 第 6 項，中文介面可以用現行客戶端的 `switch.cmd` 切換，給朋友用；舊版 `.twt` 是原始用語對照。第 4 項，新版才有的 opcode 名稱，之後查未知封包可以用。
- **之後可能有用：** 第 5 項，完整比對 418 個舊包和 445 個新包的腳本；`ZServerUI.tzp`（名稱像伺服器介面，沒看內容）。
- **沒用：** 第 3 項，原本期待的「舊版比較好讀」不成立。另外留一個疑點給 client.md 的 Themida 描述。

## 補查：現行客戶端的 switch.cmd（PM 追加，高階直接讀）

- `switch.cmd` 讀 `current_language.txt`（內容 `english`）：
  - `:english` 分支：把 `data/System/*.c_twt` 換成 `*.twt`，原本的英文 `.twt` 改名成 `.e_twt`；`data/Resource/twt/UI/*.c_dds` 也同樣處理；最後寫入 `chinese`。
  - `:chinese` 分支：反向換回英文。
  - 只改檔名，不改內容。
- 中文檔：`*.c_twt` 31 個，UTF-16LE 繁體中文（`Core.c_twt` 開頭 `Unknown="未知的錯誤"`）；只有 `ALAudio.twt` 沒有中文版。UI 貼圖 `*.c_dds` 2 個。
- → 中文介面**不需要舊版**，現行客戶端執行 `switch.cmd` 就能切換。要不要切由操作者決定。🟡 y0da 只 CRC exe 的 .text，應該不受影響，但沒實測。
