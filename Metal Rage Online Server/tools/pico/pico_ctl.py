#!/usr/bin/env python3
"""
pico_ctl.py - Host CLI and Controller for Raspberry Pi Pico 2 W Hardware HID

Transport defaults to USB serial (PICO_TRANSPORT=serial). Set PICO_TRANSPORT=http
to use the WiFi REST API instead (requires set_ip first).

Usage:
  ./pico_ctl.py ping                        # Test connection and latency (no session needed)
  ./pico_ctl.py session start "why"         # Open an unattended-run session (required below)
  ./pico_ctl.py session end                 # Close it
  ./pico_ctl.py session set-proc MetalRage2 # Dual-client: change which process the foreground
                                             #   gate accepts (see actions.py's focus_client(),
                                             #   docs/research/2026-09-20-dual-pico/design.md I6).
                                             #   Requires an open session. Single-client scripts
                                             #   never call this -- the gate stays "MetalRage".
  ./pico_ctl.py session get-proc            # Read-only: print the current active_proc, or "(none)"
  ./pico_ctl.py key F5                      # Press F5 (Ready / Start)
  ./pico_ctl.py key ENTER                   # Press Enter (Login)
  ./pico_ctl.py press W 1500                # Hold W for 1.5 seconds (walk)
  ./pico_ctl.py click [left|right]          # Click mouse button at current cursor position
  ./pico_ctl.py click_at 512,300 [left]     # Closed-loop click, window-client-relative coords
  ./pico_ctl.py win_click 512,300           # Alias of click_at (kept for pico_drive.sh)
  ./pico_ctl.py move 100 50                 # Relative mouse move
  ./pico_ctl.py type "Hello World"          # Type text via keyboard (printable ASCII only)
  ./pico_ctl.py batch "PING" "KEY F5"       # Send several raw commands in one call
  ./pico_ctl.py set_port COM6               # Save serial port (else auto-detected)
  ./pico_ctl.py set_ip 192.168.0.50         # Save Pico's WiFi IP (http transport only)

Unattended safety: everything except ping/set_ip/set_port/session/raw-PING/raw-RESET
requires an open session (see `session start`), and is gated by pico_serial.ps1
(foreground window must be MetalRage on the primary monitor, click targets must be
inside the game window, kill switch file, ASCII-only TYPE). Any BLOCKED result halts
the open session, so later commands keep refusing until `session end` + a new
`session start`. See README.md's 「無人值守護欄」 section.

Env vars:
  PICO_TRANSPORT   serial (default) or http
  PICO_PORT        Windows COM port for serial transport (else auto-detected /
                    cached in .pico_port)
  PICO_IP          Pico WiFi IP for http transport (else cached in .pico_ip)
"""

import json
import os
import re
import sys
import time
import subprocess
import urllib.request
import urllib.error
import urllib.parse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IP_CACHE_FILE = os.path.join(SCRIPT_DIR, ".pico_ip")
PORT_CACHE_FILE = os.path.join(SCRIPT_DIR, ".pico_port")
SESSION_FILE = os.path.join(SCRIPT_DIR, ".pico_session")
LOG_DIR = os.path.join(SCRIPT_DIR, "logs")
ACTIONS_LOG = os.path.join(LOG_DIR, "actions.log")
PS_PATH = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
PICO_SERIAL_PS1 = os.path.join(SCRIPT_DIR, "pico_serial.ps1")
TMUX_SERVER_SESSION = "server"

_WIN_USER_PROFILE = None  # cache for win_user_profile(), one powershell.exe call per process


