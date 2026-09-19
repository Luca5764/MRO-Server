# pico_serial.ps1 - Bridge from Windows PowerShell to the Pico's USB CDC console.
#
# Runs on Windows (invoked from WSL via powershell.exe, see pico_ctl.py / pico_drive.sh).
# Talks System.IO.Ports.SerialPort to the Pico's console serial (code.py's stdin/stdout
# loop), one line in, one "[<code>] <msg>" line out per command.
#
# Usage:
#   pico_serial.ps1 [-Port COM6] "PING" ["CLICK left" ...]
#
# If -Port is omitted, auto-detects the Pico by PNPDeviceID (VID_239A&PID_8162&MI_00,
# the console CDC interface of the board's composite USB descriptor) and prints the
# resolved port to stderr so callers can see what was picked.
#
# Multiple commands can be passed in one invocation (PowerShell startup is slow, so
# batching avoids paying that cost per command). Commands are sent in order; for each
# one this script prints the firmware's single reply line ("[200] PONG ...") to stdout,
# in order. If a command times out, an "[ERR-TIMEOUT] <cmd>" line is printed instead and
# the script's exit code is set to 1 (still processes the rest of the batch).

# Parse $args by hand instead of a param() block: PowerShell's positional binder
# always fills ordinary positional parameters (like -Port) before handing anything
# to a ValueFromRemainingArguments parameter, regardless of declared Position, so
# a lone command with no -Port flag (the common case) silently landed in $Port
# instead of $Commands. Verified by hand against Windows PowerShell 5.1.
$Port = $null
$Commands = New-Object System.Collections.Generic.List[string]
$i = 0
while ($i -lt $args.Count) {
    if ($args[$i] -eq '-Port' -and ($i + 1) -lt $args.Count) {
        $Port = $args[$i + 1]
        $i += 2
    } else {
        $Commands.Add($args[$i])
        $i += 1
    }
}

$ErrorActionPreference = "Stop"

if ($Commands.Count -eq 0) {
    [Console]::Error.WriteLine("Usage: pico_serial.ps1 [-Port COM6] <command> [<command> ...]")
    exit 2
}

function Resolve-PicoPort {
    $dev = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
        Where-Object { $_.PNPDeviceID -match 'VID_239A&PID_8162&MI_00' } |
        Select-Object -First 1
    if (-not $dev) {
        return $null
    }
    if ($dev.Name -match '\(COM(\d+)\)') {
        return "COM$($matches[1])"
    }
    return $null
}

if (-not $Port) {
    $Port = Resolve-PicoPort
    if (-not $Port) {
        [Console]::Error.WriteLine("Could not auto-detect Pico COM port (looked for VID_239A&PID_8162&MI_00). Pass -Port explicitly.")
        exit 2
    }
    [Console]::Error.WriteLine("auto-detected port: $Port")
}

function Get-CommandBudgetMs {
    param([string]$Cmd)
    $baseMs = 3000
    $tokens = $Cmd.Trim() -split '\s+'
    if ($tokens.Count -eq 0) { return $baseMs }
    switch ($tokens[0].ToUpper()) {
        "PRESS" {
            if ($tokens.Count -ge 3 -and [int]::TryParse($tokens[2], [ref]$null)) {
                return $baseMs + [int]$tokens[2] + 500
            }
            return $baseMs
        }
        "TYPE" {
            $text = $Cmd.Trim()
            if ($text.Length -gt 5) { $text = $text.Substring(5) } else { $text = "" }
            return $baseMs + ($text.Length * 30) + 500
        }
        "MOVE_TO" { return $baseMs + 1000 }
        default { return $baseMs }
    }
}

$port = New-Object System.IO.Ports.SerialPort $Port, 115200
$port.DtrEnable = $true
$port.NewLine = "`n"
$port.ReadTimeout = 500

$exitCode = 0

try {
    $port.Open()
    Start-Sleep -Milliseconds 300
    $port.DiscardInBuffer()

    foreach ($cmd in $Commands) {
        $budgetMs = Get-CommandBudgetMs -Cmd $cmd
        $port.Write("$cmd`r`n")

        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $replied = $false
        while ($sw.ElapsedMilliseconds -lt $budgetMs) {
            try {
                $line = $port.ReadLine()
            } catch [System.TimeoutException] {
                continue
            }
            if ($line -match '^\[\d+\]') {
                Write-Output $line.Trim()
                $replied = $true
                break
            }
            # Ignore unrelated lines (e.g. boot banner / [HID] / [WIFI] prints).
        }
        if (-not $replied) {
            Write-Output "[ERR-TIMEOUT] $cmd"
            $exitCode = 1
        }
    }
} finally {
    if ($port.IsOpen) {
        $port.Close()
    }
}

exit $exitCode
