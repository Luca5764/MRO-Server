import pefile, sys, os, json

SRC = "/mnt/c/Games/鐵影特攻(MetalRage Online)/data/System"

targets = ["MetalRage.exe"] + sorted(f for f in os.listdir(SRC) if f.lower().endswith(".dll"))

result = {}
for fn in targets:
    path = os.path.join(SRC, fn)
    try:
        pe = pefile.PE(path, fast_load=True)
        pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT']])
    except Exception as e:
        result[fn] = {"error": str(e)}
        continue
    machine = hex(pe.FILE_HEADER.Machine)
    imports = {}
    if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            dllname = entry.dll.decode(errors="replace")
            imports.setdefault(dllname, 0)
            imports[dllname] += len(entry.imports)
    # export count if this file has exports (for the DLL's own export table)
    exp_count = 0
    try:
        pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_EXPORT']])
        if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
            exp_count = len(pe.DIRECTORY_ENTRY_EXPORT.symbols)
    except Exception:
        pass
    result[fn] = {"machine": machine, "imports": imports, "export_count": exp_count}
    pe.close()

with open("/tmp/imports_dump.json", "w") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("done", len(result))
