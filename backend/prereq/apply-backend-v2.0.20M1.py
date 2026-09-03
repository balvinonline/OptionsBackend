from __future__ import annotations
import py_compile, shutil, sys
from datetime import datetime
from pathlib import Path

BUILD_OLD = 'SERVER_BUILD_MARKER = "v2.0.20m-gap-direction-safety-20260902"'
BUILD_NEW = 'SERVER_BUILD_MARKER = "v2.0.20m1-gap-visibility-safety-20260902"'
MARKER = '# --- V2.0.20M1 GAP VISIBILITY SAFETY START ---'

def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Required marker not found for {label}. Apply V2.0.20M first.')
    return text.replace(old, new, 1)

def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else 'server.py').resolve()
    if not target.exists():
        raise SystemExit(f'server.py not found: {target}')
    text = target.read_text(encoding='utf-8')
    if BUILD_NEW in text or MARKER in text:
        print('V2.0.20M1 backend hotfix already applied.')
        py_compile.compile(str(target), doraise=True)
        return
    if BUILD_OLD not in text:
        raise SystemExit('V2.0.20M backend is required first. No changes made.')

    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = target.with_name(f'{target.name}.backup-v2.0.20M1-{stamp}')
    shutil.copy2(target, backup)
    try:
        text = replace_once(text, BUILD_OLD, BUILD_NEW, 'build marker')

        old = '''        candles = history.get("candles") or []\n        vwap = compute_session_vwap(candles)\n        volume_snapshot = compute_session_volume_snapshot(candles)\n        latest = candles[-1] if candles else {}\n        latest_close = safe_float(latest.get("close"), None) if isinstance(latest, dict) else None\n        ref_price = price if price is not None else latest_close\n        return {\n            "ltp": latest_close,\n            "vwap": clean_vwap_for_price(vwap, ref_price, max_distance_pct=2.25),\n            **volume_snapshot,\n            "source": "history_5m",\n        }'''
        new = '''        candles = history.get("candles") or []\n        # V2.0.20M1: retain the first real candle open for today's IST session.\n        # Quote feeds can occasionally omit `open`; gap safety must not silently disappear.\n        today = ist_now().date()\n        today_rows = []\n        for row in candles:\n            if not isinstance(row, dict):\n                continue\n            ts = safe_int(row.get("ts"), None)\n            if ts is None:\n                continue\n            try:\n                if datetime.fromtimestamp(ts, IST).date() == today:\n                    today_rows.append(row)\n            except Exception:\n                continue\n        today_open = safe_float(today_rows[0].get("open"), None) if today_rows else None\n        vwap = compute_session_vwap(candles)\n        volume_snapshot = compute_session_volume_snapshot(candles)\n        latest = candles[-1] if candles else {}\n        latest_close = safe_float(latest.get("close"), None) if isinstance(latest, dict) else None\n        ref_price = price if price is not None else latest_close\n        return {\n            "ltp": latest_close,\n            "todayOpen": round2(today_open),\n            "vwap": clean_vwap_for_price(vwap, ref_price, max_distance_pct=2.25),\n            **volume_snapshot,\n            "source": "history_5m",\n        }'''
        text = replace_once(text, old, new, 'history first-candle open')

        old = '''    history_snapshot = get_intraday_history_snapshot(symbol_key, spot_ltp or future_ltp)\n    history_vwap = history_snapshot.get("vwap")\n    if spot.get("vwap") is None and history_vwap is not None:'''
        new = '''    history_snapshot = get_intraday_history_snapshot(symbol_key, spot_ltp or future_ltp)\n    history_open = safe_float(history_snapshot.get("todayOpen"), None)\n    if spot.get("open") in (None, 0) and history_open not in (None, 0):\n        spot["open"] = round2(history_open)\n        spot["open_source"] = "history_5m_first_candle"\n    history_vwap = history_snapshot.get("vwap")\n    if spot.get("vwap") is None and history_vwap is not None:'''
        text = replace_once(text, old, new, 'dashboard opening-price fallback')

        old = '''    blocked_bias = None\n    direction_conflict = False\n    direction_conflict_reason = None\n    selected_side = "CE" if bias == "Bullish" else "PE" if bias == "Bearish" else None\n    conflict_side = str(opening_gap.get("conflictSide") or "").upper()\n    if selected_side and conflict_side == selected_side:\n        blocked_bias = bias\n        direction_conflict = True\n        direction_conflict_reason = opening_gap.get("conflictReason") or "Current direction from today's open opposes this side"\n        bias = "Neutral"\n        action = "Wait - opening/intraday direction conflict"\n        confidence = min(confidence, 55)'''
        new = '''    blocked_bias = None\n    direction_conflict = False\n    direction_conflict_reason = None\n    selected_side = "CE" if bias == "Bullish" else "PE" if bias == "Bearish" else None\n    conflict_side = str(opening_gap.get("conflictSide") or "").upper()\n    if selected_side and not opening_gap.get("available"):\n        blocked_bias = bias\n        direction_conflict = True\n        direction_conflict_reason = "Opening gap / from-open direction unavailable"\n        bias = "Neutral"\n        action = "Wait - opening direction data unavailable"\n        confidence = min(confidence, 50)\n    elif selected_side and conflict_side == selected_side:\n        blocked_bias = bias\n        direction_conflict = True\n        direction_conflict_reason = opening_gap.get("conflictReason") or "Current direction from today's open opposes this side"\n        bias = "Neutral"\n        action = "Wait - opening/intraday direction conflict"\n        confidence = min(confidence, 55)'''
        text = replace_once(text, old, new, 'server missing-gap direction veto')

        old = '''        if not side:\n            return\n        if str(gap.get("conflictSide") or "").upper() == side:\n            return\n\n        confidence = safe_float(panel.get("confidence"), 0) or 0'''
        new = '''        if not side:\n            return\n        # Never emit directional PREPARE when today's opening context is missing.\n        if not gap.get("available"):\n            return\n        if str(gap.get("conflictSide") or "").upper() == side:\n            return\n\n        confidence = safe_float(panel.get("confidence"), 0) or 0'''
        text = replace_once(text, old, new, 'background prepare missing-gap veto')

        # Add a marker without changing runtime behavior.
        text += f'\n\n{MARKER}\n'
        target.write_text(text, encoding='utf-8')
        py_compile.compile(str(target), doraise=True)
    except Exception:
        shutil.copy2(backup, target)
        raise

    print('OptionsDesk backend V2.0.20M1 gap visibility/safety hotfix applied.')
    print(f'Backup: {backup}')

if __name__ == '__main__':
    main()
