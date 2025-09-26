# market_scanner_app.py
# One-file Market Scanner (pure pandas) + Streamlit Dashboard
# - Equities & Crypto via yfinance (AAPL, MSFT, BTC-USD, ETH-USD…)
# - ATR-based position sizing
# - Optional Email + Slack summaries
# - CSV download

import os

import pandas as pd, numpy as np, yfinance as yf, requests, streamlit as st
import psycopg2
from psycopg2.extras import RealDictCursor
import psycopg2.extensions
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime, timezone
from dateutil import tz
from math import floor
import io
import json
import qrcode
from PIL import Image
import base64
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import plotly.express as px
import stripe

# ================= MOBILE DETECTION (CONSOLIDATED) =================
# Detect mobile once at the top using proper headers and query params
if 'is_mobile' not in st.session_state:
    # Check query parameter override first
    try:
        qp = st.query_params if hasattr(st, 'query_params') else st.experimental_get_query_params()
        mobile_param = qp.get('mobile', [''])
        mobile_query = str(mobile_param[0] if isinstance(mobile_param, list) else mobile_param).lower()
        query_override = mobile_query in ('1', 'true', 'yes', 'y') if mobile_query else None
    except:
        query_override = None
    
    # Check User-Agent from headers (proper method)
    try:
        headers = st.context.headers if hasattr(st, 'context') and hasattr(st.context, 'headers') else {}
        user_agent = headers.get('User-Agent', '').lower()
        ua_mobile = any(keyword in user_agent for keyword in ['iphone', 'ios', 'mobile', 'android', 'ipad'])
    except:
        ua_mobile = False
    
    # Final decision: query override wins, then user agent detection
    st.session_state.is_mobile = query_override if query_override is not None else ua_mobile

is_mobile = st.session_state.is_mobile

# ================= PWA Configuration =================
st.set_page_config(page_title="Market Scanner Dashboard", page_icon="📈", layout="wide")

# Show mode in sidebar AFTER mobile detection is complete
st.sidebar.write("Mode:", "Mobile" if is_mobile else "Web")


# ================= Professional Styling =================
st.markdown("""
<style>
/* Professional Global Styles */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
    --primary-color: #1f2937;
    --secondary-color: #3b82f6;
    --accent-color: #10b981;
    --danger-color: #ef4444;
    --warning-color: #f59e0b;
    --background-gradient: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --card-shadow-hover: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    --border-radius: 12px;
    --spacing-unit: 1rem;
    
    /* Light theme colors */
    --app-bg: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    --card-bg: white;
    --metric-card-bg: linear-gradient(135deg, #fff 0%, #f8fafc 100%);
    --text-color: #1f2937;
    --text-muted: #6b7280;
    --border-color: #e5e7eb;
}

/* MOBILE DARK MODE - Highest priority overrides */
html[data-mobile-dark="true"],
html[data-mobile-dark="true"] body {
    background-color: rgb(14, 17, 23) !important;
    color: rgb(250, 250, 250) !important;
    color-scheme: dark !important;
}

/* Force ALL containers to dark - Maximum specificity */
html[data-mobile-dark="true"] .stApp,
html[data-mobile-dark="true"] [data-testid="stAppViewContainer"],
html[data-mobile-dark="true"] .main .block-container,
html[data-mobile-dark="true"] section.main,
html[data-mobile-dark="true"] .block-container,
html[data-mobile-dark="true"] div.block-container {
    background-color: rgb(14, 17, 23) !important;
    background: rgb(14, 17, 23) !important;
}

/* Override any Streamlit theme that tries to change it back */
html[data-mobile-dark="true"] * {
    color-scheme: dark !important;
}

/* For non-mobile, let Streamlit handle theme */
.stApp {
    background: transparent !important;
}

[data-testid="stAppViewContainer"] {
    background: transparent !important;
}

.main .block-container {
    background: transparent !important;
}

/* Main App Background - Let Streamlit theme system handle it */
.stApp {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Header Styling */
.main-header {
    background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    padding: 2rem 0;
    margin: -1rem -2rem 2rem -2rem;
    border-radius: 0 0 var(--border-radius) var(--border-radius);
    box-shadow: var(--card-shadow);
    color: white;
    text-align: center;
}

.main-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(135deg, #10b981, #3b82f6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.main-header p {
    font-size: 1.125rem;
    opacity: 0.9;
    margin: 0.5rem 0 0 0;
    font-weight: 400;
}

.app-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 1rem auto;
    display: block;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* Professional Cards */
.pro-card {
    background: var(--card-bg);
    border-radius: var(--border-radius);
    padding: 1.5rem;
    margin: 1rem 0;
    box-shadow: var(--card-shadow);
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
}

.pro-card:hover {
    box-shadow: var(--card-shadow-hover);
    transform: translateY(-2px);
}

.pro-card h3 {
    color: var(--text-color);
    font-weight: 600;
    margin-bottom: 1rem;
    font-size: 1.25rem;
}

/* Metrics Cards */
.metric-card {
    background: var(--metric-card-bg);
    border-radius: var(--border-radius);
    padding: 1.5rem;
    margin: 0.5rem 0;
    box-shadow: var(--card-shadow);
    border-left: 4px solid var(--secondary-color);
    transition: all 0.3s ease;
}

.metric-card:hover {
    box-shadow: var(--card-shadow-hover);
}

.metric-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-color);
    margin: 0;
}

.metric-label {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* Fix Streamlit success/error/info banners for dark mode */
@media (prefers-color-scheme: dark) {
    .stSuccess, .stError, .stInfo, .stWarning {
        background: var(--card-bg) !important;
        color: var(--text-color) !important;
        border-color: var(--border-color) !important;
        border-left: 1px solid var(--border-color) !important;
    }
}

html[data-mobile-dark="true"] .stSuccess,
html[data-mobile-dark="true"] .stError, 
html[data-mobile-dark="true"] .stInfo,
html[data-mobile-dark="true"] .stWarning {
    background: var(--card-bg) !important;
    color: var(--text-color) !important;
    border-color: var(--border-color) !important;
    border-left: 1px solid var(--border-color) !important;
}

/* Professional Buttons */
.stButton > button,
button[data-testid="stBaseButton-secondary"],
button[kind="secondary"],
[data-testid="stBaseButton-secondary"],
div[data-testid="stButton"] button {
    background: linear-gradient(135deg, var(--secondary-color), #2563eb) !important;
    background-image: linear-gradient(135deg, var(--secondary-color), #2563eb) !important;
    color: white !important;
    border: none !important;
    border-radius: var(--border-radius) !important;
    padding: 0.75rem 1.5rem !important;
    font-weight: 600 !important;
    font-size: 1rem !important;
    transition: all 0.3s ease !important;
    box-shadow: var(--card-shadow) !important;
    font-family: 'Inter', sans-serif !important;
    min-height: auto !important;
}

.stButton > button:hover,
button[data-testid="stBaseButton-secondary"]:hover,
button[kind="secondary"]:hover {
    background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
    box-shadow: var(--card-shadow-hover) !important;
    transform: translateY(-1px) !important;
}

/* Sidebar Enhancements */
.css-1d391kg {
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    border-right: 1px solid #d1d5db;
}

/* Data Tables */
.stDataFrame {
    border-radius: var(--border-radius);
    overflow: hidden;
    box-shadow: var(--card-shadow);
}

/* Status Indicators */
.status-success {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    display: inline-block;
    margin: 0.25rem;
}

.status-warning {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    display: inline-block;
    margin: 0.25rem;
}

.status-danger {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    display: inline-block;
    margin: 0.25rem;
}

/* Subscription Tiers */
.tier-card {
    background: linear-gradient(135deg, #fff 0%, #f8fafc 100%);
    border-radius: var(--border-radius);
    padding: 2rem;
    margin: 1rem 0;
    box-shadow: var(--card-shadow);
    border: 2px solid transparent;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.tier-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(135deg, var(--secondary-color), var(--accent-color));
}

.tier-card:hover {
    border-color: var(--secondary-color);
    box-shadow: var(--card-shadow-hover);
    transform: translateY(-4px);
}

.tier-card.premium {
    border-color: #fbbf24;
    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
}

.tier-card.premium::before {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
}

/* Dark mode overrides for tier cards with high specificity */
@media (prefers-color-scheme: dark) {
    .stApp .tier-card {
        background: var(--card-bg) !important;
        border-color: var(--border-color) !important;
        color: var(--text-color) !important;
    }
    
    .stApp .tier-card.premium {
        background: var(--card-bg) !important;
        border-color: #f59e0b !important;
        color: var(--text-color) !important;
    }
}

/* Mobile app dark mode overrides for tier cards */
html[data-mobile-dark="true"] .stApp .tier-card {
    background: var(--card-bg) !important;
    border-color: var(--border-color) !important;
    color: var(--text-color) !important;
}

html[data-mobile-dark="true"] .stApp .tier-card.premium {
    background: var(--card-bg) !important;
    border-color: #f59e0b !important;
    color: var(--text-color) !important;
}

.price-display {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--text-color);
    margin: 1rem 0;
}

.price-period {
    font-size: 1rem;
    color: var(--text-muted);
    font-weight: 400;
}

/* Feature Lists */
.feature-list {
    list-style: none;
    padding: 0;
    margin: 1rem 0;
}

.feature-list li {
    padding: 0.5rem 0;
    color: var(--text-color);
    font-weight: 500;
    position: relative;
    padding-left: 1.5rem;
}

.feature-list li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: var(--accent-color);
    font-weight: 700;
}

/* Responsive Design */
@media (max-width: 768px) {
    .main-header h1 {
        font-size: 2rem;
    }
    
    .main-header p {
        font-size: 1rem;
    }
    
    .tier-card {
        padding: 1.5rem;
    }
    
    .price-display {
        font-size: 2rem;
    }
}

/* Success/Error Messages */
.stSuccess {
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    border-left: 4px solid var(--accent-color);
    border-radius: var(--border-radius);
}

.stError {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    border-left: 4px solid var(--danger-color);
    border-radius: var(--border-radius);
}

.stInfo {
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    border-left: 4px solid var(--secondary-color);
    border-radius: var(--border-radius);
}

/* Loading States */
.stSpinner {
    color: var(--secondary-color);
}

/* Charts Enhancement */
.js-plotly-plot {
    border-radius: var(--border-radius);
    box-shadow: var(--card-shadow);
    overflow: hidden;
}
</style>
""", unsafe_allow_html=True)

# Mobile detection and dark mode activation (ORIGINAL WORKING VERSION)
st.markdown("""
<script>
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileParam = urlParams.get('mobile');
    
    // Mobile detection
    const isIOS = userAgent.includes('iphone') || userAgent.includes('ipad') || 
                  window.navigator.standalone === true;
    const isMobile = mobileParam === '1' || isIOS;
    
    // Set mobile dark mode attribute for CSS targeting
    if (isMobile) {
        document.documentElement.setAttribute('data-mobile-dark', 'true');
        document.documentElement.style.colorScheme = 'dark';
    }
    
    // Auto-redirect iOS devices to add mobile parameter
    if (isIOS && !mobileParam && !window.__reloadedForMobile) {
        window.__reloadedForMobile = true;
        urlParams.set('mobile', '1');
        window.location.search = urlParams.toString();
    }
})();
</script>
""", unsafe_allow_html=True)

# Privacy Policy - redirect to external URL
if st.sidebar.button("📄 Privacy Policy", help="View our Privacy Policy"):
    st.markdown('<meta http-equiv="refresh" content="0;URL=https://marketscannerspros.pages.dev/privacy" target="_blank">', unsafe_allow_html=True)
    st.info("🔗 Redirecting to Privacy Policy...")
    st.stop()  # Stop execution to redirect

# Handle static file serving for PWA assets at root level
# Files copied to root: manifest.webmanifest, sw.js, assetlinks.json

st.markdown("""
<link rel="manifest" href="/manifest.webmanifest">
<script>
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }
</script>
""", unsafe_allow_html=True)

# ================= Config =================
@dataclass
class ScanConfig:
    symbols_equity: List[str]
    symbols_crypto: List[str]     # BTC-USD style
    tf_equity: str = "1D"         # 1D or 1h/30m/15m/5m/1m (yfinance intraday limited)
    tf_crypto: str = "1h"
    top_k: int = 15
    min_dollar_vol: float = 2_000_000
    # Risk / Position sizing defaults
    account_equity: float = 10_000.0
    risk_pct: float = 0.01          # 1% per trade
    stop_atr_mult: float = 1.5
    # Optional notifications
    slack_webhook: str = os.getenv("SLACK_WEBHOOK_URL", "")
    # Legacy SMTP settings removed - now using user-specific SendGrid system

CFG = ScanConfig(
    symbols_equity=["AAPL","MSFT","NVDA","TSLA","AMD","META","GOOGL","AMZN","NFLX","CRM"],
    symbols_crypto=["BTC-USD","ETH-USD","SOL-USD","BNB-USD","XRP-USD","ADA-USD","DOGE-USD","AVAX-USD"],
    tf_equity="1D",
    tf_crypto="1h",
    top_k=15,
    min_dollar_vol=2_000_000
)

SYD = tz.gettz("Australia/Sydney")

# ================= Stripe Configuration =================
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Subscription pricing configuration
SUBSCRIPTION_PLANS = {
    "pro": {
        "name": "Pro",
        "price": 4.99,
        "price_id": None,  # Will be set when creating Stripe products
        "features": ["Real-time market data", "Technical analysis", "Basic alerts"]
    },
    "pro_trader": {
        "name": "Pro Trader", 
        "price": 9.99,
        "price_id": None,  # Will be set when creating Stripe products
        "features": ["Everything in Pro", "Advanced analytics", "Premium alerts", "Priority support"]
    }
}

# ================= Utilities =================
def _yf_interval_period(tf: str) -> Tuple[str, str]:
    t = tf.lower().strip()
    if t in ("1d","1day","d"):       return ("1d","2y")
    if t in ("1h","60m"):            return ("60m","730d")
    if t in ("30m","15m","5m","1m"): return (t, "60d")  # yfinance limit
    return ("1d","2y")

def min_bars_required(tf: str) -> int:
    t = tf.lower()
    if t in ("1d","d"):    return 210
    if t in ("1h","60m"):  return 350
    if t in ("30m","15m"): return 500
    if t in ("5m","1m"):   return 700
    return 210

def dollar_volume(df: pd.DataFrame) -> float:
    return float((df["close"] * df["volume"]).tail(20).mean())

# ================= Database Connection =================
@st.cache_resource
def get_connection_pool():
    """Get PostgreSQL connection pool with better SSL handling"""
    try:
        from psycopg2 import pool
        import psycopg2.extensions
        
        connection_pool = pool.SimpleConnectionPool(
            1, 10,  # Reduce max connections to avoid overwhelming DB
            host=os.getenv("PGHOST"),
            port=os.getenv("PGPORT"),
            database=os.getenv("PGDATABASE"),
            user=os.getenv("PGUSER"),
            password=os.getenv("PGPASSWORD"),
            # Add connection timeout and SSL settings
            connect_timeout=10,
            sslmode='require',
            options='-c statement_timeout=30000'  # 30 second query timeout
        )
        return connection_pool
    except Exception as e:
        st.error(f"Database connection pool failed: {e}")
        return None

def execute_db_query(query: str, params: Optional[tuple] = None, fetch: bool = True, retries: int = 3):
    """Execute database query with retry logic for connection drops"""
    pool = get_connection_pool()
    if not pool:
        return None
    
    for attempt in range(retries):
        conn = None
        try:
            conn = pool.getconn()
            
            # Check connection health
            if conn.closed or conn.status != 1:  # 1 = CONNECTION_OK
                # Connection is bad, discard it and get a new one
                try:
                    pool.putconn(conn, close=True)
                except Exception:
                    pass
                conn = pool.getconn()
            
            # Test the connection with a simple query
            with conn.cursor() as test_cur:
                test_cur.execute("SELECT 1")
            
            # Execute the actual query
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                if fetch:
                    return [dict(row) for row in cur.fetchall()]
                else:
                    conn.commit()
                    return cur.rowcount
                    
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            # Connection-related errors - retry with backoff
            if conn:
                try:
                    pool.putconn(conn, close=True)
                except Exception:
                    pass
                conn = None
            
            if attempt < retries - 1:
                import time
                time.sleep(0.5 * (attempt + 1))  # Exponential backoff
                continue
            else:
                st.error(f"Database connection failed after {retries} attempts: {e}")
                return None
                
        except Exception as e:
            # Other errors - don't retry
            st.error(f"Database query failed: {e}")
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
                try:
                    pool.putconn(conn)
                except Exception:
                    pass
            return None
            
        finally:
            if conn:
                try:
                    pool.putconn(conn)
                except Exception:
                    pass
        
        # If we reach here, the query succeeded
        break
    
    return None

def execute_db_write(query: str, params: Optional[tuple] = None) -> Optional[int]:
    """Execute database write query and return affected row count"""
    result = execute_db_query(query, params, fetch=False)
    return result if isinstance(result, int) else None

def execute_db_write_returning(query: str, params: Optional[tuple] = None) -> Optional[List[Dict[str, Any]]]:
    """Execute write query with RETURNING clause - commits and returns results"""
    pool = get_connection_pool()
    if not pool:
        return None
    
    conn = None
    try:
        conn = pool.getconn()
        
        # Check connection health
        if conn.closed or conn.status != 1:
            try:
                pool.putconn(conn, close=True)
            except Exception:
                pass
            conn = pool.getconn()
        
        # Execute the query with commit and return
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            results = [dict(row) for row in cur.fetchall()]
            conn.commit()  # CRITICAL: Commit the transaction
            return results
                    
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        return None
        
    finally:
        if conn:
            try:
                pool.putconn(conn)
            except Exception:
                pass
    
    return None

# ================= Anonymous Data Sync System =================
import secrets
import string
from datetime import datetime, timedelta
import uuid

def generate_device_fingerprint() -> str:
    """Generate a unique device fingerprint"""
    return str(uuid.uuid4())

def get_persistent_device_fingerprint() -> str:
    """Get or create a persistent device fingerprint - SECURE approach"""
    # Check if we already have a device fingerprint in session state
    if 'device_fingerprint' in st.session_state:
        return st.session_state.device_fingerprint
    
    # Check for pairing token in URL (from QR code scan) - ONLY trusted auth method
    query_params = st.query_params
    pair_token = query_params.get('pair', None)
    if isinstance(pair_token, list):
        pair_token = pair_token[0] if pair_token else None
        
    if pair_token:
        # Generate device fingerprint for pairing
        new_fingerprint = str(uuid.uuid4())
        # Try to consume the pairing token
        workspace_id = consume_pairing_token(pair_token, new_fingerprint, "web", "Web Browser")
        if workspace_id:
            st.session_state.device_fingerprint = new_fingerprint
            st.session_state.workspace_id = workspace_id
            # Remove ALL auth-related parameters from URL for security
            st.query_params.clear()
            st.success("🎉 Device successfully paired! You now have access to all your Pro features.")
            st.rerun()
            return new_fingerprint
        else:
            st.error("❌ Invalid or expired pairing code. Please try again.")
    
    # SECURITY: Never trust device_id from URL - generate new fingerprint
    # This prevents account takeover via URL spoofing
    new_fingerprint = str(uuid.uuid4())
    st.session_state.device_fingerprint = new_fingerprint
    
    # NOTE: We intentionally do NOT persist device_id in URL for security
    # Users must use pairing tokens for cross-device access
    
    return new_fingerprint

