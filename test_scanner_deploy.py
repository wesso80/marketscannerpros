#!/usr/bin/env python3
"""Test the scanner with different timeframes to verify the fix"""
import os
import sys
import pandas as pd
from datetime import datetime, timezone
import requests

# Setup Alpha Vantage API key
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "UI755FUUAM6FRRI9")

def get_ohlcv_alpha_vantage_test(symbol: str, timeframe: str) -> dict:
    """Test version of get_ohlcv_alpha_vantage with detailed output"""
    # Normalize timeframe to lowercase for consistent lookup
    timeframe = timeframe.lower()
    print(f"\n  Input timeframe: {timeframe}")
    
    # Map timeframes
    function_map = {
        "1d": "TIME_SERIES_DAILY",
        "1h": "TIME_SERIES_INTRADAY",
        "4h": "TIME_SERIES_INTRADAY",
        "15m": "TIME_SERIES_INTRADAY",
        "5m": "TIME_SERIES_INTRADAY",
        "30m": "TIME_SERIES_INTRADAY"
    }
    interval_map = {"1h": "60min", "4h": "60min", "15m": "15min", "5m": "5min", "30m": "30min"}
    
    function = function_map.get(timeframe, "TIME_SERIES_DAILY")
    print(f"  → Function: {function}")
    
    params = {
        "function": function,
        "symbol": symbol.replace("-USD", "").upper(),
        "apikey": ALPHA_VANTAGE_API_KEY,
        "outputsize": "full",
        "datatype": "json"
    }
    
    if function == "TIME_SERIES_INTRADAY":
        interval = interval_map.get(timeframe, "60min")
        params["interval"] = interval
        print(f"  → Interval: {interval}")
    
    try:
        response = requests.get("https://www.alphavantage.co/query", params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # Check for errors
        if "Error Message" in data:
            return {"success": False, "error": data["Error Message"]}
        if "Note" in data:
            return {"success": False, "error": f"API Rate limit: {data['Note']}"}
        
        # Find the time series key
        ts_key = None
        for key in data.keys():
            if "Time Series" in key:
                ts_key = key
                break
        
        if not ts_key:
            return {"success": False, "error": f"No time series found. Keys: {list(data.keys())}"}
        
        ts = data[ts_key]
        rows = []
        for timestamp, values in ts.items():
            rows.append({
                "timestamp": pd.to_datetime(timestamp, utc=True),
                "close": float(values.get("4. close", 0)),
            })
        
        df = pd.DataFrame(rows).set_index("timestamp").sort_index()
        
        last_bar_time = df.index[-1]
        now_utc = datetime.now(timezone.utc)
        hours_ago = (now_utc - last_bar_time).total_seconds() / 3600
        
        return {
            "success": True,
            "bars": len(df),
            "last_bar": last_bar_time.isoformat(),
            "hours_old": round(hours_ago, 2)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


print("=" * 70)
print("🧪 TIMEFRAME SCANNER TEST - Testing different timeframe selections")
print("=" * 70)

test_cases = [
    ("SPY", "1D"),      # Daily - uppercase
    ("SPY", "1h"),      # 1 hour
    ("SPY", "30m"),     # 30 min - was broken before
    ("BTC-USD", "4h"),  # 4 hour crypto
    ("SPY", "15m"),     # 15 min
]

results = []

for symbol, tf_from_ui in test_cases:
    print(f"\n📊 Testing {symbol} with {tf_from_ui} timeframe (as selected from dropdown):")
    result = get_ohlcv_alpha_vantage_test(symbol, tf_from_ui)
    results.append((symbol, tf_from_ui, result))
    
    if result["success"]:
        print(f"  ✅ SUCCESS!")
        print(f"     Bars fetched: {result['bars']}")
        print(f"     Last bar: {result['last_bar']}")
        print(f"     Age: {result['hours_old']} hours")
    else:
        print(f"  ❌ FAILED: {result['error']}")

print("\n" + "=" * 70)
print("📋 SUMMARY")
print("=" * 70)

passed = sum(1 for _, _, r in results if r["success"])
failed = sum(1 for _, _, r in results if not r["success"])

for symbol, tf, result in results:
    status = "✅" if result["success"] else "❌"
    print(f"{status} {symbol:8} @ {tf:4} - {result.get('bars', 'N/A'):5} bars | {result.get('error', 'OK')}")

print(f"\n{'='*70}")
print(f"Total: {passed} passed, {failed} failed")
if failed == 0:
    print("✅ All timeframes working correctly!")
else:
    print("⚠️  Some tests failed - check errors above")
print("=" * 70)
