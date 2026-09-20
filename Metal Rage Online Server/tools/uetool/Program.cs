// uetool: read decrypted Unreal Engine 2 packages from the client (offline).
//
// Build UELib once (net8.0, C# 12):
//   git clone https://github.com/EliotVU/Unreal-Library ~/tools/Unreal-Library
//   git -C ~/tools/Unreal-Library apply "$(pwd)/tools/uetool/uelib-metalrage.patch"
//   dotnet build ~/tools/Unreal-Library/src/Eliot.UELib.csproj -c Release -p:GeneratePackageOnBuild=false \
//     -p:UELibTargetFrameworks=net8.0 -p:TargetFrameworks=net8.0 -p:LangVersion=12
// Then:
//   dotnet run --project tools/uetool -- <pkg.u> list [ClassName]
//   dotnet run --project tools/uetool -- <pkg.u> decompile <Object>     class/function/object text, incl. defaultproperties
//   dotnet run --project tools/uetool -- <pkg.u> get <Object> <Property>
using UELib;

if (args.Length < 2) { Console.Error.WriteLine("usage: uetool <pkg.u> list [Class] | decompile <Object> | get <Object> <Property>"); return 1; }
System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);

var pkg = UnrealLoader.LoadPackage(args[0]);
pkg.InitializePackage(UnrealPackage.InitFlags.Construct | UnrealPackage.InitFlags.RegisterClasses);

switch (args[1])
{
    case "list":
        foreach (var o in pkg.Objects.Where(o => args.Length < 3 || o.Class?.Name == args[2]))
            Console.WriteLine(o.GetReferencePath());
        return 0;
    // flags: the function's native FunctionFlags word. GameHi added keywords
    // (ToAll, ToTheOthers) that the script text shows next to `reliable`, and
    // the script text is the only place they appear -- whether ToAll actually
    // sets FUNC_NetReliable is what decides if a declared-reliable call really
    // retransmits. Compare a ToAll function against a plain reliable one.
    case "flags":
    {
        var fnObj = pkg.FindObjectByGroup(args[2]);
        if (fnObj == null) { Console.Error.WriteLine($"not found: {args[2]}"); return 1; }
        fnObj.BeginDeserializing();
        if (fnObj is UELib.Core.UFunction ufn)
        {
            var raw = (ulong)ufn.FunctionFlags;
            Console.WriteLine($"{ufn.GetReferencePath()}  FunctionFlags=0x{raw:x8}");
            foreach (var (bit, name) in new (ulong, string)[] {
                (0x00000001, "Final"), (0x00000002, "Defined"), (0x00000004, "Iterator"),
                (0x00000008, "Latent"), (0x00000010, "PreOperator"), (0x00000020, "Singular"),
                (0x00000040, "Net"), (0x00000080, "NetReliable"), (0x00000100, "Simulated"),
                (0x00000200, "Exec"), (0x00000400, "Native"), (0x00000800, "Event"),
                (0x00001000, "Operator"), (0x00002000, "Static"), (0x00004000, "NoExport"),
                (0x00008000, "Const"), (0x00010000, "Invariant"), (0x00020000, "Public"),
                (0x00040000, "Private"), (0x00080000, "Protected"), (0x00100000, "Delegate"),
                (0x00200000, "NetServer"), (0x00800000, "NetClient"),
            })
                if ((raw & bit) != 0) Console.WriteLine($"  0x{bit:x8} {name}");
            return 0;
        }
        Console.Error.WriteLine($"{args[2]} is not a function ({fnObj.Class?.Name})");
        return 1;
    }
    case "decompile":
    case "get":
    {
        var obj = pkg.FindObjectByGroup(args[2]);
        if (obj == null) { Console.Error.WriteLine($"not found: {args[2]}"); return 1; }
        obj.BeginDeserializing();
        if (args[1] == "decompile") { Console.WriteLine(obj.Decompile()); return 0; }
        var p = obj.Properties?.Find(args[3]);
        if (p == null) { Console.Error.WriteLine($"no property {args[3]}"); return 1; }
        Console.WriteLine(p.Decompile());
        return 0;
    }
}
Console.Error.WriteLine($"unknown command {args[1]}");
return 1;
