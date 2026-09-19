# client_ctl.ps1 - Windows-side process control for the MetalRage client, used by
# client_ctl.py to detect a dead/hung client and relaunch it during unattended Pico
# runs. Runs on Windows (invoked from WSL via powershell.exe), mirrors pico_serial.ps1's
# copy-to-Windows-path pattern because PowerShell can't reliably run from a \\wsl path.
#
# Usage: client_ctl.ps1 <ACTION> [args...]
#   status                report the MetalRage process (pid/window/responding/rect)
#   kill                   taskkill /IM MetalRage.exe /F if the process is present
#   wait_exit <timeoutMs>  poll until the process is gone or timeoutMs elapses
#   launch                 start "Play Metal Rage Online.bat" (does not log in)
#   wait_ready <timeoutMs> poll until the REAL game window (largest visible
#                          MetalRage window, client area >= 1600x1200 -- not
#                          just any window with a MainWindowHandle, see
#                          Get-MetalRageWindow below) appears, or timeoutMs
#                          elapses
#
# 2026-09-19 [TEST]: taskkill could not terminate a hung MetalRage process
# (likely XIGNCODE's anti-cheat driver protecting it -- see docs/journal/
# 2026-09-19-2230-unattended-trial-01.md). client_ctl.py's `restart` no
# longer calls `kill`/`wait_exit` for that reason -- it halts and waits for
# an operator instead whenever the process is still present. Both actions
# are left here as manual/low-level primitives only.
#
# This script only does process bookkeeping -- it never sends keyboard/mouse input,
# so none of pico_serial.ps1's foreground/click/STOP gates apply here. It is not a
# substitute for those; client_ctl.py enforces its own session/STOP/limit gates
# before calling this script's kill/launch actions (see client_ctl.py).

$ErrorActionPreference = "Stop"

if ($args.Count -lt 1) {
    [Console]::Error.WriteLine("Usage: client_ctl.ps1 <status|kill|wait_exit <ms>|launch|wait_ready <ms>>")
    exit 2
}
$Action = $args[0]
$Rest = @()
if ($args.Count -gt 1) { $Rest = $args[1..($args.Count - 1)] }

$ProcName = "MetalRage"
$ExeName = "MetalRage.exe"
$BatPath = "C:\Games\MetalRage Online\Play Metal Rage Online.bat"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ClientCtlWin32 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

