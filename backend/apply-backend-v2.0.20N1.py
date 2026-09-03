from __future__ import annotations

import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

NEW_MARKER = 'v2.0.20n1-option-buyer-rebalance-20260903'

NEW_FUNCTION = r'''def _background_prepare_scan(symbol):
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
'''


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "server.py").resolve()
    if not target.exists():
        raise SystemExit(f"server.py not found: {target}")

    text = target.read_text(encoding="utf-8")
    if "def _background_prepare_scan(symbol):" not in text:
        raise SystemExit("Expected _background_prepare_scan() was not found. Patch not applied.")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = target.with_name(f"{target.name}.backup-v2.0.20N1-{stamp}")
    shutil.copy2(target, backup)

    text, marker_count = re.subn(
        r'SERVER_BUILD_MARKER\s*=\s*"[^"]+"',
        f'SERVER_BUILD_MARKER = "{NEW_MARKER}"',
        text,
        count=1,
    )
    if marker_count != 1:
        raise SystemExit("Could not update SERVER_BUILD_MARKER.")

    pattern = re.compile(
        r'def _background_prepare_scan\(symbol\):\n.*?(?=\n\ndef _background_cas_scan\(symbol, now_ts\):)',
        re.S,
    )
    text, fn_count = pattern.subn(NEW_FUNCTION.rstrip(), text, count=1)
    if fn_count != 1:
        raise SystemExit("Could not replace _background_prepare_scan().")

    target.write_text(text, encoding="utf-8")
    print(f"PASS: patched {target}")
    print(f"PASS: backup created {backup}")
    print(f"PASS: build marker -> {NEW_MARKER}")
    print("Only the backend background direction/notification conditions were rebalanced.")
    print("Dashboard analytics, PCR/OI, option chain, VWAP, support/resistance and API response fields were not removed.")


if __name__ == "__main__":
    main()
