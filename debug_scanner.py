#!/usr/bin/env python3
"""Debug script to check what data the scanner is getting"""
import os
import sys
import pandas as pd
from datetime import datetime, timezone, timedelta
import requests
import pytz

# Alpha Vantage API key
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "UI755FUUAM6FRRI9")

def get_ohlcv_alpha_vantage_debug(symbol: str, timeframe: str):
    """Fetch from Alpha Vantage Premium with debugging"""
    function_map = {
        "1d": "TIME_SERIES_DAILY",
        "1h": "TIME_SERIES_INTRADAY",
        "4h": "TIME_SERIES_INTRADAY",
        "15m": "TIME_SERIES_INTRADAY",
        "5m": "TIME_SERIES_INTRADAY"
    }
    interval_map = {"1h": "60min", "4h": "60min", "15m": "15min", "5m": "5min"}
    
    function = function_map.get(timeframe, "TIME_SERIES_DAILY")
    params = {
        "function": function,
        "symbol": symbol.replace("-USD", "").upper(),
        "apikey": ALPHA_VANTAGE_API_KEY,
        "outputsize": "full",
        "datatype": "json"
    }
    
    if function == "TIME_SERIES_INTRADAY":
        params["interval"] = interval_map.get(timeframe, "60min")
    
    print(f"\n📊 Fetching {symbol} ({timeframe})...")
    print(f"   Function: {function}")
    print(f"   Params: {params}")
    
    response = requests.get("https://www.alphavantage.co/query", params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    
    # Check for errors
    if "Error Message" in data:
        print(f"   ❌ API Error: {data['Error Message']}")
        return None
    if "Note" in data:
        print(f"   ⚠️ API Note: {data['Note']}")
        return None
    
    # Find the time series key
    ts_key = None
    for key in data.keys():
        if "Time Series" in key:
            ts_key = key
            break
    
    if not ts_key or ts_key not in data:
        print(f"   ❌ No time series data found. Keys: {list(data.keys())}")
        return None
    
    ts = data[ts_key]
    print(f"   ✓ Found {len(ts)} bars in '{ts_key}'")
    
    rows = []
    for timestamp, values in ts.items():
        rows.append({
            "timestamp": pd.to_datetime(timestamp, utc=True),
            "open": float(values.get("1. open", 0)),
            "high": float(values.get("2. high", 0)),
            "low": float(values.get("3. low", 0)),
            "close": float(values.get("4. close", 0)),
            "volume": float(values.get("5. volume", 0)),
        })
    
    df = pd.DataFrame(rows).set_index("timestamp").sort_index()
    
    print(f"\n   DataFrame Info:")
    print(f"   - Shape: {df.shape}")
    print(f"   - Index name: {df.index.name}")
    print(f"   - Timezone: {df.index.tz}")
    
    # Show last 5 rows
    print(f"\n   Last 5 rows:")
    print(df.tail(5))
    
    # Show index details
    print(f"\n   Index details:")
    print(f"   - Min timestamp: {df.index.min()}")
    print(f"   - Max timestamp: {df.index.max()}")
    print(f"   - Last row (iloc[-1]): {df.index[-1]}")
    
    # Check current time in different timezones
    now_utc = datetime.now(timezone.utc)
    now_eastern = now_utc.astimezone(pytz.timezone('US/Eastern'))
    now_sydney = now_utc.astimezone(pytz.timezone('Australia/Sydney'))
    
    print(f"\n   Current time:")
    print(f"   - UTC: {now_utc}")
    print(f"   - Eastern: {now_eastern}")
    print(f"   - Sydney: {now_sydney}")
    
    # Calculate the difference
    last_ts = df.index[-1]
    time_diff = now_utc - last_ts
    
    print(f"\n   Age of last bar:")
    print(f"   - Difference from now: {time_diff}")
    print(f"   - Hours ago: {time_diff.total_seconds() / 3600:.2f}")
    
    return df


if __name__ == "__main__":
    # Test with a symbol
    symbols_to_test = [
        ("SPY", "1h"),
        ("BTC-USD", "1h"),
        ("SPY", "1d"),
    ]
    
    for symbol, tf in symbols_to_test:
        try:
            df = get_ohlcv_alpha_vantage_debug(symbol, tf)
        except Exception as e:
            print(f"   ❌ Exception: {e}")
