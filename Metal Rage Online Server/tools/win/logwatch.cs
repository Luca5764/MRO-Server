// logwatch.cs -- read-only, background tail of a MetalRage client's `-log=`
// window text via WM_GETTEXTLENGTH/WM_GETTEXT, since the log FILE itself is
// held open with no share flags the entire time the client runs (real
// ERROR_SHARING_VIOLATION, not a WSL translation quirk -- see
// docs/journal/2026-09-21-1900-client-log-capture-probes.md). The window's
// EDIT control ("<ProcName>UnrealWEditTerminal", a child of a
// "<ProcName>UnrealWLog" top-level window -- both class names carry the
// exe's own process name as a prefix, confirmed against both "MetalRage"
// and "MetalRage2" instances) holds the same text in its own memory, which
// never goes through that lock.
//
// This is a rewrite of tools/win/logwatch.ps1 (WIP, reproducibly crashed
// powershell.exe at the WM_GETTEXT step -- see this file's own journal
// entry, "第二階段卡住" section) as a standalone C# program, compiled with
// the in-box .NET Framework csc.exe (no external packages, no SDK --
// see tools/win/logwatch.sh). Phase 1 (a minimal standalone probe doing
// exactly the WM_GETTEXTLENGTH/WM_GETTEXT calls below) was already 8/8
// reliable; the crash was specific to PowerShell's script-block/delegate
// marshaling layer, not the Win32 calls themselves -- so this file's logic
// is a straight port of logwatch.ps1's (already-designed) behavior onto a
// plain C# host, not a redesign.
//
// HARD LIMITS (do not relax any of these -- see this file's task contract):
//   - Sends ONLY WM_GETTEXTLENGTH and WM_GETTEXT, both via SendMessageTimeout
//     with SMTO_ABORTIFHUNG and an explicit timeout. Never plain SendMessage
//     (blocks forever), never SetForegroundWindow/SetFocus/ShowWindow/
//     activate, never touches the mouse or keyboard. Window/class
//     identification uses GetClassName only, a local class-atom lookup, NOT
//     a message sent to the target's queue (unlike GetWindowText, which
//     internally does an untimed SendMessage(WM_GETTEXT) for cross-process
//     windows -- deliberately never called here).
//   - The target process name is matched exactly (Process.GetProcessesByName
//     does an exact name match, never a prefix/wildcard) -- "MetalRage" is a
//     prefix of "MetalRage2".
//   - Never touches MetalRage.exe itself (no injection, no hooking, no
//     writes to its memory) -- read-only Win32 queries against its windows
//     only.
//
// Loud-failure contract (all four cases: write one clear JSON error line to
// the output file, flush, exit non-zero -- never silently continue or retry
// forever):
//   exit 2  window not found      (process gone, or no top-level window of
//                                   its own found -- after an initial
//                                   --startup-grace-sec grace period for a
//                                   just-launched client's window to appear)
//   exit 3  control not found     (a top-level window exists, but no child
//                                   whose class name contains "Edit" was
//                                   found -- same startup grace period
//                                   applies)
//   exit 4  message timeout/hang  (SendMessageTimeout returned 0, i.e. it
//                                   aborted a hung target -- SMTO_ABORTIFHUNG)
//   exit 5  stall                 (text length has not changed for
//                                   --stall-sec seconds even though the
//                                   process is still present and every query
//                                   is still succeeding -- 300s default,
//                                   carried over from logwatch.ps1: a login
//                                   screen sitting idle for a few minutes
//                                   with an unchanged log is normal, not a
//                                   hang)
//   exit 1  bad arguments / usage error (not one of the four loud-failure
//                                   categories above, but still non-zero and
//                                   printed to stderr before anything else
//                                   runs)
//
// Dedup ("tail-segment comparison", per the task contract -- the EDIT
// control has a scrollback cap and drops old lines off the FRONT as new
// ones are appended, so new content cannot be assumed to only ever appear
// at the very end): each poll splits the control's current full text into
// lines and finds the longest run of the previous poll's OWN tail that
// reappears as a prefix of the new lines (GetNewLines below); only the
// lines after that overlap are emitted. If no overlap at all is found (the
// whole previous tail fell out of the buffer between polls, or the
// control's content was replaced outright), every current line is emitted
// as new AND a "rebaseline" marker line is written first, so a consumer can
// tell "these are genuinely new" apart from "we lost the join point" --
// never treated as a failure by itself.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class LogWatch
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    // WM_GETTEXTLENGTH: lParam unused (IntPtr overload).
    [DllImport("user32.dll", CharSet = CharSet.Auto, EntryPoint = "SendMessageTimeout")]
    private static extern IntPtr SendMessageTimeoutLen(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam,
        uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

    // WM_GETTEXT: lParam = output buffer (StringBuilder overload). USER32
    // marshals WM_GETTEXT/WM_SETTEXT strings across the process boundary
    // itself (these are on its fixed list of messages with known layouts),
    // so passing a plain managed StringBuilder here (not a shared/mapped
    // buffer) is the normal, correct usage -- same technique GetWindowText
    // uses internally, just with an explicit timeout instead of
    // GetWindowText's own untimed SendMessage.
    [DllImport("user32.dll", CharSet = CharSet.Auto, EntryPoint = "SendMessageTimeout")]
    private static extern IntPtr SendMessageTimeoutText(IntPtr hWnd, uint msg, IntPtr wParam, StringBuilder lParam,
        uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

    private const uint WM_GETTEXTLENGTH = 0x000E;
    private const uint WM_GETTEXT = 0x000D;
    private const uint SMTO_ABORTIFHUNG = 0x0002;
    private const uint MSG_TIMEOUT_MS = 2000;

    private static string _outPath;
    private static string _procName;

    private sealed class Resolved
    {
        public bool Found;
        public string Stage; // "process" | "window" | "control"
        public IntPtr Hwnd;
        public IntPtr Top;
        public string ClassName;
        public List<int> Pids;
    }

    // Set by the EnumWindows callback below (a plain static C# delegate on a
    // named method, not a PowerShell script-block-turned-delegate -- this is
    // exactly the piece that reproducibly crashed powershell.exe; see the
    // module header comment).
    private static List<int> _targetPids;
    private static bool _sawOwnTopWindow;
    private static bool _foundChild;
    private static IntPtr _foundHwnd;
    private static IntPtr _foundTop;
    private static string _foundClass;

    private static bool EnumWindowsCallback(IntPtr hWnd, IntPtr lParam)
    {
        uint wpid;
        GetWindowThreadProcessId(hWnd, out wpid);
        if (!_targetPids.Contains((int)wpid)) return true; // keep enumerating

        _sawOwnTopWindow = true;

        IntPtr childFound = IntPtr.Zero;
        string childClass = null;
        EnumChildWindows(hWnd, (ch, l2) =>
        {
            var sb = new StringBuilder(256);
            GetClassName(ch, sb, sb.Capacity);
            string cls = sb.ToString();
            if (cls.IndexOf("Edit", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                childFound = ch;
                childClass = cls;
                return false; // stop EnumChildWindows
            }
            return true;
        }, IntPtr.Zero);

        if (childFound != IntPtr.Zero)
        {
            _foundChild = true;
            _foundHwnd = childFound;
            _foundTop = hWnd;
            _foundClass = childClass;
            return false; // stop EnumWindows -- found it
        }
        return true; // this top window of ours had no Edit child; keep looking at others
    }

    private static Resolved FindLogEditControl(string procName)
    {
        Process[] procs;
        try { procs = Process.GetProcessesByName(procName); }
        catch { procs = new Process[0]; }
        if (procs.Length == 0)
        {
            return new Resolved { Found = false, Stage = "process", Pids = new List<int>() };
        }
        var pids = procs.Select(p => p.Id).ToList();

        _targetPids = pids;
        _sawOwnTopWindow = false;
        _foundChild = false;
        _foundHwnd = IntPtr.Zero;
        _foundTop = IntPtr.Zero;
        _foundClass = null;

        EnumWindows(EnumWindowsCallback, IntPtr.Zero);

        if (_foundChild)
        {
            return new Resolved
            {
                Found = true,
                Stage = "control",
                Hwnd = _foundHwnd,
                Top = _foundTop,
                ClassName = _foundClass,
                Pids = pids
            };
        }
        return new Resolved
        {
            Found = false,
            Stage = _sawOwnTopWindow ? "control" : "window",
            Pids = pids
        };
    }

    private sealed class ReadResult
    {
        public bool Ok;
        public string Text;
        public bool Hang;
        public string Where;
    }

    private static ReadResult ReadEditText(IntPtr hwnd)
    {
        IntPtr lenResult;
        IntPtr r1 = SendMessageTimeoutLen(hwnd, WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero,
            SMTO_ABORTIFHUNG, MSG_TIMEOUT_MS, out lenResult);
        if (r1 == IntPtr.Zero) return new ReadResult { Ok = false, Hang = true, Where = "WM_GETTEXTLENGTH" };

        long len = lenResult.ToInt64();
        if (len <= 0) return new ReadResult { Ok = true, Text = "" };

        var sb = new StringBuilder((int)len + 1);
        IntPtr getResult;
        IntPtr r2 = SendMessageTimeoutText(hwnd, WM_GETTEXT, new IntPtr(len + 1), sb,
            SMTO_ABORTIFHUNG, MSG_TIMEOUT_MS, out getResult);
        if (r2 == IntPtr.Zero) return new ReadResult { Ok = false, Hang = true, Where = "WM_GETTEXT" };
        return new ReadResult { Ok = true, Text = sb.ToString() };
    }

    private sealed class DiffResult
    {
        public bool Rebaseline;
        public string[] Lines;
    }

    // Tail-segment overlap dedup -- see module header comment. searchCap
    // bounds the O(k^2) worst case for a pathologically long buffer; 4000
    // lines is already far beyond what a bounded-scrollback EDIT control is
    // expected to hold, so hitting the cap should mean "no real overlap",
    // not "overlap missed because we didn't look far enough" -- treated the
    // same as any other no-overlap case (full rebaseline).
    private static DiffResult GetNewLines(string[] prevLines, string[] curLines)
    {
        if (prevLines.Length == 0) return new DiffResult { Rebaseline = true, Lines = curLines };
        const int searchCap = 4000;
        int maxK = Math.Min(Math.Min(prevLines.Length, curLines.Length), searchCap);
        for (int k = maxK; k >= 1; k--)
        {
            bool match = true;
            for (int i = 0; i < k; i++)
            {
                if (prevLines[prevLines.Length - k + i] != curLines[i]) { match = false; break; }
            }
            if (match)
            {
                if (k == curLines.Length) return new DiffResult { Rebaseline = false, Lines = new string[0] };
                return new DiffResult { Rebaseline = false, Lines = curLines.Skip(k).ToArray() };
            }
        }
        return new DiffResult { Rebaseline = true, Lines = curLines };
    }

    private static string NowIso()
    {
        // Mirrors logwatch.ps1's (Get-Date).ToString("o") -- local time,
        // round-trip format, so any consumer built against the old jsonl
        // shape still parses this one the same way.
        return DateTime.Now.ToString("o", CultureInfo.InvariantCulture);
    }

    private static string JsonEscape(string s)
    {
        if (s == null) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.AppendFormat("\\u{0:x4}", (int)c);
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }

    // Minimal hand-rolled JSON object writer -- no external JSON package is
    // allowed (in-box csc.exe only, see tools/win/logwatch.sh), and the
    // field set here is small and fixed, so this is simpler and more
    // auditable than pulling in System.Web.Script.Serialization.
    private sealed class JsonLine
    {
        private readonly List<KeyValuePair<string, string>> _fields = new List<KeyValuePair<string, string>>();

        public JsonLine Add(string key, string value)
        {
            _fields.Add(new KeyValuePair<string, string>(key, "\"" + JsonEscape(value) + "\""));
            return this;
        }

        public JsonLine AddRaw(string key, string rawValue)
        {
            _fields.Add(new KeyValuePair<string, string>(key, rawValue));
            return this;
        }

        public override string ToString()
        {
            var sb = new StringBuilder("{");
            for (int i = 0; i < _fields.Count; i++)
            {
                if (i > 0) sb.Append(",");
                sb.Append("\"").Append(_fields[i].Key).Append("\":").Append(_fields[i].Value);
            }
            sb.Append("}");
            return sb.ToString();
        }
    }

    // Every JSON line carries "proc" as the instance identifier -- per
    // docs/research/2026-09-20-dual-pico/design.md's instance table, the
    // process name (MetalRage vs MetalRage2) already uniquely identifies
    // which client instance a line came from, so no separate id is minted.
    private static void WriteJsonLine(JsonLine line)
    {
        line.Add("ts", NowIso());
        line.Add("proc", _procName);
        File.AppendAllText(_outPath, line + Environment.NewLine, new UTF8Encoding(false));
    }

    private static void FailLoud(int code, string reason, JsonLine extra)
    {
        var line = new JsonLine().Add("type", "error").Add("reason", reason);
        if (extra != null) line = extra.Add("type", "error").Add("reason", reason);
        WriteJsonLine(line);
        Console.Error.WriteLine("[FATAL] " + reason);
        Environment.Exit(code);
    }

    private static void Usage()
    {
        Console.Error.WriteLine(
            "usage: LogWatch.exe --proc NAME --out PATH [--hz N] [--startup-grace-sec N] " +
            "[--stall-sec N] [--max-seconds N]");
    }

    private static int Main(string[] args)
    {
        double hz = 3.0;
        int startupGraceSec = 15;
        int stallSec = 300;
        int maxSeconds = 0;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--proc":
                    if (++i >= args.Length) { Usage(); return 1; }
                    _procName = args[i];
                    break;
                case "--out":
                    if (++i >= args.Length) { Usage(); return 1; }
                    _outPath = args[i];
                    break;
                case "--hz":
                    if (++i >= args.Length || !double.TryParse(args[i], NumberStyles.Float, CultureInfo.InvariantCulture, out hz)) { Usage(); return 1; }
                    break;
                case "--startup-grace-sec":
                    if (++i >= args.Length || !int.TryParse(args[i], out startupGraceSec)) { Usage(); return 1; }
                    break;
                case "--stall-sec":
                    if (++i >= args.Length || !int.TryParse(args[i], out stallSec)) { Usage(); return 1; }
                    break;
                case "--max-seconds":
                    if (++i >= args.Length || !int.TryParse(args[i], out maxSeconds)) { Usage(); return 1; }
                    break;
                default:
                    Console.Error.WriteLine("unknown option " + args[i]);
                    Usage();
                    return 1;
            }
        }

        if (string.IsNullOrEmpty(_procName) || string.IsNullOrEmpty(_outPath))
        {
            Usage();
            return 1;
        }

        string outDir = Path.GetDirectoryName(_outPath);
        if (!string.IsNullOrEmpty(outDir) && !Directory.Exists(outDir)) Directory.CreateDirectory(outDir);

        int intervalMs = (int)(1000.0 / hz);
        DateTime startTime = DateTime.Now;
        Resolved resolved = null;
        string[] prevLines = new string[0];
        DateTime lastChangeTime = DateTime.Now;
        long lastLen = -1;

        Console.WriteLine(string.Format(
            "[logwatch] starting: proc={0} out={1} hz={2} interval_ms={3} stall_sec={4}",
            _procName, _outPath, hz, intervalMs, stallSec));
        WriteJsonLine(new JsonLine().Add("type", "start")
            .AddRaw("hz", hz.ToString(CultureInfo.InvariantCulture))
            .AddRaw("stall_sec", stallSec.ToString(CultureInfo.InvariantCulture)));

        while (true)
        {
            if (maxSeconds > 0 && (DateTime.Now - startTime).TotalSeconds > maxSeconds)
            {
                WriteJsonLine(new JsonLine().Add("type", "stop").Add("reason", "max-seconds reached"));
                Console.WriteLine("[logwatch] max-seconds reached, stopping cleanly");
                return 0;
            }

            if (resolved == null || !IsWindow(resolved.Hwnd))
            {
                var found = FindLogEditControl(_procName);
                if (!found.Found)
                {
                    bool withinGrace = (DateTime.Now - startTime).TotalSeconds <= startupGraceSec;
                    if (withinGrace)
                    {
                        Thread.Sleep(intervalMs);
                        continue;
                    }
                    string pidList = string.Join(",", found.Pids.Select(p => p.ToString(CultureInfo.InvariantCulture)));
                    if (found.Stage == "process" || found.Stage == "window")
                    {
                        FailLoud(2, string.Format("window not found (stage={0}, proc={1})", found.Stage, _procName),
                            new JsonLine().Add("pids", pidList));
                    }
                    else
                    {
                        FailLoud(3, string.Format("no Edit-class control found under any top-level window of {0}", _procName),
                            new JsonLine().Add("pids", pidList));
                    }
                }
                resolved = found;
                // Freshly (re)resolved: reset dedup/stall state so a control
                // handle change (e.g. window recreated) doesn't get compared
                // against stale text.
                prevLines = new string[0];
                lastChangeTime = DateTime.Now;
                lastLen = -1;
            }

            var r = ReadEditText(resolved.Hwnd);
            if (!r.Ok)
            {
                FailLoud(4, string.Format("SendMessageTimeout hung/timed out on {0} (hwnd=0x{1:X})", r.Where, resolved.Hwnd.ToInt64()),
                    null);
            }

            long curLen = r.Text.Length;
            if (curLen != lastLen)
            {
                lastChangeTime = DateTime.Now;
                lastLen = curLen;
            }
            else if ((DateTime.Now - lastChangeTime).TotalSeconds > stallSec)
            {
                string pidList = string.Join(",", resolved.Pids.Select(p => p.ToString(CultureInfo.InvariantCulture)));
                FailLoud(5, string.Format("text length unchanged ({0} chars) for over {1}s while process is still present", curLen, stallSec),
                    new JsonLine().Add("pid", pidList).Add("hwnd", "0x" + resolved.Hwnd.ToInt64().ToString("X")));
            }

            string[] curLines = r.Text.Split(new[] { "\r\n" }, StringSplitOptions.None);
            var diff = GetNewLines(prevLines, curLines);
            if (diff.Rebaseline && prevLines.Length > 0)
            {
                WriteJsonLine(new JsonLine().Add("type", "rebaseline")
                    .AddRaw("line_count", curLines.Length.ToString(CultureInfo.InvariantCulture)));
            }
            foreach (var line in diff.Lines)
            {
                // trailing empty split artifact (text ending in "\r\n" splits
                // to a final empty string) -- same skip logwatch.ps1 did.
                if (line.Length == 0 && curLines.Length > 0 && line == curLines[curLines.Length - 1]) continue;
                WriteJsonLine(new JsonLine().Add("type", "line").Add("line", line));
            }
            prevLines = curLines;

            Thread.Sleep(intervalMs);
        }
    }
}
