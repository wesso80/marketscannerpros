import streamlit as st

st.set_page_config(page_title="MarketScanner Pros", page_icon="📊", layout="wide")

st.title("Scan crypto & stocks across timeframes — fast.")
st.write("Confluence heatmaps, squeeze detections, RSI/ATR/EMA rules, and alert-ready signals.")

col1, col2, col3 = st.columns(3)
with col1: st.metric("TFs", "30m → Weekly")
with col2: st.metric("Watchlists", "Multi-asset")
with col3: st.metric("Status", "Live")

st.page_link("pages/Pricing.py", label="See Pricing", icon="💳")
st.page_link("pages/Privacy.py", label="Privacy", icon="🔒")
st.page_link("pages/Terms.py", label="Terms", icon="📜")
st.page_link("pages/Disclaimer.py", label="Disclaimer", icon="⚠️")
