#!/usr/bin/env python3
"""
runner.py - Deterministic experiment runner for unattended Pico runs. No
model/LLM is ever called from this file: every step's pass/fail comes from
screens.py's numpy/PIL region comparisons and pico_ctl.py's own text replies
(OK / BLOCKED), decided by this script alone. The lead reads the report
afterwards; nothing here asks a model to look at a screenshot.

Usage:
  python3 runner.py run experiments/U-shop-tabs.json --dry-run
  python3 runner.py run experiments/U-shop-tabs.json
  python3 runner.py validate experiments/U-shop-tabs.json

An experiment file:
{
  "id": "U-shop-tabs",
  "purpose": "free-text, goes in the report",
  "preconditions": {"screen": "lobby"},
  "steps": [
    {"action": "goto_shop"},
    {"action": "shop_tab", "params": {"name": "aux"}},
    {"action": "back_to_lobby"}
  ],
  "stop_conditions": {"max_consecutive_failures": 1},
  "max_image_reviews": 0
}

`max_image_reviews` must be 0 (validated) -- this runner has no model hookup
to spend a review on; the field exists so a future runner can add one without
changing the experiment file schema.

Fail-closed: on the first failed precondition, failed step, or gray-zone
classification, the runner stops immediately, sends a raw RESET (release all
keys, best-effort), ends the pico session, and writes a FAIL report. It never
tries to recover or retry past that point -- same policy as
docs/reference/unattended.md 第 2 節.

Preflight (docs/research/2026-09-20-dual-pico/design.md 2b, PM 2026-09-20
decision): before `run` opens a real pico session or starts any client, it
runs run_preflight() -- a read-only check (resolution vs atlas, pico
foreground gate reachable, STOP file absent, no residual process per
instance) for every instance the experiment will use. Any failure there
stops the run before anything is touched (see docs/reference/
unattended-policy.md 丁類第一條: a read-only measurement task once started a
client, then could not close it because of exactly this resolution
mismatch). `preflight <exp>` runs only this check and exits, for manual/
scripted verification without running the experiment.
"""

import argparse
import json
import os
import re
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402
import client_ctl  # noqa: E402
import screens  # noqa: E402

REPORTS_DIR = os.path.join(SCRIPT_DIR, "logs", "reports")


# ---------------------------------------------------------------------------
# Experiment file validation (also used by --dry-run, and importable so a
# caller can validate without running).
# ---------------------------------------------------------------------------
class ExperimentError(Exception):
    pass


def load_experiment(path):
    with open(path, "r", encoding="utf-8") as f:
        exp = json.load(f)
    validate_experiment(exp)
    return exp


