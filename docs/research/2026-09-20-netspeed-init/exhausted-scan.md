# NetSpeed init — 窮舉掃描與兩條候選路徑完整反組譯（中階，唯讀）

承 `notes.md`。本檔補這一輪（2026-09-20 22:xx）產生的原始資料，不覆蓋前人內容。

## 1. `IpDrv.dll 0x10714880` 全函式完整反組譯（到 0x10714a3e）

前段（0x10714880–0x10714911）已在主檔案 `notes.md`／journal 引用過；本輪新看的尾段：

```
0x10714911  mov eax,[0x1071c27c]
0x10714916  fld qword ptr [eax]
0x10714918  mov dword ptr [ebp-4],0
0x1071491f  mov ecx,esi
0x10714921  fstp qword ptr [esi+0x4fa8]
0x10714927  mov byte ptr [ebp-4],1
0x1071492b  call dword ptr [0x1071c6e4]
0x10714931  test edi,edi
0x10714933  je 0x107149f9
0x10714939  lea ecx,[ebx+0xc]
0x1071493c  call dword ptr [0x1071c20c]
0x10714942  mov ebx,[0x1071c220]
0x10714948  xor edi,edi
0x10714950  cmp edi,4
0x10714953  jge 0x1071497d
0x10714955  test eax,eax
0x10714957  je 0x1071497a
0x10714959  mov cx,[eax]
0x1071495c  cmp cx,0x30
0x10714960  jb 0x1071497a
0x10714962  cmp cx,0x39
0x10714966  ja 0x1071497a
0x10714968  push 0x2e
0x1071496a  push eax
0x1071496b  call ebx
0x1071496d  add esp,8
0x10714970  test eax,eax
0x10714972  je 0x10714977
0x10714974  add eax,2
0x10714977  inc edi
0x10714978  jmp 0x10714950
0x1071497a  cmp edi,4
0x1071497d  jne 0x107149b8
0x1071497f  test eax,eax
0x10714981  jne 0x107149b8
0x10714983  mov ecx,[ebp+0x28]
0x10714986  add ecx,0xc
0x10714989  call dword ptr [0x1071c20c]
0x1071498f  push 0x400
0x10714994  push 0
0x10714996  push eax
0x10714997  call dword ptr [0x1071c1fc]
0x1071499d  add esp,0xc
0x107149a0  push eax
0x107149a1  call 0x10717c2c        ; thunk 表（jmp dword ptr [import]…），非普通函式
0x107149a6  push eax
0x107149a7  lea ecx,[esi+0x4f90]
0x107149ad  push ecx
0x107149ae  call 0x107172d0        ; *(ptr)=value; ret（4 行小函式），寫的是 esi+0x4f90
0x107149b3  add esp,8
0x107149b6  jmp 0x107149f9
0x107149b8  mov edx,[0x1071c1e4]
0x107149be  mov ecx,[edx]
0x107149c0  mov eax,[ecx]
0x107149c2  push 0x1071cc94
0x107149c7  push 0x308
0x107149cc  call dword ptr [eax]
0x107149ce  mov edi,eax
0x107149d0  mov [ebp+0xc],edi
0x107149d3  test edi,edi
0x107149d5  mov byte ptr [ebp-4],2
0x107149d9  je 0x107149f1
0x107149db  mov ecx,[ebp+0x28]
0x107149de  add ecx,0xc
0x107149e1  call dword ptr [0x1071c20c]
0x107149e7  push eax
0x107149e8  mov ecx,edi
0x107149ea  call 0x107018a0        ; DNS/位址解析類函式，ret 4，第49行結束
0x107149ef  jmp 0x107149f3
0x107149f1  xor eax,eax
0x107149f3  mov [esi+0x4fa4],eax
0x107149f9  mov ecx,[ebp-0xc]
0x107149fc  pop edi
0x107149fd  mov eax,esi
0x107149ff  pop esi
0x10714a00  mov dword ptr fs:[0],ecx
0x10714a07  pop ebx
0x10714a08  mov esp,ebp
0x10714a0a  pop ebp
0x10714a0b  ret 0x24
0x10714a0e  ...（第二個進入點，處理例外/錯誤訊息，跟 netspeed 無關）
0x10714a3e  int3
0x10714a3f  int3
0x10714a40  push ebp            ; 下一個函式的 SEH prologue，確認 0x10714880 函式邊界到此為止
```

