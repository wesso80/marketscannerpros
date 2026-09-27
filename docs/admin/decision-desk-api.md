# Decision Desk data contract v1

`GET /api/admin/decision-desk` is the same feed used by `/admin/priority-desk` (now labelled Decision Desk). Optional query parameters: `symbol=BTC` and `strategy=POSITION_6W`. Unknown strategy values return 400. Responses are private, no-store. Request manually or at a modest interval; evidence only changes when existing ingest/scan jobs update it.

The endpoint only reads stored scan, macro and workspace risk data. It does not scan, write calls/events, invoke AI, send notifications or place orders. Existing `/api/admin/priority-desk` remains a legacy API and still logs research calls on top-candidate changes; consumers requiring read-only behavior should use the new endpoint.

Authentication currently uses the existing admin authentication and requires a workspace. **This endpoint being read-only does not make an admin credential read-only. Do not distribute a full admin secret to bots.** A dedicated scoped service credential remains a separate access-control deliverable. No bot credentials or bot schedules were created or modified in this change.

## Response

- `schemaVersion`: `decision-desk.v1`.
- `servedAt`: response construction time, not market observation time.
- `savedScans`: availability, missing-symbol counts and scan dates for both markets. No packet means no assessment; an empty list is not proof that the universe has no opportunities.
- `account`: current workspace assessment, independent of all research rankings. Daily drawdown is percentage points, or null if not measurable. `concentrationRiskPct` is the existing risk engine's concentration/correlation measure, not a measured pairwise correlation. PASS is not approval of any particular idea.
- `macro`: stored FRED observations with units, dates and cadence-aware status; DXY is the broad trade-weighted dollar proxy described in its metadata. `verdict` remains null until an independent regime assessment is integrated. Each failed series is explicitly unavailable.
- `strategies`: POSITION_6W has an assessment; CORE_TREND and MACRO_HEDGE are not implemented; TACTICAL is deferred.
- `assessments`: one current saved packet per market + symbol + strategy. Includes packet ID, source, scan timeframe, evidence dates, direction-matched weekly/daily levels, derived assessment and outstanding checks.
- `counts`: status counts reconcile to all returned assessments, after symbol filtering.

## Assessment semantics

- DATA_UNAVAILABLE: stale/failed/degraded evidence, missing current weekly/daily levels or invalid price geometry.
- INVALIDATED: thesis marked invalid or latest timestamped saved price through the weekly stop.
- WATCH: daily trigger not confirmed, price outside zone, no setup or level quality warnings.
- REVIEW_REQUIRED: technical prerequisites passed this conservative screen; independent macro, portfolio fit and performance review remain outstanding. It is never an automatic approval.

Assessments are sorted by status then the discovery score. This is a triage order, not a validated investment ranking. Discovery direction and score may come from 15-minute analysis; they are labelled as such and are not a weekly trend model. Missing position levels never fall back to 15-minute targets.

42 and 84 days are intended review horizons only. Results remain null/unverified; this release does not implement durable decision records, entries, fills, strategy outcome tracking or a committee report. Existing short-horizon signal statistics are not imported as position-strategy performance.

## Acceptance gates still open

1. Independently validate weekly/monthly trend direction and connect a dated macro verdict.
2. Persist human research decisions with immutable evidence, strategy version, entry basis and explicit review dates.
3. Implement 42-/84-day observations separately from closed-trade returns, including costs, missing prices and legacy cohorts.
4. Add narrowly scoped bot read access without exposing mutation endpoints.
5. Build committee reporting from those durable records. Do not use trade count alone as proof of an edge.
