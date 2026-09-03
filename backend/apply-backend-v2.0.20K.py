from __future__ import annotations

import argparse
import py_compile
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PATCH_MARKER = "# --- V2.0.20K BACKGROUND ATTENTION MONITOR START ---"
BUILD_MARKER = 'SERVER_BUILD_MARKER = "v2.0.20k-attention-20260901"'
TABLE_ANCHOR = '    cursor.execute("CREATE INDEX IF NOT EXISTS idx_device_push_tokens_active ON device_push_tokens(active)")'
TABLE_SNIPPET = r'''
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS server_alert_state (
            alert_key TEXT PRIMARY KEY,
            last_sent_ts REAL NOT NULL,
            last_score REAL NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
    """)
'''
MONITOR_BLOCK = r'''
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


def background_attention_monitor_enabled():
    return str(os.getenv(BACKGROUND_ATTENTION_ENV, "1")).strip().lower() not in ("0", "false", "off", "no")


def background_attention_market_window(now=None):
    now = now or ist_now()
    if now.weekday() >= 5:
        return False
    minutes = now.hour * 60 + now.minute
    # FYERS intraday monitoring starts at 09:30 on this backend. Stop before
    # broker RMS/safety cut-off so no new-entry-style wake-up is created late.
    return 9 * 60 + 30 <= minutes <= 15 * 60 + 24


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


def _background_active_tokens():
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT token FROM device_push_tokens WHERE active = 1")
        tokens = [str(row[0]).strip() for row in cursor.fetchall() if row and valid_expo_push_token(row[0])]
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
    tokens = _background_active_tokens()
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


def _background_prepare_scan(symbol):
    try:
        data = build_dashboard(symbol, cache_ttl=20) or {}
        spot = safe_float((data.get("spot") or {}).get("ltp"), None)
        if _background_valid_index_price(symbol, spot) is None:
            return

        analytics = data.get("analytics") or {}
        panel = analytics.get("tradeSignalPanel") or {}
        zone = analytics.get("tradeZones") or {}
        breakout = analytics.get("breakoutBreakdown") or {}

        bias = str(panel.get("bias") or "").strip().lower()
        side = "CE" if bias == "bullish" else "PE" if bias == "bearish" else None
        if not side:
            return

        confidence = safe_float(panel.get("confidence"), 0) or 0
        vwap = safe_float(zone.get("vwap"), None)
        vwap_aligned = vwap is not None and ((side == "CE" and spot > vwap) or (side == "PE" and spot < vwap))
        vwap_opposed = vwap is not None and ((side == "CE" and spot < vwap) or (side == "PE" and spot > vwap))

        confirmations = []
        if vwap_aligned:
            confirmations.append("VWAP")
        if str(zone.get("priceSide") or "").upper() == side:
            confirmations.append("price")
        if str(zone.get("oiSide") or "").upper() == side:
            confirmations.append("OI")
        if bool(zone.get("volumeReady")) and str(zone.get("volumeSide") or "").upper() in (side, "MIXED"):
            confirmations.append("volume")

        breakout_signal = str(breakout.get("signal") or "").lower()
        if (side == "CE" and breakout_signal == "breakout") or (side == "PE" and breakout_signal == "breakdown"):
            confirmations.append("trigger")

        trigger = safe_float(
            breakout.get("breakoutLevel") if side == "CE" else breakout.get("breakdownLevel"),
            None,
        )
        buffer_points = max(safe_float(zone.get("buffer"), 0) or 0, 12 if symbol == "NIFTY" else 25 if symbol == "BANKNIFTY" else 45)
        near_trigger = False
        if trigger is not None:
            distance = (trigger - spot) if side == "CE" else (spot - trigger)
            near_trigger = 0 <= distance <= buffer_points * 1.5
            if near_trigger:
                confirmations.append("near trigger")

        score = max(55, min(92, round(max(confidence, 50) + max(0, len(confirmations) - 1) * 5)))
        if confidence < 50 or vwap_opposed or len(confirmations) < 2 or score < 55:
            return

        title = f"🔔 {symbol} PREPARE · {side} WATCH"
        body = " + ".join(confirmations[:3]) + f" | setup {score}/100 | Open chart and get ready · no entry yet"
        _background_push_all(
            title,
            body,
            {
                "type": "server-prepare-watch",
                "symbol": symbol,
                "side": side,
                "score": score,
                "createdAt": int(time.time() * 1000),
            },
            gate_key=f"server:prepare:{symbol}:{side}",
            score=score,
            cooldown_seconds=12 * 60,
            score_upgrade=8,
        )
    except Exception as exc:
        _BACKGROUND_ATTENTION_STATUS["lastError"] = f"prepare {symbol}: {exc}"


def _background_cas_scan(symbol, now_ts):
    try:
        data = build_dashboard(symbol, cache_ttl=10) or {}
        spot = safe_float((data.get("spot") or {}).get("ltp"), None)
        chain = data.get("optionChain") or []
        if _background_valid_index_price(symbol, spot) is None or not isinstance(chain, list) or len(chain) < 3:
            return

        implied = safe_float(infer_spot_from_option_chain(chain), None)
        if implied is None or abs(implied - spot) / spot > 0.03:
            return

        history = _BACKGROUND_CAS_HISTORY.setdefault(symbol, [])
        history.append({"ts": now_ts, "value": implied})
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

        votes = [
            _background_direction(m30, 3),
            _background_direction(m60, 5),
            _background_direction(m180, 8),
        ]
        persistence = sum(1 for item in votes if item == direction)
        building = persistence >= 1 and (abs(m30 or 0) >= 5 or abs(m60 or 0) >= 8 or abs(m180 or 0) >= 12)
        review = persistence >= 2 and (abs(m60 or 0) >= 12 or (abs(m30 or 0) >= 8 and abs(m180 or 0) >= 15))
        if not building:
            return

        side = "CE" if direction == "UP" else "PE"
        state = "REVIEW NOW" if review else "BUILDING"
        score = 75 if review else 62
        moves = [x for x in (_background_signed("30s", m30), _background_signed("1m", m60), _background_signed("3m", m180)) if x]
        title = f"{'🟢' if direction == 'UP' else '🔴'} {symbol} CAS {state} · {side} WATCH"
        body = " · ".join(moves) + " | Derivative movement, not spot-gap | Open CAS chart · review only"
        _background_push_all(
            title,
            body,
            {
                "type": "server-cas-watch",
                "symbol": symbol,
                "side": side,
                "state": state,
                "implied": round2(implied),
                "createdAt": int(time.time() * 1000),
            },
            gate_key=f"server:cas:{state}:{symbol}:{direction}",
            score=score,
            cooldown_seconds=6 * 60 if not review else 12 * 60,
            score_upgrade=8,
        )
    except Exception as exc:
        _BACKGROUND_ATTENTION_STATUS["lastError"] = f"CAS {symbol}: {exc}"


def background_attention_monitor_loop():
    time.sleep(12)
    _BACKGROUND_ATTENTION_STATUS["running"] = True
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
                    quick_bias = str(card.get("quickBias") or "").lower()
                    evidence = []
                    if (direction == "UP" and quick_bias == "bullish") or (direction == "DOWN" and quick_bias == "bearish"):
                        evidence.append("market bias")
                    if vwap is not None and ((direction == "UP" and spot > vwap) or (direction == "DOWN" and spot < vwap)):
                        evidence.append("VWAP")

                    if evidence or move["score"] >= 72:
                        pieces = [x for x in (
                            _background_signed("30s", move.get("move30s")),
                            _background_signed("1m", move.get("move1m")),
                            _background_signed("3m", move.get("move3m")),
                        ) if x]
                        body = " · ".join(pieces)
                        if evidence:
                            body += " | " + " + ".join(evidence)
                        body += f" | {side} side developing | Open chart now · no entry yet"
                        _background_push_all(
                            f"⚡ {symbol} FAST MOVE WATCH {'↑' if direction == 'UP' else '↓'}",
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


@app.route('/api/device/attention-status', methods=['GET'])
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

# --- V2.0.20K BACKGROUND ATTENTION MONITOR END ---

'''


