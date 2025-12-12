# AI Scanner Webhook API

TradingView webhook endpoint for receiving real-time trading signals from custom indicators.

## Endpoints

### 1. Status Check
**GET** `/api/ai-scanner/status`

Returns webhook configuration and available features.

```bash
curl https://marketscannerpros.app/api/ai-scanner/status
```

Response:
```json
{
  "ok": true,
  "features": ["ema9", "ema21", "ema50", "ema200", "rsi14", "macd", "macd_sig", "macd_hist", "atr14", "vol_z"],
  "ts": 1234567890,
  "endpoint": "/api/ai-scanner/alert"
}
```

### 2. Alert Webhook
**POST** `/api/ai-scanner/alert`

Receives TradingView webhook alerts with technical indicators.

**Headers:**
```
Content-Type: application/json
```

**Payload:**
```json
{
  "secret": "your-secret-key",
  "symbol": "BTC-USD",
  "tf": "1h",
  "time_ms": 1234567890000,
  "price": 42000.50,
  "side": "LONG",
  "features": {
    "ema9": 41950,
    "ema21": 41800,
    "ema50": 41500,
    "ema200": 40000,
    "rsi14": 65.5,
    "macd": 150,
    "macd_sig": 120,
    "macd_hist": 30,
    "atr14": 500,
    "vol_z": 1.5
  }
}
```

### 3. Test Endpoint
**POST** `/api/ai-scanner/test`

Send a test alert to verify webhook is working.

```bash
curl -X POST https://marketscannerpros.app/api/ai-scanner/test
```

## TradingView Setup

### Step 1: Create Alert in TradingView

1. Open your chart with the AI Scanner indicator
2. Click the **Alert** button (clock icon)
3. Set your alert conditions
4. In the **Webhook URL** field, enter:
   ```
   https://marketscannerpros.app/api/ai-scanner/alert
   ```

### Step 2: Configure Alert Message

In the **Message** field, use this JSON format:

```json
{
  "secret": "{{secret}}",
  "symbol": "{{ticker}}",
  "tf": "{{interval}}",
  "time_ms": {{time}},
  "price": {{close}},
  "side": "LONG",
  "features": {
    "ema9": {{plot_0}},
    "ema21": {{plot_1}},
    "ema50": {{plot_2}},
    "ema200": {{plot_3}},
    "rsi14": {{plot_4}},
    "macd": {{plot_5}},
    "macd_sig": {{plot_6}},
    "macd_hist": {{plot_7}},
    "atr14": {{plot_8}},
    "vol_z": {{plot_9}}
  }
}
```

**Important:** Replace `{{secret}}` with your actual SECRET value from Replit Secrets.

### Step 3: Pine Script Integration

Your Pine Script indicator should output the features as plot values:

```pine
//@version=5
indicator("AI Scanner", overlay=true)

// Calculate indicators
ema9 = ta.ema(close, 9)
ema21 = ta.ema(close, 21)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
rsi14 = ta.rsi(close, 14)
[macd, signal, hist] = ta.macd(close, 12, 26, 9)
atr14 = ta.atr(14)
vol_z = (volume - ta.sma(volume, 20)) / ta.stdev(volume, 20)

// Plot for webhook access
plot(ema9, "EMA9", display=display.none)
plot(ema21, "EMA21", display=display.none)
plot(ema50, "EMA50", display=display.none)
plot(ema200, "EMA200", display=display.none)
plot(rsi14, "RSI14", display=display.none)
plot(macd, "MACD", display=display.none)
plot(signal, "MACD_SIG", display=display.none)
plot(hist, "MACD_HIST", display=display.none)
plot(atr14, "ATR14", display=display.none)
plot(vol_z, "VOL_Z", display=display.none)

// Alert conditions
longCondition = ta.crossover(ema9, ema21) and rsi14 < 70
shortCondition = ta.crossunder(ema9, ema21) and rsi14 > 30

alertcondition(longCondition, title="Long Signal", message='{"side":"LONG"}')
alertcondition(shortCondition, title="Short Signal", message='{"side":"SHORT"}')
```

## Security

- The webhook verifies the `secret` field in every request
- Unauthorized requests return 401 status
- Only configure the SECRET in Replit Secrets (never hardcode it)
- TradingView encrypts webhook traffic with HTTPS

## Next Steps

Once alerts are received, you can:
1. Store them in PostgreSQL database
2. Send email notifications via Resend
3. Display real-time signals in the Streamlit app
4. Build a trade automation system
5. Create a mobile push notification system

## Environment Variables

Required in Replit Secrets:
- `SECRET` - Webhook authentication secret (configured ✅)

Optional:
- `TRADINGVIEW_WEBHOOK_SECRET` - Alternative to SECRET for webhook-specific auth
