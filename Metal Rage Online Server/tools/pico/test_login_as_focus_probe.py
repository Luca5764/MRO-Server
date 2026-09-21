#!/usr/bin/env python3
"""
test_login_as_focus_probe.py - Offline tests for the 2026-09-21 "帳號欄焦點"
race fix (actions._confirm_account_focus(), called from login_as()).

Incident this fixes: a real dual-netspeed-c run had click_at(LOGIN_ACCOUNT_
FIELD) leave focus on 密碼 instead of 帳號 -- the account name got typed
into 密碼 (masked) and the dummy password ended up in 帳號 after a TAB
wraparound, and the server correctly rejected the resulting login ("無法接受
認證"). login_cq(LOGIN_CQ_OPCODE) had still been SENT in that run --
wait_for_log_pkts() alone proves an attempt happened, never that it was the
right one. [SHOT] shots/dual-netspeed-c-06-login_as-lobby-4.png (帳號 field
shows "x", 密碼 field shows "###########").

Covers this task's three required offline scenarios (see _confirm_account_
focus()'s and screens.password_field_state()'s docstrings for the method):
  (a) feeding the REAL failure screenshot as the post-probe read -> focus
      judged NOT confirmed ("焦點不在帳號欄").
  (b) feeding a REAL, standard-geometry login screenshot (untouched, taken
      before any input) as both the pre- and post-probe read -> focus judged
      confirmed.
  (c) when verification fails (both tries), login_as() sends NO real
      account/password/ENTER keystrokes at all -- proven by inspecting the
      exact run_pico() call sequence, not just the returned ok=False.

Fully offline except for two real screenshot files already in shots/ (read
only, never modified) -- everything else (focus_client, wait_for,
wait_for_log_pkts, resolve_conn_id, _newest_log_ms, take_screenshot,
run_pico) is monkeypatched, same technique as
test_login_as_clear_field.py.

Run: python3 test_login_as_focus_probe.py
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
# [SHOT] the real failure this task fixes: 帳號="x" (the dummy password),
# 密碼="###########" masking "mrotesthost" (the real account) -- the swap.
REAL_FAIL_SHOT = os.path.join(SHOTS_DIR, "dual-netspeed-c-06-login_as-lobby-4.png")
# [SHOT] a real, standard-geometry (1616x1239) login screen, untouched
# (taken before any input that run) -- screens.password_field_state() on
# this reads "flat", same as every other untouched login_as-screen-N shot
# checked for this task (8 samples, all bit-identical stddev=3.98).
REAL_GOOD_SHOT = os.path.join(SHOTS_DIR, "dual-netspeed-b-02-login_as-screen-1.png")


@unittest.skipUnless(os.path.isfile(REAL_FAIL_SHOT) and os.path.isfile(REAL_GOOD_SHOT),
                      f"real calibration shots not found under {SHOTS_DIR}")
class LoginAsFocusProbeTest(unittest.TestCase):
    def _make_ctx(self):
        ctx = actions.Context(dry_run=False)
        ctx.clients = {"host": actions.ClientState(id="host", proc_name="MetalRage2")}
        return ctx

    def _run_login_as(self, ctx, take_screenshot_paths):
        """take_screenshot_paths: iterable of real .png paths returned by
        successive take_screenshot() calls (each _confirm_account_focus try
        makes 2: a pre-probe read then a post-probe read) -- lets a test feed
        REAL screenshots through the REAL screens.password_field_state()
        classifier instead of mocking that classifier's verdict directly."""
        calls = []
        shot_iter = iter(take_screenshot_paths)

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

        def fake_take_screenshot(c, label, proc=None):
            return next(shot_iter)

        with mock.patch.object(actions, "run_pico", side_effect=fake_run_pico), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "wait_for", side_effect=fake_wait_for), \
             mock.patch.object(actions, "take_screenshot", side_effect=fake_take_screenshot), \
             mock.patch.object(actions, "_newest_log_ms", return_value=1000), \
             mock.patch.object(actions, "wait_for_log_pkts", return_value=(True, {}, 0.1)), \
             mock.patch.object(actions, "resolve_conn_id", return_value=42), \
             mock.patch.object(actions.screens, "account_field_state", return_value=("empty", 0.0)):
            # screens.password_field_state() itself is NOT mocked here --
            # this test wants the REAL classifier reading REAL screenshot
            # pixels, only the *source* of which file plays which role is
            # controlled (via fake_take_screenshot above).
            result = actions.login_as(ctx, "host", "Lucas")
        return result, calls

    def test_a_real_fail_screenshot_is_judged_focus_not_confirmed(self):
        """Both focus-verify tries (click once, retry once) read the REAL
        failure screenshot as their post-probe shot -> login_as() must
        return ok=False with a detail naming the focus problem, never
        mistake the (real) login_cq-sent packet for a real success."""
        ctx = self._make_ctx()
        # try0: pre=good(flat), after=FAIL(has_text) -> not confirmed, retry.
        # try1 (click_at retries once more): pre=good(flat), after=FAIL again
        # -> exhausted, login_as() must give up and fail closed.
        shots = [REAL_GOOD_SHOT, REAL_FAIL_SHOT, REAL_GOOD_SHOT, REAL_FAIL_SHOT]
        result, calls = self._run_login_as(ctx, shots)
        self.assertFalse(result.ok, "must NOT succeed when the post-probe read is the real swap failure")
        self.assertIn("focus not confirmed", result.detail)
        # Sanity: prove this exercised the REAL classifier, not a mock --
        # the real numbers this task measured should be visible in the detail.
        self.assertIn("24.0", result.detail, result.detail)  # REAL_FAIL_SHOT's real stddev

    def test_b_real_untouched_screenshot_is_judged_focus_confirmed(self):
        """Both pre- and post-probe reads are the SAME real, untouched login
        screenshot (delta=0, the expected reading when the probe correctly
        landed in 帳號 and never touched 密碼) -> login_as() proceeds and
        succeeds (with the rest of the flow faked to succeed)."""
        ctx = self._make_ctx()
        shots = [REAL_GOOD_SHOT, REAL_GOOD_SHOT]  # try0 only: pre, after
        result, calls = self._run_login_as(ctx, shots)
        self.assertTrue(result.ok, result.detail)
        # The real credentials must actually have been sent once focus was confirmed.
        type_calls = [args for args in calls if args and args[0] == "type"]
        self.assertIn(("type", "Lucas"), type_calls)
        self.assertIn(("type", actions.LOGIN_DUMMY_PASSWORD), type_calls)

    def test_c_focus_not_confirmed_sends_no_real_credentials(self):
        """When verification fails (both tries), NO real account/password/
        ENTER keystrokes were sent -- only IME_EN, click_at, the probe
        character itself, and cleanup DELETEs. Proven from the exact
        run_pico() call sequence, not just the returned ok=False (test_a
        already covers the return value; this test is specifically about the
        NOT-typed guarantee, i.e. the "不准直接開始打字" contract clause)."""
        ctx = self._make_ctx()
        shots = [REAL_GOOD_SHOT, REAL_FAIL_SHOT, REAL_GOOD_SHOT, REAL_FAIL_SHOT]
        result, calls = self._run_login_as(ctx, shots)
        self.assertFalse(result.ok, result.detail)
        type_calls = [args for args in calls if args and args[0] == "type"]
        # The only `type` command allowed here is the throwaway focus probe
        # (once per try) -- never the real account name, never
        # LOGIN_DUMMY_PASSWORD, and no ENTER key() call either.
        self.assertTrue(all(args == ("type", actions.FOCUS_PROBE_CHAR) for args in type_calls),
                         f"unexpected type_text call(s) while focus was never confirmed: {type_calls!r}")
        self.assertNotIn(("type", "Lucas"), type_calls)
        self.assertNotIn(("type", actions.LOGIN_DUMMY_PASSWORD), type_calls)
        key_calls = [args for args in calls if args and args[0] == "key"]
        self.assertNotIn(("key", "ENTER"), key_calls)
        self.assertNotIn(("key", "TAB"), key_calls)


class PasswordFieldStateRealShotTest(unittest.TestCase):
    """Standalone sanity check on screens.password_field_state() itself
    (the classifier _confirm_account_focus() is built on), directly against
    the two real reference images -- independent of login_as()'s own
    plumbing above."""

    @unittest.skipUnless(os.path.isfile(REAL_FAIL_SHOT), REAL_FAIL_SHOT)
    def test_real_fail_shot_reads_has_text(self):
        state, sd = screens.password_field_state(REAL_FAIL_SHOT)
        self.assertEqual(state, "has_text")
        self.assertGreater(sd, screens.PASSWORD_FIELD_FLAT_STDDEV_MAX)

    @unittest.skipUnless(os.path.isfile(REAL_GOOD_SHOT), REAL_GOOD_SHOT)
    def test_real_good_shot_reads_flat(self):
        state, sd = screens.password_field_state(REAL_GOOD_SHOT)
        self.assertEqual(state, "flat")
        self.assertLessEqual(sd, screens.PASSWORD_FIELD_FLAT_STDDEV_MAX)


if __name__ == "__main__":
    unittest.main()
