#!/usr/bin/env python3
"""
patch_disable_xigncode.py

Disables XIGNCODE3 initialization in Metal Rage Online's ZNetwork.dll.
Bypasses XIGNCODE3 by forcing the dedicated-server code path (GIsClient == 0 branch).

Patch Details:
  File offset: 0x70301 (Virtual Address: 0x10770301)
  Original:    74 5E  (je  0x10770361)
  Patched:     EB 5E  (jmp 0x10770361)

When patched:
  FUN_107702c0 unconditionally jumps to 0x10770361, passing (0, 0) to FUN_107fa7c0.
  FUN_107fa7c0 checks if arg1 == 0, and skips all XIGNCODE setup (ZCWAVE_RegisterCallback,
  ZCWAVE_SysEnter), leaving the XIGNCODE active flag at 0.
  Downstream networking skips ZCWAVE_Init, ZCWAVE_Probe (0x2008D packet), and ZCWAVE_SysExit.
  xigncode.log is not created/written, .xem modules are not loaded, and Windows input hooks
  (blocking LLKHF_INJECTED) are completely bypassed.
"""

import sys
import os
import shutil
import hashlib
import argparse

DEFAULT_DLL_PATH = "/mnt/c/Games/MetalRage Online/data/System/ZNetwork.dll"
PATCH_OFFSET = 0x70301
ORIGINAL_BYTES = bytes([0x74, 0x5E])
PATCHED_BYTES = bytes([0xEB, 0x5E])

def get_file_sha1(filepath):
    h = hashlib.sha1()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def check_status(target_path):
    if not os.path.exists(target_path):
        print(f"[ERROR] Target file not found: {target_path}")
        return 1

    with open(target_path, "rb") as f:
        f.seek(PATCH_OFFSET)
        b = f.read(2)

    sha1 = get_file_sha1(target_path)
    print(f"Target: {target_path}")
    print(f"SHA1:   {sha1}")
    print(f"Bytes at 0x{PATCH_OFFSET:X}: {b.hex().upper()}")

    if b == ORIGINAL_BYTES:
        print("[STATUS] ORIGINAL (XIGNCODE enabled)")
        return 0
    elif b == PATCHED_BYTES:
        print("[STATUS] PATCHED (XIGNCODE disabled)")
        return 0
    else:
        print(f"[STATUS] UNKNOWN bytes at patch offset: expected {ORIGINAL_BYTES.hex()} or {PATCHED_BYTES.hex()}")
        return 2

def apply_patch(target_path):
    if not os.path.exists(target_path):
        print(f"[ERROR] Target file not found: {target_path}")
        return 1

    with open(target_path, "rb") as f:
        data = bytearray(f.read())

    current_bytes = bytes(data[PATCH_OFFSET:PATCH_OFFSET+2])
    if current_bytes == PATCHED_BYTES:
        print("[INFO] Target is already patched. Nothing to do.")
        return 0

    if current_bytes != ORIGINAL_BYTES:
        print(f"[ERROR] Unexpected bytes at 0x{PATCH_OFFSET:X}: {current_bytes.hex()}, expected {ORIGINAL_BYTES.hex()}")
        return 2

    # Backups
    target_dir = os.path.dirname(target_path)
    backup_file = target_path + ".original"
    if not os.path.exists(backup_file):
        print(f"[BACKUP] Creating {backup_file}...")
        shutil.copy2(target_path, backup_file)
    else:
        print(f"[INFO] Backup {backup_file} already exists.")

    orig_backup_dir = os.path.join(target_dir, "_original_backup")
    if os.path.exists(orig_backup_dir):
        backup_in_dir = os.path.join(orig_backup_dir, os.path.basename(target_path))
        if not os.path.exists(backup_in_dir):
            print(f"[BACKUP] Creating {backup_in_dir}...")
            shutil.copy2(target_path, backup_in_dir)

    # Apply patch via atomic write and rename
    data[PATCH_OFFSET:PATCH_OFFSET+2] = PATCHED_BYTES
    tmp_path = target_path + ".tmp"
    with open(tmp_path, "wb") as f:
        f.write(data)

    # Windows allow renaming open files if FILE_SHARE_DELETE is enabled
    old_tmp = target_path + ".old"
    if os.path.exists(old_tmp):
        try: os.remove(old_tmp)
        except OSError: pass
    try:
        os.rename(target_path, old_tmp)
        os.rename(tmp_path, target_path)
        try: os.remove(old_tmp)
        except OSError: pass
    except OSError:
        # Fallback to direct write
        with open(target_path, "wb") as f:
            f.write(data)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    new_sha1 = get_file_sha1(target_path)
    print(f"[SUCCESS] Applied patch: 0x{PATCH_OFFSET:X} changed from {ORIGINAL_BYTES.hex()} to {PATCHED_BYTES.hex()}")
    print(f"[SUCCESS] New SHA1: {new_sha1}")
    return 0

