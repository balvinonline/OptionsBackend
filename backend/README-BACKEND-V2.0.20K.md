# OptionsDesk Backend V2.0.20K — Background Opportunity Wake-Up Monitor

This patch can be run directly on the original OptionsDesk `server.py`.

- If the 20J `/api/device/register` + remote-test patch is not present, the 20K applier automatically applies the bundled 20J base first.
- Then it enables the server-side **attention monitor** so the phone can receive wake-up notifications while the app is closed.

## What the server sends

### FAST MOVE WATCH
Uses rolling index movement with cross-route sanity checks.

Approximate wake-up thresholds:

- NIFTY: 10 pts/30s, 18 pts/1m, 30 pts/3m
- BANK NIFTY: 20 / 35 / 60 pts
- SENSEX: 35 / 60 / 100 pts

It requires persistence or an unusually strong move, plus supporting market-bias/VWAP evidence unless the move itself is very strong.

Notification meaning: **open the chart now; no entry yet**.

### PREPARE
Every ~60 seconds the backend runs a deeper scan. It sends a PREPARE watch when:

- directional bias exists,
- score is around 55+,
- at least two evidence groups align (VWAP / price / OI / volume / trigger),
- no clear VWAP opposition is present.

Notification meaning: **get ready and focus on chart; no entry yet**.

### CAS BUILDING / REVIEW NOW
Between 3:15 and 3:24 PM IST the backend evaluates the options-implied level.

CAS qualification uses actual 30s/1m/3m movement. The **implied-vs-spot gap is never used as the move trigger**.

## Noise control

- FAST MOVE: ~8 minute direction cooldown unless strength improves materially.
- PREPARE: ~12 minute side cooldown unless score improves materially.
- CAS BUILDING: ~6 minute cooldown.
- CAS REVIEW NOW is a separate escalation and can arrive after BUILDING.

## Safety window

The server wake-up monitor runs approximately 9:30 AM–3:24 PM IST on weekdays. It does not create new-entry-style attention alerts after the broker-safety cut-off.

## Apply

Put this ZIP in the real backend folder containing `server.py`, extract it and run:

```powershell
python .\apply-backend-v2.0.20K.py .\server.py
python .\verify-backend-v2.0.20K.py .\server.py
```

Deploy the modified `server.py` to the same Render service used by OptionsDesk.

`ENABLE_BACKGROUND_ATTENTION_MONITOR` defaults to ON. To intentionally disable it on Render, set:

```text
ENABLE_BACKGROUND_ATTENTION_MONITOR=0
```

## Verify after deploy

1. Install/use the matching mobile V2.0.20K.
2. Trade Alerts → REFRESH.
3. Expected:
   - Android FCM token: READY
   - Expo push token: READY
   - Background push server: REGISTERED
   - Background attention monitor: ON
4. Run REMOTE TEST.
5. During market hours, the server can now wake the phone for FAST MOVE / PREPARE / CAS BUILDING while the app is closed.

The server wake-up alerts are intentionally **attention alerts**, not automatic BUY instructions. Open the app for the stricter CONFIRMED and ENTRY READY checks.
