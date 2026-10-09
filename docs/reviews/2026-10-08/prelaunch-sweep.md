# Pre-launch sweep

Date: 2026-10-08 · Base: `research-page-phase4` @ `0a2031d` (open drafts #519–#523 noted where they already fix an item)
Scope: read-only. 435 API routes inventoried; public routes checked for auth, writes, provider cost, advice fields
and error text; tracked files checked for secrets; public UI checked for trade levels. No secret values are
reproduced here.

Middleware note: `/api/*` gets only a per-IP quota plus the `/api/admin/**` checks. A route without its own auth
is fully open, and `/api/scanner/`, `/api/jobs/`, `/api/alerts/`, `/api/catalyst/`, `/api/internal/`,
`/api/auth/` and `/api/webhooks` are exempt from that quota.

## P0: before launch

| # | Item | Detail | Fix |
|---|---|---|---|
| S1 | **Database owner credential in a public repo** | `_check_worker.js` (tracked on `research-page-phase4`; the repo is public) has a full Neon `neondb_owner` connection string with its password. #489 removed it from `main` only; this branch predates #489. It is also in git history. | **Rotate the Neon password now.** Port #489 into `research-page-phase4` (delete the file, add the `.gitignore` lines). |
| S2 | **Alpha Vantage API key in a public repo** | `.vscode/mcp.json` on `research-page-phase4` has the key in a URL. Also removed from `main` by #489. | **Rotate the Alpha Vantage key.** Same port as S1. |
| S3 | **Open email relay** | `POST /api/test-email` needs no sign-in and sends a branded email to any `email` in the body (session optional). | Admin-only, or delete. |
| S4 | **Anonymous writes** | `/api/midpoints` POST (insert candles), PUT (re-tag), DELETE (reset tagged midpoints): no auth and no caller in the app; 500s echo `error.message`. Poisons Time Gravity data. | Delete, or admin/cron-only. |
| S5 | **Trade levels served anonymously** | `GET /api/scanner/candidates` (no auth, no quota) returns the top 10 picks with `entry_price`, `stop_price`, LONG/SHORT, `confidence` and the canonical verdict. Its only caller (`TradePermissionDashboard`) is not mounted. | Retire (410). |
| S6 | **Full canonical verdict served anonymously** | `GET /api/scanner/daily-picks` (no auth, no quota) spreads the whole DB row (`indicators` JSON) and `canonical`: permission/grade, direction, **levels (entry, invalidation, target, R:R)**, `pTargetFirst`, every evaluated candidate. Used by the Symbol page feed, Free `SavedPicks`, `/operator` and v2. | Public projection (symbol, scan date, price + basis, measured indicators, data quality/trust); keep the full row for admin. Needs a product decision on whether PASS/WATCH grades are public. |

## P1: high

| # | Item | Detail | Fix |
|---|---|---|---|
| H1 | Scanner API ships canonical levels | `/api/scanner/run` rows carry the full `canonical` (levels, size multiplier). The card is `compact` so levels are hidden, but the payload has them, and the card shows PASS/WATCH/BLOCK, the grade and **"size ×N"** (sizing). | Public projection for scanner rows; drop "size ×". Same product decision as S6. |
| H2 | Portfolio "Position Size" | `app/tools/portfolio/page.tsx` shows a suggested quantity. | Codex's area (Portfolio): flag only. |
| H3 | Raw error text in 66 public routes | `NextResponse.json` returns `err.message` (DB, provider, stack-adjacent text). Some are fixed in drafts: earnings (#522), market focus (#521), research case (#520). | Shared helper: log server-side, return a generic message; one sweep PR. |
| H4 | Quota exemptions | `/api/scanner/*` (incl. the expensive `scanner/run`, `bulk`), `/api/alerts/*` and `/api/catalyst/*` bypass the middleware quota. | Confirm each has its own limiter; add one where not. |
| H5 | Secrets cleanup completeness | Besides S1/S2, also check Render env for anything that was ever in history (the 2026-03 and 2026-10-07 "remove credentials" commits). | Rotation checklist. |

## P2: tidy-up

- `_check_picks.js`, `_mock.json` at repo root: scratch files, tracked. Remove.
- `/api/options` returns HTTP 301 with a JSON body (deprecated): make it 410.
- `/api/migrations/daily-picks` still accepts the admin secret as a `?key=` query parameter (logged in URLs). Header only.
- `app/tools/signal-accuracy` shows historical R:R: fine if labelled as history; confirm.
- Dead code waiting on Codex's test edits: `components/msp/options/**`, `src/features/goldenEgg/GoldenEggPage.tsx`.

## Already handled (merged or in draft)

#514 ai-scanner auth + secret leak · #515 Time Confluence/calendar · #516 retired advice routes · #518 futures
calendar · #519 market inputs · #520 research-case generation · #521 market focus · #522 earnings summary · #523 dead code.

## Test suite

41 pre-existing failures on the base (unchanged by all the PRs above): `layoutFlowAudit` 11, `phase1Overview` 10,
`phase2bToday` 3, `sharedMarketComponents` 3, and 14 single failures. They predate this work. They should be
triaged (fixed or the stale assertions updated) so CI is green at launch. Note: `layoutFlowAudit` and the phase tests
overlap Codex's seven-page design work.

## Not covered by this sweep

No production build (`next build`) or browser run; Stripe webhook signature paths were checked only for presence.
