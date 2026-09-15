// Decompiles the functions containing the addresses given as script arguments.
//
// Reading the client's assembly by hand works but is slow and easy to get
// wrong — a misread of one operand cost most of a day. This prints C instead.
//
// Run through tools/ghidra/decompile.sh, which handles the headless project
// and the one-time analysis pass.
//
//@category MRO
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class DecompileAt extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            println("usage: -postScript DecompileAt.java <addr> [addr ...]");
            return;
        }

        DecompInterface decomp = new DecompInterface();
        if (!decomp.openProgram(currentProgram)) {
            println("// could not open program: " + decomp.getLastMessage());
            return;
        }

        for (String arg : args) {
            Address addr;
            try {
                addr = currentProgram.getAddressFactory().getAddress(arg);
            } catch (Exception e) {
                println("// bad address: " + arg);
                continue;
            }

            Function fn = getFunctionContaining(addr);
            if (fn == null) {
                // Not every address Ghidra imports lands inside a recognised
                // function; make one so the address is still readable.
                fn = createFunction(addr, null);
            }
            if (fn == null) {
                println("// no function at " + arg);
                continue;
            }

            println("// ======== " + arg + "  " + fn.getName()
                    + "  @ " + fn.getEntryPoint() + " ========");

            DecompileResults res = decomp.decompileFunction(fn, 180, monitor);
            if (res == null || !res.decompileCompleted()) {
                println("// decompile failed: "
                        + (res == null ? "no result" : res.getErrorMessage()));
                continue;
            }
            println(res.getDecompiledFunction().getC());
        }

        decomp.dispose();
    }
}
