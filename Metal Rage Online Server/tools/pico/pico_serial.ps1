# pico_serial.ps1 - Bridge from Windows PowerShell to the Pico's USB CDC console.
#
# Runs on Windows (invoked from WSL via powershell.exe, see pico_ctl.py / pico_drive.sh).
# Talks System.IO.Ports.SerialPort to the Pico's console serial (code.py's stdin/stdout
# loop), one line in, one "[<code>] <msg>" line out per command.
#
# Usage:
#   pico_serial.ps1 [-Port COM6] "PING" ["CLICK left" ...]
#
# If -Port is omitted, auto-detects the Pico by PNPDeviceID (VID_239A&PID_8162&MI_00,
# the console CDC interface of the board's composite USB descriptor) and prints the
# resolved port to stderr so callers can see what was picked.
#
# Multiple commands can be passed in one invocation (PowerShell startup is slow, so
# batching avoids paying that cost per command). Commands are sent in order; for each
# one this script prints the firmware's single reply line ("[200] PONG ...") to stdout,
# in order. If a command times out, an "[ERR-TIMEOUT] <cmd>" line is printed instead and
# the script's exit code is set to 1 (still processes the rest of the batch).
#
# --- Unattended safety guardrails (added for lead-driven unattended runs) ----------
# This script may be run with nobody watching the screen, so it is the last line of
# defense against a stray keystroke landing in the wrong window. Every command except
# PING and RESET is gated immediately before it is sent, IN THIS SAME PROCESS:
#   1. Foreground gate: the foreground window's process must be MetalRage, not
#      minimized, and its window rect must lie fully within the PRIMARY monitor
#      (the game lives there; the second monitor has terminals/editors). The lock
#      screen / secure desktop (LockApp, LogonUI, consent.exe as foreground process)
#      is explicitly treated as blocked, not as "no game running".
#   2. Click target gate (CLICK_AT, see below): the target must resolve inside the
#      MetalRage window's client area, and the cursor must actually converge to
#      within +/-4px of it (read back, corrected, re-checked) before CLICK fires.
#   3. Kill switch: if C:\Users\su200\mro-pico\STOP exists, every gated command is
#      blocked (create the file, or just unplug the Pico's USB cable).
#   4. Text gate: TYPE only accepts printable ASCII (0x20-0x7E).
# Every one of these gates is FAIL-CLOSED: if a Win32 query throws, returns a null
# handle, or can't identify the foreground process, that is a BLOCKED result, not a
# retry and not a pass-through. On any BLOCKED outcome this script:
#   - prints exactly one line "[BLOCKED] <reason> <cmd>" for that command,
#   - best-effort sends a "RESET" (release_all) to the Pico over the same connection,
#   - stops processing the rest of the batch immediately (no retries), and
#   - exits with code 3 (distinct from 0=ok, 1=timeout, 2=usage error).
# pico_ctl.py is responsible for logging/marking blocked attempts and for halting the
# session file so later commands keep refusing until an explicit `session end` +
# `session start`; this script only enforces the gates and reports what happened.
#
# CLICK_AT <relX> <relY> [button] is a pseudo-command handled entirely in this script
# (never forwarded to the firmware as literal wire text): it resolves (relX, relY) as
# MetalRage-client-area-relative coordinates, then does a closed-loop relative MOVE +
# cursor read-back (System.Windows.Forms.Cursor.Position) against the Pico, up to 6
# iterations, before sending CLICK. This replaces pico_ctl.py's old win_click, which
# used to fire MOVE_TO + CLICK blind (no target verification) from two separate
# powershell.exe processes.

# Parse $args by hand instead of a param() block: PowerShell's positional binder
# always fills ordinary positional parameters (like -Port) before handing anything
# to a ValueFromRemainingArguments parameter, regardless of declared Position, so
# a lone command with no -Port flag (the common case) silently landed in $Port
# instead of $Commands. Verified by hand against Windows PowerShell 5.1.
$Port = $null
$Commands = New-Object System.Collections.Generic.List[string]
$i = 0
while ($i -lt $args.Count) {
    if ($args[$i] -eq '-Port' -and ($i + 1) -lt $args.Count) {
        $Port = $args[$i + 1]
        $i += 2
    } else {
        $Commands.Add($args[$i])
        $i += 1
    }
}

$ErrorActionPreference = "Stop"

if ($Commands.Count -eq 0) {
    [Console]::Error.WriteLine("Usage: pico_serial.ps1 [-Port COM6] <command> [<command> ...]")
    exit 2
}

