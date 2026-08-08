from fyers_apiv3 import fyersModel
from dotenv import load_dotenv
from pathlib import Path
import os
import re
import sys
import traceback
import webbrowser
from urllib.parse import parse_qs, urlparse

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

def extract_auth_code(value):
    text = str(value or "").strip()
    if not text:
        return ""

    if "auth_code=" in text or "code=" in text:
        parsed = urlparse(text)
        params = parse_qs(parsed.query)
        for key in ("auth_code", "code"):
            if params.get(key):
                return params[key][0].strip()

    match = re.search(r"(?:auth_code|code)=([^&\s]+)", text)
    if match:
        return match.group(1).strip()

    return text

def main():
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=env_path, override=True)

    client_id = (os.getenv("FYERS_CLIENT_ID") or "").strip()
    secret_key = (os.getenv("FYERS_SECRET_KEY") or "").strip()
    redirect_uri = "https://trade.fyers.in/api-login/redirect-uri/index.html"

    print("=== FYERS TOKEN GENERATOR ===")
    print("Loaded .env from:", env_path)
    print("client_id present:", bool(client_id))
    print("secret_key present:", bool(secret_key))
    print("working dir:", os.getcwd())
    print("=============================")

    if not client_id or not secret_key:
        print("\n❌ Missing env vars.")
        print("Add these to backend/.env :")
        print("FYERS_CLIENT_ID=YOUR_CLIENT_ID")
        print("FYERS_SECRET_KEY=YOUR_SECRET_KEY")
        sys.exit(1)

    session = fyersModel.SessionModel(
        client_id=client_id,
        secret_key=secret_key,
        redirect_uri=redirect_uri,
        response_type="code",
        grant_type="authorization_code",
    )

    login_url = session.generate_authcode()
    print("\n1) Opening Fyers login in your browser...")
    print(login_url)
    try:
        webbrowser.open(login_url)
    except Exception:
        print("\nCould not open browser automatically. Open the URL above manually.")

    print("\n2) Complete Fyers login in the browser.")
    print("3) After redirect, copy the full final URL from browser address bar.")
    print("   You can also paste only the auth_code value.")

    auth_code = extract_auth_code(input("\nPaste final URL or auth_code here: "))
    if not auth_code:
        print("❌ auth_code blank. Exiting.")
        sys.exit(1)

    session.set_token(auth_code)
    resp = session.generate_token()

    print("\n=== TOKEN RESPONSE ===")
    print(resp)

    access_token = resp.get("access_token") if isinstance(resp, dict) else None
    access_token = normalize_access_token(client_id, access_token)
    if access_token:
        save_env_value(env_path, "FYERS_ACCESS_TOKEN", access_token)
        print("\n✅ ACCESS TOKEN saved automatically to:")
        print(env_path)
        print("\nIf the dashboard launcher is already open, click Refresh in the dashboard.")
    else:
        print("\n❌ access_token not found in response. Check response above.")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("\n❌ Script crashed:")
        traceback.print_exc()
