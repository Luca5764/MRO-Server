#!/bin/bash
# Decompile functions of the client's DLLs by address.
#
#   tools/ghidra/decompile.sh 0x107d8ae0 [more addresses ...]
#   DLL=Engine.dll tools/ghidra/decompile.sh 0x...
#
# The first run for a DLL analyses it and keeps the result in a Ghidra project
# under ~/.cache/mro-ghidra, so later runs start immediately.
set -e

GHIDRA=${GHIDRA:-$HOME/tools/ghidra_12.1.3_PUBLIC}
CLIENT=${CLIENT:-/mnt/c/Games/MetalRage Online/data/System}
DLL=${DLL:-ZNetwork.dll}
PROJDIR=${PROJDIR:-$HOME/tools/mro-ghidra-proj}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ $# -ge 1 ] || { sed -n '2,8p' "$0"; exit 1; }
mkdir -p "$PROJDIR"

PROJ="mro_${DLL%.dll}"
if [ -d "$PROJDIR/$PROJ.rep" ]; then
    MODE=(-process "$DLL" -noanalysis)
else
    MODE=(-import "$CLIENT/$DLL")
fi

# Headless prefixes only the first line of each println, so the C body arrives
# unprefixed. Cut from the first banner and strip the prefix where it appears.
"$GHIDRA/support/analyzeHeadless" "$PROJDIR" "$PROJ" \
    "${MODE[@]}" \
    -scriptPath "$HERE" \
    -postScript DecompileAt.java "$@" \
    2>&1 | python3 -c '
import sys, re
s = sys.stdin.read()
i = s.find("// ======== ")
if i < 0:
    err = [l for l in s.splitlines() if "ERROR" in l or "Exec failed" in l]
    sys.exit("no decompilation.\n" + "\n".join(err[-5:]))
s = s[i:]
j = s.find("INFO  ANALYZING changes")
if j > 0:
    s = s[:j]
s = re.sub(r"^INFO  DecompileAt\.java> ", "", s, flags=re.M)
s = re.sub(r" \(GhidraScript\)\s*$", "", s, flags=re.M)
print(s.rstrip())
'