function Resolve-PicoPort {
    $dev = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
        Where-Object { $_.PNPDeviceID -match 'VID_239A&PID_8162&MI_00' } |
        Select-Object -First 1
    if (-not $dev) {
        return $null
    }
    if ($dev.Name -match '\(COM(\d+)\)') {
        return "COM$($matches[1])"
    }
    return $null
}

if (-not $Port) {
    $Port = Resolve-PicoPort
    if (-not $Port) {
        [Console]::Error.WriteLine("Could not auto-detect Pico COM port (looked for VID_239A&PID_8162&MI_00). Pass -Port explicitly.")
        exit 2
    }
    [Console]::Error.WriteLine("auto-detected port: $Port")
}

function Get-CommandBudgetMs {
    param([string]$Cmd)
    $baseMs = 3000
    $tokens = $Cmd.Trim() -split '\s+'
    if ($tokens.Count -eq 0) { return $baseMs }
    switch ($tokens[0].ToUpper()) {
        "PRESS" {
            if ($tokens.Count -ge 3 -and [int]::TryParse($tokens[2], [ref]$null)) {
                return $baseMs + [int]$tokens[2] + 500
            }
            return $baseMs
        }
        "TYPE" {
            $text = $Cmd.Trim()
            if ($text.Length -gt 5) { $text = $text.Substring(5) } else { $text = "" }
            return $baseMs + ($text.Length * 30) + 500
        }
        "MOVE_TO" { return $baseMs + 1000 }
        default { return $baseMs }
    }
}

# ---------------------------------------------------------------------------
# Guardrail plumbing: Win32 interop for foreground/window/cursor checks.
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PicoGuardWin32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    public struct RECT { public int Left, Top, Right, Bottom; }
    public struct POINT { public int X, Y; }
}
"@

$StopFile = "C:\Users\su200\mro-pico\STOP"
$PrimaryBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
# Foreground processes that mean "the interactive desktop is not what we think it is"
# (lock screen, UAC prompt, Windows security dialogs) -- fail closed, do not treat as
# just "MetalRage isn't focused".
$SecureDesktopProcessNames = @("LockApp", "LogonUI", "consent", "SecHealthUI")
$Exempt = @("PING", "RESET")

# Every exit from this function is a deliberate hashtable @{ Blocked; Reason; Handle }.
# Wrapped in try/catch so ANY unexpected failure (a Win32 call throwing, a process
# query failing, etc.) also resolves to Blocked -- fail closed, never fail open.
function Test-ForegroundGate {
    try {
        if (Test-Path $StopFile) {
            return @{ Blocked = $true; Reason = "STOP file present ($StopFile)"; Handle = [IntPtr]::Zero }
        }
        $fg = [PicoGuardWin32]::GetForegroundWindow()
        if ($fg -eq [IntPtr]::Zero) {
            return @{ Blocked = $true; Reason = "no foreground window (possibly lock screen / secure desktop)"; Handle = [IntPtr]::Zero }
        }
        [uint32]$fgPid = 0
        [void][PicoGuardWin32]::GetWindowThreadProcessId($fg, [ref]$fgPid)
        $fgProc = Get-Process -Id ([int]$fgPid) -ErrorAction SilentlyContinue
        if (-not $fgProc) {
            return @{ Blocked = $true; Reason = "could not resolve foreground window's process (pid $fgPid)"; Handle = $fg }
        }
        if ($SecureDesktopProcessNames -contains $fgProc.Name) {
            return @{ Blocked = $true; Reason = "secure desktop / lock screen active (foreground process '$($fgProc.Name)')"; Handle = $fg }
        }
        $mrProcs = Get-Process MetalRage -ErrorAction SilentlyContinue
        if (-not $mrProcs) {
            return @{ Blocked = $true; Reason = "MetalRage process not running"; Handle = $fg }
        }
        if ($fgProc.Name -ne "MetalRage") {
            return @{ Blocked = $true; Reason = "foreground window belongs to process '$($fgProc.Name)' (pid $fgPid), not MetalRage"; Handle = $fg }
        }
        if ([PicoGuardWin32]::IsIconic($fg)) {
            return @{ Blocked = $true; Reason = "foreground MetalRage window is minimized"; Handle = $fg }
        }
        $r = New-Object PicoGuardWin32+RECT
        $okRect = [PicoGuardWin32]::GetWindowRect($fg, [ref]$r)
        if (-not $okRect) {
            return @{ Blocked = $true; Reason = "GetWindowRect failed for foreground window"; Handle = $fg }
        }
        $onPrimary = ($r.Left -ge $PrimaryBounds.Left) -and ($r.Right -le $PrimaryBounds.Right) -and
                     ($r.Top -ge $PrimaryBounds.Top) -and ($r.Bottom -le $PrimaryBounds.Bottom)
        if (-not $onPrimary) {
            return @{ Blocked = $true; Reason = "foreground window rect ($($r.Left),$($r.Top))-($($r.Right),$($r.Bottom)) not fully on primary monitor"; Handle = $fg }
        }
        return @{ Blocked = $false; Reason = $null; Handle = $fg }
    } catch {
        return @{ Blocked = $true; Reason = "gate check threw: $($_.Exception.Message)"; Handle = [IntPtr]::Zero }
    }
}

