#!/usr/bin/env python3
"""
runner.py - Deterministic experiment runner for unattended Pico runs. No
model/LLM is ever called from this file: every step's pass/fail comes from
screens.py's numpy/PIL region comparisons and pico_ctl.py's own text replies
(OK / BLOCKED), decided by this script alone. The lead reads the report
afterwards; nothing here asks a model to look at a screenshot.

Usage:
  python3 runner.py run experiments/U-shop-tabs.json --dry-run
  python3 runner.py run experiments/U-shop-tabs.json
  python3 runner.py validate experiments/U-shop-tabs.json

An experiment file:
{
  "id": "U-shop-tabs",
  "purpose": "free-text, goes in the report",
  "preconditions": {"screen": "lobby"},
  "steps": [
    {"action": "goto_shop"},
    {"action": "shop_tab", "params": {"name": "aux"}},
    {"action": "back_to_lobby"}
  ],
  "stop_conditions": {"max_consecutive_failures": 1},
  "max_image_reviews": 0
}

`max_image_reviews` must be 0 (validated) -- this runner has no model hookup
to spend a review on; the field exists so a future runner can add one without
changing the experiment file schema.

Fail-closed: on the first failed precondition, failed step, or gray-zone
classification, the runner stops immediately, sends a raw RESET (release all
keys, best-effort), ends the pico session, and writes a FAIL report. It never
tries to recover or retry past that point -- same policy as
docs/reference/unattended.md 第 2 節.
"""

import argparse
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import actions  # noqa: E402
import screens  # noqa: E402

REPORTS_DIR = os.path.join(SCRIPT_DIR, "logs", "reports")


# ---------------------------------------------------------------------------
# Experiment file validation (also used by --dry-run, and importable so a
# caller can validate without running).
# ---------------------------------------------------------------------------
class ExperimentError(Exception):
    pass


def load_experiment(path):
    with open(path, "r", encoding="utf-8") as f:
        exp = json.load(f)
    validate_experiment(exp)
    return exp


def validate_experiment(exp):
    for req in ("id", "purpose", "steps"):
        if req not in exp:
            raise ExperimentError(f"experiment missing required field '{req}'")
    if not isinstance(exp["id"], str) or not exp["id"]:
        raise ExperimentError("'id' must be a non-empty string")
    if not isinstance(exp["purpose"], str) or not exp["purpose"]:
        raise ExperimentError("'purpose' must be a non-empty string")
    if exp.get("max_image_reviews", 0) != 0:
        raise ExperimentError(
            "'max_image_reviews' must be 0 -- this runner has no model hookup "
            "(see module docstring); nonzero values are reserved for a future runner"
        )
    pre = exp.get("preconditions", {})
    known_precondition_screens = ("lobby", "shop", "console_open", "room", "battle")
    if pre and "screen" in pre and pre["screen"] not in known_precondition_screens:
        raise ExperimentError(f"unknown precondition screen '{pre['screen']}'")
    if not isinstance(exp["steps"], list) or not exp["steps"]:
        raise ExperimentError("'steps' must be a non-empty list")
    for i, step in enumerate(exp["steps"]):
        if "action" not in step:
            raise ExperimentError(f"step {i}: missing 'action'")
        name = step["action"]
        if name not in actions.ACTIONS:
            raise ExperimentError(f"step {i}: unknown action '{name}', known: {sorted(actions.ACTIONS)}")
        params = step.get("params", {})
        if name == "shop_tab":
            if "name" not in params or params["name"] not in actions.TAB_COORDS:
                raise ExperimentError(f"step {i}: shop_tab needs params.name in {sorted(actions.TAB_COORDS)}")
        if name == "console_cmd":
            text = params.get("text")
            if text not in actions.CONSOLE_CMD_WHITELIST:
                raise ExperimentError(f"step {i}: console_cmd needs params.text in {sorted(actions.CONSOLE_CMD_WHITELIST)}")
        if name == "campaign_win_all":
            settle_s = params.get("settle_s", actions.DEFAULT_ROUND_SETTLE_S)
            max_rounds = params.get("max_rounds", actions.MAX_CAMPAIGN_ROUNDS)
            if not isinstance(settle_s, (int, float)) or settle_s <= 0:
                raise ExperimentError(f"step {i}: campaign_win_all params.settle_s must be a positive number")
            if not isinstance(max_rounds, int) or max_rounds <= 0:
                raise ExperimentError(f"step {i}: campaign_win_all params.max_rounds must be a positive int")
        if name == "deltest":
            wait_s = params.get("wait_s", actions.DEFAULT_DELTEST_WAIT_S)
            if not isinstance(wait_s, (int, float)) or wait_s <= 0:
                raise ExperimentError(f"step {i}: deltest params.wait_s must be a positive number")
        if name == "keepalive_wait":
            seconds = params.get("seconds")
            interval_s = params.get("interval_s", actions.DEFAULT_KEEPALIVE_INTERVAL_S)
            if not isinstance(seconds, (int, float)) or seconds <= 0:
                raise ExperimentError(f"step {i}: keepalive_wait needs params.seconds as a positive number")
            if not isinstance(interval_s, (int, float)) or interval_s <= 0:
                raise ExperimentError(f"step {i}: keepalive_wait params.interval_s must be a positive number")
    sc = exp.get("stop_conditions", {})
    if not isinstance(sc, dict):
        raise ExperimentError("'stop_conditions' must be an object")


