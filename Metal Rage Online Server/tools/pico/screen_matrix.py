#!/usr/bin/env python3
"""
STATUS: WIP but runnable and already useful -- runs end to end, produces a
real matrix with real numbers (see this task's report for the current
output and the ranked list of suspicious checks). NOT fully hardened:
  - "Last attempt in a wait_for() polling group = the check succeeded" has
    at least 3 known failure modes found and fixed for the CURRENT shots/
    contents (timeouts masquerading as success, orphaned/overwritten
    attempt-1s from merged re-runs, "already open before this call" for the
    console groups) -- each was caught by manually cross-checking specific
    files against screens.py's own output, not by a general proof. A grown
    shots/ dir (this task's own run saw the operator adding new files live,
    473 -> 513 during this session) may contain NEW instances of the same
    classes of mistake that have not been checked.
  - The "-tail"/multi-run/"-mrotest" family naming quirks were handled
    ad hoc as they were found; there is no guarantee every such quirk in the
    dataset has been found.
  - console_lobby:open/closed is tested against every known screen
    (including ones with a totally different background, e.g. login/battle)
    even though screens.py's own console_state() is only ever used from a
    lobby/shop/room context in production -- some of this check's reported
    margin is a background-mismatch artifact, not a console-detection
    fragility; see this task's report for which rows are which.
  - No automated test exists for label_image()/ground_truth() themselves
    (this task ran out of time) -- the correctness evidence is the cross-
    checks embedded in the comments below plus this task's report, not a
    test suite.

screen_matrix.py - Measurement-only coverage matrix for every screens.py
marker/screen check, run against every existing shots/*.png that we can
confidently ground-truth from its filename + the actions.py contract that
produced it.

WHY THIS EXISTS (2026-09-21 incident, see this task's contract / journal
docs/journal/2026-09-21-2120-dual-pico-bc.md "room marker 的根因"): the
"room" marker's box happened to frame text that changes with room
occupancy ("遊戲開始(F5)" solo vs "準備(F5)" with 2+ players), so it read
correct in every single-client script and ONLY failed in a real 2-player
room -- and even THEN it went unnoticed because create_pve_room() has a
"room OR notice_popup" fallback that happened to pass on the other signal.
A plain present/absent matrix would not have caught this either (it would
just show one more False in one column); what catches it is printing, per
check, "the worst score among images that truly ARE this thing" next to
"the best (most dangerous) score among images that truly are NOT this
thing" -- a thin or inverted gap between those two numbers is a fragile or
dead signal even when today's boolean read happens to come out right.

This script does NOT change any marker/threshold/box definition in
screens.py -- it only calls the existing public functions
(classify_screen/console_state/detect_marker/is_tab_active/
battle_hud_state/console_prompt_state) and reports on their raw scores.

Ground truth ("is this filename really screen X") comes ONLY from:
  1. Exact filenames already named as BUILD_SPEC reference sources or their
     documented companions in screens.py's own comments (EXPLICIT_REFS
     below) -- not a guess, these are literally what the atlas was built
     from.
  2. The step name actions.py itself gives each screenshot (take_screenshot
     labels / wait_for labels), cross-referenced against that action's own
     documented precondition/completion contract (read from actions.py,
     cited inline below) -- e.g. "set_ready-precondition" is only ever
     taken by set_ready()'s own `_precondition(ctx, "set_ready", "room",
     _marker_check("room"))`, and the SCRIPT's continuation past this point
     (later steps' files existing) proves the workflow really was in the
     room, independent of whether the marker agreed at the time.
  3. For a wait_for() polling group (files "<step>-1".."<step>-N" from one
     action call), only the FINAL attempt is trusted as reaching the target
     state; earlier attempts are trusted as a confident negative ONLY where
     an independent, documented physical reason for a delay exists (splash
     screen before login, map loading before the battle HUD renders,
     client-side toggle lag opening the console) -- see LOADING_STEP_PREFIXES
     below. For the two OR-gated completion conditions this task's own
     incident is about (room OR notice_popup: create_pve_room-confirm,
     join_room-room, wait_result_then_room-room), an early "failed" attempt
     is NOT trusted as a negative for either half of the OR -- that would be
     circular (assuming the very marker under audit was correctly false is
     exactly the bug this script exists to catch). Only the final attempt
     (room=True; notice_popup left unlabeled) is used from those groups.

Everything else -- ad hoc/manual research screenshots with no reliable
label, and the small number of genuinely non-deterministic steps
(login's IME-notice retry check; focus_client()'s "confirm OS focus
switched" shot, which is not tied to any particular game screen) -- is
listed as unresolved, NOT guessed into the matrix. Run with
--list-unresolved to print samples for manual (high-tier) labeling.

Usage:
  python3 screen_matrix.py --shots-dir /path/to/shots
  python3 screen_matrix.py --shots-dir /path/to/shots --list-unresolved
  python3 screen_matrix.py --shots-dir /path/to/shots --csv out.csv
"""
import argparse
import csv
import os
import re
import sys
from collections import defaultdict

import screens
from PIL import Image

# ---------------------------------------------------------------------------
# Filename -> (family, seq, step) parsing
# ---------------------------------------------------------------------------
_SEQ_RE = re.compile(r"-(\d{2,3})-")


def split_filename(stem):
    """('U-pve-escort-09-select_map:defense-precondition') ->
    ('U-pve-escort', 9, 'select_map:defense-precondition'). Returns
    (None, None, stem) if no "-NN-" run/seq marker is found (ad hoc names)."""
    m = _SEQ_RE.search(stem)
    if not m:
        return None, None, stem
    family = stem[: m.start()]
    seq = int(m.group(1))
    step = stem[m.end():]
    # u-20260919-01-00-start.png style: a second 2-digit sub-seq right after
    # the first -- strip it too so 'step' is just 'start'.
    m2 = re.match(r"^(\d{2,3})-(.+)$", step)
    if m2:
        step = m2.group(2)
    return family, seq, step


