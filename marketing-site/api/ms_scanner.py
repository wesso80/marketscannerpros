# marketing-site/api/ms_scanner.py

import yfinance as yf
import pandas as pd
import numpy as np
from flask import Blueprint, request, jsonify

# 👇 Blueprint that main.py will mount
scanner = Blueprint("scanner", __name__)


def compute_score(close, ema20, ema50, atr, trend, squeeze):
    """
    Return a 0–100 score based on:
      - trend direction
      - price vs EMAs
      - squeeze state
      - volatility
    """
    score = 50  # neutral base

    # 1) Trend bias
    if trend == "BULLISH":
        score += 15
    elif trend == "BEARISH":
        score -= 15

    # Guard against zero EMAs
    if ema20 and ema20 != 0:
        diff20 = (close - ema20) / ema20 * 100.0
    else:
        diff20 = 0.0

    if ema50 and ema50 != 0:
        diff50 = (close - ema50) / ema50 * 100.0
    else:
        diff50 = 0.0

    # 2) Price vs EMAs (trend-aligned sweet spot)
    if trend == "BULLISH":
        if 0 <= diff20 <= 3:
            score += 10
        elif diff20 > 10:
            score -= 10

        if 0 <= diff50 <= 5:
            score += 5
        elif diff50 > 12:
            score -= 5

    elif trend == "BEARISH":
        if -3 <= diff20 <= 0:
            score += 10
        elif diff20 < -10:
            score -= 10

        if -5 <= diff50 <= 0:
            score += 5
        elif diff50 < -12:
            score -= 5

    # 3) Squeeze bonus
    if squeeze:
        score += 10

    # 4) Volatility – penalise crazy ATR relative to price
    if close and atr:
        atr_pct = (atr / close) * 100.0
        if atr_pct > 8:
            score -= 10
        elif atr_pct > 5:
            score -= 5

    # clamp 0–100
    score = max(0, min(100, int(round(score))))
    return score


def run_scan(symbol: str, interval="1h", periods=200):
    """
    Wrapper around yfinance that:
    - normalises our timeframe names to what yfinance expects
    - uses a safe period for intraday vs daily so Yahoo actually returns data
    """

    # ---- 1) Normalise interval for yfinance ----
    ui_tf = (interval or "1h").strip()

    # older yfinance accepted "1h", newer is happier with "60m"
    if ui_tf == "1h":
        yf_interval = "60m"
    elif ui_tf == "4h":
        # Yahoo doesn't really have 4h; approximate with 60m and we'll still
        # get useful EMAs / ATR out of it.
        yf_interval = "60m"
    else:
        yf_interval = ui_tf

    # ---- 2) Choose a safe period based on interval ----
    # Intraday history is limited. If we ask for too long a period, Yahoo
    # just returns nothing and we see "No data found for this date range".
    if yf_interval.endswith("m"):           # 1m, 5m, 15m, 60m etc
        period = "60d"                      # ~2 months intraday
    elif yf_interval in ("1d", "5d"):
        period = "365d"                     # 1 year of daily
    else:
        period = "5y"                       # fallback for longer timeframes

    try:
        df = yf.download(
            symbol,
            period=period,
            interval=yf_interval,
            auto_adjust=False,
            progress=False,
        )

        if df is None or df.empty or len(df) < 50:
            return {
                "error": f"Not enough historical data (symbol={symbol}, interval={yf_interval}, period={period})"
            }

        df["ATR"]   = df["High"] - df["Low"]
        df["EMA20"] = df["Close"].ewm(span=20).mean()
        df["EMA50"] = df["Close"].ewm(span=50).mean()

        close = float(df["Close"].iloc[-1])
        atr   = float(df["ATR"].iloc[-1])
        ema20 = float(df["EMA20"].iloc[-1])
        ema50 = float(df["EMA50"].iloc[-1])

        trend = "BULLISH" if ema20 > ema50 else "BEARISH"
        squeeze = bool(np.std(df["Close"].pct_change().tail(20)).item() < 0.02)

        score = compute_score(close, ema20, ema50, atr, trend, squeeze)

        return {
            "symbol":  symbol.upper(),
            "trend":   trend,
            "squeeze": squeeze,
            "close":   close,
            "atr":     atr,
            "ema20":   ema20,
            "ema50":   ema50,
            "score":   score,
        }

    except Exception as e:
        return {"error": str(e)}



@scanner.route("/multi_scan", methods=["GET"])
def multi_scan():
    try:
        symbols = request.args.get("symbols", "")
        interval = request.args.get("tf", "1h")

        if symbols.strip() == "":
            return jsonify({"error": "No symbols supplied"}), 400

        symbols_list = [s.strip() for s in symbols.split(",")]
        results = [run_scan(sym, interval) for sym in symbols_list]

        return jsonify({"count": len(results), "results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@scanner.route("/scan", methods=["GET"])
def scan_endpoint():
    symbol = request.args.get("symbol", "BTC-USD")
    interval = request.args.get("tf", "1h")
    return jsonify(run_scan(symbol, interval))
