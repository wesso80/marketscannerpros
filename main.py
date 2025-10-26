from fastapi import FastAPI, Request, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
import os, time, datetime, sqlite3

SECRET = os.getenv("SECRET", "")
DB_PATH = os.getenv("DB_PATH", "alerts.db")
LEARN_THRESHOLD = float(os.getenv("LEARN_THRESHOLD", "0.55"))
ENABLE_LEARNING_FILTER = os.getenv("ENABLE_LEARNING_FILTER", "false").lower() == "true"

app = FastAPI(title="AI Scanner API with Learning")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    try:
        # Original alerts table
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
        
        # Positions table for trade tracking
        conn.execute("""
        CREATE TABLE IF NOT EXISTS positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            timeframe TEXT,
            side TEXT,
            open_time_ms INTEGER,
            open_price REAL,
            close_time_ms INTEGER,
            close_price REAL,
            pnl REAL,
            win INTEGER,
            status TEXT
        )
        """)
        
        # Bucket stats for learning
        conn.execute("""
        CREATE TABLE IF NOT EXISTS bucket_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            timeframe TEXT,
            rsi_bin INTEGER,
            macd_hist_sign INTEGER,
            volz_bin INTEGER,
            wins INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            UNIQUE(symbol, timeframe, rsi_bin, macd_hist_sign, volz_bin)
        )
        """)
        
        conn.commit()
    finally:
        conn.close()

init_db()

@app.get("/ai-scanner/status")
def status():
    feats = ['ema9','ema21','ema50','ema200','rsi14','macd','macd_sig','macd_hist','atr14','vol_z']
    return {
        "ok": True, 
        "features": feats, 
        "ts": int(time.time()*1000),
        "learning_enabled": ENABLE_LEARNING_FILTER,
        "learn_threshold": LEARN_THRESHOLD
    }

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

def sign(x):
    """Returns -1, 0, or 1"""
    return 0 if x is None or abs(x) < 1e-9 else (1 if x > 0 else -1)