# Get-MetalRageWindow -- see pico_serial.ps1's copy of this function for the full
# rationale (duplicated here verbatim for the same reason: this script is also
# copied to Windows and run standalone via `-File`, so a shared library is not an
# option). Resolves the REAL game window as the largest visible top-level window
# belonging to any MetalRage process -- NOT Process.MainWindowHandle, which was
# observed to return a freshly launched client's small splash window instead of the
# real one (2026-09-19 relaunch trial, docs/journal/2026-09-19-2230-unattended-
# trial-01.md). Returns $null if MetalRage isn't running or has no visible window.
function Get-MetalRageWindow {
    $procs = @(Get-Process $ProcName -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { return $null }
    $script:MrwPids = @($procs | ForEach-Object { $_.Id })
    $script:MrwBest = [IntPtr]::Zero
    $script:MrwBestArea = 0
    $script:MrwBestRect = $null
    [void][ClientCtlWin32]::EnumWindows({
        param($h, $l)
        [uint32]$wpid = 0
        [void][ClientCtlWin32]::GetWindowThreadProcessId($h, [ref]$wpid)
        if ($script:MrwPids -contains [int]$wpid -and [ClientCtlWin32]::IsWindowVisible($h)) {
            $r = New-Object ClientCtlWin32+RECT
            [void][ClientCtlWin32]::GetWindowRect($h, [ref]$r)
            $area = ($r.Right - $r.Left) * ($r.Bottom - $r.Top)
            if ($area -gt $script:MrwBestArea) {
                $script:MrwBestArea = $area
                $script:MrwBest = $h
                $script:MrwBestRect = $r
            }
        }
        return $true
    }, [IntPtr]::Zero) | Out-Null
    if ($script:MrwBest -eq [IntPtr]::Zero) { return $null }
    return @{
        Handle = $script:MrwBest
        Rect   = $script:MrwBestRect
        Width  = $script:MrwBestRect.Right - $script:MrwBestRect.Left
        Height = $script:MrwBestRect.Bottom - $script:MrwBestRect.Top
    }
}

# Same client-area threshold as pico_serial.ps1's $ReadyClientWidth/Height (see its
# comment): 1600x1200, from tools/pico/atlas/manifest.json's shot_size minus
# client_offset.
$ReadyClientWidth = 1600
$ReadyClientHeight = 1200

function Write-ClientStatus {
    $procs = @(Get-Process -Name $ProcName -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
        Write-Output "NOT_RUNNING"
        return
    }
    $win = Get-MetalRageWindow
    if ($win) {
        [uint32]$wpid = 0
        [void][ClientCtlWin32]::GetWindowThreadProcessId($win.Handle, [ref]$wpid)
        $p = Get-Process -Id ([int]$wpid) -ErrorAction SilentlyContinue
        if (-not $p) { $p = $procs[0] }
        $hwnd = $win.Handle
        $r = $win.Rect
        $rectStr = "$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)"
    } else {
        $p = $procs[0]
        $hwnd = [IntPtr]::Zero
        $rectStr = "0,0,0,0"
    }
    Write-Output "RUNNING pid=$($p.Id) hwnd=$hwnd responding=$($p.Responding) rect=$rectStr"
}

switch ($Action.ToLower()) {
    "status" { Write-ClientStatus }

    "kill" {
        $p = Get-Process -Name $ProcName -ErrorAction SilentlyContinue
        if (-not $p) { Write-Output "NOT_RUNNING"; break }
        & taskkill.exe /IM $ExeName /F 2>&1 | Out-Null
        Write-Output "KILL_SENT"
    }

    "wait_exit" {
        if ($Rest.Count -lt 1) { [Console]::Error.WriteLine("wait_exit needs a timeoutMs arg"); exit 2 }
        $timeoutMs = [int]$Rest[0]
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
            $p = Get-Process -Name $ProcName -ErrorAction SilentlyContinue
            if (-not $p) { Write-Output "EXITED"; exit 0 }
            Start-Sleep -Milliseconds 500
        }
        Write-Output "TIMEOUT"
    }

    "launch" {
        if (-not (Test-Path $BatPath)) {
            Write-Output "LAUNCH_FAILED bat not found: $BatPath"
            exit 1
        }
        Start-Process -FilePath $BatPath
        Write-Output "LAUNCH_SENT"
    }

    "wait_ready" {
        # Waits for the REAL game window, not just any MetalRage window -- a freshly
        # launched client shows a small splash (~420x260) well before the real
        # window (client area 1600x1200) appears, and the old MainWindowHandle-based
        # check here returned the splash (2026-09-19 relaunch trial, docs/journal/
        # 2026-09-19-2230-unattended-trial-01.md). Only the largest visible
        # MetalRage window, once its CLIENT area is >= 1600x1200, counts as READY.
        if ($Rest.Count -lt 1) { [Console]::Error.WriteLine("wait_ready needs a timeoutMs arg"); exit 2 }
        $timeoutMs = [int]$Rest[0]
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
            $win = Get-MetalRageWindow
            if ($win) {
                $cr = New-Object ClientCtlWin32+RECT
                $okc = [ClientCtlWin32]::GetClientRect($win.Handle, [ref]$cr)
                $cw = $cr.Right - $cr.Left
                $ch = $cr.Bottom - $cr.Top
                if ($okc -and $cw -ge $ReadyClientWidth -and $ch -ge $ReadyClientHeight) {
                    [uint32]$wpid = 0
                    [void][ClientCtlWin32]::GetWindowThreadProcessId($win.Handle, [ref]$wpid)
                    Write-Output "READY pid=$wpid hwnd=$($win.Handle) client=${cw}x${ch}"
                    exit 0
                }
            }
            Start-Sleep -Milliseconds 500
        }
        Write-Output "TIMEOUT"
    }

    default {
        [Console]::Error.WriteLine("Unknown action: $Action")
        exit 2
    }
}
