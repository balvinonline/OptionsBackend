import sys
import os
import json
sys.path.append(r"f:/Balvinder/option-frontend_Backup_17.03.2026/backend")
import server
symbols = ["NSE:NIFTY26JUNFUT", "NSE:RELIANCE26JUNFUT", "NSE:HDFCBANK26JUNFUT", "NSE:RELIANCE26JULFUT"]
quotes = server.get_quotes_map(symbols, chunk_size=30, fallback_missing=False)
print(json.dumps(quotes, indent=2))
