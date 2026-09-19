<#
Friend-facing one-shot setup: point a freshly extracted MetalRage Online
client at our server and open the ports it needs.

Run as: elevated PowerShell (Run as Administrator), from the client root
folder (the folder that directly contains "data\" and
"Play Metal Rage Online.bat" -- e.g. C:\Games\MetalRage Online).

    cd 'C:\Games\MetalRage Online'
    .\client-kit\setup-client.ps1 -ServerIp <host's IP or VPN IP>

Idempotent: running it again (e.g. after the operator gives a new IP)
just re-applies the same steps; it will not double-backup or re-swap an
already-correct exe.

What it does:
  1. Detects Win10 vs Win11 and makes sure the right MetalRage.exe is in
     place (see docs/reference/setup.md "依作業系統選 exe" -- the Win11
     build is patched and crashes on Win10 with 0xc0000005).
  2. Writes -ServerIp into the launch bat, MetalRage.ini and Default.ini
     (client reads the server address from all three -- client.md).
  3. Opens the in-battle P2P port (UDP 30907), same rule as
     tools/win/p2p-open.ps1, scoped to -HostSubnet.
  4. Checks the active network profile and offers to switch it to
     Private (the firewall rule only applies on Private/Domain).

Everything this script overwrites is backed up first under
"client-kit-backup\" in the client root. Undo with uninstall-client.ps1.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ServerIp,

    [string]$HostSubnet = '192.168.1.0/24'
)

$ErrorActionPreference = 'Stop'

# --- elevation check (same pattern as tools/win/p2p-open.ps1) ---
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (Run as Administrator)."
    exit 1
}

$ClientRoot = (Get-Location).Path
$SystemDir = Join-Path $ClientRoot 'data\System'
$BackupDir = Join-Path $ClientRoot 'client-kit-backup'
$KitDir = $PSScriptRoot

$Win10ExeHash = '419D927517E63FE73172840CF9B2237672B9890A590F16B334BF500D74DA14A0'
$Win11ExeHash = '487646B0AAFB9F586126876EF483825F60053E0166F59B74A7CA86AC437021B4'
# ^ copied from docs/reference/setup.md "依作業系統選 exe"; compared case-insensitively below.

function Assert-ClientRoot {
    if (-not (Test-Path $SystemDir)) {
        Write-Error "'$ClientRoot' does not look like a MetalRage Online client root (no data\System). cd into the extracted client folder first."
        exit 1
    }
    if (-not (Test-Path (Join-Path $ClientRoot 'Play Metal Rage Online.bat'))) {
        Write-Error "'$ClientRoot' has no 'Play Metal Rage Online.bat'. Wrong folder?"
        exit 1
    }
}

function Backup-Once {
    param([string]$SourcePath, [string]$BackupName)
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir | Out-Null
    }
    $dest = Join-Path $BackupDir $BackupName
    if (-not (Test-Path $dest)) {
        Copy-Item $SourcePath $dest
        Write-Output "backed up: $SourcePath -> $dest"
    }
}