def validate_experiment(exp):
    for req in ("id", "purpose", "steps"):
        if req not in exp:
            raise ExperimentError(f"experiment missing required field '{req}'")
    if not isinstance(exp["id"], str) or not exp["id"]:
        raise ExperimentError("'id' must be a non-empty string")
    if not isinstance(exp["purpose"], str) or not exp["purpose"]:
        raise ExperimentError("'purpose' must be a non-empty string")
    if exp.get("max_image_reviews", 0) != 0:
        raise ExperimentError(
            "'max_image_reviews' must be 0 -- this runner has no model hookup "
            "(see module docstring); nonzero values are reserved for a future runner"
        )
    pre = exp.get("preconditions", {})
    known_precondition_screens = ("lobby", "shop", "console_open", "room", "battle", "login")
    if pre and "screen" in pre and pre["screen"] not in known_precondition_screens:
        raise ExperimentError(f"unknown precondition screen '{pre['screen']}'")
    if not isinstance(exp["steps"], list) or not exp["steps"]:
        raise ExperimentError("'steps' must be a non-empty list")
    for i, step in enumerate(exp["steps"]):
        if "action" not in step:
            raise ExperimentError(f"step {i}: missing 'action'")
        name = step["action"]
        if name not in actions.ACTIONS:
            raise ExperimentError(f"step {i}: unknown action '{name}', known: {sorted(actions.ACTIONS)}")
        params = step.get("params", {})
        if name == "shop_tab":
            if "name" not in params or params["name"] not in actions.TAB_COORDS:
                raise ExperimentError(f"step {i}: shop_tab needs params.name in {sorted(actions.TAB_COORDS)}")
        if name == "select_map":
            if "name" not in params or params["name"] not in actions.MAP_ENTRIES:
                raise ExperimentError(f"step {i}: select_map needs params.name in {sorted(actions.MAP_ENTRIES)}")
        if name == "console_cmd":
            text = params.get("text")
            if text not in actions.CONSOLE_CMD_WHITELIST:
                raise ExperimentError(f"step {i}: console_cmd needs params.text in {sorted(actions.CONSOLE_CMD_WHITELIST)}")
        if name == "campaign_win_all":
            settle_s = params.get("settle_s", actions.DEFAULT_ROUND_SETTLE_S)
            max_rounds = params.get("max_rounds", actions.MAX_CAMPAIGN_ROUNDS)
            if not isinstance(settle_s, (int, float)) or settle_s <= 0:
                raise ExperimentError(f"step {i}: campaign_win_all params.settle_s must be a positive number")
            if not isinstance(max_rounds, int) or max_rounds <= 0:
                raise ExperimentError(f"step {i}: campaign_win_all params.max_rounds must be a positive int")
        if name == "deltest":
            wait_s = params.get("wait_s", actions.DEFAULT_DELTEST_WAIT_S)
            if not isinstance(wait_s, (int, float)) or wait_s <= 0:
                raise ExperimentError(f"step {i}: deltest params.wait_s must be a positive number")
        if name == "keepalive_wait":
            seconds = params.get("seconds")
            interval_s = params.get("interval_s", actions.DEFAULT_KEEPALIVE_INTERVAL_S)
            if not isinstance(seconds, (int, float)) or seconds <= 0:
                raise ExperimentError(f"step {i}: keepalive_wait needs params.seconds as a positive number")
            if not isinstance(interval_s, (int, float)) or interval_s <= 0:
                raise ExperimentError(f"step {i}: keepalive_wait params.interval_s must be a positive number")
        if name in ("goto_shop", "shop_tab", "back_to_lobby") and "keepalive_interval_s" in params:
            kis = params["keepalive_interval_s"]
            if not isinstance(kis, (int, float)) or kis <= 0:
                raise ExperimentError(f"step {i}: {name} params.keepalive_interval_s must be a positive number")
        if name == "login":
            account = params.get("account")
            if not isinstance(account, str) or not account or not all(0x20 <= ord(c) <= 0x7E for c in account):
                raise ExperimentError(f"step {i}: login needs params.account as a non-empty printable-ASCII string")
        if name == "relaunch_client":
            account = params.get("account")
            if not isinstance(account, str) or not account or not all(0x20 <= ord(c) <= 0x7E for c in account):
                raise ExperimentError(f"step {i}: relaunch_client needs params.account as a non-empty printable-ASCII string")
        # Dual-client actions (docs/research/2026-09-20-dual-pico/design.md
        # section 3) -- all take a client_id, validated only as "a non-empty
        # string" here (whether it is actually a key of the experiment's own
        # 'clients' object is a run-time check, actions.py's own
        # ActionError/_focus_or_fail(), same as e.g. select_map's tab-name
        # checks are run-time in actions.py, not here).
        if name in ("launch_client", "close_client", "login_as", "join_room", "set_ready",
                    "enter_battle", "console_cmd_on", "leave_battle", "idle_nudge"):
            client_id = params.get("client_id")
            if not isinstance(client_id, str) or not client_id:
                raise ExperimentError(f"step {i}: {name} needs params.client_id as a non-empty string")
        if name == "host_start_battle":
            client_id = params.get("client_id", "host")
            if not isinstance(client_id, str) or not client_id:
                raise ExperimentError(f"step {i}: host_start_battle params.client_id must be a non-empty string")
        if name == "login_as":
            account = params.get("account")
            if not isinstance(account, str) or not account or not all(0x20 <= ord(c) <= 0x7E for c in account):
                raise ExperimentError(f"step {i}: login_as needs params.account as a non-empty printable-ASCII string")
        if name == "join_room":
            room_name = params.get("room_name")
            if not isinstance(room_name, str) or not room_name:
                raise ExperimentError(f"step {i}: join_room needs params.room_name as a non-empty string")
        if name == "console_cmd_on":
            text = params.get("text")
            if not isinstance(text, str) or not actions._console_cmd_on_allowed(text):
                raise ExperimentError(
                    f"step {i}: console_cmd_on needs params.text in "
                    f"{sorted(actions.CONSOLE_CMD_ON_WHITELIST_EXACT)} or matching 'netspeed <digits>'"
                )
    sc = exp.get("stop_conditions", {})
    if not isinstance(sc, dict):
        raise ExperimentError("'stop_conditions' must be an object")
    # Optional dual-client instance table (docs/research/2026-09-20-dual-pico/
    # design.md section 1) consumed by resolve_instances() below for
    # preflight. No existing experiment file declares this -- every one of
    # them falls back to resolve_instances()'s single client_ctl.DEFAULT_
    # INSTANCE entry, so this validation is a no-op for all of them.
    clients_field = exp.get("clients")
    if clients_field is not None:
        if not isinstance(clients_field, dict) or not clients_field:
            raise ExperimentError("'clients' must be a non-empty object of id -> "
                                   "{proc_name?, install_dir_win?, bat_path_win?}")
        for cid, spec in clients_field.items():
            if not isinstance(cid, str) or not cid:
                raise ExperimentError("'clients' keys must be non-empty strings")
            if not isinstance(spec, dict):
                raise ExperimentError(f"clients[{cid!r}] must be an object")
            for key in ("proc_name", "install_dir_win", "bat_path_win"):
                if key in spec and not isinstance(spec[key], str):
                    raise ExperimentError(f"clients[{cid!r}].{key} must be a string")


def _keepalive_suffix(params):
    kis = params.get("keepalive_interval_s")
    if kis is None:
        return ""
    return f", keepalive: KEY {actions.KEEPALIVE_KEY} every {kis}s while waiting (🟡 guess, see actions.py)"


