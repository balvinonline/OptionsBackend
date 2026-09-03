from __future__ import annotations

import py_compile
import shutil
import sys
from datetime import datetime
from pathlib import Path

MARKER = "# --- V2.0.20M GAP DIRECTION SAFETY START ---"
BUILD_OLD = 'SERVER_BUILD_MARKER = "v2.0.20l-alert-ux-20260902"'
BUILD_NEW = 'SERVER_BUILD_MARKER = "v2.0.20m-gap-direction-safety-20260902"'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Required marker not found for {label}. Make sure V2.0.20L is applied first.")
    return text.replace(old, new, 1)


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "server.py").resolve()
    if not target.exists():
        raise SystemExit(f"server.py not found: {target}")
    text = target.read_text(encoding="utf-8")
    if MARKER in text:
        print("V2.0.20M gap-direction safety is already applied.")
        py_compile.compile(str(target), doraise=True)
        return
    if BUILD_OLD not in text:
        raise SystemExit("V2.0.20L backend is required first. No changes were made.")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = target.with_name(f"{target.name}.backup-v2.0.20M-{stamp}")
    shutil.copy2(target, backup)

    try:
        text = replace_once(text, BUILD_OLD, BUILD_NEW, "build marker")

        text = replace_once(
            text,
            "    # Intentionally start at 09:30 to save FYERS quota and skip the opening 15 minutes.\n    market_start = dt_time(9, 30)",
            "    # V2.0.20M: collect the opening session from 09:15 so gap-up/gap-down\n    # direction can be measured instead of inheriting only previous-close bias.\n    market_start = dt_time(9, 15)",
            "market open start",
        )

        text = replace_once(
            text,
            "    # FYERS intraday monitoring starts at 09:30 on this backend. Stop before\n    # broker RMS/safety cut-off so no new-entry-style wake-up is created late.\n    return 9 * 60 + 30 <= minutes <= 15 * 60 + 24",
            "    # V2.0.20M: start background observation at 09:15 so the opening gap is\n    # captured. PREPARE is still suppressed for the first five minutes below.\n    # Stop before broker RMS/safety cut-off so no new-entry-style wake-up is created late.\n    return 9 * 60 + 15 <= minutes <= 15 * 60 + 24",
            "background market window",
        )

        gap_fn = r'''

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
'''
        text = replace_once(
            text,
            "\ndef build_bias_scores(ad_ratio, breakout_breakdown, call_put_dominance, smart_oi_flow, market_regime):",
            gap_fn + "\ndef build_bias_scores(ad_ratio, breakout_breakdown, call_put_dominance, smart_oi_flow, market_regime, opening_gap=None):",
            "opening gap engine",
        )

        text = replace_once(
            text,
            "    structure = breakout_breakdown.get(\"signal\", \"\")\n    if structure == \"Breakout\":\n        bullish_score += 2\n    elif structure == \"Breakdown\":\n        bearish_score += 2\n\n    return {",
            "    structure = breakout_breakdown.get(\"signal\", \"\")\n    if structure == \"Breakout\":\n        bullish_score += 2\n    elif structure == \"Breakdown\":\n        bearish_score += 2\n\n    gap = opening_gap or {}\n    gap_state = str(gap.get(\"state\") or \"\").upper()\n    intraday_direction = str(gap.get(\"intradayDirection\") or \"\").upper()\n    if intraday_direction == \"UP\":\n        bullish_score += 1\n    elif intraday_direction == \"DOWN\":\n        bearish_score += 1\n    if \"GAP DOWN RECOVERY\" in gap_state:\n        bullish_score += 2\n    elif \"GAP UP FILLING\" in gap_state or \"GAP UP REVERSAL\" in gap_state:\n        bearish_score += 2\n    elif gap_state == \"GAP UP CONTINUATION\":\n        bullish_score += 1\n    elif gap_state == \"GAP DOWN CONTINUATION\":\n        bearish_score += 1\n\n    return {",
            "gap-aware bias scores",
        )

        text = replace_once(
            text,
            "    sr = analytics.get(\"supportResistance\", {})\n",
            "    sr = analytics.get(\"supportResistance\", {})\n    opening_gap = analytics.get(\"openingGap\", {}) or {}\n",
            "trade panel gap input",
        )

        text = replace_once(
            text,
            "    scores = build_bias_scores(ad_ratio, breakout, dominance, oi_flow, regime)",
            "    scores = build_bias_scores(ad_ratio, breakout, dominance, oi_flow, regime, opening_gap)",
            "trade panel gap scoring",
        )

        text = replace_once(
            text,
            "    elif bearish_score >= bullish_score + 2:\n        bias = \"Bearish\"\n        action = \"Buy PE / Bearish setup\"\n        confidence = min(90, 55 + bearish_score * 6)\n\n    entry = ref",
            "    elif bearish_score >= bullish_score + 2:\n        bias = \"Bearish\"\n        action = \"Buy PE / Bearish setup\"\n        confidence = min(90, 55 + bearish_score * 6)\n\n    blocked_bias = None\n    direction_conflict = False\n    direction_conflict_reason = None\n    selected_side = \"CE\" if bias == \"Bullish\" else \"PE\" if bias == \"Bearish\" else None\n    conflict_side = str(opening_gap.get(\"conflictSide\") or \"\").upper()\n    if selected_side and conflict_side == selected_side:\n        blocked_bias = bias\n        direction_conflict = True\n        direction_conflict_reason = opening_gap.get(\"conflictReason\") or \"Current direction from today's open opposes this side\"\n        bias = \"Neutral\"\n        action = \"Wait - opening/intraday direction conflict\"\n        confidence = min(confidence, 55)\n\n    entry = ref",
            "trade panel direction veto",
        )

        text = replace_once(
            text,
            "        \"breakdownLevel\": round2(breakdown_level) if breakdown_level is not None else None,\n    }",
            "        \"breakdownLevel\": round2(breakdown_level) if breakdown_level is not None else None,\n        \"openingGap\": opening_gap,\n        \"directionConflict\": direction_conflict,\n        \"directionConflictReason\": direction_conflict_reason,\n        \"blockedBias\": blocked_bias,\n    }",
            "trade panel gap output",
        )

        text = replace_once(
            text,
            "    market_regime = build_market_regime(spot, future, vix, ad, pcr, smart_oi_flow)\n    breadth_stats = build_breadth_stats(ad, sectors)",
            "    market_regime = build_market_regime(spot, future, vix, ad, pcr, smart_oi_flow)\n    opening_gap = build_opening_gap_context(symbol_key, spot, future)\n    breadth_stats = build_breadth_stats(ad, sectors)",
            "dashboard opening gap calculation",
        )

        text = replace_once(
            text,
            "        smart_oi_flow,\n        market_regime\n    )\n\n\n    iv_rank",
            "        smart_oi_flow,\n        market_regime,\n        opening_gap\n    )\n\n\n    iv_rank",
            "dashboard gap scoring",
        )

        text = replace_once(
            text,
            "        \"marketRegime\": market_regime,\n        \"breadthStats\": breadth_stats,",
            "        \"marketRegime\": market_regime,\n        \"openingGap\": opening_gap,\n        \"breadthStats\": breadth_stats,",
            "dashboard gap analytics",
        )

        text = replace_once(
            text,
            "        analytics = data.get(\"analytics\") or {}\n        panel = analytics.get(\"tradeSignalPanel\") or {}\n        zone = analytics.get(\"tradeZones\") or {}",
            "        analytics = data.get(\"analytics\") or {}\n        panel = analytics.get(\"tradeSignalPanel\") or {}\n        gap = analytics.get(\"openingGap\") or panel.get(\"openingGap\") or {}\n        zone = analytics.get(\"tradeZones\") or {}\n\n        # Let the first 5 minutes establish today's open direction. The server\n        # may still collect prices and send non-entry wake-ups from 09:15.\n        now = ist_now()\n        if now.hour == 9 and now.minute < 20:\n            return",
            "prepare opening stabilization",
        )

        text = replace_once(
            text,
            "        if not side:\n            return\n\n        confidence = safe_float(panel.get(\"confidence\"), 0) or 0",
            "        if not side:\n            return\n        if str(gap.get(\"conflictSide\") or \"\").upper() == side:\n            return\n\n        confidence = safe_float(panel.get(\"confidence\"), 0) or 0",
            "prepare gap veto",
        )

        gap_scan_fn = r'''

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
'''
        text = replace_once(
            text,
            "\ndef _background_prepare_scan(symbol):",
            gap_scan_fn + "\ndef _background_prepare_scan(symbol):",
            "background gap warning",
        )

        text = replace_once(
            text,
            "                for symbol in BACKGROUND_INDEX_SYMBOLS:\n                    _background_prepare_scan(symbol)",
            "                for symbol in BACKGROUND_INDEX_SYMBOLS:\n                    _background_gap_direction_scan(symbol)\n                    _background_prepare_scan(symbol)",
            "background gap scan call",
        )

        insert_at = text.find("# --- V2.0.20L ALERT UX START ---")
        if insert_at < 0:
            raise RuntimeError("20L source marker not found")
        text = text[:insert_at] + MARKER + "\n# Gap-up/gap-down context, current-vs-open direction veto, and opening-session monitoring.\n" + text[insert_at:]

        target.write_text(text, encoding="utf-8")
        py_compile.compile(str(target), doraise=True)
    except Exception:
        shutil.copy2(backup, target)
        raise

    print("V2.0.20M backend gap-direction safety patch applied successfully.")
    print(f"Backup: {backup}")
    print("Python syntax check passed.")
    print("09:15 opening data is now observed; PREPARE remains suppressed before 09:20.")
    print("Opposite CE/PE is forced to WAIT when current direction from today's open conflicts.")


if __name__ == "__main__":
    main()
