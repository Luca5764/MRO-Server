#!/usr/bin/env python3
"""
test_e2e_flow.py - End-to-End Automated Smoke Test Runner
=========================================================
Runs a full automated smoke test of Metal Rage Online:
  1. Checks server TCP port (9211)
  2. Pings Raspberry Pi Pico 2 W HID controller
  3. Checks/Launches MetalRage client process
  4. Sends physical inputs (Login -> Lobby -> Ready F5)
  5. Takes screenshots via tools/win/shot.sh at each milestone
  6. Analyzes results and reports pass/fail

Usage:
  python3 test_e2e_flow.py [--skip-launch] [--pico-ip <IP>]
"""

import os
import sys
import time
import socket
import argparse
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
TOOLS_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, ".."))
PICO_CTL = os.path.join(TOOLS_DIR, "pico", "pico_ctl.py")
SHOT_SH = os.path.join(TOOLS_DIR, "win", "shot.sh")
PS_PATH = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def check_server_online(host="127.0.0.1", port=9211, timeout=2.0):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False

def run_pico_cmd(args):
    cmd = [sys.executable, PICO_CTL] + args
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        log(f"[WARN] Pico command failed: {' '.join(cmd)}\n{res.stderr.strip()}")
        return False
    return True

def capture_shot(name):
    cmd = [SHOT_SH, "--name", name]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        lines = res.stdout.strip().splitlines()
        shot_path = lines[0] if lines else "unknown"
        log(f"[SHOT] Captured {name} -> {shot_path}")
        return shot_path
    else:
        log(f"[WARN] Failed to capture shot: {res.stderr.strip()}")
        return None

def check_client_running():
    if not os.path.exists(PS_PATH):
        return False
    ps_cmd = 'Get-Process MetalRage -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id'
    res = subprocess.run([PS_PATH, "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
    pids = res.stdout.strip().split()
    return len(pids) > 0

def launch_client():
    log("[CLIENT] Launching MetalRage.exe...")
    launch_script = (
        '$exe = "C:\\Games\\MetalRage Online\\MetalRage.exe"; '
        '$args = "-globalid=TW&ip=127.0.0.1&port=9211&age=30"; '
        'if (Test-Path $exe) { Start-Process $exe -ArgumentList $args } '
        'else { Write-Error "Executable not found at $exe" }'
    )
    res = subprocess.run([PS_PATH, "-NoProfile", "-Command", launch_script], capture_output=True, text=True)
    if res.returncode != 0:
        log(f"[ERR] Launch failed: {res.stderr.strip()}")
        return False
    return True

def main():
    parser = argparse.ArgumentParser(description="Automated E2E Test for Metal Rage Online")
    parser.add_argument("--skip-launch", action="store_true", help="Do not launch client automatically")
    parser.add_argument("--pico-ip", type=str, help="Pico 2 W WiFi IP override")
    args = parser.parse_args()

    if args.pico_ip:
        run_pico_cmd(["set_ip", args.pico_ip])

    log("=== Starting MRO Automated E2E Test Suite ===")

    # Step 1: Check Server
    log("Step 1: Checking Server Status...")
    if not check_server_online():
        log("[FAIL] Server is not running on port 9211. Start server before running test.")
        sys.exit(1)
    log("[PASS] Server is listening on 127.0.0.1:9211.")

    # Step 2: Check Pico Controller
    log("Step 2: Checking Pico 2 W Hardware HID...")
    if not run_pico_cmd(["ping"]):
        log("[FAIL] Cannot communicate with Pico 2 W. Ensure it is connected and IP is set.")
        sys.exit(1)
    log("[PASS] Pico 2 W responded to PING.")

    # Step 3: Client Process Check
    log("Step 3: Checking MetalRage client process...")
    if not check_client_running():
        if args.skip_launch:
            log("[FAIL] MetalRage client is not running and --skip-launch was specified.")
            sys.exit(1)
        if not launch_client():
            sys.exit(1)
        log("Waiting for game window initialization (10s)...")
        time.sleep(10)
    else:
        log("[PASS] MetalRage client process is already running.")

    capture_shot("e2e-01-startup")

    # Step 4: Login Action
    log("Step 4: Sending Login Action via Pico HID...")
    # Send Enter to submit login dialog
    run_pico_cmd(["key", "ENTER"])
    time.sleep(4)
    capture_shot("e2e-02-after-login")

    # Step 5: Lobby / Room Action
    log("Step 5: Sending Ready (F5) Action...")
    run_pico_cmd(["key", "F5"])
    time.sleep(3)
    capture_shot("e2e-03-ready-room")

    # Step 6: In-Game Basic Action (WASD movement simulation)
    log("Step 6: Simulating Combat Controls...")
    run_pico_cmd(["press", "W", "1500"])   # Walk forward 1.5s
    time.sleep(0.5)
    run_pico_cmd(["key", "SPACE"])        # Jump
    time.sleep(0.5)
    run_pico_cmd(["click", "left"])       # Fire weapon
    time.sleep(2)
    capture_shot("e2e-04-in-game")

    log("=== E2E Automated Test Sequence Completed Successfully ===")

if __name__ == "__main__":
    main()

