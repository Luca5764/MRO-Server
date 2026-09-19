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
import re
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

# Client-area coordinates for the full-match flow (2026-09-19 fullmatch task
# contract + this task's own pixel geometry check against the reference
# shots in shots/, see report). CREATE_ROOM_BUTTON is derived from
# ref-00-lobby.png's button bounds, not click-tested (same "approx" caveat as
# TAB_COORDS["main"] above); the rest are given directly in the contract and
# were re-derived independently here as a cross-check.
CREATE_ROOM_BUTTON = (992, 172)     # approx, 建立房間 (lobby top bar)
CREATE_PVE_TAB = (708, 501)         # 協力模式 tab in the create-room dialog
CREATE_CONFIRM_BUTTON = (732, 787)  # 確認 in the create-room dialog
NOTICE_CONFIRM_BUTTON = (798, 675)  # 確認 on the NOTICE ("提示") popup
# Room's 上一頁 (leave) is the same client coords as the shop's 上一頁 (back) --
# confirmed separately in this task's contract, reusing BACK_BUTTON rather
# than duplicating the constant.
LEAVE_ROOM_BUTTON = BACK_BUTTON

CONSOLE_CMD_WHITELIST = {"GameCampaign 1", "GameCampaign 2"}
DEFAULT_ROUND_SETTLE_S = 12.0
MAX_CAMPAIGN_ROUNDS = 12
# R-ROUND markers, written by dispatch/lobby.dispatch.js's PVE_ROUND_ADVANCE
# path (see lobby.dispatch.js:435/442): "R-ROUND: cleared=N playRound=M -> "
# followed by either "...EndRound_SN 0x00222211" (more rounds to go) or
# "...last round, EndGame_SN" (match over).
ROUND_MARKER_RE = re.compile(r"^R-ROUND: cleared=(\d+) playRound=(\d+) -> (.*)$")


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
    # Per-round timings/markers for campaign_win_all (empty for every other
    # action) -- see runner.py write_report for how this reaches the report.
    rounds: list = field(default_factory=list)


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


def wait_for_log_markers(ctx, timeout_s, predicates, poll_interval_s=1.0, baseline_ms=None):
    """Polls the newest session-*.jsonl (not screenshots) for {ev:'marker'}
    lines (any src) written *after this call started*, until every predicate
    in `predicates` (dict name -> fn(text)->bool) has matched at least once
    entry, or timeout_s elapses. Used for completion conditions that are a
    server-side text signal rather than a picture (start_battle,
    campaign_win_all) -- see this task's contract for why: the room/battle
    UI transition is not something worth picture-matching when the log
    already says unambiguously what happened.

    Returns (ok: bool, found: dict[name, entry|None], elapsed_s). In dry-run
    mode returns (True, {}, 0.0) immediately without reading anything."""
    if ctx.dry_run:
        return True, {}, 0.0
    t0 = time.monotonic()
    # Callers that send input should take the baseline BEFORE sending: the server
    # writes the resulting marker within ms of the packet, before pico_ctl even
    # returns (2026-09-19: gameStarted marker landed 50 ms before the F5 ack).
    if baseline_ms is None:
        baseline_ms = _newest_log_ms(ctx.logs_dir)
    found = {name: None for name in predicates}
    while True:
        for entry in find_markers_since(ctx.logs_dir, baseline_ms):
            text = str(entry.get("text", ""))
            for name, pred in predicates.items():
                if found[name] is None and pred(text):
                    found[name] = entry
        if all(v is not None for v in found.values()):
            break
        if time.monotonic() - t0 >= timeout_s:
            break
        time.sleep(poll_interval_s)
    ok = all(v is not None for v in found.values())
    return ok, found, time.monotonic() - t0


def _screen_check(expect_name):
    def check(shot_path):
        r = screens.classify_screen(shot_path)
        ok = (r.name == expect_name) and not r.gray
        detail = f"classify={r.name} score={r.score:.2f} margin={r.margin} gray={r.gray}"
        return ok, r.gray, detail, r.score
    return check


