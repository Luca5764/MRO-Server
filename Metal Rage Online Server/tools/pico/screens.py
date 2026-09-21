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

# Size gate, added 2026-09-21. Incident: the operator hand-captured a couple
# of real-gameplay screenshots (1602x1232) to use for classifier calibration,
# a different size than shot.sh's SHOT_SIZE above (1616x1239). Every region
# box in this module (PROMPT_BOX, BATTLE_SP_BOX, ACCOUNT_FIELD_BOX, every
# BUILD_SPEC box) is hardcoded in shot.sh's pixel coordinates; feeding those
# boxes a 1602x1232 image reads the wrong pixels instead of erroring. Before
# this gate existed, that produced console_prompt_state()=="unknown", which a
# worker correctly did NOT chase into recalibrating PROMPT_BOX -- but nothing
# stopped a future run from doing exactly that (silent "unknown" looks like
# "this box needs retuning", not "this image is the wrong shape"). PM
# decision: make the size mismatch itself loud instead of relying on every
# caller noticing an "unknown" is suspicious. See _load_image() below.

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
        # Static "帳號"/"密碼" field-label glyphs on the login panel (this
        # task's contract: relaunch trial found a fresh client shows the
        # login screen, not the lobby, right after the real game window
        # appears). Box deliberately stops short of the 帳號 input box itself
        # (x<685) so the blinking text-cursor there never enters this region.
        # MAD against a real post-login lobby capture (shots/after-login2.png,
        # this task): 86.25 for this box, 32.10/43.29 for the lobby/shop boxes
        # read off the login screenshot -- all far past screen_accept(12.0),
        # so login/lobby/shop do not get confused for each other (checked for
        # this task, not assumed).
        "login": {"source": "login-screen.png", "box": [605, 845, 680, 935]},
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
    # Same idea as "console" above, but built from battle-background
    # screenshots. Reusing the lobby crops fails over a battle background
    # (2026-09-19 fullmatch task report: MAD ~43-53 for a battle screenshot
    # against the lobby "open" crop, well past THRESHOLDS["console_accept"])
    # because the console text overlays whatever is behind it -- there is no
    # opaque panel -- and a battle background differs wildly (terrain, not a
    # flat dark lobby backdrop) from the lobby one used to build the "console"
    # crops above. Box is wider than "console" (extends to x=340) to also
    # catch the extra "<name>玩家已進入遊戲。" game-log line that appears one
    # row above the prompt while in battle and is not present in the lobby.
    # Built from two screenshots taken back-to-back in the same spot/round
    # (gc-console.png / ref-05-battle.png), so this has NOT been validated
    # against a moving battle background (character walking, muzzle flashes,
    # weather) -- see this task's report, flagged as an open question.
    "console_battle": {
        "box": [0, 588, 340, 632],
        "open": {"source": "gc-console.png"},
        "closed": {"source": "ref-05-battle.png"},
    },
    "tabs": {
        "shop_main": {"source": "u-20260919-01-01-shop.png", "box": [1165, 255, 1360, 290]},
        "shop_aux": {"source": "u-20260919-01-02-aux.png", "box": [1360, 255, 1610, 290]},
        "shop_equip": {"source": "u-20260919-01-02-equip.png", "box": [1165, 300, 1360, 335]},
        "shop_item": {"source": "u-20260919-01-02-item.png", "box": [1360, 300, 1610, 335]},
        "shop_mshop": {"source": "u-20260919-01-02-mshop.png", "box": [1373, 185, 1610, 235]},
        # Create-room dialog's mode tabs (對戰模式/協力模式/閃電戰 row). Only
        # the two used by create_pve_room are built: pvp is 對戰模式 (the
        # dialog's default-active tab), pve is 協力模式.
        "dialog_pvp": {"source": "ref-01-create.png", "box": [478, 508, 640, 548]},
        "dialog_pve": {"source": "ref-02-create-pve.png", "box": [641, 508, 805, 548]},
    },
    # Single-region "is this thing on screen" markers -- same comparison
    # style as "tabs" (one crop, one box, present/absent), not part of
    # classify_screen's mutually-exclusive screen competition. See
    # detect_marker(). Each entry may set its own "accept" MAD threshold,
    # overriding THRESHOLDS["marker_accept"] -- "battle" does, to stay
    # readable when the console is open on top of the battle HUD (2026-09-19
    # fullmatch task report: battle-with-console-open scores 18.0 against the
    # clean-battle reference at this box, vs >=35 for every non-battle
    # reference shot in the atlas).
    "markers": {
        # RECALIBRATED 2026-09-21 (dual-netspeed B段 4th run): the box below
        # used to be [630, 190, 980, 255], the "遊戲開始(F5)"/"準備(F5)"
        # hexagon banner text -- that text is NOT stable, it reads
        # "遊戲開始(F5)" for the host with nobody else in the room but
        # "準備(F5)" once a second player has joined (host is no longer the
        # only one who can start), so the box's MAD against the
        # single-player reference crop is high for any real 2-player room.
        # Caught because a real B段 run had the joiner plainly standing in
        # the room screen (shots/dual-netspeed-b-22-set_ready-precondition.png)
        # while detect_marker(...,"room") reported present=False, and the
        # SAME run's create_pve_room only passed via the notice_popup
        # fallback, not the room marker itself -- see _room_or_notice_check()
        # below and create_pve_room()'s docstring. This box very likely never
        # matched a real 2-player room in any prior run either; it was only
        # ever checked against its own single-player source screenshot (see
        # the "not yet validated against a live, freshly-captured screenshot"
        # note on THRESHOLDS above).
        #
        # New box: the RED TEAM panel's skull/wing crest graphic, top-left of
        # the room screen, well left of any player name/slot/ready-state text
        # (box stops at x=200, the RED TEAM lettering itself starts further
        # right). Chosen because it is decorative background art for the
        # room's team panel -- not host/ready-state/player-count text -- so it
        # should not vary with who is host, how many players are in, or
        # whether they are ready. Checked (this task) against every
        # 1616x1239 image in shots/ (321 images): all ~41 images that are
        # genuinely a room screen (host alone, host with 2+ players, joiner's
        # own view, various ready states, across many different past
        # experiments' room screenshots including this run's own
        # dual-netspeed-b-17/18/19/21/22) score exactly MAD 0.00 here; every
        # other image (battle, lobby, shop, login, console, results, notice
        # popups, etc.) scores >=41.85 -- a clean gap, no image anywhere in
        # the gray zone between 0 and marker_accept=12.0. Still dims like the
        # old box when a NOTICE popup is up (same whole-screen dim mechanic,
        # see notice_popup below), so _room_or_notice_check()'s fallback is
        # unaffected/still needed for that case.
        "room": {"source": "ref-04-room-clean.png", "box": [30, 240, 200, 270]},
        # F1-F4 skill-point cost panel, top-right of the battle HUD. Static
        # labels/costs, not the live SP/kill counters next to it. accept=22
        # (vs default 12) so it still reads "battle" with the console open on
        # top (see BUILD_SPEC["console_battle"] comment above) and during the
        # transient "YOU WIN" overlay (MAD 2.88-3.85, still mid-battle-frame).
        # NOT map-independent (this task, 2026-09-20): the Escort map
        # (Map_PC02) has a 5th row (F5 憤怒模式) that shifts every row below
        # it down, so this box's fixed y-range stops matching -- MAD 60.47 on
        # shots/esc-04-battle60.png, past accept=22.0. Kept only for
        # `screens.py marker` debugging against the original reference map;
        # actions.py's actual "is the battle HUD up" checks use
        # battle_hud_state() below instead, which does generalize.
        "battle": {"source": "ref-05-battle.png", "box": [1275, 395, 1610, 548], "accept": 22.0},
        # "CAMPAIGN MODE" header of the post-match result/scoreboard screen.
        "result": {"source": "ref-06-end-3.png", "box": [478, 53, 1140, 158]},
        # "創立房間" title bar of the create-room dialog (present regardless
        # of which mode tab is active).
        "create_dialog": {"source": "ref-01-create.png", "box": [478, 453, 1152, 492]},
        # "提 示" (NOTICE) popup title. Built from the lobby's AFK-kick popup
        # (lobby-now.png) but confirmed (this task's report) to also match
        # the room's host-transfer popup (ref-03-room.png, MAD 2.28) -- both
        # popups share the same title bar graphic/position, only the body
        # text differs, so one marker covers both. Confirm button is at the
        # same client coords (798,675) in both observed cases.
        "notice_popup": {"source": "lobby-now.png", "box": [700, 535, 870, 570]},
        # "◎ 選擇地圖" title of the room's map-selection popup (opened by
        # clicking 選擇地圖▼, see actions.py select_map()). Box is the title
        # text only, not the four map-name buttons below it (those move
        # depending on which map is currently selected/highlighted).
        # Measured (this task, 2026-09-20): MAD 0.00 on its own source shot,
        # nearest wrong reference (a battle screenshot) 29.45 -- comfortably
        # past marker_accept=12.0 either way.
        "mapsel": {"source": "esc-01-mapsel.png", "box": [415, 495, 650, 535]},
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
    # Wider box than "console" (see BUILD_SPEC["console_battle"]), so this is
    # not directly comparable to console_accept -- separate constant on
    # purpose. Reference set: correct match 0.00/0.79, nearest wrong 22.23
    # (2026-09-19 fullmatch task report) -- generous headroom either side.
    "console_battle_accept": 8.0,
    # Default for markers.py-style single-region checks (BUILD_SPEC
    # "markers"); individual entries may override via their own "accept" key
    # (see "battle").
    "marker_accept": 12.0,
}


