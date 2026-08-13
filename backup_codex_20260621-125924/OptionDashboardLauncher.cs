using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

internal static class OptionDashboardLauncher
{
    private const string BackendUrl = "http://127.0.0.1:5000/api/health";
    private const string FrontendUrl = "http://localhost:5173/";
    private static Process backendProcess;
    private static Process frontendProcess;

    private static int Main(string[] args)
    {
        Console.Title = "Options Dashboard Launcher";
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string backendDir = Path.Combine(root, "backend");
        string python = Path.Combine(backendDir, ".venv", "Scripts", "python.exe");
        string npm = FindNpm();
        bool checkOnly = HasArg(args, "--check");
        bool noBrowser = HasArg(args, "--no-browser");

        Console.WriteLine("Options Command Dashboard Launcher");
        Console.WriteLine("Project: " + root);
        Console.WriteLine();

        if (!Directory.Exists(backendDir))
        {
            Fail("Backend folder not found: " + backendDir);
            return 1;
        }

        if (!File.Exists(python))
        {
            Fail("Python virtual environment not found: " + python);
            Console.WriteLine("Create it first or restore backend\\.venv.");
            return 1;
        }

        if (!File.Exists(Path.Combine(backendDir, "server.py")))
        {
            Fail("backend\\server.py not found.");
            return 1;
        }

        if (!File.Exists(Path.Combine(root, "package.json")))
        {
            Fail("package.json not found.");
            return 1;
        }

        if (string.IsNullOrEmpty(npm))
        {
            Fail("npm.cmd not found. Install Node.js or add it to PATH.");
            return 1;
        }

        Console.WriteLine("Python: " + python);
        Console.WriteLine("npm:    " + npm);

        if (checkOnly)
        {
            Console.WriteLine();
            Success("Launcher check passed.");
            return 0;
        }

        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e)
        {
            e.Cancel = true;
            StopChildren();
            Environment.Exit(0);
        };

        if (!UrlOk(BackendUrl, 1500))
        {
            backendProcess = StartProcess("Backend", python, "server.py", backendDir);
        }
        else
        {
            Success("Backend already running.");
        }

        if (!UrlOk(FrontendUrl, 1500))
        {
            string cmd = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            string npmArgs = "/c \"\"" + npm + "\" run dev -- --host 127.0.0.1 --port 5173\"";
            frontendProcess = StartProcess("Frontend", cmd, npmArgs, root);
        }
        else
        {
            Success("Frontend already running.");
        }

        Console.WriteLine();
        Console.WriteLine("Waiting for services...");

        bool backendReady = WaitForUrl(BackendUrl, 90000);
        bool frontendReady = WaitForUrl(FrontendUrl, 90000);

        if (!backendReady)
        {
            Warn("Backend did not respond on port 5000.");
        }

        if (!frontendReady)
        {
            Warn("Frontend did not respond on port 5173.");
        }

        if (backendReady && frontendReady)
        {
            Success("Dashboard is ready: " + FrontendUrl);
            if (!noBrowser)
            {
                Process.Start(new ProcessStartInfo(FrontendUrl) { UseShellExecute = true });
            }
        }
        else
        {
            Warn("Dashboard started with issues. Keep this window open and read the logs above.");
        }

        Console.WriteLine();
        Console.WriteLine("Keep this window open while using the dashboard.");
        Console.WriteLine("Press Ctrl+C to stop launcher-started services.");

        while (true)
        {
            Thread.Sleep(1000);
        }
    }

    private static Process StartProcess(string name, string fileName, string arguments, string workingDirectory)
    {
        Console.WriteLine("Starting " + name + "...");
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = fileName;
        info.Arguments = arguments;
        info.WorkingDirectory = workingDirectory;
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;

        Process process = new Process();
        process.StartInfo = info;
        process.EnableRaisingEvents = true;
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (!string.IsNullOrWhiteSpace(e.Data)) Console.WriteLine("[" + name + "] " + e.Data);
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (!string.IsNullOrWhiteSpace(e.Data)) Console.WriteLine("[" + name + "] " + e.Data);
        };
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static bool WaitForUrl(string url, int timeoutMs)
    {
        Stopwatch watch = Stopwatch.StartNew();
        while (watch.ElapsedMilliseconds < timeoutMs)
        {
            if (UrlOk(url, 1500)) return true;
            Thread.Sleep(1000);
        }
        return false;
    }

    private static bool UrlOk(string url, int timeoutMs)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = timeoutMs;
            request.ReadWriteTimeout = timeoutMs;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                int code = (int)response.StatusCode;
                return code >= 200 && code < 500;
            }
        }
        catch
        {
            return false;
        }
    }

    private static string FindNpm()
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(Path.PathSeparator))
        {
            try
            {
                string candidate = Path.Combine(dir.Trim(), "npm.cmd");
                if (File.Exists(candidate)) return candidate;
            }
            catch
            {
            }
        }

        string nodeDefault = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "nodejs",
            "npm.cmd"
        );
        return File.Exists(nodeDefault) ? nodeDefault : "";
    }

    private static bool HasArg(string[] args, string value)
    {
        foreach (string arg in args)
        {
            if (string.Equals(arg, value, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static void StopChildren()
    {
        TryKill(frontendProcess);
        TryKill(backendProcess);
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (process != null && !process.HasExited) process.Kill();
        }
        catch
        {
        }
    }

    private static void Success(string message)
    {
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine(message);
        Console.ResetColor();
    }

    private static void Warn(string message)
    {
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine(message);
        Console.ResetColor();
    }

    private static void Fail(string message)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(message);
        Console.ResetColor();
    }
}
