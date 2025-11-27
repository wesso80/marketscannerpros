# MarketScanner Pros – Dev Handoff

This project has TWO main pieces:

1. **Backend (Flask scanner API)** – in the `marketing-site/api` folder  
2. **Mobile App (Expo / React Native)** – in the `msp-native` folder

The goal of this handoff:  
✅ You (freelancer) wire up and stabilise what’s already built, **without** rebuilding the scanner logic.

---

## 1. BACKEND – Scanner API (Flask)

**Location**

- `marketing-site/api/main.py`
- `marketing-site/api/ms_scanner.py`

**What’s implemented**

- Flask app with CORS enabled
- Blueprint `scanner` registered under `/api`
- Endpoints:
  - `GET /health` → returns `{ "status": "ok", "service": "scanner-api" }`
  - `GET /api/scan?symbol=BTC-USD&tf=1h`
  - `GET /api/multi_scan?symbols=AAPL,MSFT,BTC-USD&tf=1h`

**Scanner logic**

All scanner logic is in `ms_scanner.py`:

- Uses `yfinance` to download OHLCV data  
- Computes ATR, EMA20, EMA50  
- Derives:
  - `trend` = `"BULLISH"` if EMA20 > EMA50 else `"BEARISH"`
  - `squeeze` = volatility compression check on 20-period returns
  - `score` = 0–100 based on trend, EMA position, squeeze, ATR%  
- Returns JSON payload per symbol:

```json
{
  "symbol": "AAPL",
  "trend": "BULLISH",
  "squeeze": false,
  "close": 123.45,
  "atr": 2.1,
  "ema20": 122.3,
  "ema50": 121.5,
  "score": 62
}
