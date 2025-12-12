"""
Enhanced Scanner Service - All Timeframes & Data Sources
Uses complete Alpha Vantage Premium API
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.alpha_vantage import (
    get_intraday, get_daily, get_weekly, get_monthly,
    get_daily_adjusted, get_weekly_adjusted, get_monthly_adjusted,
    get_quote_endpoint, get_realtime_bulk_quotes,
    get_crypto_intraday, get_crypto_daily,
    get_fx_intraday, get_fx_daily,
    ticker_search, get_market_status
)
from api.scanner_core import compute_features, score_row, determine_signal, determine_phase

app = FastAPI(title="Market Scanner Enhanced API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5000",
        "https://marketscannerpros.app",
        "https://*.marketscannerpros.app",
        "https://*.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EnhancedScanRequest(BaseModel):
    type: str  # equity, crypto, forex
    timeframe: str  # 15m, 1h, 4h, 1d, 1w, 1mo
    minScore: float = 0
    symbols: Optional[List[str]] = None
    adjusted: bool = False  # Use adjusted prices (dividends/splits)


class QuoteRequest(BaseModel):
    symbols: List[str]  # Up to 100 symbols


class SearchRequest(BaseModel):
    keywords: str


class ScanResult(BaseModel):
    symbol: str
    name: str
    price: float
    change_pct: float
    volume: int
    score: float
    signal: str
    direction: str
    ema200_phase: str
    rsi: Optional[float]
    macd_histogram: Optional[float]


class QuoteResult(BaseModel):
    symbol: str
    price: float
    open: float
    high: float
    low: float
    volume: int
    previous_close: float
    change: float
    change_percent: str
    latest_trading_day: str


class SearchResult(BaseModel):
    symbol: str
    name: str
    type: str
    region: str
    currency: str


class ScanResponse(BaseModel):
    success: bool
    results: List[ScanResult]
    errors: List[Dict[str, str]]
    metadata: Dict[str, Any]


@app.get("/")
def root():
    return {
        "status": "Enhanced Market Scanner API v2.0",
        "endpoints": [
            "/scan",
            "/quotes",
            "/search",
            "/market-status",
            "/health"
        ]
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/scan", response_model=ScanResponse)
async def enhanced_scan(request: EnhancedScanRequest):
    """
    Enhanced scanner with all timeframes:
    - Intraday: 15m, 1h, 4h
    - Daily, Weekly, Monthly
    - Adjusted prices option
    """
    try:
        results = []
        errors = []
        
        # Default symbol lists
        if not request.symbols:
            if request.type == "equity":
                symbols = [
                    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "AMD",
                    "NFLX", "DIS", "V", "MA", "JPM", "BAC", "WMT", "HD",
                    "PG", "KO", "PEP", "CSCO", "INTC", "ORCL", "CRM", "ADBE", "PYPL"
                ]
            elif request.type == "crypto":
                symbols = ["BTC", "ETH", "BNB", "XRP", "ADA", "DOGE", "SOL", "DOT", "MATIC", "AVAX"]
            elif request.type == "forex":
                symbols = [("EUR", "USD"), ("GBP", "USD"), ("USD", "JPY"), ("AUD", "USD"), ("USD", "CAD")]
            else:
                raise HTTPException(400, f"Invalid type: {request.type}")
        else:
            symbols = request.symbols
        
        # Scan each symbol
        for symbol in symbols:
            try:
                # Fetch data based on timeframe and type
                if request.type == "equity":
                    df = fetch_equity_data(symbol, request.timeframe, request.adjusted)
                elif request.type == "crypto":
                    df = fetch_crypto_data(symbol, request.timeframe)
                elif request.type == "forex":
                    if isinstance(symbol, tuple):
                        from_sym, to_sym = symbol
                    else:
                        from_sym, to_sym = symbol.split("/")
                    df = fetch_forex_data(from_sym, to_sym, request.timeframe)
                    symbol = f"{from_sym}/{to_sym}"
                else:
                    continue
                
                if len(df) < 200:
                    errors.append({
                        "symbol": symbol,
                        "error": f"Insufficient data: {len(df)} bars (need 200+)"
                    })
                    continue
                
                # Compute features and score
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
                if score < request.minScore:
                    continue
                
                direction = "LONG" if score >= 0 else "SHORT"
                signal = determine_signal(last)
                phase = determine_phase(last)
                
                # Calculate change percentage
                if len(features) >= 20:
                    change_pct = ((last.close - features.iloc[-20].close) / features.iloc[-20].close) * 100
                else:
                    change_pct = 0.0
                
                results.append({
                    "symbol": str(symbol),
                    "name": str(symbol),
                    "price": round(float(last.close), 2),
                    "change_pct": round(float(change_pct), 2),
                    "volume": int(last.volume) if hasattr(last, 'volume') and last.volume else 0,
                    "score": round(float(score), 0),
                    "signal": signal,
                    "direction": direction,
                    "ema200_phase": phase,
                    "rsi": round(float(last.rsi), 1) if hasattr(last, 'rsi') else None,
                    "macd_histogram": round(float(last.macd_hist), 3) if hasattr(last, 'macd_hist') else None,
                })
                
            except Exception as e:
                errors.append({
                    "symbol": str(symbol),
                    "error": str(e)
                })
        
        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        
        return {
            "success": True,
            "results": results,
            "errors": errors,
            "metadata": {
                "type": request.type,
                "timeframe": request.timeframe,
                "minScore": request.minScore,
                "scanned": len(symbols),
                "found": len(results),
                "failed": len(errors)
            }
        }
        
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/quotes")
async def bulk_quotes(request: QuoteRequest):
    """
    Get real-time quotes for up to 100 symbols at once
    Uses REALTIME_BULK_QUOTES (Premium)
    """
    try:
        if len(request.symbols) > 100:
            raise HTTPException(400, "Maximum 100 symbols per request")
        
        quotes = get_realtime_bulk_quotes(request.symbols)
        
        return {
            "success": True,
            "quotes": quotes,
            "count": len(quotes)
        }
        
    except Exception as e:
        # Fallback to individual quotes
        results = []
        for symbol in request.symbols[:100]:
            try:
                quote = get_quote_endpoint(symbol)
                results.append(quote)
            except:
                pass
        
        return {
            "success": True,
            "quotes": results,
            "count": len(results)
        }


@app.post("/search")
async def search_ticker(request: SearchRequest):
    """Search for stock symbols by keywords"""
    try:
        results = ticker_search(request.keywords)
        
        return {
            "success": True,
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/market-status")
async def market_status():
    """Get global market open/close status"""
    try:
        status = get_market_status()
        return {
            "success": True,
            "status": status
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ==================== Helper Functions ====================

def fetch_equity_data(symbol: str, timeframe: str, adjusted: bool = False):
    """Fetch equity data for any timeframe"""
    tf = timeframe.lower()
    
    if tf in ("15m", "1h", "4h"):
        # Intraday
        interval_map = {"15m": "15min", "1h": "60min", "4h": "60min"}
        interval = interval_map[tf]
        df = get_intraday(symbol, interval=interval, outputsize="full")
        
        # Resample 4h from 1h
        if tf == "4h":
            df = df.resample('4H').agg({
                'open': 'first',
                'high': 'max',
                'low': 'min',
                'close': 'last',
                'volume': 'sum'
            }).dropna()
        
        return df
    
    elif tf in ("1d", "daily"):
        if adjusted:
            return get_daily_adjusted(symbol, outputsize="full")
        else:
            return get_daily(symbol, outputsize="full")
    
    elif tf in ("1w", "weekly"):
        if adjusted:
            return get_weekly_adjusted(symbol)
        else:
            return get_weekly(symbol)
    
    elif tf in ("1mo", "monthly"):
        if adjusted:
            return get_monthly_adjusted(symbol)
        else:
            return get_monthly(symbol)
    
    else:
        raise ValueError(f"Unsupported timeframe: {timeframe}")


def fetch_crypto_data(symbol: str, timeframe: str):
    """Fetch crypto data for any timeframe"""
    tf = timeframe.lower()
    
    if tf in ("15m", "1h", "4h"):
        # Crypto intraday
        interval_map = {"15m": "15min", "1h": "60min", "4h": "60min"}
        interval = interval_map[tf]
        df = get_crypto_intraday(symbol, market="USD", interval=interval)
        
        # Resample 4h from 1h
        if tf == "4h":
            df = df.resample('4H').agg({
                'open': 'first',
                'high': 'max',
                'low': 'min',
                'close': 'last',
                'volume': 'sum'
            }).dropna()
        
        return df
    
    elif tf in ("1d", "daily"):
        return get_crypto_daily(symbol, market="USD")
    
    else:
        raise ValueError(f"Unsupported crypto timeframe: {timeframe}")


def fetch_forex_data(from_symbol: str, to_symbol: str, timeframe: str):
    """Fetch forex data for any timeframe"""
    tf = timeframe.lower()
    
    if tf in ("15m", "1h", "4h"):
        # FX intraday
        interval_map = {"15m": "15min", "1h": "60min", "4h": "60min"}
        interval = interval_map[tf]
        df = get_fx_intraday(from_symbol, to_symbol, interval=interval)
        
        # Resample 4h from 1h
        if tf == "4h":
            df = df.resample('4H').agg({
                'open': 'first',
                'high': 'max',
                'low': 'min',
                'close': 'last'
            }).dropna()
        
        return df
    
    elif tf in ("1d", "daily"):
        return get_fx_daily(from_symbol, to_symbol)
    
    else:
        raise ValueError(f"Unsupported forex timeframe: {timeframe}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