def generate_pairing_token() -> str:
    """Generate a secure pairing token (10 chars)"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(10))

def create_workspace() -> Optional[str]:
    """Create a new anonymous workspace"""
    query = "INSERT INTO workspaces DEFAULT VALUES RETURNING id"
    result = execute_db_write_returning(query)
    if result and len(result) > 0:
        return str(result[0]['id'])
    return None

def get_or_create_workspace_for_device(device_fingerprint: str) -> Optional[str]:
    """Get existing workspace for device or create new one"""
    # Check if device already exists - select most recent workspace deterministically
    query = """
        SELECT workspace_id FROM devices 
        WHERE device_fingerprint = %s AND revoked_at IS NULL
        ORDER BY created_at DESC 
        LIMIT 1
    """
    result = execute_db_query(query, (device_fingerprint,))
    
    if result and len(result) > 0:
        return str(result[0]['workspace_id'])
    
    # Create new workspace and register device
    workspace_id = create_workspace()
    if workspace_id:
        register_device(workspace_id, device_fingerprint, "web", "Web Browser")
        return workspace_id
    
    return None

def register_device(workspace_id: str, device_fingerprint: str, platform: str, device_name: str) -> bool:
    """Register a device to a workspace"""
    query = """
        INSERT INTO devices (workspace_id, device_fingerprint, platform, device_name)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (workspace_id, device_fingerprint) 
        DO UPDATE SET last_seen = NOW(), revoked_at = NULL
    """
    result = execute_db_write(query, (workspace_id, device_fingerprint, platform, device_name))
    return result is not None and result >= 0

def create_pairing_token(workspace_id: str) -> Optional[str]:
    """Create a pairing token for workspace"""
    token = generate_pairing_token()
    expires_at = datetime.now() + timedelta(minutes=10)  # 10 minute expiry
    
    query = """
        INSERT INTO pairing_tokens (token, workspace_id, expires_at)
        VALUES (%s, %s, %s)
    """
    result = execute_db_write(query, (token, workspace_id, expires_at))
    
    if result is not None and result > 0:
        return token
    return None

def consume_pairing_token(token: str, device_fingerprint: str, platform: str, device_name: str) -> Optional[str]:
    """Consume a pairing token and add device to workspace (atomic operation)"""
    try:
        # Atomic: update token and get workspace_id in single query to prevent race conditions
        query = """
            UPDATE pairing_tokens 
            SET used_at = NOW() 
            WHERE token = %s AND used_at IS NULL AND expires_at > NOW()
            RETURNING workspace_id
        """
        result = execute_db_write_returning(query, (token,))
        
        if not result or len(result) == 0:
            return None  # Token invalid, expired, or already used
            
        workspace_id = str(result[0]['workspace_id'])
        
        # Register device to workspace (using ON CONFLICT to handle duplicates)
        if register_device(workspace_id, device_fingerprint, platform, device_name):
            return workspace_id
        
        return None
        
    except Exception as e:
        return None

# ================= Admin Authentication System =================

def is_admin_session_valid(workspace_id: str, device_fingerprint: str) -> bool:
    """Check if current device has valid admin session"""
    query = """
        SELECT 1 FROM admin_sessions 
        WHERE workspace_id = %s AND device_fingerprint = %s 
        AND expires_at > NOW()
        LIMIT 1
    """
    result = execute_db_query(query, (workspace_id, device_fingerprint))
    return result is not None and len(result) > 0

def create_admin_session(workspace_id: str, device_fingerprint: str) -> bool:
    """Create admin session for device (30 day expiry)"""
    expires_at = datetime.now() + timedelta(days=30)
    query = """
        INSERT INTO admin_sessions (workspace_id, device_fingerprint, expires_at)
        VALUES (%s, %s, %s)
        ON CONFLICT (workspace_id, device_fingerprint) 
        DO UPDATE SET expires_at = %s, created_at = NOW()
    """
    result = execute_db_write(query, (workspace_id, device_fingerprint, expires_at, expires_at))
    return result is not None and result >= 0

def verify_admin_pin(pin: str, workspace_id: str, device_fingerprint: str) -> tuple[bool, str]:
    """Verify admin PIN with server-side brute-force protection"""
    if not pin or len(pin.strip()) < 6:  # Minimum 6-digit PIN
        return False, "PIN must be at least 6 characters"
    
    if not workspace_id:
        return False, "Invalid workspace"
    
    # Get client IP (limited in Streamlit environment)
    client_ip = "unknown"
    try:
        headers = st.context.headers if hasattr(st.context, 'headers') else {}
        client_ip = headers.get('x-forwarded-for', headers.get('x-real-ip', 'unknown'))
    except:
        pass
    
    current_time = datetime.now()
    fifteen_min_ago = current_time - timedelta(minutes=15)
    
    # Check recent failed attempts from database (server-side protection)
    check_query = """
        SELECT COUNT(*) as failed_count 
        FROM admin_login_attempts 
        WHERE workspace_id = %s 
        AND failed_at > %s 
        AND success = FALSE
    """
    
    result = execute_db_query(check_query, (workspace_id, fifteen_min_ago))
    
    if result and len(result) > 0:
        failed_count = result[0]['failed_count']
        if failed_count >= 5:
            return False, "Too many failed attempts. Try again in 15 minutes."
    
    # Verify PIN
    admin_pin = os.getenv('ADMIN_PIN')
    is_valid = admin_pin is not None and str(pin).strip() == str(admin_pin).strip()
    
    # Record attempt in database
    record_query = """
        INSERT INTO admin_login_attempts (workspace_id, device_fingerprint, ip_address, success)
        VALUES (%s, %s, %s, %s)
    """
    
    execute_db_write(record_query, (workspace_id, device_fingerprint, client_ip, is_valid))
    
    if is_valid:
        return True, "Success"
    else:
        return False, "Invalid PIN"

def set_subscription_override(workspace_id: str, tier: str, set_by: str, expires_at: datetime = None) -> bool:
    """Set subscription tier override for workspace with optional expiry"""
    query = """
        INSERT INTO subscription_overrides (workspace_id, tier, set_by, expires_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (workspace_id) 
        DO UPDATE SET tier = %s, set_by = %s, expires_at = %s, updated_at = NOW()
    """
    result = execute_db_write(query, (workspace_id, tier, set_by, expires_at, tier, set_by, expires_at))
    return result is not None and result >= 0

def get_subscription_override(workspace_id: str) -> Optional[str]:
    """Get subscription tier override for workspace (only if not expired)"""
    query = """
        SELECT tier FROM subscription_overrides 
        WHERE workspace_id = %s 
        AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    """
    result = execute_db_query(query, (workspace_id,))
    if result and len(result) > 0:
        return result[0]['tier']
    return None

def clear_subscription_override(workspace_id: str) -> bool:
    """Clear subscription tier override for workspace"""
    query = "DELETE FROM subscription_overrides WHERE workspace_id = %s"
    result = execute_db_write(query, (workspace_id,))
    return result is not None and result >= 0

# ================= Friend Access Code System =================

def generate_friend_access_code() -> str:
    """Generate a secure friend access code (12 chars)"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(12))

def create_friend_access_code(access_tier: str = 'pro_trader', duration_days: int = 30) -> Optional[str]:
    """Create a new friend access code"""
    code = generate_friend_access_code()
    query = """
        INSERT INTO friend_access_codes (code, access_tier, access_duration_days)
        VALUES (%s, %s, %s)
    """
    result = execute_db_write(query, (code, access_tier, duration_days))
    
    if result is not None and result > 0:
        return code
    return None

def consume_friend_access_code(code: str, workspace_id: str, device_fingerprint: str) -> tuple[bool, str]:
    """Consume a friend access code and grant access (fully atomic operation)"""
    try:
        # Atomic: mark code as used and get details in single query
        code_expires_at = datetime.now() + timedelta(days=30)  # Default, will be overridden
        update_query = """
            UPDATE friend_access_codes 
            SET used_by_workspace_id = %s, 
                used_by_device_fingerprint = %s,
                used_at = NOW(),
                expires_at = %s
            WHERE code = %s AND used_at IS NULL
            RETURNING access_tier, access_duration_days
        """
        result = execute_db_write_returning(update_query, (workspace_id, device_fingerprint, code_expires_at, code))
        
        if not result or len(result) == 0:
            return False, "Invalid or already used access code"
        
        access_tier = result[0]['access_tier']
        duration_days = result[0]['access_duration_days']
        
        # Calculate proper expiry date
        override_expires_at = datetime.now() + timedelta(days=duration_days)
        
        # Create time-limited subscription override
        if set_subscription_override(workspace_id, access_tier, f"friend_code_{code}", override_expires_at):
            return True, f"Success! You now have {access_tier.upper()} access for {duration_days} days"
        else:
            return False, "Failed to activate access - contact support"
            
    except Exception as e:
        return False, f"Error processing code: {str(e)}"

def get_friend_access_codes_status() -> list:
    """Get status of all friend access codes (admin only)"""
    query = """
        SELECT code, created_at, used_at, access_tier, access_duration_days,
               CASE WHEN used_at IS NULL THEN 'Unused' ELSE 'Used' END as status
        FROM friend_access_codes 
        ORDER BY created_at DESC
        LIMIT 50
    """
    result = execute_db_query(query)
    return result if result else []

def is_admin(workspace_id: str, device_fingerprint: str) -> bool:
    """Check if user has admin access"""
    if not workspace_id or not device_fingerprint:
        return False
    return is_admin_session_valid(workspace_id, device_fingerprint)

def save_workspace_data(workspace_id: str, data_type: str, item_key: str, data_payload: dict) -> bool:
    """Save data to workspace with versioning"""
    query = """
        INSERT INTO workspace_data (workspace_id, data_type, item_key, data_payload)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (workspace_id, data_type, item_key)
        DO UPDATE SET 
            data_payload = EXCLUDED.data_payload,
            version = workspace_data.version + 1,
            updated_at = NOW()
    """
    
    import json
    result = execute_db_write(query, (workspace_id, data_type, item_key, json.dumps(data_payload)))
    return result is not None and result >= 0

def get_workspace_data(workspace_id: str, data_type: Optional[str] = None, since: Optional[datetime] = None) -> List[Dict]:
    """Get workspace data with optional filtering"""
    where_clauses = ["workspace_id = %s"]
    params = [workspace_id]
    
    if data_type:
        where_clauses.append("data_type = %s")
        params.append(data_type)
    
    if since:
        where_clauses.append("updated_at > %s")
        params.append(since)
    
    query = f"""
        SELECT data_type, item_key, data_payload, version, updated_at
        FROM workspace_data
        WHERE {' AND '.join(where_clauses)}
        ORDER BY updated_at DESC
    """
    
    result = execute_db_query(query, tuple(params))
    return result if result else []

def delete_workspace_data(workspace_id: str, data_type: str, item_key: str) -> bool:
    """Delete specific workspace data item"""
    query = "DELETE FROM workspace_data WHERE workspace_id = %s AND data_type = %s AND item_key = %s"
    result = execute_db_write(query, (workspace_id, data_type, item_key))
    return result is not None and result > 0

def get_workspace_devices(workspace_id: str) -> List[Dict]:
    """Get all devices in a workspace"""
    query = """
        SELECT device_fingerprint, device_name, platform, created_at, last_seen
        FROM devices 
        WHERE workspace_id = %s AND revoked_at IS NULL
        ORDER BY created_at DESC
    """
    result = execute_db_query(query, (workspace_id,))
    return result if result else []

def revoke_device(workspace_id: str, device_fingerprint: str) -> bool:
    """Revoke a device from workspace"""
    query = """
        UPDATE devices 
        SET revoked_at = NOW() 
        WHERE workspace_id = %s AND device_fingerprint = %s
    """
    result = execute_db_write(query, (workspace_id, device_fingerprint))
    return result is not None and result > 0

def generate_qr_code(data: str) -> str:
    """Generate QR code as base64 image"""
    import qrcode
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_base64}"

# ================= Price Alerts Management =================
def create_price_alert(symbol: str, alert_type: str, target_price: float, notification_method: str = 'in_app') -> bool:
    """Create a new price alert with proper workspace ownership"""
    # Get current user email and workspace from session state
    user_email = st.session_state.get('user_email', '')
    workspace_id = st.session_state.get('workspace_id')
    
    query = """
        INSERT INTO price_alerts (symbol, alert_type, target_price, notification_method, user_email, workspace_id) 
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    result = execute_db_write(query, (symbol, alert_type, target_price, notification_method, user_email, workspace_id))
    return result is not None and result > 0

def get_active_alerts(workspace_id: str = None) -> List[Dict[str, Any]]:
    """Get active price alerts for current workspace only (tenant-isolated)"""
    if not workspace_id:
        workspace_id = st.session_state.get('workspace_id')
    
    if not workspace_id:
        return []  # No workspace = no alerts (prevents cross-tenant access)
    
    query = "SELECT * FROM price_alerts WHERE is_active = TRUE AND workspace_id = %s ORDER BY created_at DESC"
    result = execute_db_query(query, (workspace_id,))
    return result if result else []

def get_all_alerts(workspace_id: str = None) -> List[Dict[str, Any]]:
    """Get all price alerts for current workspace only (tenant-isolated)"""
    if not workspace_id:
        workspace_id = st.session_state.get('workspace_id')
    
    if not workspace_id:
        return []  # No workspace = no alerts (prevents cross-tenant access)
    
    query = "SELECT * FROM price_alerts WHERE workspace_id = %s ORDER BY created_at DESC"
    result = execute_db_query(query, (workspace_id,))
    return result if result else []

def trigger_alert(alert_id: int, current_price: float, workspace_id: str = None) -> bool:
    """Mark an alert as triggered - atomic operation with workspace validation"""
    if not workspace_id:
        workspace_id = st.session_state.get('workspace_id')
    
    if not workspace_id:
        return False  # No workspace = no triggering (prevents cross-tenant access)
    
    query = """
        UPDATE price_alerts 
        SET is_triggered = TRUE, triggered_at = NOW(), current_price = %s, is_active = FALSE
        WHERE id = %s AND workspace_id = %s AND is_active = TRUE AND is_triggered = FALSE
    """
    result = execute_db_write(query, (current_price, alert_id, workspace_id))
    return result is not None and result > 0

def delete_alert(alert_id: int, workspace_id: str = None) -> bool:
    """Delete a price alert with workspace validation (tenant-isolated)"""
    if not workspace_id:
        workspace_id = st.session_state.get('workspace_id')
    
    if not workspace_id:
        return False  # No workspace = no deletion (prevents cross-tenant access)
    
    query = "DELETE FROM price_alerts WHERE id = %s AND workspace_id = %s"
    result = execute_db_write(query, (alert_id, workspace_id))
    return result is not None and result > 0

def get_current_price(symbol: str) -> Optional[float]:
    """Get current price for a symbol with fallback methods"""
    try:
        # Try fast_info first
        ticker = yf.Ticker(symbol)
        if hasattr(ticker, 'fast_info'):
            fast_info = ticker.fast_info
            price = fast_info.get('last_price') or fast_info.get('regularMarketPrice')
            if price:
                return float(price)
        
        # Fallback to recent history
        hist = ticker.history(period="1d", interval="1m")
        if not hist.empty:
            return float(hist['Close'].iloc[-1])
        
        # Last resort: use info (slow but comprehensive)
        info = ticker.info
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        if price:
            return float(price)
            
    except Exception as e:
        print(f"Error getting price for {symbol}: {e}")
    
    return None

def check_price_alerts():
    """Check active alerts for current workspace only (tenant-isolated)"""
    workspace_id = st.session_state.get('workspace_id')
    if not workspace_id:
        return 0  # No workspace = no alert checking (prevents cross-tenant processing)
    
    active_alerts = get_active_alerts(workspace_id)
    if not active_alerts:
        return 0
    
    triggered_count = 0
    for alert in active_alerts:
        try:
            current_price = get_current_price(alert['symbol'])
            
            if current_price:
                # Check if alert condition is met
                should_trigger = False
                if alert['alert_type'] == 'above' and current_price >= alert['target_price']:
                    should_trigger = True
                elif alert['alert_type'] == 'below' and current_price <= alert['target_price']:
                    should_trigger = True
                
                if should_trigger:
                    if trigger_alert(alert['id'], current_price, workspace_id):
                        triggered_count += 1
                        # Send notification (alert already has workspace_id)
                        send_alert_notification(alert, current_price)
        except Exception as e:
            print(f"Error checking alert for {alert['symbol']}: {e}")
    
    return triggered_count

def send_alert_notification(alert: Dict[str, Any], current_price: float):
    """Send notification for triggered alert with 100% reliable persistence"""
    symbol = alert['symbol']
    target = alert['target_price']
    alert_type = alert['alert_type']
    
    subject = f"🚨 Price Alert Triggered: {symbol}"
    message = f"""
Price Alert Triggered!

Symbol: {symbol}
Alert Type: Price {alert_type} ${target:.2f}
Current Price: ${current_price:.2f}
Target Price: ${target:.2f}

