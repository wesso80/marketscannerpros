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
from dataclasses import dataclass
from typing import List, Tuple
from datetime import datetime, timezone
from dateutil import tz
from math import floor
import io

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
st.sidebar.header("Equity Symbols")
eq_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(CFG.symbols_equity), height=140)

st.sidebar.header("Crypto Symbols (BTC-USD style)")
cx_input = st.sidebar.text_area("Enter symbols (one per line):",
    "\n".join(CFG.symbols_crypto), height=140)

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
