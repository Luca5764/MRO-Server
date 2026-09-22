#!/usr/bin/env python3
"""
test_battle_hud_pvp.py - Offline tests for PVP-HUD-MARKER (docs/backlog.md,
2026-09-22 task).

Incident this fixes: screens.battle_hud_state() (the "is the battle HUD
up" check _battle_any_check() uses, see actions.enter_battle()) was
calibrated on PvE's green "SP0000" counter only. TDM draws a GOLD "P0000"
counter in the same screen position instead, so every real PvP battle read
as not_battle -- enter_battle() reported ok=False for a PvP room that had
actually started fine (docs/journal/2026-09-22-2055-pvp-start-works.md).

Covers, fully offline, against REAL screenshots already in shots/ (read
only, never modified, same technique as test_login_as_focus_probe.py):
  1. screens.battle_hud_state_pvp() reads "battle" on real PvP TDM battle
     captures (GAME MENU open or closed, three separate capture sessions).
  2. screens.battle_hud_state() (PvE, UNCHANGED by this task) still reads
     "battle" on the pre-existing PvE regression samples -- the hard
     constraint for this task ("PvE 的判定結果不能變").
  3. actions._battle_any_check()'s combined check accepts either kind and
     says which one fired ("battle(pve)"/"battle(pvp)") in its detail.
  4. Two edge cases that a naive PvP judge gets wrong (see
     screens.battle_hud_state_pvp()'s docstring for the measurements):
       - the post-ESC mech-select/RESPAWN-countdown page (scoreboard banner
         already visible, but the player has not spawned yet) must NOT
         read "battle".
       - a PvE (desert map) YOU-WIN result screen must NOT read "battle"
         via the PvP path (a gold-pixel-count-only judge would false
         positive here -- sand reads as "gold").
  5. _hud_pkt_contradiction_note() (the PM-requested WARN) fires exactly
     when the HUD check disagrees with a packet-confirmed spawn, and does
     not change enter_battle()'s own ok/fail verdict.

Run: python3 test_battle_hud_pvp.py
"""

import os
import sys
import unittest
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402
import screens  # noqa: E402

SHOTS_DIR = "/home/lucas/mro-reverse/shots"
RESEARCH_DIR = "/home/lucas/mro-reverse/docs/research/2026-09-22-d2-tdm"

# --- real PvP TDM battle captures (must read "battle") ---------------------
PVP_BATTLE_MENU_OPEN = os.path.join(RESEARCH_DIR, "pvp-tdm-battle-first.png")
PVP_BATTLE_CLEAN = os.path.join(SHOTS_DIR, "shot-205104.png")
PVP_BATTLE_MENU_OPEN_2 = os.path.join(SHOTS_DIR, "pvp-esc-probe-02-pvp-esc-menu.png")

# --- PvE battle regression samples (must stay "battle", unchanged) ---------
PVE_BATTLE_1 = os.path.join(SHOTS_DIR, "fps-g1-current-hook.png")
PVE_BATTLE_2 = os.path.join(SHOTS_DIR, "fps-g2-narrow.png")
PVE_BATTLE_3 = os.path.join(SHOTS_DIR, "esc-04-battle60.png")  # different map (Escort, desert)

# --- non-battle samples (must read "not_battle" both ways) -----------------
NOT_BATTLE_LOGIN = os.path.join(SHOTS_DIR, "shot-181606.png")
NOT_BATTLE_LOBBY = os.path.join(SHOTS_DIR, "U-login-only-04-login-lobby-1.png")
NOT_BATTLE_ROOM = os.path.join(SHOTS_DIR, "U-create-room-only-08-dismiss_notice-1.png")

# --- edge cases a naive PvP judge gets wrong --------------------------------
# Post-ESC mech-select page: scoreboard already visible, player not spawned.
PVP_MECH_SELECT_NOT_SPAWNED = os.path.join(SHOTS_DIR, "pvp-start-smoke-14-host_start_battle-result.png")
# PvE YOU-WIN result screen on a desert map -- gold-pixel-count-alone false
# positive candidate (sand reads as "gold", see screens.py comment).
PVE_RESULT_DESERT_GOLD_TRAP = os.path.join(SHOTS_DIR, "U-pve-escort-25-wait_result_then_room-result-3.png")

ALL_REQUIRED_SHOTS = [
    PVP_BATTLE_MENU_OPEN, PVP_BATTLE_CLEAN, PVP_BATTLE_MENU_OPEN_2,
    PVE_BATTLE_1, PVE_BATTLE_2, PVE_BATTLE_3,
    NOT_BATTLE_LOGIN, NOT_BATTLE_LOBBY, NOT_BATTLE_ROOM,
    PVP_MECH_SELECT_NOT_SPAWNED, PVE_RESULT_DESERT_GOLD_TRAP,
]


@unittest.skipUnless(all(os.path.isfile(p) for p in ALL_REQUIRED_SHOTS),
                      f"real calibration shots not found under {SHOTS_DIR}/{RESEARCH_DIR}")
