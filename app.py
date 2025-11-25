# market_scanner_app.py
# One-file Market Scanner (pure pandas) + Streamlit Dashboard
# - Equities & Crypto via yfinance (AAPL, MSFT, BTC-USD, ETH-USD…)
# - ATR-based position sizing
# - Optional Email + Slack summaries
# - CSV download

import os
import streamlit as st
from datetime import datetime

# ================= HEALTH CHECK ENDPOINT =================
# Ultra-fast health check for Autoscale deployment - MUST BE FIRST
# Responds immediately without any heavy processing
try:
    qp = st.query_params if hasattr(st, 'query_params') else {}
    if isinstance(qp, dict):
        health_param = qp.get('health', '')
    else:
        try:
            health_param = qp.get('health', [''])[0]
        except:
            health_param = ''
    
    if str(health_param).lower() in ('check', '1', 'true', 'ping', 'ready'):
        # Immediate health response - no database checks
        st.write('{"status":"healthy","service":"market-scanner","timestamp":"' + datetime.now().isoformat() + '"}')
        st.stop()
except:
    pass  # Continue to normal app if health check fails

# ================= LAZY IMPORTS FOR HEAVY DEPENDENCIES =================
# Import heavy dependencies only after health check
try:
    import pandas as pd, numpy as np, yfinance as yf, requests
    import psycopg2
    from psycopg2.extras import RealDictCursor
    import psycopg2.extensions
    from psycopg2 import pool
    from dataclasses import dataclass
    from typing import List, Tuple, Optional, Dict, Any
    from datetime import timezone
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
    from collections import defaultdict
    import secrets
    import string
    import time
except ImportError as e:
    st.error(f"❌ Failed to import required packages: {e}")
    st.info("🔧 Please check the deployment environment and package installation.")
    st.stop()

# ================= SUBSCRIPTION AUTHENTICATION =================
# Import authentication helper for Pro tier management
try:
    from auth_helper import get_auth
    auth = get_auth()
except ImportError:
    # Fallback if auth_helper not available - all features free
    class FallbackAuth:
        def is_pro(self): return True
        def require_pro(self, message=""): return True
        def show_subscription_status(self): pass
        def check_subscription(self): return {'tier': 'pro', 'status': 'active'}
    auth = FallbackAuth()

# Error monitoring removed - all features are free and open

# ================= RATE LIMITING =================
# Simple in-memory rate limiter to prevent abuse
class RateLimiter:
    def __init__(self):
        self.requests = defaultdict(list)
        self.max_requests_per_minute = 60
        self.max_requests_per_hour = 1000
    
    def check_rate_limit(self, identifier: str) -> Tuple[bool, str]:
        """Check if request is within rate limits"""
        now = time.time()
        
        # Clean old requests (older than 1 hour)
        self.requests[identifier] = [
            req_time for req_time in self.requests[identifier] 
            if now - req_time < 3600
        ]
        
        # Check limits
        recent_requests = [
            req_time for req_time in self.requests[identifier] 
            if now - req_time < 60
        ]
        
        if len(recent_requests) >= self.max_requests_per_minute:
            return False, "Rate limit exceeded: Too many requests per minute"
        
        if len(self.requests[identifier]) >= self.max_requests_per_hour:
            return False, "Rate limit exceeded: Too many requests per hour"
        
        # Add current request
        self.requests[identifier].append(now)
        return True, "OK"

# Initialize global rate limiter
@st.cache_resource
def get_rate_limiter():
    return RateLimiter()

