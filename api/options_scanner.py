"""
Options Chain Scanner
Finds diamond options plays using Alpha Vantage REALTIME_OPTIONS API
"""
import os
import requests
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
import time

ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "UI755FUUAM6FRRI9")

def get_options_chain(symbol: str) -> Dict:
    """
    Fetch real-time options chain from Alpha Vantage Premium
    """
    base_url = "https://www.alphavantage.co/query"
    params = {
        "function": "REALTIME_OPTIONS",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "datatype": "json"
    }
    
    try:
        response = requests.get(base_url, params=params, timeout=15)
        data = response.json()
        
        if "Error Message" in data:
            raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
        
        if "Note" in data:
            raise ValueError(f"Rate limit: {data['Note']}")
        
        if "data" not in data:
            raise ValueError(f"No options data. Response keys: {list(data.keys())}")
        
        return data
        
    except Exception as e:
        raise ValueError(f"Failed to fetch options: {str(e)}")

def score_option(contract: Dict) -> float:
    """
    Score options contracts based on Greeks, IV, volume, OI
    Higher score = better opportunity
    """
    score = 0.0
    
    try:
        # Extract data
        volume = float(contract.get('volume', 0))
        open_interest = float(contract.get('open_interest', 0))
        implied_volatility = float(contract.get('implied_volatility', 0))
        delta = abs(float(contract.get('delta', 0)))
        gamma = float(contract.get('gamma', 0))
        theta = float(contract.get('theta', 0))
        bid = float(contract.get('bid', 0))
        ask = float(contract.get('ask', 0))
        
        # Volume scoring (liquidity is king)
        if volume > 1000:
            score += 30
        elif volume > 500:
            score += 20
        elif volume > 100:
            score += 10
        elif volume > 10:
            score += 5
        
        # Open Interest scoring (established contracts)
        if open_interest > 5000:
            score += 25
        elif open_interest > 1000:
            score += 15
        elif open_interest > 100:
            score += 8
        
        # Implied Volatility scoring (high IV = high premium)
        if implied_volatility > 0.8:  # 80%+
            score += 20
        elif implied_volatility > 0.5:  # 50%+
            score += 15
        elif implied_volatility > 0.3:  # 30%+
            score += 10
        
        # Delta scoring (probability of profit)
        # For calls: delta 0.3-0.7 is sweet spot
        # For puts: same logic (using abs)
        if 0.3 <= delta <= 0.7:
            score += 15
        elif 0.2 <= delta <= 0.8:
            score += 10
        
        # Gamma scoring (fast movement potential)
        if gamma > 0.05:
            score += 10
        elif gamma > 0.02:
            score += 5
        
        # Theta scoring (time decay - avoid high theta)
        if abs(theta) < 0.05:  # Low decay
            score += 10
        elif abs(theta) < 0.10:
            score += 5
        
        # Bid-Ask spread scoring (tight spreads = liquid)
        if bid > 0 and ask > 0:
            spread_pct = ((ask - bid) / bid) * 100
            if spread_pct < 5:
                score += 15
            elif spread_pct < 10:
                score += 10
            elif spread_pct < 20:
                score += 5
        
        return float(score)
        
    except Exception as e:
        return 0.0

def scan_options(
    symbols: List[str], 
    min_score: float = 40,
    contract_type: Optional[str] = None  # "call", "put", or None for both
) -> Tuple[List[Dict], List[Dict]]:
    """
    Scan options chains for multiple symbols
    Returns: (results, errors)
    """
    results = []
    errors = []
    
    for symbol in symbols:
        try:
            print(f"📊 Scanning options for {symbol}...")
            
            # Fetch options chain
            data = get_options_chain(symbol)
            contracts = data.get("data", [])
            
            if not contracts:
                errors.append({
                    "symbol": symbol,
                    "error": "No options contracts available"
                })
                continue
            
            # Score each contract
            for contract in contracts:
                try:
                    # Filter by contract type if specified
                    if contract_type:
                        if contract.get("type", "").lower() != contract_type.lower():
                            continue
                    
                    score = score_option(contract)
                    
                    # Filter by min score
                    if score < min_score:
                        continue
                    
                    # Calculate days to expiration
                    exp_date = contract.get("expiration", "")
                    if exp_date:
                        try:
                            exp_dt = datetime.strptime(exp_date, "%Y-%m-%d")
                            dte = (exp_dt - datetime.now()).days
                        except:
                            dte = None
                    else:
                        dte = None
                    
                    # Build result
                    result = {
                        "symbol": symbol,
                        "contract_id": contract.get("contractID", ""),
                        "type": contract.get("type", "").upper(),
                        "strike": float(contract.get("strike", 0)),
                        "expiration": exp_date,
                        "dte": dte,
                        "last_price": float(contract.get("last", 0)),
                        "bid": float(contract.get("bid", 0)),
                        "ask": float(contract.get("ask", 0)),
                        "volume": int(contract.get("volume", 0)),
                        "open_interest": int(contract.get("open_interest", 0)),
                        "implied_volatility": round(float(contract.get("implied_volatility", 0)) * 100, 1),
                        "delta": round(float(contract.get("delta", 0)), 3),
                        "gamma": round(float(contract.get("gamma", 0)), 4),
                        "theta": round(float(contract.get("theta", 0)), 4),
                        "vega": round(float(contract.get("vega", 0)), 4),
                        "score": round(score, 0)
                    }
                    
                    results.append(result)
                    
                except Exception as contract_error:
                    continue  # Skip bad contracts
            
            # Respect API rate limits (75 calls/min with Premium)
            time.sleep(0.8)  # ~75 calls per minute
            
        except Exception as symbol_error:
            errors.append({
                "symbol": symbol,
                "error": str(symbol_error)
            })
    
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    
    return results, errors

# Popular symbols for options trading
OPTIONS_POPULAR = [
    # Tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "AMD", "NFLX",
    # Finance
    "JPM", "BAC", "GS", "MS", "WFC",
    # Indices/ETFs
    "SPY", "QQQ", "IWM", "DIA",
    # Meme/High IV
    "GME", "AMC", "PLTR", "COIN", "HOOD", "RIVN"
]
