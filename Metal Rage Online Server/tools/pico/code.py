"""
Raspberry Pi Pico 2 W - Hardware USB HID Controller for Metal Rage Online Testing
=================================================================================
Presents physical USB Keyboard + Mouse to Windows host, eliminating anti-cheat /
DirectInput injection blocks (LLKHF_INJECTED).

Receives commands via:
  1. WiFi HTTP REST API (port 8080 by default, configured via settings.toml)
  2. USB CDC Serial (COM port, 115200 baud)

Author: mro-reverse testing harness
"""

import gc
import os
import sys
import time
import microcontroller
import supervisor
import usb_hid
from watchdog import WatchDogMode

from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode
from adafruit_hid.mouse import Mouse

# Cap on how long a single PRESS can hold a key, and how often long operations
# (PRESS hold, TYPE) feed the watchdog while they sleep. A hung command (or a
# runaway loop) resets the board within WATCHDOG_TIMEOUT_S instead of leaving a
# key/button stuck down indefinitely with nobody watching the screen.
MAX_PRESS_MS = 5000
WATCHDOG_TIMEOUT_S = 8
WATCHDOG_FEED_INTERVAL_S = 0.2

# ---------------------------------------------------------------------------
# Hardware watchdog: resets the board if the main loop (or a command handler)
# stops feeding it, e.g. a firmware hang while unattended.
# ---------------------------------------------------------------------------
wdt = None
try:
    wdt = microcontroller.watchdog
    wdt.timeout = WATCHDOG_TIMEOUT_S
    wdt.mode = WatchDogMode.RESET
    print(f"[WDT] Hardware watchdog enabled ({WATCHDOG_TIMEOUT_S}s timeout, RESET mode).")
except Exception as e:
    print(f"[WDT] Unable to enable watchdog: {e}")
    wdt = None

def feed_watchdog():
    if wdt is not None:
        try:
            wdt.feed()
        except Exception:
            pass

def sleep_and_feed(duration_s):
    """time.sleep() that feeds the watchdog in chunks, so a long PRESS hold or a
    long TYPE doesn't starve it and trigger an unwanted reset."""
    remaining = duration_s
    while remaining > 0:
        chunk = min(remaining, WATCHDOG_FEED_INTERVAL_S)
        time.sleep(chunk)
        feed_watchdog()
        remaining -= chunk

# ---------------------------------------------------------------------------
# Keycode Lookup Table
# ---------------------------------------------------------------------------
KEY_MAP = {
    # Function keys
    "F1": Keycode.F1, "F2": Keycode.F2, "F3": Keycode.F3, "F4": Keycode.F4,
    "F5": Keycode.F5, "F6": Keycode.F6, "F7": Keycode.F7, "F8": Keycode.F8,
    "F9": Keycode.F9, "F10": Keycode.F10, "F11": Keycode.F11, "F12": Keycode.F12,
    # F13-F24: F24 is the MetalRage console hotkey (ConsoleHotKey=135=IK_F24), which
    # ordinary keyboards can't press.
    "F13": Keycode.F13, "F14": Keycode.F14, "F15": Keycode.F15, "F16": Keycode.F16,
    "F17": Keycode.F17, "F18": Keycode.F18, "F19": Keycode.F19, "F20": Keycode.F20,
    "F21": Keycode.F21, "F22": Keycode.F22, "F23": Keycode.F23, "F24": Keycode.F24,
    # Navigation / Control
    "ENTER": Keycode.ENTER, "RETURN": Keycode.RETURN, "ESC": Keycode.ESCAPE,
    "ESCAPE": Keycode.ESCAPE, "TAB": Keycode.TAB, "SPACE": Keycode.SPACE,
    "BACKSPACE": Keycode.BACKSPACE, "DELETE": Keycode.DELETE,
    "UP": Keycode.UP_ARROW, "DOWN": Keycode.DOWN_ARROW,
    "LEFT": Keycode.LEFT_ARROW, "RIGHT": Keycode.RIGHT_ARROW,
    "HOME": Keycode.HOME, "END": Keycode.END,
    "PAGE_UP": Keycode.PAGE_UP, "PAGE_DOWN": Keycode.PAGE_DOWN,
    "CAPS_LOCK": Keycode.CAPS_LOCK,
    # Punctuation (some clients drop these when typed at full speed; PRESS them)
    "MINUS": Keycode.MINUS, "PERIOD": Keycode.PERIOD, "COMMA": Keycode.COMMA,
    "SLASH": Keycode.FORWARD_SLASH, "EQUALS": Keycode.EQUALS,
    # Modifiers
    "SHIFT": Keycode.LEFT_SHIFT, "LSHIFT": Keycode.LEFT_SHIFT, "RSHIFT": Keycode.RIGHT_SHIFT,
    "CTRL": Keycode.LEFT_CONTROL, "LCTRL": Keycode.LEFT_CONTROL, "RCTRL": Keycode.RIGHT_CONTROL,
    "ALT": Keycode.LEFT_ALT, "LALT": Keycode.LEFT_ALT, "RALT": Keycode.RIGHT_ALT,
}