# Write one command, block until a "[<code>] ..." reply line or BudgetMs elapses.
# Returns the trimmed reply line, or $null on timeout. Ignores unrelated lines
# (boot banner / [HID] / [WIFI] / [WDT] prints).
function Send-PicoCommand {
    param($SerialPort, [string]$Cmd, [int]$BudgetMs = 3000)
    $SerialPort.Write("$Cmd`r`n")
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $BudgetMs) {
        try {
            $line = $SerialPort.ReadLine()
        } catch [System.TimeoutException] {
            continue
        }
        if ($line -match '^\[\d+\]') {
            return $line.Trim()
        }
    }
    return $null
}

# Best-effort release_all() after any BLOCKED outcome. Never let a failure here mask
# the original BLOCKED reason -- this is pure defense in depth.
function Send-SafetyReset {
    param($SerialPort)
    try {
        if ($SerialPort -and $SerialPort.IsOpen) {
            [void](Send-PicoCommand -SerialPort $SerialPort -Cmd "RESET" -BudgetMs 3000)
        }
    } catch {
        [Console]::Error.WriteLine("[pico_serial] safety RESET after BLOCKED also failed: $($_.Exception.Message)")
    }
}

# CLICK_AT <relX> <relY> [button] -- window-client-area-relative closed-loop click.
# Returns @{ Line; Blocked }. Fail-closed: any exception -> Blocked.
function Invoke-ClickAt {
    param($SerialPort, $Tokens, $WindowHandle)
    try {
        if ($Tokens.Count -lt 3) {
            return @{ Line = "[BLOCKED] CLICK_AT requires relX relY $($Tokens -join ' ')"; Blocked = $true }
        }
        $relX = 0; $relY = 0
        if (-not [int]::TryParse($Tokens[1], [ref]$relX) -or -not [int]::TryParse($Tokens[2], [ref]$relY)) {
            return @{ Line = "[BLOCKED] CLICK_AT relX/relY not integers $($Tokens -join ' ')"; Blocked = $true }
        }
        $btn = if ($Tokens.Count -ge 4) { $Tokens[3] } else { "left" }

        $clientRect = New-Object PicoGuardWin32+RECT
        $okClient = [PicoGuardWin32]::GetClientRect($WindowHandle, [ref]$clientRect)
        if (-not $okClient) {
            return @{ Line = "[BLOCKED] CLICK_AT GetClientRect failed"; Blocked = $true }
        }
        $cw = $clientRect.Right - $clientRect.Left
        $ch = $clientRect.Bottom - $clientRect.Top
        if ($relX -lt 0 -or $relX -ge $cw -or $relY -lt 0 -or $relY -ge $ch) {
            return @{ Line = "[BLOCKED] CLICK_AT target ($relX,$relY) outside client area 0,0-$cw,$ch"; Blocked = $true }
        }

        $origin = New-Object PicoGuardWin32+POINT
        $origin.X = 0; $origin.Y = 0
        $okOrigin = [PicoGuardWin32]::ClientToScreen($WindowHandle, [ref]$origin)
        if (-not $okOrigin) {
            return @{ Line = "[BLOCKED] CLICK_AT ClientToScreen failed"; Blocked = $true }
        }
        $targetX = $origin.X + $relX
        $targetY = $origin.Y + $relY

        # Windows pointer acceleration is on (measured 2026-09-19: a 100-count MOVE lands
        # ~246 px, 5-count moves ~3 px), so sending the raw pixel error overshoots and the
        # loop diverges. Divide by a per-axis gain estimated from the previous step.
        $gx = 2.46; $gy = 2.46
        $converged = $false
        for ($iter = 0; $iter -lt 12; $iter++) {
            $cur = [System.Windows.Forms.Cursor]::Position
            $dx = $targetX - $cur.X
            $dy = $targetY - $cur.Y
            if ([Math]::Abs($dx) -le 4 -and [Math]::Abs($dy) -le 4) { $converged = $true; break }
            $mx = [int][Math]::Round($dx / $gx); if ($mx -eq 0 -and [Math]::Abs($dx) -gt 4) { $mx = [Math]::Sign($dx) }
            $my = [int][Math]::Round($dy / $gy); if ($my -eq 0 -and [Math]::Abs($dy) -gt 4) { $my = [Math]::Sign($dy) }
            $moveReply = Send-PicoCommand -SerialPort $SerialPort -Cmd "MOVE $mx $my" -BudgetMs 3500
            if ($moveReply -eq $null) {
                return @{ Line = "[BLOCKED] CLICK_AT move timed out en route to ($targetX,$targetY)"; Blocked = $true }
            }
            Start-Sleep -Milliseconds 40
            $after = [System.Windows.Forms.Cursor]::Position
            if ([Math]::Abs($mx) -ge 3) { $gx = [Math]::Min(3.0, [Math]::Max(0.3, ($after.X - $cur.X) / $mx)) }
            if ([Math]::Abs($my) -ge 3) { $gy = [Math]::Min(3.0, [Math]::Max(0.3, ($after.Y - $cur.Y) / $my)) }
        }
        if (-not $converged) {
            $cur = [System.Windows.Forms.Cursor]::Position
            return @{ Line = "[BLOCKED] CLICK_AT did not converge after 12 tries, target ($targetX,$targetY) got ($($cur.X),$($cur.Y))"; Blocked = $true }
        }

        # Re-check the foreground gate right before clicking: the moves above took
        # tens of ms and focus/monitor could have changed underneath us.
        $regate = Test-ForegroundGate
        if ($regate.Blocked) {
            return @{ Line = "[BLOCKED] $($regate.Reason) CLICK_AT $relX $relY"; Blocked = $true }
        }

        $clickReply = Send-PicoCommand -SerialPort $SerialPort -Cmd "CLICK $btn" -BudgetMs 3000
        if ($clickReply -eq $null) {
            return @{ Line = "[ERR-TIMEOUT] CLICK_AT click phase ($btn)"; Blocked = $false }
        }
        return @{ Line = "[200] CLICK_AT $relX,$relY -> screen($targetX,$targetY) $clickReply"; Blocked = $false }
    } catch {
        return @{ Line = "[BLOCKED] CLICK_AT threw: $($_.Exception.Message)"; Blocked = $true }
    }
}

