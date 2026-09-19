#!/usr/bin/env python3
"""
screens.py - Zero-cost (no model) screen classifier for unattended Pico runs.

Compares small fixed regions of a fresh screenshot (as produced by
tools/win/shot.sh: the whole MetalRage window frame, 1616x1239, client area
1600x1200 at offset (8,31)) against small reference crops checked into
atlas/. Mean absolute difference (MAD) per region -- no OpenCV, no perceptual
hash library, just numpy/PIL which are already available.

Two independent things are classified:
  - classify_screen(img): lobby / shop / console_open / unknown (mutually
    exclusive "what screen is this" call; console_open takes precedence when
    detected -- see docstring on classify_screen for why).
  - console_state(img): open / closed / unknown (finer-grained, used by the
    open_console/close_console actions directly).
  - is_tab_active(img, tab_name): is a specific shop sub-tab highlighted.

Regions and their reference crops are not hardcoded per-call: they live in
atlas/manifest.json, produced by `build-atlas` from a fixed table of
(reference screenshot, box) below. Only the crops (a few KB each) and the
manifest are committed; the full reference screenshots stay in the gitignored
shots/ dir.

Usage:
  python3 screens.py build-atlas --shots-dir ../../../shots
  python3 screens.py classify <image.png>
  python3 screens.py console <image.png>
  python3 screens.py tab <image.png> <tab_name>
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ATLAS_DIR = os.path.join(SCRIPT_DIR, "atlas")
MANIFEST_PATH = os.path.join(ATLAS_DIR, "manifest.json")

# Whole-window frame size produced by tools/win/shot.sh, and the client area's
# offset inside it (client_xy = shot_xy - CLIENT_OFFSET). [OBS]/[TEST]
# 2026-09-19 journal (docs/journal/2026-09-19-2230-unattended-trial-01.md).
SHOT_SIZE = (1616, 1239)
CLIENT_OFFSET = (8, 31)

# ---------------------------------------------------------------------------
# Atlas build table: every marker this module knows about, where its
# reference crop comes from (a file in shots_dir) and what box (in shot-space
# pixels, left/top/right/bottom) to crop. Chosen 2026-09-19 by comparing MAD
# across all reference shots in shots/ (see journal); each box was picked so
# the "right" screen scores ~0 and every "wrong" reference screenshot scores
# at least 5-10x the accept threshold below -- see THRESHOLDS.
# ---------------------------------------------------------------------------
BUILD_SPEC = {
    "screens": {
        # Room-list column header row ("編號/種類/房間名稱..."), only present
        # in the lobby. Empty/black in every shop sub-screen.
        "lobby": {"source": "u-20260919-01-00-start.png", "box": [460, 245, 1560, 270]},
        # Top-left corner of the left-hand equip panel ("輔助武器L" label +
        # icon row), present identically in every shop sub-screen (G/M coin
        # shop, any of the 4 item-type tabs) and absent from the lobby.
        "shop": {"source": "u-20260919-01-01-shop.png", "box": [18, 330, 335, 410]},
    },
    "console": {
        # Just the "(>" prompt glyph, deliberately not extending to the
        # blinking text-cursor "_" a few px to the right of it, so a captured
        # frame where the cursor happens to be in its "off" blink phase still
        # matches. See docs/journal comparison notes in this task's report.
        "box": [0, 600, 40, 632],
        "open": {"source": "f24-after.png"},
        "closed": {"source": "f24-closed.png"},
    },
    "tabs": {
        "shop_main": {"source": "u-20260919-01-01-shop.png", "box": [1165, 255, 1360, 290]},
        "shop_aux": {"source": "u-20260919-01-02-aux.png", "box": [1360, 255, 1610, 290]},
        "shop_equip": {"source": "u-20260919-01-02-equip.png", "box": [1165, 300, 1360, 335]},
        "shop_item": {"source": "u-20260919-01-02-item.png", "box": [1360, 300, 1610, 335]},
        "shop_mshop": {"source": "u-20260919-01-02-mshop.png", "box": [1373, 185, 1610, 235]},
    },
}

# Accept thresholds and gray-zone margin, tuned against the observed MAD
# spread in BUILD_SPEC's reference shots (2026-09-19, see this task's report
# for the numbers): correct-region MAD is always 0 in the reference set,
# wrong-region MAD is always >=~30 (screens) or >=~7.5 (console, narrow box)
# or >=~30 (tabs). These thresholds leave generous headroom for real capture
# noise while still being well below the observed "wrong" scores. 🟡 not yet
# validated against a live, freshly-captured screenshot (only against the
# reference shots used to build the atlas itself) -- see report.
THRESHOLDS = {
    "screen_accept": 12.0,
    "console_accept": 5.0,
    "gray_margin_ratio": 0.5,
    "tab_active_accept": 15.0,
}


@dataclass
class ScreenResult:
    name: str
    score: float
    margin: float
    gray: bool
    scores: dict = field(default_factory=dict)


def _load_image(img):
    """Accept either a path or an already-opened PIL Image."""
    if isinstance(img, Image.Image):
        return img
    return Image.open(img)


def _region_array(img, box):
    im = _load_image(img).convert("RGB")
    return np.asarray(im.crop(tuple(box)), dtype=np.int16)


def _mad(a, b):
    if a.shape != b.shape:
        raise ValueError(f"region shape mismatch {a.shape} vs {b.shape} -- screenshot resolution changed?")
    return float(np.abs(a - b).mean())


def shot_to_client(x, y):
    """Convert shot.sh (whole-window) pixel coords to MetalRage client-area
    coords, the coordinate space pico_ctl.py click_at expects."""
    return x - CLIENT_OFFSET[0], y - CLIENT_OFFSET[1]


# ---------------------------------------------------------------------------
# Manifest loading
# ---------------------------------------------------------------------------
_manifest_cache = None


def load_manifest():
    global _manifest_cache
    if _manifest_cache is not None:
        return _manifest_cache
    if not os.path.exists(MANIFEST_PATH):
        raise FileNotFoundError(
            f"{MANIFEST_PATH} missing -- run `python3 screens.py build-atlas --shots-dir <dir>` first"
        )
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    # Pre-load crop arrays so repeated classify_screen() calls in a run don't
    # re-decode PNGs each time.
    for name, d in manifest["screens"].items():
        d["_array"] = np.asarray(Image.open(os.path.join(ATLAS_DIR, d["crop"])).convert("RGB"), dtype=np.int16)
    manifest["console"]["_open_array"] = np.asarray(
        Image.open(os.path.join(ATLAS_DIR, manifest["console"]["open_crop"])).convert("RGB"), dtype=np.int16
    )
    manifest["console"]["_closed_array"] = np.asarray(
        Image.open(os.path.join(ATLAS_DIR, manifest["console"]["closed_crop"])).convert("RGB"), dtype=np.int16
    )
    for name, d in manifest["tabs"].items():
        d["_array"] = np.asarray(Image.open(os.path.join(ATLAS_DIR, d["crop"])).convert("RGB"), dtype=np.int16)
    _manifest_cache = manifest
    return manifest


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
def console_state(img):
    """Returns (state, score_open, score_closed, margin) where state is
    "open" / "closed" / "unknown". margin = |score_open - score_closed|."""
    manifest = load_manifest()
    c = manifest["console"]
    region = _region_array(img, c["box"])
    score_open = _mad(region, c["_open_array"])
    score_closed = _mad(region, c["_closed_array"])
    margin = abs(score_open - score_closed)
    accept = THRESHOLDS["console_accept"]
    if score_open <= accept and score_open < score_closed:
        state = "open"
    elif score_closed <= accept and score_closed <= score_open:
        state = "closed"
    else:
        state = "unknown"
    return state, score_open, score_closed, margin


def classify_screen(img):
    """Classify a screenshot as one of "lobby" / "shop" / "console_open" /
    "unknown".

    Design decision (2026-09-19, flagged for review): console_open is checked
    first and, if detected with a confident margin, wins outright instead of
    being compared on the same numeric scale as lobby/shop. The only case
    this has actually been observed in (f24-after.png) is the console
    overlaying the lobby, where the lobby-marker region also reads a clean
    match (score 0) -- i.e. "console open" and "lobby" are not mutually
    exclusive in reality, so a single three-way argmin would report a
    same-score tie instead of the right answer. Giving console_open priority
    sidesteps that, but it has NOT been validated for "console open while in
    shop" (no reference shot for that combination exists in shots/).
    """
    state, c_open, c_closed, c_margin = console_state(img)
    if state == "open" and c_margin >= THRESHOLDS["console_accept"] * THRESHOLDS["gray_margin_ratio"]:
        return ScreenResult(
            name="console_open", score=c_open, margin=c_margin, gray=False,
            scores={"console_open": c_open, "console_closed": c_closed},
        )

    manifest = load_manifest()
    raw = {}
    norm = {}
    for name, d in manifest["screens"].items():
        region = _region_array(img, d["box"])
        s = _mad(region, d["_array"])
        raw[name] = s
        norm[name] = s / THRESHOLDS["screen_accept"]
    # console_open stays in the running as a candidate even when it didn't
    # win outright above, so a low-confidence console reading can still show
    # up as the gray-zone runner-up instead of being silently dropped.
    raw["console_open"] = c_open
    norm["console_open"] = c_open / THRESHOLDS["console_accept"]

    ordered = sorted(norm.items(), key=lambda kv: kv[1])
    best_name, best_norm = ordered[0]
    second_norm = ordered[1][1] if len(ordered) > 1 else None
    margin = (second_norm - best_norm) if second_norm is not None else None

    if best_norm > 1.0:
        return ScreenResult(name="unknown", score=raw[best_name], margin=margin, gray=True, scores=raw)
    gray = margin is not None and margin < THRESHOLDS["gray_margin_ratio"]
    return ScreenResult(name=best_name, score=raw[best_name], margin=margin, gray=gray, scores=raw)


def is_tab_active(img, tab_name):
    """Returns (active: bool, score: float) for a named shop sub-tab region
    (see BUILD_SPEC["tabs"] for the list of tab_name values)."""
    manifest = load_manifest()
    if tab_name not in manifest["tabs"]:
        raise KeyError(f"unknown tab '{tab_name}', known: {sorted(manifest['tabs'])}")
    d = manifest["tabs"][tab_name]
    region = _region_array(img, d["box"])
    score = _mad(region, d["_array"])
    return score <= THRESHOLDS["tab_active_accept"], score


# ---------------------------------------------------------------------------
# build-atlas
# ---------------------------------------------------------------------------
def build_atlas(shots_dir, out_dir=ATLAS_DIR):
    os.makedirs(out_dir, exist_ok=True)
    manifest = {
        "shot_size": list(SHOT_SIZE),
        "client_offset": list(CLIENT_OFFSET),
        "thresholds": THRESHOLDS,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "built_from": {},
        "screens": {},
        "console": {"box": BUILD_SPEC["console"]["box"]},
        "tabs": {},
    }

    def crop_and_save(source, box, out_name):
        src_path = os.path.join(shots_dir, source)
        if not os.path.exists(src_path):
            raise FileNotFoundError(f"reference shot not found: {src_path}")
        im = Image.open(src_path).convert("RGB")
        if im.size != SHOT_SIZE:
            print(f"[WARN] {source} is {im.size}, expected {SHOT_SIZE} -- boxes assume the full window frame")
        crop = im.crop(tuple(box))
        out_path = os.path.join(out_dir, out_name)
        crop.save(out_path)
        return out_name

    for name, d in BUILD_SPEC["screens"].items():
        out_name = f"screen_{name}.png"
        crop_and_save(d["source"], d["box"], out_name)
        manifest["screens"][name] = {"box": d["box"], "crop": out_name}
        manifest["built_from"][f"screen_{name}"] = d["source"]

    c = BUILD_SPEC["console"]
    open_name = crop_and_save(c["open"]["source"], c["box"], "console_open.png")
    closed_name = crop_and_save(c["closed"]["source"], c["box"], "console_closed.png")
    manifest["console"]["open_crop"] = open_name
    manifest["console"]["closed_crop"] = closed_name
    manifest["built_from"]["console_open"] = c["open"]["source"]
    manifest["built_from"]["console_closed"] = c["closed"]["source"]

    for name, d in BUILD_SPEC["tabs"].items():
        out_name = f"tab_{name}.png"
        crop_and_save(d["source"], d["box"], out_name)
        manifest["tabs"][name] = {"box": d["box"], "crop": out_name}
        manifest["built_from"][f"tab_{name}"] = d["source"]

    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")

    global _manifest_cache
    _manifest_cache = None  # force reload next classify() call
    print(f"[OK] atlas written to {out_dir} ({len(manifest['screens'])} screens, "
          f"{len(manifest['tabs'])} tabs, 2 console crops)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_build = sub.add_parser("build-atlas", help="crop reference shots into atlas/ + write manifest.json")
    p_build.add_argument("--shots-dir", required=True, help="dir containing the named reference .png shots")
    p_build.add_argument("--out-dir", default=ATLAS_DIR)

    p_classify = sub.add_parser("classify", help="classify_screen() on one image, print the result")
    p_classify.add_argument("image")

    p_console = sub.add_parser("console", help="console_state() on one image, print the result")
    p_console.add_argument("image")

    p_tab = sub.add_parser("tab", help="is_tab_active() on one image, print the result")
    p_tab.add_argument("image")
    p_tab.add_argument("tab_name")

    args = ap.parse_args()

    if args.cmd == "build-atlas":
        build_atlas(args.shots_dir, args.out_dir)
        return

    if args.cmd == "classify":
        r = classify_screen(args.image)
        print(f"name={r.name} score={r.score:.2f} margin={r.margin} gray={r.gray}")
        print(f"scores={r.scores}")
        return

    if args.cmd == "console":
        state, so, sc, margin = console_state(args.image)
        print(f"state={state} score_open={so:.2f} score_closed={sc:.2f} margin={margin:.2f}")
        return

    if args.cmd == "tab":
        active, score = is_tab_active(args.image, args.tab_name)
        print(f"active={active} score={score:.2f}")
        return


if __name__ == "__main__":
    main()
