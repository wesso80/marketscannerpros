import os, requests

def send_email(to: str, subject: str, html: str) -> dict:
    # Try environment variables first, then Streamlit secrets as fallback
    url = os.getenv("VERCEL_ALERTS_URL")
    key = os.getenv("VERCEL_ALERTS_KEY")
    
    # If not in environment, try Streamlit secrets
    if not url or not key:
        try:
            import streamlit as st
            url = url or st.secrets.get("VERCEL_ALERTS_URL")
            key = key or st.secrets.get("VERCEL_ALERTS_KEY")
        except Exception:
            pass  # Streamlit not available or secrets not configured
    
    if not url or not key:
        raise RuntimeError("Missing VERCEL_ALERTS_URL or VERCEL_ALERTS_KEY in environment variables or Streamlit secrets")

    r = requests.post(
        url,
        headers={"Content-Type": "application/json", "x-alerts-key": key},
        json={"to": to, "subject": subject, "html": html},
        timeout=15,
    )
    try:
        data = r.json()
    except Exception:
        data = {"error": f"Non-JSON response: {r.text[:200]}"}
    if r.status_code != 200:
        raise RuntimeError(data.get("error") or f"HTTP {r.status_code}")
    return data

