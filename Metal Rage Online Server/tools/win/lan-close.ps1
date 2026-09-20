# Undo lan-open.ps1: remove the portproxy forwards and firewall rules it
# added for the MRO server ports. Safe to run even if lan-open.ps1 was never
# run (everything is best-effort / idempotent).
#
# By default this only removes the plain LAN rule set (same as before
# -VirtualSubnet existed on lan-open.ps1). Pass -Virtual to also remove the
# separate VPN rule set lan-open.ps1 -FromWhitelist or -VirtualSubnet added
# (docs/reference/setup.md "跨網路連線（VPN）") -- matched by rule name only,
# so it is removed the same way regardless of which of those two modes
# created it. The two rule sets (LAN vs VPN) are independent so closing the
# LAN rules does not require also closing the VPN ones.
#
# Requires: elevated PowerShell (Run as Administrator).
param(
    [int[]]$Ports = @(9211, 30907),
    [switch]$Virtual
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

$patterns = @("$RulePrefix-TCP-*")
if ($Virtual) { $patterns += "$RulePrefix-VPN-TCP-*" }

$rules = $patterns | ForEach-Object { Get-NetFirewallRule -DisplayName $_ -ErrorAction SilentlyContinue }
if ($rules) {
    $rules | ForEach-Object { Write-Output "removing firewall rule: $($_.DisplayName)" }
    $rules | Remove-NetFirewallRule
} else {
    Write-Output "no matching firewall rules found ($($patterns -join ', '))."
}
if (-not $Virtual) {
    Write-Output "(not touching any $RulePrefix-VPN-TCP-* rules -- pass -Virtual to also remove those)"
}

Write-Output ""
Write-Output "portproxy v4tov4 (should no longer list $($Ports -join '/')):"
& netsh interface portproxy show v4tov4
