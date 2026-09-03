from __future__ import annotations
import py_compile
import re
import sys
from pathlib import Path

EXPECTED = 'SERVER_BUILD_MARKER = "v2.0.20n-direction-first-20260902"'

def need(text: str, value: str, label: str):
    if value not in text:
        raise SystemExit(f'FAIL: {label}')
    print(f'PASS: {label}')

def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else 'server.py').resolve()
    if not target.exists():
        raise SystemExit(f'server.py not found: {target}')
    text = target.read_text(encoding='utf-8')
    need(text, EXPECTED, '20N build marker')
    need(text, 'BACKGROUND_DIRECTION_LIMITS = {', 'direction thresholds')
    need(text, 'server-direction-first-watch', 'direction-first background alert')
    need(text, 'DIRECTION CONFIRMED', 'confirmed direction stage')
    need(text, 'WAIT for option premium entry confirmation', 'server never promotes option entry directly')
    need(text, 'get_quote_block(future_symbol)', 'CAS reads actual configured future')
    need(text, 'future_direction != direction', 'CAS future-direction agreement gate')
    need(text, 'Verified future agrees', 'CAS verified-future copy')
    need(text, 'f"⚡ {symbol} {side} WATCH', 'FAST MOVE is watch-only')

    match = re.search(r'def _background_prepare_scan\(symbol\):\n(.*?)(?=\n\ndef _background_cas_scan)', text, re.S)
    if not match:
        raise SystemExit('FAIL: direction-first scan function missing')
    body = match.group(1)
    # Ignore the explanatory docstring/comments. Inspect executable scan code only.
    exec_body = body.split('    try:', 1)[1] if '    try:' in body else body
    forbidden = ['panel.get("bias")', 'oiSide', '.get("pcr")', ".get('pcr')", 'quickBias']
    found = [x for x in forbidden if x in exec_body]
    if found:
        raise SystemExit(f'FAIL: old broad-score inputs still choose background side: {found}')
    print('PASS: background side is not chosen by old bias/OI/PCR')

    py_compile.compile(str(target), doraise=True)
    print('PASS: Python syntax')
    print('V2.0.20N backend verification passed.')

if __name__ == '__main__':
    main()