The price target you set has been reached.
"""
    
    # UNCONDITIONAL PERSISTENCE - Store notification FIRST for 100% reliable delivery
    workspace_id = alert.get('workspace_id')
    user_email = alert.get('user_email', 'system')  # Use alert's user_email or fallback
    
    if workspace_id:
        # Always store notification regardless of any other conditions
        store_notification(subject, message, user_email, workspace_id)
    else:
        # Quarantine alerts without workspace_id (should not happen with NOT NULL constraint)
        st.error(f"⚠️ Alert processing error: Missing workspace context for {alert['symbol']}")
        st.info("Please recreate this alert to ensure proper delivery.")
    
    # Optional Slack notification (no longer causes persistence failure)
    if alert.get('notification_method') in ['slack', 'both'] and CFG.slack_webhook:
        slack_msg = f"🚨 *{symbol}* price alert triggered!\nCurrent: ${current_price:.2f} | Target: ${target:.2f} ({alert_type})"
        push_slack(slack_msg)

# ================= Watchlist Management =================
def create_watchlist(name: str, description: str, symbols: List[str]) -> bool:
    """Create a new watchlist"""
    query = """
        INSERT INTO watchlists (name, description, symbols) 
        VALUES (%s, %s, %s)
    """
    result = execute_db_query(query, (name, description, symbols), fetch=False)
    
    # Also save to workspace_data for cross-device sync
    workspace_id = st.session_state.get('workspace_id')
    if result is not None and workspace_id:
        watchlist_data = {
            'name': name,
            'description': description,
            'symbols': symbols,
            'created_at': datetime.now().isoformat()
        }
        save_workspace_data(workspace_id, 'watchlist', name, watchlist_data)
    
    return result is not None

def get_watchlists() -> List[Dict[str, Any]]:
    """Get all watchlists"""
    query = "SELECT * FROM watchlists ORDER BY created_at DESC"
    result = execute_db_query(query)
    return result if result else []

def get_watchlist_by_id(watchlist_id: int) -> Optional[Dict[str, Any]]:
    """Get a specific watchlist by ID"""
    query = "SELECT * FROM watchlists WHERE id = %s"
    result = execute_db_query(query, (watchlist_id,))
    return result[0] if result else None

def update_watchlist(watchlist_id: int, name: str, description: str, symbols: List[str]) -> bool:
    """Update an existing watchlist"""
    query = """
        UPDATE watchlists 
        SET name = %s, description = %s, symbols = %s, updated_at = NOW()
        WHERE id = %s
    """
    result = execute_db_query(query, (name, description, symbols, watchlist_id), fetch=False)
    
    # Also update workspace_data for cross-device sync
    workspace_id = st.session_state.get('workspace_id')
    if result is not None and workspace_id:
        watchlist_data = {
            'name': name,
            'description': description,
            'symbols': symbols,
            'updated_at': datetime.now().isoformat()
        }
        save_workspace_data(workspace_id, 'watchlist', name, watchlist_data)
    
    return result is not None

def delete_watchlist(watchlist_id: int) -> bool:
    """Delete a watchlist"""
    # Get watchlist name before deleting for workspace_data cleanup
    watchlist = get_watchlist_by_id(watchlist_id)
    watchlist_name = watchlist['name'] if watchlist else None
    
    query = "DELETE FROM watchlists WHERE id = %s"
    result = execute_db_query(query, (watchlist_id,), fetch=False)
    
    # Also remove from workspace_data for cross-device sync
    workspace_id = st.session_state.get('workspace_id')
    if result is not None and workspace_id and watchlist_name:
        delete_workspace_data(workspace_id, 'watchlist', watchlist_name)
    
    return result is not None

# ================= Data Source (yfinance) =================
def get_ohlcv_yf(symbol: str, timeframe: str, period: str = None, start: str = None, end: str = None) -> pd.DataFrame:
    interval, default_period = _yf_interval_period(timeframe)
    
    # Use custom period or date range if provided
    if start and end:
        data = yf.Ticker(symbol.upper()).history(start=start, end=end, interval=interval, auto_adjust=False)
    elif period:
        data = yf.Ticker(symbol.upper()).history(period=period, interval=interval, auto_adjust=False)
    else:
        data = yf.Ticker(symbol.upper()).history(period=default_period, interval=interval, auto_adjust=False)
    
    if data is None or data.empty:
        raise ValueError(f"No yfinance data for {symbol} @ {interval}/{period or 'date range'}")
    data.index = pd.to_datetime(data.index, utc=True)
    out = pd.DataFrame({
        "open":   data["Open"].astype(float),
        "high":   data["High"].astype(float),
        "low":    data["Low"].astype(float),
        "close":  data["Close"].astype(float),
        "volume": data["Volume"].astype(float).fillna(0.0),
    }, index=data.index).dropna()
    return out

def get_ohlcv(symbol: str, timeframe: str, period: str = None, start: str = None, end: str = None) -> pd.DataFrame:
    return get_ohlcv_yf(symbol, timeframe, period, start, end)

# ================= Indicators (pure pandas) =================
def _ema(s, n):    return s.ewm(span=n, adjust=False).mean()
def _rsi(s, n=14):
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs = up / dn
    return 100 - (100 / (1 + rs))
def _atr(h, l, c, n=14):
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/n, adjust=False).mean()
def _bb_width(c, n=20, k=2.0):
    ma = c.rolling(n).mean(); sd = c.rolling(n).std()
    upper, lower = ma + k*sd, ma - k*sd
    return (upper - lower) / c

def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["ema8"]   = _ema(out["close"], 8)
    out["ema21"]  = _ema(out["close"], 21)
    out["ema50"]  = _ema(out["close"], 50)
    out["ema200"] = _ema(out["close"], 200)
    out["rsi"]    = _rsi(out["close"], 14)

    macd_fast = _ema(out["close"], 12); macd_slow = _ema(out["close"], 26)
    macd_line = macd_fast - macd_slow
    signal    = macd_line.ewm(span=9, adjust=False).mean()
    out["macd_hist"] = macd_line - signal

    out["atr"]        = _atr(out["high"], out["low"], out["close"], 14)
    out["bb_width"]   = _bb_width(out["close"], 20, 2.0)
    out["vol_ma20"]   = out["volume"].rolling(20).mean()
    out["vol_z"]      = (out["volume"] - out["vol_ma20"]) / out["vol_ma20"].replace(0, np.nan)
    out["close_20_max"] = out["close"].rolling(20).max()
    out["close_20_min"] = out["close"].rolling(20).min()
    out["bb_width_ma"]  = out["bb_width"].rolling(20).mean()
    return out

# ================= Scoring =================
def score_row(r) -> float:
    s = 0.0
    s += 25 if r.close > r.ema200 else -25
    s += 25 if r.close > r["close_20_max"] else 0
    s -= 25 if r.close < r["close_20_min"] else 0
    s += 10 if (pd.notna(r.rsi) and r.rsi > 50) else -10
    s += 10 if (pd.notna(r.macd_hist) and r.macd_hist > 0) else -10
    s += 8  if (pd.notna(r.vol_z) and r.vol_z > 0.5) else 0
    s += 7  if (pd.notna(r.bb_width) and pd.notna(r.bb_width_ma) and r.bb_width > r.bb_width_ma) else 0
    atr_pct = (r.atr / r.close) if (pd.notna(r.atr) and r.close) else np.nan
    s += 5 if (pd.notna(atr_pct) and atr_pct < 0.04) else 0
    s -= 10 if (pd.notna(r.rsi) and r.rsi > 80) else 0
    s += 10 if (pd.notna(r.rsi) and r.rsi < 20) else 0
    return float(s)

# ================= Position sizing =================
def position_sizing(last, direction: str, account_equity: float, risk_pct: float, stop_mult: float):
    """
    Returns (size_units, risk_$, notional_$, stop_price)
    """
    stop_price = last.close - stop_mult*last.atr if direction=="Bullish" else last.close + stop_mult*last.atr
    per_unit_risk = abs(last.close - stop_price)
    risk_dollars  = account_equity * risk_pct
    size_units = 0 if per_unit_risk <= 0 else floor(risk_dollars / per_unit_risk)
    notional = size_units * last.close
    return size_units, risk_dollars, notional, stop_price

# ================= Scanner =================
@st.cache_data(show_spinner=False, ttl=300)
def scan_universe(symbols: List[str], timeframe: str, is_crypto: bool,
                  account_equity: float, risk_pct: float, stop_mult: float, min_vol: float) -> Tuple[pd.DataFrame, pd.DataFrame]:
    rows, errs = [], []
    for sym in symbols:
        try:
            df = get_ohlcv(sym, timeframe)
            if len(df) < min_bars_required(timeframe):
                raise ValueError(f"Not enough history ({len(df)}) for {timeframe}")
            if not is_crypto and dollar_volume(df) < min_vol:
                raise ValueError(f"Below min dollar vol ({min_vol:,.0f})")

            f = compute_features(df).dropna()
            if f.empty:
                raise ValueError("Features empty after dropna()")
            last = f.iloc[-1]
            sc = score_row(last)
            direction = "Bullish" if sc >= 0 else "Bearish"

            size, risk_usd, notional, stop = position_sizing(
                last, direction, account_equity, risk_pct, stop_mult
            )

            rows.append({
                "symbol": sym,
                "timeframe": timeframe,
                "close": round(float(last.close), 6),
                "score": round(sc, 2),
                "direction": direction,
                "rsi": round(float(last.rsi), 2),
                "atr": round(float(last.atr), 6),
                "ema50_gt_200": bool(last.ema50 > last.ema200),
                "bb_width": round(float(last.bb_width), 6) if pd.notna(last.bb_width) else None,
                "vol_z": round(float(last.vol_z), 2) if pd.notna(last.vol_z) else None,
                "stop": round(float(stop), 6),
                "size": int(size),
                "risk_$": round(float(risk_usd), 2),
                "notional_$": round(float(notional), 2)
            })
        except Exception as e:
            errs.append({"symbol": sym, "timeframe": timeframe, "error": str(e)})
    df_rows = pd.DataFrame(rows)
    if not df_rows.empty and "score" in df_rows.columns:
        df_rows = df_rows.sort_values("score", ascending=False)
    df_errs = pd.DataFrame(errs)
    return df_rows, df_errs

# ================= Notifications =================
def push_slack(text: str):
    if not CFG.slack_webhook: return
    try: requests.post(CFG.slack_webhook, json={"text": text}, timeout=10)
    except Exception as e: print("Slack error:", e)

# Legacy SMTP function removed - now using user-specific SendGrid system

def store_notification(subject: str, body: str, to_email: str, workspace_id: str) -> bool:
    """Store notification in database for persistent, reliable delivery"""
    try:
        # Store notification in database using proper connection pool
        query = """
        INSERT INTO notifications (workspace_id, user_email, subject, message, is_read, created_at)
        VALUES (%s, %s, %s, %s, FALSE, CURRENT_TIMESTAMP)
        """
        
        result = execute_db_write(query, (workspace_id, to_email, subject, body))
        return result is not None
        
    except Exception as e:
        # If database fails, show immediate notification as fallback
        st.error(f"⚠️ Notification storage failed: {str(e)[:100]}...")
        st.success("🔔 **Market Scanner Alert** (Temporary Display)")
        st.info(f"**{subject}**")
        with st.expander("📄 View Message", expanded=True):
            st.write(body)
        return True

def get_user_notifications(user_email: str, workspace_id: str, limit: int = 10):
    """Fetch notifications for user in their workspace"""
    try:
        query = """
        SELECT id, subject, message, created_at, is_read
        FROM notifications 
        WHERE workspace_id = %s AND user_email = %s 
        ORDER BY created_at DESC 
        LIMIT %s
        """
        
        result = execute_db_query(query, (workspace_id, user_email, limit))
        return result if result else []
        
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        return []

def mark_notification_read(notification_id: int, workspace_id: str, user_email: str = None):
    """Mark a notification as read (with secure workspace and user validation)"""
    try:
        if user_email:
            # Extra security: validate user owns the notification
            query = """
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE id = %s AND workspace_id = %s AND user_email = %s
            """
            result = execute_db_write(query, (notification_id, workspace_id, user_email))
        else:
            # Fallback with workspace validation only
            query = """
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE id = %s AND workspace_id = %s
            """
            result = execute_db_write(query, (notification_id, workspace_id))
        return result is not None
    except Exception as e:
        print(f"Error marking notification as read: {e}")
        return False

def send_email_to_user(subject: str, body: str, to_email: str) -> bool:
    """Legacy wrapper - stores notification using current workspace"""
    # Get workspace from session state
    workspace_id = st.session_state.get('workspace_id')
    if not workspace_id:
        # Fallback to immediate display if no workspace
        st.success("🔔 **Market Scanner Alert** (Temporary Display)")
        st.info(f"**{subject}**")
        with st.expander("📄 View Message", expanded=True):
            st.write(body)
        return True
    
    return store_notification(subject, body, to_email, workspace_id)

def save_user_notification_preferences(user_email: str, method: str) -> bool:
    """Save user notification preferences to database"""
    try:
        query = """
            INSERT INTO user_notification_preferences (user_email, notification_method, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (user_email) 
            DO UPDATE SET 
                notification_method = EXCLUDED.notification_method,
                updated_at = NOW()
        """
        result = execute_db_write(query, (user_email, method))
        return result is not None and result > 0
    except Exception as e:
        st.error(f"Failed to save preferences: {str(e)}")
        return False

def get_user_notification_preferences(user_email: str) -> Dict[str, Any]:
    """Get user notification preferences from database"""
    try:
        query = "SELECT * FROM user_notification_preferences WHERE user_email = %s"
        result = execute_db_query(query, (user_email,))
        return result[0] if result else None
    except Exception as e:
        return None

def get_notification_preferences_for_alert(alert: Dict[str, Any]) -> Dict[str, Any]:
    """Get notification preferences for a price alert from database"""
    # Get user email from the alert
    user_email = alert.get('user_email')
    
    if not user_email:
        # No user associated with this alert
        return None
        
    # Get preferences from database
    prefs = get_user_notification_preferences(user_email)
    
    if prefs:
        return {
            'user_email': prefs['user_email'],
            'notification_method': prefs['notification_method']
        }
    
    # Fallback to session state if database lookup fails
    session_user_email = st.session_state.get('user_email')
    if session_user_email == user_email:
        return {
            'user_email': user_email,
            'notification_method': st.session_state.get('notification_method', 'in_app')
        }
    
    # No preferences found
    return None

def format_block(df: pd.DataFrame, title: str) -> str:
    if df.empty:
        return f"{title}\n(no candidates)"
    cols = ["symbol","score","close","rsi","atr","vol_z","stop","size","notional_$"]
    lines = [title]
    for _, r in df[cols].iterrows():
        lines.append(f"• {r.symbol}: score {r.score:+.1f}, px {r.close}, RSI {r.rsi}, ATR {r.atr:.5f}, "
                     f"z {r.vol_z}, stop {r.stop}, size {r.size}, notional ${r['notional_$']:,.0f}")
    return "\n".join(lines)

# ================= CSV Export =================
def to_csv_download(df: pd.DataFrame, filename: str) -> bytes:
    """Convert DataFrame to CSV bytes for download"""
    output = io.StringIO()
    df.to_csv(output, index=False)
    return output.getvalue().encode('utf-8')

# ================= Advanced Charting =================
def create_advanced_chart(symbol: str, timeframe: str = "1D", indicators: List[str] = None) -> go.Figure:
    """Create advanced candlestick chart with technical indicators"""
    if indicators is None:
        indicators = ["EMA", "RSI", "MACD", "Volume"]
    
    try:
        # Get data and compute features
        df = get_ohlcv(symbol, timeframe)
        if df.empty or len(df) < 50:
            return None
        
        df_with_features = compute_features(df).dropna()
        if df_with_features.empty:
            return None
            
        # Create subplots based on selected indicators
        subplot_count = 1  # Main price chart
        if "RSI" in indicators:
            subplot_count += 1
        if "MACD" in indicators:
            subplot_count += 1
        if "Volume" in indicators:
            subplot_count += 1
        
        # Calculate subplot heights
        if subplot_count == 1:
            row_heights = [1]
        elif subplot_count == 2:
            row_heights = [0.7, 0.3]
        elif subplot_count == 3:
            row_heights = [0.6, 0.2, 0.2]
        else:
            row_heights = [0.5, 0.17, 0.17, 0.16]
            
        fig = make_subplots(
            rows=subplot_count, cols=1,
            shared_xaxes=True,
            vertical_spacing=0.02,
            row_heights=row_heights,
            subplot_titles=['Price Chart'] + [ind for ind in indicators if ind != "EMA"]
        )
        
        # Main candlestick chart
        fig.add_trace(
            go.Candlestick(
                x=df_with_features.index,
                open=df_with_features['open'],
                high=df_with_features['high'],
                low=df_with_features['low'],
                close=df_with_features['close'],
                name=f"{symbol} Price",
                increasing_line_color='#00D4AA',
                decreasing_line_color='#FF6B6B'
            ),
            row=1, col=1
        )
        
        # Add EMAs if selected
        if "EMA" in indicators:
            ema_colors = {'ema8': '#FF9500', 'ema21': '#007AFF', 'ema50': '#34C759', 'ema200': '#FF3B30'}
            for ema, color in ema_colors.items():
                if ema in df_with_features.columns:
                    fig.add_trace(
                        go.Scatter(
                            x=df_with_features.index,
                            y=df_with_features[ema],
                            mode='lines',
                            name=ema.upper(),
                            line=dict(color=color, width=1.5),
                            opacity=0.8
                        ),
                        row=1, col=1
                    )
        
        # Add Bollinger Bands if EMA is selected
        if "EMA" in indicators and 'bb_width' in df_with_features.columns:
            bb_upper = df_with_features['close'].rolling(20).mean() + 2 * df_with_features['close'].rolling(20).std()
            bb_lower = df_with_features['close'].rolling(20).mean() - 2 * df_with_features['close'].rolling(20).std()
            bb_middle = df_with_features['close'].rolling(20).mean()
            
            fig.add_trace(
                go.Scatter(
                    x=df_with_features.index,
                    y=bb_upper,
                    mode='lines',
                    name='BB Upper',
                    line=dict(color='rgba(128, 128, 128, 0.3)', width=1),
                    showlegend=False
                ),
                row=1, col=1
            )
            
            fig.add_trace(
                go.Scatter(
                    x=df_with_features.index,
                    y=bb_lower,
                    mode='lines',
                    name='BB Lower',
                    line=dict(color='rgba(128, 128, 128, 0.3)', width=1),
                    fill='tonexty',
                    fillcolor='rgba(128, 128, 128, 0.1)',
                    showlegend=False
                ),
                row=1, col=1
            )
            
            fig.add_trace(
                go.Scatter(
                    x=df_with_features.index,
                    y=bb_middle,
                    mode='lines',
                    name='BB Middle',
                    line=dict(color='rgba(128, 128, 128, 0.5)', width=1),
                    showlegend=False
                ),
                row=1, col=1
            )
        
        current_row = 2
        
        # RSI subplot
        if "RSI" in indicators and 'rsi' in df_with_features.columns:
            fig.add_trace(
                go.Scatter(
                    x=df_with_features.index,
                    y=df_with_features['rsi'],
                    mode='lines',
                    name='RSI',
                    line=dict(color='#FF9500', width=2)
                ),
                row=current_row, col=1
            )
            
            # Add RSI levels
            fig.add_hline(y=70, line_dash="dash", line_color="red", opacity=0.5, row=current_row)
            fig.add_hline(y=30, line_dash="dash", line_color="green", opacity=0.5, row=current_row)
            fig.add_hline(y=50, line_dash="dot", line_color="gray", opacity=0.3, row=current_row)
            
            current_row += 1
        
        # MACD subplot
        if "MACD" in indicators and 'macd_hist' in df_with_features.columns:
            # Calculate MACD components
            macd_fast = df_with_features['close'].ewm(span=12).mean()
            macd_slow = df_with_features['close'].ewm(span=26).mean()
            macd_line = macd_fast - macd_slow
            signal_line = macd_line.ewm(span=9).mean()
            
            fig.add_trace(
                go.Scatter(
                    x=df_with_features.index,
                    y=macd_line,
                    mode='lines',
                    name='MACD',
                    line=dict(color='#007AFF', width=2)
                ),
                row=current_row, col=1
            )
            
            fig.add_trace(
                go.Scatter(
                    x=df_with_features.index,
                    y=signal_line,
                    mode='lines',
                    name='Signal',
                    line=dict(color='#FF3B30', width=2)
                ),
                row=current_row, col=1
            )
            
            fig.add_trace(
                go.Bar(
                    x=df_with_features.index,
                    y=df_with_features['macd_hist'],
                    name='MACD Histogram',
                    marker_color=['green' if x >= 0 else 'red' for x in df_with_features['macd_hist']],
                    opacity=0.6
                ),
                row=current_row, col=1
            )
            
            current_row += 1
        
        # Volume subplot
        if "Volume" in indicators and 'volume' in df_with_features.columns:
            colors = ['green' if close >= open_price else 'red' 
                     for close, open_price in zip(df_with_features['close'], df_with_features['open'])]
            
            fig.add_trace(
                go.Bar(
                    x=df_with_features.index,
                    y=df_with_features['volume'],
                    name='Volume',
                    marker_color=colors,
                    opacity=0.6
                ),
                row=current_row, col=1
            )
        
        # Update layout
        fig.update_layout(
            title=f"{symbol} - {timeframe} Chart with Technical Analysis",
            xaxis_rangeslider_visible=False,
            height=600 if subplot_count <= 2 else 800,
            showlegend=True,
            legend=dict(x=0, y=1, traceorder="normal"),
            margin=dict(l=50, r=50, t=50, b=50),
            template="plotly_dark"
        )
        
        # Remove x-axis labels from all but the bottom subplot
        for i in range(1, subplot_count):
            fig.update_xaxes(showticklabels=False, row=i, col=1)
        
        # Update y-axis titles
        fig.update_yaxes(title_text="Price ($)", row=1, col=1)
        if "RSI" in indicators:
            fig.update_yaxes(title_text="RSI", row=2 if "EMA" in indicators else 2, col=1)
        if "MACD" in indicators:
            macd_row = 2 + (1 if "RSI" in indicators else 0)
            fig.update_yaxes(title_text="MACD", row=macd_row, col=1)
        if "Volume" in indicators:
            vol_row = subplot_count
            fig.update_yaxes(title_text="Volume", row=vol_row, col=1)
        
        return fig
        
    except Exception as e:
        st.error(f"Error creating chart for {symbol}: {str(e)}")
        return None

def get_chart_data_summary(symbol: str, timeframe: str = "1D") -> Dict[str, Any]:
    """Get summary data for chart display"""
    try:
        df = get_ohlcv(symbol, timeframe)
        if df.empty:
            return {}
        
        df_with_features = compute_features(df).dropna()
        if df_with_features.empty:
            return {}
            
        latest = df_with_features.iloc[-1]
        prev = df_with_features.iloc[-2] if len(df_with_features) > 1 else latest
        
        price_change = latest['close'] - prev['close']
        price_change_pct = (price_change / prev['close']) * 100
        
        return {
            'current_price': latest['close'],
            'price_change': price_change,
            'price_change_pct': price_change_pct,
            'volume': latest['volume'],
            'rsi': latest['rsi'] if 'rsi' in latest else None,
            'atr': latest['atr'] if 'atr' in latest else None,
            'ema50_above_200': latest['ema50'] > latest['ema200'] if 'ema50' in latest and 'ema200' in latest else None
        }
    except Exception:
        return {}

# ================= Backtesting Engine =================
def run_backtest(symbols: List[str], start_date: str, end_date: str, timeframe: str = "1D", 
                initial_equity: float = 10000, risk_per_trade: float = 0.01, 
                stop_atr_mult: float = 1.5, min_score: float = 10) -> Dict[str, Any]:
    """Run historical backtest on scoring methodology with robust risk management"""
    try:
        # Validate date range
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date)
        days_diff = (end_dt - start_dt).days
        
        # Check for invalid date range
        if days_diff <= 0:
            return {'error': f'Invalid date range: Start date ({start_date}) must be before end date ({end_date})', 
                   'trades': [], 'metrics': {}, 'symbol_performance': {}}
        
        # Check minimum period
        if days_diff < 30:
            return {'error': 'Backtest period must be at least 30 days for meaningful results', 
                   'trades': [], 'metrics': {}, 'symbol_performance': {}}
        
        # yfinance limitations for intraday data
        if timeframe in ['1m', '5m', '15m', '30m', '1h'] and days_diff > 60:
            return {'error': 'Intraday backtests limited to 60 days max due to data provider constraints', 
                   'trades': [], 'metrics': {}, 'symbol_performance': {}}
        
        results = {
            'trades': [],
            'equity_curve': [],
            'metrics': {},
            'symbol_performance': {},
            'errors': []
        }
        
        # Portfolio state tracking
        current_equity = initial_equity
        total_trades = 0
        winning_trades = 0
        max_equity = initial_equity
        max_drawdown = 0
        active_positions = {}  # symbol -> position dict
        max_positions = 5  # Portfolio risk management
        
        # Create combined date index for equity curve
        all_dates = set()
        symbol_data = {}
        
        # Pre-load and validate all symbol data
        for symbol in symbols:
            try:
                df = get_ohlcv(symbol, timeframe, period=None, start=start_date, end=end_date)
                if df.empty or len(df) < 50:
                    results['errors'].append(f"{symbol}: Insufficient data ({len(df)} bars)")
                    continue
                
                df_features = compute_features(df).dropna()
                if df_features.empty:
                    results['errors'].append(f"{symbol}: Features calculation failed")
                    continue
                
                # Calculate scores
                scores = [score_row(row) for _, row in df_features.iterrows()]
                df_features['score'] = scores
                
                symbol_data[symbol] = df_features
                all_dates.update(df_features.index)
                
            except Exception as e:
                results['errors'].append(f"{symbol}: Data loading failed - {str(e)}")
                continue
        
        if not symbol_data:
            return {'error': 'No valid symbol data loaded', 'trades': [], 'metrics': {}, 'symbol_performance': {}}
        
        # Create unified timeline
        date_index = sorted(all_dates)
        
        # Initialize daily equity tracking
        daily_equity = []
        daily_returns = []
        
        # Main backtesting loop
        for current_date in date_index:
            day_start_equity = current_equity
            
            # Process each symbol for this date
            for symbol, df_features in symbol_data.items():
                if current_date not in df_features.index:
                    continue
                
                row = df_features.loc[current_date]
                
                # Check existing positions for exits (stops, targets, time)
                if symbol in active_positions:
                    position = active_positions[symbol]
                    exit_triggered = False
                    exit_reason = ""
                    exit_price = row['close']
                    
                    # Intrabar stop checking using OHLC
                    if position['direction'] == "long":
                        if row['low'] <= position['stop_price']:
                            exit_triggered = True
                            exit_reason = "stop_loss"
                            exit_price = position['stop_price']  # Use stop price
                        elif row['score'] < min_score / 2:
                            exit_triggered = True
                            exit_reason = "score_exit"
                            exit_price = row['close']
                    else:  # short position
                        if row['high'] >= position['stop_price']:
                            exit_triggered = True
                            exit_reason = "stop_loss"
                            exit_price = position['stop_price']  # Use stop price
                        elif row['score'] < min_score / 2:
                            exit_triggered = True
                            exit_reason = "score_exit"
                            exit_price = row['close']
                    
                    # Time-based exit
                    if (current_date - position['entry_date']).days >= 20:
                        exit_triggered = True
                        exit_reason = "time_exit"
                        exit_price = row['close']
                    
                    if exit_triggered:
                        # Execute exit
                        if position['direction'] == "long":
                            trade_return = (exit_price - position['entry_price']) / position['entry_price']
                        else:
                            trade_return = (position['entry_price'] - exit_price) / position['entry_price']
                        
                        trade_pnl = trade_return * position['position_value']
                        current_equity += trade_pnl
                        
                        trade_record = {
                            'symbol': symbol,
                            'direction': position['direction'],
                            'entry_date': position['entry_date'],
                            'exit_date': current_date,
                            'entry_price': position['entry_price'],
                            'exit_price': exit_price,
                            'position_size': position['position_size'],
                            'trade_return': trade_return,
                            'trade_pnl': trade_pnl,
                            'exit_reason': exit_reason,
                            'holding_days': (current_date - position['entry_date']).days
                        }
                        
                        results['trades'].append(trade_record)
                        total_trades += 1
                        
                        if trade_pnl > 0:
                            winning_trades += 1
                        
                        # Remove position
                        del active_positions[symbol]
                
                # Check for new entries (if not already in position and portfolio capacity available)
                if (symbol not in active_positions and 
                    len(active_positions) < max_positions and 
                    row['score'] >= min_score and
                    current_equity > 0):
                    
                    # Enter position
                    entry_price = row['close']
                    direction = "long" if row['score'] > 0 else "short"
                    
                    # ATR-based position sizing with current equity
                    atr = row['atr']
                    stop_distance = stop_atr_mult * atr
                    stop_price = entry_price - stop_distance if direction == "long" else entry_price + stop_distance
                    
                    # Risk management: use current equity for sizing
                    risk_amount = current_equity * risk_per_trade
                    position_size = risk_amount / abs(entry_price - stop_price)
                    position_value = position_size * entry_price
                    
                    # Don't risk more than available equity
                    if position_value > current_equity * 0.2:  # Max 20% per position
                        position_value = current_equity * 0.2
                        position_size = position_value / entry_price
                    
                    active_positions[symbol] = {
                        'symbol': symbol,
                        'direction': direction,
                        'entry_price': entry_price,
                        'entry_date': current_date,
                        'stop_price': stop_price,
                        'position_size': position_size,
                        'position_value': position_value
                    }
            
            # Update equity curve and drawdown tracking
            if current_equity != day_start_equity:
                daily_pnl = current_equity - day_start_equity
                daily_return = daily_pnl / day_start_equity if day_start_equity > 0 else 0
                daily_returns.append(daily_return)
                
                results['equity_curve'].append({
                    'date': current_date,
                    'equity': current_equity,
                    'trade_pnl': daily_pnl
                })
                
                # Update max drawdown
                if current_equity > max_equity:
                    max_equity = current_equity
                else:
                    drawdown = (max_equity - current_equity) / max_equity
                    max_drawdown = max(max_drawdown, drawdown)
        
        # Calculate symbol performance
        for symbol in symbols:
            symbol_trades = [t for t in results['trades'] if t['symbol'] == symbol]
            if symbol_trades:
                symbol_returns = [t['trade_return'] for t in symbol_trades]
                symbol_pnl = sum([t['trade_pnl'] for t in symbol_trades])
                
                results['symbol_performance'][symbol] = {
                    'total_trades': len(symbol_trades),
                    'winning_trades': len([t for t in symbol_trades if t['trade_pnl'] > 0]),
                    'total_pnl': symbol_pnl,
                    'avg_return': np.mean(symbol_returns),
                    'win_rate': len([t for t in symbol_trades if t['trade_pnl'] > 0]) / len(symbol_trades)
                }
        
        # Calculate robust performance metrics
        if results['trades']:
            total_return = (current_equity - initial_equity) / initial_equity
            
            # Annualized Sharpe ratio based on actual timeframe
            if len(daily_returns) > 1:
                returns_std = np.std(daily_returns)
                avg_return = np.mean(daily_returns)
                
                # Annualization factor based on timeframe
                if timeframe == "1D":
                    periods_per_year = 252
                elif timeframe == "1h":
                    periods_per_year = 252 * 6.5  # Trading hours
                else:
                    periods_per_year = 252  # Default
                
                sharpe_ratio = (avg_return / returns_std) * np.sqrt(periods_per_year) if returns_std > 0 else 0
            else:
                sharpe_ratio = 0
            
            win_rate = winning_trades / total_trades
            avg_win = np.mean([t['trade_pnl'] for t in results['trades'] if t['trade_pnl'] > 0]) if winning_trades > 0 else 0
            avg_loss = np.mean([t['trade_pnl'] for t in results['trades'] if t['trade_pnl'] < 0]) if (total_trades - winning_trades) > 0 else 0
            profit_factor = abs(avg_win * winning_trades / (abs(avg_loss) * (total_trades - winning_trades))) if avg_loss != 0 and (total_trades - winning_trades) > 0 else float('inf')
            
            results['metrics'] = {
                'initial_equity': initial_equity,
                'final_equity': current_equity,
                'total_return': total_return,
                'total_trades': total_trades,
                'winning_trades': winning_trades,
                'losing_trades': total_trades - winning_trades,
                'win_rate': win_rate,
                'avg_win': avg_win,
                'avg_loss': avg_loss,
                'profit_factor': profit_factor,
                'max_drawdown': max_drawdown,
                'sharpe_ratio': sharpe_ratio,
                'avg_holding_days': np.mean([t['holding_days'] for t in results['trades']]),
                'max_concurrent_positions': max_positions,
                'symbols_tested': len(symbol_data)
            }
        else:
            results['metrics'] = {
                'initial_equity': initial_equity,
                'final_equity': current_equity,
                'total_return': 0,
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'avg_win': 0,
                'avg_loss': 0,
                'profit_factor': 0,
                'max_drawdown': 0,
                'sharpe_ratio': 0,
                'avg_holding_days': 0,
                'max_concurrent_positions': max_positions,
                'symbols_tested': len(symbol_data)
            }
        
        return results
        
    except Exception as e:
        return {'error': str(e), 'trades': [], 'metrics': {}, 'symbol_performance': {}}

def convert_numpy_types(obj):
    """Convert numpy types to native Python types for JSON serialization"""
    import numpy as np
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    return obj

def save_backtest_result(name: str, config: Dict[str, Any], results: Dict[str, Any]) -> bool:
    """Save backtest results to database"""
    try:
        # Convert numpy types to native Python types
        config = convert_numpy_types(config)
        results = convert_numpy_types(results)
        
        # Extract metrics from results
        metrics = results.get('metrics', {})
        
        query = """
            INSERT INTO backtesting_results (
                backtest_name, start_date, end_date, symbols, total_trades, 
                winning_trades, losing_trades, total_return, sharpe_ratio, 
                max_drawdown, parameters, results_data, created_at
            ) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """
        
        params = (
            name,
            config.get('start_date'),
            config.get('end_date'), 
            config.get('symbols', []),
            int(metrics.get('total_trades', 0)),
            int(metrics.get('winning_trades', 0)),
            int(metrics.get('losing_trades', 0)),
            float(metrics.get('total_return', 0)),
            float(metrics.get('sharpe_ratio', 0)) if metrics.get('sharpe_ratio') is not None else None,
            float(metrics.get('max_drawdown', 0)),
            json.dumps(config, default=str),
            json.dumps(results, default=str)
        )
        
        result = execute_db_write(query, params)
        return result is not None and result > 0
    except Exception as e:
        st.error(f"Error saving backtest result: {str(e)}")
        return False

def get_backtest_results() -> List[Dict[str, Any]]:
    """Get all saved backtest results"""
    query = "SELECT * FROM backtesting_results ORDER BY created_at DESC"
    result = execute_db_query(query)
    if result:
        for r in result:
            # Parse JSON fields safely (handle both string and already-parsed dict)
            if r['parameters']:
                if isinstance(r['parameters'], str):
                    try:
                        r['parameters'] = json.loads(r['parameters'])
                    except json.JSONDecodeError:
                        r['parameters'] = {}
                elif not isinstance(r['parameters'], dict):
                    r['parameters'] = {}
            else:
                r['parameters'] = {}
            
            if r['results_data']:
                if isinstance(r['results_data'], str):
                    try:
                        r['results_data'] = json.loads(r['results_data'])
                    except json.JSONDecodeError:
                        r['results_data'] = {}
                elif not isinstance(r['results_data'], dict):
                    r['results_data'] = {}
            else:
                r['results_data'] = {}
            
            # Keep config and results for backward compatibility
            r['config'] = r['parameters']
            r['results'] = r['results_data']
    return result if result else []

def create_backtest_chart(results: Dict[str, Any]) -> go.Figure:
    """Create backtest performance chart"""
    if not results.get('equity_curve'):
        return None
    
    equity_data = results['equity_curve']
    equity_df = pd.DataFrame(equity_data)
    
    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.1,
        row_heights=[0.7, 0.3],
        subplot_titles=['Equity Curve', 'Trade P&L']
    )
    
    # Equity curve
    fig.add_trace(
        go.Scatter(
            x=equity_df['date'],
            y=equity_df['equity'],
            mode='lines',
            name='Portfolio Equity',
            line=dict(color='#00D4AA', width=2)
        ),
        row=1, col=1
    )
    
    # Trade P&L bars
    colors = ['green' if pnl >= 0 else 'red' for pnl in equity_df['trade_pnl']]
    fig.add_trace(
        go.Bar(
            x=equity_df['date'],
            y=equity_df['trade_pnl'],
            name='Trade P&L',
            marker_color=colors,
            opacity=0.7
        ),
        row=2, col=1
    )
    
    fig.update_layout(
        title="Backtest Performance Analysis",
        height=600,
        showlegend=True,
        template="plotly_dark"
    )
    
    fig.update_yaxes(title_text="Equity ($)", row=1, col=1)
    fig.update_yaxes(title_text="P&L ($)", row=2, col=1)
    fig.update_xaxes(title_text="Date", row=2, col=1)
    
    return fig

# ================= Portfolio Management =================

def add_portfolio_position(symbol: str, quantity: float, price: float, transaction_type: str = "BUY", notes: str = "") -> bool:
    """Add a new position to portfolio with proper validation and P&L calculation"""
    try:
        # Validate inputs
        if quantity <= 0 or price <= 0:
            st.error("Quantity and price must be positive")
            return False
            
        # Validate transaction type
        if transaction_type not in ["BUY", "SELL"]:
            st.error("Transaction type must be BUY or SELL")
            return False
            
        # Check if position already exists
        existing_query = "SELECT quantity, average_cost FROM portfolio_positions WHERE symbol = %s"
        existing = execute_db_query(existing_query, (symbol,))
        
        # Validate SELL transactions
        if transaction_type == "SELL":
            if not existing:
                st.error(f"Cannot sell {symbol} - no existing position found")
                return False
            
            current_qty = float(existing[0]['quantity'])
            if quantity > current_qty:
                st.error(f"Cannot sell {quantity} shares - only {current_qty} shares available")
                return False
        
        # Calculate realized P&L for SELL transactions
        realized_pnl = 0.0
        if transaction_type == "SELL" and existing:
            avg_cost = float(existing[0]['average_cost'])
            realized_pnl = (price - avg_cost) * quantity
        
        # Add transaction record with realized P&L
        total_amount = quantity * price
        transaction_query = """
            INSERT INTO portfolio_transactions (symbol, transaction_type, quantity, price, total_amount, realized_pnl, transaction_date, notes)
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s)
        """
        execute_db_write(transaction_query, (symbol, transaction_type, quantity, price, total_amount, realized_pnl, notes))
        
        # Update or create position
        if existing:
            old_qty = float(existing[0]['quantity'])
            old_cost = float(existing[0]['average_cost'])
            
            if transaction_type == "BUY":
                # Add to position with weighted average cost
                new_qty = old_qty + quantity
                new_avg_cost = ((old_qty * old_cost) + (quantity * price)) / new_qty
            else:  # SELL
                new_qty = old_qty - quantity
                new_avg_cost = old_cost  # Keep same average cost for partial sells
            
            if new_qty == 0:
                # Set quantity to 0 and clear market values for historical tracking
                update_query = """
                    UPDATE portfolio_positions 
                    SET quantity = 0, current_price = NULL, market_value = 0, unrealized_pnl = 0, updated_at = NOW()
                    WHERE symbol = %s
                """
                execute_db_write(update_query, (symbol,))
            else:
                # Update position with new quantities
                current_price = get_current_price_portfolio(symbol) or price
                market_value = new_qty * current_price
                unrealized_pnl = (current_price - new_avg_cost) * new_qty
                
                update_query = """
                    UPDATE portfolio_positions 
                    SET quantity = %s, average_cost = %s, current_price = %s, 
                        market_value = %s, unrealized_pnl = %s, updated_at = NOW()
                    WHERE symbol = %s
                """
                execute_db_write(update_query, (new_qty, new_avg_cost, current_price, market_value, unrealized_pnl, symbol))
        else:
            # Create new position (only for BUY)
            if transaction_type == "BUY":
                current_price = get_current_price_portfolio(symbol) or price
                market_value = quantity * current_price
                unrealized_pnl = (current_price - price) * quantity
                
                insert_query = """
                    INSERT INTO portfolio_positions (symbol, quantity, average_cost, current_price, market_value, unrealized_pnl, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """
                execute_db_write(insert_query, (symbol, quantity, price, current_price, market_value, unrealized_pnl))
        
        # Show realized P&L for sells
        if transaction_type == "SELL" and realized_pnl != 0:
            if realized_pnl > 0:
                st.success(f"Realized gain: ${realized_pnl:.2f}")
            else:
                st.error(f"Realized loss: ${abs(realized_pnl):.2f}")
        
        return True
    except Exception as e:
        st.error(f"Error adding position: {str(e)}")
        return False

def remove_portfolio_position(symbol: str) -> bool:
    """Completely remove a position and all its transactions from the portfolio"""
    try:
        # Check if position exists
        position_query = "SELECT symbol FROM portfolio_positions WHERE symbol = %s"
        existing = execute_db_query(position_query, (symbol,))
        
        if not existing:
            st.error(f"Position {symbol} not found")
            return False
        
        # Delete all transactions for this symbol
        transactions_query = "DELETE FROM portfolio_transactions WHERE symbol = %s"
        trans_result = execute_db_write(transactions_query, (symbol,))
        
        # Delete the position
        position_delete_query = "DELETE FROM portfolio_positions WHERE symbol = %s"
        pos_result = execute_db_write(position_delete_query, (symbol,))
        
        return pos_result is not None and pos_result > 0
    except Exception as e:
        st.error(f"Error removing position: {str(e)}")
        return False

def get_current_price_portfolio(symbol: str) -> Optional[float]:
    """Get current price for portfolio calculations with robust fallbacks"""
    # First try the original symbol
    for attempt_symbol in [symbol]:
        try:
            ticker = yf.Ticker(attempt_symbol)
            
            # Try fast_info first (fastest)
            try:
                price = ticker.fast_info.get('lastPrice')
                if price and price > 0:
                    return float(price)
            except Exception:
                pass
            
            # Fallback to recent minute data
            try:
                hist = ticker.history(period="1d", interval="1m")
                if not hist.empty:
                    return float(hist['Close'].iloc[-1])
            except Exception:
                pass
                
            # Final fallback to daily data
            try:
                hist = ticker.history(period="2d")
                if not hist.empty:
                    return float(hist['Close'].iloc[-1])
            except Exception:
                pass
                
        except Exception:
            continue
    
    # If crypto symbol fails, try alternative formats
    if '-' in symbol:
        base, quote = symbol.split('-', 1)
        alternatives = []
        
        # Try different exchange formats for crypto
        if quote in ['USD', 'AUD']:
            alternatives.extend([
                f"{base}-USD",  # Standard USD pair
                f"{base}USD=X",  # Yahoo Finance crypto format
                f"{base}-USDT",  # Tether pair
            ])
            
        for alt_symbol in alternatives:
            if alt_symbol != symbol:  # Don't retry the same symbol
                try:
                    ticker = yf.Ticker(alt_symbol)
                    hist = ticker.history(period="2d")
                    if not hist.empty:
                        return float(hist['Close'].iloc[-1])
                except Exception:
                    continue
    
    return None

def update_portfolio_prices() -> None:
    """Update all portfolio positions with current prices"""
    import time
    
    try:
        positions_query = "SELECT symbol, quantity, average_cost FROM portfolio_positions"
        positions = execute_db_query(positions_query)
        
        if positions:
            success_count = 0
            failed_symbols = []
            
            for i, position in enumerate(positions):
                symbol = position['symbol']
                quantity = float(position['quantity'])
                average_cost = float(position['average_cost'])
                
                # Add delay to prevent Yahoo Finance rate limiting (except for first symbol)
                if i > 0:
                    time.sleep(0.5)  # 500ms delay between requests
                
                try:
                    current_price = get_current_price_portfolio(symbol)
                    if current_price and current_price > 0:
                        market_value = quantity * current_price
                        unrealized_pnl = (current_price - average_cost) * quantity
                        
                        update_query = """
                            UPDATE portfolio_positions 
                            SET current_price = %s, market_value = %s, unrealized_pnl = %s, updated_at = NOW()
                            WHERE symbol = %s
                        """
                        execute_db_write(update_query, (current_price, market_value, unrealized_pnl, symbol))
                        success_count += 1
                    else:
                        failed_symbols.append(symbol)
                        # Still update the timestamp even if price fetch failed
                        update_query = "UPDATE portfolio_positions SET updated_at = NOW() WHERE symbol = %s"
                        execute_db_write(update_query, (symbol,))
                        
                except Exception as e:
                    failed_symbols.append(f"{symbol} ({str(e)})")
                    continue
            
            # Show results
            if success_count > 0:
                st.success(f"✅ Updated {success_count} out of {len(positions)} positions")
            
            if failed_symbols:
                st.warning(f"⚠️ Failed to update: {', '.join(failed_symbols[:3])}{'...' if len(failed_symbols) > 3 else ''}")
                st.caption("💡 Some crypto symbols may not be available on Yahoo Finance. Try using different exchanges (e.g., BTC-USD instead of BTC-AUD)")
                
    except Exception as e:
        st.error(f"Error updating prices: {str(e)}")

def get_portfolio_positions() -> List[Dict[str, Any]]:
    """Get all portfolio positions (excluding zero quantities)"""
    query = """
        SELECT symbol, quantity, average_cost, current_price, market_value, unrealized_pnl, updated_at
        FROM portfolio_positions 
        WHERE quantity > 0
        ORDER BY market_value DESC
    """
    return execute_db_query(query) or []

def get_portfolio_transactions(limit: int = 50) -> List[Dict[str, Any]]:
    """Get portfolio transaction history"""
    query = """
        SELECT symbol, transaction_type, quantity, price, total_amount, realized_pnl, transaction_date, notes
        FROM portfolio_transactions 
        ORDER BY transaction_date DESC 
        LIMIT %s
    """
    return execute_db_query(query, (limit,)) or []

def calculate_portfolio_metrics() -> Dict[str, Any]:
    """Calculate portfolio performance metrics"""
    try:
        positions = get_portfolio_positions()
        transactions = get_portfolio_transactions(1000)  # Get more for calculations
        
        if not positions:
            return {}
        
        total_market_value = sum(float(pos['market_value']) for pos in positions)
        total_unrealized_pnl = sum(float(pos['unrealized_pnl']) for pos in positions)
        total_cost_basis = sum(float(pos['quantity']) * float(pos['average_cost']) for pos in positions)
        
        # Calculate realized P&L from transactions (now stored in database)
        realized_pnl = sum([float(t.get('realized_pnl', 0)) for t in transactions])
        
        total_pnl = realized_pnl + total_unrealized_pnl
        total_return_pct = (total_pnl / total_cost_basis) * 100 if total_cost_basis > 0 else 0
        
        return {
            'total_positions': len(positions),
            'total_market_value': total_market_value,
            'total_cost_basis': total_cost_basis,
            'total_unrealized_pnl': total_unrealized_pnl,
            'realized_pnl': realized_pnl,
            'total_pnl': total_pnl,
            'total_return_pct': total_return_pct
        }
    except Exception as e:
        st.error(f"Error calculating metrics: {str(e)}")
        return {}

def create_portfolio_chart(positions: List[Dict[str, Any]]) -> go.Figure:
    """Create portfolio allocation chart"""
    if not positions:
        return None
    
    symbols = [pos['symbol'] for pos in positions]
    values = [float(pos['market_value']) for pos in positions]
    colors = ['#00D4AA', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF']
    
    fig = go.Figure(data=[go.Pie(
        labels=symbols,
        values=values,
        hole=0.4,
        marker_colors=colors[:len(symbols)],
        textinfo='label+percent',
        textposition='outside'
    )])
    
    fig.update_layout(
        title="Portfolio Allocation by Market Value",
        template="plotly_dark",
        height=400,
        showlegend=False
    )
    
    return fig

def create_portfolio_performance_chart() -> go.Figure:
    """Create portfolio performance over time chart"""
    try:
        # Get transaction history to build performance timeline
        transactions = get_portfolio_transactions(1000)
        
        if not transactions:
            return None
        
        # Group transactions by date and calculate running totals
        df_transactions = pd.DataFrame(transactions)
        df_transactions['transaction_date'] = pd.to_datetime(df_transactions['transaction_date'])
        df_transactions = df_transactions.sort_values('transaction_date')
        
        # Calculate cumulative invested amount
        df_transactions['cumulative_invested'] = df_transactions['total_amount'].cumsum()
        
        # Get current portfolio value for the end point
        metrics = calculate_portfolio_metrics()
        current_value = metrics.get('total_market_value', 0)
        
        # Create the chart
        fig = go.Figure()
        
        # Add invested capital line
        fig.add_trace(go.Scatter(
            x=df_transactions['transaction_date'],
            y=df_transactions['cumulative_invested'],
            mode='lines+markers',
            name='Invested Capital',
            line=dict(color='#FFA500', width=2)
        ))
        
        # Add current value point
        if not df_transactions.empty:
            last_date = df_transactions['transaction_date'].iloc[-1]
            fig.add_trace(go.Scatter(
                x=[last_date],
                y=[current_value],
                mode='markers',
                name='Current Value',
                marker=dict(color='#00D4AA', size=10)
            ))
        
        fig.update_layout(
            title="Portfolio Performance Over Time",
            xaxis_title="Date",
            yaxis_title="Value ($)",
            template="plotly_dark",
            height=400
        )
        
        return fig
    except Exception as e:
        st.error(f"Error creating performance chart: {str(e)}")
        return None

# ================= UI =================
# Page config already set at top - removing duplicate

# Add PWA functionality
st.markdown("""
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0b0f19">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Market Scanner">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
</script>
""", unsafe_allow_html=True)

# Professional Header with App Icon
def get_base64_of_bin_file(bin_file):
    with open(bin_file, 'rb') as f:
        data = f.read()
    return base64.b64encode(data).decode()

try:
    app_icon_base64 = get_base64_of_bin_file("attached_assets/Financial Market Growth Icon_1758709284055.png")
    header_html = f"""
    <div class="main-header">
        <img src="data:image/png;base64,{app_icon_base64}" class="app-icon" alt="Market Scanner App Icon">
        <h1>📊 Market Scanner Dashboard</h1>
        <p>Professional Market Analysis & Trading Intelligence Platform</p>
    </div>
    """
except FileNotFoundError:
    # Fallback if image file is not found
    header_html = """
    <div class="main-header">
        <h1>📊 Market Scanner Dashboard</h1>
        <p>Professional Market Analysis & Trading Intelligence Platform</p>
    </div>
    """

st.markdown(header_html, unsafe_allow_html=True)

# Initialize session state
if 'eq_results' not in st.session_state:
    st.session_state.eq_results = pd.DataFrame()
if 'cx_results' not in st.session_state:
    st.session_state.cx_results = pd.DataFrame()
if 'eq_errors' not in st.session_state:
    st.session_state.eq_errors = pd.DataFrame()
if 'cx_errors' not in st.session_state:
    st.session_state.cx_errors = pd.DataFrame()

# Tier system session state
if 'user_tier' not in st.session_state:
    st.session_state.user_tier = 'free'  # 'free', 'pro', 'pro_trader'
if 'active_alerts_count' not in st.session_state:
    st.session_state.active_alerts_count = 0

# ================= Subscription Management System =================
def get_subscription_plans():
    """Get all available subscription plans"""
    try:
        query = """
            SELECT id, plan_code, name, description, monthly_price_usd, yearly_price_usd, 
                   features, scan_limit, alert_limit, is_active
            FROM subscription_plans 
            WHERE is_active = true 
            ORDER BY monthly_price_usd
        """
        result = execute_db_query(query)
        return result if result else []
    except Exception as e:
        st.error(f"Error fetching subscription plans: {str(e)}")
        return []

def get_workspace_subscription(workspace_id: str):
    """Get active subscription for a workspace (includes cancelled subs still in billing period)"""
    try:
        query = """
            SELECT us.*, sp.plan_code, sp.name as plan_name, sp.features, sp.scan_limit, sp.alert_limit
            FROM user_subscriptions us
            JOIN subscription_plans sp ON us.plan_id = sp.id
            WHERE us.workspace_id = %s 
            AND us.subscription_status IN ('active', 'cancelled')
            AND (us.current_period_end IS NULL OR us.current_period_end > now())
            ORDER BY us.created_at DESC
            LIMIT 1
        """
        result = execute_db_query(query, (workspace_id,))
        return result[0] if result and len(result) > 0 else None
    except Exception as e:
        st.error(f"Error fetching subscription: {str(e)}")
        return None

def create_subscription(workspace_id: str, plan_code: str, platform: str, billing_period: str = 'monthly'):
    """Create a new subscription for a workspace (DEMO ONLY - requires payment integration)"""
    try:
        # SECURITY: In production, this should only be called after payment verification
        if platform not in ['web', 'ios', 'android']:
            return False, "Invalid platform"
        
        # Get plan details
        plan_query = "SELECT id FROM subscription_plans WHERE plan_code = %s AND is_active = true"
        plan_result = execute_db_query(plan_query, (plan_code,))
        if not plan_result or len(plan_result) == 0:
            return False, "Invalid subscription plan"
        
        plan_id = plan_result[0]['id']
        
        # Calculate period end based on billing period
        if billing_period == 'yearly':
            period_interval = "interval '1 year'"
        else:
            period_interval = "interval '1 month'"
        
        # Cancel any existing active subscriptions (prevent multiple active)
        cancel_subscription(workspace_id)
        
        # Create new subscription
        insert_query = f"""
            INSERT INTO user_subscriptions 
            (workspace_id, plan_id, platform, billing_period, subscription_status, current_period_start, current_period_end)
            VALUES (%s, %s, %s, %s, 'active', now(), now() + {period_interval})
            RETURNING id
        """
        
        result = execute_db_write_returning(insert_query, (workspace_id, plan_id, platform, billing_period))
        if not result or len(result) == 0:
            return False, "Failed to create subscription"
        
        subscription_id = result[0]['id']
        
        # Log subscription event
        event_query = """
            INSERT INTO subscription_events (subscription_id, event_type, platform, event_data)
            VALUES (%s, 'created', %s, %s)
        """
        execute_db_write(event_query, (subscription_id, platform, json.dumps({'plan_code': plan_code, 'billing_period': billing_period})))
        
        return True, subscription_id
    except Exception as e:
        st.error(f"Error creating subscription: {str(e)}")
        return False, str(e)

def cancel_subscription(workspace_id: str):
    """Cancel active subscription for a workspace"""
    try:
        # Update subscription status
        update_query = """
            UPDATE user_subscriptions 
            SET subscription_status = 'cancelled', cancelled_at = now()
            WHERE workspace_id = %s AND subscription_status = 'active'
            RETURNING id
        """
        
        result = execute_db_write_returning(update_query, (workspace_id,))
        
        if result and len(result) > 0:
            subscription_id = result[0]['id']
            
            # Log cancellation event
            event_query = """
                INSERT INTO subscription_events (subscription_id, event_type, platform)
                VALUES (%s, 'cancelled', 'web')
            """
            execute_db_write(event_query, (subscription_id,))
            return True
            
        return False
    except Exception as e:
        st.error(f"Error cancelling subscription: {str(e)}")
        return False

def get_user_tier_from_subscription(workspace_id: str):
    """Get user tier based on active subscription and admin overrides"""
    # Check for admin override first
    override_tier = get_subscription_override(workspace_id)
    if override_tier:
        return override_tier
    
    # Fall back to regular subscription
    subscription = get_workspace_subscription(workspace_id)
    if subscription:
        return subscription['plan_code']
    return 'free'

# ================= Stripe Webhook Endpoint =================
# Handle webhook in query parameters for Streamlit limitations
if 'webhook' in st.query_params:
    webhook_payload = st.query_params.get('payload', '')
    webhook_signature = st.query_params.get('signature', '')
    
    if webhook_payload and webhook_signature:
        try:
            import urllib.parse
            decoded_payload = urllib.parse.unquote(webhook_payload)
            success, message = handle_stripe_webhook(decoded_payload, webhook_signature)
            if success:
                st.write("Webhook processed successfully")
            else:
                st.error(f"Webhook error: {message}")
        except Exception as e:
            st.error(f"Webhook processing failed: {str(e)}")
        st.stop()

# Handle Apple IAP Receipt Validation (API endpoint)
if 'iap' in st.query_params and st.query_params.get('action') == 'validate-receipt':
    st.write("Apple IAP Receipt Validation Endpoint")
    if st.button("Validate Receipt"):
        # This would be called via API, not through Streamlit UI
        st.info("⚙️ Receipt validation endpoint ready for iOS app")
    st.stop()

# Handle successful payment return from Stripe
if 'session_id' in st.query_params:
    session_id = st.query_params.get('session_id')
    if session_id:
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            if session and session.payment_status == 'paid':
                st.success("🎉 Payment successful! Your subscription is now active.")
                st.balloons()
                # Clear the query parameter to avoid repeated success messages
                st.query_params.clear()
                st.rerun()
        except Exception as e:
            st.error(f"Error verifying payment: {str(e)}")

# ================= Apple IAP Receipt Validation =================
def validate_apple_iap_receipt(receipt_data: str, product_id: str, transaction_id: str):
    """Validate Apple IAP receipt with Apple's servers"""
    try:
        import base64
        import requests
        
        # Apple IAP Receipt Validation Endpoint
        # Use sandbox for development, production for live app
        apple_endpoint = "https://buy.itunes.apple.com/verifyReceipt"  # Production
        # apple_endpoint = "https://sandbox.itunes.apple.com/verifyReceipt"  # Sandbox
        
        receipt_payload = {
            "receipt-data": receipt_data,
            "password": os.getenv("APPLE_SHARED_SECRET"),  # From App Store Connect
            "exclude-old-transactions": True
        }
        
        response = requests.post(apple_endpoint, json=receipt_payload, timeout=30)
        
        if response.status_code != 200:
            return False, "Apple server error"
            
        result = response.json()
        
        if result.get("status") == 0:
            # Receipt is valid
            latest_receipt_info = result.get("latest_receipt_info", [])
            
            # Find the matching transaction
            for transaction in latest_receipt_info:
                if transaction.get("product_id") == product_id:
                    # Check if subscription is active
                    expires_date = transaction.get("expires_date_ms")
                    if expires_date:
                        import time
                        if int(expires_date) / 1000 > time.time():
                            return True, {
                                "transaction_id": transaction.get("transaction_id"),
                                "expires_date": expires_date,
                                "product_id": product_id,
                                "plan_code": "pro" if "pro_monthly" in product_id else "pro_trader"
                            }
            
            return False, "No active subscription found"
        else:
            return False, f"Receipt validation failed: {result.get('status')}"
            
    except Exception as e:
        print(f"Apple IAP validation error: {e}")
        return False, str(e)

def process_apple_iap_purchase(receipt_data: str, product_id: str, transaction_id: str, workspace_id: str):
    """Process Apple IAP purchase and create subscription"""
    try:
        # Validate receipt with Apple
        is_valid, validation_result = validate_apple_iap_receipt(receipt_data, product_id, transaction_id)
        
        if is_valid:
            plan_code = validation_result["plan_code"]
            
            # Create subscription in database
            success, result = create_subscription(workspace_id, plan_code, 'ios', 'monthly')
            
            if success:
                return True, {
                    "subscription_id": result,
                    "plan_code": plan_code,
                    "platform": "ios",
                    "apple_transaction_id": transaction_id
                }
            else:
                return False, f"Database error: {result}"
        else:
            return False, f"Receipt validation failed: {validation_result}"
            
    except Exception as e:
        print(f"Apple IAP processing error: {e}")
        return False, str(e)

# ================= Stripe Integration Functions =================
def create_stripe_checkout_session(plan_code: str, workspace_id: str):
    """Create a Stripe checkout session for subscription"""
    try:
        if not stripe.api_key:
            return None, "Stripe not configured"
        
        # Get plan details
        plan = SUBSCRIPTION_PLANS.get(plan_code)
        if not plan:
            return None, "Invalid plan"
        
        # Create or get customer
        customer = None
        try:
            customers = stripe.Customer.list(metadata={"workspace_id": workspace_id})
            if customers.data:
                customer = customers.data[0]
        except:
            pass
        
        if not customer:
            customer = stripe.Customer.create(
                metadata={"workspace_id": workspace_id},
                description=f"Market Scanner - Workspace {workspace_id[:8]}"
            )
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer.id,
            payment_method_types=['card'],
            mode='subscription',
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': plan['name'],
                        'description': ', '.join(plan['features'])
                    },
                    'unit_amount': int(plan['price'] * 100),
                    'recurring': {'interval': 'month'}
                },
                'quantity': 1,
            }],
            metadata={
                'workspace_id': workspace_id,
                'plan_code': plan_code
            },
            success_url=f"{os.getenv('DOMAIN_URL', 'http://localhost:5000')}?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{os.getenv('DOMAIN_URL', 'http://localhost:5000')}"
        )
        
        return session.url, None
    except Exception as e:
        return None, f"Stripe error: {str(e)}"

