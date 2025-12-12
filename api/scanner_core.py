"""
Market Scanner - Core Logic
Extracted from app.py for API use
"""
import pandas as pd
import numpy as np
import yfinance as yf
import requests
from typing import List, Dict, Tuple, Optional
from math import floor
import os
from datetime import datetime, timedelta

# Alpha Vantage API key
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "yMPBWWLZNSPOK7P81")

# ================= Data Fetching =================
def get_ohlcv_alpha_vantage(symbol: str, timeframe: str, is_crypto: bool = False) -> pd.DataFrame:
    """Fetch OHLCV data from Alpha Vantage"""
    base_url = "https://www.alphavantage.co/query"
    
    # For crypto, use DIGITAL_CURRENCY endpoint
    if is_crypto:
        # DIGITAL_CURRENCY_DAILY only (no intraday)
        if timeframe != "1d":
            raise ValueError("Alpha Vantage crypto only supports daily data")
        
        params = {
            "function": "DIGITAL_CURRENCY_DAILY",
            "symbol": symbol.replace("-USD", "").replace("-", ""),  # Clean symbol
            "market": "USD",
            "apikey": ALPHA_VANTAGE_API_KEY,
            "datatype": "json"
        }
        
        print(f"Fetching crypto {symbol} with params: {params}")
        response = requests.get(base_url, params=params, timeout=10)
        data = response.json()
        
        if "Error Message" in data:
            raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
        
        if "Note" in data:
            raise ValueError(f"Alpha Vantage rate limit: {data['Note']}")
        
        time_series = data.get("Time Series (Digital Currency Daily)", {})
        if not time_series:
            raise ValueError(f"No crypto time series data. Response keys: {list(data.keys())}")
        
        # Parse crypto data
        df_data = []
        for timestamp, values in time_series.items():
            df_data.append({
                'timestamp': pd.to_datetime(timestamp),
                'open': float(values['1. open']),
                'high': float(values['2. high']),
                'low': float(values['3. low']),
                'close': float(values['4. close']),
                'volume': float(values['5. volume'])
            })
        
        df = pd.DataFrame(df_data)
        df = df.sort_values('timestamp').set_index('timestamp')
        return df
    
    # For stocks, use regular TIME_SERIES endpoint
    if timeframe == "1d":
        function = "TIME_SERIES_DAILY"
        interval = None
    else:
        function = "TIME_SERIES_INTRADAY"
        interval_map = {
            "15m": "15min",
            "1h": "60min",
            "4h": "60min",
        }
        interval = interval_map.get(timeframe, "60min")
    
    params = {
        "function": function,
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "outputsize": "full",
        "datatype": "json"
    }
    
    if interval:
        params["interval"] = interval
    
    try:
        response = requests.get(base_url, params=params, timeout=10)
        data = response.json()
        
        if "Error Message" in data:
            raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
        
        if "Note" in data:
            raise ValueError("Alpha Vantage rate limit reached")
        
        # Parse time series data
        if timeframe == "1d":
            time_series_key = "Time Series (Daily)"
        else:
            time_series_key = f"Time Series ({interval})"
        
        if time_series_key not in data:
            raise ValueError("No time series data in response")
        
        time_series = data[time_series_key]
        
        # Convert to DataFrame
        df_data = []
        for timestamp, values in time_series.items():
            df_data.append({
                'timestamp': pd.to_datetime(timestamp),
                'open': float(values['1. open']),
                'high': float(values['2. high']),
                'low': float(values['3. low']),
                'close': float(values['4. close']),
                'volume': int(values['5. volume'])
            })
        
        df = pd.DataFrame(df_data)
        df = df.sort_values('timestamp').set_index('timestamp')
        
        # Resample for 4h if needed
        if timeframe == "4h":
            df = df.resample('4H').agg({
                'open': 'first',
                'high': 'max',
                'low': 'min',
                'close': 'last',
                'volume': 'sum'
            }).dropna()
        
        return df
        
    except Exception as e:
        raise ValueError(f"Alpha Vantage fetch failed: {str(e)}")

def get_ohlcv_yfinance(symbol: str, timeframe: str) -> pd.DataFrame:
    """Fetch OHLCV data from yfinance (fallback)"""
    interval_map = {
        "15m": "15m",
        "1h": "1h",
        "4h": "1h",
        "1d": "1d"
    }
    
    period_map = {
        "15m": "7d",
        "1h": "30d",
        "4h": "60d",
        "1d": "1y"
    }
    
    interval = interval_map.get(timeframe, "1h")
    period_val = period_map.get(timeframe, "30d")
    
    try:
        ticker = yf.Ticker(symbol)
        # Enable errors to see what's actually failing
        df = ticker.history(period=period_val, interval=interval, raise_errors=True)
        
        print(f"yfinance returned {len(df)} rows for {symbol} (period={period_val}, interval={interval})")
        
        if df is None or df.empty:
            raise ValueError(f"yfinance returned empty DataFrame for {symbol}")
        
        if len(df) < 10:
            raise ValueError(f"yfinance returned only {len(df)} rows for {symbol}, need at least 10")
        
        # Resample 4h if needed
        if timeframe == "4h" and len(df) > 0:
            df = df.resample('4H').agg({
                'Open': 'first',
                'High': 'max',
                'Low': 'min',
                'Close': 'last',
                'Volume': 'sum'
            }).dropna()
        
        # Standardize column names
        df.columns = [c.lower() for c in df.columns]
        
        return df
    except Exception as e:
        print(f"yfinance error for {symbol}: {type(e).__name__}: {str(e)}")
        raise ValueError(f"yfinance fetch failed: {str(e)}")
        
    except Exception as e:
        raise ValueError(f"yfinance fetch failed: {str(e)}")

