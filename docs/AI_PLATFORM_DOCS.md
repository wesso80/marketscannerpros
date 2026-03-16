# MSP AI Platform Architecture

## Overview

The MSP AI Platform is a unified infrastructure that makes AI feel "everywhere" across the MarketScanner Pros application. It follows the **Observe → Contextualize → Decide → Act → Learn** pattern.

### Version
- **Context Version**: v1
- **Last Updated**: February 2026

## Quick Start

### 1. Add Copilot to Any Page

```tsx
import MSPCopilot from '@/components/MSPCopilot';

export default function DerivativesPage() {
  const pageData = { /* your page state */ };
  
  return (
    <div>
      {/* Your page content */}
      
      <MSPCopilot 
        skill="derivatives"
        pageData={pageData}
        symbols={['BTC', 'ETH']}
        timeframes={['1H', '4H']}
        onActionExecute={async (action) => {
          // Handle actions like create_alert, add_to_watchlist
          await fetch('/api/ai/actions', {
            method: 'POST',
            body: JSON.stringify(action),
          });
        }}
      />
    </div>
  );
}
```

### 2. Add Inline Explanations

```tsx
import ExplainButton from '@/components/ExplainButton';

<div>
  RSI: {rsiValue}
  <ExplainButton 
    metricName="RSI" 
    metricValue={rsiValue} 
    skill="scanner"
  />
</div>
```

### 3. Log Events for Learning

