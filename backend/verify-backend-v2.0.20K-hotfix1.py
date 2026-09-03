from __future__ import annotations
import argparse
import py_compile
from pathlib import Path

MARKERS = [
    "# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR START ---",
    "def ensure_background_attention_monitor_started():",
    "@app.before_request",
    "_ensure_background_attention_monitor_for_worker",
    '"threadAlive": bool(_BACKGROUND_ATTENTION_THREAD and _BACKGROUND_ATTENTION_THREAD.is_alive())',
    "refresh_fyers_from_env(force=True)",
    '_BACKGROUND_ATTENTION_STATUS["lastCycleAt"] = ist_now().isoformat(timespec="seconds")',
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("server", nargs="?", default="server.py")
    args = p.parse_args()
    path = Path(args.server).resolve()
    text = path.read_text(encoding="utf-8")
    for marker in MARKERS:
        if marker not in text:
            raise SystemExit(f"MISSING {marker}")
        print(f"OK {marker}")
    py_compile.compile(str(path), doraise=True)
    print("Python syntax check passed.")
    print("V2.0.20K Hotfix-1 verification passed.")

if __name__ == "__main__":
    main()
