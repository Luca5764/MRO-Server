# logwatch.ps1 -- read-only, background tail of a MetalRage client's `-log=`
# window text via WM_GETTEXTLENGTH/WM_GETTEXT, since the log FILE itself is
# held open with no share flags the entire time the client runs (real
# ERROR_SHARING_VIOLATION, not a WSL translation quirk -- see
# docs/journal/2026-09-21-1900-client-log-capture-probes.md). The window's
# EDIT control ("<ProcName>UnrealWEditTerminal", a child of a
# "<ProcName>UnrealWLog" top-level window -- both class names carry the exe's
# own process name as a prefix, confirmed against both "MetalRage" and
# "MetalRage2" instances) holds the same text in its own memory, which never
# goes through that lock. Feasibility confirmed 2026-09-21 (see the journal
# entry this script's own commit references): WM_GETTEXTLENGTH/WM_GETTEXT
# via SendMessageTimeout returned the client's real startup log text with no
# BLOCKED/denied behavior observed, on a client launched elevated
# (requireAdministrator) from an unelevated caller -- so WM_GETTEXT appears
# to be on UIPI's default cross-integrity-level allow list, as expected.
#
# STATUS (2026-09-21): NOT WORKING YET. Phase 1 (a minimal standalone probe
# doing exactly the WM_GETTEXTLENGTH/WM_GETTEXT calls below) was 8/8
# reliable. This fuller script -- same calls, plus EnumWindows-based window
# discovery and a jsonl-writing main loop -- reproducibly crashes
# powershell.exe with exit code 5 (no managed exception; consistent with a
# native access violation) at the WM_GETTEXT step on effectively every run.
# See Find-LogEditControl's comment below for what was tried to isolate
# this and did not work. Left committed as WIP for whoever picks this up
# next -- do not assume this script actually produces output until that
# crash is fixed and re-verified with a real multi-line captured run.
#
# HARD LIMITS (do not relax any of these -- see this script's task contract):
#   - Sends ONLY WM_GETTEXTLENGTH and WM_GETTEXT, both via SendMessageTimeout
#     with SMTO_ABORTIFHUNG and an explicit timeout. Never plain SendMessage
#     (blocks forever), never SetForegroundWindow/SetFocus/ShowWindow/
#     activate, never touches the mouse or keyboard. Window/class identification
#     uses GetClassName only, which is a local class-atom lookup, NOT a message
#     sent to the target's queue (unlike GetWindowText, which internally does
#     an untimed SendMessage(WM_GETTEXT) for cross-process windows -- that API
#     is deliberately never called here, precisely to keep every WM_GETTEXT
#     this script sends on the SendMessageTimeout+SMTO_ABORTIFHUNG path).
#   - $Proc is matched with Get-Process -Name (exact), never -like/wildcard --
#     "MetalRage" is a prefix of "MetalRage2".
#   - Never touches MetalRage.exe itself (no injection, no hooking, no writes
#     to its memory) -- read-only Win32 queries against its windows only.
#
# Loud-failure contract (all four cases: write one clear JSON error line to
# $Out, flush, exit non-zero -- never silently continue or retry forever):
#   exit 2  window not found      (process gone, or no top-level window of
#                                   its own found -- after an initial
#                                   $StartupGraceSec grace period for a
#                                   just-launched client's window to appear)
#   exit 3  control not found     (a top-level window exists, but no child
#                                   whose class name contains "Edit" was found
#                                   -- same startup grace period applies)
#   exit 4  message timeout/hang  (SendMessageTimeout returned 0, i.e. it
#                                   aborted a hung target -- SMTO_ABORTIFHUNG)
#   exit 5  stall                 (text length has not changed for
#                                   $StallSec seconds even though the process
#                                   is still present and every query is still
#                                   succeeding -- see $StallSec's own comment
#                                   below for why this is a coarse heuristic,
#                                   not a tight one)
#
# Dedup ("tail-segment comparison", per the task contract -- the EDIT control
# has a scrollback cap and drops old lines off the FRONT as new ones are
# appended, so new content cannot be assumed to only ever appear at the very
# end): each poll splits the control's current full text into lines and
# finds the longest run of $prevLines' OWN tail that reappears as a prefix of
# the new $curLines (Get-NewLines below); only the lines after that overlap
# are emitted. If no overlap at all is found (the whole previous tail fell
# out of the buffer between polls, or the control's content was replaced
# outright), every current line is emitted as new AND a `"type":"rebaseline"`
# marker line is written first, so a consumer can tell "these are genuinely
# new" apart from "we lost the join point" -- this is never treated as a
# failure by itself, since a fast-scrolling log combined with a slow poll can
# legitimately cause it.
param(
    [Parameter(Mandatory = $true)][string]$Proc,
    [Parameter(Mandatory = $true)][string]$Out,
    [double]$Hz = 3.0,
    [int]$StartupGraceSec = 15,
    [int]$StallSec = 300,
    [int]$MaxSeconds = 0   # 0 = run forever; >0 = stop cleanly (exit 0) after this many seconds, for tests
)

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class LogWatchWin32 {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    // WM_GETTEXTLENGTH: lParam unused (IntPtr overload).
    [DllImport("user32.dll", CharSet = CharSet.Auto, EntryPoint = "SendMessageTimeout")]
    public static extern IntPtr SendMessageTimeoutLen(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam,
        uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

    // WM_GETTEXT: lParam = output buffer (StringBuilder overload). USER32
    // marshals WM_GETTEXT/WM_SETTEXT strings across the process boundary
    // itself (these are on its fixed list of messages with known layouts),
    // so passing a plain managed StringBuilder here (not a shared/mapped
    // buffer) is the normal, correct usage -- same technique GetWindowText
    // itself uses internally, just with an explicit timeout instead of
    // GetWindowText's own untimed SendMessage.
    [DllImport("user32.dll", CharSet = CharSet.Auto, EntryPoint = "SendMessageTimeout")]
    public static extern IntPtr SendMessageTimeoutText(IntPtr hWnd, uint Msg, IntPtr wParam, StringBuilder lParam,
        uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
}
"@

$WM_GETTEXTLENGTH = 0x000E
$WM_GETTEXT       = 0x000D
$SMTO_ABORTIFHUNG = 0x0002
$MSG_TIMEOUT_MS   = 2000

function Write-JsonLine($obj) {
    # One compact JSON object per line (jsonl). -Compress keeps it one line
    # even for the (rare) multi-KB rebaseline text field.
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    Add-Content -LiteralPath $Out -Value $json -Encoding UTF8
}

function Fail-Loud([int]$code, [string]$reason, [hashtable]$extra) {
    $rec = @{ ts = (Get-Date).ToString("o"); proc = $Proc; type = "error"; reason = $reason }
    if ($extra) { foreach ($k in $extra.Keys) { $rec[$k] = $extra[$k] } }
    Write-JsonLine $rec
    Write-Output "[FATAL] $reason"
    exit $code
}

# Resolve the target EDIT control: any top-level window belonging to a
# process named $Proc (exact match), searched (via EnumChildWindows, which
# recurses into grandchildren on its own) for a child whose class name
# contains "Edit" (case-insensitive -- observed class was
# "<Proc>UnrealWEditTerminal"). Returns $null if $Proc isn't running, has no
# window yet, or has no such child -- caller decides whether that is still
# within the startup grace period or a hard failure.
function Find-LogEditControl {
    # NOTE on structure: EnumChildWindows is called INSIDE the EnumWindows
    # callback below (nested), matching a minimal standalone probe script
    # that was 8/8 reliable. UNRESOLVED, SEE THIS SCRIPT'S COMMIT MESSAGE:
    # this full script (this function plus the JSON-writing main loop below)
    # reproducibly crashes powershell.exe (exit code 5, no managed
    # exception -- consistent with a native access violation) at the
    # WM_GETTEXT step, on effectively every run, even after trying this
    # nested-vs-flat EnumChildWindows structure change, forcing an explicit
    # GC before the call, and calling SendMessageTimeout twice in a row --
    # none of which reproduced or fixed it in isolation. Root cause not
    # found; needs a WER crash dump / native debugging session, which is
    # past what this task attempted. DO NOT treat this script as working
    # until that crash is understood and gone.
    $procs = @(Get-Process -Name $Proc -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { return @{ found = $false; stage = "process"; pid_list = @() } }
    $script:_lwPids = @($procs | ForEach-Object { $_.Id })

    $script:_lwResult = @{ found = $false; stage = "window" }
    [void][LogWatchWin32]::EnumWindows({
        param($h, $l)
        if ($script:_lwResult.found) { return $true }  # already found on an earlier top window; keep enumerating harmlessly (EnumWindows has no early-abort we rely on)
        [uint32]$wpid = 0
        [void][LogWatchWin32]::GetWindowThreadProcessId($h, [ref]$wpid)
        if ($script:_lwPids -notcontains [int]$wpid) { return $true }
        $script:_lwResult.stage = "control"  # at least one top window of ours exists now
        $script:_lwChildren = New-Object System.Collections.Generic.List[IntPtr]
        [void][LogWatchWin32]::EnumChildWindows($h, {
            param($ch, $l2)
            $script:_lwChildren.Add($ch)
            return $true
        }, [IntPtr]::Zero)
        foreach ($ch in $script:_lwChildren) {
            $sb = New-Object System.Text.StringBuilder 256
            [void][LogWatchWin32]::GetClassName($ch, $sb, $sb.Capacity)
            if ($sb.ToString() -match "(?i)edit") {
                $script:_lwResult = @{ found = $true; hwnd = $ch; top = $h; class = $sb.ToString() }
                break
            }
        }
        return $true
    }, [IntPtr]::Zero)

    $script:_lwResult.pid_list = $script:_lwPids
    return $script:_lwResult
}

# Reads the control's full current text. Returns @{ ok; text } or
# @{ ok=$false; hang=$true } if either call timed out/hung (SendMessageTimeout
# returned 0) -- the hang case is the ONLY one Read-EditText reports
# separately from a plain "text unavailable", since it is its own loud-failure
# category (exit 4), distinct from window/control simply not existing.
function Read-EditText([IntPtr]$hwnd) {
    [IntPtr]$lenResult = [IntPtr]::Zero
    $r1 = [LogWatchWin32]::SendMessageTimeoutLen($hwnd, $WM_GETTEXTLENGTH, [IntPtr]::Zero, [IntPtr]::Zero,
        $SMTO_ABORTIFHUNG, $MSG_TIMEOUT_MS, [ref]$lenResult)
    if ($r1 -eq [IntPtr]::Zero) { return @{ ok = $false; hang = $true; where = "WM_GETTEXTLENGTH" } }
    $len = $lenResult.ToInt64()
    if ($len -le 0) { return @{ ok = $true; text = "" } }

    $sb = New-Object System.Text.StringBuilder ($len + 1)
    [IntPtr]$getResult = [IntPtr]::Zero
    $r2 = [LogWatchWin32]::SendMessageTimeoutText($hwnd, $WM_GETTEXT, [IntPtr]($len + 1), $sb,
        $SMTO_ABORTIFHUNG, $MSG_TIMEOUT_MS, [ref]$getResult)
    if ($r2 -eq [IntPtr]::Zero) { return @{ ok = $false; hang = $true; where = "WM_GETTEXT" } }
    return @{ ok = $true; text = $sb.ToString() }
}

# Get-NewLines -- tail-segment overlap dedup (see module header comment).
# $SearchCap bounds the O(k^2) worst case for a pathologically long buffer;
# 4000 lines is already far beyond what a bounded scrollback EDIT control is
# expected to hold, so hitting the cap should mean "no real overlap", not
# "overlap missed because we didn't look far enough" -- treated the same as
# any other no-overlap case (full rebaseline), not a separate failure.
function Get-NewLines([string[]]$prevLines, [string[]]$curLines) {
    if ($prevLines.Count -eq 0) { return @{ rebaseline = $true; lines = $curLines } }
    $searchCap = 4000
    $maxK = [Math]::Min([Math]::Min($prevLines.Count, $curLines.Count), $searchCap)
    for ($k = $maxK; $k -ge 1; $k--) {
        $match = $true
        for ($i = 0; $i -lt $k; $i++) {
            if ($prevLines[$prevLines.Count - $k + $i] -ne $curLines[$i]) { $match = $false; break }
        }
        if ($match) {
            if ($k -eq $curLines.Count) { return @{ rebaseline = $false; lines = @() } }
            return @{ rebaseline = $false; lines = $curLines[$k..($curLines.Count - 1)] }
        }
    }
    return @{ rebaseline = $true; lines = $curLines }
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath (Split-Path -Parent $Out))) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
}

$intervalMs = [int](1000.0 / $Hz)
$startTime = Get-Date
$resolved = $null
$prevLines = @()
$lastChangeTime = Get-Date
$lastLen = -1

Write-Output "[logwatch] starting: proc=$Proc out=$Out hz=$Hz interval_ms=$intervalMs stall_sec=$StallSec"
Write-JsonLine @{ ts = (Get-Date).ToString("o"); proc = $Proc; type = "start"; hz = $Hz; stall_sec = $StallSec }

while ($true) {
    if ($MaxSeconds -gt 0 -and ((Get-Date) - $startTime).TotalSeconds -gt $MaxSeconds) {
        Write-JsonLine @{ ts = (Get-Date).ToString("o"); proc = $Proc; type = "stop"; reason = "MaxSeconds reached" }
        Write-Output "[logwatch] MaxSeconds reached, stopping cleanly"
        exit 0
    }

    if ($resolved -eq $null -or -not [LogWatchWin32]::IsWindow($resolved.hwnd)) {
        $resolved = Find-LogEditControl
        if (-not $resolved.found) {
            $withinGrace = ((Get-Date) - $startTime).TotalSeconds -le $StartupGraceSec
            if ($withinGrace) {
                Start-Sleep -Milliseconds $intervalMs
                continue
            }
            if ($resolved.stage -eq "process" -or $resolved.stage -eq "window") {
                Fail-Loud 2 "window not found (stage=$($resolved.stage), proc=$Proc)" @{ pids = ($resolved.pid_list -join ",") }
            } else {
                Fail-Loud 3 "no Edit-class control found under any top-level window of $Proc" @{ pids = ($resolved.pid_list -join ",") }
            }
        }
        # Freshly (re)resolved: reset dedup/stall state so a control handle
        # change (e.g. window recreated) doesn't get compared against stale text.
        $prevLines = @()
        $lastChangeTime = Get-Date
        $lastLen = -1
    }

    $r = Read-EditText $resolved.hwnd
    if (-not $r.ok) {
        Fail-Loud 4 "SendMessageTimeout hung/timed out on $($r.where) (hwnd=0x$($resolved.hwnd.ToString('X')))" @{}
    }

    $curLen = $r.text.Length
    if ($curLen -ne $lastLen) {
        $lastChangeTime = Get-Date
        $lastLen = $curLen
    } elseif (((Get-Date) - $lastChangeTime).TotalSeconds -gt $StallSec) {
        Fail-Loud 5 "text length unchanged ($curLen chars) for over ${StallSec}s while process is still present" `
            @{ pid = ($resolved.pid_list -join ","); hwnd = "0x$($resolved.hwnd.ToString('X'))" }
    }

    $curLines = $r.text -split "`r`n"
    $diff = Get-NewLines $prevLines $curLines
    if ($diff.rebaseline -and $prevLines.Count -gt 0) {
        Write-JsonLine @{ ts = (Get-Date).ToString("o"); proc = $Proc; type = "rebaseline"; line_count = $curLines.Count }
    }
    foreach ($line in $diff.lines) {
        if ($line -eq "" -and $line -eq $curLines[-1]) { continue }  # trailing empty split artifact
        Write-JsonLine @{ ts = (Get-Date).ToString("o"); proc = $Proc; type = "line"; line = $line }
    }
    $prevLines = $curLines

    Start-Sleep -Milliseconds $intervalMs
}
