#!/bin/bash
# Tail a MetalRage client's -log= window text (WM_GETTEXT, see logwatch.ps1)
# into a jsonl file readable from WSL. Meant to be run long-lived in the
# background (e.g. `tools/win/logwatch.sh --proc MetalRage2 &`); it runs
# until one of logwatch.ps1's loud-failure conditions fires (non-zero exit)
# or -max-seconds elapses (exit 0), never silently.
#
#   tools/win/logwatch.sh --proc MetalRage2
#   tools/win/logwatch.sh --proc MetalRage2 --out /path/to/out.jsonl --hz 4
#   tools/win/logwatch.sh --proc MetalRage2 --max-seconds 60   # for tests
set -e
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/winuser.sh"
WINPROFILE_WSL=$(win_userprofile_wsl) || exit 1

PROC="MetalRage"
NAME=""
HZ=3
MAXSEC=0
OUT_WSL=""

while [ $# -gt 0 ]; do
    case "$1" in
        --proc) PROC="$2"; shift 2 ;;
        --out) OUT_WSL="$2"; shift 2 ;;
        --hz) HZ="$2"; shift 2 ;;
        --max-seconds) MAXSEC="$2"; shift 2 ;;
        *) echo "unknown option $1"; exit 1 ;;
    esac
done

if [ -z "$OUT_WSL" ]; then
    mkdir -p "$WINPROFILE_WSL/mro-logwatch"
    OUT_WSL="$WINPROFILE_WSL/mro-logwatch/$PROC-$(date +%Y%m%d-%H%M%S).jsonl"
fi
OUT_WIN=$(wslpath -w "$OUT_WSL")

cp "$HERE/logwatch.ps1" "$WINPROFILE_WSL/mro-logwatch.ps1"

echo "$OUT_WSL"
exec "$PS" -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$WINPROFILE_WSL/mro-logwatch.ps1")" \
    -Proc "$PROC" -Out "$OUT_WIN" -Hz "$HZ" -MaxSeconds "$MAXSEC"
