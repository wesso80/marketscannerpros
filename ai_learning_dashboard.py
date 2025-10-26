import streamlit as st
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime

st.set_page_config(page_title="AI Learning Dashboard", page_icon="🧠", layout="wide")

st.title("🧠 AI Learning Dashboard")
st.caption("Real-time TradingView webhook performance tracking")

# API endpoint
API_URL = "http://localhost:8000"

@st.cache_data(ttl=10)
def get_metrics(symbol=None, timeframe=None, min_trades=1):
    """Fetch learning metrics from AI Scanner API"""
    params = {"min_trades": min_trades}
    if symbol:
        params["symbol"] = symbol
    if timeframe:
        params["timeframe"] = timeframe
    try:
        response = requests.get(f"{API_URL}/ai-scanner/metrics", params=params, timeout=5)
        if response.status_code == 200:
            return response.json()
        return None
    except:
        return None

@st.cache_data(ttl=10)
def get_positions(symbol=None, timeframe=None, status=None, limit=50):
    """Fetch positions from AI Scanner API"""
    params = {"limit": limit}
    if symbol:
        params["symbol"] = symbol
    if timeframe:
        params["timeframe"] = timeframe
    if status:
        params["status"] = status
    try:
        response = requests.get(f"{API_URL}/ai-scanner/positions", params=params, timeout=5)
        if response.status_code == 200:
            return response.json()
        return []
    except:
        return []

@st.cache_data(ttl=10)
def get_alerts(symbol=None, timeframe=None, limit=50):
    """Fetch alerts from AI Scanner API"""
    params = {"limit": limit}
    if symbol:
        params["symbol"] = symbol
    if timeframe:
        params["timeframe"] = timeframe
    try:
        response = requests.get(f"{API_URL}/ai-scanner/alerts", params=params, timeout=5)
        if response.status_code == 200:
            return response.json()
        return []
    except:
        return []

# Sidebar filters
st.sidebar.header("🔍 Filters")
filter_symbol = st.sidebar.text_input("Symbol (e.g., XRPUSDT)", "")
filter_timeframe = st.sidebar.selectbox("Timeframe", ["All", "1m", "3m", "5m", "15m", "1h", "4h", "1d"], index=0)
min_trades = st.sidebar.slider("Min Trades per Bucket", 1, 20, 5)

# Apply filters
symbol_filter = filter_symbol if filter_symbol else None
tf_filter = filter_timeframe if filter_timeframe != "All" else None

# Refresh button
if st.sidebar.button("🔄 Refresh Data"):
    st.cache_data.clear()
    st.rerun()

# Get metrics
metrics = get_metrics(symbol_filter, tf_filter, min_trades)

if not metrics:
    st.error("❌ Could not connect to AI Scanner API. Make sure the FastAPI server is running on port 8000.")
    st.info("💡 Start the server with: `uvicorn main:app --host 0.0.0.0 --port 8000`")
    st.stop()

# Overview metrics
st.header("📊 Overall Performance")

col1, col2, col3, col4, col5 = st.columns(5)

overall = metrics.get("overall", {})
last_50 = metrics.get("last_50", {})
learning_config = metrics.get("learning_config", {})

with col1:
    total_trades = overall.get("total_trades", 0)
    st.metric("Total Trades", total_trades)

with col2:
    winrate = overall.get("winrate", 0)
    if winrate is not None:
        st.metric("Winrate", f"{winrate*100:.1f}%")
    else:
        st.metric("Winrate", "N/A")

with col3:
    total_pnl = overall.get("total_pnl", 0)
    st.metric("Total P&L", f"{total_pnl*100:.2f}%", delta=f"{total_pnl*100:.2f}%")

with col4:
    last_50_wr = last_50.get("winrate", 0)
    if last_50_wr is not None:
        st.metric("Last 50 WR", f"{last_50_wr*100:.1f}%")
    else:
        st.metric("Last 50 WR", "N/A")

