# Phase 1 — Launch Readiness Inventory

> Generated: 2026-05-05. Source of truth: `app/`, `app/api/`, `components/`, `lib/`, `middleware.ts`.
> Counts: **110 pages** · **288 API routes** · **130+ shared components** · **80+ shared libs**.
>
> Classification legend:
> - **PUBLIC_MARKETING** — anonymous, marketing/SEO surface
> - **PUBLIC_EDUCATIONAL_TOOL** — anonymous research/widget surface
> - **AUTH_REQUIRED_TOOL** — any signed-in user (free, pro, pro_trader)
> - **PRO_ONLY** — gated to `pro` or higher
> - **PRO_TRADER_ONLY** — gated to `pro_trader`
> - **ADMIN_ONLY** — `requireAdmin()` / admin layout
> - **INTERNAL_API** — auth required (cookie or admin), internal user surfaces only
> - **PUBLIC_API** — anonymous data endpoint (read-only market data, fear/greed, etc.)
> - **WEBHOOK** — external callbacks (Stripe, TradingView)
> - **CRON_INTERNAL** — protected by `CRON_SECRET`, called by Render schedules
> - **UNKNOWN_REVIEW_REQUIRED** — auth shape ambiguous or missing

---

## 1. Pages (`app/**/page.tsx`)

### 1.1 Public Marketing (anonymous, indexed)

| Page | Class | Notes |
|---|---|---|
| [app/page.tsx](app/page.tsx) | PUBLIC_MARKETING | home |
| [app/about/page.tsx](app/about/page.tsx) | PUBLIC_MARKETING | |
| [app/pricing/page.tsx](app/pricing/page.tsx) | PUBLIC_MARKETING | |
| [app/contact/page.tsx](app/contact/page.tsx) | PUBLIC_MARKETING | |
| [app/reviews/page.tsx](app/reviews/page.tsx) | PUBLIC_MARKETING | |
| [app/partners/page.tsx](app/partners/page.tsx) | PUBLIC_MARKETING | |
| [app/partners/demo/page.tsx](app/partners/demo/page.tsx) | PUBLIC_MARKETING | |
| [app/blog/page.tsx](app/blog/page.tsx) | PUBLIC_MARKETING | |
| [app/blog/[slug]/page.tsx](app/blog) | PUBLIC_MARKETING | dynamic blog post |
| [app/launch/page.tsx](app/launch/page.tsx) | PUBLIC_MARKETING | launch landing |
| [app/guide/page.tsx](app/guide/page.tsx) | PUBLIC_MARKETING | |
| [app/guide/open-interest/page.tsx](app/guide/open-interest/page.tsx) | PUBLIC_MARKETING | |
| [app/resources/page.tsx](app/resources/page.tsx) | PUBLIC_MARKETING | |
| [app/resources/platform-guide/page.tsx](app/resources/platform-guide/page.tsx) | PUBLIC_MARKETING | |
| [app/resources/trading-guides/page.tsx](app/resources/trading-guides/page.tsx) | PUBLIC_MARKETING | |
| [app/compliance-hub/page.tsx](app/compliance-hub/page.tsx) | PUBLIC_MARKETING | |

### 1.2 Legal / Compliance (anonymous)

| Page | Class |
|---|---|
| [app/disclaimer/page.tsx](app/disclaimer/page.tsx) | PUBLIC_MARKETING |
| [app/privacy/page.tsx](app/privacy/page.tsx) | PUBLIC_MARKETING |
| [app/terms/page.tsx](app/terms/page.tsx) | PUBLIC_MARKETING |
| [app/refund-policy/page.tsx](app/refund-policy/page.tsx) | PUBLIC_MARKETING |
| [app/cookie-policy/page.tsx](app/cookie-policy/page.tsx) | PUBLIC_MARKETING |
| [app/legal/cookie-policy/page.tsx](app/legal/cookie-policy/page.tsx) | PUBLIC_MARKETING | **DUPE** of /cookie-policy |
| [app/legal/privacy/page.tsx](app/legal/privacy/page.tsx) | PUBLIC_MARKETING | **DUPE** of /privacy |
| [app/legal/refund-policy/page.tsx](app/legal/refund-policy/page.tsx) | PUBLIC_MARKETING | **DUPE** |
| [app/legal/terms/page.tsx](app/legal/terms/page.tsx) | PUBLIC_MARKETING | **DUPE** |