def describe_step(step):
    name = step["action"]
    params = step.get("params", {})
    if name == "goto_shop":
        return f"goto_shop: precondition=lobby, click client{actions.SHOP_BUTTON}, wait<=8s for screen=shop"
    if name == "shop_tab":
        tab = params["name"]
        return (f"shop_tab({tab}): precondition=shop, click client{actions.TAB_COORDS[tab]}, "
                f"wait<=6s for tab '{actions.TAB_MANIFEST_KEY[tab]}' active")
    if name == "back_to_lobby":
        return f"back_to_lobby: precondition=shop, click client{actions.BACK_BUTTON}, wait<=8s for screen=lobby"
    if name == "open_console":
        return "open_console: key F24, wait<=5s for console_state=open"
    if name == "close_console":
        return "close_console: precondition=console open, key ESC, wait<=5s for console_state=closed"
    if name == "console_cmd":
        return f"console_cmd({params.get('text')!r}): precondition=console open, TYPE+ENTER, best-effort completion"
    if name == "dismiss_notice":
        return (f"dismiss_notice: check notice_popup marker; if present click client{actions.NOTICE_CONFIRM_BUTTON}, "
                f"wait<=6s for it to clear; no-op (ok=True) if absent")
    if name == "create_pve_room":
        return (f"create_pve_room: precondition=lobby, click client{actions.CREATE_ROOM_BUTTON} (建立房間), "
                f"wait<=6s for create_dialog marker, click client{actions.CREATE_PVE_TAB} (協力模式), "
                f"wait<=4s for dialog_pve tab active, click client{actions.CREATE_CONFIRM_BUTTON} (確認), "
                f"wait<=10s for room or notice_popup marker")
    if name == "start_battle":
        return ("start_battle: precondition=room marker, key F5, wait<=25s for session-log markers "
                "'gameStarted_ false -> true' + 'Game_Start_SN sent'")
    if name == "campaign_win_all":
        settle_s = params.get("settle_s", actions.DEFAULT_ROUND_SETTLE_S)
        max_rounds = params.get("max_rounds", actions.MAX_CAMPAIGN_ROUNDS)
        return (f"campaign_win_all: precondition=battle marker, key F24, wait<=5s for console_state(battle)=open, "
                f"then up to {max_rounds}x: TYPE 'GameCampaign 1'+ENTER, wait<=30s for an R-ROUND session-log marker, "
                f"sleep {settle_s}s before the next send, stop at the EndGame_SN R-ROUND marker")
    if name == "campaign_fail":
        return ("campaign_fail: precondition=battle HUD (<=60s), key F24 if console closed, "
                "wait<=5s for console_state(battle)=open, then TYPE 'GameCampaign 2'+ENTER, "
                f"wait<={actions.CAMPAIGN_FAIL_ENDGAME_TIMEOUT_S}s for an EndGame_SN 0x00222213 send pkt "
                "in the session log (no R-ROUND marker exists for action=2, see actions.py)")
    if name == "deltest":
        wait_s = params.get("wait_s", actions.DEFAULT_DELTEST_WAIT_S)
        return (f"deltest: precondition=battle HUD (<=60s), key F24 if console closed, "
                f"wait<=5s for console_state(battle)=open, then TYPE 'delTest'+ENTER (NOT in "
                f"console_cmd's whitelist -- hardcoded to this action only), sleep {wait_s}s, "
                f"then count Death_CN(recv 0x00230123)/Death_SN(send 0x00230124) pkts in the session log")
    if name == "keepalive_wait":
        seconds = params.get("seconds")
        interval_s = params.get("interval_s", actions.DEFAULT_KEEPALIVE_INTERVAL_S)
        return (f"keepalive_wait: no precondition, idle {seconds}s sending a zero-net mouse_wiggle "
                f"every {interval_s}s (🟡 guess, see actions.py docstring)")
    if name == "wait_result_then_room":
        return "wait_result_then_room: wait<=15s for result marker (best-effort), then wait<=20s for room or notice_popup marker"
    if name == "leave_room":
        return f"leave_room: precondition=room marker, click client{actions.LEAVE_ROOM_BUTTON} (上一頁), wait<=8s for screen=lobby"
    return f"{name}: {params}"


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
def fail_closed(ctx):
    """RESET + best-effort session end. Never raises -- this runs from an
    already-failing path and must not mask the original failure."""
    if ctx.dry_run:
        return
    try:
        import subprocess
        subprocess.run([sys.executable, actions.PICO_CTL, "raw", "RESET"], capture_output=True, text=True)
    except Exception:
        pass
    try:
        import subprocess
        subprocess.run([sys.executable, actions.PICO_CTL, "session", "end"], capture_output=True, text=True)
    except Exception:
        pass