with col5:
    open_positions = metrics.get("open_positions", 0)
    st.metric("Open Positions", open_positions)

# Learning configuration
st.divider()
col1, col2, col3 = st.columns(3)

with col1:
    filter_enabled = learning_config.get("filter_enabled", False)
    st.metric("Learning Filter", "✅ ON" if filter_enabled else "⏸️ OFF")

with col2:
    threshold = learning_config.get("threshold", 0.55)
    st.metric("Threshold", f"{threshold*100:.0f}%")

with col3:
    min_bucket_trades = learning_config.get("min_trades_for_bucket", 10)
    st.metric("Min Bucket Trades", min_bucket_trades)

# Top performing buckets
st.header("🎯 Top Performing Feature Buckets")

top_buckets = metrics.get("top_buckets", [])

if top_buckets:
    df_buckets = pd.DataFrame(top_buckets)
    
    # Format columns
    df_buckets['Winrate %'] = (df_buckets['winrate'] * 100).round(1)
    df_buckets['RSI Range'] = df_buckets['rsi_bin'].apply(lambda x: f"{x*10}-{x*10+9}")
    df_buckets['MACD Hist'] = df_buckets['macd_hist_sign'].map({-1: "⬇️ Negative", 0: "➡️ Neutral", 1: "⬆️ Positive"})
    df_buckets['Vol Z-Score'] = df_buckets['volz_bin'].map({-1: "🔻 Low", 0: "➡️ Normal", 1: "🔺 High"})
    
    # Display table
    display_df = df_buckets[['symbol', 'timeframe', 'RSI Range', 'MACD Hist', 'Vol Z-Score', 'wins', 'total', 'Winrate %']]
    
    # Color code by winrate
    def color_winrate(val):
        if val >= 70:
            return 'background-color: #1f8b4c; color: white'
        elif val >= 55:
            return 'background-color: #f0ad4e; color: black'
        else:
            return 'background-color: #d32f2f; color: white'
    
    styled_df = display_df.style.applymap(color_winrate, subset=['Winrate %'])
    st.dataframe(styled_df, use_container_width=True, height=400)
    
    # Visualize bucket performance
    if len(df_buckets) > 0:
        st.subheader("📈 Bucket Winrate Distribution")
        
        fig = px.bar(
            df_buckets.head(20),
            x='Winrate %',
            y=df_buckets['symbol'] + " | " + df_buckets['timeframe'] + " | RSI:" + df_buckets['RSI Range'],
            orientation='h',
            color='Winrate %',
            color_continuous_scale=['red', 'yellow', 'green'],
            range_color=[0, 100],
            labels={'y': 'Setup'},
            title="Top 20 Feature Bucket Winrates"
        )
        fig.update_layout(height=600, showlegend=False)
        st.plotly_chart(fig, use_container_width=True)

else:
    st.info(f"🔄 No buckets with ≥{min_trades} trades yet. Keep collecting data!")

# Recent positions
st.header("💼 Recent Closed Positions")

positions = get_positions(symbol_filter, tf_filter, "closed", limit=20)

if positions:
    df_positions = pd.DataFrame(positions)
    
    # Format data
    df_positions['Entry Time'] = pd.to_datetime(df_positions['open_time_ms'], unit='ms').dt.strftime('%Y-%m-%d %H:%M')
    df_positions['Exit Time'] = pd.to_datetime(df_positions['close_time_ms'], unit='ms').dt.strftime('%Y-%m-%d %H:%M')
    df_positions['P&L %'] = (df_positions['pnl'] * 100).round(2)
    df_positions['Result'] = df_positions['win'].map({1: '✅ WIN', 0: '❌ LOSS'})
    
    # Display table
    display_cols = ['symbol', 'timeframe', 'side', 'Entry Time', 'open_price', 'Exit Time', 'close_price', 'P&L %', 'Result']
    st.dataframe(df_positions[display_cols], use_container_width=True, height=400)
    
    # P&L chart
    st.subheader("📊 Cumulative P&L Over Time")
    df_positions['Cumulative P&L %'] = df_positions['P&L %'].cumsum()
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df_positions['Exit Time'],
        y=df_positions['Cumulative P&L %'],
        mode='lines+markers',
        name='Cumulative P&L',
        line=dict(color='#1f8b4c', width=3),
        marker=dict(size=8)
    ))
    fig.update_layout(
        title="Cumulative P&L Performance",
        xaxis_title="Date",
        yaxis_title="Cumulative P&L %",
        hovermode='x unified',
        height=400
    )
    st.plotly_chart(fig, use_container_width=True)
    