@dataclass
class ScreenResult:
    name: str
    score: float
    margin: float
    gray: bool
    scores: dict = field(default_factory=dict)


class ScreenSizeError(ValueError):
    """Raised by _load_image() when an image is not SHOT_SIZE. Every region
    box in this module is measured in shot.sh's pixel coordinates -- see the
    2026-09-21 comment above SHOT_SIZE for why this must fail loudly instead
    of degrading to console_prompt_state()/classify_screen()-style "unknown"."""


def _load_image(img):
    """Accept either a path or an already-opened PIL Image.

    Hard size gate (2026-09-21, see comment above SHOT_SIZE): every region-
    judgment entry point in this module (classify_screen, console_state,
    is_tab_active, detect_marker via _region_array below, plus
    console_prompt_state/battle_hud_state/account_field_state which call this
    directly) reads fixed pixel boxes measured in shot.sh's window geometry.
    An image of any other size still decodes, but every box in it lands on
    the wrong pixels -- refuse it here, once, instead of letting each caller
    silently degrade to "unknown" or a wrong statistic.
    """
    im = img if isinstance(img, Image.Image) else Image.open(img)
    if im.size != SHOT_SIZE:
        source = img if isinstance(img, str) else (getattr(im, "filename", None) or "<in-memory PIL.Image>")
        raise ScreenSizeError(
            f"screens.py: image size {im.size} != expected SHOT_SIZE {SHOT_SIZE} (source: {source}). "
            "Region boxes here (PROMPT_BOX/BATTLE_SP_BOX/ACCOUNT_FIELD_BOX/BUILD_SPEC boxes) are "
            "hardcoded in tools/win/shot.sh's window-frame pixel coordinates. Likely cause: this "
            "image was not captured by shot.sh (e.g. a manual/hand-cropped screenshot) or the game "
            "window/display resolution changed. Do not recalibrate any box against this image, and "
            "do not treat this as an 'unknown' classification result."
        )
    return im


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
    if "console_battle" in manifest:
        cb = manifest["console_battle"]
        cb["_open_array"] = np.asarray(Image.open(os.path.join(ATLAS_DIR, cb["open_crop"])).convert("RGB"), dtype=np.int16)
        cb["_closed_array"] = np.asarray(Image.open(os.path.join(ATLAS_DIR, cb["closed_crop"])).convert("RGB"), dtype=np.int16)
    for name, d in manifest["tabs"].items():
        d["_array"] = np.asarray(Image.open(os.path.join(ATLAS_DIR, d["crop"])).convert("RGB"), dtype=np.int16)
    for name, d in manifest.get("markers", {}).items():
        d["_array"] = np.asarray(Image.open(os.path.join(ATLAS_DIR, d["crop"])).convert("RGB"), dtype=np.int16)
    _manifest_cache = manifest
    return manifest


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
def console_state(img, variant="lobby"):
    """Returns (state, score_open, score_closed, margin) where state is
    "open" / "closed" / "unknown". margin = |score_open - score_closed|.

    variant selects which reference crops/box to use: "lobby" (default,
    unchanged from before this task -- f24-after.png/f24-closed.png) or
    "battle" (BUILD_SPEC["console_battle"], see its comment for why a
    separate reference set is needed over a battle background)."""
    manifest = load_manifest()
    if variant == "lobby":
        c = manifest["console"]
        accept = THRESHOLDS["console_accept"]
    elif variant == "battle":
        if "console_battle" not in manifest:
            raise KeyError("manifest has no 'console_battle' section -- rebuild the atlas (build-atlas)")
        c = manifest["console_battle"]
        accept = THRESHOLDS["console_battle_accept"]
    else:
        raise ValueError(f"unknown console_state variant '{variant}', expected 'lobby' or 'battle'")
    region = _region_array(img, c["box"])
    score_open = _mad(region, c["_open_array"])
    score_closed = _mad(region, c["_closed_array"])
    margin = abs(score_open - score_closed)
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


