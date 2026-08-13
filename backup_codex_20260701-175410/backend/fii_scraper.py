import requests
import datetime
import csv
from io import StringIO

def fetch_fii_options():
    d = datetime.datetime.now()
    # Try today, if fails try yesterday
    for offset in range(3):
        date_to_try = d - datetime.timedelta(days=offset)
        # Format: DDMMYYYY
        date_str = f"{date_to_try.day:02d}{date_to_try.month:02d}{date_to_try.year}"
        url = f"https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{date_str}.csv"
        print(f"Trying URL: {url}")
        try:
            r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
            if r.status_code == 200 and "Participant wise Open Interest" in r.text:
                print("Found file!")
                return r.text
        except Exception as e:
            print("Error", e)
    return None

csv_text = fetch_fii_options()
if csv_text:
    reader = csv.DictReader(StringIO(csv_text.strip().split("\n", 1)[1]))
    fii_data = {"fii": {"indexOptions": {"long": 0, "short": 0}}, "dii": {"indexOptions": {"long": 0, "short": 0}}}
    for row in reader:
        client_type = row.get("Client Type", "").strip()
        if client_type in ["FII", "DII"]:
            key = client_type.lower()
            # Index Option Calls and Puts
            call_long = int(row.get("Option Index Call Long", 0))
            put_long = int(row.get("Option Index Put Long", 0))
            call_short = int(row.get("Option Index Call Short", 0))
            put_short = int(row.get("Option Index Put Short", 0))
            
            # Smart money "Long" index bias = Call Long + Put Short
            # Smart money "Short" index bias = Put Long + Call Short
            fii_data[key]["indexOptions"]["long"] = call_long + put_short
            fii_data[key]["indexOptions"]["short"] = put_long + call_short
    
    print(fii_data)
else:
    print("Could not fetch FII data")
