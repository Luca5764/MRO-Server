## Windows 11 Compatibility Fixes

The game was designed for Windows Vista/7 (32-bit) and requires several fixes to run on Windows 11.

### MetalRage.exe Patches

These three patches must be applied to MetalRage.exe 

**Patch 1: SizeOfImage alignment**
- Raw offset: PE header `SizeOfImage` field
- Original: `0x6C0CF` (not page-aligned)
- Patched: `0x6D000` (page-aligned)
- Why: Windows 11 rejects misaligned SizeOfImage; Win7/10 are more lenient

**Patch 2: y0da entry point NOP (decryption fix)**
- Raw offset: `0x19213` (RVA 0x51213)
- Original: `EB 1E` (jmp +0x1E — skips 32-byte XOR decryption on Win11)
- Patched: `90 90` (NOP NOP — decryption always runs)
- Why: Win11's execution path hits a branch that skips y0da's bootstrap decrypt, causing a crash before unpacking begins

**Patch 3: NRV decompressor address**
- y0da's NRV decompressor hardcodes a source address in the range `0x10000-0x3FFFFF`
- Win11's WoW64 reserves this range and cannot allocate there
- The launcher must pre-allocate the decompression buffer at `ImageBase - 0x4000` before launch

---

### Fix 1: SEHOP Registry Disable

y0da Protector's structured exception handling is incompatible with Windows 11's SEHOP validation.

```
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\MetalRage.exe
  DisableExceptionChainValidation = 1 (DWORD)
```

---

### Fix 2: D3D9Drv.dll Patch

Windows 11's WMI subsystem hangs during DxDiag hardware enumeration. The game calls `CoCreateInstance` for DxDiag during initialization, which never returns. When the DxDiag helper function returns `FALSE`, the caller uses uninitialized pool data, leading to a NULL pointer crash in `FMallocWindows::Free`.

**5-byte patch at file offset 0xF040:**
```
Original: 83 EC 10 56 6A 00 8B F1  (sub esp,0x10; push esi; push 0; mov esi,ecx)
Patched:  B0 01 C2 04 00 90 90 90  (mov al,1; ret 4; nop; nop; nop)
```

This makes the DxDiag function return TRUE immediately without calling CoCreateInstance. D3D9Drv.dll patching is safe because y0da only CRC-checks MetalRage.exe, not companion DLLs.

**Application script:** `patch_dxdiag_skip.py` — reads `D3D9Drv.dll.original`, applies the 5-byte patch, writes `D3D9Drv.dll`.

**Root cause chain (confirmed via minidump analysis):**
1. Win11 WMI hangs on DxDiag → CoCreateInstance blocks
2. DxDiag function returns FALSE
3. Caller doesn't handle FALSE → uses uninitialized pool bucket pointer
4. `[edi+eax*4+0x25C] = NULL` → FMallocWindows::Free crashes at RVA 0x4505
5. This was **misdiagnosed** for 2 sessions as y0da thread suspension causing heap corruption

**What this crash is NOT:** Not a threading issue, not a heap corruption issue, not a y0da issue. The heap guard (CRITICAL_SECTION on FMalloc), DynamoRIO overhead, and thread count all appeared to correlate with the crash — all coincidences. The root cause was entirely in the DxDiag failure path.

---

### Fix 3: Server Redirection

The game connects to `mr.wasabii.com.tw` and related domains. For private server use:

**Launch params:**
```
MetalRage.exe -globalid=TW -ip=127.0.0.1 -port=9211 -age=30
```

**Domain list the client contacts:**
```
mr.wasabii.com.tw
patchmr.wasabii.com.tw
loginmr.wasabii.com.tw
wasabii.com.tw
www.wasabii.com.tw
```

Also required: `ServerIP=127.0.0.1` in **both** `MetalRage.ini` AND `Default.ini` (Default.ini had the original IP `172.31.23.56` which must be overridden).

---

### Fix 4: Resume Loop (Launcher)

y0da occasionally suspends the game's main thread during runtime (confirmed: only ~5 suspensions in 383 seconds of gameplay). A lightweight resume loop in `launch_clean.py` handles this:

**launch_clean.py**
1. Write SEHOP registry key for MetalRage.exe (Fix 1)
2. Allocate a decompression buffer at `ImageBase - 0x4000` via VirtualAllocEx (required by y0da's NRV decompressor)
3. Launch `MetalRage_packed.exe` with correct command-line parameters
4. Run the resume loop below:

```python
while process.is_running():
    for thread in process.threads():
        if thread.suspend_count > 0:
            thread.resume()
    time.sleep(1)
```

---

### Fix 5: Display Settings

Set in the game's INI file to prevent fullscreen crashes. Must be set in **4 locations** — both files, both sections:

**In `MetalRage.ini`:**
```ini
[WinDrv.WindowsClient]
StartupFullscreen=False

[SDLDrv.SDLClient]
StartupFullscreen=False
```

**In `Default.ini`:**
```ini
[WinDrv.WindowsClient]
StartupFullscreen=False

[SDLDrv.SDLClient]
StartupFullscreen=False
```

---

## Protection Systems

The game client has four layers of runtime protection. Anything attached at runtime tends to fail, using Gidrah is more ideal.

### Layer 1: y0da Protector v1.03.x

| Feature | Detail |
|---------|--------|
| PE Packing | NRV compression + XOR encryption (key 0x21) |
| CRC Checking | Monitors entire .text section of MetalRage.exe |
| Anti-Debug | PEB.BeingDebugged, IsDebuggerPresent, NtQueryInformationProcess(ProcessDebugPort) |
| Thread Monitoring | 8 threads, ~232,000 NtQueryInformationThread calls over 120 seconds |
| Thread Suspension | 98 NtSuspendThread calls (one per thread, with unique handles) |
| Code Patching | **ANY modification to .text bytes → crash at ~5 seconds** |
| Safe Targets | vtable/data patches, DLL hooks (not MetalRage.exe), VirtualAllocEx shellcode caves |
| Runtime Services | Game code actively calls into .Jeus section via computed offsets — y0da cannot be fully removed |

**Critical:** y0da's monitor threads help stability. Stopping them causes crashes, don't terminate them.

### Layer 2: Themida Protection

Two separate Themida layers protect ZNetwork.dll:
- **2009 layer:** Import virtualization
- **2010 layer:** Code integrity checks

### Layer 3: xsign

File I/O interception that blocks file creation inside the game process.

### Layer 4: Anti-Attach

Process monitoring that detects and blocks runtime debugger attachment.

---