def describe_step(step):
    name = step["action"]
    params = step.get("params", {})
    if name == "goto_shop":
        return (f"goto_shop: precondition=lobby, click client{actions.SHOP_BUTTON}, wait<=8s for "
                f"screen=shop{_keepalive_suffix(params)}")
    if name == "shop_tab":
        tab = params["name"]
        return (f"shop_tab({tab}): precondition=shop, click client{actions.TAB_COORDS[tab]}, "
                f"wait<=6s for tab '{actions.TAB_MANIFEST_KEY[tab]}' active{_keepalive_suffix(params)}")
    if name == "back_to_lobby":
        return (f"back_to_lobby: precondition=shop, click client{actions.BACK_BUTTON}, wait<=8s for "
                f"screen=lobby{_keepalive_suffix(params)}")
    if name == "open_console":
        return "open_console: key F24, wait<=5s for console_state=open"
    if name == "close_console":
        return "close_console: precondition=console open, key ESC, wait<=5s for console_state=closed"
    if name == "console_cmd":
        return f"console_cmd({params.get('text')!r}): precondition=console open, TYPE+ENTER, best-effort completion"
    if name == "dismiss_notice":
        return (f"dismiss_notice: check notice_popup marker; if present click client{actions.NOTICE_CONFIRM_BUTTON}, "
                f"wait<=6s for it to clear; no-op (ok=True) if absent")
    if name == "create_pve_room":
        return (f"create_pve_room: precondition=lobby, click client{actions.CREATE_ROOM_BUTTON} (建立房間), "
                f"wait<=6s for create_dialog marker, click client{actions.CREATE_PVE_TAB} (協力模式), "
                f"wait<=4s for dialog_pve tab active, click client{actions.CREATE_CONFIRM_BUTTON} (確認), "
                f"wait<=10s for room or notice_popup marker")
    if name == "select_map":
        map_name = params.get("name")
        entry = actions.MAP_ENTRIES.get(map_name, {})
        return (f"select_map({map_name!r}): precondition=room marker, click client{actions.SELECT_MAP_DROPDOWN} "
                f"(選擇地圖▼), wait<=6s for mapsel marker, click client{entry.get('coords')} "
                f"({entry.get('label')}, {'tested' if entry.get('tested') else 'UNTESTED'}), "
                f"wait<={actions.DEFAULT_MAP_SELECT_TIMEOUT_S}s for a {actions.MAP_SELECT_CQ_OPCODE} recv pkt "
                "in the session log")
    if name == "start_battle":
        return ("start_battle: precondition=room marker, key F5, wait<=25s for session-log markers "
                "'gameStarted_ false -> true' + 'Game_Start_SN sent'")
    if name == "campaign_win_all":
        settle_s = params.get("settle_s", actions.DEFAULT_ROUND_SETTLE_S)
        max_rounds = params.get("max_rounds", actions.MAX_CAMPAIGN_ROUNDS)
        return (f"campaign_win_all: precondition=battle marker, key F24, wait<=5s for console_state(battle)=open, "
                f"then up to {max_rounds}x: TYPE 'GameCampaign 1'+ENTER, wait<=30s for an R-ROUND session-log marker, "
                f"sleep {settle_s}s before the next send, stop at the EndGame_SN R-ROUND marker")
    if name == "campaign_fail":
        return ("campaign_fail: precondition=battle HUD (<=60s), key F24 if console closed, "
                "wait<=5s for console_state(battle)=open, then TYPE 'GameCampaign 2'+ENTER, "
                f"wait<={actions.CAMPAIGN_FAIL_ENDGAME_TIMEOUT_S}s for an EndGame_SN 0x00222213 send pkt "
                "in the session log (no R-ROUND marker exists for action=2, see actions.py)")
    if name == "deltest":
        wait_s = params.get("wait_s", actions.DEFAULT_DELTEST_WAIT_S)
        return (f"deltest: precondition=battle HUD (<=60s), key F24 if console closed, "
                f"wait<=5s for console_state(battle)=open, then TYPE 'delTest'+ENTER (NOT in "
                f"console_cmd's whitelist -- hardcoded to this action only), sleep {wait_s}s, "
                f"then count Death_CN(recv 0x00230123)/Death_SN(send 0x00230124) pkts in the session log")
    if name == "keepalive_wait":
        seconds = params.get("seconds")
        interval_s = params.get("interval_s", actions.DEFAULT_KEEPALIVE_INTERVAL_S)
        return (f"keepalive_wait: no precondition, idle {seconds}s sending a zero-net mouse_wiggle "
                f"every {interval_s}s (🟡 guess, see actions.py docstring)")
    if name == "wait_result_then_room":
        return "wait_result_then_room: wait<=15s for result marker (best-effort), then wait<=20s for room or notice_popup marker"
    if name == "leave_room":
        return f"leave_room: precondition=room marker, click client{actions.LEAVE_ROOM_BUTTON} (上一頁), wait<=8s for screen=lobby"
    if name == "login":
        account = params.get("account")
        return (f"login({account!r}): precondition=login screen, IME_EN, click client{actions.LOGIN_ACCOUNT_FIELD} "
                f"(帳號), TYPE {account!r}, KEY TAB, TYPE {actions.LOGIN_DUMMY_PASSWORD!r} (dummy password), KEY ENTER, "
                f"wait<={actions.DEFAULT_LOGIN_TIMEOUT_S}s for a {actions.LOGIN_CQ_OPCODE} recv pkt in the session log, "
                f"then wait<=15s for screen=lobby")
    if name == "relaunch_client":
        account = params.get("account")
        reason = params.get("reason", "planned unattended relaunch")
        return (f"relaunch_client({account!r}): `client_ctl.py relaunch --reason {reason!r}` (close via a real "
                f"Pico click on the title-bar close X if present+responding, halt if present+not responding, "
                f"launch, wait<=90s for the real game window), then login({account!r}) (see above) -- separate "
                f"from client_ctl.py restart's crash-recovery budget")
    if name == "focus_client":
        # Pre-existing action (I6, before this task); describe_step() never had a
        # case for it, so it fell through to the generic f"{name}: {params}" below
        # -- adding a real description here while touching this function anyway.
        cid = params.get("client_id")
        return f"focus_client({cid!r}): session set-proc, SetForegroundWindow, readback-confirm"
    # Dual-client actions (docs/research/2026-09-20-dual-pico/design.md section 3).
    if name == "launch_client":
        cid = params.get("client_id")
        return f"launch_client({cid!r}): `client_ctl.py launch --id {cid}` (refuses if already running), wait<=90s for the real game window"
    if name == "close_client":
        cid = params.get("client_id")
        return f"close_client({cid!r}): focus_client({cid!r}) first, then `client_ctl.py close --id {cid}` (real Pico click on the title-bar close X), wait<=20s for the process to exit"
    if name == "login_as":
        cid = params.get("client_id")
        account = params.get("account")
        return (f"login_as({cid!r}, {account!r}): focus_client({cid!r}), wait<=60s for login screen, IME_EN, "
                f"click client{actions.LOGIN_ACCOUNT_FIELD} (帳號), KEY HOME, {actions.ACCOUNT_FIELD_CLEAR_KEYPRESSES}x "
                f"KEY DELETE (clear any leftover account text), TYPE {account!r}, KEY TAB, TYPE "
                f"{actions.LOGIN_DUMMY_PASSWORD!r}, KEY ENTER, wait<={actions.DEFAULT_LOGIN_TIMEOUT_S}s for a "
                f"{actions.LOGIN_CQ_OPCODE} recv pkt, wait<=15s for screen=lobby, resolve+store conn_id")
    if name == "join_room":
        cid = params.get("client_id")
        room_name = params.get("room_name")
        return (f"join_room({cid!r}, {room_name!r}): focus_client({cid!r}), precondition=lobby, "
                f"DOUBLE-CLICK client{actions.ROOM_LIST_FIRST_ROW_CLICK} (UNTESTED coordinate, see actions.py), "
                f"wait<={actions.DEFAULT_JOIN_ROOM_TIMEOUT_S}s for a successful {actions.ENTER_SA_OPCODE} "
                f"send pkt (conn-filtered)")
    if name == "set_ready":
        cid = params.get("client_id")
        return (f"set_ready({cid!r}): focus_client({cid!r}), precondition=room marker, KEY F5, "
                f"wait<={actions.DEFAULT_SET_READY_TIMEOUT_S}s for a {actions.USER_STATE_SN_OPCODE} "
                f"send pkt (conn-filtered)")
    if name == "host_start_battle":
        cid = params.get("client_id", "host")
        return (f"host_start_battle(client_id={cid!r}): focus_client({cid!r}), precondition=room marker, "
                f"KEY F5, wait<={actions.DEFAULT_HOST_START_BATTLE_TIMEOUT_S}s for a "
                f"{actions.GAME_START_SN_OPCODE} send pkt (conn-filtered, NOT the gameStarted_ text marker)")
    if name == "enter_battle":
        cid = params.get("client_id")
        return (f"enter_battle({cid!r}): focus_client({cid!r}), NO click sent (auto mech-select, see "
                f"actions.py's CHANGE_SLOT_CN_OPCODE comment), wait<={actions.DEFAULT_ENTER_BATTLE_TIMEOUT_S}s "
                f"for a {actions.CHANGE_SLOT_CN_OPCODE}/{actions.RESPAWN_CN_OPCODE} recv pkt (conn-filtered)")
    if name == "console_cmd_on":
        cid = params.get("client_id")
        text = params.get("text")
        return (f"console_cmd_on({cid!r}, {text!r}): focus_client({cid!r}), F24 if console closed, "
                f"wait<=5s for console(battle) open, TYPE {text!r}, KEY ENTER, screenshot, KEY ESC, "
                f"wait<={actions.DEFAULT_CONSOLE_CMD_ON_CLOSE_TIMEOUT_S}s for console(battle) closed "
                f"(no log read here, see actions.py L4 note)")
    if name == "leave_battle":
        cid = params.get("client_id")
        return (f"leave_battle({cid!r}): focus_client({cid!r}), KEY ESC, click "
                f"client{actions.BATTLE_ESC_LEAVE_BUTTON} (UNTESTED coordinate, zero visual reference, "
                f"see actions.py), wait<={actions.DEFAULT_LEAVE_BATTLE_TIMEOUT_S}s for a "
                f"{actions.LEAVE_SA_OPCODE} send pkt (conn-filtered)")
    if name == "idle_nudge":
        cid = params.get("client_id")
        return f"idle_nudge({cid!r}): focus_client({cid!r}), mouse_wiggle, check no {actions.LEAVE_CQ_OPCODE} recv since"
    return f"{name}: {params}"


