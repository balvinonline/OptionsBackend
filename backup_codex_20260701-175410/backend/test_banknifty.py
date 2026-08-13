import os
import json
import time
import requests

original_request = requests.Session.request
def request_with_timeout(self, method, url, **kwargs):
    if "timeout" not in kwargs:
        kwargs["timeout"] = 5.0
    return original_request(self, method, url, **kwargs)
requests.Session.request = request_with_timeout

from dotenv import load_dotenv
load_dotenv(os.path.join("backend", ".env"))
token = os.environ.get("FYERS_ACCESS_TOKEN")

if not token and os.path.exists("backend/tokens.json"):
    with open("backend/tokens.json") as f:
        data = json.load(f)
        token = data.get("FYERS_ACCESS_TOKEN")
    with open("backend/tokens.json") as f:
        data = json.load(f)
        token = data.get("FYERS_ACCESS_TOKEN")

client_id = os.environ.get("FYERS_APP_ID")
if not client_id and os.path.exists("backend/.env"):
    with open("backend/.env") as f:
        for line in f:
            if line.startswith("FYERS_APP_ID="):
                client_id = line.strip().split("=", 1)[1]

from fyers_apiv3 import fyersModel
fyers = fyersModel.FyersModel(
    client_id=client_id,
    is_async=False,
    token="GARBAGE",
    log_path=""
)

payload = {
    "symbol": "NSE:NIFTY50-INDEX",
    "resolution": "5",
    "date_format": "0",
    "range_from": str(int(time.time() - 86400)),
    "range_to": str(int(time.time())),
    "cont_flag": "1"
}
print(f"Token present: {bool(token)}")
print("Calling fyers.history for BANK NIFTY...")
start = time.time()
try:
    resp = fyers.history(payload)
    print(f"Elapsed: {time.time() - start:.2f}s")
    print("Response keys:", resp.keys() if isinstance(resp, dict) else type(resp))
    if isinstance(resp, dict) and "s" in resp:
        print("Status:", resp["s"], "Message:", resp.get("message"))
except Exception as e:
    print(f"Elapsed: {time.time() - start:.2f}s")
    print("Exception:", e)