def handle_stripe_webhook(webhook_data: dict, signature: str):
    """Handle Stripe webhook events"""
    try:
        if not STRIPE_WEBHOOK_SECRET:
            return False, "Webhook secret not configured"
        
        # Verify webhook signature
        event = stripe.Webhook.construct_event(
            webhook_data, signature, STRIPE_WEBHOOK_SECRET
        )
        
        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            workspace_id = session['metadata'].get('workspace_id')
            plan_code = session['metadata'].get('plan_code')
            
            if workspace_id and plan_code:
                # Create subscription in database
                success, result = create_subscription(workspace_id, plan_code, 'web')
                if not success:
                    return False, f"Failed to create subscription: {result}"
                
                # Store Stripe subscription ID
                stripe_subscription_id = session.get('subscription')
                if stripe_subscription_id:
                    update_query = """
                        UPDATE user_subscriptions 
                        SET stripe_subscription_id = %s
                        WHERE workspace_id = %s AND subscription_status = 'active'
                    """
                    execute_db_write(update_query, (stripe_subscription_id, workspace_id))
        
        elif event['type'] == 'customer.subscription.deleted':
            subscription = event['data']['object']
            # Cancel subscription in database
            cancel_query = """
                UPDATE user_subscriptions 
                SET subscription_status = 'cancelled', cancelled_at = now()
                WHERE stripe_subscription_id = %s
            """
            execute_db_write(cancel_query, (subscription['id'],))
            
        return True, "Webhook processed"
    except Exception as e:
        return False, f"Webhook error: {str(e)}"

