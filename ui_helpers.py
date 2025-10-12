import streamlit as st
import plotly.graph_objects as go

def inject_base_ui():
    st.set_page_config(page_title="MarketScanner Pros", layout="wide")
    st.markdown(f"<style>{open('assets/styles.css','r',encoding='utf-8').read()}</style>", unsafe_allow_html=True)

def ms_plotly_dark(fig: go.Figure) -> go.Figure:
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(17,24,39,1)",   # #111827
        font=dict(color="#E5E7EB"),
        xaxis=dict(gridcolor="#334155", zerolinecolor="#334155"),
        yaxis=dict(gridcolor="#334155", zerolinecolor="#334155"),
        margin=dict(l=24, r=16, t=24, b=24),
    )
    return fig

def hero():
    left, right = st.columns([0.55, 0.45], gap="large")
    with left:
        st.markdown('<div class="ms-h1">Market<span style="color:#10B981">Scanner</span> Pros</div>', unsafe_allow_html=True)
        st.write("Run smart scans, interpret scores, and manage alerts.")
        st.markdown('<a class="ms-btn" href="https://app.marketscannerpros.app">🚀 Launch App</a>', unsafe_allow_html=True)
        st.markdown('<div class="ms-h2">Why MarketScanner?</div>', unsafe_allow_html=True)
        st.markdown("""
        <ul class="ms-bullets">
          <li>Multi-timeframe confluence scoring</li>
          <li>Squeeze detection and momentum context</li>
          <li>CSV exports and alert hooks</li>
        </ul>
        """, unsafe_allow_html=True)
    with right:
        st.markdown('<div class="ms-mock">', unsafe_allow_html=True)
        st.image("marketing_mock.png", use_container_width=True)  # replace file if you have a different path
        st.markdown('</div>', unsafe_allow_html=True)
