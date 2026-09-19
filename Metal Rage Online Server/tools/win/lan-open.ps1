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
# Companion: lan-close.ps1 fully reverts everything this script adds
# (pass -Virtual to it as well to also remove the -VirtualSubnet rules).
param(
    [int[]]$Ports = @(9211, 30907),
    # Override auto-detected LAN subnet, e.g. -Subnet "192.168.1.0/24"
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
    [string]$VirtualSubnet = ""
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
        throw "could not auto-detect a LAN adapter; pass -Subnet explicitly, e.g. -Subnet 192.168.1.0/24"
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

function Remove-MroLanRules {
    # Same removal logic lan-close.ps1 uses -- run first so re-running
    # lan-open.ps1 after a WSL restart replaces stale entries cleanly.
    # Scoped to "-TCP-*" (the default LAN rule set) only -- this must not
    # touch the "-VPN-TCP-*" rules added below by -VirtualSubnet, so that
    # running this script without -VirtualSubnet leaves any existing VPN
    # rule set alone.
    foreach ($port in $Ports) {
        & netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port | Out-Null
    }
    Get-NetFirewallRule -DisplayName "$RulePrefix-TCP-*" -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

function Remove-MroLanVpnRules {
    # Only called when -VirtualSubnet is passed (see below) -- removes a
    # previous run's "-VPN-TCP-*" rules before re-adding them, same
    # idempotency pattern as Remove-MroLanRules above.
    Get-NetFirewallRule -DisplayName "$RulePrefix-VPN-TCP-*" -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

Assert-Admin

$wslIp = Get-WslIPv4
$subnetCidr = if ($Subnet) { $Subnet } else { Get-LanSubnetCidr }

Write-Output "WSL2 IP:      $wslIp"
Write-Output "LAN subnet:   $subnetCidr"
Write-Output "Ports:        $($Ports -join ', ')"

Remove-MroLanRules

foreach ($port in $Ports) {
    & netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port `
        connectaddress=$wslIp connectport=$port | Out-Null

    New-NetFirewallRule -DisplayName "$RulePrefix-TCP-$port" `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port `
        -RemoteAddress $subnetCidr -Profile $FirewallProfile | Out-Null
}

if ($VirtualSubnet) {
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
