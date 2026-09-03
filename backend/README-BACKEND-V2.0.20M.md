# OptionsDesk Backend V2.0.20M — Gap Direction Safety

Requires V2.0.20L + the existing 20K Gunicorn monitor hotfix.

## Behavior
- Backend begins observing the opening session at 09:15 IST instead of waiting until 09:30.
- PREPARE alerts are suppressed before 09:20 while the opening direction stabilizes.
- Computes three separate facts for NIFTY/BANKNIFTY/SENSEX:
  1. previous close -> today's open = overnight gap,
  2. today's open -> current price = current intraday direction,
  3. previous close -> current price = total day change.
- Classifies GAP UP/DOWN continuation, holding, filling, recovery and reversal.
- Current direction from today's open is a safety veto: rising from open blocks PE; falling from open blocks CE. The veto forces WAIT; it does not auto-create a trade in the other direction.
- Adds gap context to bias scoring, but the opposite-side veto is stronger than the score.
- Server PREPARE respects the same veto.
- During the opening window the server can send a warning-only GAP DIRECTION WATCH when recovery/reversal blocks the opposite side.

This reduces contradictory/stale-side alerts. It cannot guarantee profitable entries; execution still requires confirmation, liquidity and risk checks.