> ⚠️ Legal pages exist at both `/legal/*` and `/{policy}` — pick one canonical path (likely `/legal/*`) and redirect the other set in middleware. Two indexable copies = SEO duplicate-content risk and divergence risk.

### 1.3 Auth + Account

| Page | Class |
|---|---|
| [app/auth/page.tsx](app/auth/page.tsx) | PUBLIC_MARKETING (login/start) |
| [app/auth/verify/page.tsx](app/auth/verify/page.tsx) | PUBLIC_MARKETING (magic-link land) |
| [app/after-checkout/page.tsx](app/after-checkout/page.tsx) | AUTH_REQUIRED_TOOL |
| [app/account/page.tsx](app/account/page.tsx) | AUTH_REQUIRED_TOOL |
| [app/dashboard/page.tsx](app/dashboard/page.tsx) | AUTH_REQUIRED_TOOL |

### 1.4 Educational tools (anonymous-safe surfaces)

These render without auth but the API routes behind them are gated. Confirm each truly degrades to "no personal data" not "no data at all".

| Page | Class | Notes |
|---|---|---|
| [app/tools/page.tsx](app/tools/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | tools index |
| [app/tools/news/page.tsx](app/tools/news/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/economic-calendar/page.tsx](app/tools/economic-calendar/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | api unauth |
| [app/tools/earnings-calendar/page.tsx](app/tools/earnings-calendar/page.tsx) | UNKNOWN_REVIEW_REQUIRED | api auth status TBD |
| [app/tools/heatmap/page.tsx](app/tools/heatmap/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/market-movers/page.tsx](app/tools/market-movers/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | api unauth |
| [app/tools/markets/page.tsx](app/tools/markets/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/macro/page.tsx](app/tools/macro/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/crypto/page.tsx](app/tools/crypto/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/crypto-dashboard/page.tsx](app/tools/crypto-dashboard/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/crypto-explorer/page.tsx](app/tools/crypto-explorer/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/crypto-heatmap/page.tsx](app/tools/crypto-heatmap/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |
| [app/tools/crypto-time-confluence/page.tsx](app/tools/crypto-time-confluence/page.tsx) | PUBLIC_EDUCATIONAL_TOOL | |

### 1.5 Auth-required tools

| Page | Class | Notes |
|---|---|---|
| [app/tools/dashboard/page.tsx](app/tools/dashboard/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/scanner/page.tsx](app/tools/scanner/page.tsx) | AUTH_REQUIRED_TOOL | core scanner |
| [app/tools/confluence-scanner/page.tsx](app/tools/confluence-scanner/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/time-scanner/page.tsx](app/tools/time-scanner/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/explorer/page.tsx](app/tools/explorer/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/equity-explorer/page.tsx](app/tools/equity-explorer/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/intraday-charts/page.tsx](app/tools/intraday-charts/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/company-overview/page.tsx](app/tools/company-overview/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/gainers-losers/page.tsx](app/tools/gainers-losers/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/earnings/page.tsx](app/tools/earnings/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/commodities/page.tsx](app/tools/commodities/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/crypto-intel/page.tsx](app/tools/crypto-intel/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/crypto-terminal/page.tsx](app/tools/crypto-terminal/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/options/page.tsx](app/tools/options/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/options-confluence/page.tsx](app/tools/options-confluence/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/options-flow/page.tsx](app/tools/options-flow/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/portfolio/page.tsx](app/tools/portfolio/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/journal/page.tsx](app/tools/journal/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/alerts/page.tsx](app/tools/alerts/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/watchlists/page.tsx](app/tools/watchlists/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/workspace/page.tsx](app/tools/workspace/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/settings/page.tsx](app/tools/settings/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/referrals/page.tsx](app/tools/referrals/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/research/page.tsx](app/tools/research/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/signal-accuracy/page.tsx](app/tools/signal-accuracy/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/ai-tools/page.tsx](app/tools/ai-tools/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/liquidity-sweep/page.tsx](app/tools/liquidity-sweep/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/golden-egg/page.tsx](app/tools/golden-egg/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/terminal/page.tsx](app/tools/terminal/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/options-terminal/page.tsx](app/tools/options-terminal/page.tsx) | AUTH_REQUIRED_TOOL | |
| [app/tools/scalper/page.tsx](app/tools/scalper/page.tsx) | UNKNOWN_REVIEW_REQUIRED | gate TBD (admin scalper exists) |

### 1.6 Pro / Pro-Trader gated

These need explicit `useUserTier()` checks; verify in Phase 2.

| Page | Class | Reason |
|---|---|---|
| [app/tools/ai-analyst/page.tsx](app/tools/ai-analyst/page.tsx) | PRO_ONLY | GPT analyst (50 q/d) |
| [app/tools/deep-analysis/page.tsx](app/tools/deep-analysis/page.tsx) | PRO_ONLY | LLM deep dive |
| [app/tools/backtest/page.tsx](app/tools/backtest/page.tsx) | PRO_TRADER_ONLY | per copilot-instructions |
| [app/tools/scanner/backtest/page.tsx](app/tools/scanner/backtest) | PRO_TRADER_ONLY | |
| [app/tools/volatility-engine/page.tsx](app/tools/volatility-engine/page.tsx) | UNKNOWN_REVIEW_REQUIRED | tier TBD |

### 1.7 Operator / Quant (semi-internal)

These are user-visible but operate on operator-scoped data. Need verification that `isOperator(cid, workspaceId)` gate is enforced.

| Page | Class |
|---|---|
| [app/operator/page.tsx](app/operator/page.tsx) | UNKNOWN_REVIEW_REQUIRED |
| [app/operator/engine/page.tsx](app/operator/engine/page.tsx) | UNKNOWN_REVIEW_REQUIRED |
| [app/quant/page.tsx](app/quant/page.tsx) | UNKNOWN_REVIEW_REQUIRED |

### 1.8 Admin only (`/admin/*`, all gated by [app/admin/layout.tsx](app/admin/layout.tsx))

All entries below are **ADMIN_ONLY**. Recently audited pages marked ✅.

| Page | Status |
|---|---|
| [app/admin/page.tsx](app/admin/page.tsx) | landing |
| [app/admin/commander/page.tsx](app/admin/commander/page.tsx) | |
| [app/admin/morning-brief/page.tsx](app/admin/morning-brief/page.tsx) | |
| [app/admin/operator-terminal/page.tsx](app/admin/operator-terminal/page.tsx) | |
| [app/admin/symbol/[symbol]/page.tsx](app/admin/symbol) | dynamic |
| [app/admin/terminal/[symbol]/page.tsx](app/admin/terminal) | legacy dynamic |
| [app/admin/opportunity-board/page.tsx](app/admin/opportunity-board/page.tsx) | ✅ hydration fixed |
| [app/admin/live-scanner/page.tsx](app/admin/live-scanner/page.tsx) | ✅ |
| [app/admin/scalper/page.tsx](app/admin/scalper/page.tsx) | ✅ +PriceLadder |
| [app/admin/quant/page.tsx](app/admin/quant/page.tsx) | ✅ |
| [app/admin/outcomes/page.tsx](app/admin/outcomes/page.tsx) | ✅ |
| [app/admin/outcomes/scorecard/page.tsx](app/admin/outcomes/scorecard/page.tsx) | UNKNOWN_REVIEW_REQUIRED |
| [app/admin/priority-desk/page.tsx](app/admin/priority-desk/page.tsx) | ✅ |
| [app/admin/research-scheduler/page.tsx](app/admin/research-scheduler/page.tsx) | ✅ |
| [app/admin/journal-learning/page.tsx](app/admin/journal-learning/page.tsx) | ✅ |
| [app/admin/backtest-lab/page.tsx](app/admin/backtest-lab/page.tsx) | ✅ |
| [app/admin/risk/page.tsx](app/admin/risk/page.tsx) | ✅ |
| [app/admin/alerts/page.tsx](app/admin/alerts/page.tsx) | ✅ |
| [app/admin/discord-bridge/page.tsx](app/admin/discord-bridge/page.tsx) | ✅ |
| [app/admin/reporting/page.tsx](app/admin/reporting/page.tsx) | ✅ Nasdaq |
| [app/admin/usage-analytics/page.tsx](app/admin/usage-analytics/page.tsx) | ✅ |
| [app/admin/income/page.tsx](app/admin/income/page.tsx) | ✅ |
| [app/admin/costs/page.tsx](app/admin/costs/page.tsx) | ✅ AI Cost Tracker |
| [app/admin/subscriptions/page.tsx](app/admin/subscriptions/page.tsx) | ✅ |
| [app/admin/ai-usage/page.tsx](app/admin/ai-usage/page.tsx) | ✅ |
| [app/admin/trials/page.tsx](app/admin/trials/page.tsx) | pending |
| [app/admin/delete-requests/page.tsx](app/admin/delete-requests/page.tsx) | pending |
| [app/admin/data-health/page.tsx](app/admin/data-health/page.tsx) | pending |
| [app/admin/model-diagnostics/page.tsx](app/admin/model-diagnostics/page.tsx) | pending |
| [app/admin/diagnostics/page.tsx](app/admin/diagnostics/page.tsx) | legacy, pending |
| [app/admin/system/page.tsx](app/admin/system/page.tsx) | legacy, pending |
| [app/admin/logs/page.tsx](app/admin/logs/page.tsx) | pending |
| [app/admin/settings/page.tsx](app/admin/settings/page.tsx) | pending |

### 1.9 Experimental / staging (`/v2/*`)

| Page | Class | Notes |
|---|---|---|
| [app/v2/page.tsx](app/v2/page.tsx) | UNKNOWN_REVIEW_REQUIRED | Decide: keep, gate, or remove before launch |
| [app/v2/scanner/page.tsx](app/v2/scanner/page.tsx) | UNKNOWN_REVIEW_REQUIRED | same |

> ⚠️ `/v2/*` should not be indexed publicly without classification. Decision needed: ship, hide behind admin, or block in `robots.ts`.

---

## 2. API routes (`app/api/**/route.ts`)

288 total. Auth-pattern survey (grep for `requireAdmin | getSessionFromCookie | CRON_SECRET | verifyAdminBearer`):

- **Has admin check** — `requireAdmin` / `verifyAdminBearer` / `verifyAdminRequest`
- **Has session check** — `getSessionFromCookie` (workspace-scoped)
- **Has CRON_SECRET** — Render scheduled jobs
- **No auth signal** — 43 routes (table below)

### 2.1 Admin API (all under `app/api/admin/*`)

All **ADMIN_ONLY** — verified: every file in `app/api/admin/` imports `requireAdmin` (35 files including subroutes).

```
admin/ai-usage, arca, backtest-lab, cg-usage, check-db, contest, costs,
data-health, delete-requests, diagnostics/scanners, discord/test,
discord-bridge, income, journal-learning, model-diagnostics,
morning-brief (+ actions, feedback), opportunities, priority-desk,
reporting, research-alerts, research-cases, research-events,
research-packet, research-scheduler, risk/state, scanner/live,
signals (+ scorecard, stats), stats, subscriptions, symbol/[symbol],
sync-stripe, system/health, trials, usage-analytics, verify
```

### 2.2 Auth / session

| Route | Class |
|---|---|
| [app/api/auth/login/route.ts](app/api/auth/login/route.ts) | PUBLIC_API (issues session) |
| [app/api/auth/logout/route.ts](app/api/auth/logout/route.ts) | PUBLIC_API |
| [app/api/auth/session/route.ts](app/api/auth/session/route.ts) | PUBLIC_API (verifies token) |
| [app/api/auth/magic-link/route.ts](app/api/auth/magic-link/route.ts) | PUBLIC_API (rate-limit important) |
| [app/api/auth/magic-link/verify/route.ts](app/api/auth/magic-link/verify/route.ts) | PUBLIC_API |
| [app/api/auth/admin-login/route.ts](app/api/auth/admin-login/route.ts) | PUBLIC_API → admin token |
| [app/api/auth/health/route.ts](app/api/auth/health/route.ts) | PUBLIC_API health |
| [app/api/auth/debug/route.ts](app/api/auth/debug/route.ts) | ADMIN_ONLY (CRON_SECRET / ADMIN_SECRET gated, comment confirms) |
| [app/api/auth/delete-request/route.ts](app/api/auth/delete-request/route.ts) | INTERNAL_API |

### 2.3 Webhooks

| Route | Class |
|---|---|
| [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts) | WEBHOOK (Stripe signature) |
| [app/api/ai-scanner/alert/route.ts](app/api/ai-scanner/alert/route.ts) | WEBHOOK (TradingView, body `secret` field) |
| [app/api/stripe/confirm/route.ts](app/api/stripe/confirm/route.ts) | WEBHOOK |

### 2.4 Cron (CRON_SECRET-protected)

| Route | Class |
|---|---|
| [app/api/cron/label-ai-outcomes/route.ts](app/api/cron/label-ai-outcomes/route.ts) | CRON_INTERNAL |
| [app/api/jobs/email-daily-review/route.ts](app/api/jobs/email-daily-review/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/email-morning-brief/route.ts](app/api/jobs/email-morning-brief/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/generate-market-focus/route.ts](app/api/jobs/generate-market-focus/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/journal-auto-close/route.ts](app/api/jobs/journal-auto-close/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/learning-outcomes/route.ts](app/api/jobs/learning-outcomes/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/opportunity-scan/route.ts](app/api/jobs/opportunity-scan/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/quant-scan/route.ts](app/api/jobs/quant-scan/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/scan-daily/route.ts](app/api/jobs/scan-daily/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/scan-universe/route.ts](app/api/jobs/scan-universe/route.ts) | CRON_INTERNAL (verify) |
| [app/api/jobs/signal-lifecycle/route.ts](app/api/jobs/signal-lifecycle/route.ts) | CRON_INTERNAL (verify) |
| [app/api/catalyst/study/compute/route.ts](app/api/catalyst/study/compute/route.ts) | CRON_INTERNAL |

### 2.5 Internal (session-gated, workspace-scoped)

Confirmed via grep — sample (235 files use `getSessionFromCookie`):

```
adaptive/profile, ai/* (accuracy, actions, analyst-context, context,
copilot, events, explain, feedback, memory, suggest), ai-market-focus,
ai-signals, alerts/* (acknowledge, check, create-from-focus, debug,
history, recent, signal-check, smart-check, strategy-check,
test-trigger, unread), alerts (root), analyst-ratings, backtest/*,
bars, cached/* (most), catalyst/* (events, ingest, study),
command-hub/summary, commodities, company-overview, confluence-scan,
context/heartbeat, correlation, correlation-regime, crypto-derivatives*,
crypto/* (most authed), deep-analysis, disclosure/*, doctrine/*,
dve, earnings*, economic-indicators, economics, edge-profile,
equity/detail, evolution, execute-trade (sim only), favorites,
fear-greed/stocks, flow*, fundamentals, golden-egg, insider-transactions,
institutional-holdings, intelligence/*, internal/verify-tier, intraday,
ipo-calendar, journal/*, liquidity-sweep, long-short-ratio,
market-focus/*, market-pressure, market-status, me, msp-analyst,
news-sentiment, notifications/*, onboarding/progress, operator/*,
options* (chain, expirations, gex, scan, flow), payments/portal,
plans/draft-from-focus, portfolio/*, probability-matrix, push/subscribe,
quant/*, quote, referral/*, regime, regime-engine, research-case,
risk/governor/*, scalper/run, scanner/* (bulk, quotes, run, top-cached),
sectors/heatmap, sse/stream, stablecoin-liquidity, state-machine,
subscription/update, suggestions/*, symbol-search, terminal/futures,
test-email, time-gravity-map, trade-proposal, trades/close, upe/*,
user/settings, watchlists/*, workflow/*
```

### 2.6 Public API (anonymous-allowed, market data only)

These return public market data without identifying any user. Confirm none echo session info.

| Route | Class | Verified |
|---|---|---|
| [app/api/health/route.ts](app/api/health/route.ts) | PUBLIC_API | ✓ health |
| [app/api/health/data/route.ts](app/api/health/data/route.ts) | PUBLIC_API | ✓ |
| [app/api/health/status/route.ts](app/api/health/status/route.ts) | PUBLIC_API | ✓ |
| [app/api/env-check/route.ts](app/api/env-check/route.ts) | UNKNOWN_REVIEW_REQUIRED | ⚠️ must not leak env names |
| [app/api/entitlements/route.ts](app/api/entitlements/route.ts) | UNKNOWN_REVIEW_REQUIRED | should require session |
| [app/api/fear-greed/route.ts](app/api/fear-greed/route.ts) | PUBLIC_API | aggregated |
| [app/api/fear-greed-custom/route.ts](app/api/fear-greed-custom/route.ts) | PUBLIC_API | aggregated |
| [app/api/funding-rates/route.ts](app/api/funding-rates/route.ts) | PUBLIC_API | crypto aggregate |
| [app/api/open-interest/route.ts](app/api/open-interest/route.ts) | PUBLIC_API | crypto aggregate |
| [app/api/market-movers/route.ts](app/api/market-movers/route.ts) | PUBLIC_API | |
| [app/api/economic-calendar/route.ts](app/api/economic-calendar/route.ts) | PUBLIC_API | |
| [app/api/midpoints/route.ts](app/api/midpoints/route.ts) | UNKNOWN_REVIEW_REQUIRED | ⚠️ writes? confirm GET-only or auth |
| [app/api/options/route.ts](app/api/options/route.ts) | PUBLIC_API (deprecated 301) |
| [app/api/crypto-time-confluence/route.ts](app/api/crypto-time-confluence/route.ts) | PUBLIC_API | |
| [app/api/crypto/pool-pressure/route.ts](app/api/crypto/pool-pressure/route.ts) | PUBLIC_API | |
| [app/api/cached/* (7 routes)](app/api/cached) | PUBLIC_API | confirm none expose user-keyed data |
| [app/api/scanner/candidates/route.ts](app/api/scanner/candidates/route.ts) | PUBLIC_API | research observations |
| [app/api/scanner/daily-picks/route.ts](app/api/scanner/daily-picks/route.ts) | PUBLIC_API | nightly picks |
| [app/api/doctrine/playbooks/route.ts](app/api/doctrine/playbooks/route.ts) | UNKNOWN_REVIEW_REQUIRED | ⚠️ file appears corrupted (box-drawing chars in head) |
| [app/api/payments/checkout/route.ts](app/api/payments/checkout/route.ts) | PUBLIC_API (Stripe Checkout init) |
| [app/api/referral/track/route.ts](app/api/referral/track/route.ts) | PUBLIC_API | track click |

### 2.7 Migrations / one-off ops

| Route | Class |
|---|---|
| [app/api/migrations/daily-picks/route.ts](app/api/migrations/daily-picks/route.ts) | ADMIN_ONLY (`isValidAdminSecret` gated) |
| [app/api/migrations/market-focus/route.ts](app/api/migrations/market-focus/route.ts) | UNKNOWN_REVIEW_REQUIRED |

### 2.8 Notifications / push

| Route | Class |
|---|---|
| [app/api/push/subscribe/route.ts](app/api/push/subscribe/route.ts) | INTERNAL_API |
| [app/api/push/test/route.ts](app/api/push/test/route.ts) | INTERNAL_API |
| [app/api/push/send/route.ts](app/api/push/send/route.ts) | INTERNAL_API (Bearer internal key) |
| [app/api/notifications/route.ts](app/api/notifications/route.ts) | INTERNAL_API |

---

## 3. Shared layouts & middleware

| File | Role |
|---|---|
| [app/layout.tsx](app/layout.tsx) | Root layout — header/footer/cookie/auth providers |
| [app/admin/layout.tsx](app/admin/layout.tsx) | Admin shell (`useAdmin` ctx, gates entire `/admin/*` tree) |
| [middleware.ts](middleware.ts) | Edge: host redirect, session refresh (HMAC Web Crypto) |

---

## 4. Shared auth/data libs

| File | Role |
|---|---|
| [lib/auth.ts](lib/auth.ts) | JWT sign/verify (Node), `getSessionFromCookie()` |
| [lib/adminAuth.ts](lib/adminAuth.ts) | `requireAdmin()`, `verifyAdminAuth`, `verifyAdminRequest`, `isValidAdminSecret`, admin session cookie |
| [lib/jwt.ts](lib/jwt.ts) | low-level JWT helpers |
| [lib/stripe.ts](lib/stripe.ts) | Stripe SDK |
| [lib/db.ts](lib/db.ts) | `q()` pg pool helper |
| [lib/entitlements.ts](lib/entitlements.ts) | tier resolution (Stripe ↔ DB) |
| [lib/useUserTier.ts](lib/useUserTier.ts) | client tier hook |
| [lib/UserTierProvider.tsx](lib/UserTierProvider.tsx) | provider |
| [lib/proTraderAccess.ts](lib/proTraderAccess.ts) | server feature-gate |
| [lib/admin/hooks.ts](lib/admin) | `adminFetch()` wrapper (already audited, has credentials/Bearer) |
| [lib/dataFreshness.ts](lib/dataFreshness.ts) | freshness markers (data-integrity rule) |
| [lib/dataQuality.ts](lib/dataQuality.ts) | evidence-quality calculations |
| [lib/compliance/](lib/compliance) | scanner compliance metadata |
| [lib/coingecko.ts](lib/coingecko.ts) | coingecko provider |
| [lib/finnhub.ts](lib/finnhub.ts) | finnhub provider |
| [lib/yahoo-finance.ts](lib/yahoo-finance.ts) | yahoo provider |
| [lib/avRateGovernor.ts](lib/avRateGovernor.ts) | Alpha Vantage rate limiter |
| [lib/cors.ts](lib/cors.ts) | CORS helper |
| [lib/rateLimit.ts](lib/rateLimit.ts) / [lib/rateLimiter.ts](lib/rateLimiter.ts) | two implementations — verify which is canonical |

> ⚠️ **Two rate-limit modules** (`rateLimit.ts` and `rateLimiter.ts`) — likely a refactor stub. Confirm one canonical and remove or alias the other.

---

## 5. Shared UI components (selected high-risk)

These components either render data directly to admins/operators or render mixed public/private surfaces. Each must be re-verified in Phase 5 (no public leakage).

| Component | Risk |
|---|---|
| [components/admin/](components/admin) | Admin-only widgets — must never be imported on public pages |
| [components/operator/](components/operator) | Operator-only — same |
| [components/MSPCopilot.tsx](components/MSPCopilot.tsx) | LLM copilot — confirm it never echoes admin scoring or watchlist |
| [components/DailyAIMarketFocus.tsx](components/DailyAIMarketFocus.tsx) | AI focus card — must strip admin private fields |
| [components/risk/](components/risk) | Risk widgets — must respect tier gating |
| [components/StaleDataBanner.tsx](components/StaleDataBanner.tsx) | data-integrity surface |
| [components/intelligence/](components/intelligence) | Internal intelligence — admin/operator only |
| [components/UpgradeGate.tsx](components/UpgradeGate.tsx) | gating UX |
| [components/DisclosureGate.tsx](components/DisclosureGate.tsx) | disclosure flow |
| [components/markets/](components/markets), [components/scanner/](components/scanner), [components/options/](components/options), [components/journal/](components/journal), [components/backtest/](components/backtest), [components/terminal/](components/terminal) | tool widgets |

---

## 6. Items flagged UNKNOWN_REVIEW_REQUIRED

These need explicit human/agent review before launch:

1. **`/legal/*` vs `/{policy}` duplication** — pick canonical path, redirect the other.
2. **`/v2/*` pages** — index in robots? gate behind admin? remove?
3. **`app/tools/scalper/page.tsx`** — public/auth/admin classification (admin scalper exists separately).
4. **`app/tools/volatility-engine/page.tsx`** — tier classification.
5. **`app/tools/earnings-calendar/page.tsx`** — backing API auth status.
6. **`app/operator/page.tsx`, `app/operator/engine/page.tsx`, `app/quant/page.tsx`** — operator/quant gating verification.
7. **`app/admin/outcomes/scorecard/page.tsx`** — confirm admin layout coverage and audit.
8. **`/api/env-check`** — must not leak secret names; confirm read-only safe payload.
9. **`/api/entitlements`** — must require a session; verify it does not echo other workspace data.
10. **`/api/midpoints`** — confirm GET-only or that POST mutations are auth-gated.
11. **`/api/doctrine/playbooks`** — file head looks corrupted; needs visual inspection.
12. **`/api/migrations/market-focus`** — verify admin gating; never indexable.
13. **Two rate-limit libraries** — pick canonical, remove the other.
14. **All admin pages not yet audited:** trials, delete-requests, data-health, model-diagnostics, diagnostics, system, logs, settings.

---

## 7. Recommended Phase ordering (next steps)

1. **Phase 2 — Auth boundary audit** of every UNKNOWN_REVIEW_REQUIRED item above.
2. **Phase 3 — API workspace isolation** spot-check (random sample of 20 internal routes for `WHERE workspace_id = $1` enforcement).
3. **Phase 4 — Data integrity** — confirm `lib/dataFreshness.ts` markers wired into every panel surface (especially crypto and options where stale-data risk is highest).
4. **Phase 5 — Public/private leakage** — grep for admin score names (`opportunity_score`, `evidence_quality`, `personal_exposure`) on any non-admin page or non-admin API.
5. **Phase 6 — Accessibility/consistency** — `aria-*`, focus rings, color-contrast, mobile breakpoints.
6. **Phase 7 — Final polish** — fix safe items, list risky items for manual review, capture in `LAUNCH_READINESS_AUDIT_2026.md`.
