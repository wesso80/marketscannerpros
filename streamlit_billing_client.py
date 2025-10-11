import hmac, hashlib, base64, os, requests
try:
    import streamlit as st
    S = st.secrets.get("APP_SIGNING_SECRET", os.getenv("APP_SIGNING_SECRET", "dev"))
    API = st.secrets.get("MARKET_API_URL", os.getenv("MARKET_API_URL", "http://localhost:3001"))
except Exception:
    S = os.getenv("APP_SIGNING_SECRET", "dev")
    API = os.getenv("MARKET_API_URL", "http://localhost:3001")

def _sig(wid: str) -> str:
    d = hmac.new(S.encode(), wid.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(d).decode().rstrip("=")

def get_tier(wid: str) -> str:
    try:
        r = requests.get(f"{API}/api/subscription-status", params={"wid": wid, "sig": _sig(wid)}, timeout=6)
        return r.json().get("tier", "free") if r.ok else "free"
    except Exception:
        return "free"

def checkout(wid: str, plan: str = "pro"):
    r = requests.post(f"{API}/api/payments/checkout", json={"plan": plan, "workspaceId": wid}, timeout=10)
    return r.json()

def portal(wid: str):
    r = requests.post(f"{API}/api/payments/portal", json={"workspaceId": wid}, timeout=10)
    return r.json()
