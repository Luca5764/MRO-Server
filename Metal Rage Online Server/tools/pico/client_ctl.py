#!/usr/bin/env python3
"""
client_ctl.py - Detect a dead/hung MetalRage client, save evidence, close/kill it,
and relaunch it, for unattended Pico runs (see docs/reference/unattended.md).

Almost everything here is process-level bookkeeping (status/evidence/launch/wait),
sending no keyboard/mouse input, so none of pico_serial.ps1's foreground/click gates
apply to it. The ONE exception is close_window()/close_client(): taskkill and
Stop-Process are both denied on this client (it runs elevated via manifest
requireAdministrator; a WSL/unelevated caller cannot signal it -- 2026-09-19 [TEST],
see docs/journal/2026-09-19-2230-unattended-trial-01.md's 「當掉重開的實測」), so the
only way left to close a still-responding window is a real Pico click on its
title-bar close (X) glyph. That click is sent via `pico_ctl.py raw CLOSE_WINDOW`
(pico_serial.ps1's CLOSE_WINDOW pseudo-command) and IS gated exactly like any other
input command (foreground must be the real game window, STOP file, session must be
open) -- see close_window()'s docstring. It shares the open Pico session file
(.pico_session, see pico_ctl.py) and its log_action()/halt machinery so a client
close/restart/relaunch shows up in the same actions.log + server tmux marker trail
as everything else an unattended run does.

Usage:
  ./client_ctl.py status
      Report whether MetalRage is running, has a window, and is responding.
      Exit codes: 0 = running+responding, 1 = running but not responding /
      no window, 2 = not running, 3 = the check itself failed.

  ./client_ctl.py foreground
      Report the process name currently owning the foreground window
      (system-wide, not tied to any one instance) -- pure Win32 query, sends
      no input. Used by actions.py's focus_client() (docs/research/
      2026-09-20-dual-pico/design.md I6) to confirm a SetForegroundWindow
      call actually landed before any input is sent. Exit 0 with the name
      printed, or 1 with "(none)" if it could not be determined.

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
      Otherwise: evidence(step) -> check whether the MetalRage process is still
      present.
        - Present AND responding: close_client(step) -- CLOSE_WINDOW (a real Pico
          click on the close X, see module docstring) -> wait up to 20s for the
          process to exit. If a confirm dialog or a "not responding" ghost window
          shows up instead, or the process is still there after 20s, this does
          NOT click anything else -- it tries a taskkill fallback purely to log
          that it was denied (AGENTS.md 硬性約束 1 -- no other termination
          technique is attempted), then halts the session, operator needed.
        - Present but NOT responding (already hung): does not attempt
          CLOSE_WINDOW on a window that likely will not process the click either
          -- halts immediately, operator needed (unchanged from the 2026-09-19
          behavior for this specific case).
        - Absent (process not found): launch via the .bat -> wait (<=90s) for
          a window. Does NOT log in; that is done later by Pico steps.
      Any failure along the way halts the session (fail closed).
      --dry-run runs every gate check and prints what it would do, without
      touching the real client or the session file.

  ./client_ctl.py relaunch --reason <text> [--dry-run]
      A PLANNED relaunch (not a crash), e.g. before a long unattended run, kept
      separate from restart's crash-recovery budget (RESTART_LIMIT / same-step
      dedup do not apply here; tracked in its own session field
      client_relaunch_count, not client_restart_count). Same present/responding
      gating and CLOSE_WINDOW-based close as restart above, then: launch -> wait
      for the real window -> login (see actions.py's login() action / relaunch_client()).
      This subcommand itself still does NOT log in -- same process-only boundary
      as restart -- the composed relaunch_client() action in actions.py calls this,
      then calls login() as a separate step.
      --dry-run runs every gate check and prints what it would do, without
      touching the real client or the session file.

Exit codes for restart/relaunch: 0 = done (or dry-run says it would proceed), 3 =
refused by a gate (session/STOP/limit/same-step for restart only), 1 = a step
failed during execution, or the client was present and could not be closed
(operator needed).

  ./client_ctl.py launch --id ID --proc NAME --bat PATH [--install DIR] [--dry-run]
      Dual-client primitive (docs/research/2026-09-20-dual-pico/design.md
      section 3's launch_client(id)): requires an open, non-halted Pico
      session and no STOP file, same as restart/relaunch. Refuses (BLOCKED,
      session halted, exit 1) if `--proc NAME` already has a process --
      unlike restart/relaunch, this never closes an existing instance
      first. Otherwise: launch via the .bat -> wait up to WAIT_READY_MS for
      the real game window (client area >= 1600x1200). Does NOT log in.

  ./client_ctl.py close --id ID --proc NAME --bat PATH [--dry-run]
      Dual-client primitive (design.md section 9b's close_client(id)):
      same session/STOP gates. Already-not-running is OK (nothing to do).
      Present and responding: CLOSE_WINDOW (real Pico click on the title-bar
      close X) -> wait up to CLOSE_WAIT_EXIT_MS; not responding: halts
      immediately, no CLOSE_WINDOW attempt. The caller (actions.py's
      close_client() action) must already have focus_client()'d this
      instance's window before calling this -- see close_client() helper's
      own docstring for why (the click's coordinates are relative to
      whichever window is currently in the foreground).
"""