# ---------------------------------------------------------------------------
# Preflight (docs/research/2026-09-20-dual-pico/design.md 2b): every check
# here is read-only -- no client is launched, no OptionAll.ini is written
# (PM 2026-09-20: resolution fixes wait for the operator), and the only
# Pico/Win32 calls made are `ping` and `session set-proc` (a local state
# write, see pico_ctl.py's session_set_proc docstring), both explicitly
# allowed by docs/reference/unattended-policy.md 丁類第一條 even for
# read-only tasks. Nothing here brings a window forward or sends a
# click/key/type command.
# ---------------------------------------------------------------------------

# The atlas's client size (1600x1200) is not derivable from manifest.json's
# shot_size/client_offset by itself -- CLIENT_OFFSET only anchors the
# top-left crop origin (screens.py: "client_xy = shot_xy - CLIENT_OFFSET"),
# not a border-subtraction formula for the whole window frame. 1600x1200 is
# a separately-confirmed fact (docs/research/2026-09-20-dual-pico/
# design.md P5) that also happens to be hardcoded as pico_serial.ps1's
# $ReadyClientWidth/$ReadyClientHeight for the SAME shot_size. So rather
# than inventing an unverified formula, this pins both known values and
# fails loudly (not silently) if the atlas is ever rebuilt at a different
# shot_size, instead of comparing against a now-stale client size.
ATLAS_KNOWN_SHOT_SIZE = (1616, 1239)
ATLAS_KNOWN_CLIENT_SIZE = (1600, 1200)

_OPTION_ALL_SCREEN_SIZE_RE = re.compile(r'op_Display=\(ScreenSize="(\d+)x(\d+)"')


def _atlas_expected_client_size():
    """Returns ((w, h), None) or (None, reason). Reads tools/pico/atlas/
    manifest.json's shot_size -- see the ATLAS_KNOWN_* comment above for why
    this doesn't try to recompute the client size from it."""
    manifest_path = os.path.join(SCRIPT_DIR, "atlas", "manifest.json")
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except OSError as ex:
        return None, f"could not read {manifest_path}: {ex}"
    shot_size = tuple(manifest.get("shot_size") or [])
    if shot_size != ATLAS_KNOWN_SHOT_SIZE:
        return None, (f"manifest shot_size {shot_size} != {ATLAS_KNOWN_SHOT_SIZE} that this "
                       f"preflight's known client-size mapping ({ATLAS_KNOWN_CLIENT_SIZE}) was "
                       f"verified against -- the atlas was rebuilt for a different resolution, "
                       f"update ATLAS_KNOWN_SHOT_SIZE/ATLAS_KNOWN_CLIENT_SIZE in runner.py by hand")
    return ATLAS_KNOWN_CLIENT_SIZE, None