# Add standard A-Z, 0-9
for char_code in range(ord('A'), ord('Z') + 1):
    char = chr(char_code)
    KEY_MAP[char] = getattr(Keycode, char)
    KEY_MAP[char.lower()] = getattr(Keycode, char)

for num in range(10):
    attr = f"N{num}" if num != 0 else "ZERO"  # Keycode.ZERO or Keycode.ONE etc.
    # Adafruit hid uses ONE, TWO, etc.
    names = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"]
    KEY_MAP[str(num)] = getattr(Keycode, names[num])

# ---------------------------------------------------------------------------
# Initialize USB HID
# ---------------------------------------------------------------------------
kbd = None
mouse = None

try:
    kbd = Keyboard(usb_hid.devices)
    mouse = Mouse(usb_hid.devices)
    print("[HID] Initialized physical USB Keyboard and Mouse.")
except Exception as e:
    print(f"[HID] Error initializing USB HID devices: {e}")

# ---------------------------------------------------------------------------
# Scroll Lock -> F24 (the operator's own console key)
# ---------------------------------------------------------------------------
# The client's console hotkey is IK_F24 and ConsoleHotKey is not a config
# variable, so it cannot be moved to a key that exists on a real keyboard. The
# client also ignores software-injected keys, so an AutoHotkey-style remap does
# not work either -- F24 has to come from real USB hardware, which is what this
# board is.
#
# That left the operator unable to open the console without asking the lead to
# send a keystroke from WSL, which needs the game in the foreground and takes a
# few seconds per press -- useless in the middle of a match.
#
# A USB host mirrors the keyboard LED state to every attached keyboard, so when
# the operator presses Scroll Lock on their own keyboard, this board is told
# about it. One physical key press on their keyboard, one real F24 keystroke out
# of this board. Nothing is injected and no key is remapped system-wide.
#
# Either edge counts: Scroll Lock is a toggle, so turning it on and turning it
# off are both "the operator pressed the key".
LED_SCROLL_LOCK = 0x04
HOTKEY_KEYCODE = "F24"

hotkey_enabled = True
_last_scroll_led = None


def poll_led_hotkey():
    global _last_scroll_led

    if kbd is None:
        return

    try:
        scroll = kbd.led_status[0] & LED_SCROLL_LOCK
    except Exception:
        return  # host has not sent a report yet, or the HID device went away

    if _last_scroll_led is None:
        _last_scroll_led = scroll  # first reading is the baseline, not a press
        return

    if scroll == _last_scroll_led:
        return

    _last_scroll_led = scroll

    if not hotkey_enabled:
        return

    ok, _used_ms = key_press(HOTKEY_KEYCODE)
    print(f"[HOTKEY] scroll-lock -> {HOTKEY_KEYCODE} ({'ok' if ok else 'FAILED'})")

# ---------------------------------------------------------------------------
# Mouse & Keyboard Dispatcher
# ---------------------------------------------------------------------------
def parse_key(key_name):
    clean = key_name.strip().upper().replace("{", "").replace("}", "")
    return KEY_MAP.get(clean, None)

