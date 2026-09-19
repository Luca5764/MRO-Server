#!/usr/bin/env python3
"""
pico_ctl.py - Host CLI and Controller for Raspberry Pi Pico 2 W Hardware HID

Transport defaults to USB serial (PICO_TRANSPORT=serial). Set PICO_TRANSPORT=http
to use the WiFi REST API instead (requires set_ip first).

Usage:
  ./pico_ctl.py ping                        # Test connection and latency
  ./pico_ctl.py key F5                      # Press F5 (Ready / Start)
  ./pico_ctl.py key ENTER                   # Press Enter (Login)
  ./pico_ctl.py press W 1500                # Hold W for 1.5 seconds (walk)
  ./pico_ctl.py click [left|right]          # Click mouse button
  ./pico_ctl.py win_click 512,300           # Click client window-relative coords
  ./pico_ctl.py move 100 50                 # Relative mouse move
  ./pico_ctl.py type "Hello World"          # Type text via keyboard
  ./pico_ctl.py batch "PING" "KEY F5"       # Send several raw commands in one call
  ./pico_ctl.py set_port COM6               # Save serial port (else auto-detected)
  ./pico_ctl.py set_ip 192.168.1.50         # Save Pico's WiFi IP (http transport only)

Env vars:
  PICO_TRANSPORT   serial (default) or http
  PICO_PORT        Windows COM port for serial transport (else auto-detected /
                    cached in .pico_port)
  PICO_IP          Pico WiFi IP for http transport (else cached in .pico_ip)
"""

import os
import re
import sys
import time
import subprocess
import urllib.request
import urllib.error
import urllib.parse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IP_CACHE_FILE = os.path.join(SCRIPT_DIR, ".pico_ip")
PORT_CACHE_FILE = os.path.join(SCRIPT_DIR, ".pico_port")
PS_PATH = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
SCREEN_PS1 = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "win", "screen.ps1"))
PICO_SERIAL_PS1 = os.path.join(SCRIPT_DIR, "pico_serial.ps1")
WIN_PICO_SERIAL_PS1_LOCAL = "/mnt/c/Users/su200/mro-pico-serial.ps1"
WIN_PICO_SERIAL_PS1_PATH = "C:\\Users\\su200\\mro-pico-serial.ps1"

def get_pico_ip():
    # 1. Environment variable
    env_ip = os.environ.get("PICO_IP")
    if env_ip:
        return env_ip.strip()
    # 2. Cached file
    if os.path.exists(IP_CACHE_FILE):
        try:
            with open(IP_CACHE_FILE, "r", encoding="utf-8") as f:
                ip = f.read().strip()
                if ip:
                    return ip
        except Exception:
            pass
    return None

def set_pico_ip(ip):
    with open(IP_CACHE_FILE, "w", encoding="utf-8") as f:
        f.write(ip.strip() + "\n")
    print(f"[PICO] Saved IP address '{ip.strip()}' to {IP_CACHE_FILE}")

def get_pico_port():
    # 1. Environment variable
    env_port = os.environ.get("PICO_PORT")
    if env_port:
        return env_port.strip()
    # 2. Cached file
    if os.path.exists(PORT_CACHE_FILE):
        try:
            with open(PORT_CACHE_FILE, "r", encoding="utf-8") as f:
                p = f.read().strip()
                if p:
                    return p
        except Exception:
            pass
    # 3. None -> pico_serial.ps1 auto-detects by PNPDeviceID
    return None

def set_pico_port(port):
    with open(PORT_CACHE_FILE, "w", encoding="utf-8") as f:
        f.write(port.strip() + "\n")
    print(f"[PICO] Saved serial port '{port.strip()}' to {PORT_CACHE_FILE}")

def get_transport():
    return os.environ.get("PICO_TRANSPORT", "serial").strip().lower()

