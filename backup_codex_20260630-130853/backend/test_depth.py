import sys
import os
import json
sys.path.append(r"f:/Balvinder/option-frontend_Backup_17.03.2026/backend")
import server
server.refresh_fyers_from_env()
resp = server.fyers.depth({"symbol": "NSE:RELIANCE26JUNFUT,NSE:HDFCBANK26JUNFUT", "ohlcv_flag": "1"})
print(json.dumps(resp, indent=2))
