# MarketScanner Pros — Comprehensive Security Audit Report

**Audit Date:** June 2025  
**Scope:** API Route Authentication, Rate Governor, Middleware, Auth Library  
**Platform:** Next.js App Router (176 API routes)

---

## Executive Summary

| Metric | Value |
|---|---|
| Total API routes | **176** |
| Routes with `getSessionFromCookie` auth | **99** (56%) |
| Routes without `getSessionFromCookie` | **77** (44%) |
| Routes protected by alternative auth | ~55 of 77 |
| **Genuinely unprotected routes** | **~22** |
| Routes querying DB without `workspace_id` | **25** |
| Critical findings | **3** |
| High findings | **4** |
| Medium findings | **5** |
| Low findings | **3** |

---

## Part 1: API Route Authentication Audit

### 1.1 Auth Coverage Breakdown

Of the 77 routes without `getSessionFromCookie`, they break down as follows:

#### ✅ Properly Protected via Alternative Auth (55 routes)

| Auth Mechanism | Count | Routes |
|---|---|---|
| `ADMIN_SECRET` (Bearer + `timingSafeCompare`) | 10 | `admin/ai-usage`, `admin/check-db`, `admin/costs`, `admin/delete-requests`, `admin/income`, `admin/reporting`, `admin/stats`, `admin/subscriptions`, `admin/trials`, `admin/verify` |
| `x-cron-secret` / Bearer CRON_SECRET | ~15 | `alerts/check`, `alerts/signal-check`, `alerts/smart-check`, `alerts/strategy-check`, `jobs/scan-daily`, `jobs/scan-universe`, `jobs/generate-market-focus`, `jobs/journal-auto-close`, `catalyst/study/compute`, + others |
| `INTERNAL_API_KEY` or `ADMIN_SECRET` | 1 | `push/send` |
| `TRADINGVIEW_WEBHOOK_SECRET` | 4 | `ai-scanner/test`, `ai-scanner/tv-webhook`, and related |
| `verifyBearer` (jose JWT) | 1 | `entitlements` |
| Stripe webhook signature | 2 | `webhooks/stripe`, `payments/webhook` |
| Pre-auth / auth flow routes | 6 | `auth/login`, `auth/session`, `auth/magic-link`, `auth/magic-link/verify`, `auth/health`, `auth/debug` |
| Disabled (410 Gone) | 2 | `app-token`, `etf` |
| Deprecated redirect | 1 | `options` |
| Health check / env check | 2 | `health`, `env-check` (env-check protected by ADMIN_SECRET in production) |
| Public market data only (no user data, no DB writes) | ~11 | See §1.2 |

#### ⚠️ Public Market Data Routes — No Auth, Acceptable Risk (~11 routes)

These routes return aggregated, non-user-specific market data from external APIs (Alpha Vantage, CoinGecko). No user data is exposed, no DB writes occur.

`commodities`, `company-overview`, `fear-greed`, `fear-greed-custom`, `funding-rates`, `long-short-ratio`, `market-movers`, `open-interest`, `analyst-ratings`, `earnings-calendar`, `economic-calendar`

Plus ~12 `crypto/*` routes: `categories`, `defi`, `defi-stats`, `dex-pools`, `heatmap`, `liquidations`, `market-overview`, `new-listings`, `new-pools`, `open-interest`, `search`, `top-movers`, `trending`, `trending-pools`

**Risk:** These are abuse vectors for scrapers but contain no sensitive data.

#### 🔴 GENUINELY UNPROTECTED — Security Holes (~6 routes)