def run_serial_commands(commands, port=None, timeout=30.0):
    """
    Send one or more raw firmware command lines over USB serial in a single
    powershell.exe invocation (see pico_serial.ps1). Returns (replies, elapsed_ms)
    where replies[i] is the raw "[code] msg" reply line for commands[i], or
    "[ERR-TIMEOUT] <cmd>" if that command didn't get a reply in time.
    """
    if not os.path.exists(PS_PATH):
        print("[ERR] powershell.exe not found; is this running under WSL with Windows accessible?")
        sys.exit(1)

    try:
        subprocess.run(["cp", PICO_SERIAL_PS1, WIN_PICO_SERIAL_PS1_LOCAL], check=True, capture_output=True)
    except Exception as ex:
        print(f"[ERR] Unable to copy pico_serial.ps1 to Windows: {ex}")
        sys.exit(1)

    cmd = [PS_PATH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", WIN_PICO_SERIAL_PS1_PATH]
    pico_port = port or get_pico_port()
    if pico_port:
        cmd += ["-Port", pico_port]
    cmd += list(commands)

    t0 = time.monotonic()
    try:
        # PowerShell error streams (Write-Error) come out in the console's active
        # codepage, not necessarily UTF-8 (e.g. cp950 on a Traditional Chinese
        # Windows install); don't let that crash the whole command.
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        print(f"[ERR] pico_serial.ps1 timed out after {timeout}s")
        sys.exit(1)
    elapsed_ms = (time.monotonic() - t0) * 1000

    for line in res.stderr.splitlines():
        if line.strip():
            print(f"[pico_serial] {line.strip()}")

    replies = [l.strip() for l in res.stdout.splitlines() if l.strip()]
    if res.returncode not in (0, 1):
        # 1 = at least one command timed out (still has partial replies); anything
        # else means the script itself failed (bad port, couldn't open, etc).
        print(f"[ERR] pico_serial.ps1 exited {res.returncode}: {replies if replies else '(no output)'}")
        sys.exit(1)
    if len(replies) != len(commands):
        print(f"[WARN] Expected {len(commands)} replies from Pico, got {len(replies)}: {replies}")

    return replies, elapsed_ms

def send_serial_cmd(cmd_str, timeout=30.0):
    replies, elapsed_ms = run_serial_commands([cmd_str], timeout=timeout)
    if not replies:
        print("[ERR] No reply from Pico over serial.")
        sys.exit(1)
    reply = replies[0]
    if reply.startswith("[ERR-TIMEOUT]"):
        print(f"[ERR] Serial command timed out waiting for reply: {cmd_str}")
        sys.exit(1)
    m = re.match(r'^\[(\d+)\]\s?(.*)$', reply)
    if m:
        return m.group(2), elapsed_ms
    return reply, elapsed_ms

def send_cmd(cmd_str, ip=None, port=8080, timeout=3.0):
    """Dispatch a raw firmware command over the configured transport (PICO_TRANSPORT)."""
    transport = get_transport()
    if transport == "http":
        return send_http_cmd(cmd_str, ip=ip, port=port, timeout=timeout)
    elif transport == "serial":
        return send_serial_cmd(cmd_str)
    else:
        print(f"[ERR] Unknown PICO_TRANSPORT '{transport}' (expected 'serial' or 'http')")
        sys.exit(1)

def send_http_cmd(cmd_str, ip=None, port=8080, timeout=3.0):
    pico_ip = ip or get_pico_ip()
    if not pico_ip:
        print("[ERR] Pico IP not set. Run './pico_ctl.py set_ip <IP>' or set PICO_IP environment variable.")
        sys.exit(1)

    url = f"http://{pico_ip}:{port}/"
    data = cmd_str.encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "text/plain"}, method="POST")

    try:
        t0 = time.monotonic()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed_ms = (time.monotonic() - t0) * 1000
            res_text = resp.read().decode('utf-8', 'ignore')
            return res_text.strip(), elapsed_ms
    except urllib.error.URLError as e:
        print(f"[ERR] Failed to connect to Pico at {url}: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERR] Unexpected error communicating with Pico: {e}")
        sys.exit(1)