def _console_check(expect_state, variant="lobby"):
    def check(shot_path):
        if variant == "battle":
            state, w = screens.console_prompt_state(shot_path)
            ok = state == expect_state
            return ok, state == "unknown", f"console_prompt={state} white_px={w}", float(w)
        state, so, sc, margin = screens.console_state(shot_path, variant=variant)
        ok = state == expect_state
        gray = state == "unknown"
        detail = f"console_state({variant})={state} open={so:.2f} closed={sc:.2f} margin={margin:.2f}"
        score = so if expect_state == "open" else sc
        return ok, gray, detail, score
    return check


def _marker_check(name):
    """Single-region marker check (screens.detect_marker), same shape as
    wait_for's check_fn contract. gray is always False here -- unlike
    classify_screen's competing screens, a marker is either within its own
    accept threshold or it is not; there is no second-place candidate to be
    ambiguous against, so a miss is a plain failure, not a gray zone."""
    def check(shot_path):
        present, score = screens.detect_marker(shot_path, name)
        detail = f"marker={name} present={present} score={score:.2f}"
        return present, False, detail, score
    return check


def _room_or_notice_check():
    """Room screen OR its NOTICE popup on top of it -- used right after
    creating a room (which sometimes immediately shows a host-transfer
    popup, see BUILD_SPEC["markers"]["notice_popup"] in screens.py) and
    after a match ends (client auto-returns to the room)."""
    def check(shot_path):
        room_present, room_score = screens.detect_marker(shot_path, "room")
        notice_present, notice_score = screens.detect_marker(shot_path, "notice_popup")
        ok = room_present or notice_present
        detail = f"room={room_present}({room_score:.2f}) notice_popup={notice_present}({notice_score:.2f})"
        return ok, False, detail, room_score
    return check


def _dialog_tab_check(tab_key):
    """Like _tab_check, but against the create-room dialog's marker instead
    of classify_screen (the dialog is not one of classify_screen's known
    screens -- see screens.py BUILD_SPEC["markers"]["create_dialog"])."""
    def check(shot_path):
        active, score = screens.is_tab_active(shot_path, tab_key)
        present, _ = screens.detect_marker(shot_path, "create_dialog")
        ok = active and present
        detail = f"tab_active={active} score={score:.2f} create_dialog_present={present}"
        return ok, False, detail, score
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


