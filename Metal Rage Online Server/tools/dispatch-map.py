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


MEM_IDX_RE = re.compile(r"^(\w+), byte ptr \[(\w+) \+ (0x[0-9a-f]+)\]$")
JMP_TBL_RE = re.compile(r"^dword ptr \[(\w+)\*(\d+) \+ (0x[0-9a-f]+)\]$")
BASE_G = 0
DATA_G = b""


def _dword(va):
    off = va - BASE_G
    if off < 0 or off + 4 > len(DATA_G):
        return None
    return int.from_bytes(DATA_G[off:off + 4], "little")


def _byte(va):
    off = va - BASE_G
    if off < 0 or off >= len(DATA_G):
        return None
    return DATA_G[off]


def type_register(ins, entry):
    """The prologue is mov <a>, [esp+4] ; mov <r>, [<a>+0xc]. Return <r> and the
    address just past it — <r> is the register the whole chain then works on."""
    pc, reg = entry, None
    for _ in range(4):
        i = ins.get(pc)
        if i is None:
            break
        if i.mnemonic == "mov" and "+ 0xc]" in i.op_str:
            reg = i.op_str.split(",")[0].strip()
            pc += i.size
            return reg, pc
        pc += i.size
    return "edx", entry


def run(ins, entry, reg, opcode, names, limit=600):
    """Walk the chain with `reg` seeded to opcode; return the handler reached."""
    pc, v, zf, cf = entry, opcode & 0xFFFFFFFF, False, False
    for _ in range(limit):
        i = ins.get(pc)
        if i is None:
            return None
        m, o = i.mnemonic, i.op_str

        if m == "cmp" and o.startswith(reg + ","):
            try:
                n = int(o.split(",")[1].strip(), 16)
            except ValueError:
                return None
            zf, cf = v == n, v < n
        elif m == "sub" and o.startswith(reg + ","):
            n = int(o.split(",")[1].strip(), 16)
            cf = v < n
            v = (v - n) & 0xFFFFFFFF
            zf = v == 0
        elif m == "dec" and o == reg:
            v = (v - 1) & 0xFFFFFFFF
            zf = v == 0
        elif m == "movzx":
            mt = MEM_IDX_RE.match(o)
            if mt and mt.group(2) == reg:
                b = _byte(int(mt.group(3), 16) + v)
                if b is None:
                    return None
                v, reg = b, mt.group(1)
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
            mt = JMP_TBL_RE.match(o)
            if mt:
                if mt.group(1) != reg:
                    return None
                t = _dword(int(mt.group(3), 16) + v * int(mt.group(2)))
                if t is None:
                    return None
                pc = t
                continue
            try:
                pc = int(o, 16); continue
            except ValueError:
                return None
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

    ins = decode(data, base, va, 0x8000)
    reg, entry = type_register(ins, va)
    print("type register: %s" % reg)

    found = {}
    for hi in PREFIXES:
        for mid in range(0x100):
            for lo in range(0x100):
                op = (hi << 16) | (mid << 8) | lo
                sym = run(ins, entry, reg, op, names)
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