def ensure_20j(server_path: Path) -> None:
    text = server_path.read_text(encoding="utf-8")
    if "# --- V2.0.20J DEVICE PUSH START ---" in text:
        return

    helper = Path(__file__).resolve().parent / "apply-backend-v2.0.20J.py"
    if not helper.exists():
        raise SystemExit("V2.0.20J prerequisite helper is missing from this patch ZIP.")
    print("20J push-registration base is not present; applying it automatically first...")
    subprocess.run([sys.executable, str(helper), str(server_path)], check=True)


def patch_server(path: Path) -> None:
    if not path.exists() or not path.is_file():
        raise SystemExit(f"server.py not found: {path}")

    ensure_20j(path)
    original = path.read_text(encoding="utf-8")

    if PATCH_MARKER in original:
        print("V2.0.20K background attention patch is already present.")
        py_compile.compile(str(path), doraise=True)
        print("Python syntax check passed.")
        return

    required = [
        "# --- V2.0.20J DEVICE PUSH START ---",
        "def send_expo_push_notification(",
        "def build_home_dashboard():",
        "def build_dashboard(",
        "def infer_spot_from_option_chain(",
        "device_push_tokens",
        "if __name__ == \"__main__\":",
    ]
    missing = [x for x in required if x not in original]
    if missing:
        raise SystemExit("Expected OptionsDesk backend pieces are missing: " + ", ".join(missing))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.name}.backup-v2.0.20K-{stamp}")
    shutil.copy2(path, backup)

    patched = original

    if "CREATE TABLE IF NOT EXISTS server_alert_state" not in patched:
        if TABLE_ANCHOR not in patched:
            raise SystemExit("Could not find the device-push table anchor.")
        patched = patched.replace(TABLE_ANCHOR, TABLE_ANCHOR + TABLE_SNIPPET, 1)

    # The 20J routes deliberately reported false. After 20K this reflects the
    # real environment-controlled background attention monitor state.
    patched = patched.replace(
        '"serverMonitorEnabled": False,',
        '"serverMonitorEnabled": background_attention_monitor_enabled(),',
    )

    anchor = 'if __name__ == "__main__":'
    if anchor not in patched:
        raise SystemExit("Could not find server main anchor.")
    patched = patched.replace(anchor, MONITOR_BLOCK + "\n" + anchor, 1)

    marker_re = re.compile(r'(?m)^SERVER_BUILD_MARKER\s*=\s*[\'\"][^\'\"]*[\'\"]\s*$')
    if marker_re.search(patched):
        patched = marker_re.sub(BUILD_MARKER, patched, count=1)

    compile(patched, str(path), "exec")
    path.write_text(patched, encoding="utf-8")
    py_compile.compile(str(path), doraise=True)

    print("V2.0.20K backend attention-monitor patch applied successfully.")
    print(f"Backup: {backup}")
    print("Python syntax check passed.")
    print("Background FAST MOVE / PREPARE / CAS wake-up monitor defaults to ON.")
    print("Set ENABLE_BACKGROUND_ATTENTION_MONITOR=0 on Render only if you intentionally want it disabled.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply OptionsDesk backend V2.0.20K attention-monitor patch")
    parser.add_argument("server", nargs="?", default="server.py", help="Path to backend server.py")
    args = parser.parse_args()
    patch_server(Path(args.server).resolve())


if __name__ == "__main__":
    main()
