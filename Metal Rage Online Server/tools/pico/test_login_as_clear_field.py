#!/usr/bin/env python3
"""
test_login_as_clear_field.py - Offline tests for the 2026-09-21 login_as()
clear-field cost reduction (contract: "login_as 清空帳號欄位的成本" -- a
2026-09-21 A-run measured 24 separate DELETE key() calls at ~3.7s each,
~90s total, as the input-gap opener for that run's failure).

Covers (see actions.login_as()'s docstring and
screens.account_field_state()'s docstring for the design):
  (a) screens.account_field_state() judges "empty" -> login_as() sends NO
      HOME/DELETE at all (no `pico_ctl.py batch` call, verified via a
      run_pico() call-log, not just "the result looked OK").
  (b) judges "has_text" -> login_as() clears via exactly ONE batched
      `pico_ctl.py batch` call ("KEY HOME" + ACCOUNT_FIELD_CLEAR_KEYPRESSES x
      "KEY DELETE"), and that count is well below the old fixed 24.

Fully offline: no real pico_ctl.py/client_ctl.py/shot.sh/screens.py-on-a-
real-image call -- focus_client(), wait_for(), wait_for_log_pkts(),
resolve_conn_id(), _newest_log_ms() and screens.account_field_state() are all
monkeypatched, and run_pico() is replaced with a call-recording fake so the
exact command sequence sent to pico_ctl.py can be inspected directly.

Run: python3 test_login_as_clear_field.py
"""

import os
import sys
import unittest
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402


