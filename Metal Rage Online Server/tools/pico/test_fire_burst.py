#!/usr/bin/env python3
"""
test_fire_burst.py - Offline tests for fire_burst() (round 2 projectile-loss
task, docs/research/2026-09-21-netspeed-host-patch/round2-plan.md's "加入者
開火" contract: repeat CLICK left `shots` times, `interval_s` apart, to
simulate holding the trigger down since code.py's firmware only implements
CLICK press+release, never HOLD).

Covers, fully offline (focus_client/click/screens all mocked, no real
subprocess/screenshot/log-file access, no time.sleep actually sleeping):
  1. Happy path: all `shots` CLICKs sent, in order, `interval_s` apart
     (sleep called shots-1 times), ok=True.
  2. Fail-closed: the moment ONE click() call returns a non-zero rc, the
     loop stops immediately -- no further CLICKs sent, ok=False, detail
     names which shot failed.
  3. Battle-HUD wait gate: if the battle HUD never appears within
     FIRE_BURST_BATTLE_WAIT_S, no CLICK is ever sent (click() not called
     at all) and the action fails closed.
  4. _console_cmd_on_allowed(): "WeaponLog" is in the whitelist (added
     2026-09-21, before this task -- this only pins it down); an arbitrary
     string is still rejected.
  5. (2026-09-22, round-2 re-run) The wait is POLLED, not single-shot: the
     HUD can be absent on an early poll (e.g. a RESPAWN mech-reselect page
     right after a death -- [SHOT] shots/round2-projectile-43-fire_burst-
     precondition.png, see FIRE_BURST_BATTLE_WAIT_S's own comment in
     actions.py) and appear on a later one without failing the burst, and
     the time spent waiting must NOT leak into firing_window_s (only
     actual clicking counts there -- see fire_burst()'s own docstring).

Every screens.battle_hud_state mock below is paired with a
screens.battle_hud_state_pvp mock fixed to "not_battle" (PVP-HUD-MARKER,
docs/backlog.md, 2026-09-22 task): fire_burst() goes through
actions._battle_any_check(), which since that task also calls
battle_hud_state_pvp() -- unmocked, it would try to open the fake
"/fake/shots/x.png" screenshot path these tests use and raise
FileNotFoundError. These tests are all PvE scenarios, so the PvP judge is
just held at a constant "not_battle" throughout.

Run: python3 test_fire_burst.py
"""

import os
import re
import sys
import unittest
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402
import screens  # noqa: E402


def _make_ctx():
    ctx = actions.Context(dry_run=False, logs_dir="/nonexistent-for-this-test/logs")
    ctx.clients["joiner"] = actions.ClientState(
        id="joiner", proc_name="MetalRage.exe", game_conn_id=42,
    )
    return ctx


