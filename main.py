from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import os, time

SECRET = os.getenv('SECRET', '')

app = FastAPI(title='AI Scanner API')

@app.get('/ai-scanner/status')
def status():
    feats = ['ema9','ema21','ema50','ema200','rsi14','macd','macd_sig','macd_hist','atr14','vol_z']
    return {'ok': True, 'features': feats, 'ts': int(time.time()*1000)}

class Features(BaseModel):
    ema9: Optional[float] = None
    ema21: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None
    rsi14: Optional[float] = None
    macd: Optional[float] = None
    macd_sig: Optional[float] = Field(None, alias='macd_sig')
    macd_hist: Optional[float] = Field(None, alias='macd_hist')
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

@app.post('/ai-scanner/alert')
async def alert(payload: Alert, request: Request):
    if not SECRET:
        raise HTTPException(500, detail='Server secret not set')
    if payload.secret != SECRET:
        raise HTTPException(401, detail='Invalid secret')

    print(f"[ALERT] {payload.symbol} {payload.tf} {payload.side} @ {payload.price}")
    return {'ok': True, 'received': payload.model_dump(by_alias=True)}