import glob
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import pico_ctl as pico  # reuses .pico_session state, log_action(), halt_session()

MRO_SERVER_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # ".../Metal Rage Online Server"
REPO_ROOT = os.path.dirname(MRO_SERVER_DIR)
SHOT_SH = os.path.join(MRO_SERVER_DIR, "tools", "win", "shot.sh")
SHOTS_DIR = os.path.join(REPO_ROOT, "shots")

CLIENT_CTL_PS1 = os.path.join(SCRIPT_DIR, "client_ctl.ps1")

CLIENT_LOG_WSL = "/mnt/c/Games/MetalRage Online/data/Log/MetalRage.log"


# ---------------------------------------------------------------------------
# ClientInstance: dual-client instance config (docs/research/2026-09-20-
# dual-pico/design.md section 1's per-client static fields: id/proc_name/
# install_dir/launcher). DEFAULT_INSTANCE's values are exactly the
# hardcoded defaults client_ctl.ps1's Resolve-ClientCtlArgs falls back to on
# its own, so passing DEFAULT_INSTANCE (every call site here does, unless
# given a different one explicitly) resolves to byte-identical
# $ProcName/$ExeName/$BatPath on the PowerShell side -- see
# Resolve-ClientCtlArgs.tests.ps1's "explicit defaults == no flags" cases.
# This module never imports actions.py's own Context.clients (I6) -- kept
# separate on purpose, matching this module's existing habit of being
# shelled out to rather than imported (see actions.py's module docstring).
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ClientInstance:
    id: str = "default"
    proc_name: str = "MetalRage"
    install_dir_win: str = r"C:\Games\MetalRage Online"
    bat_path_win: str = r"C:\Games\MetalRage Online\Play Metal Rage Online.bat"


DEFAULT_INSTANCE = ClientInstance()


def win_dir_to_wsl(win_dir):
    """Converts a Windows path (e.g. 'C:\\Games\\MetalRage Online 2') to its
    /mnt/c/... WSL path via `wslpath -u` -- the same primitive pico_ctl.py's
    win_user_profile_wsl() uses (see there), not a hand-rolled 'C:\\' ->
    '/mnt/c/' string replace, so spaces and any drive letter are handled
    correctly. Direct path only (docs/research/2026-09-20-dual-pico/
    design.md L3/9): every install_dir_win this module is given must NOT
    pass through the install's 'MetalRage\\' reparse-point directory (that
    junction resolves back to the MAIN install on both instances, see L3),
    which is why CLIENTS-style tables must always use e.g. 'C:\\Games\\
    MetalRage Online 2' directly, never '...\\MetalRage Online 2\\
    MetalRage\\...'."""
    res = subprocess.run(["wslpath", "-u", win_dir], capture_output=True, text=True, check=True)
    return res.stdout.strip()


