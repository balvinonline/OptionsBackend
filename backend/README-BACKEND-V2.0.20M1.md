# OptionsDesk Backend V2.0.20M1 — Gap Visibility + Missing-Data Safety

Apply after backend V2.0.20M.

Fixes a safety hole where an index quote could contain current/previous-close data but omit today's `open`, causing `openingGap.available=false`. The backend now reuses the existing real 5-minute history snapshot and takes the first candle open for today's IST session as a fallback.

If opening context is still unavailable, directional server action is forced to WAIT and background PREPARE alerts are suppressed. Missing data is no longer silently accepted as alignment.

Expected build marker after deploy: `v2.0.20m1-gap-visibility-safety-20260902`.
