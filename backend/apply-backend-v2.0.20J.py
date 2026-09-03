from __future__ import annotations

import argparse
import py_compile
import re
import shutil
from datetime import datetime
from pathlib import Path

PATCH_MARKER = "# --- V2.0.20J DEVICE PUSH START ---"
END_MARKER = "# --- V2.0.20J DEVICE PUSH END ---"
BUILD_MARKER = 'SERVER_BUILD_MARKER = "v2.0.20j-push-register-20260901"'

TABLE_SNIPPET = '''    cursor.execute("""
        CREATE TABLE IF NOT EXISTS device_push_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            platform TEXT NOT NULL,
            app_version TEXT,
            device_id TEXT,
            username TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_test_at TEXT
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_device_push_tokens_active ON device_push_tokens(active)")
'''

ROUTE_BLOCK = r'''# --- V2.0.20J DEVICE PUSH START ---
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def valid_expo_push_token(value):
    token = str(value or "").strip()
    return bool(re.match(r"^(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]$", token))


def request_username_or_mobile():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        auth_token = auth_header.split(' ', 1)[1].strip()
        if auth_token in ACTIVE_TOKENS:
            return ACTIVE_TOKENS[auth_token]
    return "mobile"


def send_expo_push_notification(token, title, body, data=None):
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
        "data": data or {},
    }
    response = requests.post(
        EXPO_PUSH_URL,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        json=payload,
        timeout=12,
    )
    try:
        response_json = response.json()
    except Exception:
        response_json = {"raw": response.text[:500]}
    if response.status_code < 200 or response.status_code >= 300:
        raise RuntimeError(f"Expo push HTTP {response.status_code}: {response_json}")
    ticket = response_json.get("data") if isinstance(response_json, dict) else None
    if isinstance(ticket, dict) and str(ticket.get("status", "")).lower() == "error":
        raise RuntimeError(str(ticket.get("message") or ticket.get("details") or "Expo push ticket error"))
    return response_json


@app.route('/api/device/register', methods=['POST'])
def api_device_register():
    payload = request.get_json(silent=True) or {}
    token = str(payload.get('token') or '').strip()
    platform = str(payload.get('platform') or 'android').strip().lower()
    app_version = str(payload.get('appVersion') or '').strip()[:64]
    device_id = str(payload.get('deviceId') or '').strip()[:160] or None

    if not valid_expo_push_token(token):
        return jsonify({"ok": False, "registered": False, "error": "Invalid Expo push token."}), 400
    if platform not in ('android', 'ios'):
        return jsonify({"ok": False, "registered": False, "error": "Unsupported platform."}), 400

    now_text = ist_now().isoformat(timespec='seconds')
    username = request_username_or_mobile()
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO device_push_tokens
                (token, platform, app_version, device_id, username, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(token) DO UPDATE SET
                platform=excluded.platform,
                app_version=excluded.app_version,
                device_id=COALESCE(excluded.device_id, device_push_tokens.device_id),
                username=excluded.username,
                active=1,
                updated_at=excluded.updated_at
        """, (token, platform, app_version, device_id, username, now_text, now_text))
        cursor.execute("SELECT id, updated_at FROM device_push_tokens WHERE token = ?", (token,))
        row = cursor.fetchone()
        conn.commit()
        conn.close()
        return jsonify({
            "ok": True,
            "registered": True,
            "deviceId": row[0] if row else None,
            "updatedAt": row[1] if row else now_text,
            "remoteTestReady": True,
            "serverMonitorEnabled": False,
            "build": SERVER_BUILD_MARKER,
        })
    except Exception as exc:
        return jsonify({"ok": False, "registered": False, "error": str(exc)}), 500


@app.route('/api/device/test-push', methods=['POST'])
def api_device_test_push():
    payload = request.get_json(silent=True) or {}
    token = str(payload.get('token') or '').strip()
    if not valid_expo_push_token(token):
        return jsonify({"ok": False, "error": "Invalid Expo push token."}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM device_push_tokens WHERE token = ? AND active = 1", (token,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            conn = None
            return jsonify({"ok": False, "error": "Push token is not registered on this backend."}), 404

        result = send_expo_push_notification(
            token,
            "OptionsDesk remote push test ✅",
            "Backend → Expo → FCM → phone path is working.",
            {"type": "remote-push-test", "createdAt": int(time.time() * 1000)},
        )
        now_text = ist_now().isoformat(timespec='seconds')
        cursor.execute("UPDATE device_push_tokens SET last_test_at = ?, updated_at = ? WHERE token = ?", (now_text, now_text, token))
        conn.commit()
        conn.close()
        conn = None
        return jsonify({"ok": True, "sent": True, "ticket": result.get("data") if isinstance(result, dict) else None, "build": SERVER_BUILD_MARKER})
    except Exception as exc:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        return jsonify({"ok": False, "sent": False, "error": str(exc)}), 502


@app.route('/api/device/push-status', methods=['GET'])
def api_device_push_status():
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*), MAX(updated_at), MAX(last_test_at) FROM device_push_tokens WHERE active = 1")
        count, updated_at, last_test_at = cursor.fetchone() or (0, None, None)
        conn.close()
        return jsonify({
            "ok": True,
            "registeredDevices": int(count or 0),
            "lastRegistrationAt": updated_at,
            "lastRemoteTestAt": last_test_at,
            "serverMonitorEnabled": False,
            "build": SERVER_BUILD_MARKER,
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


# --- V2.0.20J DEVICE PUSH END ---
'''