def strip_attempt(step):
    """('campaign_win_all-battle-3') -> ('campaign_win_all-battle', 3).
    (step, None) if there is no trailing "-N" attempt suffix."""
    m = re.match(r"^(.*)-(\d+)$", step)
    if not m:
        return step, None
    return m.group(1), int(m.group(2))


# ---------------------------------------------------------------------------
# Ground truth tags
# ---------------------------------------------------------------------------
# A "tags" dict has (all optional):
#   primary: one of KNOWN_PRIMARIES below, or "loading" (a documented
#            transitional frame -- confident negative for everything, no
#            positive claims)
#   console_open: None | "lobby" | "battle"
#   notice_popup: True | False | None(unknown, excluded)
#   create_dialog: True | False | None
#   dialog_tab: None | "pvp" | "pve"
#   mapsel: True | False | None
#   shop_tab: None | "main" | "aux" | "equip" | "item" | "mshop"
KNOWN_PRIMARIES = {"login", "lobby", "shop", "room", "battle", "result"}

# Exact filenames already named/used as BUILD_SPEC reference sources in
# screens.py, or their documented companions (see module docstring point 1).
# Comments cite the screens.py line/comment each one comes from.
# "Last attempt in a wait_for() polling group" is trusted as a positive
# example (see LOADING_STEP_PREFIXES below) on the assumption that the group
# ended because check_fn finally returned True -- but wait_for() also exits
# on a plain timeout, with NO screenshot-level way to tell which happened
# from the image alone. Manually cross-checked (this task) every currently-
# present "login-lobby"/"login_as-lobby" last-attempt file against
# screens.classify_screen() directly; these 3 are confirmed timeouts, not
# successes -- each one visibly still shows the login screen with a login-
# failure NOTICE popup up (viewed directly: "ID、密碼只能使用..." on the
# first, "無法接受認證。請重試。" on the other two), i.e. login()/login_as()
# never actually reached the lobby on these particular runs. Excluded rather
# than mislabeled "lobby". This is a manual, one-time cross-check of the
# dataset as it existed for this task -- NOT re-verified automatically, so a
# future re-run of this script against a grown shots/ dir could reintroduce
# the same class of mistake for new files; see this task's report.
KNOWN_TIMEOUT_NOT_SUCCESS = {
    "U-login-only-07-login-lobby-5.png",
    "dual-netspeed-b-07-login_as-lobby-4.png",
    "dual-netspeed-c-06-login_as-lobby-4.png",
}

EXPLICIT_REFS = {
    "login-screen.png": {"primary": "login"},  # BUILD_SPEC screens.login source
    "lobby-now.png": {"primary": "lobby", "notice_popup": True},  # notice_popup source (AFK-kick popup)
    "ref-00-lobby.png": {"primary": "lobby"},
    "ref-01-create.png": {"primary": "lobby", "create_dialog": True, "dialog_tab": "pvp"},  # dialog_pvp source
    "ref-02-create-pve.png": {"primary": "lobby", "create_dialog": True, "dialog_tab": "pve"},  # dialog_pve source
    "ref-03-room.png": {"primary": "room", "notice_popup": True},  # "confirmed to also match the room's host-transfer popup (ref-03-room.png, MAD 2.28)"
    "ref-04-room-clean.png": {"primary": "room"},  # room marker source (post-2026-09-21 recalibration)
    "ref-05-battle.png": {"primary": "battle"},  # battle marker + console_battle "closed" source
    "ref-07-left-room.png": {"primary": "lobby"},
    "f24-after.png": {"primary": "lobby", "console_open": "lobby"},  # console open (lobby) source
    "f24-before.png": {"primary": "lobby", "console_open": None},  # named symmetrically with f24-closed/-after
    "f24-closed.png": {"primary": "lobby", "console_open": None},  # console closed (lobby) source
    "f24-pre-esc.png": {"primary": "lobby", "console_open": "lobby"},  # close_console()'s own precondition moment
    "gc-console.png": {"primary": "battle", "console_open": "battle"},  # console_battle "open" source
    # gc-r2..r5.png: screens.py's own comment cites these alongside
    # gc-console.png as "battle" references for battle_hud_state() (green
    # pixel count), which says nothing about console state -- WRONGLY
    # assumed console-closed in an earlier version of this file. Measured
    # directly (this task): all four read console_prompt_state=open
    # (white_px=42, identical to gc-console.png's own 42) -- they are from
    # the same "gc-" GameCampaign console-testing research burst as
    # gc-console.png, console open throughout, not a battle+closed
    # counterexample. Tagged open, matching the actual pixels.
    "gc-r2.png": {"primary": "battle", "console_open": "battle"},
    "gc-r3.png": {"primary": "battle", "console_open": "battle"},
    "gc-r4.png": {"primary": "battle", "console_open": "battle"},
    "gc-r5.png": {"primary": "battle", "console_open": "battle"},
    "esc-01-mapsel.png": {"primary": "room", "mapsel": True},  # mapsel marker source
    "esc-02-mapset.png": {"primary": "room"},  # map picked, popup closed, still in room (same esc-* research chain)
    "esc-03-prestart.png": {"primary": "room"},  # about to press F5, still in room (same chain)
    "esc-04-battle60.png": {"primary": "battle"},  # Escort-map battle_hud_state() reference
    "esc-06-lobby.png": {"primary": "lobby"},
    "u-20260919-01-00-start.png": {"primary": "lobby"},  # BUILD_SPEC screens.lobby source
    "u-20260919-01-01-shop.png": {"primary": "shop", "shop_tab": "main"},  # BUILD_SPEC screens.shop + tabs.shop_main source
    "u-20260919-01-02-aux.png": {"primary": "shop", "shop_tab": "aux"},  # tabs.shop_aux source
    "u-20260919-01-02-equip.png": {"primary": "shop", "shop_tab": "equip"},  # tabs.shop_equip source
    "u-20260919-01-02-item.png": {"primary": "shop", "shop_tab": "item"},  # tabs.shop_item source
    "u-20260919-01-02-mshop.png": {"primary": "shop", "shop_tab": "mshop"},  # tabs.shop_mshop source
    "u-20260919-01-03-back.png": {"primary": "lobby"},  # back_to_lobby() result
}
# ref-06-end-1..8.png: NOT 8 copies of one screen -- checked directly with
# screens.py before trusting the filename series (module docstring point 2's
# "cross-reference against measurements" -- this is exactly the kind of
# same-looking-name-different-content trap this task is about). Measured:
# end-1/2 match neither result (MAD 94) nor room (MAD 58) confidently --
# some other transitional frame, left unresolved; end-3/4/5 match "result"
# at MAD 0.00 (end-3 is BUILD_SPEC's own marker source); end-6/7/8 match
# "room" at MAD 0.00 -- this is wait_result_then_room()'s own documented
# behavior caught mid-burst ("shows the result screen for a few seconds,
# then automatically returns to the room without any input").
for _i in (3, 4, 5):
    EXPLICIT_REFS[f"ref-06-end-{_i}.png"] = {"primary": "result"}
