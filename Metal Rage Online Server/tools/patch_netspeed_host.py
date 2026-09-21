#!/usr/bin/env python3
"""
patch_netspeed_host.py

Patches Engine.dll so the HOST's UNetConnection::CurrentNetSpeed (the value
`AActor::ProcessRemoteFunction`'s IsNetReady check reads to decide whether to
drop a reliable RPC that tick) is unconditionally forced to 100000, instead of
being clamp(v, 1800, MaxClientRate)'d from whatever the client sent.

Design and evidence trail: docs/research/2026-09-21-netspeed-host-patch/design.md
(candidate 1b, PM-approved 2026-09-21). Do not re-derive the offsets from
scratch -- that file already has the disasm and the hex-level VA/file-offset
cross-check done by a senior agent.

Handler patched: Engine.dll export 0x1047ec80
(?NotifyReceivedText@ULevel@@UAEXPAVUNetConnection@@PBG@Z), the "NETSPEED"
console-command branch that only executes on the host (the joiner side never
reaches this code -- see design.md "把關一"). This is triggered by a player
(normally the host, since the branch is host-only) typing `netspeed <n>` in
the in-game console; after this patch the value typed no longer matters.

Three edits, 10 bytes total, all immediates or NOPs (no length change, no
relocation to fix up):

  VA          file offset  original       patched        effect
  0x1047f9b1  0x17f9b1     08 07 00 00    A0 86 01 00    cmp eax,0x708 -> cmp eax,100000
  0x1047f9b5  0x17f9b5     7d 07          90 90          NOP out `jge` (was: v>=1800 -> go compare against cap)
  0x1047f9b8  0x17f9b8     08 07 00 00    A0 86 01 00    mov eax,0x708 -> mov eax,100000

After patching, the branch always falls through to `mov eax,100000` then
`jmp 0x1047f9c4`, which writes 100000 into Connection+0x50
(CurrentNetSpeed) regardless of what the client sent. 0x1047f9be-0x1047f9c3
(the old cap-compare code) becomes dead but is left byte-for-byte unchanged.

Safety
------
Only ever apply this to the disposable test copy, `C:\\Games\\MetalRage
Online 2`. This script refuses any --target whose directory basename is
exactly "MetalRage Online" (the main install) -- no override, ever -- and
requires --i-know-this-is-the-copy for any --target basename that is not
literally "MetalRage Online 2".

Does not touch MetalRage.exe. Only Engine.dll.

Usage
-----
  # dry run (default): verify hashes/bytes, report, write nothing
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2"

  # actually patch (backs up first)
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2" --apply

  # put the backup back
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2" --restore
"""

import argparse
import glob
import hashlib
import os
import shutil
import sys
import time

REL_DLL = os.path.join('data', 'System', 'Engine.dll')

# Same build patch_netspeed.py's --module engine already pins.
EXPECTED_SIZE = 5390336
EXPECTED_SHA256 = 'fc51fe1240ee34111fc1a483e74a1b131d4b69f2b2a0940adbb4a860a138d24e'

# (file_offset, original_bytes, patched_bytes, description)
PATCHES = [
    (0x17f9b1, bytes.fromhex('08070000'), bytes.fromhex('a0860100'), 'cmp eax,0x708 -> cmp eax,100000'),
    (0x17f9b5, bytes.fromhex('7d07'),     bytes.fromhex('9090'),     'NOP out jge'),
    (0x17f9b8, bytes.fromhex('08070000'), bytes.fromhex('a0860100'), 'mov eax,0x708 -> mov eax,100000'),
]

BACKUP_TAG = 'netspeed-host'

MAIN_INSTALL_BASENAME = 'metalrage online'
KNOWN_COPY_BASENAME = 'metalrage online 2'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def guard_target(target, i_know):
    base = os.path.basename(os.path.normpath(target)).strip().lower()
    if base == MAIN_INSTALL_BASENAME:
        sys.exit(
            f'refusing: --target basename is "{os.path.basename(os.path.normpath(target))}", '
            'which is the MAIN install. This tool only ever touches the disposable copy '
            '("MetalRage Online 2"). There is no flag to override this check.'
        )
    if base != KNOWN_COPY_BASENAME and not i_know:
        sys.exit(
            f'refusing: --target basename is "{os.path.basename(os.path.normpath(target))}", '
            'not the known copy name "MetalRage Online 2". If this really is a disposable '
            'copy, re-run with --i-know-this-is-the-copy.'
        )


