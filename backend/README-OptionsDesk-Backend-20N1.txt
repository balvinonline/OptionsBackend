OptionsDesk Backend V2.0.20N1 - Option-Buyer Direction Rebalance

Purpose
-------
This patch changes ONLY the backend background direction/notification scan so it behaves more like the new mobile option-buyer logic.

It does NOT remove or rewrite:
- dashboard API fields
- PCR / OI analytics
- option chain
- VWAP calculation
- opening-gap information
- support / resistance
- trade zones
- FII/DII
- market mood
- FYERS login / token flow
- push infrastructure
- CAS safety

What changes
------------
The old background scan treated today's from-open direction as a hard veto and often waited for too much agreement.

20N1 uses weighted CURRENT PRICE evidence:
- From open: 20
- 1-minute momentum: 20
- 3-minute momentum: 30
- VWAP side: 30

A valid intraday reversal can now override the earlier from-open direction when current 1m/3m/VWAP evidence is strong.

DIRECTION CONFIRMED may appear before the full breakout/breakdown if current option-buyer momentum is strong.
The backend still NEVER declares ENTRY READY. Mobile entryTiming still requires timing + contract + option-premium confirmation and chase protection.

Apply
-----
PowerShell:

cd "F:\Balvinder\option-frontend_Backup_17.03.2026\backend"

python "<path-to>\apply-backend-v2.0.20N1.py" .\server.py
python "<path-to>\verify-backend-v2.0.20N1.py" .\server.py

The apply script automatically creates a timestamped backup of server.py before changing it.

After verification
------------------
Run the backend locally if you normally do so and check /api/health.
Expected build marker:
  v2.0.20n1-option-buyer-rebalance-20260903

Then commit/push server.py and let Render redeploy.

Do not change the mobile entryTiming thresholds in this backend step.
