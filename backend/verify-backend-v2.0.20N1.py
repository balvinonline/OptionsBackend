from __future__ import annotations

import py_compile
import re
import sys
from pathlib import Path

EXPECTED = 'SERVER_BUILD_MARKER = "v2.0.20n1-option-buyer-rebalance-20260903"'


def need(text: str, value: str, label: str) -> None:
    if value not in text:
        raise SystemExit(f"FAIL: {label}")
    print(f"PASS: {label}")


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "server.py").resolve()
    if not target.exists():
        raise SystemExit(f"server.py not found: {target}")
    text = target.read_text(encoding="utf-8")

    need(text, EXPECTED, "20N1 build marker")
    need(text, '"fromOpen": (from_open_dir, 20)', "from-open weighted context")
    need(text, '"1m": (dir1, 20)', "1m momentum vote")
    need(text, '"3m": (dir3, 30)', "3m primary momentum vote")
    need(text, '"VWAP": (vwap_dir, 30)', "VWAP primary vote")
    need(text, 'best_score >= 70', "direction confirmation threshold")
    need(text, 'Direction confirmed early; option-buyer momentum active', "early option-buyer confirmation")
    need(text, 'WAIT for timing + premium confirmation', "server does not create entry")
    need(text, 'server:direction20n1:', "new notification gate")

    match = re.search(r'def _background_prepare_scan\(symbol\):\n(.*?)(?=\n\ndef _background_cas_scan)', text, re.S)
    if not match:
        raise SystemExit("FAIL: patched background scan missing")
    body = match.group(1)
    exec_body = body.split('    try:', 1)[1] if '    try:' in body else body
    forbidden = ['panel.get("bias")', 'oiSide', '.get("pcr")', ".get('pcr')", 'quickBias']
    found = [x for x in forbidden if x in exec_body]
    if found:
        raise SystemExit(f"FAIL: context analytics still vote CE/PE in background scan: {found}")
    print("PASS: PCR/OI/quickBias do not choose the background CE/PE side")

    # Critical reversal behavior: there must be no old hard veto that exits merely
    # because from-open and current direction differ.
    if 'from_open_dir != "FLAT" and from_open_dir != direction' in exec_body:
        raise SystemExit("FAIL: old from-open hard veto still present")
    print("PASS: valid intraday reversal is not blocked solely by from-open direction")

    py_compile.compile(str(target), doraise=True)
    print("PASS: Python syntax")
    print("OptionsDesk backend V2.0.20N1 verification passed.")


if __name__ == "__main__":
    main()
