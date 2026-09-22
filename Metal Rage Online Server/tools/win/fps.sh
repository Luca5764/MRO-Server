#!/bin/bash
# PresentMon (Intel, ETW-based, no injection) wrapper: measure a Windows
# process's per-frame present timing from *outside* the process, instead of
# reading `stat fps`'s on-screen overlay off a screenshot by eye. See
# tools/win/README-presentmon.md for install location, exact version/sha256,
# permission requirements, and known limitations -- read it before using
# this on a real capture, especially the "access denied" failure mode.
#
# Same start/stop/status shape as tools/win/logwatch.sh, plus a `summary`
# subcommand that shells out to presentmon_summary.py (stdlib-only, runs in
# WSL against the CSV copied back from Windows).
#
#   tools/win/fps.sh start --proc MetalRage2
#   tools/win/fps.sh start --proc MetalRage2 --out /path/to/out.csv --max-seconds 300
#   tools/win/fps.sh status --proc MetalRage2
#   tools/win/fps.sh stop --proc MetalRage2
#   tools/win/fps.sh summary /path/to/out.csv
set -e
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/winuser.sh"
WINPROFILE_WSL=$(win_userprofile_wsl) || exit 1

# Pinned version -- do NOT silently re-download a newer build here. Bumping
# this is a deliberate action: download by hand, verify sha256 against the
# GitHub release asset digest, update both this script and
# README-presentmon.md's version/sha256 table in the same change.
PM_VERSION="2.6.0"
PM_EXE_NAME="PresentMon-$PM_VERSION-x64.exe"
PM_SHA256="b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af"
PM_DIR_WSL="$WINPROFILE_WSL/mro-presentmon"
PM_EXE_WSL="$PM_DIR_WSL/$PM_EXE_NAME"

WORKDIR_WSL="$WINPROFILE_WSL/mro-fps"
mkdir -p "$WORKDIR_WSL"

usage() {
    echo "usage: fps.sh {start|stop|status} --proc NAME [--out PATH] [--max-seconds N]" >&2
    echo "       fps.sh summary PATH" >&2
}

check_binary() {
    if [ ! -f "$PM_EXE_WSL" ]; then
        echo "PresentMon not found at $PM_EXE_WSL -- see tools/win/README-presentmon.md 的「安裝」一節" >&2
        exit 1
    fi
    local actual
    actual=$(sha256sum "$PM_EXE_WSL" | awk '{print $1}')
    if [ "$actual" != "$PM_SHA256" ]; then
        echo "sha256 mismatch for $PM_EXE_WSL" >&2
        echo "  got:      $actual" >&2
        echo "  expected: $PM_SHA256" >&2
        echo "(corrupted copy, or a different PresentMon version placed at this path?)" >&2
        exit 1
    fi
}

CMD="${1:-}"
shift || true

if [ "$CMD" = "summary" ]; then
    CSV_PATH="${1:-}"
    if [ -z "$CSV_PATH" ]; then
        usage
        exit 1
    fi
    exec python3 "$HERE/presentmon_summary.py" "$CSV_PATH"
fi

PROC=""
OUT_WSL=""
MAXSEC=0

while [ $# -gt 0 ]; do
    case "$1" in
        --proc) PROC="$2"; shift 2 ;;
        --out) OUT_WSL="$2"; shift 2 ;;
        --max-seconds) MAXSEC="$2"; shift 2 ;;
        *) echo "unknown option $1" >&2; usage; exit 1 ;;
    esac
done

if [ -z "$PROC" ]; then
    usage
    exit 1
fi

# PresentMon's own ETW trace session, named per target process so
# concurrent captures of different processes (e.g. a future host+joiner
# pair, backlog FPS-PRESENTMON completion condition 1) don't collide.
SESSION="mro-fps-$PROC"
PIDFILE="$WORKDIR_WSL/$PROC.pid"

case "$CMD" in
    start)
        check_binary
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "already running (pid $(cat "$PIDFILE"))" >&2
            exit 1
        fi
        if [ -z "$OUT_WSL" ]; then
            mkdir -p "$WORKDIR_WSL/out"
            OUT_WSL="$WORKDIR_WSL/out/$PROC-$(date +%Y%m%d-%H%M%S).csv"
        fi
        OUT_WIN=$(wslpath -w "$OUT_WSL")
        ARGS=(--process_name "$PROC" --output_file "$OUT_WIN" \
              --session_name "$SESSION" --stop_existing_session --no_console_stats)
        if [ "$MAXSEC" -gt 0 ] 2>/dev/null; then
            # Safety ceiling, not the primary stop mechanism -- `stop` below
            # normally ends the session first. This just guarantees the
            # process (and its ETW session) can't be left running forever
            # if `stop` is never called (e.g. the caller's shell dies).
            ARGS+=(--timed "$MAXSEC" --terminate_after_timed)
        fi
        nohup "$PM_EXE_WSL" "${ARGS[@]}" >"$WORKDIR_WSL/$PROC.stdout.log" 2>&1 &
        PM_PID=$!
        echo "$PM_PID" > "$PIDFILE"
        # PresentMon exits within ~1s (exit code 6) if it can't start the
        # trace session at all -- most commonly "access denied" (see
        # README-presentmon.md 權限一節). Catch that here instead of
        # reporting a pid that's already dead.
        sleep 1
        if ! kill -0 "$PM_PID" 2>/dev/null; then
            echo "PresentMon exited immediately -- check $WORKDIR_WSL/$PROC.stdout.log" >&2
            echo "(often 'access denied': see README-presentmon.md 權限一節 -- needs admin or 'Performance Log Users' group membership)" >&2
            rm -f "$PIDFILE"
            exit 1
        fi
        echo "$OUT_WSL"
        echo "pid $PM_PID"
        ;;
    stop)
        # Graceful stop: ask PresentMon (a second, short-lived invocation)
        # to terminate the running instance's named ETW session, instead of
        # killing the background process directly. WSL has no way to
        # deliver a console CTRL+C event to a Windows process it started
        # via direct-exec, and Ctrl+C is PresentMon's only other documented
        # clean-shutdown path (see main README's Windows 7 note) -- this
        # --terminate_existing_session round-trip is the only scriptable
        # graceful stop. 🟡 Its CSV-flush behavior on a real long capture
        # hasn't been verified (no elevated run has completed yet, see
        # README-presentmon.md); if the CSV looks truncated or corrupted at
        # the tail, that's the first thing to check.
        check_binary
        "$PM_EXE_WSL" --session_name "$SESSION" --terminate_existing_session >/dev/null 2>&1 || true
        sleep 1
        if [ -f "$PIDFILE" ]; then
            PID=$(cat "$PIDFILE")
            if kill -0 "$PID" 2>/dev/null; then
                kill "$PID" 2>/dev/null || true
            fi
            rm -f "$PIDFILE"
        fi
        echo "stopped $PROC (session $SESSION)"
        ;;
    status)
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "running (pid $(cat "$PIDFILE"))"
        else
            echo "not running"
        fi
        ;;
    *)
        usage
        exit 1
        ;;
esac
