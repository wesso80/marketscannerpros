"""
Market Data API Backend Service
Provides same-origin market data to eliminate iOS WebView restrictions
"""
import os
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
import uvicorn
from dataclasses import dataclass, asdict
import json
from abc import ABC, abstractmethod
import logging
import asyncio
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ================= Data Provider Interface =================
@dataclass
class OHLCVData:
    """Standardized OHLCV data structure"""
    symbol: str
    timeframe: str
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float

@dataclass 
class QuoteData:
    """Standardized quote data structure"""
    symbol: str
    current_price: float
    change: float
    change_percent: float
    timestamp: str

class DataProvider(ABC):
    """Abstract data provider interface"""
    
    @abstractmethod
    async def get_quote(self, symbol: str) -> Optional[QuoteData]:
        pass
    
    @abstractmethod
    async def get_ohlcv(self, symbol: str, interval: str, period: Optional[str] = None, 
                       start: Optional[str] = None, end: Optional[str] = None) -> List[OHLCVData]:
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        pass

# ================= YFinance Provider =================
class YFinanceProvider(DataProvider):
    """YFinance provider with fallback support"""
    
    def __init__(self):
        self.name = "yfinance"
    
    async def get_quote(self, symbol: str) -> Optional[QuoteData]:
        """Get current quote data"""
        try:
            ticker = yf.Ticker(symbol)
            
            # Try fast_info first
            if hasattr(ticker, 'fast_info'):
                fast_info = ticker.fast_info
                price = fast_info.get('last_price') or fast_info.get('regularMarketPrice')
                if price:
                    return QuoteData(
                        symbol=symbol,
                        current_price=float(price),
                        change=0.0,  # Would need history for change calculation
                        change_percent=0.0,
                        timestamp=datetime.now().isoformat()
                    )
            
            # Fallback to recent history
            hist = ticker.history(period="2d", interval="1d")
            if not hist.empty and len(hist) >= 2:
                current = hist.iloc[-1]
                previous = hist.iloc[-2]
                change = current['Close'] - previous['Close']
                change_percent = (change / previous['Close']) * 100
                
                return QuoteData(
                    symbol=symbol,
                    current_price=float(current['Close']),
                    change=float(change),
                    change_percent=float(change_percent),
                    timestamp=str(current.name)
                )
                
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"YFinance quote data error for {symbol}: {e}")
        except ConnectionError as e:
            logger.error(f"YFinance connection error for {symbol}: {e}")
        except Exception as e:
            logger.error(f"YFinance unexpected error for {symbol}: {type(e).__name__}: {e}")
            
        return None
    
    async def get_ohlcv(self, symbol: str, interval: str, period: Optional[str] = None,
                       start: Optional[str] = None, end: Optional[str] = None) -> List[OHLCVData]:
        """Get OHLCV data"""
        try:
            ticker = yf.Ticker(symbol.upper())
            
            # Determine parameters
            if start and end:
                data = ticker.history(start=start, end=end, interval=interval, auto_adjust=False)
            elif period:
                data = ticker.history(period=period, interval=interval, auto_adjust=False)
            else:
                # Default periods based on interval
                interval_periods = {
                    "1d": "2y", "1h": "730d", "30m": "60d", 
                    "15m": "60d", "5m": "60d", "1m": "60d"
                }
                default_period = interval_periods.get(interval, "1y")
                data = ticker.history(period=default_period, interval=interval, auto_adjust=False)
            
            if data is None or data.empty:
                return []
            
            # Convert to standardized format
            ohlcv_data = []
            for timestamp, row in data.iterrows():
                ohlcv_data.append(OHLCVData(
                    symbol=symbol,
                    timeframe=interval,
                    timestamp=timestamp.isoformat(),
                    open=float(row['Open']),
                    high=float(row['High']),
                    low=float(row['Low']),
                    close=float(row['Close']),
                    volume=float(row['Volume']) if pd.notna(row['Volume']) else 0.0
                ))
            
            return ohlcv_data
            
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"YFinance OHLCV data error for {symbol}: {e}")
            return []
        except ConnectionError as e:
            logger.error(f"YFinance connection error for {symbol}: {e}")
            return []
        except Exception as e:
            logger.error(f"YFinance unexpected error for {symbol}: {type(e).__name__}: {e}")
            return []
    
    def get_name(self) -> str:
        return self.name

# ================= Simple In-Memory Cache =================
class SimpleCache:
    """Simple in-memory cache with TTL support"""
    
    def __init__(self):
        self.cache = {}
        self.timestamps = {}
    
    def get(self, key: str, ttl_seconds: int = 300) -> Optional[Any]:
        """Get cached value if not expired"""
        if key in self.cache:
            timestamp = self.timestamps.get(key)
            if timestamp and (datetime.now() - timestamp).total_seconds() < ttl_seconds:
                return self.cache[key]
            else:
                # Expired - remove
                self.cache.pop(key, None)
                self.timestamps.pop(key, None)
        return None
    
    def set(self, key: str, value: Any):
        """Set cached value"""
        self.cache[key] = value
        self.timestamps[key] = datetime.now()
    
    def clear_expired(self, ttl_seconds: int = 300):
        """Clear expired cache entries"""
        now = datetime.now()
        expired_keys = [
            key for key, timestamp in self.timestamps.items()
            if (now - timestamp).total_seconds() >= ttl_seconds
        ]
        for key in expired_keys:
            self.cache.pop(key, None)
            self.timestamps.pop(key, None)

