from __future__ import annotations
import py_compile, sys
from pathlib import Path

p = Path(sys.argv[1] if len(sys.argv) > 1 else "server.py").resolve()
text = p.read_text(encoding="utf-8")
checks = [
    '# --- V2.0.20L ALERT UX START ---',
    'SERVER_BUILD_MARKER = "v2.0.20l-alert-ux-20260902"',
    '🔔 {symbol} {side} PREPARE · {score}%',
    '🔔🔔 {symbol} {side} CAS {state}',
    'FAST MOVE · {move[\'score\']}%',
    'Server alerts can reach you while OptionsDesk is off-screen.',
    '# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR START ---',
    'threadAlive',
]
missing = [x for x in checks if x not in text]
for item in checks:
    print(("OK " if item in text else "MISSING ") + item)
if missing:
    raise SystemExit("V2.0.20L backend verification failed.")
py_compile.compile(str(p), doraise=True)
print("Python syntax check passed.")
print("V2.0.20L backend verification passed.")
