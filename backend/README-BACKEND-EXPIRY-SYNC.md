# OptionsBackend v1.9.6 — Expiry + Signal Reference Sync Patch

This patch is based on the uploaded `OptionsBackend-review.zip` and changes only `server.py`.
No `.env`, FYERS token, credentials, database, or log files are included.

## What this fixes

1. Reads authoritative FYERS `expiryData[]` instead of guessing expiry from the contract symbol.
2. Adds `GET /api/option-expiries?symbol=SENSEX`.
3. Adds expiry selection to `GET /api/option-chain`, e.g.:
   - `/api/option-chain?symbol=SENSEX`
   - `/api/option-chain?symbol=SENSEX&expiry=2026-09-03`
   - expiry timestamp is also accepted.
4. Adds top-level fields:
   - `selectedExpiry`
   - `selectedExpiryTimestamp`
   - `dte`
   - `expiries`
   - `expiryDetails`
5. Adds `expiry` and `expiryTimestamp` to every option-chain strike row when expiry metadata is available.
6. Uses the selected expiry for IV/Greeks time-to-expiry calculations.
7. Uses SPOT as the canonical reference for option-structure decisions (breakout/breakdown, trade zone, signal panel), with FUTURE only as fallback.
8. Uses spot/history VWAP before futures VWAP for spot-based option signals.
9. Adds:
   - `referencePrice`
   - `referenceSource`
   - `signalCalculatedAt`
10. Caps FYERS `strikecount` at 50, matching FYERS API v3 limits.

## Why the signal reference fix matters

The response you supplied had approximately:
- SENSEX spot: 77629.85
- SENSEX future: 77810.00
- breakout analytics reference: 77810.00

The support/resistance levels were spot/strike based, but the breakout engine was comparing them to the futures price. That could report a breakout even though spot had not broken out. This patch makes spot the primary reference for those decisions.

## Apply locally

Your backend folder shown in PowerShell was:

`F:\Balvinder\option-frontend_Backup_17.03.2026\backend`

### 1. Stop the backend

Press `Ctrl+C` in the terminal running it.

### 2. Create a backup

From the backend folder:

```powershell
Copy-Item .\server.py .\server_before_expiry_sync_20260826.py
```

### 3. Replace server.py

Extract this ZIP. Copy its `server.py` into your backend folder and replace the existing file.

### 4. Syntax check

```powershell
.\.venv2\Scripts\python.exe -m py_compile .\server.py
```

If your active virtual environment is already shown as `(.venv2)`, you can also run:

```powershell
python -m py_compile .\server.py
```

No output means syntax is OK.

### 5. Start backend normally

Use the same command you already use for this project, for example your existing `run_backend.cmd`, Flask command, or Gunicorn/Render configuration.

## Verify locally / deployed backend

Replace `$base` if required:

```powershell
$base = "https://optionsbackend.onrender.com"
```

### A. Health/build marker

```powershell
Invoke-RestMethod "$base/api/health" | ConvertTo-Json -Depth 5
```

Expected build marker after deployment:

`backend-expiry-sync-20260826`

### B. SENSEX expiry catalogue

```powershell
Invoke-RestMethod "$base/api/option-expiries?symbol=SENSEX" | ConvertTo-Json -Depth 10
```

Expected shape:

```json
{
  "symbol": "SENSEX",
  "selectedExpiry": "2026-08-27",
  "selectedExpiryTimestamp": "...",
  "dte": 1,
  "expiries": ["2026-08-27", "2026-09-03"],
  "expiryDetails": []
}
```

Actual dates come from FYERS and may differ from this example.

### C. Current SENSEX option chain

```powershell
$r = Invoke-RestMethod "$base/api/option-chain?symbol=SENSEX"
$r | Select-Object symbol,selectedExpiry,dte,referencePrice,referenceSource,signalCalculatedAt
$r.expiries
$r.analytics.breakoutBreakdown
$r.spot
$r.future
```

Important checks:

- `selectedExpiry` must not be `null` if FYERS returns `expiryData`.
- `expiries` should contain valid distinct dates.
- `referenceSource` should normally be `spot`.
- `referencePrice` should match `spot.ltp` (allowing only normal tick timing difference if separate calls are made).
- `analytics.breakoutBreakdown.referencePrice` should use spot, not futures.

### D. NEXT expiry

Pick a date from `$r.expiries`, then:

```powershell
$next = $r.expiries[1]
$r2 = Invoke-RestMethod "$base/api/option-chain?symbol=SENSEX&expiry=$next"
$r2 | Select-Object selectedExpiry,dte,referencePrice
$r2.data | Select-Object -First 2 strike,expiry,expiryTimestamp,ce_symbol,pe_symbol
```

`selectedExpiry` must equal `$next`, and the strike rows should carry the same expiry.

### E. Repeat for NIFTY and BANKNIFTY

```powershell
Invoke-RestMethod "$base/api/option-expiries?symbol=NIFTY" | ConvertTo-Json -Depth 10
Invoke-RestMethod "$base/api/option-expiries?symbol=BANKNIFTY" | ConvertTo-Json -Depth 10
```

## Mobile-side expectation

After backend deployment, restart the V2 mobile/web dev app with a clean Metro cache. The mobile app should then receive authoritative top-level `selectedExpiry` and `expiries[]`; it should no longer need to infer SENSEX expiry from symbols such as `BSE:SENSEX26AUG77600PE`.

Do not loosen the V2.0.11 strict expiry parser again. The backend should be authoritative.

## Rollback

If the backend has an unexpected runtime problem:

```powershell
Copy-Item .\server_before_expiry_sync_20260826.py .\server.py -Force
```

Then restart the backend.
