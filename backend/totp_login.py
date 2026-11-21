import os
import sys
import re
import pyotp
import requests
import base64
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from dotenv import load_dotenv
from fyers_apiv3 import fyersModel

def save_env_value(env_path, key, value):
    env_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated = False
    next_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"{key}="):
            next_lines.append(f"{key}={value}")
            updated = True
        else:
            next_lines.append(line)

    if not updated:
        if next_lines and next_lines[-1].strip():
            next_lines.append("")
        next_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(next_lines) + "\n", encoding="utf-8")

def normalize_access_token(client_id, access_token):
    token = str(access_token or "").strip()
    prefix = f"{client_id}:"
    if client_id and token.startswith(prefix):
        return token.split(":", 1)[1].strip()
    return token

def generate_fyers_token_via_totp(fyers_id, fyers_pin, totp_key, client_id, secret_key, redirect_uri="https://trade.fyers.in/api-login/redirect-uri/index.html"):
    """
    Automated Fyers V3 login using TOTP (2FA) and 4-digit PIN.
    Returns the new access_token string.
    """
    fyers_id = str(fyers_id or "").strip().upper()
    fyers_pin = str(fyers_pin or "").strip()
    totp_key = str(totp_key or "").replace(" ", "").strip()
    client_id = str(client_id or "").strip()
    secret_key = str(secret_key or "").strip()

    if not all([fyers_id, fyers_pin, totp_key, client_id, secret_key]):
        missing = []
        if not fyers_id: missing.append("FYERS_ID")
        if not fyers_pin: missing.append("FYERS_PIN")
        if not totp_key: missing.append("FYERS_TOTP_KEY")
        if not client_id: missing.append("FYERS_CLIENT_ID")
        if not secret_key: missing.append("FYERS_SECRET_KEY")
        raise ValueError(f"Missing required parameters: {', '.join(missing)}")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    # 1. Step 1: send_login_otp_v2 (FYERS API v3 Vagator endpoint with Base64-encoded fy_id)
    endpoint_send_otp = "https://api-t2.fyers.in/vagator/v2/send_login_otp_v2"
    encoded_fy_id = base64.b64encode(fyers_id.encode("utf-8")).decode("utf-8")
    payload_otp = {
        "fy_id": encoded_fy_id,
        "app_id": "2"
    }

    try:
        resp1 = requests.post(
            endpoint_send_otp,
            json=payload_otp,
            headers=headers,
            timeout=15
        )
    except requests.Timeout:
        raise RuntimeError(f"Step 1 ({endpoint_send_otp}) failed: request timeout (15s)")
    except requests.RequestException as exc:
        raise RuntimeError(f"Step 1 ({endpoint_send_otp}) failed: connection error ({type(exc).__name__})")

    res1 = None
    try:
        res1 = resp1.json()
    except Exception:
        raise RuntimeError(
            f"Step 1 ({endpoint_send_otp}) failed: status {resp1.status_code}, invalid JSON response"
        )

    # If rejected with -1025 using string app_id, retry with integer 2 for parser compatibility
    if isinstance(res1, dict) and res1.get("code") == -1025:
        payload_otp_int = {"fy_id": encoded_fy_id, "app_id": 2}
        try:
            resp_retry = requests.post(
                endpoint_send_otp,
                json=payload_otp_int,
                headers=headers,
                timeout=15
            )
            res_retry = resp_retry.json()
            if isinstance(res_retry, dict) and res_retry.get("s") == "ok" and res_retry.get("request_key"):
                resp1 = resp_retry
                res1 = res_retry
                payload_otp = payload_otp_int
        except Exception:
            pass

    if not isinstance(res1, dict):
        raise RuntimeError(
            f"Step 1 ({endpoint_send_otp}) failed: status {resp1.status_code}, unexpected response type"
        )

    status1 = res1.get("s")
    error_code1 = res1.get("code")
    message1 = res1.get("message") or "Unknown error"
    request_key = res1.get("request_key")

    # Diagnostic checks (Safe: NEVER exposes secrets or ID content)
    is_valid_b64 = False
    try:
        is_valid_b64 = (base64.b64decode(encoded_fy_id.encode("utf-8")).decode("utf-8") == fyers_id)
    except Exception:
        is_valid_b64 = False

    payload_fields_present = bool(payload_otp.get("fy_id") and payload_otp.get("app_id"))
    encoded_id_len = len(encoded_fy_id)

    if status1 == "error" or not request_key:
        code_str = f" [code {error_code1}]" if error_code1 is not None else ""
        diag_lines = [
            f"Step 1 ({endpoint_send_otp}) failed: status {resp1.status_code}{code_str} - {message1}",
            "--- Safe Diagnostics ---",
            f"Endpoint: {endpoint_send_otp}",
            f"HTTP Status: {resp1.status_code}",
            f"FYERS Error Code: {error_code1}",
            f"Sanitized Message: {message1}",
            f"Payload Required Fields: {'Present' if payload_fields_present else 'Missing'}",
            f"Encoded User ID Valid Base64: {is_valid_b64}",
            f"Encoded User ID Length: {encoded_id_len} characters",
            "------------------------"
        ]
        raise RuntimeError("\n".join(diag_lines))

    # 2. Step 2: verify_otp with TOTP code
    totp = pyotp.TOTP(totp_key)
    current_otp = str(totp.now()).zfill(6)
    print(f"[*] Generated TOTP code for {fyers_id}.")

    endpoint_verify_otp = "https://api-t2.fyers.in/vagator/v2/verify_otp"
    payload_verify_otp = {"request_key": request_key, "otp": current_otp}
    try:
        resp2 = requests.post(endpoint_verify_otp, json=payload_verify_otp, headers=headers, timeout=15)
        res2 = resp2.json()
    except requests.Timeout:
        raise RuntimeError(f"Step 2 ({endpoint_verify_otp}) failed: request timeout (15s)")
    except requests.RequestException as exc:
        raise RuntimeError(f"Step 2 ({endpoint_verify_otp}) failed: connection error ({type(exc).__name__})")
    except Exception:
        raise RuntimeError(f"Step 2 ({endpoint_verify_otp}) failed: invalid JSON response")

    if not isinstance(res2, dict) or res2.get("s") == "error" or not res2.get("request_key"):
        msg2 = res2.get("message") if isinstance(res2, dict) else "unexpected response"
        raise RuntimeError(f"Step 2 (verify_otp) failed: {msg2}")

    request_key_2 = res2["request_key"]

    # 3. Step 3: verify_pin
    endpoint_verify_pin = "https://api-t2.fyers.in/vagator/v2/verify_pin"
    payload_pin = {"request_key": request_key_2, "identity_type": "pin", "identifier": fyers_pin}
    try:
        resp3 = requests.post(endpoint_verify_pin, json=payload_pin, headers=headers, timeout=15)
        res3 = resp3.json()
    except requests.Timeout:
        raise RuntimeError(f"Step 3 ({endpoint_verify_pin}) failed: request timeout (15s)")
    except requests.RequestException as exc:
        raise RuntimeError(f"Step 3 ({endpoint_verify_pin}) failed: connection error ({type(exc).__name__})")
    except Exception:
        raise RuntimeError(f"Step 3 ({endpoint_verify_pin}) failed: invalid JSON response")

    token = (res3.get("data", {}).get("token") or res3.get("data", {}).get("access_token")) if isinstance(res3, dict) else None
    if not token or (isinstance(res3, dict) and res3.get("s") == "error"):
        msg3 = res3.get("message") if isinstance(res3, dict) else "unexpected response"
        raise RuntimeError(f"Step 3 (verify_pin) failed: {msg3}")

    # 4. Step 4: generate auth_code URL
    app_id_prefix = client_id.split("-")[0] if "-" in client_id else client_id
    app_type = client_id.split("-")[1] if "-" in client_id else "100"

    headers_auth = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=UTF-8",
        "User-Agent": headers["User-Agent"]
    }

    payload_auth = {
        "fyers_id": fyers_id,
        "app_id": app_id_prefix,
        "redirect_uri": redirect_uri,
        "appType": app_type,
        "code_challenge": "",
        "state": "None",
        "scope": "",
        "nonce": "",
        "response_type": "code",
        "create_cookie": True
    }

    endpoint_token = "https://api-t1.fyers.in/api/v3/token"
    try:
        resp4 = requests.post(endpoint_token, json=payload_auth, headers=headers_auth, timeout=15)
        res4 = resp4.json()
    except requests.Timeout:
        raise RuntimeError(f"Step 4 ({endpoint_token}) failed: request timeout (15s)")
    except requests.RequestException as exc:
        raise RuntimeError(f"Step 4 ({endpoint_token}) failed: connection error ({type(exc).__name__})")
    except Exception:
        raise RuntimeError(f"Step 4 ({endpoint_token}) failed: invalid JSON response")

    url_with_code = res4.get("Url") if isinstance(res4, dict) else None
    if not url_with_code or res4.get("s") == "error":
        msg4 = res4.get("message") if isinstance(res4, dict) else "unexpected response"
        raise RuntimeError(f"Step 4 (generate_auth_code) failed: {msg4}")

    parsed = urlparse(url_with_code)
    auth_code = parse_qs(parsed.query).get("auth_code", [None])[0]
    if not auth_code:
        raise RuntimeError("Step 4 did not return auth_code in URL")

    print("[*] Successfully obtained authorization code.")

    # 5. Step 5: Exchange auth_code for Access Token
    session = fyersModel.SessionModel(
        client_id=client_id,
        secret_key=secret_key,
        redirect_uri=redirect_uri,
        response_type="code",
        grant_type="authorization_code"
    )
    session.set_token(auth_code)
    token_resp = session.generate_token()

    if not isinstance(token_resp, dict) or token_resp.get("s") == "error" or not token_resp.get("access_token"):
        err_detail = token_resp.get("message") if isinstance(token_resp, dict) else "token exchange error"
        raise RuntimeError(f"Step 5 (token exchange) failed: {err_detail}")

    raw_token = token_resp.get("access_token")
    access_token = normalize_access_token(client_id, raw_token)
    return access_token

