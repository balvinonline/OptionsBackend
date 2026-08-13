import sys
import os
import time
sys.path.append(r"f:/Balvinder/option-frontend_Backup_17.03.2026/backend")
import server
server.refresh_fyers_from_env()

for i in range(5):
    resp = server.fyers.depth({"symbol": "NSE:RELIANCE26JUNFUT", "ohlcv_flag": "1"})
    data = resp.get("d", {}).get("NSE:RELIANCE26JUNFUT", {})
    oi = data.get("oi")
    pdoi = data.get("pdoi")
    print(f"Loop {i}: oi={oi}, pdoi={pdoi}")
    time.sleep(1)
