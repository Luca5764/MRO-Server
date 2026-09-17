# UELib 讀取 class 失敗根因定位與修復（2026-09-17）

## 背景

07 篇試用 `tools/uetool`（基於 UELib）時回報：
`list` 與地圖 actor 的 `decompile` 正常，但 `decompile Engine.Console` 等 class 物件時拋出 `InvalidCastException: Unable to cast object of type 'UELib.Core.UObjectProperty' to type 'UELib.Core.UClass'`，且伴隨 `Bad expression token 0x5C/0x46/0x03`。原推測 MRO 修改了 UClass / UStruct 格式或 bytecode token。

## 根因定位（待審）

1. **Core.dll 組語核對**：
   - 🟡 [DLL] `UStruct::Serialize` 在 `0x1011e7f0`：
     - `0x1011e828`: `SuperField` (`+0x38`)
     - `0x1011e833`: `Children` (`+0x40`)
     - `0x1011e83e`: `FriendlyName` (`+0x48`)
     - `0x1011e863`: `if (LicenseeVer >= 0x1a)` (26) 序列化 `StructFlags` (`+0x60`)
     - `0x1011e876`: `Line` (`+0x5c`)、`TextPos` (`+0x58`)
     - `0x1011e8be`: `Script.Num()` (ByteScriptSize) 與 `Script` bytecode
     - **完全沒有 `CppText`**，且 **LicenseeVer >= 26 時必定讀取 `StructFlags`**。
   - 🟡 [DLL] `UStruct::SerializeExpr` 在 `0x1011dbf0`：
     - `0x1011dd9e`: token > 0x47 且 < 0x60 均跳到 `0x1011e2a7` 呼叫 `appErrorf("Bad expr token %02X")`。
     - 07 篇出現的 `0x5C`、`0x46`、`0x03` 是因偏移錯位，將後續資料誤當 bytecode 解析所致。

2. **UELib 的條件分支邏輯**：
   - 查 `UELib/src/Core/Classes/UStruct.cs:228-250`：
     ```csharp
     if (_Buffer.Version >= 120 && ... && (Package.Build != BuildGeneration.UE2_5 ...))
         CppText = _Buffer.ReadObject<UTextBuffer>();
     if (Package.Build == BuildGeneration.UE2_5 && _Buffer.LicenseeVersion >= 26)
         _Buffer.Read(out StructFlags);
     ```
   - 🟡 [SRC] MRO 的 package 版本為 `134/29`。在 UELib 官方 `UnrealPackage.cs` 中，134/29 沒有匹配的 `GameBuild` 定義，導致 `Package.Build` 被判定為 `BuildGeneration.Undefined` / `Build:Unknown`。
   - 因而觸發兩重錯位：
     1. 誤讀了不存在的 `CppText`（多讀一個 object reference）。
     2. 漏讀了 4 bytes 的 `StructFlags`。
   - 偏移錯位導致後續 `Line`、`TextPos`、`ByteScriptSize` 全體錯讀，將非 bytecode 資料送進 `UByteCodeDecompiler`，觸發 `Bad expression token`；反組譯中斷後 `_Buffer.Position` 停在錯誤位置，令 `UClass.Deserialize` 把隨機位元組當成 `ClassDependencies`，最後在 `stream.ReadObject<UClass>()` 轉型失敗拋出 `InvalidCastException`。

## 修正（待審）

- 🟡 [TEST] 在 `~/tools/Unreal-Library/src/UnrealPackage.cs` 的 `GameBuild.BuildName` 加入 MRO 定義：
  ```csharp
  [Build(134, 29u, BuildGeneration.UE2_5)]
  MetalRage,
  ```
- 重新編譯 UELib（Release net8.0）後，UELib 正確將 MRO 封包識別為 `Build:MetalRage`、`BuildGeneration.UE2_5`。
- 驗證結果：
  - `dotnet run --project tools/uetool -- ~/mro-decrypted/Engine.u decompile Engine.Console`：成功解出 class 宣告與完整 `defaultproperties`（`ConsoleHotKey=135`、`HistoryBot=-1`、`NowChatType=1`…）。
  - `dotnet run --project tools/uetool -- ~/mro-decrypted/Engine.u get Engine.Console ConsoleHotKey`：精確取得 `ConsoleHotKey=135`。
  - `dotnet run --project tools/uetool -- ~/mro-decrypted/ZBase.u decompile ZBase.DefaultPlayerController`：成功解出全部自訂機體與控制參數（`CheatClass=Class'ZBase.DefaultCheet'`、`PawnClass=Class'ZBase.DefaultMech'`…）。
- 產出 patch：`tools/uetool/uelib-metalrage.patch`，並於 `Program.cs` 註解中加入 `git apply` 指引。

## 審查（Claude 高階，同日）

- ✅ [DLL] `Core.dll` `0x1011e865`：`cmp ..., 0x1a` / `jl 0x1011e876`，確實是「LicenseeVer >= 26 才讀 StructFlags」的分支，和本篇描述一致。
- ✅ [TEST] 用 patch 過的 UELib 重新編譯 `tools/uetool`（Release）後重測：`Engine.u get Console ConsoleHotKey` 輸出 `ConsoleHotKey=135`；`ZBase.u decompile DefaultPlayerController` 沒有 `Bad expression`／exception，能讀出 defaultproperties。
- 注意：`tools/uetool/bin` 要重新 `dotnet build -c Release`，才會拿到新的 `Eliot.UELib.dll`（舊的 bin 會留著舊版 DLL，出現和 07 篇一樣的錯誤）。
- 補充：`ConsoleHotKey=135`＝`0x87`，在 UE2 的 `EInputKey` 中是 `IK_F24`，一般鍵盤按不到，所以不能靠 console 做執行期觀察。
- 審查結論：本篇的「待審」解除，結論成立。`class decompile` 目前輸出 class 宣告與 defaultproperties；函式本體是否完整反編譯尚未驗證。
- 流程：本篇 commit 在 `flash-wip`，審查後 fast-forward 合併回 `reverse-work`。
