from fastapi import FastAPI, Request, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
import os, time, datetime, sqlite3

SECRET = os.getenv("SECRET", "")
DB_PATH = os.getenv("DB_PATH", "alerts.db")

app = FastAPI(title="AI Scanner API (sqlite3)")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    try:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS tradingview_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            timeframe TEXT,
            side TEXT,
            price REAL,
            time_ms INTEGER,
            received_at TEXT,
            ema9 REAL,
            ema21 REAL,
            ema50 REAL,
            ema200 REAL,
            rsi14 REAL,
            macd REAL,
            macd_sig REAL,
            macd_hist REAL,
            atr14 REAL,
            vol_z REAL
        )
        """)
        conn.commit()
    finally:
        conn.close()

init_db()

@app.get("/ai-scanner/status")
def status():
    feats = ['ema9','ema21','ema50','ema200','rsi14','macd','macd_sig','macd_hist','atr14','vol_z']
    return {"ok": True, "features": feats, "ts": int(time.time()*1000)}

class Features(BaseModel):
    ema9: Optional[float] = None
    ema21: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None
    rsi14: Optional[float] = None
    macd: Optional[float] = None
    macd_sig: Optional[float] = Field(None, alias="macd_sig")
    macd_hist: Optional[float] = Field(None, alias="macd_hist")
    atr14: Optional[float] = None
    vol_z: Optional[float] = None

class Alert(BaseModel):
    secret: str
    symbol: str
    tf: str
    time_ms: int
    price: float
    side: str
    features: Features

@app.post("/ai-scanner/alert")
async def alert(payload: Alert, request: Request):
    if not SECRET:
        raise HTTPException(500, detail="Server secret not set")
    if payload.secret != SECRET:
        raise HTTPException(401, detail="Invalid secret")

    now_iso = datetime.datetime.utcnow().isoformat(timespec="seconds")

    conn = get_db()
    try:
        cur = conn.execute("""
            INSERT INTO tradingview_alerts
            (symbol, timeframe, side, price, time_ms, received_at,
             ema9, ema21, ema50, ema200, rsi14, macd, macd_sig, macd_hist, atr14, vol_z)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.symbol, payload.tf, payload.side, payload.price, payload.time_ms, now_iso,
            payload.features.ema9, payload.features.ema21, payload.features.ema50,
            payload.features.ema200, payload.features.rsi14, payload.features.macd,
            payload.features.macd_sig, payload.features.macd_hist,
            payload.features.atr14, payload.features.vol_z
        ))
        conn.commit()
        new_id = cur.lastrowid
    finally:
        conn.close()

    print(f"[ALERT] {payload.symbol} {payload.tf} {payload.side} @ {payload.price}")
    return {"ok": True, "id": new_id}

@app.get("/ai-scanner/alerts")
def list_alerts(
    symbol: Optional[str] = Query(None),
    timeframe: Optional[str] = Query(None),
    side: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200)
):
    conn = get_db()
    try:
        where = []
        params = []
        if symbol:
            where.append("symbol = ?"); params.append(symbol)
        if timeframe:
            where.append("timeframe = ?"); params.append(timeframe)
        if side:
            where.append("side = ?"); params.append(side)

        sql = """
            SELECT id, symbol, timeframe, side, price, time_ms, received_at,
                   ema9, ema21, ema50, ema200, rsi14, macd, macd_sig, macd_hist, atr14, vol_z
            FROM tradingview_alerts
        """
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY received_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            out.append({k: r[k] for k in r.keys()})
        return out
    finally:
        conn.close()
