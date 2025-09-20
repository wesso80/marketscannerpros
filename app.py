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
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import plotly.express as px

# ================= PWA Configuration =================
st.set_page_config(page_title="Market Scanner", page_icon="📈", layout="wide")

# Handle static file serving for PWA assets at root level
# Files copied to root: manifest.webmanifest, sw.js, assetlinks.json

st.markdown("""
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0f172a">
<script>if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
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

# ================= Price Alerts Management =================
def create_price_alert(symbol: str, alert_type: str, target_price: float, notification_method: str = 'email') -> bool:
    """Create a new price alert"""
    # Get current user email from session state
    user_email = st.session_state.get('user_email', '')
    
    query = """
        INSERT INTO price_alerts (symbol, alert_type, target_price, notification_method, user_email) 
        VALUES (%s, %s, %s, %s, %s)
    """
    result = execute_db_write(query, (symbol, alert_type, target_price, notification_method, user_email))
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
        # Get user notification preferences
        user_prefs = get_notification_preferences_for_alert(alert)
        
        if user_prefs and user_prefs['user_email']:
            # Send to user's configured email using SendGrid
            if user_prefs['notification_method'] in ['email', 'both']:
                send_email_to_user(subject, message, user_prefs['user_email'])
        else:
            # No user preferences - show in-app notification instead
            st.warning(f"🚨 Price Alert: {alert['symbol']} reached ${alert['target_price']:.2f}")
            st.info("Configure email notifications in the sidebar to receive alerts via email.")
    
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

def send_email_to_user(subject: str, body: str, to_email: str) -> bool:
    """Send email to specific user using SendGrid - from python_sendgrid integration"""
    import os
    
    try:
        # Check if SendGrid is configured
        sendgrid_key = os.environ.get('SENDGRID_API_KEY')
        if not sendgrid_key:
            st.error("SendGrid API key not configured. Please set SENDGRID_API_KEY environment variable.")
            return False
            
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, Email, To, Content
        
        sg = SendGridAPIClient(sendgrid_key)
        
        # Use a default from email (you can customize this)
        from_email = os.environ.get('NOTIFICATION_EMAIL', 'alerts@marketscanner.app')
        
        message = Mail(
            from_email=Email(from_email),
            to_emails=To(to_email),
            subject=subject
        )
        message.content = Content("text/plain", body)
        
        sg.send(message)
        return True
        
    except Exception as e:
        st.error(f"Failed to send email: {str(e)}")
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
            'notification_method': st.session_state.get('notification_method', 'email')
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
    try:
        ticker = yf.Ticker(symbol)
        
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
        pass
    
    return None

def update_portfolio_prices() -> None:
    """Update all portfolio positions with current prices"""
    try:
        positions_query = "SELECT symbol, quantity, average_cost FROM portfolio_positions"
        positions = execute_db_query(positions_query)
        
        if positions:
            for position in positions:
                symbol = position['symbol']
                quantity = float(position['quantity'])
                average_cost = float(position['average_cost'])
                
                current_price = get_current_price_portfolio(symbol) or 0.0
                market_value = quantity * current_price
                unrealized_pnl = (current_price - average_cost) * quantity
                
                update_query = """
                    UPDATE portfolio_positions 
                    SET current_price = %s, market_value = %s, unrealized_pnl = %s, updated_at = NOW()
                    WHERE symbol = %s
                """
                execute_db_write(update_query, (current_price, market_value, unrealized_pnl, symbol))
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
st.set_page_config(page_title="Market Scanner Dashboard", layout="wide")

# Add PWA functionality
st.markdown("""
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0f172a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Market Scanner">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<script>if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
""", unsafe_allow_html=True)
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
run_clicked = c1.button("🔎 Run Scanner", width='stretch')
refresh_clicked = c2.button("🔁 Refresh Data", width='stretch')
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
        ["Email Only", "None"],
        index=0,
        help="Choose how you want to receive alerts"
    )
    
    # Map UI options to backend values
    method_mapping = {
        "Email Only": "email",
        "None": "none"
    }
    backend_method = method_mapping[notification_method]
    
    if user_email and notification_method == "Email Only":
        col1, col2 = st.columns(2)
        with col1:
            if st.button("📧 Test Email", help="Send a test notification to verify your email"):
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
                        success = send_email_to_user(test_subject, test_message, user_email)
                        if success:
                            st.success("✅ Test email sent! Check your inbox.")
                        else:
                            st.error("❌ Test email failed. Check SendGrid configuration.")
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

# Display Results
st.subheader("🏛 Equity Markets")
if not st.session_state.eq_results.empty:
    # Limit display to top K
    display_eq = st.session_state.eq_results.head(topk)
    st.dataframe(display_eq, width='stretch')
    
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
        st.dataframe(st.session_state.eq_errors, width='stretch')

st.subheader("₿ Crypto Markets")
if not st.session_state.cx_results.empty:
    # Limit display to top K
    display_cx = st.session_state.cx_results.head(topk)
    st.dataframe(display_cx, width='stretch')
    
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
        st.dataframe(st.session_state.cx_errors, width='stretch')

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
