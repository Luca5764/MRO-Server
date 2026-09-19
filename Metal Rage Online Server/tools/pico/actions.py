#!/usr/bin/env python3
"""
actions.py - Parameterized, self-verifying actions for unattended Pico runs.

Every action is: precondition (an expected screen, checked with a single
screenshot before sending any input -- fail closed, no input sent if it does
not match) + steps (pico_ctl.py CLI calls) + completion condition (polled
with fresh screenshots, screens.py classification, up to a timeout) + a
timeout. Screenshots are always saved (via tools/win/shot.sh) but never sent
anywhere -- only screens.py's numpy/PIL comparisons look at them.

This module never calls pico_ctl.py's Python functions directly (it is a
CLI-shaped script full of sys.exit() calls); it shells out to it exactly the
way a human following README.md would, so its own behavior/gates are
untouched.

See runner.py for how these get sequenced into an experiment and reported.
"""

import glob
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import screens  # noqa: E402

MRO_SERVER_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # .../Metal Rage Online Server
REPO_ROOT = os.path.dirname(MRO_SERVER_DIR)
PICO_CTL = os.path.join(SCRIPT_DIR, "pico_ctl.py")
SHOT_SH = os.path.join(MRO_SERVER_DIR, "tools", "win", "shot.sh")
DEFAULT_SHOTS_DIR = os.path.join(REPO_ROOT, "shots")
DEFAULT_LOGS_DIR = os.path.join(MRO_SERVER_DIR, "logs")

# Client-area coordinates (pico_ctl.py click_at's input space), from operator
# observation 2026-09-19 (docs/journal/2026-09-19-2230-unattended-trial-01.md
# + this task's contract). Ones marked "approx" were given with a "~" in the
# contract and have not actually been click-tested yet.
SHOP_BUTTON = (607, 59)
BACK_BUTTON = (1552, 59)
TAB_COORDS = {
    "aux": (1470, 238),
    "equip": (1258, 289),
    "item": (1470, 289),
    "mshop": (1470, 182),
    "main": (1258, 238),  # approx, not click-tested
}
TAB_MANIFEST_KEY = {
    "aux": "shop_aux",
    "equip": "shop_equip",
    "item": "shop_item",
    "mshop": "shop_mshop",
    "main": "shop_main",
}
# Buttons that must NEVER be clicked by any action in this module (real-money
# / gifting side effects). Enforced in click_at() below as a hard guard, not
# just a comment.
FORBIDDEN_CLICKS = {
    "buy": (1258, 907),  # 購買
}


class ActionError(Exception):
    """Raised for a structural problem (bad params, unknown tab, forbidden
    click) that should fail an experiment before any input is sent."""


@dataclass
class ActionResult:
    name: str
    ok: bool
    gray: bool
    duration_s: float
    detail: str
    screenshot: str = None
    score: float = None
    steps: list = field(default_factory=list)  # raw pico_ctl.py call log


@dataclass
class Context:
    dry_run: bool = False
    shots_dir: str = DEFAULT_SHOTS_DIR
    logs_dir: str = DEFAULT_LOGS_DIR
    poll_interval_s: float = 1.5
    shot_seq: int = 0
    run_id: str = "run"


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------
def run_pico(ctx, *args):
    """Shell out to `python3 pico_ctl.py <args>`. Returns (returncode, stdout,
    stderr, elapsed_s). In dry-run mode this is never called."""
    assert not ctx.dry_run, "run_pico() must not be called in --dry-run"
    t0 = time.monotonic()
    proc = subprocess.run(
        [sys.executable, PICO_CTL, *[str(a) for a in args]],
        capture_output=True, text=True, cwd=SCRIPT_DIR,
    )
    elapsed = time.monotonic() - t0
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip(), elapsed


def take_screenshot(ctx, label):
    """Runs tools/win/shot.sh --name <run_id>-<seq>-<label>, returns the saved
    path. In dry-run mode returns None without touching anything."""
    if ctx.dry_run:
        return None
    ctx.shot_seq += 1
    name = f"{ctx.run_id}-{ctx.shot_seq:02d}-{label}"
    proc = subprocess.run(["bash", SHOT_SH, "--name", name], capture_output=True, text=True)
    lines = [l for l in proc.stdout.splitlines() if l.strip()]
    if proc.returncode != 0 or not lines:
        raise ActionError(f"shot.sh failed (rc={proc.returncode}): {proc.stdout} {proc.stderr}")
    return lines[0].strip()