def mouse_click(button="left"):
    if not mouse:
        return
    btn = Mouse.LEFT_BUTTON
    b = button.lower()
    if b == "right":
        btn = Mouse.RIGHT_BUTTON
    elif b == "middle":
        btn = Mouse.MIDDLE_BUTTON
    mouse.click(btn)

def mouse_move(dx, dy):
    if not mouse:
        return
    # Clamp in steps of 100 to avoid USB HID report overflow (-127 to +127)
    step_x = 100 if dx > 0 else -100
    step_y = 100 if dy > 0 else -100

    rem_x = dx
    rem_y = dy

    while rem_x != 0 or rem_y != 0:
        move_x = step_x if abs(rem_x) >= 100 else rem_x
        move_y = step_y if abs(rem_y) >= 100 else rem_y
        mouse.move(x=move_x, y=move_y)
        rem_x -= move_x
        rem_y -= move_y
        time.sleep(0.005)

def mouse_move_to(target_x, target_y):
    """
    Home the cursor to (0, 0) by pushing top-left boundary,
    then step forward to (target_x, target_y).
    """
    if not mouse:
        return
    # Force cursor to (0,0) by moving -120 30 times
    for _ in range(30):
        mouse.move(x=-120, y=-120)
        time.sleep(0.002)
    time.sleep(0.02)
    # Move forward to target
    mouse_move(target_x, target_y)

def key_press(key_name, duration_ms=50):
    """Returns (ok, used_duration_ms). duration_ms is clamped to MAX_PRESS_MS and
    the hold is slept in small chunks so the watchdog keeps getting fed."""
    if not kbd:
        return False, duration_ms
    kc = parse_key(key_name)
    if kc is None:
        return False, duration_ms
    used_ms = min(duration_ms, MAX_PRESS_MS)
    kbd.press(kc)
    try:
        sleep_and_feed(used_ms / 1000.0)
    finally:
        kbd.release(kc)
    return True, used_ms

# Punctuation for type_text: char -> (keycode, needs_shift). Without this table
# type_text silently dropped every symbol (2026-09-20: "SPMaxUP_BD" arrived in the
# client console as "SPMaxUPBD", which is why underscore commands looked unusable).
CHAR_MAP = {
    '-': (Keycode.MINUS, False), '_': (Keycode.MINUS, True),
    '=': (Keycode.EQUALS, False), '+': (Keycode.EQUALS, True),
    '.': (Keycode.PERIOD, False), '>': (Keycode.PERIOD, True),
    ',': (Keycode.COMMA, False), '<': (Keycode.COMMA, True),
    '/': (Keycode.FORWARD_SLASH, False), '?': (Keycode.FORWARD_SLASH, True),
    ';': (Keycode.SEMICOLON, False), ':': (Keycode.SEMICOLON, True),
    "'": (Keycode.QUOTE, False), '"': (Keycode.QUOTE, True),
    '[': (Keycode.LEFT_BRACKET, False), '{': (Keycode.LEFT_BRACKET, True),
    ']': (Keycode.RIGHT_BRACKET, False), '}': (Keycode.RIGHT_BRACKET, True),
    '\\': (Keycode.BACKSLASH, False), '|': (Keycode.BACKSLASH, True),
    '`': (Keycode.GRAVE_ACCENT, False), '~': (Keycode.GRAVE_ACCENT, True),
    '!': (Keycode.ONE, True), '@': (Keycode.TWO, True), '#': (Keycode.THREE, True),
    '$': (Keycode.FOUR, True), '%': (Keycode.FIVE, True), '^': (Keycode.SIX, True),
    '&': (Keycode.SEVEN, True), '*': (Keycode.EIGHT, True),
    '(': (Keycode.NINE, True), ')': (Keycode.ZERO, True),
}

# Hold each key ~40 ms: the game reads the keyboard through DirectInput and polls
# per frame, so a press+release inside one frame can be missed (2026-09-20: a held
# 150 ms MINUS registered in the console when the same key typed at full speed did
# not reach it).
TYPE_HOLD_S = 0.04

