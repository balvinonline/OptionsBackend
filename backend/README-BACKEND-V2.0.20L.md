# OptionsDesk Backend V2.0.20L — Alert UX

This is a small follow-up to **V2.0.20K + Hotfix-1**. It does not change FAST MOVE/PREPARE/CAS thresholds, cooldowns, Gunicorn monitor startup, token registration, or Firebase/Expo configuration.

It only makes background wake-up notifications shorter and more immediately readable:

- `🔔 NIFTY PE PREPARE · 67%`
- `⚡ NIFTY PE FAST MOVE · 74% ↓`
- `🔔🔔 NIFTY PE CAS REVIEW NOW`
- REMOTE TEST explicitly confirms the server push path can be used while OptionsDesk is off-screen.

Apply from the backend folder:

```powershell
python .\OptionsDesk-Backend-V2.0.20L-Alert-UX\apply-backend-v2.0.20L.py .\server.py
python .\OptionsDesk-Backend-V2.0.20L-Alert-UX\verify-backend-v2.0.20L.py .\server.py
```

Then commit **server.py only** and push to `main`.