@app.post("/ai-scanner/alert")
async def alert(payload: Alert, request: Request):
    if not SECRET:
        raise HTTPException(500, detail="Server secret not set")
    if payload.secret != SECRET:
        raise HTTPException(401, detail="Invalid secret")

    now_iso = datetime.datetime.utcnow().isoformat(timespec="seconds")
    
    # Derive discrete buckets for learning
    rsi_bin = None
    if payload.features.rsi14 is not None:
        rsi_bin = int(max(0, min(9, payload.features.rsi14 // 10)))
    
    volz_bin = None
    if payload.features.vol_z is not None:
        volz_bin = -1 if payload.features.vol_z < -0.5 else (1 if payload.features.vol_z > 0.5 else 0)
    
    macd_hist_sign = sign(payload.features.macd_hist)
    
    conn = get_db()
    try:
        # Optional learning filter
        if ENABLE_LEARNING_FILTER and rsi_bin is not None and macd_hist_sign is not None and volz_bin is not None:
            c = conn.cursor()
            c.execute("""SELECT wins, total FROM bucket_stats
                         WHERE symbol=? AND timeframe=? AND rsi_bin=? AND macd_hist_sign=? AND volz_bin=?""",
                      (payload.symbol, payload.tf, rsi_bin, macd_hist_sign, volz_bin))
            b = c.fetchone()
            if b and b["total"] >= 10:
                wr = (b["wins"] / b["total"]) if b["total"] else 0.0
                if wr < LEARN_THRESHOLD:
                    print(f"[LEARNING SKIP] {payload.symbol} {payload.tf} - Bucket winrate {wr:.2%} < {LEARN_THRESHOLD:.2%}")
                    return {
                        "ok": True, 
                        "skipped_by_learning": True, 
                        "bucket_winrate": wr, 
                        "threshold": LEARN_THRESHOLD
                    }
        
        # Insert alert
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
        new_id = cur.lastrowid
        
        # Position tracking logic
        pos_side = "LONG" if payload.side.upper() in ["BUY", "LONG"] else "SHORT"
        
        c = conn.cursor()
        
        if pos_side == "LONG":
            # Try to close an OPEN SHORT first
            c.execute("""SELECT id, open_price, open_time_ms FROM positions
                         WHERE symbol=? AND timeframe=? AND side='SHORT' AND status='OPEN'
                         ORDER BY id DESC LIMIT 1""", (payload.symbol, payload.tf))
            row = c.fetchone()
            if row:
                pid, o_price, o_time = row
                pnl = (o_price - payload.price) / o_price  # short PnL
                win = 1 if pnl > 0 else 0
                c.execute("""UPDATE positions SET status='CLOSED', close_time_ms=?, close_price=?, pnl=?, win=?
                             WHERE id=?""", (payload.time_ms, payload.price, pnl, win, pid))
                # Update bucket stats
                if rsi_bin is not None and macd_hist_sign is not None and volz_bin is not None:
                    c.execute("""INSERT INTO bucket_stats(symbol,timeframe,rsi_bin,macd_hist_sign,volz_bin,wins,total)
                                 VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,timeframe,rsi_bin,macd_hist_sign,volz_bin)
                                 DO UPDATE SET wins = wins + ?, total = total + 1""",
                              (payload.symbol, payload.tf, rsi_bin, macd_hist_sign, volz_bin, win, 1, win))
                print(f"[CLOSED SHORT] {payload.symbol} {payload.tf} PnL={pnl:.2%} Win={win}")
            
            # Open LONG
            c.execute("""INSERT INTO positions(symbol,timeframe,side,open_time_ms,open_price,status)
                         VALUES(?,?,?,?,?,'OPEN')""", (payload.symbol, payload.tf, "LONG", payload.time_ms, payload.price))
            print(f"[OPENED LONG] {payload.symbol} {payload.tf} @ {payload.price}")
        
        else:  # SHORT/SELL
            # Try to close an OPEN LONG
            c.execute("""SELECT id, open_price, open_time_ms FROM positions
                         WHERE symbol=? AND timeframe=? AND side='LONG' AND status='OPEN'
                         ORDER BY id DESC LIMIT 1""", (payload.symbol, payload.tf))
            row = c.fetchone()
            if row:
                pid, o_price, o_time = row
                pnl = (payload.price - o_price) / o_price  # long PnL
                win = 1 if pnl > 0 else 0
                c.execute("""UPDATE positions SET status='CLOSED', close_time_ms=?, close_price=?, pnl=?, win=?
                             WHERE id=?""", (payload.time_ms, payload.price, pnl, win, pid))
                # Update bucket stats
                if rsi_bin is not None and macd_hist_sign is not None and volz_bin is not None:
                    c.execute("""INSERT INTO bucket_stats(symbol,timeframe,rsi_bin,macd_hist_sign,volz_bin,wins,total)
                                 VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,timeframe,rsi_bin,macd_hist_sign,volz_bin)
                                 DO UPDATE SET wins = wins + ?, total = total + 1""",
                              (payload.symbol, payload.tf, rsi_bin, macd_hist_sign, volz_bin, win, 1, win))
                print(f"[CLOSED LONG] {payload.symbol} {payload.tf} PnL={pnl:.2%} Win={win}")
            
            # Open SHORT
            c.execute("""INSERT INTO positions(symbol,timeframe,side,open_time_ms,open_price,status)
                         VALUES(?,?,?,?,?,'OPEN')""", (payload.symbol, payload.tf, "SHORT", payload.time_ms, payload.price))
            print(f"[OPENED SHORT] {payload.symbol} {payload.tf} @ {payload.price}")
        
        conn.commit()
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

@app.get("/ai-scanner/positions")
def list_positions(
    symbol: Optional[str] = Query(None),
    timeframe: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200)
):
    """List positions (open or closed trades)"""
    conn = get_db()
    try:
        where = []
        params = []
        if symbol:
            where.append("symbol = ?"); params.append(symbol)
        if timeframe:
            where.append("timeframe = ?"); params.append(timeframe)
        if status:
            where.append("status = ?"); params.append(status.upper())

        sql = """
            SELECT id, symbol, timeframe, side, open_time_ms, open_price, 
                   close_time_ms, close_price, pnl, win, status
            FROM positions
        """
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            out.append({k: r[k] for k in r.keys()})
        return out
    finally:
        conn.close()

@app.get("/ai-scanner/metrics")
def metrics(
    symbol: Optional[str] = Query(None), 
    timeframe: Optional[str] = Query(None), 
    min_trades: int = Query(10, ge=1)
):
    """Show learning metrics: overall winrate, last 50, and best-performing buckets"""
    conn = get_db()
    try:
        # Overall stats
        where_clause = ""
        params = []
        if symbol:
            where_clause = " AND symbol=?"
            params.append(symbol)
        if timeframe:
            where_clause += " AND timeframe=?"
            params.append(timeframe)
        
        overall = conn.execute(
            f"""SELECT COUNT(*) as total, SUM(CASE WHEN win=1 THEN 1 ELSE 0 END) as wins,
                       SUM(pnl) as total_pnl
                FROM positions WHERE status='CLOSED'{where_clause}""",
            tuple(params)
        ).fetchone()
        
        total = overall["total"] or 0
        wins = overall["wins"] or 0
        total_pnl = overall["total_pnl"] or 0
        wr_all = (wins / total) if total else None
        
        # Last 50 trades
        last = conn.execute(
            f"""SELECT win, pnl FROM positions WHERE status='CLOSED'{where_clause}
                ORDER BY id DESC LIMIT 50""",
            tuple(params)
        ).fetchall()
        last_wins = sum(r["win"] for r in last) if last else 0
        last_pnl = sum(r["pnl"] for r in last) if last else 0
        wr_last50 = (last_wins / len(last)) if last else None
        
        # Top performing buckets
        bucket_params: list = [min_trades]
        bucket_sql = """
            SELECT symbol, timeframe, rsi_bin, macd_hist_sign, volz_bin, wins, total,
                   (CAST(wins AS REAL)/total) AS winrate
            FROM bucket_stats 
            WHERE total >= ?
        """
        if symbol:
            bucket_sql += " AND symbol=?"
            bucket_params.append(symbol)
        if timeframe:
            bucket_sql += " AND timeframe=?"
            bucket_params.append(timeframe)
        bucket_sql += " ORDER BY winrate DESC, total DESC LIMIT 50"
        
        buckets = [dict(r) for r in conn.execute(bucket_sql, tuple(bucket_params)).fetchall()]
        
        # Open positions
        open_pos = conn.execute(
            f"""SELECT COUNT(*) as count FROM positions WHERE status='OPEN'{where_clause}""",
            tuple(params)
        ).fetchone()
        
        return {
            "overall": {
                "total_trades": total,
                "wins": wins,
                "losses": total - wins,
                "winrate": wr_all,
                "total_pnl": total_pnl
            },
            "last_50": {
                "total": len(last),
                "wins": last_wins,
                "winrate": wr_last50,
                "pnl": last_pnl
            },
            "open_positions": open_pos["count"] or 0,
            "top_buckets": buckets,
            "learning_config": {
                "threshold": LEARN_THRESHOLD,
                "filter_enabled": ENABLE_LEARNING_FILTER,
                "min_trades_for_bucket": min_trades
            }
        }
    finally:
        conn.close()