def type_text(text):
    if not kbd:
        return
    for ch in text:
        shift = False
        kc = None
        if ch == ' ':
            kc = Keycode.SPACE
        elif ch in CHAR_MAP:
            kc, shift = CHAR_MAP[ch]
        elif ch.upper() in KEY_MAP:
            kc = KEY_MAP[ch.upper()]
            shift = ch.isupper()
        if kc is not None:
            if shift:
                kbd.press(Keycode.LEFT_SHIFT)
            kbd.press(kc)
            time.sleep(TYPE_HOLD_S)
            kbd.release_all()
        feed_watchdog()
        time.sleep(0.02)

def release_all():
    if kbd:
        kbd.release_all()
    if mouse:
        mouse.release_all()

# ---------------------------------------------------------------------------
# Command Executor
# ---------------------------------------------------------------------------
def execute_command(cmd_str):
    """
    Parse and run a single command string.
    Returns: (status_code, response_text)
    """
    parts = cmd_str.strip().split()
    if not parts:
        return 200, "OK (empty)"

    action = parts[0].upper()

    try:
        if action == "PING":
            mem = gc.mem_free()
            return 200, f"PONG uptime={time.monotonic():.1f}s mem_free={mem}B"

        elif action == "CLICK":
            btn = parts[1] if len(parts) > 1 else "left"
            mouse_click(btn)
            return 200, f"CLICK {btn}"

        elif action == "MOVE":
            if len(parts) < 3:
                return 400, "ERR: MOVE requires dx dy"
            dx = int(parts[1])
            dy = int(parts[2])
            mouse_move(dx, dy)
            return 200, f"MOVE {dx} {dy}"

        elif action == "MOVE_TO":
            if len(parts) < 3:
                return 400, "ERR: MOVE_TO requires x y"
            x = int(parts[1])
            y = int(parts[2])
            mouse_move_to(x, y)
            return 200, f"MOVE_TO {x} {y}"

        elif action == "KEY":
            if len(parts) < 2:
                return 400, "ERR: KEY requires keyname"
            k = parts[1]
            ok, _used_ms = key_press(k)
            if ok:
                return 200, f"KEY {k}"
            else:
                return 400, f"ERR: Unknown key '{k}'"

        elif action == "PRESS":
            if len(parts) < 3:
                return 400, "ERR: PRESS requires keyname duration_ms"
            k = parts[1]
            dur = int(parts[2])
            ok, used_ms = key_press(k, dur)
            if ok:
                note = "" if used_ms == dur else f" (capped from {dur}ms)"
                return 200, f"PRESS {k} {used_ms}ms{note}"
            else:
                return 400, f"ERR: Unknown key '{k}'"

        elif action == "TYPE":
            text = cmd_str.strip()[5:].strip()  # take rest of string
            type_text(text)
            return 200, f"TYPE len={len(text)}"

        elif action == "RESET":
            release_all()
            return 200, "RESET released all keys"

        elif action == "HOTKEY":
            # HOTKEY [ON|OFF|STATUS] -- the Scroll Lock -> F24 watcher above.
            global hotkey_enabled
            arg = parts[1].upper() if len(parts) > 1 else "STATUS"
            if arg == "ON":
                hotkey_enabled = True
            elif arg == "OFF":
                hotkey_enabled = False
            elif arg != "STATUS":
                return 400, "ERR: HOTKEY takes ON, OFF or STATUS"
            return 200, f"HOTKEY {'ON' if hotkey_enabled else 'OFF'} (scroll-lock -> {HOTKEY_KEYCODE})"

        else:
            return 400, f"ERR: Unknown action '{action}'"

    except Exception as ex:
        return 500, f"ERR: {ex}"

    finally:
        # Belt-and-suspenders: release every key/button after every command (not
        # just on exception). Cheap, and this runs unattended, so nothing should
        # ever end up stuck pressed between commands.
        release_all()

# ---------------------------------------------------------------------------
# WiFi Setup (Optional, graceful fallback)
# ---------------------------------------------------------------------------
wifi_ip = None
http_server = None

