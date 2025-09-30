import os, requests

def send_email(to: str, subject: str, html: str) -> dict:
    url = os.getenv("VERCEL_ALERTS_URL") or _from_streamlit("VERCEL_ALERTS_URL")
    key = os.getenv("VERCEL_ALERTS_KEY") or _from_streamlit("VERCEL_ALERTS_KEY")
    if not url or not key:
        raise RuntimeError("Missing VERCEL_ALERTS_URL or VERCEL_ALERTS_KEY")

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

def _from_streamlit(k: str):
    try:
        import streamlit as st
        return st.secrets.get(k)
    except Exception:
        return None