def win_user_profile():
    """Resolve the Windows user profile dir (e.g. "C:\\Users\\alice") via
    powershell.exe's $env:USERPROFILE, cached for the life of this process. Needed
    because scripts get copied under the Windows user's profile before running
    (powershell.exe can't reliably run a script from a \\wsl path) -- see
    run_serial_commands() and client_ctl.py's run_ps1(). Fails closed: exits
    rather than guessing a path if the lookup doesn't work.
    """
    global _WIN_USER_PROFILE
    if _WIN_USER_PROFILE is not None:
        return _WIN_USER_PROFILE
    try:
        res = subprocess.run(
            [PS_PATH, "-NoProfile", "-Command", "$env:USERPROFILE"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15,
        )
        profile = res.stdout.strip()
    except Exception as ex:
        print(f"[ERR] Unable to resolve Windows user profile via powershell.exe: {ex}")
        sys.exit(1)
    if res.returncode != 0 or not profile:
        print("[ERR] Unable to resolve Windows user profile ($env:USERPROFILE gave no output)")
        sys.exit(1)
    _WIN_USER_PROFILE = profile
    return _WIN_USER_PROFILE


def win_user_profile_wsl():
    """win_user_profile(), converted to its /mnt/c/... WSL path via wslpath -u."""
    try:
        res = subprocess.run(["wslpath", "-u", win_user_profile()],
                              capture_output=True, text=True, timeout=10)
        wsl_path = res.stdout.strip()
    except Exception as ex:
        print(f"[ERR] Unable to convert Windows user profile path via wslpath: {ex}")
        sys.exit(1)
    if res.returncode != 0 or not wsl_path:
        print("[ERR] wslpath -u could not convert the Windows user profile path")
        sys.exit(1)
    return wsl_path


class PicoBlocked(Exception):
    """Raised when pico_serial.ps1 reports a [BLOCKED] gate result for a command."""
    pass


# ---------------------------------------------------------------------------
# Audit trail: every input command sent or blocked gets a timestamped line in
# logs/actions.log (gitignored) and, best-effort, a marker in the game server's
# tmux console (session "server"), so a session log line records what an
# unattended run actually did. Marker text is prefixed "pico: " so it can never
# start with "/" (which the server console treats as a command).
# ---------------------------------------------------------------------------
def log_action(cmd_label, result):
    os.makedirs(LOG_DIR, exist_ok=True)
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"{ts}\t{cmd_label}\t-> {result}\n"
    try:
        with open(ACTIONS_LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as ex:
        print(f"[WARN] Unable to write {ACTIONS_LOG}: {ex}")
    write_server_marker(f"pico: {cmd_label} -> {result}")


def write_server_marker(text):
    text = text.replace("\n", " ").replace("\r", " ")
    if text.startswith("/"):
        text = " " + text  # markers must never look like a console command
    try:
        chk = subprocess.run(["tmux", "has-session", "-t", TMUX_SERVER_SESSION],
                              capture_output=True)
        if chk.returncode != 0:
            return  # no "server" tmux session running; skip silently
        subprocess.run(["tmux", "send-keys", "-t", TMUX_SERVER_SESSION, "-l", text],
                        check=True, capture_output=True)
        subprocess.run(["tmux", "send-keys", "-t", TMUX_SERVER_SESSION, "Enter"],
                        check=True, capture_output=True)
    except FileNotFoundError:
        pass  # tmux not on PATH
    except Exception as ex:
        print(f"[WARN] Unable to write server marker: {ex}")


# ---------------------------------------------------------------------------
# Session gate: input commands refuse to run unless a session is open. Any
# BLOCKED result (from pico_serial.ps1's gates, or a local pre-flight check
# like the ASCII gate) flips the session to "halted" so later commands keep
# refusing until an explicit `session end` + a new `session start` -- this is
# deliberately not auto-recoverable.
# ---------------------------------------------------------------------------
def _load_session():
    if not os.path.exists(SESSION_FILE):
        return None
    try:
        with open(SESSION_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _save_session(state):
    with open(SESSION_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f)


def session_start(purpose):
    if _load_session() is not None:
        print(f"[ERR] a session is already open ({SESSION_FILE}). Run 'session end' first.")
        sys.exit(1)
    state = {
        "purpose": purpose,
        "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "halted": False,
        "halt_reason": None,
        # Used by client_ctl.py's `restart` to enforce a per-session restart
        # budget and detect two consecutive crashes at the same step.
        "client_restart_count": 0,
        "client_last_restart_step": None,
    }
    _save_session(state)
    print(f"[PICO] session started: {purpose}")
    log_action("session start", purpose)


def session_end():
    state = _load_session()
    purpose = state.get("purpose", "") if state else ""
    restarts = state.get("client_restart_count", 0) if state else 0
    if os.path.exists(SESSION_FILE):
        os.remove(SESSION_FILE)
    print(f"[PICO] session ended: {purpose} (client restarts this session: {restarts})")
    log_action("session end", f"{purpose} (client restarts: {restarts})")


def session_set_proc(proc_name):
    """Sets 'active_proc' in the open session's state file -- the ONE thing
    dual-client automation (docs/research/2026-09-20-dual-pico/design.md I6)
    needs from this module: pico_serial.ps1's foreground gate must be told
    which process is currently the intended target BEFORE any input is
    sent, via -AllowedProc (see _serial_cmd_extra_args() below). Requires an
    open, non-halted session -- same require_session() gate as every other
    input-adjacent pico_ctl.py command -- since this changes what the gate
    will accept for every subsequent command in this session. Called by
    actions.py's focus_client(), never by a single-client script (none of
    which know this subcommand exists)."""
    require_session(f"session set-proc {proc_name}")
    state = _load_session()
    state["active_proc"] = proc_name
    _save_session(state)
    print(f"[PICO] active_proc set to {proc_name!r}")
    log_action(f"session set-proc {proc_name}", "ok")


def session_get_proc():
    """Read-only: prints the open session's current active_proc (or
    '(none)' if there is no open session / it was never set). No session
    gate -- purely informational, used for manual inspection/offline
    testing, never by any action."""
    state = _load_session()
    proc_name = state.get("active_proc") if state else None
    print(proc_name if proc_name else "(none)")


def _serial_cmd_extra_args():
    """Returns ['-AllowedProc', <name>] if the open session has an
    active_proc set (session_set_proc() above, i.e. actions.py's
    focus_client() ran at least once in this session), else [] -- so
    pico_serial.ps1 falls back to its own hardcoded default ("MetalRage")
    exactly as it did before this task whenever no dual-client focus switch
    has happened (every existing single-client script's session never sets
    active_proc, so this always returns [] for them -- see
    run_serial_commands())."""
    state = _load_session()
    active_proc = state.get("active_proc") if state else None
    return ["-AllowedProc", active_proc] if active_proc else []


def halt_session(reason):
    state = _load_session()
    if state is not None and not state.get("halted"):
        state["halted"] = True
        state["halt_reason"] = reason
        state["halted_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        _save_session(state)


def require_session(cmd_label):
    """Exit 3 (after logging + marking) if no session is open, or the open
    session was halted by an earlier BLOCKED result."""
    state = _load_session()
    if state is None:
        reason = "no session open (run: pico_ctl.py session start \"<purpose>\")"
        print(f"[BLOCKED] {reason}")
        log_action(cmd_label, f"BLOCKED: {reason}")
        sys.exit(3)
    if state.get("halted"):
        reason = f"session halted: {state.get('halt_reason')} (run: session end, then session start again)"
        print(f"[BLOCKED] {reason}")
        log_action(cmd_label, f"BLOCKED: {reason}")
        sys.exit(3)


def run_guarded(cmd_label, fn):
    """Runs fn() (expected to return (resp, ms) from send_cmd/send_serial_cmd).
    On PicoBlocked, prints/logs/halts the session and exits 3."""
    try:
        return fn()
    except PicoBlocked as e:
        reason = str(e)
        print(f"[BLOCKED] {reason}")
        log_action(cmd_label, f"BLOCKED: {reason}")
        halt_session(reason)
        sys.exit(3)

def get_pico_ip():
    # 1. Environment variable
    env_ip = os.environ.get("PICO_IP")
    if env_ip:
        return env_ip.strip()
    # 2. Cached file
    if os.path.exists(IP_CACHE_FILE):
        try:
            with open(IP_CACHE_FILE, "r", encoding="utf-8") as f:
                ip = f.read().strip()
                if ip:
                    return ip
        except Exception:
            pass
    return None

def set_pico_ip(ip):
    with open(IP_CACHE_FILE, "w", encoding="utf-8") as f:
        f.write(ip.strip() + "\n")
    print(f"[PICO] Saved IP address '{ip.strip()}' to {IP_CACHE_FILE}")

def get_pico_port():
    # 1. Environment variable
    env_port = os.environ.get("PICO_PORT")
    if env_port:
        return env_port.strip()
    # 2. Cached file
    if os.path.exists(PORT_CACHE_FILE):
        try:
            with open(PORT_CACHE_FILE, "r", encoding="utf-8") as f:
                p = f.read().strip()
                if p:
                    return p
        except Exception:
            pass
    # 3. None -> pico_serial.ps1 auto-detects by PNPDeviceID
    return None

def set_pico_port(port):
    with open(PORT_CACHE_FILE, "w", encoding="utf-8") as f:
        f.write(port.strip() + "\n")
    print(f"[PICO] Saved serial port '{port.strip()}' to {PORT_CACHE_FILE}")

def get_transport():
    return os.environ.get("PICO_TRANSPORT", "serial").strip().lower()

def run_serial_commands(commands, port=None, timeout=30.0):
    """
    Send one or more raw firmware command lines over USB serial in a single
    powershell.exe invocation (see pico_serial.ps1). Returns (replies, elapsed_ms)
    where replies[i] is the raw "[code] msg" reply line for commands[i], or
    "[ERR-TIMEOUT] <cmd>" if that command didn't get a reply in time.
    """
    if not os.path.exists(PS_PATH):
        print("[ERR] powershell.exe not found; is this running under WSL with Windows accessible?")
        sys.exit(1)

    win_local = os.path.join(win_user_profile_wsl(), "mro-pico-serial.ps1")
    win_path = win_user_profile() + "\\mro-pico-serial.ps1"
    try:
        subprocess.run(["cp", PICO_SERIAL_PS1, win_local], check=True, capture_output=True)
    except Exception as ex:
        print(f"[ERR] Unable to copy pico_serial.ps1 to Windows: {ex}")
        sys.exit(1)

    cmd = [PS_PATH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", win_path]
    pico_port = port or get_pico_port()
    if pico_port:
        cmd += ["-Port", pico_port]
    cmd += _serial_cmd_extra_args()
    cmd += list(commands)

    t0 = time.monotonic()
    try:
        # PowerShell error streams (Write-Error) come out in the console's active
        # codepage, not necessarily UTF-8 (e.g. cp950 on a Traditional Chinese
        # Windows install); don't let that crash the whole command.
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        print(f"[ERR] pico_serial.ps1 timed out after {timeout}s")
        sys.exit(1)
    elapsed_ms = (time.monotonic() - t0) * 1000

    for line in res.stderr.splitlines():
        if line.strip():
            print(f"[pico_serial] {line.strip()}")

    replies = [l.strip() for l in res.stdout.splitlines() if l.strip()]
    if res.returncode not in (0, 1, 3):
        # 1 = at least one command timed out (still has partial replies).
        # 3 = a gate BLOCKED a command (also has partial replies, incl. the
        #     "[BLOCKED] ..." line) -- let the caller inspect those, don't treat
        #     as a hard script failure.
        # Anything else means the script itself failed (bad port, couldn't open).
        print(f"[ERR] pico_serial.ps1 exited {res.returncode}: {replies if replies else '(no output)'}")
        sys.exit(1)
    if len(replies) != len(commands) and res.returncode != 3:
        # A BLOCKED command stops the batch early by design, so a short reply
        # list there is expected, not a warning-worthy mismatch.
        print(f"[WARN] Expected {len(commands)} replies from Pico, got {len(replies)}: {replies}")

    return replies, elapsed_ms

def send_serial_cmd(cmd_str, timeout=30.0):
    replies, elapsed_ms = run_serial_commands([cmd_str], timeout=timeout)
    if not replies:
        print("[ERR] No reply from Pico over serial.")
        sys.exit(1)
    reply = replies[0]
    if reply.startswith("[BLOCKED]"):
        raise PicoBlocked(reply[len("[BLOCKED]"):].strip())
    if reply.startswith("[ERR-TIMEOUT]"):
        print(f"[ERR] Serial command timed out waiting for reply: {cmd_str}")
        sys.exit(1)
    m = re.match(r'^\[(\d+)\]\s?(.*)$', reply)
    if m:
        return m.group(2), elapsed_ms
    return reply, elapsed_ms

def send_cmd(cmd_str, ip=None, port=8080, timeout=3.0):
    """Dispatch a raw firmware command over the configured transport (PICO_TRANSPORT)."""
    transport = get_transport()
    if transport == "http":
        return send_http_cmd(cmd_str, ip=ip, port=port, timeout=timeout)
    elif transport == "serial":
        return send_serial_cmd(cmd_str)
    else:
        print(f"[ERR] Unknown PICO_TRANSPORT '{transport}' (expected 'serial' or 'http')")
        sys.exit(1)

def send_http_cmd(cmd_str, ip=None, port=8080, timeout=3.0):
    # The foreground/click/ASCII/STOP gates live in pico_serial.ps1, which HTTP never
    # passes through, so HTTP may only carry the non-input commands.
    if cmd_str.strip().split()[:1] not in (["PING"], ["RESET"]):
        print(f"[BLOCKED] http transport carries only PING/RESET (no safety gates) {cmd_str.strip()}")
        sys.exit(3)
    pico_ip = ip or get_pico_ip()
    if not pico_ip:
        print("[ERR] Pico IP not set. Run './pico_ctl.py set_ip <IP>' or set PICO_IP environment variable.")
        sys.exit(1)

    url = f"http://{pico_ip}:{port}/"
    data = cmd_str.encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "text/plain"}, method="POST")

    try:
        t0 = time.monotonic()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed_ms = (time.monotonic() - t0) * 1000
            res_text = resp.read().decode('utf-8', 'ignore')
            return res_text.strip(), elapsed_ms
    except urllib.error.URLError as e:
        print(f"[ERR] Failed to connect to Pico at {url}: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERR] Unexpected error communicating with Pico: {e}")
        sys.exit(1)

def do_click_at(rel_arg, button="left"):
    """Window-client-area-relative click, resolved and closed-loop-verified inside
    pico_serial.ps1 (CLICK_AT pseudo-command) -- see that script's guardrail
    docs. Replaces the old win_click, which used to MOVE_TO + CLICK blind from
    two separate powershell.exe processes with no target verification."""
    coords = rel_arg.replace("(", "").replace(")", "").split(",")
    if len(coords) != 2:
        print("Usage: click_at <REL_X,REL_Y> [button]")
        sys.exit(1)
    rx, ry = int(coords[0]), int(coords[1])
    cmd_str = f"CLICK_AT {rx} {ry} {button}"
    resp, ms = run_guarded(cmd_str, lambda: send_cmd(cmd_str))
    log_action(cmd_str, resp)
    print(f"[OK] {resp} ({ms:.1f}ms)")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1].lower()

    if action == "set_ip":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py set_ip <IP_ADDRESS>")
            sys.exit(1)
        set_pico_ip(sys.argv[2])
        return

    if action == "set_port":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py set_port <COM_PORT>  (e.g. COM6)")
            sys.exit(1)
        set_pico_port(sys.argv[2])
        return

    if action == "session":
        if len(sys.argv) < 3:
            print('Usage: ./pico_ctl.py session (start "<purpose>" | end | set-proc <NAME> | get-proc)')
            sys.exit(1)
        sub = sys.argv[2].lower()
        if sub == "start":
            purpose = " ".join(sys.argv[3:]) if len(sys.argv) > 3 else "(no purpose given)"
            session_start(purpose)
        elif sub == "end":
            session_end()
        elif sub == "set-proc":
            if len(sys.argv) < 4:
                print("Usage: ./pico_ctl.py session set-proc <PROC_NAME>")
                sys.exit(1)
            session_set_proc(sys.argv[3])
        elif sub == "get-proc":
            session_get_proc()
        else:
            print('Usage: ./pico_ctl.py session (start "<purpose>" | end | set-proc <NAME> | get-proc)')
            sys.exit(1)
        return

    if action == "batch":
        if len(sys.argv) < 3:
            print('Usage: ./pico_ctl.py batch "CMD1" "CMD2" ...')
            sys.exit(1)
        commands = sys.argv[2:]
        require_session("batch " + " | ".join(commands))
        transport = get_transport()
        if transport == "serial":
            replies, elapsed_ms = run_serial_commands(commands)
            blocked_reason = None
            for c, r in zip(commands, replies):
                print(f"{c} -> {r}")
                if r.startswith("[BLOCKED]"):
                    blocked_reason = r[len("[BLOCKED]"):].strip()
                    log_action(c, f"BLOCKED: {blocked_reason}")
                else:
                    log_action(c, r)
            print(f"[BATCH] {len(replies)}/{len(commands)} commands acknowledged via serial in {elapsed_ms:.1f}ms")
            if blocked_reason:
                halt_session(blocked_reason)
                sys.exit(3)
            if any(r.startswith("[ERR-TIMEOUT]") for r in replies):
                sys.exit(1)
        else:
            # HTTP/WiFi transport is not routed through pico_serial.ps1, so none
            # of the foreground/click/ASCII gates apply to it -- see README.
            for c in commands:
                resp, ms = send_http_cmd(c)
                log_action(c, resp)
                print(f"{c} -> [{resp}] ({ms:.1f}ms)")
        return

    if action == "ping":
        resp, ms = send_cmd("PING")
        print(f"[PICO PONG] {resp} ({ms:.1f}ms roundtrip)")
        return

    if action == "key":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py key <KEY_NAME>")
            sys.exit(1)
        key_name = sys.argv[2]
        require_session(f"KEY {key_name}")
        resp, ms = run_guarded(f"KEY {key_name}", lambda: send_cmd(f"KEY {key_name}"))
        log_action(f"KEY {key_name}", resp)
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "press" or action == "hold":
        if len(sys.argv) < 4:
            print("Usage: ./pico_ctl.py press <KEY_NAME> <MS>")
            sys.exit(1)
        key_name = sys.argv[2]
        duration_ms = sys.argv[3]
        cmd_str = f"PRESS {key_name} {duration_ms}"
        require_session(cmd_str)
        resp, ms = run_guarded(cmd_str, lambda: send_cmd(cmd_str))
        log_action(cmd_str, resp)
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "click":
        btn = sys.argv[2] if len(sys.argv) > 2 else "left"
        cmd_str = f"CLICK {btn}"
        require_session(cmd_str)
        resp, ms = run_guarded(cmd_str, lambda: send_cmd(cmd_str))
        log_action(cmd_str, resp)
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "move":
        if len(sys.argv) < 4:
            print("Usage: ./pico_ctl.py move <DX> <DY>")
            sys.exit(1)
        dx, dy = sys.argv[2], sys.argv[3]
        cmd_str = f"MOVE {dx} {dy}"
        require_session(cmd_str)
        resp, ms = run_guarded(cmd_str, lambda: send_cmd(cmd_str))
        log_action(cmd_str, resp)
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "move_to":
        if len(sys.argv) < 4:
            print("Usage: ./pico_ctl.py move_to <X> <Y>")
            sys.exit(1)
        x, y = sys.argv[2], sys.argv[3]
        cmd_str = f"MOVE_TO {x} {y}"
        require_session(cmd_str)
        resp, ms = run_guarded(cmd_str, lambda: send_cmd(cmd_str))
        log_action(cmd_str, resp)
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action in ("win_click", "click_at"):
        if len(sys.argv) < 3:
            print(f"Usage: ./pico_ctl.py {action} <REL_X,REL_Y> [button]")
            sys.exit(1)
        btn = sys.argv[3] if len(sys.argv) > 3 else "left"
        require_session(f"{action} {sys.argv[2]} {btn}")
        do_click_at(sys.argv[2], btn)
        return

    if action == "type":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py type <TEXT>")
            sys.exit(1)
        text = " ".join(sys.argv[2:])
        cmd_str = f"TYPE {text}"
        require_session(cmd_str)
        if not all(0x20 <= ord(c) <= 0x7E for c in text):
            reason = "TYPE text must be printable ASCII (IME would mangle anything else)"
            print(f"[BLOCKED] {reason}")
            log_action(cmd_str, f"BLOCKED: {reason}")
            halt_session(reason)
            sys.exit(3)
        resp, ms = run_guarded(cmd_str, lambda: send_cmd(cmd_str))
        log_action(f"TYPE len={len(text)}", resp)
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "raw":
        raw_cmd = " ".join(sys.argv[2:])
        verb = raw_cmd.strip().split()[0].upper() if raw_cmd.strip() else ""
        if verb not in ("PING", "RESET"):
            require_session(f"raw {raw_cmd}")
        resp, ms = run_guarded(raw_cmd, lambda: send_cmd(raw_cmd))
        if verb not in ("PING",):
            log_action(raw_cmd, resp)
        print(f"[{resp}] ({ms:.1f}ms)")
        return

    print(f"[ERR] Unknown action '{action}'. See --help.")
    sys.exit(1)

if __name__ == "__main__":
    main()

