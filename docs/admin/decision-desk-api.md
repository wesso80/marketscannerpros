# Decision Desk data contract v2

`GET /api/admin/decision-desk` is the same feed used by `/admin/priority-desk` (now labelled Decision Desk). Optional query parameters: `symbol=BTC` and `strategy=POSITION_6W`. Unknown strategy values return 400. Responses are private, no-store. Request manually or at a modest interval; evidence only changes when existing ingest/scan jobs update it.

The endpoint only reads stored scan, daily-bar, macro and workspace risk data. Legacy equity packets can be enriched in memory from identity-checked `ohlcv_bars`; crypto never uses the symbol-only equity cache. New scans attach independent trend evidence from the daily bars already fetched for position levels. It does not scan, write calls/events, invoke AI, send notifications or place orders. Existing `/api/admin/priority-desk` remains a legacy API and still logs research calls on top-candidate changes; consumers requiring read-only behavior should use the new endpoint.

Authentication currently uses the existing admin authentication and requires a workspace. **This endpoint being read-only does not make an admin credential read-only. Do not distribute a full admin secret to bots.** A dedicated scoped service credential remains a separate access-control deliverable. No bot credentials or bot schedules were created or modified in this change.

## Response

- `schemaVersion`: `decision-desk.v2`.
- `servedAt`: response construction time, not market observation time.
- `savedScans`: availability, missing-symbol counts and scan dates for both markets. No packet means no assessment; an empty list is not proof that the universe has no opportunities.
- `account`: current workspace assessment, independent of all research rankings. Daily drawdown is percentage points, or null if not measurable. `concentrationRiskPct` is the existing risk engine's concentration/correlation measure, not a measured pairwise correlation. PASS is not approval of any particular idea.
- `macro`: stored FRED observations with units, dates and cadence-aware status; DXY is the broad trade-weighted dollar proxy described in its metadata. `verdict` remains null until an independent regime assessment is integrated. Each failed series is explicitly unavailable.
- `strategies`: POSITION_6W has an assessment; CORE_TREND and MACRO_HEDGE are not implemented; TACTICAL is deferred.
- `assessments`: one current saved packet per market + symbol + strategy. Includes packet ID, source, scan timeframe, evidence dates, direction-matched weekly/daily levels, derived assessment and outstanding checks.
- `counts`: status counts reconcile to all returned assessments, after symbol filtering.

## Assessment semantics

- DATA_UNAVAILABLE: stale/failed/degraded evidence, missing current weekly/daily levels or invalid price geometry.
- INVALIDATED: latest timestamped saved price through the weekly stop, or position entry status already beyond stop. Intraday setup invalidation is not a weekly invalidation.
- WATCH: weekly trend neutral, weekly/monthly context mixed or conflicting, daily trigger not confirmed, price outside zone or level quality warnings. An absent intraday setup does not veto an independently supported position thesis.
- REVIEW_REQUIRED: technical prerequisites passed this conservative screen; independent macro, portfolio fit and performance review remain outstanding. It is never an automatic approval.

Assessments are sorted by status then the discovery score. This is a triage order, not a validated investment ranking. Position direction now comes from `position-trend.v1`: completed-week close above/below SMA10 above/below SMA20, with the SMA20 slope compared to three weeks earlier. Monthly context uses completed-month close vs SMA3 and the SMA3 slope vs three months earlier. Require 26 completed weeks and six completed months, exclude initial partial periods and forming calendar periods, and reject stale/discontinuous/invalid OHLC history. This is an explicit research rule, not a calibrated predictive model. The original intraday direction remains `discoveryBias`; the ranking score remains discovery-only. Missing position levels never fall back to 15-minute targets.

42 and 84 days are review horizons, computed from the immutable server creation time of a research decision. Results remain null/unverified until an actual observation subsystem is integrated; no entries or fills are assumed. Existing short-horizon signal statistics are not imported as position-strategy performance.

## Acceptance gates still open

1. Validate the research rule against historical outcomes and connect a dated independent macro verdict.
2. Add observed checkpoint prices/returns to the saved research decisions without treating the reference price as a fill.
3. Implement 42-/84-day observations separately from closed-trade returns, including costs, missing prices and legacy cohorts.
4. Add narrowly scoped bot read access without exposing mutation endpoints.
5. Build committee reporting from those durable records. Do not use trade count alone as proof of an edge.


## Research decision records

`GET /api/admin/decision-records` returns the latest 100 records for the authenticated workspace, original evidence, and PENDING/DUE checkpoints. It never creates tables or writes records. An uninitialized table returns `available:false` with an explicit message; other database failures return 503.

`POST /api/admin/decision-records` requires `symbol`, `market`, `action` (`WATCH`, `DECLINED`, `FOLLOW_UP`), `note` (10–2000 characters), `evidenceId` from the assessment and a UUID `requestId`. It rebuilds the assessment from server evidence; a changed fingerprint returns 409, requiring a fresh review. The client cannot supply the workspace or replace the evidence. Account and macro evidence are captured from the server at save time. Browser-origin requests must match the application origin.

Records are append-only through this API. A unique workspace/request ID prevents retries from overwriting earlier records. There is no update/delete route and no trading action. The table may be provisioned with migration 106 or initializes on the first explicit POST. No production research decisions were manufactured as part of deployment verification.

`reference_price` is the saved scan price, not an entry fill; `reference_at` is the scan timestamp. Original assessment plus current account/macro evidence are retained as JSON. Future return observations must preserve their own source/time and distinguish gross price changes, corporate actions, costs and realized trades.

### Position history recovery

`POST /api/admin/position-history` accepts `{ "offset": 0 }` and processes up to five unique saved-scan symbols. Continue with the returned `next` offset until null. Requires admin authentication and same-origin browser requests. This explicit action consumes provider requests for daily history only; GET evidence remains read-only. Fresh market-qualified saved history is reused for six hours. Unsupported/short/stale histories retain unavailable reasons.

`GET /api/admin/portfolio-lab/holdings` exposes workspace-scoped saved holdings, saved-price exposure/P&L and valuation limitations. It does not return ARCA simulation positions, broker balances or live quotes.
