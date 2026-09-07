"""OptionsDesk v1.9.5 mobile-auth + Kotak Neo live-trading routes.

Features:
- Auto-TOTP generation via KOTAK_NEO_TOTP_KEY + KOTAK_NEO_MPIN.
- Instant in-memory algorithmic NSE/BSE option symbol generation (prevents 502 gateway timeouts).
- Direct Kotak Neo broker execution pad.
"""
from __future__ import annotations

import hmac
import os
import re
import threading
import time
from datetime import datetime, date
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


def _get_totp_secret() -> str:
    known_vars = [
        "KOTAK_NEO_TOTP_KEY",
        "KOTAK_NEO_TOTP_SECRET",
        "KOTAK_TOTP_SECRET",
        "KOTAK_TOTP_KEY",
        "KOTAK_NEO_TOTP",
        "KOTAK_TOTP",
        "KOTAK_SECRET_KEY",
        "NEO_TOTP",
        "NEO_TOTP_KEY",
        "NEO_TOTP_SECRET",
        "KOTAK_NEO_SECRET",
        "KOTAK_NEO_API_TOTP",
        "NEO_TOTP_TOKEN",
    ]
    for var in known_vars:
        val = os.getenv(var, "").replace(" ", "").strip()
        if val:
            return val
    # Dynamic scan: MUST NOT match FYERS, and MUST contain KOTAK or NEO
    for k, v in os.environ.items():
        k_upper = k.upper()
        if "FYERS" in k_upper:
            continue
        if ("KOTAK" in k_upper or "NEO" in k_upper) and ("TOTP" in k_upper or "SECRET" in k_upper):
            cleaned = v.replace(" ", "").strip()
            if len(cleaned) >= 14:
                return cleaned
    return ""


def _format_kotak_response_error(resp) -> str:
    if not isinstance(resp, dict):
        return str(resp or "")
    err_field = resp.get("error")
    reasons = []
    if isinstance(err_field, list):
        for item in err_field:
            if isinstance(item, dict):
                m = item.get("message") or item.get("error") or str(item)
                if m:
                    reasons.append(str(m))
            elif isinstance(item, str) and item:
                reasons.append(item)
    elif isinstance(err_field, dict):
        m = err_field.get("message") or err_field.get("error")
        if m:
            reasons.append(str(m))
    elif isinstance(err_field, str) and err_field:
        reasons.append(err_field)

    top_msg = str(resp.get("message") or "").strip()
    if reasons:
        detail = "; ".join(reasons)
        if top_msg and top_msg != "Validation Errors" and top_msg not in detail:
            return f"{top_msg}: {detail}"
        return detail
    if top_msg:
        return top_msg
    return str(resp)


def _get_mpin_from_env() -> str:
    for var in [
        "KOTAK_NEO_MPIN",
        "KOTAK_MPIN",
        "NEO_MPIN",
        "KOTAK_PIN",
        "KOTAK_NEO_PIN",
    ]:
        val = os.getenv(var, "").strip()
        if len(val) == 6 and val.isdigit():
            return val
    for k, v in os.environ.items():
        k_upper = k.upper()
        if "FYERS" in k_upper:
            continue
        if ("KOTAK" in k_upper or "NEO" in k_upper) and ("MPIN" in k_upper or "PIN" in k_upper):
            cleaned = v.strip()
            if len(cleaned) == 6 and cleaned.isdigit():
                return cleaned
    return ""


def _get_auto_totp() -> str:
    secret = _get_totp_secret()
    if not secret:
        return ""
    try:
        import pyotp
        clean_secret = secret.replace(" ", "").strip().upper()
        return str(pyotp.TOTP(clean_secret).now()).strip()
    except Exception as e:
        logger.warning(f"Could not calculate TOTP from secret key: {e}")
        return ""


def _is_auto_totp_configured() -> bool:
    return bool(_get_totp_secret() and _get_mpin_from_env())


