#!/usr/bin/env python3
"""
test_leave_battle_second_confirm.py - Offline test for leave_battle()'s
missing SECOND click (2026-09-21 task: the in-battle "leave" flow has TWO
dialogs -- the first GAME MENU's own 離開 row only opens a second "您要結束
遊戲嗎？" confirm dialog with 離開/取消 side by side; the old code never
clicked the second one, see [OBS] 操作者 2026-09-21 C 段第三次實跑 and
shots/dual-netspeed-c-42/43/44-leave_battle-room-*.png, three real captures
of a run stuck exactly here).

Covers, fully offline (focus_client/click_at/key/screens all mocked, no real
subprocess/screenshot/log-file access):
  1. The happy path sends TWO clicks, in order, at the two MEASURED
     coordinates: BATTLE_ESC_LEAVE_BUTTON (first layer) then
     LEAVE_CONFIRM_LEAVE_BUTTON (second layer, NOT LEAVE_CONFIRM_CANCEL_
     BUTTON) -- with a leave_confirm_state("open") check in between.
  2. If the second dialog never opens, this action fails closed WITHOUT
     ever attempting the second click (no blind click, per design.md 第 8
     節 "遇到任何非預期畫面 -> 立即 halt，不重試").

Run: python3 test_leave_battle_second_confirm.py
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


class LeaveBattleSecondConfirmTest(unittest.TestCase):
    def _run(self, confirm_opens):
        ctx = _make_ctx()
        click_calls = []

        def fake_click_at(ctx_, xy, button="left"):
            click_calls.append(xy)
            return {"call": "click_at", "xy": xy}

        def fake_key(ctx_, key_name):
            return {"call": "key", "key": key_name}

        def fake_focus_client(ctx_, client_id):
            return actions.ActionResult("focus_client", True, False, 0.01, "ok", None, None, [])

        def fake_leave_confirm_state(img):
            if confirm_opens:
                return "open", (486, 0, 291)
            return "closed", (0, 0, 8)

        def fake_detect_marker(img, name):
            # room-or-notice check at the end: say the room screen is back.
            if name == "room":
                return True, 3.0
            return False, 41.0

        with mock.patch.object(actions, "click_at", side_effect=fake_click_at), \
             mock.patch.object(actions, "key", side_effect=fake_key), \
             mock.patch.object(actions, "focus_client", side_effect=fake_focus_client), \
             mock.patch.object(actions, "take_screenshot", return_value="/fake/shots/x.png"), \
             mock.patch.object(actions.time, "sleep", return_value=None), \
             mock.patch.object(actions, "DEFAULT_LEAVE_BATTLE_TIMEOUT_S", 0.0), \
             mock.patch.object(actions, "DEFAULT_LEAVE_CONFIRM_TIMEOUT_S", 0.0), \
             mock.patch.object(screens, "leave_confirm_state", side_effect=fake_leave_confirm_state), \
             mock.patch.object(screens, "detect_marker", side_effect=fake_detect_marker):
            result = actions.leave_battle(ctx, "joiner")
        return result, click_calls

    def test_happy_path_clicks_both_layers_in_order_at_measured_coords(self):
        result, click_calls = self._run(confirm_opens=True)
        self.assertEqual(
            click_calls, [actions.BATTLE_ESC_LEAVE_BUTTON, actions.LEAVE_CONFIRM_LEAVE_BUTTON],
            "must click the first-layer button, THEN the second-layer 離開 "
            "(never LEAVE_CONFIRM_CANCEL_BUTTON, and never in the other order)",
        )
        self.assertNotIn(
            actions.LEAVE_CONFIRM_CANCEL_BUTTON, click_calls,
            "must never click 取消 -- this action's only job is to leave",
        )
        # The two measured coordinates themselves (not just "some 2 clicks"):
        self.assertEqual(click_calls[0], (867, 651))
        self.assertEqual(click_calls[1], (747, 672))
        self.assertIn("second dialog confirmed open", result.detail)

    def test_second_dialog_never_opens_fails_closed_no_second_click(self):
        result, click_calls = self._run(confirm_opens=False)
        self.assertEqual(
            click_calls, [actions.BATTLE_ESC_LEAVE_BUTTON],
            "must NOT attempt the second click when the confirm dialog never "
            "appeared -- fail closed, no blind click",
        )
        self.assertFalse(result.ok)
        self.assertIn("did NOT appear", result.detail)
        self.assertIn("fail closed", result.detail)


if __name__ == "__main__":
    unittest.main()
