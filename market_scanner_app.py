# market_scanner_app.py
# One-file Market Scanner (pure pandas) + Streamlit Dashboard
# - Equities & Crypto via yfinance (AAPL, MSFT, BTC-USD, ETH-USD…)
# - ATR-based position sizing
# - Optional Email + Slack summaries
# - CSV download

import os, smtplib, ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import pandas as pd, numpy as np, yfinance as yf, requests, streamlit as st
import psycopg2
from psycopg2.extras import RealDictCursor
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime, timezone
from dateutil import tz
from math import floor
import io
import json

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
    # Email via env (don't paste passwords into code)
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "465"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_pass: str = os.getenv("SMTP_PASS", "")
    email_to: str  = os.getenv("EMAIL_TO", "")

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
    """Get PostgreSQL connection pool"""
    try:
        from psycopg2 import pool
        connection_pool = pool.SimpleConnectionPool(
            1, 20,  # min and max connections
            host=os.getenv("PGHOST"),
            port=os.getenv("PGPORT"),
            database=os.getenv("PGDATABASE"),
            user=os.getenv("PGUSER"),
            password=os.getenv("PGPASSWORD")
        )
        return connection_pool
    except Exception as e:
        st.error(f"Database connection pool failed: {e}")
        return None

def execute_db_query(query: str, params: Optional[tuple] = None, fetch: bool = True):
    """Execute database query and return results"""
    pool = get_connection_pool()
    if not pool:
        return None
    
    conn = None
    try:
        conn = pool.getconn()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if fetch:
                return [dict(row) for row in cur.fetchall()]
            else:
                conn.commit()
                return cur.rowcount  # Return number of affected rows
    except Exception as e:
        st.error(f"Database query failed: {e}")
        if conn:
            conn.rollback()
        return None
    finally:
        if conn:
            pool.putconn(conn)

def execute_db_write(query: str, params: Optional[tuple] = None) -> Optional[int]:
    """Execute database write query and return affected row count"""
    result = execute_db_query(query, params, fetch=False)
    return result if isinstance(result, int) else None

# ================= Price Alerts Management =================
def create_price_alert(symbol: str, alert_type: str, target_price: float, notification_method: str = 'email') -> bool:
    """Create a new price alert"""
    query = """
        INSERT INTO price_alerts (symbol, alert_type, target_price, notification_method) 
        VALUES (%s, %s, %s, %s)
    """
    result = execute_db_write(query, (symbol, alert_type, target_price, notification_method))
    return result is not None and result > 0

def get_active_alerts() -> List[Dict[str, Any]]:
    """Get all active price alerts"""
    query = "SELECT * FROM price_alerts WHERE is_active = TRUE ORDER BY created_at DESC"
    result = execute_db_query(query)
    return result if result else []

def get_all_alerts() -> List[Dict[str, Any]]:
    """Get all price alerts"""
    query = "SELECT * FROM price_alerts ORDER BY created_at DESC"
    result = execute_db_query(query)
    return result if result else []

def trigger_alert(alert_id: int, current_price: float) -> bool:
    """Mark an alert as triggered - atomic operation"""
    query = """
        UPDATE price_alerts 
        SET is_triggered = TRUE, triggered_at = NOW(), current_price = %s, is_active = FALSE
        WHERE id = %s AND is_active = TRUE AND is_triggered = FALSE
    """
    result = execute_db_write(query, (current_price, alert_id))
    return result is not None and result > 0

def delete_alert(alert_id: int) -> bool:
    """Delete a price alert"""
    query = "DELETE FROM price_alerts WHERE id = %s"
    result = execute_db_write(query, (alert_id,))
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
    """Check all active alerts against current prices and trigger if needed"""
    active_alerts = get_active_alerts()
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
                    if trigger_alert(alert['id'], current_price):
                        triggered_count += 1
                        # Send notification
                        send_alert_notification(alert, current_price)
        except Exception as e:
            print(f"Error checking alert for {alert['symbol']}: {e}")
    
    return triggered_count

def send_alert_notification(alert: Dict[str, Any], current_price: float):
    """Send notification for triggered alert"""
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
    
    # Send email notification
    if alert['notification_method'] in ['email', 'both']:
        send_email(subject, message)
    
    # Send Slack notification  
    if alert['notification_method'] in ['slack', 'both']:
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
    return result is not None

def delete_watchlist(watchlist_id: int) -> bool:
    """Delete a watchlist"""
    query = "DELETE FROM watchlists WHERE id = %s"
    result = execute_db_query(query, (watchlist_id,), fetch=False)
    return result is not None

# ================= Data Source (yfinance) =================
def get_ohlcv_yf(symbol: str, timeframe: str) -> pd.DataFrame:
    interval, period = _yf_interval_period(timeframe)
    data = yf.Ticker(symbol.upper()).history(period=period, interval=interval, auto_adjust=False)
    if data is None or data.empty:
        raise ValueError(f"No yfinance data for {symbol} @ {interval}/{period}")
    data.index = pd.to_datetime(data.index, utc=True)
    out = pd.DataFrame({
        "open":   data["Open"].astype(float),
        "high":   data["High"].astype(float),
        "low":    data["Low"].astype(float),
        "close":  data["Close"].astype(float),
        "volume": data["Volume"].astype(float).fillna(0.0),
    }, index=data.index).dropna()
    return out

