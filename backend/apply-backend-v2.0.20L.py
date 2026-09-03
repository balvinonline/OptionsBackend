from __future__ import annotations

import py_compile
import shutil
import sys
from datetime import datetime
from pathlib import Path

MARKER = "# --- V2.0.20L ALERT UX START ---"
BUILD = 'SERVER_BUILD_MARKER = "v2.0.20l-alert-ux-20260902"'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Required 20K marker not found for {label}. Make sure V2.0.20K + Hotfix-1 is already applied.")
    return text.replace(old, new, 1)


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "server.py").resolve()
    if not target.exists():
        raise SystemExit(f"server.py not found: {target}")
    text = target.read_text(encoding="utf-8")
    if MARKER in text:
        print("V2.0.20L backend alert UX is already applied.")
        py_compile.compile(str(target), doraise=True)
        return
    if "# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR START ---" not in text:
        raise SystemExit("V2.0.20K Hotfix-1 is required first. No changes were made.")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = target.with_name(f"{target.name}.backup-v2.0.20L-{stamp}")
    shutil.copy2(target, backup)

    try:
        text = replace_once(
            text,
            'SERVER_BUILD_MARKER = "v2.0.20k-attention-20260901"',
            BUILD,
            "build marker",
        )
        text = replace_once(
            text,
            '"Backend → Expo → FCM → phone path is working.",',
            '"Backend → Expo → FCM → phone works. Server alerts can reach you while OptionsDesk is off-screen.",',
            "remote test message",
        )
        text = replace_once(
            text,
            'title = f"🔔 {symbol} PREPARE · {side} WATCH"\n        body = " + ".join(confirmations[:3]) + f" | setup {score}/100 | Open chart and get ready · no entry yet"',
            'title = f"🔔 {symbol} {side} PREPARE · {score}%"\n        body = " + ".join(confirmations[:3]) + " | Open chart now · no entry yet"',
            "PREPARE notification",
        )
        text = replace_once(
            text,
            'title = f"{\'🟢\' if direction == \'UP\' else \'🔴\'} {symbol} CAS {state} · {side} WATCH"\n        body = " · ".join(moves) + " | Derivative movement, not spot-gap | Open CAS chart · review only"',
            'title = f"🔔🔔 {symbol} {side} CAS {state}"\n        body = " · ".join(moves) + " | Derivative move · review before broker RMS cut-off"',
            "CAS notification",
        )
        text = replace_once(
            text,
            'body += f" | {side} side developing | Open chart now · no entry yet"\n                        _background_push_all(\n                            f"⚡ {symbol} FAST MOVE WATCH {\'↑\' if direction == \'UP\' else \'↓\'}",',
            'body += " | Open chart now · no entry yet"\n                        _background_push_all(\n                            f"⚡ {symbol} {side} FAST MOVE · {move[\'score\']}% {\'↑\' if direction == \'UP\' else \'↓\'}",',
            "FAST MOVE notification",
        )
        # Add a visible source marker without changing any monitor behavior.
        insert_at = text.find("# --- V2.0.20K HOTFIX-1 GUNICORN MONITOR START ---")
        text = text[:insert_at] + MARKER + "\n# Notification-copy-only update; 20K thresholds, cooldowns and monitor lifecycle are unchanged.\n" + text[insert_at:]
        target.write_text(text, encoding="utf-8")
        py_compile.compile(str(target), doraise=True)
    except Exception:
        shutil.copy2(backup, target)
        raise

    print("V2.0.20L backend alert UX patch applied successfully.")
    print(f"Backup: {backup}")
    print("Python syntax check passed.")
    print("20K Hotfix-1 monitor logic, thresholds and cooldowns were preserved.")


if __name__ == "__main__":
    main()