| Route | HTTP Method | Risk | Details |
|---|---|---|---|
| **`subscription/update`** | POST | **CRITICAL** | **No auth whatsoever.** Writes directly to `user_subscriptions` table. Anyone can POST a `stripeSubscriptionId`, `customerEmail`, and `planType` to activate or cancel subscriptions. Uses a non-standard `createClient` instead of the shared `q()` helper. |
| **`auth/debug`** | POST | **HIGH** | **No auth.** Accepts any email, queries Stripe API, returns `customerId`, `subscriptionCount`, `priceIds`, and even **internal env var names** (`STRIPE_PRO_PRICE_ID`, etc.). Information disclosure + enumeration vector. |
| **`jobs/learning-outcomes`** | POST | **HIGH** | **No inbound auth.** The route only uses `CRON_SECRET` in *outbound* calls to other routes. The POST handler itself has zero auth. Processes and writes to `learning_predictions` table. |
| **`scanner/daily-picks`** | GET | **MEDIUM** | No auth. Reads from `daily_picks` table. Non-sensitive aggregated data, but still reads from the production database without any access control. |
| **`backtest/symbol-range`** | GET | **LOW** | No auth. Reads from `symbol_universe` and `daily_ohlc` tables (shared market data). No user data but provides internal data availability info. |
| **`migrations/daily-picks`** | POST | **MEDIUM** | Uses admin key via query parameter (`?key=`), which is logged in URL access logs. Also bypasses in `FREE_FOR_ALL_MODE`. Runs DDL migrations on production tables. |

#### ⚠️ Conditionally Protected — Fail-Open Risk (~5 routes)

These routes only enforce auth **if** the `CRON_SECRET` environment variable is set. If it's ever unset or empty, they become publicly accessible:

- `jobs/generate-market-focus`
- `jobs/scan-universe`
- `jobs/scan-daily`
- `jobs/journal-auto-close`
- `migrations/market-focus` (also bypasses if `FREE_FOR_ALL_MODE` is true)

**Pattern observed:**
```typescript
const cronSecret = process.env.CRON_SECRET;
if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
// If CRON_SECRET is empty/undefined → falls through to handler
```

### 1.2 Tenant Isolation Audit — `workspace_id` Filtering

**25 routes query the database without `workspace_id` in WHERE clauses.**

| Category | Count | Assessment |
|---|---|---|
| Admin routes (cross-tenant by design) | 4 | `admin/delete-requests`, `admin/income`, `admin/reporting`, `admin/trials` — Protected by `ADMIN_SECRET`, expected behavior |
| Shared market data tables | 11 | `cached/*`, `jobs/*`, `migrations/*`, `scanner/daily-picks` — Query `daily_picks`, `symbol_universe`, `daily_market_focus` which are global tables, not user-scoped |
| **CONCERNING** | 10 | `ai/accuracy`, `ai-market-focus`, `backtest/symbol-range`, `bars`, `catalyst/events`, `catalyst/study`, `catalyst/study/compute`, `confluence-scan`, `flow`, `market-focus/generate` |

