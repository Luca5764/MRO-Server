#!/usr/bin/env python3
"""
patch_netspeed_host.py

Two independent patches to the HOST's Engine.dll, toggled by separate flags.
Neither implies the other; either can be applied alone or both together.

--value (netspeed force, always on unless --budget is given without --value)
------------------------------------------------------------------------
Patches Engine.dll so the HOST's UNetConnection::CurrentNetSpeed (the value
`AActor::ProcessRemoteFunction`'s IsNetReady check reads to decide whether to
drop a reliable RPC that tick) is unconditionally forced to a fixed value
(100000 by default, override with --value), instead of being
clamp(v, 1800, MaxClientRate)'d from whatever the client sent.

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
relocation to fix up). Table below shows the default (--value not given,
i.e. 100000); the two immediate edits scale with --value, the NOP does not:

  VA          file offset  original       patched (default)  effect
  0x1047f9b1  0x17f9b1     08 07 00 00    A0 86 01 00         cmp eax,0x708 -> cmp eax,<value>
  0x1047f9b5  0x17f9b5     7d 07          90 90               NOP out `jge` (was: v>=1800 -> go compare against cap)
  0x1047f9b8  0x17f9b8     08 07 00 00    A0 86 01 00         mov eax,0x708 -> mov eax,<value>

After patching, the branch always falls through to `mov eax,<value>` then
`jmp 0x1047f9c4`, which writes <value> into Connection+0x50
(CurrentNetSpeed) regardless of what the client sent. 0x1047f9be-0x1047f9c3
(the old cap-compare code) becomes dead but is left byte-for-byte unchanged.
<value> is 100000 unless overridden with --value (must fit in an unsigned
32-bit immediate, i.e. 1..0xFFFFFFFF).

This patch group is applied whenever --budget is NOT given (matching this
script's original, pre-existing behavior: with no flags at all you still get
the default-100000 netspeed force). Once --budget IS given, the netspeed
group only applies if --value was also explicitly passed -- `--budget` alone
means "only the bandwidth-bank patch below", so the two flags compose
predictably: whichever of {--value, --budget} you name, you get exactly that
patch group (plus --value's default-on behavior when --budget is absent, for
backward compatibility with every existing caller of this script).

--budget (bandwidth-bank widening, external source, reviewed but unproven
in our conditions)
------------------------------------------------------------------------
Patches Engine.dll's UNetConnection tick code (Moon's external report; our
own disasm review is in
docs/research/2026-09-22-netspeed-budget/high-tier-review.md -- do not
re-derive the bytes or the jump arithmetic, that file already has it) so the
per-tick bandwidth debit clamps its floor to
`-(2*DeltaTime*CurrentNetSpeed + CurrentNetSpeed/4)` instead of
`-(2*DeltaTime*CurrentNetSpeed)`, i.e. the connection's send budget can carry
a bit more than two ticks' worth of headroom. Three edits:

  VA          file offset  original                          patched
  0x1042e1f8  0x12e1f8     dc c0 8b 8e 4c 01 00 00            e9 23 a9 24 00 90 90 90  (jmp to cave)
  0x10678b20  0x378b20     32 bytes, all zero (.text pad)     27-byte cave body (see high-tier-review.md), zero-padded to 32
  (resolved)  (resolved)   .text VirtualSize == 0x377b1e      0x378000

The third edit is the file offset of the `.text` IMAGE_SECTION_HEADER's
VirtualSize field. That offset is NOT hardcoded here -- it is resolved by
walking the PE header at runtime (see find_text_section_header_offset()),
and the script refuses to guess if the section table doesn't look like the
build this was reviewed against (name isn't literally ".text", or the
current VirtualSize isn't the expected stock 0x377b1e -- the latter check
reuses the same per-byte original/patched comparison used for every other
patch offset in this script, so it aborts the same way a plain byte
mismatch would).

The cave lives past the declared end of `.text` (VirtualSize 0x377b1e) but
inside its raw/aligned size (0x378000), so it's already mapped executable
without touching the VirtualSize field; bumping VirtualSize to 0x378000 just
declares that padding as real code instead of leaving it looking
uninitialized. See high-tier-review.md section 3 for the section-boundary
math (doesn't reach into .rdata).

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
  # (this alone still means "apply netspeed with the default value 100000",
  # matching this script's original behavior)
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2"

  # actually patch (backs up first), default netspeed value 100000
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2" --apply

  # patch netspeed to a different value instead of the 100000 default
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2" --apply --value 30000

  # only the bandwidth-bank patch, netspeed left untouched
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2" --apply --budget

  # both patches together
  tools/patch_netspeed_host.py --target "/mnt/c/Games/MetalRage Online 2" --apply --value 30000 --budget

  # put the backup back (restores whichever patches were applied, together)
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

DEFAULT_VALUE = 100000
MAX_U32 = 0xFFFFFFFF


def build_patches(value):
    """Return the (file_offset, original_bytes, patched_bytes, description)
    list for a given netspeed value. The NOP-out-jge edit at 0x17f9b5 does
    not depend on value; the cmp/mov immediates at 0x17f9b1/0x17f9b8 do."""
    imm = value.to_bytes(4, 'little')
    return [
        (0x17f9b1, bytes.fromhex('08070000'), imm, f'cmp eax,0x708 -> cmp eax,{value}'),
        (0x17f9b5, bytes.fromhex('7d07'),     bytes.fromhex('9090'), 'NOP out jge'),
        (0x17f9b8, bytes.fromhex('08070000'), imm, f'mov eax,0x708 -> mov eax,{value}'),
    ]


# --- budget (bandwidth-bank) patch -----------------------------------------

TEXT_SECTION_NAME = b'.text'
TEXT_VIRTUALSIZE_ORIG = 0x377b1e
TEXT_VIRTUALSIZE_PATCHED = 0x378000

# 27-byte cave body, transcribed from
# docs/research/2026-09-22-netspeed-budget/high-tier-review.md section 2.
# Zero-padded to 32 bytes (the full cave region) when used as a patch so it
# compares/writes the same way every other fixed-length edit in this script
# does; the trailing 5 bytes stay the pad's original zero.
_BUDGET_CAVE_CODE = bytes.fromhex(
    'DCC08B4E50C1E902894DE4DB45E4DEC18B8E4C010000E9C556DBFF'
)
assert len(_BUDGET_CAVE_CODE) == 27

BUDGET_JMP_OFFSET = 0x12e1f8
BUDGET_JMP_ORIG = bytes.fromhex('DCC08B8E4C010000')
BUDGET_JMP_PATCHED = bytes.fromhex('E923A92400909090')
assert len(BUDGET_JMP_ORIG) == len(BUDGET_JMP_PATCHED) == 8

BUDGET_CAVE_OFFSET = 0x378b20
BUDGET_CAVE_ORIG = b'\x00' * 32
BUDGET_CAVE_PATCHED = _BUDGET_CAVE_CODE + b'\x00' * (32 - len(_BUDGET_CAVE_CODE))
assert len(BUDGET_CAVE_PATCHED) == 32


def find_text_section_header_offset(data):
    """Walk the PE header (never assume a fixed layout) and return the file
    offset of the '.text' IMAGE_SECTION_HEADER (a 40-byte entry; its
    VirtualSize field is the 4 bytes right after the 8-byte Name field).
    Raises ValueError with a description on any structural mismatch instead
    of guessing an offset."""
    if len(data) < 0x40 or data[0:2] != b'MZ':
        raise ValueError('not an MZ/PE file (bad DOS header)')
    e_lfanew = int.from_bytes(data[0x3c:0x40], 'little')
    if data[e_lfanew:e_lfanew + 4] != b'PE\x00\x00':
        raise ValueError(f'no PE signature at e_lfanew=0x{e_lfanew:x}')
    coff = e_lfanew + 4
    num_sections = int.from_bytes(data[coff + 2:coff + 4], 'little')
    size_opt_hdr = int.from_bytes(data[coff + 16:coff + 18], 'little')
    sec_table = coff + 20 + size_opt_hdr
    for i in range(num_sections):
        off = sec_table + i * 40
        name = data[off:off + 8].rstrip(b'\x00')
        if name == TEXT_SECTION_NAME:
            return off
    raise ValueError('.text section header not found in section table')


def build_budget_patches(data):
    """Return the 3-entry budget patch list: the two fixed code offsets plus
    the .text VirtualSize field, whose file offset is resolved from the PE
    header at runtime (see find_text_section_header_offset -- never
    hardcoded). Raises ValueError if the section table doesn't look like the
    reviewed build; the caller is responsible for treating that as a hard
    abort when actually applying this patch group. Whether the *current*
    bytes at the resolved offset actually equal the expected stock
    0x377b1e is NOT checked here -- that reuses the same generic
    original/patched byte comparison every other patch offset in this
    script goes through (see main()'s mismatches check)."""
    sec_off = find_text_section_header_offset(data)
    vsize_off = sec_off + 8  # IMAGE_SECTION_HEADER::VirtualSize
    return [
        (BUDGET_JMP_OFFSET, BUDGET_JMP_ORIG, BUDGET_JMP_PATCHED,
         'jmp to cave (bandwidth-bank formula)'),
        (BUDGET_CAVE_OFFSET, BUDGET_CAVE_ORIG, BUDGET_CAVE_PATCHED,
         'cave body: floor -> -(2D + CurrentNetSpeed/4)'),
        (vsize_off, TEXT_VIRTUALSIZE_ORIG.to_bytes(4, 'little'),
         TEXT_VIRTUALSIZE_PATCHED.to_bytes(4, 'little'),
         '.text section header VirtualSize 0x377b1e -> 0x378000'),
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


def describe_bytes(data, groups):
    """groups: list of (label, patches), patches being the same
    (offset, orig, patched, what) tuples build_patches()/build_budget_patches()
    return. Prints every offset in every group tagged [original]/[patched]/
    [unexpected]."""
    for label, patches in groups:
        for off, orig, patched, what in patches:
            cur = bytes(data[off:off + len(orig)])
            if cur == orig:
                state = 'original'
            elif cur == patched:
                state = 'patched'
            else:
                state = f'unexpected ({cur.hex()})'
            print(f'  [{label}] 0x{off:06x}  {cur.hex()}  {what}  [{state}]')


def budget_display_group(data):
    """Best-effort (label, patches) pair for describe_bytes(), used purely
    for informational status printing -- never raises. Returns None if the
    budget offsets can't be resolved (prints why instead)."""
    try:
        return ('budget', build_budget_patches(data))
    except ValueError as e:
        print(f'  [budget] status unavailable: {e}')
        return None


def find_latest_backup(dll):
    candidates = sorted(glob.glob(f'{dll}.bak-{BACKUP_TAG}-*'))
    return candidates[-1] if candidates else None


def netspeed_value(s):
    """argparse type= for --value: must be an integer that fits an unsigned
    32-bit immediate (the cmp/mov patch bytes are exactly 4 bytes)."""
    try:
        v = int(s, 0)
    except ValueError:
        raise argparse.ArgumentTypeError(f'{s!r} is not an integer')
    if v <= 0 or v > MAX_U32:
        raise argparse.ArgumentTypeError(
            f'{s!r} out of range: must be a positive integer <= {MAX_U32} (0x{MAX_U32:08x})'
        )
    return v


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().split('\n')[0])
    ap.add_argument('--target', required=True,
                     help='install root, e.g. "/mnt/c/Games/MetalRage Online 2" '
                          '(must be the disposable copy, not the main install)')
    ap.add_argument('--i-know-this-is-the-copy', action='store_true', dest='i_know',
                     help='required if --target basename is not literally "MetalRage Online 2"')
    ap.add_argument('--value', type=netspeed_value, default=None,
                     help=f'netspeed immediate to write at the netspeed patch sites '
                          f'(default {DEFAULT_VALUE} if this flag is omitted); '
                          f'must be a positive integer that fits an unsigned 32-bit immediate. '
                          f'The netspeed patch group is applied whenever --budget is NOT given; '
                          f'if --budget IS given, the netspeed group only applies when --value '
                          f'is also explicitly passed (so `--budget` alone means budget-only)')
    ap.add_argument('--budget', action='store_true',
                     help='also (or only, if --value is not given) apply the bandwidth-bank '
                          'widening patch (external source, see docstring); independent of '
                          '--value in both directions')
    ap.add_argument('--apply', action='store_true',
                     help='actually write the patch (default is dry-run: verify and report only)')
    ap.add_argument('--restore', action='store_true',
                     help='restore the most recent .bak-netspeed-host-<timestamp> backup '
                          '(restores every patch group that backup covers, together)')
    ap.add_argument('--backup', help='explicit backup path to restore from (with --restore)')
    ap.add_argument('--force', action='store_true',
                     help='skip the whole-file SHA256 check (the per-byte check at each '
                          'active patch group\'s offsets still runs and still aborts on any '
                          'mismatch -- this has no override)')
    a = ap.parse_args()

    guard_target(a.target, a.i_know)

    # --budget and --value are independent switches. Backward compatibility
    # rule: the netspeed group is applied whenever --budget is NOT given
    # (this is the script's original behavior -- no flags at all still means
    # "force netspeed to the 100000 default"). Once --budget IS given,
    # netspeed only comes along if --value was also explicitly named, so
    # `--budget` alone means "only budget".
    apply_netspeed = (not a.budget) or (a.value is not None)
    resolved_value = a.value if a.value is not None else DEFAULT_VALUE
    netspeed_patches = build_patches(resolved_value)

    dll = os.path.join(a.target, REL_DLL)
    if not os.path.isfile(dll):
        sys.exit(f'not found: {dll}')

    if a.restore:
        # --restore only copies the backup back; it does not need to know
        # which --value/--budget combination was applied when the backup
        # was made -- it's a whole-file copy, so it restores every group
        # the backup covers, together. The describe_bytes() call below
        # still works because the "original" bytes at each offset never
        # depend on --value/--budget -- only "patched" does, and a
        # successful restore should read back as "original" regardless.
        bak = a.backup or find_latest_backup(dll)
        if not bak or not os.path.isfile(bak):
            sys.exit(f'no backup to restore (looked for {dll}.bak-{BACKUP_TAG}-*)')
        shutil.copy2(bak, dll)
        print(f'restored from {bak}')
        print(f'sha256 now {sha256(dll)}')
        with open(dll, 'rb') as f:
            restored = f.read()
        groups = [('netspeed', netspeed_patches)]
        budget_group = budget_display_group(restored)
        if budget_group:
            groups.append(budget_group)
        describe_bytes(restored, groups)
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

    print(f'\nnetspeed: {"applying, value=" + str(resolved_value) if apply_netspeed else "not applied this run"}')
    print(f'budget:   {"applying" if a.budget else "not applied this run"}')

    print('\ncurrent state of the patch offsets:')
    display_groups = [('netspeed', netspeed_patches)]
    budget_group_for_display = budget_display_group(data)
    if budget_group_for_display:
        display_groups.append(budget_group_for_display)
    describe_bytes(data, display_groups)

    active_groups = []
    if apply_netspeed:
        active_groups.append(('netspeed', netspeed_patches))
    if a.budget:
        try:
            budget_patches = build_budget_patches(data)
        except ValueError as e:
            sys.exit(f'refusing: could not resolve budget patch offsets: {e}')
        active_groups.append(('budget', budget_patches))

    mismatches = []
    for label, patches in active_groups:
        for off, orig, patched, what in patches:
            cur = data[off:off + len(orig)]
            if cur != orig:
                mismatches.append((label, off, orig, cur, what))
    if mismatches:
        print('\nrefusing: byte-level check failed, aborting (no override for this check):')
        for label, off, orig, cur, what in mismatches:
            print(f'  [{label}] 0x{off:06x}  expected {orig.hex()}  got {cur.hex()}  {what}')
        sys.exit(1)

    print('\nall active-group offsets match the expected original bytes.')

    if not a.apply:
        print('\ndry-run only (no --apply given): nothing written.')
        return

    bak = f'{dll}.bak-{BACKUP_TAG}-{time.strftime("%Y%m%d-%H%M%S")}'
    if os.path.isfile(bak):
        sys.exit(f'refusing: backup already exists, not overwriting: {bak}')
    shutil.copy2(dll, bak)
    print(f'\nbackup -> {bak}')

    data = bytearray(data)
    for label, patches in active_groups:
        for off, orig, patched, what in patches:
            data[off:off + len(patched)] = patched

    with open(dll, 'wb') as f:
        f.write(data)

    with open(dll, 'rb') as f:
        after = f.read()

    print(f'\nwrote patch. sha256 now {sha256(dll)}')
    print('\nstate after patch (re-read from disk):')
    after_groups = [('netspeed', netspeed_patches)]
    after_budget_group = budget_display_group(after)
    if after_budget_group:
        after_groups.append(after_budget_group)
    describe_bytes(after, after_groups)
    print(f'\nRestore with: --restore  (backup: {bak})')


if __name__ == '__main__':
    main()