def get_window_rect(proc_name="MetalRage"):
    """
    Query MetalRage window rect using screen.ps1.
    Returns: (left, top, width, height) or None
    """
    if not os.path.exists(PS_PATH):
        return None

    # Run screen.ps1 with -Proc MetalRage
    win_script_path = "C:\\Users\\su200\\mro-screen.ps1"
    try:
        subprocess.run(["cp", SCREEN_PS1, "/mnt/c/Users/su200/mro-screen.ps1"], check=True, capture_output=True)
        cmd = [
            PS_PATH, "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", win_script_path, "-Proc", proc_name
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        # Output format: "C:\Users\su200\mro-shot.png 1024x768 at 120,80"
        lines = res.stdout.strip().splitlines()
        for line in lines:
            if " at " in line and "x" in line:
                parts = line.split(" at ")
                dims = parts[0].split()[-1].split("x")
                coords = parts[1].split(",")
                w, h = int(dims[0]), int(dims[1])
                x, y = int(coords[0]), int(coords[1])
                return x, y, w, h
    except Exception as ex:
        print(f"[WARN] Unable to get window coordinates: {ex}")
    return None

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1].lower()

    if action == "set_ip":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py set_ip <IP_ADDRESS>")
            sys.exit(1)
        set_pico_ip(sys.argv[2])
        return

    if action == "set_port":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py set_port <COM_PORT>  (e.g. COM6)")
            sys.exit(1)
        set_pico_port(sys.argv[2])
        return

    if action == "batch":
        if len(sys.argv) < 3:
            print('Usage: ./pico_ctl.py batch "CMD1" "CMD2" ...')
            sys.exit(1)
        commands = sys.argv[2:]
        transport = get_transport()
        if transport == "serial":
            replies, elapsed_ms = run_serial_commands(commands)
            for c, r in zip(commands, replies):
                print(f"{c} -> {r}")
            print(f"[BATCH] {len(commands)} commands via serial in {elapsed_ms:.1f}ms")
            if any(r.startswith("[ERR-TIMEOUT]") for r in replies):
                sys.exit(1)
        else:
            for c in commands:
                resp, ms = send_http_cmd(c)
                print(f"{c} -> [{resp}] ({ms:.1f}ms)")
        return

    if action == "ping":
        resp, ms = send_cmd("PING")
        print(f"[PICO PONG] {resp} ({ms:.1f}ms roundtrip)")
        return

    if action == "key":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py key <KEY_NAME>")
            sys.exit(1)
        key_name = sys.argv[2]
        resp, ms = send_cmd(f"KEY {key_name}")
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "press" or action == "hold":
        if len(sys.argv) < 4:
            print("Usage: ./pico_ctl.py press <KEY_NAME> <MS>")
            sys.exit(1)
        key_name = sys.argv[2]
        duration_ms = sys.argv[3]
        resp, ms = send_cmd(f"PRESS {key_name} {duration_ms}")
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "click":
        btn = sys.argv[2] if len(sys.argv) > 2 else "left"
        resp, ms = send_cmd(f"CLICK {btn}")
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "move":
        if len(sys.argv) < 4:
            print("Usage: ./pico_ctl.py move <DX> <DY>")
            sys.exit(1)
        dx, dy = sys.argv[2], sys.argv[3]
        resp, ms = send_cmd(f"MOVE {dx} {dy}")
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "move_to":
        if len(sys.argv) < 4:
            print("Usage: ./pico_ctl.py move_to <X> <Y>")
            sys.exit(1)
        x, y = sys.argv[2], sys.argv[3]
        resp, ms = send_cmd(f"MOVE_TO {x} {y}")
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "win_click":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py win_click <REL_X,REL_Y>")
            sys.exit(1)
        coords = sys.argv[2].replace("(", "").replace(")", "").split(",")
        rx, ry = int(coords[0]), int(coords[1])

        rect = get_window_rect("MetalRage")
        if rect is None:
            print("[ERR] MetalRage window not found on screen.")
            sys.exit(1)
        wx, wy, ww, wh = rect
        target_x = wx + rx
        target_y = wy + ry
        print(f"[PICO] MetalRage window at ({wx}, {wy}) [{ww}x{wh}]. Target screen coords: ({target_x}, {target_y})")

        # Move and click
        send_cmd(f"MOVE_TO {target_x} {target_y}")
        time.sleep(0.05)
        resp, ms = send_cmd("CLICK left")
        print(f"[OK] Clicked at ({target_x}, {target_y}) - {resp}")
        return

    if action == "type":
        if len(sys.argv) < 3:
            print("Usage: ./pico_ctl.py type <TEXT>")
            sys.exit(1)
        text = " ".join(sys.argv[2:])
        resp, ms = send_cmd(f"TYPE {text}")
        print(f"[OK] {resp} ({ms:.1f}ms)")
        return

    if action == "raw":
        raw_cmd = " ".join(sys.argv[2:])
        resp, ms = send_cmd(raw_cmd)
        print(f"[{resp}] ({ms:.1f}ms)")
        return

    print(f"[ERR] Unknown action '{action}'. See --help.")
    sys.exit(1)

if __name__ == "__main__":
    main()

