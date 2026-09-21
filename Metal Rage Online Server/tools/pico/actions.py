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
CLIENT_CTL = os.path.join(SCRIPT_DIR, "client_ctl.py")
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

# Room's map-selection popup (client (852,449), the room's 選擇地圖▼
# button; opened only from the room screen, host or not -- this task's
# contract). Entry coordinates derived 2026-09-20 from shots/esc-01-mapsel.png
# (crop pixel centers, converted shot->client via screens.shot_to_client's
# CLIENT_OFFSET); only "defense" (防衛作戰) has actually been click-tested
# end to end (2026-09-20 escort smoke run, docs/journal/2026-09-20-0110-
# escort-smoke.md: client (1078,527) -> a 0x00220221 recv with hex
# "002f23..." -> map id 0x232f = 9007) -- the other three entries' click
# targets are 🟡 UNTESTED, read off the same reference screenshot's button
# geometry, not clicked live.
SELECT_MAP_DROPDOWN = (852, 449)  # 選擇地圖▼, room screen -- click-tested (same journal)
MAP_ENTRIES = {
    "power":      {"label": "動力奪取戰", "coords": (642, 529), "tested": False},
    "rescue":     {"label": "援救基地戰", "coords": (862, 529), "tested": False},
    "defense":    {"label": "防衛作戰", "coords": (1078, 527), "tested": True},
    "infiltrate": {"label": "潛入作戰", "coords": (622, 569), "tested": False},
}
# GC_CQ (dispatch/lobby.dispatch.js), the map-change request the client
# sends after picking a map entry -- see select_map()'s docstring for the
# body layout this task confirmed by reading the same journal entry.
MAP_SELECT_CQ_OPCODE = "0x00220221"
DEFAULT_MAP_SELECT_TIMEOUT_S = 10.0

CONSOLE_CMD_WHITELIST = {"GameCampaign 1", "GameCampaign 2"}
DEFAULT_ROUND_SETTLE_S = 12.0
MAX_CAMPAIGN_ROUNDS = 12
# How long campaign_fail() waits for the EndGame_SN 0x00222213 send packet
# after GameCampaign 2 (see campaign_fail()'s docstring for why there is no
# marker to wait on for the failure path).
CAMPAIGN_FAIL_ENDGAME_TIMEOUT_S = 20.0
# How long deltest() waits, after sending delTest, before it reads back the
# Death_CN/Death_SN packet counts (best-effort, not a pass/fail condition --
# see deltest()'s docstring).
DEFAULT_DELTEST_WAIT_S = 20.0
# keepalive_wait()'s default ping interval -- well under the ~80s AFK-kick
# popup timing observed 2026-09-19 (docs/journal/2026-09-19-2230-unattended-
# trial-01.md「因長時間未動作，所以被強制退場」), leaving margin either side.
DEFAULT_KEEPALIVE_INTERVAL_S = 30.0
# R-ROUND markers, written by dispatch/lobby.dispatch.js's PVE_ROUND_ADVANCE
# path (see lobby.dispatch.js:435/442): "R-ROUND: cleared=N playRound=M -> "
# followed by either "...EndRound_SN 0x00222211" (more rounds to go) or
# "...last round, EndGame_SN" (match over).
ROUND_MARKER_RE = re.compile(r"^R-ROUND: cleared=(\d+) playRound=(\d+) -> (.*)$")

# login()'s 帳號 field, client coords -- 2026-09-19 operator-click-tested
# (docs/journal/2026-09-19-2230-unattended-trial-01.md + this task's contract:
# "clicking the 帳號 field at client (777,829) then TYPE Lucas, KEY TAB, TYPE
# x, KEY ENTER logged in"). The dummy password is that exact tested value --
# the server has no password check (any value works), see the same journal
# entry -- kept as-is rather than substituted, since only that value has
# actually been click-tested end to end.
LOGIN_ACCOUNT_FIELD = (777, 829)
LOGIN_DUMMY_PASSWORD = "x"
# CQ_LOGIN_WASABII, dispatch/account.dispatch.js:8 -- confirmed by reading
# that handler for this task (no packetlog.marker() call exists for it, same
# situation as campaign_fail()'s EndGame_SN, hence wait_for_log_pkts() below
# rather than wait_for_log_markers()).
LOGIN_CQ_OPCODE = "0x00110151"
DEFAULT_LOGIN_TIMEOUT_S = 20.0

# ---------------------------------------------------------------------------
# Dual-client actions (docs/research/2026-09-20-dual-pico/design.md section 3).
# All of these take a client_id (a key of ctx.clients, see Context/ClientState
# above) and start by focus_client()-ing it themselves (see _focus_or_fail()
# below) -- section 0 rule 7's "才准送任何輸入" applies per-action, not just
# once per script, since a script can interleave actions across instances in
# any order.
# ---------------------------------------------------------------------------

# focus_client()'s foreground readback poll -- [TEST] 2026-09-21 A-段 step 1
# (login_as('host', ...)): the FIRST readback after SetForegroundWindow came
# back 'dwm' (Desktop Window Manager) instead of the target proc name, and
# focus_client() failed outright. The foreground switch itself had not
# failed -- Windows briefly reports 'dwm' as foreground during the
# switch/animation transition, so a single immediate readback is racy. Poll
# instead: keep re-reading (client_ctl.py's `foreground`, which sends no
# input) until it matches or this timeout elapses, WITHOUT calling
# SetForegroundWindow/shot.sh again inside the loop (see focus_client()'s
# docstring for why -- pico_serial.ps1:261's foreground gate only ever
# verifies, never re-steals, focus).
FOCUS_FOREGROUND_READBACK_TIMEOUT_S = 5.0
FOCUS_FOREGROUND_READBACK_POLL_INTERVAL_S = 0.25

# login_as()'s account-field clear (design.md section 3 row 1: "不可以假設
# 帳號欄位是空的...明確做全選＋刪除再打字"). This module has no CTRL+A/select-all
# primitive -- code.py's KEY/PRESS only ever holds one keycode at a time (no
# simultaneous chord), so "select all" is not literally available. HOME
# (cursor to the very start of the field) + this many DELETEs (forward,
# removing whatever follows the cursor) clears the field regardless of what a
# PREVIOUS login_as() call on the same instance left there. 🟡 [GUESS]: no
# observed max login-field length -- comfortably above every known test
# account ("Lucas"=5, "mrotest"=7, "mrotesthost"=11 chars).
ACCOUNT_FIELD_CLEAR_KEYPRESSES = 24

# join_room()'s room-list-row target. HIGH-RISK UNTESTED GUESS -- see
# join_room()'s own docstring for the full derivation and why this is one of
# this task's two flagged highest-risk coordinates (the other is
# BATTLE_ESC_LEAVE_BUTTON below). Derived by proportion (fraction of window
# width/height, NOT a 1:1 pixel copy) from shots/14-create-room.png, an
# OLDER, DIFFERENT-RESOLUTION (1040x807, non-4:3) full-window screenshot of
# the empty lobby room list -- not the current 1600x1200 client atlas. Header
# row bottom edge measured at that shot's y=195 (of 807), first content row
# center estimated at y=~209 within the "Channel" column (x=~600 of 1040);
# scaled to this module's 1600x1200 client space: x=600/1040*1600=923,
# y=209/807*1200=311. Assumes exactly one room is visible (the one just
# created by the host) -- there is no OCR/text-matching here to find a
# specific room by name among several, so `room_name` is logged for
# traceability only, never used to pick a row.
ROOM_LIST_FIRST_ROW_CLICK = (920, 310)

# Enter_CQ 0x00220231 / Enter_SA 0x00220232 (dispatch/gate.game.dispatch.js,
# confirmed by reading that handler for this task): Enter_SA's body is 6
# bytes, +0x00 u16 LE status + +0x02 u32 LE result, 0/0 = success, 1/1 =
# failure (room not found / wrong password / full / already playing) --
# docs/research/2026-09-18-d1-room-formats/enter-sa.md. gate.game.dispatch.js's
# own comment on the Enter_CQ case names the client action: "double-click a
# room row in the lobby room list".
ENTER_SA_OPCODE = "0x00220232"
DEFAULT_JOIN_ROOM_TIMEOUT_S = 45.0

# User_State_SN 0x00220401, broadcast (to the whole room, including the
# presser) when a non-host presses F5 to ready up -- READY-IMPL,
# docs/journal/2026-09-19-0330-d1-step4-room-join.md's "READY-IMPL 準備狀態
# 廣播" section; confirmed unconditional (only needs rooms.isRoomJoinEnabled(),
# no separate roomReadyStateMode switch) by reading
# dispatch/gate.game.dispatch.js's own comment on this opcode for this task.
USER_STATE_SN_OPCODE = "0x00220401"
DEFAULT_SET_READY_TIMEOUT_S = 20.0

# Game_Start_SN 0x00222104, now broadcast via rooms.sendAll to every room
# member including the host itself (D1-6-IMPL, docs/journal/INDEX.md 2026-09-19
# row) -- used here instead of the 'gameStarted_ false -> true'/'Game_Start_SN
# sent' TEXT MARKERS start_battle() (single-client) uses, because markers have
# no `conn` field (design.md L1) and cannot be attributed to one instance in a
# dual-client run.
GAME_START_SN_OPCODE = "0x00222104"
DEFAULT_HOST_START_BATTLE_TIMEOUT_S = 120.0

# ChangeSlot_CN 0x00230101 / Respawn_CN 0x00230103 (docs/journal/2026-09-17-22-
# pve-mech-slot-selection.md): the client's own PlayerSelectMech state sends
# these AUTOMATICALLY after loading, with no click -- [LOG] confirmed for
# this task against Metal Rage Online Server/logs/session-20260920-114648.jsonl
# (conn=2): Game_Start_SN sent at ms=166914, ChangeSlot_CN/Respawn_CN recv at
# ms=184899/184901, an ~18s loading gap and no pico input in between. So
# enter_battle() below sends NO click for "選機" -- see its own docstring for
# the residual risk (only observed for the host account so far, never a
# second/joining account).
CHANGE_SLOT_CN_OPCODE = "0x00230101"
RESPAWN_CN_OPCODE = "0x00230103"
DEFAULT_ENTER_BATTLE_TIMEOUT_S = 120.0

