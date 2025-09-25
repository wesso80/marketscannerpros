import streamlit as st

# ---------- Page & theme ----------
st.set_page_config(page_title="MarketScanner Pros", page_icon="📊", layout="wide")

# Favicon + social preview
st.markdown(
    "<link rel='icon' href='/static/favicon.ico'><meta property='og:image' content='/static/og-cover.jpg'>",
    unsafe_allow_html=True,
)

# ---------- Global CSS (matches the website look) ----------
CSS = """
#MainMenu, header, footer {visibility: hidden;}
:root{ --panel:#111826; --border:rgba(255,255,255,.08); --muted:#9db0c7; --brand:#5ee1a9; }
.block-container { padding-top: 1.2rem; padding-bottom: 2.4rem; max-width: 1200px; }
/* Top bar */
.ms-topbar { display:flex; align-items:center; justify-content:space-between; gap: 12px; padding: 10px 14px;
  border: 1px solid var(--border); border-radius: 12px; background: #0d1421; position: sticky; top: 0; z-index: 5; backdrop-filter: blur(8px); }
.ms-brand { font-weight: 800; letter-spacing: .2px; }
.ms-actions a { text-decoration:none; padding: 8px 12px; border-radius: 10px; border:1px solid var(--border); margin-left:8px;}
.ms-actions a.primary { background: var(--brand); color:#000; border-color: transparent; }
/* Cards / panels */
.ms-card { border:1px solid var(--border); border-radius:16px; padding:16px; background:var(--panel); }
.ms-kicker { color:#7aa4ff; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.3px; }
.ms-muted { color: var(--muted); }
/* Metrics */
[data-testid="stMetric"] { border:1px solid var(--border); border-radius:14px; padding: 10px 12px; background:var(--panel); }
/* Table helpers */
.ms-table table { border-collapse:collapse; width:100%; }
.ms-table th, .ms-table td { border-bottom:1px solid var(--border); padding:12px 14px; text-align:left; }
.ms-table tbody tr:last-child td { border-bottom:none; }
/* Footer */
.ms-footer { margin-top: 24px; border-top: 1px solid var(--border); padding-top: 14px; color: var(--muted); font-size: 14px; }
"""
st.markdown(f"<style>{CSS}</style>", unsafe_allow_html=True)

# ---------- Top bar ----------
st.markdown(
    """
    <div class="ms-topbar">
      <div class="ms-brand">MarketScanner Pros</div>
      <div class="ms-actions">
        <a href="https://marketscannerpros.app/pricing.html">Pricing</a>
        <a href="https://marketscannerpros.app/docs.html">Docs</a>
        <a href="https://marketscannerpros.app/status.html">Status</a>
        <a class="primary" href="https://marketscannerpros.app">Website</a>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)

# ---------- Sidebar nav ----------
with st.sidebar:
    st.header("Navigation")
    st.page_link("app.py", label="Home", icon="🏠")
    st.page_link("pages/Pricing.py", label="Pricing", icon="💳")
    st.page_link("pages/Privacy.py", label="Privacy", icon="🔒")
    st.page_link("pages/Terms.py", label="Terms", icon="📜")
    st.page_link("pages/Disclaimer.py", label="Disclaimer", icon="⚠️")

# ---------- Hero ----------
st.markdown("### Scan crypto & stocks across timeframes — fast.")
st.markdown('<p class="ms-muted">Confluence heatmaps, squeeze detections, RSI/ATR/EMA rules, and alert-ready signals.</p>', unsafe_allow_html=True)

k1, k2, k3 = st.columns(3)
k1.metric("TFs", "30m → Weekly")
k2.metric("Watchlists", "Multi-asset")
k3.metric("Status", "Live")

# ---------- Feature cards ----------
c1, c2, c3 = st.columns(3)
with c1:
    st.markdown('<div class="ms-card"><div class="ms-kicker">Signals</div><h4>Multi-TF Confluence</h4><p class="ms-muted">30m → Weekly stacking with color-coded strength & trend bias.</p></div>', unsafe_allow_html=True)
with c2:
    st.markdown('<div class="ms-card"><div class="ms-kicker">Volatility</div><h4>Squeezes & Expansion</h4><p class="ms-muted">Spot compression, breakouts and ATR context quickly.</p></div>', unsafe_allow_html=True)
with c3:
    st.markdown('<div class="ms-card"><div class="ms-kicker">Workflow</div><h4>Export & Alerts</h4><p class="ms-muted">CSV export; ready hooks for email/Telegram/push alerts.</p></div>', unsafe_allow_html=True)

st.divider()

# ---------- Scanner UI (hook your logic here) ----------
st.markdown("#### Scanner")

left, right = st.columns([1,2], vertical_alignment="top")
with left:
    market = st.selectbox("Market", ["Crypto", "Equities"])
    tf_pack = st.selectbox("Timeframes", ["30m/1h/4h/D", "1h/4h/D/W"])
    symbol = st.text_input("Symbol", value="BTCUSDT")
    run = st.button("Run scan", type="primary")
    if run:
        st.toast("Scan started…", icon="✅")

with right:
    # Replace this table with your real results frame.
    st.markdown(
        '<div class="ms-card ms-table"><h4>Results</h4>'
        '<table><thead><tr><th>Symbol</th><th>Bias</th><th>Confluence</th><th>Notes</th></tr></thead>'
        '<tbody><tr><td>BTCUSDT</td><td>Bullish</td><td>4/5</td><td>Squeeze forming</td></tr>'
        '<tr><td>ETHUSDT</td><td>Neutral</td><td>3/5</td><td>ATR rising</td></tr></tbody></table></div>',
        unsafe_allow_html=True
    )

# ---------- Footer ----------
st.markdown(
    '<div class="ms-footer">© 2025 MarketScanner Pros · '
    '<a href="https://marketscannerpros.app/disclaimer.html">Disclaimer</a> · '
    '<a href="https://marketscannerpros.app/privacy.html">Privacy</a> · '
    '<a href="https://marketscannerpros.app/terms.html">Terms</a> · '
    '<a href="mailto:support@marketscannerpros.app">Contact</a></div>',
    unsafe_allow_html=True
)
