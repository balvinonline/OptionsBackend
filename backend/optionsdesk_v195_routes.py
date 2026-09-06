"""OptionsDesk v1.9.5 mobile-auth + Kotak Neo live-trading routes.

Register from server.py with:
    from optionsdesk_v195_routes import register_optionsdesk_v195_routes
    register_optionsdesk_v195_routes(app)

Secrets stay in backend environment variables. This module never persists TOTP or MPIN.
"""
from __future__ import annotations

import hmac
import os
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from functools import wraps

import requests
from flask import jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

_AUTH_SALT = "optionsdesk-mobile-auth-v195"
_KOTAK_LOCK = threading.RLock()
_KOTAK_CLIENT = None
_KOTAK_SESSION_READY = False
_KOTAK_SESSION_AT = None
_RECENT_ORDER_IDS = {}
_DAILY_ORDER_COUNT = {"day": "", "count": 0}
_IP_CACHE = {"at": 0.0, "value": ""}


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _serializer():
    secret = os.getenv("OPTIONSDESK_AUTH_SECRET", "").strip()
    if not secret:
        return None
    return URLSafeTimedSerializer(secret_key=secret, salt=_AUTH_SALT)


def _issue_token(username: str):
    serializer = _serializer()
    if serializer is None:
        return None
    return serializer.dumps({"u": username, "iat": int(time.time())})


def _verify_token(token: str):
    serializer = _serializer()
    if serializer is None or not token:
        return None
    max_age = int(os.getenv("OPTIONSDESK_AUTH_MAX_AGE_SECONDS", "604800") or 604800)
    try:
        data = serializer.loads(token, max_age=max_age)
        return str(data.get("u") or "") or None
    except (BadSignature, SignatureExpired, Exception):
        return None


def _require_mobile_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header[7:].strip() if header.startswith("Bearer ") else ""
        username = _verify_token(token)
        if not username:
            return jsonify({"ok": False, "error": "App login required"}), 401
        request.optionsdesk_username = username
        return fn(*args, **kwargs)
    return wrapper


def _outbound_ip():
    now = time.time()
    if _IP_CACHE["value"] and now - _IP_CACHE["at"] < 30:
        return _IP_CACHE["value"]
    try:
        value = requests.get("https://api.ipify.org", timeout=4).text.strip()
    except Exception:
        value = ""
    _IP_CACHE.update({"at": now, "value": value})
    return value


def _kotak_config():
    outbound = _outbound_ip()
    whitelisted = os.getenv("KOTAK_NEO_WHITELISTED_IP", "").strip()
    configured = all([
        os.getenv("KOTAK_NEO_CONSUMER_KEY", "").strip(),
        os.getenv("KOTAK_NEO_MOBILE", "").strip(),
        os.getenv("KOTAK_NEO_UCC", "").strip(),
    ])
    whitelisted_list = [ip.strip() for ip in whitelisted.split(',') if ip.strip()]
    static_ready = bool(
        not whitelisted
        or whitelisted.lower() in ('auto', '*', 'any', 'dynamic', 'all')
        or (outbound and outbound in whitelisted_list)
        or (outbound and whitelisted and outbound == whitelisted)
    )
    return {
        "configured": configured,
        "liveTradingEnabled": _env_bool("OPTIONSDESK_LIVE_TRADING_ENABLED", False),
        "outboundIp": outbound,
        "whitelistedIp": whitelisted,
        "staticIpReady": static_ready,
        "sessionReady": bool(_KOTAK_SESSION_READY),
        "sessionAt": _KOTAK_SESSION_AT,
        "maxOrderQty": int(os.getenv("OPTIONSDESK_MAX_LIVE_ORDER_QTY", "2000") or 2000),
        "maxOrderValue": float(os.getenv("OPTIONSDESK_MAX_LIVE_ORDER_VALUE", "300000") or 300000),
        "maxOrdersPerDay": int(os.getenv("OPTIONSDESK_MAX_LIVE_ORDERS_PER_DAY", "20") or 20),
    }


def _load_kotak_sdk():
    try:
        from neo_api_client import NeoAPI
        return NeoAPI
    except Exception as exc:
        raise RuntimeError("Kotak Neo SDK is not installed. Add kotakneoapi==3.0.1 to requirements.txt") from exc


def _new_kotak_client():
    consumer_key = os.getenv("KOTAK_NEO_CONSUMER_KEY", "").strip()
    if not consumer_key:
        raise RuntimeError("KOTAK_NEO_CONSUMER_KEY is missing")
    NeoAPI = _load_kotak_sdk()
    return NeoAPI(consumer_key=consumer_key, environment="prod")


def _clean_expiry(value):
    return str(value or "").replace(" ", "").upper().strip()


def _as_float(value):
    try:
        x = float(value)
        return x if x == x else None
    except Exception:
        return None


