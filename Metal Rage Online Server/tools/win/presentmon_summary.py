#!/usr/bin/env python3
"""Summarize a PresentMon CSV (see fps.sh's `summary` subcommand): print
frame count, capture duration, and frame-time / instantaneous-FPS
statistics (avg / median / p1 / p99).

Standalone stdlib-only script so it can run in WSL without installing
anything (mirrors trace-analysis/analyze_presentmon.py's column-detection
approach -- PresentMon 1.x/2.x use different column names, and even 2.x's
exact set depends on which --track_* flags fps.sh's `start` used, so this
does loose case-insensitive substring matching rather than assuming a fixed
header).

Usage:
    python3 presentmon_summary.py path/to/out.csv

🟡 unverified end-to-end: the frame-time column name (MsBetweenPresents) and
duration column name (CPUStartTime) are from PresentMon 2.6.0's published
README-ConsoleApplication.md (fetched 2026-09-22, see
tools/win/README-presentmon.md), not from a real MetalRage/dwm.exe capture
on this project -- the only real run made during this task failed at
"access denied" (no admin / Performance Log Users membership yet, see
README-presentmon.md), so no actual CSV with real data has been parsed by
this script. Confirm the detected column names in the printed output
against `head -1` of your first real CSV.
"""
import argparse
import csv
import sys

FRAMETIME_COL_CANDIDATES = [
    "msbetweenpresents",  # PresentMon 1.x and 2.x default frame-time column
    "msuntildisplayed",
    "frametime",
]
TIME_COL_CANDIDATES = [
    "cpustarttime",
    "cpustartqpctime",
    "timeinseconds",
]


def find_col(fieldnames, candidates):
    lower = {f.lower(): f for f in fieldnames}
    for cand in candidates:
        for lf, orig in lower.items():
            if cand in lf:
                return orig
    return None


def percentile(sorted_vals, pct):
    """Linear-interpolation percentile (0-100) over an already-sorted list."""
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = k - lo
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * frac


def median(sorted_vals):
    n = len(sorted_vals)
    if n == 0:
        return None
    mid = n // 2
    if n % 2:
        return sorted_vals[mid]
    return (sorted_vals[mid - 1] + sorted_vals[mid]) / 2.0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path")
    ap.add_argument("--frametime-col", help="override auto-detected frame-time column name")
    ap.add_argument("--time-col", help="override auto-detected elapsed-time column name")
    args = ap.parse_args()

    with open(args.csv_path, newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("empty CSV or no header row", file=sys.stderr)
            sys.exit(1)

        ft_col = args.frametime_col or find_col(reader.fieldnames, FRAMETIME_COL_CANDIDATES)
        time_col = args.time_col or find_col(reader.fieldnames, TIME_COL_CANDIDATES)
        if not ft_col:
            print(f"could not find a frame-time column among {reader.fieldnames}; pass --frametime-col", file=sys.stderr)
            sys.exit(1)
        print(f"[detected] frame-time column: {ft_col!r}   time column: {time_col!r}")

        frametimes = []
        times = []
        for row in reader:
            try:
                ft = float(row[ft_col])
            except (KeyError, ValueError):
                continue
            frametimes.append(ft)
            if time_col:
                try:
                    times.append(float(row[time_col]))
                except (KeyError, ValueError):
                    pass

    if not frametimes:
        print("no usable rows (frame-time column present but empty/non-numeric on every row)", file=sys.stderr)
        sys.exit(1)

    frametimes.sort()
    fps_vals = sorted(1000.0 / ft for ft in frametimes if ft > 0)

    n = len(frametimes)
    avg_ft = sum(frametimes) / n
    print(f"\nframes: {n}")
    if times:
        print(f"time range: {min(times):.3f}s .. {max(times):.3f}s (span {max(times) - min(times):.3f}s)")
    else:
        print("time range: unknown (no elapsed-time column found)")

    print("\nframe time (ms):")
    print(f"  avg={avg_ft:.3f}  median={median(frametimes):.3f}  p1={percentile(frametimes, 1):.3f}  p99={percentile(frametimes, 99):.3f}")

    if fps_vals:
        avg_fps = sum(fps_vals) / len(fps_vals)
        print("\ninstantaneous fps (1000/frame-time, per frame -- NOT the same as 1000/avg(frame-time)):")
        print(f"  avg={avg_fps:.1f}  median={median(fps_vals):.1f}  p1={percentile(fps_vals, 1):.1f}  p99={percentile(fps_vals, 99):.1f}")
        print("  (p1 fps = worst 1% of frames' instantaneous fps -- the \"1% low\"; p99 fps = best 1%)")


if __name__ == "__main__":
    main()
