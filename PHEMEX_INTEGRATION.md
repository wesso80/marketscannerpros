# Phemex Trading Integration Specification

## Overview

This document outlines the requirements for integrating Phemex exchange trading functionality into MarketScanner Pros. Phemex is a crypto derivatives exchange offering perpetual contracts (COIN-M and USDT-M), spot trading, and margin trading.

---

## 1. Authentication & Security

### API Keys Required
Users must create API keys on Phemex with appropriate permissions:
- **Read Permission** - Required for account data, positions, orders
- **Trade Permission** - Required for placing/canceling orders
- **Withdraw Permission** - NOT recommended for third-party apps

### HMAC-SHA256 Signature
Every authenticated request requires:
```
Headers:
- x-phemex-access-token: <API_KEY>
- x-phemex-request-expiry: <UNIX_EPOCH_SECONDS + 60>
- x-phemex-request-signature: HMacSha256(URL_PATH + QUERY_STRING + EXPIRY + BODY)
```

### Signature Formula
```typescript
const signature = HMacSha256(
  `${urlPath}${queryString}${expiry}${body}`,
  apiSecret
);
```

### Security Considerations
- ⚠️ **Never store API secrets in client-side code**
- ⚠️ **Use server-side proxy for all API calls**
- ⚠️ **Encrypt API credentials at rest**
- ⚠️ **Implement IP whitelisting if possible**

---

## 2. API Endpoints

### Base URLs
| Environment | REST API | WebSocket |
|-------------|----------|-----------|
| Production | `https://api.phemex.com` | `wss://ws.phemex.com` |
| Testnet | `https://testnet-api.phemex.com` | `wss://testnet-api.phemex.com/ws` |
| VIP | `https://vapi.phemex.com` | `wss://vapi.phemex.com/ws` |

### Rate Limits
| Group | Limit | Notes |
|-------|-------|-------|
| Contract Orders | 500/minute | Per user |
| Spot Orders | 500/minute | Per user |
| IP Rate Limit | 5,000/5min | All requests |
| Testnet | 500/5min | Shared across all testnet |

---

## 3. Key Trading Endpoints

### Account & Positions

**Query Account Positions (USDT-M Perpetual)**
```http
GET /g-accounts/accountPositions?currency=USDT
```

**Query Positions with Unrealized PNL**
```http
GET /g-accounts/positions?currency=USDT
```

### Order Management

**Place Order (USDT-M Perpetual) - Preferred**
```http
PUT /g-orders/create?clOrdID=<uuid>&symbol=BTCUSDT&side=Buy&orderQtyRq=0.01&ordType=Limit&priceRp=50000&posSide=Long&timeInForce=GoodTillCancel
```

**Place Order via POST**
```http
POST /g-orders
Content-Type: application/json

{
  "clOrdID": "uuid-123",
  "symbol": "BTCUSDT",
  "side": "Buy",
  "orderQtyRq": "0.01",
  "ordType": "Limit",
  "priceRp": "50000",
  "posSide": "Long",
  "timeInForce": "GoodTillCancel"
}
```

**Cancel Order**
```http
DELETE /g-orders/cancel?symbol=BTCUSDT&orderID=<orderID>
```

**Cancel All Orders**
```http
DELETE /g-orders/all?symbol=BTCUSDT
```

**Query Open Orders**
```http
GET /g-orders/activeList?symbol=BTCUSDT
```

### Leverage & Risk

**Set Leverage**
```http
PUT /g-positions/leverage?symbol=BTCUSDT&leverageRr=10
```

**Set Risk Limit**
```http
PUT /g-positions/riskLimit?symbol=BTCUSDT&riskLimitRv=200000
```

---

## 4. Order Parameters

### Order Types
| ordType | Description |
|---------|-------------|
| `Market` | Market order |
| `Limit` | Limit order |
| `Stop` | Stop market order |
| `StopLimit` | Stop limit order |
| `MarketIfTouched` | MIT order |
| `LimitIfTouched` | LIT order |

### Time in Force
| timeInForce | Description |
|-------------|-------------|
| `GoodTillCancel` | GTC - stays until filled or canceled |
| `ImmediateOrCancel` | IOC - fill immediately or cancel |
| `FillOrKill` | FOK - fill entirely or cancel |
| `PostOnly` | Maker only - no taker fills |

### Position Side (Hedge Mode)
| posSide | Description |
|---------|-------------|
| `Merged` | One-way mode (default) |
| `Long` | Long position in hedge mode |
| `Short` | Short position in hedge mode |

### Trigger Types
| triggerType | Description |
|-------------|-------------|
| `ByMarkPrice` | Trigger by mark price |
| `ByLastPrice` | Trigger by last traded price |
| `ByIndexPrice` | Trigger by index price |

---

## 5. WebSocket Real-Time Data

### Connection
```javascript
const ws = new WebSocket('wss://ws.phemex.com');
```

### Authentication
```javascript
{
  "method": "user.auth",
  "params": ["API", "<api_key>", "<signature>", <expiry>],
  "id": 1
}
```

### Subscribe to Account/Order/Position (AOP)
```javascript
{
  "method": "aop_p.subscribe",
  "params": [],
  "id": 2
}
```

### Subscribe to Order Book
```javascript
{
  "method": "orderbook_p.subscribe",
  "params": ["BTCUSDT"],
  "id": 3
}
```

### Subscribe to Trades
```javascript
{
  "method": "trade_p.subscribe",
  "params": ["BTCUSDT"],
  "id": 4
}
```

### Heartbeat (Required every <30 seconds)
```javascript
{
  "method": "server.ping",
  "params": [],
  "id": 0
}
```

