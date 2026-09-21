#!/usr/bin/env python3
"""
test_screenshot_active_client_and_action_error.py - Offline tests for the two
2026-09-21 A-run defects (contract: fix take_screenshot()'s default target +
run_experiment()'s ActionError handling):

  1. take_screenshot(ctx, label) with no explicit proc= must default to
     ctx.clients[ctx.active_client].proc_name once a dual-client run has
     focused an instance, instead of always falling through to shot.sh's own
     "MetalRage" default -- this is what made login_as()'s wait_for() shoot
     the wrong (not-yet-launched) window right after a successful
     focus_client('host').
       (a) ctx.clients populated + active_client='host' -> argv has
           "--proc MetalRage2"
       (b) ctx.clients == {} (every existing single-client script) -> argv is
           IDENTICAL to pre-fix behavior (no --proc at all)
       (c) explicit proc='MetalRage' always wins, regardless of ctx state

  2. run_experiment() must not let an action's ActionError propagate as a
     bare traceback: it has to be caught, turned into a normal failed-step
     ActionResult, and run through the SAME fail-closed path as any other
     failed step (FAIL result, rc=1, report written, remaining steps marked
     skipped) -- see actions.focus_client() raising ActionError for an
     unknown client id as the trigger used here.
       (d) a step's action raises ActionError -> run_experiment returns
           (report, 1) with result == "FAIL", no exception escapes this
           call, and the step after the raising one is recorded as skipped.
           launch_client() is used as the trigger here: unlike focus_client()
           (which catches its own "unknown client id" case and returns a
           normal failed ActionResult), launch_client() raises ActionError
           directly for an unknown client_id -- see its own top few lines.

Fully offline: no real pico_ctl.py/client_ctl.py/shot.sh subprocess runs.

Run: python3 test_screenshot_active_client_and_action_error.py
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402
import runner  # noqa: E402


def fake_shot_run(args, capture_output=True, text=True, **kwargs):
    assert args[0] == "bash" and args[1] == actions.SHOT_SH, args
    return mock.Mock(returncode=0, stdout="/fake/shots/x.png\n", stderr="")


class TakeScreenshotActiveClientTest(unittest.TestCase):
    def test_a_dual_client_active_host_adds_proc_metalrage2(self):
        ctx = actions.Context(dry_run=False)
        ctx.clients = {
            "host": actions.ClientState(id="host", proc_name="MetalRage2"),
            "joiner": actions.ClientState(id="joiner", proc_name="MetalRage"),
        }
        ctx.active_client = "host"
        with mock.patch.object(actions.subprocess, "run", side_effect=fake_shot_run) as m:
            actions.take_screenshot(ctx, "login_as-screen-1")
        args = m.call_args.args[0]
        self.assertIn("--proc", args)
        self.assertEqual(args[args.index("--proc") + 1], "MetalRage2")

    def test_b_single_client_script_unchanged_no_proc_arg(self):
        """ctx.clients == {} (every existing U-*.json script never sets it) ->
        argv must be byte-for-byte what it was before this fix: no '--proc'
        at all, same ["bash", SHOT_SH, "--name", <name>] shape."""
        ctx = actions.Context(dry_run=False)
        self.assertEqual(ctx.clients, {})
        self.assertIsNone(ctx.active_client)
        with mock.patch.object(actions.subprocess, "run", side_effect=fake_shot_run) as m:
            actions.take_screenshot(ctx, "goto_shop-1")
        args = m.call_args.args[0]
        self.assertNotIn("--proc", args)
        self.assertEqual(args[0], "bash")
        self.assertEqual(args[1], actions.SHOT_SH)
        self.assertEqual(args[2], "--name")

    def test_c_explicit_proc_always_wins(self):
        ctx = actions.Context(dry_run=False)
        ctx.clients = {"host": actions.ClientState(id="host", proc_name="MetalRage2")}
        ctx.active_client = "host"
        with mock.patch.object(actions.subprocess, "run", side_effect=fake_shot_run) as m:
            actions.take_screenshot(ctx, "focus-joiner", proc="MetalRage")
        args = m.call_args.args[0]
        self.assertEqual(args[args.index("--proc") + 1], "MetalRage")


class RunExperimentActionErrorTest(unittest.TestCase):
    def setUp(self):
        self._tmp_reports = tempfile.mkdtemp(prefix="pico-test-reports-")
        self.addCleanup(shutil.rmtree, self._tmp_reports, ignore_errors=True)
        self._reports_patch = mock.patch.object(runner, "REPORTS_DIR", self._tmp_reports)
        self._reports_patch.start()
        self.addCleanup(self._reports_patch.stop)

        self._tmp_exp_dir = tempfile.mkdtemp(prefix="pico-test-exp-")
        self.addCleanup(shutil.rmtree, self._tmp_exp_dir, ignore_errors=True)

    def _write_exp(self, steps):
        exp = {
            "id": "T-actionerror",
            "purpose": "offline test of ActionError handling",
            "steps": steps,
        }
        path = os.path.join(self._tmp_exp_dir, "T-actionerror.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(exp, f)
        return path

    def test_d_action_error_is_caught_and_fails_closed(self):
        exp_path = self._write_exp([
            # ctx.clients is {} for this experiment (no top-level "clients"),
            # so launch_client('host') raises ActionError("unknown client id")
            # directly (unlike focus_client(), which catches this same case
            # itself and returns an ordinary failed ActionResult instead).
            {"action": "launch_client", "params": {"client_id": "host"}},
            {"action": "deltest", "params": {"wait_s": 0.01}},
        ])
        with mock.patch.object(runner, "run_preflight",
                                return_value=(True, {"ok": True, "checks": [], "instances": []})), \
             mock.patch.object(runner, "subprocess_session_start", return_value=0), \
             mock.patch.object(runner, "subprocess_session_end", return_value=None):
            try:
                report, rc = runner.run_experiment(exp_path, dry_run=False)
            except actions.ActionError:
                self.fail("ActionError escaped run_experiment() instead of being caught")

        self.assertEqual(rc, 1)
        self.assertEqual(report["result"], "FAIL")
        self.assertEqual(len(report["steps"]), 2)
        step0 = report["steps"][0]
        self.assertEqual(step0["action"], "launch_client")
        self.assertFalse(step0["ok"])
        self.assertIn("ActionError", step0["detail"])
        self.assertIn("unknown client id", step0["detail"])
        step1 = report["steps"][1]
        self.assertEqual(step1["action"], "deltest")
        self.assertIsNone(step1["ok"])
        self.assertIn("skipped", step1["detail"])
        # Confirm write_report() actually ran (report on disk), not skipped.
        self.assertTrue(any(fn.endswith(".json") for fn in os.listdir(self._tmp_reports)))


if __name__ == "__main__":
    unittest.main()