class FireBurstTest(unittest.TestCase):
    def _run(self, shots=5, interval_s=0.1, click_results=None, battle_up=True,
              battle_wait_s=0.05):
        ctx = _make_ctx()
        click_calls = []

        def fake_click(ctx_, button="left"):
            idx = len(click_calls)
            click_calls.append(button)
            if click_results is not None and idx < len(click_results):
                return click_results[idx]
            return (0, "CLICK left", "", 5.0)

        def fake_focus_client(ctx_, client_id):
            return actions.ActionResult("focus_client", True, False, 0.01, "ok", None, None, [])

        def fake_battle_hud_state(shot_path):
            if battle_up:
                return "battle", 6400
            return "not_battle", 0

        sleeps = []

        def fake_sleep(s):
            sleeps.append(s)

        # battle_wait_s shrinks FIRE_BURST_BATTLE_WAIT_S so the battle_up=False
        # (never appears) case's real-time poll loop finishes in well under a
        # second instead of the real 45s default -- see
        # test_battle_hud_never_appears_times_out_sends_no_click below, which
        # is the only case that actually reaches this timeout.
        with mock.patch.object(actions, "click", side_effect=fake_click), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "take_screenshot", return_value="/fake/shots/x.png"), \
             mock.patch.object(actions.time, "sleep", side_effect=fake_sleep), \
             mock.patch.object(actions, "FIRE_BURST_BATTLE_WAIT_S", battle_wait_s), \
             mock.patch.object(screens, "battle_hud_state", side_effect=fake_battle_hud_state), \
             mock.patch.object(screens, "battle_hud_state_pvp", return_value=("not_battle", (999.0, 0))):
            result = actions.fire_burst(ctx, "joiner", shots, interval_s)
        return result, click_calls, sleeps

    def test_happy_path_sends_all_shots_interval_apart(self):
        result, click_calls, sleeps = self._run(shots=5, interval_s=0.3)
        self.assertTrue(result.ok, result.detail)
        self.assertEqual(len(click_calls), 5)
        self.assertTrue(all(b == "left" for b in click_calls))
        # sleeps between shots only, not after the last one.
        self.assertEqual(sleeps, [0.3, 0.3, 0.3, 0.3])
        self.assertIn("sent 5/5", result.detail)
        self.assertIn("0 non-success replies", result.detail)

    def test_fail_closed_on_first_non_success_click_stops_immediately(self):
        # Shot 3 (index 2) comes back with a non-zero rc -- must stop right
        # there, never attempt shots 4/5.
        click_results = [
            (0, "CLICK left", "", 5.0),
            (0, "CLICK left", "", 5.0),
            (3, "", "[BLOCKED] not foreground", 5.0),
        ]
        result, click_calls, sleeps = self._run(shots=5, interval_s=0.1, click_results=click_results)
        self.assertFalse(result.ok)
        self.assertEqual(len(click_calls), 3, "must not attempt any shot after the failing one")
        self.assertIn("ABORTED (fail-closed)", result.detail)
        self.assertIn("shot 3/5", result.detail)
        self.assertIn("sent 2/5", result.detail)

    def test_battle_hud_never_appears_times_out_sends_no_click(self):
        """battle_wait_s=0.05 (see _run's own comment) keeps this real-time
        poll loop's wall-clock timeout short; the HUD check itself
        (fake_battle_hud_state) never flips to "battle" here."""
        result, click_calls, sleeps = self._run(battle_up=False)
        self.assertFalse(result.ok)
        self.assertEqual(click_calls, [], "must fail closed before any CLICK is sent")
        self.assertIn("ABORTED (fail-closed)", result.detail)
        self.assertIn("battle HUD did not appear within", result.detail)
        self.assertIn("0 CLICK sent", result.detail)

    def test_hud_appears_on_second_poll_still_succeeds_excludes_wait_from_window(self):
        """2026-09-22 round-2 re-run: round 1's B-段 fire_burst() failed
        closed on a RESPAWN mech-reselect page shown right after the
        joiner's mech died ([SHOT] shots/round2-projectile-43-fire_burst-
        precondition.png, confirmed via screens.battle_hud_state() ==
        ("not_battle", 0) -- see FIRE_BURST_BATTLE_WAIT_S's own comment in
        actions.py for what this screenshot actually shows and why an
        earlier "MISSION BRIEFING between rounds" theory did not hold up),
        with a single-shot precondition even though the HUD would have
        reappeared seconds later. Simulates exactly that (using a generic
        "not battle" -> "battle" transition, not tied to which screen caused
        the gap -- the fix does not distinguish):
        _battle_any_check() reads "not battle" on the first poll, "battle"
        on the second -- the burst must still succeed, and the polling time
        must land in total_s but NOT in firing_window_s (uses a fake
        monotonic clock, like test_firing_window_excludes_focus_and_
        precondition_overhead above, so this is provable rather than timing-
        flaky)."""
        ctx = _make_ctx()
        clock = {"t": 0.0}

        def fake_monotonic():
            return clock["t"]

        hud_calls = {"n": 0}

        def fake_battle_hud_state(shot_path):
            hud_calls["n"] += 1
            if hud_calls["n"] == 1:
                return "not_battle", 0  # still on the ROUND n briefing screen
            return "battle", 6400

        def fake_take_screenshot(ctx_, label, proc=None):
            clock["t"] += 2.0  # simulate the briefing lingering across one poll
            return "/fake/shots/x.png"

        def fake_focus_client(ctx_, client_id):
            return actions.ActionResult("focus_client", True, False, 0.0, "ok", None, None, [])

        def fake_click(ctx_, button="left"):
            clock["t"] += 0.1
            return (0, "CLICK left", "", 0.1)

        with mock.patch.object(actions, "click", side_effect=fake_click), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "take_screenshot", side_effect=fake_take_screenshot), \
             mock.patch.object(actions.time, "monotonic", side_effect=fake_monotonic), \
             mock.patch.object(actions.time, "sleep", return_value=None), \
             mock.patch.object(screens, "battle_hud_state", side_effect=fake_battle_hud_state), \
             mock.patch.object(screens, "battle_hud_state_pvp", return_value=("not_battle", (999.0, 0))):
            result = actions.fire_burst(ctx, "joiner", 3, 0.0)

        self.assertTrue(result.ok, result.detail)
        self.assertEqual(hud_calls["n"], 2, "must have polled twice: briefing, then HUD back")
        m_fw = re.search(r"firing_window_s=([\d.]+)", result.detail)
        m_total = re.search(r"total_s=([\d.]+)", result.detail)
        self.assertIsNotNone(m_fw, result.detail)
        self.assertIsNotNone(m_total, result.detail)
        firing_window_s = float(m_fw.group(1))
        total_s = float(m_total.group(1))
        self.assertAlmostEqual(
            firing_window_s, 0.3, places=2,
            msg="firing_window_s must be just the 3 clicks (0.1s each), not the HUD wait",
        )
        self.assertAlmostEqual(
            total_s, 4.3, places=2,
            msg="total_s must include the 2 polls' worth of simulated HUD-wait time (2x2.0s)",
        )

    def test_bad_shots_raises_before_any_input(self):
        ctx = _make_ctx()
        with mock.patch.object(actions, "click") as fake_click:
            with self.assertRaises(actions.ActionError):
                actions.fire_burst(ctx, "joiner", 0, 0.1)
            fake_click.assert_not_called()

    def test_negative_interval_raises_before_any_input(self):
        ctx = _make_ctx()
        with mock.patch.object(actions, "click") as fake_click:
            with self.assertRaises(actions.ActionError):
                actions.fire_burst(ctx, "joiner", 10, -1.0)
            fake_click.assert_not_called()

    def test_firing_window_excludes_focus_and_precondition_overhead(self):
        """PM review (2026-09-22, this same task's first commit): total_s
        (ActionResult.duration_s) includes focus_client()/the precondition
        screenshot -- folding that into a Fire-count/T fire-rate calculation
        would understate the real rate, especially for a fast/short burst.
        firing_window_s must cover ONLY first-click-start to last-click-
        return. Uses a fully fake monotonic clock (no real sleeping) so the
        two overhead-injecting steps (focus_client, the precondition's
        take_screenshot) are the ONLY things that advance time; the click()
        calls and the loop's own (mocked) time.sleep advance nothing."""
        ctx = _make_ctx()
        clock = {"t": 0.0}

        def fake_monotonic():
            return clock["t"]

        def fake_click(ctx_, button="left"):
            return (0, "CLICK left", "", 1.0)

        def fake_focus_client(ctx_, client_id):
            clock["t"] += 0.05  # simulate focus_client()'s own real overhead
            return actions.ActionResult("focus_client", True, False, 0.05, "ok", None, None, [])

        def fake_take_screenshot(ctx_, label, proc=None):
            clock["t"] += 0.05  # simulate the precondition screenshot's overhead
            return "/fake/shots/x.png"

        def fake_battle_hud_state(shot_path):
            return "battle", 6400

        with mock.patch.object(actions, "click", side_effect=fake_click), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "take_screenshot", side_effect=fake_take_screenshot), \
             mock.patch.object(actions.time, "monotonic", side_effect=fake_monotonic), \
             mock.patch.object(actions.time, "sleep", return_value=None), \
             mock.patch.object(screens, "battle_hud_state", side_effect=fake_battle_hud_state), \
             mock.patch.object(screens, "battle_hud_state_pvp", return_value=("not_battle", (999.0, 0))):
            result = actions.fire_burst(ctx, "joiner", 3, 0.0)

        self.assertTrue(result.ok, result.detail)
        m_fw = re.search(r"firing_window_s=([\d.]+)", result.detail)
        m_total = re.search(r"total_s=([\d.]+)", result.detail)
        self.assertIsNotNone(m_fw, result.detail)
        self.assertIsNotNone(m_total, result.detail)
        firing_window_s = float(m_fw.group(1))
        total_s = float(m_total.group(1))
        self.assertAlmostEqual(
            firing_window_s, 0.0, places=2,
            msg="firing_window_s must exclude focus_client/precondition overhead",
        )
        self.assertAlmostEqual(
            total_s, 0.10, places=2,
            msg="total_s must include the simulated focus+precondition overhead (0.05+0.05s)",
        )


class ConsoleCmdOnWhitelistTest(unittest.TestCase):
    def test_weaponlog_is_whitelisted(self):
        self.assertTrue(actions._console_cmd_on_allowed("WeaponLog"))

    def test_stat_net_is_whitelisted(self):
        self.assertTrue(actions._console_cmd_on_allowed("stat net"))

    def test_netspeed_with_digits_is_whitelisted(self):
        self.assertTrue(actions._console_cmd_on_allowed("netspeed 100000"))

    def test_arbitrary_text_is_not_whitelisted(self):
        self.assertFalse(actions._console_cmd_on_allowed("GameCampaign 1"))
        self.assertFalse(actions._console_cmd_on_allowed("weaponlog"))  # case-sensitive
        self.assertFalse(actions._console_cmd_on_allowed("WeaponLog "))  # trailing space


if __name__ == "__main__":
    unittest.main()