def resolve_run_log(instance, since_epoch_s=0.0):
    """Finds `instance`'s newest data/System/run-*.log with mtime >=
    since_epoch_s (0.0 = "any"), and verifies its 'Init: Base directory:'
    header line names THIS instance's install dir -- see docs/research/
    2026-09-20-dual-pico/design.md section 6 P1 result table ("怎麼認定一份
    log 屬於誰"; sample header confirmed in docs/research/2026-09-19-second-
    client-win10/MetalRage.log:8, 'Init: Base directory: C:\\Games\\
    MetalRage Online\\data\\System\\').

    Fail-closed: returns (None, reason) on no candidate file, an unreadable
    file, or a header mismatch -- NEVER guesses. In particular, reading the
    header is EXPECTED to fail with a PermissionError while the client
    process is still running: L4 (same design doc) found data/System/
    run-*.log locked for reading, not just writing, the entire time the
    client is open, regardless of `-log=` "live tail" claims -- so this can
    only succeed once close_client()/close_window() has actually closed the
    process (design section 9b). Listing the directory and reading mtimes
    (glob/os.path.getmtime below) is NOT part of that lock -- L4's own [TEST]
    confirmed `stat` still works live -- only opening the file for read is.

    Returns (log_path_wsl, detail_str) on success, (None, reason_str) on
    failure. Never raises for an expected/ordinary failure (missing dir,
    locked file, no match); only a genuinely unexpected OSError while
    listing the directory propagates."""
    install_wsl = win_dir_to_wsl(instance.install_dir_win)
    pattern = os.path.join(install_wsl, "data", "System", "run-*.log")
    candidates = [p for p in glob.glob(pattern) if os.path.getmtime(p) >= since_epoch_s]
    if not candidates:
        return None, f"no run-*.log with mtime >= {since_epoch_s} matching {pattern}"
    candidates.sort(key=os.path.getmtime)
    newest = candidates[-1]
    expected_base = (instance.install_dir_win.rstrip("\\") + r"\data\System").lower()
    try:
        with open(newest, "r", encoding="utf-8", errors="replace") as f:
            head = f.read(4096)
    except OSError as ex:
        return None, (f"could not read header of {newest} -- if the client is still "
                       f"running this is EXPECTED (data/System/run-*.log is locked for "
                       f"reading the whole time it is open, see design.md L4): {ex}")
    m = re.search(r"Init:\s*Base directory:\s*(.+)", head)
    if not m:
        return None, f"{newest}: no 'Init: Base directory:' line in first 4KB"
    found_base = m.group(1).strip().rstrip("\\").lower()
    if found_base != expected_base:
        return None, f"{newest}: base dir mismatch: found {found_base!r}, expected {expected_base!r}"
    return newest, f"{newest}: header matches {found_base!r}"


def stop_file_wsl():
    """Same kill switch path as pico_serial.ps1's $StopFile, resolved via
    pico.win_user_profile_wsl() (see pico_ctl.py)."""
    return os.path.join(pico.win_user_profile_wsl(), "mro-pico", "STOP")

RESTART_LIMIT = 3
WAIT_READY_MS = 90000
CLOSE_WAIT_EXIT_MS = 20000  # how long close_client() waits for CLOSE_WINDOW to take effect
PICO_CTL_PY = os.path.join(SCRIPT_DIR, "pico_ctl.py")


# ---------------------------------------------------------------------------
# Windows-side process control via client_ctl.ps1 (mirrors pico_ctl.run_serial_commands's
# copy-to-Windows-path dance, since powershell.exe can't reliably run a \\wsl path).
# ---------------------------------------------------------------------------
def run_ps1(action, *args, instance=None, timeout=15):
    """instance (a ClientInstance, default None -> DEFAULT_INSTANCE) is
    always sent as explicit '--proc'/'--bat' flags to client_ctl.ps1's
    Resolve-ClientCtlArgs -- see that function's docstring for why sending
    DEFAULT_INSTANCE's values there resolves identically to sending no
    flags at all (Resolve-ClientCtlArgs.tests.ps1's "explicit defaults ==
    no flags" cases), so every existing call site here (none of which pass
    `instance`) is unaffected by this parameter's addition."""
    if not os.path.exists(pico.PS_PATH):
        print("[ERR] powershell.exe not found; is this running under WSL with Windows accessible?")
        sys.exit(1)
    instance = instance or DEFAULT_INSTANCE
    win_local = os.path.join(pico.win_user_profile_wsl(), "mro-client-ctl.ps1")
    win_path = pico.win_user_profile() + "\\mro-client-ctl.ps1"
    try:
        subprocess.run(["cp", CLIENT_CTL_PS1, win_local], check=True, capture_output=True)
    except Exception as ex:
        print(f"[ERR] unable to copy client_ctl.ps1 to Windows: {ex}")
        sys.exit(1)

    cmd = ([pico.PS_PATH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", win_path, action]
           + [str(a) for a in args]
           + ["--proc", instance.proc_name, "--bat", instance.bat_path_win])
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


def get_foreground_proc_name():
    """Runs client_ctl.ps1's `foreground` action (a pure Win32
    GetForegroundWindow() query, sends no input -- see that action's
    comment) and returns the process name currently in the foreground, or
    None if it could not be determined. Used by actions.py's focus_client()
    (I6) to confirm a SetForegroundWindow call actually landed on the
    intended instance before any input is sent."""
    out, rc = run_ps1("foreground", timeout=15)
    if not out:
        return None
    m = re.match(r'^FOREGROUND proc=(\S+)', out)
    return m.group(1) if m else None


def get_status(instance=None):
    out, rc = run_ps1("status", instance=instance, timeout=15)
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
# close_window()/close_client(): the ONE keyboard/mouse input this module sends
# (see module docstring for why: taskkill/Stop-Process are denied on this
# elevated client). Requires the same open, non-halted Pico session as every
# other pico_ctl.py input command -- callers here (cmd_restart/cmd_relaunch)
# already check that before reaching this point, but close_window() itself adds
# no session bookkeeping of its own; it is a thin subprocess call to
# `pico_ctl.py raw CLOSE_WINDOW`, which does its own require_session()/gating/
# halting exactly like any other pico_ctl.py input command (see pico_ctl.py's
# `raw` action and pico_serial.ps1's Invoke-CloseWindow).
# ---------------------------------------------------------------------------
SHOT_SH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "win", "shot.sh")