# console_cmd_on()'s whitelist (design.md section 3: "只加 netspeed <n>、
# stat net、WeaponLog"). Separate from CONSOLE_CMD_WHITELIST above (that one
# is console_cmd()'s own, GameCampaign-only, whitelist) -- kept as two
# independent sets on purpose so this task cannot accidentally widen what
# console_cmd() itself will send.
NETSPEED_CMD_RE = re.compile(r'^netspeed \d{1,7}$')
CONSOLE_CMD_ON_WHITELIST_EXACT = {"stat net", "WeaponLog"}
DEFAULT_CONSOLE_CMD_ON_CLOSE_TIMEOUT_S = 10.0

# Leave_CQ 0x00220234 (room-level self-leave, e.g. the client's own ~80s
# AFK-kick, ZGUIController.uc:945-948) -- idle_nudge() below only needs to
# confirm this did NOT fire on the nudged conn.
LEAVE_CQ_OPCODE = "0x00220234"

# Leave_CQ 0x00222131 (in-battle leave) / Leave_SA 0x00222132 (dispatch/
# gate.game.dispatch.js's own comment: "client action -- pressing ESC and
# choosing 'leave' while in battle"). Leave_SA is a 6-byte 0/0 ack sent ONLY
# to the leaving conn itself -- room-leave.js's handleBattleLeave() sends
# Leave_SN 0x00420133 (non-host left) or EndGame_SN 0x00222213 (host left)
# to the OTHER conn(s), never to the leaver -- so Leave_SA is the only
# battle-leave pkt this action can filter on its OWN conn.
LEAVE_SA_OPCODE = "0x00222132"
DEFAULT_LEAVE_BATTLE_TIMEOUT_S = 60.0
# HIGH-RISK UNTESTED GUESS -- see leave_battle()'s own docstring. Unlike
# ROOM_LIST_FIRST_ROW_CLICK above (derived, if weakly, from an actual old
# lobby screenshot), this has ZERO visual reference anywhere in this repo
# (checked shots/ and docs/research/ for this task). Chosen only by analogy
# to this module's other centered confirm-dialog buttons (NOTICE_CONFIRM_
# BUTTON, CREATE_CONFIRM_BUTTON), on the unverified assumption the in-battle
# ESC menu reuses the same dialog template.
BATTLE_ESC_LEAVE_BUTTON = (798, 675)


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
class ClientState:
    """One dual-client instance's runtime state (docs/research/2026-09-20-
    dual-pico/design.md section 1's per-client fields). id/proc_name are the
    static config focus_client() needs; install_dir_win/bat_path_win are
    kept here too so a future launch_client()/login_as() action has
    everything in one place, but are not read by anything in this task's
    scope (I6/I7 only add focus_client() and the conn-lookup helpers).
    account/conn_id/launch_time_ms are filled in as a run progresses (by
    login_as()/launch_client(), neither implemented this task).

    This module never imports client_ctl.ClientInstance -- kept as a
    separate, smaller struct on purpose, matching this module's existing
    habit of shelling out to client_ctl.py/pico_ctl.py rather than
    importing them (see module docstring)."""
    id: str
    proc_name: str
    install_dir_win: str = None
    bat_path_win: str = None
    account: str = None
    conn_id: int = None
    launch_time_ms: float = None


@dataclass
class Context:
    dry_run: bool = False
    shots_dir: str = DEFAULT_SHOTS_DIR
    logs_dir: str = DEFAULT_LOGS_DIR
    poll_interval_s: float = 1.5
    shot_seq: int = 0
    run_id: str = "run"
    # Dual-client support (docs/research/2026-09-20-dual-pico/design.md I6).
    # Both default empty -- every existing single-client script never
    # populates them, so focus_client()/the input-primitive guard below are
    # no-ops and every existing action's behavior is unchanged (see
    # focus_client()'s and _require_focused_client()'s docstrings).
    clients: dict = field(default_factory=dict)   # id -> ClientState
    active_client: str = None


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


def take_screenshot(ctx, label, proc=None):
    """Runs tools/win/shot.sh --name <run_id>-<seq>-<label>, returns the saved
    path. In dry-run mode returns None without touching anything.

    proc (default None) adds '--proc <name>' to the shot.sh call, capturing
    that instance's window instead of shot.sh's own default ("MetalRage",
    unaffected here) -- see focus_client() (docs/research/2026-09-20-
    dual-pico/design.md I6), the only caller that passes it."""
    if ctx.dry_run:
        return None
    ctx.shot_seq += 1
    name = f"{ctx.run_id}-{ctx.shot_seq:02d}-{label}"
    args = ["bash", SHOT_SH]
    if proc:
        args += ["--proc", proc]
    args += ["--name", name]
    proc_result = subprocess.run(args, capture_output=True, text=True)
    lines = [l for l in proc_result.stdout.splitlines() if l.strip()]
    if proc_result.returncode != 0 or not lines:
        raise ActionError(f"shot.sh failed (rc={proc_result.returncode}): {proc_result.stdout} {proc_result.stderr}")
    return lines[0].strip()


def _require_focused_client(ctx):
    """Called by every primitive that sends real input to the game
    (click_at/key/mouse_wiggle/type_text below) -- docs/research/2026-09-20-
    dual-pico/design.md section 0 rule 7's "焦點切換的順序寫死...才准送任何輸入".
    This is a cheap fail-closed presence check, NOT a re-verification of the
    actual Windows foreground window on every keystroke (that already
    happened once, inside focus_client(), which is the only thing allowed to
    change ctx.active_client -- see its docstring for the full switch
    sequence and readback).

    No-op when ctx.clients is empty -- every existing single-client script
    never populates it, so this never raises for them, and every action
    built on these primitives behaves exactly as before this task. Once
    ctx.clients IS populated (a dual-client run), raises ActionError if no
    focus_client(id) call has happened yet (ctx.active_client is None) --
    fail closed rather than silently sending input to whatever the OS
    foreground currently is."""
    if not ctx.clients:
        return
    if ctx.active_client is None:
        raise ActionError("dual-client Context has clients configured but no "
                           "active_client focused yet -- call focus_client(id) first")


def click_at(ctx, xy, button="left"):
    _require_focused_client(ctx)
    x, y = xy
    for fname, fxy in FORBIDDEN_CLICKS.items():
        if (x, y) == fxy:
            raise ActionError(f"refusing to click forbidden target '{fname}' at {fxy}")
    return run_pico(ctx, "click_at", f"{x},{y}", button)


def double_click_at(ctx, xy, button="left"):
    """Fires two CLICK_AT pseudo-commands inside ONE `pico_ctl.py batch` call
    (one powershell.exe/pico_serial.ps1 invocation) instead of two separate
    click_at() calls -- each ordinary click_at() spins up its OWN
    powershell.exe process (seconds apart), far longer than Windows' actual
    double-click time window, so two of those would never register as a
    double-click. Used only by join_room() below (docs/research/2026-09-20-
    dual-pico/design.md section 3; the room-list "join" action is confirmed
    to be a double-click by dispatch/gate.game.dispatch.js's own comment on
    Enter_CQ: "client action: double-click a room row in the lobby room
    list"). Still goes through pico_ctl.py's `batch` -> require_session() ->
    pico_serial.ps1's per-command foreground/click-target gates, same as any
    other input primitive here.

    🟡 UNTESTED: batching the two CLICK_AT pseudo-commands into one PS1
    invocation does not by itself guarantee they land inside Windows' real
    double-click threshold (each CLICK_AT is its own closed-loop move-and-
    verify against the live cursor position, see pico_serial.ps1) -- see
    join_room()'s docstring for why this is flagged as this task's top
    likely first-run failure."""
    _require_focused_client(ctx)
    x, y = xy
    for fname, fxy in FORBIDDEN_CLICKS.items():
        if (x, y) == fxy:
            raise ActionError(f"refusing to click forbidden target '{fname}' at {fxy}")
    cmd = f"CLICK_AT {x} {y} {button}"
    return run_pico(ctx, "batch", cmd, cmd)


def key(ctx, key_name):
    _require_focused_client(ctx)
    return run_pico(ctx, "key", key_name)


def mouse_wiggle(ctx, distance=1):
    """Zero-net mouse movement (MOVE <distance> 0 then MOVE <-distance> 0),
    used only as a harmless "still here" input by keepalive_wait() below --
    see its docstring for why a mouse move was chosen over a key press."""
    _require_focused_client(ctx)
    return [run_pico(ctx, "move", distance, 0), run_pico(ctx, "move", -distance, 0)]


def keepalive_key_tap(ctx):
    """Taps KEEPALIVE_KEY (a press+release, see pico_ctl.py's `key` / code.py's
    key_press()) as a "still here" input for wait_for()'s keepalive_interval_s
    option below -- an alternative to keepalive_wait()'s mouse_wiggle for
    callers that want a keepalive during an ordinary wait_for() poll loop
    rather than a dedicated standalone wait step.

    KEEPALIVE_KEY = "SHIFT" (this task's design choice, requested by this
    task's contract: "propose and justify, e.g. a modifier tap like SHIFT; do
    NOT use keys that open menus"). 🟡 [GUESS], not DLL-backed, same caveat as
    keepalive_wait()'s mouse_wiggle choice -- no client source was read for
    this task either. Reasoning: every other key this module knows how to
    send has an observed or plausible in-game effect in at least one of
    lobby/room/shop (F1-F12 hotkeys, ESC closes dialogs, ENTER submits chat/
    buttons/dialogs, arrow keys likely navigate menus, F24 opens the
    console -- see keepalive_wait()'s docstring). SHIFT is different: on a
    UDK/Unreal-Engine-3-based client (ZPvePlayercontroller.uc etc., see
    campaign_win_all()'s docstring) a bare Shift is conventionally a sprint
    *modifier*, bound together with a movement key (GBA_Sprint-style), not a
    standalone action -- tapping it alone, with no WASD held at the same
    time, and while sitting in a menu screen (lobby/room/shop are not the
    pawn's movement context at all), should not do anything observable. This
    has NOT been confirmed live -- the lead is expected to verify it
    (contract: "Mark the choice 🟡 in README; the lead will verify live")."""
    return run_pico(ctx, "key", "SHIFT")


KEEPALIVE_KEY = "SHIFT"  # unused for keepalive since 2026-09-20: SHIFT toggles the IME mode; wait_for uses mouse_wiggle


def type_text(ctx, text):
    _require_focused_client(ctx)
    if not all(0x20 <= ord(c) <= 0x7E for c in text):
        raise ActionError("console_cmd text must be printable ASCII (see pico_ctl.py TYPE gate)")
    return run_pico(ctx, "type", text)


