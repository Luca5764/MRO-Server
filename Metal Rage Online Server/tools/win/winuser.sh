# winuser.sh - resolve the Windows user profile dir's WSL path.
#
# Sourced (not executed) by tools/win/shot.sh and tools/win/drive.sh, which
# both copy a helper .ps1 to the Windows user's profile before running it
# (powershell.exe can't reliably run a script from a \\wsl path). Fails
# closed: prints an error and returns non-zero instead of guessing a path.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/winuser.sh"
#   WINPROFILE_WSL=$(win_userprofile_wsl) || exit 1
win_userprofile_wsl() {
    local ps=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
    local profile
    profile=$("$ps" -NoProfile -Command '$env:USERPROFILE' 2>/dev/null | tr -d '\r')
    if [ -z "$profile" ]; then
        echo "unable to resolve Windows user profile (powershell \$env:USERPROFILE failed)" >&2
        return 1
    fi
    wslpath -u "$profile"
}