$port = New-Object System.IO.Ports.SerialPort $Port, 115200
$port.DtrEnable = $true
$port.NewLine = "`n"
$port.ReadTimeout = 500

$exitCode = 0

try {
    $port.Open()
    Start-Sleep -Milliseconds 300
    $port.DiscardInBuffer()

    foreach ($cmd in $Commands) {
        try {
            $trimmed = $cmd.Trim()
            $tokens = $trimmed -split '\s+'
            $verb = if ($tokens.Count -gt 0) { $tokens[0].ToUpper() } else { "" }
            $needsGate = -not ($Exempt -contains $verb)

            $gate = $null
            if ($needsGate) {
                $gate = Test-ForegroundGate
                if ($gate.Blocked) {
                    Write-Output "[BLOCKED] $($gate.Reason) $trimmed"
                    Send-SafetyReset -SerialPort $port
                    $exitCode = 3
                    break
                }
            }

            if ($verb -eq "TYPE") {
                $text = if ($trimmed.Length -gt 5) { $trimmed.Substring(5) } else { "" }
                if ($text -match '[^\x20-\x7E]') {
                    Write-Output "[BLOCKED] TYPE text is not printable ASCII $trimmed"
                    Send-SafetyReset -SerialPort $port
                    $exitCode = 3
                    break
                }
            }

            if ($verb -eq "CLICK_AT") {
                $result = Invoke-ClickAt -SerialPort $port -Tokens $tokens -WindowHandle $gate.Handle
                Write-Output $result.Line
                if ($result.Blocked) {
                    Send-SafetyReset -SerialPort $port
                    $exitCode = 3
                    break
                }
                continue
            }

            $budgetMs = Get-CommandBudgetMs -Cmd $cmd
            $reply = Send-PicoCommand -SerialPort $port -Cmd $cmd -BudgetMs $budgetMs
            if ($reply -eq $null) {
                Write-Output "[ERR-TIMEOUT] $cmd"
                $exitCode = 1
            } else {
                Write-Output $reply
            }
        } catch {
            # Fail closed: any unexpected error while processing a command is BLOCKED,
            # not "skip and continue".
            Write-Output "[BLOCKED] unexpected error processing '$cmd': $($_.Exception.Message)"
            Send-SafetyReset -SerialPort $port
            $exitCode = 3
            break
        }
    }
} finally {
    if ($port.IsOpen) {
        $port.Close()
    }
}

exit $exitCode
