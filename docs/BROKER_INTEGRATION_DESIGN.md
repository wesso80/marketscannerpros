# Broker Integration & Trade Ticket — Design Document

**Date:** March 18, 2026
**Status:** DESIGN ONLY — Not yet implemented
**Author:** MSP Engineering
**Compliance Model:** Educational & informational platform — NOT a financial advisor or broker

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 1 — Read-Only Broker Sync](#2-phase-1--read-only-broker-sync)
3. [Phase 2 — Trade Ticket System](#3-phase-2--trade-ticket-system)
4. [Phase 3 — User-Confirmed Execution](#4-phase-3--user-confirmed-execution)
5. [Supported Brokers](#5-supported-brokers)
6. [Data Model & Database Schema](#6-data-model--database-schema)
7. [API Routes](#7-api-routes)
8. [Trade Ticket UI Specification](#8-trade-ticket-ui-specification)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Validation & Guardrails](#10-validation--guardrails)
11. [Risk Calculations](#11-risk-calculations)
12. [Integration Points](#12-integration-points)
13. [Execution Safeguards](#13-execution-safeguards)
14. [Compliance & Legal](#14-compliance--legal)
15. [Security Architecture](#15-security-architecture)
16. [Limitations & Constraints](#16-limitations--constraints)
17. [Implementation Roadmap](#17-implementation-roadmap)

---

## 1. Architecture Overview

### Design Principles

1. **User-initiated everything** — No action happens without explicit user click
2. **Read-first, write-later** — Phase 1 is read-only; execution comes last
3. **Compliance-safe language** — "Research case", "trade plan", "scenario" — never "recommendation" or "advice"
4. **Existing infrastructure leverage** — Builds on the execution engine pipeline already in place (`lib/execution/`)
5. **Tenant isolation** — All broker credentials and data scoped to `workspace_id`

### System Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                     MSP Platform                        │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐   │
│  │ Scanner  │   │ Golden   │   │ AI Analyst        │   │
│  │ Engine   │──▶│ Egg      │──▶│ (Research Case)   │   │
│  └──────────┘   └──────────┘   └──────────────────┘   │
│       │              │                   │              │
│       ▼              ▼                   ▼              │
│  ┌─────────────────────────────────────────────────┐   │
│  │          TRADE TICKET (Phase 2)                 │   │
│  │  Research Case + Trade Plan + Sizing + Guards   │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                                │
│                        ▼ User clicks "Submit Order"     │
│  ┌─────────────────────────────────────────────────┐   │
│  │     EXECUTION LAYER (Phase 3)                   │   │
│  │  Confirmation → Log → Broker API                │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                                │
│  ═══════════════════════════════════════════════════   │
│              MSP ↔ Broker Boundary                     │
│  ═══════════════════════════════════════════════════   │
│                        │                                │
│  ┌─────────────────────▼───────────────────────────┐   │
│  │     BROKER ADAPTER LAYER                        │   │
│  │  IBKR │ Alpaca │ Binance │ ...                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐   │
│  │Portfolio │◀──│ Journal  │◀──│ Performance      │   │
│  │ Sync     │   │ Auto-Log │   │ Analytics        │   │
│  └──────────┘   └──────────┘   └──────────────────┘   │
│                                                         │
│  ◀── Phase 1: Read-Only Sync (positions, balances,     │
│       orders, fills auto-linked to Portfolio/Journal)   │
└─────────────────────────────────────────────────────────┘
```

### Existing Anchor Points (already built)

| Component | File | What exists |
|-----------|------|-------------|
| Execution types | `lib/execution/types.ts` | `TradeIntent`, `TradeProposal`, `OrderInstruction` with `broker_order_id`, `proposal_id` |
| Order builder | `lib/execution/orderBuilder.ts` | Builds bracket orders, multi-leg options |
| Execute route | `app/api/execute-trade/route.ts` | Full pipeline: governor → sizing → journal write → **broker stub** (line ~147: `SIM-{id}`) |
| Trade proposal | `app/api/trade-proposal/route.ts` | Intent → validated proposal with sizing, exits, governor check |
| Journal schema | `journal_entries` table | Already has `execution_mode` (DRY_RUN/PAPER/LIVE), `broker_order_id`, `proposal_id` columns |
| Risk governor | `lib/execution/riskGovernor.ts` | Portfolio heat caps, correlation checks, drawdown lockout |
| Trade exit engine | `lib/tradeExitEngine.ts` | Stop/target monitoring, trailing stops |

**The execution pipeline is 80% built. The broker stub at line ~147 of execute-trade/route.ts is the exact insertion point for real broker connectors.**

---

## 2. Phase 1 — Read-Only Broker Sync

### Goal
Connect to supported brokers and sync account state into MSP for display in Portfolio, Journal, and Performance analytics. **No order submission. No write operations to broker.**

### Data Synced

| Data Type | Source | MSP Destination | Sync Frequency |
|-----------|--------|-----------------|----------------|
| **Positions** | Broker account | `portfolio_positions` table | Every 60s (polling) or on page load |
| **Balances** | Broker account | `broker_accounts` table (new) | Every 60s |
| **Open Orders** | Broker order book | `broker_orders` table (new) | Every 30s |
| **Fills / Executions** | Broker trade history | `journal_entries` (auto-create) | Every 5 min + on-demand |
| **Account Equity** | Broker account | Risk governor `equity_at_entry` | Every 60s |

### Broker Connection Flow

```
User Settings → "Connect Broker" → OAuth / API Key entry
                                          │
                                          ▼
                                  Encrypt credentials
                                  (AES-256-GCM, per-workspace key)
                                          │
                                          ▼
                                  Store in `broker_connections` table
                                  (workspace_id scoped)
                                          │
                                          ▼
                                  Test connection (read-only call)
                                          │
                                          ▼
                                  Set status = CONNECTED | FAILED
```

### Auto-Link Logic

**Positions → Portfolio:**
- On sync, map broker positions to `portfolio_positions` rows
- Match by `symbol` + `side` + `workspace_id`
- New broker positions get inserted; closed positions get moved to `portfolio_closed`
- Broker-synced positions flagged with `source = 'broker'` (vs. `source = 'manual'` for existing entries)

**Fills → Journal:**
- Each broker fill creates a `journal_entries` row if no matching `broker_order_id` exists
- Auto-populated: symbol, side, quantity, entry_price, timestamp, execution_mode='LIVE', broker_order_id
- User can later add: thesis, emotions, lessons, tags (journal enrichment)
- Duplicate prevention: unique constraint on `(workspace_id, broker_order_id)`

**Balances → Performance:**
- Account equity snapshots written to `portfolio_performance` table
- Enables accurate equity curve even for trades executed outside MSP
- Daily P&L computed from equity delta

### Sync Architecture

```
┌───────────────────┐
│  Broker Adapter    │  (one per broker: IBKR, Alpaca, etc.)
│  Interface:        │
│   getPositions()   │
│   getBalances()    │
│   getOrders()      │
│   getFills(since)  │
│   testConnection() │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Broker Sync      │  lib/broker/sync.ts
│  Service          │
│   - Polls on      │
│     interval      │
│   - Deduplicates  │
│   - Maps to MSP   │
│     data model    │
│   - Writes to DB  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  MSP Tables       │
│  portfolio_*      │
│  journal_entries  │
│  broker_*         │
└───────────────────┘
```

### What the User Sees (Phase 1)

- **Account Settings → Brokers tab:** Connect/disconnect brokers, see connection status, last sync time
- **Portfolio page:** Broker-synced positions appear alongside manually entered ones, with a "Broker" badge
- **Journal page:** Broker fills auto-populate as journal entries (editable by user)
- **Performance page:** Equity curve reflects real broker account value
- **Dashboard:** Account balance widget showing broker equity

---

## 3. Phase 2 — Trade Ticket System

### Goal
Create a Trade Ticket UI that serves as a **decision-to-execution bridge** — not just an order form. It displays the full research case, trade plan, validation, and guardrails before any order is placed.

### Trade Ticket Trigger Points

The Trade Ticket can be opened from multiple MSP tools via prefill:

| Source | Prefill Data | Trigger |
|--------|-------------|---------|
| **Scanner** (V2/Pro) | symbol, direction, score, entry, stop, target, setup type | "Trade Ticket" button in scan result row |
| **Golden Egg** | symbol, direction, entry zone, stop, targets[], R:R, permission, confidence, thesis | "Open Trade Ticket" button in GE results |
| **AI Analyst** | symbol, direction, thesis text | "Create Trade Plan" button in chat |
| **Market Movers** | symbol, direction, change% | "Trade Ticket" button in mover row |
| **Alerts** | symbol, alert condition that triggered | "Trade" button in alert notification |
| **Intraday Chart** | symbol, last price | "Trade" button in chart toolbar |
| **Manual** | Empty (user fills everything) | "New Trade Ticket" from nav/toolbar |

### Prefill Data Contract

```typescript
interface TradeTicketPrefill {
  // Source identification
  source: 'scanner' | 'golden_egg' | 'ai_analyst' | 'movers' | 'alert' | 'chart' | 'manual';
  source_id?: string;              // scan ID, GE analysis ID, alert ID, etc.

  // Core trade parameters
  symbol: string;
  asset_class?: 'equity' | 'crypto' | 'forex' | 'options';
  direction?: 'LONG' | 'SHORT';

  // Research context (from GE / scanner)
  setup_type?: string;             // e.g. "Breakout", "Mean Reversion", "Liquidity Sweep"
  score?: number;                  // 0-100 confluence score
  confidence?: number;             // 0-100
  edge_match?: string;             // e.g. "85% match to profitable historical setups"
  thesis?: string;                 // AI-generated or GE research case text
  permission?: 'TRADE' | 'WATCH' | 'NO_TRADE';

  // Trade plan
  entry_price?: number;
  stop_loss?: number;
  target_1?: number;
  target_2?: number;
  target_3?: number;

  // Context
  regime?: string;                 // Macro regime state
  confluence_count?: number;       // How many factors aligned
  volatility_state?: string;       // DVE state
  mpe_composite?: number;          // Market Pressure Engine score

  // Alignment breakdown (from GE/scanner layers)
  alignment?: {
    time?: number;                 // Time confluence score
    volatility?: number;           // DVE/BBWP score
    liquidity?: number;            // Liquidity/flow score
    options?: number;              // Options confluence score
    technical?: number;            // Technical alignment
    macro?: number;                // Macro alignment
  };

  // Invalidation conditions (from GE flip conditions)
  invalidation_conditions?: string[];
}
```

---

## 4. Phase 3 — User-Confirmed Execution

### Goal
Enable order submission to connected brokers, but only after explicit user confirmation with full audit logging.

### Execution Flow

```
Trade Ticket (filled) 
    │
    ▼
User reviews all sections
    │
    ▼
User checks compliance checkbox ☐
  "I understand this is for educational purposes only.
   I am responsible for all trading decisions."
    │
    ▼
User clicks "Submit Order" button
    │
    ▼
Confirmation modal appears:
  ┌─────────────────────────────────────────┐
  │  Confirm Order Submission               │
  │                                         │
  │  BUY 100 AAPL @ LIMIT $185.50         │
  │  Stop: $182.00 | Target: $192.00       │
  │  Risk: $350.00 (0.7% of account)       │
  │                                         │
  │  Broker: Interactive Brokers            │
  │                                         │
  │  ⚠ This will submit a LIVE order.      │
  │  MSP does not provide financial advice. │
  │                                         │
  │  [Cancel]            [Confirm & Send]   │
  └─────────────────────────────────────────┘
    │
    ▼ (User clicks "Confirm & Send")
    │
    ▼
POST /api/execute-trade
  → Log: trade plan + user confirmation timestamp
  → Risk governor re-check (prices may have moved)
  → Write journal_entries (execution_mode='LIVE')
  → Send to broker adapter
  → Return broker_order_id
  → Update journal entry with broker_order_id
    │
    ▼
Success: "Order submitted to IBKR — ID: 12345"
  → Auto-navigate to Portfolio (position now tracked)
  → Journal entry created with full audit trail
```

### Audit Log Record

Every order submission creates an immutable record:

```typescript
interface OrderAuditLog {
  id: string;                      // UUID
  workspace_id: string;            // Tenant isolation
  proposal_id: string;             // Links to trade proposal
  journal_entry_id: string;        // Links to journal
  broker_connection_id: string;    // Which broker
  broker_order_id: string;         // Broker's order ID

  // What was submitted
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
  quantity: number;
  limit_price?: number;
  stop_price?: number;
  bracket_stop?: number;
  bracket_tp1?: number;

  // Source context
  source: string;                  // 'scanner', 'golden_egg', etc.
  prefill_data: object;            // Snapshot of what was prefilled
  user_edits: object;              // What the user changed

  // Confirmation
  disclaimer_accepted: boolean;
  user_confirmed_at: string;       // ISO timestamp
  submitted_at: string;            // ISO timestamp
  execution_mode: 'PAPER' | 'LIVE';

  // Result
  status: 'PENDING' | 'FILLED' | 'PARTIAL' | 'REJECTED' | 'CANCELLED';
  broker_response?: object;
  error_message?: string;
}
```

---

## 5. Supported Brokers

### Phase 1 Priority: Interactive Brokers (IBKR)

| Broker | Protocol | Auth | Asset Classes | Priority |
|--------|----------|------|--------------|----------|
| **Interactive Brokers** | Client Portal API (REST) | OAuth 2.0 | Stocks, Options, Futures, Forex | **Phase 1** |
| **Alpaca** | REST + WebSocket | API Key/Secret | Stocks, Crypto | Phase 2 |
| **Binance** | REST + WebSocket | API Key/Secret + HMAC | Crypto Spot, Futures | Phase 2 |
| **Bybit** | REST + WebSocket | API Key/Secret + HMAC | Crypto Derivatives | Phase 3 |
| **Tradier** | REST | OAuth 2.0 | Stocks, Options | Phase 3 |

### IBKR Integration Details

**API:** Client Portal API (cpapi) — REST-based, no TWS desktop required
- Base URL: `https://localhost:5000/v1/api` (Client Portal Gateway)
- Or: IBKR Web API (newer, cloud-hosted)

**Endpoints needed (Phase 1 read-only):**
| Endpoint | Data | MSP Use |
|----------|------|---------|
| `GET /portfolio/{accountId}/positions` | Open positions | Portfolio sync |
| `GET /portfolio/accounts` | Account list + balances | Balance display |
| `GET /iserver/account/orders` | Open orders | Order book display |
| `GET /portfolio/{accountId}/ledger` | Account equity, cash | Performance tracking |
| `GET /iserver/account/trades` | Recent fills | Journal auto-populate |

**Endpoints needed (Phase 3 execution):**
| Endpoint | Data | MSP Use |
|----------|------|---------|
| `POST /iserver/account/{accountId}/orders` | Place order | Trade submission |
| `DELETE /iserver/account/{accountId}/order/{orderId}` | Cancel order | Order management |
| `PUT /iserver/account/{accountId}/order/{orderId}` | Modify order | Order management |
| `POST /iserver/reply/{replyId}` | Confirm warning prompts | IBKR requires confirmation for certain orders |

### Broker Adapter Interface

```typescript
interface BrokerAdapter {
  readonly name: string;           // 'ibkr', 'alpaca', 'binance'
  readonly displayName: string;    // 'Interactive Brokers'
  readonly supportedAssets: AssetClass[];

  // Connection
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  
  // Phase 1 — Read-Only
  getPositions(): Promise<BrokerPosition[]>;
  getBalances(): Promise<BrokerBalance>;
  getOpenOrders(): Promise<BrokerOrder[]>;
  getFills(since: Date): Promise<BrokerFill[]>;

  // Phase 3 — Execution
  submitOrder(order: OrderInstruction): Promise<BrokerOrderResult>;
  cancelOrder(orderId: string): Promise<{ ok: boolean }>;
  modifyOrder(orderId: string, changes: Partial<OrderInstruction>): Promise<BrokerOrderResult>;
  getOrderStatus(orderId: string): Promise<BrokerOrderStatus>;
}
```

### Normalized Data Types

```typescript
interface BrokerPosition {
  symbol: string;
  asset_class: 'equity' | 'crypto' | 'forex' | 'options' | 'futures';
  side: 'LONG' | 'SHORT';
  quantity: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  market_value: number;
  // Options-specific
  option_type?: 'CALL' | 'PUT';
  strike?: number;
  expiration?: string;
}

interface BrokerBalance {
  total_equity: number;
  cash: number;
  buying_power: number;
  margin_used: number;
  unrealized_pnl: number;
  realized_pnl_today: number;
  currency: string;
}

interface BrokerFill {
  broker_order_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  fill_price: number;
  commission: number;
  filled_at: string;              // ISO timestamp
  order_type: string;
  asset_class: string;
}

interface BrokerOrder {
  broker_order_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  quantity: number;
  filled_quantity: number;
  limit_price?: number;
  stop_price?: number;
  status: 'PENDING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  created_at: string;
  updated_at: string;
}
```

---

## 6. Data Model & Database Schema

### New Tables

```sql
-- Broker connections (encrypted credentials)
CREATE TABLE broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  broker_name TEXT NOT NULL,           -- 'ibkr', 'alpaca', 'binance'
  display_name TEXT NOT NULL,          -- 'Interactive Brokers'
  status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
  
  -- Encrypted credentials (AES-256-GCM)
  credentials_encrypted BYTEA,
  credentials_iv BYTEA,
  credentials_tag BYTEA,
  
  -- Account metadata
  account_id TEXT,                     -- Broker's account identifier
  account_type TEXT,                   -- 'margin', 'cash', 'practice'
  
  -- Sync state
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,               -- 'success', 'error'
  last_sync_error TEXT,
  sync_enabled BOOLEAN DEFAULT true,
  
  -- Permissions
  read_enabled BOOLEAN DEFAULT true,
  write_enabled BOOLEAN DEFAULT false, -- Phase 3 only
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, broker_name)
);

-- Broker account snapshots (equity, balances)
CREATE TABLE broker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  connection_id UUID NOT NULL REFERENCES broker_connections(id),
  
  total_equity NUMERIC(14,2),
  cash NUMERIC(14,2),
  buying_power NUMERIC(14,2),
  margin_used NUMERIC(14,2),
  unrealized_pnl NUMERIC(14,2),
  realized_pnl_today NUMERIC(14,2),
  currency TEXT DEFAULT 'USD',
  
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_broker_accounts_ws ON broker_accounts(workspace_id, snapshot_at DESC);

-- Broker orders (synced from broker)
CREATE TABLE broker_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  connection_id UUID NOT NULL REFERENCES broker_connections(id),
  broker_order_id TEXT NOT NULL,
  
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,                  -- 'BUY', 'SELL'
  order_type TEXT NOT NULL,            -- 'MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'
  quantity NUMERIC(14,6),
  filled_quantity NUMERIC(14,6) DEFAULT 0,
  limit_price NUMERIC(14,6),
  stop_price NUMERIC(14,6),
  status TEXT NOT NULL,                -- 'PENDING', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'
  
  -- MSP linkage
  proposal_id UUID,                    -- Links to trade proposal
  journal_entry_id UUID,               -- Links to journal
  
  broker_created_at TIMESTAMPTZ,
  broker_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, broker_order_id)
);
CREATE INDEX idx_broker_orders_ws ON broker_orders(workspace_id, status);

-- Order audit log (immutable record of every submission)
CREATE TABLE order_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  proposal_id UUID,
  journal_entry_id UUID,
  connection_id UUID REFERENCES broker_connections(id),
  broker_order_id TEXT,
  
  -- Order details
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  quantity NUMERIC(14,6),
  limit_price NUMERIC(14,6),
  stop_price NUMERIC(14,6),
  bracket_stop NUMERIC(14,6),
  bracket_tp1 NUMERIC(14,6),
  
  -- Source & prefill
  source TEXT NOT NULL,                -- 'scanner', 'golden_egg', 'manual', etc.
  prefill_snapshot JSONB,              -- Full prefill data at time of ticket open
  user_edits JSONB,                    -- What the user changed from prefill
  
  -- Confirmation
  disclaimer_accepted BOOLEAN NOT NULL DEFAULT false,
  user_confirmed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  execution_mode TEXT NOT NULL,        -- 'PAPER', 'LIVE'
  
  -- Result
  status TEXT NOT NULL DEFAULT 'PENDING',
  broker_response JSONB,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_order_audit_ws ON order_audit_log(workspace_id, created_at DESC);
```

### Existing Table Modifications

```sql
-- portfolio_positions: add broker source tracking
ALTER TABLE portfolio_positions 
  ADD COLUMN source TEXT DEFAULT 'manual',           -- 'manual' | 'broker'
  ADD COLUMN broker_connection_id UUID,
  ADD COLUMN broker_position_id TEXT,
  ADD COLUMN last_broker_sync_at TIMESTAMPTZ;

-- journal_entries: already has broker_order_id and proposal_id (no changes needed)
-- Existing columns used:
--   broker_order_id  TEXT     ← Phase 1 fills auto-link
--   proposal_id      UUID    ← Phase 2/3 trade ticket link
--   execution_mode   TEXT    ← 'DRY_RUN', 'PAPER', 'LIVE'
```

---

## 7. API Routes

### New Routes

```
Phase 1 — Broker Connection & Sync
──────────────────────────────────
POST   /api/broker/connect          Connect a broker (store encrypted credentials)
DELETE /api/broker/disconnect        Disconnect a broker
GET    /api/broker/status            Get connection status for all brokers
POST   /api/broker/sync              Trigger manual sync
GET    /api/broker/positions         Get synced positions
GET    /api/broker/balances          Get synced balances
GET    /api/broker/orders            Get synced open orders
GET    /api/broker/fills             Get synced fills (with date range)

Phase 2 — Trade Ticket
──────────────────────
POST   /api/trade-ticket/prefill    Generate prefill data from source
                                    (calls existing /api/trade-proposal internally)

Phase 3 — Execution (extends existing route)
────────────────────────────────────────────
POST   /api/execute-trade            Already exists — add real broker adapter call
GET    /api/broker/order/:id         Get order status from broker
DELETE /api/broker/order/:id         Cancel order at broker
```

### Route Authentication Pattern

Every route follows the existing MSP auth pattern:

```typescript
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Tier gate: broker features are Pro Trader only
  if (session.tier !== 'pro_trader') {
    return NextResponse.json({ error: 'Pro Trader required' }, { status: 403 });
  }
  
  // All queries scoped to workspace_id
  const data = await q('SELECT ... WHERE workspace_id = $1', [session.workspaceId]);
}
```

---

## 8. Trade Ticket UI Specification

### Layout: Full-Page Panel (9 sections, top to bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  ① HEADER                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ AAPL ────── LONG ────── Breakout ────── Score: 82      ││
│  │ Confidence: 76%        Edge Match: 89%                  ││
│  │ Source: Golden Egg     Permission: TRADE                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ② RESEARCH CASE                                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Trade Thesis:                                           ││
│  │ "AAPL showing bullish structure with EMA200 reclaim,    ││
│  │  MACD crossover, and volume expansion above PDH..."     ││
│  │                                                          ││
│  │ Alignment Breakdown:                                     ││
│  │ ████████░░ Time: 78%    ██████████ Volatility: 95%     ││
│  │ ██████░░░░ Liquidity: 62%  ████████░░ Options: 81%     ││
│  │ █████████░ Technical: 88%  ████████░░ Macro: 79%       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ③ MARKET PRESSURE                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ MPE Composite: 72 ── BUY PRESSURE                      ││
│  │ Time: ██████░░ 68   Vol: ████████░ 82                  ││
│  │ Liq:  █████░░░ 58   Opt: ████████░ 79                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ④ TRADE PLAN                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Entry:  [$185.50]  ◄── editable                        ││
│  │ Stop:   [$182.00]  ◄── editable                        ││
│  │ T1:     [$189.00]  ◄── editable   R:R  1 : 1.0        ││
│  │ T2:     [$193.50]  ◄── editable   R:R  1 : 2.3        ││
│  │ T3:     [$198.00]  ◄── editable   R:R  1 : 3.6        ││
│  │                                                          ││
│  │ Risk per share: $3.50 | ATR(14): $4.12                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ⑤ POSITION SIZING                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Account Size:  [$50,000]  ◄── editable (or from broker)││
│  │ Risk %:        [1.0%]     ◄── editable                 ││
│  │ Max Risk $:    $500.00                                  ││
│  │ Position Size: 142 shares ($26,321)                     ││
│  │ Kelly Optimal: 187 shares (use half-Kelly: 93)          ││
│  │ Portfolio Heat: 3.2% → 4.2% after this trade            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ⑥ VALIDATION / GUARDRAILS                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ✅ Macro regime: RISK_ON (safe to trade)                ││
│  │ ✅ Confluence: 7/10 factors aligned (above 5 minimum)   ││
│  │ ✅ Volatility: EXPANSION (favorable for breakout)       ││
│  │ ✅ R:R meets minimum (1:2.3 > 1:1.5 threshold)         ││
│  │ ✅ Risk governor: CLEAR (portfolio heat 4.2% < 10% cap) ││
│  │ ⚠️ Warning: Earnings in 3 days — consider reduced size  ││
│  │ ⚠️ Warning: Position correlated with MSFT (0.87)        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ⑦ INVALIDATION CONDITIONS                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ This scenario is invalidated if:                        ││
│  │ • Price closes below EMA200 ($181.20)                   ││
│  │ • RSI drops below 40 (currently 62)                     ││
│  │ • VIX spikes above 25 (currently 18.3)                  ││
│  │ • Volume dries up below 20-day avg (currently 1.3x)     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ⑧ EXECUTION PANEL                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Order Type: [LIMIT ▼]   Time in Force: [DAY ▼]         ││
│  │ Quantity:   [142]       Limit Price:   [$185.50]        ││
│  │                                                          ││
│  │ Bracket:  ☑ Attach stop ($182.00) + target ($193.50)    ││
│  │ Mode:     ○ Paper  ● Live                               ││
│  │ Broker:   [Interactive Brokers ▼]                       ││
│  │                                                          ││
│  │ ┌─────────────────────────────────────────────────────┐ ││
│  │ │ ☐ I understand this is for informational and       │ ││
│  │ │   educational purposes only. I am responsible      │ ││
│  │ │   for all trading decisions.                       │ ││
│  │ └─────────────────────────────────────────────────────┘ ││
│  │                                                          ││
│  │         [Save as Plan]     [Submit Order]               ││
│  │                            (disabled until ☑ checked)   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ⑨ COMPLIANCE FOOTER                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ⚠ MarketScanner Pros is an educational and             ││
│  │   informational platform. We are not a licensed         ││
│  │   financial advisor or broker. All research cases,      ││
│  │   trade plans, and scenarios are for educational        ││
│  │   purposes only. Past performance does not guarantee    ││
│  │   future results. You are solely responsible for your   ││
│  │   trading decisions.                                    ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### UI Behavior Rules

| Rule | Behavior |
|------|----------|
| All values editable | Prefill is a suggestion — user can change everything |
| No default execution | "Submit Order" button is disabled until disclaimer checkbox is checked |
| No "recommended trade" | Language says "Research Case" and "Trade Plan", never "Recommendation" |
| R:R auto-recalculates | When user edits entry/stop/targets, R:R updates in real-time |
| Position size auto-recalculates | When user edits account size, risk %, or stop distance |
| Guardrails are advisory | Warnings don't block submission — they inform the user |
| Risk governor CAN block | If portfolio heat exceeds hard cap, Submit is disabled with explanation |
| Save as Plan | Saves trade plan to journal as DRY_RUN without submitting order |
| Paper/Live toggle | Paper mode writes to journal only; Live sends to broker |

### Component Structure

```
components/
  TradeTicket/
    TradeTicket.tsx              ← Main container/page
    TradeTicketHeader.tsx        ← Section ①
    ResearchCase.tsx             ← Section ②
    MarketPressure.tsx           ← Section ③
    TradePlan.tsx                ← Section ④
    PositionSizing.tsx           ← Section ⑤
    ValidationGuardrails.tsx     ← Section ⑥
    InvalidationConditions.tsx   ← Section ⑦
    ExecutionPanel.tsx           ← Section ⑧
    ComplianceFooter.tsx         ← Section ⑨
    ConfirmOrderModal.tsx        ← Confirmation dialog
    useTradeTicket.ts            ← State management hook
```

---

## 9. Data Flow Diagrams

### Scanner → Trade Ticket → Broker → Portfolio/Journal

```
ENTRY POINTS                    TRADE TICKET                    EXECUTION
─────────────                   ────────────                    ─────────

Scanner ──┐                  ┌──────────────────┐
           │                 │                    │
Golden  ──┤  TradeTicket    │  1. Prefill data   │   POST /api/execute-trade
Egg       ├──Prefill────────│  2. User edits     │──────────┐
           │                 │  3. Validation     │          │
AI      ──┤                 │  4. Confirmation ☑ │          ▼
Analyst   │                 │  5. Submit         │   ┌──────────────┐
           │                 └──────────────────┘   │ Risk Governor │
Movers  ──┤                                         │ Re-check      │
           │                                         └──────┬───────┘
Alert   ──┤                                                │
           │                                                ▼
Chart   ──┤                                         ┌──────────────┐
           │                                         │ Journal Write │
Manual  ──┘                                         │ (audit trail) │
                                                     └──────┬───────┘
                                                            │
                                                            ▼
                                                     ┌──────────────┐
                                                     │ Broker       │
                                                     │ Adapter      │
                                                     │ submitOrder()│
                                                     └──────┬───────┘
                                                            │
                                                            ▼
                                                     ┌──────────────┐
                                                     │ Audit Log    │
                                                     │ (immutable)  │
                                                     └──────┬───────┘
                                                            │
                                              ┌─────────────┼─────────────┐
                                              ▼             ▼             ▼
                                        ┌──────────┐ ┌──────────┐ ┌──────────┐
                                        │Portfolio │ │ Journal  │ │ Perf     │
                                        │ Position │ │ Entry    │ │Analytics │
                                        │ Created  │ │ Created  │ │ Updated  │
                                        └──────────┘ └──────────┘ └──────────┘
```

### Phase 1 — Read-Only Sync Flow

```
Broker API                    MSP Sync Layer                MSP UI
──────────                    ──────────────                ──────

IBKR /positions ──────────▶  broker_sync.ts ──────────▶  Portfolio Page
                              │ Map to MSP schema          (broker-synced
                              │ Deduplicate                 positions with
                              │ Write to DB                 badge)
                              
IBKR /trades ─────────────▶  broker_sync.ts ──────────▶  Journal Page
                              │ Create journal entry        (auto-populated
                              │ if new fill                 entries, editable)
                              │ Match broker_order_id
                              
IBKR /ledger ─────────────▶  broker_sync.ts ──────────▶  Performance Page
                              │ Snapshot equity             (real equity curve,
                              │ Compute daily P&L           accurate metrics)
                              
IBKR /orders ─────────────▶  broker_sync.ts ──────────▶  Trade Ticket
                              │ Show open orders            (order status
                              │ Update statuses             panel)

Polling: Every 60s for positions/balances
         Every 30s for orders
         Every  5m for fills
         On-demand: user triggers manual sync
```

---

## 10. Validation & Guardrails

### Pre-Submission Checks

| Check | Source | Severity | Behavior |
|-------|--------|----------|----------|
| Macro regime = RISK_OFF | Macro dashboard API | Warning | Show warning, allow override |
| Confluence < 5 factors | Scanner/GE | Warning | Show warning, allow override |
| R:R < 1:1.5 | Trade plan calculation | Warning | Show warning, allow override |
| Portfolio heat > 10% cap | Risk governor | **Block** | Disable Submit, explain why |
| Risk governor = LOCKED | Risk governor | **Block** | Disable Submit, explain why |
| Drawdown lockout active | Risk governor | **Block** | Disable Submit, explain why |
| Position > 5% of account | Position sizing | Warning | Show warning, allow override |
| Correlated position exists | Portfolio correlation | Warning | Show correlation coefficient |
| Earnings within 3 days | Calendar check | Warning | Suggest reduced size |
| VIX > 30 | Market data | Warning | "Elevated volatility environment" |
| Stale data (> 5 min) | Data freshness | Warning | "Market data may be delayed" |
| Disclaimer unchecked | UI state | **Block** | Disable Submit button |
| Broker not connected | Connection status | **Block** | Show "Connect broker" link (for Live mode) |
| Account size = 0 | Broker balance / user input | **Block** | "Enter account size for position sizing" |

### R:R Auto-Calculation

```
R:R = (Target - Entry) / (Entry - Stop)           for LONG
R:R = (Entry - Target) / (Stop - Entry)            for SHORT

Risk per share = |Entry - Stop|
Max risk $ = Account Size × Risk %
Position size = floor(Max risk $ / Risk per share)
Portfolio heat after = (sum of all open risk $) / Account Size × 100
```

---

## 11. Risk Calculations

### Position Sizing Logic

These calculations leverage the existing `lib/execution/riskGovernor.ts` and position sizing logic:

```
INPUTS:
  account_equity      ← from broker balance OR user input
  risk_pct            ← user input (default 1%)
  entry_price         ← from trade plan (editable)
  stop_loss           ← from trade plan (editable)
  
OUTPUTS:
  max_risk_usd        = account_equity × risk_pct
  risk_per_unit       = |entry_price - stop_loss|
  position_size       = floor(max_risk_usd / risk_per_unit)
  position_value      = position_size × entry_price
  pct_of_account      = position_value / account_equity × 100
  
KELLY CRITERION (from existing backtest engine):
  kelly_fraction      = (win_rate × avg_win - loss_rate × avg_loss) / avg_win
  kelly_size          = floor(account_equity × kelly_fraction / entry_price)
  half_kelly_size     = floor(kelly_size / 2)
  
PORTFOLIO IMPACT:
  current_heat        = sum(open_position_risk) / account_equity
  heat_after_trade    = (current_heat_usd + max_risk_usd) / account_equity
  correlation_risk    = max correlation with any open position
```

---

## 12. Integration Points

### How Trade Ticket Connects to Existing MSP Systems

| System | Integration | Direction |
|--------|-------------|-----------|
| **Scanner (V2/Pro)** | Prefill trade ticket with scan result data | Scanner → Ticket |
| **Golden Egg** | Prefill with full GE analysis (thesis, plan, permission, alignment) | GE → Ticket |
| **AI Analyst** | Prefill with AI-generated thesis | AI → Ticket |
| **Market Movers** | Prefill with symbol + direction | Movers → Ticket |
| **Alerts** | Trigger trade ticket from alert notification | Alerts → Ticket |
| **Intraday Chart** | Prefill with symbol + current price | Chart → Ticket |
| **Trade Proposal API** | Ticket calls existing `/api/trade-proposal` for sizing/governor check | Ticket → Proposal |
| **Execute Trade API** | Ticket calls existing `/api/execute-trade` with real broker adapter | Ticket → Execution |
| **Risk Governor** | Ticket displays governor status; governor can block submission | Governor ↔ Ticket |
| **Portfolio** | New position auto-created after fill; broker sync updates positions | Execution → Portfolio |
| **Journal** | Trade plan logged as journal entry; fills update entry | Execution → Journal |
| **Performance** | Equity snapshots from broker; P&L computed | Broker → Performance |
| **DVE** | Volatility state shown in guardrails section | DVE → Ticket |
| **MPE** | Market pressure composite shown in section ③ | MPE → Ticket |
| **Macro Dashboard** | Regime state shown in guardrails; RISK_OFF triggers warning | Macro → Ticket |
| **Signal Recorder** | Trade ticket submission recorded as signal for accuracy tracking | Ticket → Signals |

### Existing Code Touch Points

| File | Change Required | Phase |
|------|----------------|-------|
| `app/api/execute-trade/route.ts` ~line 147 | Replace broker stub with real adapter call | Phase 3 |
| `lib/execution/types.ts` | Add `BrokerAdapter` interface | Phase 1 |
| `app/tools/golden-egg/page.tsx` | Add "Open Trade Ticket" button | Phase 2 |
| `app/v2/` (scanner pages) | Add "Trade Ticket" button in result rows | Phase 2 |
| `components/AlertToast.tsx` | Add "Trade" action button on alert notifications | Phase 2 |
| `app/tools/portfolio/page.tsx` | Show broker-synced positions with badge | Phase 1 |
| `app/tools/journal/page.tsx` | Show auto-populated broker fills | Phase 1 |
| `app/account/` (settings) | Add "Brokers" settings tab | Phase 1 |
| `lib/useUserTier.ts` | Add `canAccessBroker(tier)` gate | Phase 1 |
| `middleware.ts` | No changes needed (existing auth handles it) | — |

---

## 13. Execution Safeguards

### Mandatory Rules (Non-Negotiable)

| Safeguard | Implementation |
|-----------|---------------|
| **No auto-execution** | No code path exists that submits an order without user click |
| **No auto-submission from signals** | Scanner/GE/AI can only prefill — never submit |
| **No default execution** | Submit button disabled by default; requires disclaimer checkbox |
| **Explicit confirmation** | Two-step: checkbox + button click. For Live mode: additional confirmation modal |
| **Full audit trail** | Every submission logged to `order_audit_log` with prefill, edits, confirmation timestamp |
| **Disclaimer required** | Checkbox text: "I understand this is for informational and educational purposes only. I am responsible for all trading decisions." |
| **Mode separation** | Paper and Live are distinct modes; Live requires connected broker |
| **Governor override protection** | Risk governor LOCKED state cannot be overridden by UI |

### Defense-in-Depth Layers

```
Layer 1: UI                 — Checkbox + button disabled by default
Layer 2: Confirmation       — Modal with order summary for Live orders
Layer 3: API validation     — /api/execute-trade validates disclaimer_accepted=true
Layer 4: Risk governor      — Re-checks portfolio heat at execution time
Layer 5: Audit log          — Immutable record of every submission attempt
Layer 6: Broker adapter     — Separate write_enabled flag per connection
Layer 7: Rate limiting      — Max 10 order submissions per minute per workspace
```

### What CANNOT Happen

- A signal from Scanner/GE/AI cannot trigger an order submission
- A trade ticket cannot be submitted without the user checking the disclaimer
- A Live order cannot be submitted without a connected broker
- A blocked Risk Governor state cannot be bypassed
- An order cannot be submitted without an audit log entry
- Broker credentials cannot be read back (only used server-side, encrypted at rest)

---

## 14. Compliance & Legal

### Language Standards

| Term Used | Not Used |
|-----------|----------|
| "Research case" | "Recommendation" |
| "Trade plan" | "Trade signal" |
| "Scenario" | "Prediction" |
| "Alignment" | "Confidence" (in user-facing contexts) |
| "Educational analysis" | "Financial advice" |
| "Plan scenario" | "Suggested trade" |

### Required Disclaimers

**Trade Ticket Footer (always visible):**
> MarketScanner Pros is an educational and informational platform. We are not a licensed financial advisor or broker-dealer. All research cases, trade plans, and scenarios presented are for educational and informational purposes only. Past performance does not guarantee future results. You are solely responsible for your trading decisions. Trading involves substantial risk of loss.

**Order Confirmation Modal:**
> This will submit a LIVE order to your broker account. MarketScanner Pros does not provide financial advice and is not responsible for trading outcomes. You are submitting this order based on your own analysis and judgment.

**Checkbox (required before submission):**
> I understand this is for informational and educational purposes only. I am responsible for all trading decisions.

### Legal Requirements

- All disclaimers must be visible (not hidden behind scroll or expandable sections)
- Disclaimer checkbox resets on each new trade ticket (no "remember my choice")
- Audit log retention: indefinite (never deleted)
- Broker credentials: encrypted at rest, never logged in plaintext, never sent to client
- User must explicitly enable write_enabled on broker connection (read-only by default)
- Jurisdiction: New South Wales, Australia (consistent with existing Terms of Service)

---

## 15. Security Architecture

### Credential Storage

```
User enters API key/secret in browser
         │
         ▼
POST /api/broker/connect (HTTPS)
         │
         ▼ Server-side only
         │
AES-256-GCM encryption using per-workspace derived key
  key = HKDF(APP_SIGNING_SECRET, workspace_id, "broker-credentials")
  iv  = random 12 bytes
  {ciphertext, tag} = AES-GCM-encrypt(credentials_json, key, iv)
         │
         ▼
Store in broker_connections:
  credentials_encrypted = ciphertext
  credentials_iv = iv
  credentials_tag = tag
         │
         ▼
Decrypted ONLY server-side when making broker API calls
Never returned to client, never logged
```

### API Security

- All broker routes require authenticated session (existing `getSessionFromCookie()`)
- All broker routes require Pro Trader tier
- All database queries include `workspace_id` filter (tenant isolation)
- Broker API calls made server-side only (credentials never sent to browser)
- IBKR OAuth tokens stored encrypted, refreshed server-side
- Rate limiting: 10 order submissions per minute per workspace
- Broker connection test on initial setup (validates credentials are real)

### Data Isolation

- Broker credentials scoped to `workspace_id` (no cross-tenant access)
- Broker positions/orders/fills scoped to `workspace_id`
- Audit log scoped to `workspace_id`
- No admin route can read another workspace's broker credentials

---

## 16. Limitations & Constraints

### Phase 1 Limitations
- Read-only (no order submission)
- IBKR only (other brokers in later phases)
- Polling-based sync (not real-time WebSocket — acceptable for 30-60s intervals)
- Broker positions may briefly diverge from MSP display between sync intervals
- IBKR Client Portal Gateway requires local installation OR IBKR Web API (cloud) access

### Phase 2 Limitations
- Trade ticket is per-symbol (no multi-leg strategy builder in Phase 2)
- Options trade tickets limited to single-leg (no spreads/condors in Phase 2)
- No direct chart integration (trade ticket is a separate page/panel, not a chart overlay)
- Prefill quality depends on source — manual tickets have no research case section

### Phase 3 Limitations
- No auto-execution (by design, not a limitation)
- No algorithmic trading / auto-rebalancing
- IBKR Client Portal API has rate limits (~10 req/sec)
- IBKR requires periodic re-authentication (session timeout)
- No partial fill management in Phase 3 (fill tracking only)
- No OCO (one-cancels-other) order types in Phase 3
- Options execution limited to equity options on IBKR

### General Constraints
- Broker feature gated to Pro Trader tier only
- MSP is not a broker — we relay orders to the user's broker
- We cannot guarantee order execution or fill quality
- Time-in-force options limited to what each broker supports
- Crypto execution (Binance/Bybit) has different order types than equity (IBKR)

---

## 17. Implementation Roadmap

### Phase 1 — Read-Only Broker Sync

```
Priority: HIGH
Tier Gate: Pro Trader
Broker: IBKR first

New files:
  lib/broker/types.ts                   — BrokerAdapter interface, normalized types
  lib/broker/adapters/ibkr.ts           — IBKR Client Portal API adapter
  lib/broker/sync.ts                    — Sync orchestrator (poll → dedupe → write)
  lib/broker/credentials.ts             — AES-256-GCM encrypt/decrypt
  app/api/broker/connect/route.ts       — POST: store encrypted creds
  app/api/broker/disconnect/route.ts    — DELETE: remove creds
  app/api/broker/status/route.ts        — GET: connection status
  app/api/broker/sync/route.ts          — POST: trigger sync
  app/api/broker/positions/route.ts     — GET: synced positions
  app/api/broker/balances/route.ts      — GET: synced balances
  app/api/broker/orders/route.ts        — GET: synced orders
  app/api/broker/fills/route.ts         — GET: synced fills
  components/BrokerSettings.tsx         — Connection UI in account settings

Modified files:
  app/tools/portfolio/page.tsx          — Show broker-synced positions
  app/tools/journal/page.tsx            — Show auto-populated fills
  app/account/page.tsx                  — Add Brokers tab
  lib/useUserTier.ts                    — Add canAccessBroker()

New migrations:
  migrations/0XX_broker_connections.sql
  migrations/0XX_broker_accounts.sql
  migrations/0XX_broker_orders.sql
  migrations/0XX_order_audit_log.sql
  migrations/0XX_portfolio_positions_broker_cols.sql
```

### Phase 2 — Trade Ticket System

```
Priority: HIGH
Depends on: Phase 1 (for broker balance in position sizing)
             But can work without broker (manual account size entry)

New files:
  components/TradeTicket/TradeTicket.tsx
  components/TradeTicket/TradeTicketHeader.tsx
  components/TradeTicket/ResearchCase.tsx
  components/TradeTicket/MarketPressure.tsx
  components/TradeTicket/TradePlan.tsx
  components/TradeTicket/PositionSizing.tsx
  components/TradeTicket/ValidationGuardrails.tsx
  components/TradeTicket/InvalidationConditions.tsx
  components/TradeTicket/ExecutionPanel.tsx
  components/TradeTicket/ComplianceFooter.tsx
  components/TradeTicket/ConfirmOrderModal.tsx
  components/TradeTicket/useTradeTicket.ts
  app/tools/trade-ticket/page.tsx       — Trade ticket page
  app/api/trade-ticket/prefill/route.ts — Generate prefill from source

Modified files:
  app/tools/golden-egg/page.tsx         — Add "Open Trade Ticket" button
  app/v2/ (scanner pages)              — Add "Trade Ticket" button
  components/AlertToast.tsx             — Add "Trade" action
  app/tools/market-movers/              — Add "Trade Ticket" button
```

### Phase 3 — User-Confirmed Execution

```
Priority: MEDIUM
Depends on: Phase 1 + Phase 2

Modified files:
  app/api/execute-trade/route.ts        — Replace stub with real broker call
  lib/broker/adapters/ibkr.ts           — Add submitOrder(), cancelOrder()
  
New files:
  app/api/broker/order/[id]/route.ts    — GET status, DELETE cancel

Feature flags:
  BROKER_WRITE_ENABLED=false            — Kill switch for execution
```

### Future Phases

```
Phase 4: Additional brokers (Alpaca, Binance, Bybit, Tradier)
Phase 5: Multi-leg options trade tickets (spreads, condors)
Phase 6: WebSocket real-time position updates
Phase 7: Order modification UI
Phase 8: Partial fill management
```

---

## Summary

### What Will Be Implemented

| Component | Description |
|-----------|-------------|
| Broker adapter layer | Pluggable interface for IBKR (Phase 1), Alpaca/Binance (later) |
| Read-only sync | Positions, balances, orders, fills synced to MSP every 30-60s |
| Auto-linking | Broker positions → Portfolio, fills → Journal, equity → Performance |
| Trade Ticket UI | 9-section decision-to-execution bridge with research case display |
| Prefill system | Scanner/GE/AI/Movers/Alerts/Chart can populate trade ticket |
| Position sizing | Auto-calculated from account size, risk %, and stop distance |
| Validation guardrails | Macro regime, confluence, R:R, governor, correlation warnings |
| Execution pipeline | User-confirmed order submission through existing execute-trade route |
| Audit logging | Immutable record of every order with prefill, edits, and confirmation |
| Credential security | AES-256-GCM encrypted broker credentials, server-side only |

### Supported Brokers (prioritized)

1. **Interactive Brokers** — Phase 1 (stocks, options, futures, forex)
2. **Alpaca** — Phase 2 (stocks, crypto)
3. **Binance** — Phase 2 (crypto spot, futures)
4. **Bybit** — Phase 3 (crypto derivatives)
5. **Tradier** — Phase 3 (stocks, options)

### Data Synced

- Positions (open/closed) → Portfolio
- Account balances → Performance analytics + Position sizing
- Open orders → Order status display
- Fills/executions → Journal auto-population

### Trade Ticket Flow

```
Source (Scanner/GE/AI) → Prefill → User edits → Validation → Disclaimer ☑ → Submit → Confirm Modal → Broker API → Audit Log → Journal + Portfolio
```

### Execution Safeguards

1. No auto-execution from any signal source
2. No default "recommended trade"
3. Disclaimer checkbox required before submit
4. Confirmation modal for Live orders
5. Risk governor can hard-block submissions
6. All values editable by user
7. Full audit trail (immutable)
8. Rate-limited order submissions (10/min)
9. Write-enabled is opt-in per broker connection
10. Kill switch via `BROKER_WRITE_ENABLED` env var

### Compliance Considerations

- Platform language: "research case", "trade plan", "scenario"
- Never: "recommendation", "advice", "signal" in user-facing execution context
- Disclaimer on every trade ticket (always visible, not dismissible)
- Disclaimer checkbox resets per ticket (no "remember")
- Audit log retained indefinitely
- Jurisdiction: NSW, Australia (consistent with Terms of Service)
- MSP is not a broker — we relay user-initiated orders to the user's own broker account
