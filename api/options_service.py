"""
FastAPI Options Scanner Service
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.options_scanner import scan_options, OPTIONS_POPULAR

app = FastAPI(title="Options Scanner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000", "https://marketscannerpros.app", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OptionsScanRequest(BaseModel):
    symbols: Optional[List[str]] = None
    minScore: Optional[float] = 40
    contractType: Optional[str] = None  # "call", "put", or None

class OptionsScanResponse(BaseModel):
    success: bool
    results: List[dict]
    errors: List[dict]
    metadata: dict

@app.get("/")
async def root():
    return {"status": "Options Scanner API v1.0", "endpoints": ["/scan", "/health"]}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/scan", response_model=OptionsScanResponse)
async def scan(request: OptionsScanRequest):
    """
    Scan options chains for diamond plays
    """
    try:
        # Use popular symbols if none provided
        symbols = request.symbols or OPTIONS_POPULAR
        
        # Validate contract type
        if request.contractType and request.contractType.lower() not in ["call", "put"]:
            raise HTTPException(status_code=400, detail="contractType must be 'call' or 'put'")
        
        # Run scan
        results, errors = scan_options(
            symbols=symbols,
            min_score=request.minScore or 40,
            contract_type=request.contractType
        )
        
        return OptionsScanResponse(
            success=True,
            results=results,
            errors=errors,
            metadata={
                "totalSymbols": len(symbols),
                "resultsFound": len(results),
                "errorsCount": len(errors),
                "minScore": request.minScore,
                "contractType": request.contractType or "both"
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