def detect_marker(img, name):
    """Returns (present: bool, score: float) for a named single-region marker
    (see BUILD_SPEC["markers"] for the list: room/battle/result/create_dialog/
    notice_popup). Same one-crop-one-box comparison style as is_tab_active --
    not part of classify_screen's mutually-exclusive screen competition, so
    two markers can both read "present" at once (e.g. "room" and
    "notice_popup" right after creating a room, see actions.py)."""
    manifest = load_manifest()
    markers = manifest.get("markers", {})
    if name not in markers:
        raise KeyError(f"unknown marker '{name}', known: {sorted(markers)}")
    d = markers[name]
    region = _region_array(img, d["box"])
    score = _mad(region, d["_array"])
    accept = d.get("accept", THRESHOLDS["marker_accept"])
    return score <= accept, score


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
        "console_battle": {"box": BUILD_SPEC["console_battle"]["box"]},
        "tabs": {},
        "markers": {},
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

    cb = BUILD_SPEC["console_battle"]
    cb_open_name = crop_and_save(cb["open"]["source"], cb["box"], "console_battle_open.png")
    cb_closed_name = crop_and_save(cb["closed"]["source"], cb["box"], "console_battle_closed.png")
    manifest["console_battle"]["open_crop"] = cb_open_name
    manifest["console_battle"]["closed_crop"] = cb_closed_name
    manifest["built_from"]["console_battle_open"] = cb["open"]["source"]
    manifest["built_from"]["console_battle_closed"] = cb["closed"]["source"]

    for name, d in BUILD_SPEC["tabs"].items():
        out_name = f"tab_{name}.png"
        crop_and_save(d["source"], d["box"], out_name)
        manifest["tabs"][name] = {"box": d["box"], "crop": out_name}
        manifest["built_from"][f"tab_{name}"] = d["source"]

    for name, d in BUILD_SPEC["markers"].items():
        out_name = f"marker_{name}.png"
        crop_and_save(d["source"], d["box"], out_name)
        manifest["markers"][name] = {"box": d["box"], "crop": out_name}
        if "accept" in d:
            manifest["markers"][name]["accept"] = d["accept"]
        manifest["built_from"][f"marker_{name}"] = d["source"]

    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")

    global _manifest_cache
    _manifest_cache = None  # force reload next classify() call
    print(f"[OK] atlas written to {out_dir} ({len(manifest['screens'])} screens, "
          f"{len(manifest['tabs'])} tabs, {len(manifest['markers'])} markers, "
          f"2 console crops, 2 console_battle crops)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

# Console prompt "(>" glyph detector (2026-09-19). The console has no backing panel,
# so region MAD against reference crops fails over a moving battle background. The
# prompt glyph itself is always drawn at the same place (shot rows 612-626, cols
# 6-34) in near-white; count near-white pixels there. Measured: open 39-43 px in
# lobby and battle (f24-after, gc-console, gc-r2..r5, live battle), closed 0 on every
# closed reference (f24-closed, ref-05-battle, lobby, room, shop). The system message
# line above (rows ~593-605, e.g. 「玩家已進入遊戲」) is deliberately excluded.
PROMPT_BOX = (6, 612, 34, 627)   # x0, y0, x1, y1 in shot coords
PROMPT_OPEN_MIN = 25
PROMPT_CLOSED_MAX = 5

def console_prompt_state(img):
    """Returns (state, white_px): state "open" / "closed" / "unknown"."""
    a = np.asarray(_load_image(img).convert("RGB"), dtype=np.int16)
    x0, y0, x1, y1 = PROMPT_BOX
    w = int((a[y0:y1, x0:x1].min(axis=2) > 200).sum())
    if w >= PROMPT_OPEN_MIN:
        return "open", w
    if w <= PROMPT_CLOSED_MAX:
        return "closed", w
    return "unknown", w


# Map-independent "is the battle HUD up" detector (2026-09-20, this task).
# BUILD_SPEC["markers"]["battle"] above (a MAD region compare against one
# map's F1-F4 skill-cost panel) does not generalize: the HUD elements here
# have no opaque backing panel (translucent over the 3D scene -- confirmed
# by comparing shots/ref-05-battle.png, Map_PC04, against
# shots/esc-04-battle60.png, the Escort desert map Map_PC02, at this task's
# candidate boxes), so a fixed reference crop's raw pixels do not match
# across maps/terrain either way, on top of the F5-row layout shift noted
# above. Same technique as console_prompt_state() above instead: the SP
# counter ("SP0000", bottom-right of the battle HUD) is always drawn in the
# same screen position and always the same near-pure green, regardless of
# map/terrain -- count green pixels in a fixed box instead of comparing raw
# pixels to one reference. Measured (this task): 6343/6394/6438/6505 green
# px across five battle references spanning two different maps
# (ref-05-battle.png; three GameCampaign-round shots gc-r2/3/4/5.png; the
# Escort desert map esc-04-battle60.png; one of those, gc-console.png, has
# the console open on top of the HUD) vs exactly 0 on every non-battle
# reference shot in shots/ (29 images: login/lobby/shop/room/create/
# result/console-closed) -- see this task's report for the full table.
BATTLE_SP_BOX = (1330, 985, 1600, 1030)  # shot coords, "SP0000" counter
BATTLE_SP_MIN_PX = 3000  # min(battle)=6343, max(non-battle)=0 -- wide margin either side


def battle_hud_state(img):
    """Returns (state, green_px): state "battle" / "not_battle" (see
    BATTLE_SP_BOX's comment above for the measurements). No "unknown" state
    here -- unlike console_prompt_state's PROMPT_OPEN_MIN/PROMPT_CLOSED_MAX
    split, the observed margin (0 vs >=6343) leaves no ambiguous middle
    ground worth a third state."""
    a = np.asarray(_load_image(img).convert("RGB"), dtype=np.int16)
    x0, y0, x1, y1 = BATTLE_SP_BOX
    region = a[y0:y1, x0:x1]
    r, g, b = region[..., 0], region[..., 1], region[..., 2]
    green_px = int(((g > 120) & (g > r + 40) & (g > b + 40)).sum())
    return ("battle" if green_px >= BATTLE_SP_MIN_PX else "not_battle"), green_px


# login_as()'s account-field clear-skip check (actions.py, 2026-09-21 task:
# "login_as clear-field cost reduction" -- a 2026-09-21 A-run logged 24
# DELETEs at ~3.7s/key-invocation, a ~90s input-gap opener). Same "no stored
# reference crop, measure a raw pixel statistic in a fixed box" technique as
# console_prompt_state()/battle_hud_state() above (chosen BECAUSE those two
# already establish it works without an atlas entry) -- NOT a MAD-against-
# reference-crop marker like classify_screen()'s BUILD_SPEC, because no
# reference screenshot of this field (empty OR filled) exists anywhere in
# this repo to build one from (checked for this task: no shots/ dir at all in
# this worktree, atlas/screen_login.png's box stops at x<685, short of the
# input box itself).
#
# 🟡 [GUESS], UNCALIBRATED against a real screenshot: box below is estimated
# from two already-measured constants, not a fresh measurement -- (1)
# BUILD_SPEC["screens"]["login"]'s box [605,845,680,935], whose own comment
# says it "stops short of the 帳號 input box itself (x<685) so the blinking
# text-cursor there never enters this region", i.e. the field starts at
# shot-x>=685; (2) LOGIN_ACCOUNT_FIELD's click point, actions.py's client
# (777,829) -> shot (785,860) (client+CLIENT_OFFSET), taken as the field's
# vertical center. Width/height are a plausible single-line-textbox guess,
# NOT click-tested or screenshot-verified for this task (no client/shots
# available in this worktree) -- flag for the next live run to confirm with
# `python3 screens.py field <shot.png>` before trusting it. Deliberately
# fails toward "has_text" (see account_field_state()'s docstring) so a wrong
# guess here only ever costs the full clear it would have cost anyway, never
# skips a clear that was actually needed (contract's hard rule: "不可以假設
# 欄位是空的").
ACCOUNT_FIELD_BOX = (686, 847, 900, 873)  # shot coords, x0,y0,x1,y1
# Empty field = a flat UI fill (near-zero variance, same reasoning as
# console_prompt_state's near-white-pixel-count vs battle_hud_state's
# green-pixel-count: pick a raw statistic that is near-zero/near-uniform in
# the "nothing here" case and clearly not in the "something here" case).
# Text glyphs -- of ANY color, unlike battle_hud_state's fixed green -- create
# high local contrast (glyph edges against the fill), which raw grayscale
# std-dev picks up regardless of the field's actual theme colors, so this
# does not need the exact fill/text colors calibrated, only the cutoff below.
# 🟡 [GUESS]: threshold has no live measurement behind it (see box comment
# above) -- picked only as "clearly above PNG/compression noise on a flat
# fill, clearly below one visible glyph's edge contrast".
ACCOUNT_FIELD_EMPTY_STDDEV_MAX = 3.0


def account_field_state(img):
    """Returns (state, stddev): state "empty" / "has_text" for the login
    screen's 帳號 field (ACCOUNT_FIELD_BOX). No "unknown" state -- same
    reasoning as battle_hud_state() above, a single statistic vs one cutoff
    has no natural third bucket; callers that want a fail-safe default
    should treat anything that isn't a confident "empty" as "has_text" (see
    ACCOUNT_FIELD_BOX's comment for why "has_text" is the safe direction to
    fail towards)."""
    a = np.asarray(_load_image(img).convert("L"), dtype=np.float64)
    x0, y0, x1, y1 = ACCOUNT_FIELD_BOX
    sd = float(a[y0:y1, x0:x1].std())
    return ("empty" if sd <= ACCOUNT_FIELD_EMPTY_STDDEV_MAX else "has_text"), sd


# login_as()'s 2026-09-21 "click landed in the wrong field" fix (actions.py
# _confirm_account_focus()): a real dual-netspeed-c run had CLICK_AT
# (LOGIN_ACCOUNT_FIELD) actually leave focus on 密碼 instead -- the account
# name got typed into 密碼 (masked) and the dummy password ended up in 帳號
# after a TAB wraparound, and the server correctly rejected the resulting
# login ("無法接受認證"). [SHOT] this task:
# shots/dual-netspeed-c-06-login_as-lobby-4.png. login_cq(0x00110151) had
# still been SENT in that run -- wait_for_log_pkts() alone cannot tell a
# correct login from a swapped one, only the screen can.
#
# account_field_state()/ACCOUNT_FIELD_BOX above cannot double as this check:
# [TEST] this task, measured against 8 real login_as-screen-N shots (taken
# BEFORE any input, across the dual-netspeed-a/b/c runs) -- ACCOUNT_FIELD_BOX's
# own "untouched" stddev ranged 4.89-20.14 (it commonly carries leftover text
# from a PREVIOUS login_as() attempt on the same instance, account_field_
# state()'s entire reason for existing), so a wrong reading there cannot be
# told apart from "the click actually worked, there's just old text".
#
# PASSWORD_FIELD_BOX has no such problem: the SAME 8 shots all read EXACTLY
# 3.98 (bit-identical, not just "close" -- these are raw PNG framebuffer
# captures, not lossy video, so unchanged content reads pixel-identical), and
# 24.03 on the one real failure shot where the account name landed there
# instead (masked as 11 '#' glyphs). Box mirrors ACCOUNT_FIELD_BOX, shifted
# down by the measured 54px row gap (column-profiled dark bands at x=750:
# 帳號 y=846..878, 密碼 y=900..933, both x=686..900 -- same x range as
# ACCOUNT_FIELD_BOX, which was itself derived from LOGIN_ACCOUNT_FIELD's
# click point per that box's own comment).
PASSWORD_FIELD_BOX = (686, 901, 900, 927)  # shot coords, x0,y0,x1,y1
# 🟡 threshold: comfortable margin above the measured-constant 3.98 baseline,
# comfortably below the measured 24.03 contaminated reading -- picked the
# same way ACCOUNT_FIELD_EMPTY_STDDEV_MAX was ("clearly above noise, clearly
# below one visible glyph's contrast"), not a calibration sweep.
PASSWORD_FIELD_FLAT_STDDEV_MAX = 8.0


def password_field_state(img):
    """Returns (state, stddev): state "flat" / "has_text" for the login
    screen's 密碼 field (PASSWORD_FIELD_BOX) -- see that box's comment above
    for why this, not account_field_state()/ACCOUNT_FIELD_BOX, is the signal
    login_as()'s _confirm_account_focus() (actions.py) uses. This function
    alone only proves "as of THIS ONE screenshot, 密碼 looks untouched" --
    on an attempt==1 retry within the SAME login_as() call, 密碼 already
    holds attempt 0's dummy password by design (LOGIN_DUMMY_PASSWORD is
    typed into it every attempt), so it will legitimately read "has_text"
    there even when nothing is wrong. _confirm_account_focus() compares this
    function's stddev BEFORE vs AFTER its own probe keystroke (a delta, not
    this function's absolute state) for exactly that reason -- this function
    itself is provided mainly for the "does a fresh/untouched login screen
    read flat here" case (verified directly against a real failure shot and
    real untouched shots, see the box's comment) and for `screens.py field`
    CLI-style spot checks, matching account_field_state()'s own shape."""
    a = np.asarray(_load_image(img).convert("L"), dtype=np.float64)
    x0, y0, x1, y1 = PASSWORD_FIELD_BOX
    sd = float(a[y0:y1, x0:x1].std())
    return ("flat" if sd <= PASSWORD_FIELD_FLAT_STDDEV_MAX else "has_text"), sd


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
    p_console.add_argument("--variant", default="lobby", choices=["lobby", "battle"])

    p_tab = sub.add_parser("tab", help="is_tab_active() on one image, print the result")
    p_tab.add_argument("image")
    p_tab.add_argument("tab_name")

    p_marker = sub.add_parser("marker", help="detect_marker() on one image, print the result")
    p_marker.add_argument("image")
    p_marker.add_argument("marker_name")

    p_battle = sub.add_parser("battle-hud", help="battle_hud_state() on one image, print the result")
    p_battle.add_argument("image")

    p_field = sub.add_parser("field", help="account_field_state() on one image, print the result")
    p_field.add_argument("image")

    p_pwfield = sub.add_parser("pwfield", help="password_field_state() on one image, print the result")
    p_pwfield.add_argument("image")

    args = ap.parse_args()

    try:
        _cli_dispatch(args)
    except ScreenSizeError as e:
        # Loud, deliberate failure (2026-09-21, see comment above SHOT_SIZE /
        # _load_image): every CLI subcommand below that takes an <image>
        # argument judges a fixed shot-space region, so a wrong-sized image
        # must not print a normal-looking "unknown" result.
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


def _cli_dispatch(args):
    if args.cmd == "build-atlas":
        build_atlas(args.shots_dir, args.out_dir)
        return

    if args.cmd == "classify":
        r = classify_screen(args.image)
        print(f"name={r.name} score={r.score:.2f} margin={r.margin} gray={r.gray}")
        print(f"scores={r.scores}")
        return

    if args.cmd == "console":
        state, so, sc, margin = console_state(args.image, variant=args.variant)
        print(f"variant={args.variant} state={state} score_open={so:.2f} score_closed={sc:.2f} margin={margin:.2f}")
        return

    if args.cmd == "tab":
        active, score = is_tab_active(args.image, args.tab_name)
        print(f"active={active} score={score:.2f}")
        return

    if args.cmd == "marker":
        present, score = detect_marker(args.image, args.marker_name)
        print(f"present={present} score={score:.2f}")
        return

    if args.cmd == "battle-hud":
        state, green_px = battle_hud_state(args.image)
        print(f"state={state} green_px={green_px}")
        return

    if args.cmd == "field":
        state, sd = account_field_state(args.image)
        print(f"state={state} stddev={sd:.2f}")
        return

    if args.cmd == "pwfield":
        state, sd = password_field_state(args.image)
        print(f"state={state} stddev={sd:.2f}")
        return


if __name__ == "__main__":
    main()
