# Research-feed follow-up — 21 September 2026

## Released foundation

[PR21](https://github.com/wesso80/marketscannerpros/pull/21) merged as `3291009fb7e87dce7d23fb47e96e9c625f5f8e85`. Render confirms the worker live at 22:41:34 UTC and the website live at 22:43:32 UTC. Startup logged `[migration 058] disclosure_acceptance ready` at 22:43:26 UTC. The full suite for that release passed 1,641 tests with 13 existing skips.

A fresh signed-in browser load now correctly displays the disclosure gate because the earlier attempt was never persisted. The audit did not submit acceptance or manufacture a record. This is a remaining user action before continuing the new-client browser journey.

## Additional confirmed defects repaired

- **Guides:** The live provider returned HTTP 400 because `type=guides` requires `coin_id`. The general Crypto Intel widget now shows a Bitcoin/Ethereum/Solana selector when Guides is selected and sends that coin. Coin-specific widgets retain their supplied coin. The API rejects incomplete guide requests locally, constrains pagination to 1–20 and uses the provider's `posted_at` timestamp. Guide article badges recognise the response's singular `guide` value. [Official news contract](https://docs.coingecko.com/reference/news).
- **Golden Egg risk arithmetic:** A live ARB example showed requested model multiples differing from displayed R after the 30% price cap and a confirmation reference above spot. Model targets now use the same reference-to-invalidation risk denominator as displayed R. Capped targets state their achieved multiple and the cap. Invalid or wrong-side targets are withheld; structural targets retain their existing source.
- **Treasury freshness:** The endpoint supplies no observation date, so metadata now reports unknown observation freshness and a separate retrieval timestamp. The UI states that reported holdings and valuations may lag the market.
- **Treasury value versus cost:** Zero current holdings with a historical entry cost no longer imply a 100% realised loss. The comparison is unavailable without current holdings or valid cost/valuation data; sales proceeds cannot be inferred. Labels say “Value vs cost” and explain that realised gains and proceeds are excluded.
- **Treasury usability:** Negative dollar amounts use the same K/M/B formatting as positive amounts. The 180-entity table is paginated into 20-row pages, with page reset on coin or sort changes.

## Verification

- **80 focused tests passed**, including 14 new provider/valuation/model-arithmetic cases, Golden Egg hardening, existing audit regressions and navigation/layout guards.
- Existing source guards were updated for the shared valuation helper and stricter pagination limits. Their underlying unavailable-data behavior is exercised by executable tests.
- Production build and Render deployment outcome are recorded in the release PR.
- Live browser verification of the new guide selector, pagination and updated model descriptions is pending the user's persisted disclosure acceptance. Their pre-fix failures were observed directly; the post-fix browser journey is not claimed as complete.

## Still needed for a 5/5 assessment

The provider and data-integrity repairs do not establish trading performance. Remaining work includes full-universe technical coverage beyond Fast's ten enriched leaders; source reconciliation after provider recovery; common funding periods; the legacy history volume representation and contaminated older cache rows; live calendar configuration; complete Backtest/Journal/Portfolio, alert, billing and mobile journeys; and sufficiently sampled outcomes with fees, slippage, liquidity constraints and out-of-sample validation. No execution, billing, alert delivery or trading edge was certified in this pass.