---

## 6. Development Phases

### Phase 1: Read-Only Integration (1-2 weeks)
- [ ] Phemex API key storage (encrypted in database)
- [ ] Account balance display
- [ ] Position display with unrealized P&L
- [ ] Open orders display
- [ ] Trade history display

### Phase 2: Basic Trading (2-3 weeks)
- [ ] Market order execution
- [ ] Limit order execution
- [ ] Order cancellation
- [ ] Position closing
- [ ] Leverage adjustment

### Phase 3: Advanced Features (2-4 weeks)
- [ ] Stop-loss / Take-profit orders
- [ ] Trailing stop orders
- [ ] Bracket orders
- [ ] One-click trading from scanner results
- [ ] Risk calculator integration

### Phase 4: Real-Time (1-2 weeks)
- [ ] WebSocket connection for live positions
- [ ] Real-time P&L updates
- [ ] Order fill notifications
- [ ] Price alerts with auto-order

---

## 7. Integration Architecture

```
┌─────────────────────┐     ┌────────────────────┐     ┌──────────────┐
│  MarketScanner UI   │────▶│  MSP API Server    │────▶│   Phemex     │
│  (React/Next.js)    │     │  (Next.js API)     │     │   API        │
└─────────────────────┘     └────────────────────┘     └──────────────┘
         │                           │
         │                           │
         ▼                           ▼
┌─────────────────────┐     ┌────────────────────┐
│  User Credentials   │     │  Order Queue       │
│  (Encrypted DB)     │     │  (Retry Logic)     │
└─────────────────────┘     └────────────────────┘
```

### Key Components Needed

1. **Credential Manager** (`/lib/phemex/credentials.ts`)
   - Encrypt/decrypt API keys with user's workspace key
   - Secure storage in PostgreSQL
   - Key validation on save

2. **Phemex Client** (`/lib/phemex/client.ts`)
   - HMAC signature generation
   - Request/response handling
   - Rate limit management
   - Error handling with retries

3. **Trading API Routes** (`/app/api/phemex/`)
   - `/account` - Balance, positions, history
   - `/orders` - Place, cancel, query orders
   - `/settings` - Leverage, API key management

4. **Trading UI Components**
   - Order form with quantity calculator
   - Position display with P&L
   - One-click trade from scanner
   - Risk/reward visualizer

---

## 8. Database Schema

```sql
-- Store encrypted Phemex credentials
CREATE TABLE phemex_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  is_testnet BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id)
);

-- Track order history (local copy)
CREATE TABLE phemex_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  phemex_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  quantity DECIMAL,
  price DECIMAL,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  filled_at TIMESTAMP,
  UNIQUE(phemex_order_id)
);
```

---

## 9. Regulatory & Legal Considerations

### ⚠️ CRITICAL WARNINGS

1. **No Investment Advice** - MSP remains an analysis tool, not a financial advisor
2. **User Responsibility** - Users accept full responsibility for their trades
3. **No Custody** - MSP never holds user funds, only facilitates API connections
4. **Jurisdiction** - Phemex is not available in all countries (US, etc.)
5. **Terms Update** - Update Terms of Service to include trading integration disclaimers

### Required Disclaimers (Add to UI)
- "Trading involves substantial risk of loss"
- "Past scanner performance does not guarantee future results"
- "You are responsible for all trades executed through your API connection"
- "MarketScanner Pros is not a registered broker or investment advisor"

### Liability Protection
- Users must acknowledge risks before connecting API
- Clear audit trail of all orders placed via MSP
- No "auto-trading" without explicit user action

---

## 10. CCXT Alternative

Phemex is supported by **CCXT** (official partner), which could simplify integration:

```javascript
const ccxt = require('ccxt');

const phemex = new ccxt.phemex({
  apiKey: 'YOUR_API_KEY',
  secret: 'YOUR_SECRET',
  options: {
    defaultType: 'swap', // perpetual contracts
  }
});

// Fetch balance
const balance = await phemex.fetchBalance();

// Place order
const order = await phemex.createOrder('BTC/USDT:USDT', 'limit', 'buy', 0.01, 50000);
```

**CCXT Benefits:**
- Unified API across 100+ exchanges
- Handles signature generation
- Built-in rate limiting
- Easier to add more exchanges later

---

## 11. Cost Estimate

| Phase | Time | Notes |
|-------|------|-------|
| Phase 1 (Read-Only) | 1-2 weeks | Account display, positions |
| Phase 2 (Basic Trading) | 2-3 weeks | Orders, cancellation |
| Phase 3 (Advanced) | 2-4 weeks | Stop-loss, TP, scanner integration |
| Phase 4 (Real-Time) | 1-2 weeks | WebSocket, notifications |
| **Total** | **6-11 weeks** | Full integration |

---

## 12. Recommended Next Steps

1. **Start with Testnet** - Use `testnet-api.phemex.com` for all development
2. **CCXT vs Direct** - Decide on CCXT (faster) vs direct API (more control)
3. **Phase 1 First** - Begin with read-only to validate architecture
4. **Legal Review** - Have Terms of Service updated before launch
5. **Beta Test** - Roll out to limited users before general availability

---

## Resources

- **Phemex API Docs**: https://phemex-docs.github.io/
- **Phemex GitHub**: https://github.com/phemex/phemex-api-docs
- **CCXT Phemex**: https://docs.ccxt.com/#/exchanges/phemex
- **Node.js Sample**: https://github.com/phemex/phemex-node-example
- **Python Sample**: https://github.com/phemex/phemex-python-api

---

*Document created: December 22, 2025*
*For MarketScanner Pros internal use*
