OptionsDesk v1.9.5 backend add-on

1. Copy optionsdesk_v195_routes.py and apply_v195_backend_patch.py next to server.py.
2. Run: python apply_v195_backend_patch.py
3. Commit/push/deploy backend.
4. Add these Render environment variables BEFORE using the new mobile login:

Required app login:
OPTIONSDESK_APP_USERNAME=<your username>
OPTIONSDESK_APP_PASSWORD=<strong password>
OPTIONSDESK_AUTH_SECRET=<long random secret>

Required for Kotak Neo connection:
KOTAK_NEO_CONSUMER_KEY=<Trade API token from Kotak Neo>
KOTAK_NEO_MOBILE=<registered mobile with country code, e.g. +91...>
KOTAK_NEO_UCC=<Kotak client/UCC>
KOTAK_NEO_WHITELISTED_IP=<backend static IPv4 registered in Kotak Neo>

Live trading safety switches (start OFF):
OPTIONSDESK_LIVE_TRADING_ENABLED=false
OPTIONSDESK_MAX_LIVE_ORDER_QTY=2000
OPTIONSDESK_MAX_LIVE_ORDER_VALUE=300000
OPTIONSDESK_MAX_LIVE_ORDERS_PER_DAY=20
OPTIONSDESK_ALLOW_AMO=false

Do NOT put Kotak consumer key, MPIN, TOTP or app password inside the APK or EXPO_PUBLIC_* variables.
TOTP and MPIN are entered only to create/refresh the Kotak trading session and are not persisted by this module.

Important: Kotak Neo requires order APIs and the trading session to originate from the same whitelisted static IPv4. A backend with changing outbound IP cannot be used for live orders.