def _resolve_kotak_contract(client, payload):
    exchange = str(payload.get("exchangeSegment") or "nse_fo").strip().lower()
    underlying = str(payload.get("underlying") or "").strip().upper()
    expiry = _clean_expiry(payload.get("expiry"))
    option_type = str(payload.get("optionType") or "").strip().upper()
    strike = _as_float(payload.get("strikePrice"))
    if not underlying or option_type not in {"CE", "PE"} or not strike:
        raise ValueError("Underlying, strike and CE/PE side are required to resolve the Kotak contract")

    rows = client.search_scrip(
        exchange_segment=exchange,
        symbol=underlying,
        expiry=expiry,
        option_type=option_type,
        strike_price=str(int(strike) if float(strike).is_integer() else strike),
        ignore_50multiple=False,
    )
    if isinstance(rows, dict) and rows.get("error"):
        raise ValueError(str(rows.get("error")))
    if not isinstance(rows, list):
        rows = []

    candidates = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        typ = str(row.get("pOptionType") or "").upper()
        trd = str(row.get("pTrdSymbol") or "").strip()
        row_strike = _as_float(row.get("dStrikePrice;") or row.get("dStrikePrice") or row.get("strikePrice"))
        if typ and typ != option_type:
            continue
        if row_strike is not None and abs(row_strike - strike) > 0.01:
            continue
        if not trd:
            continue
        candidates.append({
            "tradingSymbol": trd,
            "exchangeSegment": str(row.get("pExchSeg") or exchange),
            "expiry": str(row.get("pExpiryDate") or row.get("expiry") or ""),
            "lotSize": int(_as_float(row.get("lLotSize") or row.get("iLotSize") or 1) or 1),
            "token": str(row.get("pSymbol") or ""),
        })

    # When expiry was not provided, never guess between multiple contracts.
    unique = []
    seen = set()
    for item in candidates:
        key = (item["tradingSymbol"], item["expiry"])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    if not unique:
        raise ValueError("Kotak Neo contract not found for this strike")
    if len(unique) > 1:
        raise ValueError("Multiple Kotak expiries match this strike. Open the exact expiry before placing a live order.")
    return unique[0]


def _market_open_now():
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    if now.weekday() >= 5:
        return False
    hhmm = now.hour * 60 + now.minute
    return 9 * 60 + 15 <= hhmm <= 15 * 60 + 30


def _check_order_limits(quantity, reference_price):
    config = _kotak_config()
    if quantity <= 0 or quantity > config["maxOrderQty"]:
        raise ValueError(f"Quantity must be between 1 and {config['maxOrderQty']}")
    if reference_price and quantity * reference_price > config["maxOrderValue"]:
        raise ValueError(f"Order value exceeds backend limit of {config['maxOrderValue']:.0f}")
    day = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")
    if _DAILY_ORDER_COUNT["day"] != day:
        _DAILY_ORDER_COUNT.update({"day": day, "count": 0})
    if _DAILY_ORDER_COUNT["count"] >= config["maxOrdersPerDay"]:
        raise ValueError("Daily live-order limit reached")


