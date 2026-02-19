# MarketScanner Pros — Full System Brain Blueprint

Date: 2026-02-19

## 1) Executive System Model

The platform is a multi-tenant decision system with four runtime planes:

1. Experience Plane (Next.js pages/components)
2. Control Plane (Next.js API routes)
3. State Plane (PostgreSQL + Redis cache)
4. Compute Plane (background workers + AI pipelines)

The system behaves like a closed loop:

Input data -> normalize/store -> compute signals -> rank actions -> user/AI executes -> outcomes/journal -> improve next decisions.

---

## 2) Core Brains and Responsibilities

### A. Identity + Tenant Brain
- Purpose: authenticate user, resolve workspace, enforce data isolation.
- Key files:
  - `lib/auth.ts`
  - `middleware.ts`
  - `app/api/auth/login/route.ts`
- Core invariant: every user data query must be scoped to `workspace_id`.

### B. Market Ingestion Brain
- Purpose: keep symbol universe fresh (quotes/bars/indicators).
- Key file:
  - `worker/ingest-data.ts`
- Current design:
  - strict lane split: crypto-only worker and equities-only worker.
  - singleton advisory lock per lane (prevents duplicate lane runners).
  - equities off-hours slot policy (limited pre/post scans, skip remainder).

### C. Signal + Feature Brain
- Purpose: transform bars into indicators/signals and structured packet candidates.
- Inputs: OHLC/quote data from ingestion.
- Outputs: indicator records, signal candidates, decision packet inputs.

### D. Operator Intelligence Brain
- Purpose: rank “what to do next” based on signal quality + context + policy.
- Key routes:
  - `app/api/operator/proposals/route.ts`
  - `app/api/operator/attention/route.ts`
  - `app/api/operator/state/route.ts`
  - `app/api/actions/execute/route.ts`
- Behavior:
  - proposal scoring blends confidence, fit, freshness, and risk environment.
  - cooldown and execution guards limit noisy/unsafe auto-actions.

### E. Portfolio + Journal Brain
- Purpose: execution memory and learning memory.
- Key routes:
  - `app/api/portfolio/route.ts`
  - `app/api/journal/route.ts`
  - `app/api/journal/close-trade/route.ts`
  - `app/api/journal/analyze/route.ts`

### F. Notification Brain
- Purpose: lifecycle event fanout (in-app/email/discord/web push).
- Key routes/workers:
  - `app/api/notifications/route.ts`
  - `app/api/notifications/prefs/route.ts`
  - `worker/notification-router.ts`
  - `lib/email.ts`
- Pattern: outbox event -> delivery attempts -> dedupe receipts.

### G. AI Analyst Brain
- Purpose: narrative reasoning, explainability, suggestion, context responses.
- Representative routes:
  - `app/api/msp-analyst/route.ts`
  - `app/api/ai/explain/route.ts`
  - `app/api/ai/suggest/route.ts`
  - `app/api/ai/context/route.ts`

### H. Entitlement + Billing Brain
- Purpose: monetization and feature gating.
- Key routes:
  - `app/api/payments/checkout/route.ts`
  - `app/api/payments/portal/route.ts`
  - `app/api/webhooks/stripe/route.ts`
  - `app/api/entitlements/route.ts`

---

## 3) Runtime Topology (Target)

## Web/API runtime
- One Next.js app process (or serverless/edge equivalent in deployment).

## Worker runtime
- 1x `worker:ingest:crypto`
- 1x `worker:ingest:equities`
- 1x `worker:engine` (decision/automation loop)
- 1x `worker:notifications:loop`
- 1x `worker:outcomes:loop`

No duplicate processes per lane.

---

## 4) Ingestion Timeline Policy

## Crypto lane
- Market mode: tier cadence applies (faster).
- Off-hours mode: tier cadence applies (slower).

## Equities lane
- Market hours: normal cadence by tier.
- Premarket: only configured slot scans (default 2 scans).
- Postmarket: only configured slot scans (default 2 scans).
- Closed period/weekends: skip.

Configured via environment:
- `EQUITY_MARKET_TIMEZONE`
- `EQUITY_PREMARKET_SCAN_TIMES`
- `EQUITY_POSTMARKET_SCAN_TIMES`
- `EQUITY_OFFHOURS_SLOT_TOLERANCE_MINUTES`

---

## 5) Data Contract and State Ownership

## Identity and tenancy
- `workspaces`
- `user_subscriptions`

