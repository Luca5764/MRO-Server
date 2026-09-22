#!/usr/bin/env python3
"""
test_enter_battle.py - Offline tests for enter_battle()'s mech_key=None path
(2026-09-22 round2-probe-mte task: verify the auto-picked mech after a
mech_licenses.slot DB swap, by sending ESC only and letting the mech-select
page's own RESPAWN countdown auto-pick instead of pressing an F-key -- see
actions.enter_battle()'s docstring).

Covers, fully offline (focus_client/key/wait_for/wait_for_log_pkts all
mocked, no real subprocess/screenshot/log-file access, no time.sleep
actually sleeping):
  1. mech_key=None sends ESC and NO other KEY command (no F-key), and waits
     on ENTER_BATTLE_NO_KEY_TIMEOUT_S (not DEFAULT_ENTER_BATTLE_TIMEOUT_S).
  2. mech_key="F1" (the default, and the pre-existing behaviour) is
     unchanged: ESC + sleep(ENTER_BATTLE_POST_ESC_WAIT_S) + KEY F1, waiting
     on DEFAULT_ENTER_BATTLE_TIMEOUT_S -- pinned down so a future edit to
     the None branch cannot silently change this one.
  3. An invalid mech_key (not in MECH_SELECT_SLOTS, not None) still raises
     ActionError before any input is sent, same as before this task.
  4. dry-run with mech_key=None reports the ESC-only plan and does not
     raise on the now-allowed None value.

Run: python3 test_enter_battle.py
"""

import os
import sys
import unittest
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402
import screens  # noqa: E402


def _make_ctx(dry_run=False):
    ctx = actions.Context(dry_run=dry_run, logs_dir="/nonexistent-for-this-test/logs")
    # "host" is the fixed key _require_host_game_conn() looks up (design.md
    # section 1's CLIENTS naming convention) -- same client_id used as this
    # instance's own id here, matching every single-instance experiment
    # script (e.g. round2-probe-firerate.json) that keys its one client
    # "host".
    ctx.clients["host"] = actions.ClientState(
        id="host", proc_name="MetalRage2", game_conn_id=28, user_index=5,
        account="mrotesthost",
    )
    return ctx


class EnterBattleMechKeyNoneTest(unittest.TestCase):
    def _run(self, mech_key, dry_run=False):
        ctx = _make_ctx(dry_run=dry_run)
        key_calls = []

        def fake_key(ctx_, key_name):
            key_calls.append(key_name)
            return (0, f"KEY {key_name}", "", 0.1)

        def fake_focus_client(ctx_, client_id):
            return actions.ActionResult("focus_client", True, False, 0.01, "ok", None, None, [])

        def fake_wait_for_log_pkts(ctx_, timeout_s, predicates, poll_interval_s=1.0,
                                    baseline_ms=None, conn=None):
            fake_wait_for_log_pkts.last_timeout_s = timeout_s
            return True, {"spawn": {"dir": "recv", "op": actions.CHANGE_SLOT_CN_OPCODE}}, 1.0

        def fake_wait_for(ctx_, label, timeout_s, check_fn, keepalive_interval_s=None):
            return True, False, "battle HUD up", 6400, "/fake/shots/x.png", 0

        sleeps = []

        def fake_sleep(s):
            sleeps.append(s)

        with mock.patch.object(actions, "key", side_effect=fake_key), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "wait_for_log_pkts", side_effect=fake_wait_for_log_pkts), \
             mock.patch.object(actions, "wait_for", side_effect=fake_wait_for), \
             mock.patch.object(actions, "_newest_log_ms", return_value=1000), \
             mock.patch.object(actions.time, "sleep", side_effect=fake_sleep):
            result = actions.enter_battle(ctx, "host", mech_key=mech_key)
        return result, key_calls, sleeps, getattr(fake_wait_for_log_pkts, "last_timeout_s", None)

    def test_mech_key_none_sends_esc_only_no_fkey(self):
        result, key_calls, sleeps, timeout_s = self._run(mech_key=None)
        self.assertTrue(result.ok, result.detail)
        self.assertEqual(key_calls, ["ESC"], "mech_key=None must send ESC and nothing else")
        self.assertEqual(sleeps, [], "no post-ESC F-key wait when there is no F-key to send")
        self.assertEqual(timeout_s, actions.ENTER_BATTLE_NO_KEY_TIMEOUT_S)
        self.assertIn("ESC only", result.detail)
        self.assertNotIn("F1", result.detail)

    def test_default_mech_key_f1_unchanged(self):
        result, key_calls, sleeps, timeout_s = self._run(mech_key="F1")
        self.assertTrue(result.ok, result.detail)
        self.assertEqual(key_calls, ["ESC", "F1"])
        self.assertEqual(sleeps, [actions.ENTER_BATTLE_POST_ESC_WAIT_S])
        self.assertEqual(timeout_s, actions.DEFAULT_ENTER_BATTLE_TIMEOUT_S)
        self.assertIn("ESC + key F1", result.detail)

    def test_default_param_is_still_f1_when_omitted(self):
        ctx = _make_ctx()
        key_calls = []

        def fake_key(ctx_, key_name):
            key_calls.append(key_name)
            return (0, f"KEY {key_name}", "", 0.1)

        with mock.patch.object(actions, "key", side_effect=fake_key), \
             mock.patch.object(actions, "focus_client",
                                side_effect=lambda ctx_, cid: actions.ActionResult(
                                    "focus_client", True, False, 0.01, "ok", None, None, [])), \
             mock.patch.object(actions, "wait_for_log_pkts", return_value=(True, {}, 1.0)), \
             mock.patch.object(actions, "wait_for",
                                return_value=(True, False, "battle HUD up", 6400, "/fake/x.png", 0)), \
             mock.patch.object(actions, "_newest_log_ms", return_value=1000), \
             mock.patch.object(actions.time, "sleep", return_value=None):
            actions.enter_battle(ctx, "host")  # mech_key omitted entirely
        self.assertEqual(key_calls, ["ESC", "F1"])

    def test_invalid_mech_key_still_raises(self):
        ctx = _make_ctx()
        with mock.patch.object(actions, "key") as fake_key:
            with self.assertRaises(actions.ActionError):
                actions.enter_battle(ctx, "host", mech_key="F9")
            fake_key.assert_not_called()

    def test_dry_run_mech_key_none_does_not_raise_and_reports_esc_only(self):
        result, key_calls, sleeps, timeout_s = self._run(mech_key=None, dry_run=True)
        self.assertTrue(result.ok, result.detail)
        self.assertEqual(key_calls, [], "dry-run must never send real input")
        self.assertIn("ESC", result.detail)
        self.assertIn(str(actions.ENTER_BATTLE_NO_KEY_TIMEOUT_S), result.detail)


if __name__ == "__main__":
    unittest.main()