def bring_game_to_front(instance=None):
    """screen.ps1 (via shot.sh) calls SetForegroundWindow on the real game window,
    which is how the runner takes focus back from whatever the operator last used
    (2026-09-20: a planned relaunch was correctly BLOCKED because Discord was in
    the foreground). Best-effort: the gate in pico_serial.ps1 still decides.

    instance (default None -> DEFAULT_INSTANCE) selects which process's window
    shot.sh brings forward -- explicit '--proc <name>' now rather than relying
    on shot.sh's own default, but DEFAULT_INSTANCE.proc_name IS that same
    default ("MetalRage"), so this is a no-op change for every existing
    caller here (none pass `instance`). Needed for dual-client (design.md 9b:
    "關閉客戶端...關閉 X 的座標是相對該實例的視窗" -- close_window() must bring the
    RIGHT window forward, not whatever the previous instance's shot.sh call
    left focused, when a caller does pass a non-default instance)."""
    instance = instance or DEFAULT_INSTANCE
    try:
        subprocess.run(["bash", SHOT_SH, "--proc", instance.proc_name, "--name", "front-before-close"],
                        capture_output=True, text=True, timeout=60)
    except Exception:
        pass


def close_window(instance=None):
    bring_game_to_front(instance)
    proc = subprocess.run([sys.executable, PICO_CTL_PY, "raw", "CLOSE_WINDOW"],
                           capture_output=True, text=True, timeout=30)
    out = (proc.stdout or proc.stderr or "").strip()
    return out, proc.returncode


def close_client(step, instance=None):
    """CLOSE_WINDOW (a real Pico click on the game window's title-bar close X,
    see close_window() above) -> wait up to CLOSE_WAIT_EXIT_MS for the process to
    exit. Returns (ok: bool, detail: str). Does NOT click anything else if the
    process is still present afterwards (e.g. a confirm dialog or a "not
    responding" ghost window appeared instead of closing) -- only tries a
    taskkill fallback purely to log that it is denied (AGENTS.md 硬性約束 1: no
    other termination technique is attempted), then reports failure so the
    caller halts the session for an operator.

    instance (default None -> DEFAULT_INSTANCE, unaffected) is threaded to
    close_window()/get_status()/run_ps1() so this targets the right window
    and process for dual-client callers -- see bring_game_to_front()'s
    docstring. For dual-client, the caller (actions.py's close_client(id)
    action, design.md 9b) is still responsible for having already
    focus_client()'d this instance's window BEFORE calling this, since the
    real Pico click itself still goes through pico_serial.ps1's foreground
    gate (this function cannot change what that gate currently allows)."""
    instance = instance or DEFAULT_INSTANCE
    out, rc = close_window(instance)
    if "[BLOCKED]" in out or rc == 3:
        return False, f"CLOSE_WINDOW blocked: {out!r}"
    if "[ERR" in out or rc not in (0, 3):
        return False, f"CLOSE_WINDOW did not get a clean reply (rc={rc}): {out!r}"

    wout, wrc = run_ps1("wait_exit", CLOSE_WAIT_EXIT_MS, instance=instance,
                         timeout=(CLOSE_WAIT_EXIT_MS / 1000.0) + 10)
    if wout == "EXITED":
        return True, f"CLOSE_WINDOW: {out!r}; process exited within {CLOSE_WAIT_EXIT_MS}ms"

    st = get_status(instance)
    tk_out, tk_rc = run_ps1("kill", instance=instance, timeout=15)
    detail = (
        f"CLOSE_WINDOW sent ({out!r}) but process did not exit within {CLOSE_WAIT_EXIT_MS}ms "
        f"(wait_exit={wout!r}, status={st}); taskkill fallback={tk_out!r} rc={tk_rc} "
        f"(expected to be denied on this elevated client, per AGENTS.md 硬性約束 1 no other "
        f"termination technique is attempted)"
    )
    return False, detail


