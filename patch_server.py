import re

with open("backend/server.py", "r", encoding="utf-8") as f:
    content = f.read()

# Add the fetch_fii_derivatives_data function right before "# =========================================================" for IV HELPERS
inject_str = """
def fetch_fii_derivatives_data(cache_ttl=900):
    cached = get_cached("fii_derivatives", ttl=cache_ttl)
    if cached is not None:
        return cached
    import csv
    from io import StringIO
    from datetime import datetime, timedelta
    fii_data = {"fii": {"indexOptions": {"long": 0, "short": 0}}, "dii": {"indexOptions": {"long": 0, "short": 0}}}
    try:
        d = datetime.now()
        for offset in range(3):
            date_to_try = d - timedelta(days=offset)
            date_str = f"{date_to_try.day:02d}{date_to_try.month:02d}{date_to_try.year}"
            url = f"https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{date_str}.csv"
            
            # Reusing the existing session
            r = session.get(url, headers=headers, timeout=5)
            if r.status_code == 200 and "Participant wise Open Interest" in r.text:
                reader = csv.DictReader(StringIO(r.text.strip().split("\\n", 1)[1]))
                for row in reader:
                    client_type = row.get("Client Type", "").strip()
                    if client_type in ["FII", "DII"]:
                        key = client_type.lower()
                        call_long = int(row.get("Option Index Call Long", 0))
                        put_long = int(row.get("Option Index Put Long", 0))
                        call_short = int(row.get("Option Index Call Short", 0))
                        put_short = int(row.get("Option Index Put Short", 0))
                        fii_data[key]["indexOptions"]["long"] = call_long + put_short
                        fii_data[key]["indexOptions"]["short"] = put_long + call_short
                set_cached("fii_derivatives", fii_data)
                return fii_data
    except Exception as e:
        print("fetch_fii_derivatives error:", e)
    return fii_data
"""

if "def fetch_fii_derivatives_data" not in content:
    content = content.replace("    set_cached(\"fii_dii\", result)\n    return result\n# =========================================================", "    set_cached(\"fii_dii\", result)\n    return result\n" + inject_str + "\n# =========================================================")

# Add fiiDii to analytics dict inside build_dashboard
# Search for '"biasScores": bias_scores,'
if '"fiiDii":' not in content:
    content = content.replace('"biasScores": bias_scores,\n    }', '"biasScores": bias_scores,\n        "fiiDii": fetch_fii_derivatives_data(),\n    }')

with open("backend/server.py", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated server.py!")