def _kotak_config():
    outbound = _outbound_ip()
    whitelisted = os.getenv("KOTAK_NEO_WHITELISTED_IP", "").strip()
    configured = all([
        os.getenv("KOTAK_NEO_CONSUMER_KEY", "").strip(),
        os.getenv("KOTAK_NEO_MOBILE", "").strip(),
        os.getenv("KOTAK_NEO_UCC", "").strip(),
    ])
    auto_totp_ready = _is_auto_totp_configured()
    return {
        "configured": configured,
        "autoTotpConfigured": auto_totp_ready,
        "totpKeyConfigured": bool(_get_totp_secret()),
        "mpinConfigured": bool(_get_mpin_from_env()),
        "liveTradingEnabled": _env_bool("OPTIONSDESK_LIVE_TRADING_ENABLED", False),
        "outboundIp": outbound,
        "whitelistedIp": whitelisted,
        "staticIpReady": bool(
            not whitelisted
            or whitelisted.lower() in ('auto', '*', 'any', 'dynamic', 'all')
            or (outbound and outbound in [ip.strip() for ip in whitelisted.split(',') if ip.strip()])
            or (outbound and whitelisted and outbound == whitelisted)
        ),
        "sessionReady": bool(_KOTAK_SESSION_READY and _KOTAK_CLIENT and getattr(_KOTAK_CLIENT.configuration, "edit_token", None)),
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


def _perform_kotak_login(totp: str | None = None, mpin: str | None = None):
    global _KOTAK_CLIENT, _KOTAK_SESSION_READY, _KOTAK_SESSION_AT
    totp_val = str(totp or "").strip() or _get_auto_totp()
    mpin_val = str(mpin or "").strip() or _get_mpin_from_env()

    if len(totp_val) < 6:
        raise ValueError("TOTP is missing or invalid. Provide a 6-digit TOTP code or configure KOTAK_NEO_TOTP_KEY on the backend.")
    if len(mpin_val) != 6 or not mpin_val.isdigit():
        raise ValueError(f"Kotak Neo MPIN must be exactly 6 digits (received {len(mpin_val)} digits). Kotak Neo uses a 6-digit MPIN (the PIN used to open the Kotak Neo app), not a 4-digit ATM/banking PIN.")

    with _KOTAK_LOCK:
        client = _new_kotak_client()
        mobile = os.getenv("KOTAK_NEO_MOBILE", "").strip()
        ucc = os.getenv("KOTAK_NEO_UCC", "").strip()
        if not mobile or not ucc:
            raise ValueError("KOTAK_NEO_MOBILE and KOTAK_NEO_UCC must be configured.")
        if len(mobile) == 10 and mobile.isdigit():
            mobile = f"+91{mobile}"
        elif len(mobile) == 12 and mobile.startswith("91") and mobile.isdigit():
            mobile = f"+{mobile}" 

        login_resp = client.totp_login(
            mobile_number=mobile,
            ucc=ucc,
            totp=totp_val,
        )

        # Verify Step 1 (TOTP Login) succeeded and view_token was set
        view_token = getattr(client.configuration, "view_token", None)
        if not view_token or not isinstance(login_resp, dict) or not login_resp.get("data"):
            _KOTAK_SESSION_READY = False
            _KOTAK_CLIENT = None
            err_msg = _format_kotak_response_error(login_resp)
            raise ValueError(f"Kotak Neo Step 1 (TOTP) failed: {err_msg or 'Invalid TOTP code or credentials. Please check your authenticator app.'}")

        # Step 2: Validate MPIN (Kotak Neo uses a 6-digit MPIN)
        validate_resp = client.totp_validate(mpin=mpin_val)

        # Verify Step 2 (Trading Session Token) succeeded
        edit_token = getattr(client.configuration, "edit_token", None)
        edit_sid = getattr(client.configuration, "edit_sid", None)
        if not edit_token or not edit_sid:
            _KOTAK_SESSION_READY = False
            _KOTAK_CLIENT = None
            err_msg = _format_kotak_response_error(validate_resp)
            raise ValueError(f"Kotak Neo Step 2 (MPIN) failed: {err_msg or 'Invalid MPIN. Please enter your 6-digit Kotak Neo MPIN.'}")

        _KOTAK_CLIENT = client
        _KOTAK_SESSION_READY = True
        _KOTAK_SESSION_AT = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")
        return {
            "sessionAt": _KOTAK_SESSION_AT,
            "loginResp": login_resp,
            "validateResp": validate_resp,
        }


def _clean_expiry(value) -> str:
    """Format any expiry input into Kotak Neo's DDMMMYYYY format (e.g. 08SEP2026)."""
    if not value:
        return ""
    s = str(value).strip().replace(" ", "").upper()
    if re.match(r"^\d{2}[A-Z]{3}\d{4}$", s):
        return s
    if re.match(r"^\d{1}[A-Z]{3}\d{4}$", s):
        return f"0{s}"

    clean_date = s.split("T")[0].split(" ")[0].replace("/", "-")
    parts = clean_date.split("-")
    months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

    if len(parts) == 3:
        if len(parts[0]) == 4:
            try:
                y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                return f"{d:02d}{months[m - 1]}{y}"
            except Exception:
                pass
        elif len(parts[2]) == 4:
            try:
                d, y = int(parts[0]), int(parts[2])
                if parts[1].isdigit():
                    m = int(parts[1])
                    return f"{d:02d}{months[m - 1]}{y}"
                else:
                    mon = parts[1][:3].upper()
                    return f"{d:02d}{mon}{y}"
            except Exception:
                pass

    try:
        import pandas as pd
        dt = pd.to_datetime(s)
        return dt.strftime("%d%b%Y").upper()
    except Exception:
        pass

    return s.replace("-", "").replace("/", "")


def _construct_nse_symbol(underlying: str, expiry: str, strike: float, option_type: str) -> str:
    """Algorithmically construct standard NSE option trading symbol in microseconds without downloading CSV."""
    try:
        exp = _clean_expiry(expiry)
        if len(exp) == 9:
            dd = exp[:2]
            mon = exp[2:5]
            yyyy = exp[5:]
            yy = yyyy[-2:]
            month_map = {
                "JAN": "1", "FEB": "2", "MAR": "3", "APR": "4", "MAY": "5", "JUN": "6",
                "JUL": "7", "AUG": "8", "SEP": "9", "OCT": "O", "NOV": "N", "DEC": "D"
            }
            m_code = month_map.get(mon, "1")
            strike_str = str(int(strike) if float(strike).is_integer() else strike)
            return f"{underlying}{yy}{m_code}{dd}{strike_str}{option_type}"
    except Exception:
        pass
    return ""


def _as_float(value):
    try:
        x = float(value)
        return x if x == x else None
    except Exception:
        return None


def _get_nearest_expiry(underlying: str) -> str:
    from datetime import timedelta
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    u = str(underlying or "NIFTY").upper()
    target_weekday = 1 if u in ["NIFTY", "FINNIFTY"] else (
        2 if u == "BANKNIFTY" else (
            4 if u == "SENSEX" else 3
        )
    )
    days_ahead = (target_weekday - now.weekday()) % 7
    if days_ahead == 0 and (now.hour > 15 or (now.hour == 15 and now.minute >= 30)):
        days_ahead = 7
    expiry_date = now + timedelta(days=days_ahead)
    months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    return f"{expiry_date.day:02d}{months[expiry_date.month - 1]}{expiry_date.year}"


def _resolve_kotak_contract(client, payload):
    exchange = str(payload.get("exchangeSegment") or "nse_fo").strip().lower()
    underlying = str(payload.get("underlying") or "").strip().upper()
    expiry = _clean_expiry(payload.get("expiry")) or _get_nearest_expiry(underlying)
    option_type = str(payload.get("optionType") or "").strip().upper()
    strike = _as_float(payload.get("strikePrice") or payload.get("strike"))
    if not underlying or option_type not in {"CE", "PE"} or not strike:
        raise ValueError("Underlying, strike and CE/PE side are required to resolve the Kotak contract")

    strike_str = str(int(strike) if float(strike).is_integer() else strike)

    # 1. Fast algorithmic symbol construction (instant, zero memory, zero network timeout)
    algo_symbol = _construct_nse_symbol(underlying, expiry, strike, option_type)
    if not algo_symbol:
        # Fallback monthly or standard format
        algo_symbol = f"{underlying}{expiry[:2]}{strike_str}{option_type}"

    lot_map = {"NIFTY": 65, "BANKNIFTY": 30, "SENSEX": 20, "FINNIFTY": 60, "MIDCPNIFTY": 120}
    lot = lot_map.get(underlying, 65)
    return {
        "tradingSymbol": algo_symbol,
        "exchangeSegment": exchange,
        "expiry": expiry,
        "lotSize": lot,
        "token": "",
    }


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
        global _KOTAK_SESSION_READY
        auto_connect = request.args.get("auto_connect", "1").strip().lower() in {"1", "true", "yes"}
        cfg = _kotak_config()
        if auto_connect and not cfg["sessionReady"] and cfg["autoTotpConfigured"] and cfg["configured"]:
            try:
                _perform_kotak_login()
            except Exception:
                pass
        return jsonify({"ok": True, **_kotak_config()})

    @app.route("/api/kotakneo/login", methods=["POST"])
    @_require_mobile_auth
    def kotakneo_login():
        config = _kotak_config()
        if not config["configured"]:
            return jsonify({"ok": False, "error": "Kotak Neo backend variables are incomplete"}), 503
        if not config["staticIpReady"]:
            return jsonify({"ok": False, "error": "Backend outbound IP does not match KOTAK_NEO_WHITELISTED_IP"}), 409
        body = request.get_json(silent=True) or {}
        totp_input = str(body.get("totp") or "").strip()
        mpin_input = str(body.get("mpin") or "").strip()
        try:
            result = _perform_kotak_login(totp=totp_input or None, mpin=mpin_input or None)
            return jsonify({
                "ok": True,
                "message": "Kotak Neo trading session ready",
                "sessionAt": result.get("sessionAt"),
                "autoTotp": not bool(totp_input),
            })
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

    @app.route("/api/kotakneo/resolve-contract", methods=["POST"])
    @_require_mobile_auth
    def kotakneo_resolve_contract():
        try:
            with _KOTAK_LOCK:
                client = _KOTAK_CLIENT or _new_kotak_client()
                contract = _resolve_kotak_contract(client, request.get_json(silent=True) or {})
            return jsonify({
                "ok": True,
                "contract": contract,
                "tradingSymbol": contract.get("tradingSymbol"),
                "token": contract.get("token"),
                "lotSize": contract.get("lotSize"),
            })
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

        # Auto-reconnect if session expired but auto-TOTP is available
        if (not config["sessionReady"] or _KOTAK_CLIENT is None) and config["autoTotpConfigured"]:
            try:
                _perform_kotak_login()
                config = _kotak_config()
            except Exception as exc:
                return jsonify({"ok": False, "error": f"Kotak session auto-reconnect failed: {exc}"}), 401

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

            # Direct trading symbol without prefix
            trading_symbol = str(body.get("tradingSymbol") or "").replace("NSE:", "").replace("BSE:", "").strip()
            underlying = str(body.get("underlying") or "").strip().upper()
            expiry = _clean_expiry(body.get("expiry"))
            option_type = str(body.get("optionType") or "").strip().upper()
            strike = _as_float(body.get("strikePrice") or body.get("strike"))

            # Fallback to fast algorithmic symbol if not provided
            if not trading_symbol and underlying and expiry and strike and option_type:
                trading_symbol = _construct_nse_symbol(underlying, expiry, strike, option_type)

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
                )
            resp_dict = response if isinstance(response, dict) else {}
            err_val = resp_dict.get("Error") or resp_dict.get("Error Message") or resp_dict.get("errMsg")
            stat = str(resp_dict.get("stat") or "").lower()

            if err_val or (stat and stat not in {"ok", "success"}):
                _RECENT_ORDER_IDS.pop(client_order_id, None)
                err_msg = str(err_val or resp_dict.get("message") or "Kotak Neo rejected the order")
                return jsonify({"ok": False, "error": err_msg, "data": resp_dict}), 400

            order_no = resp_dict.get("nOrdNo") or resp_dict.get("orderId") or client_order_id
            _DAILY_ORDER_COUNT["count"] += 1
            return jsonify({
                "ok": True,
                "message": f"Live order accepted by Kotak Neo (Order #{order_no})",
                "orderNumber": str(order_no),
                "tradingSymbol": trading_symbol,
                "data": resp_dict,
            })
        except Exception as exc:
            _RECENT_ORDER_IDS.pop(client_order_id, None)
            return jsonify({"ok": False, "error": str(exc)}), 400

    @app.route("/api/kotakneo/positions", methods=["GET"])
    @_require_mobile_auth
    def kotakneo_positions():
        global _KOTAK_CLIENT
        config = _kotak_config()
        if (not config["sessionReady"] or _KOTAK_CLIENT is None) and config["autoTotpConfigured"]:
            try:
                _perform_kotak_login()
                config = _kotak_config()
            except Exception as exc:
                return jsonify({"ok": False, "error": f"Kotak session auto-reconnect failed: {exc}"}), 401
        if not config["sessionReady"] or _KOTAK_CLIENT is None:
            return jsonify({"ok": False, "error": "Kotak Neo trading session is not connected"}), 401
        try:
            with _KOTAK_LOCK:
                resp = _KOTAK_CLIENT.positions()
            return jsonify({"ok": True, "data": resp})
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

    @app.route("/api/kotakneo/orders", methods=["GET"])
    @_require_mobile_auth
    def kotakneo_orders():
        global _KOTAK_CLIENT
        config = _kotak_config()
        if (not config["sessionReady"] or _KOTAK_CLIENT is None) and config["autoTotpConfigured"]:
            try:
                _perform_kotak_login()
                config = _kotak_config()
            except Exception as exc:
                return jsonify({"ok": False, "error": f"Kotak session auto-reconnect failed: {exc}"}), 401
        if not config["sessionReady"] or _KOTAK_CLIENT is None:
            return jsonify({"ok": False, "error": "Kotak Neo trading session is not connected"}), 401
        try:
            with _KOTAK_LOCK:
                resp = _KOTAK_CLIENT.order_report()
            return jsonify({"ok": True, "data": resp})
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
