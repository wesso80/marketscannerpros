# Whole-audit status — 22 September 2026

This register consolidates the September 21–22 reports. It supersedes their historical “not merged”, missing-workspace and connector-blocked notes. It is not a new page-by-page certification.

## Verified release position

- GitHub and Render connectors are accessible again in this session.
- `335a7c5` performance-integrity changes were deployed to web and worker and received the live checks recorded in that report.
- `3fb76d0` backtest-data-integrity changes are on GitHub main and **live on both Render services**. Render web deployment `dep-daotivn40ujc73bpq3kg` finished at 01:30:29 UTC; worker deployment `dep-daotivv40ujc73bpq4hg` finished at 01:28:30 UTC. Live historical-provider/backtest outcome checks remain outstanding.
- This release repairs the ranked scanner outage described below. Commit `9dfee17` is live on both services; production verification follows below.

## Candidate remediation releases

The later META/ETH workflow audit and live repair passes are recorded in `candidate-release-verification-2026-09-22.md`. Initial release `df352f1` is live on Render; follow-up `b820a36` passed the production build and 200 focused tests and has been pushed to main. Its live acceptance is recorded in that supplement. These reports supersede earlier outstanding items specifically where evidence is now supplied: next-open/cost/marked-equity scanner tests, usable-options gating, candidate news/explorer routing, and verified candle/session identity. They do not close the operational, account-role, dataset or forward-performance gates below.

## Current scanner incident

The authenticated ranked page returned 10 equities but no crypto, followed by “Data request timed out after 30 seconds.” Render logs show a crypto scan beginning at 01:21:19 UTC and processing its final coin at 01:22:27: histories were fetched serially, exceeding the client deadline. The BTC benchmark was also fetched separately. User screenshots additionally show the results and filter controls absent on desktop despite the count being populated. That exact display failure was not reproduced at the audit browser's 1363px viewport; the affected responsive wrappers use generic hidden/medium-breakpoint utilities, and the repair gives scanner tables, cards and tabs explicit, scoped display rules.

Repair:

- Five concurrent history reads, each provider call limited to four seconds with no retries. The batch stops accepting results at 22 seconds from request start, leaving time for response processing before the unchanged 30-second client timeout.
- One derivatives snapshot runs alongside history reads; unavailable derivatives remain missing evidence. BTC history is reused for the benchmark.
- Completed symbols survive slow or failed providers; unprocessed/failed symbols are explicitly unavailable. Late reads cannot mutate a returned batch or start additional queued work.
- Coverage records universe size, attempted, evaluated, unavailable, outside-sample and returned counts. Coverage percentage measures evaluated/attempted, and a warning discloses the limited ranked sample.
- Explicit scanner desktop/mobile display rules cover both partial-loading and completed results, plus market filter controls.
- Request logs no longer print the session customer identifier.

Regression evidence: **75 tests passed in six files**, including parallel timing, hung/failed/unstarted symbols, immutable returned results, exhausted budgets and deadline forwarding for daily/hourly/30-minute/15-minute providers. The final production build passed, including TypeScript and all 400 static-generation tasks (local build-only placeholder credentials; no live provider secrets). A four-second source deadline can reduce coverage during provider incidents; missing symbols are disclosed, never manufactured.

The live Pro Fast comparison took **54.4 seconds**, evaluated 81 of 100 requested coins (19 excluded by universe validation), and returned five matches. Its enrichment path could issue seven extra Alpha Vantage requests per candidate to supplement or replace CoinGecko indicators. This release removes that mixed-source fallback, preserves the market-data candidate when technical evidence is missing, uses the market provider's coin ID, bounds individual reads and the enrichment batch, and publishes enrichment availability counts. Both the ranked-only and final combined production builds passed before publication.

## Live repair verification

Repair commit **`9dfee1755e25658e400dbf7ff80138de1e3c8a76`** is deployed:

- Render web: `dep-daotstm7bikc73b7g860`, live at **01:51:38 UTC** on September 22.
- Render worker: `dep-daotsu67bikc73b7g9n0`, live at **01:49:27 UTC**.
- Authenticated Ranked Daily: **20 visible rows — 10 equities and 10 crypto**. Crypto evaluated **23/25** attempted symbols; AVAX and LTC provider reads were unavailable and explicitly disclosed. The previous 30-second timeout did not recur in this check. The scoped desktop table had computed display `block` and a nonzero rendered height.
- Authenticated Pro Fast, crypto, daily, universe 100, default two-factor agreement: **12.6 seconds**, versus **54.4 seconds** before repair with the same settings. **81 evaluated, 9 matched/returned, 9/10 technical enrichments completed**. The original five matches became nine with more available technical evidence; the underlying market snapshot also changed between runs. This is a point-in-time comparison, not a latency service-level guarantee.
- The exact original user's desktop viewport and mobile device were not available for verification; the 1363px audit browser displayed the repaired table and filters. Reload after deployment is needed to receive the new client assets.
- Deep mode, all other intervals, concurrent load and repeated outage/recovery checks remain in the acceptance backlog. Missing history and unavailable evidence are still disclosed. Restored functionality is not complete provider coverage or proof of trading performance.

The documentation update containing these observations does not change application code.

## Original issue register reconciled

