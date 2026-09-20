# Test-ForegroundProcessAllowed.tests.ps1
#
# Offline guardrail test for pico_serial.ps1's I3 process-name comparison
# (docs/research/2026-09-20-dual-pico/design.md, dual-client foreground gate).
# Everything ELSE in pico_serial.ps1's Test-ForegroundGate depends on Win32
# P/Invoke calls (GetForegroundWindow, EnumWindows, ...) that only work on a real
# Windows desktop with the game running, so this test isolates the one piece of
# that gate that is pure string comparison and can be checked without any of that:
# does the fail-closed exact-match logic actually block the "MetalRage2 window is
# foreground but the gate is still configured for MetalRage" case, which is the
# most likely way this design goes wrong (AGENTS.md: MetalRage is a prefix of
# MetalRage2, so -like/StartsWith/wildcard here would merge the two instances).
#
# The function is pulled out of the ACTUAL pico_serial.ps1 via the PowerShell
# parser (Find() over the AST), not hand-copied, so this test can't silently drift
# from what ships -- if someone changes Test-ForegroundProcessAllowed's behavior
# without updating this file, the test still runs the real, current code.
#
# Run standalone, no serial port / process / game required:
#   powershell.exe -NoProfile -File tools\pico\Test-ForegroundProcessAllowed.tests.ps1
#
# Prints one [PASS]/[FAIL] line per case, exits 0 if all pass, 1 otherwise.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $here "pico_serial.ps1"

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
$fnAst = $ast.Find({
    param($n)
    $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq "Test-ForegroundProcessAllowed"
}, $true)
if (-not $fnAst) {
    Write-Error "Could not find function Test-ForegroundProcessAllowed in $sourcePath -- has it been renamed or removed?"
    exit 1
}
Invoke-Expression $fnAst.Extent.Text

$failures = 0
function Assert-Case {
    param([string]$Name, $Actual, [bool]$Expected)
    if ($Actual -eq $Expected) {
        Write-Output "[PASS] $Name"
    } else {
        Write-Output "[FAIL] $Name (expected $Expected, got $Actual)"
        $script:failures++
    }
}

# The exact scenario this guardrail exists for (design.md I3 / PM's required test):
# dual-client's second instance in the foreground must NOT satisfy a gate still
# configured for the first instance's process name.
Assert-Case "MetalRage2 foreground, MetalRage allowed -> BLOCKED" `
    (Test-ForegroundProcessAllowed -ActualProcName "MetalRage2" -AllowedProcName "MetalRage") $false

Assert-Case "MetalRage2 foreground, MetalRage2 allowed -> passes" `
    (Test-ForegroundProcessAllowed -ActualProcName "MetalRage2" -AllowedProcName "MetalRage2") $true

# Existing single-instance behavior must be unaffected (default AllowedProc stays "MetalRage").
Assert-Case "MetalRage foreground, MetalRage allowed -> passes" `
    (Test-ForegroundProcessAllowed -ActualProcName "MetalRage" -AllowedProcName "MetalRage") $true

Assert-Case "MetalRage foreground, MetalRage2 allowed -> BLOCKED" `
    (Test-ForegroundProcessAllowed -ActualProcName "MetalRage" -AllowedProcName "MetalRage2") $false

# Fail-closed, not fail-open, when the configured/observed name is missing.
Assert-Case "empty AllowedProcName -> BLOCKED (not 'allow anything')" `
    (Test-ForegroundProcessAllowed -ActualProcName "MetalRage" -AllowedProcName "") $false

Assert-Case "null ActualProcName (foreground process unresolved) -> BLOCKED" `
    (Test-ForegroundProcessAllowed -ActualProcName $null -AllowedProcName "MetalRage") $false

if ($failures -gt 0) {
    Write-Output "$failures assertion(s) failed"
    exit 1
}
Write-Output "all assertions passed"
exit 0
