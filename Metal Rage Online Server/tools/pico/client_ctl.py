#!/usr/bin/env python3
"""
client_ctl.py - Detect a dead/hung MetalRage client, save evidence, kill it, and
relaunch it, for unattended Pico runs (see docs/reference/unattended.md).

This is process-level bookkeeping only -- it never sends keyboard/mouse input, so
none of pico_serial.ps1's foreground/click gates apply here. It shares the open
Pico session file (.pico_session, see pico_ctl.py) and its log_action()/halt
machinery so a client restart shows up in the same actions.log + server tmux
marker trail as everything else an unattended run does.

Usage:
  ./client_ctl.py status
      Report whether MetalRage is running, has a window, and is responding.
      Exit codes: 0 = running+responding, 1 = running but not responding /
      no window, 2 = not running, 3 = the check itself failed.

  ./client_ctl.py evidence <label>
      Save a full-desktop screenshot + the last 200 lines of MetalRage.log into
      tools/pico/logs/crash-<timestamp>-<label>/. Always safe to run for real;
      never kills or restarts anything. Call this BEFORE any kill.

  ./client_ctl.py restart --step <step-label> --reason <text> [--dry-run]
      Requires an open, non-halted Pico session (see pico_ctl.py session start).
      Refuses (exit 3, session halted) if the STOP file is present, if this
      session already used its 3-restart budget, or if the previous restart in
      this session had the SAME step label (two consecutive crashes at the same
      step -- likely a loop, not worth retrying automatically).
      Otherwise: evidence(step) -> taskkill MetalRage.exe if present -> wait for
      exit -> launch via the .bat -> wait (<=90s) for a window. Does NOT log in;
      that is done later by Pico steps. Any failure along the way halts the
      session (fail closed).
      --dry-run runs every gate check and prints what it would do, without
      touching the real client or the session file.

Exit codes for restart: 0 = done (or dry-run says it would proceed), 3 = refused
by a gate (session/STOP/limit/same-step), 1 = a step failed during execution.
"""

import os
import re
import shutil
import subprocess
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import pico_ctl as pico  # reuses .pico_session state, log_action(), halt_session()

MRO_SERVER_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # ".../Metal Rage Online Server"
REPO_ROOT = os.path.dirname(MRO_SERVER_DIR)
SHOT_SH = os.path.join(MRO_SERVER_DIR, "tools", "win", "shot.sh")
SHOTS_DIR = os.path.join(REPO_ROOT, "shots")

CLIENT_CTL_PS1 = os.path.join(SCRIPT_DIR, "client_ctl.ps1")
WIN_CLIENT_CTL_PS1_LOCAL = "/mnt/c/Users/su200/mro-client-ctl.ps1"
WIN_CLIENT_CTL_PS1_PATH = "C:\\Users\\su200\\mro-client-ctl.ps1"

CLIENT_LOG_WSL = "/mnt/c/Games/MetalRage Online/data/Log/MetalRage.log"
STOP_FILE_WSL = "/mnt/c/Users/su200/mro-pico/STOP"  # same kill switch as pico_serial.ps1

RESTART_LIMIT = 3
WAIT_EXIT_MS = 15000
WAIT_READY_MS = 90000


# ---------------------------------------------------------------------------
# Windows-side process control via client_ctl.ps1 (mirrors pico_ctl.run_serial_commands's
# copy-to-Windows-path dance, since powershell.exe can't reliably run a \\wsl path).
# ---------------------------------------------------------------------------
def run_ps1(action, *args, timeout=15):
    if not os.path.exists(pico.PS_PATH):
        print("[ERR] powershell.exe not found; is this running under WSL with Windows accessible?")
        sys.exit(1)
    try:
        subprocess.run(["cp", CLIENT_CTL_PS1, WIN_CLIENT_CTL_PS1_LOCAL], check=True, capture_output=True)
    except Exception as ex:
        print(f"[ERR] unable to copy client_ctl.ps1 to Windows: {ex}")
        sys.exit(1)

    cmd = [pico.PS_PATH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
           WIN_CLIENT_CTL_PS1_PATH, action] + [str(a) for a in args]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, -1

    for line in res.stderr.splitlines():
        if line.strip():
            print(f"[client_ctl.ps1] {line.strip()}")
    out = res.stdout.strip()
    return (out if out else None), res.returncode