# ================= Market Data Service =================
class MarketDataService:
    """Market data service with provider abstraction and caching"""
    
    def __init__(self):
        self.providers = [YFinanceProvider()]  # Start with yfinance, can add more
        self.cache = SimpleCache()
        
    async def get_quote(self, symbol: str) -> Optional[QuoteData]:
        """Get quote with caching and provider fallback"""
        cache_key = f"quote:{symbol}"
        
        # Check cache (1-minute TTL for quotes)
        cached = self.cache.get(cache_key, ttl_seconds=60)
        if cached:
            return QuoteData(**cached) if isinstance(cached, dict) else cached
        
        # Try providers in order
        for provider in self.providers:
            try:
                result = await provider.get_quote(symbol)
                if result:
                    # Cache result
                    self.cache.set(cache_key, asdict(result))
                    return result
            except Exception as e:
                logger.warning(f"Provider {provider.get_name()} failed for quote {symbol}: {e}")
                continue
        
        return None
    
    async def get_ohlcv(self, symbol: str, interval: str = "1d", 
                       period: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None) -> List[OHLCVData]:
        """Get OHLCV with caching and provider fallback"""
        cache_key = f"ohlcv:{symbol}:{interval}:{period or 'default'}:{start or ''}:{end or ''}"
        
        # Check cache (5-minute TTL for OHLCV)
        cached = self.cache.get(cache_key, ttl_seconds=300)
        if cached:
            return [OHLCVData(**item) if isinstance(item, dict) else item for item in cached]
        
        # Try providers in order
        for provider in self.providers:
            try:
                result = await provider.get_ohlcv(symbol, interval, period, start, end)
                if result:
                    # Cache result
                    self.cache.set(cache_key, [asdict(item) for item in result])
                    return result
            except Exception as e:
                logger.warning(f"Provider {provider.get_name()} failed for OHLCV {symbol}: {e}")
                continue
        
        return []
    
    async def get_batch_ohlcv(self, symbols: List[str], interval: str = "1d",
                             period: Optional[str] = None) -> Dict[str, List[OHLCVData]]:
        """Get OHLCV for multiple symbols efficiently"""
        tasks = []
        for symbol in symbols:
            task = self.get_ohlcv(symbol, interval, period)
            tasks.append((symbol, task))
        
        # Execute all requests concurrently
        results = {}
        for symbol, task in tasks:
            try:
                ohlcv_data = await task
                results[symbol] = ohlcv_data
            except Exception as e:
                logger.error(f"Batch OHLCV failed for {symbol}: {e}")
                results[symbol] = []
        
        return results

# ================= FastAPI Application =================
# Global service instance
market_service = MarketDataService()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    logger.info("Market Data API starting...")
    
    # Background task to clean expired cache
    async def cache_cleanup():
        while True:
            await asyncio.sleep(300)  # Every 5 minutes
            market_service.cache.clear_expired()
    
    cleanup_task = asyncio.create_task(cache_cleanup())
    
    yield
    
    # Cleanup
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("Market Data API shutting down...")

app = FastAPI(
    title="Market Data API",
    description="Same-origin market data service for mobile compatibility", 
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration - restrictive since we want same-origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Will be restricted in production
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ================= API Endpoints =================
@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/api/quote/{symbol}")
async def get_quote_endpoint(symbol: str):
    """Get quote for a single symbol"""
    quote = await market_service.get_quote(symbol.upper())
    if not quote:
        raise HTTPException(status_code=404, detail=f"Quote not found for {symbol}")
    return asdict(quote)

@app.get("/api/ohlcv/{symbol}")
async def get_ohlcv_endpoint(
    symbol: str,
    interval: str = "1d",
    period: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None
):
    """Get OHLCV data for a single symbol"""
    ohlcv = await market_service.get_ohlcv(symbol.upper(), interval, period, start, end)
    if not ohlcv:
        raise HTTPException(status_code=404, detail=f"OHLCV data not found for {symbol}")
    return [asdict(item) for item in ohlcv]

@app.post("/api/batch/ohlcv")
async def get_batch_ohlcv_endpoint(request: Dict[str, Any]):
    """Get OHLCV data for multiple symbols"""
    symbols = request.get("symbols", [])
    interval = request.get("interval", "1d")
    period = request.get("period", None)
    
    if not symbols:
        raise HTTPException(status_code=400, detail="Symbols list required")
    
    # Limit batch size
    if len(symbols) > 50:
        raise HTTPException(status_code=400, detail="Max 50 symbols per batch")
    
    results = await market_service.get_batch_ohlcv(symbols, interval, period)
    
    # Convert to serializable format
    serializable_results = {}
    for symbol, ohlcv_list in results.items():
        serializable_results[symbol] = [asdict(item) for item in ohlcv_list]
    
    return serializable_results

@app.get("/api/cache/stats")
async def cache_stats():
    """Get cache statistics"""
    cache = market_service.cache
    return {
        "cache_size": len(cache.cache),
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))  # Use different port from main app
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")