**Note on "Concerning" routes:** Several of these (like `ai/accuracy`) DO use `getSessionFromCookie` for auth but query tables like `learning_predictions` and `learning_signals` that lack `workspace_id` columns entirely. This means **all users' AI learning data is co-mingled** without tenant isolation. While the data isn't sensitive (it's AI prediction accuracy on market data), it's an architectural gap.

---

## Part 2: Rate Governor Audit (`lib/avRateGovernor.ts`)

### 2.1 Architecture

| Property | Value |
|---|---|
| Implementation | In-memory `TokenBucket` singleton |
| Default RPM | 400 (web), 200 (worker — separate bucket) |
| Contract limit | 600 RPM total |
| Burst capacity | `min(RPM, 15)` tokens |
| Refill rate | RPM / 60 tokens/second |
| Persistence | **None** — in-memory only |
| Cross-instance coordination | **None** |

### 2.2 Coverage

Routes confirmed to use `avFetch()` or `avTakeToken()`:

`backtest`, `scanner/run`, `scanner/quotes`, `scanner/bulk`, `sectors/heatmap`, `quote`, `options-scan`, `options/expirations`, `news-sentiment`, `market-status`, `market-focus/candidates`, `jobs/scan-daily`, `intraday`, `insider-transactions`, `fundamentals`, `flow`, `fear-greed/stocks`, `equity/detail`, `economics`, `economic-indicators`, `earnings-calendar`, `earnings`, `deep-analysis`, `company-overview`, `commodities`

**~25 routes** use the rate governor. This appears to cover all Alpha Vantage consuming routes.

### 2.3 Findings

| # | Severity | Finding |
|---|---|---|
| RG-1 | **MEDIUM** | **No cross-instance coordination.** Each serverless instance gets its own `TokenBucket`. Under Vercel's serverless model, N concurrent instances × 400 RPM = up to N×400 actual API calls. With the 600 RPM contract limit, even 2 instances can exceed the quota. |
| RG-2 | **MEDIUM** | **Resets on cold start.** Token bucket state is lost on every deploy, scaling event, or cold start. After a redeploy, all instances simultaneously have full burst allowance (15 tokens each). |
| RG-3 | **LOW** | **Observability counters are per-process only.** `callCountWindow` resets every deploy and isn't visible in any dashboard. No persistent metrics or alerting. |
| RG-4 | **INFO** | **No fallback for AV 200-status errors.** `avFetch()` correctly detects AV's `Note`, `Error Message`, and `Information` responses (which arrive as HTTP 200) but returns `null` — callers must handle this gracefully. No automatic retry or backoff. |

### 2.4 Recommendation

For a multi-instance deployment, move the rate limiter to a shared store (Redis `INCR` with TTL, or Vercel KV). The current design is safe **only** if the app consistently runs on a single instance.

---

## Part 3: Middleware Audit

### 3.1 Overview

The middleware runs on the **Edge runtime** and matches all paths (`/:path*`). It performs two functions:

1. **IP-based rate limiting** for `/api/*` routes (excluding `/api/webhooks`)
2. **Session cookie auto-refresh** when token has < 3 days remaining

**Source note:** No `middleware.ts` source file exists in the repository. The middleware was extracted from the compiled build output at `.next/server/chunks/`.

### 3.2 IP Rate Limiting

| Property | Value |
|---|---|
| Limit | 300 requests per 60 seconds per IP |
| Storage | In-memory `Map` |
| Cleanup | Every 5 minutes, entries older than 5 minutes are purged |
| IP extraction | `x-forwarded-for` (first entry) → `x-real-ip` → `0.0.0.0` |
| Excluded | `/api/webhooks/*` |

### 3.3 Findings

| # | Severity | Finding |
|---|---|---|
| MW-1 | **MEDIUM** | **In-memory rate limiter doesn't persist across instances.** Same as RG-1: each Edge instance has its own Map. An attacker can bypass rate limiting by hitting different instances. |
| MW-2 | **MEDIUM** | **IP spoofing via `x-forwarded-for`.** The middleware trusts `x-forwarded-for` header without validation. Behind Vercel's CDN this is typically safe (Vercel overwrites it), but if the app is ever deployed behind a different proxy, this becomes trivially bypassable. |
| MW-3 | **HIGH** | **Middleware does NOT enforce authentication.** It only *refreshes* existing valid sessions. Unauthenticated requests pass through to all routes unchallenged. There is no global auth gate — each API route must independently verify authentication. |
| MW-4 | **LOW** | **Fallback IP `0.0.0.0`.** If both headers are missing, all requests without IP info share a single rate limit bucket, causing legitimate requests to be rate-limited together. |
| MW-5 | **INFO** | **Session refresh writes a new cookie with `secure: true, sameSite: "lax"`.** These settings are appropriate for the use case. Cookie domain is not explicitly set (defaults to request origin). |

### 3.4 Critical Gap

The middleware provides **no route protection**. It is purely an optimization layer (rate limiting + session refresh). All authentication enforcement is delegated to individual route handlers, which creates the unprotected routes identified in Part 1.

---

## Part 4: Auth Library Audit (`lib/auth.ts` + `lib/jwt.ts`)

### 4.1 `lib/auth.ts` — Primary Session Auth

```
verify() → used by getSessionFromCookie()
signToken() → used to create session cookies
verifyToken() → separate implementation with different secret source
hashWorkspaceId() → deterministic SHA256 → UUID format
```

### 4.2 Findings

| # | Severity | Finding |
|---|---|---|
| AUTH-1 | **CRITICAL** | **Timing attack vulnerability in `verify()`.** Uses `sig !== expected` (JavaScript string comparison) instead of `crypto.timingSafeEqual()`. This is the **primary session verification function** used by `getSessionFromCookie()` which protects 99 routes. An attacker could theoretically extract valid HMAC signatures byte-by-byte via timing side-channel. |
| AUTH-2 | **HIGH** | **Duplicate `verifyToken()` with inconsistent secret source.** A second verification function exists with a minified inline `secret()` helper that falls back to `NEXTAUTH_SECRET`. This creates two different trust domains — tokens signed with `APP_SIGNING_SECRET` may not verify under `NEXTAUTH_SECRET` and vice versa. |
| AUTH-3 | **MEDIUM** | **`verifyToken()` also has timing vulnerability.** Same `expSig !== sig` comparison without timing-safe equality. |
| AUTH-4 | **LOW** | **No token revocation mechanism.** Once a session token is issued, it cannot be revoked until natural expiry (7 days). A compromised session will remain valid. |

### 4.3 `lib/jwt.ts` — Secondary JWT System (jose)

Used only by `entitlements` route via `verifyBearer()`.

| # | Severity | Finding |
|---|---|---|
| JWT-1 | **CRITICAL** | **Hardcoded fallback secret.** `JWT_SECRET` defaults to `'your-secret-key-change-in-production'` if `JWT_SECRET` env var is unset. If this env var is missing in production, any attacker can forge valid JWTs. |
| JWT-2 | **MEDIUM** | **Separate JWT system disconnected from primary auth.** `lib/jwt.ts` uses `jose` library with `JWT_SECRET`, while `lib/auth.ts` uses Node `crypto` with `APP_SIGNING_SECRET`. The two systems don't interoperate, creating maintenance confusion. |

---

## Top Security Concerns — Ranked by Severity

### 🔴 CRITICAL

| # | Finding | Impact | Remediation |
|---|---|---|---|
| **C-1** | `subscription/update` has **zero authentication** | Any attacker can activate Pro Trader subscriptions for arbitrary emails, or cancel existing subscriptions, by sending a POST request | Add Stripe webhook signature verification or `ADMIN_SECRET` auth. Consider replacing this route with proper Stripe webhook handling. |
| **C-2** | `verify()` in `lib/auth.ts` uses non-timing-safe comparison (`sig !== expected`) | Theoretical timing side-channel attack against the HMAC signature protecting all 99 session-authenticated routes | Replace with `crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))` |
| **C-3** | `lib/jwt.ts` hardcoded fallback secret `'your-secret-key-change-in-production'` | If `JWT_SECRET` env var is unset, anyone can forge entitlement JWTs | Remove the fallback; throw if `JWT_SECRET` is missing (like `lib/auth.ts` does for `APP_SIGNING_SECRET`) |

### 🟠 HIGH

| # | Finding | Impact | Remediation |
|---|---|---|---|
| **H-1** | `auth/debug` exposes Stripe customer data with **no auth** | Customer IDs, subscription details, price IDs, and internal env var names returned to any requester with a valid email | Add `ADMIN_SECRET` auth or remove entirely |
| **H-2** | `jobs/learning-outcomes` POST handler has **no inbound auth** | Anyone can trigger prediction outcome processing, potentially manipulating AI learning data | Add `x-cron-secret` verification to the POST handler |
| **H-3** | Cron job auth is **fail-open** — only enforced if `CRON_SECRET` env var is set | If env var is accidentally removed, all job routes become public | Invert the check: deny if `CRON_SECRET` is unset, not just if it doesn't match |
| **H-4** | Middleware provides **no global auth enforcement** | Each of 176 routes must independently implement auth. Missing auth on any route = security hole. | Consider adding a middleware-level allowlist of public routes, denying all others by default |

### 🟡 MEDIUM

| # | Finding | Impact | Remediation |
|---|---|---|---|
| **M-1** | In-memory rate limiting (both middleware and `avRateGovernor`) doesn't coordinate across instances | Rate limits are per-instance, not global. Multiple instances multiply the effective limit. | Move to Redis/Vercel KV for shared state |
| **M-2** | `migrations/daily-picks` accepts auth key as **query parameter** | Secret appears in URL, which is logged in access logs, browser history, CDN logs | Move to `Authorization` header |
| **M-3** | Duplicate auth systems (`lib/auth.ts` vs `lib/jwt.ts`) with different secrets | Maintenance confusion; two attack surfaces instead of one | Consolidate to a single auth library |
| **M-4** | `scanner/daily-picks` reads DB with no auth | Exposes internal scoring data to unauthenticated users | Add `getSessionFromCookie` or make data explicitly public |
| **M-5** | AI learning tables (`learning_predictions`, `learning_signals`) lack `workspace_id` | All users' AI prediction data is co-mingled without tenant isolation | Add `workspace_id` column if per-user accuracy tracking is desired |

### 🟢 LOW

| # | Finding | Impact | Remediation |
|---|---|---|---|
| **L-1** | `verifyToken()` also lacks timing-safe comparison | Secondary verification path has same timing vulnerability as `verify()` | Apply `crypto.timingSafeEqual` here as well |
| **L-2** | No session revocation mechanism | Compromised tokens valid for up to 7 days | Consider a token blocklist in Redis or short-lived tokens with refresh |
| **L-3** | Fallback IP `0.0.0.0` in middleware | Requestors without IP headers share a rate-limit bucket | Log a warning and consider blocking requests without valid IP |

---

## Appendix A: Auth Mechanism Distribution

```
getSessionFromCookie    ██████████████████████████████  99 routes (56%)
ADMIN_SECRET            █████                           10 routes (6%)
x-cron-secret           ████████                        15 routes (9%)
INTERNAL_API_KEY        █                                1 route  (1%)
Webhook signature       █                                2 routes (1%)
verifyBearer (jose)     █                                1 route  (1%)
Public (market data)    ████████████████                ~23 routes (13%)
Auth flow (expected)    ███                              6 routes (3%)
Disabled / deprecated   ██                               3 routes (2%)
**UNPROTECTED**         ███                             ~6 routes (3%)
Conditional (fail-open) ███                             ~5 routes (3%)
Other / mixed           ███                             ~5 routes (3%)
```

## Appendix B: Files Audited

| File | Lines | Purpose |
|---|---|---|
| `lib/auth.ts` | 50 | Primary HMAC session auth |
| `lib/jwt.ts` | 38 | Secondary jose JWT auth |
| `lib/avRateGovernor.ts` | 143 | Alpha Vantage rate limiter |
| `lib/rateLimiter.ts` | 137 | TokenBucket implementation |
| `middleware.ts` (compiled) | — | Edge middleware (IP rate limiting + session refresh) |
| 176 `app/api/**/route.ts` files | — | All API route handlers |

## Appendix C: Immediate Action Items

1. **TODAY:** Add auth to `subscription/update` — this is an active exploit vector
2. **TODAY:** Add auth to `auth/debug` or disable in production
3. **TODAY:** Fix `verify()` to use `crypto.timingSafeEqual()`
4. **TODAY:** Remove hardcoded fallback in `lib/jwt.ts`
5. **THIS WEEK:** Add inbound auth to `jobs/learning-outcomes`
6. **THIS WEEK:** Make cron auth fail-closed (deny when `CRON_SECRET` is unset)
7. **THIS SPRINT:** Evaluate middleware-level auth enforcement vs. per-route auth
8. **BACKLOG:** Consolidate `lib/auth.ts` and `lib/jwt.ts` into a single auth system
9. **BACKLOG:** Move rate limiting to a shared store (Redis/Vercel KV)
