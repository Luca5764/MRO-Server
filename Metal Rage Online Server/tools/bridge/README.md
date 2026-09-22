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
