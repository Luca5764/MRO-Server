#!/usr/bin/env python3
"""
test_satisfied_by_room_or_notice.py - Offline tests for the 2026-09-21
"satisfied_by / WARN on backup" task (contract: docs/backlog.md, PM's
2026-09-21 create_pve_room incident where a broken 'room' marker silently
passed only because 'notice_popup' covered for it, and nothing recorded
which signal actually did it).

Covers:
  1. _room_or_notice_satisfied_by() unit cases: primary present (no warn),
     backup-only present (warn), neither present (None/None), and a
     dry-run-shaped detail string that does not match the pattern at all
     (None/None -- fails open, never raises).
  2. create_pve_room() end to end, screens.py/subprocess fully mocked:
     (a) primary ('room') present -> satisfied_by='room', no WARN in detail.
     (b) only backup ('notice_popup') present -> satisfied_by='notice_popup',
         WARN text present in detail (this is the exact incident shape:
         room=False(...) notice_popup=True(...)).
     (c) neither present -> ok=False, satisfied_by=None, no WARN (a plain
         failure is not a "backup covered for it" case).
  3. wait_result_then_room() gets the same treatment via the same helper.

Fully offline: no real pico_ctl.py/client_ctl.py/shot.sh subprocess runs, no
real screenshot decoding (screens.classify_screen/detect_marker/is_tab_active
are all mocked).

Run: python3 test_satisfied_by_room_or_notice.py
"""

import os
import sys
import unittest
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402
import screens  # noqa: E402


def fake_subprocess_run(args, capture_output=True, text=True, **kwargs):
    """Handles both take_screenshot's `bash shot.sh ...` and click_at/
    run_pico's `python3 pico_ctl.py ...` shapes, same style as the existing
    test_screenshot_active_client_and_action_error.py's fake_shot_run."""
    if args[0] == "bash" and args[1] == actions.SHOT_SH:
        return mock.Mock(returncode=0, stdout="/fake/shots/x.png\n", stderr="")
    return mock.Mock(returncode=0, stdout="[OK]\n", stderr="")


class RoomOrNoticeSatisfiedByUnitTest(unittest.TestCase):
    def test_primary_room_present_no_warn(self):
        detail = "room=True(3.10) notice_popup=False(41.02)"
        satisfied_by, warn = actions._room_or_notice_satisfied_by(detail)
        self.assertEqual(satisfied_by, "room")
        self.assertIsNone(warn)

    def test_backup_notice_popup_present_warns(self):
        # Exact shape from the 2026-09-21 incident report.
        detail = "room=False(42.05) notice_popup=True(2.28)"
        satisfied_by, warn = actions._room_or_notice_satisfied_by(detail)
        self.assertEqual(satisfied_by, "notice_popup")
        self.assertIsNotNone(warn)
        self.assertIn("WARN", warn)
        self.assertIn("room", warn)
        self.assertIn("notice_popup", warn)

    def test_neither_present_no_attribution(self):
        detail = "room=False(50.00) notice_popup=False(60.00)"
        satisfied_by, warn = actions._room_or_notice_satisfied_by(detail)
        self.assertIsNone(satisfied_by)
        self.assertIsNone(warn)

    def test_unrelated_detail_text_fails_open(self):
        # e.g. a dry-run's "dry-run: skipped" -- must never raise, never
        # fabricate an attribution from text it doesn't recognize.
        satisfied_by, warn = actions._room_or_notice_satisfied_by("dry-run: skipped")
        self.assertIsNone(satisfied_by)
        self.assertIsNone(warn)
        satisfied_by, warn = actions._room_or_notice_satisfied_by(None)
        self.assertIsNone(satisfied_by)
        self.assertIsNone(warn)


class CreatePveRoomSatisfiedByTest(unittest.TestCase):
    def _run_with_markers(self, room_present, notice_present):
        ctx = actions.Context(dry_run=False)

        def fake_classify_screen(img):
            return screens.ScreenResult(name="lobby", score=1.0, margin=5.0, gray=False)

        def fake_is_tab_active(img, tab_name):
            return True, 9.0

        def fake_detect_marker(img, name):
            if name == "create_dialog":
                return True, 8.0
            if name == "room":
                return room_present, 3.0 if room_present else 42.0
            if name == "notice_popup":
                return notice_present, 2.0 if notice_present else 41.0
            raise AssertionError(f"unexpected marker {name!r}")

        with mock.patch.object(actions, "subprocess") as m_sub, \
             mock.patch.object(screens, "classify_screen", side_effect=fake_classify_screen), \
             mock.patch.object(screens, "is_tab_active", side_effect=fake_is_tab_active), \
             mock.patch.object(screens, "detect_marker", side_effect=fake_detect_marker):
            m_sub.run.side_effect = fake_subprocess_run
            return actions.create_pve_room(ctx)

    def test_a_primary_room_present_no_warn(self):
        result = self._run_with_markers(room_present=True, notice_present=False)
        self.assertTrue(result.ok)
        self.assertEqual(result.satisfied_by, "room")
        self.assertNotIn("WARN", result.detail)

    def test_b_backup_only_notice_popup_present_warns(self):
        result = self._run_with_markers(room_present=False, notice_present=True)
        self.assertTrue(result.ok)
        self.assertEqual(result.satisfied_by, "notice_popup")
        self.assertIn("WARN", result.detail)
        self.assertIn("room", result.detail)
        self.assertIn("notice_popup", result.detail)

    def test_c_neither_present_plain_failure_no_warn(self):
        result = self._run_with_markers(room_present=False, notice_present=False)
        self.assertFalse(result.ok)
        self.assertIsNone(result.satisfied_by)
        self.assertNotIn("WARN", result.detail)


class WaitResultThenRoomSatisfiedByTest(unittest.TestCase):
    def _run_with_markers(self, room_present, notice_present):
        ctx = actions.Context(dry_run=False)

        def fake_detect_marker(img, name):
            if name == "result":
                return False, 30.0  # best-effort, not gating -- always miss here
            if name == "room":
                return room_present, 3.0 if room_present else 42.0
            if name == "notice_popup":
                return notice_present, 2.0 if notice_present else 41.0
            raise AssertionError(f"unexpected marker {name!r}")

        with mock.patch.object(actions, "subprocess") as m_sub, \
             mock.patch.object(screens, "detect_marker", side_effect=fake_detect_marker):
            m_sub.run.side_effect = fake_subprocess_run
            return actions.wait_result_then_room(ctx, result_timeout_s=0.0, room_timeout_s=0.0)

    def test_a_primary_room_present_no_warn(self):
        result = self._run_with_markers(room_present=True, notice_present=False)
        self.assertTrue(result.ok)
        self.assertEqual(result.satisfied_by, "room")
        self.assertNotIn("WARN", result.detail)

    def test_b_backup_only_notice_popup_present_warns(self):
        result = self._run_with_markers(room_present=False, notice_present=True)
        self.assertTrue(result.ok)
        self.assertEqual(result.satisfied_by, "notice_popup")
        self.assertIn("WARN", result.detail)


if __name__ == "__main__":
    unittest.main()
