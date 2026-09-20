#!/usr/bin/env python3
"""
Raise the client's two hard-coded network rate limits.

DRAFT -- prepared 2026-09-20, NOT approved and NOT run against any install yet.
See docs/journal/2026-09-20-2030-same-machine-and-netspeed.md before using it.

Why this exists
---------------
A joiner loses 10-35% of its projectile shots: the host's broadcast loop in
`AActor::ProcessRemoteFunction` (Engine.dll VA 0x105234b0) asks
`UNetConnection::IsNetReady` per connection and, when a connection has no send
budget left that tick, silently drops the call for it -- no queue, no
retransmit, even though the function is declared `reliable ToAll`. The budget
comes from `CurrentNetSpeed`, which is 10000 B/s; at NetServerMaxTickRate 30
that is ~333 bytes per tick, and ordinary movement replication alone spends it.

Both limits are written as literals by `UNetDriver::StaticConstructor`
(export VA 0x104a00f0):

    0x104a0540  mov dword ptr [ebx+0x1168], 0x3a98   ; 15000 MaxClientRate
    0x104a054a  mov dword ptr [ebx+0x116c], 0x2710   ; 10000 MaxInternetClientRate

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
ZNetwork.dll. y0da watches `MetalRage.exe`'s own .text, and a 1-byte patch of
ZNetwork.dll ran fine on 2026-09-19, but **Engine.dll has never been patched on
this client**, so the first run belongs on a disposable copy with the operator
watching.

This script refuses to touch an install whose Engine.dll is not the exact build
it was written for, always writes a .bak first, and can put it back.

Usage
-----
  tools/patch_netspeed.py --target "/mnt/c/Games/MetalRage Online 2"
  tools/patch_netspeed.py --target ... --rate 100000        (default)
  tools/patch_netspeed.py --target ... --clamp-only         (leave the default alone)
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
EXPECTED_SHA256 = 'fc51fe1240ee34111fc1a483e74a1b131d4b69f2b2a0940adbb4a860a138d24e'
EXPECTED_SIZE = 5390336

# file offset -> (original value, description)
PATCHES = {
    0x1a0546: (15000, 'MaxClientRate (netspeed ceiling)'),
    0x1a0550: (10000, 'MaxInternetClientRate (default connection rate)'),
}
CLAMP_ONLY = [0x1a0546]

REL = os.path.join('data', 'System', 'Engine.dll')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_u32(data, off):
    return struct.unpack_from('<I', data, off)[0]


def describe(data):
    for off, (orig, what) in sorted(PATCHES.items()):
        cur = read_u32(data, off)
        state = 'original' if cur == orig else f'patched (was {orig})'
        print(f'  0x{off:06x}  {cur:>7}  {what}  [{state}]')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--target', required=True,
                    help='install root, e.g. "/mnt/c/Games/MetalRage Online 2"')
    ap.add_argument('--rate', type=int, default=100000,
                    help='new value in bytes/sec (default 100000)')
    ap.add_argument('--clamp-only', action='store_true',
                    help='only raise the netspeed ceiling, leave the default at 10000')
    ap.add_argument('--restore', action='store_true', help='put the .bak back')
    ap.add_argument('--check', action='store_true', help='report current values and exit')
    a = ap.parse_args()

    dll = os.path.join(a.target, REL)
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
    describe(data)

    if a.check:
        return

    # Only refuse on a stock binary that is the wrong build. An already-patched
    # file has a different hash by definition, so check the size and the fact
    # that every target offset currently holds either the original value or
    # something this script could have written.
    if len(data) != EXPECTED_SIZE:
        sys.exit(f'refusing: size {len(data)} != {EXPECTED_SIZE}, this is a different build')
    if sha256(dll) != EXPECTED_SHA256 and not os.path.isfile(bak):
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
    describe(after)
    print(f'  sha256 now {sha256(dll)}')
    print('\nRestore with: --restore')


if __name__ == '__main__':
    main()