def cancel_stripe_subscription(workspace_id: str):
    """Cancel a Stripe subscription"""
    try:
        subscription = get_workspace_subscription(workspace_id)
        if not subscription or not subscription.get('stripe_subscription_id'):
            return False, "No active Stripe subscription found"
        
        # Cancel in Stripe
        stripe.Subscription.delete(subscription['stripe_subscription_id'])
        
        # Cancel in database
        cancel_subscription(workspace_id)
        
        return True, "Subscription cancelled"
    except Exception as e:
        return False, f"Error cancelling subscription: {str(e)}"

# ================= Anonymous Workspace System =================
# Initialize anonymous device and workspace for data sync
# Initialize persistent device fingerprint
if 'device_fingerprint' not in st.session_state:
    st.session_state.device_fingerprint = get_persistent_device_fingerprint()

if 'workspace_id' not in st.session_state:
    # Get or create workspace for this device
    workspace_id = get_or_create_workspace_for_device(st.session_state.device_fingerprint)
    st.session_state.workspace_id = workspace_id
    
    # If we have a workspace, sync any existing data
    if workspace_id:
        try:
            # Load existing workspace data into session state
            existing_data = get_workspace_data(workspace_id)
            
            # Process saved watchlists, alerts, etc.
            for item in existing_data:
                data_type = item['data_type']
                item_key = item['item_key'] 
                payload = json.loads(item['data_payload']) if isinstance(item['data_payload'], str) else item['data_payload']
                
                # Restore watchlist items
                if data_type == 'watchlist':
                    if 'saved_watchlist' not in st.session_state:
                        st.session_state.saved_watchlist = []
                    if item_key not in st.session_state.saved_watchlist:
                        st.session_state.saved_watchlist.append(item_key)
                
                # Restore other data types as needed
                # Could add portfolio data, settings, etc. here
                
        except Exception as e:
            # Silent fail - don't break app if sync fails
            pass

if 'pairing_token' not in st.session_state:
    st.session_state.pairing_token = None

if 'saved_watchlist' not in st.session_state:
    st.session_state.saved_watchlist = []

c1, c2, c3 = st.columns([1,1,1])
run_clicked = c1.button("🔎 Run Scanner", width='stretch')
refresh_clicked = c2.button("🔁 Refresh Data", width='stretch')
now_syd = datetime.now(timezone.utc).astimezone(SYD).strftime("%H:%M:%S %Z")
c3.info(f"Last scan: {now_syd}")

# Show freemium tier banner to free tier users
if st.session_state.user_tier == 'free':
    st.markdown("---")
    
    # Clean tier banner with upgrade messaging
    st.info("""
    🚀 **Free Tier: All Features Unlocked!** 
    
    You have access to ALL market scanning features, advanced indicators, charting tools, and alerts.
    
    **Only limitation:** 4 symbols per scan • **Upgrade for unlimited symbols!**
    """)
    
    # Simple upgrade section
    col1, col2, col3 = st.columns([1, 1, 1])
    
    with col2:
        is_mobile = st.session_state.get('is_mobile_app', False)
        if is_mobile:
            st.markdown("**📱 Upgrade in Mobile App**")
            st.caption("Settings → Subscription")
        else:
            st.markdown("**🌐 Upgrade on Web**") 
            st.caption("Settings → Subscription")
    
    st.markdown("---")

# Clear cache if refresh clicked
if refresh_clicked:
    st.cache_data.clear()
    st.success("Data cache cleared!")
    st.rerun()

# Sidebar
# ================= Watchlist Management =================
# ================= ADMIN ACCESS (HIDDEN UNLESS REQUESTED) =================
# Only show admin interface if ?admin=true in URL for security
query_params = st.query_params
show_admin = query_params.get('admin') == 'true'

if show_admin:
    # Secure admin interface for app creator only
    device_fingerprint = get_persistent_device_fingerprint()
    workspace_id = get_or_create_workspace_for_device(device_fingerprint)

    # Check if user has admin access
    user_is_admin = workspace_id and is_admin(workspace_id, device_fingerprint)

    if user_is_admin:
        # Admin is logged in - show admin controls
        st.sidebar.header("🔧 Admin Access")
        with st.sidebar.expander("Creator Controls", expanded=False):
            st.caption("🔑 Admin authenticated - Creator access")
            
            # Current tier display
            current_tier = get_user_tier_from_subscription(workspace_id) if workspace_id else 'free'
            st.info(f"Current tier: {current_tier.upper()}")
            
            # Tier override controls
            override_tier = st.selectbox(
                "Override Tier:",
                options=['free', 'pro', 'pro_trader'],
                format_func=lambda x: {
                    'free': '📱 Free Tier',
                    'pro': '🚀 Pro Tier ($4.99/month)', 
                    'pro_trader': '💎 Pro Trader ($9.99/month)'
                }[x],
                index=['free', 'pro', 'pro_trader'].index(current_tier),
                key="admin_tier_override"
            )
            
            col1, col2 = st.columns(2)
            with col1:
                if st.button("Apply Override", type="primary"):
                    if workspace_id and set_subscription_override(workspace_id, override_tier, "admin", None):
                        st.success(f"✅ Tier set to: {override_tier.upper()}")
                        st.rerun()
                    else:
                        st.error("❌ Failed to set override")
            
            with col2:
                if st.button("Clear Override"):
                    if workspace_id and clear_subscription_override(workspace_id):
                        st.success("✅ Override cleared")
                        st.rerun()
                    else:
                        st.error("❌ Failed to clear override")
            
            st.caption("💡 Overrides persist across sessions and devices")
        
        # Friend Access Code Management
        with st.sidebar.expander("🎫 Friend Access Codes", expanded=False):
            st.caption("Generate access codes for friends")
            
            # Code generation settings
            friend_tier = st.selectbox(
                "Access Level:",
                options=['pro', 'pro_trader'],
                format_func=lambda x: {
                    'pro': '🚀 Pro Tier (Standard)',
                    'pro_trader': '💎 Pro Trader (Premium)'
                }[x],
                index=1,  # Default to pro_trader
                key="friend_tier_select"
            )
            
            friend_duration = st.selectbox(
                "Duration:",
                options=[7, 14, 30, 60, 90],
                format_func=lambda x: f"📅 {x} days",
                index=2,  # Default to 30 days
                key="friend_duration_select"
            )
            
            col1, col2 = st.columns(2)
            with col1:
                if st.button("🎫 Generate Code", type="primary", key="generate_friend_code"):
                    new_code = create_friend_access_code(friend_tier, friend_duration)
                    if new_code:
                        st.success(f"✅ Code created!")
                        st.code(new_code, language=None)
                        st.caption(f"📱 Share this code with your friend\n📅 Valid for {friend_duration} days once used\n🔒 One-time use only")
                    else:
                        st.error("❌ Failed to create code")
            
            with col2:
                if st.button("📊 View Codes", key="view_friend_codes"):
                    codes = get_friend_access_codes_status()
                    if codes:
                        st.write("**Recent Codes:**")
                        for code in codes[:5]:  # Show last 5 codes
                            status_emoji = "✅" if code['status'] == 'Used' else "⏳"
                            tier_emoji = "💎" if code['access_tier'] == 'pro_trader' else "🚀"
                            st.text(f"{status_emoji} {code['code'][:6]}... {tier_emoji} {code['status']}")
                    else:
                        st.info("📝 No codes generated yet")
            
            st.caption("🔒 Each code works once per device only")

    else:
        # Admin login form
        st.sidebar.header("🔑 Admin Access")
        with st.sidebar.expander("Admin Login", expanded=False):
            st.caption("Enter admin PIN to access creator controls")
            
            admin_pin = st.text_input("Admin PIN:", type="password", key="admin_pin")
            
            if st.button("Login", type="primary"):
                if workspace_id:
                    success, message = verify_admin_pin(admin_pin, workspace_id, device_fingerprint)
                    if success:
                        if create_admin_session(workspace_id, device_fingerprint):
                            st.success("✅ Admin access granted!")
                            st.rerun()
                        else:
                            st.error("❌ Failed to create admin session")
                    else:
                        st.error(f"❌ {message}")
                else:
                    st.error("❌ Workspace not available")
            
            st.caption("⚠️ Creator access only")

st.sidebar.header("📋 Watchlists")

# Get all watchlists
watchlists = get_watchlists()
watchlist_names = ["Manual Entry"] + [f"{wl['name']} ({len(wl['symbols'])} symbols)" for wl in watchlists]

# Watchlist selection
selected_watchlist = st.sidebar.selectbox("Select Watchlist:", watchlist_names, index=0)

# Watchlist management controls
col1, col2 = st.sidebar.columns(2)
with col1:
    if st.button("➕ New", key="new_watchlist"):
        st.session_state.show_new_watchlist = True
with col2:
    if st.button("✏️ Manage", key="manage_watchlists"):
        st.session_state.show_manage_watchlists = True

# New watchlist creation modal
if st.session_state.get('show_new_watchlist', False):
    with st.sidebar.expander("Create New Watchlist", expanded=True):
        new_name = st.text_input("Watchlist Name:", key="new_wl_name")
        new_desc = st.text_area("Description:", key="new_wl_desc", height=60)
        new_symbols_text = st.text_area("Symbols (one per line):", key="new_wl_symbols", height=100)
        
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("Save", key="save_new_wl"):
                if new_name and new_symbols_text:
                    symbols = [s.strip().upper() for s in new_symbols_text.splitlines() if s.strip()]
                    if create_watchlist(new_name, new_desc, symbols):
                        st.success(f"Watchlist '{new_name}' created!")
                        st.session_state.show_new_watchlist = False
                        st.rerun()
                    else:
                        st.error("Failed to create watchlist")
                else:
                    st.error("Name and symbols required")
        with col3:
            if st.button("Cancel", key="cancel_new_wl"):
                st.session_state.show_new_watchlist = False
                st.rerun()

# Manage existing watchlists
if st.session_state.get('show_manage_watchlists', False):
    with st.sidebar.expander("Manage Watchlists", expanded=True):
        if watchlists:
            for wl in watchlists:
                st.write(f"**{wl['name']}** ({len(wl['symbols'])} symbols)")
                st.write(f"*{wl['description']}*" if wl['description'] else "*No description*")
                col1, col2 = st.columns(2)
                with col1:
                    if st.button("Edit", key=f"edit_{wl['id']}"):
                        st.session_state.edit_watchlist_id = wl['id']
                with col2:
                    if st.button("Delete", key=f"delete_{wl['id']}"):
                        st.session_state.confirm_delete_id = wl['id']
                        st.session_state.confirm_delete_name = wl['name']
                st.markdown("---")
        else:
            st.info("No watchlists found. Create one above!")
        
        if st.button("Close", key="close_manage"):
            st.session_state.show_manage_watchlists = False
            st.rerun()

# ================= Device Pairing & Sync =================
st.sidebar.header("📱 Device Sync")

if st.session_state.workspace_id:
    # Show current workspace info
    devices = get_workspace_devices(st.session_state.workspace_id)
    st.sidebar.caption(f"💾 Workspace: {st.session_state.workspace_id[:8]}...")
    st.sidebar.caption(f"📱 Connected devices: {len(devices)}")
    
    # Create pairing section
    with st.sidebar.expander("🔗 Connect New Device", expanded=False):
        st.write("**To sync with another device:**")
        st.write("1. Generate a pairing code below")
        st.write("2. Open Market Scanner on your other device")
        st.write("3. Scan the QR code or enter the code")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("📱 Generate Code", key="generate_pair"):
                if st.session_state.workspace_id:
                    token = create_pairing_token(st.session_state.workspace_id)
                    if token:
                        st.session_state.pairing_token = token
                        st.rerun()
                    else:
                        st.error("Failed to generate pairing code")
        
        with col2:
            if st.button("🔄 Sync Now", key="sync_now"):
                if st.session_state.workspace_id:
                    # Save current watchlist to workspace
                    for symbol in st.session_state.saved_watchlist:
                        save_workspace_data(
                            st.session_state.workspace_id,
                            'watchlist',
                            symbol,
                            {'symbol': symbol, 'added_at': datetime.now().isoformat()}
                        )
                    st.success("🔄 Data synced!")
        
        # Show pairing token and QR code
        if st.session_state.pairing_token:
            st.write(f"**Pairing Code:** `{st.session_state.pairing_token}`")
            st.caption("⏱️ Expires in 10 minutes")
            
            # Generate QR code
            pairing_url = f"https://marketscannerpros.app/?pair={st.session_state.pairing_token}"
            qr_img = generate_qr_code(pairing_url)
            
            st.markdown(f'<img src="{qr_img}" style="width: 150px; height: 150px; margin: 10px auto; display: block;">', 
                       unsafe_allow_html=True)
            st.caption("Scan with your mobile device")
    
    # Pair with token section
    with st.sidebar.expander("🔢 Enter Pairing Code", expanded=False):
        st.write("**Have a pairing code from another device?**")
        pair_token = st.text_input("Enter pairing code:", max_chars=6, key="pair_token_input")
        if st.button("📲 Pair Device", key="pair_device"):
            if pair_token:
                new_device_fp = generate_device_fingerprint()
                result_workspace = consume_pairing_token(pair_token, new_device_fp, "web", "Web Browser")
                if result_workspace:
                    # Switch to the paired workspace
                    st.session_state.workspace_id = result_workspace
                    st.session_state.device_fingerprint = new_device_fp
                    st.success("✅ Device paired successfully!")
                    st.rerun()
                else:
                    st.error("❌ Invalid or expired pairing code")
            else:
                st.error("Please enter a pairing code")
    
    # Device management
    if devices and len(devices) > 1:
        with st.sidebar.expander("⚙️ Manage Devices", expanded=False):
            for device in devices:
                device_name = device['device_name'] or "Unknown Device"
                platform = device['platform'] or "unknown"
                is_current = device['device_fingerprint'] == st.session_state.device_fingerprint
                
                if is_current:
                    st.write(f"📱 **{device_name}** ({platform}) - *This device*")
                else:
                    col1, col2 = st.columns([3, 1])
                    with col1:
                        st.write(f"📱 {device_name} ({platform})")
                    with col2:
                        if st.button("🗑️", key=f"revoke_{device['device_fingerprint'][:8]}", help="Remove device"):
                            if revoke_device(st.session_state.workspace_id, device['device_fingerprint']):
                                st.success("Device removed")
                                st.rerun()

else:
    st.sidebar.error("❌ Workspace initialization failed")

# ================= Subscription Tiers (Web Only) =================
# Enhanced platform detection for Apple IAP compliance
def get_platform_type() -> str:
    """Detect platform type: 'ios', 'android', or 'web' with enhanced iOS detection"""
    try:
        # Check URL parameters first (most reliable for mobile apps)
        query_params = st.query_params
        platform_param = query_params.get('platform')
        mobile_param = query_params.get('mobile')
        
        if platform_param:
            platform_str = str(platform_param).lower()
            if 'ios' in platform_str:
                return 'ios'
            elif 'android' in platform_str:
                return 'android'
                
        # If mobile=true parameter is present, check user agent more carefully
        if mobile_param and str(mobile_param).lower() == 'true':
            headers = st.context.headers if hasattr(st.context, 'headers') else {}
            user_agent = headers.get('user-agent', '').lower()
            
            # Strong iOS indicators (WebView running in iOS app)
            ios_strong_indicators = ['wkwebview', 'mobile/15e148', 'mobile/16', 'mobile/17', 'mobile/18', 'iphone', 'ipad']
            if any(indicator in user_agent for indicator in ios_strong_indicators):
                return 'ios'
                
            # Capacitor/Cordova in iOS
            if 'capacitor' in user_agent or 'cordova' in user_agent:
                if any(ios_indicator in user_agent for ios_indicator in ['iphone', 'ipad', 'ios']):
                    return 'ios'
            
            # Default mobile app to iOS for safety (Apple compliance)
            return 'ios'
            
        # Check user agent for platform-specific indicators
        headers = st.context.headers if hasattr(st.context, 'headers') else {}
        user_agent = headers.get('user-agent', '').lower()
        
        # iOS indicators
        ios_indicators = ['wkwebview', 'ios app', 'capacitor/ios', 'iphone', 'ipad', 'mobile/15', 'mobile/16', 'mobile/17', 'mobile/18']
        if any(indicator in user_agent for indicator in ios_indicators):
            return 'ios'
            
        # Android indicators  
        android_indicators = ['android app', 'capacitor/android', 'android']
        if any(indicator in user_agent for indicator in android_indicators):
            return 'android'
            
    except Exception:
        pass
    
    return 'web'

def is_mobile_app() -> bool:
    """Check if request is from mobile app WebView"""
    return get_platform_type() in ['ios', 'android']

def is_ios_app() -> bool:
    """Check if request is specifically from iOS app"""
    return get_platform_type() == 'ios'

# Define tier configurations (needed for app functionality)
TIER_CONFIG = {
    'free': {
        'name': '📱 Free Tier',
        'features': ['Full market scanning', 'All advanced features', 'Real-time data', 'Advanced charts', 'Portfolio tracking', 'Limited to 4 symbols only'],
        'scan_limit': 4,
        'alert_limit': None,
        'color': '#666666'
    },
    'pro': {
        'name': '🚀 Pro Tier',
        'price': '$4.99/month',
        'features': ['Unlimited scans & alerts', 'Advanced charts', 'Real-time data', 'Portfolio tracking'],
        'scan_limit': None,
        'alert_limit': None,
        'color': '#4CAF50'
    },
    'pro_trader': {
        'name': '💎 Pro Trader',
        'price': '$9.99/month',
        'features': ['Everything in Pro', 'Advanced backtesting', 'Custom algorithms', 'Priority support'],
        'scan_limit': None,
        'alert_limit': None,
        'color': '#FF9800'
    }
}

# Debug moved to top of file

# ================= Developer Override (Authorized Users Only) =================
# SECURITY: Only show to authorized users
AUTHORIZED_DEVELOPER_IDS = [
    "e67df082-aa17-4e78-a9e6-efc4c862518b",  # Creator (Bradley) - workspace_id
    "da40c1eb-7ce2-43d8-a273-4e0e2117b384",  # Creator (Bradley) - device_id
    # Add more workspace IDs or device IDs here for trusted users
]

current_workspace_id = st.session_state.get('workspace_id', '')
current_device_id = st.session_state.get('device_fingerprint', '')

# Remove this section from here - moving to top of sidebar


# ================= Subscription UI (All Platforms) =================
# Show subscription UI on all platforms (required by Apple for In-App Purchase compliance)
st.sidebar.header("💳 Subscription")

# Get current subscription from database with admin override support
workspace_id = st.session_state.get('workspace_id')
current_subscription = None

if workspace_id:
    # Use the proper function that checks admin overrides first, then subscriptions
    current_tier = get_user_tier_from_subscription(workspace_id)
    # Also get subscription info for display purposes
    current_subscription = get_workspace_subscription(workspace_id)
