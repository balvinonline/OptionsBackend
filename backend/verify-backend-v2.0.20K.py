from pathlib import Path
import argparse
import py_compile

CHECKS = [
    "# --- V2.0.20J DEVICE PUSH START ---",
    "# --- V2.0.20K BACKGROUND ATTENTION MONITOR START ---",
    "CREATE TABLE IF NOT EXISTS device_push_tokens",
    "CREATE TABLE IF NOT EXISTS server_alert_state",
    "@app.route('/api/device/register', methods=['POST'])",
    "@app.route('/api/device/test-push', methods=['POST'])",
    "@app.route('/api/device/attention-status', methods=['GET'])",
    "background_attention_monitor_loop",
    "FAST MOVE WATCH",
    "PREPARE ·",
    "Derivative movement, not spot-gap",
    'SERVER_BUILD_MARKER = "v2.0.20k-attention-20260901"',
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("server", nargs="?", default="server.py")
    args = parser.parse_args()
    path = Path(args.server).resolve()
    text = path.read_text(encoding="utf-8")
    for marker in CHECKS:
        if marker not in text:
            raise SystemExit(f"Missing marker: {marker}")
        print("OK", marker)
    py_compile.compile(str(path), doraise=True)
    print("Python syntax check passed.")
    print("V2.0.20K backend verification passed.")

if __name__ == "__main__":
    main()