| ID | What has been implemented | What still needs completion or evidence |
|---|---|---|
| A01 | Instrument, asset and timeframe preserved across core Scanner/Research/Terminal/Backtest handoffs | Full live handoff matrix; unsupported forex/futures destinations explicitly handled |
| A02 | Embedded Time Confluence follows selected instrument and resets analysis | Live regression across all supported assets and intervals |
| A03 | Missing/stale derivatives cannot produce a complete permission result; provider contracts repaired | Live venue/window parity; measured position ratios and liquidations need supported feeds, otherwise stay unavailable |
| A04 | Automated journal records included; close-date filters, realised P&L and chronological drawdown corrected | Reconcile legacy records, every filter, fees and instrument multipliers against the full ledger |
| A05 | Complete value exposure; missing stops withheld; typed quote identity; partial/full close P&L; atomic replacement; flow-aware risk guards | Known opening capital and clean history, derivatives valuation, concurrent-device conflict handling and precise flow timing |
| A06 | Options missing/two-sided quote checks and spread eligibility strengthened | Provider timestamps, session freshness and agreement across options panels and AI |
| A07 | Heuristic score labels and permission precedence clarified | Statistical calibration, or retain explicit heuristic labels |
| A08 | News freshness gate and topic word boundaries; Guides contract fixed and live verified | Retest all news subviews, provider observation times and outage behavior |
| A09 | Calendar uses confirmed future events and discloses coverage gaps | Configure and verify missing calendar providers, timezone/session/event coverage |
| A10 | Ranked request failure reproduced and repaired in this release | Daily Ranked and Pro Fast checks passed as above; all intervals/Deep, repeated outage recovery and coverage/load monitoring remain |
| A11 | Incompatible funding withheld, scoped OI comparison requires 23–25-hour history, TVL label fixed | Confirm accumulated compatible OI history and funding-period normalization against source venues |
| A12 | Directional entry/stop/target geometry validated; R denominator and capped projection label corrected | Live upstream scenario-level parity across directions/assets |
| A13 | Pro filters/sorting now precede shortlist limit; request identity, exclusions and counts implemented | Full Fast/Deep/live provider matrix, recoveries and cross-asset liquidity/spread/event constraints |
| A14 | Cohort volume correctly distinguished from historical RVOL | Common eligibility across Radar/Movers/Scanner; strategy-specific rejection reasons |
| A15 | Liquidity gap formula and missing-country mapping corrected | Live source and cross-panel parity checks |
| A16 | M2 availability/source labels corrected | Observation-date alignment, missing/stale country data and distinction between coverage and statistical confidence |
| A17 | Missing invalidation cannot say valid; invented probability removed | Remaining forecast weights, quality-versus-coverage labels and source parity |
| A18 | Completed-bar identity, signed distance and asset-calendar context; manual refresh default | Exchange-session anchors, schedule counts, squeeze units and weekly/monthly boundary parity |
| A19 | Undefined metrics withheld; fees/net P&L and daily realised-balance statistics corrected; real OHLC required | Live paid history/gaps verification; marked open-position equity, execution costs/fills and out-of-sample evidence |
| A20 | Alert threshold parsing fixed; Guides and Treasury verified; missing derivatives remain unavailable | Alert delivery/retry/dedup/restart testing and authenticated AI grounding against supplied evidence |
| A21 | Central plan prices and billing intervals aligned | Controlled checkout/trial/cancellation/portal/webhook/entitlement tests |
| A22 | Five-area navigation, URL tabs, mobile cards, Markdown tables; scanner display repair | Complete desktop/mobile/keyboard/control/tier-loading regression across every page |

## Priority order after restoring the scanner

1. **Reliability and data truth:** scanner timeframes, Fast/Deep coverage, source timestamps, cache/candle/session parity, historical gaps, provider outages. Crypto global freshness still needs to use the provider observation timestamp instead of retrieval time. A passing HTTP health check does not prove fresh market data.
2. **Research consistency:** shared eligibility rules and instrument/evidence/geometry preservation throughout the workflow; reconcile remaining options, macro, calendar and derivatives source contracts.
3. **Records and performance:** finish ledger reconciliation and marked equity; validate realistic fees, spread, slippage, borrow and fills; prove results with versioned as-of scans and walk-forward/out-of-sample comparisons, sample sizes, uncertainty and baselines.
4. **Whole-product sign-off:** finish mobile/keyboard and error recovery, AI evidence grounding, alerts, billing and Render operational recovery/rollback checks.

## What still prevents 5/5

The last fully evidenced institutional assessment was **2/5**. Many defects have been repaired since then, but passing builds and a restored scanner do not prove a trading edge or earn a 5/5 rating. Sign-off requires reliable source-stamped evidence; reconciled scanner coverage and eligibility; realistic out-of-sample performance evidence; consistent research and portfolio records; and observed operational recovery. Unsupported data should stay unavailable until a supported source exists.

## Supporting reports

- `professional-readiness-2026-09-21.md` — original A01–A22 register and 5/5 acceptance gates.
- `scanner-remediation-2026-09-21.md` — pre-limit filters, scan identity and universe counts.
- `render-provider-repairs-2026-09-21.md` — provider schemas, genuine candles and disclosure persistence.
- `research-feed-followup-2026-09-21.md` — Guides, Treasury and scenario geometry.
- `derivatives-evidence-2026-09-21.md` — comparable OI/funding and unsupported evidence removal.
- `performance-integrity-2026-09-22.md` — Journal/Portfolio reconciliation and live worker evidence.
- `backtest-data-integrity-2026-09-22.md` — statistics and historical OHLC repair in deployed `3fb76d0`.
