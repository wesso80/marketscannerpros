# Admin overlap uncertainty follow-up

Stacked on #594, based on 8aa5e407. Reuses the same measured rows from the existing Edge Check query; no provider calls, new queries, writes, public changes, model changes or worker changes.

## What changed

Each overall/group after-cost mean now includes UTC daily and fixed seven-day clustered uncertainty estimates. The point estimate remains weighted by signals, so the sensitivity comparison answers the same mean question as the original output. Blocks are anchored at Unix epoch (Thursday UTC for seven-day blocks), never selected to maximise performance. Missing calendar blocks are not zero returns.

For N signals across G nonempty blocks, let U_g be the sum of residuals from the signal-weighted mean in block g. Intercept-only CR1 variance is G/(G-1) * sum(U_g^2) / N^2. The comparison uses mean +/- 1.96 SE as an approximate 95% interval. This specialises the one-way cluster sandwich calculation described in the [statsmodels source](https://www.statsmodels.org/dev/_modules/statsmodels/stats/sandwich_covariance.html). No statistical dependency was added.

Intervals are withheld below 30 nonempty blocks. Thirty is a product guard against presenting very thin cluster estimates, not a statistical sufficiency guarantee. Counts include signals, blocks, excluded invalid inputs and largest block size. Empty input has no mean or bounds.

The original Wilson hit-rate bounds, mean interval, evidence rule and sort remain nominal (independence-based). The UI labels them accordingly and removes the positive green emphasis from the nominal evidence cell. Cluster estimates do not silently alter scoring or claim a validated edge.

## Evidence and acceptance checks

- Hand-computed balanced-cluster example agrees numerically with the CR1 formula and is wider than the independent-observation interval for repeated daily shocks.
- Duplicating every observation inside the same blocks leaves the clustered interval unchanged.
- Unequal cluster sizes retain signal weighting, checked against a hand-computed example.
- Twenty-nine daily blocks, thousands of signals in one block, and short weekly histories withhold intervals.
- Fixed UTC conversion, missing dates/nonfinite/outlier returns, empty input and weekly availability are tested.
- Real route with a fake database includes counts and method disclosure. Rendered page displays unavailable intervals and nominal labels.
- 20 focused tests pass. Typecheck is checked in the locked dependency runtime with changed files copied in. No full-suite, browser viewport or live-row validation claimed.

## Remaining limitations and next work

This handles dependence within blocks, not arbitrary dependence across them. Twenty-four-hour returns cross day boundaries; daily fallback can run longer. Seven-day blocks reduce some boundary sensitivity but do not eliminate it. Shared symbols across weeks, common regimes, unequal block leverage, repeated group searches and retrospective rule selection remain limitations. An interval can be narrower than its nominal counterpart for other covariance patterns; it is not forcibly widened.

Only measured outcomes enter the existing query, so delayed and failed measurements can bias the sample. Next priority: add an eligibility/completeness ledger by period before judging whether performance persists. Then assess actual outcome-end timestamps and a forward cohort with frozen rules, including appropriate purge/embargo, before calling this validation.
