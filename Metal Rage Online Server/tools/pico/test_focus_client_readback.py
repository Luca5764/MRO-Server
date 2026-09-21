#!/usr/bin/env python3
"""
test_focus_client_readback.py - Offline test for focus_client()'s foreground
readback poll (see FOCUS_FOREGROUND_READBACK_TIMEOUT_S's comment in
actions.py for the 2026-09-21 'dwm' transient this fixes).

Fully offline: no subprocess actually runs pico_ctl.py/client_ctl.py/
shot.sh. subprocess.run and the time module are monkeypatched (a FakeClock
that only advances when the code under test calls time.sleep(), so the
"all-dwm, times out" case does not actually wait 5 real seconds).

Covers the four scenarios in this task's contract:
  (a) dwm then match -> success, shot.sh (SetForegroundWindow) called ONCE
  (b) dwm forever -> fails at the timeout, message has last value + wait time
  (c) a DIFFERENT instance's proc name forever -> also fails (not treated as
      a match just because it is also a game window)
  (d) match on the very first read -> success, no time.sleep() call at all

Run: python3 test_focus_client_readback.py
"""

import os
import sys
import unittest
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402


class FakeClock:
    """time.monotonic()/time.sleep() replacement that only advances via
    sleep() calls -- so a 5-second timeout resolves instantly in this test
    instead of actually blocking."""

    def __init__(self):
        self.now = 0.0
        self.sleep_calls = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleep_calls.append(seconds)
        self.now += seconds


def make_ctx():
    ctx = actions.Context(dry_run=False)
    ctx.clients = {
        "host": actions.ClientState(id="host", proc_name="MetalRage2"),
    }
    return ctx


def fake_subprocess_run_factory(foreground_sequence, shot_calls):
    """Returns a fake subprocess.run() that:
      - answers `pico_ctl.py session set-proc <name>` with rc=0
      - answers `bash shot.sh --proc <name> --name <label>` with rc=0 and a
        fake path on stdout, and records each such call in shot_calls (this
        is the ONLY thing that represents SetForegroundWindow being called)
      - answers `client_ctl.py foreground` by popping the next value off
        foreground_sequence (repeating the last one if exhausted, so a
        "dwm forever" test does not need an exact call count up front)
    """
    def fake_run(args, capture_output=True, text=True, timeout=None, **kwargs):
        if args[0] == "bash":
            shot_calls.append(list(args))
            return mock.Mock(returncode=0, stdout="/fake/shots/focus-host.png\n", stderr="")
        if actions.CLIENT_CTL in args and "foreground" in args:
            if foreground_sequence:
                val = foreground_sequence.pop(0) if len(foreground_sequence) > 1 else foreground_sequence[0]
            else:
                val = ""
            return mock.Mock(returncode=0, stdout=val + "\n", stderr="")
        if actions.PICO_CTL in args:
            # session set-proc <name>
            return mock.Mock(returncode=0, stdout="", stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {args}")
    return fake_run


class FocusClientReadbackTest(unittest.TestCase):
    def _run(self, foreground_sequence):
        clock = FakeClock()
        shot_calls = []
        ctx = make_ctx()
        with mock.patch.object(actions.subprocess, "run",
                                side_effect=fake_subprocess_run_factory(foreground_sequence, shot_calls)), \
             mock.patch.object(actions.time, "monotonic", side_effect=clock.monotonic), \
             mock.patch.object(actions.time, "sleep", side_effect=clock.sleep):
            result = actions.focus_client(ctx, "host")
        return result, shot_calls, clock

    def test_a_dwm_then_match_succeeds_one_setforeground_call(self):
        result, shot_calls, clock = self._run(["dwm", "MetalRage2"])
        self.assertTrue(result.ok, result.detail)
        self.assertEqual(len(shot_calls), 1, "SetForegroundWindow (shot.sh) must be called exactly once")
        self.assertIn("foreground confirmed", result.detail)

    def test_b_dwm_forever_times_out_with_last_value_and_wait_time(self):
        result, shot_calls, clock = self._run(["dwm"])
        self.assertFalse(result.ok)
        self.assertEqual(len(shot_calls), 1, "must not call SetForegroundWindow again while polling")
        self.assertIn("'dwm'", result.detail)
        self.assertIn("polling", result.detail)
        self.assertGreaterEqual(clock.now, actions.FOCUS_FOREGROUND_READBACK_TIMEOUT_S)

    def test_c_other_instance_name_forever_is_not_treated_as_a_match(self):
        result, shot_calls, clock = self._run(["MetalRage"])  # target is 'MetalRage2'
        self.assertFalse(result.ok)
        self.assertEqual(len(shot_calls), 1)
        self.assertIn("'MetalRage'", result.detail)
        self.assertIn("MetalRage2", result.detail)

    def test_d_match_on_first_read_no_extra_wait(self):
        result, shot_calls, clock = self._run(["MetalRage2"])
        self.assertTrue(result.ok, result.detail)
        self.assertEqual(len(shot_calls), 1)
        self.assertEqual(clock.sleep_calls, [], "must not sleep at all when the first read already matches")


if __name__ == "__main__":
    unittest.main()
