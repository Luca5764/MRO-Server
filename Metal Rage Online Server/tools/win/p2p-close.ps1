# Undo p2p-open.ps1: remove the MRO-P2P firewall rules. Idempotent.
# Requires an elevated PowerShell (Run as Administrator).
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (Run as Administrator)."
    exit 1
}
$rules = Get-NetFirewallRule -DisplayName 'MRO-P2P-*' -ErrorAction SilentlyContinue
if ($rules) {
    $rules | ForEach-Object { Write-Output "removing firewall rule: $($_.DisplayName)" }
    $rules | Remove-NetFirewallRule
} else {
    Write-Output "no MRO-P2P rules found"
}
