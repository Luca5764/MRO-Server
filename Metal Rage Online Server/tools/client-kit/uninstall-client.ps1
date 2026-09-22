<#
Undo setup-client.ps1: restore the exe/Engine.dll/ini/bat files it backed up
under client-kit-backup\, and remove the MRO-P2P-UDP-30907 firewall rule.

Run as: elevated PowerShell, from the client root folder (same folder
you ran setup-client.ps1 from).

    cd 'C:\Games\MetalRage Online'
    .\client-kit\uninstall-client.ps1

Idempotent: safe to run even if setup-client.ps1 was never run (it just
reports there is nothing to restore) or has already been undone.
#>

$ErrorActionPreference = 'Stop'

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an elevated PowerShell (Run as Administrator)."
    exit 1
}

$ClientRoot = (Get-Location).Path
$SystemDir = Join-Path $ClientRoot 'data\System'
$BackupDir = Join-Path $ClientRoot 'client-kit-backup'

if (-not (Test-Path $BackupDir)) {
    Write-Output "no '$BackupDir' found -- setup-client.ps1 was never run here (or was already undone)."
} else {
    $restores = @(
        @{ Backup = 'MetalRage.exe.bak'; Target = Join-Path $SystemDir 'MetalRage.exe' },
        @{ Backup = 'Engine.dll.bak'; Target = Join-Path $SystemDir 'Engine.dll' },
        @{ Backup = 'MetalRage.ini.bak'; Target = Join-Path $SystemDir 'MetalRage.ini' },
        @{ Backup = 'Default.ini.bak'; Target = Join-Path $SystemDir 'Default.ini' },
        @{ Backup = 'Play Metal Rage Online.bat.bak'; Target = Join-Path $ClientRoot 'Play Metal Rage Online.bat' }
    )
    foreach ($r in $restores) {
        $src = Join-Path $BackupDir $r.Backup
        if (Test-Path $src) {
            Copy-Item $src $r.Target -Force
            Write-Output "restored: $($r.Target)"
        } else {
            Write-Output "skipped (no backup): $($r.Target)"
        }
    }
}

$RuleName = 'MRO-P2P-UDP-30907'
$rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($rule) {
    $rule | Remove-NetFirewallRule
    Write-Output "removed firewall rule: $RuleName"
} else {
    Write-Output "no $RuleName firewall rule found"
}

Write-Output ""
Write-Output "Note: this does not revert the network profile (Private/Public) or the SEHOP registry key; those are safe to leave as-is."
