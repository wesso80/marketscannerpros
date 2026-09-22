# Performance integrity follow-up — 22 September 2026

Base release: `483dd6a` (PR23). This batch addresses Journal, Portfolio, quote provenance and the Backtest workflow. It is not a complete platform or 5/5 sign-off.

## Findings and changes

| Finding | Correction in this batch | Verification |
|---|---|---|
| Journal's 30-day figures used all loaded trades | Close-date windows, valid outcomes only, explicit empty-sample states | Synthetic old, recent, future, undated and breakeven records |
| Journal labelled cumulative P&L as account equity and plotted outcomes backwards | Recorded realised P&L label, chronological cumulative closed P&L, dollar drawdown including an initial loss; account equity remains unknown without an opening balance | Unsorted outcomes and independent capital-based drawdown example |
| All-win Journal samples displayed a fabricated 9.99 profit factor | Undefined ratio remains null with an explanation | All-win and empty samples |
| Opening Journal could manufacture or replace stops, target, quantity and entry risk | Removed the load-time execution-pipeline backfill; missing entry evidence remains missing | Source review; no historical records rewritten by this patch |
| Stock and crypto trades sharing a ticker could share one quote | Quote keys include asset class; requests cancel on identity changes; no cross-asset fallback | Synthetic KITE stock and KITE-USD crypto reconciliation |
| A fetched mark was represented as an exit with a fresh timestamp | Separate mark and exit records, provider observation time distinct from retrieval, estimates labelled; expired observations rejected; unsuccessful refreshes do not preserve a prior successful mark as fresh | Quote timing, invalid-price and immutable-exit cases |
| Underlying quotes could mark option/futures trades | Excluded unsupported instrument marks in Journal and the active Portfolio refresh path | Instrument-type guards |
| Open trades without usable quotes could contribute false zeroes | Complete estimated open P&L is unavailable when any open record is unpriced | Null-aware model and UI review |
| Portfolio withdrawals appeared as drawdown, and positive tail returns became loss VaR via absolute value | Drawdown links flow-adjusted returns; historical loss VaR floors at zero; unknown cash flows and gaps withhold daily statistics | Deposit, withdrawal, genuine loss, gap and all-gain examples |
| Portfolio risk used 252 for calendar-day observations | Consecutive calendar-day basis with 365.25 annualisation, sample standard deviation, zero risk-free-rate assumption and explicit method note | Calendar-year factor and zero-variance checks |
| Partial close reduced size without recording realised P&L | Explicit close-price entry; closed quantity and remaining quantity preserve total P&L; Journal-linked records direct users to Journal | Long/short half-close conservation and zero-price full loss |
| Portfolio replacement deleted records before later inserts could fail; UI ignored HTTP rejection | Validate the complete payload first, execute replacement in one transaction with a workspace lock, propagate failures to the UI | Invalid inputs cause no writes; all writes are inside the transaction; insert failure returns an error |
| Backtest guessed commission class from suffix; dollar returns included fees but percentages did not | Carry explicit stock/crypto choice to provider and runner; net percentages reconcile with net dollars; assumptions describe modeled commission | Synthetic USD-ticker run and independent fee arithmetic |
| Golden Egg and Terminal child links dropped Backtest context; destination ignored asset/timeframe | Preserve symbol, asset type and timeframe, expose asset choice, invalidate obsolete results, reject unsupported futures runs | Source/TypeScript review; live post-deployment handoff check still required |

## Evidence and release status

- The live Journal was accessible and showed the misleading account-equity label beside a nonzero open-P&L estimate. Its cumulative plot was in reverse close-date order. No private trade details are included here.
- The active Workspace Portfolio is the original Portfolio component, not the unused PortfolioV2 file. Fixes target the active component.
- Focused regression run: **55 tests passed across seven files**, including 19 new calculation/persistence cases. After final null-handling edits, the directly affected subset passed **24/24**.
- Two old wording assertions were updated because commission is already modeled. They previously enforced text incorrectly saying commission was excluded.
- Compilation succeeded. Final production-build status is appended below after completion.
- Build uses local placeholder credentials and an unreachable local database; no production credentials were read or changed.
- GitHub and Render connectors returned HTTP 400, `Invalid MCP request metadata`. Public Git fetch succeeded and confirmed the base release. Push and deployment status must be checked independently; local test success is not deployment proof.
- No test trades, alerts, watchlists or saved cases were created. Diamond was not run and remains manual-only.

## Material remaining work

1. Push and deploy this batch, then recheck the live UI and compatible clean daily histories. Render logs could not be read in this turn, so repaired ingestion is still unverified.
2. Backtest's shared statistics engine still needs calendar/cadence review: it treats bars as trading days for annualisation and uses realised equity, excluding open-position adverse excursions. Do not interpret those ratios or drawdowns as verified portfolio risk. Scanner/replay cost-model parity also remains to be audited.
3. Portfolio flow adjustment uses an explicit UTC day-end convention because snapshots are stored by date. It does not establish the intraday valuations needed for exact time-weighted returns around significant cash flows. VaR is withheld below 20 returns; this threshold does not make a short sample statistically reliable.
4. Journal/Portfolio P&L remains before fees unless fees are already included in a recorded outcome. Contract multipliers, option premium handling, financing, borrow and full net-cost lifecycle support need a separate verified instrument model.
5. Stock quotes expose a trading date or retrieval time when available, not an invented precise provider observation timestamp. A complete exchange-session freshness policy and verified manual-position identity are still needed.
6. Atomic Portfolio writes prevent partial replacement on database failure. They do not add optimistic version checking for simultaneous edits from multiple devices. Existing legacy records, position identifiers and historical snapshot quality still need reconciliation.
7. Observed positioning/liquidation collectors, compatible OI history, funding intervals, calendar coverage, mobile completion, alert recovery and out-of-sample performance evidence remain outstanding from prior reports.

## Sources and interpretation

[CFA Institute's GIPS calculation guidance](https://www.gipsstandards.org/wp-content/uploads/2021/03/calculation_methodology_gs_2011.pdf) describes cash-flow-adjusted return methods and the need for appropriate valuations. The implementation here uses a disclosed day-end approximation and is not a claim of GIPS compliance.

[Alpha Vantage's API documentation](https://www.alphavantage.co/documentation/) distinguishes quote fields and their trading-day information. A request completion time does not establish when the underlying price was observed.

## Final local verification

Production build completed with exit code 0: compilation, TypeScript, and **400/400 generated pages passed**. The expected local-database connection refusal came from the deliberately unreachable build fixture, not production. Generated `next-env.d.ts` changes were discarded. This build does not verify live ingestion or deployment.

## Release blocker

This batch is committed locally on `codex/performance-integrity-20260922`, **not pushed, merged or deployed**. Direct Git push failed with `could not read Username for 'https://github.com': terminal prompts disabled`; no authenticated Git credentials were available. The GitHub and Render connector calls both failed with `Invalid MCP request metadata`. These are access/transport failures, not an approval rejection. The last previously verified live release remains `483dd6a`; no current Render status could be retrieved in this turn.