def run_experiment(exp_path, dry_run=False, shots_dir=None, logs_dir=None):
    exp = load_experiment(exp_path)
    ctx = actions.Context(
        dry_run=dry_run,
        shots_dir=shots_dir or actions.DEFAULT_SHOTS_DIR,
        logs_dir=logs_dir or actions.DEFAULT_LOGS_DIR,
        run_id=exp["id"],
    )

    report = {
        "id": exp["id"],
        "purpose": exp["purpose"],
        "dry_run": dry_run,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "build_event": None,
        "precondition": None,
        "steps": [],
        "anomalies": [],
        "result": None,
    }

    if dry_run:
        print(f"[DRY-RUN] {exp['id']}: {exp['purpose']}")
        pre = exp.get("preconditions", {})
        if pre:
            print(f"  precondition: {pre}")
        for i, step in enumerate(exp["steps"]):
            print(f"  step {i}: {describe_step(step)}")
        sc = exp.get("stop_conditions", {})
        if sc:
            print(f"  stop_conditions: {sc}")
        print("  max_image_reviews: 0 (no model calls)")
        report["result"] = "DRY_RUN_OK"
        return report, 0

    report["build_event"] = actions.find_build_event(ctx.logs_dir)
    if report["build_event"] is None:
        report["anomalies"].append(f"no build event found under {ctx.logs_dir} (no session-*.jsonl, or no 'build' line)")

    stop = exp.get("stop_conditions", {})
    max_consecutive_failures = stop.get("max_consecutive_failures", 1)

    rc = subprocess_session_start(ctx, f"{exp['id']}: {exp['purpose']}")
    if rc != 0:
        report["result"] = "FAIL"
        report["anomalies"].append(f"pico session start failed (rc={rc})")
        write_report(report)
        return report, 1

    session_open = True
    try:
        pre = exp.get("preconditions", {})
        if pre.get("screen"):
            shot = actions.take_screenshot(ctx, "initial-precondition")
            r = screens.classify_screen(shot)
            ok = r.name == pre["screen"] and not r.gray
            report["precondition"] = {
                "expected": pre["screen"], "got": r.name, "score": r.score,
                "margin": r.margin, "gray": r.gray, "ok": ok, "screenshot": shot,
            }
            if not ok:
                report["anomalies"].append(f"initial precondition failed: expected {pre['screen']}, classify_screen -> {r.name} (gray={r.gray})")
                report["result"] = "FAIL"
                fail_closed(ctx)
                session_open = False
                write_report(report)
                return report, 1

        consecutive_failures = 0
        for i, step in enumerate(exp["steps"]):
            name = step["action"]
            params = step.get("params", {})
            fn = actions.ACTIONS[name]
            result = fn(ctx, **params)
            entry = {
                "index": i, "action": name, "params": params, "ok": result.ok,
                "gray": result.gray, "duration_s": round(result.duration_s, 2),
                "detail": result.detail, "screenshot": result.screenshot, "score": result.score,
                "rounds": result.rounds,  # per-round R-ROUND timings, only non-empty for campaign_win_all
            }
            report["steps"].append(entry)
            print(f"  [{i}] {name}({params}) -> ok={result.ok} gray={result.gray} {result.detail}")

            if result.gray:
                report["anomalies"].append(f"step {i} ({name}): gray-zone classification, stopping")

            if not result.ok:
                consecutive_failures += 1
                report["anomalies"].append(f"step {i} ({name}): failed: {result.detail}")
            else:
                consecutive_failures = 0

            if result.gray or not result.ok:
                if result.gray or consecutive_failures >= max_consecutive_failures:
                    report["result"] = "FAIL"
                    fail_closed(ctx)
                    session_open = False
                    for j in range(i + 1, len(exp["steps"])):
                        report["steps"].append({
                            "index": j, "action": exp["steps"][j]["action"],
                            "params": exp["steps"][j].get("params", {}),
                            "ok": None, "gray": None, "duration_s": 0.0,
                            "detail": "skipped (runner stopped fail-closed)",
                            "screenshot": None, "score": None, "rounds": [],
                        })
                    write_report(report)
                    return report, 1

        report["result"] = "PASS"
        return report, 0
    finally:
        if session_open:
            subprocess_session_end(ctx)
        write_report(report)


