from __future__ import annotations
import py_compile
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BUILD_L = 'SERVER_BUILD_MARKER = "v2.0.20l-alert-ux-20260902"'
BUILD_M = 'SERVER_BUILD_MARKER = "v2.0.20m-gap-direction-safety-20260902"'
BUILD_M1 = 'SERVER_BUILD_MARKER = "v2.0.20m1-gap-visibility-safety-20260902"'
BUILD_N = 'SERVER_BUILD_MARKER = "v2.0.20n-direction-first-20260902"'
MARKER = '# --- V2.0.20N DIRECTION-FIRST OPTION-BUYER ENGINE START ---'

NEW_PREPARE = 'def _background_prepare_scan(symbol):\n    """20N Direction-First wake-up scan.\n\n    Price decides direction: today\'s from-open move, recent 1m/3m movement and\n    VWAP. OI/PCR/breadth do not vote the engine onto CE/PE. Breakout/breakdown\n    is the setup trigger. This server scan never declares an option ENTRY READY;\n    the phone still requires selected-option premium confirmation.\n    """\n    try:\n        data = build_dashboard(symbol, cache_ttl=20) or {}\n        spot = safe_float((data.get("spot") or {}).get("ltp"), None)\n        if _background_valid_index_price(symbol, spot) is None:\n            return\n\n        analytics = data.get("analytics") or {}\n        gap = analytics.get("openingGap") or {}\n        zone = analytics.get("tradeZones") or {}\n        breakout = analytics.get("breakoutBreakdown") or {}\n\n        now = ist_now()\n        if now.hour == 9 and now.minute < 20:\n            return\n        if not gap.get("available"):\n            return\n\n        history = _BACKGROUND_SPOT_HISTORY.get(symbol) or []\n        if len(history) < 3:\n            return\n        limits = BACKGROUND_DIRECTION_LIMITS[symbol]\n        now_ts = time.time()\n        move1m = _background_move(history, now_ts, 60)\n        move3m = _background_move(history, now_ts, 180)\n        dir1 = _background_direction(move1m, limits["m1"])\n        dir3 = _background_direction(move3m, limits["m3"])\n        from_open_dir = str(gap.get("intradayDirection") or "FLAT").upper()\n        if from_open_dir not in ("UP", "DOWN"):\n            from_open_dir = "FLAT"\n\n        direction = "FLAT"\n        if dir1 != "FLAT" and dir1 == dir3:\n            direction = dir1\n        elif from_open_dir != "FLAT":\n            short_dirs = [item for item in (dir1, dir3) if item != "FLAT"]\n            if not any(item != from_open_dir for item in short_dirs) and (not short_dirs or any(item == from_open_dir for item in short_dirs)):\n                direction = from_open_dir\n        if direction == "FLAT":\n            return\n\n        # A material from-open move in the opposite direction is a hard veto.\n        if from_open_dir != "FLAT" and from_open_dir != direction:\n            return\n        side = "CE" if direction == "UP" else "PE"\n        if str(gap.get("conflictSide") or "").upper() == side:\n            return\n\n        vwap = safe_float(zone.get("vwap"), None)\n        if vwap is None:\n            vwap = safe_float((data.get("spot") or {}).get("vwap"), None)\n        vwap_aligned = vwap is not None and ((direction == "UP" and spot > vwap) or (direction == "DOWN" and spot < vwap))\n        if not vwap_aligned:\n            return\n\n        breakout_signal = str(breakout.get("signal") or "").lower()\n        trigger = safe_float(breakout.get("breakoutLevel") if side == "CE" else breakout.get("breakdownLevel"), None)\n        if trigger is None:\n            return\n        trigger_cleared = (side == "CE" and (spot >= trigger or breakout_signal == "breakout")) or (side == "PE" and (spot <= trigger or breakout_signal == "breakdown"))\n        buffer_points = max(safe_float(zone.get("buffer"), 0) or 0, 12 if symbol == "NIFTY" else 25 if symbol == "BANKNIFTY" else 45)\n        distance = (trigger - spot) if side == "CE" else (spot - trigger)\n        near_trigger = (not trigger_cleared) and 0 <= distance <= buffer_points * 1.5\n        if not trigger_cleared and not near_trigger:\n            return\n\n        evidence = []\n        if from_open_dir == direction:\n            evidence.append("from-open")\n        if dir1 == direction:\n            evidence.append("1m")\n        if dir3 == direction:\n            evidence.append("3m")\n        evidence.append("VWAP")\n        evidence.append("trigger" if trigger_cleared else "near trigger")\n        if len(evidence) < 3:\n            return\n\n        confirmed = bool(trigger_cleared and (dir1 == direction or dir3 == direction))\n        state = "DIRECTION CONFIRMED" if confirmed else "WATCH"\n        score = min(90, (76 if confirmed else 62) + max(0, len(evidence) - 3) * 3)\n        title = f"{\'🔔🔔\' if confirmed else \'🔔\'} {symbol} {side} {state}"\n        moves = [x for x in (_background_signed("1m", move1m), _background_signed("3m", move3m)) if x]\n        body = " + ".join(evidence[:4])\n        if moves:\n            body += " | " + " · ".join(moves)\n        body += " | " + ("Direction confirmed · WAIT for option premium entry confirmation" if confirmed else f"Wait for {trigger:.0f} trigger · no entry yet")\n        _background_push_all(\n            title,\n            body,\n            {\n                "type": "server-direction-first-watch",\n                "symbol": symbol,\n                "side": side,\n                "direction": direction,\n                "state": state,\n                "trigger": round2(trigger),\n                "move1m": round2(move1m),\n                "move3m": round2(move3m),\n                "createdAt": int(time.time() * 1000),\n            },\n            gate_key=f"server:direction20n:{symbol}:{side}:{state}",\n            score=score,\n            cooldown_seconds=12 * 60 if confirmed else 8 * 60,\n            score_upgrade=8,\n        )\n    except Exception as exc:\n        _BACKGROUND_ATTENTION_STATUS["lastError"] = f"direction20n {symbol}: {exc}"'
NEW_CAS = 'def _background_cas_scan(symbol, now_ts):\n    """Closing-session review with verified futures required.\n\n    Options-implied levels are context. A server CAS alert is permitted only\n    when an actual configured future quote exists, is sane versus spot, and its\n    recent movement agrees with the persistent options-implied movement.\n    """\n    try:\n        data = build_dashboard(symbol, cache_ttl=10) or {}\n        spot = safe_float((data.get("spot") or {}).get("ltp"), None)\n        chain = data.get("optionChain") or []\n        if _background_valid_index_price(symbol, spot) is None or not isinstance(chain, list) or len(chain) < 3:\n            return\n\n        cfg = INDEX_MAP.get(symbol) or {}\n        future_symbol = cfg.get("future")\n        future_raw = get_quote_block(future_symbol) if future_symbol else {}\n        future_metrics = extract_quote_metrics(future_raw or {})\n        future_ltp = safe_float(future_metrics.get("ltp"), None)\n        if future_ltp is None or spot in (None, 0):\n            return\n        # Reject stale/cross-routed futures. A normal index-future basis should\n        # remain comfortably inside this wide safety band.\n        if abs(future_ltp - spot) / spot > 0.0075:\n            return\n\n        implied = safe_float(infer_spot_from_option_chain(chain), None)\n        if implied is None or abs(implied - spot) / spot > 0.03:\n            return\n\n        history = _BACKGROUND_CAS_HISTORY.setdefault(symbol, [])\n        history.append({"ts": now_ts, "value": implied, "future": future_ltp})\n        history[:] = [x for x in history if now_ts - float(x.get("ts") or 0) <= 5 * 60][-30:]\n\n        m30 = _background_move(history, now_ts, 30)\n        m60 = _background_move(history, now_ts, 60)\n        m180 = _background_move(history, now_ts, 180)\n        direction = _background_direction(m60, 8)\n        if direction == "FLAT":\n            direction = _background_direction(m30, 5)\n        if direction == "FLAT":\n            direction = _background_direction(m180, 12)\n        if direction == "FLAT":\n            return\n\n        votes = [_background_direction(m30, 3), _background_direction(m60, 5), _background_direction(m180, 8)]\n        persistence = sum(1 for item in votes if item == direction)\n        building = persistence >= 1 and (abs(m30 or 0) >= 5 or abs(m60 or 0) >= 8 or abs(m180 or 0) >= 12)\n        review = persistence >= 2 and (abs(m60 or 0) >= 12 or (abs(m30 or 0) >= 8 and abs(m180 or 0) >= 15))\n        if not building:\n            return\n\n        fm30 = _background_move(history, now_ts, 30, key="future")\n        fm60 = _background_move(history, now_ts, 60, key="future")\n        fm180 = _background_move(history, now_ts, 180, key="future")\n        future_direction = _background_direction(fm60, 5)\n        if future_direction == "FLAT":\n            future_direction = _background_direction(fm30, 3)\n        if future_direction == "FLAT":\n            future_direction = _background_direction(fm180, 8)\n        future_votes = [_background_direction(fm30, 2), _background_direction(fm60, 4), _background_direction(fm180, 6)]\n        future_persistence = sum(1 for item in future_votes if item == direction)\n        if future_direction != direction or future_persistence < 1:\n            return\n\n        side = "CE" if direction == "UP" else "PE"\n        state = "REVIEW" if review else "BUILDING"\n        score = 78 if review else 64\n        moves = [x for x in (_background_signed("30s", m30), _background_signed("1m", m60), _background_signed("3m", m180)) if x]\n        future_moves = [x for x in (_background_signed("Fut 30s", fm30), _background_signed("Fut 1m", fm60), _background_signed("Fut 3m", fm180)) if x]\n        title = f"{\'🔔🔔\' if review else \'🔔\'} {symbol} {side} CAS {state}"\n        body = " · ".join(moves[:3])\n        if future_moves:\n            body += " | " + " · ".join(future_moves[:2])\n        body += " | Verified future agrees · review only before RMS cut-off"\n        _background_push_all(\n            title,\n            body,\n            {\n                "type": "server-cas-watch",\n                "symbol": symbol,\n                "side": side,\n                "state": state,\n                "implied": round2(implied),\n                "future": round2(future_ltp),\n                "createdAt": int(time.time() * 1000),\n            },\n            gate_key=f"server:cas20n:{state}:{symbol}:{direction}",\n            score=score,\n            cooldown_seconds=6 * 60 if not review else 12 * 60,\n            score_upgrade=8,\n        )\n    except Exception as exc:\n        _BACKGROUND_ATTENTION_STATUS["lastError"] = f"CAS20N {symbol}: {exc}"'