def patch_server(path: Path) -> None:
    if not path.exists() or not path.is_file():
        raise SystemExit(f"server.py not found: {path}")

    original = path.read_text(encoding="utf-8")
    if PATCH_MARKER in original:
        print("V2.0.20J device-push patch is already present.")
        py_compile.compile(str(path), doraise=True)
        print("Python syntax check passed.")
        return

    required = [
        'from flask import Flask',
        'import requests',
        'def setup_database():',
        'cursor.execute("CREATE TABLE IF NOT EXISTS users',
        'setup_database()',
        "@app.route('/api/login', methods=['POST'])",
    ]
    missing = [x for x in required if x not in original]
    if missing:
        raise SystemExit("This does not look like the expected OptionsDesk Flask server.py. Missing: " + ", ".join(missing))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.name}.backup-v2.0.20J-{stamp}")
    shutil.copy2(path, backup)

    # 1) Device token table immediately after the existing users CREATE TABLE.
    user_line_re = re.compile(r'(?m)^(\s*)cursor\.execute\("CREATE TABLE IF NOT EXISTS users[^\n]+\)\s*$')
    match = user_line_re.search(original)
    if not match:
        raise SystemExit("Could not find users table creation line; no changes written.")
    insert_at = match.end()
    patched = original[:insert_at] + "\n" + TABLE_SNIPPET.rstrip("\n") + original[insert_at:]

    # 2) Routes after setup_database() and before /api/login.
    login_marker = "@app.route('/api/login', methods=['POST'])"
    login_at = patched.find(login_marker)
    if login_at < 0:
        raise SystemExit("Could not find /api/login route; no changes written.")
    patched = patched[:login_at] + ROUTE_BLOCK + "\n" + patched[login_at:]

    # 3) Update build marker regardless of the previous marker value.
    marker_re = re.compile(r'(?m)^SERVER_BUILD_MARKER\s*=\s*[\'\"][^\'\"]*[\'\"]\s*$')
    if marker_re.search(patched):
        patched = marker_re.sub(BUILD_MARKER, patched, count=1)
    else:
        # The routes can still work; add marker before history store declaration.
        history_anchor = 'HISTORY_STORE_PATH = '
        idx = patched.find(history_anchor)
        if idx < 0:
            raise SystemExit("Could not find build/history marker location; no changes written.")
        patched = patched[:idx] + BUILD_MARKER + "\n" + patched[idx:]

    # Compile before replacing the real file.
    compile(patched, str(path), "exec")
    path.write_text(patched, encoding="utf-8")
    py_compile.compile(str(path), doraise=True)

    print("V2.0.20J backend push registration patch applied successfully.")
    print(f"Backup: {backup}")
    print("Python syntax check passed.")
    print("Next: deploy this server.py to the SAME Render service used by https://optionsbackend.onrender.com")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply OptionsDesk backend V2.0.20J push-registration patch")
    parser.add_argument("server", nargs="?", default="server.py", help="Path to backend server.py")
    args = parser.parse_args()
    patch_server(Path(args.server).resolve())


if __name__ == "__main__":
    main()