def _read_option_all_screen_size(instance):
    """Reads (never writes) <instance install dir>\\data\\System\\
    OptionAll.ini's op_Display=(ScreenSize="WxH",...) key -- design.md 2b
    row 1. Returns ((w, h), ini_path_wsl, None) on success, or
    (None, ini_path, reason) on failure. `instance` is a
    client_ctl.ClientInstance; direct path only, same rule as
    client_ctl.win_dir_to_wsl's own docstring (never through the
    'MetalRage\\' reparse point)."""
    ini_win = instance.install_dir_win.rstrip("\\") + r"\data\System\OptionAll.ini"
    try:
        ini_wsl = client_ctl.win_dir_to_wsl(ini_win)
    except Exception as ex:
        return None, ini_win, f"could not resolve WSL path for {ini_win}: {ex}"
    try:
        with open(ini_wsl, "rb") as f:
            raw = f.read()
    except OSError as ex:
        return None, ini_wsl, f"could not read {ini_wsl}: {ex}"
    # [TEST] 2026-09-20 (this task): both installs' OptionAll.ini are UTF-16LE
    # with a BOM (\xff\xfe...), a common UE2-on-Windows ini convention --
    # reading as UTF-8 silently returns garbage (no regex match, not a
    # decode error) instead of failing loudly, so the BOM is checked
    # explicitly rather than assumed.
    if raw.startswith(b"\xff\xfe"):
        content = raw.decode("utf-16-le", errors="replace")
    elif raw.startswith(b"\xfe\xff"):
        content = raw.decode("utf-16-be", errors="replace")
    else:
        content = raw.decode("utf-8", errors="replace")
    m = _OPTION_ALL_SCREEN_SIZE_RE.search(content)
    if not m:
        return None, ini_wsl, f"no op_Display=(ScreenSize=\"WxH\"...) key found in {ini_wsl}"
    return (int(m.group(1)), int(m.group(2))), ini_wsl, None


def check_resolution(instance):
    """design.md 2b row 1: instance's in-game resolution vs what the atlas
    needs. Returns (ok, detail); detail always names the current value, the
    expected value, and which file/key, per this task's contract -- does
    NOT change OptionAll.ini (PM 2026-09-20: resolution fixes wait for the
    operator to decide, see design.md 2b's closing paragraph)."""
    expected, size_err = _atlas_expected_client_size()
    if size_err:
        return False, size_err
    found, ini_path, read_err = _read_option_all_screen_size(instance)
    if read_err:
        return False, f"{instance.id}: {read_err}"
    if found != expected:
        return False, (f"{instance.id}: {ini_path} op_Display ScreenSize={found[0]}x{found[1]}, "
                        f"atlas needs client {expected[0]}x{expected[1]} (manifest.json shot_size "
                        f"{ATLAS_KNOWN_SHOT_SIZE}) -- change the in-game resolution or rebuild the "
                        f"atlas for {found[0]}x{found[1]}, see design.md P5; not done automatically")
    return True, f"{instance.id}: {ini_path} ScreenSize={found[0]}x{found[1]} matches atlas"


def check_no_residual_process(instance):
    """design.md 2b row 4: this instance must not already have a process
    running before this run starts one. Exact process-name match only
    (client_ctl.ps1's `Get-Process -Name $ProcName`, design.md 不變式 6 --
    'MetalRage' is a prefix of 'MetalRage2', -like/wildcard would conflate
    them). Reuses client_ctl.get_status(), the same status query `client_ctl.py
    status` uses."""
    try:
        st = client_ctl.get_status(instance)
    except SystemExit as ex:
        return False, f"{instance.id}: client_ctl.get_status() aborted ({ex}) -- is powershell.exe reachable?"
    if st["state"] == "not_running":
        return True, f"{instance.id}: no {instance.proc_name} process running"
    if st["state"] == "error":
        return False, f"{instance.id}: could not check for a residual process: {st.get('detail')}"
    return False, (f"{instance.id}: residual {instance.proc_name} process pid={st.get('pid')} "
                    f"state={st['state']} -- close it before this run starts")


def check_stop_file():
    """design.md 2b row 3, same kill-switch path every other gate uses."""
    path = client_ctl.stop_file_wsl()
    if os.path.exists(path):
        return False, f"STOP file present ({path}) -- remove it before running"
    return True, f"no STOP file at {path}"


def check_pico_gate(instances):
    """design.md 2b row 2, done once for the whole preflight (one shared
    Pico). Opens a short-lived probe session of its own -- distinct from
    and always ended before run_experiment()'s real session (see
    run_preflight() below) -- pings the Pico, then for every instance
    confirms `session set-proc <name>` succeeds (a pure local state write,
    see pico_ctl.py's session_set_proc docstring -- not itself a Pico/
    hardware call). Sends no click/key/type/RESET and brings no window
    forward.

    Returns (ok, detail, per_instance) where per_instance is
    {id: (ok, detail)}."""
    import subprocess
    per_instance = {}

    ping = subprocess.run([sys.executable, actions.PICO_CTL, "ping"],
                           capture_output=True, text=True, timeout=40)
    if ping.returncode != 0 or "[PICO PONG]" not in ping.stdout:
        detail = f"pico ping failed (rc={ping.returncode}): {ping.stdout.strip()} {ping.stderr.strip()}"
        for cid, _inst in instances:
            per_instance[cid] = (False, detail)
        return False, detail, per_instance

    start = subprocess.run([sys.executable, actions.PICO_CTL, "session", "start", "preflight"],
                            capture_output=True, text=True, timeout=15)
    if start.returncode != 0:
        detail = f"pico session start failed (rc={start.returncode}): {start.stdout.strip()} {start.stderr.strip()}"
        for cid, _inst in instances:
            per_instance[cid] = (False, detail)
        return False, detail, per_instance

    try:
        all_ok = True
        for cid, inst in instances:
            sp = subprocess.run([sys.executable, actions.PICO_CTL, "session", "set-proc", inst.proc_name],
                                 capture_output=True, text=True, timeout=15)
            ok = sp.returncode == 0
            per_instance[cid] = (ok, f"session set-proc {inst.proc_name!r} -> rc={sp.returncode}: "
                                      f"{sp.stdout.strip()} {sp.stderr.strip()}")
            all_ok = all_ok and ok
    finally:
        subprocess.run([sys.executable, actions.PICO_CTL, "session", "end"], capture_output=True, text=True, timeout=15)

    detail = ("pico ping ok, session set-proc ok for every instance" if all_ok
              else "pico ping ok, but session set-proc failed for at least one instance (see per-instance detail)")
    return all_ok, detail, per_instance


