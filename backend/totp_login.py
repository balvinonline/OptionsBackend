import os
import sys
import re
import pyotp
import requests
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

    # 1. Generate current 6-digit TOTP code
    totp = pyotp.TOTP(totp_key)
    current_otp = str(totp.now()).zfill(6)
    print(f"[*] Generated TOTP OTP for {fyers_id}: {current_otp}")

    headers = {
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    # 2. Step 1: send_login_otp
    res1 = requests.post(
        "https://api-t2.fyers.in/vagator/v2/send_login_otp",
        json={"fy_id": fyers_id, "app_id": "2"},
        headers=headers,
        timeout=15
    ).json()

    if res1.get("s") == "error" or not res1.get("request_key"):
        raise RuntimeError(f"Step 1 (send_login_otp) failed: {res1.get('message') or res1}")

    request_key = res1["request_key"]

    # 3. Step 2: verify_otp with TOTP code
    res2 = requests.post(
        "https://api-t2.fyers.in/vagator/v2/verify_otp",
        json={"request_key": request_key, "otp": current_otp},
        headers=headers,
        timeout=15
    ).json()

    if res2.get("s") == "error" or not res2.get("request_key"):
        raise RuntimeError(f"Step 2 (verify_otp) failed: {res2.get('message') or res2}")

    request_key_2 = res2["request_key"]

    # 4. Step 3: verify_pin
    res3 = requests.post(
        "https://api-t2.fyers.in/vagator/v2/verify_pin",
        json={"request_key": request_key_2, "identity_type": "pin", "identifier": fyers_pin},
        headers=headers,
        timeout=15
    ).json()

    token = res3.get("data", {}).get("token")
    if not token or res3.get("s") == "error":
        raise RuntimeError(f"Step 3 (verify_pin) failed: {res3.get('message') or res3}")

    # 5. Step 4: generate auth_code URL
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

    res4 = requests.post(
        "https://api-t1.fyers.in/api/v3/token",
        json=payload_auth,
        headers=headers_auth,
        timeout=15
    ).json()

    url_with_code = res4.get("Url")
    if not url_with_code or res4.get("s") == "error":
        raise RuntimeError(f"Step 4 (generate_auth_code) failed: {res4.get('message') or res4}")

    parsed = urlparse(url_with_code)
    auth_code = parse_qs(parsed.query).get("auth_code", [None])[0]
    if not auth_code:
        raise RuntimeError(f"Step 4 did not return auth_code in URL: {url_with_code}")

    print(f"[*] Successfully obtained auth_code: {auth_code[:10]}...")

    # 6. Step 5: Exchange auth_code for Access Token
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
        raise RuntimeError(f"Step 5 (token exchange) failed: {token_resp}")

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
        print(f"\n🎉 SUCCESS! Generated new FYERS_ACCESS_TOKEN:")
        print(f"{token[:15]}...{token[-10:]}")
        print(f"Saved automatically to {env_path}")
    except Exception as e:
        print(f"\n❌ Error during TOTP login: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