def subprocess_session_start(ctx, purpose):
    import subprocess
    proc = subprocess.run([sys.executable, actions.PICO_CTL, "session", "start", purpose],
                           capture_output=True, text=True)
    print(proc.stdout.strip())
    if proc.returncode != 0:
        print(proc.stderr.strip(), file=sys.stderr)
    return proc.returncode


def subprocess_session_end(ctx):
    import subprocess
    proc = subprocess.run([sys.executable, actions.PICO_CTL, "session", "end"], capture_output=True, text=True)
    print(proc.stdout.strip())


def write_report(report):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    base = os.path.join(REPORTS_DIR, f"{report['id']}-{ts}")
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(f"{report['id']} - {report['result']}\n")
        f.write(f"purpose: {report['purpose']}\n")
        f.write(f"started_at: {report['started_at']}\n")
        be = report.get("build_event")
        if be:
            f.write(f"build: {be.get('branch')}@{be.get('commit')} dirty={be.get('dirty')} "
                    f"nonDefault={list(be.get('nonDefault', {}).keys())}\n")
        else:
            f.write("build: (no build event found in session log)\n")
        pre = report.get("precondition")
        if pre:
            f.write(f"precondition: expected={pre['expected']} got={pre['got']} ok={pre['ok']}\n")
        f.write("steps:\n")
        for s in report["steps"]:
            f.write(f"  [{s['index']}] {s['action']}({s['params']}) ok={s['ok']} gray={s['gray']} "
                    f"{s['duration_s']}s :: {s['detail']}\n")
            for r in s.get("rounds") or []:
                f.write(f"        round {r['iteration']}: cleared={r['cleared']} playRound={r['playRound']} "
                        f"wait_s={r['wait_s']} ms={r['ms']} :: {r['tail']}\n")
        if report["anomalies"]:
            f.write("anomalies:\n")
            for a in report["anomalies"]:
                f.write(f"  - {a}\n")
    print(f"[REPORT] {base}.json / .txt")


# ---------------------------------------------------------------------------
# Suite: several experiment files run back to back, stopping (fail-closed) on
# the first one that does not PASS. Each experiment still writes its own
# report via run_experiment(); this only adds one summary on top, same
# id+timestamp naming as write_report() above.
# ---------------------------------------------------------------------------
class SuiteError(Exception):
    pass


def load_suite(path):
    """Loads and validates a suite file, resolving each entry in
    'experiments' relative to the suite file's own directory (so a suite can
    be invoked from any cwd, same as how experiments/*.json is written
    relative to tools/pico/ regardless of invocation directory). Also
    load_experiment()s every entry up front -- fail-closed before anything
    runs, not partway through the suite."""
    with open(path, "r", encoding="utf-8") as f:
        suite = json.load(f)
    for req in ("id", "purpose", "experiments"):
        if req not in suite:
            raise SuiteError(f"suite missing required field '{req}'")
    if not isinstance(suite["id"], str) or not suite["id"]:
        raise SuiteError("'id' must be a non-empty string")
    if not isinstance(suite["purpose"], str) or not suite["purpose"]:
        raise SuiteError("'purpose' must be a non-empty string")
    if not isinstance(suite["experiments"], list) or not suite["experiments"]:
        raise SuiteError("'experiments' must be a non-empty list")
    base_dir = os.path.dirname(os.path.abspath(path))
    resolved = []
    for entry in suite["experiments"]:
        if not isinstance(entry, str) or not entry:
            raise SuiteError(f"suite experiment entry must be a non-empty string, got {entry!r}")
        exp_path = entry if os.path.isabs(entry) or os.sep in entry else os.path.join(base_dir, entry)
        if not os.path.exists(exp_path):
            raise SuiteError(f"suite experiment file not found: {exp_path}")
        load_experiment(exp_path)  # raises ExperimentError up front if any file is bad
        resolved.append(exp_path)
    return suite, resolved


