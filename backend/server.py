import os
import re
import time
import math
import requests
import threading
from datetime import datetime, timedelta, time as dt_time, timezone
import pytz
import json
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
import xml.etree.ElementTree as ET
import socket
import sqlite3
import secrets
import werkzeug.security
import gc
import math

try:
    from greeks import calculate_greeks, implied_volatility
except Exception as e:
    print("Warning: greeks.py not found or error:", e)
    def calculate_greeks(*args, **kwargs): return {"delta": 0, "theta": 0, "gamma": 0}
    def implied_volatility(*args, **kwargs): return 0.0001


socket.setdefaulttimeout(5.0)

# Monkeypatch requests to always use a timeout to prevent Fyers SDK from hanging
original_request = requests.Session.request
def request_with_timeout(self, method, url, **kwargs):
    if "timeout" not in kwargs:
        kwargs["timeout"] = 5.0
    return original_request(self, method, url, **kwargs)
requests.Session.request = request_with_timeout

IST = timezone(timedelta(hours=5, minutes=30))

def ist_now():
    return datetime.now(IST)

def is_market_open():
    now = ist_now()
    if now.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False
    # V2.0.20M: collect the opening session from 09:15 so gap-up/gap-down
    # direction can be measured instead of inheriting only previous-close bias.
    market_start = dt_time(9, 15)
    market_end = dt_time(15, 30)
    return market_start <= now.time() <= market_end

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv

try:
    from fyers_apiv3 import fyersModel
except Exception:
    fyersModel = None


try:
    from fyers_apiv3.FyersWebsocket import data_ws
except Exception:
    data_ws = None

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

dist_folder = Path(__file__).resolve().parent.parent / "dist"
app = Flask(__name__, static_folder=str(dist_folder), static_url_path='/')
app.config["SECRET_KEY"] = "super-secret-dashboard-key"
CORS(app)

# Serve React App
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    # Only serve from dist_folder if it actually exists (in production)
    if not dist_folder.exists():
        return jsonify({"status": "Backend running, but web app not deployed yet"})
    
    # If the file exists in the static folder, serve it
    if path != "" and (dist_folder / path).exists():
        return app.send_static_file(path)
        
    # Otherwise, fallback to index.html for React Router
    if (dist_folder / "index.html").exists():
        return app.send_static_file("index.html")
    else:
        return jsonify({"status": "Backend running, but index.html missing"})

from flask_socketio import SocketIO, emit, join_room, leave_room
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    path="/api/socket.io",
    ping_timeout=10,
    ping_interval=5,
    async_mode="threading",
    logger=False,
    engineio_logger=False
)

def gc_worker():
    while True:
        time.sleep(300)
        gc.collect()

threading.Thread(target=gc_worker, daemon=True).start()

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({"error": "Not found"}), 404
    if dist_folder.exists():
        return app.send_static_file('index.html')
    return "Frontend not built yet", 404

@app.route('/')
def index():
    if dist_folder.exists():
        return app.send_static_file('index.html')
    return "Frontend not built yet. Run 'npm run build' in root directory.", 404

@app.route('/api/ping')
def ping():
    gc.collect()
    return jsonify({"ok": True, "status": "awake", "time": time.time()})

DB_PATH = Path(__file__).resolve().parent / "app.db"
ACTIVE_TOKENS = {}

# Auto-initialize database on startup
def setup_database():
    import sqlite3
    import werkzeug.security
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)")
    cursor.execute("""
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
    # --- V2 FINAL INDEX ALERT PREFERENCES ---
    cursor.execute("PRAGMA table_info(device_push_tokens)")
    device_push_columns = {str(row[1]) for row in cursor.fetchall()}
    if "alert_symbols" not in device_push_columns:
        cursor.execute("ALTER TABLE device_push_tokens ADD COLUMN alert_symbols TEXT")
    # --- END V2 FINAL INDEX ALERT PREFERENCES ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS server_alert_state (
            alert_key TEXT PRIMARY KEY,
            last_sent_ts REAL NOT NULL,
            last_score REAL NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
    """)

    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    if not cursor.fetchone():
        hashed_pw = werkzeug.security.generate_password_hash('admin')
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ('admin', hashed_pw))
    conn.commit()
    conn.close()

setup_database()

# --- V2.0.20J DEVICE PUSH START ---
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
    allowed_alert_symbols = ("NIFTY", "BANKNIFTY", "SENSEX")
    raw_alert_symbols = payload.get('alertSymbols')
    if isinstance(raw_alert_symbols, list):
        requested = {str(item or '').strip().upper() for item in raw_alert_symbols}
        alert_symbols = [symbol for symbol in allowed_alert_symbols if symbol in requested]
    else:
        alert_symbols = list(allowed_alert_symbols)
    alert_symbols_json = json.dumps(alert_symbols, separators=(",", ":"))

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
        cursor.execute("UPDATE device_push_tokens SET alert_symbols = ? WHERE token = ?", (alert_symbols_json, token))
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
            "alertSymbols": alert_symbols,
            "supportsAlertSymbols": True,
            "serverMonitorEnabled": background_attention_monitor_enabled(),
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
            "Backend → Expo → FCM → phone works. Server alerts can reach you while OptionsDesk is off-screen.",
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
            "serverMonitorEnabled": background_attention_monitor_enabled(),
            "build": SERVER_BUILD_MARKER,
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


# --- V2.0.20J DEVICE PUSH END ---

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"success": False, "message": "Missing credentials"}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        conn.close()

        if row and werkzeug.security.check_password_hash(row[0], password):
            token = secrets.token_hex(32)
            ACTIVE_TOKENS[token] = username
            return jsonify({"success": True, "token": token})
        else:
            return jsonify({"success": False, "message": "Invalid username or password"}), 401
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/check_auth', methods=['GET'])
def api_check_auth():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        if token in ACTIVE_TOKENS:
            return jsonify({"success": True, "username": ACTIVE_TOKENS[token]})
    return jsonify({"success": False}), 401

SERVER_BUILD_MARKER = "v2.0.21-dual-broker-kotak-live-20261027-fix3"
HISTORY_STORE_PATH = Path(__file__).resolve().parent / "dashboard_history.json"
HISTORY_STORE_LOCK = threading.Lock()
HISTORY_STORE_KEYS = ("pcrHistory", "optionSignalHistory", "signalJournal", "gateHistory")
FYERS_HISTORY_API_LOCKS = {}
FYERS_HISTORY_LOCK_MUTEX = threading.Lock()

def get_fyers_history_lock(symbol):
    with FYERS_HISTORY_LOCK_MUTEX:
        if symbol not in FYERS_HISTORY_API_LOCKS:
            FYERS_HISTORY_API_LOCKS[symbol] = threading.RLock()
        return FYERS_HISTORY_API_LOCKS[symbol]

# =========================================================
# ENV
# =========================================================
FYERS_CLIENT_ID = ""
FYERS_ACCESS_TOKEN = ""
FYERS_ENV_MTIME = 0.0
fyers = None


def configure_fyers_timeout(fyers_client, timeout_seconds=4):
    try:
        session = getattr(getattr(fyers_client, "service", None), "session", None)
        if not session or getattr(session, "_msd_timeout_wrapped", False):
            return

        original_request = session.request

        def request_with_timeout(method, url, **kwargs):
            kwargs.setdefault("timeout", timeout_seconds)
            return original_request(method, url, **kwargs)

        session.request = request_with_timeout
        session._msd_timeout_wrapped = True
    except Exception as e:
        print(f"Fyers timeout setup skipped: {e}")


configure_fyers_timeout(fyers)


def default_dashboard_history():
    return {
        "pcrHistory": {},
        "optionSignalHistory": {},
        "signalJournal": [],
        "gateHistory": [],
        "updatedAt": None,
    }


def read_dashboard_history():
    with HISTORY_STORE_LOCK:
        try:
            if not HISTORY_STORE_PATH.exists():
                return default_dashboard_history()
            payload = json.loads(HISTORY_STORE_PATH.read_text(encoding="utf-8") or "{}")
        except Exception as e:
            print(f"dashboard history read failed: {e}")
            return default_dashboard_history()

    history = default_dashboard_history()
    if isinstance(payload, dict):
        for key in HISTORY_STORE_KEYS:
            if key in payload:
                history[key] = payload.get(key)
        history["updatedAt"] = payload.get("updatedAt")
    return history


def trim_history_payload(payload):
    clean = default_dashboard_history()
    if not isinstance(payload, dict):
        return clean

    pcr_history = payload.get("pcrHistory") if isinstance(payload.get("pcrHistory"), dict) else {}
    clean["pcrHistory"] = {
        str(key): list(value)[-100:]
        for key, value in pcr_history.items()
        if isinstance(value, list)
    }

    option_history = payload.get("optionSignalHistory") if isinstance(payload.get("optionSignalHistory"), dict) else {}
    clean["optionSignalHistory"] = {
        str(key): list(value)[-250:]
        for key, value in option_history.items()
        if isinstance(value, list)
    }

    signal_journal = payload.get("signalJournal") if isinstance(payload.get("signalJournal"), list) else []
    gate_history = payload.get("gateHistory") if isinstance(payload.get("gateHistory"), list) else []
    clean["signalJournal"] = list(signal_journal)[-2000:]
    clean["gateHistory"] = list(gate_history)[-3000:]
    clean["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    return clean


def write_dashboard_history(payload):
    clean = trim_history_payload(payload)
    with HISTORY_STORE_LOCK:
        HISTORY_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = HISTORY_STORE_PATH.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(clean, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp_path.replace(HISTORY_STORE_PATH)
    return clean


def dashboard_history_summary(payload):
    return {
        "pcrKeys": len(payload.get("pcrHistory") or {}),
        "optionKeys": len(payload.get("optionSignalHistory") or {}),
        "signalJournal": len(payload.get("signalJournal") or []),
        "gateHistory": len(payload.get("gateHistory") or []),
        "updatedAt": payload.get("updatedAt"),
    }


def normalize_fyers_access_token(client_id, access_token):
    token = str(access_token or "").strip()
    token = token.strip('"').strip("'").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    prefix = f"{client_id}:"
    if client_id and token.startswith(prefix):
        return token.split(":", 1)[1].strip()
    return token

def get_request_fyers_client():
    """
    Returns an active FyersModel instance with intelligent bidirectional token resolution:
    - If server environment token is active, uses it.
    - If client provides a token in request header and server token is expired/invalid,
      validates client token and automatically adopts it across the server.
    - If client passes stale token, gracefully falls back to valid server token.
    """
    global FYERS_CLIENT_ID, fyersModel, fyers, FYERS_ACCESS_TOKEN, _FYERS_VALIDATION_CACHE
    if not fyersModel:
        return None
    client_id = (os.getenv("FYERS_CLIENT_ID", "") or FYERS_CLIENT_ID).strip()
    if not client_id:
        return None

    refresh_fyers_from_env()
    server_token = (os.getenv("FYERS_ACCESS_TOKEN", "") or FYERS_ACCESS_TOKEN).strip()

    req_token = None
    try:
        from flask import request, has_request_context
        if has_request_context():
            req_token = request.headers.get("x-fyers-token") or request.headers.get("X-Fyers-Token")
            if not req_token:
                auth = request.headers.get("Authorization", "")
                if auth.lower().startswith("bearer "):
                    possible = auth[7:].strip()
                    if len(possible) > 80:
                        req_token = possible
            if not req_token:
                req_token = request.args.get("fyers_token")
    except Exception:
        pass

    clean_req_token = normalize_fyers_access_token(client_id, req_token) if req_token else None

    # Check server client validity
    server_valid = False
    if fyers is not None and server_token:
        now = time.time()
        token_fingerprint = str(server_token)[-20:]
        if (
            _FYERS_VALIDATION_CACHE.get("valid")
            and (now - _FYERS_VALIDATION_CACHE.get("cached_at", 0) < 60.0)
            and _FYERS_VALIDATION_CACHE.get("token_fingerprint") == token_fingerprint
        ):
            server_valid = True
        else:
            try:
                p = fyers.get_profile() or {}
                if p.get("s") == "ok" or p.get("code") == 200:
                    server_valid = True
                    _FYERS_VALIDATION_CACHE = {
                        "valid": True,
                        "error": "",
                        "cached_at": now,
                        "token_fingerprint": token_fingerprint,
                    }
                else:
                    _FYERS_VALIDATION_CACHE = {
                        "valid": False,
                        "error": p.get("message") or "Expired",
                        "cached_at": now,
                        "token_fingerprint": token_fingerprint,
                    }
            except Exception:
                server_valid = False

    # If server client is healthy and client passed no token (or same token), use server client
    if server_valid and (not clean_req_token or clean_req_token == server_token):
        return fyers

    # If client passed a different token, test it
    if clean_req_token and clean_req_token != server_token:
        try:
            client_inst = fyersModel.FyersModel(
                client_id=client_id,
                is_async=False,
                token=clean_req_token,
                log_path=""
            )
            configure_fyers_timeout(client_inst)
            cp = client_inst.get_profile() or {}
            if cp.get("s") == "ok" or cp.get("code") == 200:
                # Client token is valid! Adopt it on the server
                mark_fyers_token_ready(client_id, clean_req_token)
                _FYERS_VALIDATION_CACHE = {
                    "valid": True,
                    "error": "",
                    "cached_at": time.time(),
                    "token_fingerprint": str(clean_req_token)[-20:],
                }
                return client_inst
        except Exception:
            pass

    # If server client is valid, fall back to it
    if server_valid:
        return fyers

    if clean_req_token:
        inst = fyersModel.FyersModel(
            client_id=client_id,
            is_async=False,
            token=clean_req_token,
            log_path=""
        )
        configure_fyers_timeout(inst)
        return inst

    return fyers

def looks_like_raw_fyers_auth_code(value):
    token = str(value or "").strip().strip('"').strip("'")
    return token.startswith("eyJ") and "." in token and ":" not in token


def mark_fyers_token_ready(client_id, access_token):
    global FYERS_CLIENT_ID, FYERS_ACCESS_TOKEN, FYERS_ENV_MTIME, fyers
    os.environ["FYERS_ACCESS_TOKEN"] = access_token
    FYERS_CLIENT_ID = client_id
    FYERS_ACCESS_TOKEN = access_token
    fyers = None
    try:
        FYERS_ENV_MTIME = ENV_PATH.stat().st_mtime if ENV_PATH.exists() else FYERS_ENV_MTIME
    except Exception:
        pass


def save_env_value(env_path, key, value):
    env_path.parent.mkdir(parents=True, exist_ok=True)
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    updated = False
    next_lines = []

    for line in lines:
        if line.strip().startswith(f"{key}="):
            next_lines.append(f"{key}={value}")
            updated = True
        else:
            next_lines.append(line)

    if not updated:
        if next_lines and next_lines[-1].strip():
            next_lines.append("")
        next_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(next_lines) + "\n", encoding="utf-8")


def extract_fyers_auth_code(value):
    text = str(value or "").strip().strip('"').strip("'")
    if not text:
        return ""

    match_auth = re.search(r"[?&#]auth_code=([^&#\s]+)", text)
    if match_auth:
        return match_auth.group(1).strip()
        
    match_code = re.search(r"[?&#]code=([^&#\s]+)", text)
    if match_code:
        return match_code.group(1).strip()

    # If it is a full redirect URL but has no auth_code, do NOT treat the URL itself as the code!
    if "trade.fyers.in" in text or text.startswith("http://") or text.startswith("https://"):
        return ""

    return text


def get_fyers_redirect_uri():
    return os.getenv(
        "FYERS_REDIRECT_URI",
        "https://trade.fyers.in/api-login/redirect-uri/index.html",
    ).strip()



_FYERS_VALIDATION_CACHE = {
    "valid": False,
    "error": "",
    "cached_at": 0.0,
    "token_fingerprint": "",
}

_LAST_AUTO_LOGIN_ATTEMPT = 0.0
_AUTO_LOGIN_LOCK = threading.Lock()

def auto_refresh_fyers_token_if_needed():
    """
    Automatically renews the Fyers access token via TOTP credentials
    whenever tokenValid is False. Prevents user from having to manually
    refresh the token in Render and redeploy.
    """
    global _LAST_AUTO_LOGIN_ATTEMPT, _QUOTE_COOLDOWN_UNTIL
    client_id = os.getenv("FYERS_CLIENT_ID", "").strip()
    secret_key = os.getenv("FYERS_SECRET_KEY", "").strip()
    fyers_id = os.getenv("FYERS_ID", "").strip()
    fyers_pin = os.getenv("FYERS_PIN", "").strip()
    totp_key = os.getenv("FYERS_TOTP_KEY", "").strip()
    if not (client_id and secret_key and fyers_id and fyers_pin and totp_key):
        return False

    now = time.time()
    # At least 180 seconds between auto-login attempts to avoid Fyers rate limiting
    if now - _LAST_AUTO_LOGIN_ATTEMPT < 180:
        return False

    with _AUTO_LOGIN_LOCK:
        if now - _LAST_AUTO_LOGIN_ATTEMPT < 180:
            return False
        _LAST_AUTO_LOGIN_ATTEMPT = now
        try:
            print(f"[*] [Auto-Refresh] Fyers session token expired. Attempting automated TOTP renewal for {fyers_id}...")
            from totp_login import generate_fyers_token_via_totp
            new_token = generate_fyers_token_via_totp(
                fyers_id=fyers_id,
                fyers_pin=fyers_pin,
                totp_key=totp_key,
                client_id=client_id,
                secret_key=secret_key,
                redirect_uri=get_fyers_redirect_uri()
            )
            if new_token:
                save_env_value(ENV_PATH, "FYERS_ACCESS_TOKEN", new_token)
                _QUOTE_COOLDOWN_UNTIL = 0.0
                refresh_fyers_from_env(force=True)
                clear_live_market_caches()
                print("[+] [Auto-Refresh] Successfully generated fresh Fyers token via TOTP!")
                return True
        except Exception as exc:
            print(f"[-] [Auto-Refresh] Fyers TOTP renewal failed: {exc}")
            return False
    return False


def validate_fyers_session_token(force_check=False):
    """Validate the token with FYERS instead of treating SDK construction as authentication."""
    global _FYERS_VALIDATION_CACHE
    active_client = get_request_fyers_client()
    if not active_client or not getattr(active_client, "token", None):
        return False, "FYERS client is not initialized"

    now = time.time()
    token_fingerprint = str(FYERS_ACCESS_TOKEN or "")[-20:]
    # If cached recently (< 30s) for the same token, return cached validation result immediately
    if (
        not force_check
        and _FYERS_VALIDATION_CACHE["valid"]
        and (now - _FYERS_VALIDATION_CACHE["cached_at"] < 30.0)
        and _FYERS_VALIDATION_CACHE["token_fingerprint"] == token_fingerprint
    ):
        return True, ""

    try:
        resp = (active_client or fyers).get_profile() or {}
        if isinstance(resp, dict):
            status = str(resp.get("s") or "").strip().lower()
            code = resp.get("code")
            data = resp.get("data")
            if status == "ok" or code == 200 or (isinstance(data, dict) and bool(data)):
                _FYERS_VALIDATION_CACHE = {
                    "valid": True,
                    "error": "",
                    "cached_at": now,
                    "token_fingerprint": token_fingerprint,
                }
                return True, ""
            if auto_refresh_fyers_token_if_needed():
                recheck_client = get_request_fyers_client()
                if recheck_client:
                    re_resp = (recheck_client or fyers).get_profile() or {}
                    if isinstance(re_resp, dict) and (str(re_resp.get("s") or "").strip().lower() == "ok" or re_resp.get("code") == 200):
                        new_fp = str(FYERS_ACCESS_TOKEN or "")[-20:]
                        _FYERS_VALIDATION_CACHE = {
                            "valid": True,
                            "error": "",
                            "cached_at": time.time(),
                            "token_fingerprint": new_fp,
                        }
                        return True, ""

            message = str(resp.get("message") or resp.get("error") or "FYERS rejected the current access token")
            _FYERS_VALIDATION_CACHE = {
                "valid": False,
                "error": message,
                "cached_at": now,
                "token_fingerprint": token_fingerprint,
            }
            return False, message
        return False, "Unexpected FYERS profile response"
    except Exception as exc:
        return False, str(exc)


def get_fyers_env_status():
    try:
        env_mtime = ENV_PATH.stat().st_mtime if ENV_PATH.exists() else 0.0
    except Exception:
        env_mtime = 0.0

    client_id = os.getenv("FYERS_CLIENT_ID", "").strip()
    secret_key = os.getenv("FYERS_SECRET_KEY", "").strip()
    access_token = os.getenv("FYERS_ACCESS_TOKEN", "").strip()
    fyers_id = os.getenv("FYERS_ID", "").strip()
    fyers_pin = os.getenv("FYERS_PIN", "").strip()
    totp_key = os.getenv("FYERS_TOTP_KEY", "").strip()
    cooldown_seconds = max(0, int(_QUOTE_COOLDOWN_UNTIL - time.time()))
    return {
        "clientIdPresent": bool(client_id),
        "secretKeyPresent": bool(secret_key),
        "accessTokenPresent": bool(access_token),
        "fyersIdPresent": bool(fyers_id),
        "fyersPinPresent": bool(fyers_pin),
        "totpKeyPresent": bool(totp_key),
        "totpConfigured": bool(client_id and secret_key and fyers_id and fyers_pin and totp_key),
        "redirectUri": get_fyers_redirect_uri(),
        "fyersInitialized": fyers is not None,
        "envUpdatedAt": datetime.fromtimestamp(env_mtime).strftime("%d-%m-%Y %H:%M:%S") if env_mtime else "",
        "rateLimited": cooldown_seconds > 0,
        "cooldownSeconds": cooldown_seconds,
    }


def sanitize_fyers_history_symbol(symbol):
    text = str(symbol or "").strip().upper()
    if not re.match(r"^(NSE|BSE):[A-Z0-9&.\-]+$", text):
        return ""
    return text


def option_history_symbol(symbol_key, strike, side):
    cfg = INDEX_MAP.get(symbol_key)
    if not cfg:
        return ""
    strike_num = safe_float(strike, None)
    side_text = str(side or "").strip().upper()
    if strike_num is None or side_text not in {"CE", "PE"}:
        return ""

    future_symbol = str(cfg.get("future") or "").upper()
    exchange = "BSE" if future_symbol.startswith("BSE:") else "NSE"
    root = "SENSEX" if symbol_key == "SENSEX" else symbol_key
    marker = root
    idx = future_symbol.rfind(marker)
    suffix = ""
    if idx != -1:
      suffix = future_symbol[idx + len(marker):].replace("FUT", "")
    if not suffix:
        suffix = get_active_future_suffix().replace("FUT", "")
    strike_text = str(int(strike_num)) if float(strike_num).is_integer() else str(strike_num).replace(".", "")
    return f"{exchange}:{root}{suffix}{strike_text}{side_text}"


def fetch_fyers_history(symbol_key, resolution="5", lookback_minutes=375):
    refresh_fyers_from_env()
    resolution_key = str(resolution or "5").upper()
    fyers_resolution = "D" if resolution_key in ("D", "1D") else str(resolution or "5")
    key = f"{symbol_key}:{fyers_resolution}:{lookback_minutes}"
    cached = get_cached("fyers_history", key=key, ttl=8)
    if cached is not None:
        return cached

    with get_fyers_history_lock(symbol_key):
        cached = get_cached("fyers_history", key=key, ttl=8)
        if cached is not None:
            return cached

        raw_symbol = sanitize_fyers_history_symbol(symbol_key)
        if symbol_key not in INDEX_MAP and not raw_symbol:
            return {"ok": False, "error": "Unsupported symbol."}
        active_client = get_request_fyers_client()
        if not active_client:
            return {"ok": False, "error": "FYERS client not initialized."}

        cfg = INDEX_MAP.get(symbol_key) or {"label": symbol_key}
        symbols_to_try = (
            unique_symbols([
                cfg.get("spot"),
                cfg.get("future"),
            ])
            if symbol_key in INDEX_MAP else [raw_symbol]
        )
        now_dt = datetime.now()

        def previous_trading_session_start(days_needed):
            cursor = now_dt
            sessions = []
            while len(sessions) < max(1, int(days_needed)):
                if cursor.weekday() < 5:
                    sessions.append(cursor.replace(hour=9, minute=15, second=0, microsecond=0))
                cursor = cursor - timedelta(days=1)
            return sessions[-1]

        is_daily = fyers_resolution.upper() == "D"
        if is_daily:
            range_from = now_dt - timedelta(minutes=int(lookback_minutes or (180 * 24 * 60)))
            windows = [(int(range_from.timestamp()), int(time.time()), "daily")]
        else:
            # lookback_minutes comes from the UI as calendar minutes. Convert it to
            # approximate trading sessions so a 15-day chart does not request ~59
            # market sessions and block terminal-style first paint.
            sessions_needed = max(2, min(75, math.ceil(int(lookback_minutes or 375) / (24 * 60)) + 1))
            multi_from = previous_trading_session_start(sessions_needed)
            windows = [
                (int(multi_from.timestamp()), int(time.time()), f"{sessions_needed} sessions"),
            ]
            for offset in range(1, min(75, sessions_needed + 4)):
                session_day = now_dt - timedelta(days=offset)
                if session_day.weekday() >= 5:
                    continue
                session_from = session_day.replace(hour=9, minute=15, second=0, microsecond=0)
                session_end = session_day.replace(hour=15, minute=30, second=0, microsecond=0)
                windows.append((int(session_from.timestamp()), int(session_end.timestamp()), session_end.strftime("%d-%m-%Y")))
            windows.append((int(time.time()) - int(lookback_minutes * 60), int(time.time()), "live"))
        last_response = None
        attempts = []

        for sym in symbols_to_try:
            if not sym:
                continue
            combined = {}
            combined_windows = []
            for from_ts, to_ts, window_label in windows:
                try:
                    payload = {
                        "symbol": sym,
                        "resolution": fyers_resolution,
                        "date_format": "0",
                        "range_from": str(from_ts),
                        "range_to": str(to_ts),
                        "cont_flag": "1",
                    }
                    time.sleep(0.4)
                    resp = (active_client or fyers).history(payload) or {}
                    
                    last_response = resp
                    attempts.append({
                        "symbol": sym,
                        "window": window_label,
                        "from": from_ts,
                        "to": to_ts,
                        "code": resp.get("code"),
                        "status": resp.get("s"),
                        "message": resp.get("message"),
                        "candles": len(resp.get("candles", []) or []),
                    })
                    if quote_response_rate_limited(resp):
                        return {
                            "ok": False,
                            "error": "Fyers history API is rate-limited. Try again after a few seconds.",
                            "response": resp,
                            **get_fyers_env_status(),
                        }

                    for row in resp.get("candles", []) or []:
                        if not isinstance(row, (list, tuple)) or len(row) < 5:
                            continue
                        ts = safe_int(row[0], None)
                        candle = {
                            "ts": ts,
                            "open": round2(row[1]),
                            "high": round2(row[2]),
                            "low": round2(row[3]),
                            "close": round2(row[4]),
                            "volume": safe_int(row[5], 0) if len(row) > 5 else 0,
                        }
                        if ts is not None and all(candle.get(k) is not None for k in ["open", "high", "low", "close"]):
                            combined[ts] = candle
                    if resp.get("candles"):
                        combined_windows.append(window_label)
                        if "sessions" in window_label:
                            break
                except Exception as e:
                    last_response = {"error": str(e), "window": window_label}
                    attempts.append({"symbol": sym, "window": window_label, "error": str(e)})

            if combined:
                candles = sorted(combined.values(), key=lambda item: item["ts"])
                result = {
                    "ok": True,
                    "symbol": symbol_key,
                    "label": cfg.get("label", symbol_key),
                    "sourceSymbol": sym,
                    "resolution": fyers_resolution,
                    "window": " + ".join(unique_symbols(combined_windows[-4:])) if combined_windows else "history",
                    "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
                    "candles": candles[-500:] if is_daily else candles[-5000:],
                    "attempts": attempts[-10:],
                }
                set_cached("fyers_history", result, key=key)
                return result

        yahoo_fallback = fetch_yahoo_history(symbol_key, fyers_resolution) if symbol_key in INDEX_MAP else None
        if yahoo_fallback and yahoo_fallback.get("candles"):
            set_cached("fyers_history", yahoo_fallback, key=key)
            return yahoo_fallback

        return {
            "ok": False,
            "symbol": symbol_key,
            "error": "No Fyers candles returned for this symbol.",
            "response": last_response,
            "attempts": attempts[-12:],
            **get_fyers_env_status(),
        }


def build_quote_fallback_history(symbol_key, resolution="5"):
    cfg = INDEX_MAP.get(symbol_key)
    if not cfg:
        return None
    quote = extract_quote_metrics(get_quote_block(cfg.get("future")) or get_quote_block(cfg.get("spot")))
    open_price = safe_float(quote.get("open"), None)
    high = safe_float(quote.get("high"), None)
    low = safe_float(quote.get("low"), None)
    close = safe_float(quote.get("ltp"), None)
    if None in (open_price, high, low, close):
        return None

    step = max(1, safe_int(resolution, 5)) * 60
    end_dt = datetime.now().replace(second=0, microsecond=0)
    if end_dt.weekday() >= 5:
        offset = 1
        while (end_dt - timedelta(days=offset)).weekday() >= 5:
            offset += 1
        end_dt = (end_dt - timedelta(days=offset)).replace(hour=15, minute=30)
    start_ts = int((end_dt - timedelta(minutes=step * 28 / 60)).timestamp())
    candles = []
    for index in range(28):
        progress = index / 27 if index else 0
        base = open_price + (close - open_price) * progress
        wave = math.sin(progress * math.pi) if 0 <= progress <= 1 else 0
        candle_high = max(base, open_price, close) if index in (0, 27) else max(base, low + (high - low) * wave)
        candle_low = min(base, open_price, close) if index in (0, 27) else min(base, high - (high - low) * wave)
        candles.append({
            "ts": start_ts + index * step,
            "open": round2(base),
            "high": round2(max(candle_high, base)),
            "low": round2(min(candle_low, base)),
            "close": round2(base if index < 27 else close),
            "volume": 0,
        })
    return {
        "ok": True,
        "symbol": symbol_key,
        "label": cfg.get("label", symbol_key),
        "sourceSymbol": cfg.get("future") or cfg.get("spot"),
        "source": "quote_fallback",
        "resolution": str(resolution),
        "window": "quote fallback",
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        "warning": "Fyers history unavailable; chart is built from quote OHLC fallback.",
        "candles": candles,
    }


def refresh_fyers_from_env(force=False):
    global FYERS_CLIENT_ID, FYERS_ACCESS_TOKEN, FYERS_ENV_MTIME, fyers, _QUOTE_COOLDOWN_UNTIL

    try:
        env_mtime = ENV_PATH.stat().st_mtime if ENV_PATH.exists() else 0.0
    except Exception:
        env_mtime = 0.0

    if not force and env_mtime == FYERS_ENV_MTIME and fyers is not None:
        return fyers

    load_dotenv(dotenv_path=ENV_PATH, override=True)
    client_id = os.getenv("FYERS_CLIENT_ID", "").strip()
    access_token = normalize_fyers_access_token(client_id, os.getenv("FYERS_ACCESS_TOKEN", "").strip())

    if not fyersModel or not client_id or not access_token:
        fyers = None
        FYERS_CLIENT_ID = client_id
        FYERS_ACCESS_TOKEN = access_token
        FYERS_ENV_MTIME = env_mtime
        print("⚠️ FYERS not initialized. Check FYERS_CLIENT_ID / FYERS_ACCESS_TOKEN.")
        return fyers

    if force or client_id != FYERS_CLIENT_ID or access_token != FYERS_ACCESS_TOKEN or fyers is None:
        token_changed = access_token != FYERS_ACCESS_TOKEN
        FYERS_CLIENT_ID = client_id
        FYERS_ACCESS_TOKEN = access_token
        fyers = fyersModel.FyersModel(
            client_id=FYERS_CLIENT_ID,
            is_async=False,
            token=FYERS_ACCESS_TOKEN,
            log_path=""
        )
        configure_fyers_timeout(fyers)
        if token_changed:
            _QUOTE_COOLDOWN_UNTIL = 0.0
            if "reset_fyers_ws_stream" in globals():
                reset_fyers_ws_stream()
        print("✅ FYERS token loaded from .env")

    FYERS_ENV_MTIME = env_mtime
    return fyers

def clear_live_market_caches():
    _QUOTE_CACHE.clear()
    _MARKET_STRIP_CACHE["ts"] = 0.0
    _MARKET_STRIP_CACHE["items"] = []
    for bucket in ["home_index_quotes", "home_index_analytics", "home_dashboard", "sector_strength"]:
        if bucket in _CACHE and isinstance(_CACHE[bucket], dict) and "ts" in _CACHE[bucket]:
            _CACHE[bucket]["ts"] = 0.0
            _CACHE[bucket]["data"] = None
    for bucket in ["dashboard", "option_chain", "advance_decline"]:
        if bucket in _CACHE and isinstance(_CACHE[bucket], dict):
            _CACHE[bucket].clear()
    if "fyers_history" in _CACHE and isinstance(_CACHE["fyers_history"], dict):
        _CACHE["fyers_history"].clear()

# =========================================================
# CONFIG
# =========================================================
INDEX_MAP = {
    "NIFTY": {
        "spot": "NSE:NIFTY50-INDEX",
        "future": None,
        "label": "NIFTY 50",
        "option_symbols": [
            "NSE:NIFTY50-INDEX",
            "NSE:NIFTY-INDEX",
            "NSE:NIFTY",
        ],
        "components": [
            "NSE:ADANIENT-EQ", "NSE:ADANIPORTS-EQ", "NSE:APOLLOHOSP-EQ",
            "NSE:ASIANPAINT-EQ", "NSE:AXISBANK-EQ", "NSE:BAJAJ-AUTO-EQ",
            "NSE:BAJFINANCE-EQ", "NSE:BAJAJFINSV-EQ", "NSE:BPCL-EQ",
            "NSE:BHARTIARTL-EQ", "NSE:BRITANNIA-EQ", "NSE:CIPLA-EQ",
            "NSE:COALINDIA-EQ", "NSE:DIVISLAB-EQ", "NSE:DRREDDY-EQ",
            "NSE:EICHERMOT-EQ", "NSE:GRASIM-EQ", "NSE:HCLTECH-EQ",
            "NSE:HDFCBANK-EQ", "NSE:HDFCLIFE-EQ", "NSE:HEROMOTOCO-EQ",
            "NSE:HINDALCO-EQ", "NSE:HINDUNILVR-EQ", "NSE:ICICIBANK-EQ",
            "NSE:ITC-EQ", "NSE:INDUSINDBK-EQ", "NSE:INFY-EQ",
            "NSE:JSWSTEEL-EQ", "NSE:KOTAKBANK-EQ", "NSE:LT-EQ",
            "NSE:LTIM-EQ", "NSE:M&M-EQ", "NSE:MARUTI-EQ",
            "NSE:NTPC-EQ", "NSE:NESTLEIND-EQ", "NSE:ONGC-EQ",
            "NSE:POWERGRID-EQ", "NSE:RELIANCE-EQ", "NSE:SBILIFE-EQ",
            "NSE:SBIN-EQ", "NSE:SUNPHARMA-EQ", "NSE:TCS-EQ",
            "NSE:TATACONSUM-EQ", "NSE:TATAMOTORS-EQ", "NSE:TATASTEEL-EQ",
            "NSE:TECHM-EQ", "NSE:TITAN-EQ", "NSE:ULTRACEMCO-EQ",
            "NSE:UPL-EQ", "NSE:WIPRO-EQ"
        ]
    },
    "BANKNIFTY": {
        "spot": "NSE:NIFTYBANK-INDEX",
        "future": None,
        "label": "BANK NIFTY",
        "option_symbols": [
            "NSE:NIFTYBANK-INDEX",
            "NSE:BANKNIFTY-INDEX",
            "NSE:BANKNIFTY",
        ],
        "components": [
            "NSE:AXISBANK-EQ", "NSE:HDFCBANK-EQ", "NSE:KOTAKBANK-EQ",
            "NSE:ICICIBANK-EQ", "NSE:SBIN-EQ", "NSE:AUBANK-EQ",
            "NSE:BANKBARODA-EQ", "NSE:CANBK-EQ", "NSE:FEDERALBNK-EQ",
            "NSE:IDFCFIRSTB-EQ", "NSE:INDUSINDBK-EQ", "NSE:PNB-EQ"
        ]
    },
    "SENSEX": {
        "spot": "BSE:SENSEX-INDEX",
        "future": None,
        "label": "SENSEX",
        "option_symbols": [
            "BSE:SENSEX-INDEX",
            "BSE:SENSEX",
            "SENSEX",
        ],
        "components": [
            "NSE:ADANIPORTS-EQ", "NSE:ASIANPAINT-EQ", "NSE:AXISBANK-EQ",
            "NSE:BAJFINANCE-EQ", "NSE:BAJAJFINSV-EQ", "NSE:BHARTIARTL-EQ",
            "NSE:HCLTECH-EQ", "NSE:HDFCBANK-EQ", "NSE:HINDUNILVR-EQ",
            "NSE:ICICIBANK-EQ", "NSE:ITC-EQ", "NSE:KOTAKBANK-EQ",
            "NSE:LT-EQ", "NSE:M&M-EQ", "NSE:MARUTI-EQ",
            "NSE:POWERGRID-EQ", "NSE:NTPC-EQ", "NSE:RELIANCE-EQ",
            "NSE:SBIN-EQ", "NSE:SUNPHARMA-EQ", "NSE:TATAMOTORS-EQ",
            "NSE:TATASTEEL-EQ", "NSE:TCS-EQ", "NSE:TECHM-EQ",
            "NSE:TITAN-EQ", "NSE:ULTRACEMCO-EQ", "NSE:ZOMATO-EQ",
            "NSE:INDUSINDBK-EQ", "NSE:INFY-EQ", "NSE:NESTLEIND-EQ"
        ]
    },
    "FINNIFTY": {
        "spot": "NSE:FINNIFTY-INDEX",
        "future": None,
        "label": "NIFTY FIN SERVICE",
        "option_symbols": [
            "NSE:FINNIFTY-INDEX",
            "NSE:FINNIFTY",
        ],
        "components": [
            "NSE:HDFCBANK-EQ", "NSE:ICICIBANK-EQ", "NSE:KOTAKBANK-EQ",
            "NSE:AXISBANK-EQ", "NSE:SBIN-EQ", "NSE:BAJFINANCE-EQ",
            "NSE:BAJAJFINSV-EQ", "NSE:HDFCLIFE-EQ", "NSE:SBILIFE-EQ",
            "NSE:CHOLAFIN-EQ", "NSE:SHRIRAMFIN-EQ", "NSE:MUTHOOTFIN-EQ"
        ]
    },
    "MIDCPNIFTY": {
        "spot": "NSE:MIDCPNIFTY-INDEX",
        "future": None,
        "label": "NIFTY MID SELECT",
        "option_symbols": [
            "NSE:MIDCPNIFTY-INDEX",
            "NSE:MIDCPNIFTY",
        ],
        "components": [
            "NSE:FEDERALBNK-EQ", "NSE:ASHOKLEY-EQ", "NSE:AUROPHARMA-EQ",
            "NSE:BHARATFORG-EQ", "NSE:CUMMINSIND-EQ", "NSE:GODREJPROP-EQ",
            "NSE:HINDPETRO-EQ", "NSE:IDFCFIRSTB-EQ", "NSE:INDHOTEL-EQ",
            "NSE:JINDALSTEL-EQ", "NSE:JUBLFOOD-EQ", "NSE:LUPIN-EQ"
        ]
    },
    "BANKEX": {
        "spot": "BSE:BANKEX-INDEX",
        "future": None,
        "label": "BSE BANKEX",
        "option_symbols": [
            "BSE:BANKEX-INDEX",
            "BSE:BANKEX",
            "BANKEX",
        ],
        "components": [
            "NSE:HDFCBANK-EQ", "NSE:ICICIBANK-EQ", "NSE:KOTAKBANK-EQ",
            "NSE:AXISBANK-EQ", "NSE:SBIN-EQ", "NSE:BANKBARODA-EQ",
            "NSE:INDUSINDBK-EQ", "NSE:PNB-EQ", "NSE:FEDERALBNK-EQ",
            "NSE:AUBANK-EQ"
        ]
    }
}

VIX_SYMBOL = "NSE:INDIAVIX-INDEX"

MARKET_STRIP_SYMBOLS = {
    "NIFTY 50": "NSE:NIFTY50-INDEX",
    "NIFTY BANK": "NSE:NIFTYBANK-INDEX",
    "SENSEX": "BSE:SENSEX-INDEX",
    "NIFTY MIDCAP 100": "NSE:NIFTYMIDCAP100-INDEX",
    "NIFTY SMALLCAP 100": "NSE:NIFTYSMLCAP100-INDEX",
    "NIFTY FIN SERVICE": "NSE:FINNIFTY-INDEX",
}

SECTOR_INDEX_SYMBOLS = {
    "IT": "NSE:NIFTYIT-INDEX",
    "FMCG": "NSE:NIFTYFMCG-INDEX",
    "Pharma": "NSE:NIFTYPHARMA-INDEX",
    "Energy": "NSE:NIFTYENERGY-INDEX",
    "Media": "NSE:NIFTYMEDIA-INDEX",
    "Infra": "NSE:NIFTYINFRA-INDEX",
    "Construction": "NSE:NIFTYCONSTRUCTION-INDEX",
    "Private Bank": "NSE:NIFTYPVTBANK-INDEX",
    "Banking": "NSE:NIFTYBANK-INDEX",
    "Auto": "NSE:NIFTYAUTO-INDEX",
    "Healthcare": "NSE:NIFTYHEALTHCARE-INDEX",
    "Financial Services": "NSE:FINNIFTY-INDEX",
    "Metal": "NSE:NIFTYMETAL-INDEX",
    "PSU Bank": "NSE:NIFTYPSUBANK-INDEX",
    "Realty": "NSE:NIFTYREALTY-INDEX",
    "Consumer Durables": "NSE:NIFTYCONSRDURBL-INDEX",
    "Oil & Gas": "NSE:NIFTYOILANDGAS-INDEX",
}

MARKET_NEWS_FEEDS = [
    {
        "name": "Market Direction",
        "url": "https://news.google.com/rss/search?q=India%20stock%20market%20Nifty%20Sensex%20RBI%20FII%20DII%20crude%20rupee&hl=en-IN&gl=IN&ceid=IN:en",
    },
    {
        "name": "Global Cues",
        "url": "https://news.google.com/rss/search?q=US%20Fed%20Dow%20Nasdaq%20Asia%20markets%20crude%20oil%20dollar%20India%20stocks&hl=en-IN&gl=IN&ceid=IN:en",
    },
    {
        "name": "ET Markets",
        "url": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    },
    {
        "name": "Moneycontrol Markets",
        "url": "https://www.moneycontrol.com/rss/marketreports.xml",
    },
]

NEWS_IMPACT_KEYWORDS = {
    "rbi": 5, "rate": 4, "inflation": 5, "cpi": 4, "fed": 5, "fomc": 5,
    "crude": 4, "oil": 3, "rupee": 4, "dollar": 3, "bond": 3, "yield": 4,
    "fii": 5, "dii": 4, "foreign investors": 4, "nifty": 4, "sensex": 4,
    "bank nifty": 5, "gift nifty": 4, "global markets": 3, "asia": 2,
    "tariff": 4, "war": 5, "geopolitical": 4, "iran": 4, "china": 3,
    "election": 4, "budget": 5, "gst": 4, "sebi": 4, "earnings": 3,
    "results": 3, "dow": 2, "nasdaq": 3, "s&p": 3,
}

NEWS_BULLISH_WORDS = [
    "rally", "gain", "gains", "surge", "jumps", "up", "positive", "eases",
    "cooling", "cuts rates", "rate cut", "inflow", "buying", "record high",
]

NEWS_BEARISH_WORDS = [
    "fall", "falls", "slump", "selloff", "sell-off", "down", "negative",
    "rises", "spike", "hike", "rate hike", "outflow", "selling", "war",
    "tariff", "crash", "weak", "pressure",
]

SECTOR_STOCKS = {
    "IT": {
        "label": "IT",
        "symbols": [
            "NSE:TCS-EQ",
            "NSE:INFY-EQ",
            "NSE:HCLTECH-EQ",
            "NSE:WIPRO-EQ",
            "NSE:TECHM-EQ",
            "NSE:LTIM-EQ",
            "NSE:MPHASIS-EQ",
            "NSE:COFORGE-EQ",
            "NSE:PERSISTENT-EQ",
            "NSE:OFSS-EQ",
            "NSE:KPITTECH-EQ",
            "NSE:TATAELXSI-EQ",
            "NSE:LTTS-EQ",
            "NSE:SONATSOFTW-EQ",
            "NSE:BIRLASOFT-EQ",
            "NSE:CYIENT-EQ",
            "NSE:ZENSARTECH-EQ",
            "NSE:NEWGEN-EQ",
            "NSE:AFFLE-EQ",
            "NSE:RATEGAIN-EQ",
        ],
    },
    "FMCG": {
        "label": "FMCG",
        "symbols": [
            "NSE:HINDUNILVR-EQ",
            "NSE:ITC-EQ",
            "NSE:NESTLEIND-EQ",
            "NSE:BRITANNIA-EQ",
            "NSE:TATACONSUM-EQ",
            "NSE:VBL-EQ",
            "NSE:DABUR-EQ",
            "NSE:GODREJCP-EQ",
            "NSE:MARICO-EQ",
            "NSE:COLPAL-EQ",
            "NSE:UBL-EQ",
            "NSE:RADICO-EQ",
            "NSE:EMAMILTD-EQ",
            "NSE:PGHH-EQ",
            "NSE:UNITDSPR-EQ",
        ],
    },
    "Pharma": {
        "label": "Pharma",
        "symbols": [
            "NSE:SUNPHARMA-EQ",
            "NSE:DRREDDY-EQ",
            "NSE:CIPLA-EQ",
            "NSE:DIVISLAB-EQ",
            "NSE:TORNTPHARM-EQ",
            "NSE:LUPIN-EQ",
            "NSE:AUROPHARMA-EQ",
            "NSE:ALKEM-EQ",
            "NSE:BIOCON-EQ",
            "NSE:ZYDUSLIFE-EQ",
            "NSE:ABBOTINDIA-EQ",
            "NSE:GLAND-EQ",
            "NSE:GLENMARK-EQ",
            "NSE:IPCALAB-EQ",
            "NSE:AJANTPHARM-EQ",
            "NSE:LAURUSLABS-EQ",
            "NSE:GRANULES-EQ",
            "NSE:NATCOPHARM-EQ",
            "NSE:SYNGENE-EQ",
            "NSE:MANKIND-EQ",
        ],
    },
    "Energy": {
        "label": "Energy",
        "symbols": [
            "NSE:RELIANCE-EQ",
            "NSE:ONGC-EQ",
            "NSE:IOC-EQ",
            "NSE:BPCL-EQ",
            "NSE:HPCL-EQ",
            "NSE:GAIL-EQ",
            "NSE:OIL-EQ",
            "NSE:NTPC-EQ",
            "NSE:POWERGRID-EQ",
            "NSE:ADANIGREEN-EQ",
            "NSE:ADANIPOWER-EQ",
            "NSE:TATAPOWER-EQ",
            "NSE:NHPC-EQ",
            "NSE:SJVN-EQ",
            "NSE:NLCINDIA-EQ",
        ],
    },
    "Media": {
        "label": "Media",
        "symbols": [
            "NSE:ZEEL-EQ",
            "NSE:SUNTV-EQ",
            "NSE:PVRINOX-EQ",
            "NSE:NETWORK18-EQ",
            "NSE:TV18BRDCST-EQ",
            "NSE:DBCORP-EQ",
            "NSE:JAGRAN-EQ",
            "NSE:NAZARA-EQ",
            "NSE:SAREGAMA-EQ",
            "NSE:TIPSMUSIC-EQ",
        ],
    },
    "Infra": {
        "label": "Infra",
        "symbols": [
            "NSE:LT-EQ",
            "NSE:NTPC-EQ",
            "NSE:POWERGRID-EQ",
            "NSE:ADANIPORTS-EQ",
            "NSE:DLF-EQ",
            "NSE:GMRINFRA-EQ",
            "NSE:IRB-EQ",
            "NSE:KEC-EQ",
            "NSE:NBCC-EQ",
            "NSE:RVNL-EQ",
            "NSE:IRCON-EQ",
            "NSE:PNCINFRA-EQ",
            "NSE:KNRCON-EQ",
            "NSE:CGPOWER-EQ",
            "NSE:SIEMENS-EQ",
        ],
    },
    "Private Bank": {
        "label": "Private Bank",
        "symbols": [
            "NSE:HDFCBANK-EQ",
            "NSE:ICICIBANK-EQ",
            "NSE:AXISBANK-EQ",
            "NSE:KOTAKBANK-EQ",
            "NSE:INDUSINDBK-EQ",
            "NSE:IDFCFIRSTB-EQ",
            "NSE:FEDERALBNK-EQ",
            "NSE:BANDHANBNK-EQ",
            "NSE:RBLBANK-EQ",
            "NSE:AUBANK-EQ",
        ],
    },
    "Banking": {
        "label": "Banking",
        "symbols": [
            "NSE:HDFCBANK-EQ",
            "NSE:ICICIBANK-EQ",
            "NSE:SBIN-EQ",
            "NSE:AXISBANK-EQ",
            "NSE:KOTAKBANK-EQ",
            "NSE:INDUSINDBK-EQ",
            "NSE:BANKBARODA-EQ",
            "NSE:PNB-EQ",
            "NSE:CANBK-EQ",
            "NSE:FEDERALBNK-EQ",
            "NSE:IDFCFIRSTB-EQ",
            "NSE:AUBANK-EQ",
            "NSE:UNIONBANK-EQ",
            "NSE:INDIANB-EQ",
            "NSE:IOB-EQ",
            "NSE:UCOBANK-EQ",
            "NSE:BANKINDIA-EQ",
            "NSE:CENTRALBK-EQ",
            "NSE:KARURVYSYA-EQ",
            "NSE:SOUTHBANK-EQ",
            "NSE:RBLBANK-EQ",
            "NSE:BANDHANBNK-EQ",
            "NSE:J&KBANK-EQ",
            "NSE:CUB-EQ",
            "NSE:DCBBANK-EQ",
            "NSE:CSBBANK-EQ",
            "NSE:TMB-EQ",
        ],
    },
    "Auto": {
        "label": "Auto",
        "symbols": [
            "NSE:MARUTI-EQ",
            "NSE:TATAMOTORS-EQ",
            "NSE:M&M-EQ",
            "NSE:EICHERMOT-EQ",
            "NSE:HEROMOTOCO-EQ",
            "NSE:BAJAJ-AUTO-EQ",
            "NSE:TVSMOTOR-EQ",
            "NSE:ASHOKLEY-EQ",
            "NSE:BHARATFORG-EQ",
            "NSE:BOSCHLTD-EQ",
            "NSE:EXIDEIND-EQ",
            "NSE:MRF-EQ",
            "NSE:APOLLOTYRE-EQ",
            "NSE:BALKRISIND-EQ",
            "NSE:TIINDIA-EQ",
        ],
    },
    "Healthcare": {
        "label": "Healthcare",
        "symbols": [
            "NSE:APOLLOHOSP-EQ",
            "NSE:MAXHEALTH-EQ",
            "NSE:FORTIS-EQ",
            "NSE:LALPATHLAB-EQ",
            "NSE:METROPOLIS-EQ",
            "NSE:SUNPHARMA-EQ",
            "NSE:DRREDDY-EQ",
            "NSE:CIPLA-EQ",
            "NSE:DIVISLAB-EQ",
            "NSE:TORNTPHARM-EQ",
            "NSE:LUPIN-EQ",
            "NSE:AUROPHARMA-EQ",
            "NSE:ALKEM-EQ",
            "NSE:BIOCON-EQ",
            "NSE:ZYDUSLIFE-EQ",
            "NSE:ABBOTINDIA-EQ",
            "NSE:GLENMARK-EQ",
            "NSE:IPCALAB-EQ",
            "NSE:AJANTPHARM-EQ",
            "NSE:LAURUSLABS-EQ",
        ],
    },
    "Financial Services": {
        "label": "Financial Services",
        "symbols": [
            "NSE:HDFCBANK-EQ",
            "NSE:ICICIBANK-EQ",
            "NSE:SBIN-EQ",
            "NSE:AXISBANK-EQ",
            "NSE:KOTAKBANK-EQ",
            "NSE:BAJFINANCE-EQ",
            "NSE:BAJAJFINSV-EQ",
            "NSE:SBILIFE-EQ",
            "NSE:HDFCLIFE-EQ",
            "NSE:ICICIPRULI-EQ",
            "NSE:ICICIGI-EQ",
            "NSE:RECLTD-EQ",
            "NSE:PFC-EQ",
            "NSE:CHOLAFIN-EQ",
            "NSE:SHRIRAMFIN-EQ",
            "NSE:MUTHOOTFIN-EQ",
            "NSE:LICHSGFIN-EQ",
            "NSE:SBICARD-EQ",
            "NSE:MCX-EQ",
            "NSE:MFSL-EQ",
        ],
    },
    "Metal": {
        "label": "Metal",
        "symbols": [
            "NSE:TATASTEEL-EQ",
            "NSE:HINDALCO-EQ",
            "NSE:JSWSTEEL-EQ",
            "NSE:COALINDIA-EQ",
            "NSE:JINDALSTEL-EQ",
            "NSE:NMDC-EQ",
            "NSE:SAIL-EQ",
            "NSE:VEDL-EQ",
            "NSE:HINDCOPPER-EQ",
            "NSE:APLAPOLLO-EQ",
            "NSE:RATNAMANI-EQ",
            "NSE:WELCORP-EQ",
            "NSE:NATIONALUM-EQ",
            "NSE:MOIL-EQ",
            "NSE:JSL-EQ",
        ],
    },
    "PSU Bank": {
        "label": "PSU Bank",
        "symbols": [
            "NSE:SBIN-EQ",
            "NSE:BANKBARODA-EQ",
            "NSE:CANBK-EQ",
            "NSE:PNB-EQ",
            "NSE:UNIONBANK-EQ",
            "NSE:INDIANB-EQ",
            "NSE:BANKINDIA-EQ",
            "NSE:IOB-EQ",
            "NSE:UCOBANK-EQ",
            "NSE:CENTRALBK-EQ",
        ],
    },
    "Realty": {
        "label": "Realty",
        "symbols": [
            "NSE:DLF-EQ",
            "NSE:LODHA-EQ",
            "NSE:GODREJPROP-EQ",
            "NSE:OBEROIRLTY-EQ",
            "NSE:PRESTIGE-EQ",
            "NSE:PHOENIXLTD-EQ",
            "NSE:BRIGADE-EQ",
            "NSE:SOBHA-EQ",
            "NSE:SUNTECK-EQ",
            "NSE:MAHLIFE-EQ",
        ],
    },
    "Consumer Durables": {
        "label": "Consumer Durables",
        "symbols": [
            "NSE:TITAN-EQ",
            "NSE:VOLTAS-EQ",
            "NSE:WHIRLPOOL-EQ",
            "NSE:BLUESTARCO-EQ",
            "NSE:CROMPTON-EQ",
            "NSE:DIXON-EQ",
            "NSE:HAVELLS-EQ",
            "NSE:KAJARIACER-EQ",
            "NSE:KALYANKJIL-EQ",
            "NSE:RAJESHEXPO-EQ",
            "NSE:TTKPRESTIG-EQ",
            "NSE:AMBER-EQ",
            "NSE:VGUARD-EQ",
            "NSE:ORIENTELEC-EQ",
            "NSE:BATAINDIA-EQ",
        ],
    },
    "Oil & Gas": {
        "label": "Oil & Gas",
        "symbols": [
            "NSE:RELIANCE-EQ",
            "NSE:ONGC-EQ",
            "NSE:IOC-EQ",
            "NSE:BPCL-EQ",
            "NSE:HPCL-EQ",
            "NSE:GAIL-EQ",
            "NSE:OIL-EQ",
            "NSE:PETRONET-EQ",
            "NSE:IGL-EQ",
            "NSE:GUJGASLTD-EQ",
            "NSE:ATGL-EQ",
            "NSE:MGL-EQ",
            "NSE:AEGISLOG-EQ",
            "NSE:CASTROLIND-EQ",
            "NSE:GSPL-EQ",
        ],
    },
}

# =========================================================
# CACHE
# =========================================================
_MARKET_STRIP_CACHE = {
    "ts": 0.0,
    "items": []
}
_QUOTE_CACHE = {}
_QUOTE_COOLDOWN_UNTIL = 0.0
QUOTE_CACHE_TTL = 4
QUOTE_STALE_TTL = 180
QUOTE_429_COOLDOWN = 30
_FYERS_WS_LOCK = threading.RLock()
_FYERS_WS_SOCKET = None
_FYERS_WS_SYMBOLS = set()
_FYERS_WS_TICKS = {}
_PREV_TICK_VOLUMES = {}
_DAILY_VIX_HIGH = -1
_DAILY_VIX_LOW = 999

_FYERS_WS_STATUS = {
    "connected": False,
    "started": False,
    "started_at": 0.0,
    "error": "",
    "updated_at": "",
}
_FYERS_WS_OPTION_SYMBOLS = {}
FYERS_WS_STALE_SECONDS = 20

_FUTURE_OI_CACHE = {}

def background_future_oi_updater():
    global _QUOTE_COOLDOWN_UNTIL
    while True:
        try:
            if not is_market_open():
                time.sleep(60.0)
                continue
            
            if fyers and time.time() >= _QUOTE_COOLDOWN_UNTIL:
                universe = get_fo_universe()
                symbols = universe.get("symbols") or []
                future_symbols = unique_symbols([equity_to_stock_future_symbol(symbol) for symbol in symbols if symbol])
                
                # Fetch depth in small chunks to respect rate limit (10/sec)
                for i in range(0, len(future_symbols), 3):
                    if time.time() < _QUOTE_COOLDOWN_UNTIL:
                        break
                    chunk = future_symbols[i:i + 3]
                    for sym in chunk:
                        try:
                            resp = fyers.depth({"symbol": sym, "ohlcv_flag": "1"})
                            if quote_response_rate_limited(resp):
                                _QUOTE_COOLDOWN_UNTIL = time.time() + QUOTE_429_COOLDOWN
                                break
                            
                            if resp and resp.get("s") == "error" and resp.get("code") in (-300, 401, 403, 429):
                                _QUOTE_COOLDOWN_UNTIL = time.time() + QUOTE_429_COOLDOWN
                                break
                                
                            if resp and resp.get("s") == "ok":
                                data = resp.get("d", {}).get(sym, {})
                                oi = safe_int(data.get("oi"), None)
                                pdoi = safe_int(data.get("pdoi"), None)
                                if oi is not None:
                                    _FUTURE_OI_CACHE[sym] = {"oi": oi, "pdoi": pdoi, "ts": time.time()}
                        except Exception:
                            pass
                    if time.time() < _QUOTE_COOLDOWN_UNTIL:
                        break
                    time.sleep(1.0)
        except Exception:
            pass
        time.sleep(10)

threading.Thread(target=background_future_oi_updater, daemon=True).start()

_CACHE = {
    "sector_strength": {"ts": 0.0, "data": []},
    "advance_decline": {},
    "fo_symbols": {"ts": 0.0, "data": None},
    "fo_breadth": {"ts": 0.0, "data": None},
    "option_chain": {},
    "fii_dii": {"ts": 0.0, "data": None},
    "fii_derivatives": {"ts": 0.0, "data": None},
    "home_index_quotes": {"ts": 0.0, "data": None},
    "home_index_analytics": {"ts": 0.0, "data": None},
    "home_dashboard": {"ts": 0.0, "data": None},
    "market_news": {"ts": 0.0, "data": None},
    "dashboard": {},
    "fyers_history": {},
}
DEBUG_LOGS = False

# =========================================================
# CACHE HELPERS
# =========================================================
def get_cached(bucket, key=None, ttl=5):
    now = time.time()

    if key is None:
        item = _CACHE.get(bucket, {})
    else:
        item = (_CACHE.get(bucket, {}) or {}).get(key, {})

    if item and (now - item.get("ts", 0)) < ttl:
        return item.get("data")

    return None


def set_cached(bucket, data, key=None):
    now = time.time()

    if key is None:
        _CACHE[bucket] = {"ts": now, "data": data}
    else:
        if bucket not in _CACHE:
            _CACHE[bucket] = {}
        _CACHE[bucket][key] = {"ts": now, "data": data}


# =========================================================
# HELPERS
# =========================================================
def safe_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def safe_int(value, default=None):
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except Exception:
        return default


def round2(value, default=None):
    num = safe_float(value, None)
    if num is None:
        return default
    return round(num, 2)


def clamp(value, low, high):
    value = safe_float(value, None)
    if value is None:
        return low
    return max(low, min(high, value))


def num(value, default=0.0):
    return safe_float(value, default)


def num_int(value, default=0):
    return safe_int(value, default)


def pct_change(current, previous):
    current = safe_float(current, None)
    previous = safe_float(previous, None)
    if current is None or previous is None or previous == 0:
        return None
    return round2(((current - previous) / previous) * 100)


def nearest_strike(strikes, spot):
    spot = safe_float(spot, None)
    clean_strikes = [safe_float(x, None) for x in (strikes or [])]
    clean_strikes = [x for x in clean_strikes if x is not None]

    if not clean_strikes or spot is None:
        return None

    return min(clean_strikes, key=lambda x: abs(x - spot))

def normalize_symbol_key(symbol):
    return str(symbol or "").strip().upper()


def unique_symbols(symbols):
    seen = set()
    out = []
    for s in symbols:
        key = normalize_symbol_key(s)
        if key and key not in seen:
            seen.add(key)
            out.append(str(s).strip())
    return out


def pick_first(dct, keys, default=None):
    if not isinstance(dct, dict):
        return default
    for key in keys:
        if key in dct and dct[key] not in (None, ""):
            return dct[key]
    return default


VWAP_FIELD_ALIASES = {
    "vwap", "atp", "averageprice", "average_price", "avgprice", "avg_price",
    "avgtradeprice", "avg_trade_price", "averagetradeprice", "average_trade_price",
    "average_traded_price", "avgtradedprice", "avg_traded_price", "ap"
}


def normalize_metric_key(key):
    return re.sub(r"[^a-z0-9]+", "", str(key or "").lower())


def pick_nested_metric(obj, aliases, depth=0):
    if depth > 4:
        return None
    if isinstance(obj, dict):
        for key, value in obj.items():
            if normalize_metric_key(key) in aliases and value not in (None, ""):
                return value
        for value in obj.values():
            found = pick_nested_metric(value, aliases, depth + 1)
            if found not in (None, ""):
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = pick_nested_metric(value, aliases, depth + 1)
            if found not in (None, ""):
                return found
    return None


def pick_vwap(block):
    return pick_nested_metric(block, VWAP_FIELD_ALIASES)


def clean_vwap_for_price(vwap, price, max_distance_pct=1.35):
    vwap_value = safe_float(vwap, None)
    price_value = safe_float(price, None)
    if vwap_value is None or vwap_value <= 0:
        return None
    if price_value is None or price_value <= 0:
        return vwap_value
    distance_pct = abs(vwap_value - price_value) / price_value * 100
    return vwap_value if distance_pct <= max_distance_pct else None


def compute_session_vwap(candles):
    clean = [
        row for row in (candles or [])
        if isinstance(row, dict)
        and safe_int(row.get("ts"), None) is not None
        and all(safe_float(row.get(key), None) is not None for key in ["high", "low", "close"])
    ]
    if not clean:
        return None

    latest_dt = datetime.fromtimestamp(safe_int(clean[-1].get("ts"), 0))
    session_start = latest_dt.replace(hour=9, minute=15, second=0, microsecond=0)
    session_rows = [
        row for row in clean
        if datetime.fromtimestamp(safe_int(row.get("ts"), 0)).date() == latest_dt.date()
        and datetime.fromtimestamp(safe_int(row.get("ts"), 0)) >= session_start
    ]
    if not session_rows:
        session_rows = clean[-80:]

    cumulative_tpv = 0.0
    cumulative_volume = 0.0
    typical_sum = 0.0
    typical_count = 0
    for row in session_rows:
        high = safe_float(row.get("high"), None)
        low = safe_float(row.get("low"), None)
        close = safe_float(row.get("close"), None)
        volume = safe_float(row.get("volume"), 0)
        if None in (high, low, close):
            continue
        typical = (high + low + close) / 3
        typical_sum += typical
        typical_count += 1
        if volume and volume > 0:
            cumulative_tpv += typical * volume
            cumulative_volume += volume

    if cumulative_volume > 0:
        return cumulative_tpv / cumulative_volume
    if typical_count:
        return typical_sum / typical_count
    return None


def compute_session_volume_snapshot(candles):
    clean = [
        row for row in (candles or [])
        if isinstance(row, dict)
        and safe_int(row.get("ts"), None) is not None
    ]
    if not clean:
        return {}

    latest_dt = datetime.fromtimestamp(safe_int(clean[-1].get("ts"), 0))
    session_start = latest_dt.replace(hour=9, minute=15, second=0, microsecond=0)
    session_rows = [
        row for row in clean
        if datetime.fromtimestamp(safe_int(row.get("ts"), 0)).date() == latest_dt.date()
        and datetime.fromtimestamp(safe_int(row.get("ts"), 0)) >= session_start
        and safe_float(row.get("volume"), None) is not None
    ]
    if not session_rows:
        session_rows = [
            row for row in clean[-80:]
            if safe_float(row.get("volume"), None) is not None
        ]

    volumes = [safe_float(row.get("volume"), 0) or 0 for row in session_rows]
    latest_volume = volumes[-1] if volumes else None
    prev_volumes = volumes[-13:-1] if len(volumes) >= 2 else []
    avg_volume = (sum(prev_volumes) / len(prev_volumes)) if prev_volumes else None
    ratio = (latest_volume / avg_volume) if latest_volume is not None and avg_volume not in (None, 0) else None

    return {
        "latestVolume": round2(latest_volume),
        "averageVolume": round2(avg_volume),
        "volumeRatio": round2(ratio),
    }


def get_intraday_history_snapshot(symbol_key, price=None):
    try:
        history = fetch_fyers_history(symbol_key, resolution="5", lookback_minutes=900)
        if not isinstance(history, dict) or not history.get("ok"):
            return {}
        candles = history.get("candles") or []
        # V2.0.20M1: retain the first real candle open for today's IST session.
        # Quote feeds can occasionally omit `open`; gap safety must not silently disappear.
        today = ist_now().date()
        today_rows = []
        for row in candles:
            if not isinstance(row, dict):
                continue
            ts = safe_int(row.get("ts"), None)
            if ts is None:
                continue
            try:
                if datetime.fromtimestamp(ts, IST).date() == today:
                    today_rows.append(row)
            except Exception:
                continue
        today_open = safe_float(today_rows[0].get("open"), None) if today_rows else None
        vwap = compute_session_vwap(candles)
        volume_snapshot = compute_session_volume_snapshot(candles)
        latest = candles[-1] if candles else {}
        latest_close = safe_float(latest.get("close"), None) if isinstance(latest, dict) else None
        ref_price = price if price is not None else latest_close
        return {
            "ltp": latest_close,
            "todayOpen": round2(today_open),
            "vwap": clean_vwap_for_price(vwap, ref_price, max_distance_pct=2.25),
            **volume_snapshot,
            "source": "history_5m",
        }
    except Exception as e:
        print(f"intraday history snapshot error {symbol_key}: {e}")
        return {}


def get_intraday_history_vwap(symbol_key, price=None):
    return get_intraday_history_snapshot(symbol_key, price).get("vwap")


def infer_option_strike_step(rows):
    strikes = sorted(set(
        safe_float(row.get("strike"), None)
        for row in rows or []
        if safe_float(row.get("strike"), None) is not None
    ))
    diffs = [
        round2(strikes[i] - strikes[i - 1])
        for i in range(1, len(strikes))
        if strikes[i] > strikes[i - 1]
    ]
    return safe_float(diffs[len(diffs) // 2], 50) if diffs else 50


def build_trade_zones(spot, future, analytics, chain, history_snapshot=None):
    ref = safe_float((spot or {}).get("ltp"), None)
    if ref is None:
        ref = safe_float((future or {}).get("ltp"), None)

    vwap = safe_float((analytics or {}).get("vwap"), None)
    pcr = safe_float((analytics or {}).get("pcr"), None)
    net_oi = safe_float((analytics or {}).get("netOiChange"), None)
    supports = sorted([
        safe_float(x, None)
        for x in ((analytics or {}).get("supports") or [])
        if safe_float(x, None) is not None
    ])
    resistances = sorted([
        safe_float(x, None)
        for x in ((analytics or {}).get("resistances") or [])
        if safe_float(x, None) is not None
    ])

    support = None
    resistance = None
    if ref is not None:
        lower = [x for x in supports if x <= ref]
        upper = [x for x in resistances if x >= ref]
        support = lower[-1] if lower else (supports[-1] if supports else None)
        resistance = upper[0] if upper else (resistances[0] if resistances else None)

    step = infer_option_strike_step(chain)
    buffer_points = max((ref or 0) * 0.0012, step * 0.15, 1)

    near_rows = []
    if ref is not None:
        near_rows = [
            row for row in chain or []
            if safe_float(row.get("strike"), None) is not None
            and abs(safe_float(row.get("strike"), ref) - ref) <= step * 3
        ]
    if not near_rows:
        near_rows = chain or []

    ce_volume = sum(num_int(row.get("ce_volume"), 0) for row in near_rows)
    pe_volume = sum(num_int(row.get("pe_volume"), 0) for row in near_rows)
    option_volume_total = ce_volume + pe_volume
    option_volume_side = "CE" if ce_volume > pe_volume * 1.08 else "PE" if pe_volume > ce_volume * 1.08 else "MIXED"

    history_ratio = safe_float((history_snapshot or {}).get("volumeRatio"), None)
    spot_volume = safe_float((spot or {}).get("volume"), None)
    future_volume = safe_float((future or {}).get("volume"), None)
    volume_ready = bool(option_volume_total > 0 and (history_ratio is None or history_ratio >= 0.75))

    price_side = "MIXED"
    if ref is not None and vwap is not None:
        if ref >= vwap + buffer_points:
            price_side = "CE"
        elif ref <= vwap - buffer_points:
            price_side = "PE"

    if price_side == "MIXED" and ref is not None:
        if resistance is not None and ref >= resistance + buffer_points:
            price_side = "CE"
        elif support is not None and ref <= support - buffer_points:
            price_side = "PE"

    oi_side = "MIXED"
    if pcr is not None:
        if pcr >= 1.02:
            oi_side = "CE"
        elif pcr <= 0.98:
            oi_side = "PE"
    if oi_side == "MIXED" and net_oi is not None:
        if net_oi > 0:
            oi_side = "CE"
        elif net_oi < 0:
            oi_side = "PE"

    zone = "Trap Zone"
    side = "WAIT"
    tone = "trap"
    if price_side == "CE" and option_volume_side in ("CE", "MIXED") and oi_side in ("CE", "MIXED") and volume_ready:
        zone = "Buy Zone"
        side = "CE"
        tone = "buy"
    elif price_side == "PE" and option_volume_side in ("PE", "MIXED") and oi_side in ("PE", "MIXED") and volume_ready:
        zone = "Sell Zone"
        side = "PE"
        tone = "sell"

    blockers = []
    if price_side == "MIXED":
        blockers.append("Price not clear")
    if vwap is None:
        blockers.append("VWAP missing")
    if oi_side not in (side, "MIXED") and side != "WAIT":
        blockers.append("OI against")
    if option_volume_side not in (side, "MIXED") and side != "WAIT":
        blockers.append("Volume against")
    if not volume_ready:
        blockers.append("Volume weak")
    if zone == "Trap Zone" and not blockers:
        blockers.append("Signals mixed")

    return {
        "zone": zone,
        "side": side,
        "tone": tone,
        "priceSide": price_side,
        "oiSide": oi_side,
        "volumeSide": option_volume_side,
        "volumeReady": volume_ready,
        "support": round2(support),
        "resistance": round2(resistance),
        "vwap": round2(vwap),
        "buffer": round2(buffer_points),
        "pcr": round2(pcr),
        "netOiChange": round2(net_oi),
        "ceVolume": ce_volume,
        "peVolume": pe_volume,
        "historyVolumeRatio": round2(history_ratio),
        "spotVolume": round2(spot_volume),
        "futureVolume": round2(future_volume),
        "message": (
            "CE allowed" if zone == "Buy Zone"
            else "PE allowed" if zone == "Sell Zone"
            else "Wait"
        ),
        "reason": (
            "Price, OI and volume support CE."
            if zone == "Buy Zone"
            else "Price, OI and volume support PE."
            if zone == "Sell Zone"
            else "Do not trade until price, OI and volume match."
        ),
        "blockers": blockers[:4],
    }


def quote_response_rate_limited(resp):
    if not isinstance(resp, dict):
        return False
    return safe_int(resp.get("code"), None) == 429


def quote_block_has_value(block):
    if not isinstance(block, dict):
        return False
    return any(
        safe_float(block.get(key), None) is not None
        for key in ["lp", "ltp", "last_price", "lastPrice", "ch", "chp", "prev_close_price"]
    )


def cache_quote_block(symbol, block):
    if not quote_block_has_value(block):
        return
    now = time.time()
    for key in [symbol, normalize_symbol_key(symbol), normalize_symbol_key(block.get("symbol", ""))]:
        if key:
            _QUOTE_CACHE[key] = {"ts": now, "data": block}


def fyers_ws_access_token():
    refresh_fyers_from_env()
    if not FYERS_CLIENT_ID or not FYERS_ACCESS_TOKEN:
        return ""
    return f"{FYERS_CLIENT_ID}:{FYERS_ACCESS_TOKEN}"


def stream_symbol_for_index(symbol_key):
    symbol_key = normalize_symbol_key(symbol_key)
    cfg = INDEX_MAP.get(symbol_key)
    if cfg:
        return cfg.get("spot") or "NSE:NIFTY50-INDEX"
    label_symbol = MARKET_STRIP_SYMBOLS.get(symbol_key)
    if label_symbol:
        return label_symbol
    for label, fyers_symbol in MARKET_STRIP_SYMBOLS.items():
        if normalize_symbol_key(label) == symbol_key:
            return fyers_symbol
    return "NSE:NIFTY50-INDEX"

_ACTIVE_FUTURE_CACHE = {}


def _future_month(year, month, offset):
    month0 = (month - 1) + int(offset)
    return year + month0 // 12, month0 % 12 + 1


def active_future_candidates(symbol_key):
    key = normalize_symbol_key(symbol_key)
    if key not in INDEX_MAP:
        return []
    root = {"NIFTY": "NIFTY", "BANKNIFTY": "BANKNIFTY", "SENSEX": "SENSEX"}.get(key)
    exchange = "BSE" if key == "SENSEX" else "NSE"
    if not root:
        return []
    now = ist_now()
    out = []
    for offset in (0, 1, 2):
        year, month = _future_month(now.year, now.month, offset)
        month_text = datetime(year, month, 1).strftime("%b").upper()
        out.append(f"{exchange}:{root}{str(year)[-2:]}{month_text}FUT")
    return unique_symbols(out)


def resolve_active_future(symbol_key, force=False):
    key = normalize_symbol_key(symbol_key)
    cfg = INDEX_MAP.get(key)
    if not cfg:
        return {"verified": False, "symbol": None, "block": {}, "reason": "Unsupported index"}

    now = time.time()
    cached = _ACTIVE_FUTURE_CACHE.get(key) or {}
    if not force and now - safe_float(cached.get("checkedAt"), 0) < 120:
        return cached

    selected = None
    selected_block = {}
    for candidate in active_future_candidates(key):
        try:
            block = get_quote_block(candidate) or {}
            metrics = extract_quote_metrics(block)
            ltp = safe_float(metrics.get("ltp"), None)
            if ltp is None or ltp <= 0:
                continue
            tick_time = safe_int(pick_first(block, ["tt", "timestamp", "last_traded_time", "lastTradeTime"], None), None)
            if tick_time is not None:
                tick_seconds = tick_time / 1000.0 if tick_time > 100000000000 else float(tick_time)
                if abs(now - tick_seconds) > 14 * 24 * 3600:
                    continue
            selected = candidate
            selected_block = block
            break
        except Exception as e:
            if DEBUG_LOGS:
                print(f"future verify error {candidate}: {e}")

    aliases = [x for x in (cfg.get("option_symbols") or []) if x and "FUT" not in str(x).upper()]
    if selected:
        cfg["future"] = selected
        cfg["option_symbols"] = unique_symbols([cfg.get("spot"), selected] + aliases)
        result = {
            "verified": True,
            "symbol": selected,
            "block": selected_block,
            "checkedAt": now,
            "reason": "Live FYERS futures quote verified",
        }
    else:
        cfg["future"] = None
        cfg["option_symbols"] = unique_symbols([cfg.get("spot")] + aliases)
        result = {
            "verified": False,
            "symbol": None,
            "block": {},
            "checkedAt": now,
            "reason": "No current FYERS futures contract could be verified",
        }
    _ACTIVE_FUTURE_CACHE[key] = result
    return result


def stream_future_for_index(symbol_key):
    return resolve_active_future(symbol_key).get("symbol")


def is_streamable_index_key(symbol_key):
    symbol_key = normalize_symbol_key(symbol_key)
    if symbol_key in INDEX_MAP or symbol_key in MARKET_STRIP_SYMBOLS:
        return True
    return any(normalize_symbol_key(label) == symbol_key for label in MARKET_STRIP_SYMBOLS)


def normalize_ws_messages(message):
    if isinstance(message, str):
        try:
            message = json.loads(message)
        except Exception:
            return []

    if isinstance(message, list):
        out = []
        for item in message:
            out.extend(normalize_ws_messages(item))
        return out

    if not isinstance(message, dict):
        return []

    nested = []
    for key in ["d", "data", "ticks", "symbolData"]:
        if isinstance(message.get(key), list):
            nested.extend(normalize_ws_messages(message.get(key)))
    if nested:
        return nested

    symbol = pick_first(message, ["symbol", "s", "fyToken", "n"], "")
    ltp = round2(pick_first(message, ["ltp", "lp", "last_price", "lastPrice", "price", "market_price"], None))
    change = round2(pick_first(message, ["ch", "change", "net_change", "netChange"], None))
    change_pct = round2(pick_first(message, ["chp", "change_pct", "change_percentage", "changePercent"], None))
    volume = safe_float(pick_first(message, ["vol_traded_today", "volume", "v", "vol"], None), None)
    vwap = round2(pick_vwap(message))
    if not symbol and not quote_block_has_value(message):
        return []

    return [{
        "symbol": str(symbol or "").strip(),
        "ltp": ltp,
        "change": change,
        "change_pct": change_pct,
        "volume": round2(volume),
        "vwap": vwap,
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        "ts": int(time.time() * 1000),
        "raw": message,
    }]


def on_fyers_ws_message(message):
    ticks = normalize_ws_messages(message)
    if not ticks:
        return
    with _FYERS_WS_LOCK:
        for tick in ticks:
            symbol = tick.get("symbol") or ""
            keys = [symbol, normalize_symbol_key(symbol)]
            for key in keys:
                if key:
                    _FYERS_WS_TICKS[key] = tick
            # Broadcast raw tick to subscribed Socket.IO clients
            
            # --- WHALE TRACKER ---
            if "CE" in symbol or "PE" in symbol:
                vol = safe_float(tick.get("volume"), 0)
                if vol > 0:
                    old_vol = _PREV_TICK_VOLUMES.get(symbol, 0)
                    if old_vol > 0 and (vol - old_vol) > 50000:  # 50k jump in a single tick
                        try:
                            socketio.emit('oi_spike_alert', {
                                "symbol": symbol,
                                "type": "VOLUME_SPIKE",
                                "value": vol - old_vol,
                                "timestamp": datetime.now().strftime("%H:%M:%S")
                            })
                        except Exception:
                            pass
                    _PREV_TICK_VOLUMES[symbol] = vol
            # ---------------------
            if symbol and is_meaningful_tick(tick):
                try:
                    socketio.emit('tick', tick, room=symbol)
                    # Generic index rooms receive only their spot-index stream. Derivative
                    # CE/PE/futures ticks are never rebroadcast into NIFTY/BANKNIFTY/SENSEX.
                    spot_room = {
                        normalize_symbol_key(INDEX_MAP["NIFTY"]["spot"]): "NIFTY",
                        normalize_symbol_key(INDEX_MAP["BANKNIFTY"]["spot"]): "BANKNIFTY",
                        normalize_symbol_key(INDEX_MAP["SENSEX"]["spot"]): "SENSEX",
                    }.get(normalize_symbol_key(symbol))
                    if spot_room:
                        socketio.emit('tick', tick, room=spot_room)
                except Exception:

                    pass
            if symbol and is_meaningful_tick(tick):
                cache_quote_block(symbol, {
                    "symbol": symbol,
                    "lp": tick.get("ltp"),
                    "ch": tick.get("change"),
                    "chp": tick.get("change_pct"),
                    "vol_traded_today": tick.get("volume"),
                    "vwap": tick.get("vwap") or pick_vwap(tick),
                })
        _FYERS_WS_STATUS["connected"] = True
        _FYERS_WS_STATUS["updated_at"] = datetime.now().strftime("%d-%m-%Y %H:%M:%S")


def is_meaningful_tick(tick):
    return isinstance(tick, dict) and safe_float(tick.get("ltp"), None) is not None


def reset_fyers_ws_stream():
    global _FYERS_WS_SOCKET

    with _FYERS_WS_LOCK:
        socket = _FYERS_WS_SOCKET
        _FYERS_WS_SOCKET = None
        _FYERS_WS_SYMBOLS.clear()
        _FYERS_WS_TICKS.clear()
        _FYERS_WS_STATUS.update({
            "connected": False,
            "started": False,
            "started_at": 0.0,
            "error": "",
            "updated_at": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        })

    if socket is None:
        return

    for method_name in ("close_connection", "close"):
        method = getattr(socket, method_name, None)
        if callable(method):
            try:
                method()
            except Exception:
                pass
            break


def fyers_ws_is_stale():
    with _FYERS_WS_LOCK:
        if _FYERS_WS_SOCKET is None:
            return False
        tick_times = [
            safe_float(tick.get("ts"), None)
            for tick in _FYERS_WS_TICKS.values()
            if isinstance(tick, dict)
        ]

    tick_times = [value / 1000.0 if value > 10_000_000_000 else value for value in tick_times if value]
    if not tick_times:
        started_at = safe_float(_FYERS_WS_STATUS.get("started_at"), 0.0)
        return bool(started_at and time.time() - started_at > FYERS_WS_STALE_SECONDS)
    return time.time() - max(tick_times) > FYERS_WS_STALE_SECONDS


def ensure_fyers_ws_stream(symbols):
    global _FYERS_WS_SOCKET
    symbols = unique_symbols(symbols)
    if not symbols:
        return False, "No symbols requested"
    if data_ws is None:
        return False, "fyers_apiv3 websocket module is unavailable"
    token = fyers_ws_access_token()
    if not token:
        return False, "Fyers websocket token is missing"

    if fyers_ws_is_stale():
        reset_fyers_ws_stream()

    with _FYERS_WS_LOCK:
        missing = [symbol for symbol in symbols if symbol not in _FYERS_WS_SYMBOLS]
        _FYERS_WS_SYMBOLS.update(symbols)

        if _FYERS_WS_SOCKET is not None:
            if missing:
                try:
                    # Fyers websocket may ignore requests with too many symbols at once. Chunking to 50.
                    for i in range(0, len(missing), 50):
                        chunk = missing[i:i+50]
                        _FYERS_WS_SOCKET.subscribe(symbols=chunk, data_type="SymbolUpdate")
                except Exception as e:
                    _FYERS_WS_STATUS["error"] = str(e)
                    return False, str(e)
            return True, ""

        def on_connect():
            with _FYERS_WS_LOCK:
                wanted = list(_FYERS_WS_SYMBOLS)
                _FYERS_WS_STATUS["connected"] = True
                _FYERS_WS_STATUS["started"] = True
                _FYERS_WS_STATUS["error"] = ""
                _FYERS_WS_STATUS["updated_at"] = datetime.now().strftime("%d-%m-%Y %H:%M:%S")
            try:
                for i in range(0, len(wanted), 50):
                    chunk = wanted[i:i+50]
                    _FYERS_WS_SOCKET.subscribe(symbols=chunk, data_type="SymbolUpdate")
            except Exception as e:
                with _FYERS_WS_LOCK:
                    _FYERS_WS_STATUS["error"] = str(e)

        def on_error(error):
            with _FYERS_WS_LOCK:
                _FYERS_WS_STATUS["connected"] = False
                _FYERS_WS_STATUS["error"] = str(error)
                _FYERS_WS_STATUS["updated_at"] = datetime.now().strftime("%d-%m-%Y %H:%M:%S")
            print("fyers websocket error:", error)

        def on_close(*_args):
            with _FYERS_WS_LOCK:
                _FYERS_WS_STATUS["connected"] = False
                _FYERS_WS_STATUS["updated_at"] = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

        try:
            _FYERS_WS_SOCKET = data_ws.FyersDataSocket(
                access_token=token,
                write_to_file=True,
                litemode=True,
                reconnect=True,
                on_message=on_fyers_ws_message,
                on_error=on_error,
                on_connect=on_connect,
                on_close=on_close,
                reconnect_retry=5,
            )
            _FYERS_WS_STATUS["started"] = True
            _FYERS_WS_STATUS["started_at"] = time.time()
            threading.Thread(target=_FYERS_WS_SOCKET.connect, daemon=True).start()
            return True, ""
        except Exception as e:
            _FYERS_WS_SOCKET = None
            _FYERS_WS_STATUS["error"] = str(e)
            return False, str(e)


def get_cached_quote_block(symbol, ttl=QUOTE_CACHE_TTL):
    item = _QUOTE_CACHE.get(symbol) or _QUOTE_CACHE.get(normalize_symbol_key(symbol))
    if not item:
        return {}
    if time.time() - item.get("ts", 0) <= ttl:
        return item.get("data") or {}
    return {}


def get_stale_quote_block(symbol):
    item = _QUOTE_CACHE.get(symbol) or _QUOTE_CACHE.get(normalize_symbol_key(symbol))
    if not item:
        return {}
    if time.time() - item.get("ts", 0) <= QUOTE_STALE_TTL:
        return item.get("data") or {}
    return {}


def has_meaningful_number(value):
    val = safe_float(value, None)
    return val is not None and val != 0


def get_change_pct_from_quote(block):
    if not isinstance(block, dict):
        return None

    for key in ["chp", "change_percentage", "changePercent", "netChangePercent"]:
        val = block.get(key, None)
        if val not in (None, ""):
            return round2(val)

    lp = safe_float(
        block.get("lp", block.get("ltp", block.get("last_price", block.get("lastPrice", None)))),
        None
    )

    prev_close = safe_float(
        block.get(
            "prev_close_price",
            block.get("prev_close", block.get("prevClose", block.get("previous_close", None)))
        ),
        None
    )

    if lp is not None and prev_close is not None and lp > 0 and prev_close > 0:
        return pct_change(lp, prev_close)

    ch = safe_float(block.get("ch", block.get("change", None)), None)
    if ch is not None and prev_close is not None and prev_close > 0:
        return pct_change(prev_close + ch, prev_close)

    return None


def get_quote_block(symbol):
    global _QUOTE_COOLDOWN_UNTIL
    active_client = get_request_fyers_client()
    if not active_client:
        return {}

    cached = get_cached_quote_block(symbol)
    if cached:
        return cached

    if time.time() < _QUOTE_COOLDOWN_UNTIL:
        return get_stale_quote_block(symbol)

    try:
        resp = (active_client or fyers).quotes({"symbols": symbol})
        if quote_response_rate_limited(resp):
            _QUOTE_COOLDOWN_UNTIL = time.time() + QUOTE_429_COOLDOWN
            return get_stale_quote_block(symbol)

        items = resp.get("d", []) or []
        if items:
            block = items[0].get("v", {}) or {}
            cache_quote_block(symbol, block)
            return block
    except Exception as e:
        print(f"quote error {symbol}: {e}")

    return get_stale_quote_block(symbol)


def get_quotes_map(symbols, chunk_size=10, fallback_missing=True):
    global _QUOTE_COOLDOWN_UNTIL
    refresh_fyers_from_env()
    data = {}
    if not fyers or not symbols:
        return data

    req_symbols = unique_symbols(symbols)
    if not req_symbols:
        return data

    missing_symbols = []
    for req in req_symbols:
        cached = get_cached_quote_block(req)
        if cached:
            data[req] = cached
            data[normalize_symbol_key(req)] = cached
        else:
            missing_symbols.append(req)

    if time.time() < _QUOTE_COOLDOWN_UNTIL:
        for req in missing_symbols:
            stale = get_stale_quote_block(req)
            if stale:
                data[req] = stale
                data[normalize_symbol_key(req)] = stale
        return data

    for i in range(0, len(missing_symbols), chunk_size):
        chunk = missing_symbols[i:i + chunk_size]

        try:
            resp = fyers.quotes({"symbols": ",".join(chunk)})
            if quote_response_rate_limited(resp):
                _QUOTE_COOLDOWN_UNTIL = time.time() + QUOTE_429_COOLDOWN
                break

            items = resp.get("d", []) or []

            for item in items:
                raw_sym = (
                    item.get("n")
                    or item.get("symbol")
                    or item.get("s")
                    or item.get("fyToken")
                    or ""
                )
                val = item.get("v", {}) or {}

                possible_keys = {
                    normalize_symbol_key(raw_sym),
                    normalize_symbol_key(val.get("symbol", "")),
                    normalize_symbol_key(val.get("short_name", "")),
                    normalize_symbol_key(val.get("description", "")),
                }

                for req in chunk:
                    req_norm = normalize_symbol_key(req)
                    if req_norm in possible_keys:
                        cache_quote_block(req, val)
                        data[req] = val
                        data[req_norm] = val

        except Exception as e:
            print(f"batch quote error for chunk {chunk}: {e}")
            if "429" in str(e):
                _QUOTE_COOLDOWN_UNTIL = time.time() + QUOTE_429_COOLDOWN
                break

    if fallback_missing and time.time() >= _QUOTE_COOLDOWN_UNTIL:
        for req in req_symbols:
            req_norm = normalize_symbol_key(req)
            existing = data.get(req) or data.get(req_norm) or {}
            if existing:
                data[req] = existing
                data[req_norm] = existing
                continue

            try:
                single = get_quote_block(req)
                if single:
                    data[req] = single
                    data[req_norm] = single
            except Exception as e:
                print(f"fallback quote error {req}: {e}")

    for req in req_symbols:
        req_norm = normalize_symbol_key(req)
        if req not in data:
            stale = get_stale_quote_block(req)
            if stale:
                data[req] = stale
                data[req_norm] = stale
        if req not in data:
            data[req] = data.get(req_norm, {})

    return data


def extract_quote_metrics(block):
    if not isinstance(block, dict):
        return {
            "ltp": None,
            "change": None,
            "change_pct": None,
            "high": None,
            "low": None,
            "open": None,
            "prev_close": None,
            "volume": None,
            "vwap": None,
        }

    prev_close = round2(
        pick_first(block, [
            "prev_close_price", "prev_close", "prevClose", "previous_close", "close_price"
        ], None)
    )

    change = round2(
        pick_first(block, [
            "ch", "change", "netChange"
        ], None)
    )

    ltp = round2(
        pick_first(block, [
            "lp", "ltp", "last_price", "lastPrice", "price", "market_price"
        ], None)
    )

    if ltp is None and prev_close is not None and change is not None:
        ltp = round2(prev_close + change)

    change_pct = pick_first(block, [
        "chp", "change_percentage", "changePercent", "netChangePercent"
    ], None)

    if change_pct in (None, "") and ltp is not None and prev_close is not None:
        change_pct = pct_change(ltp, prev_close)

    if change is None and ltp is not None and prev_close is not None:
        change = round2(ltp - prev_close)

    vwap = round2(pick_vwap(block))

    return {
        "ltp": ltp,
        "change": round2(change),
        "change_pct": round2(change_pct),
        "high": round2(pick_first(block, ["high_price", "high"], None)),
        "low": round2(pick_first(block, ["low_price", "low"], None)),
        "open": round2(pick_first(block, ["open_price", "open"], None)),
        "prev_close": prev_close,
        "volume": safe_int(pick_first(block, ["volume", "vol_traded_today"], None), None),
        "vwap": vwap,
    }


def clean_news_text(value):
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_news_date(value):
    try:
        if not value:
            return None
        return parsedate_to_datetime(value).isoformat()
    except Exception:
        return None


def classify_news_tone(text):
    lower = text.lower()
    bullish = sum(1 for word in NEWS_BULLISH_WORDS if word in lower)
    bearish = sum(1 for word in NEWS_BEARISH_WORDS if word in lower)
    if bullish > bearish:
        return "Bullish"
    if bearish > bullish:
        return "Bearish"
    return "Watch"


def score_market_news(title, summary):
    text = f"{title} {summary}".lower()
    score = 0
    matched = []
    for keyword, weight in NEWS_IMPACT_KEYWORDS.items():
        if keyword in text:
            score += weight
            matched.append(keyword.upper() if len(keyword) <= 4 else keyword.title())

    if "breaking" in text or "live" in text:
        score += 2

    return score, matched[:4]


def fetch_market_news(cache_ttl=180):
    cached = get_cached("market_news", ttl=cache_ttl)
    if cached is not None:
        return cached

    items = []
    seen = set()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OptionDashboard/1.0",
    }

    for feed in MARKET_NEWS_FEEDS:
        try:
            resp = requests.get(feed["url"], headers=headers, timeout=5)
            if resp.status_code >= 400:
                continue
            root = ET.fromstring(resp.content)
            for item in root.findall(".//item")[:18]:
                title = clean_news_text(item.findtext("title"))
                link = clean_news_text(item.findtext("link"))
                summary = clean_news_text(item.findtext("description"))
                published = parse_news_date(item.findtext("pubDate"))
                if not title:
                    continue

                key = re.sub(r"[^a-z0-9]+", "", title.lower())[:90]
                if key in seen:
                    continue
                seen.add(key)

                score, tags = score_market_news(title, summary)
                if score < 3:
                    continue

                tone = classify_news_tone(f"{title} {summary}")
                impact = "High" if score >= 9 else "Medium" if score >= 5 else "Watch"
                items.append({
                    "title": title,
                    "summary": summary[:180],
                    "link": link,
                    "source": feed["name"],
                    "published": published,
                    "score": score,
                    "impact": impact,
                    "tone": tone,
                    "tags": tags,
                })
        except Exception as e:
            print(f"market news feed error {feed.get('name')}: {e}")

    items.sort(key=lambda item: (item.get("score", 0), item.get("published") or ""), reverse=True)
    result = {
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        "items": items[:8],
        "sources": [feed["name"] for feed in MARKET_NEWS_FEEDS],
    }
    set_cached("market_news", result)
    return result


def _extract_option_rows_from_data(data):
    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return []

    for key in [
        "optionsChain", "optionChain", "options", "chain", "oc",
        "expiryChain", "rows", "data", "d"
    ]:
        value = data.get(key)
        if isinstance(value, list):
            return value

    for _, value in data.items():
        if isinstance(value, list) and value:
            first = value[0]
            if isinstance(first, dict):
                return value

    return []


_SUCCESSFUL_OC_SYMBOLS = {}
_OPTION_EXPIRY_CACHE = {}
_OPTION_EXPIRY_CACHE_TTL = 60


def _option_chain_data(raw):
    if not isinstance(raw, dict):
        return {}
    data = raw.get("data", raw)
    return data if isinstance(data, dict) else {}


def normalize_expiry_date(value):
    if value in (None, ""):
        return None

    text = str(value).strip()
    if not text:
        return None

    if text.isdigit() and len(text) >= 9:
        try:
            return datetime.fromtimestamp(int(text), tz=IST).date().isoformat()
        except Exception:
            return None

    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y", "%d%b%Y", "%d-%b-%y", "%d%b%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except Exception:
            pass
    return None


def extract_option_expiry_catalog(raw):
    data = _option_chain_data(raw)
    values = data.get("expiryData") or data.get("expiry_data") or []
    if not isinstance(values, list):
        return []

    today = ist_now().date()
    result = []
    seen = set()

    for item in values:
        if not isinstance(item, dict):
            continue

        timestamp = item.get("expiry") or item.get("timestamp") or item.get("ts")
        timestamp = str(timestamp).strip() if timestamp not in (None, "") else None
        date_iso = normalize_expiry_date(item.get("date") or item.get("expiry_date") or timestamp)
        if not date_iso:
            continue

        if date_iso in seen:
            continue
        seen.add(date_iso)

        try:
            expiry_date = datetime.strptime(date_iso, "%Y-%m-%d").date()
            dte = max(0, (expiry_date - today).days)
        except Exception:
            dte = None

        result.append({
            "date": date_iso,
            "timestamp": timestamp,
            "type": str(item.get("expiry_flag") or item.get("type") or "").strip().upper() or None,
            "dte": dte,
        })

    def sort_key(item):
        ts = safe_int(item.get("timestamp"), None)
        if ts is not None:
            return (0, ts)
        return (1, item.get("date") or "9999-12-31")

    result.sort(key=sort_key)
    return result


def resolve_option_expiry(catalog, requested=None):
    catalog = catalog or []
    if not catalog:
        return None

    if requested in (None, ""):
        return catalog[0]

    requested_text = str(requested).strip()
    requested_date = normalize_expiry_date(requested_text)

    for item in catalog:
        if requested_text and requested_text == str(item.get("timestamp") or ""):
            return item
        if requested_date and requested_date == item.get("date"):
            return item

    return None


def get_option_expiry_catalog(symbol_key, cache_ttl=_OPTION_EXPIRY_CACHE_TTL, force=False):
    key = normalize_symbol_key(symbol_key)
    now = time.time()
    cached = _OPTION_EXPIRY_CACHE.get(key)
    if not force and cached and now - cached.get("ts", 0) <= cache_ttl:
        return cached.get("data") or []

    cfg = INDEX_MAP.get(key)
    if not cfg:
        return []

    option_symbols = cfg.get("option_symbols") or [cfg.get("spot"), cfg.get("future")]
    raw = get_option_chain_raw(option_symbols, cfg.get("future"), strikecount=1)
    catalog = extract_option_expiry_catalog(raw)
    if not catalog:
        try:
            from optionsdesk_v195_routes import _ensure_kotak_scrip_master
            master = _ensure_kotak_scrip_master()
            kotak_exp = master.get("expiries", {}).get(key, [])
            if kotak_exp:
                catalog = [{"date": exp, "timestamp": None, "flag": None} for exp in kotak_exp]
        except Exception:
            pass
    if catalog:
        _OPTION_EXPIRY_CACHE[key] = {"ts": now, "data": catalog}
    return catalog


def get_option_chain_raw(symbol_or_symbols, fallback_symbol=None, strikecount=12, expiry_timestamp=None):
    refresh_fyers_from_env()
    if not fyers:
        return {}

    candidates = []

    if isinstance(symbol_or_symbols, (list, tuple, set)):
        candidates.extend([str(x).strip() for x in symbol_or_symbols if str(x).strip()])
    elif symbol_or_symbols:
        candidates.append(str(symbol_or_symbols).strip())

    if fallback_symbol:
        if isinstance(fallback_symbol, (list, tuple, set)):
            candidates.extend([str(x).strip() for x in fallback_symbol if str(x).strip()])
        else:
            candidates.append(str(fallback_symbol).strip())

    candidates = unique_symbols(candidates)

    first_candidate = candidates[0] if candidates else "UNKNOWN"
    if first_candidate in _SUCCESSFUL_OC_SYMBOLS:
        successful_sym = _SUCCESSFUL_OC_SYMBOLS[first_candidate]
        if successful_sym in candidates:
            candidates.remove(successful_sym)
            candidates.insert(0, successful_sym)

    try:
        requested_count = int(strikecount or 12)
    except Exception:
        requested_count = 12
    requested_count = max(1, min(50, requested_count))

    for sym in candidates:
        try:
            payload = {"symbol": sym, "strikecount": requested_count}
            if expiry_timestamp not in (None, "", 0, "0"):
                payload["timestamp"] = str(expiry_timestamp)

            resp = fyers.optionchain(payload)

            if DEBUG_LOGS:
                print(f"optionchain payload for {sym}: {payload}")
                print(f"optionchain full response for {sym}: {resp}")

            rows = _extract_option_rows_from_data(
                resp.get("data", resp) if isinstance(resp, dict) else resp
            )

            if resp and rows:
                if first_candidate != "UNKNOWN":
                    _SUCCESSFUL_OC_SYMBOLS[first_candidate] = sym
                if isinstance(resp, dict):
                    resp["_clean_requestedExpiryTimestamp"] = str(expiry_timestamp or "").strip() or None
                return resp

        except Exception as e:
            print(f"optionchain error {sym}: {e}")

    return {}

def detect_option_side(item, ce_obj, pe_obj):
    if ce_obj:
        return "CE"
    if pe_obj:
        return "PE"

    text_parts = [
        str(item.get("option_type", "")),
        str(item.get("type", "")),
        str(item.get("side", "")),
        str(item.get("instrumentType", "")),
        str(item.get("instrument_type", "")),
        str(item.get("symbol", "")),
        str(item.get("name", "")),
    ]
    text = " ".join(text_parts).upper()

    if "CE" in text or "CALL" in text:
        return "CE"
    if "PE" in text or "PUT" in text:
        return "PE"
    return None


def update_leg_values(row, side, source):
    symbol = pick_first(source, ["symbol", "fySymbol", "fyersSymbol", "ex_symbol"], None)
    token = pick_first(source, ["fyToken", "token", "instrument_token"], None)
    ltp = round2(pick_first(source, ["ltp", "lastPrice", "lp", "price"], None))
    ch = round2(pick_first(source, ["ch", "change", "netChange", "price_change", "chng"], None))
    bid = round2(pick_first(source, ["bid", "bidPrice", "bestBid", "buyPrice"], None))
    ask = round2(pick_first(source, ["ask", "askPrice", "bestAsk", "sellPrice", "offer"], None))
    oi = safe_int(pick_first(source, ["oi", "openInterest", "open_interest"], None), None)
    oich = safe_int(pick_first(source, ["oich", "chngInOI", "changeinOpenInterest", "oiChange", "oi_change"], None), None)
    volume = safe_int(pick_first(source, ["volume", "vol", "tradedVolume", "volume_traded"], None), None)
    iv = round2(
    pick_first(
        source,
        [
            "iv",
            "impliedVolatility",
            "implied_volatility",
            "ivPercent",
            "iv_percent",
            "IV",
            "ImpliedVolatility",
        ],
        None
    )
)

    if side == "CE":
        if symbol:
            row["ce_symbol"] = str(symbol).strip()
        if token:
            row["ce_token"] = str(token).strip()
        if ltp is not None:
            row["ce_ltp"] = ltp
        if ch is not None:
            row["ce_ch"] = ch
        if bid is not None:
            row["ce_bid"] = bid
        if ask is not None:
            row["ce_ask"] = ask
        if oi is not None:
            row["ce_oi"] = oi
        if oich is not None:
            row["ce_oich"] = oich
        if volume is not None:
            row["ce_volume"] = volume
        if iv is not None:
            row["ce_iv"] = iv

    elif side == "PE":
        if symbol:
            row["pe_symbol"] = str(symbol).strip()
        if token:
            row["pe_token"] = str(token).strip()
        if ltp is not None:
            row["pe_ltp"] = ltp
        if ch is not None:
            row["pe_ch"] = ch
        if bid is not None:
            row["pe_bid"] = bid
        if ask is not None:
            row["pe_ask"] = ask
        if oi is not None:
            row["pe_oi"] = oi
        if oich is not None:
            row["pe_oich"] = oich
        if volume is not None:
            row["pe_volume"] = volume
        if iv is not None:
            row["pe_iv"] = iv


def _parse_normalized_option_chain(raw, spot_price):
    if not raw:
        return []

    data = raw.get("data", raw) if isinstance(raw, dict) else raw
    rows_src = _extract_option_rows_from_data(data)

    if not rows_src:
        return []

    by_strike = {}

    for item in rows_src:
        if not isinstance(item, dict):
            continue

        strike = safe_float(
            pick_first(
                item,
                ["strike", "strike_price", "strikePrice", "sp", "strikePriceValue"],
                None
            ),
            None
        )

        if strike is None:
            ce_from_item = item.get("CE") or item.get("ce") or {}
            pe_from_item = item.get("PE") or item.get("pe") or {}

            strike = safe_float(
                pick_first(
                    ce_from_item if ce_from_item else pe_from_item,
                    ["strikePrice", "strike_price", "strike", "sp"],
                    None
                ),
                None
            )

        if strike is None or strike <= 0:
            continue

        ce_obj = item.get("CE") or item.get("ce") or {}
        pe_obj = item.get("PE") or item.get("pe") or {}

        if strike not in by_strike:
            by_strike[strike] = {
                "strike": strike,
                "ce_ltp": None,
                "ce_ch": None,
                "ce_oi": None,
                "ce_oich": None,
                "ce_volume": None,
                "ce_iv": None,
                "ce_symbol": None,
                "ce_token": None,
                "pe_ltp": None,
                "pe_ch": None,
                "pe_oi": None,
                "pe_oich": None,
                "pe_volume": None,
                "pe_iv": None,
                "pe_symbol": None,
                "pe_token": None,
                "iv": None,
            }
        row = by_strike[strike]

        if ce_obj:
            update_leg_values(row, "CE", ce_obj)
        if pe_obj:
            update_leg_values(row, "PE", pe_obj)

        side = detect_option_side(item, ce_obj, pe_obj)

        flat_source = {
            "symbol": pick_first(item, ["symbol", "fySymbol", "fyersSymbol", "ex_symbol"], None),
            "fyToken": pick_first(item, ["fyToken", "token", "instrument_token"], None),
            "ltp": pick_first(item, ["ce_ltp", "pe_ltp", "ltp", "lastPrice", "lp"], None),
            "ch": pick_first(item, ["ce_ch", "pe_ch", "ch", "change", "netChange", "price_change", "chng"], None),
            "oi": pick_first(item, ["oi_CE", "oi_PE", "ce_oi", "pe_oi", "oi", "openInterest"], None),
            "oich": pick_first(item, ["oich_CE", "oich_PE", "ce_oich", "pe_oich", "oich", "changeinOpenInterest", "chngInOI"], None),
            "volume": pick_first(item, ["volume_CE", "volume_PE", "ce_volume", "pe_volume", "volume", "vol"], None),
            "iv": pick_first(item, ["iv_CE", "iv_PE", "ce_iv", "pe_iv", "iv"], None),
        }

        if side == "CE":
            update_leg_values(row, "CE", flat_source)
        elif side == "PE":
            update_leg_values(row, "PE", flat_source)

    rows = list(by_strike.values())
    rows.sort(key=lambda x: x["strike"])

    rows = [
        r for r in rows
        if any(
            r.get(k) is not None
            for k in [
                "ce_ltp", "ce_oi", "ce_oich", "ce_volume",
                "pe_ltp", "pe_oi", "pe_oich", "pe_volume"
            ]
        )
    ]

    if not rows:
        return []

    strikes = [r["strike"] for r in rows]
    atm = nearest_strike(strikes, spot_price)

    step = 100
    spot_num = safe_float(spot_price, None)

    if len(strikes) >= 2:
        diffs = [
            abs(strikes[i + 1] - strikes[i])
            for i in range(len(strikes) - 1)
            if strikes[i + 1] != strikes[i]
        ]
        if diffs:
            step = min(diffs)

    for r in rows:
        ce_oi = num_int(r.get("ce_oi"), 0)
        pe_oi = num_int(r.get("pe_oi"), 0)
        ce_oich = num_int(r.get("ce_oich"), 0)
        pe_oich = num_int(r.get("pe_oich"), 0)

        ce_iv = safe_float(r.get("ce_iv"), None)
        pe_iv = safe_float(r.get("pe_iv"), None)

        r["iv"] = ce_iv if ce_iv is not None else pe_iv
        r["is_atm"] = (atm is not None and r["strike"] == atm)
        r["distance_from_atm"] = abs(r["strike"] - atm) if atm is not None else None
        r["gamma_proxy"] = (
            round2((ce_oi + pe_oi) / max(1, abs(r["strike"] - spot_num) + step))
            if spot_num is not None else None
        )
        r["oi_total"] = ce_oi + pe_oi
        r["oi_change_total"] = ce_oich + pe_oich

    return rows
    

# =========================================================
# STRICT OPTION CONTRACT NORMALIZATION
# =========================================================
# FYERS currently returns flat one-contract rows. We validate side, strike and
# exact symbol first; only then do generic fields such as oi/oich/ltp become
# eligible for that CE or PE leg. Opposite-side key fallback is never allowed.
def _strict_pick(obj, keys, default=None):
    if not isinstance(obj, dict):
        return default
    for key in keys:
        if key in obj and obj.get(key) is not None:
            return obj.get(key)
    return default

def _strict_expiry_meta(raw):
    data = raw.get("data", raw) if isinstance(raw, dict) else {}
    expiry_data = data.get("expiryData", []) if isinstance(data, dict) else []
    requested = str((raw or {}).get("_strict_requestedExpiryTimestamp") or "").strip() if isinstance(raw, dict) else ""
    expiries = []
    selected = None
    for item in expiry_data if isinstance(expiry_data, list) else []:
        if not isinstance(item, dict):
            continue
        row = {
            "date": str(item.get("date") or "").strip() or None,
            "timestamp": str(item.get("expiry") or item.get("timestamp") or "").strip() or None,
            "flag": str(item.get("expiry_flag") or item.get("flag") or "").strip() or None,
        }
        expiries.append(row)
        if requested and row["timestamp"] == requested:
            selected = row
    if selected is None and expiries:
        selected = expiries[0]
    return {
        "selectedExpiry": selected.get("date") if selected else None,
        "selectedExpiryTimestamp": selected.get("timestamp") if selected else None,
        "expiryFlag": selected.get("flag") if selected else None,
        "expiries": expiries,
    }

def _strict_symbol_side(symbol):
    text = str(symbol or "").strip().upper()
    match = re.search(r"(CE|PE)$", text)
    return match.group(1) if match else None

def _strict_symbol_matches_strike(symbol, side, strike):
    text = str(symbol or "").strip().upper()
    if not text or _strict_symbol_side(text) != side:
        return False
    strike_num = safe_float(strike, None)
    if strike_num is None or strike_num <= 0:
        return False
    if float(strike_num).is_integer():
        strike_text = str(int(strike_num))
        return text.endswith(f"{strike_text}{side}")
    return True

def _strict_explicit_flat_side(item):
    if not isinstance(item, dict):
        return None
    explicit = str(
        item.get("option_type")
        or item.get("optionType")
        or item.get("instrument_type")
        or item.get("instrumentType")
        or item.get("side")
        or item.get("type")
        or ""
    ).strip().upper()
    if explicit in {"CE", "CALL", "C"}:
        explicit = "CE"
    elif explicit in {"PE", "PUT", "P"}:
        explicit = "PE"
    else:
        explicit = None

    generic_symbol = _strict_pick(item, ["symbol", "fySymbol", "fyersSymbol", "ex_symbol"], None)
    symbol_side = _strict_symbol_side(generic_symbol)

    if explicit and symbol_side and explicit != symbol_side:
        return None
    return explicit or symbol_side

def _strict_side_keys(side, kind):
    prefix = "ce" if side == "CE" else "pe"
    suffix = side
    mapping = {
        "symbol": [f"symbol_{suffix}", f"{prefix}_symbol", f"{suffix}_symbol"],
        "token": [f"fyToken_{suffix}", f"{prefix}_token", f"token_{suffix}"],
        "ltp": [f"ltp_{suffix}", f"{prefix}_ltp"],
        "ch": [f"ch_{suffix}", f"{prefix}_ch", f"ltpch_{suffix}", f"{prefix}_ltpch"],
        "bid": [f"bid_{suffix}", f"{prefix}_bid"],
        "ask": [f"ask_{suffix}", f"{prefix}_ask"],
        "oi": [f"oi_{suffix}", f"{prefix}_oi"],
        "oich": [f"oich_{suffix}", f"{prefix}_oich"],
        "prev_oi": [f"prev_oi_{suffix}", f"{prefix}_prev_oi", f"pdoi_{suffix}", f"{prefix}_pdoi"],
        "volume": [f"volume_{suffix}", f"{prefix}_volume"],
        "iv": [f"iv_{suffix}", f"{prefix}_iv"],
    }
    return mapping[kind]

def _strict_build_leg(item, side, strike, nested=None):
    scoped = nested if isinstance(nested, dict) and nested else None
    flat_side = _strict_explicit_flat_side(item)

    if scoped is not None:
        symbol = _strict_pick(scoped, ["symbol", "fySymbol", "fyersSymbol", "ex_symbol"], None)
        generic_allowed = True
    else:
        symbol = _strict_pick(item, _strict_side_keys(side, "symbol"), None)
        if not symbol and flat_side == side:
            symbol = _strict_pick(item, ["symbol", "fySymbol", "fyersSymbol", "ex_symbol"], None)
        generic_allowed = flat_side == side

    if not _strict_symbol_matches_strike(symbol, side, strike):
        return None

    def value(kind, generic_keys):
        if scoped is not None:
            return _strict_pick(scoped, generic_keys, None)
        specific = _strict_pick(item, _strict_side_keys(side, kind), None)
        if specific is not None:
            return specific
        if generic_allowed:
            return _strict_pick(item, generic_keys, None)
        return None

    return {
        "strike_price": strike,
        "option_type": side,
        "symbol": symbol,
        "fyToken": value("token", ["fyToken", "token", "instrument_token"]),
        "ltp": value("ltp", ["ltp", "lastPrice", "lp", "price"]),
        "ch": value("ch", ["ch", "change", "netChange", "price_change", "chng", "ltpch"]),
        "bid": value("bid", ["bid", "bidPrice", "bestBid", "buyPrice"]),
        "ask": value("ask", ["ask", "askPrice", "bestAsk", "sellPrice", "offer"]),
        "oi": value("oi", ["oi", "openInterest", "open_interest"]),
        "oich": value("oich", ["oich", "chngInOI", "changeinOpenInterest", "oiChange", "oi_change"]),
        "prev_oi": value("prev_oi", ["prev_oi", "prevOi", "previousOi", "pdoi"]),
        "volume": value("volume", ["volume", "vol", "tradedVolume", "volume_traded"]),
        "iv": value("iv", ["iv", "impliedVolatility", "implied_volatility", "IV"]),
    }

def _strict_safe_option_rows(raw):
    data = raw.get("data", raw) if isinstance(raw, dict) else raw
    rows_src = _extract_option_rows_from_data(data)
    safe_rows = []

    for item in rows_src:
        if not isinstance(item, dict):
            continue
        strike = safe_float(
            _strict_pick(item, ["strike", "strike_price", "strikePrice", "sp", "strikePriceValue"], None),
            None,
        )
        ce_obj = item.get("CE") or item.get("ce") or {}
        pe_obj = item.get("PE") or item.get("pe") or {}
        if strike is None:
            scoped = ce_obj if ce_obj else pe_obj
            strike = safe_float(_strict_pick(scoped, ["strike", "strike_price", "strikePrice", "sp"], None), None)
        if strike is None or strike <= 0:
            continue

        sides = set()
        if isinstance(ce_obj, dict) and ce_obj:
            sides.add("CE")
        if isinstance(pe_obj, dict) and pe_obj:
            sides.add("PE")
        if any(key in item for key in ["symbol_CE", "ce_symbol", "oi_CE", "ce_oi", "oich_CE", "ce_oich"]):
            sides.add("CE")
        if any(key in item for key in ["symbol_PE", "pe_symbol", "oi_PE", "pe_oi", "oich_PE", "pe_oich"]):
            sides.add("PE")
        flat_side = _strict_explicit_flat_side(item)
        if flat_side:
            sides.add(flat_side)

        for side in ("CE", "PE"):
            if side not in sides:
                continue
            nested = ce_obj if side == "CE" else pe_obj
            leg = _strict_build_leg(item, side, strike, nested=nested)
            if leg is not None:
                safe_rows.append(leg)

    return safe_rows


def parse_option_chain(raw, spot_price):
    if not raw:
        return []
    safe_rows = _strict_safe_option_rows(raw)
    if not safe_rows:
        return []
    parsed = _parse_normalized_option_chain({"data": {"optionsChain": safe_rows}}, spot_price)
    meta = _strict_expiry_meta(raw)
    for row in parsed:
        row["expiry"] = meta.get("selectedExpiry")
        row["expiry_timestamp"] = meta.get("selectedExpiryTimestamp")
        strike = safe_float(row.get("strike"), None)
        if strike is None:
            continue
        for leg in safe_rows:
            if safe_float(leg.get("strike_price"), None) != strike:
                continue
            if leg.get("option_type") == "CE":
                prev = safe_int(leg.get("prev_oi"), None)
                if prev is not None:
                    row["ce_prev_oi"] = prev
            elif leg.get("option_type") == "PE":
                prev = safe_int(leg.get("prev_oi"), None)
                if prev is not None:
                    row["pe_prev_oi"] = prev
    return parsed

def fetch_fii_dii_data(cache_ttl=900):
    cached = get_cached("fii_dii", ttl=cache_ttl)
    if cached is not None:
        return cached

    result = {
        "date": None,
        "fii": {"buy": None, "sell": None, "net": None},
        "dii": {"buy": None, "sell": None, "net": None},
        "flow": {
            "combinedNet": None,
            "bias": "Neutral",
            "strength": "Unavailable",
            "summary": "Unavailable",
        },
    }

    def finalize_flow():
        fii_net = safe_float(result["fii"].get("net"), None)
        dii_net = safe_float(result["dii"].get("net"), None)

        combined_net = None
        if fii_net is not None or dii_net is not None:
            combined_net = round2((fii_net or 0) + (dii_net or 0))

        bias = "Neutral"
        strength = "Unavailable"
        summary = "Unavailable"

        if fii_net is not None and dii_net is not None:
            abs_combined = abs((fii_net or 0) + (dii_net or 0))

            if fii_net > 0 and dii_net > 0:
                bias = "Bullish Support"
                summary = "FII and DII both buying"
            elif fii_net < 0 and dii_net < 0:
                bias = "Bearish Pressure"
                summary = "FII and DII both selling"
            elif fii_net > 0 and dii_net < 0:
                bias = "Mixed to Bullish"
                summary = "FII buying, DII selling"
            elif fii_net < 0 and dii_net > 0:
                bias = "Mixed to Defensive"
                summary = "FII selling, DII buying"
            else:
                bias = "Neutral"
                summary = "Institutional flow balanced"

            if abs_combined >= 10000:
                strength = "Very Strong"
            elif abs_combined >= 5000:
                strength = "Strong"
            elif abs_combined >= 2000:
                strength = "Moderate"
            elif abs_combined >= 1:
                strength = "Mild"
            else:
                strength = "Flat"

        elif combined_net is not None:
            abs_combined = abs(combined_net)

            if combined_net > 0:
                bias = "Bullish"
            elif combined_net < 0:
                bias = "Bearish"
            else:
                bias = "Neutral"

            if abs_combined >= 10000:
                strength = "Very Strong"
            elif abs_combined >= 5000:
                strength = "Strong"
            elif abs_combined >= 2000:
                strength = "Moderate"
            elif abs_combined >= 1:
                strength = "Mild"
            else:
                strength = "Flat"

            summary = "Net institutional flow available"

        result["flow"] = {
            "combinedNet": combined_net,
            "bias": bias,
            "strength": strength,
            "summary": summary,
        }

    try:
        session = requests.Session()
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.nseindia.com/",
            "Connection": "keep-alive",
        }

        try:
            session.get("https://www.nseindia.com/", headers=headers, timeout=12)
        except Exception:
            pass

        # -------------------------------------------------
        # 1) Primary: NSE FII/DII report page
        # -------------------------------------------------
        resp = session.get(
            "https://www.nseindia.com/reports/fii-dii",
            headers=headers,
            timeout=12,
        )

        raw_html = resp.text or ""
        print("FII/DII response status:", resp.status_code)

        clean_text = unescape(raw_html)
        clean_text = re.sub(r"<script\b[^>]*>.*?</script>", " ", clean_text, flags=re.I | re.S)
        clean_text = re.sub(r"<style\b[^>]*>.*?</style>", " ", clean_text, flags=re.I | re.S)
        clean_text = re.sub(r"<[^>]+>", " ", clean_text)
        clean_text = re.sub(r"&nbsp;?", " ", clean_text)
        clean_text = re.sub(r"\s+", " ", clean_text).strip()

        row_patterns = [
            re.compile(
                r"\b(DII|FII/FPI|FII)\b\s+"
                r"(\d{2}-[A-Za-z]{3}-\d{4})\s+"
                r"([\-]?\d[\d,]*\.?\d*)\s+"
                r"([\-]?\d[\d,]*\.?\d*)\s+"
                r"([\-]?\d[\d,]*\.?\d*)\b",
                re.IGNORECASE,
            ),
            re.compile(
                r"\b(DII|FII/FPI|FII)\b.*?"
                r"(\d{2}-[A-Za-z]{3}-\d{4}).*?"
                r"([\-]?\d[\d,]*\.?\d*).*?"
                r"([\-]?\d[\d,]*\.?\d*).*?"
                r"([\-]?\d[\d,]*\.?\d*)",
                re.IGNORECASE | re.S,
            ),
        ]

        matches = []
        for pat in row_patterns:
            found = pat.findall(clean_text)
            if found:
                matches = found
                break

        print("FII/DII matches found:", len(matches))
        print("FII/DII matches sample:", matches[:5])

        parsed = {}
        seen = set()

        for participant, trade_date, buy_val, sell_val, net_val in matches:
            key = "fii" if "FII" in participant.upper() else "dii"
            dedupe_key = (key, trade_date, buy_val, sell_val, net_val)

            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            if key in parsed:
                continue

            parsed[key] = {
                "buy": round2(str(buy_val).replace(",", "")),
                "sell": round2(str(sell_val).replace(",", "")),
                "net": round2(str(net_val).replace(",", "")),
            }

            if result["date"] is None:
                result["date"] = trade_date

        if parsed.get("fii"):
            result["fii"] = parsed["fii"]

        if parsed.get("dii"):
            result["dii"] = parsed["dii"]

        # If primary worked, return
        if (
            result["fii"]["net"] is not None
            or result["dii"]["net"] is not None
        ):
            finalize_flow()
            set_cached("fii_dii", result)
            return result

        # -------------------------------------------------
        # 2) Fallback: NSE market snapshot page
        # -------------------------------------------------
        resp2 = session.get(
            "https://www.nseindia.com/market-data/analysis-and-tools-capital-market-snapshot",
            headers=headers,
            timeout=12,
        )

        raw_html2 = resp2.text or ""
        clean_text2 = unescape(raw_html2)
        clean_text2 = re.sub(r"<script\b[^>]*>.*?</script>", " ", clean_text2, flags=re.I | re.S)
        clean_text2 = re.sub(r"<style\b[^>]*>.*?</style>", " ", clean_text2, flags=re.I | re.S)
        clean_text2 = re.sub(r"<[^>]+>", " ", clean_text2)
        clean_text2 = re.sub(r"&nbsp;?", " ", clean_text2)
        clean_text2 = re.sub(r"\s+", " ", clean_text2).strip()

        if result["date"] is None:
            date_match = re.search(r"(\d{2}-[A-Za-z]{3}-\d{4})", clean_text2)
            if date_match:
                result["date"] = date_match.group(1)

        fii_match = re.search(
            r"FII/FPI\s*\(Net\s*Value\)\s*\(Cr\)\s*([\-]?\d[\d,]*\.?\d*)",
            clean_text2,
            re.IGNORECASE,
        )
        dii_match = re.search(
            r"DII\s*\(Net\s*Value\)\s*\(Cr\)\s*([\-]?\d[\d,]*\.?\d*)",
            clean_text2,
            re.IGNORECASE,
        )

        if fii_match:
            result["fii"]["net"] = round2(str(fii_match.group(1)).replace(",", ""))

        if dii_match:
            result["dii"]["net"] = round2(str(dii_match.group(1)).replace(",", ""))

        finalize_flow()

    except Exception as e:
        print("fetch_fii_dii_data error:", e)

    set_cached("fii_dii", result)
    return result

def fetch_fii_derivatives_data(cache_ttl=900):
    cached = get_cached("fii_derivatives", ttl=cache_ttl)
    if cached is not None:
        return cached
    import csv
    from io import StringIO
    from datetime import datetime, timedelta
    fii_data = {"fii": {"indexOptions": {"long": 0, "short": 0}}, "dii": {"indexOptions": {"long": 0, "short": 0}}}
    try:
        session = requests.Session()
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            "Accept": "text/csv,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.nseindia.com/",
            "Connection": "keep-alive",
        }
        try:
            session.get("https://www.nseindia.com/", headers=headers, timeout=8)
        except Exception:
            pass
        d = datetime.now()
        for offset in range(3):
            date_to_try = d - timedelta(days=offset)
            date_str = f"{date_to_try.day:02d}{date_to_try.month:02d}{date_to_try.year}"
            url = f"https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{date_str}.csv"
            
            # Reusing the existing session
            r = session.get(url, headers=headers, timeout=5)
            if r.status_code == 200 and "Participant wise Open Interest" in r.text:
                reader = csv.DictReader(StringIO(r.text.strip().split("\n", 1)[1]))
                for row in reader:
                    client_type = row.get("Client Type", "").strip()
                    if client_type in ["FII", "DII"]:
                        key = client_type.lower()
                        call_long = num_int(str(row.get("Option Index Call Long", 0)).replace(",", ""), 0)
                        put_long = num_int(str(row.get("Option Index Put Long", 0)).replace(",", ""), 0)
                        call_short = num_int(str(row.get("Option Index Call Short", 0)).replace(",", ""), 0)
                        put_short = num_int(str(row.get("Option Index Put Short", 0)).replace(",", ""), 0)
                        fii_data[key]["indexOptions"]["long"] = call_long + put_short
                        fii_data[key]["indexOptions"]["short"] = put_long + call_short
                set_cached("fii_derivatives", fii_data)
                return fii_data
    except Exception as e:
        print("fetch_fii_derivatives error:", e)
    return fii_data

# =========================================================
# IV HELPERS
# =========================================================
def norm_cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def black_scholes_price(option_type, S, K, T, r, sigma):
    S = safe_float(S, None)
    K = safe_float(K, None)
    T = safe_float(T, None)
    r = safe_float(r, 0.0)
    sigma = safe_float(sigma, None)

    if S is None or K is None or T is None or sigma is None:
        return None
    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        return None

    sqrtT = math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
    d2 = d1 - sigma * sqrtT

    option_type = str(option_type or "").upper()

    if option_type == "CE":
        return S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)
    if option_type == "PE":
        return K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)

    return None


def option_vega(S, K, T, r, sigma):
    S = safe_float(S, None)
    K = safe_float(K, None)
    T = safe_float(T, None)
    r = safe_float(r, 0.0)
    sigma = safe_float(sigma, None)

    if S is None or K is None or T is None or sigma is None:
        return None
    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        return None

    sqrtT = math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
    pdf_d1 = math.exp(-0.5 * d1 * d1) / math.sqrt(2.0 * math.pi)

    return S * pdf_d1 * sqrtT

def _norm_pdf(x):
    try:
        return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)
    except Exception:
        return None


def compute_option_greeks(option_type, S, K, T, r, sigma):
    S = safe_float(S, None)
    K = safe_float(K, None)
    T = safe_float(T, None)
    r = safe_float(r, 0.06)
    sigma = safe_float(sigma, None)

    if S is None or K is None or T is None or sigma is None:
        return {
            "delta": None,
            "gamma": None,
            "theta": None,
            "vega": None,
        }

    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        return {
            "delta": None,
            "gamma": None,
            "theta": None,
            "vega": None,
        }

    option_type = str(option_type or "").upper()
    sqrtT = math.sqrt(T)

    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
        d2 = d1 - sigma * sqrtT
        pdf_d1 = _norm_pdf(d1)

        if pdf_d1 is None:
            return {
                "delta": None,
                "gamma": None,
                "theta": None,
                "vega": None,
            }

        if option_type == "CE":
            delta = norm_cdf(d1)
            theta = (
                (-S * pdf_d1 * sigma / (2 * sqrtT))
                - (r * K * math.exp(-r * T) * norm_cdf(d2))
            ) / 365.0
        elif option_type == "PE":
            delta = norm_cdf(d1) - 1
            theta = (
                (-S * pdf_d1 * sigma / (2 * sqrtT))
                + (r * K * math.exp(-r * T) * norm_cdf(-d2))
            ) / 365.0
        else:
            return {
                "delta": None,
                "gamma": None,
                "theta": None,
                "vega": None,
            }

        gamma = pdf_d1 / (S * sigma * sqrtT)
        vega = (S * pdf_d1 * sqrtT) / 100.0

        return {
            "delta": round2(delta),
            "gamma": round2(gamma),
            "theta": round2(theta),
            "vega": round2(vega),
        }

    except Exception:
        return {
            "delta": None,
            "gamma": None,
            "theta": None,
            "vega": None,
        }


def enrich_chain_with_greeks(rows, spot_price, symbol_key, expiry_date=None):
    S = safe_float(spot_price, None)
    T = get_years_to_expiry(symbol_key, expiry_date=expiry_date)
    r = 0.06

    if S is None or S <= 0 or not rows:
        return rows

    for row in rows:
        K = safe_float(row.get("strike"), None)
        if K is None or K <= 0:
            continue

        ce_iv_pct = safe_float(row.get("ce_iv"), None)
        pe_iv_pct = safe_float(row.get("pe_iv"), None)

        ce_sigma = ce_iv_pct / 100.0 if ce_iv_pct is not None and ce_iv_pct > 0 else None
        pe_sigma = pe_iv_pct / 100.0 if pe_iv_pct is not None and pe_iv_pct > 0 else None

        ce_greeks = compute_option_greeks("CE", S, K, T, r, ce_sigma)
        pe_greeks = compute_option_greeks("PE", S, K, T, r, pe_sigma)

        row["ce_delta"] = ce_greeks.get("delta")
        row["ce_gamma"] = ce_greeks.get("gamma")
        row["ce_theta"] = ce_greeks.get("theta")
        row["ce_vega"] = ce_greeks.get("vega")

        row["pe_delta"] = pe_greeks.get("delta")
        row["pe_gamma"] = pe_greeks.get("gamma")
        row["pe_theta"] = pe_greeks.get("theta")
        row["pe_vega"] = pe_greeks.get("vega")

    return rows

def implied_volatility_from_price(option_type, market_price, S, K, T, r=0.06, max_iter=100, tol=1e-5):
    market_price = safe_float(market_price, None)
    S = safe_float(S, None)
    K = safe_float(K, None)
    T = safe_float(T, None)
    r = safe_float(r, 0.06)

    if market_price is None or S is None or K is None or T is None:
        return None
    if market_price <= 0 or S <= 0 or K <= 0 or T <= 0:
        return None

    sigma = 0.20

    for _ in range(max_iter):
        price = black_scholes_price(option_type, S, K, T, r, sigma)
        vega = option_vega(S, K, T, r, sigma)

        if price is None or vega is None or vega < 1e-8:
            break

        diff = price - market_price
        if abs(diff) < tol:
            return round2(sigma * 100.0)

        sigma = sigma - (diff / vega)

        if sigma <= 0:
            sigma = 0.001
        elif sigma > 5:
            sigma = 5.0

    best_sigma = None
    best_err = float("inf")

    for test_sigma in [x / 100.0 for x in range(1, 501)]:
        price = black_scholes_price(option_type, S, K, T, r, test_sigma)
        if price is None:
            continue
        err = abs(price - market_price)
        if err < best_err:
            best_err = err
            best_sigma = test_sigma

    return round2(best_sigma * 100.0) if best_sigma is not None else None


def get_years_to_expiry(symbol_key, expiry_date=None):
    if expiry_date:
        date_iso = normalize_expiry_date(expiry_date)
        if date_iso:
            try:
                expiry_day = datetime.strptime(date_iso, "%Y-%m-%d").date()
                expiry_dt = datetime.combine(expiry_day, dt_time(15, 30), tzinfo=IST)
                remaining_seconds = (expiry_dt - ist_now()).total_seconds()
                # Keep Black-Scholes numerically stable on 0-DTE while still reflecting intraday decay.
                remaining_seconds = max(remaining_seconds, 3600.0)
                return remaining_seconds / (365.0 * 86400.0)
            except Exception:
                pass

    # If authoritative expiry metadata is unavailable, use a conservative one-week fallback.
    # Do not manufacture an exact expiry from the monthly future symbol.
    return 7 / 365.0

def enrich_chain_with_computed_iv(rows, spot_price, symbol_key, expiry_date=None):
    S = safe_float(spot_price, None)
    T = get_years_to_expiry(symbol_key, expiry_date=expiry_date)
    r = 0.06

    if S is None or S <= 0 or not rows:
        return rows

    for row in rows:
        K = safe_float(row.get("strike"), None)
        if K is None or K <= 0:
            continue

        if safe_float(row.get("ce_iv"), None) is None:
            ce_iv = implied_volatility_from_price("CE", row.get("ce_ltp"), S, K, T, r=r)
            if ce_iv is not None:
                row["ce_iv"] = ce_iv

        if safe_float(row.get("pe_iv"), None) is None:
            pe_iv = implied_volatility_from_price("PE", row.get("pe_ltp"), S, K, T, r=r)
            if pe_iv is not None:
                row["pe_iv"] = pe_iv

        row["iv"] = (
            safe_float(row.get("ce_iv"), None)
            if safe_float(row.get("ce_iv"), None) is not None
            else safe_float(row.get("pe_iv"), None)
        )

    return rows

def _norm_pdf(x):
    try:
        return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)
    except Exception:
        return None


def compute_option_greeks(option_type, S, K, T, r, sigma):
    S = safe_float(S, None)
    K = safe_float(K, None)
    T = safe_float(T, None)
    r = safe_float(r, 0.06)
    sigma = safe_float(sigma, None)

    if S is None or K is None or T is None or sigma is None:
        return {
            "delta": None,
            "gamma": None,
            "theta": None,
            "vega": None,
        }

    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        return {
            "delta": None,
            "gamma": None,
            "theta": None,
            "vega": None,
        }

    option_type = str(option_type or "").upper()
    sqrtT = math.sqrt(T)

    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
        d2 = d1 - sigma * sqrtT
        pdf_d1 = _norm_pdf(d1)

        if pdf_d1 is None:
            return {
                "delta": None,
                "gamma": None,
                "theta": None,
                "vega": None,
            }

        if option_type == "CE":
            delta = norm_cdf(d1)
            theta = (
                (-S * pdf_d1 * sigma / (2 * sqrtT))
                - (r * K * math.exp(-r * T) * norm_cdf(d2))
            ) / 365.0
        elif option_type == "PE":
            delta = norm_cdf(d1) - 1
            theta = (
                (-S * pdf_d1 * sigma / (2 * sqrtT))
                + (r * K * math.exp(-r * T) * norm_cdf(-d2))
            ) / 365.0
        else:
            return {
                "delta": None,
                "gamma": None,
                "theta": None,
                "vega": None,
            }

        gamma = pdf_d1 / (S * sigma * sqrtT)
        vega = (S * pdf_d1 * sqrtT) / 100.0

        return {
            "delta": round2(delta),
            "gamma": round2(gamma),
            "theta": round2(theta),
            "vega": round2(vega),
        }

    except Exception:
        return {
            "delta": None,
            "gamma": None,
            "theta": None,
            "vega": None,
        }


def enrich_chain_with_greeks(rows, spot_price, symbol_key, expiry_date=None):
    S = safe_float(spot_price, None)
    T = get_years_to_expiry(symbol_key, expiry_date=expiry_date)
    r = 0.06

    if S is None or S <= 0 or not rows:
        return rows

    for row in rows:
        K = safe_float(row.get("strike"), None)
        if K is None or K <= 0:
            continue

        ce_iv_pct = safe_float(row.get("ce_iv"), None)
        pe_iv_pct = safe_float(row.get("pe_iv"), None)

        ce_sigma = ce_iv_pct / 100.0 if ce_iv_pct is not None and ce_iv_pct > 0 else None
        pe_sigma = pe_iv_pct / 100.0 if pe_iv_pct is not None and pe_iv_pct > 0 else None

        ce_greeks = compute_option_greeks("CE", S, K, T, r, ce_sigma)
        pe_greeks = compute_option_greeks("PE", S, K, T, r, pe_sigma)

        row["ce_delta"] = ce_greeks.get("delta")
        row["ce_gamma"] = ce_greeks.get("gamma")
        row["ce_theta"] = ce_greeks.get("theta")
        row["ce_vega"] = ce_greeks.get("vega")

        row["pe_delta"] = pe_greeks.get("delta")
        row["pe_gamma"] = pe_greeks.get("gamma")
        row["pe_theta"] = pe_greeks.get("theta")
        row["pe_vega"] = pe_greeks.get("vega")

    return rows

def infer_spot_from_option_chain(rows):
    candidates = []
    for row in rows or []:
        strike = safe_float(row.get("strike"), None)
        ce_ltp = safe_float(row.get("ce_ltp"), None)
        pe_ltp = safe_float(row.get("pe_ltp"), None)
        if strike is None or ce_ltp is None or pe_ltp is None or ce_ltp <= 0 or pe_ltp <= 0:
            continue
        ce_volume = safe_float(row.get("ce_volume"), 0) or 0
        pe_volume = safe_float(row.get("pe_volume"), 0) or 0
        if ce_volume + pe_volume <= 0:
            continue
        candidates.append({
            "distance": abs(ce_ltp - pe_ltp),
            "volume": ce_volume + pe_volume,
            "value": strike + ce_ltp - pe_ltp,
        })

    if not candidates:
        return None

    candidates = sorted(candidates, key=lambda item: (item["distance"], -item["volume"]))[:8]
    values = sorted(item["value"] for item in candidates if safe_float(item.get("value"), None) is not None)
    if not values:
        return None

    mid = len(values) // 2
    if len(values) % 2:
        return round2(values[mid])
    return round2((values[mid - 1] + values[mid]) / 2)


def get_option_chain_rows_for_index(symbol_key, spot_price, cache_ttl=8, strikecount=30, expiry_timestamp=None, expiry_date=None):
    cache_spot = round(safe_float(spot_price, 0) or 0)
    expiry_key = str(expiry_timestamp or expiry_date or "front")
    cache_key = f"{symbol_key}:{cache_spot}:{int(strikecount or 12)}:{expiry_key}"

    cached = get_cached("option_chain", key=cache_key, ttl=cache_ttl)
    if cached is not None:
        return cached

    cfg = INDEX_MAP[symbol_key]
    option_symbols = cfg.get("option_symbols") or [cfg["spot"], cfg["future"]]
    raw_oc = get_option_chain_raw(
        option_symbols,
        cfg["future"],
        strikecount=strikecount,
        expiry_timestamp=expiry_timestamp,
    )

    catalog = extract_option_expiry_catalog(raw_oc)
    selected = resolve_option_expiry(catalog, expiry_timestamp or expiry_date)
    selected_date = expiry_date or (selected or {}).get("date")
    selected_ts = str(expiry_timestamp or (selected or {}).get("timestamp") or "").strip() or None

    chain = parse_option_chain(raw_oc, spot_price)

    if spot_price and chain and strikecount:
        try:
            chain = sorted(chain, key=lambda x: safe_float(x.get("strike"), 0) or 0)
            closest_idx = min(range(len(chain)), key=lambda i: abs((safe_float(chain[i].get("strike"), 0) or 0) - spot_price))
            half = int(strikecount) // 2
            start_idx = max(0, closest_idx - half)
            end_idx = min(len(chain), closest_idx + half + (1 if int(strikecount) % 2 != 0 else 0))
            chain = chain[start_idx:end_idx]
        except Exception:
            pass

    chain = enrich_chain_with_computed_iv(chain, spot_price, symbol_key, expiry_date=selected_date)
    chain = enrich_chain_with_greeks(chain, spot_price, symbol_key, expiry_date=selected_date)

    for row in chain:
        if selected_date:
            row["expiry"] = selected_date
        if selected_ts:
            row["expiryTimestamp"] = selected_ts

    if DEBUG_LOGS:
        print(f"{symbol_key} option symbols tried: {option_symbols}")
        print(f"{symbol_key} selected expiry: {selected_date or 'front'}")
        print(f"{symbol_key} parsed chain rows: {len(chain)}")

    result = (raw_oc, chain)
    set_cached("option_chain", result, key=cache_key)
    return result

def normalize_future_against_spot(spot, future, max_abs_basis_pct=0.75, source_symbol=None, verified=False, verification_reason=None):
    future = dict(future or {})
    spot_ltp = safe_float((spot or {}).get("ltp"), None)
    future_ltp = safe_float(future.get("ltp"), None)

    future["sourceSymbol"] = source_symbol
    future["symbol"] = source_symbol
    future["verified"] = bool(verified and source_symbol and future_ltp is not None and future_ltp > 0)
    future["unavailable"] = not future["verified"]
    future["verificationReason"] = verification_reason or ("Live FYERS futures quote verified" if future["verified"] else "Verified futures unavailable")

    if not future["verified"]:
        for key in ["ltp", "change", "change_pct", "high", "low", "open", "prev_close", "volume", "vwap"]:
            future[key] = None
        future["basis"] = None
        future["basis_pct"] = None
        return future

    if spot_ltp is None or spot_ltp <= 0:
        future["basis"] = None
        future["basis_pct"] = None
        return future

    basis = future_ltp - spot_ltp
    basis_pct = (basis / spot_ltp) * 100.0
    if abs(basis_pct) > max_abs_basis_pct:
        # Never substitute spot for an invalid/stale futures quote. Mark it unavailable.
        future["verified"] = False
        future["unavailable"] = True
        future["verificationReason"] = f"Futures basis {basis_pct:.2f}% failed validation"
        for key in ["ltp", "change", "change_pct", "high", "low", "open", "prev_close", "volume", "vwap"]:
            future[key] = None
        future["basis"] = None
        future["basis_pct"] = None
        return future

    future["basis"] = round2(basis)
    future["basis_pct"] = round2(basis_pct)
    return future


def build_dashboard(symbol_key, cache_ttl=10, expiry_timestamp=None, expiry_date=None, expiry_catalog=None, include_history=True):
    dashboard_cache_key = f"{symbol_key}:{expiry_timestamp or expiry_date or 'front'}"
    cached = get_cached("dashboard", key=dashboard_cache_key, ttl=cache_ttl)
    if cached is not None:
        return cached

    cfg = INDEX_MAP[symbol_key]
    future_meta = resolve_active_future(symbol_key)
    future_symbol = future_meta.get("symbol")

    symbols_to_stream = [sym for sym in [cfg.get("spot"), future_symbol, VIX_SYMBOL] if sym]
    ensure_fyers_ws_stream(symbols_to_stream)

    q_map = get_quotes_map(symbols_to_stream)
    spot_raw = q_map.get(cfg["spot"]) or q_map.get(normalize_symbol_key(cfg["spot"])) or {}
    future_raw = (q_map.get(future_symbol) or q_map.get(normalize_symbol_key(future_symbol)) or future_meta.get("block") or {}) if future_symbol else {}
    vix_raw = q_map.get(VIX_SYMBOL) or q_map.get(normalize_symbol_key(VIX_SYMBOL)) or {}

    if DEBUG_LOGS:
        print(f"{symbol_key} spot_raw:", spot_raw)
        print(f"{symbol_key} future_raw:", future_raw)
        print("vix_raw:", vix_raw)

    spot = extract_quote_metrics(spot_raw)
    future = extract_quote_metrics(future_raw)
    vix = extract_quote_metrics(vix_raw)

    future = normalize_future_against_spot(
        spot,
        future,
        source_symbol=future_symbol,
        verified=bool(future_meta.get("verified")),
        verification_reason=future_meta.get("reason"),
    )

    spot_ltp = safe_float(spot.get("ltp"), None)
    future_ltp = safe_float(future.get("ltp"), None)

    spot["vwap"] = round2(clean_vwap_for_price(spot.get("vwap"), spot_ltp))
    if future_ltp is not None:
        future["vwap"] = round2(clean_vwap_for_price(future.get("vwap"), future_ltp))
    if include_history:
        history_snapshot = get_intraday_history_snapshot(symbol_key, spot_ltp or future_ltp)
        history_open = safe_float(history_snapshot.get("todayOpen"), None)
        if spot.get("open") in (None, 0) and history_open not in (None, 0):
            spot["open"] = round2(history_open)
            spot["open_source"] = "history_5m_first_candle"
        history_vwap = history_snapshot.get("vwap")
        if spot.get("vwap") is None and history_vwap is not None:
            spot["vwap"] = round2(history_vwap)
            spot["vwap_source"] = "history_5m"

        previous_day_levels_raw = get_previous_day_levels(
            cfg["spot"],
            fallback_symbol=future_symbol,
            cache_key=f"prev_day_detail:{symbol_key}"
        ) or {}
    else:
        history_snapshot = {}
        previous_day_levels_raw = get_cached("prev_day_detail", key=f"prev_day_detail:{symbol_key}", ttl=300) or {}

    if safe_float(previous_day_levels_raw.get("open"), None) is None:
        previous_day_levels_raw["open"] = (
            safe_float(spot.get("open"), None)
            if safe_float(spot.get("open"), None) is not None
            else safe_float(future.get("open"), None)
        )

    if safe_float(previous_day_levels_raw.get("high"), None) is None:
        previous_day_levels_raw["high"] = (
            safe_float(spot.get("high"), None)
            if safe_float(spot.get("high"), None) is not None
            else safe_float(future.get("high"), None)
        )

    if safe_float(previous_day_levels_raw.get("low"), None) is None:
        previous_day_levels_raw["low"] = (
            safe_float(spot.get("low"), None)
            if safe_float(spot.get("low"), None) is not None
            else safe_float(future.get("low"), None)
        )

    if safe_float(previous_day_levels_raw.get("close"), None) is None:
        previous_day_levels_raw["close"] = (
            safe_float(spot.get("prev_close"), None)
            if safe_float(spot.get("prev_close"), None) is not None
            else safe_float(future.get("prev_close"), None)
        )

    reference_price_for_prev_day = (
        safe_float(spot.get("ltp"), None)
        if safe_float(spot.get("ltp"), None) is not None
        else safe_float(future.get("ltp"), None)
    )

    previous_day_levels = enrich_previous_day_levels(
        previous_day_levels_raw,
        current_price=reference_price_for_prev_day
    )

    prev_close_for_change = safe_float(previous_day_levels.get("close"), None)
    if spot_ltp is not None and prev_close_for_change not in (None, 0):
        spot["prev_close"] = round2(prev_close_for_change)
        spot["change"] = round2(spot_ltp - prev_close_for_change)
        spot["change_pct"] = round2(((spot_ltp - prev_close_for_change) / prev_close_for_change) * 100)
    if future_ltp is not None and safe_float(future.get("prev_close"), None) in (None, 0) and prev_close_for_change not in (None, 0):
        future["prev_close"] = round2(prev_close_for_change)
        future["change"] = round2(future_ltp - prev_close_for_change)
        future["change_pct"] = round2(((future_ltp - prev_close_for_change) / prev_close_for_change) * 100)

    raw_oc, chain = get_option_chain_rows_for_index(
        symbol_key,
        spot_ltp,
        expiry_timestamp=expiry_timestamp,
        expiry_date=expiry_date,
    )
    implied_spot = None
    if spot_ltp is None:
        implied_spot = infer_spot_from_option_chain(chain)
        if implied_spot is not None:
            spot = {
                **spot,
                "ltp": implied_spot,
                "source": "option_chain_implied",
            }
            spot_ltp = implied_spot
            future_ltp = safe_float(future.get("ltp"), None)
            if prev_close_for_change not in (None, 0):
                spot["prev_close"] = round2(prev_close_for_change)
                spot["change"] = round2(spot_ltp - prev_close_for_change)
                spot["change_pct"] = round2(((spot_ltp - prev_close_for_change) / prev_close_for_change) * 100)
                if future_ltp is not None and safe_float(future.get("prev_close"), None) in (None, 0):
                    future["prev_close"] = round2(prev_close_for_change)
                    future["change"] = round2(future_ltp - prev_close_for_change)
                    future["change_pct"] = round2(((future_ltp - prev_close_for_change) / prev_close_for_change) * 100)
            chain = parse_option_chain(raw_oc, spot_ltp)
            chain = enrich_chain_with_computed_iv(chain, spot_ltp, symbol_key, expiry_date=expiry_date)
            chain = enrich_chain_with_greeks(chain, spot_ltp, symbol_key, expiry_date=expiry_date)

    resolved_catalog = expiry_catalog or extract_option_expiry_catalog(raw_oc)
    selected_expiry = resolve_option_expiry(resolved_catalog, expiry_timestamp or expiry_date)
    if selected_expiry is None and resolved_catalog:
        selected_expiry = resolved_catalog[0]
    selected_expiry_date = (selected_expiry or {}).get("date") or normalize_expiry_date(expiry_date)
    selected_expiry_timestamp = (selected_expiry or {}).get("timestamp") or (str(expiry_timestamp) if expiry_timestamp else None)
    selected_dte = (selected_expiry or {}).get("dte")

    if DEBUG_LOGS:
        print(f"{symbol_key} option chain rows:", len(chain))
        print(f"{symbol_key} raw option chain keys:", list(raw_oc.keys()) if isinstance(raw_oc, dict) else [])

    ad = advance_decline(symbol_key)
    sectors = sector_strength()

    pcr = compute_pcr(chain)
    call_oi_change_total = round2(sum(safe_float(row.get("ce_oich"), 0) for row in chain))
    put_oi_change_total = round2(sum(safe_float(row.get("pe_oich"), 0) for row in chain))
    net_oi_change = round2(
        (put_oi_change_total or 0) - (call_oi_change_total or 0)
        if call_oi_change_total is not None or put_oi_change_total is not None
        else None
    )
    max_pain = compute_max_pain(chain)
    max_pain_curve = compute_max_pain_curve(chain)
    levels = top_levels(chain, spot_ltp)
    buildup = strongest_buildup(chain)
    straddle = compute_straddle(chain)
    concentration = compute_oi_concentration(chain)
    sentiment = compute_sentiment(spot, future, vix, ad["ratio"], pcr, max_pain)
    momentum = compute_oi_momentum(chain, spot_ltp)

    breakout_breakdown = build_breakout_breakdown(spot, future, levels)
    intraday_range_projection = build_intraday_range_projection(spot, future, straddle)
    call_put_dominance = build_call_put_dominance(chain)
    smart_oi_flow = build_smart_oi_flow(chain, spot_ltp)
    market_regime = build_market_regime(spot, future, vix, ad, pcr, smart_oi_flow)
    opening_gap = build_opening_gap_context(symbol_key, spot, future)
    breadth_stats = build_breadth_stats(ad, sectors)
    gamma_exposure = compute_gamma_exposure(chain, spot_ltp)
    gex_summary = compute_gex_summary(gamma_exposure, spot_ltp)
    sector_rotation = build_sector_rotation(sectors)
    liquidity_map = compute_liquidity_map(chain)
    liquidity_summary = compute_liquidity_summary(liquidity_map, spot_ltp)
    options_flow_detector = build_options_flow_detector(chain, future)

    bias_breakdown = build_bias_breakdown(
        ad["ratio"],
        breakout_breakdown,
        call_put_dominance,
        smart_oi_flow,
        market_regime
    )
    bias_scores = build_bias_scores(
        ad["ratio"],
        breakout_breakdown,
        call_put_dominance,
        smart_oi_flow,
        market_regime,
        opening_gap
    )


    iv_rank = 50
    vix_ltp = safe_float(vix.get("ltp"))
    if vix_ltp and _DAILY_VIX_HIGH > 0 and _DAILY_VIX_HIGH > _DAILY_VIX_LOW:
        iv_rank = round2(((vix_ltp - _DAILY_VIX_LOW) / (_DAILY_VIX_HIGH - _DAILY_VIX_LOW)) * 100)

    analytics = {
        "ivRank": iv_rank,
        "pcr": pcr,
        "callOiChange": call_oi_change_total,
        "putOiChange": put_oi_change_total,
        "netOiChange": net_oi_change,
        "net_oi_change": net_oi_change,
        "maxPain": max_pain,
        "maxPainCurve": max_pain_curve,
        "vwap": round2(clean_vwap_for_price(
            safe_float(spot.get("vwap"), None)
            if safe_float(spot.get("vwap"), None) is not None
            else safe_float(future.get("vwap"), None),
            spot_ltp or future_ltp,
            max_distance_pct=2.25,
        )),
        "vwapSource": spot.get("vwap_source") or future.get("vwap_source"),
        "previousDayLevels": previous_day_levels,
        "previousDayOpen": previous_day_levels.get("open"),
        "previousDayHigh": previous_day_levels.get("high"),
        "previousDayLow": previous_day_levels.get("low"),
        "previousDayClose": previous_day_levels.get("close"),
        "supports": levels["supports"],
        "resistances": levels["resistances"],
        "supportResistance": {
            "supports": levels["supports"],
            "resistances": levels["resistances"],
        },
        "putWall": levels["put_wall"],
        "callWall": levels["call_wall"],
        "gammaLevels": levels["gamma_levels"],
        "gammaExposure": gamma_exposure,
        "gexSummary": gex_summary,
        "liquidityMap": liquidity_map,
        "liquiditySummary": liquidity_summary,
        "strongestBuildup": buildup,
        "straddle": straddle,
        "oiConcentration": concentration,
        "sentiment": sentiment,
        "oiMomentum": momentum,
        "breakoutBreakdown": breakout_breakdown,
        "intradayRangeProjection": intraday_range_projection,
        "callPutDominance": call_put_dominance,
        "smartOIFlow": smart_oi_flow,
        "marketRegime": market_regime,
        "openingGap": opening_gap,
        "breadthStats": breadth_stats,
        "sectorRotation": sector_rotation,
        "optionsFlowDetector": options_flow_detector,
        "biasBreakdown": bias_breakdown,
        "biasScores": bias_scores,
        "fiiDii": fetch_fii_derivatives_data(),
    }

    analytics["referencePrice"] = round2(spot_ltp if spot_ltp is not None else future_ltp)
    analytics["referenceSource"] = "spot" if spot_ltp is not None else "future"
    analytics["signalCalculatedAt"] = ist_now().isoformat()
    analytics["selectedExpiry"] = selected_expiry_date
    analytics["dte"] = selected_dte

    analytics["tradeZones"] = build_trade_zones(spot, future, analytics, chain, history_snapshot)
    analytics["tradeSignalPanel"] = build_trade_signal_panel(spot, future, analytics, ad)
    analytics["tradeSignals"] = build_trade_signals(spot, future, analytics, ad)

    heatmap = [
        {
            "strike": r["strike"],
            "ce_oich": r["ce_oich"],
            "pe_oich": r["pe_oich"],
            "is_atm": r.get("is_atm", False),
        }
        for r in chain
    ]

    oi_chart = [
        {
            "strike": r["strike"],
            "ce_oi": r["ce_oi"],
            "pe_oi": r["pe_oi"],
            "ce_oich": r["ce_oich"],
            "pe_oich": r["pe_oich"]
        }
        for r in chain
    ]

    expiry_dates = [item.get("date") for item in resolved_catalog if item.get("date")]

    result = {
        "symbol": symbol_key,
        "label": cfg["label"],
        "timestamp": ist_now().strftime("%d-%m-%Y %H:%M:%S"),
        "signalCalculatedAt": analytics.get("signalCalculatedAt"),
        "referencePrice": analytics.get("referencePrice"),
        "referenceSource": analytics.get("referenceSource"),
        "selectedExpiry": selected_expiry_date,
        "selectedExpiryTimestamp": selected_expiry_timestamp,
        "dte": selected_dte,
        "expiries": expiry_dates,
        "expiryDetails": resolved_catalog,
        "spot": spot,
        "future": future,
        "vix": vix,
        "advanceDecline": ad,
        "sectorStrength": sectors,
        "marketStrip": get_market_strip_data(),
        "analytics": analytics,
        "optionChain": chain,
        "oiHeatmap": heatmap,
        "oiChart": oi_chart,
    }

    set_cached("dashboard", result, key=dashboard_cache_key)
    return result

# =========================================================
# ANALYTICS
# =========================================================
def compute_max_pain(rows):
    if not rows:
        return None

    if sum(num_int(r.get("oi_total"), 0) for r in rows) <= 0:
        return None

    strikes = [r["strike"] for r in rows]
    min_pain = None
    best_strike = None

    for settlement in strikes:
        pain = 0
        for r in rows:
            call_loss = max(0, settlement - r["strike"]) * num_int(r.get("ce_oi"), 0)
            put_loss = max(0, r["strike"] - settlement) * num_int(r.get("pe_oi"), 0)
            pain += call_loss + put_loss

        if min_pain is None or pain < min_pain:
            min_pain = pain
            best_strike = settlement

    return best_strike if best_strike is not None and best_strike > 0 else None


def compute_max_pain_curve(rows):
    if not rows:
        return []

    if sum(num_int(r.get("oi_total"), 0) for r in rows) <= 0:
        return []

    curve = []
    for settlement in [r["strike"] for r in rows]:
        pain = 0
        for r in rows:
            call_loss = max(0, settlement - r["strike"]) * num_int(r.get("ce_oi"), 0)
            put_loss = max(0, r["strike"] - settlement) * num_int(r.get("pe_oi"), 0)
            pain += call_loss + put_loss

        curve.append({
            "strike": settlement,
            "pain": round2(pain / 1000000.0)
        })

    return curve


def top_levels(rows, spot_price=None):
    if not rows:
        return {
            "supports": [],
            "resistances": [],
            "put_wall": None,
            "call_wall": None,
            "gamma_levels": []
        }

    spot_num = safe_float(spot_price, None)

    pe_candidates = [
        r for r in rows
        if safe_float(r.get("strike"), None) is not None and num_int(r.get("pe_oi"), 0) > 0
    ]
    ce_candidates = [
        r for r in rows
        if safe_float(r.get("strike"), None) is not None and num_int(r.get("ce_oi"), 0) > 0
    ]
    gamma_candidates = [
        r for r in rows
        if safe_float(r.get("gamma_proxy"), None) is not None
    ]

    if spot_num is not None:
        pe_below = [r for r in pe_candidates if safe_float(r.get("strike"), None) <= spot_num]
        ce_above = [r for r in ce_candidates if safe_float(r.get("strike"), None) >= spot_num]
    else:
        pe_below = pe_candidates
        ce_above = ce_candidates

    if not pe_below:
        pe_below = pe_candidates
    if not ce_above:
        ce_above = ce_candidates

    def inferred_step(items):
        strikes = sorted(set(safe_float(r.get("strike"), None) for r in items if safe_float(r.get("strike"), None) is not None))
        diffs = [round(strikes[i] - strikes[i - 1], 2) for i in range(1, len(strikes)) if strikes[i] > strikes[i - 1]]
        return diffs[len(diffs) // 2] if diffs else 50

    step = inferred_step(rows)
    max_distance = max(step * 12, abs(spot_num or 0) * 0.015)

    def strong_level_rows(items, side):
        if spot_num is not None:
            near_items = [
                r for r in items
                if abs(safe_float(r.get("strike"), spot_num) - spot_num) <= max_distance
            ]
            if near_items:
                items = near_items
        oi_key = "pe_oi" if side == "support" else "ce_oi"
        oich_key = "pe_oich" if side == "support" else "ce_oich"
        volume_key = "pe_volume" if side == "support" else "ce_volume"
        max_oi = max([num_int(r.get(oi_key), 0) for r in items] or [1]) or 1
        max_oich = max([max(num_int(r.get(oich_key), 0), 0) for r in items] or [1]) or 1
        max_volume = max([num_int(r.get(volume_key), 0) for r in items] or [1]) or 1

        def score_row(item):
            strike = safe_float(item.get("strike"), 0)
            distance = abs((spot_num or strike) - strike)
            oi_score = (num_int(item.get(oi_key), 0) / max_oi) * 45
            change_score = (max(num_int(item.get(oich_key), 0), 0) / max_oich) * 35
            volume_score = (num_int(item.get(volume_key), 0) / max_volume) * 20
            distance_penalty = min(18, (distance / max(max_distance, 1)) * 18) if spot_num is not None else 0
            return oi_score + change_score + volume_score - distance_penalty

        ranked = sorted(items, key=lambda r: (score_row(r), -abs((spot_num or safe_float(r.get("strike"), 0)) - safe_float(r.get("strike"), 0))), reverse=True)
        selected = []
        for row in ranked:
            strike = safe_float(row.get("strike"), None)
            if strike is None or strike in selected:
                continue
            selected.append(strike)
            if len(selected) == 3:
                break
        return selected

    support_vals = sorted(strong_level_rows(pe_below, "support"), reverse=True)
    resistance_vals = sorted(strong_level_rows(ce_above, "resistance"))

    strongest_put_wall_row = max(pe_below, key=lambda x: (num_int(x.get("pe_oi"), 0), num_int(x.get("pe_oich"), 0))) if pe_below else None
    strongest_call_wall_row = max(ce_above, key=lambda x: (num_int(x.get("ce_oi"), 0), num_int(x.get("ce_oich"), 0))) if ce_above else None

    top_gamma = sorted(
        gamma_candidates,
        key=lambda x: num(x.get("gamma_proxy"), 0),
        reverse=True
    )

    return {
        "supports": support_vals,
        "resistances": resistance_vals,
        "put_wall": strongest_put_wall_row["strike"] if strongest_put_wall_row else None,
        "call_wall": strongest_call_wall_row["strike"] if strongest_call_wall_row else None,
        "gamma_levels": [r["strike"] for r in top_gamma[:3]]
    }

def strongest_buildup(rows):
    if not rows:
        return {"type": "-", "strike": None, "value": None}

    best = None
    best_abs = 0

    for r in rows:
        candidates = [
            ("CE OI Build-up", r["strike"], safe_int(r.get("ce_oich"), None)),
            ("PE OI Build-up", r["strike"], safe_int(r.get("pe_oich"), None)),
        ]
        for ctype, strike, val in candidates:
            if val is None:
                continue
            if abs(val) > best_abs:
                best_abs = abs(val)
                best = {"type": ctype, "strike": strike, "value": val}

    return best or {"type": "-", "strike": None, "value": None}


def compute_pcr(rows):
    if not rows:
        return None

    total_ce = sum(num_int(r.get("ce_oi"), 0) for r in rows)
    total_pe = sum(num_int(r.get("pe_oi"), 0) for r in rows)

    if total_ce <= 0 or total_pe <= 0:
        return None

    pcr = round2(total_pe / total_ce)
    return pcr if pcr is not None and pcr > 0 else None


def compute_straddle(rows):
    atm_row = next((r for r in rows if r.get("is_atm")), None)
    if not atm_row:
        return {"atm_strike": None, "straddle": None, "low": None, "high": None}

    strike = safe_float(atm_row.get("strike"), None)
    ce_ltp = safe_float(atm_row.get("ce_ltp"), None)
    pe_ltp = safe_float(atm_row.get("pe_ltp"), None)

    if strike is None or strike <= 0 or ce_ltp is None or pe_ltp is None:
        return {"atm_strike": strike, "straddle": None, "low": None, "high": None}

    straddle = round2(ce_ltp + pe_ltp)

    if straddle is None or straddle <= 0:
        return {"atm_strike": strike, "straddle": None, "low": None, "high": None}

    return {
        "atm_strike": strike,
        "straddle": straddle,
        "low": round2(strike - straddle),
        "high": round2(strike + straddle),
    }


def compute_oi_concentration(rows):
    total_oi = sum(num_int(r.get("oi_total"), 0) for r in rows)
    if total_oi <= 0:
        return None
    top3 = sum(num_int(r.get("oi_total"), 0) for r in sorted(rows, key=lambda x: num_int(x.get("oi_total"), 0), reverse=True)[:3])
    return round2((top3 / total_oi) * 100)


def compute_sentiment(spot, future, vix, ad_ratio, pcr, max_pain):
    score = 50.0

    spot_chp = safe_float(spot.get("change_pct"), None)
    basis_pct = safe_float(future.get("basis_pct"), None)
    vix_val = safe_float(vix.get("ltp"), None)
    mp = safe_float(max_pain, None)
    spot_ltp = safe_float(spot.get("ltp"), None)
    ad_ratio_num = safe_float(ad_ratio, None)

    if spot_chp is not None:
        score += clamp(spot_chp * 7, -18, 18)

    if basis_pct is not None:
        score += clamp(basis_pct * 35, -8, 8)

    if ad_ratio_num is not None:
        score += clamp((ad_ratio_num - 1) * 20, -18, 18)

    if pcr is not None:
        if pcr >= 1.2:
            score += 8
        elif pcr >= 1.05:
            score += 4
        elif pcr <= 0.75:
            score -= 8
        elif pcr <= 0.95:
            score -= 4

    if vix_val is not None:
        if vix_val >= 22:
            score -= 18
        elif vix_val >= 18:
            score -= 12
        elif vix_val >= 15:
            score -= 6
        elif 0 < vix_val <= 12:
            score += 6

    if mp is not None and spot_ltp is not None and spot_ltp > 0:
        distance_pct = ((spot_ltp - mp) / spot_ltp) * 100
        score += clamp(distance_pct * 10, -4, 4)

    score = round2(clamp(score, 0, 100))

    if score >= 60:
        bias = "Bullish"
    elif score <= 40:
        bias = "Bearish"
    else:
        bias = "Neutral"

    return {
        "score": score,
        "bias": bias,
        "components": {
            "spotChangePct": round2(spot_chp),
            "basisPct": round2(basis_pct),
            "adRatio": round2(ad_ratio_num),
            "pcr": round2(pcr),
            "vix": round2(vix_val),
            "maxPain": round2(mp),
        }
    }


def compute_oi_momentum(rows, spot_price):
    spot_num = safe_float(spot_price, None)
    if spot_num is None or not rows:
        return {
            "net": None,
            "label": "Balanced"
        }

    nearby = []
    for r in rows:
        weight = 1 / max(1, abs(r["strike"] - spot_num))
        net = (num(r.get("pe_oich"), 0) - num(r.get("ce_oich"), 0)) * weight
        nearby.append(net)

    total = round2(sum(nearby))

    if total is None:
        label = "Balanced"
    elif total > 0:
        label = "Put Side Stronger"
    elif total < 0:
        label = "Call Side Stronger"
    else:
        label = "Balanced"

    return {
        "net": total,
        "label": label
    }


def compute_gamma_exposure(rows, spot_price):
    spot_num = safe_float(spot_price, None)
    if not rows or spot_num is None:
        return []

    result = []
    for r in rows:
        strike = safe_float(r.get("strike"), None)
        if strike is None:
            continue

        ce_oi = num(r.get("ce_oi"), 0)
        pe_oi = num(r.get("pe_oi"), 0)
        distance = abs(strike - spot_num) + 1

        call_gex = round2((ce_oi / distance) * -1)
        put_gex = round2((pe_oi / distance) * 1)
        net_gex = round2((call_gex or 0) + (put_gex or 0))

        result.append({
            "strike": strike,
            "callGex": call_gex,
            "putGex": put_gex,
            "netGex": net_gex
        })

    result.sort(key=lambda x: x["strike"])
    return result


def compute_gex_summary(gamma_exposure, spot_price):
    if not gamma_exposure:
        return {
            "maxPositiveStrike": None,
            "maxPositiveValue": None,
            "maxNegativeStrike": None,
            "maxNegativeValue": None,
            "flipZone": None,
            "gexBias": "Neutral"
        }

    strongest_pos = max(gamma_exposure, key=lambda x: num(x.get("netGex"), 0))
    strongest_neg = min(gamma_exposure, key=lambda x: num(x.get("netGex"), 0))

    flip_zone = None
    prev = None
    zero_cross_candidates = []
    for item in gamma_exposure:
        curr = safe_float(item.get("netGex"), None)
        if curr is None:
            continue
        if prev is not None:
            if (prev <= 0 <= curr) or (prev >= 0 >= curr):
                zero_cross_candidates.append(item.get("strike"))
        prev = curr

    spot_num = safe_float(spot_price, None)
    if zero_cross_candidates and spot_num is not None:
        flip_zone = min(
            zero_cross_candidates,
            key=lambda x: abs(num(x, 0) - spot_num)
        )
    elif zero_cross_candidates:
        flip_zone = zero_cross_candidates[0]

    total_net = sum(num(x.get("netGex"), 0) for x in gamma_exposure)
    if total_net > 0:
        bias = "Positive GEX"
    elif total_net < 0:
        bias = "Negative GEX"
    else:
        bias = "Neutral"

    return {
        "maxPositiveStrike": safe_float(strongest_pos.get("strike"), None),
        "maxPositiveValue": round2(safe_float(strongest_pos.get("netGex"), None)),
        "maxNegativeStrike": safe_float(strongest_neg.get("strike"), None),
        "maxNegativeValue": round2(safe_float(strongest_neg.get("netGex"), None)),
        "flipZone": safe_float(flip_zone, None),
        "gexBias": bias
    }


def compute_liquidity_map(rows):
    if not rows:
        return []

    ranked = sorted(rows, key=lambda x: (num_int(x.get("oi_total"), 0), abs(num_int(x.get("oi_change_total"), 0))), reverse=True)
    out = []

    for r in ranked[:12]:
        ce_oi = num_int(r.get("ce_oi"), 0)
        pe_oi = num_int(r.get("pe_oi"), 0)
        ce_oich = num_int(r.get("ce_oich"), 0)
        pe_oich = num_int(r.get("pe_oich"), 0)
        total_oi = num_int(r.get("oi_total"), 0)
        total_oich = num_int(r.get("oi_change_total"), 0)

        if pe_oi > ce_oi:
            dominance = "Put Heavy"
        elif ce_oi > pe_oi:
            dominance = "Call Heavy"
        else:
            dominance = "Balanced"

        if pe_oich > ce_oich:
            flow = "Put Active"
        elif ce_oich > pe_oich:
            flow = "Call Active"
        else:
            flow = "Balanced"

        liquidity_score = round2(total_oi / 1000.0 + abs(total_oich) / 500.0)

        out.append({
            "strike": r["strike"],
            "totalOI": total_oi,
            "totalOIChange": total_oich,
            "ceOI": ce_oi,
            "peOI": pe_oi,
            "dominance": dominance,
            "flow": flow,
            "liquidityScore": liquidity_score
        })

    out.sort(key=lambda x: num(x.get("strike"), 0))
    return out


def compute_liquidity_summary(liquidity_map, spot_price):
    if not liquidity_map:
        return {
            "richestStrike": None,
            "richestScore": None,
            "nearestLiquidityStrike": None,
            "dominance": "Balanced"
        }

    richest = max(liquidity_map, key=lambda x: num(x.get("liquidityScore"), 0))

    spot_num = safe_float(spot_price, None)
    nearest = None
    if spot_num is not None:
        nearest = min(
            liquidity_map,
            key=lambda x: abs(num(x.get("strike"), 0) - spot_num)
        )

    return {
        "richestStrike": safe_float(richest.get("strike"), None),
        "richestScore": round2(safe_float(richest.get("liquidityScore"), None)),
        "nearestLiquidityStrike": safe_float(nearest.get("strike"), None) if nearest else None,
        "dominance": richest.get("dominance", "Balanced")
    }


def build_breakout_breakdown(spot, future, levels):
    ref_price = safe_float(spot.get("ltp"), None)
    if ref_price is None:
        ref_price = safe_float(future.get("ltp"), None)

    supports = levels.get("supports", []) or []
    resistances = levels.get("resistances", []) or []

    top_resistance = safe_float(resistances[0], None) if resistances else None
    top_support = safe_float(supports[0], None) if supports else None

    signal = "Neutral"
    bias = "Neutral"
    strength = 50

    if ref_price is not None and top_resistance is not None and ref_price > top_resistance:
        signal = "Breakout"
        bias = "Bullish"
        strength = 80
    elif ref_price is not None and top_support is not None and ref_price < top_support:
        signal = "Breakdown"
        bias = "Bearish"
        strength = 80
    else:
        dist_up = abs(top_resistance - ref_price) / ref_price * 100 if top_resistance is not None and ref_price not in (None, 0) else 999
        dist_down = abs(ref_price - top_support) / ref_price * 100 if top_support is not None and ref_price not in (None, 0) else 999

        if dist_up < dist_down:
            signal = "Near Breakout"
            bias = "Mild Bullish"
            strength = 60 if dist_up < 0.5 else 52
        elif dist_down < dist_up:
            signal = "Near Breakdown"
            bias = "Mild Bearish"
            strength = 60 if dist_down < 0.5 else 52

    return {
        "signal": signal,
        "bias": bias,
        "strength": strength,
        "breakoutLevel": round2(top_resistance),
        "breakdownLevel": round2(top_support),
        "referencePrice": round2(ref_price),
    }


def build_intraday_range_projection(spot, future, straddle):
    ref_price = safe_float(spot.get("ltp"), None)
    if ref_price is None:
        ref_price = safe_float(future.get("ltp"), None)

    spot_high = safe_float(spot.get("high"), None)
    spot_low = safe_float(spot.get("low"), None)
    prev_close = safe_float(spot.get("prev_close"), None)

    day_range = None
    if spot_high is not None and spot_low is not None:
        day_range = max(0, spot_high - spot_low)

    straddle_move = safe_float(straddle.get("straddle"), None)

    candidates = []
    if day_range is not None:
        candidates.append(day_range * 0.35)
    if straddle_move is not None:
        candidates.append(straddle_move * 0.35)

    projected_move = round2(max(candidates)) if candidates else None

    projected_high = round2(ref_price + projected_move) if ref_price is not None and projected_move is not None else None
    projected_low = round2(ref_price - projected_move) if ref_price is not None and projected_move is not None else None

    range_pct = None
    high_pct = pct_change(spot_high, prev_close)
    low_pct = pct_change(spot_low, prev_close)
    if high_pct is not None and low_pct is not None:
        range_pct = abs(round2(high_pct - low_pct))

    return {
        "dayRange": round2(day_range),
        "projectedMove": projected_move,
        "projectedHigh": projected_high,
        "projectedLow": projected_low,
        "rangePct": range_pct,
        "refPrice": round2(ref_price),
    }


def build_call_put_dominance(rows):
    total_call_oi = sum(num_int(r.get("ce_oi"), 0) for r in rows)
    total_put_oi = sum(num_int(r.get("pe_oi"), 0) for r in rows)
    total_call_oich = sum(num_int(r.get("ce_oich"), 0) for r in rows)
    total_put_oich = sum(num_int(r.get("pe_oich"), 0) for r in rows)

    total_oi = total_call_oi + total_put_oi
    call_pct = round2((total_call_oi / total_oi) * 100) if total_oi > 0 else None
    put_pct = round2((total_put_oi / total_oi) * 100) if total_oi > 0 else None

    if total_put_oi > total_call_oi:
        label = "Put Dominance"
        bias = "Bullish"
    elif total_call_oi > total_put_oi:
        label = "Call Dominance"
        bias = "Bearish"
    else:
        label = "Balanced"
        bias = "Neutral"

    if total_put_oich > total_call_oich:
        flow_label = "Put Writing Stronger"
    elif total_call_oich > total_put_oich:
        flow_label = "Call Writing Stronger"
    else:
        flow_label = "Balanced"

    return {
        "label": label,
        "bias": bias,
        "callOI": total_call_oi,
        "putOI": total_put_oi,
        "callShare": call_pct,
        "putShare": put_pct,
        "callOIChange": total_call_oich,
        "putOIChange": total_put_oich,
        "flowLabel": flow_label,
    }


def build_smart_oi_flow(rows, spot_price):
    spot_num = safe_float(spot_price, None)

    call_add = 0.0
    put_add = 0.0
    call_unwind = 0.0
    put_unwind = 0.0

    for r in rows:
        strike = safe_float(r.get("strike"), None)
        ce_oich = num(r.get("ce_oich"), 0)
        pe_oich = num(r.get("pe_oich"), 0)

        weight = 1.0
        if spot_num is not None and spot_num > 0 and strike is not None:
            diff_pct = abs(strike - spot_num) / spot_num
            if diff_pct <= 0.003:
                weight = 1.8
            elif diff_pct <= 0.007:
                weight = 1.4
            elif diff_pct <= 0.015:
                weight = 1.15

        if ce_oich >= 0:
            call_add += ce_oich * weight
        else:
            call_unwind += abs(ce_oich) * weight

        if pe_oich >= 0:
            put_add += pe_oich * weight
        else:
            put_unwind += abs(pe_oich) * weight

    bullish_score = put_add + call_unwind
    bearish_score = call_add + put_unwind
    total = max(bullish_score + bearish_score, 1)

    bullish_pct = round2((bullish_score / total) * 100)
    bearish_pct = round2((bearish_score / total) * 100)

    if bullish_pct >= bearish_pct + 8:
        label = "Bullish OI Flow"
        bias = "Bullish"
    elif bearish_pct >= bullish_pct + 8:
        label = "Bearish OI Flow"
        bias = "Bearish"
    else:
        label = "Mixed OI Flow"
        bias = "Neutral"

    return {
        "label": label,
        "bias": bias,
        "bullishScore": round2(bullish_score),
        "bearishScore": round2(bearish_score),
        "bullishPct": bullish_pct,
        "bearishPct": bearish_pct,
        "callAdd": round2(call_add),
        "putAdd": round2(put_add),
        "callUnwind": round2(call_unwind),
        "putUnwind": round2(put_unwind),
    }


def build_market_regime(spot, future, vix, ad, pcr, oi_flow):
    spot_ltp = safe_float(spot.get("ltp"), None)
    prev_close = safe_float(spot.get("prev_close"), None)
    fut_ltp = safe_float(future.get("ltp"), None)
    vix_ltp = safe_float(vix.get("ltp"), None)
    ad_ratio = num(ad.get("ratio"), 0)
    pcr_val = safe_float(pcr, None)
    spot_move = pct_change(spot_ltp, prev_close)
    fut_move = pct_change(fut_ltp, safe_float(future.get("prev_close"), None))

    regime = "Range Bound"
    tone = "Neutral"
    confidence = 55

    bull_cond = (
        spot_move is not None and fut_move is not None and
        spot_move > 0.4 and fut_move > 0.4 and ad_ratio >= 1 and
        pcr_val is not None and pcr_val >= 0.95 and
        oi_flow.get("bias") == "Bullish"
    )

    bear_cond = (
        spot_move is not None and fut_move is not None and
        spot_move < -0.4 and fut_move < -0.4 and
        ad_ratio < 1 and
        pcr_val is not None and pcr_val < 0.95 and
        oi_flow.get("bias") == "Bearish"
    )

    if bull_cond:
        regime = "Bull Trend"
        tone = "Bullish"
        confidence = 78
    elif bear_cond:
        regime = "Bear Trend"
        tone = "Bearish"
        confidence = 78
    else:
        intraday_range = None
        if safe_float(spot.get("high"), None) is not None and safe_float(spot.get("low"), None) is not None:
            intraday_range = num(spot.get("high"), 0) - num(spot.get("low"), 0)

        intraday_range_pct = (intraday_range / prev_close) * 100 if intraday_range is not None and prev_close not in (None, 0) else 0

        if intraday_range_pct > 1.25 or (vix_ltp is not None and vix_ltp >= 18):
            regime = "Volatile Rotation"
            tone = "Mixed"
            confidence = 68
        else:
            regime = "Range Bound"
            tone = "Neutral"
            confidence = 62

    return {
        "label": regime,
        "tone": tone,
        "confidence": confidence,
        "spotMovePct": round2(spot_move),
        "futureMovePct": round2(fut_move),
        "vix": round2(vix_ltp),
        "adRatio": round2(ad_ratio),
        "pcr": round2(pcr_val),
    }


def build_breadth_stats(ad, sectors):
    total_sector_adv = 0
    total_sector_dec = 0
    total_sector_unch = 0

    for s in sectors or []:
        adv = num_int(s.get("advances"), 0)
        dec = num_int(s.get("declines"), 0)
        total = num_int(s.get("valid_count"), 0)
        if total <= 0:
            total = adv + dec + num_int(s.get("unchanged"), 0)
        unch = max(total - adv - dec, 0)

        total_sector_adv += adv
        total_sector_dec += dec
        total_sector_unch += unch

    sector_total = max(total_sector_adv + total_sector_dec + total_sector_unch, 1)

    sector_ad_ratio = None
    if total_sector_dec > 0:
        sector_ad_ratio = round2(total_sector_adv / total_sector_dec)
    elif total_sector_adv > 0:
        sector_ad_ratio = round2(float(total_sector_adv))
    else:
        sector_ad_ratio = 0.0

    sector_breadth_score = round2(
        ((total_sector_adv - total_sector_dec) / sector_total) * 100
    )

    index_adv = num_int(ad.get("advances"), 0)
    index_dec = num_int(ad.get("declines"), 0)
    index_unch = num_int(ad.get("unchanged"), 0)
    index_total = max(index_adv + index_dec + index_unch, 1)

    index_breadth_score = round2(
        ((index_adv - index_dec) / index_total) * 100
    )

    return {
    "advances": total_sector_adv,
    "declines": total_sector_dec,
    "unchanged": total_sector_unch,
    "total": total_sector_adv + total_sector_dec + total_sector_unch,
    "ratio": sector_ad_ratio,
    "adRatio": sector_ad_ratio,
    "breadthScore": sector_breadth_score,

    "sectorAdvances": total_sector_adv,
    "sectorDeclines": total_sector_dec,
    "sectorUnchanged": total_sector_unch,

    "indexAdvances": index_adv,
    "indexDeclines": index_dec,
    "indexUnchanged": index_unch,
    "indexBreadthScore": index_breadth_score,
}


def build_sector_rotation(sectors):
    if not sectors:
        return []

    valid_abs = [
        abs(num(x.get("change_pct"), 0))
        for x in sectors
        if safe_float(x.get("change_pct"), None) is not None
    ]
    abs_max = max(valid_abs) if valid_abs else 1

    ranked = sorted(sectors, key=lambda x: num(x.get("change_pct"), -999999), reverse=True)

    result = []
    for idx, item in enumerate(ranked):
        chg = safe_float(item.get("change_pct"), None)
        strength = round2((abs(chg) / abs_max) * 100) if chg is not None else None

        if chg is None:
            status = "Neutral"
        elif chg > 0.35:
            status = "Leading"
        elif chg > 0.05:
            status = "Improving"
        elif chg < -0.35:
            status = "Weak"
        elif chg < -0.05:
            status = "Lagging"
        else:
            status = "Neutral"

        result.append({
            "rank": idx + 1,
            "name": item.get("name", ""),
            "change_pct": round2(chg),
            "strength": strength,
            "status": status
        })

    return result


def build_bias_breakdown(ad_ratio, breakout_breakdown, call_put_dominance, smart_oi_flow, market_regime):
    return {
        "marketRegime": market_regime.get("tone", "Neutral"),
        "oiFlow": smart_oi_flow.get("bias", "Neutral"),
        "dominance": call_put_dominance.get("bias", "Neutral"),
        "adRatio": round2(safe_float(ad_ratio, None)),
        "structure": breakout_breakdown.get("signal", "Neutral"),
    }



def build_opening_gap_context(symbol_key, spot, future=None):
    """Separate overnight gap from today's intraday direction.

    A negative day change can coexist with a strong recovery from today's open.
    In that situation PE must not remain actionable merely because price is still
    below yesterday's close. The reverse applies to a gap-up that is selling off.
    """
    spot = spot or {}
    future = future or {}
    current = safe_float(spot.get("ltp"), None)
    if current is None:
        current = safe_float(future.get("ltp"), None)
    today_open = safe_float(spot.get("open"), None)
    if today_open is None:
        today_open = safe_float(future.get("open"), None)
    prev_close = safe_float(spot.get("prev_close"), None)
    if prev_close is None:
        prev_close = safe_float(future.get("prev_close"), None)

    gap_threshold = 0.20 if str(symbol_key).upper() == "BANKNIFTY" else 0.18
    direction_threshold = 0.15 if str(symbol_key).upper() == "BANKNIFTY" else 0.12
    fill_tolerance = 0.05

    if current in (None, 0) or today_open in (None, 0) or prev_close in (None, 0):
        return {
            "available": False,
            "state": "UNAVAILABLE",
            "gapSide": "FLAT",
            "intradayDirection": "FLAT",
            "gapPct": None,
            "fromOpenPct": None,
            "dayChangePct": pct_change(current, prev_close) if current not in (None, 0) and prev_close not in (None, 0) else None,
            "todayOpen": round2(today_open),
            "prevClose": round2(prev_close),
            "current": round2(current),
            "conflictSide": None,
            "conflictReason": None,
        }

    gap_pct = pct_change(today_open, prev_close)
    from_open_pct = pct_change(current, today_open)
    day_change_pct = pct_change(current, prev_close)

    gap_side = "UP" if gap_pct is not None and gap_pct >= gap_threshold else "DOWN" if gap_pct is not None and gap_pct <= -gap_threshold else "FLAT"
    intraday_direction = "UP" if from_open_pct is not None and from_open_pct >= direction_threshold else "DOWN" if from_open_pct is not None and from_open_pct <= -direction_threshold else "FLAT"

    state = "FLAT OPEN"
    if gap_side == "UP":
        if current <= prev_close * (1 + fill_tolerance / 100.0):
            state = "GAP UP REVERSAL"
        elif intraday_direction == "DOWN":
            state = "GAP UP FILLING"
        elif intraday_direction == "UP":
            state = "GAP UP CONTINUATION"
        else:
            state = "GAP UP HOLDING"
    elif gap_side == "DOWN":
        if current >= prev_close * (1 - fill_tolerance / 100.0):
            state = "GAP DOWN FILLED / RECOVERY"
        elif intraday_direction == "UP":
            state = "GAP DOWN RECOVERY"
        elif intraday_direction == "DOWN":
            state = "GAP DOWN CONTINUATION"
        else:
            state = "GAP DOWN HOLDING"
    elif intraday_direction == "UP":
        state = "OPENING RANGE UP"
    elif intraday_direction == "DOWN":
        state = "OPENING RANGE DOWN"

    # Current movement from today's open is an explicit safety veto against the
    # opposite option side. It does not auto-create an entry on the other side;
    # it simply forces WAIT until the remaining confirmations agree.
    conflict_side = "PE" if intraday_direction == "UP" else "CE" if intraday_direction == "DOWN" else None
    conflict_reason = None
    if conflict_side:
        conflict_reason = f"{state}: price is {abs(from_open_pct or 0):.2f}% {'above' if intraday_direction == 'UP' else 'below'} today's open"

    return {
        "available": True,
        "state": state,
        "gapSide": gap_side,
        "intradayDirection": intraday_direction,
        "gapPct": round2(gap_pct),
        "fromOpenPct": round2(from_open_pct),
        "dayChangePct": round2(day_change_pct),
        "todayOpen": round2(today_open),
        "prevClose": round2(prev_close),
        "current": round2(current),
        "gapThresholdPct": gap_threshold,
        "directionThresholdPct": direction_threshold,
        "conflictSide": conflict_side,
        "conflictReason": conflict_reason,
    }

def build_bias_scores(ad_ratio, breakout_breakdown, call_put_dominance, smart_oi_flow, market_regime, opening_gap=None):
    bullish_score = 0
    bearish_score = 0

    if market_regime.get("tone") == "Bullish":
        bullish_score += 2
    elif market_regime.get("tone") == "Bearish":
        bearish_score += 2

    if smart_oi_flow.get("bias") == "Bullish":
        bullish_score += 2
    elif smart_oi_flow.get("bias") == "Bearish":
        bearish_score += 2

    if call_put_dominance.get("bias") == "Bullish":
        bullish_score += 1
    elif call_put_dominance.get("bias") == "Bearish":
        bearish_score += 1

    ad_ratio_num = safe_float(ad_ratio, None)
    if ad_ratio_num is not None:
        if ad_ratio_num >= 1:
            bullish_score += 1
        else:
            bearish_score += 1

    structure = breakout_breakdown.get("signal", "")
    if structure == "Breakout":
        bullish_score += 2
    elif structure == "Breakdown":
        bearish_score += 2

    gap = opening_gap or {}
    gap_state = str(gap.get("state") or "").upper()
    intraday_direction = str(gap.get("intradayDirection") or "").upper()
    if intraday_direction == "UP":
        bullish_score += 1
    elif intraday_direction == "DOWN":
        bearish_score += 1
    if "GAP DOWN RECOVERY" in gap_state:
        bullish_score += 2
    elif "GAP UP FILLING" in gap_state or "GAP UP REVERSAL" in gap_state:
        bearish_score += 2
    elif gap_state == "GAP UP CONTINUATION":
        bullish_score += 1
    elif gap_state == "GAP DOWN CONTINUATION":
        bearish_score += 1

    return {
        "bullish": bullish_score,
        "bearish": bearish_score
    }


def _nearest_support_below(price, supports):
    px = safe_float(price, None)
    if px is None:
        return None

    vals = []
    for s in supports or []:
        val = safe_float(s, None)
        if val is not None and val < px:
            vals.append(val)

    if not vals:
        return None

    return max(vals)


def _nearest_resistance_above(price, resistances):
    px = safe_float(price, None)
    if px is None:
        return None

    vals = []
    for r in resistances or []:
        val = safe_float(r, None)
        if val is not None and val > px:
            vals.append(val)

    if not vals:
        return None

    return min(vals)


def build_trade_signal_panel(spot, future, analytics, ad):
    breakout = analytics.get("breakoutBreakdown", {})
    intraday = analytics.get("intradayRangeProjection", {})
    regime = analytics.get("marketRegime", {})
    oi_flow = analytics.get("smartOIFlow", {})
    dominance = analytics.get("callPutDominance", {})
    sr = analytics.get("supportResistance", {})
    opening_gap = analytics.get("openingGap", {}) or {}

    ref = safe_float(spot.get("ltp"), None)
    if ref is None:
        ref = safe_float(future.get("ltp"), None)

    breakout_level = safe_float(breakout.get("breakoutLevel"), None)
    breakdown_level = safe_float(breakout.get("breakdownLevel"), None)
    projected_move = safe_float(intraday.get("projectedMove"), None)
    ad_ratio = safe_float(ad.get("ratio"), None)

    supports = sr.get("supports", []) or []
    resistances = sr.get("resistances", []) or []

    support_vals = sorted(
        [safe_float(x, None) for x in supports if safe_float(x, None) is not None]
    )
    resistance_vals = sorted(
        [safe_float(x, None) for x in resistances if safe_float(x, None) is not None]
    )

    scores = build_bias_scores(ad_ratio, breakout, dominance, oi_flow, regime, opening_gap)
    bullish_score = num_int(scores.get("bullish"), 0)
    bearish_score = num_int(scores.get("bearish"), 0)

    bias = "Neutral"
    action = "Wait"
    confidence = 50

    if bullish_score >= bearish_score + 2:
        bias = "Bullish"
        action = "Buy CE / Bullish setup"
        confidence = min(90, 55 + bullish_score * 6)
    elif bearish_score >= bullish_score + 2:
        bias = "Bearish"
        action = "Buy PE / Bearish setup"
        confidence = min(90, 55 + bearish_score * 6)

    blocked_bias = None
    direction_conflict = False
    direction_conflict_reason = None
    selected_side = "CE" if bias == "Bullish" else "PE" if bias == "Bearish" else None
    conflict_side = str(opening_gap.get("conflictSide") or "").upper()
    if selected_side and not opening_gap.get("available"):
        blocked_bias = bias
        direction_conflict = True
        direction_conflict_reason = "Opening gap / from-open direction unavailable"
        bias = "Neutral"
        action = "Wait - opening direction data unavailable"
        confidence = min(confidence, 50)
    elif selected_side and conflict_side == selected_side:
        blocked_bias = bias
        direction_conflict = True
        direction_conflict_reason = opening_gap.get("conflictReason") or "Current direction from today's open opposes this side"
        bias = "Neutral"
        action = "Wait - opening/intraday direction conflict"
        confidence = min(confidence, 55)

    entry = ref
    target = None
    stoploss = None

    def next_resistance(price, min_gap_pct=0.15):
        if price is None:
            return None

        min_gap = price * (min_gap_pct / 100.0)

        for r in resistance_vals:
            if r > price and (r - price) >= min_gap:
                return r

        for r in resistance_vals:
            if r > price:
                return r

        return None

    def next_support(price, min_gap_pct=0.15):
        if price is None:
            return None

        min_gap = price * (min_gap_pct / 100.0)

        lower_supports = [s for s in support_vals if s < price and (price - s) >= min_gap]
        if lower_supports:
            return lower_supports[-1]

        lower_supports = [s for s in support_vals if s < price]
        return lower_supports[-1] if lower_supports else None

    if bias == "Bullish":
        if breakout_level is not None and ref is not None and ref >= breakout_level:
            entry = breakout_level
        else:
            entry = ref

        target = next_resistance(ref if ref is not None else entry)
        if target is None and entry is not None and projected_move is not None:
            target = round2(entry + projected_move)

        stoploss = next_support(ref if ref is not None else entry)
        if stoploss is None:
            if breakout_level is not None:
                stoploss = breakout_level
            elif breakdown_level is not None:
                stoploss = breakdown_level
            elif entry is not None and projected_move is not None:
                stoploss = round2(entry - projected_move * 0.6)

    elif bias == "Bearish":
        if breakdown_level is not None and ref is not None and ref <= breakdown_level:
            entry = breakdown_level
        else:
            entry = ref

        target = next_support(ref if ref is not None else entry)
        if target is None and entry is not None and projected_move is not None:
            target = round2(entry - projected_move)

        stoploss = next_resistance(ref if ref is not None else entry)
        if stoploss is None:
            if breakdown_level is not None:
                stoploss = breakdown_level
            elif breakout_level is not None:
                stoploss = breakout_level
            elif entry is not None and projected_move is not None:
                stoploss = round2(entry + projected_move * 0.6)

    else:
        target = None
        stoploss = None

    rr = None
    if entry is not None and target is not None and stoploss is not None:
        reward = abs(target - entry)
        risk = abs(entry - stoploss)
        if risk > 0:
            rr = round2(reward / risk)

    return {
        "bias": bias,
        "action": action,
        "entry": round2(entry) if entry is not None else None,
        "target": round2(target) if target is not None else None,
        "stoploss": round2(stoploss) if stoploss is not None else None,
        "confidence": confidence,
        "riskReward": rr,
        "bullishScore": bullish_score,
        "bearishScore": bearish_score,
        "projectedMove": round2(projected_move) if projected_move is not None else None,
        "breakoutLevel": round2(breakout_level) if breakout_level is not None else None,
        "breakdownLevel": round2(breakdown_level) if breakdown_level is not None else None,
        "openingGap": opening_gap,
        "directionConflict": direction_conflict,
        "directionConflictReason": direction_conflict_reason,
        "blockedBias": blocked_bias,
    }


def build_trade_signals(spot, future, analytics, ad):
    signals = []

    spot_ltp = safe_float(spot.get("ltp"), None)
    fut_ltp = safe_float(future.get("ltp"), None)
    pcr = safe_float(analytics.get("pcr"), None)
    breakout = analytics.get("breakoutBreakdown", {})
    dominance = analytics.get("callPutDominance", {})
    oi_flow = analytics.get("smartOIFlow", {})
    regime = analytics.get("marketRegime", {})
    supports = analytics.get("supports", []) or []
    resistances = analytics.get("resistances", []) or []
    put_wall = safe_float(analytics.get("putWall"), None)
    call_wall = safe_float(analytics.get("callWall"), None)
    ad_ratio = safe_float(ad.get("ratio"), None)

    ref = spot_ltp if spot_ltp is not None else fut_ltp

    if breakout.get("signal") == "Breakout":
        signals.append({
            "type": "Breakout",
            "bias": "Bullish",
            "title": "Price above resistance",
            "detail": f"Trading above breakout level {round2(breakout.get('breakoutLevel'))}"
        })

    if breakout.get("signal") == "Breakdown":
        signals.append({
            "type": "Breakdown",
            "bias": "Bearish",
            "title": "Price below support",
            "detail": f"Trading below breakdown level {round2(breakout.get('breakdownLevel'))}"
        })

    if dominance.get("bias") == "Bullish" and oi_flow.get("bias") == "Bullish":
        signals.append({
            "type": "Options Flow",
            "bias": "Bullish",
            "title": "Put side stronger",
            "detail": "Put dominance + bullish OI flow"
        })

    if dominance.get("bias") == "Bearish" and oi_flow.get("bias") == "Bearish":
        signals.append({
            "type": "Options Flow",
            "bias": "Bearish",
            "title": "Call side stronger",
            "detail": "Call dominance + bearish OI flow"
        })

    if regime.get("label") == "Bull Trend" and pcr is not None and pcr >= 1 and ad_ratio is not None and ad_ratio >= 1:
        signals.append({
            "type": "Trend Engine",
            "bias": "Bullish",
            "title": "Trend continuation likely",
            "detail": "Bull trend + supportive breadth + PCR"
        })

    if regime.get("label") == "Bear Trend" and pcr is not None and pcr < 1 and ad_ratio is not None and ad_ratio < 1:
        signals.append({
            "type": "Trend Engine",
            "bias": "Bearish",
            "title": "Downtrend continuation likely",
            "detail": "Bear trend + weak breadth + PCR"
        })

    if put_wall is not None and ref not in (None, 0) and abs(ref - put_wall) / ref < 0.004:
        signals.append({
            "type": "Wall Zone",
            "bias": "Bullish",
            "title": "Put wall support active",
            "detail": f"Price close to put wall {round2(put_wall)}"
        })

    if call_wall is not None and ref not in (None, 0) and abs(ref - call_wall) / ref < 0.004:
        signals.append({
            "type": "Wall Zone",
            "bias": "Bearish",
            "title": "Call wall resistance active",
            "detail": f"Price close to call wall {round2(call_wall)}"
        })

    if supports and ref is not None:
        s1 = safe_float(supports[0], None)
        if s1 is not None and ref > s1 and abs(ref - s1) / max(ref, 1) < 0.003:
            signals.append({
                "type": "Support Retest",
                "bias": "Bullish",
                "title": "Near support retest",
                "detail": f"Watching bounce zone near {round2(s1)}"
            })

    if resistances and ref is not None:
        r1 = safe_float(resistances[0], None)
        if r1 is not None and ref < r1 and abs(ref - r1) / max(ref, 1) < 0.003:
            signals.append({
                "type": "Resistance Retest",
                "bias": "Bearish",
                "title": "Near resistance retest",
                "detail": f"Watching rejection zone near {round2(r1)}"
            })

    if not signals:
        signals.append({
            "type": "Neutral",
            "bias": "Neutral",
            "title": "No strong setup",
            "detail": "Mixed data, wait for confirmation"
        })

    return signals[:6]


def build_options_flow_detector(rows, future):
    if not rows:
        return {
            "marketStructure": {"label": "Neutral", "bias": "Neutral"},
            "dominantOptionEvent": {"label": "Balanced", "bias": "Neutral"},
            "events": []
        }

    total_oi_change = sum(num(r.get("oi_change_total"), 0) for r in rows)
    future_change = num(future.get("change"), 0)

    if future_change > 0 and total_oi_change > 0:
        structure = {"label": "Long Build-up", "bias": "Bullish"}
    elif future_change < 0 and total_oi_change > 0:
        structure = {"label": "Short Build-up", "bias": "Bearish"}
    elif future_change > 0 and total_oi_change < 0:
        structure = {"label": "Short Covering", "bias": "Bullish"}
    elif future_change < 0 and total_oi_change < 0:
        structure = {"label": "Long Unwinding", "bias": "Bearish"}
    else:
        structure = {"label": "Neutral", "bias": "Neutral"}

    total_ce_oich = sum(num(r.get("ce_oich"), 0) for r in rows)
    total_pe_oich = sum(num(r.get("pe_oich"), 0) for r in rows)

    if total_pe_oich > abs(total_ce_oich) and total_pe_oich > 0:
        option_event = {"label": "Put Writing", "bias": "Bullish"}
    elif total_ce_oich > abs(total_pe_oich) and total_ce_oich > 0:
        option_event = {"label": "Call Writing", "bias": "Bearish"}
    elif total_pe_oich < 0 and abs(total_pe_oich) > abs(total_ce_oich):
        option_event = {"label": "Put Unwinding", "bias": "Bearish"}
    elif total_ce_oich < 0 and abs(total_ce_oich) > abs(total_pe_oich):
        option_event = {"label": "Call Unwinding", "bias": "Bullish"}
    else:
        option_event = {"label": "Balanced", "bias": "Neutral"}

    ranked = sorted(rows, key=lambda x: abs(num(x.get("oi_change_total"), 0)), reverse=True)
    events = []

    for r in ranked[:8]:
        ce_oich = num(r.get("ce_oich"), 0)
        pe_oich = num(r.get("pe_oich"), 0)

        if pe_oich > 0 and pe_oich >= abs(ce_oich):
            label = "Put Writing"
            bias = "Bullish"
        elif ce_oich > 0 and ce_oich >= abs(pe_oich):
            label = "Call Writing"
            bias = "Bearish"
        elif pe_oich < 0 and abs(pe_oich) >= abs(ce_oich):
            label = "Put Unwinding"
            bias = "Bearish"
        elif ce_oich < 0 and abs(ce_oich) >= abs(pe_oich):
            label = "Call Unwinding"
            bias = "Bullish"
        else:
            label = "Balanced"
            bias = "Neutral"

        events.append({
            "strike": r["strike"],
            "label": label,
            "bias": bias,
            "ceOIChange": safe_int(ce_oich, 0),
            "peOIChange": safe_int(pe_oich, 0)
        })

    return {
        "marketStructure": structure,
        "dominantOptionEvent": option_event,
        "events": events
    }


def advance_decline(symbol_key, cache_ttl=15):
    cached = get_cached("advance_decline", key=symbol_key, ttl=cache_ttl)
    if cached is not None:
        return cached

    cfg = INDEX_MAP[symbol_key]
    quotes = get_quotes_map(cfg["components"], chunk_size=10, fallback_missing=False)

    advances = 0
    declines = 0
    unchanged = 0
    valid_count = 0

    for s in cfg["components"]:
        q = quotes.get(s) or quotes.get(normalize_symbol_key(s)) or {}
        if not q:
            continue

        chp = get_change_pct_from_quote(q)
        if chp is None:
            continue

        valid_count += 1

        if chp > 0:
            advances += 1
        elif chp < 0:
            declines += 1
        else:
            unchanged += 1

    ratio = None
    if valid_count > 0:
        if declines > 0:
            ratio = round2(advances / declines)
        elif advances > 0:
            ratio = round2(float(advances))
        else:
            ratio = 0.0

    result = {
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "ratio": ratio,
        "total": valid_count
    }

    previous = ((_CACHE.get("advance_decline", {}) or {}).get(symbol_key, {}) or {}).get("data")
    previous_total = safe_int((previous or {}).get("total"), 0)
    if previous_total and valid_count < max(3, previous_total * 0.65):
        return previous

    set_cached("advance_decline", result, key=symbol_key)
    return result


def fast_sector_index_strength():
    symbols = list(SECTOR_INDEX_SYMBOLS.values())
    quotes = get_quotes_map(symbols, chunk_size=16, fallback_missing=False)

    sectors = []
    for name, symbol in SECTOR_INDEX_SYMBOLS.items():
        q = quotes.get(symbol) or quotes.get(normalize_symbol_key(symbol)) or {}
        chp = get_change_pct_from_quote(q) if q else None

        advances = 1 if chp is not None and chp > 0 else 0
        declines = 1 if chp is not None and chp < 0 else 0
        unchanged = 1 if chp is not None and chp == 0 else 0
        valid_count = 1 if chp is not None else 0

        if chp is None:
            status = "Neutral"
        elif chp > 0.05:
            status = "Improving"
        elif chp < -0.05:
            status = "Weak"
        else:
            status = "Neutral"

        sectors.append({
            "name": name,
            "symbol": symbol,
            "change_pct": round2(chp),
            "ltp": round2(q.get("lp", q.get("ltp", None))) if q else None,
            "change": round2(q.get("ch", q.get("change", None))) if q else None,
            "stocks_count": 1,
            "valid_count": valid_count,
            "missing_count": 0 if valid_count else 1,
            "coverage_pct": 100.0 if valid_count else 0.0,
            "incomplete": not bool(valid_count),
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "total": valid_count,
            "quoted_total": valid_count,
            "adv_pct": 100.0 if advances else 0.0,
            "dec_pct": 100.0 if declines else 0.0,
            "unch_pct": 100.0 if unchanged else 0.0,
            "ad_ratio": float(advances) if advances else 0.0,
            "status": status,
            "source": "sector_index",
        })

    valid_total = sum(safe_int(item.get("valid_count"), 0) for item in sectors)
    if valid_total < 8:
        return []

    sectors.sort(key=lambda x: num(x.get("change_pct"), -999999), reverse=True)
    return sectors


def sector_strength(cache_ttl=3):
    cached = get_cached("sector_strength", ttl=cache_ttl)
    if cached is not None:
        return cached

    fast_sectors = fast_sector_index_strength()
    if fast_sectors:
        set_cached("sector_strength", fast_sectors)
        return fast_sectors

    all_symbols = []
    for sector_data in SECTOR_STOCKS.values():
        all_symbols.extend(sector_data["symbols"])

    all_symbols = unique_symbols(all_symbols)
    quotes = get_quotes_map(all_symbols, chunk_size=10, fallback_missing=False)

    sectors = []
    for sector_key, sector_data in SECTOR_STOCKS.items():
        syms = sector_data["symbols"]
        total_count = len(syms)

        valid_changes = []
        advances = 0
        declines = 0
        unchanged = 0

        for s in syms:
            q = quotes.get(s) or quotes.get(normalize_symbol_key(s)) or {}
            if not q:
                continue

            chp = get_change_pct_from_quote(q)
            if chp is None:
                continue

            valid_changes.append(chp)

            if chp > 0:
                advances += 1
            elif chp < 0:
                declines += 1
            else:
                unchanged += 1

        valid_count = len(valid_changes)
        missing_count = max(total_count - valid_count, 0)

        coverage_pct = round2((valid_count / total_count) * 100) if total_count else 0
        avg = round2(sum(valid_changes) / valid_count) if valid_count else None

        if declines > 0:
            ad_ratio = round2(advances / declines)
        elif advances > 0:
            ad_ratio = round2(float(advances))
        else:
            ad_ratio = 0.0

        adv_pct = round2((advances / total_count) * 100) if total_count > 0 else 0
        dec_pct = round2((declines / total_count) * 100) if total_count > 0 else 0
        unch_pct = round2((unchanged / total_count) * 100) if total_count > 0 else 0

        if avg is None:
            status = "Neutral"
        elif avg > 0.05:
            status = "Improving"
        elif avg < -0.05:
            status = "Weak"
        else:
            status = "Neutral"

        sectors.append({
            "name": sector_data.get("label", sector_key),
            "change_pct": avg,
            "stocks_count": total_count,
            "valid_count": valid_count,
            "missing_count": missing_count,
            "coverage_pct": coverage_pct,
            "incomplete": coverage_pct < 70,
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "total": total_count,
            "quoted_total": valid_count,
            "adv_pct": adv_pct,
            "dec_pct": dec_pct,
            "unch_pct": unch_pct,
            "ad_ratio": ad_ratio,
            "status": status,
        })

    sectors.sort(key=lambda x: num(x.get("change_pct"), -999999), reverse=True)

    previous = (_CACHE.get("sector_strength", {}) or {}).get("data") or []
    previous_valid = sum(safe_int((sector or {}).get("valid_count"), 0) for sector in previous)
    current_valid = sum(safe_int((sector or {}).get("valid_count"), 0) for sector in sectors)
    if previous_valid and current_valid < max(10, previous_valid * 0.65):
        return previous

    set_cached("sector_strength", sectors)
    return sectors


def sector_stock_rows(sector_name="", cache_ttl=3):
    sector_text = str(sector_name or "").strip().lower()
    matched_key = ""
    matched_sector = None
    for sector_key, sector_data in SECTOR_STOCKS.items():
        names = {str(sector_key).lower(), str(sector_data.get("label", sector_key)).lower()}
        if not sector_text or sector_text in names:
            matched_key = sector_key
            matched_sector = sector_data
            break
    if matched_sector is None:
        first_key = next(iter(SECTOR_STOCKS.keys()), "")
        matched_key = first_key
        matched_sector = SECTOR_STOCKS.get(first_key, {})

    cache_key = matched_key or "sector"
    cached = get_cached("sector_stock_rows", key=cache_key, ttl=cache_ttl)
    if cached is not None:
        return cached

    symbols = unique_symbols(matched_sector.get("symbols", []))
    quotes = get_quotes_map(symbols, chunk_size=30, fallback_missing=False)
    rows = []
    for symbol in symbols:
        q = quotes.get(symbol) or quotes.get(normalize_symbol_key(symbol)) or {}
        metrics = extract_quote_metrics(q) if q else {}
        change_pct = get_change_pct_from_quote(q) if q else None
        change = safe_float(metrics.get("change"), None)
        ltp = safe_float(metrics.get("ltp"), None)
        prev_close = safe_float(metrics.get("prev_close"), None)
        if change is None and ltp is not None and prev_close not in (None, 0):
            change = round2(ltp - prev_close)
        row_symbol = symbol.replace("NSE:", "").replace("-EQ", "")
        rows.append({
            "symbol": row_symbol,
            "fyersSymbol": symbol,
            "ltp": ltp,
            "open": metrics.get("open"),
            "high": metrics.get("high"),
            "low": metrics.get("low"),
            "close": metrics.get("close") if metrics.get("close") is not None else prev_close,
            "prevClose": prev_close,
            "change": round2(change),
            "change_pct": round2(change_pct),
            "volume": metrics.get("volume"),
            "status": "Live" if ltp is not None else "No Quote",
        })

    rows.sort(key=lambda row: safe_float(row.get("change_pct"), -999999), reverse=True)
    result = {
        "sector": matched_sector.get("label", matched_key),
        "sectorKey": matched_key,
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        "total": len(symbols),
        "quoted": len([row for row in rows if row.get("ltp") is not None]),
        "rows": rows,
    }
    set_cached("sector_stock_rows", result, key=cache_key)
    return result


def local_fo_universe_symbols():
    symbols = []
    for cfg in INDEX_MAP.values():
        symbols.extend(cfg.get("components", []))
    for sector_data in SECTOR_STOCKS.values():
        symbols.extend(sector_data.get("symbols", []))
    return unique_symbols(symbols)


def nse_request_headers():
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/market-data/live-equity-market",
        "Connection": "keep-alive",
    }


def get_fo_universe(cache_ttl=6 * 60 * 60):
    cached = get_cached("fo_symbols", ttl=cache_ttl)
    if cached and cached.get("symbols"):
        return cached

    local_symbols = local_fo_universe_symbols()
    result = {
        "symbols": local_symbols,
        "source": "local_sector_fo_proxy",
        "label": "Local F&O proxy",
        "official": False,
    }

    try:
        session = requests.Session()
        headers = nse_request_headers()
        try:
            session.get("https://www.nseindia.com/", headers=headers, timeout=8)
        except Exception:
            pass

        resp = session.get(
            "https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O",
            headers=headers,
            timeout=12,
        )
        if resp.status_code == 200:
            payload = resp.json() or {}
            raw_rows = payload.get("data") or []
            official_symbols = []
            for row in raw_rows:
                sym = str((row or {}).get("symbol") or "").strip().upper()
                if not sym or sym in {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"}:
                    continue
                official_symbols.append(f"NSE:{sym}-EQ")
            official_symbols = unique_symbols(official_symbols)
            if len(official_symbols) >= 50:
                result = {
                    "symbols": official_symbols,
                    "source": "nse_securities_in_fo",
                    "label": "NSE F&O universe",
                    "official": True,
                }
    except Exception as e:
        print("get_fo_universe error:", e)

    set_cached("fo_symbols", result)
    return result


def get_active_future_suffix():
    now = datetime.now()

    def last_tuesday(year, month):
        cursor = datetime(year, month, 28)
        while True:
            try:
                cursor = cursor.replace(day=cursor.day + 1)
            except ValueError:
                cursor = cursor.replace(day=cursor.day)
                break
        while cursor.weekday() != 1:
            cursor -= timedelta(days=1)
        return cursor

    expiry = last_tuesday(now.year, now.month).replace(hour=15, minute=30, second=0, microsecond=0)
    contract_month = now.month
    contract_year = now.year
    if now > expiry:
        contract_month += 1
        if contract_month > 12:
            contract_month = 1
            contract_year += 1

    month_code = datetime(contract_year, contract_month, 1).strftime("%b").upper()
    return f"{str(contract_year)[-2:]}{month_code}FUT"


def equity_to_stock_future_symbol(symbol):
    text = str(symbol or "").strip().upper()
    if not text:
        return ""
    if text.startswith("NSE:"):
        text = text[4:]
    base = text.replace("-EQ", "")
    return f"NSE:{base}{get_active_future_suffix()}"


def fo_breadth(cache_ttl=20):
    cached = get_cached("fo_breadth", ttl=cache_ttl)
    if cached is not None:
        return cached

    universe = get_fo_universe()
    symbols = universe.get("symbols") or []
    quotes = get_quotes_map(symbols, chunk_size=10, fallback_missing=True)
    future_symbols = unique_symbols([equity_to_stock_future_symbol(symbol) for symbol in symbols])
    future_quotes = get_quotes_map(future_symbols, chunk_size=10, fallback_missing=False) if future_symbols else {}

    advances = 0
    declines = 0
    unchanged = 0
    valid_count = 0
    movers = []

    for symbol in symbols:
        q = quotes.get(symbol) or quotes.get(normalize_symbol_key(symbol)) or {}
        chp = get_change_pct_from_quote(q)
        if chp is not None:
            valid_count += 1
            if chp > 0:
                advances += 1
            elif chp < 0:
                declines += 1
            else:
                unchanged += 1

        metrics = extract_quote_metrics(q) if q else {}
        future_symbol = equity_to_stock_future_symbol(symbol)
        fq = future_quotes.get(future_symbol) or future_quotes.get(normalize_symbol_key(future_symbol)) or {}
        future_metrics = extract_quote_metrics(fq) if fq else {}
        future_chp = get_change_pct_from_quote(fq) if fq else None
        
        cached_oi_data = _FUTURE_OI_CACHE.get(future_symbol) or _FUTURE_OI_CACHE.get(normalize_symbol_key(future_symbol)) or {}
        oi = cached_oi_data.get("oi")
        oi_change = None
        if oi is not None and cached_oi_data.get("pdoi") is not None:
            oi_change = oi - cached_oi_data.get("pdoi")
        intraday_change_pct = None
        if metrics.get("ltp") is not None and metrics.get("open"):
            intraday_change_pct = pct_change(metrics.get("ltp"), metrics.get("open"))

        movers.append({
            "symbol": symbol.replace("NSE:", "").replace("-EQ", ""),
            "label": symbol.replace("NSE:", "").replace("-EQ", ""),
            "fyersSymbol": symbol,
            "futureSymbol": future_symbol,
            "change_pct": round2(chp),
            "actionChangePct": round2(future_chp if future_chp is not None else chp),
            "intraday_change_pct": round2(intraday_change_pct if intraday_change_pct is not None else chp),
            "ltp": metrics.get("ltp"),
            "futureLtp": future_metrics.get("ltp"),
            "futureChange": future_metrics.get("change"),
            "futureChangePct": round2(future_chp),
            "open": metrics.get("open"),
            "high": metrics.get("high"),
            "low": metrics.get("low"),
            "close": metrics.get("close") if metrics.get("close") is not None else metrics.get("prev_close"),
            "prevClose": metrics.get("prev_close"),
            "volume": metrics.get("volume"),
            "futureVolume": future_metrics.get("volume"),
            "oi": oi,
            "oiChange": oi_change,
            "status": "Live" if metrics.get("ltp") is not None else "No Quote",
        })

    total = advances + declines + unchanged
    ratio = None
    if declines > 0:
        ratio = round2(advances / declines)
    elif advances > 0:
        ratio = round2(float(advances))
    elif total:
        ratio = 0.0

    universe_total = len(symbols)
    net = advances - declines
    net_pct = round2((net / total) * 100) if total else None
    adv_pct = round2((advances / total) * 100) if total else None
    dec_pct = round2((declines / total) * 100) if total else None
    coverage_pct = round2((valid_count / universe_total) * 100) if universe_total else 0

    sector_rows = []
    symbol_set = set(symbols)
    for sector_key, sector_data in SECTOR_STOCKS.items():
        sector_symbols = [s for s in sector_data.get("symbols", []) if s in symbol_set]
        if not sector_symbols:
            continue
        s_adv = s_dec = s_unch = s_valid = 0
        for s in sector_symbols:
            q = quotes.get(s) or quotes.get(normalize_symbol_key(s)) or {}
            chp = get_change_pct_from_quote(q) if q else None
            if chp is None:
                continue
            s_valid += 1
            if chp > 0:
                s_adv += 1
            elif chp < 0:
                s_dec += 1
            else:
                s_unch += 1
        if not s_valid:
            continue
        sector_rows.append({
            "name": sector_data.get("label", sector_key),
            "advances": s_adv,
            "declines": s_dec,
            "unchanged": s_unch,
            "total": s_valid,
            "net": s_adv - s_dec,
            "netPct": round2(((s_adv - s_dec) / s_valid) * 100) if s_valid else None,
        })

    sector_rows.sort(key=lambda row: row.get("netPct") if row.get("netPct") is not None else -999, reverse=True)
    movers_sorted = sorted(movers, key=lambda row: safe_float(row.get("change_pct"), 0), reverse=True)
    intraday_sorted = sorted(movers, key=lambda row: safe_float(row.get("intraday_change_pct"), 0), reverse=True)
    oi_rows = [row for row in movers if safe_float(row.get("oiChange"), None) is not None]
    long_build_up = sorted(
        [row for row in oi_rows if safe_float(row.get("actionChangePct"), 0) > 0 and safe_float(row.get("oiChange"), 0) > 0],
        key=lambda row: abs(safe_float(row.get("oiChange"), 0)),
        reverse=True,
    )[:8]
    short_build_up = sorted(
        [row for row in oi_rows if safe_float(row.get("actionChangePct"), 0) < 0 and safe_float(row.get("oiChange"), 0) > 0],
        key=lambda row: abs(safe_float(row.get("oiChange"), 0)),
        reverse=True,
    )[:8]
    short_covering = sorted(
        [row for row in oi_rows if safe_float(row.get("actionChangePct"), 0) > 0 and safe_float(row.get("oiChange"), 0) < 0],
        key=lambda row: abs(safe_float(row.get("oiChange"), 0)),
        reverse=True,
    )[:8]
    long_unwinding = sorted(
        [row for row in oi_rows if safe_float(row.get("actionChangePct"), 0) < 0 and safe_float(row.get("oiChange"), 0) < 0],
        key=lambda row: abs(safe_float(row.get("oiChange"), 0)),
        reverse=True,
    )[:8]

    result = {
        "source": universe.get("source"),
        "label": universe.get("label"),
        "official": bool(universe.get("official")),
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "total": total,
        "quotedTotal": valid_count,
        "universeTotal": universe_total,
        "missing": max(universe_total - valid_count, 0),
        "coveragePct": coverage_pct,
        "ratio": ratio,
        "adRatio": ratio,
        "advPct": adv_pct,
        "decPct": dec_pct,
        "net": net,
        "netPct": net_pct,
        "topAdvancers": movers_sorted[:12],
        "topDecliners": list(reversed(movers_sorted[-12:])),
        "topIntradayGainers": intraday_sorted[:12],
        "topIntradayLosers": list(reversed(intraday_sorted[-12:])),
        "stocks": sorted(movers, key=lambda row: str(row.get("symbol") or "")),
        "oiAction": {
            "longBuildUp": long_build_up,
            "shortBuildUp": short_build_up,
            "shortCovering": short_covering,
            "longUnwinding": long_unwinding,
            "available": bool(oi_rows),
            "source": "stock_futures",
            "futureSuffix": get_active_future_suffix(),
            "requestedCount": len(future_symbols),
            "futureQuoteCount": len([value for value in future_quotes.values() if value]),
            "availableCount": len(oi_rows),
        },
        "sectors": sector_rows[:10],
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
    }

    previous = (_CACHE.get("fo_breadth", {}) or {}).get("data")
    previous_total = safe_int((previous or {}).get("total"), 0)
    if previous_total and total < max(30, previous_total * 0.65):
        return previous

    set_cached("fo_breadth", result)
    return result


def stock_options_quick_scan(cache_ttl=2):
    cached = get_cached("stock_options_quick_scan", ttl=cache_ttl)
    if cached is not None:
        return cached

    universe = get_fo_universe()
    symbols = universe.get("symbols") or []
    quotes = get_quotes_map(symbols, chunk_size=10, fallback_missing=True)
    rows = []
    advances = declines = unchanged = valid_count = 0

    for symbol in symbols:
        q = quotes.get(symbol) or quotes.get(normalize_symbol_key(symbol)) or {}
        metrics = extract_quote_metrics(q) if q else {}
        chp = get_change_pct_from_quote(q) if q else None
        if chp is not None:
            valid_count += 1
            if chp > 0:
                advances += 1
            elif chp < 0:
                declines += 1
            else:
                unchanged += 1

        intraday_change_pct = None
        if metrics.get("ltp") is not None and metrics.get("open"):
            intraday_change_pct = pct_change(metrics.get("ltp"), metrics.get("open"))

        row_symbol = symbol.replace("NSE:", "").replace("-EQ", "")
        rows.append({
            "symbol": row_symbol,
            "label": row_symbol,
            "fyersSymbol": symbol,
            "futureSymbol": equity_to_stock_future_symbol(symbol),
            "change_pct": round2(chp),
            "actionChangePct": round2(chp),
            "intraday_change_pct": round2(intraday_change_pct if intraday_change_pct is not None else chp),
            "ltp": metrics.get("ltp"),
            "open": metrics.get("open"),
            "high": metrics.get("high"),
            "low": metrics.get("low"),
            "close": metrics.get("close") if metrics.get("close") is not None else metrics.get("prev_close"),
            "prevClose": metrics.get("prev_close"),
            "volume": metrics.get("volume"),
            "status": "Live" if metrics.get("ltp") is not None else "No Quote",
        })

    total = advances + declines + unchanged
    universe_total = len(symbols)
    result = {
        "source": universe.get("source"),
        "label": universe.get("label"),
        "official": bool(universe.get("official")),
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "total": total,
        "quotedTotal": valid_count,
        "universeTotal": universe_total,
        "missing": max(universe_total - valid_count, 0),
        "coveragePct": round2((valid_count / universe_total) * 100) if universe_total else 0,
        "stocks": sorted(rows, key=lambda row: str(row.get("symbol") or "")),
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
    }

    previous = (_CACHE.get("stock_options_quick_scan", {}) or {}).get("data")
    previous_total = safe_int((previous or {}).get("total"), 0)
    if previous_total and total < max(30, previous_total * 0.65):
        return previous

    set_cached("stock_options_quick_scan", result)
    return result


def normalize_stock_option_symbol(symbol):
    text = str(symbol or "").strip().upper()
    if not text:
        return ""
    if text.startswith("NSE:"):
        text = text[4:]
    text = text.replace("-EQ", "")
    text = re.sub(r"[^A-Z0-9&-]", "", text)
    return f"NSE:{text}-EQ" if text else ""


def classify_stock_future_action(change_pct, oi_change):
    chp = safe_float(change_pct, None)
    oi_ch = safe_float(oi_change, None)
    if chp is None:
        return {"label": "Quote Waiting", "tone": "warning", "side": "", "detail": "Stock quote not ready"}
    if oi_ch is None:
        if chp > 0:
            return {"label": "Price Up", "tone": "success", "side": "CE", "detail": "Price is up; future OI not ready"}
        if chp < 0:
            return {"label": "Price Down", "tone": "error", "side": "PE", "detail": "Price is down; future OI not ready"}
        return {"label": "Flat", "tone": "warning", "side": "", "detail": "No clear stock move"}
    if chp > 0 and oi_ch > 0:
        return {"label": "Long Build", "tone": "success", "side": "CE", "detail": "Price up with OI addition"}
    if chp < 0 and oi_ch > 0:
        return {"label": "Short Build", "tone": "error", "side": "PE", "detail": "Price down with OI addition"}
    if chp > 0 and oi_ch < 0:
        return {"label": "Short Covering", "tone": "success", "side": "CE", "detail": "Price up with OI reduction"}
    if chp < 0 and oi_ch < 0:
        return {"label": "Long Unwinding", "tone": "error", "side": "PE", "detail": "Price down with OI reduction"}
    return {"label": "No Clear OI", "tone": "warning", "side": "", "detail": "OI is flat"}


def build_stock_option_signal(quote, future_quote, chain):
    q = quote or {}
    fq = future_quote or {}
    price = safe_float(q.get("ltp"), None)
    open_price = safe_float(q.get("open"), None)
    high = safe_float(q.get("high"), None)
    low = safe_float(q.get("low"), None)
    change_pct = safe_float(q.get("change_pct"), None)
    future_change_pct = safe_float(fq.get("change_pct"), change_pct)
    oi = safe_float(fq.get("oi"), None)
    pdoi = safe_float(fq.get("pdoi"), None)
    oi_change = None if oi is None or pdoi is None else oi - pdoi
    action = classify_stock_future_action(future_change_pct, oi_change)
    quote_live = price is not None
    future_live = safe_float(fq.get("ltp"), None) is not None
    chain_live = bool(chain)
    future_oi_live = oi_change is not None

    total_call_oi = sum(num_int(row.get("ce_oi"), 0) for row in chain or [])
    total_put_oi = sum(num_int(row.get("pe_oi"), 0) for row in chain or [])
    total_call_oich = sum(num_int(row.get("ce_oich"), 0) for row in chain or [])
    total_put_oich = sum(num_int(row.get("pe_oich"), 0) for row in chain or [])
    pcr = round2(total_put_oi / total_call_oi) if total_call_oi else None
    oi_side = ""
    if total_put_oich > total_call_oich * 1.08:
        oi_side = "CE"
    elif total_call_oich > total_put_oich * 1.08:
        oi_side = "PE"

    day_range = high - low if high is not None and low is not None else None
    from_open_pct = pct_change(price, open_price) if price is not None and open_price not in (None, 0) else None
    near_high = bool(price is not None and high is not None and day_range and (high - price) <= max(day_range * 0.22, price * 0.002))
    near_low = bool(price is not None and low is not None and day_range and (price - low) <= max(day_range * 0.22, price * 0.002))

    scores = {"CE": 0, "PE": 0}
    reasons = {"CE": [], "PE": []}

    def add(side, points, reason):
        if side in scores and points:
            scores[side] += points
            reasons[side].append(reason)

    if change_pct is not None:
        if change_pct >= 0.45:
            add("CE", 2, "stock price up")
        elif change_pct <= -0.45:
            add("PE", 2, "stock price down")
    if from_open_pct is not None:
        if from_open_pct >= 0.25:
            add("CE", 1, "above open")
        elif from_open_pct <= -0.25:
            add("PE", 1, "below open")
    if action.get("side"):
        add(action.get("side"), 2, action.get("label"))
    if oi_side:
        add(oi_side, 1, "option OI supports")
    if near_high:
        add("CE", 1, "near day high")
    if near_low:
        add("PE", 1, "near day low")

    side = "CE" if scores["CE"] > scores["PE"] else "PE" if scores["PE"] > scores["CE"] else ""
    edge = scores.get(side, 0) - scores.get("PE" if side == "CE" else "CE", 0) if side else 0
    ready = bool(side and scores[side] >= 4 and edge >= 1.5)
    watch = bool(side and scores[side] >= 3 and edge >= 1)
    if ready:
        label = f"{side} Ready"
        tone = "success"
        reason = ", ".join(reasons[side][:3])
    elif watch:
        label = f"{side} Watch"
        tone = "warning"
        reason = ", ".join(reasons[side][:3])
    else:
        label = "Wait"
        tone = "warning"
        reason = "Need price, future OI and option OI to match"

    if not quote_live:
        side = ""
        ready = False
        watch = False
        label = "Avoid"
        tone = "error"
        reason = "Stock quote is not live"
    elif not chain_live:
        side = ""
        ready = False
        watch = False
        label = "Avoid"
        tone = "error"
        reason = "Option chain is not live"

    effective_side = side or action.get("side") or oi_side
    selected_option = None
    if effective_side in ("CE", "PE") and price is not None and chain:
        ltp_key = "ce_ltp" if effective_side == "CE" else "pe_ltp"
        volume_key = "ce_volume" if effective_side == "CE" else "pe_volume"
        oi_key = "ce_oi" if effective_side == "CE" else "pe_oi"
        oich_key = "ce_oich" if effective_side == "CE" else "pe_oich"
        candidates = [
            row for row in chain
            if safe_float(row.get("strike"), None) is not None and safe_float(row.get(ltp_key), None) is not None
        ]
        candidates.sort(key=lambda row: (
            abs(safe_float(row.get("strike"), 0) - price),
            -safe_float(row.get(volume_key), 0),
        ))
        if candidates:
            row = candidates[0]
            selected_option = {
                "side": effective_side,
                "strike": row.get("strike"),
                "premium": row.get(ltp_key),
                "volume": row.get(volume_key),
                "oi": row.get(oi_key),
                "oiChange": row.get(oich_key),
            }

    conditions = [
        {"key": "quote", "label": "Stock quote live", "passed": quote_live, "detail": "Needed for any trade"},
        {"key": "chain", "label": "Option chain live", "passed": chain_live, "detail": f"{len(chain or [])} rows"},
        {"key": "future", "label": "Future price live", "passed": future_live, "detail": "Needed for stock futures direction"},
        {"key": "futureOi", "label": "Future OI live", "passed": future_oi_live, "detail": action.get("label")},
        {"key": "open", "label": "Price vs open", "passed": bool((side == "CE" and from_open_pct is not None and from_open_pct >= 0.25) or (side == "PE" and from_open_pct is not None and from_open_pct <= -0.25)), "detail": f"From open {round2(from_open_pct)}%"},
        {"key": "level", "label": "Near day level", "passed": bool((side == "CE" and near_high) or (side == "PE" and near_low)), "detail": "CE near high, PE near low"},
        {"key": "optionOi", "label": "Option OI supports", "passed": bool(side and oi_side == side), "detail": f"OI side {oi_side or 'mixed'}"},
        {"key": "premium", "label": "Premium selectable", "passed": bool(selected_option and safe_float(selected_option.get("premium"), None) not in (None, 0)), "detail": f"{effective_side or '-'} premium ready"},
    ]
    blockers = [item["label"] for item in conditions if not item.get("passed")]

    return {
        "side": side if ready or watch else "",
        "label": label,
        "tone": tone,
        "reason": reason,
        "ready": ready,
        "watch": watch,
        "scores": scores,
        "futureAction": action,
        "dataStatus": {
            "quoteLive": quote_live,
            "futureLive": future_live,
            "futureOiLive": future_oi_live,
            "optionChainLive": chain_live,
        },
        "conditions": conditions,
        "blockers": blockers,
        "selectedOption": selected_option,
        "pcr": pcr,
        "oiSide": oi_side,
        "callOi": total_call_oi,
        "putOi": total_put_oi,
        "callOiChange": total_call_oich,
        "putOiChange": total_put_oich,
        "fromOpenPct": round2(from_open_pct),
        "nearHigh": near_high,
        "nearLow": near_low,
    }


def build_stock_option_levels(quote, chain):
    q = quote or {}
    rows = chain or []
    spot_price = safe_float(q.get("ltp"), None)
    levels = top_levels(rows, spot_price)
    by_strike = {
        safe_float(row.get("strike"), None): row
        for row in rows
        if safe_float(row.get("strike"), None) is not None
    }

    def decorate(strike, side):
        row = by_strike.get(safe_float(strike, None)) or {}
        if side == "support":
            oi = num_int(row.get("pe_oi"), 0)
            oich = num_int(row.get("pe_oich"), 0)
            volume = num_int(row.get("pe_volume"), 0)
            source = "Put OI and volume"
        else:
            oi = num_int(row.get("ce_oi"), 0)
            oich = num_int(row.get("ce_oich"), 0)
            volume = num_int(row.get("ce_volume"), 0)
            source = "Call OI and volume"
        distance = None if spot_price is None or strike is None else round2(safe_float(strike, 0) - spot_price)
        return {
            "price": strike,
            "strike": strike,
            "type": side,
            "label": "Strong Support" if side == "support" else "Strong Resistance",
            "source": source,
            "oi": oi,
            "oiChange": oich,
            "volume": volume,
            "distance": distance,
        }

    supports = [decorate(level, "support") for level in levels.get("supports", []) if level is not None]
    resistances = [decorate(level, "resistance") for level in levels.get("resistances", []) if level is not None]

    def fallback_levels(side):
        strike_rows = [row for row in rows if safe_float(row.get("strike"), None) is not None]
        if not strike_rows:
            return []
        strikes = sorted(safe_float(row.get("strike"), 0) for row in strike_rows)
        reference = spot_price if spot_price is not None else strikes[len(strikes) // 2]
        if side == "support":
            candidates = [row for row in strike_rows if safe_float(row.get("strike"), 0) <= reference]
        else:
            candidates = [row for row in strike_rows if safe_float(row.get("strike"), 0) >= reference]
        if not candidates:
            candidates = strike_rows

        max_distance = max(abs(reference or 0) * 0.02, 1)

        def totals(row):
            oi = num_int(row.get("ce_oi"), 0) + num_int(row.get("pe_oi"), 0)
            oich = max(num_int(row.get("ce_oich"), 0), 0) + max(num_int(row.get("pe_oich"), 0), 0)
            volume = num_int(row.get("ce_volume"), 0) + num_int(row.get("pe_volume"), 0)
            return oi, oich, volume

        max_oi = max([totals(row)[0] for row in candidates] or [1]) or 1
        max_oich = max([totals(row)[1] for row in candidates] or [1]) or 1
        max_volume = max([totals(row)[2] for row in candidates] or [1]) or 1

        def score_row(row):
            strike = safe_float(row.get("strike"), 0)
            oi, oich, volume = totals(row)
            distance_penalty = min(18, (abs(strike - reference) / max_distance) * 18)
            return (oi / max_oi) * 45 + (oich / max_oich) * 35 + (volume / max_volume) * 20 - distance_penalty

        picked = []
        for row in sorted(candidates, key=score_row, reverse=True):
            strike = safe_float(row.get("strike"), None)
            if strike is None or strike in [item["price"] for item in picked]:
                continue
            oi, oich, volume = totals(row)
            picked.append({
                "price": strike,
                "strike": strike,
                "type": side,
                "label": "Strong Support" if side == "support" else "Strong Resistance",
                "source": "Available option OI and volume",
                "oi": oi,
                "oiChange": oich,
                "volume": volume,
                "distance": None if spot_price is None else round2(strike - spot_price),
            })
            if len(picked) == 3:
                break
        return picked

    if not supports:
        supports = sorted(fallback_levels("support"), key=lambda item: safe_float(item.get("price"), 0), reverse=True)
    if not resistances:
        resistances = sorted(fallback_levels("resistance"), key=lambda item: safe_float(item.get("price"), 0))

    chart_levels = [
        *[{**item, "tone": "support", "isStrong": True} for item in supports],
        *[{**item, "tone": "resistance", "isStrong": True} for item in resistances],
    ]
    vwap = clean_vwap_for_price(safe_float(q.get("vwap"), None), spot_price, max_distance_pct=4)
    return {
        "supports": supports,
        "resistances": resistances,
        "chartLevels": chart_levels,
        "putWall": levels.get("put_wall"),
        "callWall": levels.get("call_wall"),
        "gammaLevels": levels.get("gamma_levels", []),
        "dayOpen": q.get("open"),
        "dayHigh": q.get("high"),
        "dayLow": q.get("low"),
        "prevClose": q.get("prev_close"),
        "vwap": round2(vwap),
        "spot": spot_price,
    }


def build_stock_options_detail(symbol, cache_ttl=8):
    stock_symbol = normalize_stock_option_symbol(symbol)
    if not stock_symbol:
        return {"error": "Stock symbol is required", "symbol": symbol}
    cache_key = stock_symbol
    cached = get_cached("stock_options_detail", key=cache_key, ttl=cache_ttl)
    if cached is not None:
        return cached

    future_symbol = equity_to_stock_future_symbol(stock_symbol)
    quotes = get_quotes_map([stock_symbol, future_symbol], chunk_size=2, fallback_missing=True)
    raw_quote = quotes.get(stock_symbol) or quotes.get(normalize_symbol_key(stock_symbol)) or {}
    raw_future = quotes.get(future_symbol) or quotes.get(normalize_symbol_key(future_symbol)) or {}
    quote = extract_quote_metrics(raw_quote) if raw_quote else {}
    future_quote = extract_quote_metrics(raw_future) if raw_future else {}
    quote["change_pct"] = round2(get_change_pct_from_quote(raw_quote))
    future_quote["change_pct"] = round2(get_change_pct_from_quote(raw_future))
    cached_oi_data = _FUTURE_OI_CACHE.get(future_symbol) or _FUTURE_OI_CACHE.get(normalize_symbol_key(future_symbol)) or {}
    if cached_oi_data:
        future_quote["oi"] = cached_oi_data.get("oi")
        future_quote["pdoi"] = cached_oi_data.get("pdoi")
        if cached_oi_data.get("oi") is not None and cached_oi_data.get("pdoi") is not None:
            future_quote["oiChange"] = cached_oi_data.get("oi") - cached_oi_data.get("pdoi")

    spot_price = safe_float(quote.get("ltp"), None)
    raw_chain = get_option_chain_raw([stock_symbol, future_symbol], future_symbol, strikecount=24)
    chain = parse_option_chain(raw_chain, spot_price)
    if chain:
        chain = enrich_chain_with_greeks(chain, spot_price, "NIFTY")
    signal = build_stock_option_signal(quote, future_quote, chain)
    levels = build_stock_option_levels(quote, chain)
    max_pain = compute_max_pain(chain)

    result = {
        "symbol": stock_symbol.replace("NSE:", "").replace("-EQ", ""),
        "fyersSymbol": stock_symbol,
        "futureSymbol": future_symbol,
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        "quote": quote,
        "future": future_quote,
        "spot": {"ltp": quote.get("ltp"), "change": quote.get("change"), "change_pct": quote.get("change_pct"), "vwap": quote.get("vwap")},
        "optionChain": chain,
        "signal": signal,
        "levels": levels,
        "max_pain": max_pain,
        "chainRows": len(chain),
    }
    set_cached("stock_options_detail", result, key=cache_key)
    return result


def get_market_strip_data(force=False, cache_ttl=0.8):
    now = time.time()

    if not force and _MARKET_STRIP_CACHE["items"] and (now - _MARKET_STRIP_CACHE["ts"] < cache_ttl):
        return _MARKET_STRIP_CACHE["items"]

    old_map = {
        item["symbol"]: item
        for item in _MARKET_STRIP_CACHE.get("items", [])
        if isinstance(item, dict) and item.get("symbol")
    }

    try:
        strip_symbols = list(MARKET_STRIP_SYMBOLS.values())
        quotes = get_quotes_map(strip_symbols, chunk_size=10, fallback_missing=False) or {}
    except Exception as e:
        print("get_market_strip_data quote error:", e)
        return _MARKET_STRIP_CACHE["items"]

    items = []
    stamp = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

    for label, symbol in MARKET_STRIP_SYMBOLS.items():
        q = quotes.get(symbol) or quotes.get(normalize_symbol_key(symbol)) or {}
        metrics = extract_quote_metrics(q) or {}
        old = old_map.get(symbol, {})

        ltp = safe_float(metrics.get("ltp"), old.get("ltp"))
        change = safe_float(metrics.get("change"), old.get("change"))
        change_pct = safe_float(metrics.get("change_pct"), old.get("change_pct"))
        prev_close = get_market_strip_prev_close(label, symbol, metrics, old)
        change, change_pct = normalize_market_strip_change(ltp, change, change_pct, prev_close)
        vwap = clean_vwap_for_price(metrics.get("vwap"), ltp)

        items.append({
            "label": label,
            "symbol": symbol,
            "ltp": round2(ltp),
            "change": round2(change),
            "change_pct": round2(change_pct),
            "prev_close": round2(prev_close),
            "vwap": round2(vwap),
            "updated_at": stamp,
        })

    if items:
        _MARKET_STRIP_CACHE["ts"] = now
        _MARKET_STRIP_CACHE["items"] = items

    return _MARKET_STRIP_CACHE["items"]


def get_market_strip_prev_close(label, symbol, metrics=None, old=None):
    metrics = metrics or {}
    old = old or {}
    prev_close = safe_float(
        metrics.get("prev_close"),
        safe_float(old.get("prev_close"), None)
    )
    if prev_close is not None:
        return prev_close

    try:
        levels = get_previous_day_levels(
            symbol,
            cache_key=f"prev_day_strip:{normalize_symbol_key(symbol)}",
            cache_ttl=300,
        ) or {}
        prev_close = safe_float(levels.get("close"), None)
        if prev_close is not None:
            return prev_close
    except Exception as e:
        print(f"market strip prev close error {label}: {e}")

    return None


def normalize_market_strip_change(ltp, change, change_pct, prev_close):
    ltp = safe_float(ltp, None)
    change = safe_float(change, None)
    change_pct = safe_float(change_pct, None)
    prev_close = safe_float(prev_close, None)

    if ltp is None or prev_close in (None, 0):
        return change, change_pct

    return round2(ltp - prev_close), round2(((ltp - prev_close) / prev_close) * 100)


def build_market_strip_from_quotes(quotes, stamp=None):
    old_map = {
        item["symbol"]: item
        for item in _MARKET_STRIP_CACHE.get("items", [])
        if isinstance(item, dict) and item.get("symbol")
    }
    stamp = stamp or datetime.now().strftime("%d-%m-%Y %H:%M:%S")
    items = []

    for label, symbol in MARKET_STRIP_SYMBOLS.items():
        q = quotes.get(symbol) or quotes.get(normalize_symbol_key(symbol)) or {}
        metrics = extract_quote_metrics(q) or {}
        old = old_map.get(symbol, {})

        ltp = safe_float(metrics.get("ltp"), old.get("ltp"))
        change = safe_float(metrics.get("change"), old.get("change"))
        change_pct = safe_float(metrics.get("change_pct"), old.get("change_pct"))
        prev_close = get_market_strip_prev_close(label, symbol, metrics, old)
        change, change_pct = normalize_market_strip_change(ltp, change, change_pct, prev_close)
        vwap = clean_vwap_for_price(metrics.get("vwap"), ltp)

        items.append({
            "label": label,
            "symbol": symbol,
            "ltp": round2(ltp),
            "change": round2(change),
            "change_pct": round2(change_pct),
            "prev_close": round2(prev_close),
            "vwap": round2(vwap),
            "updated_at": stamp,
        })

    if any(safe_float(item.get("ltp"), None) is not None for item in items):
        _MARKET_STRIP_CACHE["ts"] = time.time()
        _MARKET_STRIP_CACHE["items"] = items

    return _MARKET_STRIP_CACHE.get("items", items)


def build_sector_strength_from_quotes(quotes):
    sectors = []
    for name, symbol in SECTOR_INDEX_SYMBOLS.items():
        q = quotes.get(symbol) or quotes.get(normalize_symbol_key(symbol)) or {}
        chp = get_change_pct_from_quote(q) if q else None

        advances = 1 if chp is not None and chp > 0 else 0
        declines = 1 if chp is not None and chp < 0 else 0
        unchanged = 1 if chp is not None and chp == 0 else 0
        valid_count = 1 if chp is not None else 0

        if chp is None:
            status = "Neutral"
        elif chp > 0.05:
            status = "Improving"
        elif chp < -0.05:
            status = "Weak"
        else:
            status = "Neutral"

        sectors.append({
            "name": name,
            "symbol": symbol,
            "change_pct": round2(chp),
            "ltp": round2(q.get("lp", q.get("ltp", None))) if q else None,
            "change": round2(q.get("ch", q.get("change", None))) if q else None,
            "stocks_count": 1,
            "valid_count": valid_count,
            "missing_count": 0 if valid_count else 1,
            "coverage_pct": 100.0 if valid_count else 0.0,
            "incomplete": not bool(valid_count),
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "total": valid_count,
            "quoted_total": valid_count,
            "adv_pct": 100.0 if advances else 0.0,
            "dec_pct": 100.0 if declines else 0.0,
            "unch_pct": 100.0 if unchanged else 0.0,
            "ad_ratio": float(advances) if advances else 0.0,
            "status": status,
            "source": "sector_index",
        })

    valid_total = sum(safe_int(item.get("valid_count"), 0) for item in sectors)
    previous = (_CACHE.get("sector_strength", {}) or {}).get("data") or []
    if valid_total < 8 and previous:
        return previous

    sectors.sort(key=lambda x: num(x.get("change_pct"), -999999), reverse=True)
    if valid_total >= 8:
        set_cached("sector_strength", sectors)
    return sectors


def get_stale_cached(bucket, key=None):
    if key is None:
        return (_CACHE.get(bucket, {}) or {}).get("data")
    return ((_CACHE.get(bucket, {}) or {}).get(key, {}) or {}).get("data")


def advance_decline_snapshot(symbol_key):
    fresh = get_cached("advance_decline", key=symbol_key, ttl=120)
    if fresh is not None:
        return fresh
    stale = get_stale_cached("advance_decline", key=symbol_key)
    if stale is not None:
        return stale
    return {
        "advances": 0,
        "declines": 0,
        "unchanged": 0,
        "ratio": None,
        "total": 0,
    }


def get_fast_home_live_snapshot():
    stamp = datetime.now().strftime("%d-%m-%Y %H:%M:%S")
    symbols = unique_symbols(
        list(MARKET_STRIP_SYMBOLS.values()) +
        [VIX_SYMBOL] +
        list(SECTOR_INDEX_SYMBOLS.values())
    )
    quotes = get_quotes_map(symbols, chunk_size=32, fallback_missing=False)
    market_strip = build_market_strip_from_quotes(quotes, stamp)
    vix_raw = quotes.get(VIX_SYMBOL) or quotes.get(normalize_symbol_key(VIX_SYMBOL)) or {}
    vix = extract_quote_metrics(vix_raw)
    sectors = build_sector_strength_from_quotes(quotes)
    fo = get_cached("fo_breadth", ttl=120) or get_stale_cached("fo_breadth") or {}
    cooldown_seconds = max(0, int(_QUOTE_COOLDOWN_UNTIL - time.time()))

    return {
        "timestamp": stamp,
        "marketStrip": market_strip,
        "vix": vix,
        "sectorStrength": sectors,
        "foBreadth": fo,
        "quoteStatus": {
            "rateLimited": cooldown_seconds > 0,
            "cooldownSeconds": cooldown_seconds,
            "message": "Fyers quote API is rate-limited; showing cached values." if cooldown_seconds > 0 else "",
        },
    }
def enrich_previous_day_levels(levels, current_price=None):
    if not isinstance(levels, dict):
        levels = {}

    prev_open = safe_float(levels.get("open"), None)
    prev_high = safe_float(levels.get("high"), None)
    prev_low = safe_float(levels.get("low"), None)
    prev_close = safe_float(levels.get("close"), None)
    current_price = safe_float(current_price, None)

    pivot = None
    cpr_bottom = None
    cpr_top = None
    cpr_width = None
    r1 = None
    s1 = None
    r2 = None
    s2 = None
    today_position = "Unknown"
    turning_signal = "No clear signal"

    if prev_high is not None and prev_low is not None and prev_close is not None:
        pivot = round2((prev_high + prev_low + prev_close) / 3.0)
        bc = round2((prev_high + prev_low) / 2.0)
        tc = round2((pivot * 2.0) - bc) if pivot is not None else None

        if bc is not None and tc is not None:
            cpr_bottom = round2(min(bc, tc))
            cpr_top = round2(max(bc, tc))

        if cpr_top is not None and cpr_bottom is not None:
            cpr_width = round2(cpr_top - cpr_bottom)

        if pivot is not None:
            r1 = round2((2 * pivot) - prev_low)
            s1 = round2((2 * pivot) - prev_high)
            r2 = round2(pivot + (prev_high - prev_low))
            s2 = round2(pivot - (prev_high - prev_low))

    if current_price is not None:
        if prev_high is not None and current_price > prev_high:
            today_position = "Above Previous Day High"
            turning_signal = "Breakout strength above PDH"
        elif prev_low is not None and current_price < prev_low:
            today_position = "Below Previous Day Low"
            turning_signal = "Breakdown weakness below PDL"
        elif prev_close is not None and current_price > prev_close:
            today_position = "Above Previous Close"
            turning_signal = "Holding above PDC supports bullish recovery"
        elif prev_close is not None and current_price < prev_close:
            today_position = "Below Previous Close"
            turning_signal = "Trading below PDC keeps pressure bearish"
        else:
            today_position = "Inside Previous Day Range"
            turning_signal = "Trading between PDH and PDL"

    if (
        current_price is not None
        and prev_high is not None
        and prev_low is not None
        and prev_close is not None
        and prev_high > 0
        and prev_low > 0
        and prev_close > 0
    ):
        near_high = abs(current_price - prev_high) / prev_high <= 0.0025
        near_low = abs(current_price - prev_low) / prev_low <= 0.0025
        near_close = abs(current_price - prev_close) / prev_close <= 0.0025

        if near_high and current_price <= prev_high:
            turning_signal = "Rejection watch near PDH"
        elif near_low and current_price >= prev_low:
            turning_signal = "Bounce watch near PDL"
        elif near_close:
            turning_signal = "Reaction watch near Previous Close"

    return {
        "open": round2(prev_open),
        "high": round2(prev_high),
        "low": round2(prev_low),
        "close": round2(prev_close),
        "pivot": round2(pivot),
        "cprTop": round2(cpr_top),
        "cprBottom": round2(cpr_bottom),
        "cprWidth": round2(cpr_width),
        "r1": round2(r1),
        "s1": round2(s1),
        "r2": round2(r2),
        "s2": round2(s2),
        "todayPosition": today_position,
        "turningSignal": turning_signal,
    }

def get_previous_day_levels(symbol, fallback_symbol=None, cache_key=None, cache_ttl=300):
    cache_name = cache_key or f"prev_day:{symbol}"
    cached = get_cached("dashboard", key=cache_name, ttl=cache_ttl)
    if cached is not None:
        return cached

    result = {
        "open": None,
        "high": None,
        "low": None,
        "close": None,
    }

    if not fyers:
        return result

    symbols_to_try = unique_symbols([symbol, fallback_symbol])

    for sym in symbols_to_try:
        if not sym:
            continue

        try:
            now_ts = int(time.time())
            from_ts = now_ts - (15 * 24 * 60 * 60)

            payload = {
                "symbol": sym,
                "resolution": "D",
                "date_format": "0",
                "range_from": str(from_ts),
                "range_to": str(now_ts),
                "cont_flag": "1",
            }

            resp = (active_client or fyers).history(payload) or {}
            candles = resp.get("candles", []) or []

            cleaned = []
            for row in candles:
                if not isinstance(row, (list, tuple)) or len(row) < 5:
                    continue

                ts = safe_int(row[0], None)
                o = safe_float(row[1], None)
                h = safe_float(row[2], None)
                l = safe_float(row[3], None)
                c = safe_float(row[4], None)

                if ts is None:
                    continue

                cleaned.append({
                    "ts": ts,
                    "open": round2(o),
                    "high": round2(h),
                    "low": round2(l),
                    "close": round2(c),
                })

            cleaned.sort(key=lambda x: x["ts"])

            if not cleaned:
                continue

            previous_candle = cleaned[-1]
            today = datetime.now().strftime("%Y-%m-%d")
            candle_day = datetime.fromtimestamp(previous_candle["ts"]).strftime("%Y-%m-%d")

            if candle_day == today and len(cleaned) >= 2:
                previous_candle = cleaned[-2]

            result = {
                "open": previous_candle.get("open"),
                "high": previous_candle.get("high"),
                "low": previous_candle.get("low"),
                "close": previous_candle.get("close"),
            }

            if any(v is not None for v in result.values()):
                break

        except Exception as e:
            print(f"get_previous_day_levels error {sym}: {e}")

    set_cached("dashboard", result, key=cache_name)
    return result

def build_home_index_quote_card(symbol_key):
    cfg = INDEX_MAP[symbol_key]

    spot_raw = get_quote_block(cfg["spot"])
    future_raw = get_quote_block(cfg["future"])

    spot = extract_quote_metrics(spot_raw)
    future = extract_quote_metrics(future_raw)

    market_strip_items = get_market_strip_data()
    strip_match = next(
        (
            item
            for item in market_strip_items
            if str(item.get("label", "")).strip().upper() == str(cfg["label"]).strip().upper()
        ),
        {}
    )

    # fallback from market strip when direct spot quote is missing
    if safe_float(spot.get("ltp"), None) is None and strip_match:
        spot = {
            **spot,
            "ltp": round2(strip_match.get("ltp")),
            "change": round2(strip_match.get("change")),
            "change_pct": round2(strip_match.get("change_pct")),
            "high": spot.get("high"),
            "low": spot.get("low"),
            "open": spot.get("open"),
            "prev_close": spot.get("prev_close"),
            "volume": spot.get("volume"),
            "vwap": spot.get("vwap"),
        }

    # if future missing, copy from spot
    if safe_float(future.get("ltp"), None) is None and safe_float(spot.get("ltp"), None) is not None:
        future = {
            **future,
            "ltp": spot.get("ltp"),
            "change": spot.get("change"),
            "change_pct": spot.get("change_pct"),
            "high": spot.get("high"),
            "low": spot.get("low"),
            "open": spot.get("open"),
            "prev_close": spot.get("prev_close"),
            "volume": spot.get("volume"),
            "vwap": spot.get("vwap"),
        }

    future = normalize_future_against_spot(spot, future)

    # if spot OHLC is weak but future has data, copy OHLC from future into spot
    if safe_float(spot.get("open"), None) is None and safe_float(future.get("open"), None) is not None:
        spot["open"] = future.get("open")

    if safe_float(spot.get("high"), None) is None and safe_float(future.get("high"), None) is not None:
        spot["high"] = future.get("high")

    if safe_float(spot.get("low"), None) is None and safe_float(future.get("low"), None) is not None:
        spot["low"] = future.get("low")

    if safe_float(spot.get("prev_close"), None) is None and safe_float(future.get("prev_close"), None) is not None:
        spot["prev_close"] = future.get("prev_close")

    spot_ltp = safe_float(spot.get("ltp"), None)
    future_ltp = safe_float(future.get("ltp"), None)
    spot["vwap"] = round2(clean_vwap_for_price(spot.get("vwap"), spot_ltp))
    if future_ltp is not None:
        future["vwap"] = round2(clean_vwap_for_price(future.get("vwap"), future_ltp))
    history_vwap = get_intraday_history_vwap(symbol_key, spot_ltp or future_ltp)
    if spot.get("vwap") is None and history_vwap is not None:
        spot["vwap"] = round2(history_vwap)
        spot["vwap_source"] = "history_5m"
    if future.get("vwap") is None and history_vwap is not None:
        future["vwap"] = round2(history_vwap)
        future["vwap_source"] = "history_5m"

    previous_day_levels_raw = get_previous_day_levels(
        cfg["spot"],
        fallback_symbol=cfg["future"],
        cache_key=f"prev_day_detail:{symbol_key}"
    ) or {}

    reference_price_for_prev_day = (
        safe_float(spot.get("ltp"), None)
        if safe_float(spot.get("ltp"), None) is not None
        else safe_float(future.get("ltp"), None)
    )

    previous_day_levels_raw = get_previous_day_levels(
        cfg["spot"],
        fallback_symbol=cfg["future"],
        cache_key=f"prev_day_detail:{symbol_key}"
    ) or {}

    if safe_float(previous_day_levels_raw.get("open"), None) is None:
        previous_day_levels_raw["open"] = (
            safe_float(spot.get("open"), None)
            if safe_float(spot.get("open"), None) is not None
            else safe_float(future.get("open"), None)
        )

    if safe_float(previous_day_levels_raw.get("high"), None) is None:
        previous_day_levels_raw["high"] = (
            safe_float(spot.get("high"), None)
            if safe_float(spot.get("high"), None) is not None
            else safe_float(future.get("high"), None)
        )

    if safe_float(previous_day_levels_raw.get("low"), None) is None:
        previous_day_levels_raw["low"] = (
            safe_float(spot.get("low"), None)
            if safe_float(spot.get("low"), None) is not None
            else safe_float(future.get("low"), None)
        )

    if safe_float(previous_day_levels_raw.get("close"), None) is None:
        previous_day_levels_raw["close"] = (
            safe_float(spot.get("prev_close"), None)
            if safe_float(spot.get("prev_close"), None) is not None
            else safe_float(future.get("prev_close"), None)
        )

    reference_price_for_prev_day = (
        safe_float(spot.get("ltp"), None)
        if safe_float(spot.get("ltp"), None) is not None
        else safe_float(future.get("ltp"), None)
    )

    previous_day_levels = enrich_previous_day_levels(
        previous_day_levels_raw,
        current_price=reference_price_for_prev_day
    )

    basis = round2(future_ltp - spot_ltp) if future_ltp is not None and spot_ltp is not None else None
    basis_pct = round2((basis / spot_ltp) * 100) if basis is not None and spot_ltp not in (None, 0) else None

    future["basis"] = basis
    future["basis_pct"] = basis_pct

    bias = "Neutral"
    fut_chg = safe_float(future.get("change_pct"), None)
    spot_chg = safe_float(spot.get("change_pct"), None)
    ref_chg = fut_chg if fut_chg is not None else spot_chg

    if ref_chg is not None:
        if ref_chg >= 0.25:
            bias = "Bullish"
        elif ref_chg <= -0.25:
            bias = "Bearish"

    return {
        "symbol": symbol_key,
        "label": cfg["label"],
        "has_data": (
            safe_float(spot.get("ltp"), None) is not None or
            safe_float(future.get("ltp"), None) is not None
        ),
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        "spot": spot,
        "future": future,
        "quickBias": bias,
        "analytics": {
        "previousDayLevels": previous_day_levels,
"previousDayOpen": previous_day_levels.get("open"),
"previousDayHigh": previous_day_levels.get("high"),
"previousDayLow": previous_day_levels.get("low"),
"previousDayClose": previous_day_levels.get("close"),
"previousDayPivot": previous_day_levels.get("pivot"),
"previousDayCprTop": previous_day_levels.get("cprTop"),
"previousDayCprBottom": previous_day_levels.get("cprBottom"),
"previousDayR1": previous_day_levels.get("r1"),
"previousDayS1": previous_day_levels.get("s1"),
"previousDayR2": previous_day_levels.get("r2"),
"previousDayS2": previous_day_levels.get("s2"),
"previousDayTodayPosition": previous_day_levels.get("todayPosition"),
"previousDayTurningSignal": previous_day_levels.get("turningSignal"),
        },
    }


def strip_labels_for_symbol(symbol_key):
    cfg = INDEX_MAP[symbol_key]
    labels = [cfg.get("label", ""), symbol_key]
    if symbol_key == "BANKNIFTY":
        labels.extend(["NIFTY BANK", "BANKNIFTY", "BANK NIFTY"])
    elif symbol_key == "NIFTY":
        labels.extend(["NIFTY 50", "NIFTY"])
    return {str(label or "").strip().upper() for label in labels if label}


def build_fast_home_index_quote_card(symbol_key, market_strip=None, previous_card=None, future_quote=None):
    cfg = INDEX_MAP[symbol_key]
    previous_card = previous_card or {}
    previous_spot = previous_card.get("spot", {}) if isinstance(previous_card, dict) else {}
    previous_future = previous_card.get("future", {}) if isinstance(previous_card, dict) else {}
    future_metrics = extract_quote_metrics(
        future_quote if future_quote is not None else get_quote_block(cfg["future"])
    )

    labels = strip_labels_for_symbol(symbol_key)
    strip_match = next(
        (
            item
            for item in (market_strip or [])
            if str(item.get("label", "")).strip().upper() in labels
        ),
        {}
    )

    spot = {
        **previous_spot,
        "ltp": round2(strip_match.get("ltp"), previous_spot.get("ltp")),
        "change": round2(strip_match.get("change"), previous_spot.get("change")),
        "change_pct": round2(strip_match.get("change_pct"), previous_spot.get("change_pct")),
        "prev_close": round2(strip_match.get("prev_close"), previous_spot.get("prev_close")),
    }
    spot_ltp = safe_float(spot.get("ltp"), None)
    future_ltp = safe_float(future_metrics.get("ltp"), spot_ltp)
    history_snapshot = get_intraday_history_snapshot(symbol_key, spot_ltp or future_ltp)
    history_ltp = safe_float(history_snapshot.get("ltp"), None)
    if spot_ltp is None and history_ltp is not None:
        spot["ltp"] = round2(history_ltp)
        spot["source"] = "history_5m"
        spot_ltp = history_ltp
    if future_ltp is None and history_ltp is not None:
        future_ltp = history_ltp
    future_vwap = clean_vwap_for_price(future_metrics.get("vwap"), future_ltp or spot_ltp)
    spot_vwap = clean_vwap_for_price(strip_match.get("vwap"), spot_ltp)
    history_vwap = history_snapshot.get("vwap")
    if spot_vwap in (None, 0) and future_vwap not in (None, 0):
        spot_vwap = future_vwap
    if spot_vwap in (None, 0) and history_vwap is not None:
        spot_vwap = history_vwap
    if future_vwap in (None, 0) and history_vwap is not None:
        future_vwap = history_vwap
    spot["vwap"] = round2(spot_vwap)
    spot["vwap_source"] = "history_5m" if spot_vwap == history_vwap and history_vwap not in (None, 0) else "future_atp" if spot_vwap == future_vwap and future_vwap not in (None, 0) else None
    future_basis = round2(future_ltp - spot_ltp) if future_ltp is not None and spot_ltp is not None else 0
    future_basis_pct = round2((future_basis / spot_ltp) * 100) if future_basis is not None and spot_ltp not in (None, 0) else 0
    future = {
        **previous_future,
        "ltp": round2(future_ltp),
        "change": round2(future_metrics.get("change"), previous_future.get("change")),
        "change_pct": round2(future_metrics.get("change_pct"), previous_future.get("change_pct")),
        "vwap": round2(future_vwap),
        "vwap_source": "history_5m" if future_vwap == history_vwap and history_vwap not in (None, 0) else "future_atp" if future_vwap not in (None, 0) else None,
        "basis": future_basis,
        "basis_pct": future_basis_pct,
        "stale_quote_replaced": future_ltp is None,
    }

    ref_chg = safe_float(spot.get("change_pct"), None)
    bias = "Neutral"
    if ref_chg is not None:
        if ref_chg >= 0.25:
            bias = "Bullish"
        elif ref_chg <= -0.25:
            bias = "Bearish"

    previous_analytics = previous_card.get("analytics", {}) if isinstance(previous_card, dict) else {}

    return {
        "symbol": symbol_key,
        "label": cfg["label"],
        "has_data": safe_float(spot.get("ltp"), None) is not None,
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        "spot": spot,
        "future": future,
        "quickBias": bias,
        "analytics": previous_analytics,
    }


def current_index_future_quotes():
    quotes = {}
    for item in ["NIFTY", "BANKNIFTY", "SENSEX"]:
        meta = resolve_active_future(item)
        symbol = meta.get("symbol")
        if not symbol or not meta.get("verified"):
            continue
        block = get_cached_quote_block(symbol) or meta.get("block") or get_stale_quote_block(symbol)
        if block:
            quotes[symbol] = block
            quotes[normalize_symbol_key(symbol)] = block
    return quotes


def build_home_index_analytics_card(symbol_key):
    cfg = INDEX_MAP[symbol_key]

    try:
        spot_raw = get_quote_block(cfg["spot"])
        spot = extract_quote_metrics(spot_raw)
        spot_ltp = safe_float(spot.get("ltp"), None)

        _, chain = get_option_chain_rows_for_index(symbol_key, spot_ltp)

        pcr = compute_pcr(chain)
        max_pain = compute_max_pain(chain)
        straddle = compute_straddle(chain)
        levels = top_levels(chain, spot_ltp)

        # fallback from full dashboard if home analytics chain is weak
        if pcr is None or max_pain is None or not levels.get("supports") or not levels.get("resistances"):
            full_data = build_dashboard(symbol_key, cache_ttl=10)
            full_analytics = (full_data or {}).get("analytics", {}) or {}

            if pcr is None:
                pcr = full_analytics.get("pcr")

            if max_pain is None:
                max_pain = full_analytics.get("maxPain")

            if not straddle or (
                straddle.get("atm_strike") is None and straddle.get("straddle") is None
            ):
                straddle = full_analytics.get("straddle") or straddle

            if not levels.get("supports"):
                levels["supports"] = full_analytics.get("supports") or []

            if not levels.get("resistances"):
                levels["resistances"] = full_analytics.get("resistances") or []

            if levels.get("put_wall") is None:
                levels["put_wall"] = full_analytics.get("putWall")

            if levels.get("call_wall") is None:
                levels["call_wall"] = full_analytics.get("callWall")

        previous_day_levels_raw = get_previous_day_levels(
            cfg["spot"],
            fallback_symbol=cfg["future"],
            cache_key=f"prev_day_detail:{symbol_key}"
        ) or {}
        previous_day_levels = enrich_previous_day_levels(
            previous_day_levels_raw,
            current_price=spot_ltp
        )

        return {
            "symbol": symbol_key,
            "label": cfg["label"],
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "analytics": {
                "pcr": pcr,
                "maxPain": max_pain,
                "straddle": straddle,
                "supports": levels.get("supports") or [],
                "resistances": levels.get("resistances") or [],
                "putWall": levels.get("put_wall"),
                "callWall": levels.get("call_wall"),
                "previousDayLevels": previous_day_levels,
                "previousDayR1": previous_day_levels.get("r1"),
                "previousDayR2": previous_day_levels.get("r2"),
                "previousDayS1": previous_day_levels.get("s1"),
                "previousDayS2": previous_day_levels.get("s2"),
            }
        }

    except Exception as e:
        print(f"build_home_index_analytics_card error for {symbol_key}: {e}")
        return {
            "symbol": symbol_key,
            "label": cfg["label"],
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "analytics": {
                "pcr": None,
                "maxPain": None,
                "straddle": {
                    "atm_strike": None,
                    "straddle": None,
                    "low": None,
                    "high": None,
                },
            }
        }

def build_home_index_card(symbol_key):
    cfg = INDEX_MAP[symbol_key]
    future_meta = resolve_active_future(symbol_key)
    future_symbol = future_meta.get("symbol")

    spot_raw = get_quote_block(cfg["spot"])
    future_raw = (get_quote_block(future_symbol) or future_meta.get("block") or {}) if future_symbol else {}

    spot = extract_quote_metrics(spot_raw)
    future = extract_quote_metrics(future_raw)
    future = normalize_future_against_spot(
        spot, future, source_symbol=future_symbol, verified=bool(future_meta.get("verified")), verification_reason=future_meta.get("reason")
    )

    spot_ltp = safe_float(spot.get("ltp"), None)
    future_ltp = safe_float(future.get("ltp"), None)
    spot["vwap"] = round2(clean_vwap_for_price(spot.get("vwap"), spot_ltp))
    future["vwap"] = round2(clean_vwap_for_price(future.get("vwap"), future_ltp or spot_ltp))
    history_vwap = get_intraday_history_vwap(symbol_key, spot_ltp or future_ltp)
    if spot.get("vwap") is None and history_vwap is not None:
        spot["vwap"] = round2(history_vwap)
        spot["vwap_source"] = "history_5m"

    basis = round2(future_ltp - spot_ltp) if future_ltp is not None and spot_ltp is not None else None
    basis_pct = round2((basis / spot_ltp) * 100) if basis is not None and spot_ltp not in (None, 0) else None

    future["basis"] = basis
    future["basis_pct"] = basis_pct

    _, chain = get_option_chain_rows_for_index(symbol_key, spot_ltp)

    pcr = compute_pcr(chain)
    max_pain = compute_max_pain(chain)
    straddle = compute_straddle(chain)

    return {
        "symbol": symbol_key,
        "label": cfg["label"],
        "has_data": (
            safe_float(spot.get("ltp"), None) is not None or
            safe_float(future.get("ltp"), None) is not None
        ),
        "spot": spot,
        "future": future,
        "analytics": {
            "pcr": pcr,
            "maxPain": max_pain,
            "straddle": straddle,
        }
    }


def compute_home_market_mood(index_cards, vix_metrics, sectors, ad_map, fo=None):
    score = 50.0

    nifty = index_cards.get("NIFTY", {})
    nifty_spot = nifty.get("spot", {}) if isinstance(nifty, dict) else {}
    nifty_future = nifty.get("future", {}) if isinstance(nifty, dict) else {}

    nifty_chg = safe_float(nifty_spot.get("change_pct"), None)
    nifty_basis_pct = safe_float(nifty_future.get("basis_pct"), None)
    vix_val = safe_float(vix_metrics.get("ltp"), None)

    ad_ratios = []
    for _, ad in (ad_map or {}).items():
        ratio = safe_float((ad or {}).get("ratio"), None)
        if ratio is not None:
            ad_ratios.append(ratio)

    avg_ad_ratio = round2(sum(ad_ratios) / len(ad_ratios)) if ad_ratios else None

    valid_sector_changes = [
        safe_float(x.get("change_pct"), None)
        for x in (sectors or [])
        if safe_float(x.get("change_pct"), None) is not None
    ]
    avg_sector_change = round2(sum(valid_sector_changes) / len(valid_sector_changes)) if valid_sector_changes else None

    if nifty_chg is not None:
        score += clamp(nifty_chg * 7, -18, 18)

    if nifty_basis_pct is not None:
        score += clamp(nifty_basis_pct * 35, -8, 8)

    if avg_ad_ratio is not None:
        score += clamp((avg_ad_ratio - 1) * 20, -18, 18)

    fo_net_pct = safe_float((fo or {}).get("netPct"), None)
    if fo_net_pct is not None:
        score += clamp(fo_net_pct * 0.35, -18, 18)

    if avg_sector_change is not None:
        score += clamp(avg_sector_change * 18, -10, 10)

    if vix_val is not None:
        if vix_val >= 22:
            score -= 18
        elif vix_val >= 18:
            score -= 12
        elif vix_val >= 15:
            score -= 6
        elif 0 < vix_val <= 12:
            score += 6

    score = round2(clamp(score, 0, 100))

    if score >= 60:
        bias = "Bullish"
    elif score <= 40:
        bias = "Bearish"
    else:
        bias = "Neutral"

    return {
        "score": score,
        "bias": bias,
        "components": {
            "niftyChangePct": round2(nifty_chg),
            "niftyBasisPct": round2(nifty_basis_pct),
            "avgAdRatio": round2(avg_ad_ratio),
            "foNetPct": round2(fo_net_pct),
            "avgSectorChangePct": round2(avg_sector_change),
            "vix": round2(vix_val),
        }
    }


def build_home_dashboard():
    cached = get_cached("home_dashboard", ttl=3)
    if cached is not None:
        return cached

    timestamp = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

    live_snapshot = get_fast_home_live_snapshot()
    market_strip = live_snapshot.get("marketStrip", [])
    previous_quote_payload = (_CACHE.get("home_index_quotes", {}) or {}).get("data") or {}
    previous_indices = previous_quote_payload.get("indices", {}) if isinstance(previous_quote_payload, dict) else {}
    future_quotes = current_index_future_quotes()

    nifty_card = build_fast_home_index_quote_card("NIFTY", market_strip, previous_indices.get("NIFTY"), future_quotes.get(INDEX_MAP["NIFTY"]["future"]))
    banknifty_card = build_fast_home_index_quote_card("BANKNIFTY", market_strip, previous_indices.get("BANKNIFTY"), future_quotes.get(INDEX_MAP["BANKNIFTY"]["future"]))
    sensex_card = build_fast_home_index_quote_card("SENSEX", market_strip, previous_indices.get("SENSEX"), future_quotes.get(INDEX_MAP["SENSEX"]["future"]))

    vix = live_snapshot.get("vix", {})
    sectors = live_snapshot.get("sectorStrength", [])
    fo = live_snapshot.get("foBreadth") or fo_breadth()

    ad_map = {
        "NIFTY": advance_decline_snapshot("NIFTY"),
        "BANKNIFTY": advance_decline_snapshot("BANKNIFTY"),
        "SENSEX": advance_decline_snapshot("SENSEX"),
    }

    market_mood = compute_home_market_mood(
        {
            "NIFTY": nifty_card,
            "BANKNIFTY": banknifty_card,
            "SENSEX": sensex_card,
        },
        vix,
        sectors,
        ad_map,
        fo,
    )

    home_breadth_stats = build_breadth_stats(ad_map.get("NIFTY", {}), sectors)
    set_cached("home_index_quotes", {
        "timestamp": timestamp,
        "indices": {
            "NIFTY": nifty_card,
            "BANKNIFTY": banknifty_card,
            "SENSEX": sensex_card,
        },
    })

    result = {
        "timestamp": timestamp,
        "marketStrip": market_strip,
        "indices": {
            "NIFTY": nifty_card,
            "BANKNIFTY": banknifty_card,
            "SENSEX": sensex_card,
        },
        "vix": vix,
        "sectorStrength": sectors,
        "foBreadth": fo,
        "advanceDecline": ad_map,
        "breadthStats": home_breadth_stats,
        "marketMood": market_mood,
    }

    set_cached("home_dashboard", result)
    return result

   
    
    # =========================================================
# ROUTES
# =========================================================
@app.route("/api/health")
def health():
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    return jsonify({
        "ok": True,
        "fyers": bool(fyers),
        "accessTokenPresent": bool(os.getenv("FYERS_ACCESS_TOKEN", "").strip()),
        "build": SERVER_BUILD_MARKER,
        "time": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
    })


@app.route("/api/debug/market-strip")
def debug_market_strip():
    out = []
    for label, symbol in MARKET_STRIP_SYMBOLS.items():
        raw = get_quote_block(symbol)
        out.append({
            "label": label,
            "symbol": symbol,
            "raw": raw,
            "parsed": extract_quote_metrics(raw),
        })
    return jsonify(out)


@app.route("/api/debug/fyers-quote")
def debug_fyers_quote():
    symbol = request.args.get("symbol", "NSE:NIFTY50-INDEX").strip()
    started = time.time()

    # Avoid consuming quote quota outside the configured live-market window.
    if not is_market_open():
        return jsonify({
            "ok": True,
            "marketOpen": False,
            "symbol": symbol,
            "message": "Market closed. FYERS quote request skipped.",
            "response": None,
        })

    refresh_fyers_from_env()
    if not fyers:
        return jsonify({
            "ok": False,
            "marketOpen": True,
            "symbol": symbol,
            "error": "FYERS client not initialized",
        }), 200

    try:
        resp = (active_client or fyers).quotes({"symbols": symbol})
        return jsonify({
            "ok": isinstance(resp, dict) and resp.get("s") == "ok",
            "marketOpen": True,
            "symbol": symbol,
            "elapsed": round2(time.time() - started),
            "response": resp,
        })
    except Exception as e:
        return jsonify({
            "ok": False,
            "marketOpen": True,
            "symbol": symbol,
            "elapsed": round2(time.time() - started),
            "error": str(e),
        }), 200

@app.route("/api/debug/runtime")
def api_debug_runtime():
    test_quote_resp = {}
    if fyers:
        try:
            test_quote_resp = fyers.quotes({"symbols": "NSE:NIFTY50-INDEX"})
        except Exception as e:
            test_quote_resp = {"error_exc": str(e)}

    return jsonify({
        "ok": True,
        "fyersInitialized": fyers is not None,
        "build": "option-dashboard-fo-breadth-20260531-1200",
        "cwd": os.getcwd(),
        "file": __file__,
        "testQuote": test_quote_resp,
        **get_fyers_env_status()
    })


@app.route("/api/dashboard-history", methods=["GET", "POST"])
def dashboard_history():
    if request.method == "GET":
        payload = read_dashboard_history()
        return jsonify({
            "ok": True,
            **payload,
            "summary": dashboard_history_summary(payload),
        })

    incoming = request.get_json(silent=True) or {}
    current = read_dashboard_history()
    next_payload = {
        **current,
        **{key: incoming.get(key, current.get(key)) for key in HISTORY_STORE_KEYS},
    }
    saved = write_dashboard_history(next_payload)
    return jsonify({
        "ok": True,
        "summary": dashboard_history_summary(saved),
    })


@app.route("/api/fyers/token-status")
def fyers_token_status():
    # SDK construction only proves that a token string exists. Validate the
    # session against FYERS so mobile does not show Connected for an expired or
    # rejected token.
    token_valid, validation_error = validate_fyers_session_token()
    return jsonify({
        "ok": True,
        "timestamp": ist_now().strftime("%d-%m-%Y %H:%M:%S"),
        "marketOpen": is_market_open(),
        "tokenValid": bool(token_valid),
        "tokenValidationError": validation_error or None,
        **get_fyers_env_status(),
    })

@app.route("/api/fyers/login-url")
def fyers_login_url():
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    client_id = os.getenv("FYERS_CLIENT_ID", "").strip()
    secret_key = os.getenv("FYERS_SECRET_KEY", "").strip()
    redirect_uri = get_fyers_redirect_uri()

    if not fyersModel:
        return jsonify({"ok": False, "error": "fyers_apiv3 package is not available."}), 200
    if not client_id or not secret_key:
        return jsonify({
            "ok": False,
            "error": "Missing FYERS_CLIENT_ID or FYERS_SECRET_KEY. On Render, add them in Environment Variables.",
            **get_fyers_env_status(),
        }), 200

    session = fyersModel.SessionModel(
        client_id=client_id,
        secret_key=secret_key,
        redirect_uri=redirect_uri,
        response_type="code",
        grant_type="authorization_code",
    )
    return jsonify({
        "ok": True,
        "loginUrl": session.generate_authcode(),
        "redirectUri": redirect_uri,
        **get_fyers_env_status(),
    })


@app.route("/api/fyers/order", methods=["POST"])
def fyers_place_order():
    if not fyers:
        return jsonify({"ok": False, "error": "Fyers not initialized. Please log in."}), 401
    
    payload = request.get_json(silent=True) or {}
    symbol = payload.get("symbol")
    qty = payload.get("qty", 1)
    side = payload.get("side", 1) # 1: Buy, -1: Sell
    order_type = payload.get("type", 2) # 2: Market, 1: Limit
    product = payload.get("productType", "MARGIN") # MARGIN or INTRADAY
    limit_price = payload.get("limitPrice", 0)

    if not symbol:
        return jsonify({"ok": False, "error": "Missing symbol"}), 400

    order_data = {
        "symbol": symbol,
        "qty": int(qty),
        "type": int(order_type),
        "side": int(side),
        "productType": product,
        "limitPrice": float(limit_price),
        "stopPrice": 0,
        "validity": "DAY",
        "disclosedQty": 0,
        "offlineOrder": False,
    }

    try:
        response = fyers.place_order(data=order_data)
        if response.get("s") == "ok" or response.get("code") == 200:
            return jsonify({"ok": True, "message": "Order placed successfully", "data": response})
        else:
            return jsonify({"ok": False, "error": response.get("message", "Order failed"), "data": response}), 400
    except Exception as e:
        print("Order placement error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/fyers/save-token", methods=["POST"])
def fyers_save_token():
    global _QUOTE_COOLDOWN_UNTIL, FYERS_CLIENT_ID, FYERS_ACCESS_TOKEN, FYERS_ENV_MTIME, _FYERS_VALIDATION_CACHE
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    payload = request.get_json(silent=True) or {}
    direct_token = (payload.get("accessToken") or payload.get("token") or "").strip()
    client_id = os.getenv("FYERS_CLIENT_ID", "").strip()
    secret_key = os.getenv("FYERS_SECRET_KEY", "").strip()
    redirect_uri = get_fyers_redirect_uri()

    if direct_token and looks_like_raw_fyers_auth_code(direct_token):
        payload["authCode"] = direct_token
        direct_token = ""

    if direct_token:
        access_token = normalize_fyers_access_token(client_id, direct_token)
        save_env_value(ENV_PATH, "FYERS_ACCESS_TOKEN", access_token)
        mark_fyers_token_ready(client_id, access_token)
        refresh_fyers_from_env(force=True)
        _FYERS_VALIDATION_CACHE = {
            "valid": True,
            "error": "",
            "cached_at": time.time(),
            "token_fingerprint": str(access_token or "")[-20:],
        }
        _QUOTE_COOLDOWN_UNTIL = 0.0
        clear_live_market_caches()
        return jsonify({
            "ok": True,
            "message": "Fyers access token saved and connection initialized.",
            "tokenValid": True,
            "accessToken": access_token,
            "access_token": access_token,
            "tokenValidationError": None,
            **get_fyers_env_status(),
        })

    auth_code = extract_fyers_auth_code(payload.get("authCode") or payload.get("finalUrl"))

    # Never log auth_code/finalUrl: both are sensitive authentication material.
    if not fyersModel:
        return jsonify({"ok": False, "error": "fyers_apiv3 package is not available."}), 200
    if not client_id or not secret_key:
        return jsonify({"ok": False, "error": "Missing FYERS_CLIENT_ID or FYERS_SECRET_KEY. On Render, add them in Environment Variables."}), 200
    if not auth_code:
        return jsonify({"ok": False, "error": "Paste the final Fyers redirect URL or auth_code."}), 200

    try:
        session = fyersModel.SessionModel(
            client_id=client_id,
            secret_key=secret_key,
            redirect_uri=redirect_uri,
            response_type="code",
            grant_type="authorization_code",
        )
        session.set_token(auth_code)
        resp = session.generate_token()
        access_token = resp.get("access_token") if isinstance(resp, dict) else None
        access_token = normalize_fyers_access_token(client_id, access_token)
        if not access_token:
            return jsonify({
                "ok": False,
                "error": f"Fyers did not return an access_token. Reason: {resp.get('message', resp)}",
                "response": resp,
            }), 200

        save_env_value(ENV_PATH, "FYERS_ACCESS_TOKEN", access_token)
        mark_fyers_token_ready(client_id, access_token)
        refresh_fyers_from_env(force=True)
        _FYERS_VALIDATION_CACHE = {
            "valid": True,
            "error": "",
            "cached_at": time.time(),
            "token_fingerprint": str(access_token or "")[-20:],
        }
        _QUOTE_COOLDOWN_UNTIL = 0.0
        clear_live_market_caches()
        return jsonify({
            "ok": True,
            "message": "Fyers token generated and connection initialized.",
            "tokenValid": True,
            "accessToken": access_token,
            "access_token": access_token,
            "tokenValidationError": None,
            **get_fyers_env_status(),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 200


@app.route("/api/fyers/totp-login", methods=["POST", "GET"])
def fyers_totp_login():
    global _QUOTE_COOLDOWN_UNTIL
    refresh_fyers_from_env()
    payload = request.get_json(silent=True) or {}
    
    client_id = (payload.get("clientId") or os.getenv("FYERS_CLIENT_ID", "")).strip()
    secret_key = (payload.get("secretKey") or os.getenv("FYERS_SECRET_KEY", "")).strip()
    fyers_id = (payload.get("fyersId") or os.getenv("FYERS_ID", "")).strip()
    fyers_pin = (payload.get("fyersPin") or payload.get("pin") or os.getenv("FYERS_PIN", "")).strip()
    totp_key = (payload.get("totpKey") or os.getenv("FYERS_TOTP_KEY", "")).strip()

    if not client_id or not secret_key:
        return jsonify({"ok": False, "error": "Missing FYERS_CLIENT_ID or FYERS_SECRET_KEY."}), 200
    if not fyers_id or not fyers_pin or not totp_key:
        return jsonify({
            "ok": False,
            "error": "Missing TOTP credentials (FYERS_ID, FYERS_PIN, or FYERS_TOTP_KEY). Please provide them.",
            **get_fyers_env_status(),
        }), 200

    try:
        from totp_login import generate_fyers_token_via_totp
        access_token = generate_fyers_token_via_totp(
            fyers_id=fyers_id,
            fyers_pin=fyers_pin,
            totp_key=totp_key,
            client_id=client_id,
            secret_key=secret_key
        )
        if not access_token:
            return jsonify({"ok": False, "error": "Automated TOTP login failed to produce an access token."}), 200

        save_env_value(ENV_PATH, "FYERS_ACCESS_TOKEN", access_token)
        if payload.get("fyersId"): save_env_value(ENV_PATH, "FYERS_ID", fyers_id)
        if payload.get("fyersPin"): save_env_value(ENV_PATH, "FYERS_PIN", fyers_pin)
        if payload.get("totpKey"): save_env_value(ENV_PATH, "FYERS_TOTP_KEY", totp_key)

        _QUOTE_COOLDOWN_UNTIL = 0.0
        refresh_fyers_from_env(force=True)
        clear_live_market_caches()

        return jsonify({
            "ok": True,
            "message": "TOTP Login successful! Access token generated and active.",
            **get_fyers_env_status(),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": f"TOTP Login Error: {str(e)}"}), 200


@app.route("/api/fyers/save-totp-credentials", methods=["POST"])
def fyers_save_totp_credentials():
    payload = request.get_json(silent=True) or {}
    fyers_id = payload.get("fyersId", "").strip()
    fyers_pin = (payload.get("fyersPin") or payload.get("pin") or "").strip()
    totp_key = payload.get("totpKey", "").strip()

    if fyers_id: save_env_value(ENV_PATH, "FYERS_ID", fyers_id)
    if fyers_pin: save_env_value(ENV_PATH, "FYERS_PIN", fyers_pin)
    if totp_key: save_env_value(ENV_PATH, "FYERS_TOTP_KEY", totp_key)

    refresh_fyers_from_env()
    return jsonify({
        "ok": True,
        "message": "TOTP credentials saved to server configuration.",
        **get_fyers_env_status(),
    })


YAHOO_INDEX_MAP = {
    "NIFTY": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "SENSEX": "^BSESN",
    "FINNIFTY": "NIFTY_FIN_SERVICE.NS",
    "MIDCPNIFTY": "NIFTY_MID_SELECT.NS",
    "BANKEX": "BSE-BANK.BO",
    "INDIAVIX": "^INDIAVIX",
}

def fetch_yahoo_history(symbol_key, resolution="5"):
    sym = str(symbol_key or "NIFTY").strip().upper()
    ticker = YAHOO_INDEX_MAP.get(sym)
    if not ticker:
        clean = sym.replace("NSE:", "").replace("BSE:", "").replace("-EQ", "").replace("-INDEX", "")
        ticker = YAHOO_INDEX_MAP.get(clean) or (clean if (clean.endswith(".NS") or clean.endswith(".BO") or clean.startswith("^")) else f"{clean}.NS")

    res = str(resolution or "5").upper()
    range_map = {
        "1": ("5d", "1m"),
        "2": ("5d", "2m"),
        "3": ("5d", "5m"),
        "5": ("5d", "5m"),
        "10": ("5d", "5m"),
        "15": ("1mo", "15m"),
        "30": ("1mo", "30m"),
        "60": ("3mo", "60m"),
        "D": ("1y", "1d"),
        "1D": ("1y", "1d"),
    }
    range_param, interval = range_map.get(res, ("5d", "5m"))
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={range_param}&interval={interval}"
    try:
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}, timeout=8)
        data = r.json()
        result = (data.get("chart", {}).get("result") or [None])[0]
        if not result:
            return None
        timestamps = result.get("timestamp") or []
        quotes = (result.get("indicators", {}).get("quote") or [{}])[0]
        opens = quotes.get("open") or []
        highs = quotes.get("high") or []
        lows = quotes.get("low") or []
        closes = quotes.get("close") or []
        volumes = quotes.get("volume") or []
        candles = []
        for i in range(len(timestamps)):
            if i < len(closes) and closes[i] is not None and not math.isnan(closes[i]):
                o = opens[i] if (i < len(opens) and opens[i] is not None) else closes[i]
                h = highs[i] if (i < len(highs) and highs[i] is not None) else closes[i]
                l = lows[i] if (i < len(lows) and lows[i] is not None) else closes[i]
                c = closes[i]
                v = volumes[i] if (i < len(volumes) and volumes[i] is not None) else 1000
                candles.append({
                    "ts": int(timestamps[i]),
                    "open": round(float(o), 2),
                    "high": round(float(max(h, o, c)), 2),
                    "low": round(float(min(l, o, c)), 2),
                    "close": round(float(c), 2),
                    "volume": int(v) if v else 1000,
                })
        if candles:
            return {
                "ok": True,
                "symbol": symbol_key,
                "source": "yahoo_live_exchange",
                "candles": candles,
            }
    except Exception as e:
        print(f"[Yahoo History] Failover error for {symbol_key}: {e}")
    return None

@app.route("/api/yahoo-history")
def yahoo_history():
    symbol = request.args.get("symbol", "^NSEI").strip()
    range_param = request.args.get("range", "5d").strip()
    interval = request.args.get("interval", "5m").strip()
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{requests.utils.quote(symbol)}?range={range_param}&interval={interval}"
    try:
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}, timeout=8)
        return jsonify(r.json()), r.status_code
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/fyers/history")
def fyers_history():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"
    history_symbol = symbol
    raw_symbol = sanitize_fyers_history_symbol(request.args.get("rawSymbol", ""))
    option_strike = safe_float(request.args.get("optionStrike"), None)
    option_side = request.args.get("optionSide", "").strip().upper()
    if raw_symbol:
        history_symbol = raw_symbol
    elif option_strike is not None and option_side in {"CE", "PE"}:
        generated_symbol = option_history_symbol(symbol, option_strike, option_side)
        if generated_symbol:
            history_symbol = generated_symbol

    resolution = request.args.get("resolution", "5").strip().upper()
    if resolution not in {"1", "2", "3", "5", "10", "15", "30", "60", "D", "1D"}:
        resolution = "5"

    lookback = safe_int(request.args.get("lookback"), 375)
    max_lookback = 180 * 24 * 60 if resolution in {"D", "1D"} else 90 * 24 * 60
    lookback = max(90, min(lookback or 375, max_lookback))
    fyers_res = fetch_fyers_history(history_symbol, resolution=resolution, lookback_minutes=lookback)
    if not fyers_res or not fyers_res.get("ok") or not fyers_res.get("candles"):
        yahoo_res = fetch_yahoo_history(symbol, resolution=resolution)
        if yahoo_res and yahoo_res.get("candles"):
            yahoo_res["fyers_attempts"] = (fyers_res or {}).get("attempts", [])
            yahoo_res["fyers_response"] = (fyers_res or {}).get("response", {})
            yahoo_res["fyers_error"] = (fyers_res or {}).get("error", "No candles")
            return jsonify(yahoo_res)
    return jsonify(fyers_res)


@app.route("/api/fyers/quote")
def fyers_quote():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"

    raw_symbol = sanitize_fyers_history_symbol(request.args.get("rawSymbol", ""))
    option_strike = safe_float(request.args.get("optionStrike"), None)
    option_side = request.args.get("optionSide", "").strip().upper()
    quote_symbol = raw_symbol

    if not quote_symbol and option_strike is not None and option_side in {"CE", "PE"}:
        quote_symbol = option_history_symbol(symbol, option_strike, option_side)
    if not quote_symbol:
        quote_symbol = stream_symbol_for_index(symbol)

    raw = get_quote_block(quote_symbol)
    metrics = extract_quote_metrics(raw)
    return jsonify({
        "ok": has_meaningful_number(metrics.get("ltp")),
        "symbol": symbol,
        "sourceSymbol": quote_symbol,
        "quote": metrics,
        "raw": raw,
        "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        **get_fyers_env_status(),
    })


@app.route("/api/fyers/live-tick")
def fyers_live_tick():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if not is_streamable_index_key(symbol):
        symbol = "NIFTY"
    stream_symbol = stream_symbol_for_index(symbol)
    ok, error = ensure_fyers_ws_stream([stream_symbol])
    with _FYERS_WS_LOCK:
        tick = (
            _FYERS_WS_TICKS.get(stream_symbol) or
            _FYERS_WS_TICKS.get(normalize_symbol_key(stream_symbol)) or
            {}
        )
        status = dict(_FYERS_WS_STATUS)
    if not tick:
        quote = get_stale_quote_block(stream_symbol) or get_quote_block(stream_symbol)
        metrics = extract_quote_metrics(quote)
        if has_meaningful_number(metrics.get("ltp")):
            tick = {
                "symbol": stream_symbol,
                "ltp": metrics.get("ltp"),
                "change": metrics.get("change"),
                "change_pct": metrics.get("change_pct"),
                "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
                "ts": int(time.time() * 1000),
                "source": "quote_fallback",
            }
    return jsonify({
        "ok": bool(ok or tick),
        "symbol": symbol,
        "sourceSymbol": stream_symbol,
        "tick": tick,
        "status": status,
        "error": error,
    })


@app.route("/api/fyers/stream")
def fyers_stream():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if not is_streamable_index_key(symbol):
        symbol = "NIFTY"
    stream_symbol = stream_symbol_for_index(symbol)
    ensure_fyers_ws_stream([stream_symbol])

    @stream_with_context
    def generate():
        last_ts = None
        last_heartbeat = 0.0
        while True:
            with _FYERS_WS_LOCK:
                tick = (
                    _FYERS_WS_TICKS.get(stream_symbol) or
                    _FYERS_WS_TICKS.get(normalize_symbol_key(stream_symbol)) or
                    None
                )
                status = dict(_FYERS_WS_STATUS)

            if tick and tick.get("ts") != last_ts:
                last_ts = tick.get("ts")
                yield f"data: {json.dumps({'type': 'tick', 'symbol': symbol, 'sourceSymbol': stream_symbol, 'tick': tick, 'status': status})}\n\n"
            elif time.time() - last_heartbeat > 5:
                last_heartbeat = time.time()
                yield f"data: {json.dumps({'type': 'heartbeat', 'symbol': symbol, 'sourceSymbol': stream_symbol, 'status': status})}\n\n"
            time.sleep(0.25)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/fyers/market-stream")
def fyers_market_stream():
    raw_symbols = [item.strip().upper() for item in request.args.get("symbols", "").split(",") if item.strip()]
    if not raw_symbols:
        raw_symbols = ["NIFTY", "BANKNIFTY", "SENSEX"]

    pairs = []
    seen = set()
    for symbol in raw_symbols:
        if not is_streamable_index_key(symbol):
            continue
        stream_symbol = stream_symbol_for_index(symbol)
        key = normalize_symbol_key(stream_symbol)
        if key in seen:
            continue
        seen.add(key)
        pairs.append((symbol, stream_symbol))

    if not pairs:
        pairs = [("NIFTY", stream_symbol_for_index("NIFTY"))]

    ensure_fyers_ws_stream([stream_symbol for _, stream_symbol in pairs])

    @stream_with_context
    def generate():
        last_ts = {}
        last_heartbeat = 0.0
        while True:
            emitted = False
            with _FYERS_WS_LOCK:
                status = dict(_FYERS_WS_STATUS)
                ticks = []
                for symbol, stream_symbol in pairs:
                    tick = (
                        _FYERS_WS_TICKS.get(stream_symbol) or
                        _FYERS_WS_TICKS.get(normalize_symbol_key(stream_symbol)) or
                        None
                    )
                    if tick:
                        ticks.append((symbol, stream_symbol, tick))

            for symbol, stream_symbol, tick in ticks:
                ts = tick.get("ts")
                if ts and last_ts.get(symbol) != ts:
                    last_ts[symbol] = ts
                    emitted = True
                    yield f"data: {json.dumps({'type': 'tick', 'symbol': symbol, 'sourceSymbol': stream_symbol, 'tick': tick, 'status': status})}\n\n"

            if not emitted and time.time() - last_heartbeat > 5:
                last_heartbeat = time.time()
                yield f"data: {json.dumps({'type': 'heartbeat', 'symbols': [symbol for symbol, _ in pairs], 'status': status})}\n\n"
            time.sleep(0.25)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/fyers/stock-stream")
def fyers_stock_stream():
    raw_symbols = [item.strip().upper() for item in request.args.get("symbols", "").split(",") if item.strip()]
    pairs = []
    seen = set()
    for item in raw_symbols[:60]:
        stream_symbol = sanitize_fyers_history_symbol(item) or normalize_stock_option_symbol(item)
        if not stream_symbol:
            continue
        key = normalize_symbol_key(stream_symbol)
        if key in seen:
            continue
        seen.add(key)
        label = stream_symbol.replace("NSE:", "").replace("BSE:", "").replace("-EQ", "")
        pairs.append((label, stream_symbol))

    if not pairs:
        return jsonify({"ok": False, "error": "No valid stock symbols for stream."}), 400

    ensure_fyers_ws_stream([stream_symbol for _, stream_symbol in pairs])

    @stream_with_context
    def generate():
        last_ts = {}
        last_heartbeat = 0.0
        while True:
            emitted = False
            with _FYERS_WS_LOCK:
                status = dict(_FYERS_WS_STATUS)
                ticks = []
                for label, stream_symbol in pairs:
                    tick = (
                        _FYERS_WS_TICKS.get(stream_symbol) or
                        _FYERS_WS_TICKS.get(normalize_symbol_key(stream_symbol)) or
                        None
                    )
                    if tick:
                        ticks.append((label, stream_symbol, tick))

            for label, stream_symbol, tick in ticks:
                ts = tick.get("ts")
                if ts and last_ts.get(stream_symbol) != ts:
                    last_ts[stream_symbol] = ts
                    emitted = True
                    yield f"data: {json.dumps({'type': 'tick', 'symbol': label, 'sourceSymbol': stream_symbol, 'tick': tick, 'status': status})}\n\n"

            if not emitted and time.time() - last_heartbeat > 5:
                last_heartbeat = time.time()
                yield f"data: {json.dumps({'type': 'heartbeat', 'symbols': [label for label, _ in pairs], 'status': status})}\n\n"
            time.sleep(0.25)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/debug/breadth")
def debug_breadth():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"

    cfg = INDEX_MAP[symbol]
    quotes = get_quotes_map(cfg["components"], chunk_size=10)

    rows = []
    for s in cfg["components"]:
        q = quotes.get(s) or quotes.get(normalize_symbol_key(s)) or {}
        rows.append({
            "symbol": s,
            "has_quote": bool(q),
            "ltp": round2(q.get("lp", q.get("ltp", None))) if q else None,
            "prev_close": round2(q.get("prev_close_price", q.get("prev_close", None))) if q else None,
            "change_pct": get_change_pct_from_quote(q) if q else None
        })

    return jsonify({
        "symbol": symbol,
        "count": len(rows),
        "rows": rows
    })


@app.route("/api/debug/fo-breadth")
def debug_fo_breadth():
    try:
        return jsonify(fo_breadth(cache_ttl=0))
    except Exception as e:
        return jsonify({
            "error": str(e),
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
        }), 200


@app.route("/api/market-news")
def market_news():
    try:
        return jsonify(fetch_market_news())
    except Exception as e:
        print("market-news error:", e)
        stale = get_stale_cached("market_news")
        if stale is not None:
            return jsonify(stale)
        return jsonify({
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "items": [],
            "error": str(e),
        }), 200


@app.route("/api/market-strip")
def market_strip():
    try:
        items = get_market_strip_data()
        return jsonify({
            "ok": True,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "items": items
        })
    except Exception as e:
        print("market-strip error:", e)
        return jsonify({
            "ok": False,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "items": _MARKET_STRIP_CACHE.get("items", []),
            "error": str(e)
        }), 200


@app.route("/api/home-ticker")
def home_ticker():
    try:
        live_snapshot = get_fast_home_live_snapshot()
        market_strip = live_snapshot.get("marketStrip", [])
        previous_quote_payload = (_CACHE.get("home_index_quotes", {}) or {}).get("data") or {}
        previous_indices = previous_quote_payload.get("indices", {}) if isinstance(previous_quote_payload, dict) else {}
        future_quotes = current_index_future_quotes()
        indices = {
            "NIFTY": build_fast_home_index_quote_card("NIFTY", market_strip, previous_indices.get("NIFTY"), future_quotes.get(INDEX_MAP["NIFTY"]["future"])),
            "BANKNIFTY": build_fast_home_index_quote_card("BANKNIFTY", market_strip, previous_indices.get("BANKNIFTY"), future_quotes.get(INDEX_MAP["BANKNIFTY"]["future"])),
            "SENSEX": build_fast_home_index_quote_card("SENSEX", market_strip, previous_indices.get("SENSEX"), future_quotes.get(INDEX_MAP["SENSEX"]["future"])),
        }
        set_cached("home_index_quotes", {
            "timestamp": live_snapshot.get("timestamp") or datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "indices": indices,
        })
        vix = live_snapshot.get("vix", {})
        sectors = live_snapshot.get("sectorStrength", [])
        fo = live_snapshot.get("foBreadth") or fo_breadth()
        breadth_stats = build_breadth_stats({}, sectors)
        ad_map = {
            "NIFTY": advance_decline_snapshot("NIFTY"),
            "BANKNIFTY": advance_decline_snapshot("BANKNIFTY"),
            "SENSEX": advance_decline_snapshot("SENSEX"),
        }
        market_mood = compute_home_market_mood(indices, vix, sectors, ad_map, fo)
        return jsonify({
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "marketStrip": market_strip,
            "indices": indices,
            "vix": vix,
            "sectorStrength": sectors,
            "foBreadth": fo,
            "breadthStats": breadth_stats,
            "advanceDecline": ad_map,
            "marketMood": market_mood,
            "quoteStatus": live_snapshot.get("quoteStatus", {}),
        })
    except Exception as e:
        print("home-ticker error:", e)
        return jsonify({
            "error": str(e),
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "marketStrip": _MARKET_STRIP_CACHE.get("items", []),
            "vix": {}
        }), 200


@app.route("/api/home-index-quotes")
def home_index_quotes():
    try:
        cached = get_cached("home_index_quotes", ttl=3)
        if cached is not None:
            return jsonify(cached)

        live_snapshot = get_fast_home_live_snapshot()
        market_strip = live_snapshot.get("marketStrip", [])
        previous_quote_payload = (_CACHE.get("home_index_quotes", {}) or {}).get("data") or {}
        previous_indices = previous_quote_payload.get("indices", {}) if isinstance(previous_quote_payload, dict) else {}
        future_quotes = current_index_future_quotes()

        result = {
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "indices": {
                "NIFTY": build_fast_home_index_quote_card("NIFTY", market_strip, previous_indices.get("NIFTY"), future_quotes.get(INDEX_MAP["NIFTY"]["future"])),
                "BANKNIFTY": build_fast_home_index_quote_card("BANKNIFTY", market_strip, previous_indices.get("BANKNIFTY"), future_quotes.get(INDEX_MAP["BANKNIFTY"]["future"])),
                "SENSEX": build_fast_home_index_quote_card("SENSEX", market_strip, previous_indices.get("SENSEX"), future_quotes.get(INDEX_MAP["SENSEX"]["future"])),
            }
        }

        set_cached("home_index_quotes", result)
        return jsonify(result)
    except Exception as e:
        print("home-index-quotes error:", e)
        return jsonify({
            "error": str(e),
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "indices": {}
        }), 500


@app.route("/api/home-index-analytics")
def home_index_analytics():
    try:
        cached = get_cached("home_index_analytics", ttl=12)
        if cached is not None:
            return jsonify(cached)

        result = {
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "indices": {
                "NIFTY": build_home_index_analytics_card("NIFTY"),
                "BANKNIFTY": build_home_index_analytics_card("BANKNIFTY"),
                "SENSEX": build_home_index_analytics_card("SENSEX"),
            }
        }

        set_cached("home_index_analytics", result)
        return jsonify(result)
    except Exception as e:
        print("home-index-analytics error:", e)
        return jsonify({
            "error": str(e),
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "indices": {}
        }), 500


@app.route("/api/home-cards")
def home_cards():
    try:
        timestamp = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

        nifty_card = build_home_index_quote_card("NIFTY")
        banknifty_card = build_home_index_quote_card("BANKNIFTY")
        sensex_card = build_home_index_quote_card("SENSEX")

        return jsonify({
            "timestamp": timestamp,
            "indices": {
                "NIFTY": nifty_card,
                "BANKNIFTY": banknifty_card,
                "SENSEX": sensex_card,
            }
        })
    except Exception as e:
        print("home-cards error:", e)
        return jsonify({
            "error": str(e),
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "indices": {}
        }), 500


@app.route("/api/home-dashboard")
def home_dashboard():
    try:
        data = build_home_dashboard()
        return jsonify(data)
    except Exception as e:
        print("home-dashboard error:", e)
        return jsonify({
            "error": str(e),
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "marketStrip": _MARKET_STRIP_CACHE.get("items", []),
            "indices": {},
            "vix": {},
            "sectorStrength": [],
            "foBreadth": {},
            "advanceDecline": {},
            "breadthStats": {
                "advances": 0,
                "declines": 0,
                "unchanged": 0,
                "adRatio": None,
                "breadthScore": None,
                "sectorAdvances": 0,
                "sectorDeclines": 0,
                "sectorUnchanged": 0,
                "indexAdvances": 0,
                "indexDeclines": 0,
                "indexUnchanged": 0,
                "indexBreadthScore": None,
            },
            "marketMood": {
                "score": None,
                "bias": "Neutral",
                "components": {}
            }
        }), 500


@app.route("/api/sector-stocks")
def sector_stocks():
    sector = request.args.get("sector", "").strip()
    try:
        return jsonify(sector_stock_rows(sector))
    except Exception as e:
        print("sector-stocks error:", e)
        return jsonify({
            "error": str(e),
            "sector": sector,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "rows": [],
        }), 500


@app.route("/api/stock-options/scan")
def stock_options_scan():
    try:
        scan = stock_options_quick_scan(cache_ttl=20)
        rows = scan.get("stocks") or []
        return jsonify({
            "timestamp": scan.get("timestamp") or datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "label": scan.get("label"),
            "official": bool(scan.get("official")),
            "coveragePct": scan.get("coveragePct"),
            "quotedTotal": scan.get("quotedTotal"),
            "universeTotal": scan.get("universeTotal"),
            "advances": scan.get("advances"),
            "declines": scan.get("declines"),
            "unchanged": scan.get("unchanged"),
            "source": scan.get("source"),
            "rows": rows,
        })
    except Exception as e:
        print("stock-options scan error:", e)
        return jsonify({
            "error": str(e),
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "rows": [],
        }), 500


@app.route("/api/stock-options")
def stock_options_detail():
    symbol = request.args.get("symbol", "").strip()
    try:
        return jsonify(build_stock_options_detail(symbol))
    except Exception as e:
        print("stock-options detail error:", e)
        return jsonify({
            "error": str(e),
            "symbol": symbol,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "optionChain": [],
        }), 500


@app.route("/api/dashboard")
def dashboard():
    symbol = (request.args.get("symbol") or request.args.get("index") or "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"

    try:
        data = build_dashboard(symbol)
        return jsonify(data)
    except Exception as e:
        print("dashboard error:", e)
        return jsonify({
            "error": str(e),
            "symbol": symbol,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        }), 500


@app.route("/api/index/<symbol>")
def api_index_legacy(symbol):
    sym = (symbol or "NIFTY").strip().upper()
    if sym not in INDEX_MAP:
        sym = "NIFTY"
    try:
        data = build_dashboard(sym)
        return jsonify(data)
    except Exception as e:
        print("index legacy error:", e)
        return jsonify({
            "error": str(e),
            "symbol": sym,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        }), 500


@app.route("/api/option-expiries")
def option_expiries():
    symbol = (request.args.get("symbol") or request.args.get("index") or "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        return jsonify({"error": "Unsupported symbol", "symbol": symbol}), 400

    try:
        catalog = get_option_expiry_catalog(symbol)
        selected = resolve_option_expiry(catalog)
        return jsonify({
            "symbol": symbol,
            "selectedExpiry": (selected or {}).get("date"),
            "selectedExpiryTimestamp": (selected or {}).get("timestamp"),
            "dte": (selected or {}).get("dte"),
            "expiries": [item.get("date") for item in catalog if item.get("date")],
            "expiryDetails": catalog,
            "timestamp": ist_now().strftime("%d-%m-%Y %H:%M:%S"),
        })
    except Exception as e:
        print("option-expiries error:", e)
        return jsonify({"error": str(e), "symbol": symbol}), 500


@app.route("/api/option-chain")
def option_chain():
    symbol = (request.args.get("symbol") or request.args.get("index") or "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        return jsonify({"error": "Unsupported symbol", "symbol": symbol}), 400

    requested_expiry = (request.args.get("expiry") or request.args.get("timestamp") or "").strip()

    try:
        selected = None
        catalog = None
        broker_param = (request.args.get("broker") or "auto").strip().lower()
        if broker_param == "kotakneo":
            try:
                from optionsdesk_v195_routes import get_kotak_option_chain_data
                kotak_chain = get_kotak_option_chain_data(symbol, requested_expiry)
                if kotak_chain and kotak_chain.get("optionChain") and len(kotak_chain["optionChain"]) > 0:
                    return jsonify(kotak_chain)
            except Exception as e:
                print(f"Direct Kotak Neo option chain for {symbol} failed: {e}")

        if requested_expiry:
            catalog = get_option_expiry_catalog(symbol)
            selected = resolve_option_expiry(catalog, requested_expiry)
            if selected is None and broker_param != "fyers":
                try:
                    from optionsdesk_v195_routes import get_kotak_option_chain_data
                    kotak_chain = get_kotak_option_chain_data(symbol, requested_expiry)
                    if kotak_chain and kotak_chain.get("optionChain") and len(kotak_chain["optionChain"]) > 0:
                        return jsonify(kotak_chain)
                except Exception as e:
                    print(f"Kotak Neo requested expiry failover failed: {e}")

            if selected is None:
                if catalog and len(catalog) > 0:
                    selected = catalog[0]
                    print(f"[OptionChain] Requested expiry '{requested_expiry}' not in catalog for {symbol}; falling back to nearest broker expiry: {selected.get('date')}")
                else:
                    return jsonify({
                        "error": "Requested expiry is not available",
                        "symbol": symbol,
                        "requestedExpiry": requested_expiry,
                        "expiries": [item.get("date") for item in (catalog or []) if item.get("date")],
                        "expiryDetails": catalog,
                    }), 400
        if broker_param == "kotakneo":
            try:
                from optionsdesk_v195_routes import get_kotak_option_chain_data
                kotak_chain = get_kotak_option_chain_data(symbol, requested_expiry)
                if kotak_chain and kotak_chain.get("optionChain") and len(kotak_chain["optionChain"]) > 0:
                    return jsonify(kotak_chain)
            except Exception as e:
                print(f"Direct Kotak Neo option chain for {symbol} failed: {e}")

        dashboard_data = build_dashboard(
            symbol,
            cache_ttl=3,
            expiry_timestamp=(selected or {}).get("timestamp"),
            expiry_date=(selected or {}).get("date"),
            expiry_catalog=catalog,
            include_history=False,
        )


        chain_data = dashboard_data.get("optionChain") or dashboard_data.get("data") or []
        if (not chain_data or len(chain_data) == 0) and broker_param != "fyers":
            try:
                from optionsdesk_v195_routes import get_kotak_option_chain_data
                kotak_chain = get_kotak_option_chain_data(symbol, requested_expiry)
                if kotak_chain and kotak_chain.get("optionChain") and len(kotak_chain["optionChain"]) > 0:
                    has_real_oi = any((safe_float(r.get("ce_oi"), 0) > 0 or safe_float(r.get("pe_oi"), 0) > 0) for r in kotak_chain["optionChain"])
                    if has_real_oi:
                        dashboard_data["optionChain"] = kotak_chain["optionChain"]
                        dashboard_data["data"] = kotak_chain["optionChain"]
                        dashboard_data["broker"] = "kotakneo"
                        dashboard_data["dataSource"] = "kotakneo_live"
                    if not dashboard_data.get("selectedExpiry"):
                        dashboard_data["selectedExpiry"] = kotak_chain.get("selectedExpiry")
                    if not dashboard_data.get("expiries"):
                        dashboard_data["expiries"] = kotak_chain.get("expiries")
                    if not dashboard_data.get("spot") or not safe_float((dashboard_data.get("spot") or {}).get("ltp"), None):
                        dashboard_data["spot"] = kotak_chain.get("spot") or dashboard_data.get("spot")
            except Exception as e:
                print(f"Kotak Neo failover for {symbol} failed: {e}")

        return jsonify({
            "broker": dashboard_data.get("broker") or "fyers",
            "dataSource": dashboard_data.get("dataSource") or "fyers_live",
            "symbol": dashboard_data["symbol"],
            "label": dashboard_data["label"],
            "timestamp": dashboard_data["timestamp"],
            "signalCalculatedAt": dashboard_data.get("signalCalculatedAt"),
            "referencePrice": dashboard_data.get("referencePrice"),
            "referenceSource": dashboard_data.get("referenceSource"),
            "selectedExpiry": dashboard_data.get("selectedExpiry"),
            "selectedExpiryTimestamp": dashboard_data.get("selectedExpiryTimestamp"),
            "dte": dashboard_data.get("dte"),
            "expiries": dashboard_data.get("expiries") or [],
            "expiryDetails": dashboard_data.get("expiryDetails") or [],
            "spot": dashboard_data["spot"],
            "future": dashboard_data["future"],
            "vix": dashboard_data["vix"],
            "analytics": dashboard_data["analytics"],
            "data": dashboard_data["optionChain"],
            "heatmap": dashboard_data["oiHeatmap"],
            "oiChart": dashboard_data["oiChart"],
            "marketStrip": dashboard_data["marketStrip"],
        })
    except Exception as e:
        print("option-chain error:", e)
        return jsonify({
            "error": str(e),
            "symbol": symbol,
            "timestamp": ist_now().strftime("%d-%m-%Y %H:%M:%S")
        }), 500

@app.route("/api/debug/oi-verify")
def debug_oi_verify():
    symbol_key = (request.args.get("symbol") or "NIFTY").strip().upper()
    if symbol_key not in INDEX_MAP:
        symbol_key = "NIFTY"
    expiry_ts = str(request.args.get("expiryTimestamp") or request.args.get("timestamp") or "").strip() or None
    try:
        radius = max(50.0, min(1000.0, float(request.args.get("radius") or 250)))
    except Exception:
        radius = 250.0

    cfg = INDEX_MAP[symbol_key]
    future_meta = resolve_active_future(symbol_key)
    future_symbol = future_meta.get("symbol")
    spot_raw = get_quote_block(cfg["spot"])
    spot = extract_quote_metrics(spot_raw).get("ltp")
    raw = get_option_chain_raw(
        cfg.get("option_symbols") or [cfg.get("spot")],
        future_symbol,
        strikecount=50,
        expiry_timestamp=expiry_ts,
    )
    strict_raw_rows = _strict_safe_option_rows(raw)
    parsed = parse_option_chain(raw, spot)
    parsed_by_strike = {safe_float(r.get("strike"), None): r for r in parsed}
    comparisons = []

    for leg in strict_raw_rows:
        strike = safe_float(leg.get("strike_price"), None)
        if strike is None or (spot is not None and abs(strike - spot) > radius):
            continue
        side = leg.get("option_type")
        row = parsed_by_strike.get(strike) or {}
        prefix = "ce" if side == "CE" else "pe"
        raw_oi = safe_int(leg.get("oi"), None)
        raw_oich = safe_int(leg.get("oich"), None)
        parsed_oi = safe_int(row.get(f"{prefix}_oi"), None)
        parsed_oich = safe_int(row.get(f"{prefix}_oich"), None)
        raw_symbol = str(leg.get("symbol") or "").strip()
        parsed_symbol = str(row.get(f"{prefix}_symbol") or "").strip()
        comparisons.append({
            "strike": strike,
            "side": side,
            "rawSymbol": raw_symbol,
            "parsedSymbol": parsed_symbol,
            "symbolMatch": bool(raw_symbol and raw_symbol == parsed_symbol),
            "rawOi": raw_oi,
            "parsedOi": parsed_oi,
            "oiMatch": raw_oi == parsed_oi,
            "rawOiChange": raw_oich,
            "parsedOiChange": parsed_oich,
            "oiChangeMatch": raw_oich == parsed_oich,
        })

    verification = bool(comparisons) and all(x["symbolMatch"] and x["oiMatch"] and x["oiChangeMatch"] for x in comparisons)
    meta = _strict_expiry_meta(raw)
    return jsonify({
        "ok": True,
        "symbol": symbol_key,
        "spot": spot,
        **meta,
        "verification": verification,
        "futureVerified": bool(future_meta.get("verified")),
        "futureSymbol": future_symbol,
        "comparisons": sorted(comparisons, key=lambda x: (x["strike"], x["side"])),
    })


@app.route("/api/debug/clean-v2")
def debug_clean_v2():
    symbol_key = (request.args.get("symbol") or "NIFTY").strip().upper()
    if symbol_key not in INDEX_MAP:
        symbol_key = "NIFTY"
    future_meta = resolve_active_future(symbol_key, force=True)
    data = build_dashboard(symbol_key, cache_ttl=0)
    future = data.get("future") or {}
    return jsonify({
        "ok": True,
        "symbol": symbol_key,
        "parserMode": "STRICT_EXACT_SIDE_SYMBOL_STRIKE",
        "selectedExpiry": data.get("selectedExpiry"),
        "selectedExpiryTimestamp": data.get("selectedExpiryTimestamp"),
        "optionRows": len(data.get("optionChain") or []),
        "future": {
            "verified": bool(future.get("verified")),
            "unavailable": bool(future.get("unavailable")),
            "sourceSymbol": future.get("sourceSymbol"),
            "reason": future.get("verificationReason") or future_meta.get("reason"),
            "basisPct": future.get("basis_pct"),
        },
        "socketMode": "EXACT_DERIVATIVE_ROOMS",
        "spotRoomAliasesOnly": True,
    })


@app.route("/api/debug/index")
def debug_index():
    symbol = request.args.get("symbol", "NIFTY").strip().upper()
    if symbol not in INDEX_MAP:
        symbol = "NIFTY"
    cfg = INDEX_MAP[symbol]
    future_meta = resolve_active_future(symbol)
    future_symbol = future_meta.get("symbol")
    spot_raw = get_quote_block(cfg["spot"])
    future_raw = (get_quote_block(future_symbol) or future_meta.get("block") or {}) if future_symbol else {}
    option_symbols = cfg.get("option_symbols") or [cfg["spot"]]
    oc_raw = get_option_chain_raw(option_symbols, future_symbol, strikecount=50)
    parsed_chain = parse_option_chain(oc_raw, extract_quote_metrics(spot_raw).get("ltp"))
    return jsonify({
        "symbol": symbol,
        "spotSymbol": cfg["spot"],
        "futureSymbol": future_symbol,
        "futureVerified": bool(future_meta.get("verified")),
        "futureReason": future_meta.get("reason"),
        "optionSymbolsTried": option_symbols,
        "spotRaw": spot_raw,
        "futureRaw": future_raw,
        "optionChainKeys": list((oc_raw or {}).keys()) if isinstance(oc_raw, dict) else [],
        "optionChainHasData": bool((oc_raw or {}).get("data")) if isinstance(oc_raw, dict) else bool(oc_raw),
        "parsedChainRows": len(parsed_chain),
        "parsedChainSample": parsed_chain[:5],
        "rawOptionChainSample": _extract_option_rows_from_data((oc_raw or {}).get("data", oc_raw) if isinstance(oc_raw, dict) else oc_raw)[:3],
    })


@socketio.on('connect')
def test_connect():
    print("UI CLIENT CONNECTED TO SOCKET.IO!", flush=True)

@socketio.on('subscribe')
def handle_subscribe(data):
    if not isinstance(data, dict):
        return
    symbols = data.get('symbols', [])
    if not isinstance(symbols, list):
        symbols = [symbols]

    valid_symbols = []
    for requested in symbols:
        if not requested or not isinstance(requested, str):
            continue
        requested = requested.strip().upper()
        if not requested:
            continue
        join_room(requested)

        if is_streamable_index_key(requested):
            # A generic index subscription owns only spot + the currently verified future.
            # Option Chain screens subscribe exact CE/PE symbols separately.
            spot = stream_symbol_for_index(requested)
            future = stream_future_for_index(requested)
            if spot:
                valid_symbols.append(spot)
                join_room(spot)
            if future:
                valid_symbols.append(future)
                join_room(future)
        else:
            exact = sanitize_fyers_history_symbol(requested) or normalize_stock_option_symbol(requested)
            if exact:
                valid_symbols.append(exact)
                join_room(exact)

    valid_symbols = unique_symbols(valid_symbols)
    if valid_symbols:
        ensure_fyers_ws_stream(valid_symbols)
    emit('subscribed', {'symbols': valid_symbols})


@socketio.on('subscribe_strip')
def handle_subscribe_strip(data):
    if not isinstance(data, dict):
        return
    symbols = data.get('symbols', [])
    if not isinstance(symbols, list):
        symbols = [symbols]
    
    valid_symbols = []
    
    for base_sym in symbols:
        if not base_sym or not isinstance(base_sym, str): continue
        base_sym = base_sym.strip().upper()
        join_room(base_sym)
        
        if is_streamable_index_key(base_sym):
            spot = stream_symbol_for_index(base_sym)
            future = stream_future_for_index(base_sym)
            if spot:
                valid_symbols.append(spot)
                join_room(spot)
            if future:
                valid_symbols.append(future)
                join_room(future)
        else:
            stream_sym = sanitize_fyers_history_symbol(base_sym) or normalize_stock_option_symbol(base_sym)
            if stream_sym:
                valid_symbols.append(stream_sym)
                join_room(stream_sym)

    valid_symbols = unique_symbols(valid_symbols)
    if valid_symbols:
        ensure_fyers_ws_stream(valid_symbols)

        emit('subscribed', {'symbols': valid_symbols})

@socketio.on('unsubscribe')
def handle_unsubscribe(data):
    if not isinstance(data, dict):
        return
    symbols = data.get('symbols', [])
    if not isinstance(symbols, list):
        symbols = [symbols]
    
    for sym in symbols:
        if not sym or not isinstance(sym, str): continue
        leave_room(sym.strip().upper())



# OptionsDesk v1.9.5 secure mobile auth + Kotak Neo routes
from optionsdesk_v195_routes import register_optionsdesk_v195_routes
register_optionsdesk_v195_routes(app)


# --- V2.0.20K BACKGROUND ATTENTION MONITOR START ---
BACKGROUND_ATTENTION_ENV = "ENABLE_BACKGROUND_ATTENTION_MONITOR"
BACKGROUND_ATTENTION_INTERVAL = 20
BACKGROUND_DEEP_SCAN_INTERVAL = 60
BACKGROUND_INDEX_SYMBOLS = ("NIFTY", "BANKNIFTY", "SENSEX")
BACKGROUND_FAST_LIMITS = {
    "NIFTY": {"s30": 10.0, "m1": 18.0, "m3": 30.0},
    "BANKNIFTY": {"s30": 20.0, "m1": 35.0, "m3": 60.0},
    "SENSEX": {"s30": 35.0, "m1": 60.0, "m3": 100.0},
}
# 20N uses smaller movement thresholds for direction confirmation than the
# FAST MOVE wake-up. These do not create an entry; they only decide whether a
# WATCH / DIRECTION CONFIRMED notification is even allowed.
BACKGROUND_DIRECTION_LIMITS = {
    "NIFTY": {"m1": 5.0, "m3": 10.0},
    "BANKNIFTY": {"m1": 10.0, "m3": 20.0},
    "SENSEX": {"m1": 18.0, "m3": 35.0},
}
BACKGROUND_EXPECTED_RANGES = {
    "NIFTY": (15000.0, 40000.0),
    "BANKNIFTY": (30000.0, 90000.0),
    "SENSEX": (40000.0, 130000.0),
}
_BACKGROUND_SPOT_HISTORY = {symbol: [] for symbol in BACKGROUND_INDEX_SYMBOLS}
_BACKGROUND_CAS_HISTORY = {symbol: [] for symbol in BACKGROUND_INDEX_SYMBOLS}
_BACKGROUND_ATTENTION_STATUS = {
    "running": False,
    "lastCycleAt": None,
    "lastDeepScanAt": None,
    "lastError": None,
    "lastAlert": None,
}
_BACKGROUND_ATTENTION_THREAD = None
_BACKGROUND_ATTENTION_THREAD_LOCK = threading.Lock()


def background_attention_monitor_enabled():
    return str(os.getenv(BACKGROUND_ATTENTION_ENV, "1")).strip().lower() not in ("0", "false", "off", "no")


def background_attention_market_window(now=None):
    now = now or ist_now()
    if now.weekday() >= 5:
        return False
    minutes = now.hour * 60 + now.minute
    # V2.0.20M: start background observation at 09:15 so the opening gap is
    # captured. PREPARE is still suppressed for the first five minutes below.
    # Stop before broker RMS/safety cut-off so no new-entry-style wake-up is created late.
    return 9 * 60 + 15 <= minutes <= 15 * 60 + 24


def background_cas_window(now=None):
    now = now or ist_now()
    if now.weekday() >= 5:
        return False
    minutes = now.hour * 60 + now.minute
    return 15 * 60 + 15 <= minutes <= 15 * 60 + 24


def _background_valid_index_price(symbol, value):
    value = safe_float(value, None)
    if value is None:
        return None
    low, high = BACKGROUND_EXPECTED_RANGES.get(symbol, (1.0, 1000000.0))
    if value < low or value > high:
        return None
    history = _BACKGROUND_SPOT_HISTORY.get(symbol) or []
    if history:
        previous = safe_float(history[-1].get("value"), None)
        if previous not in (None, 0) and abs(value - previous) / previous > 0.03:
            # Reject cross-routed/impossible ticks rather than alerting on them.
            return None
    return value


def _background_point_before(history, target_ts, key="value"):
    best = None
    for point in history or []:
        if safe_float(point.get(key), None) is None:
            continue
        if float(point.get("ts") or 0) > target_ts:
            continue
        if best is None or float(point.get("ts") or 0) > float(best.get("ts") or 0):
            best = point
    return best


def _background_move(history, now_ts, seconds, key="value"):
    latest = history[-1] if history else None
    if not latest:
        return None
    current = safe_float(latest.get(key), None)
    past = _background_point_before(history, now_ts - seconds, key)
    previous = safe_float((past or {}).get(key), None)
    if current is None or previous is None:
        return None
    return current - previous


def _background_direction(value, threshold):
    value = safe_float(value, None)
    if value is None or abs(value) < threshold:
        return "FLAT"
    return "UP" if value > 0 else "DOWN"


def _background_fast_move(symbol, history, now_ts):
    limits = BACKGROUND_FAST_LIMITS[symbol]
    m30 = _background_move(history, now_ts, 30)
    m60 = _background_move(history, now_ts, 60)
    m180 = _background_move(history, now_ts, 180)

    primary = _background_direction(m60, limits["m1"])
    if primary == "FLAT":
        primary = _background_direction(m30, limits["s30"])
    if primary == "FLAT":
        primary = _background_direction(m180, limits["m3"])
    if primary == "FLAT":
        return {"qualified": False, "direction": "FLAT", "move30s": m30, "move1m": m60, "move3m": m180, "score": 0}

    votes = [
        _background_direction(m30, limits["s30"] * 0.6),
        _background_direction(m60, limits["m1"] * 0.6),
        _background_direction(m180, limits["m3"] * 0.6),
    ]
    persistence = sum(1 for item in votes if item == primary)
    very_strong = abs(m60 or 0) >= limits["m1"] * 1.5 or abs(m30 or 0) >= limits["s30"] * 1.7
    strength = max(
        abs(m30 or 0) / limits["s30"],
        abs(m60 or 0) / limits["m1"],
        abs(m180 or 0) / limits["m3"],
    )
    score = max(55, min(90, round(55 + max(0, strength - 1) * 18 + max(0, persistence - 1) * 5)))
    return {
        "qualified": persistence >= 2 or very_strong,
        "direction": primary,
        "move30s": round2(m30),
        "move1m": round2(m60),
        "move3m": round2(m180),
        "score": score,
    }


def _background_active_tokens(symbol=None):
    target = str(symbol or "").strip().upper()
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT token, alert_symbols FROM device_push_tokens WHERE active = 1")
        tokens = []
        for row in cursor.fetchall():
            if not row or not valid_expo_push_token(row[0]):
                continue
            allowed = None
            raw = row[1] if len(row) > 1 else None
            if raw:
                try:
                    decoded = json.loads(raw)
                    if isinstance(decoded, list):
                        allowed = {str(item or "").strip().upper() for item in decoded}
                except Exception:
                    allowed = None
            if target and allowed is not None and target not in allowed:
                continue
            tokens.append(str(row[0]).strip())
        conn.close()
        return list(dict.fromkeys(tokens))
    except Exception:
        return []


def _background_alert_gate(key, score=0, cooldown_seconds=600, score_upgrade=8):
    now_ts = time.time()
    conn = sqlite3.connect(DB_PATH, timeout=10)
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute("SELECT last_sent_ts, last_score FROM server_alert_state WHERE alert_key = ?", (key,))
        row = cursor.fetchone()
        if row:
            last_ts = safe_float(row[0], 0) or 0
            last_score = safe_float(row[1], 0) or 0
            if now_ts - last_ts < cooldown_seconds and float(score or 0) < last_score + score_upgrade:
                conn.rollback()
                return False
        cursor.execute("""
            INSERT INTO server_alert_state(alert_key, last_sent_ts, last_score, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(alert_key) DO UPDATE SET
                last_sent_ts=excluded.last_sent_ts,
                last_score=excluded.last_score,
                updated_at=excluded.updated_at
        """, (key, now_ts, float(score or 0), ist_now().isoformat(timespec="seconds")))
        conn.commit()
        return True
    finally:
        conn.close()


def _background_push_all(title, body, data, gate_key, score=0, cooldown_seconds=600, score_upgrade=8):
    tokens = _background_active_tokens((data or {}).get("symbol"))
    if not tokens:
        return False
    if not _background_alert_gate(gate_key, score, cooldown_seconds, score_upgrade):
        return False

    sent = 0
    last_error = None
    for token in tokens:
        try:
            send_expo_push_notification(token, title, body, data)
            sent += 1
        except Exception as exc:
            last_error = str(exc)
    if sent:
        _BACKGROUND_ATTENTION_STATUS["lastAlert"] = {
            "at": ist_now().isoformat(timespec="seconds"),
            "title": title,
            "devices": sent,
        }
        return True
    if last_error:
        _BACKGROUND_ATTENTION_STATUS["lastError"] = last_error
    return False


def _background_signed(label, value):
    value = safe_float(value, None)
    if value is None:
        return None
    return f"{label} {value:+.0f} pts"



def _background_gap_direction_scan(symbol):
    """Warn on a gap recovery/reversal that blocks the stale/opposite side."""
    try:
        now = ist_now()
        minutes = now.hour * 60 + now.minute
        if minutes < 9 * 60 + 15 or minutes > 10 * 60 + 30:
            return
        data = build_dashboard(symbol, cache_ttl=15) or {}
        analytics = data.get("analytics") or {}
        gap = analytics.get("openingGap") or {}
        if not gap.get("available"):
            return
        conflict_side = str(gap.get("conflictSide") or "").upper()
        state = str(gap.get("state") or "").upper()
        from_open = safe_float(gap.get("fromOpenPct"), None)
        gap_pct = safe_float(gap.get("gapPct"), None)
        if conflict_side not in ("CE", "PE") or from_open is None:
            return
        if not any(token in state for token in ("RECOVERY", "FILLING", "REVERSAL", "OPENING RANGE")):
            return
        body = f"Gap {gap_pct:+.2f}% · from open {from_open:+.2f}% | {conflict_side} blocked while current direction opposes it · review chart, no entry"
        _background_push_all(
            f"⚠️ {symbol} {state}",
            body,
            {
                "type": "server-gap-direction-watch",
                "symbol": symbol,
                "state": state,
                "conflictSide": conflict_side,
                "gapPct": gap_pct,
                "fromOpenPct": from_open,
                "createdAt": int(time.time() * 1000),
            },
            gate_key=f"server:gap:{now.strftime('%Y-%m-%d')}:{symbol}:{state}:{conflict_side}",
            score=65,
            cooldown_seconds=20 * 60,
            score_upgrade=100,
        )
    except Exception as exc:
        _BACKGROUND_ATTENTION_STATUS["lastError"] = f"gap {symbol}: {exc}"

def _background_prepare_scan(symbol):
    """20N1 price-first option-buyer wake-up scan.

    The backend only decides directional attention, never an option entry.
    Current price evidence is weighted so a valid intraday reversal is not
    blocked forever by the original from-open direction. OI/PCR/breadth remain
    analytics only and do not vote the CE/PE side here.

    Weights:
      - from-open direction: 20
      - recent 1m move:      20
      - recent 3m move:      30
      - VWAP side:           30

    DIRECTION CONFIRMED can occur before the full breakout/breakdown if current
    3m + VWAP + weighted momentum are strong. The phone still requires its own
    timing/contract/premium checks before ENTRY READY.
    """
    try:
        data = build_dashboard(symbol, cache_ttl=20) or {}
        spot = safe_float((data.get("spot") or {}).get("ltp"), None)
        if _background_valid_index_price(symbol, spot) is None:
            return

        analytics = data.get("analytics") or {}
        gap = analytics.get("openingGap") or {}
        zone = analytics.get("tradeZones") or {}
        breakout = analytics.get("breakoutBreakdown") or {}

        now = ist_now()
        if now.hour == 9 and now.minute < 20:
            return
        if not gap.get("available"):
            return

        history = _BACKGROUND_SPOT_HISTORY.get(symbol) or []
        if len(history) < 3:
            return

        limits = BACKGROUND_DIRECTION_LIMITS[symbol]
        now_ts = time.time()
        move1m = _background_move(history, now_ts, 60)
        move3m = _background_move(history, now_ts, 180)
        dir1 = _background_direction(move1m, limits["m1"])
        dir3 = _background_direction(move3m, limits["m3"])
        from_open_dir = str(gap.get("intradayDirection") or "FLAT").upper()
        if from_open_dir not in ("UP", "DOWN"):
            from_open_dir = "FLAT"

        vwap = safe_float(zone.get("vwap"), None)
        if vwap is None:
            vwap = safe_float(analytics.get("vwap"), None)
        if vwap is None:
            vwap = safe_float((data.get("spot") or {}).get("vwap"), None)
        vwap_dir = "FLAT"
        if vwap is not None:
            if spot > vwap:
                vwap_dir = "UP"
            elif spot < vwap:
                vwap_dir = "DOWN"

        weights = {
            "fromOpen": (from_open_dir, 20),
            "1m": (dir1, 20),
            "3m": (dir3, 30),
            "VWAP": (vwap_dir, 30),
        }

        def vote(candidate):
            return sum(weight for direction_value, weight in weights.values() if direction_value == candidate)

        up_score = vote("UP")
        down_score = vote("DOWN")
        best_score = max(up_score, down_score)
        lead = abs(up_score - down_score)
        if best_score < 50 or lead < 20:
            return

        direction = "UP" if up_score > down_score else "DOWN"
        side = "CE" if direction == "UP" else "PE"
        opposite_score = down_score if direction == "UP" else up_score

        # Current 3m and VWAP are the execution anchors. A single lagging input
        # (including the original from-open side) is allowed, but broad current
        # opposition keeps the alert at WAIT.
        if opposite_score >= 50:
            return
        if dir3 not in ("FLAT", direction) and vwap_dir not in ("FLAT", direction):
            return

        breakout_signal = str(breakout.get("signal") or "").lower()
        trigger = safe_float(
            breakout.get("breakoutLevel") if side == "CE" else breakout.get("breakdownLevel"),
            None,
        )
        if trigger is None:
            return

        trigger_cleared = (
            (side == "CE" and (spot >= trigger or breakout_signal == "breakout"))
            or (side == "PE" and (spot <= trigger or breakout_signal == "breakdown"))
        )

        server_buffer = safe_float(zone.get("buffer"), 0) or 0
        option_buyer_buffer = 18 if symbol == "NIFTY" else 45 if symbol == "BANKNIFTY" else 90
        early_buffer = max(server_buffer, option_buyer_buffer)
        distance = (trigger - spot) if side == "CE" else (spot - trigger)
        near_trigger = (not trigger_cleared) and 0 <= distance <= early_buffer

        momentum_active = bool(
            (dir1 == direction and abs(move1m or 0) >= limits["m1"] * 1.15)
            or (dir3 == direction and abs(move3m or 0) >= limits["m3"] * 1.05)
        )

        current_anchor = bool(dir3 == direction and vwap_dir == direction)
        watch = bool(
            best_score >= 50
            and (dir1 == direction or dir3 == direction)
            and vwap_dir in (direction, "FLAT")
        )
        if not watch:
            return

        confirmed = bool(
            best_score >= 70
            and current_anchor
            and (trigger_cleared or near_trigger or momentum_active)
        )

        state = "DIRECTION CONFIRMED" if confirmed else "WATCH"
        score = min(92, max(55, best_score + (8 if trigger_cleared else 4 if near_trigger else 0)))

        evidence = []
        for label, (direction_value, _weight) in weights.items():
            if direction_value == direction:
                evidence.append(label)
        if trigger_cleared:
            evidence.append("trigger")
        elif near_trigger:
            evidence.append("near trigger")
        if momentum_active:
            evidence.append("momentum")

        title = f"{'🔔🔔' if confirmed else '🔔'} {symbol} {side} {state}"
        moves = [x for x in (_background_signed("1m", move1m), _background_signed("3m", move3m)) if x]
        body = f"Price alignment {best_score}/100 · " + " + ".join(evidence[:4])
        if moves:
            body += " | " + " · ".join(moves)
        if confirmed:
            if trigger_cleared:
                body += " | Direction confirmed; price trigger cleared · WAIT for option premium entry confirmation"
            else:
                body += " | Direction confirmed early; option-buyer momentum active · WAIT for timing + premium confirmation"
        else:
            body += f" | Setup developing near {trigger:.0f} · no entry yet"

        _background_push_all(
            title,
            body,
            {
                "type": "server-direction-first-watch",
                "symbol": symbol,
                "side": side,
                "direction": direction,
                "state": state,
                "alignmentScore": best_score,
                "oppositeScore": opposite_score,
                "trigger": round2(trigger),
                "triggerCleared": trigger_cleared,
                "nearTrigger": near_trigger,
                "momentumActive": momentum_active,
                "move1m": round2(move1m),
                "move3m": round2(move3m),
                "createdAt": int(time.time() * 1000),
            },
            gate_key=f"server:direction20n1:{symbol}:{side}:{state}",
            score=score,
            cooldown_seconds=10 * 60 if confirmed else 7 * 60,
            score_upgrade=8,
        )
    except Exception as exc:
        _BACKGROUND_ATTENTION_STATUS["lastError"] = f"direction20n1 {symbol}: {exc}"

def _background_cas_scan(symbol, now_ts):
    """Closing-session review with verified futures required.

    Options-implied levels are context. A server CAS alert is permitted only
    when an actual configured future quote exists, is sane versus spot, and its
    recent movement agrees with the persistent options-implied movement.
    """
    try:
        data = build_dashboard(symbol, cache_ttl=10) or {}
        spot = safe_float((data.get("spot") or {}).get("ltp"), None)
        chain = data.get("optionChain") or []
        if _background_valid_index_price(symbol, spot) is None or not isinstance(chain, list) or len(chain) < 3:
            return

        cfg = INDEX_MAP.get(symbol) or {}
        future_symbol = cfg.get("future")
        future_raw = get_quote_block(future_symbol) if future_symbol else {}
        future_metrics = extract_quote_metrics(future_raw or {})
        future_ltp = safe_float(future_metrics.get("ltp"), None)
        if future_ltp is None or spot in (None, 0):
            return
        # Reject stale/cross-routed futures. A normal index-future basis should
        # remain comfortably inside this wide safety band.
        if abs(future_ltp - spot) / spot > 0.0075:
            return

        implied = safe_float(infer_spot_from_option_chain(chain), None)
        if implied is None or abs(implied - spot) / spot > 0.03:
            return

        history = _BACKGROUND_CAS_HISTORY.setdefault(symbol, [])
        history.append({"ts": now_ts, "value": implied, "future": future_ltp})
        history[:] = [x for x in history if now_ts - float(x.get("ts") or 0) <= 5 * 60][-30:]

        m30 = _background_move(history, now_ts, 30)
        m60 = _background_move(history, now_ts, 60)
        m180 = _background_move(history, now_ts, 180)
        direction = _background_direction(m60, 8)
        if direction == "FLAT":
            direction = _background_direction(m30, 5)
        if direction == "FLAT":
            direction = _background_direction(m180, 12)
        if direction == "FLAT":
            return

        votes = [_background_direction(m30, 3), _background_direction(m60, 5), _background_direction(m180, 8)]
        persistence = sum(1 for item in votes if item == direction)
        building = persistence >= 1 and (abs(m30 or 0) >= 5 or abs(m60 or 0) >= 8 or abs(m180 or 0) >= 12)
        review = persistence >= 2 and (abs(m60 or 0) >= 12 or (abs(m30 or 0) >= 8 and abs(m180 or 0) >= 15))
        if not building:
            return

        fm30 = _background_move(history, now_ts, 30, key="future")
        fm60 = _background_move(history, now_ts, 60, key="future")
        fm180 = _background_move(history, now_ts, 180, key="future")
        future_direction = _background_direction(fm60, 5)
        if future_direction == "FLAT":
            future_direction = _background_direction(fm30, 3)
        if future_direction == "FLAT":
            future_direction = _background_direction(fm180, 8)
        future_votes = [_background_direction(fm30, 2), _background_direction(fm60, 4), _background_direction(fm180, 6)]
        future_persistence = sum(1 for item in future_votes if item == direction)
        if future_direction != direction or future_persistence < 1:
            return

        side = "CE" if direction == "UP" else "PE"
        state = "REVIEW" if review else "BUILDING"
        score = 78 if review else 64
        moves = [x for x in (_background_signed("30s", m30), _background_signed("1m", m60), _background_signed("3m", m180)) if x]
        future_moves = [x for x in (_background_signed("Fut 30s", fm30), _background_signed("Fut 1m", fm60), _background_signed("Fut 3m", fm180)) if x]
        title = f"{'🔔🔔' if review else '🔔'} {symbol} {side} CAS {state}"
        body = " · ".join(moves[:3])
        if future_moves:
            body += " | " + " · ".join(future_moves[:2])
        body += " | Verified future agrees · review only before RMS cut-off"
        _background_push_all(
            title,
            body,
            {
                "type": "server-cas-watch",
                "symbol": symbol,
                "side": side,
                "state": state,
                "implied": round2(implied),
                "future": round2(future_ltp),
                "createdAt": int(time.time() * 1000),
            },
            gate_key=f"server:cas20n:{state}:{symbol}:{direction}",
            score=score,
            cooldown_seconds=6 * 60 if not review else 12 * 60,
            score_upgrade=8,
        )
    except Exception as exc:
        _BACKGROUND_ATTENTION_STATUS["lastError"] = f"CAS20N {symbol}: {exc}"

def background_attention_monitor_loop():
    # Mark the worker-owned monitor alive immediately. Under gunicorn the app
    # is imported inside the worker, so status must not wait behind startup sleep.
    _BACKGROUND_ATTENTION_STATUS["running"] = True
    _BACKGROUND_ATTENTION_STATUS["lastCycleAt"] = ist_now().isoformat(timespec="seconds")
    _BACKGROUND_ATTENTION_STATUS["lastError"] = None
    time.sleep(2)
    last_deep_scan = 0.0

    while True:
        try:
            now = ist_now()
            now_ts = time.time()
            if not background_attention_monitor_enabled() or not background_attention_market_window(now):
                _BACKGROUND_ATTENTION_STATUS["running"] = background_attention_monitor_enabled()
                _BACKGROUND_ATTENTION_STATUS["lastCycleAt"] = now.isoformat(timespec="seconds")
                time.sleep(BACKGROUND_ATTENTION_INTERVAL)
                continue

            # A persisted FYERS access token can exist while the in-memory SDK
            # client is still None after a fresh Render/gunicorn worker boot.
            # Rehydrate it before the server-side scan needs market data.
            if fyers is None and os.getenv("FYERS_ACCESS_TOKEN", "").strip():
                refresh_fyers_from_env(force=True)

            home = build_home_dashboard() or {}
            cards = home.get("indices") or {}

            for symbol in BACKGROUND_INDEX_SYMBOLS:
                card = cards.get(symbol) or {}
                spot = _background_valid_index_price(symbol, (card.get("spot") or {}).get("ltp"))
                if spot is None:
                    continue

                history = _BACKGROUND_SPOT_HISTORY.setdefault(symbol, [])
                history.append({"ts": now_ts, "value": spot})
                history[:] = [x for x in history if now_ts - float(x.get("ts") or 0) <= 5 * 60][-30:]

                move = _background_fast_move(symbol, history, now_ts)
                if move.get("qualified"):
                    direction = move["direction"]
                    side = "CE" if direction == "UP" else "PE"
                    vwap = safe_float((card.get("spot") or {}).get("vwap"), None)
                    evidence = []
                    vwap_aligned = vwap is not None and ((direction == "UP" and spot > vwap) or (direction == "DOWN" and spot < vwap))
                    if vwap_aligned:
                        evidence.append("VWAP")

                    # FAST MOVE is only a wake-up, never an entry. Still require
                    # VWAP agreement so a stale day-bias cannot promote the wrong side.
                    if vwap_aligned:
                        pieces = [x for x in (
                            _background_signed("30s", move.get("move30s")),
                            _background_signed("1m", move.get("move1m")),
                            _background_signed("3m", move.get("move3m")),
                        ) if x]
                        body = " · ".join(pieces)
                        if evidence:
                            body += " | " + " + ".join(evidence)
                        body += " | Open chart now · no entry yet"
                        _background_push_all(
                            f"⚡ {symbol} {side} WATCH {'↑' if direction == 'UP' else '↓'}",
                            body,
                            {
                                "type": "server-fast-move-watch",
                                "symbol": symbol,
                                "side": side,
                                "direction": direction,
                                "score": move["score"],
                                "createdAt": int(now_ts * 1000),
                            },
                            gate_key=f"server:fast:{symbol}:{direction}",
                            score=move["score"],
                            cooldown_seconds=8 * 60,
                            score_upgrade=10,
                        )

            if now_ts - last_deep_scan >= BACKGROUND_DEEP_SCAN_INTERVAL:
                for symbol in BACKGROUND_INDEX_SYMBOLS:
                    _background_gap_direction_scan(symbol)
                    _background_prepare_scan(symbol)
                last_deep_scan = now_ts
                _BACKGROUND_ATTENTION_STATUS["lastDeepScanAt"] = now.isoformat(timespec="seconds")

            if background_cas_window(now):
                for symbol in BACKGROUND_INDEX_SYMBOLS:
                    _background_cas_scan(symbol, now_ts)

            _BACKGROUND_ATTENTION_STATUS["lastCycleAt"] = now.isoformat(timespec="seconds")
            _BACKGROUND_ATTENTION_STATUS["lastError"] = None
        except Exception as exc:
            _BACKGROUND_ATTENTION_STATUS["lastError"] = str(exc)

        time.sleep(BACKGROUND_ATTENTION_INTERVAL)


# --- V2.0.20N DIRECTION-FIRST OPTION-BUYER ENGINE START ---
# Price/open + recent direction + VWAP -> setup trigger -> option premium on mobile.
# PCR/OI/day-bias cannot choose the opposite option side.
# --- V2.0.20M GAP DIRECTION SAFETY START ---
# Gap-up/gap-down context, current-vs-open direction veto, and opening-session monitoring.
# --- V2.0.20L ALERT UX START ---
# Notification-copy-only update; 20K thresholds, cooldowns and monitor lifecycle are unchanged.
# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR START ---
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

# --- V2.0.20K BACKGROUND ATTENTION MONITOR END ---





if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", debug=False, port=5000, use_reloader=False, allow_unsafe_werkzeug=True)
