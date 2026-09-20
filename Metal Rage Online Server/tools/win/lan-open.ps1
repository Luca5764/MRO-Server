# Let a second machine on the same LAN reach the WSL2-hosted MRO server.
#
# WSL2's default NAT mode only forwards 127.0.0.1 on Windows into the VM, so
# a second machine on the LAN can connect to the Windows host but never
# reaches the WSL2 IP behind it (docs/reference/setup.md "在 WSL2 跑伺服器"
# already covers the 0.0.0.0 bind fix, which is the *other* half of this).
# This script forwards Windows' own ports 9211/30907 to whatever the WSL2
# VM's current IP happens to be (it changes every time WSL restarts, which
# is why this is "open a session" rather than "set once forever"), and adds
# a matching inbound firewall rule scoped to the LAN subnet only.
#
# Requires: elevated PowerShell (Run as Administrator).
# Run again any time the WSL2 VM has restarted (rebooted Windows, or ran
# `wsl --shutdown`) -- the forwarded IP goes stale otherwise.
#
# Optional -VirtualSubnet adds a SEPARATE, additional firewall rule set
# scoped to a VPN/virtual-network subnet (e.g. ZeroTier/Tailscale), for
# friends connecting over that instead of the LAN (docs/reference/setup.md
# "跨網路連線（VPN）"). It does not replace or touch the LAN rules above.
#
# FW-NARROW (docs/backlog.md): -VirtualSubnet opens the firewall to a whole
# VPN address space (e.g. Radmin VPN's shared 26.0.0.0/8), not just the
# people actually allowed to log in. -FromWhitelist is the narrower
# replacement: it reads config/allowed-users.json (same file config/
# whitelist.js already gates login with -- AGENTS.md 硬性約束 #2) and scopes
# the VPN rule set's -RemoteAddress to exactly those accounts' hostAddress
# values, so firewall/whitelist/VPN membership stay one list. -VirtualSubnet
# still works for when that list is not set up yet.
#
# Companion: lan-close.ps1 fully reverts everything this script adds
# (pass -Virtual to it as well to also remove the -VPN-TCP-* rules, however
# they were created).
param(
    [int[]]$Ports = @(9211, 30907),
    # Override auto-detected LAN subnet, e.g. -Subnet "192.168.0.0/24"
    [string]$Subnet = "",
    # Restrict the firewall rule to these Windows network profiles. Public
    # is intentionally excluded by default -- see AGENTS.md 硬性約束 #2
    # (never expose this server to an untrusted network).
    [string[]]$FirewallProfile = @('Private', 'Domain'),
    # Optional: also open these ports for a VPN/virtual-network subnet (e.g.
    # a ZeroTier or Tailscale range like "10.147.0.0/16"), in ADDITION to the
    # LAN rules above -- the LAN rules above are left untouched either way.
    # This adds a separate, distinctly-named rule set (see $RulePrefix-VPN-*
    # below) scoped to Private only (not Domain -- a VPN virtual NIC is not
    # a domain-joined adapter). Same portproxy entries serve both: netsh
    # forwards from 0.0.0.0, so it does not care which subnet the traffic
    # came from -- only the firewall rule needs the extra scope.
    # Leave empty (default) to keep this script's behavior identical to
    # before this parameter existed.
    [string]$VirtualSubnet = "",
    # FW-NARROW: instead of -VirtualSubnet, scope the VPN rule set's
    # -RemoteAddress to exactly the hostAddress values found in
    # config/allowed-users.json (skipping entries with no hostAddress, an
    # invalid one, or one already inside the LAN subnet above -- those are
    # already covered by the LAN rules). Takes priority over -VirtualSubnet
    # if both are passed. Leave off (default) to keep old behavior.
    [switch]$FromWhitelist,
    # Override where -FromWhitelist reads the whitelist from. Default:
    # config/allowed-users.json resolved relative to this script's own
    # location (tools/win/ -> ../../config/allowed-users.json).
    [string]$WhitelistPath = ""
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

function Get-WslIPv4 {
    $raw = (wsl.exe -- hostname -I) 2>$null
    if (-not $raw) { throw "could not query the WSL2 IP -- is a WSL distro running?" }
    $ip = ($raw -split '\s+')[0].Trim()
    if ($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
        throw "unexpected output from 'wsl hostname -I': '$raw'"
    }
    return $ip
}

function Get-NetworkCidr([string]$IPAddress, [int]$PrefixLength) {
    $bytes = [Net.IPAddress]::Parse($IPAddress).GetAddressBytes()
    [Array]::Reverse($bytes)
    $ipInt = [BitConverter]::ToUInt32($bytes, 0)
    $maskInt = if ($PrefixLength -le 0) { 0 } else { [UInt32]::MaxValue -shl (32 - $PrefixLength) }
    $netBytes = [BitConverter]::GetBytes($ipInt -band $maskInt)
    [Array]::Reverse($netBytes)
    return "$([Net.IPAddress]::new($netBytes))/$PrefixLength"
}

function Get-LanSubnetCidr {
    # Physical/LAN adapters only -- exclude the WSL vEthernet, loopback,
    # link-local, VPN and other virtual adapters that also show up here.
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
        Where-Object {
            $_.IPAddress -ne '127.0.0.1' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Tap|VPN|Virtual'
        }
    if (-not $candidates) {
        throw "could not auto-detect a LAN adapter; pass -Subnet explicitly, e.g. -Subnet 192.168.0.0/24"
    }
    $list = @($candidates)
    if ($list.Count -gt 1) {
        $desc = ($list | ForEach-Object { "$($_.InterfaceAlias)=$($_.IPAddress)/$($_.PrefixLength)" }) -join '; '
        Write-Warning "multiple LAN-looking adapters found, using the first: $desc"
        Write-Warning "pass -Subnet explicitly if this picked the wrong one."
    }
    $c = $list | Select-Object -First 1
    return Get-NetworkCidr -IPAddress $c.IPAddress -PrefixLength $c.PrefixLength
}

function Test-IpInCidr([string]$IPAddress, [string]$Cidr) {
    # Used by Get-WhitelistVpnAddresses below to skip hostAddress entries
    # already inside the LAN subnet (those are already covered by the LAN
    # firewall rules added further down, no need to also list them in the
    # VPN rule's -RemoteAddress).
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
            Write-Host "  skip '$name': hostAddress $addr is inside $LocalCidr (already covered by the LAN rules)"
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

function Remove-MroLanRules {
    # Same removal logic lan-close.ps1 uses -- run first so re-running
    # lan-open.ps1 after a WSL restart replaces stale entries cleanly.
    # Scoped to "-TCP-*" (the default LAN rule set) only -- this must not
    # touch the "-VPN-TCP-*" rules added below by -FromWhitelist or
    # -VirtualSubnet, so that running this script without either of those
    # leaves any existing VPN rule set alone.
    foreach ($port in $Ports) {
        & netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port | Out-Null
    }
    Get-NetFirewallRule -DisplayName "$RulePrefix-TCP-*" -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

function Remove-MroLanVpnRules {
    # Only called when -FromWhitelist or -VirtualSubnet is passed (see
    # below) -- removes a previous run's "-VPN-TCP-*" rules before
    # re-adding them, same idempotency pattern as Remove-MroLanRules above.
    # Matches by rule name only, so it cleans up regardless of which of the
    # two modes created them.
    Get-NetFirewallRule -DisplayName "$RulePrefix-VPN-TCP-*" -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

Assert-Admin

$wslIp = Get-WslIPv4
$subnetCidr = if ($Subnet) { $Subnet } else { Get-LanSubnetCidr }

Write-Output "WSL2 IP:      $wslIp"
Write-Output "LAN subnet:   $subnetCidr"
Write-Output "Ports:        $($Ports -join ', ')"

# FW-NARROW: resolve and validate the whitelist BEFORE touching any firewall
# state, so a missing/broken/empty whitelist aborts the whole run (including
# the LAN rules below) instead of silently opening a narrower-than-intended
# or stale VPN rule set. Fail closed, not partially open.
$vpnAddresses = @()
if ($FromWhitelist) {
    $resolvedWhitelistPath = if ($WhitelistPath) { $WhitelistPath } else { Join-Path $PSScriptRoot '..\..\config\allowed-users.json' }
    Write-Output ""
    Write-Output "Reading VPN member addresses from whitelist: $resolvedWhitelistPath"
    try {
        $vpnAddresses = @(Get-WhitelistVpnAddresses -Path $resolvedWhitelistPath -LocalCidr $subnetCidr)
    } catch {
        Write-Error "-FromWhitelist: could not read/parse $resolvedWhitelistPath ($($_.Exception.Message)) -- refusing to create any rule (fail closed). Fix the whitelist file, or omit -FromWhitelist to skip the VPN rule set entirely."
        exit 1
    }
    if ($vpnAddresses.Count -eq 0) {
        Write-Error "-FromWhitelist: no usable hostAddress found in $resolvedWhitelistPath (see skip reasons above) -- refusing to create any rule (fail closed)."
        exit 1
    }
} elseif ($VirtualSubnet) {
    Write-Warning "-VirtualSubnet ($VirtualSubnet) opens the firewall to an entire address space, not just whitelist members. Prefer -FromWhitelist once config/allowed-users.json has hostAddress entries for everyone who needs in (docs/reference/setup.md 跨網路連線)."
}

Remove-MroLanRules

foreach ($port in $Ports) {
    & netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port `
        connectaddress=$wslIp connectport=$port | Out-Null

    New-NetFirewallRule -DisplayName "$RulePrefix-TCP-$port" `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port `
        -RemoteAddress $subnetCidr -Profile $FirewallProfile | Out-Null
}

if ($FromWhitelist) {
    Write-Output ""
    Write-Output "Whitelist VPN addresses: $($vpnAddresses -join ', ')"
    Remove-MroLanVpnRules
    foreach ($port in $Ports) {
        New-NetFirewallRule -DisplayName "$RulePrefix-VPN-TCP-$port" `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port `
            -RemoteAddress $vpnAddresses -Profile 'Private' | Out-Null
    }
    Write-Output "added $RulePrefix-VPN-TCP-* rules (Private only) for $($vpnAddresses -join ', ')"
    Write-Output "(reuses the same portproxy entries above; only the firewall scope is separate)"
} elseif ($VirtualSubnet) {
    Write-Output ""
    Write-Output "Virtual/VPN subnet: $VirtualSubnet"
    Remove-MroLanVpnRules
    foreach ($port in $Ports) {
        New-NetFirewallRule -DisplayName "$RulePrefix-VPN-TCP-$port" `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port `
            -RemoteAddress $VirtualSubnet -Profile 'Private' | Out-Null
    }
    Write-Output "added $RulePrefix-VPN-TCP-* rules (Private only) for $VirtualSubnet"
    Write-Output "(reuses the same portproxy entries above; only the firewall scope is separate)"
}

Write-Output ""
Write-Output "Done. netsh interface portproxy show v4tov4:"
& netsh interface portproxy show v4tov4
Write-Output ""
Write-Output "Run lan-close.ps1 to revert (add -Virtual to also remove the -VirtualSubnet rules)."
Write-Output "Re-run this script after any WSL restart (the forwarded IP $wslIp goes stale)."