def console_cmd(ctx, text, variant="lobby"):
    """Triggered by: typing an exec command into the already-open client
    console and pressing Enter.

    text is restricted to CONSOLE_CMD_WHITELIST ("GameCampaign 1"/"GameCampaign
    2" only, see this task's contract) -- raises ActionError before sending
    anything for any other string, including the previous "any printable
    ASCII" behavior this action had before this task. campaign_win_all()
    below is this action's only real caller so far, with variant="battle"
    (see console_state()'s variant param in screens.py); the default stays
    "lobby" so this action's behavior from a lobby/shop-console context, if
    anything else ever calls it that way, is unchanged."""
    if text not in CONSOLE_CMD_WHITELIST:
        raise ActionError(f"console_cmd text must be one of {sorted(CONSOLE_CMD_WHITELIST)} (whitelist)")
    t0 = time.monotonic()
    pre = None
    if not ctx.dry_run:
        shot_path = take_screenshot(ctx, "console_cmd-precondition")
        state, so, sc, margin = screens.console_state(shot_path, variant=variant)
        if state != "open":
            pre = ActionResult(
                "console_cmd", False, state == "unknown", 0.0,
                f"precondition failed (expected console({variant}) open): console_state={state}",
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
    ok, gray, detail, score, shot, _ = wait_for(ctx, "console_cmd", 3.0, _console_check("open", variant=variant))
    detail = f"(completion is best-effort: console still open) {detail}"
    return ActionResult("console_cmd", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def dismiss_notice(ctx):
    """Triggered by: clicking 確認 on the client's NOTICE ("提示") popup --
    the forced-idle-kick popup over the lobby or the host-transfer popup over
    the room (docs/journal/2026-09-19-2230-unattended-trial-01.md; both share
    one marker, see screens.py BUILD_SPEC["markers"]["notice_popup"]). No-op
    (ok=True, no input sent) if no popup is present -- meant to be called
    defensively between other steps, not only when a popup is already known
    to be there."""
    t0 = time.monotonic()
    if ctx.dry_run:
        return ActionResult("dismiss_notice", True, False, 0.0, "dry-run: skipped", None, None, [])
    shot_path = take_screenshot(ctx, "dismiss_notice-check")
    present, score = screens.detect_marker(shot_path, "notice_popup")
    if not present:
        return ActionResult(
            "dismiss_notice", True, False, time.monotonic() - t0,
            f"no notice_popup present (score={score:.2f}), nothing to do", shot_path, score, [],
        )
    steps = [click_at(ctx, NOTICE_CONFIRM_BUTTON)]
    ok, gray, detail, score2, shot, _ = wait_for(
        ctx, "dismiss_notice", 6.0,
        lambda p: (lambda present, score: (not present, False, f"notice_popup present={present} score={score:.2f}", score))(
            *screens.detect_marker(p, "notice_popup")
        ),
    )
    return ActionResult("dismiss_notice", ok, gray, time.monotonic() - t0, detail, shot, score2, steps)


def create_pve_room(ctx):
    """Triggered by: clicking 建立房間 in the lobby, switching the create-room
    dialog's mode tab from the default 對戰模式 (PVP) to 協力模式 (PVE), then
    clicking 確認 -- creates a PvE room and the client puts the creating
    player straight into it as host. Completion accepts the room screen OR
    its NOTICE popup on top of it (screens.py's "room" marker reads as
    absent while that popup dims the room, same mechanic as the lobby's
    AFK-kick popup -- see _room_or_notice_check() above): either is "we are
    now in the room", and a follow-up dismiss_notice step clears the popup
    if it was there."""
    t0 = time.monotonic()
    pre = _precondition(ctx, "create_pve_room", "lobby", _screen_check("lobby"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, CREATE_ROOM_BUTTON))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "create_pve_room-dialog", 6.0, _marker_check("create_dialog"))
    if not ok:
        return ActionResult("create_pve_room", False, gray, time.monotonic() - t0,
                             f"create-room dialog did not appear: {detail}", shot, score, steps)
    if not ctx.dry_run:
        steps.append(click_at(ctx, CREATE_PVE_TAB))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "create_pve_room-tab", 4.0, _dialog_tab_check("dialog_pve"))
    if not ok:
        return ActionResult("create_pve_room", False, gray, time.monotonic() - t0,
                             f"協力模式 tab did not become active: {detail}", shot, score, steps)
    if not ctx.dry_run:
        steps.append(click_at(ctx, CREATE_CONFIRM_BUTTON))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "create_pve_room-confirm", 10.0, _room_or_notice_check())
    return ActionResult("create_pve_room", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def start_battle(ctx):
    """Triggered by: pressing F5 in the room (host only) to start the match.
    Completion is read from server-side text markers, not a screenshot --
    'gameStarted_ false -> true' (session.js, written the first time a
    session-carry snapshot sees gameStarted_ become true) and 'Game_Start_SN
    sent' (packetlog.js AUTO_MARK_SEND for opcode 0x00222104) -- per this
    task's contract, both appeared within ~20s of F5 in the 2026-09-19
    manual trial (docs/journal/2026-09-19-2230-unattended-trial-01.md)."""
    t0 = time.monotonic()
    pre = _precondition(ctx, "start_battle", "room", _marker_check("room"))
    if pre:
        return pre
    steps = []
    base = None if ctx.dry_run else _newest_log_ms(ctx.logs_dir)
    if not ctx.dry_run:
        steps.append(key(ctx, "F5"))
    ok, found, elapsed = wait_for_log_markers(
        ctx, 25.0,
        {
            "game_started": lambda t: t == "gameStarted_ false -> true",
            "game_start_sn": lambda t: t == "Game_Start_SN sent",
        },
        baseline_ms=base,
    )
    detail = "markers: " + ", ".join(f"{k}={'seen' if v else 'MISSING'}" for k, v in found.items())
    shot = None if ctx.dry_run else take_screenshot(ctx, "start_battle-result")
    return ActionResult("start_battle", ok, False, time.monotonic() - t0, detail, shot, None, steps)


def campaign_win_all(ctx, settle_s=DEFAULT_ROUND_SETTLE_S, max_rounds=MAX_CAMPAIGN_ROUNDS):
    """Triggered by: opening the client console (F24) once in battle, then
    repeatedly running the ZPvePlayercontroller exec `GameCampaign 1` (see
    ZModePve/ZPvePlayercontroller.uc:904 and
    docs/journal/2026-09-19-2230-unattended-trial-01.md) until the server's
    own R-ROUND marker says the last round finished (EndGame_SN). Each
    send's result is read from the server's
    'R-ROUND: cleared=N playRound=M -> ...' marker (dispatch/lobby.dispatch.js,
    PVE_ROUND_ADVANCE_MODE), not a screenshot; screenshots are only used to
    confirm the console is open before sending each command, against the
    battle-background console crops (console_state(variant="battle"), see
    screens.py -- the lobby-only crops used by open_console() do not
    generalize to a live battle background, see this task's report)."""
    t0 = time.monotonic()
    # start_battle completes on the server markers, which arrive before the client
    # has loaded the map (2026-09-19 run: loading screen still up), so wait for the
    # battle HUD here instead of a one-shot precondition.
    steps = []
    if not ctx.dry_run:
        ok, gray, detail, score, shot, _ = wait_for(ctx, "campaign_win_all-battle", 60.0, _marker_check("battle"))
        if not ok:
            return ActionResult("campaign_win_all", False, gray, time.monotonic() - t0,
                                 f"battle HUD not seen within 60s: {detail}", shot, score, steps)

    # F24 toggles the console, so only press it when the prompt is not already showing.
    if not ctx.dry_run:
        st, _w = screens.console_prompt_state(take_screenshot(ctx, "campaign_win_all-console-pre"))
        if st == "unknown":
            return ActionResult("campaign_win_all", False, True, time.monotonic() - t0,
                                 f"console prompt state unknown before F24 (white_px={_w})", None, float(_w), steps)
        if st == "closed":
            steps.append(key(ctx, "F24"))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "campaign_win_all-console", 5.0, _console_check("open", variant="battle"))
    if not ok:
        return ActionResult("campaign_win_all", False, gray, time.monotonic() - t0,
                             f"console did not open over the battle HUD: {detail}", shot, score, steps)

    rounds = []
    if ctx.dry_run:
        return ActionResult("campaign_win_all", True, False, time.monotonic() - t0,
                             "dry-run: skipped the GameCampaign loop", None, None, steps, rounds)

    for i in range(max_rounds):
        base = _newest_log_ms(ctx.logs_dir)
        steps.append(type_text(ctx, "GameCampaign 1"))
        steps.append(key(ctx, "ENTER"))
        ok, found, elapsed = wait_for_log_markers(
            ctx, 30.0, {"round": lambda t: ROUND_MARKER_RE.match(t) is not None},
            baseline_ms=base,
        )
        if not ok:
            return ActionResult("campaign_win_all", False, False, time.monotonic() - t0,
                                 f"round {i}: no R-ROUND marker within 30s (rounds so far: {rounds})",
                                 None, None, steps, rounds)
        entry = found["round"]
        m = ROUND_MARKER_RE.match(entry["text"])
        cleared, play_round, tail = int(m.group(1)), int(m.group(2)), m.group(3)
        is_end = "EndGame_SN" in tail
        rounds.append({
            "iteration": i, "cleared": cleared, "playRound": play_round,
            "tail": tail, "wait_s": round(elapsed, 2), "ms": entry.get("ms"),
        })
        if is_end:
            return ActionResult("campaign_win_all", True, False, time.monotonic() - t0,
                                 f"EndGame_SN after {i + 1} send(s): {rounds}", None, None, steps, rounds)
        time.sleep(settle_s)

    return ActionResult("campaign_win_all", False, False, time.monotonic() - t0,
                         f"hit max_rounds={max_rounds} without an EndGame_SN marker: {rounds}",
                         None, None, steps, rounds)


