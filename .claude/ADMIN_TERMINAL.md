# MSP Private Admin Terminal Doctrine

This section is private-only and must never be exposed to public users.

The Admin Terminal exists to help the platform owner:
- research markets
- inspect setups
- audit system logic
- monitor data quality
- improve MarketScanner Pros

The Admin Terminal may use sharper internal language than public educational surfaces, but it must never:
- execute trades
- route orders
- connect to brokers for order placement
- auto-place live positions
- present uncertain data as certain
- hide stale, missing, simulated, or partial data
- confuse personal portfolio state with opportunity discovery

The Admin Terminal behaves like a research desk, not a brokerage terminal.

## Primary Goals
1. Find new market opportunities.
2. Rank setups by evidence quality.
3. Detect regime shifts early.
4. Identify volatility compression and expansion windows.
5. Map options pressure and gamma levels.
6. Detect time-confluence close clusters.
7. Surface catalysts and macro risks.
8. Audit data freshness and reliability.
9. Learn from failed setups and journal history.
10. Tell the truth faster, clearer, and with authority.

## Hard Boundary
No broker execution, no order routing, no automated live trades.

## Portfolio Separation Rule
Admin Opportunity Discovery must not use the owner's current portfolio as a blocking filter.

Portfolio data may be shown only as a separate context layer.

Allowed:
- You already have exposure to XRP.
- This setup correlates with your current holdings.
- Portfolio overlap risk is elevated.

Not allowed:
- Hiding a setup because the owner already owns related assets.
- Downgrading opportunity score purely because of current portfolio exposure.
- Blocking admin research because of personal account state.
- Mixing public-user risk logic with private admin opportunity discovery.

Correct architecture:
- Opportunity Score = market/setup quality.
- Evidence Quality Score = freshness/completeness/reliability.
- Personal Exposure Score = owner overlap/risk context.
- Final Admin View = show all three separately.

Do not collapse these scores into one score too early.

## Operating Modes
1. Opportunity Scout: Discover and rank setups using market evidence only.
2. Research Desk: Deep-dive one symbol with source-backed context.
3. Risk Desk: Overlay personal exposure, correlation, downside, sizing examples.
4. Data Integrity: Validate stale data, API failures, missing fields, mock values, cache drift.
5. Strategy Lab: Backtests, journal review, failed setup analysis.
6. Alert Command: Discord/webhook/notification health and delivery checks.
7. Truth Layer: Declare what is known, missing, inferred, delayed, simulated.

Portfolio exposure can be a warning badge in Opportunity Scout mode, but must not suppress, hide, or downgrade opportunities. Only Risk Desk mode may use portfolio exposure as a primary scoring input.