def wait_for(ctx, label, timeout_s, check_fn, keepalive_interval_s=None):
    """Polls with fresh screenshots until check_fn(classify_result_or_state)
    is satisfied or timeout_s elapses. check_fn takes the raw screenshot path
    and must return (ok: bool, gray: bool, detail: str, score: float|None).
    Always takes at least one screenshot, even at timeout=0, so a result is
    reported. Returns (ok, gray, detail, score, screenshot_path, elapsed_s).

    keepalive_interval_s (optional, default None = off): every time at least
    this many seconds have passed since the last keepalive tap (or since this
    call started), sends one keepalive_key_tap() before the next sleep --
    this task's "runner option to send a harmless key periodically while
    waiting" (see keepalive_key_tap()'s docstring), usable from ANY wait_for()
    call rather than only via the dedicated keepalive_wait() action. Off by
    default everywhere -- existing callers/behavior are unaffected unless a
    caller explicitly opts in."""
    t0 = time.monotonic()
    attempt = 0
    last = (False, True, "no screenshot taken", None)
    shot_path = None
    last_keepalive = t0
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
        if keepalive_interval_s is not None and (time.monotonic() - last_keepalive) >= keepalive_interval_s:
            mouse_wiggle(ctx)  # not SHIFT: SHIFT toggles the Bopomofo IME Chinese/English mode
            last_keepalive = time.monotonic()
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


def wait_for_log_pkts(ctx, timeout_s, predicates, poll_interval_s=1.0, baseline_ms=None, conn=None):
    """Same contract as wait_for_log_markers() above, but polls
    find_pkts_since()'s raw {ev:'pkt', dir, op, ...} lines instead of
    {ev:'marker'} text -- predicates are fn(entry: dict) -> bool over the
    whole pkt record (not a text sentence), for signals that have no
    packetlog.marker() call to poll (see campaign_fail()'s docstring for why
    this exists: action=2's Campaign_CN reply has no R-ROUND marker).

    conn (default None, docs/research/2026-09-20-dual-pico/design.md I7/
    section 4): when given, only pkts from that connection are considered --
    threaded straight through to find_pkts_since(). Every existing caller
    here omits it, so find_pkts_since() sees conn=None and behaves exactly
    as before this task (no filtering).

    Returns (ok: bool, found: dict[name, entry|None], elapsed_s). In dry-run
    mode returns (True, {}, 0.0) immediately without reading anything."""
    if ctx.dry_run:
        return True, {}, 0.0
    t0 = time.monotonic()
    if baseline_ms is None:
        baseline_ms = _newest_log_ms(ctx.logs_dir)
    found = {name: None for name in predicates}
    while True:
        for entry in find_pkts_since(ctx.logs_dir, baseline_ms, conn=conn):
            for name, pred in predicates.items():
                if found[name] is None and pred(entry):
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


