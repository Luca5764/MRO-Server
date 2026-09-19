# Allow the in-game P2P battle traffic on THIS machine (run on every machine
# that may be the room host: the server PC and the laptop).
#
# Why: when a player hosts a battle, MetalRage.exe listens on UDP 30907
# (checked 2026-09-19 during a solo PvE battle: Get-NetUDPEndpoint showed
# 0.0.0.0:30907 owned by MetalRage.exe). The other players connect to it
# directly. Windows had only Public-profile rules for the game, and the home
# network is Private, so nothing allowed it.
#
# Scope (hard constraint: never expose to untrusted networks):
#   Inbound, UDP, local port 30907, Private profile only,
#   remote address limited to the LAN subnet (default 192.168.1.0/24).
# UDP 30907 does not conflict with lan-open.ps1's TCP 30907 portproxy on
# the server PC: different protocol.
#
# Undo: p2p-close.ps1. Requires an elevated PowerShell (Run as Administrator).
param(
    [string]$RemoteSubnet = '192.168.1.0/24',
    [int]$Port = 30907
)

$ErrorActionPreference = 'Stop'
$RuleName = "MRO-P2P-UDP-$Port"

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (Run as Administrator)."
    exit 1
}

Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol UDP `
    -LocalPort $Port -Profile Private -RemoteAddress $RemoteSubnet -Action Allow | Out-Null

Write-Output "added: $RuleName (Inbound UDP $Port, Private, from $RemoteSubnet)"
Write-Output "network profiles (must be Private for the rule to apply):"
Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory -AutoSize
