# MarketScanner Pros — Improvement Pass

**Date:** 2026-08-28
**Scope:** Verification of the prior `AUDIT.md` (dated 2026-05-30) against current code, plus targeted security hardening.
**Method:** SCAN → VERIFY → FIX → TYPECHECK. No functionality removed. No dependency upgrades. No secrets touched.

---

## 1. Executive summary

The platform is in materially better shape than `AUDIT.md` implies — that audit was read-only and is ~3 months old, and the majority of its CRITICAL/HIGH findings have since been remediated in the codebase. This pass **re-verified every CRITICAL/HIGH item against the live code**, confirmed which were already closed, and fixed the two genuine security gaps that remained.

Full TypeScript typecheck (`npx tsc --noEmit`) passes cleanly (exit 0) after the changes — this matters because the Render build runs the full `tsc` after Turbopack compile.

---

## 2. Issues discovered (current state vs prior audit)

| Prior finding (AUDIT.md) | Current status | Notes |
|---|---|---|
| `/quant` publicly accessible (Table 3 #6) | ✅ **Already fixed** | `middleware.ts` redirects `/quant` → `/admin/quant` (admin-gated). |
| Golden Egg local-demo data can leak to prod (Table 3 #7) | ✅ **Already fixed** | `isLocalDemoMarketDataAllowed()` policy + `emitProductionDemoDataAlert()` guard in `app/api/golden-egg/route.ts`. |
| `adminOnly: true` leaked in backtest response (Table 3 #5) | ✅ **Not a leak** | `adminOnly` lives inside a fire-and-forget `recordSignal` IIFE; the HTTP response is `{...result, dataSources}` and does not include it. |
| `cached/quote` unauthenticated DOS on AV budget (Table 3 #2) | ✅ **Fixed this pass** | Added a dedicated 60/min per-IP limiter (§3.3). The global middleware limiter still applies as a second layer. |
| Sitemap/canonical conflict on legal pages (Table 3 #8) | ✅ **Already resolved** | Top-level `/privacy`,`/terms`,`/cookie-policy`,`/refund-policy` canonicalize to themselves, match `app/sitemap.ts`, and are `robots: index:false`. No duplicate-content risk. |
| **`cached/universe` unauthenticated read AND write (Table 3 #1)** | ❌ **Was still open — FIXED this pass** | `GET`/`POST`/`DELETE` had no auth; anyone could enumerate the tracked universe and add/disable/delete symbols in the global worker config. |
| Health endpoint leaks expected env-var names (Table 3 #12) | ❌ **Was still open — FIXED this pass** | Also leaked raw DB/Redis error strings. |

---

## 2b. Cross-check of `docs/FULL_CODEBASE_AUDIT_2026.md` (dated 2026-03-05)

A second, earlier audit was also verified against current code. Its flagged security items are **already remediated**:
- CoinGecko API key in URL param (B14) → now header-only (`x-cg-pro-api-key`); no key in URLs.
- CoinGecko in-memory daily budget counter (B13) → removed (usage monitored via dashboard).
- `server.js` command injection via `PORT` (#7) → now `execFileSync` with array args + numeric-PORT validation.
- `midpointService` SQL interpolation (B20) → parameterized `make_interval(days => $1)`; and it reuses `getPool()` (B21).

Its remaining open item in the security domain — **timing-unsafe secret comparisons** (S10) — is fixed in this pass (§3.4). The deep trading-logic findings (fake MACD signal lines, straddle single-leg, hardcoded $100K sizing, candle-resampling boundaries) were **not** touched: they change numerical outputs, need domain review + regression tests, and are out of scope for a low-risk security pass. They remain valid follow-ups.

---

## 3. Changes implemented

### 3.1 Security — lock down `app/api/cached/universe/route.ts`
- Added `requireAdmin(req)` gate to **all three** handlers (`GET`, `POST`, `DELETE`); unauthenticated callers now receive `401`.
- Added `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` (required for `requireAdmin`, which reads cookies).
- Rationale: this is a worker-configuration management API with **no frontend caller** (confirmed by workspace-wide grep — only the route file and `AUDIT.md` reference it). It was fully unauthenticated for both read (universe enumeration) and write (add/disable/hard-delete symbols). Locking it to admin closes an unauthenticated-write vulnerability with zero user-facing impact.

### 3.2 Security — redact internal detail from `app/api/health/status/route.ts`
- Removed the `error` detail strings (raw DB/Redis exception messages) from the unauthenticated JSON response; these are now logged **server-side only**.
- Replaced the `Missing: STRIPE_SECRET_KEY, …` env-name disclosure with an aggregate boolean; missing names are logged server-side only.
- Preserved the exact contract uptime monitors depend on: top-level `status` (`healthy`/`degraded`), per-check `ok` booleans, `latencyMs`, and the `200`/`503` status codes.

### 3.3 Security — harden the remaining `cached/*` endpoints
- **`app/api/cached/quote/route.ts`**, **`app/api/cached/symbol/route.ts`**, **`app/api/cached/indicators/route.ts`** — added a 60/min per-IP limiter (`apiLimiter`) returning `429` + `Retry-After`. These endpoints call the paid Alpha Vantage quota on cache-miss (`getQuote` / `getFullSymbolData` / `getIndicators`), so per-IP throttling protects the AV budget. They remain public/unauthenticated by design (on-demand "any ticker" support for external/mobile clients).
- **`app/api/cached/status/route.ts`** — added `requireAdmin(req)` (plus `runtime`/`dynamic` exports). This endpoint exposes worker run history, `error_message` strings, API-call counts, and freshness diagnostics — operational internals covered by `no-public-leakage.md`. Also redacted the raw `err.message` from its `500` response. No frontend caller (grep-confirmed).
- **`app/api/cached/bulk-quotes/route.ts`** — left as-is: it makes **no** external API calls (cache/DB only, capped at 100 symbols) and is covered by the global middleware limiter.

### 3.4 Security — timing-safe secret comparisons
Three endpoints compared shared secrets with plain `===`/`!==`, which is vulnerable to timing analysis. Replaced with the existing constant-time `isValidAdminSecret()` helper (`crypto.timingSafeEqual` + length guard). Authorization semantics are unchanged.
- **`app/api/ai-scanner/alert/route.ts`** — TradingView webhook secret (this stays a secret-gated webhook, **not** cookie-auth, because TradingView cannot send cookies).
- **`app/api/push/send/route.ts`** — internal `INTERNAL_API_KEY` / `ADMIN_SECRET` bearer check.
- **`app/api/migrations/market-focus/route.ts`** — setup-key and bearer-token checks (kept the `FREE_FOR_ALL_MODE` and production-only enforcement behavior intact).

### 3.5 Correctness — signal deduplication (B6) and Finnhub rate-limiter race (B16)
After verifying the March-2026 audit's bug list against current code (most already fixed — see §2b), two genuinely-open items were fixed with a regression test:
- **B6 — duplicate signals corrupting win-rate stats.** `lib/signalRecorder.ts` inserted into `signals_fired` with no `ON CONFLICT`, while the parallel `lib/signalService.ts` path correctly deduped via the `idx_signals_dedup` unique index. Both `recordSignal` and `recordSignalsBatch` now compute `signal_bucket` and use `ON CONFLICT (symbol, signal_type, direction, timeframe, scanner_version, signal_bucket) DO NOTHING`. The bucket logic was extracted to a shared, side-effect-free util `lib/signals/signalBucket.ts` and `signalService.ts` was refactored to import it (removing the duplicated ~45-line function). Covered by `test/signalBucket.test.ts` (7 tests).
- **B16 — Finnhub rate-limiter race.** The limiter used a shared mutable `callCount`/`windowStart` that concurrent callers could race past, exceeding the 60 RPM free-tier cap. Replaced with the existing `TokenBucket` (from `lib/rateLimiter.ts`), whose refill/check/decrement is synchronous within a single tick and therefore race-free in single-threaded JS.

---

## 4. Files changed
- `app/api/cached/universe/route.ts` — admin gate on GET/POST/DELETE; runtime/dynamic exports.
- `app/api/cached/quote/route.ts` — 60/min per-IP rate limiter.
- `app/api/cached/symbol/route.ts` — 60/min per-IP rate limiter.
- `app/api/cached/indicators/route.ts` — 60/min per-IP rate limiter.
- `app/api/cached/status/route.ts` — admin gate; redacted 500 error body; runtime/dynamic exports.
- `app/api/ai-scanner/alert/route.ts` — timing-safe webhook secret comparison.
- `app/api/push/send/route.ts` — timing-safe internal-secret comparison.
- `app/api/migrations/market-focus/route.ts` — timing-safe setup-key/bearer comparison.
- `lib/signalRecorder.ts` — `signal_bucket` + `ON CONFLICT DO NOTHING` dedup on both insert paths (B6).
- `lib/signalService.ts` — refactored to use the shared bucket util (removed duplicated function).
- `lib/signals/signalBucket.ts` — **new** shared, tested dedup-bucket helper.
- `lib/finnhub.ts` — race-free `TokenBucket` rate limiter (B16).
- `test/signalBucket.test.ts` — **new** unit tests (7) pinning bucket behaviour.
- `app/api/health/status/route.ts` — redacted error strings and env-var names from public response.
- `IMPROVEMENTS.md` — this report.

---

## 5. Performance improvements
None in this pass (security-first). See §14 for recommended follow-ups.

## 6. Security improvements
- Closed an **unauthenticated read/write** hole on the symbol-universe worker config (§3.1).
- Removed **information disclosure** (internal error strings + expected env-var names) from the public health endpoint (§3.2).
- Added **per-IP rate limiting** to the three on-demand `cached/*` endpoints that can burn the Alpha Vantage quota, and **admin-gated** the worker-status diagnostics endpoint (§3.3).
- Replaced **timing-vulnerable secret comparisons** (`===`/`!==`) with constant-time checks on the TradingView webhook, internal push, and migration endpoints (§3.4).

## 7. UX/UI improvements
None in this pass.

## 8. Mobile improvements
None in this pass. Prior audit already rated tool-page mobile responsiveness as the codebase's strongest area.

## 9. SEO improvements
None required — the legal canonical/sitemap conflict from the prior audit is already resolved (§2).

## 10. Accessibility improvements
None in this pass.

## 11. Code-quality improvements
- Minor: tightened the `checks` type in the health route to drop the now-unused `error` field.
- Removed a duplicated ~45-line `computeSignalBucket` function by extracting it to a shared, unit-tested util used by both signal-recording paths (§3.5).

## 12. Dependencies removed/upgraded
None. Per instructions, no dependency changes were made — compatibility not evaluated in this pass.

---

## 13. Issues intentionally NOT changed and why
- **`cached/bulk-quotes`:** makes no external API calls (cache/DB only, 100-symbol cap) and is covered by the global middleware limiter — no per-route change needed.
- **Design-system consolidation (Button/Card/Badge), scoring magic-number documentation, AI Output Standards enforcement:** large, multi-file efforts flagged in `AUDIT.md`. Out of scope for a security-focused, low-risk pass; documented as recommended work below.
- **Legal document copy / hardcoded effective dates:** substantive legal content is left for human/legal review per instructions; only technical issues were considered.
- **Redirect-only tool pages / duplicate legal routes:** functional and low-harm; moving them to `next.config.mjs` redirects is a build-time optimization, not a correctness fix, and carries URL-behavior risk. Deferred.

---

## 14. Additional recommended work (prioritized)
1. **METHODOLOGY.md** — document every scoring constant/fallback (`?? 40`, `?? 50`, regime `* 0.4`, confluence breakpoints). Highest-leverage credibility move (AUDIT.md §3).
2. **AI Output Standards** — emit the seven required fields (Opportunity Score, Evidence Quality Score, Personal Exposure, Confidence, What confirms, What invalidates, Main risk) on public outputs, per `.claude/rules/ai-output-standards.md`.
3. **Design primitives** — introduce `components/ui/{Button,Card,Badge}` so new code stops adding hardcoded-hex/inline-style debt; do not mass-refactor.
4. **Stale-data gating** — surface a `<DegradedBanner>` at the top of `/tools/scanner` when `freshnessStatus !== 'live'` (currently only a per-row badge).

---

## 15. Manual production checks required before deployment
- Run the full Render build (`next build`) in CI — `tsc --noEmit` passed locally but the full build additionally exercises Turbopack.
- Verify admin auth still works end-to-end for the universe management API (`ms_admin` cookie / admin `ms_auth` session) — any internal admin tooling or scripts hitting `/api/cached/universe` or `/api/cached/status` must now send admin credentials.
- Confirm uptime monitors on `/api/health/status` only assert on `status`/HTTP code (not on the removed `error` strings).
- Smoke-test critical flows: HOME → PRICING → LAUNCH APP; PRICING → CHECKOUT → SUCCESS; ACCOUNT → CUSTOMER PORTAL; website → `app.marketscannerpros.app`.

## 16. Environment configuration that needs attention
- No env-var **values** were added, removed, or exposed.
- Ensure `ADMIN_SECRET` / admin session cookies are configured wherever the universe management API is invoked (it is now admin-gated).
- Confirm `LOCAL_DEMO_MARKET_DATA` is **not** set in production (guard exists, but verify).

---

*No secrets, tokens, or environment-variable values are included in this report.*
