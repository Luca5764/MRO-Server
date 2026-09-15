#!/usr/bin/env python3
"""
Recover opcode -> handler from a client dispatcher.

Each ZDispatch* class in ZNetwork.dll has a Dispatch method that reads the
message type out of the header and picks a handler through a chain of compares
on one register. The chain only ever does cmp/sub/dec and conditional jumps, so
running it for a candidate opcode and seeing which call it lands on recovers
the mapping exactly — no guessing, and no waiting for a play session.

This is how Death_SN, Respawn_SN and the rest of the combat opcodes were
located: not by triggering them, but by reading the switch that receives them.

Usage:
  tools/dispatch-map.py <dispatcher-va> [dll]
  tools/dispatch-map.py --list [dll]        show the Dispatch methods available
"""
import sys, os, re

try:
    import pefile
    from capstone import Cs, CS_ARCH_X86, CS_MODE_32
except ImportError:
    sys.exit("needs: pip install pefile capstone")

CLIENT = "/mnt/c/Games/MetalRage Online/data/System"
DEFAULT_DLL = "ZNetwork.dll"

# Opcode namespaces worth probing. The header's type is 0x00PPSSLL where PP is
# one of these; everything else has never been seen on the wire.
PREFIXES = (0x02, 0x11, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
            0x31, 0x32, 0x36, 0x41, 0x42, 0x51)


def load(dll):
    path = dll if os.path.sep in dll else os.path.join(CLIENT, dll)
    pe = pefile.PE(path, fast_load=True)
    pe.parse_data_directories(
        directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_EXPORT"]])
    base = pe.OPTIONAL_HEADER.ImageBase
    names = {}
    if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
        for e in pe.DIRECTORY_ENTRY_EXPORT.symbols:
            if e.name:
                names[base + e.address] = e.name.decode("latin1")
    return pe, open(path, "rb").read(), base, names


def demangle(sym):
    """?Death_SN@ZDispatchGame@@... -> ZDispatchGame::Death_SN"""
    body = sym.lstrip("?").split("@@")[0]
    parts = body.split("@")
    if len(parts) >= 2:
        return "%s::%s" % (parts[1], parts[0])
    return parts[0]


def decode(data, base, va, size=0x2000):
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    return {i.address: i for i in md.disasm(data[va - base:va - base + size], va)}


JUMPTABLE_RE = re.compile(r"dword ptr \[(\w+)\*(\d+) \+ (0x[0-9a-f]+)\]")
BASE_G = 0
DATA_G = b""


def run(ins, entry, opcode, names, limit=500):
    """Walk the compare chain with edx seeded to opcode; return the handler hit."""
    pc, edx, zf, cf = entry, opcode & 0xFFFFFFFF, False, False
    for _ in range(limit):
        i = ins.get(pc)
        if i is None:
            return None
        m, o = i.mnemonic, i.op_str
        if m == "cmp" and o.startswith("edx,"):
            v = int(o.split(",")[1].strip(), 16)
            zf, cf = edx == v, edx < v
        elif m == "sub" and o.startswith("edx,"):
            v = int(o.split(",")[1].strip(), 16)
            cf = edx < v
            edx = (edx - v) & 0xFFFFFFFF
            zf = edx == 0
        elif m == "dec" and o == "edx":
            edx = (edx - 1) & 0xFFFFFFFF
            zf = edx == 0
        elif m == "call":
            try:
                return names.get(int(o, 16))
            except ValueError:
                return None
        elif m in ("je", "jz"):
            if zf:
                pc = int(o, 16); continue
        elif m in ("jne", "jnz"):
            if not zf:
                pc = int(o, 16); continue
        elif m == "ja":
            if not cf and not zf:
                pc = int(o, 16); continue
        elif m in ("jb", "jc"):
            if cf:
                pc = int(o, 16); continue
        elif m == "jae":
            if not cf:
                pc = int(o, 16); continue
        elif m == "jbe":
            if cf or zf:
                pc = int(o, 16); continue
        elif m == "jmp":
            try:
                pc = int(o, 16); continue
            except ValueError:
                # jmp dword ptr [edx*4 + 0x107dbf48] — a jump table, which is
                # how the compiler renders a dense run of opcodes. Read the
                # entry the current edx selects.
                mt = JUMPTABLE_RE.match(o)
                if mt is None:
                    return None
                scale, tbl = int(mt.group(2)), int(mt.group(3), 16)
                slot = tbl + edx * scale
                off = slot - BASE_G
                if off < 0 or off + 4 > len(DATA_G):
                    return None
                pc = int.from_bytes(DATA_G[off:off + 4], "little")
                continue
        elif m in ("ret", "retn"):
            return None
        pc += i.size
    return None


def main():
    args = [a for a in sys.argv[1:]]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return

    if args[0] == "--list":
        _, _, base, names = load(args[1] if len(args) > 1 else DEFAULT_DLL)
        for va, sym in sorted(names.items()):
            if sym.startswith("?Dispatch@"):
                print("0x%08x  %s" % (va, demangle(sym)))
        return

    va = int(args[0], 16)
    pe, data, base, names = load(args[1] if len(args) > 1 else DEFAULT_DLL)
    global BASE_G, DATA_G
    BASE_G, DATA_G = base, data

    # An export is a thunk; follow the jmp to the real body.
    ins = decode(data, base, va, 0x20)
    first = ins.get(va)
    if first is not None and first.mnemonic == "jmp":
        va = int(first.op_str, 16)
        print("thunk -> 0x%08x" % va)

    ins = decode(data, base, va, 0x4000)

    # The first two instructions load the type into edx; start after them.
    entry = va
    for _ in range(2):
        i = ins.get(entry)
        if i is None:
            break
        entry += i.size

    found = {}
    for hi in PREFIXES:
        for mid in range(0x100):
            for lo in range(0x100):
                op = (hi << 16) | (mid << 8) | lo
                sym = run(ins, entry, op, names)
                if sym:
                    found.setdefault(sym, []).append(op)

    print("\n%-34s %s" % ("handler", "opcode(s)"))
    print("-" * 60)
    for sym in sorted(found, key=lambda s: found[s][0]):
        ops = found[sym]
        shown = " ".join("0x%08x" % o for o in ops[:8])
        if len(ops) > 8:
            shown += "  (+%d more)" % (len(ops) - 8)
        print("%-34s %s" % (demangle(sym), shown))
    print("\n%d handler(s)" % len(found))


if __name__ == "__main__":
    main()