for _i in (6, 7, 8):
    EXPLICIT_REFS[f"ref-06-end-{_i}.png"] = {"primary": "room"}

# Step prefixes (post strip_attempt()) whose EARLIER (non-final) attempts in
# a wait_for() polling group have an independently-documented physical
# reason to still be "not there yet" (not just "the marker we're auditing
# said no") -- see module docstring point 3. Tagged primary="loading": a
# confident negative for every screen/marker check, no positive claims.
LOADING_STEP_PREFIXES = {
    # "A freshly launched client shows the splash first; the login screen
    # can take ~30s to appear" (login()/login_as() docstrings).
    "login-screen", "login_as-screen",
    # Same wait, target=lobby instead of login -- the post-submit gap before
    # the lobby renders (login()/login_as() call this right after the
    # login_cq packet wait).
    "login-lobby", "login_as-lobby",
    # "the client has not loaded the map (loading screen still up)"
    # (campaign_win_all()'s own docstring, citing the 2026-09-19 journal).
    "campaign_win_all-battle", "campaign_fail-battle", "deltest-battle",
    # "F24 toggles the console" -- real client-side render lag between the
    # keypress and the overlay appearing (campaign_win_all-console-N is the
    # wait_for AFTER campaign_win_all's own console-pre single-shot check).
    "campaign_win_all-console", "campaign_fail-console", "deltest-console",
}

# Step prefixes whose completion condition is "room marker OR notice_popup
# marker" (screens.py's own room marker is one of the two signals under
# audit here) -- see module docstring point 3 for why early attempts in
# these specific groups are excluded rather than treated as negatives.
OR_GATED_STEP_PREFIXES = {
    "join_room-room", "wait_result_then_room-room",
}
# create_pve_room-confirm is OR-gated too (room OR notice_popup) but is
# handled separately, NOT lumped into OR_GATED_STEP_PREFIXES's generic
# "don't know which half of the OR passed" treatment: measured (this task)
# for every one of the 8 create_pve_room-confirm-1 files currently in
# shots/, marker:room reads the dimmed 46.84 (not a clean 0.00) and
# marker:notice_popup reads 2.28 (a clean present match) -- a 100%-
# consistent pattern, not a coincidence, and independently corroborated by
# the operator's own observation (docs/journal/2026-09-21-2120-dual-pico-
# bc.md: "房主建房後會跳「您接受了房主的委任」，不點掉就不能開戰" -- the
# host ALWAYS gets this popup right after creating a room). So unlike
# join_room-room/wait_result_then_room-room (whose "last" frames mostly read
# a clean, undimmed room marker match -- see this task's report), treat
# create_pve_room-confirm's "last" frame as a CONFIRMED notice_popup=True
# (dimmed) example, not merely "unknown" -- and therefore NOT a room=True
# example either (ground_truth()'s dimmed_by_notice guard already excludes
# marker:room/screen:* claims whenever notice_popup=True).
CREATE_ROOM_CONFIRM_PREFIX = "create_pve_room-confirm"

# Step prefixes that are best-effort / not gating (wait_result_then_room's
# own docstring: "Seeing the result screen is best-effort (a fast transition
# could be missed between polls)") -- neither the final nor any earlier
# attempt can be trusted either way.
BEST_EFFORT_STEP_PREFIXES = {"wait_result_then_room-result"}