def run_suite(suite_path, dry_run=False, shots_dir=None, logs_dir=None):
    """Runs each experiment in the suite, in order, via run_experiment() --
    same fail-closed policy as a single experiment's steps: the first
    experiment whose result is not PASS (rc != 0, includes the DRY_RUN_OK
    case which always has rc=0) stops the suite immediately. No experiment
    after that point is attempted."""
    suite, exp_paths = load_suite(suite_path)
    summary = {
        "id": suite["id"], "purpose": suite["purpose"], "dry_run": dry_run,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "experiments": [], "result": None, "stopped_at": None,
    }
    for exp_path in exp_paths:
        print(f"=== suite {suite['id']}: {os.path.basename(exp_path)} ===")
        report, rc = run_experiment(exp_path, dry_run=dry_run, shots_dir=shots_dir, logs_dir=logs_dir)
        summary["experiments"].append({
            "path": exp_path, "id": report["id"], "result": report["result"], "rc": rc,
        })
        if rc != 0:
            summary["result"] = "FAIL"
            summary["stopped_at"] = os.path.basename(exp_path)
            write_suite_report(summary)
            return summary, 1
    summary["result"] = "PASS"
    write_suite_report(summary)
    return summary, 0


def write_suite_report(summary):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    base = os.path.join(REPORTS_DIR, f"{summary['id']}-{ts}")
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(f"{summary['id']} - {summary['result']}\n")
        f.write(f"purpose: {summary['purpose']}\n")
        f.write(f"started_at: {summary['started_at']}\n")
        f.write("experiments:\n")
        for e in summary["experiments"]:
            f.write(f"  {e['id']}: {e['result']} (rc={e['rc']}) [{e['path']}]\n")
        if summary["result"] == "FAIL":
            f.write(f"stopped_at: {summary.get('stopped_at')}\n")
    print(f"[SUITE REPORT] {base}.json / .txt")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="run (or --dry-run plan) an experiment file")
    p_run.add_argument("experiment")
    p_run.add_argument("--dry-run", action="store_true")
    p_run.add_argument("--shots-dir")
    p_run.add_argument("--logs-dir")

    p_val = sub.add_parser("validate", help="validate an experiment file's structure, no plan printed")
    p_val.add_argument("experiment")

    p_suite = sub.add_parser("suite", help="run (or --dry-run plan) a suite file: sequential experiments, "
                                            "stops on the first non-PASS (fail-closed)")
    p_suite.add_argument("suite")
    p_suite.add_argument("--dry-run", action="store_true")
    p_suite.add_argument("--shots-dir")
    p_suite.add_argument("--logs-dir")

    args = ap.parse_args()

    if args.cmd == "validate":
        try:
            load_experiment(args.experiment)
        except (ExperimentError, FileNotFoundError, json.JSONDecodeError) as ex:
            print(f"[INVALID] {ex}")
            sys.exit(1)
        print("[OK] experiment file is valid")
        return

    if args.cmd == "run":
        try:
            report, rc = run_experiment(args.experiment, dry_run=args.dry_run,
                                         shots_dir=args.shots_dir, logs_dir=args.logs_dir)
        except (ExperimentError, FileNotFoundError, json.JSONDecodeError) as ex:
            print(f"[INVALID] {ex}")
            sys.exit(1)
        print(f"[{report['result']}] {report['id']}")
        sys.exit(rc)

    if args.cmd == "suite":
        try:
            summary, rc = run_suite(args.suite, dry_run=args.dry_run,
                                     shots_dir=args.shots_dir, logs_dir=args.logs_dir)
        except (SuiteError, ExperimentError, FileNotFoundError, json.JSONDecodeError) as ex:
            print(f"[INVALID] {ex}")
            sys.exit(1)
        print(f"[{summary['result']}] {summary['id']}")
        sys.exit(rc)


if __name__ == "__main__":
    main()
