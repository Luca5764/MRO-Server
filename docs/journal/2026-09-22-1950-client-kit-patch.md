# CLIENT-KIT-PATCH — 把 30000＋budget 做進 client-kit（中階，待審）

契約：`docs/backlog.md` 的 `CLIENT-KIT-PATCH` 一節（PM 2026-09-22 裁決後開立）。
worktree `~/mro-wt/client-kit`，分支 `flash-wip-client-kit`。

## 產出雜湊

在 `/tmp` 暫存目錄（不是主安裝、不是 `/mnt/c/Games` 任何目錄）跑：

```
python3 tools/patch_netspeed_host.py --target "/tmp/ck-work/patchtarget" \
  --i-know-this-is-the-copy --apply --value 30000 --budget
```

- 原廠 `Engine.dll` sha256：`fc51fe1240ee34111fc1a483e74a1b131d4b69f2b2a0940adbb4a860a138d24e`
  （跟工具腳本裡的 `EXPECTED_SHA256`、契約給的值一致；來源是 `/mnt/c/Games/MetalRage Online 3`
  的唯讀複製，**沒有讀寫主安裝** `/mnt/c/Games/MetalRage Online`）。
- 修補後（30000＋budget）sha256：`f4b253a3606243a0aa41101b812a1bec9dca79ab3de91818c024e458f14b4970`
  ——這串跟 `research/2026-09-22-netspeed-budget/threshold-tally.txt` 裡
  `FINAL 30000+budget f4b253a3606243a0 …` 那筆的前綴完全對上，**跟主力那邊出貨組合實測用的是同一顆檔案**，
  不是我自己另外兜出來的版本。
- `--restore` 還原回 `fc51fe12…` 也驗過（見下方「怎麼驗證的」）。
- 兩個雜湊都用 `python3 -c "..."` 的 `len()==64` 與逐字元比對過才寫進
  `setup-client.ps1`／`README.md`，不是用眼睛數 hex。

## 第 3 點：包怎麼帶這個檔 — 選了 (a)，不是契約建議的 (b)

理由（跟契約的建議相反，寫清楚）：

1. **(b) 現場套會撞到既有的安全閥**：`patch_netspeed_host.py` 的 `guard_target` 對
   `--target` basename 是 `metalrage online`（不分大小寫）**硬拒絕、沒有任何 override**——
   這條護欄是為了保護操作者自己的主安裝設計的。但 client-kit 的 README 自己教朋友把客戶端
   解壓縮成 `C:\Games\MetalRage Online`（第 3 步），這正是被硬拒絕的那個名字。要讓 (b) 能動，
   要嘛弱化這條護欄（超出本任務的「不要為了這件事改行為」限制，而且這條護欄本身是刻意設計成
   沒有 override 的安全機制，弱化它是架構決策，不該由我自己決定），要嘛叫每個朋友先把資料夾
   改名再跑腳本再改回來（不可靠、朋友一定會漏掉）。
2. **(b) 還多一個朋友機器上不會有的依賴**：修補工具是 Python，朋友的 Windows 機器沒有理由裝
   Python，等於整個包多一個安裝步驟，而且失敗模式（"python3 不是內部或外部命令"）對非技術朋友
   不好排查。
3. **(a) 一樣做得到「自己驗得出沒被改過」**：`setup-client.ps1` 用 `Get-FileHash`（PowerShell
   內建，不需要額外裝東西）在套用前後各驗一次 sha256，效果跟 (b) 現場驗證一樣，只是雜湊是我
   （操作者）先算好寫死在腳本裡，而不是朋友的機器自己跑 byte-level 比對。

取捨老實講：(a) 犧牲了「朋友自己重新跑一次逐 byte 比對」這一層，換成「相信腳本裡寫死的雜湊」；
但契約要求的「收到的人自己驗得出檔案沒被改過」，用 `Get-FileHash` 對照 README 上的兩串雜湊就
做得到，不需要懂 Python 或懂這個修補的原理。

## 改了 setup-client.ps1 什麼

新增 `Set-EnginePatch`（`Metal Rage Online Server/tools/client-kit/setup-client.ps1`）：
- **套用前**：`Get-FileHashUpper` 讀 `data\System\Engine.dll`；等於 `$PatchedEngineHash` 就當
  已經套過，直接跳過（idempotent，跟既有 `Set-CorrectExe` 的模式一致）；**不等於**
  `$StockEngineHash` 也**不等於**已修補雜湊 → `Write-Error` 並 `exit 1`，不猜、不碰檔案。
- **套用後**：`Copy-Item` 覆蓋成 `Engine.dll.patched`（跟腳本放在同一個 `client-kit` 資料夾，
  **沒有 commit 進 repo**，見下方「沒進 repo 的東西」），`Get-FileHashUpper` 再驗一次，
  不等於 `$PatchedEngineHash` → `Write-Error` 並 `exit 1`，訊息裡指向備份位置。
- 呼叫順序：`Assert-ClientRoot` → `Set-CorrectExe` → **`Set-EnginePatch`**（新增） →
  `Set-ServerIp` → `Set-P2PFirewallRule` → `Test-NetworkProfile`。
