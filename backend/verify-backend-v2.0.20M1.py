from __future__ import annotations
import py_compile, sys
from pathlib import Path

REQUIRED = [
    'SERVER_BUILD_MARKER = "v2.0.20m1-gap-visibility-safety-20260902"',
    '"todayOpen": round2(today_open)',
    'spot["open_source"] = "history_5m_first_candle"',
    'Opening gap / from-open direction unavailable',
    'if not gap.get("available"):',
]

def main():
    p = Path(sys.argv[1] if len(sys.argv) > 1 else 'server.py').resolve()
    if not p.exists(): raise SystemExit(f'Not found: {p}')
    text=p.read_text(encoding='utf-8')
    for token in REQUIRED:
        if token not in text:
            raise SystemExit(f'FAIL missing: {token}')
        print(f'PASS: {token}')
    py_compile.compile(str(p), doraise=True)
    print('PASS: Python compile')
    print('V2.0.20M1 backend verification passed.')

if __name__ == '__main__': main()
