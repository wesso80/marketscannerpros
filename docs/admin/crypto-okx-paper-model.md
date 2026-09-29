# OKX USDT paper model v1

Scope: simulated crypto-admin positions only, stored in the existing USD ledger. Existing Coinbase positions retain their original cost model. No broker credentials, orders or transfers are used.

## Prices and accounting

- Only identity-matched discovered OKX spot USDT pairs are eligible.
- Current USD bid = OKX bid × Coinbase USDT/USD bid. Ask uses both asks.
- Both quote timestamps must be within 60 seconds; invalid identity, empty sizes, crossed quotes and unavailable conversion block entries.
- New entries also stop if USDT deviates more than 2% from USD. Monitoring still converts the actual rate during a depeg.
- Native signal levels are translated at the observed conversion midpoint. Stops and targets are then fixed USD levels, not native USDT orders.
- Native entry-zone checks and converted USD reward/risk checks must both pass.
- Fees and slippage are each estimated at 0.10% per side for the two-leg conversion, versus 0.05% each for Coinbase USD. These are model estimates, not the user's exchange fee tier. The USD ledger records estimated fees and the adjusted fill price.
- Instrument identifier `okx-usd-v1:PAIR-USDT` permanently selects this cost/exit model. Stored portfolio settings and existing Coinbase positions are unchanged.

## Exit chronology

The monitor fetches matching completed 15-minute OKX asset candles and Coinbase USDT/USD candles. It does not revalue old candles with today's conversion rate. Missing prefixes, missing conversion bars or history beyond 299 candles block monitoring and further entries.

Cross-exchange extrema do not necessarily occur simultaneously. For positive asset A and conversion F, the path uses conservative bounds:

- low = A.low × F.low;
- high = max(A.high × F.low, A.low × F.high), a lower bound on the actual cross-price maximum;
- open/close bounds = A.open/close × F.low.

Possible stops and gap losses can therefore be overcharged; targets can be missed. Multiplying the two highs is deliberately prohibited because that could invent a profitable touch. Stop-first and partial-entry-candle restrictions remain in force. These bounds are not exact synthetic candles or executable cross-exchange fills.

Entry evidence retains native signal, converted signal, both conversion quote timestamps, plan, cost-model version and venue. The admin decision table labels USD bid/ask and shows the conversion rate.

## Verification limits

Unit/integration tests cover conversion, stale/depegged data, target bounds, missing history, doubled cost sizing, entry refusal and paused-account exits. A deployed normal cycle must separately demonstrate provider access and real rejection/entry records. Until a converted paper position closes, live converted round-trip settlement remains unproven.
