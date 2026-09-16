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
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$rect = $null
if (-not $Full -and $Proc -ne "") {
    $p = Get-Process $Proc -ErrorAction SilentlyContinue |
         Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($p -eq $null) { Write-Output "no window for process '$Proc'"; exit 1 }

    if ([Win]::IsIconic($p.MainWindowHandle)) { [void][Win]::ShowWindow($p.MainWindowHandle, 9) }
    [void][Win]::SetForegroundWindow($p.MainWindowHandle)
    Start-Sleep -Milliseconds 500

    $r = New-Object Win+RECT
    [void][Win]::GetWindowRect($p.MainWindowHandle, [ref]$r)
    $rect = New-Object Drawing.Rectangle $r.Left, $r.Top, ($r.Right - $r.Left), ($r.Bottom - $r.Top)
}
if ($rect -eq $null) { $rect = [Windows.Forms.SystemInformation]::VirtualScreen }

$bmp = New-Object Drawing.Bitmap $rect.Width, $rect.Height
$g = [Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$bmp.Save($Out, [Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("{0} {1}x{2} at {3},{4}" -f $Out, $rect.Width, $rect.Height, $rect.Left, $rect.Top)