```tsx
import { useAIEvents } from '@/lib/ai';

function ScannerPage() {
  const { 
    logSignalClicked, 
    logWidgetInteraction,
    logOutcome 
  } = useAIEvents({ 
    skill: 'scanner',
    symbols: ['AAPL'],
  });

  const handleSignalClick = (signal) => {
    logSignalClicked(signal.symbol, signal.type, signal.confidence);
  };

  const handleFilterChange = (filter, value) => {
    logWidgetInteraction('scanner_filter', 'change', { [filter]: value });
  };
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER                          │
├─────────────────────────────────────────────────────────────┤
│  MSPCopilot          ExplainButton        useAIEvents       │
│  (Chat Panel)        (Inline Tips)        (Event Logger)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       API LAYER                              │
├─────────────────────────────────────────────────────────────┤
│  /api/ai/copilot     /api/ai/explain    /api/ai/events      │
│  /api/ai/actions     /api/ai/feedback   /api/ai/memory      │
│  /api/ai/context     /api/ai/suggest                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       CORE LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  Context Builder     Tool Executor      Knowledge Base (RAG) │
│  User Memory         Event Processor    Feedback Loop        │
│  Rate Limiter        Explain Cache      Suggestion Engine    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
├─────────────────────────────────────────────────────────────┤
│  ai_events           ai_responses       ai_feedback         │
│  user_memory         ai_outcomes        msp_knowledge       │
│  ai_actions          ai_evaluations     ai_explain_cache    │
│  ai_rate_limits      ai_suggestions                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Tool Permission & Confirmation Policy

Each tool has a policy defining its safety level:

| Tool | Type | Confirmation | Rate Limit/min | Cost | Cacheable |
|------|------|--------------|----------------|------|-----------|
| `explain_metric` | read | no | 30 | free | yes (1hr) |
| `summarize_signal` | read | no | 30 | free | yes |
| `get_market_context` | read | no | 30 | free | yes |
| `risk_position_size` | read | no | 30 | free | yes |
| `compare_assets` | read | no | 30 | medium | yes |
| `add_to_watchlist` | write | no | 10 | low | no |
| `generate_trade_plan` | read | no | 30 | medium | no |
| `create_alert` | write | yes | 5 | low | no |
| `remove_from_watchlist` | write | yes | 10 | low | no |
| `journal_trade` | write | yes | 10 | low | no |
| `run_backtest` | heavy | yes | 3 | high | no |

**Policy Fields:**
```typescript
interface ToolPolicy {
  sideEffect: 'read' | 'write' | 'heavy';
  requiresConfirmation: boolean;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  costLevel: 'free' | 'low' | 'medium' | 'high';
  cacheable: boolean;
  cacheTTLSeconds?: number;
}
```

---

## Idempotency & Audit Trail

Actions include idempotency to prevent duplicates:

**Request:**
```json
{
  "tool": "create_alert",
  "parameters": { "symbol": "BTC", "alertType": "price_above", "value": 50000 },
  "idempotencyKey": "idem_abc123",
  "dryRun": false,
  "initiatedBy": "user"
}
```

**Response:**
```json
{
  "success": true,
  "actionId": "uuid",
  "idempotencyKey": "idem_abc123",
  "status": "executed",
  "requiresConfirmation": true,
  "executedResult": { "alertId": "uuid", "message": "Alert created..." }
}
```

**Dry Run Mode:**
Set `dryRun: true` to preview what would happen:
```json
{
  "dryRun": true,
  "dryRunResult": {
    "wouldDo": "Create price_above alert for BTC at 50000",
    "wouldAffect": ["user_alerts table", "notification queue"],
    "reversible": true
  }
}
```

---

## Context Versioning

Every AI response includes version info for future learning:

```typescript
{
  "contextVersion": "v1",           // Context builder schema version
  "skillVersion": "derivatives@1.0", // Page skill config version
  "inputHash": "a1b2c3d4e5f6..."    // Hash of prompt + context
}
```

This allows old `ai_responses` to be filtered by version during evals.

---

## Confidence Standards

Confidence scores include metadata:

```typescript
interface ConfidenceMetadata {
  value: number;           // 0-100
  type: 'model_calibrated' | 'heuristic' | 'ranking_score' | 'composite';
  horizon: '1h' | '4h' | '24h' | 'next_session' | '5d' | 'indefinite';
  components?: { name: string; weight: number; value: number }[];
  calibrationNote?: string;
}
```

**What the types mean:**
- `model_calibrated`: Based on historical accuracy data
- `heuristic`: Rule-based calculation
- `ranking_score`: Relative ranking, not probability
- `composite`: Weighted combination of multiple sources

---

## Learning Signal Labels

Events are categorized by learning value:

| Label Type | Source | Strength | Example |
|------------|--------|----------|---------|
| `implicit` | User took AI-suggested action | strong | Clicked "Create Alert" |
| `implicit` | User viewed AI response | weak | Opened copilot |
| `explicit` | Thumbs up/down | medium | Clicked 👍 |
| `explicit` | User correction | strong | "That's wrong because..." |
| `outcome` | Trade result | strongest | Trade was profitable |

```typescript
interface LearningLabel {
  type: 'implicit' | 'explicit' | 'outcome';
  strength: 'weak' | 'medium' | 'strong';
  signal: 'positive' | 'negative' | 'neutral';
  source: string;
}
```

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `ai_events` | All user interactions (telemetry) + learning labels |
| `user_memory` | Per-user preferences and learned patterns |
| `ai_responses` | Every AI response with context + versioning |
| `ai_feedback` | Thumbs up/down and corrections |
| `ai_outcomes` | Trade results linked to AI predictions |
| `msp_knowledge` | RAG knowledge base (methodology, definitions) |
| `ai_actions` | Actions executed by AI (with idempotency) |
| `ai_evaluations` | Weekly eval run results |
| `ai_explain_cache` | Cached metric explanations |
| `ai_rate_limits` | Per-tool rate limiting |
| `ai_suggestions` | Pre-computed "next best actions" |

### Run Migrations

```sql
-- Initial schema
\i migrations/AI_PLATFORM_SCHEMA.sql

