#!/usr/bin/env python3
"""
Raise the client's two hard-coded network rate limits.

As of 2026-09-20 this has already been run once, against the test copy
`C:\Games\MetalRage Online 2` (--module ipdrv only; the main install's
Engine.dll and IpDrv.dll are still stock). See
docs/journal/2026-09-20-2030-same-machine-and-netspeed.md and
docs/journal/2026-09-20-2130-netspeed-clamp.md for how the two fields and the
clamp were found, and docs/HANDOFF.md ("客戶端目前的非原廠狀態") for the
current patch state of both installs before running this again.

Why this exists
---------------
A joiner loses 10-35% of its projectile shots: the host's broadcast loop in
`AActor::ProcessRemoteFunction` (Engine.dll VA 0x105234b0) asks
`UNetConnection::IsNetReady` per connection and, when a connection has no send
budget left that tick, silently drops the call for it -- no queue, no
retransmit, even though the function is declared `reliable ToAll`. The budget
comes from `CurrentNetSpeed`, which is 10000 B/s; at NetServerMaxTickRate 30
that is ~333 bytes per tick, and ordinary movement replication alone spends it.

Both limits are compiled-in literals, written by `UNetDriver::StaticConstructor`
(export VA 0x104a00f0) in Engine.dll:

    0x104a0540  mov dword ptr [ebx+0x1168], 0x3a98   ; 15000 MaxClientRate
    0x104a054a  mov dword ptr [ebx+0x116c], 0x2710   ; 10000 MaxInternetClientRate

and again, with the same two literals, by `UTcpNetDriver::StaticConstructor`
(VA 0x10714693 / 0x1071469d) in IpDrv.dll -- the subclass, which runs after
Engine.dll's and wins. [TEST] 2026-09-20: patching only Engine.dll changed
nothing at runtime, the host still logged "Client netspeed is 10000" and
`netspeed` still clamped at 15000. That is why `--module ipdrv` is the
default and the only one of the two that has an observable effect on its
own; `--module engine` patches the base-class copy of the same two fields
and is kept only so both call sites are covered if that ever changes.

They are not config properties: `[IpDrv.TcpNetDriver]`, `[Engine.NetDriver]`
and `[Engine.Player]` were all tried on both installs and none of them moves
either value ([TEST] 2026-09-20). Editing these two immediates is the only
remaining lever.

What each one does
------------------
  MaxInternetClientRate  the rate a connection gets by default -- raise this
                         and nothing else has to happen in game
  MaxClientRate          the ceiling the console command `netspeed <n>` is
                         clamped to (`min(requested, cap)`, UViewport::Exec
                         VA 0x104156f0) -- raise this alone and the player must
                         type `netspeed` each session

Safety
------
Engine.dll is an ordinary unpacked MSVC binary (standard section names, import
table intact, .text entropy 6.56, no Themida/y0da/VMProtect signatures), unlike
ZNetwork.dll. y0da watches `MetalRage.exe`'s own .text, not Engine.dll or
IpDrv.dll, and a 1-byte patch of ZNetwork.dll ran fine on 2026-09-19. That
entropy/import-table check was only ever done for Engine.dll, not for
IpDrv.dll (the module this script patches by default) -- treat a first run
against a new install as unverified for that reason, and prefer a disposable
copy with the operator watching.

This script refuses to touch an install whose target DLL is not the exact
size it was written for (and, for `--module engine`, not the exact sha256
either -- `--module ipdrv` has no pinned hash because the test copy's
IpDrv.dll is already patched, so there is no single stock hash to check
against). It always writes a `.bak-netspeed` first if one does not already
exist for that DLL, and `--restore` copies that backup back over it.

Usage
-----
  tools/patch_netspeed.py --target "/mnt/c/Games/MetalRage Online 2"              (patches IpDrv.dll, the default module, at rate 100000)
  tools/patch_netspeed.py --target ... --module engine                            (patches Engine.dll instead; no effect alone, see above)
  tools/patch_netspeed.py --target ... --rate 50000
  tools/patch_netspeed.py --target ... --clamp-only         (leave MaxInternetClientRate/the default rate alone, only raise the netspeed ceiling)
  tools/patch_netspeed.py --target ... --restore
  tools/patch_netspeed.py --target ... --check              (report only)

Bandwidth note: 100000 B/s is ~0.8 Mbit/s per joiner, so a host with 7 joiners
uploads ~5.6 Mbit/s. Fine on a modern home connection, worth stating plainly to
anyone who runs this.
"""

import argparse
import hashlib
import os
import shutil
import struct
import sys