function Get-FileHashUpper {
    param([string]$Path)
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

# --- 1. detect OS and make sure the right exe is deployed ---
function Set-CorrectExe {
    $exePath = Join-Path $SystemDir 'MetalRage.exe'
    $origBackup = Join-Path $SystemDir '_original_backup\MetalRage.exe'
    if (-not (Test-Path $exePath)) {
        Write-Error "'$exePath' not found. Is this a real extracted client?"
        exit 1
    }
    if (-not (Test-Path $origBackup)) {
        Write-Error "'$origBackup' not found -- the archive should ship this. Cannot pick the Win10 exe without it."
        exit 1
    }

    $build = [int](Get-CimInstance Win32_OperatingSystem).BuildNumber
    $isWin11 = $build -ge 22000
    Write-Output "detected: Windows $(if ($isWin11) {'11'} else {'10'}) (build $build)"

    $currentHash = Get-FileHashUpper $exePath

    if ($isWin11) {
        if ($currentHash -eq $Win11ExeHash) {
            Write-Output "exe: already the Win11 build, nothing to do"
            return
        }
        if ($currentHash -eq $Win10ExeHash) {
            # A previous run (or a Win10 setup on this same folder) swapped in the
            # stock exe. Restore our own backup of the Win11 build if we have one.
            $ownBackup = Join-Path $BackupDir 'MetalRage.exe.bak'
            if ((Test-Path $ownBackup) -and (Get-FileHashUpper $ownBackup) -eq $Win11ExeHash) {
                Copy-Item $ownBackup $exePath -Force
                $verify = Get-FileHashUpper $exePath
                if ($verify -ne $Win11ExeHash) {
                    Write-Error "restored exe hash mismatch: expected $Win11ExeHash, got $verify"
                    exit 1
                }
                Write-Output "exe: restored the Win11 build from client-kit-backup"
                return
            }
            Write-Error "This is Win11 but MetalRage.exe is the Win10 build, and there is no known-good Win11 backup to restore. Re-extract the client archive."
            exit 1
        }
        Write-Error "MetalRage.exe hash ($currentHash) matches neither the known Win10 nor Win11 build. Re-extract the client archive before continuing."
        exit 1
    } else {
        if ($currentHash -eq $Win10ExeHash) {
            Write-Output "exe: already the Win10 (original) build, nothing to do"
            return
        }
        Backup-Once -SourcePath $exePath -BackupName 'MetalRage.exe.bak'
        Copy-Item $origBackup $exePath -Force
        $verify = Get-FileHashUpper $exePath
        if ($verify -ne $Win10ExeHash) {
            Write-Error "exe swap failed verification: expected $Win10ExeHash, got $verify"
            exit 1
        }
        Write-Output "exe: swapped in the Win10 (original) build, hash verified"
    }
}

# --- 2. server IP: launch bat + both ini files ---
function Set-ServerIp {
    # bat: installed from the launch-fixed.bat.template shipped in the kit,
    # replacing "Play Metal Rage Online.bat" (backed up first). This is the
    # bat the friend double-clicks; it also carries the %ERRORLEVEL% fix
    # and keeps the SEHOP registry step from the original.
    $batPath = Join-Path $ClientRoot 'Play Metal Rage Online.bat'
    $template = Join-Path $KitDir 'launch-fixed.bat.template'
    if (-not (Test-Path $template)) {
        Write-Error "'$template' missing from the kit."
        exit 1
    }
    Backup-Once -SourcePath $batPath -BackupName 'Play Metal Rage Online.bat.bak'
    $batContent = Get-Content -Raw -Encoding ASCII $template
    $batContent = $batContent.Replace('__SERVER_IP__', $ServerIp)
    Set-Content -Path $batPath -Value $batContent -Encoding ASCII -NoNewline
    Write-Output "bat: set ip=$ServerIp in '$batPath'"

    foreach ($iniName in @('MetalRage.ini', 'Default.ini')) {
        $iniPath = Join-Path $SystemDir $iniName
        if (-not (Test-Path $iniPath)) {
            Write-Error "'$iniPath' not found."
            exit 1
        }
        Backup-Once -SourcePath $iniPath -BackupName "$iniName.bak"
        $lines = Get-Content -Encoding ASCII $iniPath
        $changed = $false
        $lines = $lines | ForEach-Object {
            if ($_ -match '^ServerIP=') {
                $changed = $true
                "ServerIP=$ServerIp"
            } else {
                $_
            }
        }
        if (-not $changed) {
            Write-Error "'$iniPath' has no ServerIP= line; refusing to guess where to add one."
            exit 1
        }
        Set-Content -Path $iniPath -Value $lines -Encoding ASCII
        Write-Output "ini: set ServerIP=$ServerIp in '$iniPath'"
    }
}

# --- 3. P2P firewall rule (same as tools/win/p2p-open.ps1) ---
function Set-P2PFirewallRule {
    $RuleName = 'MRO-P2P-UDP-30907'
    Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol UDP `
        -LocalPort 30907 -Profile Private -RemoteAddress $HostSubnet -Action Allow | Out-Null
    Write-Output "firewall: added $RuleName (Inbound UDP 30907, Private, from $HostSubnet)"
}

# --- 4. network profile check ---
function Test-NetworkProfile {
    $profiles = Get-NetConnectionProfile
    $publicProfiles = $profiles | Where-Object { $_.NetworkCategory -eq 'Public' }
    if (-not $publicProfiles) {
        Write-Output "network profile: OK (no Public-category connections)"
        return
    }
    foreach ($p in $publicProfiles) {
        Write-Output "network profile: '$($p.Name)' ($($p.InterfaceAlias)) is Public -- the P2P firewall rule only applies to Private/Domain."
        Write-Output "  Fix manually: Settings -> Network & Internet -> $($p.InterfaceAlias) -> Network profile type -> Private"
        $answer = Read-Host "  Switch '$($p.Name)' to Private now? [y/N]"
        if ($answer -match '^[Yy]') {
            Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private
            Write-Output "  switched '$($p.Name)' to Private"
        }
    }
}

Assert-ClientRoot
Set-CorrectExe
Set-ServerIp
Set-P2PFirewallRule
Test-NetworkProfile

Write-Output ""
Write-Output "=== setup-client.ps1 summary ==="
Write-Output "client root : $ClientRoot"
Write-Output "server IP   : $ServerIp"
Write-Output "host subnet : $HostSubnet (P2P firewall rule)"
Write-Output "backups in  : $BackupDir"
Write-Output "Launch with 'Play Metal Rage Online.bat'. First run needs Administrator once (SEHOP registry key)."
