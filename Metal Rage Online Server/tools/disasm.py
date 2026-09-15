#!/usr/bin/env python3
"""
Disassemble the client's DLLs.

The protocol knowledge in this project comes from two places: watching what the
client does, and reading what the client is. This is the second one. It exists
because guessing at packet layouts costs a play session per guess, and reading
the code that parses them costs a minute.

ZNetwork.dll is convenient: its ImageBase is 0x10700000 and, for every section,
the virtual address and the file offset are the same, so an address quoted
anywhere (a VA in someone's notes, an RVA in a tool) maps straight onto the
file with no arithmetic beyond subtracting the base.

Usage:
  tools/disasm.py sections [dll]
  tools/disasm.py exports [dll] [pattern]
  tools/disasm.py at <va> [count] [dll]          disassemble from an address
  tools/disasm.py func <name> [count] [dll]      disassemble an export by name
  tools/disasm.py xref <va> [dll]                find calls/references to it
  tools/disasm.py str <text> [dll]               locate a string (ASCII + UTF-16)

Addresses may be given as 0x10733cf0 (VA) or 33cf0 (RVA); both resolve.
Default dll is ZNetwork.dll in the installed client.
"""
import sys, os, re, struct

try:
    import pefile
    from capstone import Cs, CS_ARCH_X86, CS_MODE_32
except ImportError:
    sys.exit("needs: pip install pefile capstone")

CLIENT = "/mnt/c/Games/MetalRage Online/data/System"
DEFAULT_DLL = "ZNetwork.dll"


def load(dll):
    path = dll if os.path.sep in dll else os.path.join(CLIENT, dll)
    pe = pefile.PE(path, fast_load=True)
    return pe, open(path, "rb").read(), pe.OPTIONAL_HEADER.ImageBase


def to_off(pe, base, addr):
    """Accepts a VA or an RVA and returns a file offset."""
    rva = addr - base if addr >= base else addr
    for s in pe.sections:
        if s.VirtualAddress <= rva < s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData):
            return s.PointerToRawData + (rva - s.VirtualAddress)
    return rva


def cmd_sections(dll):
    pe, _, base = load(dll)
    print("ImageBase 0x%08x   SizeOfImage 0x%08x" % (base, pe.OPTIONAL_HEADER.SizeOfImage))
    print("%-10s %-10s %-10s %-10s" % ("name", "rva", "vsize", "rawptr"))
    for s in pe.sections:
        print("%-10s 0x%08x 0x%08x 0x%08x" % (
            s.Name.rstrip(b"\0").decode("latin1"), s.VirtualAddress,
            s.Misc_VirtualSize, s.PointerToRawData))


def exports(pe, base):
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_EXPORT"]])
    out = []
    if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
        for e in pe.DIRECTORY_ENTRY_EXPORT.symbols:
            if e.name:
                out.append((e.name.decode("latin1"), base + e.address))
    return out


def cmd_exports(dll, pattern=None):
    pe, _, base = load(dll)
    names = exports(pe, base)
    if pattern:
        rx = re.compile(pattern, re.I)
        names = [n for n in names if rx.search(n[0])]
    for name, va in sorted(names, key=lambda x: x[0]):
        print("0x%08x  %s" % (va, name))
    print("\n%d export(s)" % len(names))


def disasm(data, base, pe, addr, count):
    off = to_off(pe, base, addr)
    va = addr if addr >= base else base + addr
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    for i in md.disasm(data[off:off + count * 10], va):
        yield i
        count -= 1
        if count <= 0:
            return


def cmd_at(dll, addr, count):
    pe, data, base = load(dll)
    for i in disasm(data, base, pe, addr, count):
        print("  0x%08x  %-24s %s" % (i.address, i.mnemonic, i.op_str))


def cmd_func(dll, name, count):
    pe, data, base = load(dll)
    hits = [(n, va) for n, va in exports(pe, base) if name.lower() in n.lower()]
    if not hits:
        sys.exit("no export matching %r" % name)
    for n, va in hits[:4]:
        print("=== %s  @ 0x%08x ===" % (n, va))
        for i in disasm(data, base, pe, va, count):
            print("  0x%08x  %-24s %s" % (i.address, i.mnemonic, i.op_str))
        print()


def cmd_xref(dll, addr):
    """Find direct calls/jumps to an address, and dword references to it."""
    pe, data, base = load(dll)
    target = addr if addr >= base else base + addr
    text = next(s for s in pe.sections if s.Name.startswith(b".text"))
    lo, hi = text.PointerToRawData, text.PointerToRawData + text.SizeOfRawData
    found = 0
    for off in range(lo, hi - 5):
        op = data[off]
        if op in (0xE8, 0xE9):  # call rel32 / jmp rel32
            rel = struct.unpack_from("<i", data, off + 1)[0]
            src = base + (off - text.PointerToRawData) + text.VirtualAddress
            if src + 5 + rel == target:
                print("  0x%08x  %s 0x%08x" % (src, "call" if op == 0xE8 else "jmp", target))
                found += 1
    ptr = struct.pack("<I", target)
    start = 0
    while True:
        i = data.find(ptr, start)
        if i < 0:
            break
        print("  file 0x%06x  dword reference" % i)
        found += 1
        start = i + 1
    print("\n%d reference(s)" % found)


def cmd_str(dll, text):
    _, data, _ = load(dll)
    for label, enc in (("ascii", "ascii"), ("utf-16le", "utf-16le")):
        pat = text.encode(enc, errors="ignore")
        start, n = 0, 0
        while True:
            i = data.find(pat, start)
            if i < 0:
                break
            print("  %-9s file 0x%06x" % (label, i))
            start, n = i + 1, n + 1
        if not n:
            print("  %-9s not found" % label)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    cmd = a[0]
    num = lambda s: int(s, 16) if s.lower().startswith("0x") else int(s, 16)
    if cmd == "sections":
        cmd_sections(a[1] if len(a) > 1 else DEFAULT_DLL)
    elif cmd == "exports":
        cmd_exports(a[1] if len(a) > 1 else DEFAULT_DLL, a[2] if len(a) > 2 else None)
    elif cmd == "at":
        cmd_at(a[3] if len(a) > 3 else DEFAULT_DLL, num(a[1]), int(a[2]) if len(a) > 2 else 40)
    elif cmd == "func":
        cmd_func(a[3] if len(a) > 3 else DEFAULT_DLL, a[1], int(a[2]) if len(a) > 2 else 60)
    elif cmd == "xref":
        cmd_xref(a[2] if len(a) > 2 else DEFAULT_DLL, num(a[1]))
    elif cmd == "str":
        cmd_str(a[2] if len(a) > 2 else DEFAULT_DLL, a[1])
    else:
        sys.exit("unknown command %r" % cmd)