class BattleHudStatePvpTest(unittest.TestCase):
    """screens.battle_hud_state_pvp() on its own, no actions.py involved."""

    def test_real_pvp_battle_captures_read_battle(self):
        for p in (PVP_BATTLE_MENU_OPEN, PVP_BATTLE_CLEAN, PVP_BATTLE_MENU_OPEN_2):
            state, (score, gold_px) = screens.battle_hud_state_pvp(p)
            self.assertEqual(state, "battle", f"{p}: score={score} gold_px={gold_px}")

    def test_pve_battle_samples_do_not_read_pvp_battle(self):
        # Not a hard requirement by itself (PvE is judged by the OTHER
        # function), but pins down that the PvP judge does not also fire on
        # PvE frames -- if it did, _battle_any_check()'s "kind" label below
        # would be misleading (pve frame + `pvp` in the detail).
        for p in (PVE_BATTLE_1, PVE_BATTLE_2, PVE_BATTLE_3):
            state, _ = screens.battle_hud_state_pvp(p)
            self.assertEqual(state, "not_battle", p)

    def test_not_battle_samples_read_not_battle(self):
        for p in (NOT_BATTLE_LOGIN, NOT_BATTLE_LOBBY, NOT_BATTLE_ROOM):
            state, _ = screens.battle_hud_state_pvp(p)
            self.assertEqual(state, "not_battle", p)

    def test_mech_select_not_yet_spawned_is_not_battle(self):
        """Scoreboard marker alone would pass here (MAD ~8, well inside
        accept=25) -- the AND with gold_px is what keeps this not_battle.
        See screens.battle_hud_state_pvp()'s docstring."""
        state, (score, gold_px) = screens.battle_hud_state_pvp(PVP_MECH_SELECT_NOT_SPAWNED)
        self.assertEqual(state, "not_battle")
        self.assertLess(score, 25.0, "scoreboard marker should still match here (sanity check)")
        self.assertLess(gold_px, screens.BATTLE_SP_MIN_PX, "not spawned yet -- no gold counter")

    def test_pve_desert_result_screen_is_not_battle(self):
        """Gold-pixel-count alone false-positives here (measured 4568px,
        close to real PvP counts of 4905-5289) -- the scoreboard marker
        (MAD ~69, far past accept=25) is what rejects it. See
        screens.battle_hud_state_pvp()'s docstring."""
        state, (score, gold_px) = screens.battle_hud_state_pvp(PVE_RESULT_DESERT_GOLD_TRAP)
        self.assertEqual(state, "not_battle")
        self.assertGreaterEqual(gold_px, screens.BATTLE_SP_MIN_PX,
                                 "gold count alone would false-positive here (sanity check)")
        self.assertGreater(score, 25.0, "scoreboard marker must reject this frame")


@unittest.skipUnless(all(os.path.isfile(p) for p in ALL_REQUIRED_SHOTS),
                      f"real calibration shots not found under {SHOTS_DIR}/{RESEARCH_DIR}")
class BattleHudStatePveUnchangedTest(unittest.TestCase):
    """screens.battle_hud_state() (PvE, green counter) is untouched by this
    task -- hard constraint. Pin its result on every PvE regression sample."""

    def test_pve_battle_samples_still_read_battle(self):
        for p in (PVE_BATTLE_1, PVE_BATTLE_2, PVE_BATTLE_3):
            state, green_px = screens.battle_hud_state(p)
            self.assertEqual(state, "battle", f"{p}: green_px={green_px}")

    def test_non_battle_samples_still_read_not_battle(self):
        for p in (NOT_BATTLE_LOGIN, NOT_BATTLE_LOBBY, NOT_BATTLE_ROOM,
                  PVP_BATTLE_CLEAN, PVP_MECH_SELECT_NOT_SPAWNED):
            state, _ = screens.battle_hud_state(p)
            self.assertEqual(state, "not_battle", p)


@unittest.skipUnless(all(os.path.isfile(p) for p in ALL_REQUIRED_SHOTS),
                      f"real calibration shots not found under {SHOTS_DIR}/{RESEARCH_DIR}")
class BattleAnyCheckCombinedTest(unittest.TestCase):
    """actions._battle_any_check() -- the actual check enter_battle()/
    campaign_win_all()/etc. use -- accepts either PvE or PvP and names which
    one fired."""

    def test_pve_sample_reports_kind_pve(self):
        check = actions._battle_any_check()
        ok, gray, detail, score = check(PVE_BATTLE_1)
        self.assertTrue(ok, detail)
        self.assertIn("battle(pve)", detail)

    def test_pvp_sample_reports_kind_pvp(self):
        check = actions._battle_any_check()
        ok, gray, detail, score = check(PVP_BATTLE_CLEAN)
        self.assertTrue(ok, detail)
        self.assertIn("battle(pvp)", detail)

    def test_not_battle_sample_fails_both(self):
        check = actions._battle_any_check()
        ok, gray, detail, score = check(NOT_BATTLE_LOBBY)
        self.assertFalse(ok, detail)
        self.assertIn("not_battle", detail)

    def test_mech_select_not_yet_spawned_fails(self):
        """The scenario this whole task exists to NOT regress into: PvP
        support must not make enter_battle() declare victory the instant
        ESC opens the mech-select page, before a mech is chosen."""
        check = actions._battle_any_check()
        ok, gray, detail, score = check(PVP_MECH_SELECT_NOT_SPAWNED)
        self.assertFalse(ok, detail)


