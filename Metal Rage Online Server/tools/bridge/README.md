# tools/bridge — BRIDGE-SPIKE 階段 0/1 素材

背景與契約：`docs/backlog.md` 的 `BRIDGE-SPIKE` 一節（含 2026-09-22 改用 Frida Gadget 的修訂）。
本目錄目前只放**階段 0** 的準備物件，**沒有做任何載入測試**。

## 32 位元工具鏈（階段 0 第 2 項）

WSL 上已裝好，🟡 未實際編譯測試（階段 0 只確認存在，不寫程式）：

```
$ i686-w64-mingw32-gcc --version
i686-w64-mingw32-gcc (GCC) 10-win32 20220113
```

套件：`gcc-mingw-w64-i686`、`gcc-mingw-w64-i686-win32`、`mingw-w64-i686-dev` 8.0.0-1
（`dpkg -l | grep mingw` 確認過，均為 `ii` 已安裝）。
結論：**有**，proxy DLL（如果階段 1 之後還是選擇自己編）可以直接在 WSL 交叉編譯，
不需要請操作者另外裝。

## frida-gadget（階段 0 第 3 項）

| 項目 | 值 |
|---|---|
| 版本 | 17.18.0（GitHub `frida/frida` release tag，2026-09-09 發布，抓取當下的 latest） |
| 檔名 | `frida-gadget-17.18.0-windows-x86.dll`（**x86，32 位元**，對應客戶端是 32 位元行程） |
| 下載網址 | `https://github.com/frida/frida/releases/download/17.18.0/frida-gadget-17.18.0-windows-x86.dll.xz` |
| 下載時間 | 2026-09-22（`curl` 自 GitHub API `releases/latest` 取得 asset 清單後直接下載） |
| 壓縮檔 sha256（本機算，非上游公告值——**frida 沒有發布獨立的 checksum 檔**，這裡只是自我核對用） | `6255445eb61bdc16a6a9f39a99d4a736f09d8a4b66d8eee1557543a9b977d309` |
| 解壓後 DLL sha256（本機算） | `f74fb6d7316fb56015e02dc0621a07f88b774e5ae4944a16e06cff5dbc6f0988` |
| `file` 檢查 | `PE32 executable (DLL) (GUI) Intel 80386, for MS Windows` —— 確認是 32 位元，不是 x86_64 |

🟡 sha256 只是自己下載後算出來的，**沒有比對上游任何獨立公告的雜湊**（frida 的 GitHub
release 頁面本身沒有附 checksum 檔），只能保證「這份檔案在我這台機器上没被傳輸損毀」，
不能保證「這就是 frida 官方原始 build 沒被竄改」；如果要更高信心，之後可以另外用
`pip install frida-tools` 裝出來的版本互相比對，或找 frida 專案的 PGP 簽章（本次沒做）。

## 階段 1：proxy `VERSION.dll`（中階 `claude-worker` 2026-09-22，🟡 待審）

兩版原始碼與建置腳本：

- `proxy-version/`：**forwarder 版（建議採用）**，用 `.def` 的
  `Foo=VERSION_ORIG.Foo` PE forwarder 語法轉發 6 個符號
  （`GetFileVersionInfoA/W`、`GetFileVersionInfoSizeA/W`、`VerQueryValueA/W`），
  `DllMain` 只寫 log + `LoadLibraryW` 載 gadget。`build.sh` 一鍵重建。
- `proxy-version-thunk/`：手寫 thunk 對照組，`GetProcAddress` 拿到真函式
  指標後手動轉呼叫，`LoadLibraryW` 用絕對路徑
  `C:\Windows\SysWOW64\version.dll`（不依賴同目錄的 `VERSION_ORIG.dll`）。
  `build.sh` 一鍵重建，**必須**帶 `-Wl,--kill-at`（見腳本註解，不然匯出
  名字會帶 `@N` 尾巴，`GetProcAddress(..., "VerQueryValueA")` 這類 plain
  名字查詢會失敗）。

**兩版都編得出來，export 表用 `objdump -p`／`pefile` 靜態驗證過，
匯出名字跟真正系統 `version.dll`（`/mnt/c/Windows/SysWOW64/version.dll`）
的 17 個 export 逐一核對過名字一致**。`proxy-version/test/` 有一支最小
32 位元測試 exe，implicit-link 2 個目標符號，import 表的 Hint/Name
欄位跟官方 mingw-w64 系統 `libversion.a` 產生的版本逐 byte 比對過一致。

**沒有做過的事**：WSL 沒裝 `wine`，**沒有任何執行期測試**——DllMain 有沒有
真的被呼叫、gadget 有沒有真的載入成功、forwarder 在真正 Windows loader
上會不會解析成功，都還沒驗證過。細節、安裝步驟、還原步驟見
`stage1-plan.md`。

## 收窄版掛鉤：能不能直接掛 `Func`、方案 B／C（中階 `claude-worker` 2026-09-22，🟡 待審）

背景：`bridge-fire.js` 掛 `Engine.dll+0x2234b0`（`AActor::ProcessRemoteFunction` 本體），
戰鬥中每秒被呼叫 14–18 萬次，會拉低 FPS，讓 `D = DeltaTime × CurrentNetSpeed` 這個投射物
遺失機制的分母系統性偏寬，導致量到的遺失率偏低（見
`docs/journal/2026-09-22-1900-bridge-stage2.md`「⚠️ 方法論風險」一節）。這裡回答一個技術
問題、交出兩支收窄版腳本。

### 問題：能不能直接掛 `ServerFireProjectileCenterLoc_MH`／`ClientFireProjectileCenterLoc_MH`
### 自己的 native 進入點（`UFunction->Func`）？

**不能，這條路已排除（🟡，靠反組譯，非猜測）。** 兩個獨立證據：

