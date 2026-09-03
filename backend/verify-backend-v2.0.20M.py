from __future__ import annotations
import ast
import py_compile
import sys
from pathlib import Path

CHECKS = [
    'SERVER_BUILD_MARKER = "v2.0.20m-gap-direction-safety-20260902"',
    '# --- V2.0.20M GAP DIRECTION SAFETY START ---',
    'def build_opening_gap_context(symbol_key, spot, future=None):',
    '"openingGap": opening_gap,',
    '"directionConflict": direction_conflict,',
    '"conflictSide": conflict_side,',
    'def _background_gap_direction_scan(symbol):',
    'return 9 * 60 + 15 <= minutes <= 15 * 60 + 24',
    'if now.hour == 9 and now.minute < 20:',
]

def safe_float(v, default=None):
    try:
        if v is None or v == "": return default
        return float(v)
    except Exception:
        return default

def round2(v, fallback=None):
    x = safe_float(v, None)
    return round(x, 2) if x is not None else fallback

def pct_change(current, previous):
    c = safe_float(current, None); p = safe_float(previous, None)
    if c is None or p in (None, 0): return None
    return ((c - p) / p) * 100.0

def num_int(v, default=0):
    try: return int(float(v))
    except Exception: return default


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else 'server.py').resolve()
    if not target.exists(): raise SystemExit(f'server.py not found: {target}')
    text = target.read_text(encoding='utf-8')
    failed = False
    for item in CHECKS:
        if item in text:
            print('OK', item)
        else:
            print('FAIL', item)
            failed = True
    py_compile.compile(str(target), doraise=True)
    print('Python syntax check passed.')

    # Pure-function regression tests without importing server.py or starting its monitor.
    tree = ast.parse(text)
    wanted = {'build_opening_gap_context', 'build_bias_scores', 'build_trade_signal_panel'}
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted]
    if {n.name for n in nodes} != wanted:
        print('FAIL gap regression functions unavailable')
        failed = True
    else:
        ns = dict(safe_float=safe_float, round2=round2, pct_change=pct_change, num_int=num_int)
        exec(compile(ast.Module(body=nodes, type_ignores=[]), '<gap-test>', 'exec'), ns)
        gap = ns['build_opening_gap_context']('NIFTY', {'ltp':24900, 'open':24750, 'prev_close':25000})
        bearish_analytics = {
            'breakoutBreakdown': {'signal':'Breakdown','breakdownLevel':24920,'breakoutLevel':25050},
            'intradayRangeProjection': {'projectedMove':150},
            'marketRegime': {'tone':'Bearish'},
            'smartOIFlow': {'bias':'Bearish'},
            'callPutDominance': {'bias':'Bearish'},
            'supportResistance': {'supports':[24700,24800], 'resistances':[25000,25100]},
            'openingGap': gap,
        }
        panel = ns['build_trade_signal_panel']({'ltp':24900},{'ltp':24905},bearish_analytics,{'ratio':0.8})
        if gap.get('state') == 'GAP DOWN RECOVERY' and gap.get('conflictSide') == 'PE' and panel.get('bias') == 'Neutral' and panel.get('directionConflict') is True:
            print('OK regression: gap-down recovery blocks stale PE')
        else:
            print('FAIL regression: gap-down recovery did not block PE', gap, panel)
            failed = True

        gap2 = ns['build_opening_gap_context']('NIFTY', {'ltp':24650, 'open':24750, 'prev_close':25000})
        bearish_analytics['openingGap'] = gap2
        panel2 = ns['build_trade_signal_panel']({'ltp':24650},{'ltp':24655},bearish_analytics,{'ratio':0.8})
        if gap2.get('state') == 'GAP DOWN CONTINUATION' and panel2.get('bias') == 'Bearish' and panel2.get('directionConflict') is False:
            print('OK regression: genuine gap-down continuation can remain PE')
        else:
            print('FAIL regression: gap-down continuation behavior', gap2, panel2)
            failed = True

    if failed:
        raise SystemExit('V2.0.20M backend verification failed.')
    print('V2.0.20M backend verification passed.')

if __name__ == '__main__':
    main()