def _dismiss_notice_context(mtime, family_files):
    """dismiss_notice() (actions.py) always takes a 'dismiss_notice-check'
    shot first; it only proceeds to click + take 'dismiss_notice-<N>' shots
    if screens.detect_marker(shot, 'notice_popup') was True on the check
    shot. So: a 'dismiss_notice-check' has notice_popup=True iff a
    'dismiss_notice-<N>' file's capture time immediately follows it (within
    NEARBY_S) with no OTHER 'dismiss_notice-check' in between; the resulting
    'dismiss_notice-<N>' shot (from wait_for polling for the popup to be
    gone) is trusted as notice_popup=False (every observed instance in
    shots/ dismissed on its first post-click poll, no 'dismiss_notice-2'
    exists anywhere).

    IMPORTANT: this uses file MTIME, not the "-NN-" seq number in the
    filename, to find "the next thing that happened". shots/ mixes files
    from MANY separate re-runs of the same experiment id (its "-NN-" seq
    counter restarts at 1 every run, so filenames collide across runs whose
    seq ranges happen to overlap -- e.g. dual-netspeed-b has files at
    literally every seq 3..22 duplicated across at least 4 separate runs,
    hours apart, confirmed by `ls --time-style=full-iso` for this task).
    Ordering by seq instead of mtime would silently splice together steps
    from DIFFERENT runs as if they were one timeline. mtime is the actual
    real-world capture order and is reliable here (shots/ is gitignored,
    never touched by a checkout/rsync that would reset it).

    Screen context (lobby vs room) for the popup: originally found via the
    temporally nearest create_pve_room-confirm-1 file -- WRONG whenever that
    file itself got overwritten by a later, unrelated run (shots/'s merged-
    runs problem, see above): U-pve-fullmatch-25-dismiss_notice-check.png
    (2026-09-20 00:49:37, immediately after this run's own
    wait_result_then_room-room-3 at 00:49:35 and right before its own
    leave_room-precondition at 00:49:39 -- unambiguously room) has its own
    run's create_pve_room-confirm-1 file gone (overwritten); the only
    create_pve_room-confirm-1 surviving for this family is from a totally
    different, LATER run (2026-09-20 11:55:20) -- "nearest confirm mtime"
    picked that one and called this check "lobby" (mtime earlier than the
    only confirm it could find), backwards. marker:room measures 0.00 on
    this file, confirming "room" is right. Fixed by looking at whatever
    OTHER family event most closely PRECEDES this check instead of hunting
    for one specific step type that might not have survived: any nearby
    wait_result_then_room-room/create_pve_room-confirm/dialog/tab/
    dismiss_notice(non-check)/select_map/start_battle/campaign_win_all/
    set_ready/host_start_battle/leave_room-precondition step means "already
    in the room"; initial-precondition/login*/create_pve_room-precondition/
    goto_shop*/shop_tab*/back_to_lobby/join_room-precondition means "still
    in the lobby". Whichever kind of step is the closest PRECEDING neighbor
    (by mtime) wins -- this degrades gracefully when one specific step's own
    file was overwritten, as long as SOME neighboring step from the same run
    survived (true for every dismiss_notice-check in the current dataset)."""
    ROOM_PHASE_PREFIXES = (
        "wait_result_then_room-room", "create_pve_room-confirm", "create_pve_room-dialog",
        "create_pve_room-tab", "dismiss_notice-", "select_map", "start_battle",
        "campaign_win_all", "campaign_fail", "deltest", "set_ready", "host_start_battle",
        "leave_room-precondition", "enter_battle", "console_cmd_on",
    )
    LOBBY_PHASE_PREFIXES = (
        "initial-precondition", "login-", "login_as-", "create_pve_room-precondition",
        "goto_shop", "shop_tab", "back_to_lobby", "join_room-precondition",
    )

    def _phase(st):
        if st == "dismiss_notice-check":
            return None  # a check is not itself evidence of the phase it's checking
        if st.startswith(ROOM_PHASE_PREFIXES):
            return "room"
        if st.startswith(LOBBY_PHASE_PREFIXES):
            return "lobby"
        return None

    preceding = sorted((m, st) for m, st in family_files if m < mtime)
    context = "room"  # default if nothing informative precedes (e.g. "-tail" resume)
    for m, st in reversed(preceding):
        ph = _phase(st)
        if ph is not None:
            context = ph
            break

    NEARBY_S = 60.0
    dismiss_related = sorted((m, st) for m, st in family_files if st.startswith("dismiss_notice"))
    next_present = any(
        st != "dismiss_notice-check" and 0 < (m - mtime) <= NEARBY_S
        for m, st in dismiss_related
        # ...and no OTHER check in between this check and that dismissal
        if not any(st2 == "dismiss_notice-check" and mtime < m2 < m for m2, st2 in dismiss_related)
    )
    return context, next_present


