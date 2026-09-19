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
    if pre and "screen" in pre and pre["screen"] not in ("lobby", "shop", "console_open"):
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
            if not isinstance(text, str) or not text:
                raise ExperimentError(f"step {i}: console_cmd needs a non-empty params.text")
            if not all(0x20 <= ord(c) <= 0x7E for c in text):
                raise ExperimentError(f"step {i}: console_cmd text must be printable ASCII")
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
                            "screenshot": None, "score": None,
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
        if report["anomalies"]:
            f.write("anomalies:\n")
            for a in report["anomalies"]:
                f.write(f"  - {a}\n")
    print(f"[REPORT] {base}.json / .txt")


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


if __name__ == "__main__":
    main()
