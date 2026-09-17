#!/usr/bin/env python3
"""Decrypt the client's script packages (data/MUD/*.tzp) offline and dump the
UnrealScript source text that is still embedded in them.

Pure file analysis: reads Core.dll's XOR table and the .tzp files, never
touches the running client. The routine is FArchive::Decrypt_MH (Core.dll
0x101622d0): byte[pos] ^= table[(keyIndex*1024 + pos%1024)*4], table at
0x10181380. keyIndex differs per file, so it is found by matching the
Unreal package magic C1832A9E.

Output goes OUTSIDE the repo (game code, not ours to commit):
  tools/tzp-extract.py [pkg ...]          default: every .tzp
  -> ~/mro-decrypted/<pkg>.u and ~/mro-decrypted/src/<pkg>/<Class>.uc (UTF-8)
"""
import os, re, sys
import pefile

GAME = '/mnt/c/Games/MetalRage Online/data'
OUT = os.path.expanduser('~/mro-decrypted')
TABLE_VA = 0x10181380
MAGIC = bytes.fromhex('c1832a9e')

def key_rows():
    pe = pefile.PE(f'{GAME}/System/Core.dll', fast_load=True)
    rva = TABLE_VA - pe.OPTIONAL_HEADER.ImageBase
    sec = next(s for s in pe.sections if s.VirtualAddress <= rva < s.VirtualAddress + s.Misc_VirtualSize)
    data = pe.get_data(sec.VirtualAddress, sec.SizeOfRawData)
    off = rva - sec.VirtualAddress
    n = (len(data) - off) // 4096
    return [bytes(data[off + (k * 1024 + i) * 4] for i in range(1024)) for k in range(n)]

def main():
    rows = key_rows()
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(f'{GAME}/MUD') if f.endswith('.tzp'))
    os.makedirs(OUT, exist_ok=True)
    for pkg in names:
        enc = open(f'{GAME}/MUD/{pkg}.tzp', 'rb').read()
        k = next((k for k, r in enumerate(rows) if bytes(a ^ b for a, b in zip(enc[:4], r)) == MAGIC), None)
        if k is None:
            print(f'{pkg}: no key (not a package?)'); continue
        r = rows[k]
        dec = bytes(b ^ r[i % 1024] for i, b in enumerate(enc))
        open(f'{OUT}/{pkg}.u', 'wb').write(dec)
        n = 0
        for chunk in dec.split(b'\x00'):
            if len(chunk) < 200: continue
            # the text is preceded by a compact-index length, so do not anchor on ^
            m = re.search(rb'(?<![\w])class[ \t]+(\w+)[ \t\r\n]+extends[ \t]+\w+', chunk, re.I)
            if not m: continue
            chunk = chunk[min(m.start(), max(0, chunk.find(b'//'))) if 0 <= chunk.find(b'//') < m.start() else m.start():]
            os.makedirs(f'{OUT}/src/{pkg}', exist_ok=True)
            open(f'{OUT}/src/{pkg}/{m.group(1).decode()}.uc', 'w', encoding='utf-8').write(
                chunk.decode('cp949', errors='replace'))
            n += 1
        print(f'{pkg}: key {k}, {n} classes')

main()
