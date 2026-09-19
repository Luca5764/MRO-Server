# Capture the screen, or one window, to a PNG.
#
#   -Proc MetalRage    capture that process's main window (brings it forward)
#   -Full              capture every monitor instead
#
# Written because reverse engineering this client means judging what is on the
# screen, and second-hand descriptions of a screen are not observations. A
# screenshot cropped to a title bar once cost three wrong conclusions in a row.
param(
    [string]$Out  = "C:\Users\su200\mro-shot.png",
    [string]$Proc = "",
    [switch]$Full
)

Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

# Get-MetalRageWindow -- see tools/pico/pico_serial.ps1's copy of this function for
# the full rationale (duplicated here verbatim for the same reason: this script is
# also copied to Windows and run standalone via `-File`, see tools/win/shot.sh).
# Resolves the REAL game window as the largest visible top-level window belonging to
# any MetalRage process -- NOT Process.MainWindowHandle, which was observed to
# return a freshly launched client's small splash window instead of the real one
# (2026-09-19 relaunch trial, docs/journal/2026-09-19-2230-unattended-trial-01.md).
# Only used for -Proc MetalRage (the only value tools/win/shot.sh ever passes);
# any other -Proc value keeps the old MainWindowHandle-based lookup below.
function Get-MetalRageWindow {
    param([string]$ProcName)
    $procs = @(Get-Process $ProcName -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { return $null }
    $script:MrwPids = @($procs | ForEach-Object { $_.Id })
    $script:MrwBest = [IntPtr]::Zero
    $script:MrwBestArea = 0
    $script:MrwBestRect = $null
    [void][Win]::EnumWindows({
        param($h, $l)
        [uint32]$wpid = 0
        [void][Win]::GetWindowThreadProcessId($h, [ref]$wpid)
        if ($script:MrwPids -contains [int]$wpid -and [Win]::IsWindowVisible($h)) {
            $r = New-Object Win+RECT
            [void][Win]::GetWindowRect($h, [ref]$r)
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
    return @{ Handle = $script:MrwBest; Rect = $script:MrwBestRect }
}

$rect = $null
if (-not $Full -and $Proc -ne "") {
    if ($Proc -eq "MetalRage") {
        $win = Get-MetalRageWindow -ProcName $Proc
        if ($win -eq $null) { Write-Output "no window for process '$Proc'"; exit 1 }
        $hwnd = $win.Handle
    } else {
        $p = Get-Process $Proc -ErrorAction SilentlyContinue |
             Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if ($p -eq $null) { Write-Output "no window for process '$Proc'"; exit 1 }
        $hwnd = $p.MainWindowHandle
    }

    if ([Win]::IsIconic($hwnd)) { [void][Win]::ShowWindow($hwnd, 9) }
    [void][Win]::SetForegroundWindow($hwnd)
    Start-Sleep -Milliseconds 500

    $r = New-Object Win+RECT
    [void][Win]::GetWindowRect($hwnd, [ref]$r)
    $rect = New-Object Drawing.Rectangle $r.Left, $r.Top, ($r.Right - $r.Left), ($r.Bottom - $r.Top)
}
if ($rect -eq $null) { $rect = [Windows.Forms.SystemInformation]::VirtualScreen }

$bmp = New-Object Drawing.Bitmap $rect.Width, $rect.Height
$g = [Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$bmp.Save($Out, [Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("{0} {1}x{2} at {3},{4}" -f $Out, $rect.Width, $rect.Height, $rect.Left, $rect.Top)
