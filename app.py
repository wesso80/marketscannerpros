import streamlit as st

# Configure page
st.set_page_config(
    page_title="MarketScanner Pro - Redirecting...",
    page_icon="🔄",
    initial_sidebar_state="collapsed"
)

# Hide the sidebar and streamlit menu
st.markdown("""
<style>
    .reportview-container {
        margin-top: -2em;
    }
    #MainMenu {visibility: hidden;}
    .stDeployButton {display:none;}
    footer {visibility: hidden;}
    #stDecoration {display:none;}
    .css-1d391kg {display:none;}
    .css-hi6a2p {display:none;}
    [data-testid="stSidebar"] {display: none;}
    [data-testid="stSidebarNav"] {display: none;}
</style>
""", unsafe_allow_html=True)

# JavaScript redirect
st.markdown("""
<script>
    window.location.replace("https://marketscannerpros.app");
</script>
""", unsafe_allow_html=True)

# Meta refresh redirect as backup
st.markdown("""
<meta http-equiv="refresh" content="0; url=https://marketscannerpros.app">
""", unsafe_allow_html=True)

# Show loading message
st.markdown("""
<div style="
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 50vh;
    text-align: center;
    font-family: Arial, sans-serif;
">
    <h1 style="color: #667eea; margin-bottom: 20px;">🚀 MarketScanner Pro</h1>
    <div style="
        border: 3px solid rgba(102, 126, 234, 0.3);
        border-radius: 50%;
        border-top: 3px solid #667eea;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
        margin: 20px auto;
    "></div>
    <p style="color: #666; font-size: 18px;">Redirecting to our new home...</p>
    <p style="color: #888; font-size: 14px;">
        <a href="https://marketscannerpros.app" style="color: #667eea; text-decoration: none;">
            Click here if you're not redirected automatically
        </a>
    </p>
</div>

<style>
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>
""", unsafe_allow_html=True)

# Force immediate redirect using Streamlit's builtin JavaScript
st.markdown("""
<script>
    setTimeout(function() {
        window.location.href = "https://marketscannerpros.app";
    }, 100);
</script>
""", unsafe_allow_html=True)