def get_status():
    out, rc = run_ps1("status", timeout=15)
    if out is None:
        return {"state": "error", "detail": "powershell.exe timed out or gave no output"}
    if out.startswith("NOT_RUNNING"):
        return {"state": "not_running"}
    m = re.match(r'^RUNNING pid=(\d+) hwnd=(\S+) responding=(\S+) rect=(\S+)$', out)
    if not m:
        return {"state": "error", "detail": f"unparsed status output: {out!r}"}
    pid, hwnd, responding, rect = m.groups()
    hwnd_nonzero = hwnd not in ("0", "0x0", "")
    responding_bool = responding.strip().lower() == "true"
    state = "ok" if (hwnd_nonzero and responding_bool) else "not_responding"
    return {"state": state, "pid": pid, "hwnd": hwnd, "responding": responding_bool, "rect": rect}


def cmd_status():
    st = get_status()
    if st["state"] == "ok":
        print(f"[OK] running pid={st['pid']} hwnd={st['hwnd']} responding=True rect={st['rect']}")
        sys.exit(0)
    elif st["state"] == "not_responding":
        print(f"[WARN] not responding pid={st.get('pid')} hwnd={st.get('hwnd')} "
              f"responding={st.get('responding')} rect={st.get('rect')}")
        sys.exit(1)
    elif st["state"] == "not_running":
        print("[NOT_RUNNING] MetalRage process not found")
        sys.exit(2)
    else:
        print(f"[ERR] {st.get('detail')}")
        sys.exit(3)