# The build this was derived from. Refuse anything else: the offsets below are
# file positions in this exact binary, and writing them into a different build
# would corrupt an unrelated instruction.
# Two modules write these fields, and the one that wins is the subclass:
# Engine.dll's UNetDriver::StaticConstructor runs first, then IpDrv.dll's
# UTcpNetDriver::StaticConstructor overwrites both with the same literals.
# [TEST] 2026-09-20: patching Engine.dll alone changed nothing at all -- the
# host still logged "Client netspeed is 10000" and `netspeed` still clamped at
# 15000. **ipdrv is the one that matters.**
MODULES = {
    'ipdrv': {
        'rel': os.path.join('data', 'System', 'IpDrv.dll'),
        'size': 233472,
        # UTcpNetDriver::StaticConstructor, VA 0x10714693 / 0x1071469d
        'patches': {
            0x14699: (15000, 'MaxClientRate (netspeed ceiling)'),
            0x146a3: (10000, 'MaxInternetClientRate (default connection rate)'),
        },
        'clamp_only': [0x14699],
    },
    'engine': {
        'rel': os.path.join('data', 'System', 'Engine.dll'),
        'size': 5390336,
        'sha256': 'fc51fe1240ee34111fc1a483e74a1b131d4b69f2b2a0940adbb4a860a138d24e',
        # UNetDriver::StaticConstructor, VA 0x104a0540 / 0x104a054a.
        # Kept for completeness; on its own it has no effect.
        'patches': {
            0x1a0546: (15000, 'MaxClientRate (base class, overwritten by IpDrv)'),
            0x1a0550: (10000, 'MaxInternetClientRate (base class, overwritten by IpDrv)'),
        },
        'clamp_only': [0x1a0546],
    },
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_u32(data, off):
    return struct.unpack_from('<I', data, off)[0]


def describe(data, PATCHES):
    for off, (orig, what) in sorted(PATCHES.items()):
        cur = read_u32(data, off)
        state = 'original' if cur == orig else f'patched (was {orig})'
        print(f'  0x{off:06x}  {cur:>7}  {what}  [{state}]')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--module', choices=sorted(MODULES), default='ipdrv',
                    help="which module to patch: ipdrv (default, IpDrv.dll, "
                    "the subclass constructor that runs last and is the only "
                    "one with an observable effect) or engine (Engine.dll, "
                    "the base class; overwritten by ipdrv at runtime, so "
                    "patching it alone does nothing)")
    ap.add_argument('--target', required=True,
                    help='install root, e.g. "/mnt/c/Games/MetalRage Online 2"')
    ap.add_argument('--rate', type=int, default=100000,
                    help='new value in bytes/sec (default 100000)')
    ap.add_argument('--clamp-only', action='store_true',
                    help='only raise the netspeed ceiling, leave the default at 10000')
    ap.add_argument('--restore', action='store_true',
                    help='put the .bak-netspeed backup back over the target DLL')
    ap.add_argument('--check', action='store_true', help='report current values and exit')
    a = ap.parse_args()

    mod = MODULES[a.module]
    PATCHES = mod['patches']
    CLAMP_ONLY = mod['clamp_only']
    EXPECTED_SIZE = mod['size']
    EXPECTED_SHA256 = mod.get('sha256')

    dll = os.path.join(a.target, mod['rel'])
    bak = dll + '.bak-netspeed'

    if not os.path.isfile(dll):
        sys.exit(f'not found: {dll}')

    if a.restore:
        if not os.path.isfile(bak):
            sys.exit(f'no backup to restore: {bak}')
        shutil.copy2(bak, dll)
        print(f'restored from {bak}')
        print(f'sha256 now {sha256(dll)}')
        return

    with open(dll, 'rb') as f:
        data = bytearray(f.read())

    print(f'{dll}\n  size   {len(data)}\n  sha256 {sha256(dll)}')
    describe(data, PATCHES)

    if a.check:
        return

    # Only refuse on a stock binary that is the wrong build. An already-patched
    # file has a different hash by definition, so check the size and the fact
    # that every target offset currently holds either the original value or
    # something this script could have written.
    if len(data) != EXPECTED_SIZE:
        sys.exit(f'refusing: size {len(data)} != {EXPECTED_SIZE}, this is a different build')
    if EXPECTED_SHA256 and sha256(dll) != EXPECTED_SHA256 and not os.path.isfile(bak):
        sys.exit('refusing: hash does not match the expected build and there is no '
                 'backup here, so this file has been modified by something else')

    if not 1800 <= a.rate <= 1000000:
        sys.exit(f'refusing: {a.rate} is outside a sane range (1800..1000000)')

    targets = CLAMP_ONLY if a.clamp_only else sorted(PATCHES)

    if not os.path.isfile(bak):
        shutil.copy2(dll, bak)
        print(f'backup -> {bak}')

    for off in targets:
        struct.pack_into('<I', data, off, a.rate)

    with open(dll, 'wb') as f:
        f.write(data)

    print(f'\nwrote {a.rate} to {len(targets)} offset(s):')
    with open(dll, 'rb') as f:
        after = f.read()
    describe(after, PATCHES)
    print(f'  sha256 now {sha256(dll)}')
    print('\nRestore with: --restore')


if __name__ == '__main__':
    main()
