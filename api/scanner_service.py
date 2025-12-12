"""
FastAPI Scanner Service
Run with: uvicorn api.scanner_service:app --port 8000 --reload
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.scanner_core import (
    scan_symbols, 
    EQUITY_SYMBOLS, EQUITY_LARGE_CAP, EQUITY_MID_CAP, EQUITY_SMALL_CAP,
    CRYPTO_SYMBOLS,
    FOREX_SYMBOLS, FOREX_MAJORS, FOREX_CROSSES, FOREX_EXOTICS,
    COMMODITY_SYMBOLS, COMMODITY_ENERGY, COMMODITY_METALS, COMMODITY_AGRICULTURE
)

app = FastAPI(title="Market Scanner API")

# Enable CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000", "https://marketscannerpros.app", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    type: str  # "equity", "crypto", "forex", "commodities"
    timeframe: str  # "15m", "1h", "4h", "1d"
    minScore: Optional[float] = 0
    symbols: Optional[List[str]] = None
    preset: Optional[str] = "default"  # Preset category like "large-cap", "majors", etc.

class ScanResponse(BaseModel):
    success: bool
    results: List[dict]
    errors: List[dict]
    metadata: dict

@app.get("/")
async def root():
    return {"status": "Market Scanner API v1.0", "endpoints": ["/scan", "/health"]}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/scan", response_model=ScanResponse)
async def scan(request: ScanRequest):
    """
    Run market scanner
    """
    try:
        # Validate inputs
        if request.type not in ["equity", "crypto", "forex", "commodities"]:
            raise HTTPException(status_code=400, detail="Type must be 'equity', 'crypto', 'forex', or 'commodities'")
        
        # Validate timeframe - same for all markets
        if request.timeframe not in ["1m", "5m", "15m", "30m", "1h", "1d"]:
            raise HTTPException(status_code=400, detail="Timeframe must be 1m, 5m, 15m, 30m, 1h, or 1d")
        
        # Select symbols based on type and preset
        if request.symbols:
            symbols = request.symbols
        else:
            preset = request.preset or "default"
            
            if request.type == "equity":
                if preset == "large-cap":
                    symbols = EQUITY_LARGE_CAP
                elif preset == "mid-cap":
                    symbols = EQUITY_MID_CAP
                elif preset == "small-cap":
                    symbols = EQUITY_SMALL_CAP
                else:  # default
                    symbols = EQUITY_SYMBOLS
                    
            elif request.type == "crypto":
                # All crypto use same comprehensive list
                symbols = CRYPTO_SYMBOLS
                
            elif request.type == "forex":
                if preset == "majors":
                    symbols = FOREX_MAJORS
                elif preset == "crosses":
                    symbols = FOREX_CROSSES
                elif preset == "exotics":
                    symbols = FOREX_EXOTICS
                else:  # default (all)
                    symbols = FOREX_SYMBOLS
                    
            else:  # commodities
                if preset == "energy":
                    symbols = COMMODITY_ENERGY
                elif preset == "metals":
                    symbols = COMMODITY_METALS
                elif preset == "agriculture":
                    symbols = COMMODITY_AGRICULTURE
                else:  # default (all)
                    symbols = COMMODITY_SYMBOLS
        
        # Run scanner
        results, errors = scan_symbols(
            symbols=symbols,
            timeframe=request.timeframe,
            min_score=request.minScore or 0,
            is_crypto=(request.type == "crypto"),
            is_forex=(request.type == "forex")
        )
        
        return ScanResponse(
            success=True,
            results=results,
            errors=errors,
            metadata={
                "type": request.type,
                "timeframe": request.timeframe,
                "minScore": request.minScore,
                "totalScanned": len(symbols),
                "resultsFound": len(results),
                "errorsCount": len(errors)
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