# ---------------------------------------------------------------------------
# Evidence: full-desktop screenshot (client may have no window / a crash dialog,
# so --full rather than -Proc MetalRage) + tail of the client log. Must be called
# before any kill so the crash state is captured, not the freshly-launched one.
# ---------------------------------------------------------------------------
def evidence(label):
    ts = time.strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(pico.LOG_DIR, f"crash-{ts}-{label}")
    os.makedirs(dest, exist_ok=True)

    shot_name = f"evidence-{ts}-{label}"
    shot_ok = False
    shot_detail = ""
    try:
        res = subprocess.run(["bash", SHOT_SH, "--full", "--name", shot_name],
                              capture_output=True, text=True, timeout=30)
        shot_detail = (res.stdout + res.stderr).strip()
        shot_ok = res.returncode == 0
    except Exception as ex:
        shot_detail = f"shot.sh failed to run: {ex}"

    src_png = os.path.join(SHOTS_DIR, shot_name + ".png")
    if shot_ok and os.path.exists(src_png):
        shutil.copy(src_png, os.path.join(dest, "screenshot.png"))
    else:
        shot_ok = False
        with open(os.path.join(dest, "screenshot-FAILED.txt"), "w", encoding="utf-8") as f:
            f.write(shot_detail + "\n")

    log_ok = False
    tail = []
    try:
        with open(CLIENT_LOG_WSL, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        tail = lines[-200:]
        log_ok = True
    except Exception as ex:
        tail = [f"(failed to read {CLIENT_LOG_WSL}: {ex})\n"]
    with open(os.path.join(dest, "log-tail.txt"), "w", encoding="utf-8") as f:
        f.writelines(tail)

    result = f"dir={dest} shot={'ok' if shot_ok else 'FAILED'} log_tail={'ok' if log_ok else 'FAILED'}"
    pico.log_action(f"evidence {label}", result)
    print(f"[EVIDENCE] {dest}")
    print(f"  screenshot: {'ok' if shot_ok else 'FAILED (' + shot_detail + ')'}")
    print(f"  log tail: {'ok (' + str(len(tail)) + ' lines)' if log_ok else 'FAILED'}")
    return dest


# ---------------------------------------------------------------------------
# restart: gates first (session / STOP / restart limit / same-step-twice), then
# evidence -> kill -> wait -> launch -> wait. Any gate refusal or step failure
# halts the session -- fail closed, no automatic retries beyond what's below.
# ---------------------------------------------------------------------------
def _refuse(reason, step, halt):
    print(f"[BLOCKED] {reason}")
    pico.log_action(f"restart {step}", f"BLOCKED: {reason}")
    if halt:
        pico.halt_session(reason)
    sys.exit(3)


def _fail(reason, step):
    print(f"[FAIL] {reason}")
    pico.log_action(f"restart {step}", f"FAIL: {reason}")
    pico.halt_session(reason)
    sys.exit(1)


def cmd_restart(step, reason, dry_run):
    state = pico._load_session()
    if state is None:
        _refuse("no session open (run: pico_ctl.py session start \"<purpose>\")", step, halt=False)
    if state.get("halted"):
        _refuse(f"session halted: {state.get('halt_reason')}", step, halt=False)
    if os.path.exists(STOP_FILE_WSL):
        _refuse(f"STOP file present ({STOP_FILE_WSL})", step, halt=True)

    count = state.get("client_restart_count", 0)
    if count >= RESTART_LIMIT:
        _refuse(f"restart limit ({RESTART_LIMIT}) reached this session", step, halt=True)

    last_step = state.get("client_last_restart_step")
    if last_step is not None and last_step == step:
        _refuse(f"two consecutive crashes at the same step '{step}' -- likely a loop", step, halt=True)

    if dry_run:
        print(f"[DRY-RUN] restart would proceed: step={step!r} reason={reason!r} "
              f"count_before={count}/{RESTART_LIMIT}")
        print(f"  1. evidence('restart-{step}')")
        print(f"  2. taskkill /IM MetalRage.exe /F if present, wait up to {WAIT_EXIT_MS}ms for exit")
        print(f"  3. launch via the .bat, wait up to {WAIT_READY_MS}ms for a window")
        print(f"  4. session state -> client_restart_count={count + 1}, client_last_restart_step={step!r}")
        sys.exit(0)

    ev_dir = evidence(f"restart-{step}")

    out, rc = run_ps1("kill", timeout=15)
    if out is None:
        _fail("kill: powershell.exe timed out or gave no output", step)
    if out not in ("KILL_SENT", "NOT_RUNNING"):
        _fail(f"kill: unexpected reply {out!r}", step)

    out, rc = run_ps1("wait_exit", WAIT_EXIT_MS, timeout=(WAIT_EXIT_MS / 1000.0) + 10)
    if out != "EXITED":
        _fail(f"wait_exit: {out!r}", step)

    out, rc = run_ps1("launch", timeout=15)
    if out != "LAUNCH_SENT":
        _fail(f"launch: unexpected reply {out!r}", step)

    out, rc = run_ps1("wait_ready", WAIT_READY_MS, timeout=(WAIT_READY_MS / 1000.0) + 10)
    if not (out or "").startswith("READY"):
        _fail(f"wait_ready: {out!r}", step)

    state["client_restart_count"] = count + 1
    state["client_last_restart_step"] = step
    pico._save_session(state)

    result = f"OK step={step} reason={reason!r} count={count + 1}/{RESTART_LIMIT} evidence={ev_dir} {out}"
    pico.log_action(f"restart {step}", result)
    print(f"[OK] {result}")
    sys.exit(0)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1].lower()

    if action == "status":
        cmd_status()
        return

    if action == "evidence":
        if len(sys.argv) < 3:
            print("Usage: ./client_ctl.py evidence <label>")
            sys.exit(1)
        evidence(sys.argv[2])
        return

    if action == "restart":
        step = None
        reason = None
        dry_run = False
        args = sys.argv[2:]
        i = 0
        while i < len(args):
            if args[i] == "--step" and i + 1 < len(args):
                step = args[i + 1]
                i += 2
            elif args[i] == "--reason" and i + 1 < len(args):
                reason = args[i + 1]
                i += 2
            elif args[i] == "--dry-run":
                dry_run = True
                i += 1
            else:
                print(f"[ERR] unknown arg: {args[i]}")
                sys.exit(1)
        if not step or not reason:
            print("Usage: ./client_ctl.py restart --step <step-label> --reason <text> [--dry-run]")
            sys.exit(1)
        cmd_restart(step, reason, dry_run)
        return

    print(f"[ERR] Unknown action '{action}'. See --help.")
    sys.exit(1)


if __name__ == "__main__":
    main()