## Market state
- `symbol_universe`
- `quotes_latest`
- bars/indicator tables used by scanner/analysis APIs
- `worker_runs` (operational telemetry)

## Trade lifecycle
- `portfolio_positions`
- `portfolio_closed`
- `portfolio_performance`
- `journal_entries`

## Operator and workflow state
- `decision_packets`
- `operator_state`
- `operator_action_executions`

## Notifications
- `trade_events`
- `notification_prefs`
- `notifications`
- `notification_deliveries`

Ownership rule: every tenant row path must include workspace filter semantics.

---

## 6) API Domain Map (Control Plane)

## Auth/session
- `/api/auth/login`
- `/api/auth/session`
- `/api/me`

## Market + scanner
- `/api/scanner/*`
- `/api/quote`
- `/api/intraday`
- `/api/options*`
- `/api/open-interest`
- `/api/market-movers`
- `/api/economic-*`

## Operator
- `/api/operator/proposals`
- `/api/operator/attention`
- `/api/operator/state`
- `/api/operator/presence`
- `/api/actions/execute`

## Journal/portfolio
- `/api/journal/*`
- `/api/portfolio*`
- `/api/trades/close`

## Notifications
- `/api/notifications*`
- `/api/push/*`

## Billing/entitlements
- `/api/payments/*`
- `/api/webhooks/stripe`
- `/api/entitlements`

## AI
- `/api/msp-analyst`
- `/api/ai/*`

---

## 7) Decision Lifecycle (End-to-End)

1. Ingestion updates quotes/bars and indicator state.
2. Signal logic emits candidate opportunities.
3. Operator endpoints score and rank proposals.
4. User or assist execution posts through action executor.
5. Notifications are enqueued/fanned out.
6. Journal and portfolio state are updated.
7. Outcomes worker labels quality and feeds learning loop.

This is the platform’s main “brain pulse”.

---

## 8) Failure Modes and First Checks (Runbook)

## A. Page loads but “proposal generation failed”
- Check `/api/operator/proposals` response body/status.
- Verify operator tables existence and workspace rows.
- Confirm fail-open behavior returns empty proposals instead of 500.

## B. Workers running but charts stale
- Verify only one process per lane.
- Inspect `worker_runs` freshness and latest status.
- Check `quotes_latest` max timestamp and last_5m counts.

## C. High wait times in ingest
- Confirm duplicate ingest processes are not running.
- Check provider throttling (`429`) incidence.
- Validate cadence and slot configs align with expected throughput.

## D. Missing notifications
- Check `trade_events` pending/failed counts.
- Check `notification_deliveries` status distribution.
- Validate email/channel preferences and provider key availability.

## E. Journal close/open inconsistencies
- Verify ID normalization and ownership in sync API.
- Confirm close-trade route and sync route are consistent on workspace scope.

---

## 9) Operational SLO Suggestions

## Ingestion
- Quote freshness p95:
  - Crypto tier-1 <= 2 minutes
  - Equities market tier-1 <= 2 minutes

## API reliability
- Non-admin API 5xx rate < 0.5%
- Operator proposal endpoint graceful degradation (never hard fail UI)

## Notification delivery
- In-app send success >= 99%
- Email send success >= 97% (provider-dependent)

## Worker health
- One active process per ingest lane
- No duplicate lane lock holders

---

## 10) Security and Compliance Guardrails

- Workspace-scoped query discipline on all tenant data.
- Signed session verification parity across middleware and API runtime.
- Stripe webhook signature validation.
- GDPR/cookie/legal pages aligned with NSW jurisdiction disclosures.

---

## 11) Recommended Next Evolution

1. Formal worker supervisor (systemd/pm2/container orchestrator) with singleton semantics.
2. Persistent symbol mapping registry for crypto coverage gap reduction.
3. Unified observability dashboard (worker lag, API errors, provider 429s, proposal queue depth).
4. Automated schema health checks at startup for operator tables.
5. Controlled backpressure strategy by provider and lane.

---

## 12) Command Quick Sheet

- Start app: `npm run dev`
- Start crypto ingest lane: `npm run worker:ingest:crypto`
- Start equities ingest lane: `npm run worker:ingest:equities`
- Start notifications loop: `npm run worker:notifications:loop`
- Start outcomes loop: `npm run worker:outcomes:loop`
- Build: `npm run build`

---

This blueprint is the current deep-operational map of how the site “brain” works end-to-end.