def main():
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=env_path, override=True)

    client_id = os.getenv("FYERS_CLIENT_ID")
    secret_key = os.getenv("FYERS_SECRET_KEY")
    fyers_id = os.getenv("FYERS_ID")
    fyers_pin = os.getenv("FYERS_PIN")
    totp_key = os.getenv("FYERS_TOTP_KEY")

    print("=== FYERS AUTOMATED TOTP LOGIN ===")
    print("Loaded env from:", env_path)
    print(f"FYERS_ID: {'Found' if fyers_id else 'Missing'}")
    print(f"FYERS_PIN: {'Found' if fyers_pin else 'Missing'}")
    print(f"FYERS_TOTP_KEY: {'Found' if totp_key else 'Missing'}")
    print(f"FYERS_CLIENT_ID: {'Found' if client_id else 'Missing'}")
    print(f"FYERS_SECRET_KEY: {'Found' if secret_key else 'Missing'}")
    print("==================================")

    if not all([client_id, secret_key, fyers_id, fyers_pin, totp_key]):
        print("\nMissing credentials in backend/.env!")
        if not fyers_id:
            fyers_id = input("Enter your Fyers User ID (e.g. XA12345): ").strip()
            if fyers_id: save_env_value(env_path, "FYERS_ID", fyers_id)
        if not fyers_pin:
            fyers_pin = input("Enter your 4-digit Fyers PIN: ").strip()
            if fyers_pin: save_env_value(env_path, "FYERS_PIN", fyers_pin)
        if not totp_key:
            totp_key = input("Enter your Fyers 2FA / TOTP Secret Key: ").strip()
            if totp_key: save_env_value(env_path, "FYERS_TOTP_KEY", totp_key)

    try:
        token = generate_fyers_token_via_totp(
            fyers_id=fyers_id,
            fyers_pin=fyers_pin,
            totp_key=totp_key,
            client_id=client_id,
            secret_key=secret_key
        )
        save_env_value(env_path, "FYERS_ACCESS_TOKEN", token)
        print(f"\n[SUCCESS] Generated new FYERS_ACCESS_TOKEN.")
        print(f"Saved automatically to {env_path}")
    except Exception as e:
        print(f"\n❌ Error during TOTP login: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
