#!/bin/bash
# Screenshot the game (or the whole desktop) into shots/ where it can be read.
#
#   tools/win/shot.sh              the MetalRage window
#   tools/win/shot.sh --full       every monitor
#   tools/win/shot.sh --name foo   name the file
set -e
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
WINTMP='C:\Users\su200\mro-shot.png'
WINTMP_WSL=/mnt/c/Users/su200/mro-shot.png
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SHOTS="$REPO/shots"
NAME="shot-$(date +%H%M%S)"
ARGS=(-Proc MetalRage)

while [ $# -gt 0 ]; do
    case "$1" in
        --full) ARGS=(-Full); shift ;;
        --name) NAME="$2"; shift 2 ;;
        *) echo "unknown option $1"; exit 1 ;;
    esac
done

mkdir -p "$SHOTS"
cp "$(dirname "${BASH_SOURCE[0]}")/screen.ps1" /mnt/c/Users/su200/mro-screen.ps1
OUT=$("$PS" -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\su200\mro-screen.ps1' \
        -Out "$WINTMP" "${ARGS[@]}" 2>&1 | tr -d '\r' | tail -1)

case "$OUT" in
    *"no window"*) echo "$OUT"; exit 1 ;;
esac

cp "$WINTMP_WSL" "$SHOTS/$NAME.png"
echo "$SHOTS/$NAME.png"
echo "$OUT"