def get_ohlcv(symbol: str, timeframe: str) -> pd.DataFrame:
    return get_ohlcv_yf(symbol, timeframe)

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

def send_email(subject: str, body: str):
    if not all([CFG.smtp_host, CFG.smtp_port, CFG.smtp_user, CFG.smtp_pass, CFG.email_to]):
        return False, "Missing SMTP env vars"
    msg = MIMEMultipart()
    msg["From"] = CFG.smtp_user
    msg["To"] = CFG.email_to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(CFG.smtp_host, CFG.smtp_port, context=context) as server:
            server.login(CFG.smtp_user, CFG.smtp_pass)
            server.sendmail(CFG.smtp_user, CFG.email_to, msg.as_string())
        return True, "sent"
    except Exception as e:
        return False, str(e)

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

# ================= UI =================
st.set_page_config(page_title="Market Scanner Dashboard", layout="wide")
st.title("📊 Market Scanner Dashboard")

# Initialize session state
if 'eq_results' not in st.session_state:
    st.session_state.eq_results = pd.DataFrame()
if 'cx_results' not in st.session_state:
    st.session_state.cx_results = pd.DataFrame()
if 'eq_errors' not in st.session_state:
    st.session_state.eq_errors = pd.DataFrame()
if 'cx_errors' not in st.session_state:
    st.session_state.cx_errors = pd.DataFrame()

c1, c2, c3 = st.columns([1,1,1])
run_clicked = c1.button("🔎 Run Scanner", use_container_width=True)
refresh_clicked = c2.button("🔁 Refresh Data", use_container_width=True)
now_syd = datetime.now(timezone.utc).astimezone(SYD).strftime("%H:%M:%S %Z")
c3.info(f"Last scan: {now_syd}")

# Clear cache if refresh clicked
if refresh_clicked:
    st.cache_data.clear()
    st.success("Data cache cleared!")
    st.rerun()

# Sidebar
# ================= Watchlist Management =================
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
eq_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(equity_symbols), height=140)

st.sidebar.header("Crypto Symbols (BTC-USD style)")
cx_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(crypto_symbols), height=140)

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

st.sidebar.header("Notifications")
send_email_toggle = st.sidebar.checkbox("Email top picks (uses SMTP_* env vars)")
send_slack_toggle = st.sidebar.checkbox("Slack summary (uses SLACK_WEBHOOK_URL)")

# Main scanning logic
if run_clicked:
    eq_syms = [s.strip().upper() for s in eq_input.splitlines() if s.strip()]
    cx_syms = [s.strip().upper() for s in cx_input.splitlines() if s.strip()]
    
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
            
            if send_email_toggle:
                email_subject = f"Market Scanner: Top {len(top_results)} Picks"
                email_body = format_block(top_results, f"Top {len(top_results)} Market Picks")
                success, msg = send_email(email_subject, email_body)
                if success:
                    st.success("Email sent successfully!")
                else:
                    st.error(f"Email failed: {msg}")

# Display Results
st.subheader("🏛 Equity Markets")
if not st.session_state.eq_results.empty:
    # Limit display to top K
    display_eq = st.session_state.eq_results.head(topk)
    st.dataframe(display_eq, use_container_width=True)
    
    # CSV download for equity results
    csv_eq = to_csv_download(st.session_state.eq_results, "equity_scan.csv")
    st.download_button(
        label="📥 Download Equity Results (CSV)",
        data=csv_eq,
        file_name=f"equity_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        mime="text/csv"
    )
else:
    st.info("No equity results to display. Click 'Run Scanner' to analyze equity markets.")

# Equity errors
if not st.session_state.eq_errors.empty:
    with st.expander("⚠️ Equity Scan Errors", expanded=False):
        st.dataframe(st.session_state.eq_errors, use_container_width=True)

st.subheader("₿ Crypto Markets")
if not st.session_state.cx_results.empty:
    # Limit display to top K
    display_cx = st.session_state.cx_results.head(topk)
    st.dataframe(display_cx, use_container_width=True)
    
    # CSV download for crypto results
    csv_cx = to_csv_download(st.session_state.cx_results, "crypto_scan.csv")
    st.download_button(
        label="📥 Download Crypto Results (CSV)",
        data=csv_cx,
        file_name=f"crypto_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        mime="text/csv"
    )
else:
    st.info("No crypto results to display. Click 'Run Scanner' to analyze crypto markets.")

# Crypto errors
if not st.session_state.cx_errors.empty:
    with st.expander("⚠️ Crypto Scan Errors", expanded=False):
        st.dataframe(st.session_state.cx_errors, use_container_width=True)

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
            alert_method = st.selectbox("Notification:", ["email", "slack", "both"], key="alert_method")
        
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
        st.dataframe(alerts_df[display_cols], use_container_width=True)
        
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
        st.dataframe(triggered_df[display_cols], use_container_width=True)
    else:
        st.info("No triggered alerts yet.")


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