def revert_patch(target_path):
    if not os.path.exists(target_path):
        print(f"[ERROR] Target file not found: {target_path}")
        return 1

    backup_file = target_path + ".original"
    if os.path.exists(backup_file):
        print(f"[REVERT] Restoring from {backup_file}...")
        tmp_path = target_path + ".tmp"
        shutil.copy2(backup_file, tmp_path)
        old_tmp = target_path + ".old"
        if os.path.exists(old_tmp):
            try: os.remove(old_tmp)
            except OSError: pass
        try:
            os.rename(target_path, old_tmp)
            os.rename(tmp_path, target_path)
            try: os.remove(old_tmp)
            except OSError: pass
        except OSError:
            shutil.copy2(backup_file, target_path)
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        print(f"[SUCCESS] Restored {target_path} from backup.")
        return check_status(target_path)

    # Fallback to in-place byte reversion if backup not found
    with open(target_path, "rb") as f:
        data = bytearray(f.read())

    current_bytes = bytes(data[PATCH_OFFSET:PATCH_OFFSET+2])
    if current_bytes == ORIGINAL_BYTES:
        print("[INFO] Target is already original.")
        return 0

    if current_bytes == PATCHED_BYTES:
        data[PATCH_OFFSET:PATCH_OFFSET+2] = ORIGINAL_BYTES
        tmp_path = target_path + ".tmp"
        with open(tmp_path, "wb") as f:
            f.write(data)
        old_tmp = target_path + ".old"
        if os.path.exists(old_tmp):
            try: os.remove(old_tmp)
            except OSError: pass
        try:
            os.rename(target_path, old_tmp)
            os.rename(tmp_path, target_path)
            try: os.remove(old_tmp)
            except OSError: pass
        except OSError:
            with open(target_path, "wb") as f:
                f.write(data)
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        print(f"[SUCCESS] Reverted patch at 0x{PATCH_OFFSET:X} to {ORIGINAL_BYTES.hex()}")
        return 0

    print(f"[ERROR] Cannot revert: unexpected bytes {current_bytes.hex()}")
    return 2

def main():
    parser = argparse.ArgumentParser(description="Disable XIGNCODE in ZNetwork.dll")
    parser.add_argument("--target", default=DEFAULT_DLL_PATH, help=f"Path to ZNetwork.dll (default: {DEFAULT_DLL_PATH})")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--status", action="store_true", help="Check current patch status")
    group.add_argument("--apply", action="store_true", help="Apply XIGNCODE bypass patch")
    group.add_argument("--revert", action="store_true", help="Revert patch to original")

    args = parser.parse_args()

    if args.status:
        sys.exit(check_status(args.target))
    elif args.apply:
        sys.exit(apply_patch(args.target))
    elif args.revert:
        sys.exit(revert_patch(args.target))

if __name__ == "__main__":
    main()