def setup_wifi():
    global wifi_ip, http_server
    ssid = os.getenv("WIFI_SSID")
    pwd = os.getenv("WIFI_PASSWORD")
    port = int(os.getenv("HTTP_PORT", "8080"))

    if not ssid:
        print("[WIFI] No WIFI_SSID in settings.toml; skipping WiFi initialization.")
        return

    try:
        import wifi
        import socketpool

        print(f"[WIFI] Connecting to '{ssid}'...")
        wifi.radio.connect(ssid, pwd)
        wifi_ip = str(wifi.radio.ipv4_address)
        print(f"[WIFI] Connected! IP: {wifi_ip}, HTTP port: {port}")

        pool = socketpool.SocketPool(wifi.radio)
        http_server = pool.socket(pool.AF_INET, pool.SOCK_STREAM)
        http_server.setblocking(False)
        http_server.bind(('0.0.0.0', port))
        http_server.listen(2)
        print(f"[HTTP] REST API listening on http://{wifi_ip}:{port}/")

    except Exception as e:
        print(f"[WIFI] Failed to initialize WiFi/HTTP: {e}")
        wifi_ip = None
        http_server = None

# ---------------------------------------------------------------------------
# Main Event Loop
# ---------------------------------------------------------------------------
def main():
    setup_wifi()
    print("[RUN] Pico 2 W ready. Awaiting commands via USB Serial or WiFi HTTP...")

    serial_buf = ""

    while True:
        feed_watchdog()

        # 0. The operator's own Scroll Lock press (see poll_led_hotkey).
        poll_led_hotkey()

        # 1. Process USB Serial
        if supervisor.runtime.serial_bytes_available:
            ch = sys.stdin.read(1)
            if ch in ('\r', '\n'):
                if serial_buf.strip():
                    code, resp = execute_command(serial_buf)
                    sys.stdout.write(f"[{code}] {resp}\n")
                    serial_buf = ""
            else:
                serial_buf += ch

        # 2. Process WiFi HTTP Request (Non-blocking)
        if http_server:
            try:
                conn, addr = http_server.accept()
                conn.setblocking(True)
                req_bytes = conn.recv(1024)
                req_text = req_bytes.decode('utf-8', 'ignore')

                # Extract request line, e.g. "GET /cmd?c=KEY+F5 HTTP/1.1" or "POST /action"
                lines = req_text.split('\r\n')
                if lines:
                    first_line = lines[0]
                    parts = first_line.split()
                    cmd_to_run = None

                    if len(parts) >= 2:
                        path = parts[1]
                        if path == "/ping":
                            cmd_to_run = "PING"
                        elif path.startswith("/api/"):
                            cmd_to_run = path[5:].replace("+", " ").replace("%20", " ")
                        elif "c=" in path:
                            param = path.split("c=")[1].split("&")[0]
                            cmd_to_run = param.replace("+", " ").replace("%20", " ")

                    # Check for POST body if not found in query string
                    if not cmd_to_run and len(parts) >= 2 and parts[0] == "POST":
                        # Body is after \r\n\r\n
                        if '\r\n\r\n' in req_text:
                            body = req_text.split('\r\n\r\n', 1)[1].strip()
                            if body:
                                cmd_to_run = body

                    if cmd_to_run:
                        status, msg = execute_command(cmd_to_run)
                    else:
                        status, msg = 200, f"Pico 2 W Online. IP={wifi_ip}"

                    http_resp = (
                        f"HTTP/1.1 {status} OK\r\n"
                        "Content-Type: text/plain\r\n"
                        "Access-Control-Allow-Origin: *\r\n"
                        f"Content-Length: {len(msg)}\r\n"
                        "Connection: close\r\n\r\n"
                        f"{msg}"
                    )
                    conn.send(http_resp.encode('utf-8'))
                conn.close()

            except OSError:
                # No incoming connection (EAGAIN)
                pass
            except Exception as ex:
                print(f"[HTTP] Error handling request: {ex}")

        time.sleep(0.005)

if __name__ == "__main__":
    main()

