# Send mouse and keyboard input to the game window.
#
#   -Proc MetalRage -Click "512,300"     click at window-relative coordinates
#   -Proc MetalRage -Key "{F5}"          send keys (System.Windows.Forms syntax)
#   -Proc MetalRage -Type "hello"        type text, e.g. into the chat box
#
# This is real input into the real desktop: it moves the pointer and takes the
# foreground. It is not safe to run while someone else is using the machine.
#
# Deliberately OS-level input only. The client is wrapped in y0da, Themida and
# an anti-attach layer; injecting into the process or attaching a debugger is
# both blocked and off-limits for this project. Clicking a window is neither.
param(
    [Parameter(Mandatory=$true)][string]$Proc,
    [string]$Click = "",
    [string]$Key   = "",
    [string]$Type  = "",
    [int]$Delay    = 400
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class In {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
}
"@

$p = Get-Process $Proc -ErrorAction SilentlyContinue |
     Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($p -eq $null) { Write-Output "no window for process '$Proc'"; exit 1 }

if ([In]::IsIconic($p.MainWindowHandle)) { [void][In]::ShowWindow($p.MainWindowHandle, 9) }
[void][In]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds $Delay

$r = New-Object In+RECT
[void][In]::GetWindowRect($p.MainWindowHandle, [ref]$r)

if ($Click -ne "") {
    $xy = $Click.Split(",")
    $x = $r.Left + [int]$xy[0]
    $y = $r.Top  + [int]$xy[1]
    [void][In]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 120
    [In]::mouse_event([In]::LEFTDOWN, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [In]::mouse_event([In]::LEFTUP, 0, 0, 0, [IntPtr]::Zero)
    Write-Output ("clicked {0},{1} (window at {2},{3})" -f $x, $y, $r.Left, $r.Top)
}

if ($Key -ne "")  { [Windows.Forms.SendKeys]::SendWait($Key);  Write-Output ("key " + $Key) }
if ($Type -ne "") { [Windows.Forms.SendKeys]::SendWait($Type); Write-Output ("typed " + $Type) }