def _battle_any_check():
    """Map-independent "is the battle HUD up" check -- see
    screens.battle_hud_state()'s docstring for why _marker_check("battle")
    (a MAD region compare tuned to one map's HUD layout) does not
    generalize across maps/terrain. Same wait_for check_fn shape as
    _marker_check; gray is always False, same reasoning as _marker_check's
    own docstring (no ambiguous second-place candidate here either)."""
    def check(shot_path):
        state, green_px = screens.battle_hud_state(shot_path)
        ok = state == "battle"
        detail = f"battle_hud={state} green_px={green_px}"
        return ok, False, detail, float(green_px)
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
def goto_shop(ctx, keepalive_interval_s=None):
    """Triggered by: clicking the 商城/格納庫 button in the lobby top bar.

    keepalive_interval_s (optional, default None = off): forwarded to
    wait_for()'s keepalive option (see its docstring) -- this action's own
    wait is short (<=8s) and does not need it, but U-shop-tabs.json sets it
    on every step in this module as this task's requested demonstration of
    the option end-to-end (see README)."""
    t0 = time.monotonic()
    pre = _precondition(ctx, "goto_shop", "lobby", _screen_check("lobby"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, SHOP_BUTTON))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "goto_shop", 8.0, _screen_check("shop"),
                                                 keepalive_interval_s=keepalive_interval_s)
    return ActionResult("goto_shop", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def shop_tab(ctx, name, keepalive_interval_s=None):
    """Triggered by: clicking one of the shop's sub-tab buttons (輔助武器/裝備/
    道具/M幣商城/主武器). keepalive_interval_s: see goto_shop()'s docstring."""
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
    ok, gray, detail, score, shot, _ = wait_for(ctx, f"shop_tab-{name}", 6.0, _tab_check(manifest_key),
                                                 keepalive_interval_s=keepalive_interval_s)
    return ActionResult(f"shop_tab:{name}", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def back_to_lobby(ctx, keepalive_interval_s=None):
    """Triggered by: clicking 上一頁 (top-right) from the shop screen.
    keepalive_interval_s: see goto_shop()'s docstring."""
    t0 = time.monotonic()
    pre = _precondition(ctx, "back_to_lobby", "shop", _screen_check("shop"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, BACK_BUTTON))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "back_to_lobby", 8.0, _screen_check("lobby"),
                                                 keepalive_interval_s=keepalive_interval_s)
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


def select_map(ctx, name):
    """Triggered by: clicking 選擇地圖▼ in the room (opens the map-select
    popup, see shots/esc-01-mapsel.png), then clicking one of its four map
    entries (see MAP_ENTRIES above -- only "defense" 防衛作戰 has actually
    been click-tested end to end, 2026-09-20 escort smoke run,
    docs/journal/2026-09-20-0110-escort-smoke.md; the other three are 🟡
    UNTESTED coordinates derived from the same reference screenshot).
    ActionError before sending anything for any name not in MAP_ENTRIES.

    Completion is the server actually receiving the map-change request: a
    recv MAP_SELECT_CQ_OPCODE (0x00220221, dispatch/lobby.dispatch.js) --
    per the same journal entry its body starts with a 00 byte then a u16 LE
    map id (e.g. hex "002f23..." -> id 0x232f = 9007 for "defense" at
    whatever difficulty tab -- 初級/中級/高級 -- was last selected, which
    this action does not control). This action only asserts that some
    0x00220221 recv happened; the parsed id is reported in `detail` for
    every name but never gated on, since only that one (name, id-range)
    pair is actually justified by a live observation -- per this task's
    contract, "only assert the one you can justify, else just assert a
    0x00220221 recv happened"."""
    if name not in MAP_ENTRIES:
        raise ActionError(f"unknown select_map name '{name}', known: {sorted(MAP_ENTRIES)}")
    entry = MAP_ENTRIES[name]
    t0 = time.monotonic()
    pre = _precondition(ctx, f"select_map:{name}", "room", _marker_check("room"))
    if pre:
        return pre
    steps = []
    if not ctx.dry_run:
        steps.append(click_at(ctx, SELECT_MAP_DROPDOWN))
    ok, gray, detail, score, shot, _ = wait_for(ctx, f"select_map-{name}-popup", 6.0, _marker_check("mapsel"))
    if not ok:
        return ActionResult(f"select_map:{name}", False, gray, time.monotonic() - t0,
                             f"選擇地圖 popup did not appear: {detail}", shot, score, steps)

    if ctx.dry_run:
        return ActionResult(f"select_map:{name}", True, False, time.monotonic() - t0,
                             f"dry-run: skipped clicking '{entry['label']}'", None, None, steps)

    base = _newest_log_ms(ctx.logs_dir)
    steps.append(click_at(ctx, entry["coords"]))
    ok, found, elapsed = wait_for_log_pkts(
        ctx, DEFAULT_MAP_SELECT_TIMEOUT_S,
        {"map_select": lambda e: e.get("dir") == "recv" and e.get("op") == MAP_SELECT_CQ_OPCODE},
        baseline_ms=base,
    )
    parsed = ""
    entry_pkt = found.get("map_select")
    if entry_pkt is not None:
        hexs = str(entry_pkt.get("hex", ""))
        if len(hexs) >= 6 and hexs[0:2] == "00":
            try:
                map_id = int(hexs[2:4], 16) + (int(hexs[4:6], 16) << 8)
                parsed = f" (parsed map id={map_id})"
            except ValueError:
                pass
    detail = (f"clicked '{entry['label']}' ({'tested' if entry['tested'] else 'UNTESTED coords'}); "
              f"{MAP_SELECT_CQ_OPCODE} recv: {'seen' if ok else 'MISSING'} (waited {elapsed:.1f}s){parsed}")
    return ActionResult(f"select_map:{name}", ok, False, time.monotonic() - t0, detail, None, None, steps)


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
    confirm the battle HUD is up (_battle_any_check(), see
    screens.battle_hud_state() -- map-independent, added 2026-09-20 this
    task; the old single-map _marker_check("battle") is not, see its own
    comment) and then that the console is open on top of it, against the
    battle-background console crops (console_state(variant="battle"), see
    screens.py -- the lobby-only crops used by open_console() do not
    generalize to a live battle background, see this task's report)."""
    t0 = time.monotonic()
    # start_battle completes on the server markers, which arrive before the client
    # has loaded the map (2026-09-19 run: loading screen still up), so wait for the
    # battle HUD here instead of a one-shot precondition.
    steps = []
    if not ctx.dry_run:
        ok, gray, detail, score, shot, _ = wait_for(ctx, "campaign_win_all-battle", 60.0, _battle_any_check())
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


def campaign_fail(ctx):
    """Triggered by: opening the client console (F24) once in battle, then
    running the ZPvePlayercontroller exec `GameCampaign 2` ("mission failed",
    see ZModePve/ZPvePlayercontroller.uc:904 and docs/reference/console-
    commands.md) exactly once -- the failure counterpart to
    campaign_win_all()'s `GameCampaign 1` loop.

    dispatch/lobby.dispatch.js's Campaign_CN handler (case 0x00230139) only
    runs its R-ROUND round-advance branch for action===1
    (PVE_ROUND_ADVANCE_MODE, see the comment right above that case); action===2
    is explicitly left untouched and falls straight through to a single
    EndGame_SN broadcast that is logged with console.log only, not
    packetlog.marker() -- so unlike campaign_win_all there is no
    'R-ROUND: ...' text marker to poll here (confirmed by reading that
    handler for this task, not guessed). Completion is instead read straight
    off the session log's own packet record: an {ev:'pkt', dir:'send',
    op:'0x00222213', ...} line (EndGame_SN), via wait_for_log_pkts() -- this
    task's contract asked for exactly this fallback when no marker exists.

    🟡 not run live yet -- only campaign_win_all's GameCampaign 1 path has an
    actual [TEST] result (docs/journal/2026-09-19-2230-unattended-trial-01.md).

    Battle-HUD-up check uses _battle_any_check() (screens.battle_hud_state(),
    map-independent, 2026-09-20 this task) instead of the single-map
    _marker_check("battle")."""
    t0 = time.monotonic()
    steps = []
    if not ctx.dry_run:
        ok, gray, detail, score, shot, _ = wait_for(ctx, "campaign_fail-battle", 60.0, _battle_any_check())
        if not ok:
            return ActionResult("campaign_fail", False, gray, time.monotonic() - t0,
                                 f"battle HUD not seen within 60s: {detail}", shot, score, steps)
        st, _w = screens.console_prompt_state(take_screenshot(ctx, "campaign_fail-console-pre"))
        if st == "unknown":
            return ActionResult("campaign_fail", False, True, time.monotonic() - t0,
                                 f"console prompt state unknown before F24 (white_px={_w})", None, float(_w), steps)
        if st == "closed":
            steps.append(key(ctx, "F24"))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "campaign_fail-console", 5.0, _console_check("open", variant="battle"))
    if not ok:
        return ActionResult("campaign_fail", False, gray, time.monotonic() - t0,
                             f"console did not open over the battle HUD: {detail}", shot, score, steps)

    if ctx.dry_run:
        return ActionResult("campaign_fail", True, False, time.monotonic() - t0,
                             "dry-run: skipped the GameCampaign 2 send", None, None, steps)

    base = _newest_log_ms(ctx.logs_dir)
    steps.append(type_text(ctx, "GameCampaign 2"))
    steps.append(key(ctx, "ENTER"))
    ok, found, elapsed = wait_for_log_pkts(
        ctx, CAMPAIGN_FAIL_ENDGAME_TIMEOUT_S,
        {"endgame": lambda e: e.get("dir") == "send" and e.get("op") == "0x00222213"},
        baseline_ms=base,
    )
    detail = f"EndGame_SN 0x00222213 send: {'seen' if ok else 'MISSING'} (waited {elapsed:.1f}s, no marker exists for action=2)"
    return ActionResult("campaign_fail", ok, False, time.monotonic() - t0, detail, None, None, steps)


def deltest(ctx, wait_s=DEFAULT_DELTEST_WAIT_S):
    """Triggered by: opening the client console (F24) once in battle, then
    running the ZModePve exec `delTest` exactly once (docs/reference/console-
    commands.md: "場上所有機體（包括自己）KilledBy(none)" -- 🟡 read from
    source only, never run live before this task either).

    delTest is deliberately NOT added to console_cmd()'s CONSOLE_CMD_WHITELIST
    -- this task's contract asked for it "in the console whitelist ONLY for
    this action", so it is hardcoded here instead, unreachable through the
    generic console_cmd(text) action or any other experiment file.

    Completion is best-effort and always ok=True (a delTest that kills no one
    -- e.g. an empty room -- is not a runner failure): after sending, it waits
    wait_s and then counts Death_CN 0x00230123 recv / Death_SN 0x00230124 send
    packets in the session log since the send (dispatch/lobby.dispatch.js's
    case 0x00230123, its "Broadcast/Sent Death_SN 0x00230124" log lines) --
    the counts requested by this task's report go in `detail`.

    🟡 mark: this action must never be run against a live session without an
    explicit go-ahead (see its experiment file's own 🟡 note)."""
    t0 = time.monotonic()
    steps = []
    if not ctx.dry_run:
        ok, gray, detail, score, shot, _ = wait_for(ctx, "deltest-battle", 60.0, _battle_any_check())
        if not ok:
            return ActionResult("deltest", False, gray, time.monotonic() - t0,
                                 f"battle HUD not seen within 60s: {detail}", shot, score, steps)
        st, _w = screens.console_prompt_state(take_screenshot(ctx, "deltest-console-pre"))
        if st == "unknown":
            return ActionResult("deltest", False, True, time.monotonic() - t0,
                                 f"console prompt state unknown before F24 (white_px={_w})", None, float(_w), steps)
        if st == "closed":
            steps.append(key(ctx, "F24"))
    ok, gray, detail, score, shot, _ = wait_for(ctx, "deltest-console", 5.0, _console_check("open", variant="battle"))
    if not ok:
        return ActionResult("deltest", False, gray, time.monotonic() - t0,
                             f"console did not open over the battle HUD: {detail}", shot, score, steps)

    if ctx.dry_run:
        return ActionResult("deltest", True, False, time.monotonic() - t0,
                             f"dry-run: skipped delTest send + {wait_s}s Death_CN/Death_SN wait", None, None, steps)

    base = _newest_log_ms(ctx.logs_dir)
    steps.append(type_text(ctx, "delTest"))
    steps.append(key(ctx, "ENTER"))
    time.sleep(wait_s)
    pkts = find_pkts_since(ctx.logs_dir, base)
    death_cn = [p for p in pkts if p.get("dir") == "recv" and p.get("op") == "0x00230123"]
    death_sn = [p for p in pkts if p.get("dir") == "send" and p.get("op") == "0x00230124"]
    detail = (f"delTest sent; after {wait_s}s: Death_CN(recv 0x00230123)={len(death_cn)}, "
              f"Death_SN(send 0x00230124)={len(death_sn)}")
    return ActionResult("deltest", True, False, time.monotonic() - t0, detail, None, None, steps)


def keepalive_wait(ctx, seconds, interval_s=DEFAULT_KEEPALIVE_INTERVAL_S):
    """Triggered by nothing the player would see -- a deliberate idle wait
    (e.g. sitting in the lobby before a shop pass, to reproduce how long an
    unattended session can actually be left alone) that periodically sends a
    zero-net mouse move (mouse_wiggle(), see above) so the client's own
    AFK-kick idle timer does not fire and dim the screen with the 提示 popup
    (docs/journal/2026-09-19-2230-unattended-trial-01.md's
    「因長時間未動作，所以被強制退場」 -- ~80s observed once, exact timer
    unconfirmed).

    🟡 [GUESS], not DLL-backed: this task did not read the client's idle-timer
    / input-handling source, so no specific key is claimed to be a confirmed
    no-op in lobby/room/shop. A mouse move (no click) was chosen over a key
    press because every key this module already knows how to send has some
    in-game effect in at least one of those three screens (F1-F12 hotkeys,
    ESC closes dialogs/menus, ENTER submits chat/buttons/dialogs, arrow keys
    likely navigate menus, F24 opens the console) -- this task's contract
    explicitly sanctions the mouse-wiggle fallback for exactly this case.
    Whether the idle timer actually resets on a cursor move with no click is
    itself unconfirmed ⬜ -- a PASS on U-shop-tabs-idle only shows the client
    did not show the AFK popup during the wait, not which specific mechanism
    (if any) caused that; do not upgrade this reasoning past 🟡 without an
    operator watching it live or reading the relevant UnrealScript."""
    t0 = time.monotonic()
    if ctx.dry_run:
        return ActionResult("keepalive_wait", True, False, 0.0,
                             f"dry-run: would idle {seconds}s, mouse_wiggle every {interval_s}s", None, None, [])
    steps = []
    elapsed = 0.0
    while elapsed < seconds:
        chunk = min(interval_s, seconds - elapsed)
        time.sleep(chunk)
        elapsed += chunk
        steps.extend(mouse_wiggle(ctx))
    return ActionResult("keepalive_wait", True, False, time.monotonic() - t0,
                         f"idled {seconds}s, sent {len(steps) // 2} keepalive ping(s) every {interval_s}s",
                         None, None, steps)


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


def login(ctx, account):
    """Triggered by: switching the client's IME to English (IME_EN pseudo-
    command, pico_serial.ps1 -- same PostMessage WM_INPUTLANGCHANGEREQUEST
    technique as tools/win/input.ps1's ToEnglish(), duplicated there because
    pico_serial.ps1 is a standalone script copied to Windows and run on its
    own, see that script's header comment), clicking the 帳號 field, typing
    the account name, TAB, typing a dummy password (server has no password
    check -- see LOGIN_DUMMY_PASSWORD above), ENTER. Exact sequence from this
    task's contract (client (777,829), TYPE <account>, KEY TAB, TYPE x, KEY
    ENTER), which the 2026-09-19 relaunch trial click-tested live for account
    "Lucas" (docs/journal/2026-09-19-2230-unattended-trial-01.md).

    Completion requires BOTH: the server actually receiving CQ_LOGIN_WASABII
    (LOGIN_CQ_OPCODE above, via wait_for_log_pkts -- no packetlog.marker()
    exists for this opcode, same situation as campaign_fail()'s EndGame_SN)
    AND the client showing the lobby screen afterwards (classify_screen).
    Either alone would be weaker: the pkt could arrive but the client UI
    could still be stuck, or some other screen could misclassify as "lobby"
    without the login pkt ever having gone through."""
    if not account or not all(0x20 <= ord(c) <= 0x7E for c in account):
        raise ActionError("login account must be non-empty printable ASCII")
    t0 = time.monotonic()
    # A freshly launched client shows the splash first; the login screen can take
    # ~30 s to appear (2026-09-20 relaunch run), so wait instead of a one-shot check.
    if ctx.dry_run:
        pre = _precondition(ctx, "login", "login", _screen_check("login"))
        if pre:
            return pre
    else:
        okl, grayl, detl, scorel, shotl, _ = wait_for(ctx, "login-screen", 60.0, _screen_check("login"))
        if not okl:
            return ActionResult("login", False, grayl, time.monotonic() - t0,
                                 f"login screen not shown within 60s: {detl}", shotl, scorel, [])
    steps = []
    # IME_EN (WM_INPUTLANGCHANGEREQUEST) did NOT stop the Bopomofo IME from eating
    # the account text live on 2026-09-20 (client showed 「ID、密碼只能使用0~9、a~z、
    # A~Z」). The IME's own Chinese/English mode is toggled by a SHIFT tap, but its
    # current mode is not observable beforehand, so: try once; if that exact notice
    # appears, dismiss it, tap SHIFT once, try again; a second failure stops.
    ok_pkt, found, elapsed_pkt = False, {}, 0.0
    for attempt in range(2):
        base = None if ctx.dry_run else _newest_log_ms(ctx.logs_dir)
        if not ctx.dry_run:
            steps.append(run_pico(ctx, "raw", "IME_EN"))
            steps.append(click_at(ctx, LOGIN_ACCOUNT_FIELD))
            steps.append(type_text(ctx, account))
            steps.append(key(ctx, "TAB"))
            steps.append(type_text(ctx, LOGIN_DUMMY_PASSWORD))
            steps.append(key(ctx, "ENTER"))
        ok_pkt, found, elapsed_pkt = wait_for_log_pkts(
            ctx, DEFAULT_LOGIN_TIMEOUT_S if attempt else 8.0,
            {"login_cq": lambda e: e.get("dir") == "recv" and e.get("op") == LOGIN_CQ_OPCODE},
            baseline_ms=base,
        )
        if ok_pkt or ctx.dry_run or attempt == 1:
            break
        present, nscore = screens.detect_marker(take_screenshot(ctx, f"login-attempt{attempt}-notice"), "notice_popup")
        if not present:
            break
        steps.append(click_at(ctx, NOTICE_CONFIRM_BUTTON))
        time.sleep(1.0)
        steps.append(key(ctx, "SHIFT"))
    ok_lobby, gray, detail_lobby, score, shot, _ = wait_for(ctx, "login-lobby", 15.0, _screen_check("lobby"))
    ok = ok_pkt and ok_lobby
    detail = (f"login_cq({LOGIN_CQ_OPCODE}) recv: {'seen' if ok_pkt else 'MISSING'} "
              f"(waited {elapsed_pkt:.1f}s); lobby: {detail_lobby}")
    return ActionResult("login", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def relaunch_client(ctx, account, reason="planned unattended relaunch"):
    """Triggered by nothing the player does -- a PLANNED relaunch (this task's
    contract: "separate from crash recovery budget"), composed of two layers:
    client_ctl.py's `relaunch` subcommand (process bookkeeping -- close the
    client if present via a real Pico click on the title-bar close X, since
    taskkill/Stop-Process are denied on this elevated client, see
    client_ctl.py's module docstring -- then launch, then wait for the REAL
    game window) followed by login(account) above. client_ctl.py's `relaunch`
    deliberately does NOT log in itself (same boundary as `restart` already
    had: "登入是後面的 Pico 步驟做的事") -- login() is called here as a second,
    independent step so it stays reusable on its own (e.g. a login screen
    reached some other way) instead of being wired only into a relaunch.

    Tracked in client_ctl.py's own client_relaunch_count session field, never
    touching client_restart_count / client_last_restart_step -- a planned
    relaunch must never count against, or be blocked by, the crash-recovery
    budget (RESTART_LIMIT / same-step dedup) that exists to stop an automatic
    crash loop."""
    t0 = time.monotonic()
    steps = []
    if ctx.dry_run:
        login_result = login(ctx, account)
        detail = (f"dry-run: would run `client_ctl.py relaunch --reason {reason!r}`, "
                  f"then login({account!r}): {login_result.detail}")
        return ActionResult("relaunch_client", login_result.ok, login_result.gray,
                             time.monotonic() - t0, detail, login_result.screenshot,
                             login_result.score, steps, login_result.rounds)

    proc = subprocess.run(
        [sys.executable, CLIENT_CTL, "relaunch", "--reason", reason],
        capture_output=True, text=True,
    )
    steps.append((proc.returncode, proc.stdout.strip(), proc.stderr.strip(), 0.0))
    if proc.returncode != 0:
        detail = (f"client_ctl.py relaunch failed (rc={proc.returncode}): "
                  f"{proc.stdout.strip()} {proc.stderr.strip()}")
        return ActionResult("relaunch_client", False, False, time.monotonic() - t0, detail, None, None, steps)

    login_result = login(ctx, account)
    detail = f"client_ctl.py relaunch: OK; login: {login_result.detail}"
    return ActionResult("relaunch_client", login_result.ok, login_result.gray,
                         time.monotonic() - t0, detail, login_result.screenshot,
                         login_result.score, steps + login_result.steps, login_result.rounds)


def focus_client(ctx, client_id):
    """Triggered by nothing the player does -- an internal step for
    dual-client unattended runs (docs/research/2026-09-20-dual-pico/
    design.md I6), called before any action that needs to send input to a
    SPECIFIC instance when more than one is running. Implements section 0
    rule 7's fixed switch order, each step gating the next (any failure
    halts here, returns ok=False -- no retry, no stealing focus again):

      1. Change the foreground process name pico_serial.ps1's gate accepts,
         via `pico_ctl.py session set-proc <name>` (writes active_proc into
         the shared .pico_session file -- see pico_ctl.py's
         run_serial_commands()/_serial_cmd_extra_args()). Requires an
         already-open session (same require_session() gate every other
         pico_ctl.py input command uses).
      2. SetForegroundWindow on that instance's window, via
         `tools/win/shot.sh --proc <name>` (screen.ps1 does this as a side
         effect of capturing a screenshot -- see take_screenshot()'s `proc`
         param).
      3. Read back the ACTUAL foreground process via client_ctl.py's
         `foreground` subcommand -- a plain Win32 GetForegroundWindow()
         query that sends no input and is not itself gated. Polled up to
         FOCUS_FOREGROUND_READBACK_TIMEOUT_S (re-reading, never re-calling
         SetForegroundWindow -- see that constant's comment for the
         2026-09-21 'dwm' transient that made a single immediate read
         racy). Only if a read equals the target proc_name does
         ctx.active_client get updated, which is what
         _require_focused_client() (the guard every click_at/key/type_text/
         mouse_wiggle call makes) checks before allowing any input through.
         If the timeout elapses without a match, this fails outright (no
         retry of the whole switch, no re-focus attempt).

    client_id must be a key in ctx.clients (a dict of id -> ClientState,
    populated by the caller -- not by this function). Every existing
    single-client script never populates ctx.clients, so this action is
    simply never called in that case; nothing else in this module changes
    behavior as a result of this function existing (see
    _require_focused_client()'s and take_screenshot()'s docstrings for the
    two places that would otherwise be affected)."""
    t0 = time.monotonic()
    if client_id not in ctx.clients:
        detail = f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})"
        return ActionResult("focus_client", False, False, time.monotonic() - t0, detail, None, None, [])
    inst = ctx.clients[client_id]

    if ctx.dry_run:
        ctx.active_client = client_id
        detail = f"dry-run: would focus {client_id!r} ({inst.proc_name})"
        return ActionResult("focus_client", True, False, time.monotonic() - t0, detail, None, None, [])

    steps = []
    rc, out, err, elapsed = run_pico(ctx, "session", "set-proc", inst.proc_name)
    steps.append((rc, out, err, elapsed))
    if rc != 0:
        detail = f"session set-proc {inst.proc_name!r} failed (rc={rc}): {out} {err}"
        return ActionResult("focus_client", False, False, time.monotonic() - t0, detail, None, None, steps)

    shot_path = None
    try:
        shot_path = take_screenshot(ctx, f"focus-{client_id}", proc=inst.proc_name)
    except ActionError as ex:
        detail = f"shot.sh --proc {inst.proc_name} failed: {ex}"
        return ActionResult("focus_client", False, False, time.monotonic() - t0, detail, None, None, steps)

    # Poll the readback -- see FOCUS_FOREGROUND_READBACK_TIMEOUT_S's comment
    # above for why a single immediate read is racy. SetForegroundWindow was
    # already called exactly once, above (as a side effect of the
    # take_screenshot() call); nothing in this loop calls it again -- it
    # only re-reads via client_ctl.py's `foreground`, which sends no input
    # and does not touch the OS foreground window.
    readback_start = time.monotonic()
    readback_deadline = readback_start + FOCUS_FOREGROUND_READBACK_TIMEOUT_S
    actual = None
    fg_proc = None
    while True:
        fg_proc = subprocess.run([sys.executable, CLIENT_CTL, "foreground"],
                                  capture_output=True, text=True, timeout=15)
        steps.append((fg_proc.returncode, fg_proc.stdout.strip(), fg_proc.stderr.strip(), 0.0))
        actual = fg_proc.stdout.strip() if fg_proc.returncode == 0 else None
        if actual == inst.proc_name:
            break
        if time.monotonic() >= readback_deadline:
            break
        time.sleep(FOCUS_FOREGROUND_READBACK_POLL_INTERVAL_S)
    if actual != inst.proc_name:
        waited_s = time.monotonic() - readback_start
        detail = (f"foreground readback mismatch after SetForegroundWindow: expected "
                  f"{inst.proc_name!r}, last got {actual!r} after polling {waited_s:.1f}s "
                  f"(rc={fg_proc.returncode}, raw stdout={fg_proc.stdout.strip()!r} "
                  f"stderr={fg_proc.stderr.strip()!r})")
        return ActionResult("focus_client", False, False, time.monotonic() - t0, detail, shot_path, None, steps)

    ctx.active_client = client_id
    detail = f"focused {client_id!r} ({inst.proc_name}), foreground confirmed"
    return ActionResult("focus_client", True, False, time.monotonic() - t0, detail, shot_path, None, steps)