def register_optionsdesk_v195_routes(app):
    @app.route("/api/mobile-auth/login", methods=["POST"])
    def optionsdesk_mobile_login():
        expected_user = os.getenv("OPTIONSDESK_APP_USERNAME", "").strip()
        expected_pass = os.getenv("OPTIONSDESK_APP_PASSWORD", "")
        if not expected_user or not expected_pass or _serializer() is None:
            return jsonify({"ok": False, "error": "App login is not configured on the backend"}), 503
        data = request.get_json(silent=True) or {}
        username = str(data.get("username") or "").strip()
        password = str(data.get("password") or "")
        if not (hmac.compare_digest(username, expected_user) and hmac.compare_digest(password, expected_pass)):
            time.sleep(0.35)
            return jsonify({"ok": False, "error": "Invalid username or password"}), 401
        token = _issue_token(username)
        return jsonify({"ok": True, "username": username, "token": token})

    @app.route("/api/mobile-auth/check", methods=["GET"])
    @_require_mobile_auth
    def optionsdesk_mobile_check():
        return jsonify({"ok": True, "username": getattr(request, "optionsdesk_username", "")})

    @app.route("/api/kotakneo/status", methods=["GET"])
    @_require_mobile_auth
    def kotakneo_status():
        return jsonify({"ok": True, **_kotak_config()})

    @app.route("/api/kotakneo/login", methods=["POST"])
    @_require_mobile_auth
    def kotakneo_login():
        global _KOTAK_CLIENT, _KOTAK_SESSION_READY, _KOTAK_SESSION_AT
        config = _kotak_config()
        if not config["configured"]:
            return jsonify({"ok": False, "error": "Kotak Neo backend variables are incomplete"}), 503
        if not config["staticIpReady"]:
            return jsonify({"ok": False, "error": "Backend outbound IP does not match KOTAK_NEO_WHITELISTED_IP"}), 409
        body = request.get_json(silent=True) or {}
        totp = str(body.get("totp") or "").strip()
        mpin = str(body.get("mpin") or "").strip()
        if len(totp) < 6 or len(mpin) < 4:
            return jsonify({"ok": False, "error": "Current TOTP and MPIN are required"}), 400
        try:
            with _KOTAK_LOCK:
                client = _new_kotak_client()
                login_resp = client.totp_login(
                    mobile_number=os.getenv("KOTAK_NEO_MOBILE", "").strip(),
                    ucc=os.getenv("KOTAK_NEO_UCC", "").strip(),
                    totp=totp,
                )
                validate_resp = client.totp_validate(mpin=mpin)
                _KOTAK_CLIENT = client
                _KOTAK_SESSION_READY = True
                _KOTAK_SESSION_AT = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")
            return jsonify({"ok": True, "message": "Kotak Neo trading session ready", "sessionAt": _KOTAK_SESSION_AT})
        except Exception as exc:
            _KOTAK_SESSION_READY = False
            return jsonify({"ok": False, "error": str(exc)}), 400

    @app.route("/api/kotakneo/resolve-contract", methods=["POST"])
    @_require_mobile_auth
    def kotakneo_resolve_contract():
        try:
            with _KOTAK_LOCK:
                client = _KOTAK_CLIENT or _new_kotak_client()
                contract = _resolve_kotak_contract(client, request.get_json(silent=True) or {})
            return jsonify({"ok": True, "contract": contract})
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

    @app.route("/api/kotakneo/order", methods=["POST"])
    @_require_mobile_auth
    def kotakneo_order():
        global _DAILY_ORDER_COUNT
        config = _kotak_config()
        if not config["liveTradingEnabled"]:
            return jsonify({"ok": False, "error": "Live trading kill switch is OFF"}), 403
        if not config["staticIpReady"]:
            return jsonify({"ok": False, "error": "Static IP check failed"}), 409
        if not config["sessionReady"] or _KOTAK_CLIENT is None:
            return jsonify({"ok": False, "error": "Kotak Neo trading session is not connected"}), 401
        if not _market_open_now() and not _env_bool("OPTIONSDESK_ALLOW_AMO", False):
            return jsonify({"ok": False, "error": "Live orders are blocked outside regular market hours"}), 409

        body = request.get_json(silent=True) or {}
        if body.get("confirmLive") is not True:
            return jsonify({"ok": False, "error": "Explicit live-order confirmation is required"}), 400
        client_order_id = str(body.get("clientOrderId") or "").strip()
        if not client_order_id:
            return jsonify({"ok": False, "error": "clientOrderId is required"}), 400
        now = time.time()
        for key, created in list(_RECENT_ORDER_IDS.items()):
            if now - created > 900:
                _RECENT_ORDER_IDS.pop(key, None)
        if client_order_id in _RECENT_ORDER_IDS:
            return jsonify({"ok": False, "error": "Duplicate order blocked"}), 409

        try:
            quantity = int(body.get("quantity") or 0)
            reference_price = _as_float(body.get("referencePrice")) or _as_float(body.get("price")) or 0
            _check_order_limits(quantity, reference_price)
            transaction = "B" if str(body.get("side") or "BUY").upper() == "BUY" else "S"
            order_type = str(body.get("orderType") or "MKT").upper()
            if order_type not in {"MKT", "L", "SL", "SL-M"}:
                raise ValueError("Unsupported order type")
            product = str(body.get("product") or "NRML").upper()
            if product not in {"NRML", "MIS", "CNC", "MTF"}:
                raise ValueError("Unsupported product type")
            exchange = str(body.get("exchangeSegment") or "nse_fo").lower()
            trading_symbol = str(body.get("tradingSymbol") or "").strip()
            contract = None
            with _KOTAK_LOCK:
                if not trading_symbol:
                    contract = _resolve_kotak_contract(_KOTAK_CLIENT, body)
                    trading_symbol = contract["tradingSymbol"]
                    exchange = contract["exchangeSegment"]
                _RECENT_ORDER_IDS[client_order_id] = now
                response = _KOTAK_CLIENT.place_order(
                    exchange_segment=exchange,
                    product=product,
                    price=str(body.get("price") or "0"),
                    order_type=order_type,
                    quantity=str(quantity),
                    validity="DAY",
                    trading_symbol=trading_symbol,
                    transaction_type=transaction,
                    amo="NO",
                    disclosed_quantity="0",
                    trigger_price=str(body.get("triggerPrice") or "0"),
                    tag=client_order_id[:20],
                )
            stat = str((response or {}).get("stat") or "").lower() if isinstance(response, dict) else ""
            if stat and stat not in {"ok", "success"}:
                _RECENT_ORDER_IDS.pop(client_order_id, None)
                return jsonify({"ok": False, "error": (response or {}).get("errMsg") or "Kotak Neo rejected the order", "data": response}), 400
            _DAILY_ORDER_COUNT["count"] += 1
            return jsonify({"ok": True, "message": "Live order sent to Kotak Neo", "contract": contract, "data": response})
        except Exception as exc:
            _RECENT_ORDER_IDS.pop(client_order_id, None)
            return jsonify({"ok": False, "error": str(exc)}), 400