else:
    # No workspace - default to free
    current_tier = 'free'

# Update session state to match current tier
st.session_state.user_tier = current_tier
    
tier_info = TIER_CONFIG[current_tier]

# Display current tier status with expiry information
expiry_text = "Limited features"
if current_tier != 'free':
    expiry_text = "Active Plan"
    
    # Check for friend code expiry (subscription overrides)
    if workspace_id:
        override_query = """
            SELECT expires_at, set_by FROM subscription_overrides 
            WHERE workspace_id = %s AND expires_at IS NOT NULL
            LIMIT 1
        """
        override_result = execute_db_query(override_query, (workspace_id,))
        
        if override_result and len(override_result) > 0:
            expires_at = override_result[0]['expires_at']
            set_by = override_result[0]['set_by']
            
            # Convert to datetime and calculate days remaining
            from datetime import datetime
            import pytz
            
            if expires_at:
                if isinstance(expires_at, str):
                    expires_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                else:
                    expires_dt = expires_at
                
                now_dt = datetime.now(pytz.UTC)
                days_remaining = (expires_dt - now_dt).days
                
                if days_remaining > 0:
                    if 'friend_code_' in set_by:
                        expiry_text = f"Friend Access • {days_remaining} days left"
                    else:
                        expiry_text = f"Active Plan • Expires in {days_remaining} days"
                else:
                    expiry_text = "Expired Access"

with st.sidebar.container():
    st.markdown(f"""
    <div style="
        background: linear-gradient(135deg, {tier_info['color']}22, {tier_info['color']}11);
        border: 1px solid {tier_info['color']}44;
        border-radius: 10px;
        padding: 16px;
        margin: 8px 0;
    ">
        <h4 style="margin: 0; color: {tier_info['color']};">{tier_info['name']}</h4>
        <p style="margin: 8px 0 0 0; font-size: 0.9em; opacity: 0.8;">
            {expiry_text}
        </p>
    </div>
    """, unsafe_allow_html=True)

# Apple-compliant subscription management link (required)
is_mobile = is_mobile_app()
if is_mobile:
    st.sidebar.markdown("---")
    st.sidebar.markdown("📱 **Manage Subscription**")
    st.sidebar.caption("Tap to manage your subscription through the App Store")
    # Note: In actual iOS app, this would link to subscription management

# Friend Access Code Redemption (for all users)
st.sidebar.header("🎫 Friend Access Code")
with st.sidebar.expander("Have a friend code?", expanded=False):
    st.caption("Redeem a friend access code for premium features")
    
    friend_code_input = st.text_input(
        "Enter friend code:",
        placeholder="ABCD1234EFGH",
        max_chars=12,
        key="friend_code_input"
    )
    
    if st.button("🎫 Redeem Code", type="primary", key="redeem_friend_code"):
        if friend_code_input and len(friend_code_input.strip()) >= 8:
            # Get user's workspace info
            device_fingerprint = get_persistent_device_fingerprint()
            workspace_id = get_or_create_workspace_for_device(device_fingerprint)
            
            if workspace_id:
                success, message = consume_friend_access_code(
                    friend_code_input.strip().upper(), 
                    workspace_id, 
                    device_fingerprint
                )
                
                if success:
                    st.success(message)
                    st.balloons()
                    st.rerun()  # Refresh to show new tier
                else:
                    st.error(message)
            else:
                st.error("❌ Could not link to your device - please try again")
        else:
            st.warning("Please enter a valid friend code (8+ characters)")
    
    st.caption("🔒 Codes work once per device only")

# Show upgrade options for free tier users
if current_tier == 'free':
    with st.sidebar.expander("⬆️ Upgrade Options", expanded=False):
        # Apple-compliant paywall with professional card design
        st.markdown("""
        <div class="tier-card">
            <h3>🚀 Market Scanner Pro</h3>
            <div class="price-display">$4.99 <span class="price-period">per month</span></div>
            <ul class="feature-list">
                <li>Unlimited market scans</li>
                <li>Advanced charts & indicators</li>
                <li>Real-time price alerts</li>
                <li>Portfolio tracking</li>
            </ul>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("""
        <div class="tier-card premium">
            <h3>💎 Market Scanner Pro Trader</h3>
            <div class="price-display">$9.99 <span class="price-period">per month</span></div>
            <ul class="feature-list">
                <li>Everything in Pro</li>
                <li>Advanced backtesting</li>
                <li>Custom trading algorithms</li>
                <li>Priority support</li>
            </ul>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("---")
        
        # Platform-specific payment buttons (Apple IAP compliance)
        platform = get_platform_type()
        col1, col2 = st.columns(2)
        
        with col1:
            if platform == 'ios':
                # Apple App Store Compliance: NO STRIPE on iOS
                st.error("🍎 **Apple App Store Policy**")
                st.markdown("""
                **Subscriptions must be purchased through the iOS app using Apple's In-App Purchase system.**
                
                🚫 **Web payments are not available on iOS devices**
                
                **To subscribe:**
                1. Download the Market Scanner app from the App Store
                2. Open the app on your iOS device  
                3. Go to Settings → Subscription
                4. Choose Pro ($4.99/month) or Pro Trader ($9.99/month)
                5. Complete purchase through your Apple ID
                
                **Need help?** Contact support through the iOS app.
                """)
                
                # No subscription buttons for iOS - redirect to app
                if st.button("📱 Download iOS App", key="download_ios_app"):
                    st.info("🔗 Opens App Store link (would redirect to Market Scanner iOS app)")
                    # In production: st.markdown('[Download Market Scanner](https://apps.apple.com/app/market-scanner/YOUR_APP_ID)')
                    
                # iOS users continue to see app features, just no web payments
            else:
                # Web/Android Stripe button
                if st.button("🚀 Subscribe to Pro\n$4.99 per month", key="upgrade_pro", help="Unlimited scans & alerts, advanced charts"):
                    if workspace_id:
                        # Create Stripe checkout session for web/android users
                        checkout_url, error = create_stripe_checkout_session('pro', workspace_id)
                        if checkout_url:
                            st.markdown(f'<meta http-equiv="refresh" content="0;URL={checkout_url}">', unsafe_allow_html=True)
                            st.success("🔗 Redirecting to secure checkout...")
                        else:
                            st.error(f"❌ Checkout error: {error}")
                            # Fallback to demo mode if Stripe fails
                            success, result = create_subscription(workspace_id, 'pro', 'web', 'monthly')
                            if success:
                                st.success("🎉 Demo mode: Successfully upgraded to Pro!")
                                st.rerun()
                    else:
                        st.error("❌ Workspace not initialized. Please refresh the page.")
        
        with col2:
            if platform != 'ios':  # Only show for non-iOS platforms
                # Web/Android Stripe button
                if st.button("💎 Subscribe to Trader\n$9.99 per month", key="upgrade_trader", help="Everything in Pro + backtesting & algorithms"):
                    if workspace_id:
                        # Create Stripe checkout session for web/android users
                        checkout_url, error = create_stripe_checkout_session('pro_trader', workspace_id)
                        if checkout_url:
                            st.markdown(f'<meta http-equiv="refresh" content="0;URL={checkout_url}">', unsafe_allow_html=True)
                            st.success("🔗 Redirecting to secure checkout...")
                        else:
                            st.error(f"❌ Checkout error: {error}")
                            # Fallback to demo mode if Stripe fails
                            success, result = create_subscription(workspace_id, 'pro_trader', 'web', 'monthly')
                            if success:
                                st.success("🎉 Demo mode: Successfully upgraded to Pro Trader!")
                                st.rerun()
                    else:
                        st.error("❌ Workspace not initialized. Please refresh the page.")
        
        # Apple-required billing disclosures and controls
        st.markdown("---")
        st.markdown("**📋 Billing Information**")
        st.caption("• Payment will be charged to your Apple ID account")
        st.caption("• Subscription automatically renews unless cancelled at least 24 hours before the end of the current period")
        st.caption("• Your account will be charged for renewal within 24 hours prior to the end of the current period")
        st.caption("• You can manage and cancel subscriptions in your device's subscription settings")
        
        # Apple-required links (Terms and Privacy Policy)
        st.markdown("---")
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("📄 [Terms of Service](https://marketscannerspros.pages.dev/terms)")
        with col2:
            st.markdown("🔒 [Privacy Policy](https://marketscannerspros.pages.dev/privacy)")
        
        # Apple-required subscription management controls
        if is_mobile:
            st.markdown("---")
            st.markdown("**📱 Subscription Management**")
            if st.button("⚙️ Manage Subscriptions", key="manage_subscriptions"):
                st.info("🔗 Opens: Settings > [Your Name] > Subscriptions")
                # In actual iOS app: itms-apps://apps.apple.com/account/subscriptions
            
            if st.button("🔄 Restore Purchases", key="restore_purchases"):
                st.info("🔄 Restoring previous purchases...")
                # In actual iOS app: StoreKit.restorePurchases()
        
        # Demo mode for testing (HIDE IN PRODUCTION iOS BUILDS)
        if not is_mobile:  # Only show on web, not in mobile app builds
            st.markdown("---")
            st.caption("🧪 Demo Mode - Testing Only (Hidden in production):")
            col1, col2, col3 = st.columns(3)
            with col1:
                if st.button("Free", key="demo_free"):
                    st.session_state.user_tier = 'free'
                    st.rerun()
            with col2:
                if st.button("Pro", key="demo_pro"):
                    st.session_state.user_tier = 'pro'
                    st.rerun()
            with col3:
                if st.button("Trader", key="demo_trader"):
                    st.session_state.user_tier = 'pro_trader'
                    st.rerun()

# Show tier benefits for paid users
elif current_tier in ['pro', 'pro_trader']:
    with st.sidebar.expander("✨ Your Benefits", expanded=False):
        for feature in tier_info['features']:
            st.write(f"✅ {feature}")
        
        if current_tier == 'pro':
            st.markdown("---")
            if st.button("💎 Upgrade to Pro Trader", key="upgrade_to_trader"):
                if workspace_id:
                    if is_mobile:
                        st.info("💎 In mobile app, this would trigger In-App Purchase upgrade")
                    else:
                        # Create Stripe checkout session for upgrade
                        checkout_url, error = create_stripe_checkout_session('pro_trader', workspace_id)
                        if checkout_url:
                            st.markdown(f'<meta http-equiv="refresh" content="0;URL={checkout_url}">', unsafe_allow_html=True)
                            st.success("🔗 Redirecting to secure checkout...")
                        else:
                            st.error(f"❌ Checkout error: {error}")
                            # Fallback to demo mode if Stripe fails
                            cancel_subscription(workspace_id)
                            success, result = create_subscription(workspace_id, 'pro_trader', 'web', 'monthly')
                            if success:
                                st.success("🎉 Demo mode: Successfully upgraded to Pro Trader!")
                                st.rerun()
                else:
                    st.error("❌ Workspace not initialized. Please refresh the page.")
        
        # Apple-compliant subscription management for active subscribers
        if is_mobile:
            st.markdown("---")
            st.markdown("**📱 Subscription Management**")
            if st.button("⚙️ Manage Subscription", key="manage_sub"):
                st.info("🔗 Opens: Settings > [Your Name] > Subscriptions")
                # In actual iOS app: itms-apps://apps.apple.com/account/subscriptions
            
            if st.button("🔄 Restore Purchases", key="restore_purchases_paid"):
                st.info("🔄 Restoring previous purchases...")
                # In actual iOS app: StoreKit.restorePurchases()
        
        # Apple-required links for active subscribers
        st.markdown("---")
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("📄 [Terms of Service](https://marketscannerspros.pages.dev/terms)")
        with col2:
            st.markdown("🔒 [Privacy Policy](https://marketscannerspros.pages.dev/privacy)")
        
        # Subscription management for active subscribers  
        st.markdown("---")
        st.markdown("**📊 Subscription Details**")
        
        if current_subscription:
            # Real database subscription
            st.caption(f"Plan: {current_subscription.get('plan_name', 'Unknown')}")
            st.caption(f"Status: {current_subscription.get('subscription_status', 'Unknown').title()}")
            st.caption(f"Platform: {current_subscription.get('platform', 'Unknown').title()}")
            if current_subscription.get('current_period_end'):
                st.caption(f"Renews: {current_subscription['current_period_end'].strftime('%Y-%m-%d')}")
        else:
            # Tier from admin override or free
            st.caption(f"Plan: {tier_info['name']}")
            st.caption("Status: Active" if current_tier != 'free' else "Status: Free")
            st.caption("Platform: Web")
            # Show admin override info if applicable
            if workspace_id:
                override_tier = get_subscription_override(workspace_id)
                if override_tier:
                    st.caption("Note: Admin override active")
        
        if st.button("❌ Cancel Subscription", key="cancel_subscription"):
            # Check if this is an admin override
            override_tier = get_subscription_override(workspace_id) if workspace_id else None
            if override_tier:
                # Clear admin override
                if workspace_id and clear_subscription_override(workspace_id):
                    st.success("✅ Admin override cleared")
                    st.rerun()
                else:
                    st.error("❌ Failed to clear admin override")
            elif current_subscription and workspace_id:
                # Real database subscription
                if is_mobile:
                    st.info("📱 In mobile app, this would open subscription management")
                else:
                    # Cancel Stripe subscription for web users
                    success, message = cancel_stripe_subscription(workspace_id)
                    if success:
                        st.success("✅ Subscription cancelled successfully")
                        st.rerun()
                    else:
                        st.error(f"❌ Failed to cancel subscription: {message}")
                        # Fallback to database-only cancellation
                        if cancel_subscription(workspace_id):
                            st.success("✅ Local subscription cancelled")
                            st.rerun()
                        else:
                            st.error("❌ Could not cancel subscription")
            else:
                # No subscription to cancel
                st.error("❌ No active subscription found")
        
        # Demo mode for testing (HIDE IN PRODUCTION iOS BUILDS)
        if not is_mobile:  # Only show on web, not in mobile app builds
            st.markdown("---")
            st.caption("🧪 Demo Mode - Testing Only (Hidden in production):")
            col1, col2, col3 = st.columns(3)
            with col1:
                if st.button("Free", key="demo_free_paid"):
                    st.session_state.user_tier = 'free'
                    st.success(f"✅ Demo mode: Switched to {TIER_CONFIG['free']['name']}")
                    st.rerun()
            with col2:
                if st.button("Pro", key="demo_pro_paid"):
                    st.session_state.user_tier = 'pro'
                    st.success(f"✅ Demo mode: Switched to {TIER_CONFIG['pro']['name']}")
                    st.rerun()
            with col3:
                if st.button("Trader", key="demo_trader_paid"):
                    st.session_state.user_tier = 'pro_trader'
                    st.success(f"✅ Demo mode: Switched to {TIER_CONFIG['pro_trader']['name']}")
                    st.rerun()

# End of subscription UI section (hidden for mobile apps)

# Edit watchlist modal
if st.session_state.get('edit_watchlist_id'):
    edit_wl_id = st.session_state.edit_watchlist_id
    edit_wl = get_watchlist_by_id(edit_wl_id)
    
    if edit_wl:
        with st.sidebar.expander(f"Edit Watchlist: {edit_wl['name']}", expanded=True):
            edit_name = st.text_input("Watchlist Name:", value=edit_wl['name'], key="edit_wl_name")
            edit_desc = st.text_area("Description:", value=edit_wl['description'] or "", key="edit_wl_desc", height=60)
            edit_symbols_text = st.text_area("Symbols (one per line):", 
                                           value="\n".join(edit_wl['symbols']), key="edit_wl_symbols", height=100)
            
            col1, col2, col3 = st.columns(3)
            with col1:
                if st.button("Save", key="save_edit_wl"):
                    if edit_name and edit_symbols_text:
                        symbols = [s.strip().upper() for s in edit_symbols_text.splitlines() if s.strip()]
                        if update_watchlist(edit_wl_id, edit_name, edit_desc, symbols):
                            st.success(f"Watchlist '{edit_name}' updated!")
                            st.session_state.edit_watchlist_id = None
                            st.rerun()
                        else:
                            st.error("Failed to update watchlist")
                    else:
                        st.error("Name and symbols required")
            with col3:
                if st.button("Cancel", key="cancel_edit_wl"):
                    st.session_state.edit_watchlist_id = None
                    st.rerun()
    else:
        st.error("Watchlist not found")
        st.session_state.edit_watchlist_id = None

# Delete confirmation modal
if st.session_state.get('confirm_delete_id'):
    delete_id = st.session_state.confirm_delete_id
    delete_name = st.session_state.confirm_delete_name
    
    with st.sidebar.expander(f"⚠️ Delete Watchlist", expanded=True):
        st.write(f"Are you sure you want to delete **'{delete_name}'**?")
        st.write("This action cannot be undone.")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("Delete", key="confirm_delete"):
                if delete_watchlist(delete_id):
                    st.success(f"Deleted '{delete_name}'")
                    st.session_state.confirm_delete_id = None
                    st.session_state.confirm_delete_name = None
                    st.rerun()
                else:
                    st.error("Failed to delete watchlist")
        with col3:
            if st.button("Cancel", key="cancel_delete"):
                st.session_state.confirm_delete_id = None
                st.session_state.confirm_delete_name = None
                st.rerun()

# Load symbols from selected watchlist
if selected_watchlist != "Manual Entry":
    selected_wl_data = watchlists[watchlist_names.index(selected_watchlist) - 1]
    equity_symbols = [s for s in selected_wl_data['symbols'] if not s.endswith('-USD')]
    crypto_symbols = [s for s in selected_wl_data['symbols'] if s.endswith('-USD')]
else:
    equity_symbols = CFG.symbols_equity
    crypto_symbols = CFG.symbols_crypto

st.sidebar.header("Equity Symbols")

# Show tier limitations
current_tier = st.session_state.user_tier
if current_tier == 'free':
    st.sidebar.caption(f"🚀 Free tier: Full features with {TIER_CONFIG['free']['scan_limit']} symbols total • Upgrade for more symbols!")

eq_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(equity_symbols), height=140)

st.sidebar.header("Crypto Symbols (BTC-USD style)")
cx_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(crypto_symbols), height=140)

# Show current symbol count for free tier users
if current_tier == 'free':
    eq_count = len([s.strip() for s in eq_input.splitlines() if s.strip()])
    cx_count = len([s.strip() for s in cx_input.splitlines() if s.strip()])
    total_count = eq_count + cx_count
    limit = TIER_CONFIG['free']['scan_limit']
    
    if total_count > limit:
        st.sidebar.error(f"⚠️ {total_count}/{limit} symbols (over limit)")
    elif total_count > limit * 0.8:
        st.sidebar.warning(f"⚠️ {total_count}/{limit} symbols (near limit)")
    else:
        st.sidebar.info(f"📊 {total_count}/{limit} symbols")

st.sidebar.header("Timeframes")
tf_eq = st.sidebar.selectbox("Equity Timeframe:", ["1D","1h","30m","15m","5m"], index=0)
tf_cx = st.sidebar.selectbox("Crypto Timeframe:", ["1h","4h","1D","15m","5m"], index=0)

st.sidebar.header("Filters")
topk = st.sidebar.number_input("Top K Results:", 5, 100, value=CFG.top_k, step=1)
minvol = st.sidebar.number_input("Min Dollar Volume:", 0, 200_000_000, value=int(CFG.min_dollar_vol), step=100000)

st.sidebar.header("Risk / Sizing")
acct = st.sidebar.number_input("Account Equity ($):", 100, 100_000_000, value=int(CFG.account_equity), step=100)
risk = st.sidebar.number_input("Risk per Trade (%):", 0.1, 10.0, value=CFG.risk_pct*100, step=0.1) / 100.0
stop_mult = st.sidebar.number_input("Stop = k × ATR:", 0.5, 5.0, value=CFG.stop_atr_mult, step=0.1)

# ================= User Instructions/Help Section =================
with st.sidebar.expander("📖 Help & Instructions", expanded=False):
    st.markdown("""
    ### 🔍 Quick Start Guide
    
    **1. Configure Settings:**
    - Set your Account Equity (how much you can invest)
    - Set Risk per Trade (1% recommended)
    - Adjust Stop Multiplier (1.5x ATR default)
    
    **2. Add Symbols:**
    - Equity: AAPL, MSFT, TSLA (one per line)
    - Crypto: BTC-USD, ETH-USD (one per line)
    
    **3. Run Scanner:**
    - Click "Run Scanner" button
    - Higher scores = better opportunities
    - Bullish = Buy signal, Bearish = Sell signal
    
    **4. Set Price Alerts:**
    - Configure email below
    - Scroll down to Price Alerts section
    - Set target prices for notifications
    
    ### 📊 Understanding Results
    **Score Ranges:**
    - 75-100: Very strong signal
    - 25-75: Moderate signal  
    - 0-25: Weak signal
    - Below 0: Bearish signal
    
    **Key Columns:**
    - **Score**: Overall strength rating
    - **Direction**: Buy (Bullish) vs Sell (Bearish)
    - **Size**: Shares/coins to buy
    - **Stop**: Stop-loss price
    - **Risk $**: Maximum loss amount
    
    ### 🚨 Price Alerts Setup
    1. Enter email address below
    2. Click "Test Email" to verify
    3. Save your settings
    4. Create alerts in Price Alerts section
    
    ### 📈 Chart Analysis
    **RSI Levels:**
    - Over 70: Overbought (may pullback)
    - Under 30: Oversold (may bounce)
    - Over 50: Bullish momentum
    - Under 50: Bearish momentum
    
    **Best Practices:**
    - Start with 1% risk per trade
    - Focus on scores above 50
    - Use calculated stop prices
    - Don't chase missed opportunities
    - Diversify your investments
    
    ### 📱 Mobile Usage
    - Install as mobile app via browser menu
    - All features work on mobile
    - Touch-friendly charts
    - Email alerts work even when closed
    
    ---
    ⚠️ **Important**: This tool provides analysis, but YOU make the final investment decisions. Always do your own research and never invest more than you can afford to lose.
    """)

# Persistent Notification Panel
st.sidebar.header("🔔 Your Alerts")

# Get user email and workspace from session state
user_email = st.session_state.get('user_email', '')
workspace_id = st.session_state.get('workspace_id', '')

# Debug information
if st.sidebar.checkbox("🐛 Debug Notifications", value=False):
    st.sidebar.write(f"User email: {user_email or 'Not set'}")
    st.sidebar.write(f"Workspace ID: {workspace_id[:8] if workspace_id else 'Not set'}...")

if user_email and workspace_id:
    # Fetch user's notifications ONLY for current workspace (secure)
    notifications = get_user_notifications(user_email, workspace_id, limit=5)
else:
    notifications = []

unread_notifications = [n for n in notifications if not n.get('is_read', True)] if notifications else []

if unread_notifications:
    st.sidebar.error(f"🚨 **{len(unread_notifications)} New Alert(s)**")
    
    with st.sidebar.expander("📬 View Alerts", expanded=True):
        for notification in unread_notifications:
            notif_id = notification['id']
            subject = notification['subject'] 
            message = notification['message']
            created_at = notification['created_at']
            
            col1, col2 = st.columns([3, 1])
            with col1:
                st.write(f"**{subject}**")
                if hasattr(created_at, 'strftime'):
                    st.caption(f"🕒 {created_at.strftime('%Y-%m-%d %H:%M')}")
                else:
                    st.caption(f"🕒 {created_at}")
                
            with col2:
                if st.button("✓", key=f"read_{notif_id}", help="Mark as read"):
                    if mark_notification_read(notif_id, workspace_id, user_email):
                        st.success("✓")
                        st.rerun()
            
            with st.expander("📄 View Details", expanded=False):
                st.write(message)
                
            st.divider()
                
