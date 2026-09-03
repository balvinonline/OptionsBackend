# OptionsDesk Backend V2.0.20N — Direction-First Option-Buyer Engine

This is an in-place backend upgrade for the existing OptionsDesk V2 app.

## Core change
The background signal path no longer chooses CE/PE from the old broad market bias. For index wake-ups, **current price direction decides the side** using:

- today's from-open direction / opening-gap context
- recent 1-minute and 3-minute spot movement
- VWAP side
- breakout/breakdown trigger

PCR, OI, breadth and old day bias may remain elsewhere as analytics, but they cannot select the opposite CE/PE side in the 20N background direction scan.

Server notifications are now `WATCH` or `DIRECTION CONFIRMED`. They never declare an option entry. The mobile app must still confirm the selected option premium before `ENTRY READY`.

## CAS safety
Options-implied CAS is context only. A background CAS review notification additionally requires an actual configured futures quote, sane futures basis and recent futures movement agreeing with the options-implied move. Missing verified futures means no CAS execution alert.

## Apply
```powershell
cd F:\Balvinder\option-frontend_Backup_17.03.2026\backend
python .\apply-backend-v2.0.20N.py .\server.py
python .\verify-backend-v2.0.20N.py .\server.py
```

The apply script can automatically bring a V2.0.20L or V2.0.20M backend through the bundled M/M1 prerequisites before applying 20N. It always creates backups.

After verification, commit/push `server.py` and wait for Render to deploy.

Expected status build marker:
`v2.0.20n-direction-first-20260902`
