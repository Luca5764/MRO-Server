# Undo lan-open.ps1: remove the portproxy forwards and firewall rules it
# added for the MRO server ports. Safe to run even if lan-open.ps1 was never
# run (everything is best-effort / idempotent).
#
# Requires: elevated PowerShell (Run as Administrator).
param(
    [int[]]$Ports = @(9211, 30907)
)

$ErrorActionPreference = 'Stop'
$RulePrefix = 'MRO-LAN'

function Assert-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error "Run this script from an elevated PowerShell (Run as Administrator)."
        exit 1
    }
}

Assert-Admin

foreach ($port in $Ports) {
    & netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port | Out-Null
}

$rules = Get-NetFirewallRule -DisplayName "$RulePrefix-*" -ErrorAction SilentlyContinue
if ($rules) {
    $rules | ForEach-Object { Write-Output "removing firewall rule: $($_.DisplayName)" }
    $rules | Remove-NetFirewallRule
} else {
    Write-Output "no $RulePrefix-* firewall rules found."
}

Write-Output ""
Write-Output "portproxy v4tov4 (should no longer list $($Ports -join '/')):"
& netsh interface portproxy show v4tov4
