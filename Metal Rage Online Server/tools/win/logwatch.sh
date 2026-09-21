#!/bin/bash
# Build (with the in-box .NET Framework csc.exe -- no external package, no
# SDK) and run/stop LogWatch.exe, the standalone C# rewrite of
# logwatch.ps1 (see tools/win/logwatch.cs for what it does and why: it
# WM_GETTEXTs a MetalRage client's -log= window text in the background,
# never sends any other input, and is meant to run unattended alongside
# Pico driving the same client's foreground window).
#
# LogWatch.exe runs as its own independent Windows process (started via
# WSL's direct-exec of a .exe under /mnt/c, NOT via powershell.exe --
# powershell.exe hosting this logic is exactly what reproducibly crashed,
# see logwatch.cs's header comment), so `stop` below only ever needs to end
# that one process; it never touches MetalRage.exe.
#
#   tools/win/logwatch.sh start --proc MetalRage2
#   tools/win/logwatch.sh start --proc MetalRage2 --out /path/to/out.jsonl --hz 4 --max-seconds 60
#   tools/win/logwatch.sh status --proc MetalRage2
#   tools/win/logwatch.sh stop --proc MetalRage2
set -e
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/winuser.sh"
WINPROFILE_WSL=$(win_userprofile_wsl) || exit 1

WORKDIR_WSL="$WINPROFILE_WSL/mro-logwatch"
mkdir -p "$WORKDIR_WSL"

CSC="/mnt/c/Windows/Microsoft.NET/Framework/v4.0.30319/csc.exe"
SRC_WSL="$WORKDIR_WSL/LogWatch.cs"
EXE_WSL="$WORKDIR_WSL/LogWatch.exe"

# csc.exe (like powershell.exe -- see winuser.sh) can't reliably compile a
# source file that lives under a \\wsl UNC path, so the source is copied to
# the Windows user's own profile dir first, same pattern as shot.sh/
# logwatch.sh's predecessor copying screen.ps1/logwatch.ps1 there.
build() {
    if [ ! -x "$CSC" ]; then
        echo "csc.exe not found at $CSC (expected in-box .NET Framework 4.x compiler)" >&2
        exit 1
    fi
    cp "$HERE/logwatch.cs" "$SRC_WSL"
    if [ ! -f "$EXE_WSL" ] || [ "$SRC_WSL" -nt "$EXE_WSL" ]; then
        # -target:winexe (GUI subsystem), not -target:exe (console subsystem):
        # this process must never be able to pop a console window onto the
        # desktop and steal foreground, even transiently, since it is meant
        # to run silently in the background while Pico drives the game's
        # foreground window. It never creates any window of its own (no
        # message loop, no CreateWindow call anywhere in logwatch.cs) and
        # its stdout/stderr are always redirected to a file by this script's
        # own `start`, so the subsystem choice has no effect on its actual
        # behavior -- it only removes the console-subsystem process's
        # default right to auto-allocate a console when none is attached.
        "$CSC" -nologo -optimize+ -target:winexe -out:"$(wslpath -w "$EXE_WSL")" "$(wslpath -w "$SRC_WSL")" \
            || { echo "csc.exe compile failed" >&2; exit 1; }
    fi
}

CMD="${1:-}"
shift || true

PROC=""
OUT_WSL=""
HZ=3
MAXSEC=0

while [ $# -gt 0 ]; do
    case "$1" in
        --proc) PROC="$2"; shift 2 ;;
        --out) OUT_WSL="$2"; shift 2 ;;
        --hz) HZ="$2"; shift 2 ;;
        --max-seconds) MAXSEC="$2"; shift 2 ;;
        *) echo "unknown option $1" >&2; exit 1 ;;
    esac
done

if [ -z "$PROC" ]; then
    echo "usage: logwatch.sh {start|stop|status} --proc NAME [--out PATH] [--hz N] [--max-seconds N]" >&2
    exit 1
fi

PIDFILE="$WORKDIR_WSL/$PROC.pid"

case "$CMD" in
    start)
        build
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "already running (pid $(cat "$PIDFILE"))" >&2
            exit 1
        fi
        if [ -z "$OUT_WSL" ]; then
            mkdir -p "$WINPROFILE_WSL/mro-logwatch-out"
            OUT_WSL="$WINPROFILE_WSL/mro-logwatch-out/$PROC-$(date +%Y%m%d-%H%M%S).jsonl"
        fi
        OUT_WIN=$(wslpath -w "$OUT_WSL")
        nohup "$EXE_WSL" --proc "$PROC" --out "$OUT_WIN" --hz "$HZ" --max-seconds "$MAXSEC" \
            >"$WORKDIR_WSL/$PROC.stdout.log" 2>&1 &
        echo $! > "$PIDFILE"
        echo "$OUT_WSL"
        echo "pid $(cat "$PIDFILE")"
        ;;
    stop)
        if [ ! -f "$PIDFILE" ]; then
            echo "no pidfile for $PROC (not started via this script, or already stopped)" >&2
            exit 1
        fi
        PID=$(cat "$PIDFILE")
        kill "$PID" 2>/dev/null || true
        rm -f "$PIDFILE"
        echo "stopped $PROC (pid $PID)"
        ;;
    status)
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "running (pid $(cat "$PIDFILE"))"
        else
            echo "not running"
        fi
        ;;
    *)
        echo "usage: logwatch.sh {start|stop|status} --proc NAME [--out PATH] [--hz N] [--max-seconds N]" >&2
        exit 1
        ;;
esac