1. `docs/research/2026-09-22-bridge-spike/stage2-addresses.txt` 段落 B6：掃過
   `Engine.dll`／`Core.dll`／`ZNetwork.dll` 三個 DLL 的 export 表與字串，
   `ServerFireProjectileCenterLoc_MH`／`ClientFireProjectileCenterLoc_MH`
   完全沒有對應符號——這兩個是純 UnrealScript `simulated function`（沒有 `native`
   關鍵字），只存在於 `.u` 腳本的 bytecode 裡，本來就沒有獨立的機器碼位址可掛。
2. `docs/research/2026-09-20-toall-dispatch/ProcessRemoteFunction-decompile.txt`
   第 66–71 行：這個引擎呼叫非 native UFunction 時，走的是「讀 bytecode 第一個
   opcode byte，再用這個 byte 去查一張共用的全域表 `GNatives`」，不是讀 UFunction
   物件上某個各自不同的 `Func` 指標欄位去直接 call。就算查得出 `Func` 欄位在
   `UFunction` 結構裡的 offset，對這兩個非 native 函式來說它也不會指到各自獨立的
   程式碼——會落在所有非 native script 函式共用的 bytecode 直譯器入口，等於又掛回
   通用分派點，沒有收窄。

**結論：方案 A（直接掛 `Func`）不成立，改採方案 B。**

### 方案 B — `bridge-fire-narrow.js`：原地掛鉤，onEnter 收成指標比對

仍掛 `Engine.dll+0x2234b0`（跟 `bridge-fire.js` 同一個位址），但用「暖機階段」找出
`ServerFireProjectileCenterLoc_MH`／`ClientFireProjectileCenterLoc_MH` 兩個
`UFunction*` 的實際指標值（跟 `bridge-fire.js` 一樣做 FName 解析，直到兩個都出現過
一次），之後切成 `narrow` 模式：`onEnter` 只剩「null 檢查 + 累計 + 至多兩次
`ptr.equals(...)` 比較」，不查 Map、不解字串、不普查、不做 I/O。暖機沒有時間上限，
必須讓操作者在暖機期間實際開過火，兩個指標才找得齊。log：`bridge-fire-narrow.log`。

### 方案 C（PM 2026-09-22 補充）— `bridge-fire-late.js`：把掛鉤位址往後移

跟方案 B 是不同的變數：不改 onEnter 的邏輯（仍做全套 FName 解析＋普查，跟
`bridge-fire.js` 一樣），只把 `Interceptor.attach` 的**位址**往後移到
`ProcessRemoteFunction` 本體內「已經確認這是網路函式（`FunctionFlags & 0x40`）」
之後：

```
VA 0x1052355b  test  byte ptr [ebx+0x84], 0x40   ; ebx = UFunction*
VA 0x10523562  je    0x10523521                  ; 沒有這個 flag -> 提早返回（非 RPC）
VA 0x10523564  mov   edx, dword ptr [edi]         ; <- 掛鉤點；ebx/edi 全程未被覆寫
```

（`tools/disasm.py at 0x105234b0 400 Engine.dll` 現場反組譯核對，Engine.dll sha256
`fc51fe1240ee34111fc1a483e74a1b131d4b69f2b2a0940adbb4a860a138d24e`，跟
`stage2-addresses.txt` 記的一致；推導細節、為什麼不選 PM 原先給的 `0x10523597`
候選、為什麼用 `this.context.ebx`/`edi` 而不是 `args[0]`，都寫在
`bridge-fire-late.js` 檔頭註解裡）。**這一段反組譯只有這次任務做過一輪，尚未經
高階覆核，標🟡**，下一位務必重跑同一條 `disasm.py` 指令核對再信任。

理論上非網路的 script 事件（`RenderOverlays`、`PlayerMove`…）會在這個掛鉤點之前就
提早返回，攔截頻率應該遠低於 `bridge-fire.js` 的「每個 script 事件」；能低多少、
會不會漏掉什麼 RPC，**要靠實跑驗證**，log：`bridge-fire-late.log`。

### 四組對照怎麼跑

四次都用同一支 Pico 劇本 `tools/pico/experiments/bridge-fps-compare.json`（單人
PvE，client id 固定叫 `host`），每次跑之前手動調整
`C:\Games\MetalRage Online 3\data\System\frida-gadget-17.18.0-windows-x86.config`
的 `interaction.path`：

| 組別 | `.config` 的 `interaction.path` | 目的 |
|---|---|---|
| 1. 不掛 | 把 `.config` 整個移走或改 `interaction.type` 成不載入腳本，讓 gadget 附著但不 hook 任何東西 | FPS 基準 |
| 2. 現行 | `...\\bridge-fire.js` | 已驗證的基準組（`docs/journal/2026-09-22-1900-bridge-stage2.md`），**不要改這支腳本** |
| 3. 方案 B | `...\\bridge-fire-narrow.js` | 量「onEnter 收窄」單獨的效果 |
| 4. 方案 C | `...\\bridge-fire-late.js` | 量「掛鉤位址後移」單獨的效果 |

四組之間**建議重開客戶端**（gadget 的 `.config` 是行程啟動時讀一次的靜態設定，
中途換腳本檔案不保證即時生效，沒有驗證過熱切換行不行，不要冒險去省這個重開）。
每組跑完用 `close_client` 讓對應的 `.log` flush，四份 log 的 `calls=` 欄位與
截圖裡 `stat fps` 顯示的數字就是要比對的東西；`ServerFire=`/`ClientFire=` 三支
腳本應該都對得上（都是 6，對應 `fire_burst(shots=6)`），對不上代表收窄邏輯本身
有問題，要先查那個，不要直接拿 FPS 數字去下結論。