else:
    st.info("📭 No closed positions found. Trades will appear here once your TradingView alerts start flowing in.")

# Open positions
st.header("⏳ Open Positions")

open_positions = get_positions(symbol_filter, tf_filter, "open", limit=10)

if open_positions:
    df_open = pd.DataFrame(open_positions)
    df_open['Entry Time'] = pd.to_datetime(df_open['open_time_ms'], unit='ms').dt.strftime('%Y-%m-%d %H:%M')
    
    display_cols = ['symbol', 'timeframe', 'side', 'Entry Time', 'open_price']
    st.dataframe(df_open[display_cols], use_container_width=True)
else:
    st.success("✅ No open positions - all trades are closed!")

# Recent alerts
st.header("🔔 Recent Alerts")

alerts = get_alerts(symbol_filter, tf_filter, limit=10)

if alerts:
    df_alerts = pd.DataFrame(alerts)
    df_alerts['Time'] = pd.to_datetime(df_alerts['received_at']).dt.strftime('%Y-%m-%d %H:%M:%S')
    
    display_cols = ['symbol', 'timeframe', 'side', 'price', 'Time', 'rsi14', 'macd_hist', 'vol_z']
    st.dataframe(df_alerts[display_cols], use_container_width=True, height=300)
else:
    st.info("📭 No alerts received yet. Configure your TradingView webhook to start receiving signals!")

# Instructions
st.divider()
st.header("⚙️ Setup Instructions")

col1, col2 = st.columns(2)

with col1:
    st.markdown("""
    ### 📡 TradingView Webhook Setup
    
    1. **Get your webhook URL:**
       ```
       https://your-replit-app.replit.dev/ai-scanner/alert
       ```
    
    2. **Configure TradingView alert message:**
       ```json
       {
         "secret": "YOUR_SECRET_HERE",
         "symbol": "{{ticker}}",
         "tf": "{{interval}}",
         "time_ms": {{timenow}},
         "price": {{close}},
         "side": "BUY",
         "features": {
           "rsi14": {{rsi}},
           "macd_hist": {{macd_histogram}},
           "vol_z": {{volume_zscore}}
         }
       }
       ```
    
    3. **Set your SECRET** in Replit environment variables
    """)

with col2:
    st.markdown("""
    ### 🧠 How Learning Works
    
    **Feature Buckets:**
    - **RSI Bins**: Groups RSI into 0-9, 10-19, ..., 90-99
    - **MACD Histogram Sign**: Positive, Negative, or Neutral
    - **Volume Z-Score**: High (>0.5), Low (<-0.5), or Normal
    
    **Learning Process:**
    1. Each BUY/SELL pair creates a closed position
    2. System calculates P&L and records win/loss
    3. Features are discretized into buckets
    4. Winrate tracked per bucket combination
    
    **Smart Filtering (Optional):**
    - Enable `ENABLE_LEARNING_FILTER=true`
    - Set `LEARN_THRESHOLD=0.55` (55% winrate)
    - System auto-skips low-probability setups
    """)

st.success("✅ Dashboard is live! Refresh to see updated metrics as new alerts arrive.")
