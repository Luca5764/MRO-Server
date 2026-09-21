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
  3. Precondition gate: if the battle HUD is not up, no CLICK is ever sent
     (click() not called at all).
  4. _console_cmd_on_allowed(): "WeaponLog" is in the whitelist (added
     2026-09-21, before this task -- this only pins it down); an arbitrary
     string is still rejected.

Run: python3 test_fire_burst.py
"""

import os
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
    def _run(self, shots=5, interval_s=0.1, click_results=None, battle_up=True):
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

        with mock.patch.object(actions, "click", side_effect=fake_click), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "take_screenshot", return_value="/fake/shots/x.png"), \
             mock.patch.object(actions.time, "sleep", side_effect=fake_sleep), \
             mock.patch.object(screens, "battle_hud_state", side_effect=fake_battle_hud_state):
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

    def test_battle_hud_not_up_sends_no_click_at_all(self):
        result, click_calls, sleeps = self._run(battle_up=False)
        self.assertFalse(result.ok)
        self.assertEqual(click_calls, [], "precondition must fail closed before any CLICK is sent")
        self.assertIn("precondition failed", result.detail)

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
