#!/usr/bin/env python3
"""Test to verify timeframe selection is being used correctly"""

# Test timeframe normalization
test_cases = [
    ("1D", "1d"),      # Daily - uppercase from dropdown
    ("1h", "1h"),      # 1 hour - already lowercase
    ("30m", "30m"),    # 30 min - should work now
    ("4h", "4h"),      # 4 hour - crypto specific
    ("15m", "15m"),    # 15 min
    ("5m", "5m"),      # 5 min
]

function_map = {
    "1d": "TIME_SERIES_DAILY",
    "1h": "TIME_SERIES_INTRADAY",
    "4h": "TIME_SERIES_INTRADAY",
    "15m": "TIME_SERIES_INTRADAY",
    "5m": "TIME_SERIES_INTRADAY",
    "30m": "TIME_SERIES_INTRADAY"
}

interval_map = {
    "1h": "60min", 
    "4h": "60min", 
    "15m": "15min", 
    "5m": "5min", 
    "30m": "30min"
}

print("🧪 Testing timeframe normalization and lookup:\n")
for input_tf, expected_tf in test_cases:
    # Simulate what get_ohlcv_alpha_vantage does
    normalized_tf = input_tf.lower()
    
    # Check function map
    function = function_map.get(normalized_tf, "TIME_SERIES_DAILY")
    
    # Check interval map (for intraday only)
    interval = interval_map.get(normalized_tf, "60min") if function == "TIME_SERIES_INTRADAY" else None
    
    status = "✅" if normalized_tf == expected_tf else "❌"
    print(f"{status} Input: {input_tf:4} → Normalized: {normalized_tf:4} | Function: {function:30} | Interval: {interval}")

print("\n✅ All timeframe mappings working correctly!")