def resolve_instances(exp):
    """Returns [(id, client_ctl.ClientInstance), ...] for every instance
    this experiment's steps will use, from an optional top-level 'clients'
    object (docs/research/2026-09-20-dual-pico/design.md section 1;
    validated by validate_experiment() above). No existing experiment file
    declares 'clients' -- every one of them falls back to a single entry
    using client_ctl.DEFAULT_INSTANCE (the main install, proc 'MetalRage'),
    so preflight still checks that one instance for every such script. This
    is deliberate, not a gap: the incident that triggered this task
    (docs/reference/unattended-policy.md 丁類第一條) was a single-client
    scenario, not a dual-client one."""
    clients_field = exp.get("clients")
    if not clients_field:
        return [(client_ctl.DEFAULT_INSTANCE.id, client_ctl.DEFAULT_INSTANCE)]
    out = []
    for cid, spec in clients_field.items():
        out.append((cid, client_ctl.ClientInstance(
            id=cid,
            proc_name=spec.get("proc_name", client_ctl.DEFAULT_INSTANCE.proc_name),
            install_dir_win=spec.get("install_dir_win", client_ctl.DEFAULT_INSTANCE.install_dir_win),
            bat_path_win=spec.get("bat_path_win", client_ctl.DEFAULT_INSTANCE.bat_path_win),
        )))
    return out


def run_preflight(exp):
    """Runs every docs/research/2026-09-20-dual-pico/design.md 2b check for
    every instance resolve_instances(exp) returns, BEFORE run_experiment()
    opens its real pico session or starts any client (docs/reference/
    unattended-policy.md 丁類第一條, PM 2026-09-20). Runs every check (does
    not stop at the first failure) so a single report shows everything
    wrong with the environment at once. Returns (ok, report); never raises
    for an ordinary check failure -- only a genuinely unexpected exception
    propagates."""
    instances = resolve_instances(exp)
    report = {"instances": [cid for cid, _ in instances], "checks": [], "ok": None}
    all_ok = True

    ok, detail = check_stop_file()
    report["checks"].append({"check": "stop_file", "instance": None, "ok": ok, "detail": detail})
    all_ok = all_ok and ok

    for cid, inst in instances:
        ok, detail = check_resolution(inst)
        report["checks"].append({"check": "resolution", "instance": cid, "ok": ok, "detail": detail})
        all_ok = all_ok and ok

    for cid, inst in instances:
        ok, detail = check_no_residual_process(inst)
        report["checks"].append({"check": "no_residual_process", "instance": cid, "ok": ok, "detail": detail})
        all_ok = all_ok and ok

    gate_ok, gate_detail, gate_per_instance = check_pico_gate(instances)
    report["checks"].append({"check": "pico_foreground_gate", "instance": None, "ok": gate_ok, "detail": gate_detail})
    for cid, (ok, detail) in gate_per_instance.items():
        report["checks"].append({"check": "pico_foreground_gate_set_proc", "instance": cid, "ok": ok, "detail": detail})
    all_ok = all_ok and gate_ok

    report["ok"] = all_ok
    return all_ok, report


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
def fail_closed(ctx):
    """RESET + best-effort session end. Never raises -- this runs from an
    already-failing path and must not mask the original failure."""
    if ctx.dry_run:
        return
    try:
        import subprocess
        subprocess.run([sys.executable, actions.PICO_CTL, "raw", "RESET"], capture_output=True, text=True)
    except Exception:
        pass
    try:
        import subprocess
        subprocess.run([sys.executable, actions.PICO_CTL, "session", "end"], capture_output=True, text=True)
    except Exception:
        pass


def _build_client_states(exp):
    """Converts an experiment's optional top-level 'clients' object (docs/
    research/2026-09-20-dual-pico/design.md section 1, same field
    resolve_instances() above reads for preflight) into {id: actions.
    ClientState}, for actions.Context.clients -- the dict focus_client() and
    every per-client action (I6/section 3) reads. No existing experiment
    file declares 'clients', so this returns {} for all of them, same as
    before this task (ctx.clients stays empty, every per-client action is
    simply never used, _require_focused_client() stays a no-op -- see its
    own docstring)."""
    clients_field = exp.get("clients")
    if not clients_field:
        return {}
    out = {}
    for cid, spec in clients_field.items():
        out[cid] = actions.ClientState(
            id=cid,
            proc_name=spec.get("proc_name", client_ctl.DEFAULT_INSTANCE.proc_name),
            install_dir_win=spec.get("install_dir_win", client_ctl.DEFAULT_INSTANCE.install_dir_win),
            bat_path_win=spec.get("bat_path_win", client_ctl.DEFAULT_INSTANCE.bat_path_win),
        )
    return out


