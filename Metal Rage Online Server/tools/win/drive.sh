#!/bin/bash
# Click, press keys, or type into the game window.
#
#   tools/win/drive.sh click 512,300
#   tools/win/drive.sh key '{F5}'
#   tools/win/drive.sh type 'entering the training ground'
#
# Takes the foreground and moves the pointer — do not run while the machine is
# in use. Pair it with tools/win/shot.sh to see the result.
set -e
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/winuser.sh"
WINPROFILE_WSL=$(win_userprofile_wsl) || exit 1
[ $# -ge 2 ] || { sed -n '2,9p' "$0"; exit 1; }

cp "$HERE/input.ps1" "$WINPROFILE_WSL/mro-input.ps1"
case "$1" in
    click) FLAG=-Click ;;
    key)   FLAG=-Key ;;
    type)  FLAG=-Type ;;
    *) echo "unknown action '$1' (click | key | type)"; exit 1 ;;
esac
"$PS" -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$WINPROFILE_WSL/mro-input.ps1")" \
      -Proc MetalRage "$FLAG" "$2" 2>&1 | tr -d '\r'
