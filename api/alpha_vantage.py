"""
Alpha Vantage Premium API Integration
Complete implementation of all premium endpoints
"""
import requests
import pandas as pd
from typing import Dict, List, Optional, Any
import os
from datetime import datetime

ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "UI755FUUAM6FRRI9")
BASE_URL = "https://www.alphavantage.co/query"

# ==================== CORE STOCK APIs ====================

def get_intraday(symbol: str, interval: str = "60min", outputsize: str = "full") -> pd.DataFrame:
    """
    TIME_SERIES_INTRADAY - Stock intraday data
    Intervals: 1min, 5min, 15min, 30min, 60min
    """
    params = {
        "function": "TIME_SERIES_INTRADAY",
        "symbol": symbol,
        "interval": interval,
        "outputsize": outputsize,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    time_series_key = f"Time Series ({interval})"
    if time_series_key not in data:
        raise ValueError("No time series data in response")
    
    time_series = data[time_series_key]
    
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
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


def get_daily(symbol: str, outputsize: str = "full") -> pd.DataFrame:
    """TIME_SERIES_DAILY - Daily stock prices"""
    params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": symbol,
        "outputsize": outputsize,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    time_series = data.get("Time Series (Daily)", {})
    
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
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


def get_daily_adjusted(symbol: str, outputsize: str = "full") -> pd.DataFrame:
    """TIME_SERIES_DAILY_ADJUSTED - Daily with dividends & splits"""
    params = {
        "function": "TIME_SERIES_DAILY_ADJUSTED",
        "symbol": symbol,
        "outputsize": outputsize,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    time_series = data.get("Time Series (Daily)", {})
    
    df_data = []
    for timestamp, values in time_series.items():
        df_data.append({
            'timestamp': pd.to_datetime(timestamp),
            'open': float(values['1. open']),
            'high': float(values['2. high']),
            'low': float(values['3. low']),
            'close': float(values['4. close']),
            'adjusted_close': float(values['5. adjusted close']),
            'volume': int(values['6. volume']),
            'dividend_amount': float(values['7. dividend amount']),
            'split_coefficient': float(values['8. split coefficient'])
        })
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


def get_quote_endpoint(symbol: str) -> Dict[str, Any]:
    """GLOBAL_QUOTE - Real-time quote for a single symbol"""
    params = {
        "function": "GLOBAL_QUOTE",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    quote = data.get("Global Quote", {})
    
    return {
        'symbol': quote.get('01. symbol'),
        'open': float(quote.get('02. open', 0)),
        'high': float(quote.get('03. high', 0)),
        'low': float(quote.get('04. low', 0)),
        'price': float(quote.get('05. price', 0)),
        'volume': int(quote.get('06. volume', 0)),
        'latest_trading_day': quote.get('07. latest trading day'),
        'previous_close': float(quote.get('08. previous close', 0)),
        'change': float(quote.get('09. change', 0)),
        'change_percent': quote.get('10. change percent', '0%')
    }


def get_realtime_bulk_quotes(symbols: List[str]) -> List[Dict[str, Any]]:
    """
    REALTIME_BULK_QUOTES - Up to 100 symbols at once (Premium)
    Much faster than individual GLOBAL_QUOTE calls
    """
    symbol_list = ",".join(symbols[:100])  # Max 100
    
    params = {
        "function": "REALTIME_BULK_QUOTES",
        "symbol": symbol_list,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    quotes = data.get("data", [])
    
    results = []
    for quote in quotes:
        results.append({
            'symbol': quote.get('symbol'),
            'price': float(quote.get('price', 0)),
            'volume': int(quote.get('volume', 0)),
            'timestamp': quote.get('timestamp')
        })
    
    return results


def ticker_search(keywords: str) -> List[Dict[str, Any]]:
    """SYMBOL_SEARCH - Search for stock symbols"""
    params = {
        "function": "SYMBOL_SEARCH",
        "keywords": keywords,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    matches = data.get("bestMatches", [])
    
    results = []
    for match in matches:
        results.append({
            'symbol': match.get('1. symbol'),
            'name': match.get('2. name'),
            'type': match.get('3. type'),
            'region': match.get('4. region'),
            'currency': match.get('8. currency')
        })
    
    return results


def get_market_status() -> Dict[str, Any]:
    """MARKET_STATUS - Global market open/close status"""
    params = {
        "function": "MARKET_STATUS",
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


# ==================== CRYPTO APIs ====================

def get_crypto_intraday(symbol: str, market: str = "USD", interval: str = "60min") -> pd.DataFrame:
    """
    CRYPTO_INTRADAY - Crypto intraday data
    Intervals: 1min, 5min, 15min, 30min, 60min
    """
    params = {
        "function": "CRYPTO_INTRADAY",
        "symbol": symbol,
        "market": market,
        "interval": interval,
        "outputsize": "full",
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    time_series_key = f"Time Series Crypto ({interval})"
    time_series = data.get(time_series_key, {})
    
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
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


def get_crypto_daily(symbol: str, market: str = "USD") -> pd.DataFrame:
    """DIGITAL_CURRENCY_DAILY - Daily crypto prices"""
    params = {
        "function": "DIGITAL_CURRENCY_DAILY",
        "symbol": symbol,
        "market": market,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    time_series = data.get("Time Series (Digital Currency Daily)", {})
    
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
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


# ==================== OPTIONS APIs (Premium) ====================

def get_realtime_options(symbol: str, contract: Optional[str] = None) -> Dict[str, Any]:
    """
    REALTIME_OPTIONS - Live options chain data (Premium)
    Returns full options chain or specific contract
    """
    params = {
        "function": "REALTIME_OPTIONS",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    if contract:
        params["contract"] = contract
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    return data


def get_historical_options(symbol: str, date: str) -> Dict[str, Any]:
    """
    HISTORICAL_OPTIONS - Historical options data (Premium)
    Date format: YYYY-MM-DD
    """
    params = {
        "function": "HISTORICAL_OPTIONS",
        "symbol": symbol,
        "date": date,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    return data


# ==================== ALPHA INTELLIGENCE APIs ====================

def get_news_sentiment(tickers: Optional[List[str]] = None, topics: Optional[List[str]] = None, 
                       time_from: Optional[str] = None, time_to: Optional[str] = None,
                       limit: int = 50) -> Dict[str, Any]:
    """
    NEWS_SENTIMENT - News articles with AI sentiment scores
    Topics: blockchain, earnings, ipo, mergers_and_acquisitions, financial_markets,
            economy_fiscal, economy_monetary, economy_macro, energy_transportation,
            finance, life_sciences, manufacturing, real_estate, retail_wholesale, technology
    """
    params = {
        "function": "NEWS_SENTIMENT",
        "apikey": ALPHA_VANTAGE_API_KEY,
        "limit": limit
    }
    
    if tickers:
        params["tickers"] = ",".join(tickers)
    
    if topics:
        params["topics"] = ",".join(topics)
    
    if time_from:
        params["time_from"] = time_from
    
    if time_to:
        params["time_to"] = time_to
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


def get_top_gainers_losers() -> Dict[str, Any]:
    """
    TOP_GAINERS_LOSERS - Top 20 gainers, losers, and most active stocks
    Updated in real-time during market hours
    """
    params = {
        "function": "TOP_GAINERS_LOSERS",
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


def get_insider_transactions(symbol: str) -> Dict[str, Any]:
    """INSIDER_TRANSACTIONS - Insider trading activity"""
    params = {
        "function": "INSIDER_TRANSACTIONS",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


# ==================== FUNDAMENTALS APIs ====================

def get_company_overview(symbol: str) -> Dict[str, Any]:
    """OVERVIEW - Company information, financials, and key metrics"""
    params = {
        "function": "OVERVIEW",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    return data


def get_earnings(symbol: str) -> Dict[str, Any]:
    """EARNINGS - Annual and quarterly earnings (EPS)"""
    params = {
        "function": "EARNINGS",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


def get_earnings_calendar(horizon: str = "3month") -> pd.DataFrame:
    """
    EARNINGS_CALENDAR - Upcoming earnings releases
    Horizon: 3month, 6month, 12month
    """
    params = {
        "function": "EARNINGS_CALENDAR",
        "horizon": horizon,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "csv"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    
    from io import StringIO
    df = pd.read_csv(StringIO(response.text))
    
    return df


def get_income_statement(symbol: str) -> Dict[str, Any]:
    """INCOME_STATEMENT - Annual and quarterly income statements"""
    params = {
        "function": "INCOME_STATEMENT",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


def get_balance_sheet(symbol: str) -> Dict[str, Any]:
    """BALANCE_SHEET - Annual and quarterly balance sheets"""
    params = {
        "function": "BALANCE_SHEET",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


def get_cash_flow(symbol: str) -> Dict[str, Any]:
    """CASH_FLOW - Annual and quarterly cash flow statements"""
    params = {
        "function": "CASH_FLOW",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    return data


def get_listing_status(date: Optional[str] = None, state: str = "active") -> pd.DataFrame:
    """
    LISTING_STATUS - All listed stocks
    State: active or delisted
    Date format: YYYY-MM-DD
    """
    params = {
        "function": "LISTING_STATUS",
        "state": state,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "csv"
    }
    
    if date:
        params["date"] = date
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    
    from io import StringIO
    df = pd.read_csv(StringIO(response.text))
    
    return df


# ==================== FOREX APIs ====================

def get_fx_intraday(from_symbol: str, to_symbol: str, interval: str = "60min") -> pd.DataFrame:
    """
    FX_INTRADAY - Forex intraday data (Premium)
    Intervals: 1min, 5min, 15min, 30min, 60min
    """
    params = {
        "function": "FX_INTRADAY",
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "interval": interval,
        "outputsize": "full",
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    time_series_key = f"Time Series FX ({interval})"
    time_series = data.get(time_series_key, {})
    
    df_data = []
    for timestamp, values in time_series.items():
        df_data.append({
            'timestamp': pd.to_datetime(timestamp),
            'open': float(values['1. open']),
            'high': float(values['2. high']),
            'low': float(values['3. low']),
            'close': float(values['4. close'])
        })
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


def get_fx_daily(from_symbol: str, to_symbol: str) -> pd.DataFrame:
    """FX_DAILY - Daily forex rates"""
    params = {
        "function": "FX_DAILY",
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "outputsize": "full",
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    if "Error Message" in data:
        raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
    
    time_series = data.get("Time Series FX (Daily)", {})
    
    df_data = []
    for timestamp, values in time_series.items():
        df_data.append({
            'timestamp': pd.to_datetime(timestamp),
            'open': float(values['1. open']),
            'high': float(values['2. high']),
            'low': float(values['3. low']),
            'close': float(values['4. close'])
        })
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


# ==================== TECHNICAL INDICATORS ====================

def get_sma(symbol: str, interval: str = "daily", time_period: int = 20, series_type: str = "close") -> pd.DataFrame:
    """SMA - Simple Moving Average"""
    params = {
        "function": "SMA",
        "symbol": symbol,
        "interval": interval,
        "time_period": time_period,
        "series_type": series_type,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    technical_analysis = data.get("Technical Analysis: SMA", {})
    
    df_data = []
    for timestamp, values in technical_analysis.items():
        df_data.append({
            'timestamp': pd.to_datetime(timestamp),
            'sma': float(values['SMA'])
        })
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


def get_rsi(symbol: str, interval: str = "daily", time_period: int = 14, series_type: str = "close") -> pd.DataFrame:
    """RSI - Relative Strength Index"""
    params = {
        "function": "RSI",
        "symbol": symbol,
        "interval": interval,
        "time_period": time_period,
        "series_type": series_type,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    technical_analysis = data.get("Technical Analysis: RSI", {})
    
    df_data = []
    for timestamp, values in technical_analysis.items():
        df_data.append({
            'timestamp': pd.to_datetime(timestamp),
            'rsi': float(values['RSI'])
        })
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df


def get_macd(symbol: str, interval: str = "daily", series_type: str = "close") -> pd.DataFrame:
    """MACD - Moving Average Convergence/Divergence"""
    params = {
        "function": "MACD",
        "symbol": symbol,
        "interval": interval,
        "series_type": series_type,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    response = requests.get(BASE_URL, params=params, timeout=10)
    data = response.json()
    
    technical_analysis = data.get("Technical Analysis: MACD", {})
    
    df_data = []
    for timestamp, values in technical_analysis.items():
        df_data.append({
            'timestamp': pd.to_datetime(timestamp),
            'macd': float(values['MACD']),
            'macd_signal': float(values['MACD_Signal']),
            'macd_hist': float(values['MACD_Hist'])
        })
    
    df = pd.DataFrame(df_data).sort_values('timestamp').set_index('timestamp')
    return df
