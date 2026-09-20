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
#   remote address limited to the LAN subnet (default 192.168.0.0/24).
# UDP 30907 does not conflict with lan-open.ps1's TCP 30907 portproxy on
# the server PC: different protocol.
#
# Optional -VirtualSubnet adds a SEPARATE, additional rule (distinct name,
# "MRO-P2P-VPN-UDP-$Port") scoped to a VPN/virtual-network subnet (e.g.
# ZeroTier/Tailscale), for friends hosting a battle over that instead of the
# LAN (docs/reference/setup.md "跨網路連線（VPN）"). This does not replace
# or touch the -RemoteSubnet rule above -- both can be active at once.
#
# FW-NARROW (docs/backlog.md): -VirtualSubnet opens the firewall to a whole
# VPN address space (e.g. Radmin VPN's shared 26.0.0.0/8), not just the
# people actually allowed to log in. -FromWhitelist is the narrower
# replacement: it reads config/allowed-users.json (same file config/
# whitelist.js already gates login with -- AGENTS.md 硬性約束 #2) and scopes
# the VPN rule's -RemoteAddress to exactly those accounts' hostAddress
# values, so firewall/whitelist/VPN membership stay one list. -VirtualSubnet
# still works for when that list is not set up yet.
#
# Undo: p2p-close.ps1 (removes both rule sets unconditionally, however they
# were created -- see that script's header). Requires an elevated
# PowerShell (Run as Administrator).
param(
    [string]$RemoteSubnet = '192.168.0.0/24',
    [int]$Port = 30907,
    [string]$VirtualSubnet = '',
    # FW-NARROW: instead of -VirtualSubnet, scope the VPN rule's
    # -RemoteAddress to exactly the hostAddress values found in
    # config/allowed-users.json (skipping entries with no hostAddress, an
    # invalid one, or one already inside -RemoteSubnet -- those are already
    # covered by the rule above). Takes priority over -VirtualSubnet if both
    # are passed. Leave off (default) to keep old behavior.
    [switch]$FromWhitelist,
    # Override where -FromWhitelist reads the whitelist from. Default:
    # config/allowed-users.json resolved relative to this script's own
    # location (tools/win/ -> ../../config/allowed-users.json).
    [string]$WhitelistPath = ''
)

$ErrorActionPreference = 'Stop'
$RuleName = "MRO-P2P-UDP-$Port"

function Test-IpInCidr([string]$IPAddress, [string]$Cidr) {
    # Used by Get-WhitelistVpnAddresses below to skip hostAddress entries
    # already inside -RemoteSubnet (those are already covered by the rule
    # added above, no need to also list them in the VPN rule).
    $parts = $Cidr -split '/'
    if ($parts.Count -ne 2) { return $false }
    try {
        $ipBytes = [Net.IPAddress]::Parse($IPAddress).GetAddressBytes()
        $netBytes = [Net.IPAddress]::Parse($parts[0]).GetAddressBytes()
    } catch {
        return $false
    }
    [Array]::Reverse($ipBytes)
    [Array]::Reverse($netBytes)
    $ipInt = [BitConverter]::ToUInt32($ipBytes, 0)
    $netInt = [BitConverter]::ToUInt32($netBytes, 0)
    $prefix = [int]$parts[1]
    $maskInt = if ($prefix -le 0) { 0 } else { [UInt32]::MaxValue -shl (32 - $prefix) }
    return (($ipInt -band $maskInt) -eq ($netInt -band $maskInt))
}