def _focus_or_fail(ctx, action_name, client_id, t0):
    """Shared first step for every per-client dual-run action below (design.md
    section 0 rule 7): each action calls focus_client(id) itself rather than
    trusting an earlier step in the same script to have already focused it,
    since a script can interleave actions across two instances in any order.
    Returns (steps, None) if focus succeeded (steps is focus_client()'s own
    steps list, for the caller to prepend to its own), or (steps,
    ActionResult) with a ready-to-return failure result if client_id is
    unknown or focus_client() itself failed -- fail closed, no input sent
    either way."""
    if client_id not in ctx.clients:
        detail = f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})"
        return [], ActionResult(action_name, False, False, time.monotonic() - t0, detail, None, None, [])
    focus_result = focus_client(ctx, client_id)
    if not focus_result.ok:
        detail = f"focus_client({client_id!r}) failed: {focus_result.detail}"
        return focus_result.steps, ActionResult(
            action_name, False, focus_result.gray, time.monotonic() - t0, detail,
            focus_result.screenshot, focus_result.score, focus_result.steps,
        )
    return focus_result.steps, None


# ---------------------------------------------------------------------------
# Dual-client actions proper (docs/research/2026-09-20-dual-pico/design.md
# section 3). See the constants block above focus_client() for the opcodes/
# coordinates each of these uses and their evidence.
# ---------------------------------------------------------------------------
def launch_client(ctx, client_id):
    """Triggered by nothing the player does -- starts one dual-client
    instance's game process via its own launcher (design.md section 1's
    CLIENTS table: host -> the copy install's "Play Second Client.bat",
    joiner -> the main install's "Play With Log.bat"; both already use
    '-log=' per the v3 launcher decision so their run-*.log is resolvable
    later, see client_ctl.py's resolve_run_log()). Does NOT close an
    existing process first -- runner.py's preflight (check_no_residual_
    process) is what refuses the whole run before anything starts if this
    instance already has one; client_ctl.py's `launch` subcommand also
    independently refuses (BLOCKED, session halted) if it finds one anyway,
    rather than silently reusing or replacing it.

    Completion (design.md section 3, PM revision, 120s nominal): the
    process exists AND its real game window was found -- client_ctl.ps1's
    existing wait_ready action (largest visible window, CLIENT area >=
    1600x1200, not Process.MainWindowHandle -- see that script's own
    comment on why a freshly launched client's splash window is not
    enough). This action does NOT wait on the run-*.log header or a screen
    classification (design.md L4: the log is locked for reading the whole
    time the client is open; L2: a second instance's screenshot can catch
    the splash before the real window exists) -- those are left to
    login_as() and to post-close log reads."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    inst = ctx.clients[client_id]
    t0 = time.monotonic()
    if ctx.dry_run:
        detail = (f"dry-run: would client_ctl.py launch --id {client_id} --proc {inst.proc_name} "
                  f"--bat {inst.bat_path_win}")
        return ActionResult("launch_client", True, False, time.monotonic() - t0, detail, None, None, [])

    args = [sys.executable, CLIENT_CTL, "launch", "--id", client_id, "--proc", inst.proc_name,
            "--bat", inst.bat_path_win]
    if inst.install_dir_win:
        args += ["--install", inst.install_dir_win]
    proc = subprocess.run(args, capture_output=True, text=True, timeout=130)
    steps = [(proc.returncode, proc.stdout.strip(), proc.stderr.strip(), 0.0)]
    ok = proc.returncode == 0
    if ok:
        ctx.clients[client_id].launch_time_ms = time.time() * 1000
    detail = (f"client_ctl.py launch --id {client_id}: rc={proc.returncode} "
              f"{proc.stdout.strip()} {proc.stderr.strip()}")
    return ActionResult("launch_client", ok, False, time.monotonic() - t0, detail, None, None, steps)


def close_client(ctx, client_id):
    """Triggered by nothing the player does -- ends a dual-client instance's
    game process at the end of a scripted run (design.md section 9b). The
    ONLY supported way to close this elevated client is a real Pico click
    on its title-bar close X (taskkill/Stop-Process are denied, see
    client_ctl.py's module docstring), and that click's coordinates are
    relative to whichever window is currently in the foreground -- so this
    action ALWAYS calls focus_client(id) itself first (via _focus_or_fail(),
    same as every other per-client action here), rather than trusting a
    caller to have focused it already, halting here (never touching the
    mouse) if that focus switch does not land on the right window.

    Completion (design.md section 3, 30s nominal): the process is gone
    (client_ctl.py's own get_status()/wait_exit, done Windows-side by
    client_ctl.ps1) -- not a screenshot (there may be no window left to
    screenshot). Reading the client's own run-*.log (e.g. for the netspeed
    value) is deliberately NOT done here -- that log is locked for reading
    the whole time the process is open (design.md L4) and must only be read
    after this action reports ok=True."""
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "close_client", client_id, t0)
    if fail:
        return fail
    inst = ctx.clients[client_id]

    if ctx.dry_run:
        detail = (f"dry-run: would client_ctl.py close --id {client_id} --proc {inst.proc_name} "
                  f"--bat {inst.bat_path_win}")
        return ActionResult("close_client", True, False, time.monotonic() - t0, detail, None, None, steps)

    args = [sys.executable, CLIENT_CTL, "close", "--id", client_id, "--proc", inst.proc_name,
            "--bat", inst.bat_path_win]
    proc = subprocess.run(args, capture_output=True, text=True, timeout=45)
    steps = steps + [(proc.returncode, proc.stdout.strip(), proc.stderr.strip(), 0.0)]
    ok = proc.returncode == 0
    detail = (f"client_ctl.py close --id {client_id}: rc={proc.returncode} "
              f"{proc.stdout.strip()} {proc.stderr.strip()}")
    return ActionResult("close_client", ok, False, time.monotonic() - t0, detail, None, None, steps)


def login_as(ctx, client_id, account):
    """Triggered by: the same login flow as login() above, but for one
    instance of a dual-client run (design.md section 3): focus_client(id)
    first, then explicitly clear whatever is already in the 帳號 field --
    HOME (cursor to start) + ACCOUNT_FIELD_CLEAR_KEYPRESSES DELETEs, see
    that constant's comment for why this (not a literal select-all, which
    this module cannot send) -- before typing, because this action may run
    more than once against the same already-launched instance across a
    script (e.g. a relaunch), and a plain click+type on top of leftover
    text from a PREVIOUS account would mangle both instead of overwriting
    (design.md section 3 row 1's explicit warning).

    Completion (design.md section 3, 90s nominal) requires BOTH: the server
    receiving CQ_LOGIN_WASABII (LOGIN_CQ_OPCODE, same opcode as login())
    AND the client showing the lobby screen afterwards -- same two-signal
    reasoning as login()'s own docstring. On success this ALSO resolves and
    stores this instance's conn id (resolve_conn_id(), design.md section 4)
    into ctx.clients[client_id].conn_id/.account, which every later
    per-client pkt-based completion condition in this module filters on."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    if not account or not all(0x20 <= ord(c) <= 0x7E for c in account):
        raise ActionError("login_as account must be non-empty printable ASCII")
    t0 = time.monotonic()

    steps, fail = _focus_or_fail(ctx, "login_as", client_id, t0)
    if fail:
        return fail

    # A freshly launched client shows the splash first; the login screen can take
    # ~30 s to appear (2026-09-20 relaunch run), so wait instead of a one-shot check.
    if ctx.dry_run:
        pre = _precondition(ctx, "login_as", "login", _screen_check("login"))
        if pre:
            pre.steps = steps + pre.steps
            return pre
    else:
        okl, grayl, detl, scorel, shotl, _ = wait_for(ctx, "login_as-screen", 60.0, _screen_check("login"))
        if not okl:
            return ActionResult("login_as", False, grayl, time.monotonic() - t0,
                                 f"login screen not shown within 60s: {detl}", shotl, scorel, steps)

    # Same IME_EN + notice-popup + SHIFT retry dance as login() above.
    ok_pkt, found, elapsed_pkt, base = False, {}, 0.0, None
    for attempt in range(2):
        base = None if ctx.dry_run else _newest_log_ms(ctx.logs_dir)
        if not ctx.dry_run:
            steps.append(run_pico(ctx, "raw", "IME_EN"))
            steps.append(click_at(ctx, LOGIN_ACCOUNT_FIELD))
            steps.append(key(ctx, "HOME"))
            for _ in range(ACCOUNT_FIELD_CLEAR_KEYPRESSES):
                steps.append(key(ctx, "DELETE"))
            steps.append(type_text(ctx, account))
            steps.append(key(ctx, "TAB"))
            steps.append(type_text(ctx, LOGIN_DUMMY_PASSWORD))
            steps.append(key(ctx, "ENTER"))
        ok_pkt, found, elapsed_pkt = wait_for_log_pkts(
            ctx, DEFAULT_LOGIN_TIMEOUT_S if attempt else 8.0,
            {"login_cq": lambda e: e.get("dir") == "recv" and e.get("op") == LOGIN_CQ_OPCODE},
            baseline_ms=base,
        )
        if ok_pkt or ctx.dry_run or attempt == 1:
            break
        present, nscore = screens.detect_marker(
            take_screenshot(ctx, f"login_as-{client_id}-attempt{attempt}-notice"), "notice_popup")
        if not present:
            break
        steps.append(click_at(ctx, NOTICE_CONFIRM_BUTTON))
        time.sleep(1.0)
        steps.append(key(ctx, "SHIFT"))

    ok_lobby, gray, detail_lobby, score, shot, _ = wait_for(ctx, "login_as-lobby", 15.0, _screen_check("lobby"))
    ok = ok_pkt and ok_lobby

    conn_id = None
    if ok_pkt and not ctx.dry_run:
        conn_id = resolve_conn_id(ctx.logs_dir, account, base if base is not None else 0)
        ctx.clients[client_id].account = account
        ctx.clients[client_id].conn_id = conn_id

    detail = (f"login_cq({LOGIN_CQ_OPCODE}) recv: {'seen' if ok_pkt else 'MISSING'} "
              f"(waited {elapsed_pkt:.1f}s); lobby: {detail_lobby}; conn_id={conn_id}")
    return ActionResult("login_as", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def join_room(ctx, client_id, room_name):
    """Triggered by: double-clicking a room row in the lobby room list --
    dispatch/gate.game.dispatch.js's own comment on Enter_CQ 0x00220231
    names this exact client action. See ROOM_LIST_FIRST_ROW_CLICK's comment
    above for the coordinate's derivation and HIGH-RISK UNTESTED status --
    this action assumes exactly one room is visible (the one the host just
    created); `room_name` is carried through only for logging/traceability,
    never used to pick a specific row (no OCR/text-matching exists here).

    Completion (design.md section 3, 45s nominal): Enter_SA (ENTER_SA_
    OPCODE, send, filtered to this instance's conn_id from login_as())
    parsed for success (body +0x00 u16 status == 0) -- NOT just "some
    Enter_SA arrived", since a 1/1 failure body (room not found/full/wrong
    password/already playing) means the double-click did NOT actually join
    anything and continuing the script would be pointless. Room marker (or
    its NOTICE popup) is the secondary signal."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "join_room", client_id, t0)
    if fail:
        return fail

    pre = _precondition(ctx, "join_room", "lobby", _screen_check("lobby"))
    if pre:
        pre.steps = steps + pre.steps
        return pre

    if ctx.dry_run:
        detail = (f"dry-run: would double-click room list row {ROOM_LIST_FIRST_ROW_CLICK} "
                  f"to join {room_name!r} (UNTESTED coordinate, see docstring)")
        return ActionResult("join_room", True, False, time.monotonic() - t0, detail, None, None, steps)

    conn_id = ctx.clients[client_id].conn_id
    base = _newest_log_ms(ctx.logs_dir)
    steps.append(double_click_at(ctx, ROOM_LIST_FIRST_ROW_CLICK))
    ok_pkt, found, elapsed = wait_for_log_pkts(
        ctx, DEFAULT_JOIN_ROOM_TIMEOUT_S,
        {"enter_sa": lambda e: e.get("dir") == "send" and e.get("op") == ENTER_SA_OPCODE},
        baseline_ms=base, conn=conn_id,
    )
    success = None
    entry = found.get("enter_sa")
    if entry is not None:
        hexs = str(entry.get("hex", ""))
        if len(hexs) >= 4:
            success = hexs[0:4] == "0000"
    ok_room, gray, detail_room, score, shot, _ = wait_for(ctx, "join_room-room", 10.0, _room_or_notice_check())
    ok = ok_pkt and bool(success)
    detail = (f"double-clicked room list row {ROOM_LIST_FIRST_ROW_CLICK} (room_name={room_name!r}, "
              f"UNTESTED coordinate, not verified by any on-screen text match); "
              f"Enter_SA({ENTER_SA_OPCODE}) send (conn={conn_id}): "
              f"{'seen success' if success else ('seen FAILURE' if success is False else 'MISSING')} "
              f"(waited {elapsed:.1f}s); room/notice: {detail_room}")
    return ActionResult("join_room", ok, gray, time.monotonic() - t0, detail, shot, score, steps)


def set_ready(ctx, client_id):
    """Triggered by: pressing F5 while a non-host room member -- the client
    sends this as Game_Ready_CN 0x00222101 (same physical key F5 as the
    host's start_battle(), different serverside meaning depending on who
    presses it; see host_start_battle()'s docstring for the host's own F5
    path, Game_Start_CN 0x00222103, and READY-IMPL's own comment in
    dispatch/gate.game.dispatch.js confirming a non-host's F5 maps to
    0x00222101/"準備完畢").

    Completion (design.md section 3, 20s nominal): User_State_SN
    (USER_STATE_SN_OPCODE) send, filtered to this instance's conn_id (the
    broadcast includes the presser, see that opcode's comment above) -- not
    gated on the raw READY value (2) since design.md's table only asks for
    "對應 pkt", but the raw byte is reported in `detail` for traceability."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "set_ready", client_id, t0)
    if fail:
        return fail

    pre = _precondition(ctx, "set_ready", "room", _marker_check("room"))
    if pre:
        pre.steps = steps + pre.steps
        return pre

    if ctx.dry_run:
        return ActionResult("set_ready", True, False, time.monotonic() - t0,
                             "dry-run: would key F5 (ready)", None, None, steps)

    conn_id = ctx.clients[client_id].conn_id
    base = _newest_log_ms(ctx.logs_dir)
    steps.append(key(ctx, "F5"))
    ok, found, elapsed = wait_for_log_pkts(
        ctx, DEFAULT_SET_READY_TIMEOUT_S,
        {"user_state": lambda e: e.get("dir") == "send" and e.get("op") == USER_STATE_SN_OPCODE},
        baseline_ms=base, conn=conn_id,
    )
    raw = None
    entry = found.get("user_state")
    if entry is not None:
        hexs = str(entry.get("hex", ""))
        if len(hexs) >= 2:
            raw = hexs[0:2]
    shot = take_screenshot(ctx, "set_ready-result")
    detail = (f"User_State_SN({USER_STATE_SN_OPCODE}) send (conn={conn_id}): "
              f"{'seen raw=' + raw if ok else 'MISSING'} (waited {elapsed:.1f}s)")
    return ActionResult("set_ready", ok, False, time.monotonic() - t0, detail, shot, None, steps)


def host_start_battle(ctx, client_id="host"):
    """Triggered by: the host pressing F5 in the room -- Game_Start_CN
    0x00222103 (see set_ready()'s docstring for the non-host's different F5
    meaning). client_id defaults to "host" to match design.md section 1's
    CLIENTS table naming convention, but is a real parameter (not hardcoded)
    so a script can name its host instance differently.

    Completion (design.md section 3, 120s nominal): Game_Start_SN
    (GAME_START_SN_OPCODE) send, filtered to the HOST's own conn_id --
    design.md L1 explicitly says not to rely on the single-client
    start_battle()'s text markers ('gameStarted_ false -> true'/'Game_Start_SN
    sent') here, since packetlog.js's marker() calls carry no `conn` and
    cannot be attributed to one instance when two are running. D1-6-IMPL
    broadcasts Game_Start_SN to every room member via rooms.sendAll,
    including the host itself, so filtering on the host's own conn is valid."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "host_start_battle", client_id, t0)
    if fail:
        return fail

    pre = _precondition(ctx, "host_start_battle", "room", _marker_check("room"))
    if pre:
        pre.steps = steps + pre.steps
        return pre

    if ctx.dry_run:
        return ActionResult("host_start_battle", True, False, time.monotonic() - t0,
                             "dry-run: would key F5 (host start)", None, None, steps)

    conn_id = ctx.clients[client_id].conn_id
    base = _newest_log_ms(ctx.logs_dir)
    steps.append(key(ctx, "F5"))
    ok, found, elapsed = wait_for_log_pkts(
        ctx, DEFAULT_HOST_START_BATTLE_TIMEOUT_S,
        {"game_start_sn": lambda e: e.get("dir") == "send" and e.get("op") == GAME_START_SN_OPCODE},
        baseline_ms=base, conn=conn_id,
    )
    shot = take_screenshot(ctx, "host_start_battle-result")
    detail = (f"Game_Start_SN({GAME_START_SN_OPCODE}) send (conn={conn_id}): "
              f"{'seen' if ok else 'MISSING'} (waited {elapsed:.1f}s) -- conn-filtered pkt, "
              f"not the gameStarted_/Game_Start_SN-sent text markers (design.md L1)")
    return ActionResult("host_start_battle", ok, False, time.monotonic() - t0, detail, shot, None, steps)


def enter_battle(ctx, client_id):
    """Triggered by nothing the player does -- a pure wait for the joiner's
    own load-in flow after the host starts the match: loading screen ->
    ZSlotSelectPage (mech select) -> spawned in battle. This action sends NO
    click for "選機" -- see CHANGE_SLOT_CN_OPCODE's comment above for the
    [LOG] evidence that ChangeSlot_CN/Respawn_CN are sent automatically by
    the client (an ~18s gap after Game_Start_SN, no pico input in between,
    session-20260920-114648.jsonl). 🟡 residual risk: that evidence is only
    for the HOST's own account in a solo PvE match, never observed yet for a
    second/joining account -- if the joiner's account instead shows an
    interactive ZSlotSelectPage requiring a real click, this action will
    time out with no click sent (fail closed, matching design.md L6's "沒
    定義就會在非預期畫面卡住" -- better an explicit timeout here than an
    invented, unverified click).

    Completion (design.md section 3, 120s nominal): ChangeSlot_CN or
    Respawn_CN recv, filtered to this instance's conn_id. Battle HUD
    (screens.battle_hud_state(), map-independent, see campaign_win_all's
    docstring) is the secondary signal."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "enter_battle", client_id, t0)
    if fail:
        return fail

    if ctx.dry_run:
        return ActionResult("enter_battle", True, False, time.monotonic() - t0,
                             "dry-run: would wait for loading -> auto mech-select -> battle "
                             "(no click sent, see docstring)", None, None, steps)

    conn_id = ctx.clients[client_id].conn_id
    base = _newest_log_ms(ctx.logs_dir)
    ok_pkt, found, elapsed = wait_for_log_pkts(
        ctx, DEFAULT_ENTER_BATTLE_TIMEOUT_S,
        {"spawn": lambda e: e.get("dir") == "recv" and e.get("op") in (CHANGE_SLOT_CN_OPCODE, RESPAWN_CN_OPCODE)},
        baseline_ms=base, conn=conn_id,
    )
    ok_hud, gray, detail_hud, score, shot, _ = wait_for(ctx, "enter_battle-hud", 15.0, _battle_any_check())
    detail = (f"ChangeSlot_CN/Respawn_CN recv (conn={conn_id}): {'seen' if ok_pkt else 'MISSING'} "
              f"(waited {elapsed:.1f}s, no click sent -- see docstring); battle HUD: {detail_hud}")
    return ActionResult("enter_battle", ok_pkt, gray, time.monotonic() - t0, detail, shot, score, steps)


def _console_cmd_on_allowed(text):
    return text in CONSOLE_CMD_ON_WHITELIST_EXACT or bool(NETSPEED_CMD_RE.match(text))


def console_cmd_on(ctx, client_id, text):
    """Triggered by: focus_client(id) -> F24 (open the console, only if not
    already open) -> type `text` -> ENTER -> ESC (close it again). `text` is
    restricted to CONSOLE_CMD_ON_WHITELIST_EXACT ("stat net"/"WeaponLog") or
    NETSPEED_CMD_RE ("netspeed <digits>") -- a separate whitelist from
    console_cmd()'s own CONSOLE_CMD_WHITELIST, see that constant's comment.

    Completion (design.md section 3, PM revision): the console open/closed
    PIXEL judgement (screens.console_prompt_state via _console_check(...,
    variant="battle"), the same white-pixel-count check campaign_win_all()/
    campaign_fail()/deltest() already use over a battle background) -- both
    the open transition (before typing) and the closed transition (after
    ESC) are gated; a screenshot taken right after typing+ENTER is saved as
    evidence but not itself gated on anything. Per design.md L4, NO log
    read is attempted here -- verifying what the command actually did (e.g.
    the 'Client netspeed is N' line) is deliberately left to a read of the
    run-*.log AFTER close_client() (see dual-netspeed.json's last step)."""
    if not _console_cmd_on_allowed(text):
        raise ActionError(
            f"console_cmd_on text {text!r} not in whitelist "
            f"({sorted(CONSOLE_CMD_ON_WHITELIST_EXACT)} or 'netspeed <digits>')"
        )
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "console_cmd_on", client_id, t0)
    if fail:
        return fail

    if ctx.dry_run:
        return ActionResult("console_cmd_on", True, False, time.monotonic() - t0,
                             f"dry-run: would F24 (if closed) -> TYPE {text!r} -> ENTER -> ESC",
                             None, None, steps)

    state, w = screens.console_prompt_state(take_screenshot(ctx, f"console_cmd_on-{client_id}-pre"))
    if state == "unknown":
        return ActionResult("console_cmd_on", False, True, time.monotonic() - t0,
                             f"console prompt state unknown before F24 (white_px={w})", None, float(w), steps)
    if state == "closed":
        steps.append(key(ctx, "F24"))
    ok_open, gray_open, detail_open, score_open, shot_open, _ = wait_for(
        ctx, f"console_cmd_on-{client_id}-open", 5.0, _console_check("open", variant="battle"))
    if not ok_open:
        return ActionResult("console_cmd_on", False, gray_open, time.monotonic() - t0,
                             f"console did not open: {detail_open}", shot_open, score_open, steps)

    steps.append(type_text(ctx, text))
    steps.append(key(ctx, "ENTER"))
    typed_shot = take_screenshot(ctx, f"console_cmd_on-{client_id}-typed")
    steps.append(key(ctx, "ESC"))
    ok_closed, gray_closed, detail_closed, score_closed, shot_closed, _ = wait_for(
        ctx, f"console_cmd_on-{client_id}-closed", DEFAULT_CONSOLE_CMD_ON_CLOSE_TIMEOUT_S,
        _console_check("closed", variant="battle"))

    detail = (f"typed {text!r} (whitelisted); console open: {detail_open}; "
              f"typed-evidence screenshot={typed_shot}; console closed: {detail_closed} "
              f"(no log read here -- see docstring, design.md L4)")
    ok = ok_open and ok_closed
    return ActionResult("console_cmd_on", ok, gray_closed, time.monotonic() - t0, detail, shot_closed,
                         score_closed, steps)


def leave_battle(ctx, client_id):
    """Triggered by: pressing ESC to open the in-battle menu, then clicking
    'leave' -- dispatch/gate.game.dispatch.js's own comment on Leave_CQ
    0x00222131 names this exact client action. See BATTLE_ESC_LEAVE_BUTTON's
    comment above for why its coordinate is this task's single LEAST
    confident click target (zero visual reference anywhere in this repo,
    unlike ROOM_LIST_FIRST_ROW_CLICK which at least has an old low-res
    screenshot to extrapolate from) -- if wrong, the ESC menu likely stays
    open and this action times out at DEFAULT_LEAVE_BATTLE_TIMEOUT_S with
    no further blind click attempted (fail closed, per design.md 第 8 節
    "遇到任何非預期畫面 -> 立即 halt，不重試").

    Completion (design.md section 3, 60s nominal): Leave_SA (LEAVE_SA_
    OPCODE), filtered to THIS instance's conn_id -- the only battle-leave
    pkt guaranteed to target the leaver itself (room-leave.js's
    handleBattleLeave() sends Leave_SN/EndGame_SN to the OTHER conn(s), see
    that opcode's own comment above, never to the leaver). Room screen (or
    its NOTICE popup) is the secondary signal."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "leave_battle", client_id, t0)
    if fail:
        return fail

    if ctx.dry_run:
        detail = (f"dry-run: would key ESC, click {BATTLE_ESC_LEAVE_BUTTON} "
                  f"(UNTESTED coordinate, see docstring)")
        return ActionResult("leave_battle", True, False, time.monotonic() - t0, detail, None, None, steps)

    conn_id = ctx.clients[client_id].conn_id
    base = _newest_log_ms(ctx.logs_dir)
    steps.append(key(ctx, "ESC"))
    time.sleep(1.0)
    steps.append(click_at(ctx, BATTLE_ESC_LEAVE_BUTTON))
    ok_pkt, found, elapsed = wait_for_log_pkts(
        ctx, DEFAULT_LEAVE_BATTLE_TIMEOUT_S,
        {"leave_sa": lambda e: e.get("dir") == "send" and e.get("op") == LEAVE_SA_OPCODE},
        baseline_ms=base, conn=conn_id,
    )
    ok_room, gray, detail_room, score, shot, _ = wait_for(ctx, "leave_battle-room", 10.0, _room_or_notice_check())
    detail = (f"ESC + click {BATTLE_ESC_LEAVE_BUTTON} (UNTESTED coordinate); "
              f"Leave_SA({LEAVE_SA_OPCODE}) send (conn={conn_id}): {'seen' if ok_pkt else 'MISSING'} "
              f"(waited {elapsed:.1f}s); room/notice: {detail_room}")
    return ActionResult("leave_battle", ok_pkt, gray, time.monotonic() - t0, detail, shot, score, steps)


def idle_nudge(ctx, client_id):
    """Triggered by nothing the player would see -- a defensive keepalive
    for design.md L5 (room-idle ~80s AFK self-kick, ZGUIController.uc:
    945-948): focus_client(id) then one harmless zero-net mouse_wiggle().

    Completion (design.md section 3, 10s nominal): focus_client's own
    foreground readback succeeding (returned via _focus_or_fail() above) --
    already fail-closed on its own -- AND no Leave_CQ (room-level self-leave,
    LEAVE_CQ_OPCODE) recv on this conn since the nudge started, i.e. this
    reports ok=False if the nudge appears to have arrived too late (the
    client already kicked itself out before/while this ran)."""
    if client_id not in ctx.clients:
        raise ActionError(f"unknown client id {client_id!r} (known: {sorted(ctx.clients)})")
    t0 = time.monotonic()
    steps, fail = _focus_or_fail(ctx, "idle_nudge", client_id, t0)
    if fail:
        return fail

    if ctx.dry_run:
        return ActionResult("idle_nudge", True, False, time.monotonic() - t0,
                             "dry-run: would mouse_wiggle", None, None, steps)

    conn_id = ctx.clients[client_id].conn_id
    base = _newest_log_ms(ctx.logs_dir)
    steps.extend(mouse_wiggle(ctx))
    left = False
    if conn_id is not None:
        left_pkts = find_pkts_since(ctx.logs_dir, base, conn=conn_id)
        left = any(e.get("dir") == "recv" and e.get("op") == LEAVE_CQ_OPCODE for e in left_pkts)
    detail = (f"mouse_wiggle sent, foreground confirmed by focus_client; "
              f"Leave_CQ({LEAVE_CQ_OPCODE}) recv since nudge (conn={conn_id}): "
              f"{'YES -- kicked before/during nudge' if left else 'none'}")
    return ActionResult("idle_nudge", not left, False, time.monotonic() - t0, detail, None, None, steps)


ACTIONS = {
    "goto_shop": goto_shop,
    "shop_tab": shop_tab,
    "back_to_lobby": back_to_lobby,
    "open_console": open_console,
    "close_console": close_console,
    "console_cmd": console_cmd,
    "dismiss_notice": dismiss_notice,
    "create_pve_room": create_pve_room,
    "select_map": select_map,
    "start_battle": start_battle,
    "campaign_win_all": campaign_win_all,
    "campaign_fail": campaign_fail,
    "deltest": deltest,
    "keepalive_wait": keepalive_wait,
    "wait_result_then_room": wait_result_then_room,
    "leave_room": leave_room,
    "login": login,
    "focus_client": focus_client,
    "relaunch_client": relaunch_client,
    "launch_client": launch_client,
    "close_client": close_client,
    "login_as": login_as,
    "join_room": join_room,
    "set_ready": set_ready,
    "host_start_battle": host_start_battle,
    "enter_battle": enter_battle,
    "console_cmd_on": console_cmd_on,
    "leave_battle": leave_battle,
    "idle_nudge": idle_nudge,
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
    # By mtime, not name: test runs can create newer-named session files while the
    # live server keeps writing an older-named one (2026-09-20: live 20260919-211100
    # vs test-created 20260920-000304).
    files = glob.glob(os.path.join(logs_dir, "session-*.jsonl"))
    return max(files, key=os.path.getmtime) if files else None


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


def find_pkts_since(logs_dir, since_ms, limit=200, conn=None):
    """Returns up to `limit` most recent {ev:'pkt', dir, op, len, hex, ...}
    lines (see packetlog.js's packet()) with ms > since_ms from the newest
    session log, oldest first. Same shape/semantics as find_markers_since()
    above but over raw packet records instead of {ev:'marker'} text -- used
    when no packetlog.marker() call exists for the signal this task needs
    (campaign_fail's EndGame_SN, deltest's Death_CN/Death_SN counts). Empty
    list (not an error) if there is no logs dir / file.

    conn (default None, docs/research/2026-09-20-dual-pico/design.md I7/
    section 4): when given, only entries whose 'conn' field equals it are
    returned -- packetlog.js's client.connId_, the one field that actually
    tells two simultaneous clients apart ('port' does not, see design.md
    section 4). Every existing caller omits this (conn=None means "no
    filtering, every connection"), so this parameter is purely additive."""
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
                if entry.get("ev") != "pkt":
                    continue
                if conn is not None and entry.get("conn") != conn:
                    continue
                if entry.get("ms", 0) <= since_ms:
                    continue
                out.append(entry)
    except OSError:
        return []
    return out[-limit:]


def resolve_conn_id(logs_dir, account, since_ms):
    """Finds `account`'s conn id from pkt records written after since_ms in
    the newest session log (docs/research/2026-09-20-dual-pico/design.md
    section 4: "ctx.accountId_／ctx.nickname_ 也在 pkt 裡，但登入前不會出現").
    The login_cq pkt itself (LOGIN_CQ_OPCODE, see login()) has an empty ctx
    -- the account name only shows up in ctx.nickname on pkts sent AFTER
    login succeeds (confirmed against a real session log 2026-09-20: the
    very next send pkts on that conn, e.g. 0x00210101, already carry
    {"accountId":1,"nickname":"Lucas"}) -- so this scans forward from
    since_ms for the first entry whose ctx.nickname exactly equals `account`
    and returns its 'conn' field.

    Exact string match only (no case-folding/partial match) -- account names
    are validated printable-ASCII elsewhere (see login()'s check) and two
    different accounts should never share a nickname on the same server.

    Returns the conn id (int) or None if no matching entry exists yet
    (caller should treat None as "not resolved yet", not as an error --
    there's a small window between login_cq itself and the first pkt
    carrying ctx.nickname)."""
    for entry in find_pkts_since(logs_dir, since_ms):
        c = entry.get("ctx") or {}
        if c.get("nickname") == account:
            return entry.get("conn")
    return None


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
