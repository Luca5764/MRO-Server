# netspeed 夾在 15000 的來源（2026-09-20 21:30）

承 `2026-09-20-2030-same-machine-and-netspeed.md` 第 5 節的下一步：從兩個 UTF-16 `NETSPEED` 字串往回追 xref。

## 找到的東西

`Engine.dll` 有兩處程式在做同一件事，都吃同一個 clamp 上限欄位：

1. **`UViewport::Exec`（export VA `0x104154f0`）**——本地主控台 `netspeed <n>` 指令的處理。VA `0x10415620` 起可乾淨反組譯（對齊正確，已核對）：`ParseCommand(&Cmd, "NETSPEED")` 命中後，呼叫類 atoi 的 helper（`call [0x10679464]`）拿到數字存 `ebx`，`cmp ebx, 0x708`（1800）低於就整個略過（`jl 0x10415de1`），接著在 `0x104156f0-0x104156ff` 做 `eax = NetDriver->MaxClientRate`（讀 `[esi+0x1168]`）、`ebx >= eax ? 保持 eax : eax = ebx`，把結果寫進 `[ecx+0x50]`（連線的 `CurrentNetSpeed`，與既有的 `IsNetReady` 研究對得上）。
2. **`ULevel::NotifyReceivedText`（export VA `0x1047ec80`）**——透過網路文字通道收到 `NETSPEED` 命令時的處理（VA `0x1047f98c` 附近，`0x1047f9a4-0x1047f9c2` 明確做 `Clamp(value, 1800, NetDriver->MaxClientRate)`，同一個 `+0x1168` 欄位）。這條路徑很可能就是 journal 前篇提到的 `GameInfo.uc` → `ClientCapBandwidth` 底層的實作方式（把數字格式化成 `NETSPEED n` 文字命令走控制頻道）。🟡 未逐行核對到 `GameInfo.uc` 那條呼叫鏈，只確認了這個函式本身的 clamp 邏輯。

## 15000 從哪來：`UNetDriver::StaticConstructor`

`0x1168` 欄位的值不是讀 ini，是**編譯進 DLL 的字面值**，寫在 `UNetDriver::StaticConstructor`（export VA `0x104a00f0`）裡，VA `0x104a0540`（file offset `0x1a0540`）：

```
mov dword ptr [ebx+0x1168], 0x3a98   ; 15000  -> MaxClientRate
mov dword ptr [ebx+0x116c], 0x2710   ; 10000  -> MaxInternetClientRate
```

用 python 對 Engine.dll 做位元組掃描（`C7 8[1236 or 7 or 5] 68 11 00 00 <imm32>`）確認整個檔案**只有這一處**寫 `+0x1168`，imm32=15000，精確落在這條指令上。

**更正前篇的判讀**：前篇說 file `~0x1a0546` 附近的 15000 位元組序列「巧合，不是運算元」——其實**是運算元**，只是那次是從 `0x1a0546` 開始反組譯（那是指令中段、immediate 的中間），對不齊才長出 `mov word ptr [esi], 0x88db` 這種垃圾解碼。指令真正的起點是 `0x1a0540`。

第二個欄位 `+0x116c 10000`（`MaxInternetClientRate`）跟今晚量到的**連線預設 `CurrentNetSpeed=10000`** 吻合，很可能就是那個預設值的來源。

## 回答契約的四個問題

- **(a) 夾在哪**：`Engine.dll` VA `0x104156f0-0x104156ff`（`UViewport::Exec` 內），形狀是簡單 `min(requested, cap)`，`cap` 讀自 `NetDriver+0x1168`；另一處 `ULevel::NotifyReceivedText` VA `0x1047f9a4-0x1047f9c2` 做完整 `Clamp(v, 1800, cap)`，同一個 `cap` 欄位。
- **(b) 夾的是什麼**：`UNetDriver::MaxClientRate`，編譯期預設 15000（`0x104a0540`），與 `MaxInternetClientRate` 預設 10000（`0x104a054a`）相鄰宣告。兩者都是 `defaultproperties` 編譯後直接寫進 class default object 記憶體的字面值。
- **(c) 不改二進位檔能不能繞過**：🟡 未驗證，待測、成本低——這兩個欄位若真的標了 `config`，理論上 `LoadConfig()` 之後會被 ini 蓋掉；操作者試過的 `[IpDrv.TcpNetDriver] MaxClientRate=100000` 沒用，但 `MaxClientRate` 很可能宣告在基底類別 `Engine.NetDriver`（我們正是在 `Engine.dll` 的 `UNetDriver::StaticConstructor` 找到它的，不是 `TcpNetDriver`），對應的 ini section 應該試 **`[Engine.NetDriver] MaxClientRate=100000` / `MaxInternetClientRate=100000`**，而不是 `IpDrv.TcpNetDriver`。沒時間驗證這條路是否真的有效——也可能該屬性根本沒標 `config`，那就只能改二進位檔。
- **(d) 最小二進位改動**：`Engine.dll` file offset `0x1a0546`（4 bytes LE），把 `98 3A 00 00`（15000）改成想要的值，例如 `A0 86 01 00`（100000）。**只改這裡只會提高 `netspeed` 手動指令與網路 clamp 的上限**，不會動到沒下指令時的預設值；預設值在相鄰的 file offset `0x1a0550`（`10 27 00 00` = 10000，`MaxInternetClientRate`），若要讓「什麼都不做」時的連線速度也變高，這處要一起改。**這只是分析，沒有實際修改任何檔案。**

## 尚待核對／矛盾

- 🟡 `ULevel::NotifyReceivedText → GameInfo.ClientCapBandwidth` 的呼叫鏈只是推論，沒有逐行核對 UnrealScript 那端怎麼觸發文字命令。
- 🟡 `[Engine.NetDriver]` ini section 是否真的有效，未測試（不確定該屬性有沒有標 `config`）。
- 不確定第一個函式裡 `esi`（`NetDriver` 指標）的完整指標鏈（`edi→[+4]→[+0xa0]→[+0x40]`）在 Ghidra 參數命名上對不對，本篇只核對了到 `esi` 的組語序列本身，沒有反查這條鏈背後的類別是誰的欄位偏移；不影響 clamp 結論本身（clamp 邏輯與位址已直接讀組語核對）。

原始反組譯：`docs/research/2026-09-20-netspeed-clamp/disasm.txt`。