def label_image(fname, mtime, family_files):
    """Returns (tags dict or None, reason string). family_files is the list
    of (mtime, step) pairs for every file (including this one) sharing this
    file's family (for polling-group / dismiss_notice context lookups --
    mtime, not the filename's "-NN-" seq number, see _dismiss_notice_context
    for why)."""
    if fname in EXPLICIT_REFS:
        return dict(EXPLICIT_REFS[fname]), "explicit-ref"
    if fname in KNOWN_TIMEOUT_NOT_SUCCESS:
        return None, "wait_for-timed-out-not-succeeded(manually confirmed)"

    stem = fname[:-4]
    family, seq, step = split_filename(stem)
    if family is None:
        return None, "ad-hoc-name-no-seq-marker"

    # --- login-only family's "initial-precondition" is a login screen (the
    # whole point of that experiment is testing from a fresh unauthenticated
    # client), every other family's is lobby (every other experiment JSON's
    # `preconditions.screen` is "lobby") -- see this task's report.
    if step == "initial-precondition":
        if "login-only" in family:
            return {"primary": "login"}, "initial-precondition(login-only)"
        # "-tail" families (e.g. U-pve-fullmatch-tail) do NOT start from the
        # lobby -- their very first real step is already campaign_win_all
        # (a resume/mid-battle scenario), confirmed by measurement (this
        # task): U-pve-fullmatch-tail-01-initial-precondition.png reads
        # battle_hud green_px=6305 (battle-range, see BATTLE_SP_MIN_PX),
        # not a lobby frame -- so "every family's initial-precondition is
        # lobby" is wrong for this one. Rather than guess "battle" from that
        # same measurement (circular -- it would make battle_hud untestable
        # against this file), leave it unresolved: only trust "lobby" when
        # this family also has a normal create_pve_room-precondition step
        # (i.e. it really did start the usual lobby-first way).
        has_normal_start = any(st == "create_pve_room-precondition" for _, st in family_files)  # (mtime, step) pairs
        if has_normal_start:
            return {"primary": "lobby"}, "initial-precondition"
        return None, "initial-precondition(non-standard-start, e.g. -tail)"

    if step == "login-precondition":
        # Legacy label, same contract as login-screen-N -- but only trust it
        # for the family it was actually cross-checked against
        # (U-login-only-02-login-precondition.png measures login=0.00, a
        # clean match). U-relaunch-login-01-login-precondition.png shares the
        # same step name by coincidence but is a ~17KB anomalous capture
        # (classify_screen -> "unknown", console_prompt_state white_px=390,
        # nothing like a real login screen) -- caught by cross-checking
        # before trusting the rule, not assumed to generalize to every
        # family that happens to use this label.
        if family == "U-login-only":
            return {"primary": "login"}, "login-precondition"
        return None, "login-precondition(unverified-for-this-family)"

    if re.match(r"^login-attempt\d+-notice$", step) or re.match(r"^login_as-(host|joiner)-attempt\d+-notice$", step):
        return None, "login-notice-check(ambiguous, see docstring)"

    if step in ("goto_shop-precondition", "back_to_lobby-precondition"):
        return {"primary": "lobby" if step.startswith("goto_shop") else "shop"}, step
    if re.match(r"^shop_tab:(aux|equip|item|mshop)-precondition$", step):
        prev = {"aux": "main", "equip": "aux", "item": "equip", "mshop": "item"}[step.split(":")[1].split("-")[0]]
        return {"primary": "shop", "shop_tab": prev}, step
    if re.match(r"^shop_tab-(aux|equip|item|mshop)-\d+$", step):
        name = re.match(r"^shop_tab-(\w+)-\d+$", step).group(1)
        return {"primary": "shop", "shop_tab": name}, step
    if step.startswith("goto_shop-"):
        return {"primary": "shop", "shop_tab": "main"}, step
    if step.startswith("back_to_lobby-"):
        return {"primary": "lobby"}, step

    if step == "create_pve_room-precondition":
        return {"primary": "lobby"}, step
    if step == "create_pve_room-dialog-1":
        return {"primary": "lobby", "create_dialog": True, "dialog_tab": "pvp"}, step
    if step == "create_pve_room-tab-1":
        return {"primary": "lobby", "create_dialog": True, "dialog_tab": "pve"}, step

    if step == "join_room-precondition":
        return {"primary": "lobby"}, step
    if step in ("set_ready-precondition", "host_start_battle-precondition", "leave_room-precondition",
                "start_battle-precondition"):
        return {"primary": "room"}, step
    if step == "set_ready-result":
        return {"primary": "room"}, step  # F5-ready toggles state, does not change screen
    if re.match(r"^select_map:\w+-precondition$", step):
        return {"primary": "room"}, step
    if re.match(r"^select_map-\w+-popup-\d+$", step):
        return {"primary": "room", "mapsel": True}, step
    if step.startswith("leave_room-") and step != "leave_room-precondition":
        return {"primary": "lobby"}, step
    if step == "enter_battle-hud-1":
        return {"primary": "battle"}, step
    if step == "campaign_win_all-console-pre":
        return {"primary": "battle", "console_open": None}, step

    # NOTE: login-screen-N / login-lobby-N / login_as-screen-N /
    # login_as-lobby-N are deliberately NOT matched here -- they fall through
    # to the generic polling-group handling below (LOADING_STEP_PREFIXES),
    # which only trusts the FINAL attempt in each group as having reached
    # login/lobby. An earlier version of this function matched them here
    # unconditionally, which mislabeled e.g.
    # dual-netspeed-a-05-login_as-lobby-2.png (attempt 2 of 4, an early
    # "still on the login screen, not yet lobby" frame -- classify_screen
    # measures it at login=0.00 -- as ground-truth "lobby", which is exactly
    # backwards). Caught by cross-checking against screens.py's own output
    # before trusting the rule, not by inspection.

    if step == "dismiss_notice-check":
        context, next_present = _dismiss_notice_context(mtime, family_files)
        return {"primary": context, "notice_popup": next_present}, f"dismiss_notice-check({context})"
    if re.match(r"^dismiss_notice-\d+$", step):
        # Reuse the context of the check that immediately (by mtime)
        # preceded this dismissal shot.
        checks_before = [m for m, st in family_files if st == "dismiss_notice-check" and m < mtime]
        if checks_before:
            context, _ = _dismiss_notice_context(max(checks_before), family_files)
        else:
            context = "room"  # no preceding check found -- shouldn't happen; safe fallback
        return {"primary": context, "notice_popup": False}, f"dismiss_notice-dismissed({context})"

    if step in ("start_battle-result", "host_start_battle-result", "campaign_win_all-precondition"):
        return None, "screen-transition-not-checked(see docstring)"

    if step.startswith("wait_result_then_room-result"):
        return None, "best-effort-result-marker(see docstring)"

    if step.startswith("focus-"):
        return None, "focus-client-readback(not tied to a game screen)"

    # --- polling-group steps: strip the trailing "-N" and look at the whole
    # family to find the max attempt actually reached WITHIN THIS SAME CALL.
    # A family can contain the SAME step prefix from two independent wait_for
    # calls (e.g. dual-netspeed-a's login_as() runs once for "host" then once
    # for "joiner", each producing its own "login_as-lobby-1..N" starting
    # back at 1) -- blindly taking the family-wide max attempt would treat
    # the joiner's own (possibly already-successful) attempt-1 as an "early,
    # not yet there" frame just because the host's earlier call happened to
    # reach a higher attempt number. Each attempt==1 marks the start of a new
    # call, so the group boundaries are exactly the positions where attempt
    # resets to 1 (caught by cross-checking dual-netspeed-a-05-login_as-
    # lobby-2.png against screens.py directly -- it measures login=0.00, not
    # lobby, i.e. the family-wide-max version of this rule was backwards).
    prefix, attempt = strip_attempt(step)
    if attempt is not None:
        group_entries = sorted(
            (m, a) for m, st in family_files for stp, a in [strip_attempt(st)] if stp == prefix and a is not None
        )
        # Split into runs: a new run starts whenever the attempt number does
        # NOT strictly increase from the previous entry (by mtime order) --
        # not just "whenever it resets to exactly 1". Splitting only on
        # exact resets-to-1 is not enough: dual-netspeed-b's join_room-room
        # has three merged runs whose attempt sequence (sorted by mtime) is
        # 1,2,3, 2,3, 1 -- the middle run (a second attempt, its own
        # attempt-1 overwritten by yet another run reusing that seq number)
        # never touches "1" again, so it would otherwise get silently fused
        # onto the tail of the FIRST run's [1,2,3], making both runs' own
        # final attempt read as "the" last attempt of one merged 5-long
        # group. Caught by cross-checking: that fused reading called BOTH
        # dual-netspeed-b-18-join_room-room-3.png (room MAD 64.12, this
        # run's real join_room-room bug) AND dual-netspeed-b-19-join_room-
        # room-3.png (room MAD 0.00, a different run's real success)
        # "the last attempt", when only the latter should be trusted.
        runs = []
        prev_a = None
        for m, a in group_entries:
            if prev_a is None or a <= prev_a:
                runs.append([])
            runs[-1].append((m, a))
            prev_a = a
        max_attempt, is_last, complete = None, False, False
        for run in runs:
            if any(m == mtime for m, a in run):
                complete = run[0][1] == 1  # run's own first entry is attempt==1
                max_attempt = max(a for _, a in run)
                is_last = complete and attempt == max_attempt
                break
        if max_attempt is None or not complete:
            return None, f"{prefix}(orphaned-attempt-group,see-mtime-comment)"

        if prefix == CREATE_ROOM_CONFIRM_PREFIX:
            if is_last:
                return {"primary": "room", "notice_popup": True}, f"{prefix}(confirmed-notice-fallback)"
            return None, f"{prefix}(early-attempt-excluded)"

        if prefix in OR_GATED_STEP_PREFIXES:
            if is_last:
                # notice_popup explicitly "unknown" (not just an absent key,
                # see ground_truth()'s handling of the three notice_popup
                # states) -- this frame passed via "room OR notice_popup",
                # we don't know which. Measured (this task): at least one
                # such frame (U-assist-baseline-06-create_pve_room-
                # confirm-1.png) scores notice_popup MAD 2.28, identical to
                # a confirmed-present example -- silently defaulting this to
                # "notice_popup=False" (this module's usual assumption for
                # ordinary room/lobby frames with no popup evidence either
                # way) would have been a real false-negative here, caught by
                # cross-checking before trusting the default.
                return {"primary": "room", "notice_popup": "unknown"}, f"{prefix}(OR-gated,last)"
            return None, f"{prefix}(OR-gated,early-attempt-excluded)"

        if prefix in BEST_EFFORT_STEP_PREFIXES:
            return None, f"{prefix}(best-effort)"

        if prefix in LOADING_STEP_PREFIXES:
            if is_last:
                if prefix.endswith("-battle"):
                    return {"primary": "battle"}, f"{prefix}(loading-group,last)"
                if prefix.endswith("-console"):
                    return {"primary": "battle", "console_open": "battle"}, f"{prefix}(loading-group,last)"
                if "login" in prefix and "lobby" in prefix:
                    return {"primary": "lobby"}, f"{prefix}(loading-group,last)"
                if "login" in prefix and "screen" in prefix:
                    return {"primary": "login"}, f"{prefix}(loading-group,last)"
            else:
                if prefix.endswith("-console"):
                    # NOT assumed closed: unlike the battle-loading case (a
                    # real, independently-documented time cost), an early
                    # "-console-N" attempt is not reliably still-closed --
                    # campaign_win_all()'s own console-pre check skips
                    # pressing F24 at all when the console is ALREADY open
                    # (left open from an earlier call in the same session),
                    # in which case attempt 1 legitimately reads open from
                    # the very first frame. Measured (this task): U-pve-
                    # fullmatch-tail-02-campaign_win_all-console-1.png, an
                    # "early" attempt by this grouping, reads
                    # console_prompt_state=open (white_px=43) -- so
                    # defaulting it to "closed" would have been wrong here
                    # too. Leave unresolved rather than guess.
                    return None, f"{prefix}(loading-group,early,console-may-already-be-open)"
                return {"primary": "loading"}, f"{prefix}(loading-group,early)"

    return None, "unmapped-step"


