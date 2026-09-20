#!/usr/bin/env python3
"""Find frame-time spikes in a PresentMon CSV and turn each one into a
wall-clock timestamp + a runbook for inspecting the MetalRage main thread's
CPU/scheduling state at that moment.

This is the offline half of docs/research/2026-09-19-win11-patch-audit/
trace-plan.md. It does NOT touch the Windows machine -- read-only, runs in
WSL (or Windows) against files already copied out of
C:\\Users\\<你的 Windows 使用者名稱>\\mro-trace\\<timestamp>\\.

Usage:
    python3 analyze_presentmon.py presentmon.csv --threshold-ms 50 \
        --start-marker start-marker.json

Without --start-marker, spike times are reported as seconds-since-capture-
start only (no wall clock), since PresentMon CSVs are not guaranteed to
carry an absolute timestamp column -- see NOTES below.

🟡 unverified: the exact PresentMon CSV column names below are from
PresentMon's published documentation, not from a real capture on this
project (no PresentMon build was installed/run to produce a sample). The
column-name matching is deliberately loose (case-insensitive substring) so
it has a chance of working across PresentMon 1.x and 2.x header changes, but
confirm the detected column name in the printed output against
`head -1 presentmon.csv` the first time you run this for real, and adjust
--time-col / --frametime-col if it guessed wrong.
"""
import argparse
import csv
import json
import sys
from datetime import datetime, timedelta

# Loose, case-insensitive substring candidates, tried in order.
FRAMETIME_COL_CANDIDATES = [
    "msbetweenpresents",  # PresentMon 1.x
    "frametime",          # PresentMon 2.x summary-style column, if present
    "msuntildisplayed",
]
TIME_COL_CANDIDATES = [
    "timeinseconds",
    "qpctime",
]


def find_col(fieldnames, candidates):
    lower = {f.lower(): f for f in fieldnames}
    for cand in candidates:
        for lf, orig in lower.items():
            if cand in lf:
                return orig
    return None


def load_start_time(path):
    with open(path) as f:
        data = json.load(f)
    started_at = data.get("started_at")
    if not started_at:
        raise ValueError(f"{path} has no 'started_at' field")
    # PowerShell's (Get-Date).ToString('o') -> ISO 8601 with offset, e.g.
    # 2026-09-19T23:10:00.1234567+08:00 -- Python's fromisoformat handles
    # this from 3.11+; trim to microsecond precision for older versions.
    try:
        return datetime.fromisoformat(started_at)
    except ValueError:
        trimmed = started_at[:26] + started_at[-6:]
        return datetime.fromisoformat(trimmed)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path")
    ap.add_argument("--threshold-ms", type=float, default=50.0,
                     help="flag frames at or above this frame time (default 50ms, i.e. below ~20fps)")
    ap.add_argument("--start-marker", help="start-marker.json from mro-trace.ps1, to compute wall-clock spike times")
    ap.add_argument("--time-col", help="override auto-detected elapsed-time column name")
    ap.add_argument("--frametime-col", help="override auto-detected frame-time column name")
    ap.add_argument("--window-ms", type=float, default=500.0,
                     help="±window around each spike to inspect in the ETL (default 500ms)")
    args = ap.parse_args()

    with open(args.csv_path, newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("empty CSV or no header row", file=sys.stderr)
            sys.exit(1)

        time_col = args.time_col or find_col(reader.fieldnames, TIME_COL_CANDIDATES)
        ft_col = args.frametime_col or find_col(reader.fieldnames, FRAMETIME_COL_CANDIDATES)
        if not ft_col:
            print(f"could not find a frame-time column among {reader.fieldnames}; pass --frametime-col", file=sys.stderr)
            sys.exit(1)
        print(f"[detected] time column: {time_col!r}   frame-time column: {ft_col!r}")
        if not time_col:
            print("[warn] no elapsed-time column found -- spikes will be reported by row number only", file=sys.stderr)

        rows = list(reader)

    start_dt = None
    if args.start_marker:
        start_dt = load_start_time(args.start_marker)
        print(f"[start] capture started_at = {start_dt.isoformat()}")

    spikes = []
    for i, row in enumerate(rows):
        try:
            ft = float(row[ft_col])
        except (KeyError, ValueError):
            continue
        if ft >= args.threshold_ms:
            elapsed_s = None
            if time_col:
                try:
                    elapsed_s = float(row[time_col])
                except (KeyError, ValueError):
                    pass
            spikes.append((i, elapsed_s, ft))

    if not spikes:
        print(f"no frames >= {args.threshold_ms}ms found")
        return

    print(f"\n{len(spikes)} spike(s) >= {args.threshold_ms}ms:\n")
    for i, elapsed_s, ft in spikes:
        wall = None
        if start_dt is not None and elapsed_s is not None:
            wall = start_dt + timedelta(seconds=elapsed_s)
        loc = f"row {i}"
        if elapsed_s is not None:
            loc += f", t+{elapsed_s:.3f}s"
        if wall is not None:
            loc += f", {wall.isoformat()}"
        print(f"  {loc}: {ft:.2f}ms")

        if wall is not None:
            win_start = wall - timedelta(milliseconds=args.window_ms)
            win_end = wall + timedelta(milliseconds=args.window_ms)
            print(f"    WPA (manual, see trace-plan.md 手動 WPA 步驟): set the analysis window to")
            print(f"      {win_start.isoformat()} .. {win_end.isoformat()}")
            print(f"    tracerpt (automatable, 🟡 unverified, see trace-plan.md tracerpt 章節):")
            print(f"      tracerpt cpu.etl -o spike-{i}.xml -of XML -lr")
            print(f"      # then grep the XML for CSwitch/ReadyThread events with a")
            print(f"      # <TimeCreated SystemTime=\"...\"/> inside the window above, filtered to")
            print(f"      # MetalRage.exe's PID (see start-marker.json metalrage_pid).")

    print("\nDecision table (see trace-plan.md for the full version):")
    print("  MetalRage main thread shows Wait Reason = Suspended, readied by a thread")
    print("    NOT in the MetalRage process               -> supports H-Y0DA (y0da suspends it)")
    print("  MetalRage main thread is Running/Ready the whole window, no gap           -> not a scheduling stall;")
    print("    look at the Present call stack / DXGI wait instead (Win11 present-wait hypothesis)")
    print("  MetalRage main thread is Ready but not Running for the whole window,")
    print("    CPU busy with other processes                                          -> plain CPU contention/scheduling,")
    print("    not y0da-specific")


if __name__ == "__main__":
    main()