# ---------------------------------------------------------------------------
# Evidence: full-desktop screenshot (client may have no window / a crash dialog,
# so --full rather than -Proc MetalRage) + tail of the client log. Must be called
# before any kill so the crash state is captured, not the freshly-launched one.
# ---------------------------------------------------------------------------
def evidence(label, instance=None):
    """instance (default None) does NOT switch this to the new per-instance
    run-*.log resolution -- the default-instance path below is UNCHANGED
    from before this task (still reads the fixed CLIENT_LOG_WSL =
    data/Log/MetalRage.log, the single-client restart/relaunch flow's log,
    which is produced by the non-'-log=' launcher client_ctl.ps1 defaults to
    and is NOT known to be locked while running the way data/System/
    run-*.log is, see L4). This is a deliberate scope decision, not an
    oversight: switching the DEFAULT here to resolve_run_log() would regress
    existing single-client evidence-capture, because the default launcher
    (still "Play Metal Rage Online.bat", no '-log=') never produces a
    data/System/run-*.log at all -- see docs/research/2026-09-20-dual-pico/
    design.md's v3 launcher decision (only both DUAL-client launchers use
    '-log='). Passing an explicit non-default `instance` here opts into
    resolve_run_log(instance) instead (best-effort -- read failure while the
    client is still running is expected per L4 and is reported as a normal
    log_ok=False, not raised)."""
    instance = instance or DEFAULT_INSTANCE
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
    if instance == DEFAULT_INSTANCE:
        try:
            with open(CLIENT_LOG_WSL, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
            tail = lines[-200:]
            log_ok = True
        except Exception as ex:
            tail = [f"(failed to read {CLIENT_LOG_WSL}: {ex})\n"]
    else:
        log_path, detail = resolve_run_log(instance)
        if log_path is None:
            tail = [f"(could not resolve run-*.log for instance {instance.id!r}: {detail})\n"]
        else:
            try:
                with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
                tail = lines[-200:]
                log_ok = True
            except Exception as ex:
                tail = [f"(failed to read {log_path}: {ex})\n"]
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
    stop_file = stop_file_wsl()
    if os.path.exists(stop_file):
        _refuse(f"STOP file present ({stop_file})", step, halt=True)

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
        print("  2. check whether the MetalRage process is still present (read-only status check)")
        print("     - present AND responding: close_client(step) -- CLOSE_WINDOW (real Pico click on "
              "the close X) -> wait <=20s for exit; if still present, taskkill fallback (expected "
              "denied, only to log it) -> HALT session, exit 1, operator needed")
        print("     - present but NOT responding: HALT session, exit 1 immediately (no CLOSE_WINDOW "
              "attempt on an already-hung window), operator needed")
        print(f"     - absent: 3. launch via the .bat, wait up to {WAIT_READY_MS}ms for a window")
        print(f"  4. on a successful launch only: session state -> client_restart_count={count + 1}, "
              f"client_last_restart_step={step!r}")
        sys.exit(0)

    ev_dir = evidence(f"restart-{step}")

    st = get_status()
    if st["state"] == "ok":
        # Present and responding: try CLOSE_WINDOW (real Pico click on the close X) --
        # taskkill/Stop-Process are denied on this elevated client, see module
        # docstring. close_client() does not click anything else if that doesn't
        # result in the process exiting.
        ok, detail = close_client(f"restart-{step}")
        if not ok:
            halt_reason = f"could not close client for restart: {detail} — operator needed"
            pico.log_action(f"restart {step}", f"BLOCKED: {halt_reason} evidence={ev_dir}")
            pico.halt_session(halt_reason)
            print(f"[BLOCKED] {halt_reason}")
            sys.exit(1)
        pico.log_action(f"restart {step}", f"close_client ok: {detail}")
    elif st["state"] != "not_running":
        # Not responding (already hung) -- do not attempt CLOSE_WINDOW on a window
        # that likely will not process the click either (AGENTS.md 硬性約束 1: no
        # other termination technique is attempted). Same halt behavior as before
        # this task for this specific case.
        halt_reason = (
            "client present but NOT responding; not attempting CLOSE_WINDOW on a hung "
            f"window; cannot terminate (protected) — operator needed (status={st['state']} pid={st.get('pid')})"
        )
        pico.log_action(f"restart {step}", f"BLOCKED: {halt_reason} evidence={ev_dir}")
        pico.halt_session(halt_reason)
        print(f"[BLOCKED] {halt_reason}")
        sys.exit(1)

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


# ---------------------------------------------------------------------------
# relaunch: a PLANNED relaunch (not a crash) -- same session/STOP gates as
# restart, but deliberately WITHOUT restart's crash-recovery budget
# (RESTART_LIMIT / same-step dedup): those exist to stop an automatic crash
# loop, and a planned relaunch is neither automatic nor a crash. Tracked in
# its own session field (client_relaunch_count) so it never counts against or
# is blocked by client_restart_count/client_last_restart_step. Present/
# responding handling (CLOSE_WINDOW via close_client(), or halt if not
# responding) is identical to restart above.
# ---------------------------------------------------------------------------
def cmd_relaunch(reason, dry_run):
    state = pico._load_session()
    if state is None:
        _refuse("no session open (run: pico_ctl.py session start \"<purpose>\")", "relaunch", halt=False)
    if state.get("halted"):
        _refuse(f"session halted: {state.get('halt_reason')}", "relaunch", halt=False)
    stop_file = stop_file_wsl()
    if os.path.exists(stop_file):
        _refuse(f"STOP file present ({stop_file})", "relaunch", halt=True)

    count = state.get("client_relaunch_count", 0)

    if dry_run:
        print(f"[DRY-RUN] relaunch would proceed: reason={reason!r} count_before={count} "
              "(planned action -- no restart-limit/same-step gate, separate from crash recovery budget)")
        print("  1. evidence('relaunch')")
        print("  2. check whether the MetalRage process is still present (read-only status check)")
        print("     - present AND responding: close_client('relaunch') -- CLOSE_WINDOW -> wait <=20s "
              "for exit; if still present, taskkill fallback (expected denied) -> HALT, exit 1")
        print("     - present but NOT responding: HALT immediately, operator needed")
        print(f"     - absent: 3. launch via the .bat, wait up to {WAIT_READY_MS}ms for the real window")
        print(f"  4. on a successful launch only: session state -> client_relaunch_count={count + 1}")
        print("  5. NOT done by this subcommand: login -- see actions.py's login()/relaunch_client()")
        sys.exit(0)

    ev_dir = evidence("relaunch")

    st = get_status()
    if st["state"] == "ok":
        ok, detail = close_client("relaunch")
        if not ok:
            halt_reason = f"could not close client for planned relaunch: {detail} — operator needed"
            pico.log_action("relaunch", f"BLOCKED: {halt_reason} evidence={ev_dir}")
            pico.halt_session(halt_reason)
            print(f"[BLOCKED] {halt_reason}")
            sys.exit(1)
        pico.log_action("relaunch", f"close_client ok: {detail}")
    elif st["state"] != "not_running":
        halt_reason = (
            "client present but NOT responding; not attempting CLOSE_WINDOW on a hung "
            f"window; cannot terminate (protected) — operator needed (status={st['state']} pid={st.get('pid')})"
        )
        pico.log_action("relaunch", f"BLOCKED: {halt_reason} evidence={ev_dir}")
        pico.halt_session(halt_reason)
        print(f"[BLOCKED] {halt_reason}")
        sys.exit(1)

    out, rc = run_ps1("launch", timeout=15)
    if out != "LAUNCH_SENT":
        _fail(f"launch: unexpected reply {out!r}", "relaunch")

    out, rc = run_ps1("wait_ready", WAIT_READY_MS, timeout=(WAIT_READY_MS / 1000.0) + 10)
    if not (out or "").startswith("READY"):
        _fail(f"wait_ready: {out!r}", "relaunch")

    state["client_relaunch_count"] = count + 1
    pico._save_session(state)

    result = f"OK reason={reason!r} count={count + 1} evidence={ev_dir} {out}"
    pico.log_action("relaunch", result)
    print(f"[OK] {result}")
    sys.exit(0)


# ---------------------------------------------------------------------------
# launch / close: dual-client primitives (docs/research/2026-09-20-dual-pico/
# design.md section 3's launch_client(id)/close_client(id) actions). Unlike
# restart/relaunch above, neither of these owns a crash-recovery budget or a
# same-step dedup -- they are one-shot process operations for a SPECIFIC
# instance, called from actions.py's launch_client()/close_client() (which
# always focus_client()s first for close_client, see its docstring). Both
# still gate on session/STOP exactly like restart/relaunch (fail closed).
# ---------------------------------------------------------------------------
def cmd_launch(instance, dry_run):
    """launch_client(id) (design.md section 3, PM revision): does NOT close
    an existing process first -- unlike restart/relaunch, which are built
    around a client that might already be present (crash recovery / planned
    relaunch), a fresh dual-client launch is only ever supposed to run
    against an instance the runner's own preflight already confirmed has no
    residual process (check_no_residual_process(), runner.py). If one turns
    up anyway at launch time, this refuses rather than silently closing it
    (that decision belongs to a human or to preflight, not to a launch
    step) -- BLOCKED, session halted, exit 1."""
    state = pico._load_session()
    if state is None:
        _refuse("no session open (run: pico_ctl.py session start \"<purpose>\")", f"launch-{instance.id}", halt=False)
    if state.get("halted"):
        _refuse(f"session halted: {state.get('halt_reason')}", f"launch-{instance.id}", halt=False)
    stop_file = stop_file_wsl()
    if os.path.exists(stop_file):
        _refuse(f"STOP file present ({stop_file})", f"launch-{instance.id}", halt=True)

    if dry_run:
        print(f"[DRY-RUN] launch would proceed: instance={instance.id!r} proc={instance.proc_name!r} "
              f"bat={instance.bat_path_win!r}")
        print("  1. check no process for this instance is already present (BLOCKED + halt if one is -- "
              "launch_client does not close an existing instance, see design.md)")
        print(f"  2. launch via the .bat, wait up to {WAIT_READY_MS}ms for the real game window "
              f"(client area >= 1600x1200, client_ctl.ps1's existing wait_ready)")
        sys.exit(0)

    st = get_status(instance)
    if st["state"] != "not_running":
        halt_reason = (f"instance {instance.id!r} already has a {instance.proc_name} process "
                        f"(state={st['state']} pid={st.get('pid')}) -- launch_client does not close "
                        f"an existing instance, run preflight/close_client first")
        pico.log_action(f"launch {instance.id}", f"BLOCKED: {halt_reason}")
        pico.halt_session(halt_reason)
        print(f"[BLOCKED] {halt_reason}")
        sys.exit(1)

    out, rc = run_ps1("launch", instance=instance, timeout=15)
    if out != "LAUNCH_SENT":
        _fail(f"launch: unexpected reply {out!r}", f"launch-{instance.id}")

    out, rc = run_ps1("wait_ready", WAIT_READY_MS, instance=instance, timeout=(WAIT_READY_MS / 1000.0) + 10)
    if not (out or "").startswith("READY"):
        _fail(f"wait_ready: {out!r}", f"launch-{instance.id}")

    result = f"OK instance={instance.id} {out}"
    pico.log_action(f"launch {instance.id}", result)
    print(f"[OK] {result}")
    sys.exit(0)


def cmd_close(instance, dry_run):
    """close_client(id) (design.md section 9b): the ONLY supported way to
    close this elevated client is a real Pico click on its title-bar close X
    (close_client() helper above -- taskkill/Stop-Process are denied, see
    module docstring). The caller (actions.py's close_client() action) is
    responsible for having already focus_client()'d this instance's window
    before calling this -- the click itself still goes through
    pico_serial.ps1's foreground gate regardless.

    Already-not-running is treated as success (ok=True, nothing to do) --
    calling this on an instance that already exited is not an error."""
    state = pico._load_session()
    if state is None:
        _refuse("no session open (run: pico_ctl.py session start \"<purpose>\")", f"close-{instance.id}", halt=False)
    if state.get("halted"):
        _refuse(f"session halted: {state.get('halt_reason')}", f"close-{instance.id}", halt=False)
    stop_file = stop_file_wsl()
    if os.path.exists(stop_file):
        _refuse(f"STOP file present ({stop_file})", f"close-{instance.id}", halt=True)

    if dry_run:
        print(f"[DRY-RUN] close would proceed: instance={instance.id!r} proc={instance.proc_name!r}")
        print("  1. if already not running: OK, nothing to do")
        print("  2. if present and responding: close_client() -- CLOSE_WINDOW (real Pico click on the "
              f"close X) -> wait up to {CLOSE_WAIT_EXIT_MS}ms for exit; if still present, taskkill "
              "fallback (expected denied, only to log it) -> HALT, exit 1, operator needed")
        print("  3. if present but NOT responding: HALT immediately, operator needed (no CLOSE_WINDOW "
              "attempt on an already-hung window)")
        sys.exit(0)

    st = get_status(instance)
    if st["state"] == "not_running":
        result = f"OK instance={instance.id} already not running"
        pico.log_action(f"close {instance.id}", result)
        print(f"[OK] {result}")
        sys.exit(0)

    if st["state"] == "ok":
        ok, detail = close_client(f"close-{instance.id}", instance=instance)
        if not ok:
            halt_reason = f"could not close client {instance.id!r}: {detail} — operator needed"
            pico.log_action(f"close {instance.id}", f"BLOCKED: {halt_reason}")
            pico.halt_session(halt_reason)
            print(f"[BLOCKED] {halt_reason}")
            sys.exit(1)
        result = f"OK instance={instance.id} {detail}"
        pico.log_action(f"close {instance.id}", result)
        print(f"[OK] {result}")
        sys.exit(0)

    halt_reason = (f"instance {instance.id!r} present but NOT responding; not attempting CLOSE_WINDOW "
                   f"on a hung window; cannot terminate (protected) — operator needed "
                   f"(status={st['state']} pid={st.get('pid')})")
    pico.log_action(f"close {instance.id}", f"BLOCKED: {halt_reason}")
    pico.halt_session(halt_reason)
    print(f"[BLOCKED] {halt_reason}")
    sys.exit(1)


def _parse_instance_args(args, need_bat=True):
    """Shared --id/--proc/--bat/--install/--dry-run parser for `launch`/
    `close` below. Returns (ClientInstance, dry_run)."""
    id_ = "default"
    proc_name = None
    bat_path_win = None
    install_dir_win = None
    dry_run = False
    i = 0
    while i < len(args):
        if args[i] == "--id" and i + 1 < len(args):
            id_ = args[i + 1]; i += 2
        elif args[i] == "--proc" and i + 1 < len(args):
            proc_name = args[i + 1]; i += 2
        elif args[i] == "--bat" and i + 1 < len(args):
            bat_path_win = args[i + 1]; i += 2
        elif args[i] == "--install" and i + 1 < len(args):
            install_dir_win = args[i + 1]; i += 2
        elif args[i] == "--dry-run":
            dry_run = True; i += 1
        else:
            print(f"[ERR] unknown arg: {args[i]}")
            sys.exit(1)
    if not proc_name or (need_bat and not bat_path_win):
        print("Usage: --id ID --proc NAME --bat PATH [--install DIR] [--dry-run]")
        sys.exit(1)
    instance = ClientInstance(
        id=id_, proc_name=proc_name,
        install_dir_win=install_dir_win or DEFAULT_INSTANCE.install_dir_win,
        bat_path_win=bat_path_win or DEFAULT_INSTANCE.bat_path_win,
    )
    return instance, dry_run


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1].lower()

    if action == "status":
        cmd_status()
        return

    if action == "foreground":
        # Pure read-only query (docs/research/2026-09-20-dual-pico/design.md
        # I6's focus_client() readback step) -- sends no input, needs no
        # Pico session.
        name = get_foreground_proc_name()
        print(name if name else "(none)")
        sys.exit(0 if name else 1)

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

    if action == "relaunch":
        reason = None
        dry_run = False
        args = sys.argv[2:]
        i = 0
        while i < len(args):
            if args[i] == "--reason" and i + 1 < len(args):
                reason = args[i + 1]
                i += 2
            elif args[i] == "--dry-run":
                dry_run = True
                i += 1
            else:
                print(f"[ERR] unknown arg: {args[i]}")
                sys.exit(1)
        if not reason:
            print("Usage: ./client_ctl.py relaunch --reason <text> [--dry-run]")
            sys.exit(1)
        cmd_relaunch(reason, dry_run)
        return

    if action == "launch":
        instance, dry_run = _parse_instance_args(sys.argv[2:])
        cmd_launch(instance, dry_run)
        return

    if action == "close":
        instance, dry_run = _parse_instance_args(sys.argv[2:])
        cmd_close(instance, dry_run)
        return

    print(f"[ERR] Unknown action '{action}'. See --help.")
    sys.exit(1)


if __name__ == "__main__":
    main()