def click_at(ctx, xy, button="left"):
    x, y = xy
    for fname, fxy in FORBIDDEN_CLICKS.items():
        if (x, y) == fxy:
            raise ActionError(f"refusing to click forbidden target '{fname}' at {fxy}")
    return run_pico(ctx, "click_at", f"{x},{y}", button)


def key(ctx, key_name):
    return run_pico(ctx, "key", key_name)


def type_text(ctx, text):
    if not all(0x20 <= ord(c) <= 0x7E for c in text):
        raise ActionError("console_cmd text must be printable ASCII (see pico_ctl.py TYPE gate)")
    return run_pico(ctx, "type", text)


def wait_for(ctx, label, timeout_s, check_fn):
    """Polls with fresh screenshots until check_fn(classify_result_or_state)
    is satisfied or timeout_s elapses. check_fn takes the raw screenshot path
    and must return (ok: bool, gray: bool, detail: str, score: float|None).
    Always takes at least one screenshot, even at timeout=0, so a result is
    reported. Returns (ok, gray, detail, score, screenshot_path, elapsed_s)."""
    t0 = time.monotonic()
    attempt = 0
    last = (False, True, "no screenshot taken", None)
    shot_path = None
    while True:
        attempt += 1
        shot_path = take_screenshot(ctx, f"{label}-{attempt}")
        if ctx.dry_run:
            return True, False, "dry-run: skipped", None, None, 0.0
        last = check_fn(shot_path)
        if last[0]:
            break
        if time.monotonic() - t0 >= timeout_s:
            break
        time.sleep(ctx.poll_interval_s)
    elapsed = time.monotonic() - t0
    ok, gray, detail, score = last
    return ok, gray, detail, score, shot_path, elapsed


def _screen_check(expect_name):
    def check(shot_path):
        r = screens.classify_screen(shot_path)
        ok = (r.name == expect_name) and not r.gray
        detail = f"classify={r.name} score={r.score:.2f} margin={r.margin} gray={r.gray}"
        return ok, r.gray, detail, r.score
    return check


def _console_check(expect_state):
    def check(shot_path):
        state, so, sc, margin = screens.console_state(shot_path)
        ok = state == expect_state
        gray = state == "unknown"
        detail = f"console_state={state} open={so:.2f} closed={sc:.2f} margin={margin:.2f}"
        score = so if expect_state == "open" else sc
        return ok, gray, detail, score
    return check


def _tab_check(tab_key, expect_screen="shop"):
    def check(shot_path):
        active, score = screens.is_tab_active(shot_path, tab_key)
        r = screens.classify_screen(shot_path)
        ok = active and r.name == expect_screen and not r.gray
        detail = f"tab_active={active} score={score:.2f} screen={r.name} gray={r.gray}"
        return ok, r.gray, detail, score
    return check


