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
#   wait_ready <timeoutMs> poll until a MetalRage window with a nonzero
#                          MainWindowHandle appears, or timeoutMs elapses
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
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

function Write-ClientStatus {
    $p = Get-Process -Name $ProcName -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $p) {
        Write-Output "NOT_RUNNING"
        return
    }
    $hwnd = $p.MainWindowHandle
    $responding = $p.Responding
    $rectStr = "0,0,0,0"
    if ($hwnd -ne [IntPtr]::Zero) {
        $r = New-Object ClientCtlWin32+RECT
        $ok = [ClientCtlWin32]::GetWindowRect($hwnd, [ref]$r)
        if ($ok) { $rectStr = "$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)" }
    }
    Write-Output "RUNNING pid=$($p.Id) hwnd=$hwnd responding=$responding rect=$rectStr"
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
        if ($Rest.Count -lt 1) { [Console]::Error.WriteLine("wait_ready needs a timeoutMs arg"); exit 2 }
        $timeoutMs = [int]$Rest[0]
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
            $p = Get-Process -Name $ProcName -ErrorAction SilentlyContinue |
                 Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
            if ($p) { Write-Output "READY pid=$($p.Id) hwnd=$($p.MainWindowHandle)"; exit 0 }
            Start-Sleep -Milliseconds 500
        }
        Write-Output "TIMEOUT"
    }

    default {
        [Console]::Error.WriteLine("Unknown action: $Action")
        exit 2
    }
}
