# Resolve-ClientCtlArgs.tests.ps1
#
# Offline guardrail test for client_ctl.ps1's I4 per-instance argument parsing
# (docs/research/2026-09-20-dual-pico/design.md, dual-client automation).
# Resolve-ClientCtlArgs is pure string/array manipulation (no Win32/process
# calls), so -- same approach as Test-ForegroundProcessAllowed.tests.ps1 --
# it is pulled out of the ACTUAL client_ctl.ps1 via the PowerShell AST parser
# (Find()), not hand-copied, so this test can't silently drift from what
# ships.
#
# What this guards against:
#   1. A single-client caller (no --proc/--bat at all) must resolve to
#      EXACTLY the same $ProcName/$ExeName/$BatPath as before this task --
#      client_ctl.py's run_ps1() now always sends --proc/--bat explicitly
#      (with DEFAULT_INSTANCE's values, which equal these hardcoded
#      defaults), but a bare/manual invocation with no flags at all must
#      still work identically.
#   2. --proc/--bat must not corrupt an action's own positional args (e.g.
#      wait_exit's <timeoutMs>), regardless of where the flags appear
#      relative to those args.
#   3. --proc and --bat are independent -- overriding one must not touch
#      the other's default.
#
# Run standalone, no serial port / process / game required:
#   powershell.exe -NoProfile -File tools\pico\Resolve-ClientCtlArgs.tests.ps1
#
# Prints one [PASS]/[FAIL] line per case, exits 0 if all pass, 1 otherwise.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $here "client_ctl.ps1"

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
$fnAst = $ast.Find({
    param($n)
    $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq "Resolve-ClientCtlArgs"
}, $true)
if (-not $fnAst) {
    Write-Error "Could not find function Resolve-ClientCtlArgs in $sourcePath -- has it been renamed or removed?"
    exit 1
}
Invoke-Expression $fnAst.Extent.Text

$failures = 0
function Assert-Eq {
    param([string]$Name, $Actual, $Expected)
    if ("$Actual" -eq "$Expected") {
        Write-Output "[PASS] $Name"
    } else {
        Write-Output "[FAIL] $Name (expected $Expected, got $Actual)"
        $script:failures++
    }
}
function Assert-RestEq {
    param([string]$Name, [object[]]$Actual, [object[]]$Expected)
    $a = @($Actual) -join "|"
    $e = @($Expected) -join "|"
    Assert-Eq $Name $a $e
}

# 1. No flags at all (every existing single-client caller before this task,
#    and any manual/ad-hoc invocation) -- must resolve to the exact same
#    defaults as before this task.
$r = Resolve-ClientCtlArgs @("status")
Assert-Eq  "no flags: Action"   $r.Action   "status"
Assert-Eq  "no flags: ProcName" $r.ProcName "MetalRage"
Assert-Eq  "no flags: ExeName"  $r.ExeName  "MetalRage.exe"
Assert-Eq  "no flags: BatPath"  $r.BatPath  "C:\Games\MetalRage Online\Play Metal Rage Online.bat"
Assert-RestEq "no flags: Rest" $r.Rest @()

# 1b. client_ctl.py's run_ps1() ALWAYS sends --proc/--bat now, even for the
#     default instance -- with values equal to the hardcoded defaults above.
#     Must resolve identically to the no-flags case (this is what makes
#     "existing single-client behavior is byte-for-byte unchanged" true even
#     though the actual argv changed).
$r2 = Resolve-ClientCtlArgs @("status", "--proc", "MetalRage", "--bat", "C:\Games\MetalRage Online\Play Metal Rage Online.bat")
Assert-Eq  "explicit defaults == no flags: ProcName" $r2.ProcName $r.ProcName
Assert-Eq  "explicit defaults == no flags: ExeName"  $r2.ExeName  $r.ExeName
Assert-Eq  "explicit defaults == no flags: BatPath"  $r2.BatPath  $r.BatPath
Assert-RestEq "explicit defaults == no flags: Rest" $r2.Rest $r.Rest

# 2. wait_exit's positional <ms> arg must survive untouched when no flags given.
$r3 = Resolve-ClientCtlArgs @("wait_exit", "20000")
Assert-Eq     "wait_exit no flags: Action" $r3.Action "wait_exit"
Assert-RestEq "wait_exit no flags: Rest"   $r3.Rest   @("20000")

# 2b. --proc/--bat placed BEFORE the positional <ms> arg.
$r4 = Resolve-ClientCtlArgs @("wait_exit", "--proc", "MetalRage2", "--bat", "C:\Games\MetalRage Online 2\Play Second Client.bat", "20000")
Assert-Eq     "wait_exit flags-before-positional: ProcName" $r4.ProcName "MetalRage2"
Assert-Eq     "wait_exit flags-before-positional: ExeName"  $r4.ExeName  "MetalRage2.exe"
Assert-Eq     "wait_exit flags-before-positional: BatPath"  $r4.BatPath  "C:\Games\MetalRage Online 2\Play Second Client.bat"
Assert-RestEq "wait_exit flags-before-positional: Rest"     $r4.Rest     @("20000")

# 2c. --proc/--bat placed AFTER the positional <ms> arg -- flags may appear
#     anywhere, per the function's docstring.
$r5 = Resolve-ClientCtlArgs @("wait_exit", "20000", "--proc", "MetalRage2")
Assert-Eq     "wait_exit flags-after-positional: ProcName" $r5.ProcName "MetalRage2"
Assert-RestEq "wait_exit flags-after-positional: Rest"     $r5.Rest     @("20000")

# 3. --proc alone must not touch the BatPath default (independent overrides,
#    since the host instance's dir doesn't follow the joiner's naming).
$r6 = Resolve-ClientCtlArgs @("launch", "--proc", "MetalRage2")
Assert-Eq "proc-only override: ProcName unaffected default BatPath" $r6.BatPath "C:\Games\MetalRage Online\Play Metal Rage Online.bat"
Assert-Eq "proc-only override: ProcName"                            $r6.ProcName "MetalRage2"

# 3b. --bat alone must not touch the ProcName/ExeName default.
$r7 = Resolve-ClientCtlArgs @("launch", "--bat", "C:\Games\MetalRage Online\Play With Log.bat")
Assert-Eq "bat-only override: ProcName unaffected" $r7.ProcName "MetalRage"
Assert-Eq "bat-only override: ExeName unaffected"  $r7.ExeName  "MetalRage.exe"
Assert-Eq "bat-only override: BatPath"             $r7.BatPath  "C:\Games\MetalRage Online\Play With Log.bat"

if ($failures -gt 0) {
    Write-Output "$failures assertion(s) failed"
    exit 1
}
Write-Output "all assertions passed"
exit 0