全函式（0x10714880–0x10714a3e）對 `+0x50` 零引用，用 `grep -n "0x50\]"` 對完整反組譯文字比對確認。

## 2. `Engine.dll UNetPendingLevel::NotifyReceivedText`（0x104c6960）：Connection 參數確認鏈

函式開頭（確認 `[ebp+8]` 是 Connection 參數、且斷言等於 `NetDriver->ServerConnection`）：

```
0x104c6960  push ebp
0x104c6961  mov ebp,esp
...
0x104c697f  mov ebx,ecx              ; ebx = this (UNetPendingLevel)
0x104c6981  mov eax,[ebx+0x14]       ; eax = this->NetDriver
0x104c6984  mov ecx,[ebp+8]          ; ecx = Connection 參數
0x104c6987  mov edx,[eax+0x3c]       ; edx = NetDriver->ServerConnection (+0x3c，與 IpDrv InitConnect 寫入位置一致)
0x104c698e  cmp ecx,edx              ; assert Connection == NetDriver->ServerConnection
0x104c6999  je 0x104c69b3            ; 相等就跳過下面的斷言失敗路徑
0x104c699b  push 0x8c                ; 不等 -> assert-fail helper (0x10679180)
```

之後在 CHALLENGE 回應分支（組 "NETSPEED %i"）重新載入同一個參數：

```
0x104c7016  mov esi,[ebp+8]          ; esi = 同一個 Connection 參數
0x104c7019  mov edx,[esi+0x50]       ; edx = Connection->CurrentNetSpeed  （讀，dest=暫存器，src=記憶體）
0x104c701c  mov eax,[ebx+0x14]
0x104c701f  mov ecx,[eax+0x3c]
0x104c7022  push edx
0x104c7023  add ecx,0x2c
0x104c7026  push 0x106a7f94          ; "NETSPEED %i" 格式字串
0x104c702b  push ecx
0x104c702c  call dword ptr [0x10679210]   ; sprintf 類
```

結論：`esi` 就是 `[ebp+8]`，跟函式開頭斷言過的 Connection 參數是同一個值，型別是 `UNetConnection*`（不是 UPlayer/UViewport）。全函式（2000 行反組譯，約 0x104c6960–0x104c8150）對 `+0x50` 只有這一筆引用，其餘 4 筆 `0x50` 都是 `[ebp-0x50]` 區域變數。

## 3. 全檔案字面值掃描方法（Python + pefile，opcode 0xC7 /0）

掃描涵蓋以下 ModRM/SIB 編碼形式，尋找 `mov dword ptr [addr+0x50], imm32`：
- `mod=01, rm∈{0,1,2,3,5,6,7}`（disp8，排除 rm=4 因為那是 SIB byte）
- `mod=01, rm=4`（disp8 + SIB byte）
- `mod=10, rm≠4`（disp32）
- `mod=10, rm=4`（disp32 + SIB byte）

在 `Engine.dll` 全檔案上，disp8 變形共 10 筆命中（imm 分別是 2600/1000000×2/1/0×4/0x12345678/256，皆非 10000）；disp8+SIB、disp32、disp32+SIB 加上限制 `imm==10000` 之後三個 DLL（`Engine.dll`／`Core.dll`／`IpDrv.dll`）合計 **0** 筆命中。

## 4. uetool 查詢結果（`~/mro-decrypted/Engine.u`）

```
$ dotnet run --project tools/uetool -- ~/mro-decrypted/Engine.u decompile Engine.NetConnection
class NetConnection;
```
（空類別本體，無 var、無 defaultproperties）

```
$ dotnet run --project tools/uetool -- ~/mro-decrypted/Engine.u get Engine.NetConnection CurrentNetSpeed
no property CurrentNetSpeed
```

對照組（確認 uetool／腳本包本身沒問題，這兩個欄位真的能查到）：
```
$ get Engine.Player ConfiguredInternetSpeed  -> ConfiguredInternetSpeed=9636
$ get Engine.Player ConfiguredLanSpeed       -> ConfiguredLanSpeed=20000
```
`Engine.Actor`／`Engine.Viewport` 對 `CurrentNetSpeed`／`ConfiguredInternetSpeed`／`ConfiguredLanSpeed`／`NetSpeed` 四個名字全部回 `no property`。