# ================= AUTOMATED DATABASE BACKUP =================
def create_database_backup():
    """Create automated database backup using pg_dump"""
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            return False, "Database URL not configured"
        
        # Create backup filename with timestamp
        backup_dir = "/tmp/backups"
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = f"{backup_dir}/market_scanner_backup_{timestamp}.sql"
        
        # Use pg_dump to create backup
        import subprocess
        result = subprocess.run(
            ["pg_dump", database_url, "-f", backup_file],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        if result.returncode == 0:
            # Compress the backup
            subprocess.run(["gzip", backup_file], check=True)
            
            # Keep only last 7 backups to save space
            import glob
            backups = sorted(glob.glob(f"{backup_dir}/market_scanner_backup_*.sql.gz"))
            for old_backup in backups[:-7]:
                os.remove(old_backup)
            
            return True, f"Backup created: {backup_file}.gz"
        else:
            return False, f"Backup failed: {result.stderr}"
            
    except Exception as e:
        return False, f"Backup error: {str(e)}"

def schedule_daily_backup():
    """Check if daily backup is needed and create one"""
    try:
        backup_marker = "/tmp/last_backup.txt"
        
        # Check when last backup was made
        should_backup = True
        if os.path.exists(backup_marker):
            with open(backup_marker, 'r') as f:
                last_backup = f.read().strip()
                last_backup_date = datetime.fromisoformat(last_backup).date()
                if last_backup_date == datetime.now().date():
                    should_backup = False
        
        if should_backup:
            success, message = create_database_backup()
            if success:
                # Update backup marker
                with open(backup_marker, 'w') as f:
                    f.write(datetime.now().isoformat())
                print(f"✅ {message}")
            else:
                print(f"⚠️ Backup failed: {message}")
                
    except Exception as e:
        print(f"⚠️ Backup scheduling error: {e}")

# Run daily backup check (non-blocking)
try:
    schedule_daily_backup()
except Exception:
    pass  # Don't let backup failures break the app

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

# ================= LAZY-LOAD CSS STYLING =================
# Load CSS only when needed (not during health checks) for faster startup
@st.cache_resource
def load_app_styling():
    """Lazy-load CSS styling to speed up initial app startup"""
    st.markdown("""
<style>
/* PORTFOLIO FIX v3.0 - FORCE DARK STYLING ON ALL URLS - UNIVERSAL OVERRIDE */
/* Remove conditional logic - apply dark styling everywhere */
.stPlotlyChart, .stPlotlyChart > div, .js-plotly-plot, .plotly-graph-div {
    background-color: #1E293B !important;
    background: #1E293B !important;
}

/* DO NOT force SVG backgrounds - let Plotly control chart rendering */
/* Chart backgrounds are set in Python code via paper_bgcolor and plot_bgcolor */

/* FORCE WHITE TEXT ON ALL METRIC CONTAINERS - NO CONDITIONS */
div[data-testid="metric-container"], 
div[data-testid="metric-container"] *,
.stMetric, .stMetric *,
[data-testid="metric-container"] label,
[data-testid="metric-container"] .metric-label,
[data-testid="metric-container"] .metric-value {
    color: #FFFFFF !important;
    opacity: 1.0 !important;
    font-weight: 600 !important;
}

/* PORTFOLIO TRACKING SECTION - FORCE DARK CONTAINERS + WHITE TEXT */
div[data-testid="stTabs"] > div,
div[data-testid="stTabs"] div[data-baseweb="tab-panel"],
div[data-testid="stTabs"] .stTab,
div[data-testid="stTabs"] .stTabContent,
div[data-testid="stTabs"] section,
div[data-testid="stTabs"] .element-container {
    background-color: #1E293B !important;
    background: #1E293B !important;
    color: #FFFFFF !important;
}

/* FORCE ALL TABS AND EXPANDERS TO DARK */
div[data-testid="stExpander"],
div[data-testid="stExpander"] > div,
.streamlit-expanderHeader,
.streamlit-expanderContent,
[data-testid="stExpander"] div,
[data-testid="stExpander"] section {
    background-color: #1E293B !important;
    background: #1E293B !important;
    color: #FFFFFF !important;
}

/* DATAFRAMES AND TABLES - DARK BACKGROUND */
div[data-testid="stDataFrame"],
div[data-testid="stTable"],
.stDataFrame, .stTable,
.dataframe, table {
    background-color: #1E293B !important;
    color: #FFFFFF !important;
}

/* PORTFOLIO METRICS - ENSURE BOLD WHITE TEXT */
.stMetric > div > div {
    color: #FFFFFF !important;
    font-weight: 700 !important;
    opacity: 1.0 !important;
}

/* FORCE ALL CONTAINERS TO DARK BACKGROUND - UNIVERSAL */
.stApp,
[data-testid="stAppViewContainer"],
.main .block-container,
section.main,
.block-container,
div.block-container {
    background-color: #0F172A !important;
    background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%) !important;
}

/* Cache bust: v2.5-mobile-replit - """ + str(datetime.now().timestamp()) + """ */

/* Professional Global Styles - Marketing Page Dark Theme */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
    --primary-color: #0F172A;
    --secondary-color: #1E293B;
    --accent-color: #10B981;
    --accent-hover: #059669;
    --danger-color: #EF4444;
    --warning-color: #F59E0B;
    --success-color: #10B981;
    --border-radius: 16px;
    --spacing-unit: 1rem;
    
    /* Dark theme colors matching marketing page */
    --app-bg: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
    --card-bg: linear-gradient(145deg, #1E293B 0%, #334155 100%);
    --metric-card-bg: linear-gradient(145deg, #1E293B 0%, #475569 100%);
    --text-color: #F8FAFC;
    --text-muted: #CBD5E1;
    --border-color: #475569;
    --card-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    --card-shadow-hover: 0 20px 35px -5px rgba(0, 0, 0, 0.4), 0 10px 15px -5px rgba(0, 0, 0, 0.1);
}

/* REMOVE OVERLY AGGRESSIVE GLOBAL STYLES - BE SPECIFIC INSTEAD */

html, body {
    background-color: #0F172A !important;
    color: #F8FAFC !important;
    color-scheme: dark !important;
}

/* SPECIFIC CONTAINERS ONLY - NOT ALL DIVS */
.stApp, [data-testid="stAppViewContainer"], .main, .block-container,
section.main, .element-container {
    background-color: transparent !important;
    color: #F8FAFC !important;
}

/* STREAMLIT SPECIFIC CONTAINERS - MINIMAL OVERRIDE */
.stSidebar {
    background-color: #1E293B !important;
    color: #F8FAFC !important;
}

/* REMOVE - TOO AGGRESSIVE */

/* Keep mobile overrides as backup */
html[data-mobile-dark="true"],
html[data-mobile-dark="true"] body {
    background-color: #0F172A !important;
    color: #F8FAFC !important;
    color-scheme: dark !important;
}

/* Main App Background - Marketing Page Dark Theme */
.stApp {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--app-bg) !important;
    color: var(--text-color);
}

/* Apply dark theme globally */
.main .block-container {
    background: transparent !important;
    color: var(--text-color);
}

/* Header Styling - Marketing Page Style */
.main-header {
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    padding: 3rem 0;
    margin: -2rem -3rem 3rem -3rem;
    border-radius: 0 0 var(--border-radius) var(--border-radius);
    box-shadow: var(--card-shadow);
    color: var(--text-color);
    text-align: center;
    border-bottom: 2px solid var(--accent-color);
}

.main-header h1 {
    font-size: 3rem;
    font-weight: 700;
    margin: 0;
    color: #FFFFFF !important;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.main-header .hero-subtitle {
    font-size: 1.25rem;
    opacity: 1.0;
    margin: 1rem 0;
    font-weight: 400;
    color: #F8FAFC !important;
}

.hero-buttons {
    margin-top: 2rem;
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
}

.app-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 1rem auto;
    display: block;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* Professional Cards - Marketing Page Style */
.pro-card {
    background: var(--card-bg);
    border-radius: var(--border-radius);
    padding: 2rem;
    margin: 1.5rem 0;
    box-shadow: var(--card-shadow);
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.pro-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
}

.pro-card:hover {
    box-shadow: var(--card-shadow-hover);
    transform: translateY(-4px);
    border-color: var(--accent-color);
}

.pro-card h3 {
    color: #FFFFFF !important;
    font-weight: 700 !important;
    margin-bottom: 1rem;
    font-size: 1.5rem;
}

.pro-card p {
    color: #F8FAFC !important;
    opacity: 1.0 !important;
    line-height: 1.6;
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
    color: #FFFFFF !important;
    margin: 0;
    opacity: 1.0 !important;
}

.metric-label {
    font-size: 0.875rem;
    color: #F8FAFC !important;
    font-weight: 600 !important;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 1.0 !important;
}

/* Fix Streamlit success/error/info banners - CLEAN DARK DESIGN */
.stApp .stSuccess, .stApp .stError, .stApp .stInfo, .stApp .stWarning,
.stApp .stAlert, .stApp [data-testid="stAlert"],
.stApp [data-testid="stAlertContainer"],
.stApp div[data-testid="stAlert"], .stApp div[data-testid="stAlertContainer"],
.alert, .alert-info, .alert-warning, .alert-success, .alert-error {
    background: #1E293B !important;
    color: #FFFFFF !important;
    border: 1px solid #475569 !important;
    border-left: 4px solid #475569 !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
    border-radius: 12px !important;
    padding: 1rem !important;
}

/* Error boxes - red accent */
.stApp .stError, .stApp div[data-testid="stAlert"][data-color="error"] {
    border-left-color: #EF4444 !important;
}

/* Success boxes - subtle border, no green background */
.stApp .stSuccess {
    border-left-color: #64748B !important;
}

/* Info boxes - subtle border */
.stApp .stInfo {
    border-left-color: #64748B !important;
}

@media (prefers-color-scheme: dark) {
    .stSuccess, .stError, .stInfo, .stWarning,
    .stAlert, [data-testid="stAlert"] {
        background: #1E293B !important;
        color: #FFFFFF !important;
        border: 1px solid #475569 !important;
        border-left: 4px solid #64748B !important;
    }
    
    .stApp {
        background: var(--app-bg) !important;
        color: #FFFFFF !important;
    }
    
    .main .block-container {
        background: transparent !important;
        color: #FFFFFF !important;
    }
}

/* Mobile dark mode - CLEAN SUBTLE ALERTS */
html[data-mobile-dark="true"] .stSuccess,
html[data-mobile-dark="true"] .stError, 
html[data-mobile-dark="true"] .stInfo,
html[data-mobile-dark="true"] .stWarning,
html[data-mobile-dark="true"] .stAlert,
html[data-mobile-dark="true"] [data-testid="stAlert"] {
    background: #1E293B !important;
    color: #FFFFFF !important;
    border: 1px solid #475569 !important;
    border-left: 4px solid #64748B !important;
}

/* MOBILE COMPREHENSIVE FIX - All dataframes and tables */
html[data-mobile-dark="true"] .stDataFrame,
html[data-mobile-dark="true"] [data-testid="stDataFrame"],
html[data-mobile-dark="true"] .stDataFrame *,
html[data-mobile-dark="true"] [data-testid="stDataFrame"] * {
    color: #FFFFFF !important;
    background-color: #1E293B !important;
}

/* MOBILE FIX - All metrics must be white */
html[data-mobile-dark="true"] .stMetric,
html[data-mobile-dark="true"] [data-testid="metric-container"],
html[data-mobile-dark="true"] .stMetric *,
html[data-mobile-dark="true"] [data-testid="metric-container"] * {
    color: #FFFFFF !important;
}

/* MOBILE FIX - Plotly charts */
html[data-mobile-dark="true"] .js-plotly-plot,
html[data-mobile-dark="true"] .stPlotlyChart,
html[data-mobile-dark="true"] .plotly,
html[data-mobile-dark="true"] [data-testid="stPlotlyChart"] {
    background-color: #1E293B !important;
}

/* MOBILE FIX - Chart text must be visible */
html[data-mobile-dark="true"] .js-plotly-plot text,
html[data-mobile-dark="true"] .stPlotlyChart text {
    fill: #FFFFFF !important;
}

/* Professional Buttons - MAXIMUM SPECIFICITY for ALL button types */
.stApp .stButton > button,
.stApp button[data-testid="stBaseButton-secondary"],
.stApp button[kind="secondary"],
.stApp [data-testid="stBaseButton-secondary"],
.stApp div[data-testid="stButton"] button,
.stApp button[data-testid="stBaseButton-primary"],
.stApp button[kind="primary"],
.stApp [data-testid="stBaseButton-primary"],
.stApp button {
    background: linear-gradient(135deg, var(--accent-color), var(--accent-hover)) !important;
    background-image: linear-gradient(135deg, var(--accent-color), var(--accent-hover)) !important;
    color: white !important;
    border: none !important;
    border-radius: var(--border-radius) !important;
    padding: 0.75rem 2rem !important;
    font-weight: 600 !important;
    font-size: 1rem !important;
    transition: all 0.3s ease !important;
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3) !important;
    font-family: 'Inter', sans-serif !important;
    min-height: auto !important;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.stApp .stButton > button:hover,
.stApp button[data-testid="stBaseButton-secondary"]:hover,
.stApp button[kind="secondary"]:hover,
.stApp button[data-testid="stBaseButton-primary"]:hover,
.stApp button[kind="primary"]:hover,
.stApp button:hover {
    background: linear-gradient(135deg, var(--accent-hover), #047857) !important;
    box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4) !important;
    transform: translateY(-2px) !important;
}

/* Primary Action Button - Like marketing page "Launch App" */
.primary-button {
    background: linear-gradient(135deg, var(--accent-color), var(--accent-hover)) !important;
    color: white !important;
    padding: 1rem 2.5rem !important;
    font-size: 1.125rem !important;
    font-weight: 700 !important;
    border-radius: var(--border-radius) !important;
    border: none !important;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4) !important;
    transition: all 0.3s ease !important;
    text-transform: uppercase !important;
    letter-spacing: 1px !important;
}

.primary-button:hover {
    background: linear-gradient(135deg, var(--accent-hover), #047857) !important;
    box-shadow: 0 8px 30px rgba(16, 185, 129, 0.5) !important;
    transform: translateY(-3px) !important;
}

/* Sidebar Enhancements - Dark Theme with Better Spacing */
.css-1d391kg,
.stSidebar,
[data-testid="stSidebar"] {
    background: linear-gradient(135deg, var(--secondary-color) 0%, var(--primary-color) 100%) !important;
    border-right: 1px solid var(--border-color) !important;
    color: var(--text-color) !important;
    min-width: 340px !important;
    width: 360px !important;
}

/* Improved sidebar spacing and layout */
[data-testid="stSidebarUserContent"] > * {
    margin-bottom: 12px !important;
}

[data-testid="stSidebar"] .stButton > button {
    background: linear-gradient(135deg, var(--accent-color), var(--accent-hover)) !important;
    color: white !important;
    border: none !important;
    width: 100% !important;
    margin-bottom: 8px !important;
}

/* Better input sizing and spacing */
[data-testid="stSidebar"] input,
[data-testid="stSidebar"] [role="combobox"] {
    min-height: 44px !important;
}

/* Improved label readability */
[data-testid="stSidebar"] label {
    font-size: 0.9rem !important;
    line-height: 1.4 !important;
    color: #F8FAFC !important;
    font-weight: 600 !important;
}

/* Compact mode indicator chip */
.mode-chip {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    background: var(--accent-color);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 16px;
}

/* Fix for number input width issues - ensure readable numbers */
.stNumberInput > div > div > input {
    min-width: 120px !important;
    width: 100% !important;
    text-align: center !important;
    font-size: 1rem !important;
    font-weight: 600 !important;
}

/* Fix for column layout number inputs */
[data-testid="column"] .stNumberInput {
    width: 100% !important;
}

[data-testid="column"] .stNumberInput > div {
    width: 100% !important;
}

/* Ensure metric displays don't truncate */
.stMetric {
    min-width: 140px !important;
}

.stMetric > div {
    white-space: nowrap !important;
    overflow: visible !important;
}

/* Mobile responsive sidebar */
@media (max-width: 768px) {
    [data-testid="stSidebar"] {
        width: 100% !important;
        min-width: auto !important;
    }
    
    /* Better mobile number inputs */
    .stNumberInput > div > div > input {
        min-width: 100px !important;
        font-size: 0.9rem !important;
    }
    
    /* MOBILE FIX - Force white text in dataframes */
    .stDataFrame, [data-testid="stDataFrame"],
    .stDataFrame table, [data-testid="stDataFrame"] table,
    .stDataFrame td, [data-testid="stDataFrame"] td,
    .stDataFrame th, [data-testid="stDataFrame"] th {
        color: #FFFFFF !important;
        background-color: #1E293B !important;
    }
    
    /* MOBILE FIX - Force metrics to show white */
    .stMetric, [data-testid="metric-container"],
    .stMetric *, [data-testid="metric-container"] * {
        color: #FFFFFF !important;
    }
    
    /* MOBILE FIX - Charts must have dark background */
    .js-plotly-plot, .stPlotlyChart {
        background-color: #1E293B !important;
    }
}

/* Data Tables - Dark Theme with BRIGHT WHITE TEXT */
.stDataFrame, [data-testid="stDataFrame"] {
    border-radius: var(--border-radius);
    overflow: hidden;
    box-shadow: var(--card-shadow);
    background: #1E293B !important;
}

.stDataFrame table, [data-testid="stDataFrame"] table {
    background: #1E293B !important;
    color: #FFFFFF !important;
}

.stDataFrame th, [data-testid="stDataFrame"] th {
    background: #334155 !important;
    color: #FFFFFF !important;
    font-weight: 700 !important;
    border-color: #475569 !important;
}

.stDataFrame td, [data-testid="stDataFrame"] td {
    background: #1E293B !important;
    color: #FFFFFF !important;
    border-color: #475569 !important;
}

/* DataFrame cell text must be white */
.stDataFrame tbody tr td, [data-testid="stDataFrame"] tbody tr td {
    color: #FFFFFF !important;
}

.stDataFrame thead tr th, [data-testid="stDataFrame"] thead tr th {
    color: #FFFFFF !important;
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

/* Subscription Tiers - Marketing Page Dark Theme */
.tier-card {
    background: var(--card-bg);
    border-radius: var(--border-radius);
    padding: 2rem;
    margin: 1rem 0;
    box-shadow: var(--card-shadow);
    border: 2px solid var(--border-color);
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
    color: #FFFFFF !important;
    margin: 1rem 0;
}

.price-period {
    font-size: 1rem;
    color: #F8FAFC !important;
    font-weight: 500 !important;
}

/* Feature Lists */
.feature-list {
    list-style: none;
    padding: 0;
    margin: 1rem 0;
}

.feature-list li {
    padding: 0.5rem 0;
    color: #F8FAFC !important;
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

/* Promotional Button - Hero section marketing (non-functional) */
.promo-button {
    background: linear-gradient(135deg, #374151, #4B5563) !important;
    color: #9CA3AF !important;
    padding: 0.875rem 2rem !important;
    font-size: 0.95rem !important;
    font-weight: 500 !important;
    border: 1px solid #4B5563 !important;
    border-radius: var(--border-radius) !important;
    transition: all 0.3s ease !important;
    text-transform: none !important;
    letter-spacing: 0.25px !important;
    opacity: 0.8;
    cursor: default;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
}

.promo-button:hover {
    background: linear-gradient(135deg, #4B5563, #6B7280) !important;
    transform: none !important;
    opacity: 0.9;
}

/* Secondary Button */
.secondary-button {
    background: transparent !important;
    color: var(--text-color) !important;
    padding: 1rem 2rem !important;
    font-size: 1rem !important;
    font-weight: 600 !important;
    border: 2px solid var(--border-color) !important;
    border-radius: var(--border-radius) !important;
    transition: all 0.3s ease !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    margin-left: 1rem;
}

.secondary-button:hover {
    background: var(--card-bg) !important;
    border-color: var(--accent-color) !important;
    color: var(--accent-color) !important;
    transform: translateY(-2px) !important;
}

/* Override Streamlit default styles - BRIGHT WHITE HEADINGS */
.stMarkdown h1, .stMarkdown h2, .stMarkdown h3, .stMarkdown h4, .stMarkdown h5, .stMarkdown h6,
h1, h2, h3, h4, h5, h6 {
    color: #FFFFFF !important;
    font-weight: 700 !important;
}

.stMarkdown p, p {
    color: #F8FAFC !important;
    opacity: 1.0 !important;
}

/* Responsive Design */
@media (max-width: 768px) {
    .main-header {
        padding: 2rem 1rem;
        margin: -1rem -1rem 2rem -1rem;
    }
    
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

/* Success/Error Messages - CLEAN DARK STYLE */
.stSuccess {
    background: #1E293B !important;
    color: #FFFFFF !important;
    border: 1px solid #475569 !important;
    border-left: 4px solid #64748B !important;
    border-radius: 12px !important;
}

.stError {
    background: #1E293B !important;
    color: #FFFFFF !important;
    border: 1px solid #475569 !important;
    border-left: 4px solid #EF4444 !important;
    border-radius: 12px !important;
}

.stInfo {
    background: #1E293B !important;
    color: #FFFFFF !important;
    border: 1px solid #475569 !important;
    border-left: 4px solid #64748B !important;
    border-radius: 12px !important;
}

/* Loading States */
.stSpinner {
    color: var(--secondary-color);
}

/* Charts Enhancement - WHITE TEXT ON DARK BG */
.js-plotly-plot {
    border-radius: var(--border-radius);
    box-shadow: var(--card-shadow);
    overflow: hidden;
    background: #1E293B !important;
}

/* Plotly chart text must be white */
.js-plotly-plot .plotly text,
.js-plotly-plot text {
    fill: #FFFFFF !important;
}

/* Plotly axis labels and titles */
.js-plotly-plot .xtick text,
.js-plotly-plot .ytick text,
.js-plotly-plot .gtitle {
    fill: #FFFFFF !important;
}

/* Plotly legend text */
.js-plotly-plot .legend text {
    fill: #FFFFFF !important;
}

/* COMPREHENSIVE TEXT VISIBILITY FIXES */
/* All labels should be bright and readable */
label, [data-testid="stWidgetLabel"], .stLabel {
    color: #FFFFFF !important;
    font-weight: 600 !important;
    opacity: 1.0 !important;
}

/* Text inputs and textareas - bright text on dark background */
input, textarea, [data-baseweb="input"], [data-baseweb="textarea"] {
    background-color: #1E293B !important;
    color: #FFFFFF !important;
    border-color: #475569 !important;
}

/* Select boxes and dropdowns - COMPREHENSIVE FIX */
[data-baseweb="select"], [role="combobox"], .stSelectbox div {
    color: #FFFFFF !important;
    background-color: #1E293B !important;
}

/* Dropdown popup menus - dark background with white text */
[data-baseweb="popover"],
[data-baseweb="menu"],
[data-baseweb="list"],
ul[role="listbox"] {
    background-color: #1E293B !important;
    border: 1px solid #475569 !important;
}

/* Dropdown menu options */
[role="option"],
li[role="option"],
[data-baseweb="menu"] li {
    background-color: #1E293B !important;
    color: #FFFFFF !important;
}

/* Dropdown menu option hover state */
[role="option"]:hover,
li[role="option"]:hover,
[data-baseweb="menu"] li:hover {
    background-color: #334155 !important;
    color: #FFFFFF !important;
}

/* Selectbox input field */
.stSelectbox > div > div,
.stSelectbox input {
    background-color: #1E293B !important;
    color: #FFFFFF !important;
}

/* Expander headers must be bright white */
.streamlit-expanderHeader, [data-testid="stExpander"] summary {
    color: #FFFFFF !important;
    font-weight: 700 !important;
}

/* All text in expander content */
[data-testid="stExpander"] div, .streamlit-expanderContent * {
    color: #F8FAFC !important;
}

/* Tab labels */
[data-testid="stTabs"] button, .stTabs button {
    color: #FFFFFF !important;
    font-weight: 600 !important;
}

/* Text elements - target specifically */
.stMarkdown div,
.stMarkdown span,
[data-testid="stMarkdownContainer"] div,
[data-testid="stMarkdownContainer"] span {
    color: #F8FAFC !important;
}

/* Strong emphasis text should be bright white */
strong, b {
    color: #FFFFFF !important;
    font-weight: 700 !important;
}

/* Code blocks */
code, pre {
    background-color: #0F172A !important;
    color: #10B981 !important;
    border: 1px solid #475569 !important;
}

/* Lists - bullet points and ordered lists */
ul, ol, li {
    color: #F8FAFC !important;
}

ul li, ol li {
    color: #F8FAFC !important;
    opacity: 1.0 !important;
}

/* Markdown links */
a, a:link, a:visited {
    color: #10B981 !important;
    opacity: 1.0 !important;
}

a:hover {
    color: #059669 !important;
}

/* All markdown text content */
.stMarkdown, .stMarkdown * {
    color: #F8FAFC !important;
}

/* Specifically target all text nodes */
.stMarkdown p, .stMarkdown div, .stMarkdown span, 
.stMarkdown li, .stMarkdown ul, .stMarkdown ol {
    color: #F8FAFC !important;
    opacity: 1.0 !important;
}

/* Footer and legal text should be very visible */
.stMarkdown strong {
    color: #FFFFFF !important;
    font-weight: 700 !important;
}

/* NUMBER INPUTS - White text visible */
input[type="number"], input[type="text"], input[type="email"] {
    color: #FFFFFF !important;
    background-color: #1E293B !important;
}

/* SELECT DROPDOWNS - White text */
select, option {
    color: #FFFFFF !important;
    background-color: #1E293B !important;
}

/* TEXTAREA - White text */
textarea {
    color: #FFFFFF !important;
    background-color: #1E293B !important;
}

/* All form elements */
[data-baseweb="input"] input,
[data-baseweb="textarea"] textarea,
[data-baseweb="select"] {
    color: #FFFFFF !important;
    background-color: #1E293B !important;
}

/* MOBILE FIX: Move sidebar toggle button down to avoid status bar/notch */
@media only screen and (max-width: 768px) {
    /* Target the sidebar collapse button */
    button[kind="header"],
    [data-testid="baseButton-header"],
    [data-testid="collapsedControl"],
    .css-1dp5vir,
    .st-emotion-cache-1dp5vir {
        margin-top: 50px !important;
        top: 50px !important;
    }
    
    /* Also target the sidebar itself */
    section[data-testid="stSidebar"] {
        padding-top: 50px !important;
    }
}

/* Additional mobile viewport fix for safe area */
@supports (padding-top: env(safe-area-inset-top)) {
    @media only screen and (max-width: 768px) {
        button[kind="header"],
        [data-testid="baseButton-header"],
        [data-testid="collapsedControl"] {
            margin-top: calc(env(safe-area-inset-top) + 10px) !important;
            top: calc(env(safe-area-inset-top) + 10px) !important;
        }
    }
}
</style>
""", unsafe_allow_html=True)
    
    # Mobile mode indicator
    st.sidebar.markdown(f'<div class="mode-chip">Mode: {"📱 Mobile" if st.session_state.get("is_mobile", False) else "💻 Web"}</div>', unsafe_allow_html=True)

# Call the lazy-load styling function
load_app_styling()

# Mobile detection with tab click fix
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
    
    // REDIRECT logic: marketscannerpros.app → app.marketscannerpros.app
    // replit.app URL → mobile mode
    const hostname = window.location.hostname;
    
    if (hostname === 'marketscannerpros.app' || hostname === 'www.marketscannerpros.app') {
        // Redirect marketing domain to app subdomain
        const newUrl = 'https://app.marketscannerpros.app' + window.location.pathname + window.location.search;
        window.location.replace(newUrl);
        return; // Stop execution
    }
    
    // Force mobile mode for Replit URL
    if (hostname.includes('replit.app') && !mobileParam) {
        urlParams.set('mobile', '1');
        window.location.search = urlParams.toString();
        return;
    }
    
    // FORCE DARK MODE FOR ALL URLS - ALWAYS USE WORKING STYLING
    document.documentElement.setAttribute('data-mobile-dark', 'true');
    document.documentElement.style.colorScheme = 'dark';
    
    // AGGRESSIVE FIX - Force styles on all problematic elements
    function forceMobileStyles() {
        try {
            // Fix ALL dataframes and tables
            const dataframeSelectors = [
                '.stDataFrame', '[data-testid="stDataFrame"]', 
                '.stDataFrame table', '[data-testid="stDataFrame"] table',
                '.stDataFrame td', '[data-testid="stDataFrame"] td',
                '.stDataFrame th', '[data-testid="stDataFrame"] th',
                'table', 'td', 'th', 'tbody', 'thead',
                '.dataframe', '.dataframe td', '.dataframe th'
            ];
            dataframeSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.setProperty('color', '#FFFFFF', 'important');
                    el.style.setProperty('background-color', '#1E293B', 'important');
                });
            });
            
            // Fix ALL expanders and their content
            const expanderSelectors = [
                '[data-testid="stExpander"]', '.streamlit-expanderHeader',
                '[data-testid="stExpander"] *', '.streamlit-expanderContent',
                '[data-testid="stExpander"] div', '[data-testid="stExpander"] p',
                '[data-testid="stExpander"] span', '[data-testid="stExpander"] label'
            ];
            expanderSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.setProperty('color', '#FFFFFF', 'important');
                });
            });
            
            // Fix ALL metrics
            const metricSelectors = [
                '.stMetric', '[data-testid="metric-container"]',
                '.stMetric *', '[data-testid="metric-container"] *',
                '[data-testid="stMetricLabel"]', '[data-testid="stMetricValue"]'
            ];
            metricSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.setProperty('color', '#FFFFFF', 'important');
                    el.style.setProperty('background-color', 'transparent', 'important');
                });
            });
            
            // Fix chart CONTAINERS only - let Plotly handle chart rendering
            const chartContainers = ['.stPlotlyChart'];
            chartContainers.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    // Only set container background, don't touch SVG content
                    if (!el.tagName || el.tagName.toLowerCase() !== 'svg') {
                        el.style.setProperty('background-color', '#1E293B', 'important');
                    }
                });
            });
            
            // DO NOT force SVG text colors - Plotly handles this via template
        } catch(e) {
            console.log('Style fix error:', e);
        }
    }
    
    // ALWAYS apply fixes (both mobile and desktop)
    forceMobileStyles();
    // Re-apply after DOM changes
    setInterval(forceMobileStyles, 500);
    
    // Watch for new elements
    setTimeout(() => {
        const observer = new MutationObserver(() => {
            setTimeout(forceMobileStyles, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }, 1000);
    
    // Fix Streamlit tab click issues
    function fixTabClicks() {
        const tabButtons = document.querySelectorAll('[data-testid="stTabs"] button, .stTabs button');
        tabButtons.forEach(button => {
            button.style.pointerEvents = 'auto';
            button.style.cursor = 'pointer';
            button.style.zIndex = '1000';
            // Ensure clicks register immediately
            button.addEventListener('click', function(e) {
                e.stopImmediatePropagation();
            }, { capture: true });
        });
    }
    
    // Apply fix after page loads and on DOM changes
    document.addEventListener('DOMContentLoaded', fixTabClicks);
    setTimeout(fixTabClicks, 500);
    setTimeout(fixTabClicks, 1000);
    
    // Auto-redirect iOS devices to add mobile parameter
    if (isIOS && !mobileParam && !window.__reloadedForMobile) {
        window.__reloadedForMobile = true;
        urlParams.set('mobile', '1');
        window.location.search = urlParams.toString();
    }
})();
</script>
""", unsafe_allow_html=True)


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
    """Get or create a persistent device fingerprint - URL-based persistence"""
    # Check if we already have a device fingerprint in session state
    if 'device_fingerprint' in st.session_state and st.session_state.device_fingerprint:
        return st.session_state.device_fingerprint
    
    # Check for workspace ID in URL (primary persistence method)
    query_params = st.query_params
    workspace_id_from_url = query_params.get('wid', None)
    if isinstance(workspace_id_from_url, list):
        workspace_id_from_url = workspace_id_from_url[0] if workspace_id_from_url else None
    
    if workspace_id_from_url:
        # Use existing workspace ID from URL
        st.session_state.device_fingerprint = workspace_id_from_url
        st.session_state.workspace_id = workspace_id_from_url
        return workspace_id_from_url
    
    # Check for pairing token in URL (from QR code scan)
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
            # Redirect to URL with workspace ID for persistence
            st.query_params['wid'] = workspace_id
            st.success("🎉 Device successfully paired! You now have access to all your Pro features.")
            st.rerun()
            return new_fingerprint
        else:
            st.error("❌ Invalid or expired pairing code. Please try again.")
    
    # Generate new fingerprint and add to URL
    new_fingerprint = str(uuid.uuid4())
    st.session_state.device_fingerprint = new_fingerprint
    
    # Add workspace ID to URL for persistence
    st.query_params['wid'] = new_fingerprint
    
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

def set_subscription_override(workspace_id: str, tier: str, set_by: str, expires_at: Optional[datetime] = None) -> bool:
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

# ================= TradingView Integration =================
def send_tradingview_notification_to_admin(customer_email: str, tradingview_username: str, workspace_id: str) -> bool:
    """Send email notification to admin when Pro Trader submits TradingView username"""
    try:
        admin_email = os.getenv('ADMIN_EMAIL', 'support@marketscannerpros.app')
        
        subject = f"🎯 New TradingView Access Request - {tradingview_username}"
        
        body = f"""
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; color: #10B981;">🎯 TradingView Access Request</h2>
    </div>
    <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
        <h3 style="color: #0F172A; margin-top: 0;">Pro Trader Member Submitted TradingView Username</h3>
        
        <div style="background: white; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Customer Email:</strong> {customer_email}</p>
            <p style="margin: 5px 0;"><strong>TradingView Username:</strong> <span style="color: #10B981; font-weight: bold;">{tradingview_username}</span></p>
            <p style="margin: 5px 0;"><strong>Workspace ID:</strong> {workspace_id}</p>
        </div>
        
        <div style="background: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e;">
                <strong>⚡ Action Required:</strong><br/>
                Add <strong>{tradingview_username}</strong> to the invite-only Pine Scripts in TradingView:
            </p>
            <ul style="margin: 10px 0; color: #92400e;">
                <li>MarketScanner Pros — Confluence Strategy</li>
                <li>MarketScanner Pros — Live Signals</li>
            </ul>
        </div>
        
        <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
            Customer expects access within 24 hours. They will receive a TradingView notification when added.
        </p>
    </div>
</div>
"""
        
        # Use existing email function to send to admin
        return send_email_to_user(subject, body, admin_email)
        
    except Exception as e:
        print(f"Error sending TradingView notification to admin: {e}")
        return False

def save_tradingview_username(workspace_id: str, username: str) -> bool:
    """Save TradingView username for Pro Trader member and notify admin"""
    try:
        # Save to database
        query = """
            UPDATE workspaces 
            SET tradingview_username = %s, tradingview_submitted_at = NOW()
            WHERE id = %s
        """
        result = execute_db_write(query, (username.strip(), workspace_id))
        
        if result is not None and result >= 0:
            # Get customer email from session state
            customer_email = st.session_state.get('user_email', 'No email provided')
            
            # If no email in session, use default
            if not customer_email or customer_email == 'No email provided':
                customer_email = 'No email provided'
            
            # Send notification to admin
            send_tradingview_notification_to_admin(customer_email, username.strip(), workspace_id)
            
            return True
        return False
        
    except Exception as e:
        print(f"Error saving TradingView username: {e}")
        return False

def get_tradingview_username(workspace_id: str) -> Optional[str]:
    """Get stored TradingView username"""
    try:
        query = "SELECT tradingview_username FROM workspaces WHERE id = %s"
        result = execute_db_query(query, (workspace_id,))
        if result and len(result) > 0:
            return result[0].get('tradingview_username')
        return None
    except:
        return None

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
        params.append(since)  # type: ignore
    
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
    qr = qrcode.QRCode(version=1, box_size=10, border=5)  # type: ignore
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
    
    # Validate required fields
    if not workspace_id:
        st.error("Error: No workspace found. Please log in again.")
        return False
    
    if not symbol or not symbol.strip():
        st.error("Error: Symbol is required.")
        return False
        
    if alert_type not in ['above', 'below']:
        st.error("Error: Invalid alert type.")
        return False
        
    if notification_method not in ['in_app', 'email', 'both', 'none']:
        st.error("Error: Invalid notification method.")
        return False
    
    # If user_email is empty, use 'anonymous' 
    if not user_email or user_email.strip() == '':
        user_email = 'anonymous'
    
    query = """
        INSERT INTO price_alerts (symbol, alert_type, target_price, notification_method, user_email, workspace_id) 
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    
    try:
        result = execute_db_write(query, (symbol.strip().upper(), alert_type, target_price, notification_method, user_email, workspace_id))
        return result is not None and result > 0
    except Exception as e:
        st.error(f"Database error: {str(e)}")
        return False

def get_active_alerts(workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get active price alerts for current workspace only (tenant-isolated)"""
    if not workspace_id:
        workspace_id = st.session_state.get('workspace_id')
    
    if not workspace_id:
        return []  # No workspace = no alerts (prevents cross-tenant access)
    
    query = "SELECT * FROM price_alerts WHERE is_active = TRUE AND workspace_id = %s ORDER BY created_at DESC"
    result = execute_db_query(query, (workspace_id,))
    return result if result else []

def get_all_alerts(workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all price alerts for current workspace only (tenant-isolated)"""
    if not workspace_id:
        workspace_id = st.session_state.get('workspace_id')
    
    if not workspace_id:
        return []  # No workspace = no alerts (prevents cross-tenant access)
    
    query = "SELECT * FROM price_alerts WHERE workspace_id = %s ORDER BY created_at DESC"
    result = execute_db_query(query, (workspace_id,))
    return result if result else []

def trigger_alert(alert_id: int, current_price: float, workspace_id: Optional[str] = None) -> bool:
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

def delete_alert(alert_id: int, workspace_id: Optional[str] = None) -> bool:
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
    
    # Send email notification if email method selected
    if alert.get('notification_method') in ['email', 'both'] and user_email and user_email != 'system':
        try:
            email_sent = send_email_to_user(subject, message, user_email)
            if email_sent:
                print(f"✅ Email alert sent to {user_email} for {symbol}")
        except Exception as e:
            print(f"❌ Email notification failed for {user_email}: {e}")
    
    # Note: "Both" method already stores in-app notification above + sends email above

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
def get_ohlcv_yf(symbol: str, timeframe: str, period: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
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

def get_ohlcv(symbol: str, timeframe: str, period: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
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

def compute_features(df: pd.DataFrame, custom_settings=None) -> pd.DataFrame:
    out = df.copy()
    
    # Get custom periods or use defaults
    if custom_settings and custom_settings.get('enabled'):
        periods = custom_settings.get('periods', {})
        rsi_period = periods.get('rsi', 14)
        ema_long = periods.get('ema_long', 200)
        bb_period = periods.get('bb', 20)
        breakout_period = periods.get('breakout', 20)
    else:
        rsi_period = 14
        ema_long = 200
        bb_period = 20
        breakout_period = 20
    
    out["ema8"]   = _ema(out["close"], 8)
    out["ema21"]  = _ema(out["close"], 21)
    out["ema50"]  = _ema(out["close"], 50)
    out["ema200"] = _ema(out["close"], ema_long)
    out["rsi"]    = _rsi(out["close"], rsi_period)

    macd_fast = _ema(out["close"], 12); macd_slow = _ema(out["close"], 26)
    macd_line = macd_fast - macd_slow
    signal    = macd_line.ewm(span=9, adjust=False).mean()
    out["macd_hist"] = macd_line - signal

    out["atr"]        = _atr(out["high"], out["low"], out["close"], 14)
    out["bb_width"]   = _bb_width(out["close"], bb_period, 2.0)
    out["vol_ma20"]   = out["volume"].rolling(bb_period).mean()
    out["vol_z"]      = (out["volume"] - out["vol_ma20"]) / out["vol_ma20"].replace(0, np.nan)
    out["close_20_max"] = out["close"].rolling(breakout_period).max()
    out["close_20_min"] = out["close"].rolling(breakout_period).min()
    out["bb_width_ma"]  = out["bb_width"].rolling(bb_period).mean()
    return out

# ================= Scoring =================
def score_row(r, custom_settings=None) -> float:
    # Get custom weights and thresholds or use defaults
    if custom_settings and custom_settings.get('enabled'):
        weights = custom_settings.get('weights', {})
        thresholds = custom_settings.get('thresholds', {})
        
        regime_weight = weights.get('regime', 25)
        structure_weight = weights.get('structure', 25)
        rsi_weight = weights.get('rsi', 10)
        macd_weight = weights.get('macd', 10)
        volume_weight = weights.get('volume', 8)
        volatility_weight = weights.get('volatility', 7)
        tradability_weight = weights.get('tradability', 5)
        overextension_penalty = weights.get('overextension_penalty', 10)
        
        rsi_bull = thresholds.get('rsi_bull', 50)
        rsi_overbought = thresholds.get('rsi_overbought', 80)
        rsi_oversold = thresholds.get('rsi_oversold', 20)
        volume_z = thresholds.get('volume_z', 0.5)
        atr_pct_max = thresholds.get('atr_pct', 0.04)
    else:
        # Default weights
        regime_weight = 25
        structure_weight = 25
        rsi_weight = 10
        macd_weight = 10
        volume_weight = 8
        volatility_weight = 7
        tradability_weight = 5
        overextension_penalty = 10
        
        # Default thresholds
        rsi_bull = 50
        rsi_overbought = 80
        rsi_oversold = 20
        volume_z = 0.5
        atr_pct_max = 0.04
    
    s = 0.0
    # Market Regime
    s += regime_weight if r.close > r.ema200 else -regime_weight
    # Price Structure
    s += structure_weight if r.close > r["close_20_max"] else 0
    s -= structure_weight if r.close < r["close_20_min"] else 0
    # RSI Momentum
    s += rsi_weight if (pd.notna(r.rsi) and r.rsi > rsi_bull) else -rsi_weight
    # MACD
    s += macd_weight if (pd.notna(r.macd_hist) and r.macd_hist > 0) else -macd_weight
    # Volume Expansion
    s += volume_weight if (pd.notna(r.vol_z) and r.vol_z > volume_z) else 0
    # Volatility Expansion
    s += volatility_weight if (pd.notna(r.bb_width) and pd.notna(r.bb_width_ma) and r.bb_width > r.bb_width_ma) else 0
    # Tradability
    atr_pct = (r.atr / r.close) if (pd.notna(r.atr) and r.close) else np.nan
    s += tradability_weight if (pd.notna(atr_pct) and atr_pct < atr_pct_max) else 0
    # Overextension Penalties/Rewards
    s -= overextension_penalty if (pd.notna(r.rsi) and r.rsi > rsi_overbought) else 0
    s += overextension_penalty if (pd.notna(r.rsi) and r.rsi < rsi_oversold) else 0
    return float(s)

# ================= Position sizing =================
def position_sizing(last, direction: str, account_equity: float, risk_pct: float, stop_mult: float):
    """
    Returns (size_units, risk_$, notional_$, stop_price)
    """
    # Handle NaN or zero ATR - use 1% of price as fallback
    atr_value = last.atr if pd.notna(last.atr) and last.atr > 0 else (last.close * 0.01)
    
    stop_price = last.close - stop_mult*atr_value if direction=="Bullish" else last.close + stop_mult*atr_value
    per_unit_risk = abs(last.close - stop_price)
    risk_dollars  = account_equity * risk_pct
    size_units = 0 if per_unit_risk <= 0 else floor(risk_dollars / per_unit_risk)
    notional = size_units * last.close
    return size_units, risk_dollars, notional, stop_price

# ================= Scanner =================
@st.cache_data(show_spinner=False, ttl=300)
def scan_universe(symbols: List[str], timeframe: str, is_crypto: bool,
                  account_equity: float, risk_pct: float, stop_mult: float, min_vol: float, 
                  custom_settings: dict = None) -> Tuple[pd.DataFrame, pd.DataFrame]:
    rows, errs = [], []
    for sym in symbols:
        try:
            df = get_ohlcv(sym, timeframe)
            if len(df) < min_bars_required(timeframe):
                raise ValueError(f"Not enough history ({len(df)}) for {timeframe}")
            
            # Skip dollar volume check for forex (=X) and commodities (=F)
            is_forex = sym.endswith("=X")
            is_commodity = sym.endswith("=F")
            
            if not is_crypto and not is_forex and not is_commodity and dollar_volume(df) < min_vol:
                raise ValueError(f"Below min dollar vol ({min_vol:,.0f})")

            f = compute_features(df, custom_settings).dropna()
            if f.empty:
                raise ValueError("Features empty after dropna()")
            last = f.iloc[-1]
            sc = score_row(last, custom_settings)
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

def mark_notification_read(notification_id: int, workspace_id: str, user_email: Optional[str] = None):
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
    """Send email via Resend connector - direct integration"""
    try:
        api_key = None
        from_email = 'onboarding@resend.dev'
        
        # First, try to get API key from Secrets (user-added)
        api_key = os.getenv('RESEND_API_KEY') or os.getenv('Resend')
        
        # If not in secrets, try Resend connector
        if not api_key:
            hostname = os.getenv('REPLIT_CONNECTORS_HOSTNAME')
            x_replit_token = os.getenv('REPL_IDENTITY')
            
            if hostname and x_replit_token:
                # Fetch Resend credentials from connector
                connector_response = requests.get(
                    f'https://{hostname}/api/v2/connection?include_secrets=true&connector_names=resend',
                    headers={
                        'Accept': 'application/json',
                        'X_REPLIT_TOKEN': f'repl {x_replit_token}'
                    },
                    timeout=10
                )
                
                if connector_response.status_code == 200:
                    connector_data = connector_response.json()
                    resend_settings = connector_data.get('items', [{}])[0].get('settings', {})
                    api_key = resend_settings.get('api_key')
                    from_email = resend_settings.get('from_email', 'onboarding@resend.dev')
        
        # If we have an API key from either source, send the email
        if api_key:
                    # Send email directly using Resend API
                    html_body = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
                            <h2 style="margin: 0; color: #10B981;">📈 Market Scanner Alert</h2>
                        </div>
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
                            <h3 style="color: #0F172A; margin-top: 0;">{subject}</h3>
                            <div style="white-space: pre-line; color: #374151; line-height: 1.6;">
{body}
                            </div>
                            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
                            <p style="color: #6b7280; font-size: 14px; margin: 0;">
                                This alert was sent by MarketScanner Pro<br>
                                <a href="https://marketscannerpros.app" style="color: #10B981;">Visit Dashboard</a> | 
                                <a href="https://app.marketscannerpros.app" style="color: #10B981;">Open Scanner</a>
                            </p>
                        </div>
                    </div>
                    """
                    
                    resend_response = requests.post(
                        'https://api.resend.com/emails',
                        headers={
                            'Authorization': f'Bearer {api_key}',
                            'Content-Type': 'application/json'
                        },
                        json={
                            'from': from_email,
                            'to': [to_email],
                            'subject': subject,
                            'html': html_body
                        },
                        timeout=10
                    )
                    
                    if resend_response.status_code == 200:
                        # Email sent successfully
                        workspace_id = st.session_state.get('workspace_id')
                        if workspace_id:
                            store_notification(subject, f"✅ Email sent to {to_email}\n\n{body}", to_email, workspace_id)
                        return True
                    else:
                        # Email failed - store as in-app notification instead
                        workspace_id = st.session_state.get('workspace_id')
                        if workspace_id:
                            # Store the notification without error details (clean display)
                            store_notification(f"📧 {subject}", f"Alert for {to_email}:\n\n{body}\n\n💡 Note: Email delivery temporarily unavailable. Update Resend API key in Connectors to enable email.", to_email, workspace_id)
                        return True  # Return True so alerts continue working
        
        # Fallback: store in database as notification
        workspace_id = st.session_state.get('workspace_id')
        if workspace_id:
            store_notification(f"📧 {subject}", f"Alert for {to_email}:\n\n{body}\n\n💡 Note: Email delivery temporarily unavailable. Update Resend API key in Connectors to enable email.", to_email, workspace_id)
        return True
            
    except Exception as e:
        # Fallback to database storage on any error
        workspace_id = st.session_state.get('workspace_id')
        if workspace_id:
            store_notification(f"📧 {subject}", f"Alert for {to_email}:\n\n{body}\n\n💡 Note: Email delivery temporarily unavailable. Update Resend API key in Connectors to enable email.", to_email, workspace_id)
        else:
            # Show immediate notification if no workspace
            st.info(f"📧 Alert created (email temporarily unavailable)")
            st.info(f"**{subject}**")
            with st.expander("📄 View Message", expanded=True):
                st.write(body)
        return True  # Return True so alerts continue working

def send_backtesting_signal_alert(signal_type: str, symbol: str, price: float, details: Dict[str, Any], user_email: str) -> bool:
    """Send email alert when backtesting generates a buy or sell signal (Pro Trader exclusive)"""
    try:
        # Format signal details
        signal_emoji = "🟢 BUY" if signal_type.lower() == "buy" else "🔴 SELL"
        
        subject = f"{signal_emoji} Signal: {symbol} @ ${price:.2f}"
        
        body = f"""
{signal_emoji} SIGNAL ALERT

Symbol: {symbol}
Signal Type: {signal_type.upper()}
Price: ${price:.2f}
Date: {details.get('date', 'N/A')}

Strategy Details:
• Entry Price: ${details.get('entry_price', price):.2f}
• Stop Loss: ${details.get('stop_price', 'N/A')}
• Position Size: {details.get('position_size', 'N/A')} shares
• Score: {details.get('score', 'N/A')}

Risk Management:
• Risk Amount: ${details.get('risk_amount', 'N/A')}
• Position Value: ${details.get('position_value', 'N/A')}

This signal was generated by your backtesting strategy.
Log into the dashboard to review the full analysis.
        """
        
        # Send email
        return send_email_to_user(subject, body.strip(), user_email)
            
    except Exception as e:
        print(f"Error sending backtesting alert: {e}")
        return False

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

def get_user_notification_preferences(user_email: str) -> Optional[Dict[str, Any]]:
    """Get user notification preferences from database"""
    try:
        query = "SELECT * FROM user_notification_preferences WHERE user_email = %s"
        result = execute_db_query(query, (user_email,))
        return result[0] if result else None
    except Exception as e:
        return None

def get_notification_preferences_for_alert(alert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
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
def create_advanced_chart(symbol: str, timeframe: str = "1D", indicators: Optional[List[str]] = None) -> Optional[go.Figure]:
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
            fig.add_hline(y=70, line_dash="dash", line_color="red", opacity=0.5, row=current_row)  # type: ignore
            fig.add_hline(y=30, line_dash="dash", line_color="green", opacity=0.5, row=current_row)  # type: ignore
            fig.add_hline(y=50, line_dash="dot", line_color="gray", opacity=0.3, row=current_row)  # type: ignore
            
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
            template="plotly_dark",
            paper_bgcolor='#1E293B',
            plot_bgcolor='#1E293B'
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

# ================= Trade Journal Functions =================
def init_trade_journal_table():
    """Create trade_journal table if it doesn't exist"""
    create_table_query = """
    CREATE TABLE IF NOT EXISTS trade_journal (
        id SERIAL PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        entry_date TIMESTAMP NOT NULL,
        entry_price DECIMAL(12,4) NOT NULL,
        exit_date TIMESTAMP,
        exit_price DECIMAL(12,4),
        quantity DECIMAL(12,4) NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
        trade_type TEXT DEFAULT 'Spot' CHECK (trade_type IN ('Spot', 'Leverage')),
        strike_price DECIMAL(12,4),
        expiration_date DATE,
        stop_loss DECIMAL(12,4),
        take_profit DECIMAL(12,4),
        pnl DECIMAL(12,2),
        pnl_pct DECIMAL(8,2),
        r_multiple DECIMAL(8,2),
        setup_type TEXT,
        entry_reason TEXT,
        exit_reason TEXT,
        mistakes_learned TEXT,
        tags TEXT[],
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_trade_journal_workspace ON trade_journal(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_trade_journal_symbol ON trade_journal(symbol);
    CREATE INDEX IF NOT EXISTS idx_trade_journal_entry_date ON trade_journal(entry_date DESC);
    """
    execute_db_write(create_table_query)
    
    try:
        # Drop old constraint and add new one with more trade types
        execute_db_write("ALTER TABLE trade_journal DROP CONSTRAINT IF EXISTS trade_journal_trade_type_check")
        execute_db_write("ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS trade_type TEXT DEFAULT 'Spot'")
        execute_db_write("ALTER TABLE trade_journal DROP CONSTRAINT IF EXISTS trade_journal_trade_type_check")
        execute_db_write("ALTER TABLE trade_journal ADD CONSTRAINT trade_journal_trade_type_check CHECK (trade_type IN ('Spot', 'Options', 'Futures', 'Margin'))")
        
        # Options-specific columns
        execute_db_write("ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS option_type TEXT CHECK (option_type IN ('CALL', 'PUT', NULL))")
        execute_db_write("ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS premium_per_contract DECIMAL(12,4)")
        execute_db_write("ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS num_contracts INTEGER")
        execute_db_write("ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS contract_multiplier INTEGER DEFAULT 100")
        
        # Legacy fields
        execute_db_write("ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS strike_price DECIMAL(12,4)")
        execute_db_write("ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS expiration_date DATE")
    except Exception as e:
        pass

def add_trade_to_journal(workspace_id: str, symbol: str, entry_date, entry_price: float, 
                         quantity: float, direction: str, trade_type: str = "Spot",
                         strike_price: Optional[float] = None, expiration_date = None,
                         stop_loss: Optional[float] = None, 
                         take_profit: Optional[float] = None, setup_type: Optional[str] = None, 
                         entry_reason: Optional[str] = None, tags: Optional[List[str]] = None,
                         option_type: Optional[str] = None, premium_per_contract: Optional[float] = None,
                         num_contracts: Optional[int] = None, contract_multiplier: int = 100) -> bool:
    """Add new trade to journal"""
    try:
        query = """
        INSERT INTO trade_journal 
        (workspace_id, symbol, entry_date, entry_price, quantity, direction, trade_type,
         strike_price, expiration_date, stop_loss, take_profit, setup_type, entry_reason, tags,
         option_type, premium_per_contract, num_contracts, contract_multiplier, is_active)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
        RETURNING id
        """
        params = (workspace_id, symbol.upper(), entry_date, entry_price, quantity, 
                 direction, trade_type, strike_price, expiration_date, stop_loss, take_profit, 
                 setup_type, entry_reason, tags, option_type, premium_per_contract, num_contracts, contract_multiplier)
        result = execute_db_write_returning(query, params)
        return result is not None
    except Exception as e:
        st.error(f"Failed to add trade: {e}")
        return False

def close_trade(trade_id: int, exit_date, exit_price: float, 
                exit_reason: Optional[str] = None, mistakes_learned: Optional[str] = None) -> bool:
    """Close an active trade and calculate P&L"""
    try:
        trade = execute_db_query("SELECT * FROM trade_journal WHERE id = %s", (trade_id,))
        if not trade or len(trade) == 0:
            return False
        
        trade = trade[0]
        entry_price = float(trade['entry_price'])
        quantity = float(trade['quantity'])
        direction = trade['direction']
        trade_type = trade.get('trade_type', 'Spot')
        stop_loss = float(trade['stop_loss']) if trade['stop_loss'] else None
        
        # For options, use contract multiplier
        multiplier = 1
        if trade_type == 'Options':
            num_contracts = trade.get('num_contracts') or 1
            contract_multiplier = trade.get('contract_multiplier') or 100
            multiplier = num_contracts * contract_multiplier
            # For options, entry_price and exit_price are premiums per contract
        
        # Calculate P&L
        if direction == 'LONG':
            pnl = (exit_price - entry_price) * (quantity if trade_type != 'Options' else multiplier)
            pnl_pct = ((exit_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0
        else:
            pnl = (entry_price - exit_price) * (quantity if trade_type != 'Options' else multiplier)
            pnl_pct = ((entry_price - exit_price) / entry_price) * 100 if entry_price > 0 else 0
        
        # Calculate R-multiple
        r_multiple = None
        if stop_loss:
            risk_per_unit = abs(entry_price - stop_loss)
            if risk_per_unit > 0:
                total_risk = risk_per_unit * (quantity if trade_type != 'Options' else multiplier)
                r_multiple = pnl / total_risk if total_risk > 0 else 0
        
        query = """
        UPDATE trade_journal 
        SET exit_date = %s, exit_price = %s, pnl = %s, pnl_pct = %s, 
            r_multiple = %s, exit_reason = %s, mistakes_learned = %s, 
            is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """
        params = (exit_date, exit_price, pnl, pnl_pct, r_multiple, 
                 exit_reason, mistakes_learned, trade_id)
        execute_db_write(query, params)
        return True
    except Exception as e:
        st.error(f"Failed to close trade: {e}")
        return False

def get_trade_journal(workspace_id: str, active_only: bool = False, 
                     limit: int = 100) -> Optional[List[Dict]]:
    """Get trade journal entries"""
    try:
        if active_only:
            query = """
            SELECT * FROM trade_journal 
            WHERE workspace_id = %s AND is_active = TRUE
            ORDER BY entry_date DESC
            LIMIT %s
            """
        else:
            query = """
            SELECT * FROM trade_journal 
            WHERE workspace_id = %s
            ORDER BY entry_date DESC
            LIMIT %s
            """
        result = execute_db_query(query, (workspace_id, limit))
        return result if result else []
    except Exception:
        return []

def calculate_journal_stats(workspace_id: str) -> Dict[str, Any]:
    """Calculate performance statistics from trade journal"""
    try:
        trades = get_trade_journal(workspace_id, active_only=False)
        if not trades:
            trades = []
        
        active_trades = [t for t in trades if t['is_active']]
        closed_trades = [t for t in trades if not t['is_active']]
        total_trades = len(trades)
        
        if not closed_trades:
            return {
                'total_trades': total_trades,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'avg_win': 0,
                'avg_loss': 0,
                'avg_r': 0,
                'profit_factor': 0,
                'largest_win': 0,
                'largest_loss': 0,
                'active_trades': len(active_trades)
            }
        winning_trades = [t for t in closed_trades if float(t['pnl']) > 0]
        losing_trades = [t for t in closed_trades if float(t['pnl']) < 0]
        
        win_count = len(winning_trades)
        loss_count = len(losing_trades)
        closed_trades_count = len(closed_trades)
        win_rate = (win_count / closed_trades_count * 100) if closed_trades_count > 0 else 0
        
        total_pnl = sum(float(t['pnl']) for t in closed_trades)
        avg_win = sum(float(t['pnl']) for t in winning_trades) / win_count if win_count > 0 else 0
        avg_loss = sum(float(t['pnl']) for t in losing_trades) / loss_count if loss_count > 0 else 0
        
        r_trades = [t for t in closed_trades if t['r_multiple'] is not None]
        avg_r = sum(float(t['r_multiple']) for t in r_trades) / len(r_trades) if r_trades else 0
        
        gross_profit = sum(float(t['pnl']) for t in winning_trades)
        gross_loss = abs(sum(float(t['pnl']) for t in losing_trades))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0
        
        largest_win = max((float(t['pnl']) for t in winning_trades), default=0)
        largest_loss = min((float(t['pnl']) for t in losing_trades), default=0)
        
        return {
            'total_trades': total_trades,
            'winning_trades': win_count,
            'losing_trades': loss_count,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'avg_r': avg_r,
            'profit_factor': profit_factor,
            'largest_win': largest_win,
            'largest_loss': largest_loss,
            'active_trades': len(active_trades)
        }
    except Exception as e:
        st.error(f"Failed to calculate stats: {e}")
        return {}

def delete_trade(trade_id: int) -> bool:
    """Delete a trade from journal"""
    try:
        execute_db_write("DELETE FROM trade_journal WHERE id = %s", (trade_id,))
        return True
    except:
        return False

# Initialize trade journal table on startup
try:
    init_trade_journal_table()
except:
    pass

# ================= Backtesting Engine =================
def run_backtest(symbols: List[str], start_date: str, end_date: str, timeframe: str = "1D", 
                initial_equity: float = 10000, risk_per_trade: float = 0.01, 
                stop_atr_mult: float = 1.5, min_score: float = 10, 
                enable_alerts: bool = False, user_email: Optional[str] = None) -> Dict[str, Any]:
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
                df = get_ohlcv(symbol, timeframe, start=start_date, end=end_date)
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
                        
                        # Send SELL signal alert (Pro Trader feature)
                        if enable_alerts and user_email:
                            alert_details = {
                                'date': str(current_date),
                                'entry_price': position['entry_price'],
                                'exit_price': exit_price,
                                'stop_price': position['stop_price'],
                                'position_size': position['position_size'],
                                'position_value': position['position_value'],
                                'trade_pnl': trade_pnl,
                                'trade_return': trade_return * 100,  # As percentage
                                'exit_reason': exit_reason,
                                'holding_days': (current_date - position['entry_date']).days
                            }
                            send_backtesting_signal_alert("SELL", symbol, exit_price, alert_details, user_email)
                        
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
                    
                    # Send BUY signal alert (Pro Trader feature)
                    if enable_alerts and user_email:
                        alert_details = {
                            'date': str(current_date),
                            'entry_price': entry_price,
                            'stop_price': stop_price,
                            'position_size': position_size,
                            'position_value': position_value,
                            'score': row['score'],
                            'risk_amount': risk_amount
                        }
                        send_backtesting_signal_alert("BUY", symbol, entry_price, alert_details, user_email)
            
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
        config = convert_numpy_types(config)  # type: ignore
        results = convert_numpy_types(results)  # type: ignore
        
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

def create_backtest_chart(results: Dict[str, Any]) -> Optional[go.Figure]:
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
        template="plotly_dark",
        paper_bgcolor='#1E293B',
        plot_bgcolor='#1E293B'
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

def get_aud_to_usd_rate() -> float:
    """Get current AUD to USD exchange rate"""
    try:
        ticker = yf.Ticker("AUDUSD=X")
        hist = ticker.history(period="1d")
        if not hist.empty:
            return float(hist['Close'].iloc[-1])
    except:
        pass
    return 0.65  # Fallback rate if API fails

# CoinGecko symbol mapping for crypto tokens
COINGECKO_SYMBOL_MAP = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'XRP': 'ripple',
    'XXRP': 'ripple',
    'SOL': 'solana',
    'DOGE': 'dogecoin',
    'ADA': 'cardano',
    'AVAX': 'avalanche-2',
    'DOT': 'polkadot',
    'LINK': 'chainlink',
    'MATIC': 'matic-network',
    'UNI': 'uniswap',
    'ATOM': 'cosmos',
    'LTC': 'litecoin',
    'FIL': 'filecoin',
    'NEAR': 'near',
    'APT': 'aptos',
    'ARB': 'arbitrum',
    'OP': 'optimism',
    'SUI': 'sui',
    'SEI': 'sei-network',
    'INJ': 'injective-protocol',
    'TIA': 'celestia',
    'JUP': 'jupiter-exchange-solana',
    'RENDER': 'render-token',
    'REN': 'republic-protocol',
    'FET': 'fetch-ai',
    'HBAR': 'hedera-hashgraph',
    'XLM': 'stellar',
    'KAS': 'kaspa',
    'ALGO': 'algorand',
    'VET': 'vechain',
    'SAND': 'the-sandbox',
    'MANA': 'decentraland',
    'AXS': 'axie-infinity',
    'AAVE': 'aave',
    'CRV': 'curve-dao-token',
    'MKR': 'maker',
    'SNX': 'havven',
    'COMP': 'compound-governance-token',
    'LDO': 'lido-dao',
    'RPL': 'rocket-pool',
    'GMX': 'gmx',
    'PEPE': 'pepe',
    'SHIB': 'shiba-inu',
    'BONK': 'bonk',
    'WIF': 'dogwifcoin',
    'FLOKI': 'floki',
}

# Cache for CoinGecko prices (batched fetch)
_coingecko_price_cache = {}
_coingecko_cache_time = 0

def fetch_all_coingecko_prices() -> dict:
    """Fetch ALL crypto prices in one API call to avoid rate limits"""
    global _coingecko_price_cache, _coingecko_cache_time
    import time
    
    # Use cache if less than 60 seconds old
    if time.time() - _coingecko_cache_time < 60 and _coingecko_price_cache:
        return _coingecko_price_cache
    
    try:
        # Batch all coin IDs into one request
        all_coin_ids = ','.join(COINGECKO_SYMBOL_MAP.values())
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={all_coin_ids}&vs_currencies=usd"
        response = requests.get(url, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            # Build reverse lookup: symbol -> price
            reverse_map = {v: k for k, v in COINGECKO_SYMBOL_MAP.items()}
            price_cache = {}
            for coin_id, prices in data.items():
                if 'usd' in prices:
                    symbol = reverse_map.get(coin_id, coin_id.upper())
                    price_cache[symbol] = prices['usd']
            _coingecko_price_cache = price_cache
            _coingecko_cache_time = time.time()
            return price_cache
    except Exception as e:
        print(f"CoinGecko batch fetch error: {e}")
    
    return _coingecko_price_cache  # Return old cache on error

def get_price_from_coingecko(symbol: str) -> Optional[float]:
    """Get price from CoinGecko API for crypto tokens"""
    try:
        # Extract base symbol from format like "JUP-USD" or "BTC-AUD"
        if '-' in symbol:
            base = symbol.split('-')[0].upper()
        else:
            base = symbol.upper()
        
        # Get all prices in one call (cached)
        prices = fetch_all_coingecko_prices()
        
        if base in prices:
            return float(prices[base])
        
        # Fallback: try direct API call for unknown tokens
        coin_id = COINGECKO_SYMBOL_MAP.get(base)
        if not coin_id:
            coin_id = base.lower()
        
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if coin_id in data and 'usd' in data[coin_id]:
                price = float(data[coin_id]['usd'])
                if price > 0:
                    return price
    except Exception as e:
        print(f"CoinGecko error for {symbol}: {e}")
    
    return None

def get_current_price_portfolio(symbol: str) -> Optional[float]:
    """Get current price for portfolio calculations with robust fallbacks - returns USD normalized price"""
    
    # Determine if this is a crypto symbol (contains dash like BTC-USD, JUP-USD, etc.)
    is_crypto = '-' in symbol and symbol.split('-')[1] in ['USD', 'AUD', 'USDT', 'BUSD']
    
    # For crypto tokens, try CoinGecko FIRST (more reliable for altcoins)
    if is_crypto:
        coingecko_price = get_price_from_coingecko(symbol)
        if coingecko_price and coingecko_price > 0:
            return coingecko_price
    
    # Try Yahoo Finance as fallback
    try:
        ticker = yf.Ticker(symbol)
        
        # Try fast_info first (fastest)
        try:
            price = ticker.fast_info.get('lastPrice')
            if price and price > 0:
                price = float(price)
                # Convert AUD to USD if needed
                if symbol.endswith('-AUD'):
                    aud_usd_rate = get_aud_to_usd_rate()
                    price = price * aud_usd_rate
                return price
        except Exception:
            pass
        
        # Fallback to recent minute data
        try:
            hist = ticker.history(period="1d", interval="1m")
            if not hist.empty:
                price = float(hist['Close'].iloc[-1])
                if price and price > 0:
                    # Convert AUD to USD if needed
                    if symbol.endswith('-AUD'):
                        aud_usd_rate = get_aud_to_usd_rate()
                        price = price * aud_usd_rate
                    return price
        except Exception:
            pass
            
        # Final fallback to daily data
        try:
            hist = ticker.history(period="2d")
            if not hist.empty:
                price = float(hist['Close'].iloc[-1])
                if price and price > 0:
                    # Convert AUD to USD if needed
                    if symbol.endswith('-AUD'):
                        aud_usd_rate = get_aud_to_usd_rate()
                        price = price * aud_usd_rate
                    return price
        except Exception:
            pass
            
    except Exception:
        pass
    
    # If crypto symbol failed Yahoo, try alternative Yahoo formats
    if is_crypto:
        base, quote = symbol.split('-', 1)
        alternatives = [
            f"{base}-USD",  # Standard USD pair
            f"{base}USD=X",  # Yahoo Finance crypto format
            f"{base}-USDT",  # Tether pair
        ]
            
        for alt_symbol in alternatives:
            if alt_symbol != symbol:
                try:
                    ticker = yf.Ticker(alt_symbol)
                    hist = ticker.history(period="2d")
                    if not hist.empty:
                        price = float(hist['Close'].iloc[-1])
                        if price and price > 0:
                            return price
                except Exception:
                    continue
    
    # All methods failed - return None
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

def create_portfolio_chart(positions: List[Dict[str, Any]]) -> Optional[go.Figure]:
    """Create portfolio allocation chart"""
    if not positions:
        return None
    
    symbols = [pos['symbol'] for pos in positions]
    values = [float(pos['market_value']) for pos in positions]
    # Bright, highly visible colors for dark background
    colors = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']
    
    fig = go.Figure(data=[go.Pie(
        labels=symbols,
        values=values,
        hole=0.4,
        marker=dict(
            colors=colors[:len(symbols)],
            line=dict(color='#FFFFFF', width=2)
        ),
        textinfo='label+percent',
        textposition='outside',
        textfont=dict(size=14, color='#FFFFFF'),
        hovertemplate='<b>%{label}</b><br>Value: $%{value:.2f}<br>Percent: %{percent}<extra></extra>'
    )])
    
    fig.update_layout(
        title=dict(
            text="Portfolio Allocation by Market Value",
            font=dict(size=20, color='#FFFFFF', family='Arial Black'),
            x=0.5,
            xanchor='center',
            y=0.98,
            yanchor='top'
        ),
        template="plotly_dark",
        height=500,
        paper_bgcolor='#1E293B',
        plot_bgcolor='#1E293B',
        showlegend=True,
        legend=dict(
            font=dict(size=12, color='#FFFFFF'),
            bgcolor='rgba(30, 41, 59, 0.8)',
            bordercolor='#475569',
            borderwidth=1,
            orientation='v',
            yanchor='middle',
            y=0.5,
            xanchor='left',
            x=1.05
        ),
        font=dict(color='#FFFFFF'),
        margin=dict(l=40, r=120, t=80, b=40)
    )
    
    return fig

def create_portfolio_performance_chart() -> Optional[go.Figure]:
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
            title={
                "text": "Portfolio Performance Over Time",
                "font": {"size": 20, "color": "#F8FAFC", "family": "Arial Black"},
                "x": 0.5,
                "xanchor": "center",
                "y": 0.98,
                "yanchor": "top"
            },
            xaxis_title="Date",
            yaxis_title="Value ($)",
            template="plotly_dark",
            height=450,
            paper_bgcolor='#1E293B',
            plot_bgcolor='#1E293B',
            font=dict(size=14, color="#F8FAFC"),
            legend=dict(
                font=dict(size=14, color="#F8FAFC"),
                orientation="h",
                yanchor="top",
                y=-0.15,
                xanchor="center",
                x=0.5,
                bgcolor='rgba(30, 41, 59, 0.8)',
                bordercolor='#475569',
                borderwidth=1
            ),
            xaxis=dict(
                title_font=dict(size=16, color="#F8FAFC"),
                tickfont=dict(size=14, color="#F8FAFC")
            ),
            yaxis=dict(
                title_font=dict(size=16, color="#F8FAFC"),
                tickfont=dict(size=14, color="#F8FAFC")
            ),
            margin=dict(l=50, r=50, t=80, b=80)
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

# Single header - no duplicates
header_html = """
<div class="main-header">
    <h1>Scan crypto & stocks across timeframes — fast.</h1>
    <p class="hero-subtitle">Professional Market Analysis & Trading Intelligence Platform</p>
    <div class="hero-buttons">
        <span class="promo-button">🚀 Start Scanning (Demo)</span>
        <span class="secondary-button">📊 View Results</span>
    </div>
</div>
"""

# Header (banner image removed to save deployment space)
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

# Handle Apple IAP Receipt Validation (API endpoint)
if 'iap' in st.query_params and st.query_params.get('action') == 'validate-receipt':
    st.write("Apple IAP Receipt Validation Endpoint")
    if st.button("Validate Receipt"):
        # This would be called via API, not through Streamlit UI
        st.info("⚙️ Receipt validation endpoint ready for iOS app")
    st.stop()

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
        
        if is_valid and isinstance(validation_result, dict):
            plan_code = validation_result.get("plan_code", "free")
            
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

# ================= Anonymous Workspace System =================
# Initialize anonymous device and workspace for data sync
# URL-based persistence - workspace ID stored in ?wid= parameter

# Initialize persistent device fingerprint (uses URL persistence)
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

# ================= CROSS-SYSTEM AUTHENTICATION =================
# Check Next.js auth cookie and sync with Streamlit
def check_nextjs_auth():
    """Check if user is authenticated via Next.js (marketscannerpros.app)"""
    try:
        # Use the modern st.context.headers API
        headers = st.context.headers if hasattr(st, 'context') else {}
        cookie_header = headers.get('Cookie', '') if headers else ''
        
        if 'ms_auth=' in cookie_header:
            # Extract the cookie value
            for cookie in cookie_header.split(';'):
                if 'ms_auth=' in cookie:
                    ms_auth = cookie.split('ms_auth=')[1].strip()
                    
                    # Call Next.js API to verify and get user info
                    response = requests.get(
                        'https://www.marketscannerpros.app/api/auth/session',
                        headers={'Cookie': f'ms_auth={ms_auth}'},
                        timeout=3
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('authenticated'):
                            return data.get('workspaceId'), data.get('tier')
        
        return None, None
    except Exception:
        return None, None

# Try to get auth from Next.js first
nextjs_workspace_id, nextjs_tier = check_nextjs_auth()
if nextjs_workspace_id and nextjs_tier:
    # User authenticated via Next.js - sync to Streamlit
    st.session_state.workspace_id = nextjs_workspace_id
    st.session_state.device_fingerprint = nextjs_workspace_id
    
    # Set subscription override
    if nextjs_tier != 'free':
        set_subscription_override(nextjs_workspace_id, nextjs_tier, "nextjs_auth", None)
    
    # Update URL
    st.query_params['wid'] = nextjs_workspace_id

# Update user tier based on active subscription (CRITICAL FIX)
workspace_id_for_tier = st.session_state.get('workspace_id')
if workspace_id_for_tier and isinstance(workspace_id_for_tier, str):
    current_tier = get_user_tier_from_subscription(workspace_id_for_tier)
    if current_tier and current_tier != st.session_state.user_tier:
        st.session_state.user_tier = current_tier
        # Optional: Show upgrade success message
        if current_tier in ['pro', 'pro_trader']:
            st.success(f"🎉 {current_tier.replace('_', ' ').title()} subscription active!")

# All features are now free - no tier restrictions

if 'pairing_token' not in st.session_state:
    st.session_state.pairing_token = None

if 'saved_watchlist' not in st.session_state:
    st.session_state.saved_watchlist = []

# Market selection toggles
col_toggle1, col_toggle2, col_toggle3 = st.columns([1, 1, 1])
with col_toggle1:
    scan_equities = st.checkbox("📈 Scan Equities", value=True, key="scan_equities_toggle")
with col_toggle2:
    scan_crypto = st.checkbox("₿ Scan Crypto", value=True, key="scan_crypto_toggle")
with col_toggle3:
    scan_commodities = st.checkbox("🛢️ Scan Commodities", value=False, key="scan_commodities_toggle")

c1, c2, c3 = st.columns([1,1,1])
run_clicked = c1.button("🔎 Run Scanner", width='stretch')
refresh_clicked = c2.button("🔁 Refresh Data", width='stretch')
now_syd = datetime.now(timezone.utc).astimezone(SYD).strftime("%H:%M:%S %Z")
c3.info(f"Last scan: {now_syd}")

# Results display control
col_results1, col_results2 = st.columns([1, 2])
with col_results1:
    st.markdown("**Results to Display:**")
with col_results2:
    if 'topk' not in st.session_state:
        st.session_state.topk = CFG.top_k
    # Create list of options from 5 to 100 in steps of 5
    result_options = list(range(5, 105, 5))
    current_index = result_options.index(st.session_state.topk) if st.session_state.topk in result_options else 2
    topk = st.selectbox("Number of results", result_options, index=current_index, key="topk_display", label_visibility="collapsed")
    st.session_state.topk = topk

# Removed outdated freemium banner - tier limits now properly enforced throughout app

# Clear cache if refresh clicked
if refresh_clicked:
    st.cache_data.clear()
    st.success("Data cache cleared!")
    st.rerun()

# Sidebar
# ================= SUBSCRIPTION STATUS =================
# Show subscription status at top of sidebar
auth.show_subscription_status()

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
# Device Sync - collapsed by default for cleaner sidebar
with st.sidebar.expander("📱 Device Sync", expanded=False):
    if st.session_state.workspace_id:
        # Show current workspace info
        devices = get_workspace_devices(st.session_state.workspace_id)
        st.caption(f"💾 Workspace: {st.session_state.workspace_id[:8]}...")
        st.caption(f"📱 Connected devices: {len(devices)}")
    
        # Create pairing section
        with st.expander("🔗 Connect New Device", expanded=False):
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
        with st.expander("🔢 Enter Pairing Code", expanded=False):
            st.write("**Have a pairing code from another device?**")
            pair_token = st.text_input("Enter pairing code:", max_chars=10, key="pair_token_input")
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
            with st.expander("⚙️ Manage Devices", expanded=False):
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
        st.error("❌ Workspace initialization failed")

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

# Define tier configurations - ALL FEATURES FREE
TIER_CONFIG = {
    'free': {
        'name': '📱 Market Scanner Pro',
        'features': ['Unlimited market scanning', 'Unlimited alerts & notifications', 'Unlimited portfolio tracking', 'Advanced charts', 'Backtesting', 'Trade journal', 'All features included'],
        'scan_limit': None,
        'alert_limit': None,  # Unlimited alerts
        'portfolio_limit': None,  # Unlimited portfolio
        'has_advanced_charts': True,
        'has_backtesting': True,
        'has_trade_journal': True,
        'has_backtesting_alerts': True,
        'color': '#4CAF50'
    },
    'pro': {
        'name': '🚀 Market Scanner Pro',
        'price': 'Free',
        'features': ['Unlimited market scanning', 'Unlimited alerts & notifications', 'Unlimited portfolio tracking', 'Advanced charts', 'Backtesting', 'Trade journal', 'All features included'],
        'scan_limit': None,
        'alert_limit': None,
        'portfolio_limit': None,
        'has_advanced_charts': True,
        'has_backtesting': True,
        'has_trade_journal': True,
        'color': '#4CAF50'
    },
    'pro_trader': {
        'name': '💎 Market Scanner Pro',
        'price': 'Free',
        'features': ['Unlimited market scanning', 'Unlimited alerts & notifications', 'Unlimited portfolio tracking', 'Advanced charts', 'Backtesting', 'Trade journal', 'All features included'],
        'scan_limit': None,
        'alert_limit': None,
        'portfolio_limit': None,
        'has_advanced_charts': True,
        'has_backtesting': True,
        'has_trade_journal': True,
        'has_backtesting_alerts': True,
        'color': '#4CAF50'
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


# All features are now completely free - no subscriptions needed
workspace_id = st.session_state.get('workspace_id')

# ================= Subscription Summary (Compact) =================
# Show compact subscription summary instead of full tier cards
st.sidebar.header("💳 Subscription")

# Get current subscription from database with admin override support
current_subscription = None

if workspace_id:
    # Use the proper function that checks admin overrides first, then subscriptions
    current_tier = get_user_tier_from_subscription(workspace_id)
    # Also get subscription info for display purposes
    current_subscription = get_workspace_subscription(workspace_id)
else:
    # No workspace - default to free
    current_tier = 'free'

# TEMPORARY: Manual Pro access for testing (NO SUCCESS MESSAGES to avoid layout issues)
# Check if user should have Pro access (temporary override)
query_params = st.query_params
if query_params.get("access") == "pro":
    current_tier = 'pro'
    # Removed success message that was causing layout/styling issues
elif query_params.get("access") == "pro_trader":
    current_tier = 'pro_trader'
    # Removed success message that was causing layout/styling issues

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
# Use the already-set is_mobile from session state (line 212)
if is_mobile:
    st.sidebar.markdown("---")
    st.sidebar.markdown("📱 **Manage Subscription**")
    st.sidebar.caption("Tap to manage your subscription through the App Store")
    # Note: In actual iOS app, this would link to subscription management

# Friend Access Code - collapsed by default for cleaner sidebar  
with st.sidebar.expander("🎫 Friend Access Code", expanded=False):
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

# Old tier system removed - now using RevenueCat authentication
# Subscription status is shown at top of sidebar by auth.show_subscription_status()
# No upgrade buttons needed - users upgrade through marketing site

# End of subscription section

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

# Show tier info
current_tier = st.session_state.user_tier
tier_info = TIER_CONFIG[current_tier]
if current_tier == 'pro':
    st.sidebar.success(f"✨ Pro: Unlimited scanning, {tier_info['alert_limit']} alerts, {tier_info['portfolio_limit']} portfolio")
elif current_tier == 'pro_trader':
    st.sidebar.success(f"🎯 Pro Trader: Full access - unlimited everything, Trade Journal, Backtesting, TradingView integration")
    
    # TradingView Integration for Pro Trader members
    with st.sidebar.expander("📊 TradingView Integration", expanded=False):
        st.markdown("### 🎉 You're now a Pro Trader member!")
        
        # Check if username already submitted
        existing_username = get_tradingview_username(workspace_id) if workspace_id else None
        
        if existing_username:
            st.success(f"✅ TradingView username submitted: **{existing_username}**")
            st.caption("Access will be granted within 24 hours. You'll receive a TradingView notification.")
            
            # Option to update username
            if st.button("🔄 Update Username", key="update_tradingview"):
                st.session_state.update_tradingview = True
                st.rerun()
        
        if not existing_username or st.session_state.get('update_tradingview', False):
            st.markdown("""
            **To activate your TradingView scripts:**
            
            1️⃣ Copy your TradingView username (case-sensitive)  
            2️⃣ Paste it in the field below  
            
            Access will be granted within 24 hours.
            """)
            
            tv_username = st.text_input(
                "TradingView Username:",
                placeholder="Enter your exact TradingView username",
                key="tv_username_input",
                help="Case-sensitive - must match exactly as shown in TradingView"
            )
            
            if st.button("🚀 Submit Username", type="primary", key="submit_tradingview"):
                if tv_username and len(tv_username.strip()) > 0:
                    if workspace_id and save_tradingview_username(workspace_id, tv_username):
                        st.success("✅ Username submitted! Access will be granted within 24 hours.")
                        st.session_state.update_tradingview = False
                        st.balloons()
                        st.rerun()
                    else:
                        st.error("❌ Failed to save username. Please try again.")
                else:
                    st.warning("⚠️ Please enter your TradingView username")
            
            st.caption("Questions? Contact support@marketscannerpros.app")

# Top 100 Equities by market cap
TOP_100_EQUITIES = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "LLY", "V",
    "UNH", "XOM", "JPM", "JNJ", "WMT", "MA", "PG", "AVGO", "HD", "ORCL",
    "COST", "ABBV", "MRK", "KO", "PEP", "CSCO", "NFLX", "ACN", "CRM", "AMD",
    "ADBE", "TMO", "LIN", "MCD", "INTC", "ABT", "DIS", "NKE", "DHR", "VZ",
    "TXN", "QCOM", "CMCSA", "PM", "INTU", "UNP", "AMGN", "NEE", "AMAT", "HON",
    "RTX", "LOW", "SPGI", "UPS", "CAT", "ISRG", "ELV", "IBM", "GE", "BA",
    "SBUX", "PLD", "CVX", "DE", "GILD", "BLK", "MDT", "TJX", "BKNG", "ADI",
    "AXP", "SYK", "MDLZ", "VRTX", "MMC", "PGR", "LRCX", "REGN", "AMT", "CI",
    "SCHW", "ADP", "NOW", "TMUS", "PANW", "MO", "C", "PYPL", "CB", "ZTS",
    "GS", "SO", "BSX", "ETN", "FI", "MS", "ABNB", "DUK", "MU", "ANET"
]

# Mid-Cap Stocks ($2B - $10B market cap)
MID_CAP_STOCKS = [
    "PLTR", "DDOG", "CRWD", "SNOW", "NET", "ZS", "DKNG", "RIVN", "LCID", "RBLX",
    "DASH", "COIN", "MELI", "TEAM", "ZM", "OKTA", "DOCU", "TWLO", "SQ", "SHOP",
    "ROKU", "LYFT", "UBER", "PINS", "SNAP", "SPOT", "MRNA", "BILL", "CPNG", "ABNB",
    "FTNT", "WDAY", "VEEV", "SPLK", "MDB", "HUBS", "FSLY", "CFLT", "ESTC", "DELL",
    "HPE", "WDC", "SMCI", "HPQ", "GLW", "ON", "KEYS", "ANSS", "SNPS", "CDNS",
    "EXPE", "EBAY", "ETSY", "W", "BABA", "JD", "PDD", "BIDU", "NIO", "LI"
]

# Small-Cap Stocks ($250M - $2B market cap)
SMALL_CAP_STOCKS = [
    "UPST", "OPEN", "SOFI", "HOOD", "AFRM", "BROS", "CAVA", "FVRR", "ASAN", "PATH",
    "SOUN", "AI", "BBAI", "IONQ", "RGTI", "QUBT", "DNA", "PACB", "CRSP", "NTLA",
    "BEAM", "EDIT", "VERV", "BLUE", "FATE", "RPTX", "CMPS", "MNDY", "S", "GTLB",
    "PCOR", "NCNO", "JAMF", "FROG", "ALKT", "AUR", "FOUR", "BL", "YOU", "RPD",
    "MTTR", "WK", "RAMP", "TOST", "CVNA", "VSCO", "FSLR", "ENPH", "SEDG", "RUN",
    "NOVA", "CASY", "JAZZ", "INCY", "EXAS", "TECH", "NTRA", "RGEN", "SRPT", "VRTX"
]

# Quick scan options for equities
scan_option = st.sidebar.radio(
    "📊 Equity Scan Options:",
    ["Custom Selection", "Top 100 Large-Cap", "Mid-Cap ($2B-$10B)", "Small-Cap ($250M-$2B)"],
    key="equity_scan_option"
)

use_top100_eq = (scan_option == "Top 100 Large-Cap")
use_midcap = (scan_option == "Mid-Cap ($2B-$10B)")
use_smallcap = (scan_option == "Small-Cap ($250M-$2B)")

# Handle different scan options
if use_top100_eq:
    selected_eq_from_list = TOP_100_EQUITIES
    st.sidebar.success(f"✅ All 100 large-cap equities selected!")
elif use_midcap:
    selected_eq_from_list = MID_CAP_STOCKS
    st.sidebar.success(f"✅ {len(MID_CAP_STOCKS)} mid-cap stocks selected!")
elif use_smallcap:
    selected_eq_from_list = SMALL_CAP_STOCKS
    st.sidebar.success(f"✅ {len(SMALL_CAP_STOCKS)} small-cap stocks selected!")
else:
    # Custom selection
    selected_eq_from_list = st.sidebar.multiselect(
        "Or select from top 100:",
        options=TOP_100_EQUITIES,
        default=[],
        key="eq_multiselect"
    )
    if selected_eq_from_list:
        st.sidebar.caption(f"✅ {len(selected_eq_from_list)} equities selected from list")

eq_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(equity_symbols), height=140)

st.sidebar.header("Crypto Symbols (BTC-USD style)")

# Top 100 Crypto by market cap
TOP_100_CRYPTO = [
    "BTC-USD", "ETH-USD", "USDT-USD", "BNB-USD", "SOL-USD", "USDC-USD", "XRP-USD", 
    "DOGE-USD", "ADA-USD", "TRX-USD", "AVAX-USD", "SHIB-USD", "DOT-USD", "LINK-USD",
    "BCH-USD", "NEAR-USD", "MATIC-USD", "LTC-USD", "UNI-USD", "PEPE-USD",
    "ICP-USD", "APT-USD", "FET-USD", "STX-USD", "ARB-USD", "ATOM-USD", "FIL-USD",
    "ETC-USD", "HBAR-USD", "VET-USD", "MNT-USD", "IMX-USD", "OP-USD", "RNDR-USD",
    "INJ-USD", "SUI-USD", "GRT-USD", "RUNE-USD", "SEI-USD", "ALGO-USD", "SAND-USD",
    "AAVE-USD", "FLR-USD", "TIA-USD", "XLM-USD", "THETA-USD", "AXS-USD", "MANA-USD",
    "KAS-USD", "FTM-USD", "FLOW-USD", "XTZ-USD", "CHZ-USD", "EGLD-USD", "KAVA-USD",
    "GALA-USD", "NEO-USD", "EOS-USD", "MINA-USD", "ROSE-USD", "QNT-USD", "MASK-USD",
    "1INCH-USD", "CRV-USD", "ZIL-USD", "ENJ-USD", "BAT-USD", "COMP-USD", "ZRX-USD",
    "SUSHI-USD", "SNX-USD", "YFI-USD", "UMA-USD", "BAL-USD", "REN-USD", "KNC-USD",
    "LRC-USD", "OCEAN-USD", "STORJ-USD", "ANKR-USD", "NKN-USD", "CVC-USD", "SKL-USD",
    "OMG-USD", "BAND-USD", "COTI-USD", "REQ-USD", "RLC-USD", "NMR-USD", "GNO-USD",
    "AMP-USD", "POLY-USD", "MLN-USD", "BNT-USD", "FORTH-USD", "CTSI-USD", "API3-USD"
]

# Crypto Coins Ranked 100-300 by Market Cap (Mid & Small Cap Alts)
CRYPTO_100_300 = [
    "STRK-USD", "ORDI-USD", "BONK-USD", "WIF-USD", "BRETT-USD", "FLOKI-USD", "JASMY-USD", "PENDLE-USD",
    "PYTH-USD", "NEXO-USD", "AIOZ-USD", "BLUR-USD", "DYDX-USD", "GMT-USD", "CFX-USD", "XEC-USD",
    "ONDO-USD", "SUPER-USD", "CAKE-USD", "KLAY-USD", "WOO-USD", "LDO-USD", "AGIX-USD", "LUNC-USD",
    "C98-USD", "GMX-USD", "AUDIO-USD", "GLM-USD", "SPELL-USD", "HOT-USD", "SLP-USD", "QTUM-USD",
    "RSR-USD", "GLMR-USD", "IOTX-USD", "HIVE-USD", "WIN-USD", "IOST-USD", "ACH-USD", "PAXG-USD",
    "TFUEL-USD", "SFP-USD", "LEVER-USD", "ONT-USD", "SYN-USD", "LSK-USD", "DENT-USD", "SC-USD",
    "SCRT-USD", "ARDR-USD", "STEEM-USD", "XEM-USD", "BORA-USD", "LPT-USD", "HIGH-USD", "MXC-USD",
    "DOCK-USD", "POWR-USD", "SYS-USD", "TROY-USD", "VOXEL-USD", "ALICE-USD", "OGN-USD", "ACA-USD",
    "MDX-USD", "PERP-USD", "RAY-USD", "RARE-USD", "POLS-USD", "VGX-USD", "BICO-USD", "ALPHA-USD",
    "MOVR-USD", "ORN-USD", "PYR-USD", "TLM-USD", "IRIS-USD", "VITE-USD", "BURGER-USD", "ILV-USD",
    "HARD-USD", "QUICK-USD", "FIDA-USD", "FIS-USD", "STMX-USD", "DATA-USD", "ADX-USD", "ERN-USD",
    "GHST-USD", "PLA-USD", "BADGER-USD", "LOKA-USD", "CLV-USD", "TVK-USD", "FARM-USD", "PSG-USD",
    "FORTH-USD", "DUSK-USD", "IDEX-USD", "MDT-USD", "SUN-USD", "AST-USD", "BETA-USD", "POND-USD"
]

# Crypto scan options
crypto_scan_option = st.sidebar.radio(
    "📊 Crypto Scan Options:",
    ["Custom Selection", "Top 100", "Rank 100-300 (Alt Coins)"],
    key="crypto_scan_option"
)

use_top100_cx = (crypto_scan_option == "Top 100")
use_crypto_100_300 = (crypto_scan_option == "Rank 100-300 (Alt Coins)")

# Handle different crypto scan options
if use_top100_cx:
    selected_cx_from_list = TOP_100_CRYPTO
    st.sidebar.success(f"✅ All 100 top crypto selected!")
elif use_crypto_100_300:
    selected_cx_from_list = CRYPTO_100_300
    st.sidebar.success(f"✅ {len(CRYPTO_100_300)} alt coins (rank 100-300) selected!")
else:
    # Custom selection
    selected_cx_from_list = st.sidebar.multiselect(
        "Or select from top 100:",
        options=TOP_100_CRYPTO,
        default=[],
        key="cx_multiselect"
    )
    if selected_cx_from_list:
        st.sidebar.caption(f"✅ {len(selected_cx_from_list)} crypto selected from list")

cx_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(crypto_symbols), height=140)

st.sidebar.header("🛢️ Commodities")

# Commodities list
COMMODITIES = [
    "GC=F",    # Gold
    "SI=F",    # Silver
    "PL=F",    # Platinum
    "PA=F",    # Palladium
    "HG=F",    # Copper
    "CL=F",    # Crude Oil WTI
    "BZ=F",    # Brent Crude Oil
    "NG=F",    # Natural Gas
    "RB=F",    # Gasoline
    "HO=F",    # Heating Oil
    "ZC=F",    # Corn
    "ZW=F",    # Wheat
    "ZS=F",    # Soybeans
    "KC=F",    # Coffee
    "SB=F",    # Sugar
    "CC=F",    # Cocoa
    "CT=F",    # Cotton
    "LBS=F",   # Lumber
]

# Commodities are always selected (controlled by top checkbox)
selected_commodities = COMMODITIES
st.sidebar.info(f"📊 {len(COMMODITIES)} commodities available")

# Show current symbol count for all users
eq_text_count = len([s.strip() for s in eq_input.splitlines() if s.strip()])
cx_text_count = len([s.strip() for s in cx_input.splitlines() if s.strip()])
eq_dropdown_count = len(selected_eq_from_list)
cx_dropdown_count = len(selected_cx_from_list)
commodities_count = len(selected_commodities)

# Total unique symbols (account for potential duplicates)
all_eq = set([s.strip().upper() for s in eq_input.splitlines() if s.strip()] + [s.upper() for s in selected_eq_from_list])
all_cx = set([s.strip().upper() for s in cx_input.splitlines() if s.strip()] + [s.upper() for s in selected_cx_from_list])
all_commodities = set([s.upper() for s in selected_commodities])
total_count = len(all_eq) + len(all_cx) + len(all_commodities)

if total_count > 0:
    st.sidebar.info(f"📊 {total_count} symbols ready to scan")

# Custom Scanner Settings
with st.sidebar.expander("⚙️ Custom Scanner Settings", expanded=False):
    st.markdown("**Customize Technical Analysis Scoring:**")
    
    use_custom = st.checkbox("Enable Custom Settings", help="Use custom scoring parameters instead of defaults")
    
    if use_custom:
        st.info("""
        **📊 How Scoring Works:**
        - Scanner adds/subtracts points based on technical indicators
        - **Score ≥ 0 = Bullish** (positive signals dominate)
        - **Score < 0 = Bearish** (negative signals dominate)
        - Higher absolute score = stronger signal
        """)
        
        st.markdown("---")
        st.markdown("**Scoring Weights (Points):**")
        
        col1, col2 = st.columns(2)
        with col1:
            custom_regime_weight = st.selectbox("Market Regime:", list(range(0, 105, 5)), index=5, 
                                                  help="Points for price above/below EMA200")
            custom_structure_weight = st.selectbox("Price Structure:", list(range(0, 105, 5)), index=5,
                                                     help="Points for breakout/breakdown")
            custom_rsi_weight = st.selectbox("RSI Momentum:", list(range(0, 55, 5)), index=2,
                                               help="Points for RSI above threshold")
            custom_macd_weight = st.selectbox("MACD:", list(range(0, 55, 5)), index=2,
                                                help="Points for MACD histogram > 0")
        
        with col2:
            custom_volume_weight = st.selectbox("Volume Expansion:", list(range(0, 52, 2)), index=4,
                                                  help="Points for unusual volume")
            custom_volatility_weight = st.selectbox("Volatility Expansion:", list(range(0, 52, 2)), index=3,
                                                       help="Points for BB width expansion")
            custom_tradability_weight = st.selectbox("Tradability:", list(range(0, 51, 1)), index=5,
                                                        help="Points for manageable volatility")
            custom_overextension_penalty = st.selectbox("Overextension Penalty:", list(range(0, 55, 5)), index=2,
                                                          help="Penalty for RSI > threshold")
        
        st.markdown("---")
        st.markdown("**Indicator Thresholds:**")
        
        col1, col2 = st.columns(2)
        with col1:
            custom_rsi_bull = st.selectbox("RSI Bullish Level:", list(range(30, 75, 5)), index=4, help="RSI above this = bullish momentum")
            custom_rsi_overbought = st.selectbox("RSI Overbought:", list(range(70, 95, 5)), index=2, help="RSI above this = overextended")
            custom_rsi_oversold = st.selectbox("RSI Oversold:", list(range(10, 35, 5)), index=2, help="RSI below this = oversold bounce potential")
        
        with col2:
            custom_volume_z = st.selectbox("Volume Z-Score:", [round(x*0.1, 1) for x in range(0, 21)], index=5, help="Z-score above this = unusual volume")
            custom_atr_pct = st.selectbox("ATR % Max:", [round(x*0.5, 1) for x in range(2, 21)], index=4, help="ATR % below this = tradable volatility")
        
        st.markdown("---")
        st.markdown("**Technical Periods:**")
        
        col1, col2 = st.columns(2)
        with col1:
            custom_breakout_period = st.selectbox("Breakout Period:", list(range(5, 105, 5)), index=3,
                                                    help="Look for X-period highs/lows")
            custom_rsi_period = st.selectbox("RSI Period:", list(range(5, 51, 1)), index=9,
                                               help="RSI calculation period")
        
        with col2:
            custom_ema_long = st.selectbox("Long EMA:", list(range(50, 505, 50)), index=3,
                                             help="Long-term trend EMA")
            custom_bb_period = st.selectbox("BB Period:", list(range(10, 55, 5)), index=2,
                                              help="Bollinger Band period")
        
        # Save custom settings to session state
        st.session_state.custom_scanner_settings = {
            'enabled': True,
            'weights': {
                'regime': custom_regime_weight,
                'structure': custom_structure_weight,
                'rsi': custom_rsi_weight,
                'macd': custom_macd_weight,
                'volume': custom_volume_weight,
                'volatility': custom_volatility_weight,
                'tradability': custom_tradability_weight,
                'overextension_penalty': custom_overextension_penalty
            },
            'thresholds': {
                'rsi_bull': custom_rsi_bull,
                'rsi_overbought': custom_rsi_overbought,
                'rsi_oversold': custom_rsi_oversold,
                'volume_z': custom_volume_z,
                'atr_pct': custom_atr_pct / 100  # Convert to decimal
            },
            'periods': {
                'breakout': custom_breakout_period,
                'rsi': custom_rsi_period,
                'ema_long': custom_ema_long,
                'bb': custom_bb_period
            }
        }
        
        st.info("💡 Custom settings active! Scanner will use your parameters.")
    else:
        # Default settings
        st.session_state.custom_scanner_settings = {'enabled': False}
        st.caption("Using default scoring system")

st.sidebar.header("Timeframes")
tf_eq = st.sidebar.selectbox("Equity Timeframe:", ["1D","1h","30m","15m","5m"], index=0)
tf_cx = st.sidebar.selectbox("Crypto Timeframe:", ["1h","4h","1D","15m","5m"], index=0)

st.sidebar.header("Filters")
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
    
    # Email capability notice
    st.success("📧 **Email Delivery Enabled**: You can receive price alerts at any email address via alerts@marketscannerpros.app")
    
    user_email = st.text_input(
        "Your Email:", 
        placeholder="Enter your email address",
        help="You'll receive price alert notifications here",
        key="user_notification_email"
    )
    
    notification_method = st.selectbox(
        "Notification Method:",
        ["In-App Notifications", "Email", "Both", "None"],
        index=0,
        help="• In-App: Secure notifications in your dashboard (100% reliable)\n• Email: Get alerts via email (requires internet)\n• Both: In-app + email notifications for maximum coverage\n• None: Disable all notifications",
        key="notification_method_v4"  # Force refresh with new key
    )
    
    # Map UI options to backend values
    method_mapping = {
        "In-App Notifications": "in_app",
        "Email": "email",
        "Both": "both",  # Now means email + in-app
        "None": "none"
    }
    backend_method = method_mapping[notification_method]
    
    if user_email and notification_method in ["In-App Notifications", "Email", "Both"]:
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
                            st.markdown("""
                            **🔔 How Notifications Work:**
                            
                            **In-App Notifications:**
                            • Primary delivery method - 100% reliable
                            • Stored securely in your dashboard
                            • No external dependencies or internet required
                            • Instant display when you open the app
                            
                            **Email Notifications:**
                            • Sent via professional email service (Vercel/Resend)
                            • Beautiful HTML-formatted alerts with branding
                            • Backup delivery method - requires internet connection
                            • Delivered to your inbox within seconds
                            
                            **Delivery Strategy:**
                            • **Primary**: In-app (guaranteed delivery)
                            • **Optional**: Email alerts (for immediate mobile notifications)
                            • **"Both" method**: Get in-app + email for maximum coverage
                            """)
                            
                        if notification_method == "Email":
                            success = send_email_to_user(test_subject, test_message, user_email)
                        else:
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
    
    send_email_summary_toggle = st.checkbox("📧 Email scan summary", help="Send scan results summary to your email")

# Main scanning logic
if run_clicked:
    # Rate limiting check
    rate_limiter = get_rate_limiter()
    workspace_id = st.session_state.get('workspace_id', 'anonymous')
    allowed, message = rate_limiter.check_rate_limit(workspace_id)
    
    if not allowed:
        st.error(f"🚫 {message}")
        st.info("Please wait a moment before scanning again. Upgrade to Pro for higher limits!")
    else:
        # Get symbols from inputs (merge text area + selected from dropdown)
        eq_syms_from_text = [s.strip().upper() for s in eq_input.splitlines() if s.strip()] if scan_equities else []
        eq_syms_from_list = [s.strip().upper() for s in selected_eq_from_list] if scan_equities else []
        eq_syms = list(set(eq_syms_from_text + eq_syms_from_list))  # Combine and remove duplicates
        
        cx_syms_from_text = [s.strip().upper() for s in cx_input.splitlines() if s.strip()] if scan_crypto else []
        cx_syms_from_list = [s.strip().upper() for s in selected_cx_from_list] if scan_crypto else []
        cx_syms = list(set(cx_syms_from_text + cx_syms_from_list))  # Combine and remove duplicates
        
        # Commodities controlled by checkbox
        commodity_syms = [s.upper() for s in selected_commodities] if scan_commodities else []
        
        # Check if at least one market is selected
        total_symbols = len(eq_syms) + len(cx_syms) + len(commodity_syms)
        
        if total_symbols == 0:
            st.error("⚠️ Please select at least one symbol to scan (Equities, Crypto, or Commodities)")
        else:
            with st.spinner("Scanning markets..."):
                # Get custom scanner settings if enabled
                custom_settings = st.session_state.get('custom_scanner_settings', {'enabled': False})
                
                # Scan equity markets only
                if scan_equities and eq_syms:
                    st.session_state.eq_results, st.session_state.eq_errors = scan_universe(
                        eq_syms, tf_eq, False, acct, risk, stop_mult, minvol, custom_settings
                    )
                else:
                    st.session_state.eq_results = pd.DataFrame()
                    st.session_state.eq_errors = pd.DataFrame()
                
                # Scan commodities markets (controlled by scan_commodities checkbox)
                if scan_commodities and commodity_syms:
                    st.session_state.commodity_results, st.session_state.commodity_errors = scan_universe(
                        commodity_syms, tf_eq, False, acct, risk, stop_mult, minvol, custom_settings
                    )
                else:
                    st.session_state.commodity_results = pd.DataFrame()
                    st.session_state.commodity_errors = pd.DataFrame()
                
                # Scan crypto markets (only if toggle is enabled)
                if scan_crypto and cx_syms:
                    st.session_state.cx_results, st.session_state.cx_errors = scan_universe(
                        cx_syms, tf_cx, True, acct, risk, stop_mult, minvol, custom_settings
                    )
                else:
                    st.session_state.cx_results = pd.DataFrame()
                    st.session_state.cx_errors = pd.DataFrame()
    
    # Send email notifications if enabled
    if send_email_summary_toggle or send_email_toggle:
        combined_results = pd.concat([
            st.session_state.eq_results, 
            st.session_state.commodity_results,
            st.session_state.cx_results
        ], ignore_index=True)
        if not combined_results.empty:
            top_results = combined_results.head(st.session_state.topk)
            
            if (send_email_toggle or send_email_summary_toggle) and user_email:
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

# Initialize commodity results if not present
if 'commodity_results' not in st.session_state:
    st.session_state.commodity_results = pd.DataFrame()
    st.session_state.commodity_errors = pd.DataFrame()

# Equity Markets Section with Professional Cards
st.markdown("""
<div class="pro-card">
    <h3>🏛 Equity Markets</h3>
""", unsafe_allow_html=True)

# Show normal results if no iOS issues detected
if not ios_issue_detected and not st.session_state.eq_results.empty:
    # Show info about display limit
    total_eq_scanned = len(st.session_state.eq_results)
    if total_eq_scanned > st.session_state.topk:
        st.info(f"📊 Showing top {st.session_state.topk} of {total_eq_scanned} scanned equities. Download CSV for all results. Adjust 'Results to Display' above to show more.")
    
    # Limit display to top K
    display_eq = st.session_state.eq_results.head(st.session_state.topk)
    
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
    
    # Fullscreen view dialog
    @st.dialog("🏛 Equity Markets - Full View", width="large")
    def show_equity_fullscreen():
        st.write(f"**Total Results:** {len(st.session_state.eq_results)}")
        if 'direction' in st.session_state.eq_results.columns:
            styled_full = st.session_state.eq_results.style.applymap(highlight_direction, subset=['direction'])
            st.dataframe(styled_full, height=600, use_container_width=True)
        else:
            st.dataframe(st.session_state.eq_results, height=600, use_container_width=True)
    
    # CSV download for equity results
    csv_eq = to_csv_download(st.session_state.eq_results, "equity_scan.csv")
    col1, col2 = st.columns([1, 1])
    with col1:
        st.download_button(
            label="📥 Download Equity Results (CSV)",
            data=csv_eq,
            file_name=f"equity_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
            use_container_width=True
        )
    with col2:
        if st.button("🖥️ Fullscreen View", key="equity_fullscreen", use_container_width=True):
            show_equity_fullscreen()
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
    # Show info about display limit
    total_cx_scanned = len(st.session_state.cx_results)
    if total_cx_scanned > st.session_state.topk:
        st.info(f"📊 Showing top {st.session_state.topk} of {total_cx_scanned} scanned crypto. Download CSV for all results. Adjust 'Results to Display' above to show more.")
    
    # Limit display to top K
    display_cx = st.session_state.cx_results.head(st.session_state.topk)
    
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
    
    # Fullscreen view dialog
    @st.dialog("₿ Crypto Markets - Full View", width="large")
    def show_crypto_fullscreen():
        st.write(f"**Total Results:** {len(st.session_state.cx_results)}")
        if 'direction' in st.session_state.cx_results.columns:
            styled_full = st.session_state.cx_results.style.applymap(highlight_direction, subset=['direction'])
            st.dataframe(styled_full, height=600, use_container_width=True)
        else:
            st.dataframe(st.session_state.cx_results, height=600, use_container_width=True)
    
    # CSV download for crypto results
    csv_cx = to_csv_download(st.session_state.cx_results, "crypto_scan.csv")
    col1, col2 = st.columns([1, 1])
    with col1:
        st.download_button(
            label="📥 Download Crypto Results (CSV)",
            data=csv_cx,
            file_name=f"crypto_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
            use_container_width=True
        )
    with col2:
        if st.button("🖥️ Fullscreen View", key="crypto_fullscreen", use_container_width=True):
            show_crypto_fullscreen()
elif not ios_issue_detected:
    st.info("No crypto results to display. Click 'Run Scanner' to analyze crypto markets.")

# Close crypto card
st.markdown("</div>", unsafe_allow_html=True)

# Crypto errors (only show if not iOS WebView issue) 
if not ios_issue_detected and not st.session_state.cx_errors.empty:
    with st.expander("⚠️ Crypto Scan Errors", expanded=False):
        st.dataframe(st.session_state.cx_errors, width='stretch')
        st.caption("💡 **Tip**: Individual symbol errors are normal. If ALL symbols fail, this may be a network connectivity issue.")

# Commodities Markets Section with Professional Cards
st.markdown("""
<div class="pro-card">
    <h3>🛢️ Commodities</h3>
""", unsafe_allow_html=True)

if not ios_issue_detected and not st.session_state.commodity_results.empty:
    # Show info about display limit
    total_commodity_scanned = len(st.session_state.commodity_results)
    if total_commodity_scanned > st.session_state.topk:
        st.info(f"📊 Showing top {st.session_state.topk} of {total_commodity_scanned} scanned commodities. Download CSV for all results. Adjust 'Results to Display' above to show more.")
    
    # Limit display to top K
    display_commodity = st.session_state.commodity_results.head(st.session_state.topk)
    
    # Enhanced styling for direction column
    def highlight_direction(val):
        if val == 'Bullish':
            return 'background-color: #10b981; color: white; font-weight: bold; border-radius: 6px; padding: 0.25rem 0.5rem;'
        elif val == 'Bearish':
            return 'background-color: #ef4444; color: white; font-weight: bold; border-radius: 6px; padding: 0.25rem 0.5rem;'
        return ''
    
    # Apply professional styling to direction column
    if 'direction' in display_commodity.columns:
        styled_commodity = display_commodity.style.applymap(highlight_direction, subset=['direction'])
        st.dataframe(styled_commodity, width='stretch', use_container_width=True)
    else:
        st.dataframe(display_commodity, width='stretch', use_container_width=True)
    
    # Fullscreen view dialog
    @st.dialog("🛢️ Commodities - Full View", width="large")
    def show_commodity_fullscreen():
        st.write(f"**Total Results:** {len(st.session_state.commodity_results)}")
        if 'direction' in st.session_state.commodity_results.columns:
            styled_full = st.session_state.commodity_results.style.applymap(highlight_direction, subset=['direction'])
            st.dataframe(styled_full, height=600, use_container_width=True)
        else:
            st.dataframe(st.session_state.commodity_results, height=600, use_container_width=True)
    
    # CSV download for commodity results
    csv_commodity = to_csv_download(st.session_state.commodity_results, "commodity_scan.csv")
    col1, col2 = st.columns([1, 1])
    with col1:
        st.download_button(
            label="📥 Download Commodities Results (CSV)",
            data=csv_commodity,
            file_name=f"commodity_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
            use_container_width=True
        )
    with col2:
        if st.button("🖥️ Fullscreen View", key="commodity_fullscreen", use_container_width=True):
            show_commodity_fullscreen()
elif not ios_issue_detected:
    st.info("No commodities results to display. Enable '🛢️ Scan Commodities' checkbox above and click 'Run Scanner'.")

# Close commodities card
st.markdown("</div>", unsafe_allow_html=True)

# Commodities errors (only show if not iOS WebView issue)
if not ios_issue_detected and not st.session_state.commodity_errors.empty:
    with st.expander("⚠️ Commodities Scan Errors", expanded=False):
        st.dataframe(st.session_state.commodity_errors, width='stretch')
        st.caption("💡 **Tip**: Individual symbol errors are normal. If ALL symbols fail, this may be a network connectivity issue.")

# Combined CSV download
if (not st.session_state.eq_results.empty or not st.session_state.cx_results.empty or 
    not st.session_state.commodity_results.empty):
    combined_results = pd.concat([
        st.session_state.eq_results, 
        st.session_state.commodity_results,
        st.session_state.cx_results
    ], ignore_index=True)
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

# ================= Advanced Charting Section =================
st.subheader("📈 Advanced Technical Analysis Charts")

# Check tier access for advanced charts
current_tier = st.session_state.user_tier
tier_info = TIER_CONFIG[current_tier]

if not tier_info['has_advanced_charts']:
    with st.expander("🔒 **Advanced Charts** - Pro & Pro Trader Feature", expanded=False):
        st.info("""
        **Unlock Advanced Technical Analysis Charts with Pro or Pro Trader:**
        - Interactive candlestick charts with zoom and pan
        - Customizable technical indicators (RSI, MACD, Bollinger Bands, Volume)
        - Multiple timeframes from 5m to 1D
        - Professional trading tools
        - Try free for 5-7 days!
        """)
        col1, col2 = st.columns(2)
        with col1:
            if st.button("✨ Upgrade to Pro ($4.99/mo)", key="upgrade_charts_pro", use_container_width=True):
                st.session_state.selected_plan = 'pro'
                st.rerun()
        with col2:
            if st.button("💎 Upgrade to Pro Trader ($9.99/mo)", key="upgrade_charts_trader", use_container_width=True):
                st.session_state.selected_plan = 'pro_trader'
                st.rerun()
else:
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

# ================= Portfolio Tracking =================
st.markdown("---")
st.subheader("💼 Portfolio Tracking")

# Portfolio is FREE for everyone - no Pro check needed
if True:
    # Portfolio overview
    col1, col2 = st.columns([2, 1])

    with col1:
        # Portfolio metrics at the top - ALWAYS SHOW with clean formatting
        portfolio_metrics = calculate_portfolio_metrics()
    
    # REMOVED CSS FROM HERE - Moving to top of file for better injection
    
        # Always display metrics with clean, bold formatting (no faded text)
        metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)
    
        with metric_col1:
            market_value = portfolio_metrics.get('total_market_value', 0) if portfolio_metrics else 0
            st.metric("Market Value", f"${market_value:,.2f}")
        
        with metric_col2:
            total_return = portfolio_metrics.get('total_return_pct', 0) if portfolio_metrics else 0
            st.metric("Total Return", f"{total_return:.2f}%")
        
        with metric_col3:
            unrealized_pnl = portfolio_metrics.get('total_unrealized_pnl', 0) if portfolio_metrics else 0
            st.metric("Unrealized P&L", f"${unrealized_pnl:,.2f}")
        
        with metric_col4:
            num_positions = portfolio_metrics.get('total_positions', 0) if portfolio_metrics else 0
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
                    st.plotly_chart(allocation_chart, use_container_width=True, config={
                        'displayModeBar': 'hover',
                        'displaylogo': False,
                        'modeBarButtonsToRemove': ['lasso2d', 'select2d']
                    })
        
            with col2:
                # Portfolio performance chart
                performance_chart = create_portfolio_performance_chart()
                if performance_chart:
                    st.plotly_chart(performance_chart, use_container_width=True, config={
                        'displayModeBar': 'hover',
                        'displaylogo': False,
                        'modeBarButtonsToRemove': ['lasso2d', 'select2d']
                    })
        
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
                    # Check tier limitations for new BUY positions
                    can_add = True
                    if transaction_type == "BUY":
                        current_tier = st.session_state.user_tier
                        tier_info = TIER_CONFIG[current_tier]
                        current_positions = get_portfolio_positions()
                        position_count = len(current_positions) if current_positions else 0
                    
                        # Check if trying to add new position beyond limit
                        if tier_info['portfolio_limit'] and position_count >= tier_info['portfolio_limit']:
                            existing_symbols = [p['symbol'] for p in current_positions]
                            if symbol not in existing_symbols:
                                st.error(f"🔒 Portfolio limit reached! You have {position_count}/{tier_info['portfolio_limit']} symbols.")
                                if current_tier == 'free':
                                    st.info("✨ Upgrade to Pro for 8 portfolio symbols (try free for 5-7 days)!")
                                else:
                                    st.info("✨ Upgrade to Pro Trader for unlimited portfolio symbols!")
                                can_add = False
                
                    if can_add:
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
                current_price = float(pos['current_price']) if pos['current_price'] else 0
                avg_cost = float(pos['average_cost'])
                
                # Show "Price Unavailable" for zero prices
                price_display = f"${current_price:,.2f}" if current_price > 0 else "N/A - Refresh Prices"
                market_value_display = f"${float(pos['market_value']):,.2f}" if current_price > 0 else "N/A"
                unrealized_pnl_display = f"${float(pos['unrealized_pnl']):,.2f}" if current_price > 0 else "N/A"
                return_pct = f"{((current_price - avg_cost) / avg_cost * 100):.2f}%" if current_price > 0 else "N/A"
                
                positions_data.append({
                    'Symbol': pos['symbol'],
                    'Quantity': f"{float(pos['quantity']):,.4f}",
                    'Avg Cost': f"${avg_cost:,.2f}",
                    'Current Price': price_display,
                    'Market Value': market_value_display,
                    'Unrealized P&L': unrealized_pnl_display,
                    'Return %': return_pct,
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

# ================= Price Alerts Management =================
st.markdown("---")
st.subheader("🚨 Price Alerts")

# Check Pro subscription for alerts access
if not auth.require_pro("Price alerts require a Pro subscription"):
    st.stop()

# User has Pro access - show alerts
if True:
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
    
        # Non-blocking auto-refresh using Streamlit's built-in mechanism
        # This refreshes the page every 10 seconds without blocking the UI
        st.markdown(
            """
            <script>
            setTimeout(function() {
                window.parent.location.reload();
            }, 10000);
            </script>
            """,
            unsafe_allow_html=True
        )
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
                alert_method = st.selectbox("Notification:", ["in_app", "email", "both"], key="alert_method_v2")
        
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
                        current_tier = st.session_state.user_tier
                        tier_info = TIER_CONFIG[current_tier]
                        active_alerts = get_active_alerts()
                        alert_count = len(active_alerts) if active_alerts else 0
                    
                        # Check if free tier trying to create alerts
                        if current_tier == 'free':
                            st.error("🔒 Alerts are not available on Free tier. Upgrade to Pro to create alerts!")
                            st.info("✨ Try Pro free for 5-7 days to test alerts and other premium features!")
                        # Check if pro tier has reached alert limit
                        elif tier_info['alert_limit'] and alert_count >= tier_info['alert_limit']:
                            st.error(f"🔒 Alert limit reached! You have {alert_count}/{tier_info['alert_limit']} alerts.")
                            st.info("✨ Upgrade to Pro Trader for unlimited alerts!")
                        else:
                            # Create the alert
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

# ================= Trade Journal =================
st.markdown("---")
st.subheader("📔 Trade Journal")

# Check Pro subscription for trade journal access
if not auth.require_pro("Trade journal requires a Pro subscription to track and analyze your trades"):
    st.stop()  # Show upgrade message and stop
    
# User has Pro access - show trade journal
if True:
    # Calculate stats for overview
    workspace_id = st.session_state.get('workspace_id', 'anonymous')
    journal_stats = calculate_journal_stats(workspace_id)

    # Overview metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        total_trades = journal_stats.get('total_trades', 0)
        st.metric("Total Trades", total_trades)

    with col2:
        win_rate = journal_stats.get('win_rate', 0)
        st.metric("Win Rate", f"{win_rate:.1f}%")

    with col3:
        total_pnl = journal_stats.get('total_pnl', 0)
        pnl_color = "green" if total_pnl >= 0 else "red"
        st.metric("Total P&L", f"${total_pnl:,.2f}")

    with col4:
        avg_r = journal_stats.get('avg_r', 0)
        st.metric("Avg R-Multiple", f"{avg_r:.2f}R")

    # Main journal tabs
    tab1, tab2, tab3, tab4 = st.tabs(["➕ Log Trade", "📊 Trade History", "📈 Performance Stats", "💡 Insights"])

    with tab1:
        st.subheader("Log New Trade")
    
        col1, col2 = st.columns(2)
    
        with col1:
            journal_symbol = st.text_input("Symbol:", placeholder="e.g., AAPL", key="journal_symbol").upper()
            direction = st.selectbox("Direction:", ["LONG", "SHORT"], key="journal_direction")
            trade_type = st.selectbox("Trade Type:", ["Spot", "Options", "Futures", "Margin"], key="journal_trade_type")
            entry_date = st.date_input("Entry Date:", key="journal_entry_date")
            
            # Show different fields based on trade type
            if trade_type == "Options":
                option_type = st.selectbox("Option Type:", ["CALL", "PUT"], key="journal_option_type")
                entry_price_text = st.text_input("Premium per Contract:", value="0.00", key="journal_entry_price", 
                                            help="Premium you paid per contract (e.g., $0.13)")
                entry_price = float(entry_price_text) if entry_price_text else 0.0
                num_contracts_text = st.text_input("Number of Contracts:", value="0", key="journal_num_contracts",
                                              help="How many option contracts (e.g., 100)")
                num_contracts = int(float(num_contracts_text)) if num_contracts_text else 0
                contract_multiplier_text = st.text_input("Contract Multiplier:", value="100", key="journal_multiplier",
                                                    help="Usually 100 for equity options")
                contract_multiplier = int(float(contract_multiplier_text)) if contract_multiplier_text else 100
                quantity = num_contracts  # For compatibility
            else:
                entry_price_text = st.text_input("Entry Price:", value="0.00", key="journal_entry_price")
                entry_price = float(entry_price_text) if entry_price_text else 0.0
                quantity_text = st.text_input("Quantity:", value="0.00", key="journal_quantity")
                quantity = float(quantity_text) if quantity_text else 0.0
                option_type = None
                num_contracts = None
                contract_multiplier = 100
    
        with col2:
            if trade_type == "Options":
                strike_price_text = st.text_input("Strike Price:", value="0.00", key="journal_strike", 
                                              help="Strike price of the option")
                strike_price = float(strike_price_text) if strike_price_text else 0.0
                expiration_date = st.date_input("Expiration Date:", value=None, key="journal_expiration", 
                                               help="Option expiration date")
            else:
                strike_price_text = st.text_input("Strike Price (Options):", value="0.00", key="journal_strike", 
                                              help="For options trades only")
                strike_price = float(strike_price_text) if strike_price_text else 0.0
                expiration_date = st.date_input("Expiration Date (Options):", value=None, key="journal_expiration", 
                                               help="For options trades only")
            
            stop_loss_text = st.text_input("Stop Loss (Optional):", value="0.00", key="journal_stop", 
                                       help="Premium level for stop (options) or price for stock")
            stop_loss = float(stop_loss_text) if stop_loss_text else 0.0
            take_profit_text = st.text_input("Take Profit (Optional):", value="0.00", key="journal_tp")
            take_profit = float(take_profit_text) if take_profit_text else 0.0
            setup_type = st.selectbox("Setup Type:", ["", "Breakout", "Pullback", "Reversal", "Squeeze", "Momentum", "Earnings", "Other"], key="journal_setup")
            tags_input = st.text_input("Tags (comma-separated):", placeholder="swing, earnings, technical", key="journal_tags")
    
        entry_reason = st.text_area("Entry Reason / Trade Plan:", placeholder="Why did you enter this trade? What's your thesis?", key="journal_entry_reason", height=100)
    
        # Calculate position info
        if journal_symbol and entry_price > 0 and quantity > 0:
            if trade_type == "Options" and num_contracts:
                total_value = entry_price * num_contracts * contract_multiplier
                risk_amount = None
                if stop_loss and stop_loss > 0:
                    risk_per_contract = abs(entry_price - stop_loss)
                    risk_amount = risk_per_contract * num_contracts * contract_multiplier
            else:
                total_value = entry_price * quantity
                risk_amount = None
                if stop_loss and stop_loss > 0:
                    risk_per_share = abs(entry_price - stop_loss)
                    risk_amount = risk_per_share * quantity
        
            col1, col2, col3 = st.columns(3)
            with col1:
                st.info(f"Position Size: ${total_value:,.2f}")
            if risk_amount:
                with col2:
                    st.info(f"Risk Amount: ${risk_amount:,.2f}")
                with col3:
                    risk_pct = (risk_amount / total_value) * 100 if total_value > 0 else 0
                    st.info(f"Risk %: {risk_pct:.2f}%")
        
            col1, col2, col3 = st.columns([1, 1, 1])
            with col2:
                if st.button("📝 Log Trade", type="primary", width='stretch'):
                    tags_list = [tag.strip() for tag in tags_input.split(',')] if tags_input else None
                    setup = setup_type if setup_type else None
                
                    success = add_trade_to_journal(
                        workspace_id=workspace_id,
                        symbol=journal_symbol,
                        entry_date=entry_date,
                        entry_price=entry_price,
                        quantity=quantity,
                        direction=direction,
                        trade_type=trade_type,
                        strike_price=strike_price if strike_price and strike_price > 0 else None,
                        expiration_date=expiration_date if expiration_date else None,
                        stop_loss=stop_loss if stop_loss and stop_loss > 0 else None,
                        take_profit=take_profit if take_profit and take_profit > 0 else None,
                        setup_type=setup,
                        entry_reason=entry_reason if entry_reason else None,
                        tags=tags_list,
                        option_type=option_type,
                        premium_per_contract=entry_price if trade_type == "Options" else None,
                        num_contracts=num_contracts if trade_type == "Options" else None,
                        contract_multiplier=contract_multiplier if trade_type == "Options" else 100
                    )
                
                    if success:
                        if trade_type == "Options":
                            st.success(f"✅ Trade logged: {direction} {num_contracts} {option_type} contracts of {journal_symbol}")
                        else:
                            st.success(f"✅ Trade logged: {direction} {quantity} shares of {journal_symbol}")
                        st.rerun()

    with tab2:
        st.subheader("Trade History")
    
        # Filter options
        col1, col2 = st.columns([1, 3])
        with col1:
            show_filter = st.selectbox("Show:", ["All Trades", "Active Only", "Closed Only"], key="journal_filter")
    
        active_only = show_filter == "Active Only"
        trades = get_trade_journal(workspace_id, active_only=active_only)
    
        if not trades:
            trades = []
    
        if show_filter == "Closed Only":
            trades = [t for t in trades if not t['is_active']]
    
        if trades:
            for i, trade in enumerate(trades):
                # Build title with options info if available
                title_parts = [trade['symbol'], '-', trade['direction']]
                if trade.get('trade_type') == 'Options' and trade.get('option_type'):
                    strike = trade.get('strike_price') or 0
                    title_parts.extend([f"{trade.get('option_type')}", f"@${float(strike):.0f}"])
                title_parts.append(f"({pd.to_datetime(trade['entry_date']).strftime('%Y-%m-%d')})")
                title = f"{'🟢' if trade['is_active'] else '⚫'} {' '.join(str(p) for p in title_parts)}"
                
                with st.expander(title, expanded=False):
                    col1, col2, col3 = st.columns(3)
                
                    with col1:
                        # Show appropriate fields based on trade type
                        if trade.get('trade_type') == 'Options':
                            st.write(f"**Option Type:** {trade.get('option_type', 'N/A')}")
                            st.write(f"**Premium/Contract:** ${float(trade['entry_price']):.2f}")
                            st.write(f"**Contracts:** {trade.get('num_contracts', 'N/A')}")
                            st.write(f"**Multiplier:** {trade.get('contract_multiplier', 100)}")
                            if trade.get('strike_price'):
                                st.write(f"**Strike Price:** ${float(trade['strike_price']):.2f}")
                            if trade.get('expiration_date'):
                                st.write(f"**Expiration:** {pd.to_datetime(trade['expiration_date']).strftime('%Y-%m-%d')}")
                        else:
                            st.write(f"**Entry Price:** ${float(trade['entry_price']):.2f}")
                            st.write(f"**Quantity:** {float(trade['quantity']):.4f}")
                            if trade.get('strike_price'):
                                st.write(f"**Strike Price:** ${float(trade['strike_price']):.2f}")
                            if trade.get('expiration_date'):
                                st.write(f"**Expiration:** {pd.to_datetime(trade['expiration_date']).strftime('%Y-%m-%d')}")
                        
                        if trade['stop_loss']:
                            st.write(f"**Stop Loss:** ${float(trade['stop_loss']):.2f}")
                        if trade['take_profit']:
                            st.write(f"**Take Profit:** ${float(trade['take_profit']):.2f}")
                
                    with col2:
                        if not trade['is_active']:
                            if trade.get('trade_type') == 'Options':
                                st.write(f"**Exit Premium:** ${float(trade['exit_price']):.2f}")
                            else:
                                st.write(f"**Exit Price:** ${float(trade['exit_price']):.2f}")
                            pnl = float(trade['pnl'])
                            pnl_pct = float(trade['pnl_pct'])
                            pnl_emoji = "🟢" if pnl >= 0 else "🔴"
                            st.write(f"**P&L:** {pnl_emoji} ${pnl:,.2f} ({pnl_pct:+.2f}%)")
                            if trade['r_multiple']:
                                r_val = float(trade['r_multiple'])
                                st.write(f"**R-Multiple:** {r_val:.2f}R")
                        else:
                            st.write("**Status:** 🟢 Active")
                            st.write("")
                
                    with col3:
                        if trade.get('trade_type'):
                            st.write(f"**Type:** {trade['trade_type']}")
                        if trade['setup_type']:
                            st.write(f"**Setup:** {trade['setup_type']}")
                        if trade['tags']:
                            st.write(f"**Tags:** {', '.join(trade['tags'])}")
                
                    if trade['entry_reason']:
                        st.write(f"**Entry Reason:** {trade['entry_reason']}")
                
                    if not trade['is_active']:
                        if trade['exit_reason']:
                            st.write(f"**Exit Reason:** {trade['exit_reason']}")
                        if trade['mistakes_learned']:
                            st.write(f"**💡 Lessons Learned:** {trade['mistakes_learned']}")
                
                    # Actions
                    col1, col2, col3, col4 = st.columns(4)
                
                    if trade['is_active']:
                        with col1:
                            if st.button("Close Trade", key=f"close_trade_{i}"):
                                st.session_state[f'closing_trade_{i}'] = True
                                st.rerun()
                    
                        if st.session_state.get(f'closing_trade_{i}', False):
                            st.write("**Close Trade:**")
                            exit_date = st.date_input("Exit Date:", key=f"exit_date_{i}")
                            
                            # Label changes based on trade type
                            price_label = "Exit Premium:" if trade.get('trade_type') == 'Options' else "Exit Price:"
                            exit_price = st.number_input(price_label, min_value=0.01, step=0.01, key=f"exit_price_{i}")
                            exit_reason = st.text_input("Exit Reason:", key=f"exit_reason_{i}")
                            mistakes = st.text_area("Mistakes / Lessons Learned:", key=f"mistakes_{i}")
                        
                            col1, col2 = st.columns(2)
                            with col1:
                                if st.button("✅ Confirm Close", key=f"confirm_close_{i}"):
                                    success = close_trade(
                                        trade_id=trade['id'],
                                        exit_date=exit_date,
                                        exit_price=exit_price,
                                        exit_reason=exit_reason if exit_reason else None,
                                        mistakes_learned=mistakes if mistakes else None
                                    )
                                    if success:
                                        st.success("Trade closed successfully!")
                                        st.session_state[f'closing_trade_{i}'] = False
                                        st.rerun()
                            with col2:
                                if st.button("Cancel", key=f"cancel_close_{i}"):
                                    st.session_state[f'closing_trade_{i}'] = False
                                    st.rerun()
                
                    with col4:
                        if st.button("🗑️ Delete", key=f"delete_trade_{i}"):
                            if delete_trade(trade['id']):
                                st.success("Trade deleted")
                                st.rerun()
        
            # Export option - Single-click CSV download
            st.markdown("---")
            df_data = []
            for trade in trades:
                df_data.append({
                    'Symbol': trade['symbol'],
                    'Direction': trade['direction'],
                    'Type': trade.get('trade_type', 'Spot'),
                    'Strike': float(trade['strike_price']) if trade.get('strike_price') else '',
                    'Expiration': pd.to_datetime(trade['expiration_date']).strftime('%Y-%m-%d') if trade.get('expiration_date') else '',
                    'Entry Date': pd.to_datetime(trade['entry_date']).strftime('%Y-%m-%d'),
                    'Entry Price': float(trade['entry_price']),
                    'Exit Date': pd.to_datetime(trade['exit_date']).strftime('%Y-%m-%d') if trade['exit_date'] else '',
                    'Exit Price': float(trade['exit_price']) if trade['exit_price'] else '',
                    'Quantity': float(trade['quantity']),
                    'P&L': float(trade['pnl']) if trade['pnl'] else '',
                    'P&L %': float(trade['pnl_pct']) if trade['pnl_pct'] else '',
                    'R-Multiple': float(trade['r_multiple']) if trade['r_multiple'] else '',
                    'Setup': trade['setup_type'] or '',
                    'Tags': ', '.join(trade.get('tags', [])) if trade.get('tags') else '',
                    'Entry Reason': trade.get('entry_reason', ''),
                    'Exit Reason': trade.get('exit_reason', ''),
                    'Lessons Learned': trade.get('mistakes_learned', ''),
                    'Status': 'Active' if trade['is_active'] else 'Closed'
                })
        
            df = pd.DataFrame(df_data)
            csv = df.to_csv(index=False)
            st.download_button(
                label="📥 Download Trade Journal (CSV)",
                data=csv,
                file_name=f"trade_journal_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                mime="text/csv",
                use_container_width=True
            )
        else:
            st.info("No trades logged yet. Use the 'Log Trade' tab to add your first trade!")

    with tab3:
        st.subheader("Performance Statistics")
    
        if journal_stats.get('total_trades', 0) > 0:
            # Key metrics
            col1, col2, col3, col4 = st.columns(4)
        
            with col1:
                st.metric("Win Rate", f"{journal_stats['win_rate']:.1f}%")
                st.metric("Winning Trades", journal_stats['winning_trades'])
        
            with col2:
                st.metric("Avg R-Multiple", f"{journal_stats['avg_r']:.2f}R")
                st.metric("Losing Trades", journal_stats['losing_trades'])
        
            with col3:
                st.metric("Total P&L", f"${journal_stats['total_pnl']:,.2f}")
                st.metric("Profit Factor", f"{journal_stats['profit_factor']:.2f}")
        
            with col4:
                st.metric("Active Trades", journal_stats['active_trades'])
                st.metric("Total Trades", journal_stats['total_trades'])
        
            st.markdown("---")
        
            # Win/Loss breakdown
            col1, col2 = st.columns(2)
        
            with col1:
                st.subheader("Win/Loss Analysis")
                st.write(f"**Average Win:** ${journal_stats['avg_win']:,.2f}")
                st.write(f"**Average Loss:** ${journal_stats['avg_loss']:,.2f}")
                st.write(f"**Largest Win:** ${journal_stats['largest_win']:,.2f}")
                st.write(f"**Largest Loss:** ${journal_stats['largest_loss']:,.2f}")
        
            with col2:
                st.subheader("Key Insights")
            
                if journal_stats['win_rate'] >= 50:
                    st.success(f"✅ Solid win rate of {journal_stats['win_rate']:.1f}%")
                else:
                    st.warning(f"⚠️ Win rate below 50% ({journal_stats['win_rate']:.1f}%)")
            
                if journal_stats['avg_r'] >= 1.5:
                    st.success(f"✅ Strong average R of {journal_stats['avg_r']:.2f}R")
                elif journal_stats['avg_r'] >= 1.0:
                    st.info(f"📊 Decent average R of {journal_stats['avg_r']:.2f}R")
                else:
                    st.warning(f"⚠️ Low average R of {journal_stats['avg_r']:.2f}R")
            
                if journal_stats['profit_factor'] >= 2.0:
                    st.success(f"✅ Excellent profit factor of {journal_stats['profit_factor']:.2f}")
                elif journal_stats['profit_factor'] >= 1.5:
                    st.info(f"📊 Good profit factor of {journal_stats['profit_factor']:.2f}")
                elif journal_stats['profit_factor'] > 1.0:
                    st.warning(f"⚠️ Marginal profit factor of {journal_stats['profit_factor']:.2f}")
                else:
                    st.error(f"❌ Unprofitable: Profit factor {journal_stats['profit_factor']:.2f}")
        else:
            st.info("No completed trades yet. Statistics will appear once you close some trades.")

    with tab4:
        st.subheader("Trading Insights & Tips")
    
        st.markdown("""
        ### 📚 How to Use Your Trade Journal
    
        **Log Every Trade:**
        - Record entry immediately after placing trade
        - Include your reasoning and plan
        - Set stop loss for R-multiple tracking
    
        **Close Trades Properly:**
        - Log exit price and reason
        - Document what went wrong (mistakes)
        - Note lessons learned for next time
    
        **Review Regularly:**
        - Check stats weekly/monthly
        - Identify patterns in winners/losers
        - Focus on setup types that work
    
        ### 🎯 What to Track
    
        **Setup Types:**
        - Which setups have highest win rate?
        - Which produce best R-multiples?
        - Which should you avoid?
    
        **Mistakes:**
        - Are you chasing entries?
        - Cutting winners too early?
        - Holding losers too long?
    
        **Discipline:**
        - Following your stop losses?
        - Taking profits at target?
        - Sticking to trade plan?
    
        ### 💡 Pro Tips
    
        - Aim for win rate >50% OR avg R >1.5R (not both needed)
        - Profit factor >1.5 = profitable strategy
        - Review mistakes section often - that's where growth happens
        - Export to CSV for deeper analysis in spreadsheets
        """)

# ================= Backtesting Section =================
st.markdown("---")
st.subheader("🔬 Strategy Backtesting")

# Check Pro subscription for backtesting access
if not auth.require_pro("Strategy backtesting requires a Pro subscription"):
    st.stop()

# User has Pro access - show backtesting
if True:

    # Backtest controls
    col1, col2, col3, col4 = st.columns([2, 1, 1, 1])

    with col1:
        backtest_name = st.text_input("Backtest Name:", placeholder="e.g., SPY Momentum Test", key="backtest_name")

    with col2:
        start_date = st.date_input("Start Date:", value=pd.to_datetime("2023-01-01"), key="backtest_start")

    with col3:
        end_date = st.date_input("End Date:", value=pd.to_datetime("2024-01-01"), key="backtest_end")

    with col4:
        backtest_timeframe = st.selectbox("Timeframe:", ["1D", "4h", "1h", "30m", "15m", "5m"], key="backtest_timeframe")

    # Backtest parameters - using wider columns for better readability
    col1, col2 = st.columns(2)

    with col1:
        sub_col1, sub_col2 = st.columns(2)
        with sub_col1:
            initial_equity_text = st.text_input("Initial Equity ($):", value="10000", key="initial_equity")
            initial_equity = float(initial_equity_text) if initial_equity_text else 10000
        with sub_col2:
            risk_per_trade_text = st.text_input("Risk per Trade (%):", value="1.00", key="risk_per_trade")
            risk_per_trade = (float(risk_per_trade_text) if risk_per_trade_text else 1.0) / 100

    with col2:
        sub_col3, sub_col4 = st.columns(2)
        with sub_col3:
            stop_atr_mult_text = st.text_input("Stop Loss (ATR x):", value="1.50", key="stop_atr_mult")
            stop_atr_mult = float(stop_atr_mult_text) if stop_atr_mult_text else 1.5
        with sub_col4:
            min_score_text = st.text_input("Min Score Threshold:", value="10", key="min_score")
            min_score = int(float(min_score_text)) if min_score_text else 10

    # Signal Alerts (Pro Trader exclusive feature)
    st.write("**📧 Backtesting Signal Alerts** (Get notified of BUY/SELL signals)")
    col1, col2 = st.columns([1, 3])
    with col1:
        enable_backtest_alerts = st.checkbox("Enable Alerts", key="enable_backtest_alerts", 
                                             help="Get email notifications when backtesting generates buy or sell signals")
    with col2:
        alert_email = st.text_input("Alert Email:", placeholder="your@email.com", key="backtest_alert_email", 
                                   disabled=not enable_backtest_alerts,
                                   help="Email address for receiving backtest signal alerts")
    
    if enable_backtest_alerts and not alert_email:
        st.warning("⚠️ Please enter an email address to receive alerts")

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
                    min_score=min_score,
                    enable_alerts=enable_backtest_alerts and alert_email is not None and alert_email.strip() != "",
                    user_email=alert_email.strip() if alert_email else None
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
                    symbol_perf = results.get('symbol_performance', {})
                    if symbol_perf and len(symbol_perf) > 0:
                        with st.expander("📊 Symbol Performance Breakdown", expanded=True):
                            symbol_perf_data = []
                            for symbol, perf in symbol_perf.items():
                                symbol_perf_data.append({
                                    'Symbol': symbol,
                                    'Trades': perf.get('total_trades', 0),
                                    'Win Rate': f"{perf.get('win_rate', 0)*100:.1f}%",
                                    'Total P&L': f"${perf.get('total_pnl', 0):,.2f}",
                                    'Avg Return': f"{perf.get('avg_return', 0)*100:.2f}%"
                                })
                        
                            if symbol_perf_data:
                                symbol_df = pd.DataFrame(symbol_perf_data)
                                st.table(symbol_df)
                
                    # Trade log
                    trades_list = results.get('trades', [])
                    if trades_list and len(trades_list) > 0:
                        with st.expander("📋 Trade Log", expanded=True):
                            trades_df = pd.DataFrame(trades_list)
                            
                            if 'entry_date' in trades_df.columns:
                                trades_df['entry_date'] = pd.to_datetime(trades_df['entry_date']).dt.strftime('%Y-%m-%d')
                            if 'exit_date' in trades_df.columns:
                                trades_df['exit_date'] = pd.to_datetime(trades_df['exit_date']).dt.strftime('%Y-%m-%d')
                            if 'trade_return' in trades_df.columns:
                                trades_df['trade_return'] = (trades_df['trade_return'] * 100).round(2)
                            if 'trade_pnl' in trades_df.columns:
                                trades_df['trade_pnl'] = trades_df['trade_pnl'].round(2)
                        
                            display_cols = ['symbol', 'direction', 'entry_date', 'exit_date', 'entry_price', 'exit_price', 'trade_return', 'trade_pnl', 'exit_reason']
                            available_cols = [col for col in display_cols if col in trades_df.columns]
                            st.table(trades_df[available_cols])
                
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

# === DARK THEME FOR ALL DEVICES - Mobile and Desktop ===
# Keeping dark theme consistent across all platforms
# MSP_REDIRECT_OVERRIDE_START
import streamlit as st

st.markdown("""
<script>
(function redirectUpgradeButtons(){
  function hook() {
    const rules = [
      { test: /pro.*4\.99/i, href: "https://marketscannerpros.app/pricing#pro" },
      { test: /trader.*9\.99/i, href: "https://marketscannerpros.app/pricing#protrader" }
    ];

    document.querySelectorAll('button, a, div[role="button"]').forEach(btn => {
      const txt = (btn.textContent || "").trim();
      console.log("🔍 Found button:", txt);   // DEBUG log all button text
      const rule = rules.find(r => r.test.test(txt));
      if (rule && !btn.__mspHooked) {
        console.log("✅ Hooking button:", txt, "→", rule.href);
        btn.__mspHooked = true;
        btn.addEventListener('click', e => {
          console.log("➡️ Redirecting from button:", txt, "to", rule.href);
          e.preventDefault();
          e.stopImmediatePropagation();
          window.location.href = rule.href;
        }, { capture: true });
      }
    });

    // Kill checkout alerts
    document.querySelectorAll('[data-testid="stAlert"], div').forEach(a => {
      const t = (a.textContent || "").toLowerCase();
      if (t.includes("redirecting to secure checkout")) {
        console.log("❌ Removed unwanted alert:", t);
        a.remove();
      }
    });
  }
  hook();
  setInterval(hook, 1000); // recheck every 1s
})();
</script>
""", unsafe_allow_html=True)
# MSP_REDIRECT_OVERRIDE_END

# MSP_MONKEYPATCH_BUTTON_START
# Intercept Streamlit's st.button to redirect upgrade buttons to marketing pricing
import re as _re
__orig_button = st.button
__orig_link_button = getattr(st, "link_button", None)

def _msp_button(label, *args, **kwargs):
    text = str(label or "")
    # Match common variants of your upgrade buttons
    is_pro = _re.search(r"(complete.*pro.*4\.99)|(pro.*4\.99)", text, _re.I)
    is_trader = _re.search(r"(complete.*(pro\s*)?trader.*9\.99)|(trader.*9\.99)", text, _re.I)

    if is_pro:
        url = "https://marketscannerpros.app/pricing#pro"
        if __orig_link_button:
            __orig_link_button("🚀 PRO — $4.99 / month", url)
        else:
            st.markdown(f"[🚀 PRO — $4.99 / month]({url})", unsafe_allow_html=True)
        return False  # prevent original checkout flow

    if is_trader:
        url = "https://marketscannerpros.app/pricing#protrader"
        if __orig_link_button:
            __orig_link_button("💎 PRO TRADER — $9.99 / month", url)
        else:
            st.markdown(f"[💎 PRO TRADER — $9.99 / month]({url})", unsafe_allow_html=True)
        return False

    # Default: run original Streamlit button
    return __orig_button(label, *args, **kwargs)

st.button = _msp_button
# MSP_MONKEYPATCH_BUTTON_END
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

# LEGAL DISCLAIMER - REQUIRED FOR LIABILITY PROTECTION
st.error("""
🚨 **IMPORTANT LEGAL DISCLAIMER** 🚨

**This is NOT financial or investment advice.** MarketScanner Pro is for educational and informational purposes only.

⚠️ **Trading and investing involves substantial risk of loss and is not suitable for all investors.**
⚠️ **Past performance does not guarantee future results.**  
⚠️ **You are solely responsible for your investment decisions.**

**Consult a licensed financial advisor before making investment decisions.**
""")

st.markdown("""
**Market Scanner Dashboard** - Real-time technical analysis with risk management
- Data provided by Yahoo Finance via yfinance library
- Technical indicators calculated using pandas  
- Position sizing based on Average True Range (ATR)
- Email notifications powered by Vercel/Resend API (built-in)
- In-app notifications provide 100% reliable delivery
""")

# Add Privacy Policy link separately with proper HTML
col1, col2 = st.columns([3, 1])
with col1:
    st.markdown("**Legal**: <a href='https://marketscannerpros.app/privacy' target='_blank'>Privacy Policy</a> | Contact: support@marketscannerpros.app", unsafe_allow_html=True)
with col2:
    st.markdown("**Powered by**: <a href='https://replit.com/refer/bradleywessling' target='_blank'>Replit ⚡</a>", unsafe_allow_html=True)
