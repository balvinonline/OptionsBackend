# OptionsDesk Backend V2.0.20K Hotfix-1

Fixes the case where `/api/device/attention-status` reports `enabled=true` but `running=false` / `lastCycleAt=null` under gunicorn.

## What changes
- Keeps the existing Render start command (`gunicorn server:app --threads 100 -w 1`).
- Adds an idempotent worker-owned monitor starter.
- Ensures the monitor starts at import and again on the first HTTP request if needed.
- Restarts the monitor if its thread unexpectedly dies.
- Marks `running` / `lastCycleAt` immediately when the loop begins.
- Rehydrates the FYERS SDK client from the persisted access token before market scans.
- Adds `threadAlive` to `/api/device/attention-status` for direct diagnostics.

## Apply
```powershell
python .\apply-backend-v2.0.20K-hotfix1.py .\server.py
python .\verify-backend-v2.0.20K-hotfix1.py .\server.py
git add server.py
git commit -m "Fix V2.0.20K gunicorn background monitor startup"
git push origin main
```

After Render deploys:
```powershell
curl.exe https://optionsbackend.onrender.com/api/device/attention-status
```
Expected after the first request / a few seconds:
- `enabled: true`
- `running: true`
- `threadAlive: true`
- `lastCycleAt`: non-null
- `lastError: null`

Outside market hours `marketWindow:false` is expected.