FAST_LIMITS = 'BACKGROUND_FAST_LIMITS = {\n    "NIFTY": {"s30": 10.0, "m1": 18.0, "m3": 30.0},\n    "BANKNIFTY": {"s30": 20.0, "m1": 35.0, "m3": 60.0},\n    "SENSEX": {"s30": 35.0, "m1": 60.0, "m3": 100.0},\n}\n'
DIRECTION_LIMITS = '# 20N uses smaller movement thresholds for direction confirmation than the\n# FAST MOVE wake-up. These do not create an entry; they only decide whether a\n# WATCH / DIRECTION CONFIRMED notification is even allowed.\nBACKGROUND_DIRECTION_LIMITS = {\n    "NIFTY": {"m1": 5.0, "m3": 10.0},\n    "BANKNIFTY": {"m1": 10.0, "m3": 20.0},\n    "SENSEX": {"m1": 18.0, "m3": 35.0},\n}\n'

OLD_FAST_BLOCK = '                    vwap = safe_float((card.get("spot") or {}).get("vwap"), None)\n                    quick_bias = str(card.get("quickBias") or "").lower()\n                    evidence = []\n                    if (direction == "UP" and quick_bias == "bullish") or (direction == "DOWN" and quick_bias == "bearish"):\n                        evidence.append("market bias")\n                    if vwap is not None and ((direction == "UP" and spot > vwap) or (direction == "DOWN" and spot < vwap)):\n                        evidence.append("VWAP")\n\n                    if evidence or move["score"] >= 72:\n'
NEW_FAST_BLOCK = '                    vwap = safe_float((card.get("spot") or {}).get("vwap"), None)\n                    evidence = []\n                    vwap_aligned = vwap is not None and ((direction == "UP" and spot > vwap) or (direction == "DOWN" and spot < vwap))\n                    if vwap_aligned:\n                        evidence.append("VWAP")\n\n                    # FAST MOVE is only a wake-up, never an entry. Still require\n                    # VWAP agreement so a stale day-bias cannot promote the wrong side.\n                    if vwap_aligned:\n'
OLD_FAST_TITLE = 'f"⚡ {symbol} {side} FAST MOVE · {move[\'score\']}% {\'↑\' if direction == \'UP\' else \'↓\'}"'
NEW_FAST_TITLE = 'f"⚡ {symbol} {side} WATCH {\'↑\' if direction == \'UP\' else \'↓\'}"'