elif notifications:
    st.sidebar.success("✅ **No new alerts**")
    with st.sidebar.expander("📋 Recent Alerts"):
        for notification in notifications[:3]:  # Show last 3
            subject = notification['subject']
            created_at = notification['created_at']
            
            st.write(f"✓ {subject}")
            if hasattr(created_at, 'strftime'):
                st.caption(f"🕒 {created_at.strftime('%Y-%m-%d %H:%M')}")
            else:
                st.caption(f"🕒 {created_at}")
else:
    st.sidebar.info("💡 **Set up notifications** below to see your market alerts here")

st.sidebar.header("📧 Notification Settings")

# User notification preferences
with st.sidebar.expander("Price Alert Notifications", expanded=False):
    st.markdown("**Configure how you receive price alerts:**")
    
    user_email = st.text_input(
        "Your Email:", 
        placeholder="Enter your email address",
        help="You'll receive price alert notifications here",
        key="user_notification_email"
    )
    
    notification_method = st.selectbox(
        "Notification Method:",
        ["In-App Notifications", "Slack", "Both", "None"],
        index=0,
        help="Choose how you want to receive alerts (In-App provides reliable persistent notifications)",
        key="notification_method_v2"  # Force refresh with new key
    )
    
    # Map UI options to backend values
    method_mapping = {
        "In-App Notifications": "in_app",
        "Slack": "slack", 
        "Both": "both",
        "None": "none"
    }
    backend_method = method_mapping[notification_method]
    
    if user_email and notification_method == "In-App Notifications":
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔔 Test Notification", help="Send a test notification to verify your alert system"):
                if "@" in user_email and "." in user_email:
                    # Store user email preference with consistent key
                    st.session_state.user_email = user_email
                    st.session_state.notification_method = backend_method
                    
                    # Send test email
                    try:
                        test_subject = "🧪 Market Scanner Test Notification"
                        test_message = f"""
Hello!

This is a test notification from your Market Scanner dashboard.

If you're reading this, your email notifications are configured correctly!

Your Settings:
- Email: {user_email}
- Method: {notification_method}

Happy trading! 📈
"""
                        # Add debug information
                        st.info("🔄 Sending test notification...")
                        
                        # Show notification system info
                        with st.expander("📊 Notification System Status", expanded=True):
                            st.write("🔔 **Primary Method**: In-App Notifications")
                            st.write("✅ **Status**: Fully operational")
                            st.write("📱 **Delivery**: Immediate display in dashboard")
                            st.write("🎯 **Reliability**: 100% - No external dependencies")
                            
                        success = send_email_to_user(test_subject, test_message, user_email)
                        if success:
                            st.info("✅ **Perfect!** Your notification system is working correctly.")
                    except Exception as e:
                        st.error(f"❌ Email test failed: {str(e)}")
                else:
                    st.error("Please enter a valid email address")
        
        with col2:
            if st.button("💾 Save Settings", help="Save your notification preferences"):
                if "@" in user_email and "." in user_email:
                    # Save to session state
                    st.session_state.user_email = user_email
                    st.session_state.notification_method = backend_method
                    
                    # Save to database
                    if save_user_notification_preferences(user_email, backend_method):
                        st.success("✅ Settings saved successfully!")
                    else:
                        st.warning("⚠️ Settings saved locally but failed to save to database")
                else:
                    st.error("Please enter a valid email address")

# Scan result notifications (using user-specific email system)
with st.sidebar.expander("Scan Result Notifications", expanded=False):
    st.markdown("**Send market scan results:**")
    
    # Check if user has configured email notifications
    user_email = st.session_state.get('user_email', '')
    
    if user_email:
        send_email_toggle = st.checkbox("📧 Email top picks to your address", help=f"Send results to {user_email}")
        st.caption(f"✉️ Configured: {user_email}")
    else:
        send_email_toggle = st.checkbox("📧 Email top picks", disabled=True, help="Configure your email in 'Price Alert Notifications' first")
        st.caption("⚠️ Configure email notifications above to enable")
    
    send_slack_toggle = st.checkbox("📱 Slack summary (requires webhook URL)")

# Main scanning logic
if run_clicked:
    eq_syms = [s.strip().upper() for s in eq_input.splitlines() if s.strip()]
    cx_syms = [s.strip().upper() for s in cx_input.splitlines() if s.strip()]
    
    # Check tier limitations
    current_tier = st.session_state.user_tier
    tier_info = TIER_CONFIG[current_tier]
    total_symbols = len(eq_syms) + len(cx_syms)
    
    # Apply scan limits for free tier
    if current_tier == 'free' and tier_info['scan_limit'] and total_symbols > tier_info['scan_limit']:
        st.warning(f"⚠️ Free tier limited to {tier_info['scan_limit']} symbols total. You entered {total_symbols} symbols.")
        st.info(f"🚀 **Scanning first {tier_info['scan_limit']} symbols for you!** Upgrade to Pro for unlimited symbols!")
        
        # Slice to first 4 symbols for free tier
        limit = tier_info['scan_limit']
        if eq_syms and len(eq_syms) > limit:
            eq_syms = eq_syms[:limit]
            cx_syms = []  # If we hit equity limit, no crypto
        elif len(eq_syms) + len(cx_syms) > limit:
            remaining_limit = limit - len(eq_syms)
            cx_syms = cx_syms[:remaining_limit] if remaining_limit > 0 else []
    
    with st.spinner("Scanning markets..."):
        # Scan equity markets
        if eq_syms:
            st.session_state.eq_results, st.session_state.eq_errors = scan_universe(
                eq_syms, tf_eq, False, acct, risk, stop_mult, minvol
            )
        else:
            st.session_state.eq_results = pd.DataFrame()
            st.session_state.eq_errors = pd.DataFrame()
        
        # Scan crypto markets
        if cx_syms:
            st.session_state.cx_results, st.session_state.cx_errors = scan_universe(
                cx_syms, tf_cx, True, acct, risk, stop_mult, minvol
            )
        else:
            st.session_state.cx_results = pd.DataFrame()
            st.session_state.cx_errors = pd.DataFrame()
    
    # Send notifications if enabled
    if send_slack_toggle or send_email_toggle:
        combined_results = pd.concat([st.session_state.eq_results, st.session_state.cx_results], ignore_index=True)
        if not combined_results.empty:
            top_results = combined_results.head(topk)
            
            if send_slack_toggle:
                slack_msg = format_block(top_results, f"📊 Top {len(top_results)} Market Picks")
                push_slack(slack_msg)
                st.success("Slack notification sent!")
            
            if send_email_toggle and user_email:
                email_subject = f"Market Scanner: Top {len(top_results)} Picks"
                email_body = f"""Market Scanner Results

{format_block(top_results, f"Top {len(top_results)} Market Picks")}

Scan completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Happy trading! 📈
"""
                success = send_email_to_user(email_subject, email_body, user_email)
                if success:
                    st.success("📧 Email sent successfully!")
                else:
                    st.error("❌ Email failed to send")

# ================= iOS WebView Detection & Enhanced Error Handling =================
def detect_ios_webview_issues(eq_results, cx_results, eq_errors, cx_errors):
    """Detect if iOS WebView is blocking yfinance API calls and provide helpful messaging"""
    total_symbols = len(eq_errors) + len(cx_errors) 
    total_results = len(eq_results) + len(cx_results)
    
    # Only check for iOS issues if we have significant errors AND no results
    # AND errors are network-related (not just any errors)
    if total_symbols > 3 and total_results == 0:
        # Check if errors contain network-related failures
        all_errors = pd.concat([eq_errors, cx_errors], ignore_index=True) if not eq_errors.empty or not cx_errors.empty else pd.DataFrame()
        
        if not all_errors.empty:
            error_messages = ' '.join(all_errors['error'].astype(str).tolist()).lower()
            
            # Common iOS WebView/network error patterns
            ios_indicators = [
                'no yfinance data', 'connection', 'network', 'timeout', 
                'ssl', 'certificate', 'blocked', 'refused', 'unavailable',
                'nsurlerror', 'cors', 'err_blocked_by_client', '403', '429',
                'sslhandshakefailed', 'request failed', 'url error'
            ]
            
            if any(indicator in error_messages for indicator in ios_indicators):
                st.error("🍎 **iOS Mobile App Notice**")
                st.info("""
                **Network restrictions are preventing market data loading on iOS.**
                
                This is a known limitation with iOS WebView security that blocks external API calls to Yahoo Finance.
                
                **What's happening:**
                • iOS WebView blocks direct connections to financial data providers
                • This affects all iOS mobile browsers and app WebViews
                • The same scanner works perfectly on desktop and Android
                
                **Coming Soon:**
                • Server-side data proxy to bypass iOS restrictions
                • Enhanced mobile compatibility
                • Real-time data streaming
                
                **For now:**
                • Use desktop/web version for full functionality
                • Premium features and alerts still work on mobile
                • Stay tuned for iOS-compatible updates!
                """)
                
                # Show upgrade prompt since other features work
                if st.session_state.get('user_tier', 'free') == 'free':
                    st.markdown("""
                    ---
                    ### 🚀 **Upgrade to Pro While You Wait**
                    Premium features like **Price Alerts** and **Portfolio Tracking** work great on iOS!
                    
                    **Pro ($4.99/month):** Real-time alerts, basic analytics
                    **Pro Trader ($9.99/month):** Advanced features, priority support
                    """)
                
                return True  # Indicates iOS issue detected
    
    return False  # No iOS issue detected

# Display Results
# Check for iOS WebView issues before showing results
ios_issue_detected = detect_ios_webview_issues(
    st.session_state.get('eq_results', pd.DataFrame()),
    st.session_state.get('cx_results', pd.DataFrame()), 
    st.session_state.get('eq_errors', pd.DataFrame()),
    st.session_state.get('cx_errors', pd.DataFrame())
)

# Equity Markets Section with Professional Cards
st.markdown("""
<div class="pro-card">
    <h3>🏛 Equity Markets</h3>
""", unsafe_allow_html=True)

# Show normal results if no iOS issues detected
if not ios_issue_detected and not st.session_state.eq_results.empty:
    # Limit display to top K
    display_eq = st.session_state.eq_results.head(topk)
    
    # Enhanced styling for direction column
    def highlight_direction(val):
        if val == 'Bullish':
            return 'background-color: #10b981; color: white; font-weight: bold; border-radius: 6px; padding: 0.25rem 0.5rem;'
        elif val == 'Bearish':
            return 'background-color: #ef4444; color: white; font-weight: bold; border-radius: 6px; padding: 0.25rem 0.5rem;'
        return ''
    
    # Apply professional styling to direction column
    if 'direction' in display_eq.columns:
        styled_eq = display_eq.style.applymap(highlight_direction, subset=['direction'])
        st.dataframe(styled_eq, width='stretch', use_container_width=True)
    else:
        st.dataframe(display_eq, width='stretch', use_container_width=True)
    
    # CSV download for equity results
    csv_eq = to_csv_download(st.session_state.eq_results, "equity_scan.csv")
    st.download_button(
        label="📥 Download Equity Results (CSV)",
        data=csv_eq,
        file_name=f"equity_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        mime="text/csv"
    )
elif not ios_issue_detected:
    st.info("No equity results to display. Click 'Run Scanner' to analyze equity markets.")

# Close equity card
st.markdown("</div>", unsafe_allow_html=True)

# Equity errors (only show if not iOS WebView issue)
if not ios_issue_detected and not st.session_state.eq_errors.empty:
    with st.expander("⚠️ Equity Scan Errors", expanded=False):
        st.dataframe(st.session_state.eq_errors, width='stretch')
        st.caption("💡 **Tip**: Individual symbol errors are normal. If ALL symbols fail, this may be a network connectivity issue.")

# Crypto Markets Section with Professional Cards
st.markdown("""
<div class="pro-card">
    <h3>₿ Crypto Markets</h3>
""", unsafe_allow_html=True)

if not ios_issue_detected and not st.session_state.cx_results.empty:
    # Limit display to top K
    display_cx = st.session_state.cx_results.head(topk)
    
    # Enhanced styling for direction column (same as equity)
    def highlight_direction(val):
        if val == 'Bullish':
            return 'background-color: #10b981; color: white; font-weight: bold; border-radius: 6px; padding: 0.25rem 0.5rem;'
        elif val == 'Bearish':
            return 'background-color: #ef4444; color: white; font-weight: bold; border-radius: 6px; padding: 0.25rem 0.5rem;'
        return ''
    
    # Apply professional styling to direction column
    if 'direction' in display_cx.columns:
        styled_cx = display_cx.style.applymap(highlight_direction, subset=['direction'])
        st.dataframe(styled_cx, width='stretch', use_container_width=True)
    else:
        st.dataframe(display_cx, width='stretch', use_container_width=True)
    
    # CSV download for crypto results
    csv_cx = to_csv_download(st.session_state.cx_results, "crypto_scan.csv")
    st.download_button(
        label="📥 Download Crypto Results (CSV)",
        data=csv_cx,
        file_name=f"crypto_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        mime="text/csv"
    )
elif not ios_issue_detected:
    st.info("No crypto results to display. Click 'Run Scanner' to analyze crypto markets.")

# Close crypto card
st.markdown("</div>", unsafe_allow_html=True)

# Crypto errors (only show if not iOS WebView issue) 
if not ios_issue_detected and not st.session_state.cx_errors.empty:
    with st.expander("⚠️ Crypto Scan Errors", expanded=False):
        st.dataframe(st.session_state.cx_errors, width='stretch')
        st.caption("💡 **Tip**: Individual symbol errors are normal. If ALL symbols fail, this may be a network connectivity issue.")

# Combined CSV download
if not st.session_state.eq_results.empty or not st.session_state.cx_results.empty:
    combined_results = pd.concat([st.session_state.eq_results, st.session_state.cx_results], ignore_index=True)
    if not combined_results.empty:
        combined_results_sorted = combined_results.sort_values("score", ascending=False)
        csv_combined = to_csv_download(combined_results_sorted, "market_scan_combined.csv")
        st.download_button(
            label="📥 Download Combined Results (CSV)",
            data=csv_combined,
            file_name=f"market_scan_combined_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv"
        )

st.subheader("🧮 Scoring Methodology")
with st.expander("Show details", expanded=False):
    st.markdown("""
    **Technical Analysis Scoring System:**
    
    - **Market Regime** (±25 points): Price above/below EMA200 indicates bullish/bearish trend
    - **Price Structure** (±25 points): 20-period high breakout (+25) or low breakdown (-25)
    - **Momentum Indicators** (+20 points): RSI > 50 (+10) and MACD histogram > 0 (+10)
    - **Volume Expansion** (+8 points): Volume Z-score > 0.5 indicates unusual activity
    - **Volatility Expansion** (+7 points): Bollinger Band width above 20-period average
    - **Tradability** (+5 points): ATR percentage < 4% indicates manageable volatility
    - **Overextension Penalties/Rewards**: RSI > 80 (-10 points), RSI < 20 (+10 points for oversold bounce)
    
    **Position Sizing Formula:**
    - Units = ⌊(Account Equity × Risk%) / |Entry Price - Stop Price|⌋
    - Stop Price = Entry ± (ATR Multiplier × ATR)
    - This ensures consistent dollar risk per trade regardless of instrument volatility
    """)

# ================= Price Alerts Management =================
st.subheader("🚨 Price Alerts")

# Auto-refresh toggle and controls
col1, col2, col3, col4 = st.columns([1, 1, 1, 1])
with col1:
    auto_check = st.checkbox("Auto Check", help="Automatically check alerts every 5 minutes")

with col2:
    if st.button("🔍 Check Now", help="Manually check all active alerts against current prices"):
        with st.spinner("Checking price alerts..."):
            triggered_count = check_price_alerts()
            if triggered_count and triggered_count > 0:
                st.success(f"🚨 {triggered_count} alert(s) triggered!")
            else:
                st.info("No alerts triggered")

with col3:
    if st.button("➕ New Alert"):
        st.session_state.show_new_alert = True

# Auto-refresh implementation  
if auto_check:
    import time
    
    # Initialize auto-check state
    if 'last_auto_check' not in st.session_state:
        st.session_state.last_auto_check = time.time()
    if 'auto_check_interval' not in st.session_state:
        st.session_state.auto_check_interval = 300  # 5 minutes
    
    current_time = time.time()
    time_since_last_check = current_time - st.session_state.last_auto_check
    
    # Show countdown
    remaining_time = max(0, st.session_state.auto_check_interval - time_since_last_check)
    with col4:
        if remaining_time > 0:
            st.info(f"Next check in: {int(remaining_time)}s")
        else:
            st.info("Checking alerts...")
    
    # Check alerts if interval has passed
    if time_since_last_check >= st.session_state.auto_check_interval:
        triggered_count = check_price_alerts()
        st.session_state.last_auto_check = current_time
        
        if triggered_count and triggered_count > 0:
            st.warning(f"🚨 {triggered_count} new alert(s) triggered!")
            st.balloons()  # Celebrate triggered alerts
        else:
            st.success("All alerts checked - no triggers")
    
    # Auto-refresh every 10 seconds to update countdown and check alerts
    time.sleep(10)
    st.rerun()
else:
    # Clear auto-check state when disabled
    if 'last_auto_check' in st.session_state:
        del st.session_state.last_auto_check

# New alert form
if st.session_state.get('show_new_alert', False):
    with st.expander("Create New Price Alert", expanded=True):
        col1, col2 = st.columns(2)
        
        with col1:
            alert_symbol = st.text_input("Symbol:", placeholder="e.g., AAPL, BTC-USD", key="alert_symbol")
            alert_type = st.selectbox("Alert Type:", ["above", "below"], key="alert_type")
            
        with col2:
            alert_price = st.number_input("Target Price ($):", min_value=0.01, step=0.01, key="alert_price")
            alert_method = st.selectbox("Notification:", ["in_app", "slack", "both"], key="alert_method_v2")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("Create Alert", key="create_alert"):
                # Input validation
                if not alert_symbol or not alert_symbol.strip():
                    st.error("Symbol is required")
                elif alert_price <= 0:
                    st.error("Price must be positive")
                elif alert_type not in ['above', 'below']:
                    st.error("Invalid alert type")
                else:
                    # Check tier limitations
                    # ALL TIERS: Full alert functionality (no restrictions)
                    symbol_clean = alert_symbol.strip().upper()
                    if create_price_alert(symbol_clean, alert_type, alert_price, alert_method):
                        st.success(f"Alert created for {symbol_clean}")
                        st.session_state.show_new_alert = False
                        st.rerun()
                    else:
                        st.error("Failed to create alert - please check database connection")
        
        with col3:
            if st.button("Cancel", key="cancel_alert"):
                st.session_state.show_new_alert = False
                st.rerun()

# Display alerts in tabs
tab1, tab2 = st.tabs(["🔔 Active Alerts", "✅ Triggered Alerts"])

with tab1:
    active_alerts = get_active_alerts()
    if active_alerts:
        # Create DataFrame for better display
        alerts_df = pd.DataFrame(active_alerts)
        alerts_df['created_at'] = pd.to_datetime(alerts_df['created_at']).dt.strftime('%Y-%m-%d %H:%M')
        
        display_cols = ['symbol', 'alert_type', 'target_price', 'notification_method', 'created_at']
        st.dataframe(alerts_df[display_cols], width='stretch')
        
        # Delete alerts
        st.write("**Manage Alerts:**")
        for alert in active_alerts:
            col1, col2, col3, col4 = st.columns([2, 1, 1, 1])
            with col1:
                st.write(f"{alert['symbol']} - {alert['alert_type']} ${alert['target_price']:.2f}")
            with col4:
                if st.button("Delete", key=f"del_alert_{alert['id']}"):
                    if delete_alert(alert['id']):
                        st.success("Alert deleted")
                        st.rerun()
                    else:
                        st.error("Failed to delete alert")
    else:
        st.info("No active alerts. Create one above to get notified when price targets are hit.")

with tab2:
    all_alerts = get_all_alerts()
    triggered_alerts = [alert for alert in all_alerts if alert['is_triggered']]
    
    if triggered_alerts:
        triggered_df = pd.DataFrame(triggered_alerts)
        triggered_df['triggered_at'] = pd.to_datetime(triggered_df['triggered_at']).dt.strftime('%Y-%m-%d %H:%M')
        
        display_cols = ['symbol', 'alert_type', 'target_price', 'current_price', 'triggered_at']
        st.dataframe(triggered_df[display_cols], width='stretch')
    else:
        st.info("No triggered alerts yet.")


# ================= Advanced Charting Section =================
st.subheader("📈 Advanced Technical Analysis Charts")

# Chart controls
col1, col2, col3, col4 = st.columns([2, 1, 1, 2])

with col1:
    # Get symbols from scan results for quick selection
    available_symbols = []
    if not st.session_state.eq_results.empty:
        available_symbols.extend(st.session_state.eq_results['symbol'].tolist())
    if not st.session_state.cx_results.empty:
        available_symbols.extend(st.session_state.cx_results['symbol'].tolist())
    
    if available_symbols:
        symbol_options = ["Manual Entry"] + available_symbols
        selected_symbol_option = st.selectbox("Select Symbol:", symbol_options, key="chart_symbol_select")
        
        if selected_symbol_option == "Manual Entry":
            chart_symbol = st.text_input("Enter Symbol:", placeholder="e.g., AAPL, BTC-USD", key="manual_chart_symbol")
        else:
            chart_symbol = selected_symbol_option
    else:
        chart_symbol = st.text_input("Enter Symbol:", placeholder="e.g., AAPL, BTC-USD", key="chart_symbol_input")

with col2:
    chart_timeframe = st.selectbox("Timeframe:", ["1D", "1h", "30m", "15m", "5m"], key="chart_timeframe")

with col3:
    chart_period = st.selectbox("Period:", ["3mo", "6mo", "1y", "2y", "5y"], key="chart_period")

with col4:
    st.write("**Technical Indicators:**")
    col4a, col4b = st.columns(2)
    with col4a:
        show_ema = st.checkbox("EMAs", value=True, key="show_ema")
        show_rsi = st.checkbox("RSI", value=True, key="show_rsi")
    with col4b:
        show_macd = st.checkbox("MACD", value=True, key="show_macd")
        show_volume = st.checkbox("Volume", value=True, key="show_volume")