# ---------------------------------------------------------------------------
# Ground truth -> per-check expected booleans
# ---------------------------------------------------------------------------
def ground_truth(tags):
    gt = {}
    primary = tags.get("primary")
    console_open = tags.get("console_open")
    known = primary in KNOWN_PRIMARIES
    # Documented, already-mitigated confound (screens.py's own comment on the
    # "room" marker: "Still dims like the old box when a NOTICE popup is up
    # (same whole-screen dim mechanic ...), so _room_or_notice_check()'s
    # fallback is unaffected/still needed for that case" -- measured directly
    # for this task: ref-03-room.png/lobby-now.png/every dismiss_notice-check
    # with a real notice up all read their OWN primary screen's marker as a
    # clean miss (room MAD 46.8, lobby classify_screen score 15.4) purely
    # because the popup dims the whole frame, not because the marker box is
    # wrong. That is a known, already-designed-around limitation (the OR
    # fallback exists BECAUSE of it) -- do not re-report it here as a fresh
    # "worst true" data point for room/lobby/shop/battle/etc.; it would just
    # bury the genuinely-undocumented fragile cases (e.g. this task found the
    # SAME dimming also happens for the map-select popup, which is NOT
    # documented anywhere -- that one is kept, see select_map's tags below,
    # since primary stays "room" and it is not flagged notice_popup=True).
    dimmed_by_notice = tags.get("notice_popup") is True

    for cand in ("lobby", "shop", "login"):
        if primary == cand and console_open is None and not dimmed_by_notice:
            gt[f"screen:{cand}"] = True
        elif known and primary != cand and console_open is None:
            gt[f"screen:{cand}"] = False
    if console_open == "lobby" and not dimmed_by_notice:
        gt["screen:console_open"] = True
    elif known and console_open is None:
        gt["screen:console_open"] = False

    if console_open == "lobby" and not dimmed_by_notice:
        gt["console_lobby:open"] = True
        gt["console_lobby:closed"] = False
    elif primary in ("lobby", "shop", "login") and console_open is None:
        gt["console_lobby:open"] = False
        gt["console_lobby:closed"] = True

    if console_open == "battle" and not dimmed_by_notice:
        gt["console_battle:open"] = True
        gt["console_battle:closed"] = False
        gt["console_prompt:open"] = True
    elif primary == "battle" and console_open is None:
        gt["console_battle:open"] = False
        gt["console_battle:closed"] = True
        gt["console_prompt:open"] = False
    elif known and primary != "battle" and console_open is None:
        gt["console_prompt:open"] = False

    if primary == "room" and not dimmed_by_notice:
        gt["marker:room"] = True
    elif known and primary != "room":
        gt["marker:room"] = False
    if primary == "battle" and not dimmed_by_notice:
        gt["marker:battle"] = True
        gt["battle_hud"] = True
    elif known and primary != "battle":
        gt["marker:battle"] = False
        gt["battle_hud"] = False
    if primary == "result" and not dimmed_by_notice:
        gt["marker:result"] = True
    elif known and primary != "result":
        gt["marker:result"] = False

    cd = tags.get("create_dialog")
    if cd is True and not dimmed_by_notice:
        gt["marker:create_dialog"] = True
    elif cd is False or (known and cd is None):
        gt["marker:create_dialog"] = False

    npop = tags.get("notice_popup")
    if npop is True:
        gt["marker:notice_popup"] = True
    elif npop is False:
        gt["marker:notice_popup"] = False
    elif known and npop is None:
        # No positive evidence of a popup at this step -- see module
        # docstring: popups are the rare/transient exception, not the rule,
        # so "we never specifically saw one here" defaults to False. This is
        # a documented assumption, not a certainty -- flagged in the report.
        gt["marker:notice_popup"] = False

    msel = tags.get("mapsel")
    if msel is True:
        gt["marker:mapsel"] = True
    elif known:
        gt["marker:mapsel"] = bool(msel)

    if primary == "shop":
        want = tags.get("shop_tab")
        for t in ("main", "aux", "equip", "item", "mshop"):
            gt[f"tab:shop_{t}"] = (want == t)
    if cd is True:
        want = tags.get("dialog_tab")
        for t in ("pvp", "pve"):
            gt[f"tab:dialog_{t}"] = (want == t)

    return gt