def run_prereq(script: Path, target: Path):
    print(f'Applying prerequisite: {script.name}')
    subprocess.run([sys.executable, str(script), str(target)], check=True)


def replace_function(text: str, pattern: str, replacement: str, label: str):
    next_text, count = re.subn(pattern, replacement, text, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Could not replace {label} (matches={count}). No changes written.')
    return next_text


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else 'server.py').resolve()
    if not target.exists():
        raise SystemExit(f'server.py not found: {target}')
    patch_root = Path(__file__).resolve().parent
    text = target.read_text(encoding='utf-8')
    if BUILD_N in text and MARKER in text:
        py_compile.compile(str(target), doraise=True)
        print('V2.0.20N backend already applied.')
        return

    # Make the patch convenient if tomorrow's local backend is still 20L/20M.
    if BUILD_L in text:
        run_prereq(patch_root / 'prereq' / 'apply-backend-v2.0.20M.py', target)
        text = target.read_text(encoding='utf-8')
    if BUILD_M in text:
        run_prereq(patch_root / 'prereq' / 'apply-backend-v2.0.20M1.py', target)
        text = target.read_text(encoding='utf-8')
    if BUILD_M1 not in text:
        raise SystemExit('Expected backend V2.0.20L/M/M1 baseline. No changes made.')

    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = target.with_name(f'{target.name}.backup-v2.0.20N-{stamp}')
    shutil.copy2(target, backup)
    try:
        text = text.replace(BUILD_M1, BUILD_N, 1)
        if 'BACKGROUND_DIRECTION_LIMITS = {' not in text:
            if FAST_LIMITS not in text:
                raise RuntimeError('BACKGROUND_FAST_LIMITS block not found')
            text = text.replace(FAST_LIMITS, FAST_LIMITS + DIRECTION_LIMITS, 1)
        text = replace_function(text, r'def _background_prepare_scan\(symbol\):\n.*?(?=\n\ndef _background_cas_scan\(symbol, now_ts\):)', NEW_PREPARE, 'direction-first scan')
        text = replace_function(text, r'def _background_cas_scan\(symbol, now_ts\):\n.*?(?=\n\ndef background_attention_monitor_loop\(\):)', NEW_CAS, 'CAS scan')
        if OLD_FAST_BLOCK in text:
            text = text.replace(OLD_FAST_BLOCK, NEW_FAST_BLOCK, 1)
        elif 'quick_bias = str(card.get("quickBias")' in text:
            raise RuntimeError('FAST MOVE block shape changed; refusing partial patch')
        if OLD_FAST_TITLE in text:
            text = text.replace(OLD_FAST_TITLE, NEW_FAST_TITLE, 1)
        if MARKER not in text:
            anchor = '# --- V2.0.20M GAP DIRECTION SAFETY START ---'
            marker_text = MARKER + '\n# Price/open + recent direction + VWAP -> setup trigger -> option premium on mobile.\n# PCR/OI/day-bias cannot choose the opposite option side.\n'
            text = text.replace(anchor, marker_text + anchor, 1) if anchor in text else text + '\n\n' + marker_text
        target.write_text(text, encoding='utf-8')
        py_compile.compile(str(target), doraise=True)
    except Exception:
        shutil.copy2(backup, target)
        raise
    print('OptionsDesk backend V2.0.20N Direction-First engine applied.')
    print(f'Backup: {backup}')

if __name__ == '__main__':
    main()
