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
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import os
from datetime import datetime, timedelta

# Alpha Vantage API key (PREMIUM: 75 calls/minute - works from cloud!)
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "UI755FUUAM6FRRI9")

# Finnhub API key (free: 60 calls/minute - MUCH better)
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "d4tt6ohr01qk9ur8pcegd4tt6ohr01qk9ur8pcf0")

# ================= Data Fetching (Finnhub - Free & Reliable) =================
def get_ohlcv_finnhub(symbol: str, timeframe: str) -> pd.DataFrame:
    """Fetch OHLCV data from Finnhub (60 calls/min free tier)"""
    import time
    
    # Map timeframe to resolution
    resolution_map = {
        "1d": "D",
        "1h": "60",
        "15m": "15",
        "5m": "5"
    }
    
    resolution = resolution_map.get(timeframe.lower(), "D")
    
    # Calculate time range
    now = int(time.time())
    if timeframe == "1d":
        start = now - (365 * 2 * 24 * 3600)  # 2 years
    elif timeframe == "1h":
        start = now - (730 * 24 * 3600)  # 730 days
    else:
        start = now - (60 * 24 * 3600)  # 60 days
    
    url = f"https://finnhub.io/api/v1/stock/candle"
    params = {
        "symbol": symbol.upper(),
        "resolution": resolution,
        "from": start,
        "to": now,
        "token": FINNHUB_API_KEY
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        print(f"Finnhub response for {symbol}: status={data.get('s')}, data keys={list(data.keys())}")
        
        if data.get("s") == "no_data":
            raise ValueError(f"Finnhub: No data available for {symbol}")
        
        if data.get("s") != "ok":
            error_msg = data.get("error", data.get("s", "unknown"))
            print(f"Finnhub full error response: {data}")
            raise ValueError(f"Finnhub error: {error_msg}")
        
        # Convert to DataFrame
        df = pd.DataFrame({
            "open": data["o"],
            "high": data["h"],
            "low": data["l"],
            "close": data["c"],
            "volume": data["v"]
        }, index=pd.to_datetime(data["t"], unit='s', utc=True))
        
        if df.empty or len(df) < 10:
            raise ValueError(f"Insufficient Finnhub data: {len(df)} rows")
        
        print(f"✓ Finnhub success for {symbol}: {len(df)} rows")
        return df
        
    except Exception as e:
        print(f"✗ Finnhub failed for {symbol}: {e}")
        raise ValueError(f"Finnhub fetch failed: {str(e)}")

# ================= Data Fetching =================
def get_ohlcv_alpha_vantage(symbol: str, timeframe: str, is_crypto: bool = False) -> pd.DataFrame:
    """Fetch OHLCV data from Alpha Vantage"""
    base_url = "https://www.alphavantage.co/query"
    
    # For crypto
    if is_crypto:
        clean_symbol = symbol.replace("-USD", "").replace("-", "")
        
        # For 1d, use DIGITAL_CURRENCY_DAILY (more reliable, more history)
        if timeframe == "1d":
            params = {
                "function": "DIGITAL_CURRENCY_DAILY",
                "symbol": clean_symbol,
                "market": "USD",
                "apikey": ALPHA_VANTAGE_API_KEY,
                "datatype": "json"
            }
            
            response = requests.get(base_url, params=params, timeout=10)
            data = response.json()
            
            if "Error Message" in data:
                raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
            
            if "Note" in data:
                raise ValueError(f"Alpha Vantage rate limit: {data['Note']}")
            
            time_series = data.get("Time Series (Digital Currency Daily)", {})
            if not time_series:
                raise ValueError(f"No crypto daily data. Response keys: {list(data.keys())}")
            
            df_data = []
            for timestamp, values in time_series.items():
                df_data.append({
                    'timestamp': pd.to_datetime(timestamp),
                    'open': float(values['1a. open (USD)']),
                    'high': float(values['2a. high (USD)']),
                    'low': float(values['3a. low (USD)']),
                    'close': float(values['4a. close (USD)']),
                    'volume': float(values['5. volume'])
                })
            
            df = pd.DataFrame(df_data)
            df = df.sort_values('timestamp').set_index('timestamp')
            return df
        
        # Use CRYPTO_INTRADAY for all intraday timeframes
        if timeframe != "1d":
            # Map timeframe to Alpha Vantage interval
            interval_map = {
                "1m": "1min",
                "5m": "5min",
                "15m": "15min",
                "30m": "30min",
                "1h": "60min",
            }
            interval = interval_map.get(timeframe)
            
            if not interval:
                raise ValueError(f"Crypto timeframe {timeframe} not supported by Alpha Vantage")
            
            params = {
                "function": "CRYPTO_INTRADAY",
                "symbol": clean_symbol,
                "market": "USD",
                "interval": interval,
                "apikey": ALPHA_VANTAGE_API_KEY,
                "outputsize": "full",
                "datatype": "json"
            }
            
            response = requests.get(base_url, params=params, timeout=10)
            data = response.json()
            
            if "Error Message" in data:
                raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
            
            if "Note" in data:
                raise ValueError(f"Alpha Vantage rate limit: {data['Note']}")
            
            time_series_key = f"Time Series Crypto ({interval})"
            time_series = data.get(time_series_key, {})
            if not time_series:
                raise ValueError(f"No crypto intraday data. Response keys: {list(data.keys())}")
            
            # Parse intraday crypto data
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
            "1m": "1min",
            "5m": "5min",
            "15m": "15min",
            "30m": "30min",
            "1h": "60min",
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
    """Fetch OHLCV data from yfinance - use download() method which works better from servers"""
    # Match the working timeframe mapping from app.py
    tf = timeframe.lower().strip()
    if tf in ("1d", "1day", "d"):
        interval, period_val = "1d", "2y"
    elif tf in ("1h", "60m"):
        interval, period_val = "60m", "730d"
    elif tf in ("4h", "4hour"):
        # 4h needs to be resampled from 1h data
        interval, period_val = "60m", "730d"
    elif tf in ("30m", "15m", "5m", "1m"):
        interval, period_val = tf, "60d"
    else:
        interval, period_val = "1d", "2y"
    
    try:
        # Use yfinance.download() instead of Ticker().history() - different endpoint that might work
        import yfinance as yf
        
        raw_df = yf.download(
            tickers=symbol.upper(),
            period=period_val,
            interval=interval,
            auto_adjust=False,
            progress=False,
            show_errors=False
        )
        
        print(f"yfinance returned {len(raw_df)} rows for {symbol} (period={period_val}, interval={interval})")
        
        if raw_df is None or raw_df.empty:
            raise ValueError(f"yfinance returned empty DataFrame for {symbol}")
        
        if len(raw_df) < 10:
            raise ValueError(f"yfinance returned only {len(raw_df)} rows for {symbol}, need at least 10")
        
        # Resample 4h if needed (match app.py logic)
        if tf in ("4h", "4hour") and len(raw_df) > 0:
            raw_df = raw_df.resample('4H').agg({
                'Open': 'first',
                'High': 'max',
                'Low': 'min',
                'Close': 'last',
                'Volume': 'sum'
            }).dropna()
        
        # Standardize to lowercase column names and create clean DataFrame
        raw_df.index = pd.to_datetime(raw_df.index, utc=True)
        df = pd.DataFrame({
            "open": raw_df["Open"].astype(float),
            "high": raw_df["High"].astype(float),
            "low": raw_df["Low"].astype(float),
            "close": raw_df["Close"].astype(float),
            "volume": raw_df["Volume"].astype(float).fillna(0.0),
        }, index=raw_df.index).dropna()
        
        return df
    except Exception as e:
        print(f"yfinance error for {symbol}: {type(e).__name__}: {str(e)}")
        raise ValueError(f"yfinance fetch failed: {str(e)}")
        
    except Exception as e:
        raise ValueError(f"yfinance fetch failed: {str(e)}")

def get_ohlcv(symbol: str, timeframe: str, is_crypto: bool = False) -> pd.DataFrame:
    """
    SMART data fetching:
    - CRYPTO: Alpha Vantage FIRST (reliable, you're paying $50/mo), yfinance backup
    - STOCKS: yfinance FIRST (free + fast), Alpha Vantage backup
    """
    if is_crypto:
        # Crypto: Alpha Vantage Premium is reliable, yfinance fails from cloud
        try:
            df = get_ohlcv_alpha_vantage(symbol, timeframe, is_crypto=True)
            if len(df) >= 10:
                return df
        except Exception as av_error:
            # Fallback to yfinance for crypto (usually fails but worth trying)
            try:
                df = get_ohlcv_yfinance(symbol, timeframe)
                if len(df) >= 10:
                    return df
            except:
                pass
    else:
        # Stocks: yfinance is fast and free
        try:
            df = get_ohlcv_yfinance(symbol, timeframe)
            if len(df) >= 10:
                return df
        except Exception as yf_error:
            # Fallback to Alpha Vantage for stocks
            try:
                df = get_ohlcv_alpha_vantage(symbol, timeframe, is_crypto=False)
                if len(df) >= 10:
                    return df
            except:
                pass
    
    raise ValueError(f"All data sources failed for {symbol}")

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
def _scan_single_symbol(symbol: str, timeframe: str, min_score: float, is_crypto: bool, min_bars: int) -> Tuple[Optional[Dict], Optional[Dict]]:
    """Scan a single symbol - used for parallel processing"""
    try:
        # Fetch data with timeout protection
        df = get_ohlcv(symbol, timeframe, is_crypto=is_crypto)
        
        if len(df) < min_bars:
            return None, {"symbol": symbol, "error": f"Insufficient data: only {len(df)} bars (need {min_bars}+)"}
        
        # Compute features
        features = compute_features(df).dropna()
        
        if features.empty:
            return None, {"symbol": symbol, "error": "No valid data after feature computation"}
        
        last = features.iloc[-1]
        score = score_row(last)
        
        # Debug: Always log score for crypto
        if is_crypto:
            print(f"  {symbol}: score={score:.1f}, min_score={min_score}")
        
        # Filter by min score
        if score < min_score:
            return None, None
        
        direction = "LONG" if score >= 0 else "SHORT"
        signal = determine_signal(last)
        phase = determine_phase(last)
        
        # Calculate change percentage (from 20 bars ago)
        if len(features) >= 20:
            change_pct = ((last.close - features.iloc[-20].close) / features.iloc[-20].close) * 100
        else:
            change_pct = 0.0
        
        result = {
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
        }
        return result, None
        
    except Exception as e:
        return None, {"symbol": symbol, "error": str(e)}

def scan_symbols(symbols: List[str], timeframe: str, min_score: float = 0, is_crypto: bool = False) -> Tuple[List[Dict], List[Dict]]:
    """
    PARALLEL scanner - scans all symbols simultaneously for SPEED
    You're paying $50/month for 75 calls/min - USE IT!
    Returns: (results, errors)
    """
    results = []
    errors = []
    
    # Lower requirement for crypto (has less history)
    min_bars = 100 if is_crypto else 200
    
    start_time = time.time()
    print(f"🚀 Starting PARALLEL scan of {len(symbols)} symbols...")
    
    # Use ThreadPoolExecutor for parallel API calls
    # Alpha Vantage Premium = 75 calls/min, so use 20 workers for speed
    with ThreadPoolExecutor(max_workers=20) as executor:
        # Submit all symbols for parallel processing
        future_to_symbol = {
            executor.submit(_scan_single_symbol, symbol, timeframe, min_score, is_crypto, min_bars): symbol
            for symbol in symbols
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_symbol):
            result, error = future.result()
            if result:
                results.append(result)
            if error:
                errors.append(error)
    
    elapsed = time.time() - start_time
    print(f"✅ Scan completed in {elapsed:.1f}s - {len(results)} results, {len(errors)} errors")
    
    # Original sequential code removed - keeping for reference
    for symbol in symbols[:0]:  # Never executes - just to avoid breaking anything
        try:
            # Fetch data with timeout protection
            df = get_ohlcv(symbol, timeframe, is_crypto=is_crypto)
            
            if len(df) < min_bars:
                errors.append({
                    "symbol": symbol,
                    "error": f"Insufficient data: only {len(df)} bars (need {min_bars}+)"
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
            
            # Debug: Always log score for crypto
            if is_crypto:
                print(f"  {symbol}: score={score:.1f}, min_score={min_score}")
            
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
    # FAST SCAN - Top 10 most liquid stocks (5-10 second scans)
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "AMD", "NFLX", "DIS"
]

# ALL Alpha Vantage crypto - You're paying $50/month, scan EVERYTHING
CRYPTO_SYMBOLS = [
    "BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD", "ADA-USD", "DOGE-USD", "DOT-USD", "MATIC-USD", "LTC-USD",
    "AVAX-USD", "LINK-USD", "UNI-USD", "ATOM-USD", "ETC-USD", "BCH-USD", "XLM-USD", "ALGO-USD", "VET-USD", "ICP-USD",
    "FIL-USD", "APT-USD", "HBAR-USD", "NEAR-USD", "OP-USD", "ARB-USD", "IMX-USD", "STX-USD", "INJ-USD", "SUI-USD",
    "TIA-USD", "SEI-USD", "GRT-USD", "AAVE-USD", "MKR-USD", "SNX-USD", "CRV-USD", "COMP-USD", "UMA-USD", "FLOW-USD",
    "SUSHI-USD", "BAL-USD", "YFI-USD", "1INCH-USD", "ENJ-USD", "MANA-USD", "SAND-USD", "AXS-USD", "CHZ-USD", "GALA-USD",
    "EOS-USD", "XTZ-USD", "ZEC-USD", "DASH-USD", "BAT-USD", "ENS-USD", "LDO-USD", "RENDER-USD", "FTM-USD", "KAVA-USD",
    "ROSE-USD", "OSMO-USD", "MINA-USD", "KSM-USD", "SHIB-USD", "PEPE-USD", "WIF-USD", "BONK-USD", "FET-USD", "RNDR-USD"
]

# FOREX pairs - Major, crosses, and emerging market pairs
FOREX_SYMBOLS = [
    # Majors (most liquid)
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
    # Popular crosses
    "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "EURAUD", "EURCHF", "GBPAUD", "GBPCHF",
    # Emerging markets & exotics
    "USDCNY", "USDHKD", "USDSGD", "USDZAR", "USDMXN", "USDBRL", "USDINR", "USDTRY",
    "USDKRW", "USDRUB", "USDTHB", "USDNOK", "USDSEK", "USDDKK", "USDPLN", "EURPLN"
]

# COMMODITIES - Energy, Metals, Agriculture (Alpha Vantage Premium)
COMMODITY_SYMBOLS = [
    # Energy
    "WTI", "BRENT", "NATURAL_GAS",
    # Metals  
    "COPPER", "ALUMINUM",
    # Agriculture
    "WHEAT", "CORN", "COTTON", "SUGAR", "COFFEE"
]