def get_ohlcv(symbol: str, timeframe: str, is_crypto: bool = False) -> pd.DataFrame:
    """
    Fetch OHLCV data - Use yfinance (free, reliable, no rate limits)
    """
    # Use yfinance directly - it's faster and more reliable
    try:
        df = get_ohlcv_yfinance(symbol, timeframe)
        if len(df) >= 10:
            return df
        raise ValueError(f"Insufficient data for {symbol}")
    except Exception as e:
        print(f"yfinance failed for {symbol}: {e}")
        raise ValueError(f"Failed to fetch data for {symbol}: {e}")

# ================= Indicators =================
def _ema(s, n):
    return s.ewm(span=n, adjust=False).mean()

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
    ma = c.rolling(n).mean()
    sd = c.rolling(n).std()
    upper, lower = ma + k*sd, ma - k*sd
    return (upper - lower) / c

# ================= Feature Engineering =================
def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all technical indicators"""
    out = df.copy()
    out["ema8"]   = _ema(out["close"], 8)
    out["ema21"]  = _ema(out["close"], 21)
    out["ema50"]  = _ema(out["close"], 50)
    out["ema200"] = _ema(out["close"], 200)
    out["rsi"]    = _rsi(out["close"], 14)

    macd_fast = _ema(out["close"], 12)
    macd_slow = _ema(out["close"], 26)
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
    """Proprietary scoring algorithm"""
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

def determine_signal(last) -> str:
    """Generate human-readable signal description"""
    signals = []
    
    if last.close > last.ema200:
        signals.append("Above EMA200")
    if pd.notna(last.rsi):
        if last.rsi > 70:
            signals.append("RSI Overbought")
        elif last.rsi < 30:
            signals.append("RSI Oversold")
        elif last.rsi > 50:
            signals.append("RSI Bullish")
    
    if pd.notna(last.macd_hist) and last.macd_hist > 0:
        signals.append("MACD Positive")
    
    if pd.notna(last.vol_z) and last.vol_z > 0.5:
        signals.append("High Volume")
    
    return " + ".join(signals) if signals else "Neutral"

def determine_phase(last) -> str:
    """Determine market phase"""
    if pd.notna(last.ema50) and pd.notna(last.ema200):
        if last.close > last.ema200 and last.ema50 > last.ema200:
            return "MARKUP"
        elif last.close < last.ema200 and last.ema50 < last.ema200:
            return "MARKDOWN"
        elif last.close > last.ema200:
            return "ACCUMULATION"
        else:
            return "DISTRIBUTION"
    return "UNKNOWN"

# ================= Scanner =================
def scan_symbols(symbols: List[str], timeframe: str, min_score: float = 0, is_crypto: bool = False) -> Tuple[List[Dict], List[Dict]]:
    """
    Scan a list of symbols and return results + errors
    Returns: (results, errors)
    """
    results = []
    errors = []
    
    for symbol in symbols:
        try:
            # Fetch data with timeout protection
            df = get_ohlcv(symbol, timeframe, is_crypto=is_crypto)
            
            if len(df) < 200:
                errors.append({
                    "symbol": symbol,
                    "error": f"Insufficient data: only {len(df)} bars (need 200+)"
                })
                continue
            
            # Compute features
            features = compute_features(df).dropna()
            
            if features.empty:
                errors.append({
                    "symbol": symbol,
                    "error": "No valid data after feature computation"
                })
                continue
            
            last = features.iloc[-1]
            score = score_row(last)
            
            # Filter by min score
            if score < min_score:
                continue
            
            direction = "LONG" if score >= 0 else "SHORT"
            signal = determine_signal(last)
            phase = determine_phase(last)
            
            # Calculate change percentage (from 20 bars ago)
            if len(features) >= 20:
                change_pct = ((last.close - features.iloc[-20].close) / features.iloc[-20].close) * 100
            else:
                change_pct = 0.0
            
            results.append({
                "symbol": symbol,
                "name": symbol,
                "price": round(float(last.close), 2),
                "change_pct": round(float(change_pct), 2),
                "volume": int(last.volume) if pd.notna(last.volume) else 0,
                "score": round(float(score), 0),
                "signal": signal,
                "direction": direction,
                "ema200_phase": phase,
                "rsi": round(float(last.rsi), 1) if pd.notna(last.rsi) else None,
                "macd_histogram": round(float(last.macd_hist), 3) if pd.notna(last.macd_hist) else None,
            })
            
        except Exception as e:
            errors.append({
                "symbol": symbol,
                "error": str(e)
            })
    
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    
    return results, errors

# ================= Symbol Lists =================
EQUITY_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "AMD", 
    "NFLX", "DIS", "V", "MA", "JPM", "BAC", "WMT", "HD", 
    "PG", "KO", "PEP", "CSCO", "INTC", "ORCL", "CRM", "ADBE", "PYPL"
]

# Note: Crypto symbols via yfinance can be unreliable due to API issues
# Using traditional format but may have connectivity issues
CRYPTO_SYMBOLS = [
    "BTC-USD", "ETH-USD", "BNB-USD", "XRP-USD", "ADA-USD", 
    "DOGE-USD", "SOL-USD", "DOT-USD", "MATIC-USD", "AVAX-USD"
]