def wait_result_then_room(ctx, result_timeout_s=15.0, room_timeout_s=20.0):
    """Triggered by nothing -- a pure wait/observe action for what the client
    does on its own after EndGame_SN (docs/journal/2026-09-19-2230-unattended-
    trial-01.md + this task's contract): shows the CAMPAIGN MODE result
    screen for a few seconds, then automatically returns to the room without
    any input. Seeing the result screen is best-effort (a fast transition
    could be missed between polls); completion requires the room (or its
    NOTICE popup, see _room_or_notice_check) within room_timeout_s."""
    t0 = time.monotonic()
    ok_result, gray_r, detail_r, score_r, shot_r, _ = wait_for(
        ctx, "wait_result_then_room-result", result_timeout_s, _marker_check("result")
    )
    ok_room, gray_room, detail_room, score_room, shot_room, _ = wait_for(
        ctx, "wait_result_then_room-room", room_timeout_s, _room_or_notice_check()
    )
    detail = f"result_seen={ok_result} ({detail_r}); room: {detail_room}"
    return ActionResult("wait_result_then_room", ok_room, gray_room, time.monotonic() - t0,
                         detail, shot_room, score_room, [])


def leave_room(ctx):
    """Triggered by: clicking 上一頁 (top-right) from the room screen -- the
    host leaving after a match. Same client coords as back_to_lobby's shop
    上一頁 (LEAVE_ROOM_BUTTON == BACK_BUTTON, confirmed separately at client
    (1552,59) for the room in this task's contract)."""
    t0 = time.monotonic()
    pre = _precondition(ctx, "leave_room", "room", _marker_check("room"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, LEAVE_ROOM_BUTTON))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "leave_room", 8.0, _screen_check("lobby"))
    return ActionResult("leave_room", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


ACTIONS = {
    "goto_shop": goto_shop,
    "shop_tab": shop_tab,
    "back_to_lobby": back_to_lobby,
    "open_console": open_console,
    "close_console": close_console,
    "console_cmd": console_cmd,
    "dismiss_notice": dismiss_notice,
    "create_pve_room": create_pve_room,
    "start_battle": start_battle,
    "campaign_win_all": campaign_win_all,
    "wait_result_then_room": wait_result_then_room,
    "leave_room": leave_room,
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


def _newest_log_ms(logs_dir):
    """Returns the 'ms' field of the last line in the newest session log, or
    0 if there is no logs dir / file / lines. Used as a "since" baseline by
    wait_for_log_markers() so it only reacts to markers written after the
    call started, not stale ones from a previous round or a previous
    experiment run."""
    path = newest_session_log(logs_dir)
    if path is None:
        return 0
    last = 0
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
                last = entry.get("ms", last)
    except OSError:
        return 0
    return last


def find_markers_since(logs_dir, since_ms, limit=200):
    """Returns up to `limit` most recent {ev:'marker', ...} lines (any src --
    unlike tail_pico_markers, not just 'pico: '-prefixed ones) with ms >
    since_ms from the newest session log, oldest first. Empty list (not an
    error) if there is no logs dir / file."""
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
                if entry.get("ev") != "marker":
                    continue
                if entry.get("ms", 0) <= since_ms:
                    continue
                out.append(entry)
    except OSError:
        return []
    return out[-limit:]


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
