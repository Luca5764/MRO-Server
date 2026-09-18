#!/bin/bash
# Hardware USB HID Driver using Raspberry Pi Pico 2 W
#
# Usage:
#   tools/win/pico_drive.sh click 512,300
#   tools/win/pico_drive.sh key '{F5}'
#   tools/win/pico_drive.sh type 'hello world'
#   tools/win/pico_drive.sh press W 1500
#   tools/win/pico_drive.sh ping
#
# Unlike software drive.sh (SendInput), this sends genuine physical USB HID
# packets from the Pico 2 W hardware, bypassing XIGNCODE / DirectInput hooks completely.

set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CTL="$HERE/../pico/pico_ctl.py"

if [ $# -lt 1 ]; then
    echo "Usage: $0 (click X,Y | key KEYNAME | type TEXT | press KEY MS | ping)"
    exit 1
fi

ACTION="$1"
shift

case "$ACTION" in
    click)
        if [ $# -lt 1 ]; then
            python3 "$CTL" click left
        else
            python3 "$CTL" win_click "$1"
        fi
        ;;
    key)
        python3 "$CTL" key "$1"
        ;;
    type)
        python3 "$CTL" type "$*"
        ;;
    press|hold)
        python3 "$CTL" press "$1" "$2"
        ;;
    ping)
        python3 "$CTL" ping
        ;;
    *)
        python3 "$CTL" "$ACTION" "$@"
        ;;
esac

