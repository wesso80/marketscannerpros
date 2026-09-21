# Derivatives evidence audit — 21 September 2026

This follows the provider repair and research feed releases, PR21 and PR22. Both were live in Render **My Workspace** on commit `c6ed8d0596d1d398be42fe4d1d8b57c5766b2f7e` before this follow-up. Deployment confirmation for this follow-up is recorded in its pull request.

## What was verified live

- PR22 web deploy `dep-daora3brjlhs73f03kk0` became live at 22:55:06 UTC; worker `dep-daora3rrjlhs73f03lkg` at 22:52:53 UTC. Web startup confirmed migration 058 ready. `/api/health` returned HTTP 200 healthy at 22:57:46 UTC.
- A refreshed signed-in session allowed access without an acknowledgement action by the agent. Earlier report notes about waiting for disclosure acknowledgement are superseded by this observation. No acceptance record was fabricated.
- Guides returned 20 Bitcoin guides with source links, publication ages and GUIDE badges. Treasury showed corrected negative-currency formatting, value-versus-cost labels, an observation-date warning, and 20 rows per page. Page 2 of 9 showed the next 20 entities.
- Smart-check saved 18 derivatives snapshots at 22:56:20 UTC. The newly deployed worker had no ingestion due, so a repaired daily-bar ingestion cycle has not yet been observed.
- Earlier scanner checks evaluated 81 eligible crypto assets. A minimum-evidence filter returned zero matches; removing it returned 10 technically enriched matches with descending volatility values and explicit exclusions. Changing controls cleared old results. ARB/daily carried through Golden Egg and Terminal.

## Additional defects exposed after the provider recovered

| Finding | Evidence | Correction |
|---|---|---|
| Funding presented as observed long/short accounts | UI showed 55/45 ratios; endpoint computed them directly from funding | Ratios now unavailable until an observed positioning feed is connected. Removed the same proxy from bulk scanner and smart alerts. |
| Unreliable 24h OI changes | BTC/ETH/SOL displayed roughly −64% to −67%; Redis anchor had neither timestamp nor venue identity | New versioned hourly observations record provider time and exact venue/contract scope. Comparisons require matching scope and a 23–25 hour interval. No seed-as-zero, legacy anchor, or indefinitely old baseline. |
| Conflicting OI definitions | One route used a one-hour memory anchor and assigned BTC change to the total; another used an untimed Redis anchor | Both routes and heatmap use the same observations. Aggregate change compares the current basket against matching baselines and weights by notional. Missing comparisons remain null. |
| Recent liquidation sample claimed as 24h USD total | UI showed $37.0M longs/$15.8M shorts; code used contracts × price and an unbounded recent endpoint response | Retired unsupported totals. A supported collector must establish instrument units, currency conversion, window coverage and outage handling before these values return. |
| Unknown data used as neutral alert input | Missing OI, ratios or fear/greed defaulted to 0/1/50 | Unknown values cannot trigger their corresponding alert conditions. No alerts were created or sent during verification. |
| Historical series joined incompatible observations | Stored funding/OI rows lacked formula, interval and venue-coverage versions | Records are preserved; misleading continuous history is withheld. UI explains why. |
| Labels overstated what was measured | SOL return called meme leadership; 24h absolute return called volatility | Labels identify SOL/ETH leadership and a price-move proxy; no measured-volatility claim. |
| Missing values could reappear as zero or crash downstream | Null OI changes and ratios reached legacy widgets/AI formatting | Updated null handling, contract-count availability, AI source attribution and data coverage. |

## Verification

- New tests exercise 24h timing, scope changes, invalid observations, zero versus unknown, OI-weighted totals, unavailable API contracts, authentication, persistence across restart and legacy-anchor rejection.
- The full suite produced 1,675 passes and 13 existing skips. One Monte Carlo maximum-size test exceeded its five-second limit while TypeScript was running concurrently. Its isolated rerun passed in 3.5 seconds without changing the test or its timeout.
- The final focused run passed all 68 tests, including the Monte Carlo test, 24 new evidence/persistence cases, layout guards and prior audit guards.
- TypeScript passed. Production build and final Render status are recorded in the pull request after completion.
- React review covered null rendering, unchanged hook order, empty scenarios, feed error states and pagination. Diamond remains manual-only.

## What is still required for 5/5

This is not a 5/5 sign-off. Deploy success and test count do not prove market-data accuracy or trading performance.

1. Observe a complete repaired worker ingestion cycle and reconcile OHLC, spot quotes, funding and OI against provider/exchange observations.
2. Accumulate approximately 24 hours of compatible OI history. A restart is supported; missing Redis history or changed venue coverage correctly delays comparison.
3. Connect observed account/position ratios and a supported liquidation collection pipeline with contract units, currency conversion, timestamps, coverage and gap detection. Current unavailable fields must not be treated as zero activity.
4. Version and migrate historical funding and bars. Validate venue-specific funding intervals before comparing or annualising rates; the current 8-hour annualisation assumption remains a limitation. Legacy zero-volume storage also needs a quality/version migration.
5. Finish page-by-page mobile, backtest/journal/portfolio sizing, fees, partial exits, stale-price, alert recovery, AI grounding and calendar coverage checks. Live calendar providers remain unconfigured in the prior audit.
6. Produce versioned out-of-sample results including fees, slippage, liquidity, drawdowns and adequate sample sizes. A numerical scanner quality rating should only change with this evidence.

No real trades, billing changes, new alerts, watchlists or saved cases were created by this audit.

## Source contracts

- [CoinGecko derivatives exchange schema](https://docs.coingecko.com/reference/derivatives-exchanges-id): exchange-specific field names, USD open interest and contract observations.
- [OKX API guide](https://www.okx.com/docs-v5/en/): derivative order size is measured in contracts; notional depends on contract specifications.
- [OKX API change log](https://www.okx.com/docs-v5/log_en/): the old public REST liquidation-orders endpoint was delisted from the documentation. Its presence in legacy code does not establish supported coverage.

Related reports: [provider repair](render-provider-repairs-2026-09-21.md), [research feed follow-up](research-feed-followup-2026-09-21.md), [scanner remediation](scanner-remediation-2026-09-21.md).
