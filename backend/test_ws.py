import sys
import os
import json
import time
sys.path.append(r"f:/Balvinder/option-frontend_Backup_17.03.2026/backend")
import server
server.refresh_fyers_from_env()

from fyers_apiv3.FyersWebsocket import data_ws

access_token = f"{server.FYERS_CLIENT_ID}:{server.FYERS_ACCESS_TOKEN}"
print(f"Token length: {len(access_token)}")
print("Connecting Fyers Websocket...")

def onmessage(message):
    print("WS Message:", message)

def onerror(message):
    print("WS Error:", message)

def onclose(message):
    print("WS Close:", message)

def onopen():
    data_type = "SymbolUpdate"
    symbols = ["NSE:RELIANCE26JUNFUT"]
    fyers_ws.subscribe(symbols=symbols, data_type=data_type)
    fyers_ws.keep_running()

fyers_ws = data_ws.FyersDataSocket(
    access_token=access_token,
    log_path="",
    litemode=False,
    write_to_file=False,
    reconnect=True,
    on_connect=onopen,
    on_close=onclose,
    on_error=onerror,
    on_message=onmessage
)

fyers_ws.connect()