def _precondition(ctx, action_name, expect_name, check_fn):
    """Single-shot (no polling) precondition check, run before any input is
    sent. Returns None if satisfied, or an ActionResult describing the
    failure (so the caller can bail out without touching the keyboard/mouse)."""
    if ctx.dry_run:
        return None
    shot_path = take_screenshot(ctx, f"{action_name}-precondition")
    ok, gray, detail, score = check_fn(shot_path)
    if not ok:
        return ActionResult(
            name=action_name, ok=False, gray=gray, duration_s=0.0,
            detail=f"precondition failed (expected {expect_name}): {detail}",
            screenshot=shot_path, score=score,
        )
    return None


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
def goto_shop(ctx):
    """Triggered by: clicking the 商城/格納庫 button in the lobby top bar."""
    t0 = time.monotonic()
    pre = _precondition(ctx, "goto_shop", "lobby", _screen_check("lobby"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, SHOP_BUTTON))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "goto_shop", 8.0, _screen_check("shop"))
    return ActionResult("goto_shop", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def shop_tab(ctx, name):
    """Triggered by: clicking one of the shop's sub-tab buttons (輔助武器/裝備/
    道具/M幣商城/主武器)."""
    if name not in TAB_COORDS:
        raise ActionError(f"unknown shop_tab name '{name}', known: {sorted(TAB_COORDS)}")
    t0 = time.monotonic()
    pre = _precondition(ctx, f"shop_tab:{name}", "shop", _screen_check("shop"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, TAB_COORDS[name]))
    manifest_key = TAB_MANIFEST_KEY[name]
    ok, gray, detail, score, shot, _ = wait_for(ctx, f"shop_tab-{name}", 6.0, _tab_check(manifest_key))
    return ActionResult(f"shop_tab:{name}", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def back_to_lobby(ctx):
    """Triggered by: clicking 上一頁 (top-right) from the shop screen."""
    t0 = time.monotonic()
    pre = _precondition(ctx, "back_to_lobby", "shop", _screen_check("shop"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, BACK_BUTTON))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "back_to_lobby", 8.0, _screen_check("lobby"))
    return ActionResult("back_to_lobby", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def open_console(ctx):
    """Triggered by: pressing F24 (the client's ConsoleHotKey, IK_F24=135),
    sent from the Pico's hardware keyboard (see code.py KEY_MAP)."""
    t0 = time.monotonic()
    # No fixed precondition screen -- F24 has only been validated from the
    # lobby (see docs/journal 2026-09-19); do not assume a starting screen.
    steps = []
    if not ctx.dry_run:
        steps.append(key(ctx, "F24"))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "open_console", 5.0, _console_check("open"))
    return ActionResult("open_console", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def close_console(ctx):
    """Triggered by: pressing ESC while the console is open."""
    t0 = time.monotonic()
    pre = None
    if not ctx.dry_run:
        shot_path = take_screenshot(ctx, "close_console-precondition")
        state, so, sc, margin = screens.console_state(shot_path)
        if state != "open":
            pre = ActionResult(
                "close_console", False, state == "unknown", 0.0,
                f"precondition failed (expected console open): console_state={state}",
                shot_path, so,
            )
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(key(ctx, "ESC"))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "close_console", 5.0, _console_check("closed"))
    return ActionResult("close_console", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def console_cmd(ctx, text):
    """Triggered by: typing an exec command into the already-open client
    console and pressing Enter. NOT covered by either example experiment in
    experiments/ -- only the structure is implemented here; no exec command
    has actually been sent by this runner. See report for why (out of scope:
    would require knowing which console commands are safe to run unattended,
    a decision for the lead, not this action)."""
    t0 = time.monotonic()
    pre = None
    if not ctx.dry_run:
        shot_path = take_screenshot(ctx, "console_cmd-precondition")
        state, so, sc, margin = screens.console_state(shot_path)
        if state != "open":
            pre = ActionResult(
                "console_cmd", False, state == "unknown", 0.0,
                f"precondition failed (expected console open): console_state={state}",
                shot_path, so,
            )
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(type_text(ctx, text))
        steps.append(key(ctx, "ENTER"))
    # Best-effort completion: console should still read as open (no crash /
    # unexpected screen change). This does NOT confirm the command executed
    # or had any particular effect -- that would need a protocol-level signal
    # this module deliberately does not guess at (see docstring above).
    ok, gray, detail, score, shot, _ = wait_for(ctx, "console_cmd", 3.0, _console_check("open"))
    detail = f"(completion is best-effort: console still open) {detail}"
    return ActionResult("console_cmd", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


ACTIONS = {
    "goto_shop": goto_shop,
    "shop_tab": shop_tab,
    "back_to_lobby": back_to_lobby,
    "open_console": open_console,
    "close_console": close_console,
    "console_cmd": console_cmd,
}


# ---------------------------------------------------------------------------
# Text-signal helper: newest session-*.jsonl marker line for a given pico
# command label, and the newest 'build' event. Best-effort -- returns None
# fields when the logs dir / file is not there instead of raising, since a
# live server session log will usually not exist in an analysis worktree.
# Schema confirmed by reading packetlog.js (ev/t/ms/text/... fields; 'build'
# event written by recordBuild()), not guessed.
# ---------------------------------------------------------------------------
def newest_session_log(logs_dir):
    files = sorted(glob.glob(os.path.join(logs_dir, "session-*.jsonl")))
    return files[-1] if files else None


def find_build_event(logs_dir):
    """Returns the last {ev:'build', ...} line (dict) in the newest session
    log, or None if there is no logs dir / no session file / no build line."""
    path = newest_session_log(logs_dir)
    if path is None:
        return None
    build = None
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if entry.get("ev") == "build":
                    build = entry
    except OSError:
        return None
    return build


def tail_pico_markers(logs_dir, since_ms=None, limit=50):
    """Returns up to `limit` most recent {ev:'marker', src:'console', ...}
    lines whose text starts with 'pico: ' from the newest session log (see
    pico_ctl.py write_server_marker()), optionally only those with ms >=
    since_ms. Empty list (not an error) if there is no logs dir / file."""
    path = newest_session_log(logs_dir)
    if path is None:
        return []
    out = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if entry.get("ev") != "marker" or not str(entry.get("text", "")).startswith("pico: "):
                    continue
                if since_ms is not None and entry.get("ms", 0) < since_ms:
                    continue
                out.append(entry)
    except OSError:
        return []
    return out[-limit:]
