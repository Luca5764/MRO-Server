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