# ---------------------------------------------------------------------------
# Score extraction (read-only calls into screens.py's existing public API)
# ---------------------------------------------------------------------------
CHECKS = []  # list of (name, polarity) -- populated as we compute, see main()


def compute_scores(path):
    """One dict of check_name -> raw score for a single image. polarity is
    handled separately (LOW_IS_TRUE / HIGH_IS_TRUE below) so this function
    only ever returns the raw numbers screens.py itself produces."""
    scores = {}
    r = screens.classify_screen(path)
    for cand in ("lobby", "shop", "login", "console_open"):
        if cand in r.scores:
            scores[f"screen:{cand}"] = r.scores[cand]

    for variant in ("lobby", "battle"):
        state, so, sc, margin = screens.console_state(path, variant=variant)
        scores[f"console_{variant}:open"] = so
        scores[f"console_{variant}:closed"] = sc

    _, white_px = screens.console_prompt_state(path)
    scores["console_prompt:open"] = float(white_px)

    for name in ("room", "battle", "result", "create_dialog", "notice_popup", "mapsel"):
        _, score = screens.detect_marker(path, name)
        scores[f"marker:{name}"] = score

    for tab in ("shop_main", "shop_aux", "shop_equip", "shop_item", "shop_mshop", "dialog_pvp", "dialog_pve"):
        _, score = screens.is_tab_active(path, tab)
        scores[f"tab:{tab}"] = score

    _, green_px = screens.battle_hud_state(path)
    scores["battle_hud"] = float(green_px)

    return scores


# Polarity: LOW_IS_TRUE checks are MAD-style (0 = perfect match); HIGH_IS_TRUE
# checks are raw pixel counts (more matching pixels = more "yes").
HIGH_IS_TRUE = {"console_prompt:open", "battle_hud"}


