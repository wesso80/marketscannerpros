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

from api.scanner_core import scan_symbols, EQUITY_SYMBOLS, CRYPTO_SYMBOLS

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
    type: str  # "equity" or "crypto"
    timeframe: str  # "15m", "1h", "4h", "1d"
    minScore: Optional[float] = 0
    symbols: Optional[List[str]] = None

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
        if request.type not in ["equity", "crypto"]:
            raise HTTPException(status_code=400, detail="Type must be 'equity' or 'crypto'")
        
        if request.timeframe not in ["15m", "1h", "4h", "1d"]:
            raise HTTPException(status_code=400, detail="Invalid timeframe")
        
        # Select symbols
        if request.symbols:
            symbols = request.symbols
        else:
            symbols = EQUITY_SYMBOLS if request.type == "equity" else CRYPTO_SYMBOLS
        
        # Run scanner
        results, errors = scan_symbols(
            symbols=symbols,
            timeframe=request.timeframe,
            min_score=request.minScore or 0,
            is_crypto=(request.type == "crypto")
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
