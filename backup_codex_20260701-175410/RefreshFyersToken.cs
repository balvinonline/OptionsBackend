using System;
using System.Diagnostics;
using System.IO;

internal static class RefreshFyersToken
{
    private static int Main(string[] args)
    {
        Console.Title = "Refresh Fyers Token";
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string backendDir = Path.Combine(root, "backend");
        string python = Path.Combine(backendDir, ".venv", "Scripts", "python.exe");
        string script = Path.Combine(backendDir, "get_token.py");
        bool checkOnly = HasArg(args, "--check");

        Console.WriteLine("Fyers Token Refresh");
        Console.WriteLine("Project: " + root);
        Console.WriteLine();

        if (!File.Exists(python))
        {
            Fail("Python virtual environment not found:");
            Console.WriteLine(python);
            Pause();
            return 1;
        }

        if (!File.Exists(script))
        {
            Fail("Token script not found:");
            Console.WriteLine(script);
            Pause();
            return 1;
        }

        if (checkOnly)
        {
            Success("Token refresh helper check passed.");
            return 0;
        }

        Console.WriteLine("This will open Fyers login in your browser.");
        Console.WriteLine("After login, copy the final browser URL and paste it here.");
        Console.WriteLine();

        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = python;
        info.Arguments = "get_token.py";
        info.WorkingDirectory = backendDir;
        info.UseShellExecute = false;

        Process process = Process.Start(info);
        process.WaitForExit();

        Console.WriteLine();
        if (process.ExitCode == 0)
        {
            Success("Token refresh finished. Click Refresh on the dashboard.");
        }
        else
        {
            Fail("Token refresh did not complete successfully.");
        }

        Pause();
        return process.ExitCode;
    }

    private static bool HasArg(string[] args, string value)
    {
        foreach (string arg in args)
        {
            if (string.Equals(arg, value, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static void Pause()
    {
        Console.WriteLine();
        Console.WriteLine("Press Enter to close this window.");
        Console.ReadLine();
    }

    private static void Success(string message)
    {
        Console.ForegroundColor = ConsoleColor.Green;
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