-- V2 enhancements (versioning, idempotency, caching)
\i migrations/AI_PLATFORM_SCHEMA_V2.sql
```

---

## API Endpoints

### POST /api/ai/copilot
Main AI chat endpoint with tool calling.

### POST /api/ai/explain
Inline metric explanations with caching.

### GET /api/ai/explain?cacheKey=...
Retrieve cached explanation (zero LLM cost).

### POST /api/ai/suggest
Generate "next best actions" for current context.

### GET /api/ai/suggest?skill=scanner
Retrieve pre-computed suggestions (zero LLM cost).

### POST /api/ai/actions
Execute AI-suggested actions with idempotency and dry run.

### GET /api/ai/actions?idempotencyKey=...
Check action status.

### POST /api/ai/events
Log telemetry events (batched).

### POST /api/ai/feedback
Log feedback on AI responses.

### GET/PATCH /api/ai/memory
Get or update user preferences.

---

## Cost & Rate Control

### Rate Limits
Per-tool limits enforced via `ai_rate_limits` table:
- Minute window: Rolling 60-second count
- Hour window: Rolling 3600-second count
- Day window: Rolling 24-hour token budget

### Caching Strategy
1. **Explain Cache**: Metrics like RSI don't need new LLM calls
   - Key: `explain_{metric}_{skill}_{value_bucket}`
   - TTL: 1 hour
   - Buckets: `0_20`, `20_30`, `30_50`, etc.

2. **Memory Cache**: In-process 15-minute cache before hitting DB

3. **Suggestions**: Pre-computed, retrieved without LLM

---

## Page Skills

| Skill | Allowed Tools | Focus |
|-------|---------------|-------|
| `home` | get_market_context, add_to_watchlist | Market overview |
| `scanner` | create_alert, add_to_watchlist, summarize_signal | Signal analysis |
| `derivatives` | create_alert, explain_metric, generate_trade_plan | OI/Funding/Liquidations |
| `options` | create_alert, generate_trade_plan, risk_position_size | Options strategies |
| `time_confluence` | create_alert, add_to_watchlist, explain_metric | Session timing |
| `portfolio` | journal_trade, risk_position_size, create_alert | Position management |
| `journal` | journal_trade, summarize_signal | Trade review |
| `deep_analysis` | All tools | Comprehensive analysis |
| `backtest` | run_backtest, explain_metric | Strategy testing |

---

## Guardrails

1. **Always show sources** - "Based on: [data points]"
2. **Never invent numbers** - Say "data unavailable" if missing
3. **Educational disclaimer** - Every response ends with disclaimer
4. **Confirmation required** - Write actions need user confirmation
5. **No guarantees** - Never promise returns
6. **Rate limited** - Prevent spam and cost overruns
7. **Idempotent** - Same request = same result (no duplicates)

---

## Learning Loop

### Prompt + Policy + Retrieval Optimization

1. **Layer 1: User Memory** (immediate personalization)
   - Stores preferences, reduces irrelevant suggestions

2. **Layer 2: RAG Retrieval** (knowledge grounding)
   - MSP methodology, metric definitions, playbooks
   - Prevents hallucinations, ensures consistency

3. **Layer 3: Outcome Calibration** (confidence tuning)
   - Links AI predictions to actual trade results
   - Tunes confidence scores, improves signal ranking

4. **Layer 4: Policy Optimization**
   - Tool policy (which tools, when)
   - Context selection policy (what data to include)
   - Retrieval policy (which docs to fetch)
   - Prompt text iteration based on feedback

---

## Files Reference

```
lib/ai/
├── index.ts              # Main exports
├── types.ts              # Type definitions, versioning constants, skill configs
├── context.ts            # Unified context builder
├── tools.ts              # Tool definitions with policies
├── useAIEvents.ts        # Event logging hook
└── useUserMemory.ts      # Memory access hook

app/api/ai/
├── copilot/route.ts      # Main chat endpoint (versioned)
├── explain/route.ts      # Inline explanations (cached)
├── suggest/route.ts      # Quick suggestions (cheap)
├── events/route.ts       # Event logging
├── feedback/route.ts     # Feedback collection
├── memory/route.ts       # User memory CRUD
├── context/route.ts      # Context builder
└── actions/route.ts      # Action executor (idempotent)

components/
├── MSPCopilot.tsx        # Universal chat panel
└── ExplainButton.tsx     # Inline explanation button

migrations/
├── AI_PLATFORM_SCHEMA.sql     # V1 database schema
└── AI_PLATFORM_SCHEMA_V2.sql  # V2 enhancements
```

---

## Future Enhancements

1. **RAG with Vector Search** - Use pgvector for semantic knowledge retrieval
2. **Streaming Responses** - Real-time AI output with SSE
3. **Voice Input** - Speech-to-text for hands-free trading
4. **Fine-tuned Model** - Custom model trained on MSP methodology
5. **A/B Testing** - Compare prompt/policy variants automatically
6. **Weekly Coach** - Proactive insights based on journal analysis
7. **Admin Eval Runner** - POST /api/ai/evals/run for automated testing