def describe_bytes(data):
    for off, orig, patched, what in PATCHES:
        cur = bytes(data[off:off + len(orig)])
        if cur == orig:
            state = 'original'
        elif cur == patched:
            state = 'patched'
        else:
            state = f'UNKNOWN ({cur.hex()})'
        print(f'  0x{off:06x}  {cur.hex()}  {what}  [{state}]')


def find_latest_backup(dll):
    candidates = sorted(glob.glob(f'{dll}.bak-{BACKUP_TAG}-*'))
    return candidates[-1] if candidates else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().split('\n')[0])
    ap.add_argument('--target', required=True,
                     help='install root, e.g. "/mnt/c/Games/MetalRage Online 2" '
                          '(must be the disposable copy, not the main install)')
    ap.add_argument('--i-know-this-is-the-copy', action='store_true', dest='i_know',
                     help='required if --target basename is not literally "MetalRage Online 2"')
    ap.add_argument('--apply', action='store_true',
                     help='actually write the patch (default is dry-run: verify and report only)')
    ap.add_argument('--restore', action='store_true',
                     help='restore the most recent .bak-netspeed-host-<timestamp> backup')
    ap.add_argument('--backup', help='explicit backup path to restore from (with --restore)')
    ap.add_argument('--force', action='store_true',
                     help='skip the whole-file SHA256 check (the per-byte check at the three '
                          'patch offsets still runs and still aborts on any mismatch -- this '
                          'has no override)')
    a = ap.parse_args()

    guard_target(a.target, a.i_know)

    dll = os.path.join(a.target, REL_DLL)
    if not os.path.isfile(dll):
        sys.exit(f'not found: {dll}')

    if a.restore:
        bak = a.backup or find_latest_backup(dll)
        if not bak or not os.path.isfile(bak):
            sys.exit(f'no backup to restore (looked for {dll}.bak-{BACKUP_TAG}-*)')
        shutil.copy2(bak, dll)
        print(f'restored from {bak}')
        print(f'sha256 now {sha256(dll)}')
        with open(dll, 'rb') as f:
            describe_bytes(f.read())
        return

    with open(dll, 'rb') as f:
        data = f.read()

    cur_sha = sha256(dll)
    print(f'{dll}\n  size   {len(data)}\n  sha256 {cur_sha}')

    if len(data) != EXPECTED_SIZE:
        sys.exit(f'refusing: size {len(data)} != {EXPECTED_SIZE}, this is a different build')

    if cur_sha != EXPECTED_SHA256:
        if not a.force:
            sys.exit(
                f'refusing: sha256 {cur_sha} != expected stock {EXPECTED_SHA256}. '
                'If this file was already patched by something else and you are sure '
                'it is safe, re-run with --force (the per-byte check below still applies '
                'and cannot be overridden).'
            )
        print('--force given: skipping whole-file SHA256 check, per-byte check below still applies')

    print('\ncurrent state of the three patch offsets:')
    describe_bytes(data)

    mismatches = []
    for off, orig, patched, what in PATCHES:
        cur = data[off:off + len(orig)]
        if cur != orig:
            mismatches.append((off, orig, cur, what))
    if mismatches:
        print('\nrefusing: byte-level check failed, aborting (no override for this check):')
        for off, orig, cur, what in mismatches:
            print(f'  0x{off:06x}  expected {orig.hex()}  got {cur.hex()}  {what}')
        sys.exit(1)

    print('\nall three offsets match the expected original bytes.')

    if not a.apply:
        print('\ndry-run only (no --apply given): nothing written.')
        return

    bak = f'{dll}.bak-{BACKUP_TAG}-{time.strftime("%Y%m%d-%H%M%S")}'
    if os.path.isfile(bak):
        sys.exit(f'refusing: backup already exists, not overwriting: {bak}')
    shutil.copy2(dll, bak)
    print(f'\nbackup -> {bak}')

    data = bytearray(data)
    for off, orig, patched, what in PATCHES:
        data[off:off + len(patched)] = patched

    with open(dll, 'wb') as f:
        f.write(data)

    with open(dll, 'rb') as f:
        after = f.read()

    print(f'\nwrote patch. sha256 now {sha256(dll)}')
    print('\nstate after patch (re-read from disk):')
    describe_bytes(after)
    print(f'\nRestore with: --restore  (backup: {bak})')


if __name__ == '__main__':
    main()