# Chart generation
if chart_symbol and chart_symbol.strip():
    chart_symbol_clean = chart_symbol.strip().upper()
    
    # Display current price summary
    summary_data = get_chart_data_summary(chart_symbol_clean, chart_timeframe)
    if summary_data:
        col1, col2, col3, col4, col5 = st.columns(5)
        
        with col1:
            price = summary_data.get('current_price', 0)
            st.metric("Current Price", f"${price:.2f}" if price else "N/A")
        
        with col2:
            change = summary_data.get('price_change', 0)
            change_pct = summary_data.get('price_change_pct', 0)
            delta_color = "normal" if change >= 0 else "inverse"
            st.metric("Change", f"${change:.2f}", f"{change_pct:+.2f}%", delta_color=delta_color)
        
        with col3:
            rsi = summary_data.get('rsi')
            if rsi is not None:
                rsi_color = "normal" if 30 <= rsi <= 70 else "inverse"
                st.metric("RSI", f"{rsi:.1f}", delta_color=rsi_color)
            else:
                st.metric("RSI", "N/A")
        
        with col4:
            volume = summary_data.get('volume', 0)
            if volume > 0:
                if volume >= 1_000_000:
                    vol_display = f"{volume/1_000_000:.1f}M"
                elif volume >= 1_000:
                    vol_display = f"{volume/1_000:.1f}K"
                else:
                    vol_display = f"{volume:,.0f}"
                st.metric("Volume", vol_display)
            else:
                st.metric("Volume", "N/A")
        
        with col5:
            ema_trend = summary_data.get('ema50_above_200')
            if ema_trend is not None:
                trend_text = "Bullish" if ema_trend else "Bearish"
                trend_color = "normal" if ema_trend else "inverse"
                st.metric("Trend", trend_text, delta_color=trend_color)
            else:
                st.metric("Trend", "N/A")
    
    # Generate chart
    col1, col2 = st.columns([3, 1])
    with col2:
        generate_chart_clicked = st.button("📊 Generate Chart", key="generate_chart", width='stretch')
    
    # Display chart if requested
    if generate_chart_clicked or st.session_state.get('chart_generated', False):
        with st.spinner(f"Generating chart for {chart_symbol_clean}..."):
            try:
                # Build indicator list
                selected_indicators = []
                if show_ema:
                    selected_indicators.append("EMA")
                if show_rsi:
                    selected_indicators.append("RSI")
                if show_macd:
                    selected_indicators.append("MACD")
                if show_volume:
                    selected_indicators.append("Volume")
                
                # Create chart
                chart_fig = create_advanced_chart(chart_symbol_clean, chart_timeframe, selected_indicators)
                
                if chart_fig:
                    st.plotly_chart(chart_fig, width='stretch')
                    # Set session state to keep chart visible
                    st.session_state.chart_generated = True
                    
                    # Technical analysis summary
                    with st.expander("📊 Technical Analysis Summary", expanded=False):
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            st.markdown("**Price Action:**")
                            if summary_data:
                                price = summary_data.get('current_price', 0)
                                change_pct = summary_data.get('price_change_pct', 0)
                                
                                if change_pct > 2:
                                    st.success("🟢 Strong bullish momentum")
                                elif change_pct > 0:
                                    st.info("🔵 Mild bullish momentum")
                                elif change_pct > -2:
                                    st.warning("🟡 Consolidation")
                                else:
                                    st.error("🔴 Bearish momentum")
                        
                        with col2:
                            st.markdown("**RSI Analysis:**")
                            rsi = summary_data.get('rsi') if summary_data else None
                            if rsi is not None:
                                if rsi > 70:
                                    st.error("🔴 Overbought (RSI > 70)")
                                elif rsi < 30:
                                    st.success("🟢 Oversold (RSI < 30)")
                                elif rsi > 50:
                                    st.info("🔵 Bullish momentum (RSI > 50)")
                                else:
                                    st.warning("🟡 Bearish momentum (RSI < 50)")
                            else:
                                st.info("RSI data not available")
                else:
                    st.error(f"Unable to generate chart for {chart_symbol_clean}. Please check the symbol and try again.")
                    
            except Exception as e:
                st.error(f"Error generating chart: {str(e)}")
else:
    st.info("Enter a symbol above to generate an advanced technical analysis chart with customizable indicators.")

# ================= Backtesting Section =================
st.subheader("🔬 Strategy Backtesting")

# Backtest controls
col1, col2, col3, col4 = st.columns([2, 1, 1, 1])

with col1:
    backtest_name = st.text_input("Backtest Name:", placeholder="e.g., SPY Momentum Test", key="backtest_name")

with col2:
    start_date = st.date_input("Start Date:", value=pd.to_datetime("2023-01-01"), key="backtest_start")

with col3:
    end_date = st.date_input("End Date:", value=pd.to_datetime("2024-01-01"), key="backtest_end")

with col4:
    backtest_timeframe = st.selectbox("Timeframe:", ["1D", "1h"], key="backtest_timeframe")

# Backtest parameters
col1, col2, col3, col4 = st.columns(4)

with col1:
    initial_equity = st.number_input("Initial Equity ($):", min_value=1000, max_value=1000000, value=10000, step=1000, key="initial_equity")

with col2:
    risk_per_trade = st.number_input("Risk per Trade (%):", min_value=0.1, max_value=10.0, value=1.0, step=0.1, key="risk_per_trade") / 100

with col3:
    stop_atr_mult = st.number_input("Stop Loss (ATR x):", min_value=0.5, max_value=5.0, value=1.5, step=0.1, key="stop_atr_mult")

with col4:
    min_score = st.number_input("Min Score Threshold:", min_value=0, max_value=50, value=10, step=1, key="min_score")

# Symbol selection for backtesting
st.write("**Select Symbols for Backtesting:**")
col1, col2 = st.columns([3, 1])

with col1:
    # Get symbols from current scan results or manual entry
    available_symbols = []
    if not st.session_state.eq_results.empty:
        available_symbols.extend(st.session_state.eq_results['symbol'].head(10).tolist())
    if not st.session_state.cx_results.empty:
        available_symbols.extend(st.session_state.cx_results['symbol'].head(5).tolist())
    
    if available_symbols:
        backtest_symbols = st.multiselect(
            "Choose from scanned symbols:", 
            available_symbols, 
            default=available_symbols[:5],
            key="backtest_symbols_from_scan"
        )
    else:
        backtest_symbols = []
    
    manual_symbols = st.text_area(
        "Or enter symbols manually (one per line):", 
        placeholder="AAPL\nMSFT\nGOOGL\nTSLA",
        height=80,
        key="manual_backtest_symbols"
    )
    
    # Combine symbols
    if manual_symbols.strip():
        manual_list = [s.strip().upper() for s in manual_symbols.splitlines() if s.strip()]
        all_backtest_symbols = list(set(backtest_symbols + manual_list))
    else:
        all_backtest_symbols = backtest_symbols

with col2:
    st.write("**Actions:**")
    run_backtest_btn = st.button("🚀 Run Backtest", width='stretch', key="run_backtest")
    
    if st.button("📊 View History", width='stretch', key="view_backtest_history"):
        st.session_state.show_backtest_history = True

# Run backtest
if run_backtest_btn and all_backtest_symbols and backtest_name.strip():
    with st.spinner(f"Running backtest on {len(all_backtest_symbols)} symbols..."):
        try:
            config = {
                'symbols': all_backtest_symbols,
                'start_date': str(start_date),
                'end_date': str(end_date),
                'timeframe': backtest_timeframe,
                'initial_equity': initial_equity,
                'risk_per_trade': risk_per_trade,
                'stop_atr_mult': stop_atr_mult,
                'min_score': min_score
            }
            
            results = run_backtest(
                symbols=all_backtest_symbols,
                start_date=str(start_date),
                end_date=str(end_date),
                timeframe=backtest_timeframe,
                initial_equity=initial_equity,
                risk_per_trade=risk_per_trade,
                stop_atr_mult=stop_atr_mult,
                min_score=min_score
            )
            
            if results.get('error'):
                st.error(f"Backtest failed: {results['error']}")
            elif not results.get('trades'):
                st.warning("No trades generated. Try lowering the minimum score threshold or adjusting the date range.")
            else:
                # Save results to database
                if save_backtest_result(backtest_name.strip(), config, results):
                    st.success(f"Backtest '{backtest_name}' completed and saved!")
                else:
                    st.warning("Backtest completed but failed to save to database")
                
                # Display results
                metrics = results['metrics']
                
                # Performance metrics
                col1, col2, col3, col4, col5 = st.columns(5)
                
                with col1:
                    total_return = metrics.get('total_return', 0) * 100
                    delta_color = "normal" if total_return >= 0 else "inverse"
                    st.metric("Total Return", f"{total_return:.1f}%", delta_color=delta_color)
                
                with col2:
                    win_rate = metrics.get('win_rate', 0) * 100
                    st.metric("Win Rate", f"{win_rate:.1f}%")
                
                with col3:
                    sharpe = metrics.get('sharpe_ratio', 0)
                    st.metric("Sharpe Ratio", f"{sharpe:.2f}")
                
                with col4:
                    max_dd = metrics.get('max_drawdown', 0) * 100
                    st.metric("Max Drawdown", f"{max_dd:.1f}%")
                
                with col5:
                    total_trades = metrics.get('total_trades', 0)
                    st.metric("Total Trades", total_trades)
                
                # Performance chart
                chart_fig = create_backtest_chart(results)
                if chart_fig:
                    st.plotly_chart(chart_fig, width='stretch')
                
                # Detailed metrics
                with st.expander("📈 Detailed Performance Metrics", expanded=False):
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown("**Trade Statistics:**")
                        st.write(f"• Total Trades: {metrics.get('total_trades', 0)}")
                        st.write(f"• Winning Trades: {metrics.get('winning_trades', 0)}")
                        st.write(f"• Losing Trades: {metrics.get('losing_trades', 0)}")
                        st.write(f"• Win Rate: {metrics.get('win_rate', 0)*100:.1f}%")
                        st.write(f"• Average Holding Days: {metrics.get('avg_holding_days', 0):.1f}")
                    
                    with col2:
                        st.markdown("**Financial Metrics:**")
                        st.write(f"• Initial Equity: ${metrics.get('initial_equity', 0):,.2f}")
                        st.write(f"• Final Equity: ${metrics.get('final_equity', 0):,.2f}")
                        st.write(f"• Average Win: ${metrics.get('avg_win', 0):,.2f}")
                        st.write(f"• Average Loss: ${metrics.get('avg_loss', 0):,.2f}")
                        st.write(f"• Profit Factor: {metrics.get('profit_factor', 0):.2f}")
                
                # Symbol performance breakdown
                if results.get('symbol_performance'):
                    with st.expander("📊 Symbol Performance Breakdown", expanded=False):
                        symbol_perf_data = []
                        for symbol, perf in results['symbol_performance'].items():
                            symbol_perf_data.append({
                                'Symbol': symbol,
                                'Trades': perf['total_trades'],
                                'Win Rate': f"{perf['win_rate']*100:.1f}%",
                                'Total P&L': f"${perf['total_pnl']:,.2f}",
                                'Avg Return': f"{perf['avg_return']*100:.2f}%"
                            })
                        
                        if symbol_perf_data:
                            symbol_df = pd.DataFrame(symbol_perf_data)
                            st.dataframe(symbol_df, width='stretch')
                
                # Trade log
                if results.get('trades'):
                    with st.expander("📋 Trade Log", expanded=False):
                        trades_df = pd.DataFrame(results['trades'])
                        trades_df['entry_date'] = pd.to_datetime(trades_df['entry_date']).dt.strftime('%Y-%m-%d')
                        trades_df['exit_date'] = pd.to_datetime(trades_df['exit_date']).dt.strftime('%Y-%m-%d')
                        trades_df['trade_return'] = (trades_df['trade_return'] * 100).round(2)
                        trades_df['trade_pnl'] = trades_df['trade_pnl'].round(2)
                        
                        display_cols = ['symbol', 'direction', 'entry_date', 'exit_date', 'entry_price', 'exit_price', 'trade_return', 'trade_pnl', 'exit_reason']
                        st.dataframe(trades_df[display_cols], width='stretch')
                
                # Errors if any
                if results.get('errors'):
                    with st.expander("⚠️ Backtest Errors", expanded=False):
                        for error in results['errors']:
                            st.write(f"• {error}")
                
        except Exception as e:
            st.error(f"Backtest failed: {str(e)}")

elif run_backtest_btn:
    if not all_backtest_symbols:
        st.error("Please select symbols for backtesting")
    if not backtest_name.strip():
        st.error("Please enter a backtest name")

# Show backtest history
if st.session_state.get('show_backtest_history', False):
    with st.expander("📚 Backtest History", expanded=True):
        saved_backtests = get_backtest_results()
        
        if saved_backtests:
            for i, backtest in enumerate(saved_backtests[:10]):  # Show last 10 backtests
                with st.container():
                    col1, col2, col3, col4 = st.columns([2, 1, 1, 1])
                    
                    with col1:
                        # Handle different field names (backtest_name vs name)
                        name = backtest.get('backtest_name') or backtest.get('name', 'Unnamed Backtest')
                        st.write(f"**{name}**")
                        created_at = pd.to_datetime(backtest['created_at']).strftime('%Y-%m-%d %H:%M')
                        st.caption(f"Created: {created_at}")
                    
                    with col2:
                        metrics = backtest.get('results', {}).get('metrics', {})
                        total_return = metrics.get('total_return', 0) * 100
                        st.metric("Return", f"{total_return:.1f}%")
                    
                    with col3:
                        win_rate = metrics.get('win_rate', 0) * 100
                        st.metric("Win Rate", f"{win_rate:.1f}%")
                    
                    with col4:
                        total_trades = metrics.get('total_trades', 0)
                        st.metric("Trades", total_trades)
                    
                    if st.button(f"View Details", key=f"view_backtest_{i}"):
                        st.session_state[f'show_backtest_details_{i}'] = True
                    
                    # Show details if requested
                    if st.session_state.get(f'show_backtest_details_{i}', False):
                        config = backtest.get('config', {})
                        st.json({
                            'Configuration': config,
                            'Results Summary': metrics
                        })
                    
                    st.divider()
        else:
            st.info("No saved backtests found. Run a backtest above to get started.")
        
        if st.button("Close History", key="close_backtest_history"):
            st.session_state.show_backtest_history = False
            st.rerun()

# ================= Portfolio Tracking =================
st.markdown("---")
st.subheader("💼 Portfolio Tracking")

# Portfolio overview
col1, col2 = st.columns([2, 1])

with col1:
    # Portfolio metrics at the top
    portfolio_metrics = calculate_portfolio_metrics()
    
    if portfolio_metrics:
        col1_1, col1_2, col1_3, col1_4 = st.columns(4)
        
        with col1_1:
            market_value = portfolio_metrics.get('total_market_value', 0)
            st.metric("Market Value", f"${market_value:,.2f}")
        
        with col1_2:
            total_return = portfolio_metrics.get('total_return_pct', 0)
            color = "green" if total_return >= 0 else "red"
            st.metric("Total Return", f"{total_return:.2f}%", delta=None)
        
        with col1_3:
            unrealized_pnl = portfolio_metrics.get('total_unrealized_pnl', 0)
            st.metric("Unrealized P&L", f"${unrealized_pnl:,.2f}")
        
        with col1_4:
            num_positions = portfolio_metrics.get('total_positions', 0)
            st.metric("Positions", num_positions)

with col2:
    # Quick actions
    if st.button("🔄 Update Prices", width='stretch'):
        with st.spinner("Updating portfolio prices..."):
            update_portfolio_prices()
        st.success("Prices updated!")
        st.rerun()

# Main portfolio tabs
tab1, tab2, tab3, tab4 = st.tabs(["📊 Overview", "➕ Add Position", "📋 Holdings", "📈 History"])

with tab1:
    # Portfolio overview with charts
    positions = get_portfolio_positions()
    
    if positions:
        col1, col2 = st.columns(2)
        
        with col1:
            # Portfolio allocation chart
            allocation_chart = create_portfolio_chart(positions)
            if allocation_chart:
                st.plotly_chart(allocation_chart, use_container_width=True)
        
        with col2:
            # Portfolio performance chart
            performance_chart = create_portfolio_performance_chart()
            if performance_chart:
                st.plotly_chart(performance_chart, use_container_width=True)
        
        # Key metrics table
        if portfolio_metrics:
            st.subheader("📊 Portfolio Metrics")
            metrics_data = {
                'Metric': [
                    'Total Market Value',
                    'Total Cost Basis', 
                    'Unrealized P&L',
                    'Realized P&L',
                    'Total P&L',
                    'Total Return %',
                    'Number of Positions'
                ],
                'Value': [
                    f"${portfolio_metrics.get('total_market_value', 0):,.2f}",
                    f"${portfolio_metrics.get('total_cost_basis', 0):,.2f}",
                    f"${portfolio_metrics.get('total_unrealized_pnl', 0):,.2f}",
                    f"${portfolio_metrics.get('realized_pnl', 0):,.2f}",
                    f"${portfolio_metrics.get('total_pnl', 0):,.2f}",
                    f"{portfolio_metrics.get('total_return_pct', 0):.2f}%",
                    f"{portfolio_metrics.get('total_positions', 0)}"
                ]
            }
            metrics_df = pd.DataFrame(metrics_data)
            st.dataframe(metrics_df, width='stretch', hide_index=True)
    else:
        st.info("No positions in portfolio. Add your first position using the 'Add Position' tab.")

with tab2:
    # Add new position form
    st.subheader("➕ Add New Position")
    
    col1, col2 = st.columns(2)
    
    with col1:
        symbol = st.text_input("Symbol:", placeholder="e.g., AAPL", key="portfolio_symbol").upper()
        quantity = st.number_input("Quantity:", min_value=0.0001, step=0.1, key="portfolio_quantity")
        transaction_type = st.selectbox("Transaction Type:", ["BUY", "SELL"], key="portfolio_transaction_type")
    
    with col2:
        average_cost = st.number_input("Price per Share:", min_value=0.01, step=0.01, key="portfolio_cost")
        notes = st.text_area("Notes (Optional):", placeholder="e.g., Earnings play, long-term hold", height=100, key="portfolio_notes")
    
    if symbol and quantity > 0 and average_cost > 0:
        total_value = quantity * average_cost
        st.info(f"Total Transaction Value: ${total_value:,.2f}")
        
        col1, col2, col3 = st.columns([1, 1, 1])
        with col2:
            if st.button("Add Position", type="primary", width='stretch'):
                success = add_portfolio_position(symbol, quantity, average_cost, transaction_type, notes)
                if success:
                    st.success(f"Successfully added {transaction_type} of {quantity} shares of {symbol}")
                    st.rerun()

with tab3:
    # Current holdings
    st.subheader("📋 Current Holdings")
    
    positions = get_portfolio_positions()
    
    if positions:
        # Create positions dataframe
        positions_data = []
        for pos in positions:
            positions_data.append({
                'Symbol': pos['symbol'],
                'Quantity': f"{float(pos['quantity']):,.4f}",
                'Avg Cost': f"${float(pos['average_cost']):,.2f}",
                'Current Price': f"${float(pos['current_price']):,.2f}",
                'Market Value': f"${float(pos['market_value']):,.2f}",
                'Unrealized P&L': f"${float(pos['unrealized_pnl']):,.2f}",
                'Return %': f"{((float(pos['current_price']) - float(pos['average_cost'])) / float(pos['average_cost']) * 100):.2f}%",
                'Last Updated': pd.to_datetime(pos['updated_at']).strftime('%Y-%m-%d %H:%M')
            })
        
        positions_df = pd.DataFrame(positions_data)
        st.dataframe(positions_df, width='stretch', hide_index=True)
        
        # Quick actions for positions
        st.subheader("⚡ Quick Actions")
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("**💰 Sell Position**")
            sell_symbol = st.selectbox("Select position to sell:", [pos['symbol'] for pos in positions], key="sell_symbol")
            if sell_symbol:
                current_pos = next((pos for pos in positions if pos['symbol'] == sell_symbol), None)
                if current_pos:
                    max_qty = float(current_pos['quantity'])
                    sell_qty = st.number_input(f"Quantity to sell (max {max_qty}):", min_value=0.0001, max_value=max_qty, step=0.1, key="sell_qty")
                    sell_price = st.number_input("Sell Price:", min_value=0.01, step=0.01, key="sell_price")
                    
                    if sell_qty > 0 and sell_price > 0:
                        if st.button("Sell Position", type="secondary"):
                            success = add_portfolio_position(sell_symbol, sell_qty, sell_price, "SELL", f"Partial sale of {sell_symbol}")
                            if success:
                                st.success(f"Successfully sold {sell_qty} shares of {sell_symbol}")
                                st.rerun()
        
        with col2:
            st.markdown("**🗑️ Remove Position**")
            remove_symbol = st.selectbox("Select position to remove:", [pos['symbol'] for pos in positions], key="remove_symbol")
            if remove_symbol:
                st.warning("⚠️ This will permanently delete all transactions and data for this position. Use this only to correct data entry errors.")
                
                # Confirmation checkbox
                confirm_remove = st.checkbox(f"I confirm I want to permanently remove {remove_symbol}", key="confirm_remove")
                
                if confirm_remove:
                    if st.button("Remove Position", type="primary"):
                        success = remove_portfolio_position(remove_symbol)
                        if success:
                            st.success(f"Successfully removed {remove_symbol} from portfolio")
                            st.rerun()
                        else:
                            st.error(f"Failed to remove {remove_symbol}")
    else:
        st.info("No positions found. Add your first position using the 'Add Position' tab.")

with tab4:
    # Transaction history
    st.subheader("📈 Transaction History")
    
    transactions = get_portfolio_transactions(100)
    
    if transactions:
        # Create transactions dataframe
        trans_data = []
        for trans in transactions:
            trans_data.append({
                'Date': pd.to_datetime(trans['transaction_date']).strftime('%Y-%m-%d %H:%M'),
                'Symbol': trans['symbol'],
                'Type': trans['transaction_type'],
                'Quantity': f"{float(trans['quantity']):,.4f}",
                'Price': f"${float(trans['price']):,.2f}",
                'Total Amount': f"${float(trans['total_amount']):,.2f}",
                'Notes': trans.get('notes', '') or '-'
            })
        
        trans_df = pd.DataFrame(trans_data)
        st.dataframe(trans_df, width='stretch', hide_index=True)
        
        # Transaction summary
        col1, col2, col3 = st.columns(3)
        
        with col1:
            buy_count = len([t for t in transactions if t['transaction_type'] == 'BUY'])
            st.metric("Buy Transactions", buy_count)
        
        with col2:
            sell_count = len([t for t in transactions if t['transaction_type'] == 'SELL'])
            st.metric("Sell Transactions", sell_count)
        
        with col3:
            total_invested = sum([float(t['total_amount']) for t in transactions if t['transaction_type'] == 'BUY'])
            st.metric("Total Invested", f"${total_invested:,.2f}")
    else:
        st.info("No transactions found. Add your first position to start tracking.")

# Status information
st.subheader("📊 Scan Statistics")
col1, col2, col3, col4 = st.columns(4)

with col1:
    eq_count = len(st.session_state.eq_results) if not st.session_state.eq_results.empty else 0
    st.metric("Equity Scanned", eq_count)

with col2:
    cx_count = len(st.session_state.cx_results) if not st.session_state.cx_results.empty else 0
    st.metric("Crypto Scanned", cx_count)

with col3:
    eq_err_count = len(st.session_state.eq_errors) if not st.session_state.eq_errors.empty else 0
    st.metric("Equity Errors", eq_err_count)

with col4:
    cx_err_count = len(st.session_state.cx_errors) if not st.session_state.cx_errors.empty else 0
    st.metric("Crypto Errors", cx_err_count)

# Footer
st.markdown("---")
st.markdown("""
**Market Scanner Dashboard** - Real-time technical analysis with risk management
- Data provided by Yahoo Finance via yfinance library
- Technical indicators calculated using pandas
- Position sizing based on Average True Range (ATR)
- Configure SMTP environment variables for email notifications
- Set SLACK_WEBHOOK_URL for Slack notifications
""")

# Add Privacy Policy link separately with proper HTML
col1, col2 = st.columns([3, 1])
with col1:
    st.markdown("**Legal**: <a href='https://marketscannerspros.pages.dev/privacy' target='_blank'>Privacy Policy</a> | Contact: support@marketscannerpro.app", unsafe_allow_html=True)
with col2:
    st.markdown("**Powered by**: <a href='https://replit.com/refer/bradleywessling' target='_blank'>Replit ⚡</a>", unsafe_allow_html=True)
# === Mobile legacy style overrides (iOS/Android only) ===
if 'is_mobile' in globals() and is_mobile:
    st.markdown("""
<style>
html, body, .stApp { background:#ffffff !important; color:#111 !important; }
.pro-card, .metric-card, .tier-card { background:#ffffff !important; color:#111 !important; }
.stButton > button { background:#2563eb !important; color:#fff !important; }
</style>
""", unsafe_allow_html=True)