def run_experiment(exp_path, dry_run=False, shots_dir=None, logs_dir=None):
    exp = load_experiment(exp_path)
    ctx = actions.Context(
        dry_run=dry_run,
        shots_dir=shots_dir or actions.DEFAULT_SHOTS_DIR,
        logs_dir=logs_dir or actions.DEFAULT_LOGS_DIR,
        run_id=exp["id"],
        clients=_build_client_states(exp),
    )

    report = {
        "id": exp["id"],
        "purpose": exp["purpose"],
        "dry_run": dry_run,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "build_event": None,
        "preflight": None,
        "precondition": None,
        "steps": [],
        "anomalies": [],
        "result": None,
    }

    if dry_run:
        print(f"[DRY-RUN] {exp['id']}: {exp['purpose']}")
        pre = exp.get("preconditions", {})
        if pre:
            print(f"  precondition: {pre}")
        for i, step in enumerate(exp["steps"]):
            print(f"  step {i}: {describe_step(step)}")
        sc = exp.get("stop_conditions", {})
        if sc:
            print(f"  stop_conditions: {sc}")
        print("  max_image_reviews: 0 (no model calls)")
        report["result"] = "DRY_RUN_OK"
        return report, 0

    report["build_event"] = actions.find_build_event(ctx.logs_dir)
    if report["build_event"] is None:
        report["anomalies"].append(f"no build event found under {ctx.logs_dir} (no session-*.jsonl, or no 'build' line)")

    # Preflight (design.md 2b / unattended-policy.md 丁類第一條): must pass
    # BEFORE any client is started -- no session has been opened and no
    # client has been touched yet at this point, so a failure here needs no
    # fail_closed() cleanup (there is nothing to reset or close).
    preflight_ok, preflight_report = run_preflight(exp)
    report["preflight"] = preflight_report
    if not preflight_ok:
        report["anomalies"].append("preflight failed -- no client was started, see report['preflight']")
        report["result"] = "FAIL"
        write_report(report)
        return report, 1

    stop = exp.get("stop_conditions", {})
    max_consecutive_failures = stop.get("max_consecutive_failures", 1)

    rc = subprocess_session_start(ctx, f"{exp['id']}: {exp['purpose']}")
    if rc != 0:
        report["result"] = "FAIL"
        report["anomalies"].append(f"pico session start failed (rc={rc})")
        write_report(report)
        return report, 1

    session_open = True
    try:
        pre = exp.get("preconditions", {})
        if pre.get("screen"):
            shot = actions.take_screenshot(ctx, "initial-precondition")
            r = screens.classify_screen(shot)
            ok = r.name == pre["screen"] and not r.gray
            report["precondition"] = {
                "expected": pre["screen"], "got": r.name, "score": r.score,
                "margin": r.margin, "gray": r.gray, "ok": ok, "screenshot": shot,
            }
            if not ok:
                report["anomalies"].append(f"initial precondition failed: expected {pre['screen']}, classify_screen -> {r.name} (gray={r.gray})")
                report["result"] = "FAIL"
                fail_closed(ctx)
                session_open = False
                write_report(report)
                return report, 1

        consecutive_failures = 0
        for i, step in enumerate(exp["steps"]):
            name = step["action"]
            params = step.get("params", {})
            fn = actions.ACTIONS[name]
            result = fn(ctx, **params)
            entry = {
                "index": i, "action": name, "params": params, "ok": result.ok,
                "gray": result.gray, "duration_s": round(result.duration_s, 2),
                "detail": result.detail, "screenshot": result.screenshot, "score": result.score,
                "rounds": result.rounds,  # per-round R-ROUND timings, only non-empty for campaign_win_all
            }
            report["steps"].append(entry)
            print(f"  [{i}] {name}({params}) -> ok={result.ok} gray={result.gray} {result.detail}")

            if result.gray:
                report["anomalies"].append(f"step {i} ({name}): gray-zone classification, stopping")

            if not result.ok:
                consecutive_failures += 1
                report["anomalies"].append(f"step {i} ({name}): failed: {result.detail}")
            else:
                consecutive_failures = 0

            if result.gray or not result.ok:
                if result.gray or consecutive_failures >= max_consecutive_failures:
                    report["result"] = "FAIL"
                    fail_closed(ctx)
                    session_open = False
                    for j in range(i + 1, len(exp["steps"])):
                        report["steps"].append({
                            "index": j, "action": exp["steps"][j]["action"],
                            "params": exp["steps"][j].get("params", {}),
                            "ok": None, "gray": None, "duration_s": 0.0,
                            "detail": "skipped (runner stopped fail-closed)",
                            "screenshot": None, "score": None, "rounds": [],
                        })
                    write_report(report)
                    return report, 1

        report["result"] = "PASS"
        return report, 0
    finally:
        if session_open:
            subprocess_session_end(ctx)
        write_report(report)


def subprocess_session_start(ctx, purpose):
    import subprocess
    proc = subprocess.run([sys.executable, actions.PICO_CTL, "session", "start", purpose],
                           capture_output=True, text=True)
    print(proc.stdout.strip())
    if proc.returncode != 0:
        print(proc.stderr.strip(), file=sys.stderr)
    return proc.returncode


def subprocess_session_end(ctx):
    import subprocess
    proc = subprocess.run([sys.executable, actions.PICO_CTL, "session", "end"], capture_output=True, text=True)
    print(proc.stdout.strip())


def write_report(report):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    base = os.path.join(REPORTS_DIR, f"{report['id']}-{ts}")
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(f"{report['id']} - {report['result']}\n")
        f.write(f"purpose: {report['purpose']}\n")
        f.write(f"started_at: {report['started_at']}\n")
        be = report.get("build_event")
        if be:
            f.write(f"build: {be.get('branch')}@{be.get('commit')} dirty={be.get('dirty')} "
                    f"nonDefault={list(be.get('nonDefault', {}).keys())}\n")
        else:
            f.write("build: (no build event found in session log)\n")
        pf = report.get("preflight")
        if pf:
            f.write(f"preflight: ok={pf['ok']} instances={pf['instances']}\n")
            for c in pf["checks"]:
                f.write(f"  - [{c['check']}] instance={c['instance']} ok={c['ok']} :: {c['detail']}\n")
        pre = report.get("precondition")
        if pre:
            f.write(f"precondition: expected={pre['expected']} got={pre['got']} ok={pre['ok']}\n")
        f.write("steps:\n")
        for s in report["steps"]:
            f.write(f"  [{s['index']}] {s['action']}({s['params']}) ok={s['ok']} gray={s['gray']} "
                    f"{s['duration_s']}s :: {s['detail']}\n")
            for r in s.get("rounds") or []:
                f.write(f"        round {r['iteration']}: cleared={r['cleared']} playRound={r['playRound']} "
                        f"wait_s={r['wait_s']} ms={r['ms']} :: {r['tail']}\n")
        if report["anomalies"]:
            f.write("anomalies:\n")
            for a in report["anomalies"]:
                f.write(f"  - {a}\n")
    print(f"[REPORT] {base}.json / .txt")


# ---------------------------------------------------------------------------
# Suite: several experiment files run back to back, stopping (fail-closed) on
# the first one that does not PASS. Each experiment still writes its own
# report via run_experiment(); this only adds one summary on top, same
# id+timestamp naming as write_report() above.
# ---------------------------------------------------------------------------
class SuiteError(Exception):
    pass