class HudPktContradictionNoteTest(unittest.TestCase):
    """_hud_pkt_contradiction_note() -- the PM-requested WARN
    (docs/backlog.md PVP-HUD-MARKER addendum): only fires when the HUD check
    disagrees with a packet-confirmed spawn (HUD says not_battle, pkt says
    seen). Purely observational -- never used as a pass/fail condition."""

    def test_fires_only_on_hud_fail_pkt_seen(self):
        self.assertIn("WARN", actions._hud_pkt_contradiction_note(ok_hud=False, ok_pkt=True))
        self.assertIn("畫面與封包矛盾", actions._hud_pkt_contradiction_note(ok_hud=False, ok_pkt=True))

    def test_silent_when_hud_agrees(self):
        self.assertEqual(actions._hud_pkt_contradiction_note(ok_hud=True, ok_pkt=True), "")

    def test_silent_when_pkt_also_missing(self):
        self.assertEqual(actions._hud_pkt_contradiction_note(ok_hud=False, ok_pkt=False), "")

    def test_silent_when_hud_battle_pkt_missing(self):
        # HUD says battle but pkt missing -- not the contradiction this note
        # is about (see require_cn's own docstring for that separate case).
        self.assertEqual(actions._hud_pkt_contradiction_note(ok_hud=True, ok_pkt=False), "")


def _make_ctx():
    ctx = actions.Context(dry_run=False, logs_dir="/nonexistent-for-this-test/logs")
    ctx.clients["host"] = actions.ClientState(
        id="host", proc_name="MetalRage2", game_conn_id=28, user_index=5,
        account="mrotesthost",
    )
    return ctx


class EnterBattleContradictionWarnTest(unittest.TestCase):
    """actions.enter_battle(require_cn=False)'s detail carries the WARN when
    the HUD check fails but the CN pkt was actually received -- the real
    2026-09-22 PvP incident this task fixes, reproduced with mocks (same
    technique as test_enter_battle.py). Does NOT change ok (still ok_hud)."""

    def _run(self, hud_ok, pkt_ok):
        ctx = _make_ctx()

        def fake_key(ctx_, key_name):
            return (0, f"KEY {key_name}", "", 0.1)

        def fake_focus_client(ctx_, client_id):
            return actions.ActionResult("focus_client", True, False, 0.01, "ok", None, None, [])

        def fake_wait_for_log_pkts(ctx_, timeout_s, predicates, poll_interval_s=1.0,
                                    baseline_ms=None, conn=None):
            return pkt_ok, ({"spawn": {}} if pkt_ok else {}), 1.0

        def fake_wait_for(ctx_, label, timeout_s, check_fn, keepalive_interval_s=None):
            detail = "battle_hud=battle(pvp) green_px=0 pvp_scoreboard=0.00 gold_px=4922" if hud_ok \
                else "battle_hud=not_battle green_px=0 pvp_scoreboard=0.00 gold_px=221"
            return hud_ok, False, detail, 4922 if hud_ok else 221, "/fake/shots/x.png", 0

        with mock.patch.object(actions, "key", side_effect=fake_key), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "wait_for_log_pkts", side_effect=fake_wait_for_log_pkts), \
             mock.patch.object(actions, "wait_for", side_effect=fake_wait_for), \
             mock.patch.object(actions, "_newest_log_ms", return_value=1000), \
             mock.patch.object(actions.time, "sleep", return_value=None):
            return actions.enter_battle(ctx, "host", mech_key=None, require_cn=False)

    def test_hud_fail_pkt_seen_warns_but_still_fails(self):
        result = self._run(hud_ok=False, pkt_ok=True)
        self.assertFalse(result.ok, "packet 'received' must not flip the HUD-based verdict")
        self.assertIn("WARN", result.detail)
        self.assertIn("畫面與封包矛盾", result.detail)

    def test_hud_ok_no_warn(self):
        result = self._run(hud_ok=True, pkt_ok=True)
        self.assertTrue(result.ok, result.detail)
        self.assertNotIn("WARN", result.detail)

    def test_hud_fail_pkt_missing_no_warn(self):
        # Both signals agree ("not in battle") -- nothing to contradict.
        result = self._run(hud_ok=False, pkt_ok=False)
        self.assertFalse(result.ok)
        self.assertNotIn("WARN", result.detail)


if __name__ == "__main__":
    unittest.main()
