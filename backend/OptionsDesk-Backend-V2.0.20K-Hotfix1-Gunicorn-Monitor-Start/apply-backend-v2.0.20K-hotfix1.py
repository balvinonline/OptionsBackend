from __future__ import annotations

import argparse
import py_compile
import shutil
from datetime import datetime
from pathlib import Path

HOTFIX_MARKER = "# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR START ---"

OLD_STATUS = '''_BACKGROUND_ATTENTION_STATUS = {
    "running": False,
    "lastCycleAt": None,
    "lastDeepScanAt": None,
    "lastError": None,
    "lastAlert": None,
}
'''

NEW_STATUS = '''_BACKGROUND_ATTENTION_STATUS = {
    "running": False,
    "lastCycleAt": None,
    "lastDeepScanAt": None,
    "lastError": None,
    "lastAlert": None,
}
_BACKGROUND_ATTENTION_THREAD = None
_BACKGROUND_ATTENTION_THREAD_LOCK = threading.Lock()
'''

OLD_LOOP_HEAD = '''def background_attention_monitor_loop():
    time.sleep(12)
    _BACKGROUND_ATTENTION_STATUS["running"] = True
    last_deep_scan = 0.0
'''

NEW_LOOP_HEAD = '''def background_attention_monitor_loop():
    # Mark the worker-owned monitor alive immediately. Under gunicorn the app
    # is imported inside the worker, so status must not wait behind startup sleep.
    _BACKGROUND_ATTENTION_STATUS["running"] = True
    _BACKGROUND_ATTENTION_STATUS["lastCycleAt"] = ist_now().isoformat(timespec="seconds")
    _BACKGROUND_ATTENTION_STATUS["lastError"] = None
    time.sleep(2)
    last_deep_scan = 0.0
'''

OLD_MARKET_BLOCK = '''            home = build_home_dashboard() or {}
'''

NEW_MARKET_BLOCK = '''            # A persisted FYERS access token can exist while the in-memory SDK
            # client is still None after a fresh Render/gunicorn worker boot.
            # Rehydrate it before the server-side scan needs market data.
            if fyers is None and os.getenv("FYERS_ACCESS_TOKEN", "").strip():
                refresh_fyers_from_env(force=True)

            home = build_home_dashboard() or {}
'''

OLD_ROUTE_AND_START = '''@app.route('/api/device/attention-status', methods=['GET'])
def api_device_attention_status():
    return jsonify({
        "ok": True,
        "enabled": background_attention_monitor_enabled(),
        "marketWindow": background_attention_market_window(),
        **_BACKGROUND_ATTENTION_STATUS,
        "build": SERVER_BUILD_MARKER,
    })


if background_attention_monitor_enabled():
    threading.Thread(target=background_attention_monitor_loop, daemon=True, name="optionsdesk-attention-monitor").start()
'''

NEW_ROUTE_AND_START = '''# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR START ---
def ensure_background_attention_monitor_started():
    global _BACKGROUND_ATTENTION_THREAD

    if not background_attention_monitor_enabled():
        _BACKGROUND_ATTENTION_STATUS["running"] = False
        return False

    thread = _BACKGROUND_ATTENTION_THREAD
    if thread is not None and thread.is_alive():
        return True

    with _BACKGROUND_ATTENTION_THREAD_LOCK:
        thread = _BACKGROUND_ATTENTION_THREAD
        if thread is not None and thread.is_alive():
            return True

        thread = threading.Thread(
            target=background_attention_monitor_loop,
            daemon=True,
            name="optionsdesk-attention-monitor",
        )
        _BACKGROUND_ATTENTION_THREAD = thread
        thread.start()
        return True


@app.before_request
def _ensure_background_attention_monitor_for_worker():
    # This is intentionally idempotent. It guarantees that the actual gunicorn
    # worker handling HTTP has its own monitor, even if module startup behavior
    # differs across deploy/runtime modes.
    ensure_background_attention_monitor_started()


@app.route('/api/device/attention-status', methods=['GET'])
def api_device_attention_status():
    ensure_background_attention_monitor_started()
    return jsonify({
        "ok": True,
        "enabled": background_attention_monitor_enabled(),
        "marketWindow": background_attention_market_window(),
        **_BACKGROUND_ATTENTION_STATUS,
        "threadAlive": bool(_BACKGROUND_ATTENTION_THREAD and _BACKGROUND_ATTENTION_THREAD.is_alive()),
        "build": SERVER_BUILD_MARKER,
    })


ensure_background_attention_monitor_started()
# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR END ---
'''


def patch_server(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"server.py not found: {path}")

    text = path.read_text(encoding="utf-8")
    if HOTFIX_MARKER in text:
        print("V2.0.20K Hotfix-1 is already present.")
        py_compile.compile(str(path), doraise=True)
        print("Python syntax check passed.")
        return

    required = [
        "# --- V2.0.20K BACKGROUND ATTENTION MONITOR START ---",
        'SERVER_BUILD_MARKER = "v2.0.20k-attention-20260901"',
        OLD_STATUS,
        OLD_LOOP_HEAD,
        OLD_ROUTE_AND_START,
    ]
    missing = ["20K monitor marker" if x.startswith("# ---") else x.splitlines()[0] for x in required if x not in text]
    if missing:
        raise SystemExit("Expected V2.0.20K code not found: " + ", ".join(missing))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.name}.backup-v2.0.20K-hotfix1-{stamp}")
    shutil.copy2(path, backup)

    text = text.replace(OLD_STATUS, NEW_STATUS, 1)
    text = text.replace(OLD_LOOP_HEAD, NEW_LOOP_HEAD, 1)
    if OLD_MARKET_BLOCK not in text:
        raise SystemExit("Could not find 20K market-scan anchor.")
    text = text.replace(OLD_MARKET_BLOCK, NEW_MARKET_BLOCK, 1)
    text = text.replace(OLD_ROUTE_AND_START, NEW_ROUTE_AND_START, 1)

    compile(text, str(path), "exec")
    path.write_text(text, encoding="utf-8")
    py_compile.compile(str(path), doraise=True)

    print("V2.0.20K Hotfix-1 applied successfully.")
    print(f"Backup: {backup}")
    print("Python syntax check passed.")
    print("Gunicorn worker monitor auto-start/restart is now enabled.")
    print("FYERS client will be rehydrated from FYERS_ACCESS_TOKEN when market scanning starts.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply V2.0.20K Hotfix-1 for gunicorn monitor startup")
    parser.add_argument("server", nargs="?", default="server.py")
    args = parser.parse_args()
    patch_server(Path(args.server).resolve())


if __name__ == "__main__":
    main()