def load_suite(path):
    """Loads and validates a suite file, resolving each entry in
    'experiments' relative to the suite file's own directory (so a suite can
    be invoked from any cwd, same as how experiments/*.json is written
    relative to tools/pico/ regardless of invocation directory). Also
    load_experiment()s every entry up front -- fail-closed before anything
    runs, not partway through the suite."""
    with open(path, "r", encoding="utf-8") as f:
        suite = json.load(f)
    for req in ("id", "purpose", "experiments"):
        if req not in suite:
            raise SuiteError(f"suite missing required field '{req}'")
    if not isinstance(suite["id"], str) or not suite["id"]:
        raise SuiteError("'id' must be a non-empty string")
    if not isinstance(suite["purpose"], str) or not suite["purpose"]:
        raise SuiteError("'purpose' must be a non-empty string")
    if not isinstance(suite["experiments"], list) or not suite["experiments"]:
        raise SuiteError("'experiments' must be a non-empty list")
    base_dir = os.path.dirname(os.path.abspath(path))
    resolved = []
    for entry in suite["experiments"]:
        if not isinstance(entry, str) or not entry:
            raise SuiteError(f"suite experiment entry must be a non-empty string, got {entry!r}")
        exp_path = entry if os.path.isabs(entry) or os.sep in entry else os.path.join(base_dir, entry)
        if not os.path.exists(exp_path):
            raise SuiteError(f"suite experiment file not found: {exp_path}")
        load_experiment(exp_path)  # raises ExperimentError up front if any file is bad
        resolved.append(exp_path)
    return suite, resolved


def run_suite(suite_path, dry_run=False, shots_dir=None, logs_dir=None):
    """Runs each experiment in the suite, in order, via run_experiment() --
    same fail-closed policy as a single experiment's steps: the first
    experiment whose result is not PASS (rc != 0, includes the DRY_RUN_OK
    case which always has rc=0) stops the suite immediately. No experiment
    after that point is attempted."""
    suite, exp_paths = load_suite(suite_path)
    summary = {
        "id": suite["id"], "purpose": suite["purpose"], "dry_run": dry_run,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "experiments": [], "result": None, "stopped_at": None,
    }
    for exp_path in exp_paths:
        print(f"=== suite {suite['id']}: {os.path.basename(exp_path)} ===")
        report, rc = run_experiment(exp_path, dry_run=dry_run, shots_dir=shots_dir, logs_dir=logs_dir)
        summary["experiments"].append({
            "path": exp_path, "id": report["id"], "result": report["result"], "rc": rc,
        })
        if rc != 0:
            summary["result"] = "FAIL"
            summary["stopped_at"] = os.path.basename(exp_path)
            write_suite_report(summary)
            return summary, 1
    summary["result"] = "PASS"
    write_suite_report(summary)
    return summary, 0


def write_suite_report(summary):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    base = os.path.join(REPORTS_DIR, f"{summary['id']}-{ts}")
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(f"{summary['id']} - {summary['result']}\n")
        f.write(f"purpose: {summary['purpose']}\n")
        f.write(f"started_at: {summary['started_at']}\n")
        f.write("experiments:\n")
        for e in summary["experiments"]:
            f.write(f"  {e['id']}: {e['result']} (rc={e['rc']}) [{e['path']}]\n")
        if summary["result"] == "FAIL":
            f.write(f"stopped_at: {summary.get('stopped_at')}\n")
    print(f"[SUITE REPORT] {base}.json / .txt")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="run (or --dry-run plan) an experiment file")
    p_run.add_argument("experiment")
    p_run.add_argument("--dry-run", action="store_true")
    p_run.add_argument("--shots-dir")
    p_run.add_argument("--logs-dir")

    p_val = sub.add_parser("validate", help="validate an experiment file's structure, no plan printed")
    p_val.add_argument("experiment")

    p_pre = sub.add_parser("preflight", help="run only the design.md 2b preflight checks for an "
                                              "experiment file's instance(s) -- never opens a real "
                                              "session, never starts a client")
    p_pre.add_argument("experiment")

    p_suite = sub.add_parser("suite", help="run (or --dry-run plan) a suite file: sequential experiments, "
                                            "stops on the first non-PASS (fail-closed)")
    p_suite.add_argument("suite")
    p_suite.add_argument("--dry-run", action="store_true")
    p_suite.add_argument("--shots-dir")
    p_suite.add_argument("--logs-dir")

    args = ap.parse_args()

    if args.cmd == "validate":
        try:
            load_experiment(args.experiment)
        except (ExperimentError, FileNotFoundError, json.JSONDecodeError) as ex:
            print(f"[INVALID] {ex}")
            sys.exit(1)
        print("[OK] experiment file is valid")
        return

    if args.cmd == "preflight":
        try:
            exp = load_experiment(args.experiment)
        except (ExperimentError, FileNotFoundError, json.JSONDecodeError) as ex:
            print(f"[INVALID] {ex}")
            sys.exit(1)
        ok, report = run_preflight(exp)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print(f"[{'PASS' if ok else 'FAIL'}] preflight for {exp['id']}")
        sys.exit(0 if ok else 1)

    if args.cmd == "run":
        try:
            report, rc = run_experiment(args.experiment, dry_run=args.dry_run,
                                         shots_dir=args.shots_dir, logs_dir=args.logs_dir)
        except (ExperimentError, FileNotFoundError, json.JSONDecodeError) as ex:
            print(f"[INVALID] {ex}")
            sys.exit(1)
        print(f"[{report['result']}] {report['id']}")
        sys.exit(rc)

    if args.cmd == "suite":
        try:
            summary, rc = run_suite(args.suite, dry_run=args.dry_run,
                                     shots_dir=args.shots_dir, logs_dir=args.logs_dir)
        except (SuiteError, ExperimentError, FileNotFoundError, json.JSONDecodeError) as ex:
            print(f"[INVALID] {ex}")
            sys.exit(1)
        print(f"[{summary['result']}] {summary['id']}")
        sys.exit(rc)


if __name__ == "__main__":
    main()
