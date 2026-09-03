import server

server.refresh_fyers_from_env(force=True)

symbols = [
    "BSE:SENSEX-INDEX",
    "BSE:SENSEX",
    "BSE:SENSEX26AUGFUT",
    "SENSEX"
]

print("\n=== FYERS SENSEX EXPIRY TEST ===\n")

if not server.fyers:
    print("ERROR: FYERS client is not initialized")
    raise SystemExit(1)

for symbol in symbols:
    print("=" * 70)
    print("SYMBOL:", symbol)

    try:
        response = server.fyers.optionchain({
            "symbol": symbol,
            "strikecount": 1
        })

        print("status :", response.get("s"))
        print("code   :", response.get("code"))
        print("message:", response.get("message"))

        data = response.get("data") or {}

        print("data keys:", list(data.keys()) if isinstance(data, dict) else type(data))

        expiry_data = data.get("expiryData", []) if isinstance(data, dict) else []
        chain = data.get("optionsChain", []) if isinstance(data, dict) else []

        print("expiryData count :", len(expiry_data))
        print("optionsChain count:", len(chain))

        if expiry_data:
            print("EXPIRIES:")
            for item in expiry_data[:5]:
                print(" ", item)

    except Exception as exc:
        print("ERROR:", repr(exc))

print("\n=== TEST COMPLETE ===")