def confidence(check_name, score):
    """Higher confidence == more "yes" for this check, regardless of the
    underlying metric's own polarity -- see module docstring's "PM 指定的兩
    個硬性要求 (2)"."""
    if check_name in HIGH_IS_TRUE:
        return score
    return -score


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--shots-dir", required=True)
    ap.add_argument("--csv", default=None, help="also write the full per-check true/false score lists here")
    ap.add_argument("--list-unresolved", action="store_true", help="print sample filenames per unresolved reason")
    ap.add_argument("--unresolved-samples", type=int, default=5)
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(args.shots_dir) if f.lower().endswith(".png"))

    rejected = []  # (fname, size)
    accepted = []
    for f in files:
        path = os.path.join(args.shots_dir, f)
        try:
            with Image.open(path) as im:
                size = im.size
        except Exception as e:
            rejected.append((f, f"unreadable: {e}"))
            continue
        if size != screens.SHOT_SIZE:
            rejected.append((f, size))
            continue
        accepted.append(f)

    # Pre-group accepted files by family for the polling-group / dismiss_notice
    # context lookups in label_image() -- keyed by mtime (real capture order),
    # not the filename's "-NN-" seq number (see _dismiss_notice_context's
    # docstring for why: shots/ mixes files from many separate re-runs whose
    # seq counters all restart at 1, so seq order does not reflect real time
    # across the merged set).
    by_family = defaultdict(list)
    parsed = {}
    mtimes = {}
    for f in accepted:
        stem = f[:-4]
        family, seq, step = split_filename(stem)
        parsed[f] = (family, seq, step)
        mtimes[f] = os.path.getmtime(os.path.join(args.shots_dir, f))
        if family is not None:
            by_family[family].append((mtimes[f], step))

    labeled = {}      # fname -> tags
    reasons = {}      # fname -> reason string (labeled images only)
    unresolved = defaultdict(list)  # reason -> [fname,...]
    for f in accepted:
        family, seq, step = parsed[f]
        family_files = by_family.get(family, [])
        tags, reason = label_image(f, mtimes[f], family_files)
        if tags is None:
            unresolved[reason].append(f)
        else:
            labeled[f] = tags
            reasons[f] = reason

    print(f"[shots] {len(files)} .png found, {len(accepted)} at SHOT_SIZE {screens.SHOT_SIZE}, "
          f"{len(rejected)} rejected (wrong size/unreadable)")
    print(f"[labels] {len(labeled)} images ground-truthed, {sum(len(v) for v in unresolved.values())} unresolved "
          f"({len(unresolved)} distinct reasons)")
    print()

    if rejected:
        print(f"--- REJECTED (wrong size, size gate -- {len(rejected)} files) ---")
        for f, size in rejected:
            print(f"  {f}: {size}")
        print()

    # Compute scores only for labeled images (no point scoring the unresolved
    # ones -- they contribute nothing to the matrix).
    all_scores = {}
    for f in labeled:
        all_scores[f] = compute_scores(os.path.join(args.shots_dir, f))

    # Post-hoc sanity check for OR-gated "last attempt" frames (see
    # OR_GATED_STEP_PREFIXES's docstring point 3): "is_last" only means "this
    # is the group's own final polling attempt", which is a good proxy for
    # "the OR-check must have passed" -- but wait_for() also stops on a plain
    # timeout, and shots/'s many merged/overwritten re-runs (see the mtime
    # comments above) can leave a genuinely-failed run's own final attempt
    # looking like a complete, well-formed group. Caught this way (not by
    # inspection): dual-netspeed-b-18-join_room-room-3.png is exactly this --
    # a COMPLETE 3-attempt group (starts at attempt 1) whose own last frame
    # still measures room=64.12 AND notice_popup=49.19, i.e. NEITHER half of
    # the OR check screens.py would use today actually accepts it, matching
    # this run's real documented failure (docs/journal/2026-09-21-2120-dual-
    # pico-bc.md failure #2: "join_room | 房間 60秒就消失"). Drop any such
    # frame to unresolved instead of asserting room=True on it.
    for f in list(labeled):
        reason = reasons.get(f, "")
        if "OR-gated,last" not in reason:
            continue
        s = all_scores[f]
        room_ok = s.get("marker:room", 999) <= screens.THRESHOLDS["marker_accept"]
        notice_ok = s.get("marker:notice_popup", 999) <= screens.THRESHOLDS["marker_accept"]
        if not (room_ok or notice_ok):
            unresolved[f"{reason}+neither-signal-actually-accepts(likely-timeout)"].append(f)
            del labeled[f]
            del all_scores[f]

    # Build per-check true/false score lists.
    check_names = sorted({k for s in all_scores.values() for k in s})
    true_scores = defaultdict(list)   # check -> [(fname, score), ...]
    false_scores = defaultdict(list)
    for f, tags in labeled.items():
        gt = ground_truth(tags)
        scores = all_scores[f]
        for check, expected in gt.items():
            if check not in scores:
                continue
            (true_scores if expected else false_scores)[check].append((f, scores[check]))

    print(f"{'check':<22} {'n_true':>6} {'n_false':>7} {'worst_true':>12} {'best_false':>12} {'margin':>10}  verdict")
    print("-" * 100)
    rows = []
    for check in check_names:
        ts = true_scores.get(check, [])
        fs = false_scores.get(check, [])
        if not ts and not fs:
            continue
        if ts:
            worst_true_f, worst_true_s = min(ts, key=lambda kv: confidence(check, kv[1]))
        else:
            worst_true_f, worst_true_s = None, None
        if fs:
            best_false_f, best_false_s = max(fs, key=lambda kv: confidence(check, kv[1]))
        else:
            best_false_f, best_false_s = None, None
        if worst_true_s is not None and best_false_s is not None:
            margin = confidence(check, worst_true_s) - confidence(check, best_false_s)
        else:
            margin = None

        if not ts:
            verdict = "NO TRUE EXAMPLES (untested)"
        elif not fs:
            verdict = "no false examples"
        elif margin is None:
            verdict = "?"
        elif margin < 0:
            verdict = "INVERTED (dead/backwards)"
        elif margin == 0:
            verdict = "ZERO MARGIN"
        else:
            verdict = "ok"
        rows.append((check, len(ts), len(fs), worst_true_s, best_false_s, margin, verdict,
                      worst_true_f, best_false_f))
        wt = f"{worst_true_s:.2f}" if worst_true_s is not None else "-"
        bf = f"{best_false_s:.2f}" if best_false_s is not None else "-"
        mg = f"{margin:+.2f}" if margin is not None else "-"
        print(f"{check:<22} {len(ts):>6} {len(fs):>7} {wt:>12} {bf:>12} {mg:>10}  {verdict}")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["check", "n_true", "n_false", "worst_true_score", "worst_true_file",
                        "best_false_score", "best_false_file", "margin", "verdict"])
            for (check, nt, nf, wts, bfs, margin, verdict, wtf, bff) in rows:
                w.writerow([check, nt, nf, wts, wtf, bfs, bff, margin, verdict])
        print(f"\n[csv] wrote {args.csv}")

    if args.list_unresolved:
        print(f"\n--- UNRESOLVED ({sum(len(v) for v in unresolved.values())} files, "
              f"{len(unresolved)} reasons; sample {args.unresolved_samples} each) ---")
        for reason in sorted(unresolved):
            fl = unresolved[reason]
            print(f"  [{reason}] {len(fl)} files:")
            for f in fl[: args.unresolved_samples]:
                print(f"    {f}")


if __name__ == "__main__":
    main()
