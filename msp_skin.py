import streamlit as st

# Page meta (safe to call even if already set in app.py)
try:
    st.set_page_config(page_title="MarketScanner Pros", page_icon="📊", layout="wide")
except Exception:
    pass  # ignore if already configured

# ---- BRAND THEME / CSS (non-destructive) ----
# ================= THEME CSS (drop-in replacement) ================
# ============== Minimal CSS (topbar only) ==============
CSS = """
/* Top bar container */
.ms-topbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:10px 14px;
  background:#0d1421;            /* dark bar */
  border:1px solid rgba(255,255,255,.08);
  border-radius:14px;
  position:sticky;
  top:0;
  z-index:5;
}

/* Brand text (left) */
.ms-topbar .brand{
  font-weight:800;
  letter-spacing:.2px;
  color:#e9eef7;
}

/* Right-side links */
.ms-topbar a{
  text-decoration:none;
  padding:8px 12px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.1);
  color:#7fb4ff;                 /* link blue */
  background:#0e1624;
  transition:.15s ease;
  margin-left:8px;
}

/* Primary call-to-action (Website) */
.ms-topbar a.cta{
  background:#5ee1a9;
  color:#000;
}

/* Hover */
.ms-topbar a:hover{
  border-color:#5ee1a9;
  background:rgba(94,225,169,.15);
}
"""
st.markdown(f"<style>{CSS}</style>", unsafe_allow_html=True)




# ---- OPTIONAL TOP BAR (set to False to hide) ----
SHOW_TOPBAR = True
if SHOW_TOPBAR:
    st.markdown("""
    <div class="ms-topbar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;
    border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#0d1421;position:sticky;top:0;z-index:5;">
      <div style="display:flex;align-items:center;gap:10px;">
        <!-- Optional logo -->
        <!-- <img src="https://marketscannerpros.app/assets/logo-32.png" width="22" height="22" alt="logo" /> -->
        <div style="font-weight:800;letter-spacing:.2px;">MarketScanner Pros</div>
      </div>
      <div>
        <a href="https://marketscannerpros.app/pricing" style="text-decoration:none;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);margin-left:8px;">Pricing</a>
        <a href="https://marketscannerpros.app/docs" style="text-decoration:none;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);margin-left:8px;">Docs</a>
        <a href="https://marketscannerpros.app/status" style="text-decoration:none;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);margin-left:8px;">Status</a>
        <a href="https://marketscannerpros.app" style="text-decoration:none;padding:8px 12px;border-radius:10px;background:#5ee1a9;color:#000;margin-left:8px;">Website</a>
      </div>
    </div>
    """, unsafe_allow_html=True)


# ---- OPTIONAL FOOTER (toggle) ----
SHOW_FOOTER = False
if SHOW_FOOTER:
    st.markdown(
        '<div class="ms-footer">© 2025 MarketScanner Pros · '
        '<a href="https://marketscannerpros.app/disclaimer">Disclaimer</a> · '
        '<a href="https://marketscannerpros.app/privacy">Privacy</a> · '
        '<a href="https://marketscannerpros.app/terms">Terms</a> · '
        '<a href="mailto:support@marketscannerpros.app">Contact</a></div>',
        unsafe_allow_html=True
    )