- `uninstall-client.ps1` 的還原清單加了 `Engine.dll.bak`。

## 怎麼驗證的

沒有 `pwsh`（WSL 上沒裝，`apt`／`snap` 都查不到），**沒有真的跑過 `.ps1`**，只做了：

1. **brace/paren 配對**：`python3` 數 `{`/`}`（41/41）、`(`/`)`（90/90），全平衡。
2. **兩個雜湊逐字元核對**：`grep` 出 `.ps1` 跟 `README.md` 裡寫死的字串，跟
   `sha256sum` 實際算出來的值做 `==` 比對，四處全部 `True`。
3. **用 bash 重現 `Set-EnginePatch` 的邏輯**（同樣的「先比對現有雜湊、不符就停；複製後再比對，
   不符就停；已是目標雜湊就跳過」判斷式，針對真實的 stock／patched 檔案跑），四個情境都符合預期：
   - 乾淨原廠 + 正確的 patched 來源 → 成功，驗到的雜湊等於 `f4b253a3…`。
   - 現有 `Engine.dll` 被改過（塞了 16 bytes 亂數）→ **停在套用前檢查**。
   - `Engine.dll.patched`（kit 裡帶的那份）被改過 → **停在套用後檢查**（覆蓋已經發生，
     跟現有 `Set-CorrectExe` 對 Win10 分支驗證失敗時的行為一致——只印錯誤指向備份，不自動回滾）。
   - 已經是 patched 雜湊 → 跳過，不重複複製。
   （踩到一個工具坑：Linux `cp` 會把來源檔的唯讀權限位元帶到新建立的目的檔，
   第一次跑腳本時因為來源 stock 檔是 `chmod 444` 而在第二次 `cp` 覆蓋時 Permission denied；
   跟 Windows/PowerShell 的 `Copy-Item -Force` 行為無關，只是我這次 bash 重現腳本要加
   `--no-preserve=mode`，不影響對 `.ps1` 邏輯本身的驗證結論。）
4. `python3 tools/patch_netspeed_host.py --restore` 對暫存副本跑過，雜湊確實回到
   `fc51fe12…`，三組 offset 都印回 `[original]`。

**沒有驗證的**：`.ps1` 語法本身（沒有 pwsh 可跑）、`Get-FileHash` 在真實 Windows 上的行為、
`Copy-Item -Force` 對唯讀/鎖定檔案的行為。這些留給操作者第一次實機跑 client-kit 時順便驗。

## 沒進 repo 的東西

`f4b253a3…` 這顆修補後的 `Engine.dll`（5.1 MB）**沒有 commit**，放在
`.gitignore` 新增的一行 `Metal Rage Online Server/tools/client-kit/Engine.dll.patched`
底下，worktree 裡確實存在這個檔案（`git status` 確認只有 3 個文字檔被追蹤：
`.gitignore`、`setup-client.ps1`、`uninstall-client.ps1`、`README.md`）。
操作者要發包給朋友時，這個檔案需要跟著 `client-kit` 資料夾一起壓縮，
但**不進 git**——重新產生的指令寫在 `.gitignore` 的註解跟 README 技術附註裡。

## README 改了什麼

- 「步驟」段落最後一句提到腳本現在也會換 `Engine.dll`。
- 新增一節「開火偶爾打不到人的修正（2026-09-22）」：純友善語氣講症狀
  （開火有時打不到人）跟效果（原廠連續開火 34 次約 10 次打空，修補版 34 次全中——
  數字來自 `research/2026-09-22-netspeed-budget/threshold-tally.txt` 的
  `MANUAL 30000 dc2f824d … 缺口=5.7%`／`MANUAL 30000+budget f4b253a3 … 缺口=0.0%`
  那兩筆人手連按對照，不是自動化那批），以及怎麼用 `Get-FileHash` 自己核對。
- **明確標「房主與加入者都要套用同一份」是採信 Moon 的做法，我們自己只驗過房主端**，
  跟契約限制第一條要求的一模一樣。
- 技術附註（`<details>` 摺疊，避免弄亂友善語氣的主體）列了兩處 netspeed 立即數
  （`0x17f9b1`、`0x17f9b8`，配套 NOP 在 `0x17f9b5`）跟三處 budget（`0x12e1f8`、
  `0x378b20`、`.text` 節區表 `VirtualSize` 欄位），數字照抄自
  `patch_netspeed_host.py` 的 docstring，不是我重新反組譯出來的。

## 沒做完或需要主力決定的事

- **沒有實機跑過 `.ps1`**（見上「怎麼驗證的」），第一次在真實 Windows 上跑
  `setup-client.ps1` 時要盯著看有沒有 PowerShell 語法錯誤——我只做了靜態核對。
- `Engine.dll.patched` 這個二進位檔只存在於我的 worktree（`~/mro-wt/client-kit`），
  沒有機制把它搬到操作者實際要拿去壓縮發包的地方；worktree 收掉前要先把這個檔案複製出去，
  否則會跟著 `git worktree remove` 一起消失（它沒進 git，不會被 commit 保住）。
- README「加入者也套用」那句話目前只有文字提醒，沒有任何機制擋「朋友忘記跑腳本」——
  這在契約範圍外，沒有處理。