function Get-WhitelistVpnAddresses([string]$Path, [string]$LocalCidr) {
    # FW-NARROW: reads config/allowed-users.json (same shape config/
    # whitelist.js's load() parses -- `users` is an array of either a plain
    # string (old format, no hostAddress) or an object `{ name, hostAddress,
    # isTest? }`) and returns the deduplicated list of hostAddress values
    # that are not already inside $LocalCidr. Prints one line per entry
    # explaining whether it was used or skipped (and why), so a bad/typo'd
    # entry is visible instead of silently dropped.
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "whitelist file not found: $Path"
    }
    $raw = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
    $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
    $users = @($parsed.users)

    $seen = New-Object System.Collections.Generic.HashSet[string]
    $result = @()
    foreach ($entry in $users) {
        if ($null -eq $entry) { continue }
        if ($entry -is [string]) {
            Write-Host "  skip '$entry': no hostAddress (old string-format whitelist entry)"
            continue
        }
        $name = [string]$entry.name
        $addr = [string]$entry.hostAddress
        if ([string]::IsNullOrWhiteSpace($addr)) {
            Write-Host "  skip '$name': no hostAddress"
            continue
        }
        $addr = $addr.Trim()
        $parsedIp = $null
        if (-not [Net.IPAddress]::TryParse($addr, [ref]$parsedIp) -or
            $parsedIp.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
            Write-Host "  skip '$name': hostAddress '$addr' is not a valid IPv4 literal"
            continue
        }
        if (Test-IpInCidr -IPAddress $addr -Cidr $LocalCidr) {
            Write-Host "  skip '$name': hostAddress $addr is inside $LocalCidr (already covered by -RemoteSubnet)"
            continue
        }
        if (-not $seen.Add($addr)) {
            Write-Host "  skip '$name': hostAddress $addr already added (duplicate)"
            continue
        }
        Write-Host "  use '$name': $addr"
        $result += $addr
    }
    return $result
}

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (Run as Administrator)."
    exit 1
}

# FW-NARROW: resolve and validate the whitelist BEFORE touching any firewall
# state, so a missing/broken/empty whitelist aborts the whole run (including
# the -RemoteSubnet rule below) instead of silently opening a
# narrower-than-intended or stale VPN rule. Fail closed, not partially open.
$vpnAddresses = @()
if ($FromWhitelist) {
    $resolvedWhitelistPath = if ($WhitelistPath) { $WhitelistPath } else { Join-Path $PSScriptRoot '..\..\config\allowed-users.json' }
    Write-Output "Reading VPN member addresses from whitelist: $resolvedWhitelistPath"
    try {
        $vpnAddresses = @(Get-WhitelistVpnAddresses -Path $resolvedWhitelistPath -LocalCidr $RemoteSubnet)
    } catch {
        Write-Error "-FromWhitelist: could not read/parse $resolvedWhitelistPath ($($_.Exception.Message)) -- refusing to create any rule (fail closed). Fix the whitelist file, or omit -FromWhitelist to skip the VPN rule entirely."
        exit 1
    }
    if ($vpnAddresses.Count -eq 0) {
        Write-Error "-FromWhitelist: no usable hostAddress found in $resolvedWhitelistPath (see skip reasons above) -- refusing to create any rule (fail closed)."
        exit 1
    }
} elseif ($VirtualSubnet) {
    Write-Warning "-VirtualSubnet ($VirtualSubnet) opens the firewall to an entire address space, not just whitelist members. Prefer -FromWhitelist once config/allowed-users.json has hostAddress entries for everyone who needs in (docs/reference/setup.md 跨網路連線)."
}

Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol UDP `
    -LocalPort $Port -Profile Private -RemoteAddress $RemoteSubnet -Action Allow | Out-Null

Write-Output "added: $RuleName (Inbound UDP $Port, Private, from $RemoteSubnet)"

if ($FromWhitelist) {
    $VpnRuleName = "MRO-P2P-VPN-UDP-$Port"
    Get-NetFirewallRule -DisplayName $VpnRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $VpnRuleName -Direction Inbound -Protocol UDP `
        -LocalPort $Port -Profile Private -RemoteAddress $vpnAddresses -Action Allow | Out-Null
    Write-Output "added: $VpnRuleName (Inbound UDP $Port, Private, from $($vpnAddresses -join ', '))"
} elseif ($VirtualSubnet) {
    $VpnRuleName = "MRO-P2P-VPN-UDP-$Port"
    Get-NetFirewallRule -DisplayName $VpnRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $VpnRuleName -Direction Inbound -Protocol UDP `
        -LocalPort $Port -Profile Private -RemoteAddress $VirtualSubnet -Action Allow | Out-Null
    Write-Output "added: $VpnRuleName (Inbound UDP $Port, Private, from $VirtualSubnet)"
}

Write-Output "network profiles (must be Private for the rule to apply):"
Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory -AutoSize
