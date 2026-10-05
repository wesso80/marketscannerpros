# Read-only Options acceptance harness

Built for PR #334 (same-expiry AAPL OI comparison), #340 (missing ATR must withhold levels), and #352's outstanding session check.

**Scheduled window:** Tuesday 6 October 2026, 00:30–02:00 AEDT / Monday 5 October 2026, 13:30–15:00 UTC. Running outside this window records the evidence but fails the session-window check. Nothing is scheduled or run automatically.

## One command

With repository dependencies installed and `ALPHA_VANTAGE_API_KEY` already exported in your terminal:

```sh
node scripts/options-live-validation.mjs --live --exchange /path/to/exchange.json --missing-history-symbol YOUR_VERIFIED_SYMBOL --out /path/to/new-evidence-directory
```

The live chain request is `REALTIME_OPTIONS_FMV` (fair-value markup). That is the entitled Alpha Vantage options endpoint. Plain `REALTIME_OPTIONS` is not called. If FMV is missing, empty, or the premium "not entitled" sample, the harness falls back to `HISTORICAL_OPTIONS` (previous session) and records it. That fallback fails `LIVE_QUOTE_BASIS`. A fair-value chain dated today passes `LIVE_QUOTE_BASIS` even when bid/ask are absent (`quoteBasis` `marks_only`). Open interest is the provider row's `open_interest` only; a missing value stays missing.

Add `--expiry YYYY-MM-DD` to pin the exchange comparison's expiry. Otherwise the existing `selectOptionsExpiry` helper picks the next listed expiry (today only if no later expiry exists). The selected expiry and listed alternatives are always recorded. An unavailable requested expiry fails; it is never silently substituted. AAPL is fixed for the 330C/325P comparison.

`node scripts/options-live-validation.mjs --live` also works as a diagnostic capture, but missing exchange evidence / missing-history ticker makes acceptance FAIL. This is intentional. No pass can be inferred from an empty reference file.

Use `exchange-template.json` for independent exchange evidence. Fill the **same expiry** for both AAPL contracts, integer OI values (zero is valid), the OI data date, source URL or saved-evidence reference, and the raw observation timestamp including a zone. Capture the reference during the scheduled window, before running the harness. The harness does not scrape another provider or invent exchange values. Do not use the fixture's fabricated values as exchange evidence.

The missing-history ticker must have a valid current trading-day quote and a real daily-series response with too few bars to measure ATR14. An invalid symbol, permission/quota error or missing response is a failure, not proof of missing history. If the supplied symbol has enough history, that check fails and records the measured ATR. The harness does not search other symbols automatically.

## Exactly what is captured

- Provider raw AAPL 330C and325P OI values, contract IDs, selected expiry, per-contract date, and independent reference values; exact-match checks, differences and provider/reference ratios. A 9x mismatch is FAIL.
- Underlying spot, provider trading-day date and basis from the existing `optionSpotObservation` helper. Request observation times are never presented as quote timestamps.
- Existing canonical `atmStrike` selection, including lower-strike tie behavior.
- Sufficient-history ATR14 and the existing `calculateTradeLevels` outputs in both directions.
- A controlled zero-history case and a separate provider-observed missing-history case. Both must show null ATR, null confluence levels, null Symbol invalidation, and no Symbol reaction zones. A deliberately nonzero **controlled** day range checks that the helper cannot substitute day range for ATR; it is labelled and is not a market observation.
- Existing production demo guard returns false even with the old demo flag enabled.
- UTC start/end times for every request, HTTP statuses, response hashes and complete raw JSON responses, plus local git revision and fixture/real clock distinction.

The provider's contract/chain date is the available date basis. It does not expose a separate OI observation timestamp. The report preserves that limitation. **This harness never claims the roughly9x provider discrepancy is fixed**, even if the captured values match.

## Read-only boundary

The harness uses existing helpers **locally**. It does not call production application routes: `/api/options-scan` writes state and `/api/options-chain` writes Redis cache entries. Database access and signal/event persistence are replaced by rejecting adapters; Redis reads return no data and writes are suppressed in this process. Production credentials for databases, Redis and unrelated services are removed from the child environment. Provider calls retain the existing rate governor with process-local state.

Only explicit `--live` enables provider GETs, restricted to `https://www.alphavantage.co/query`, AAPL plus the supplied missing-history ticker, and four functions: REALTIME_OPTIONS_FMV (entitled live chain), HISTORICAL_OPTIONS (fallback when FMV is unavailable), GLOBAL_QUOTE and TIME_SERIES_DAILY. Plain REALTIME_OPTIONS is outside the allowlist. Maximum six requests,20-second timeout, no redirect or automatic retry. Worst case is FMV plus historical plus a quote and a daily series for AAPL and for the missing-history ticker. There are no order, alert, journal, state, cache, worker or production-data writes. Local evidence files are the only persistent output. Production options routes keep their own provider order (`REALTIME_OPTIONS` then `HISTORICAL_OPTIONS`); this preference applies to the harness only.

`--help`, invalid arguments, absent live credentials, ordinary test discovery, builds and fixture runs make no provider requests. The explicit runner is `run.live.ts`, outside normal `*.test.*` / `*.spec.*` discovery; invoking that runner without the CLI's explicit marker fails before any request. No key is accepted as an argument. URLs and response text redact the provider key.

## Output and exit status

A fresh output directory is required; old evidence is never overwritten.

- `summary.txt`: clear PASS/FAIL lines, observation times, exact OI evidence, and missing-ATR status.
- `report.json`: checks, git revision, dates, expiry/ATM, request log and limitations.
- `raw-observations.json`: complete response bodies with request times/status/hash; secret text redacted.
- `missing-history.json`: sufficient, controlled-missing, and provider-missing helper outputs.
- `exchange-observation.json`: exact supplied reference, when provided.

Exit0 means all checks passed; exit1 means failed/incomplete evidence; exit2 means setup/runtime failure. Fixture success is **not live evidence**. `liveEvidenceChecksPassed` can be true only in live mode with every check passing. `liveAcceptance` remains false: this harness does not verify deployed UI, authentication, Render revision, or browser rendering. It supplies reviewable data/helper evidence for the scheduled session, not a substitute for live screenshots.

## Offline verification

```sh
node scripts/options-live-validation.mjs --fixture scripts/options-validation/fixture.json --out /tmp/options-fixture-new
npx vitest run test/optionsLiveValidationHarness.test.ts test/optionsNoPlaceholderLevels.test.ts test/optionsAtmStrike.test.ts
```

The fixture is explicitly artificial, has its own fixed session clock and a separate real run-start timestamp, and makes zero network requests. `AAPL:REALTIME_OPTIONS_FMV` is that same artificial chain with bid and ask set to `0.00` so the offline run exercises fair-value marks; `open_interest` is unchanged and is not filled in when removed. `AAPL:REALTIME_OPTIONS` remains in the file for the direct OI comparison examples and is not requested. Tests cover the passing FMV capture, a not-entitled FMV sample falling back to `HISTORICAL_OPTIONS`, roughly9x failure/nonzero exit, absent/duplicate OI, genuine zero, wrong expiry/date, future/missing reference timestamps, the session boundary, and no-request help/credential failures. Existing ATR/ATM checks are reused. No live run was performed while building this harness.