class LoginAsClearFieldTest(unittest.TestCase):
    def _make_ctx(self):
        ctx = actions.Context(dry_run=False)
        ctx.clients = {"host": actions.ClientState(id="host", proc_name="MetalRage2")}
        return ctx

    def _run_login_as(self, ctx, field_state):
        calls = []

        def fake_run_pico(c, *args):
            calls.append(args)
            return (0, "[OK]", "", 0.01)

        def fake_focus_client(c, client_id):
            c.active_client = client_id
            return actions.ActionResult("focus_client", True, False, 0.0,
                                         "fake focus ok", None, None, [])

        def fake_wait_for(c, label, timeout_s, check_fn, keepalive_interval_s=None):
            if label == "login_as-screen":
                return True, False, "fake login screen", None, "/fake/login.png", 0.0
            if label == "login_as-lobby":
                return True, False, "fake lobby", None, "/fake/lobby.png", 0.0
            raise AssertionError(f"unexpected wait_for label {label!r}")

        with mock.patch.object(actions, "run_pico", side_effect=fake_run_pico), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "wait_for", side_effect=fake_wait_for), \
             mock.patch.object(actions, "_newest_log_ms", return_value=1000), \
             mock.patch.object(actions, "wait_for_log_pkts", return_value=(True, {}, 0.1)), \
             mock.patch.object(actions, "resolve_conn_id", return_value=42), \
             mock.patch.object(actions.screens, "account_field_state",
                                return_value=(field_state, 0.0)):
            result = actions.login_as(ctx, "host", "Lucas")
        return result, calls

    def test_a_empty_field_sends_no_clear_keys(self):
        """screens.account_field_state() reads "empty" -> zero HOME/DELETE
        commands anywhere in the call log, not just "the batch was smaller"."""
        ctx = self._make_ctx()
        result, calls = self._run_login_as(ctx, "empty")
        self.assertTrue(result.ok, result.detail)
        self.assertIn("account_field_state=empty", result.detail)
        flat = [str(a) for args in calls for a in args]
        self.assertNotIn("batch", [args[0] for args in calls if args])
        self.assertFalse(any("DELETE" in s or s == "KEY HOME" for s in flat),
                          f"unexpected clear-field command in {calls!r}")

    def test_b_nonempty_field_clears_via_one_reduced_batch(self):
        """screens.account_field_state() reads "has_text" -> exactly one
        `batch` call containing HOME + ACCOUNT_FIELD_CLEAR_KEYPRESSES DELETEs
        (well below the old fixed 24)."""
        ctx = self._make_ctx()
        result, calls = self._run_login_as(ctx, "has_text")
        self.assertTrue(result.ok, result.detail)
        self.assertIn("account_field_state=has_text", result.detail)
        batch_calls = [args for args in calls if args and args[0] == "batch"]
        self.assertEqual(len(batch_calls), 1, f"expected exactly one batch call, got {calls!r}")
        cmds = batch_calls[0][1:]
        self.assertEqual(cmds[0], "KEY HOME")
        delete_cmds = [c for c in cmds if c == "KEY DELETE"]
        self.assertEqual(len(delete_cmds), actions.ACCOUNT_FIELD_CLEAR_KEYPRESSES)
        self.assertLess(len(delete_cmds), 24,
                         "clear-field keypress count must be reduced from the old fixed 24")
        # The whole clear (HOME + all DELETEs) must be ONE pico_ctl.py
        # invocation, not N separate key() calls -- that's the actual fix
        # for the ~3.7s/key process-spinup cost (see clear_text_field()'s
        # docstring), the keypress-count reduction alone would not get
        # anywhere near "a few seconds".
        self.assertEqual(len(cmds), len(delete_cmds) + 1)

    def test_c_second_attempt_always_clears_even_if_first_read_empty(self):
        """attempt==1 (the notice-popup retry) must clear regardless of the
        attempt==0 field read, because THIS SAME call already typed into the
        field during attempt 0 -- simulated here by making wait_for_log_pkts
        fail on attempt 0 (forcing a retry) and account_field_state read
        "empty" (as it validly could on attempt 0, before this call typed
        anything) to prove the retry doesn't reuse that stale "empty" read."""
        ctx = self._make_ctx()
        calls = []
        pkt_results = iter([(False, {}, 8.0), (True, {}, 0.1)])

        def fake_run_pico(c, *args):
            calls.append(args)
            return (0, "[OK]", "", 0.01)

        def fake_focus_client(c, client_id):
            c.active_client = client_id
            return actions.ActionResult("focus_client", True, False, 0.0,
                                         "fake focus ok", None, None, [])

        def fake_wait_for(c, label, timeout_s, check_fn, keepalive_interval_s=None):
            if label == "login_as-screen":
                return True, False, "fake login screen", None, "/fake/login.png", 0.0
            if label == "login_as-lobby":
                return True, False, "fake lobby", None, "/fake/lobby.png", 0.0
            raise AssertionError(f"unexpected wait_for label {label!r}")

        def fake_detect_marker(shot_path, name):
            # Notice popup IS shown on attempt 0's failure -- this is what
            # makes login_as() dismiss it and retry (attempt 1), the actual
            # branch that reaches the "always clear on retry" code path.
            return True, 0.0

        with mock.patch.object(actions, "run_pico", side_effect=fake_run_pico), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "wait_for", side_effect=fake_wait_for), \
             mock.patch.object(actions, "_newest_log_ms", return_value=1000), \
             mock.patch.object(actions, "wait_for_log_pkts", side_effect=lambda *a, **k: next(pkt_results)), \
             mock.patch.object(actions, "resolve_conn_id", return_value=42), \
             mock.patch.object(actions, "take_screenshot", return_value="/fake/notice.png"), \
             mock.patch.object(actions.screens, "detect_marker", side_effect=fake_detect_marker), \
             mock.patch.object(actions.screens, "account_field_state", return_value=("empty", 0.0)):
            result = actions.login_as(ctx, "host", "Lucas")

        self.assertTrue(result.ok, result.detail)
        batch_calls = [args for args in calls if args and args[0] == "batch"]
        # attempt 0 skipped the clear (field read "empty"); attempt 1 must
        # still clear exactly once, even though the field read never
        # changed.
        self.assertEqual(len(batch_calls), 1, f"expected exactly one batch call (attempt 1 only), got {calls!r}")


if __name__ == "__main__":
    unittest.main()
