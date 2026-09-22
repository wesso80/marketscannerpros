# Scoring remediation — 22 September 2026

Engineering corrections to the scoring audit. The changes improve consistency, arithmetic and handling of missing data. They do **not** demonstrate a trading edge, calibrated success probabilities or a 5/5 institutional rating.

## Implemented

| Audit finding | Correction | Verification / boundary |
|---|---|---|
| F01 — Golden Egg long bias | Structure, momentum and directional flow assess the selected long or short side. A risk-off veto applies to longs. Equal MACD/MA readings are neutral votes. | Mirrored long/short regression fixtures now have equal structure and momentum quality. |
| F02 — Golden Egg total did not reconcile | Each component exposes availability, effective weight and actual points; missing flow contributes zero. Coverage, raw total, cap adjustment and final score are displayed. | FIVN audit fixture: 25.50 structure + 0 flow + 17.00 momentum + 14.25 risk = 56.75, rounded to 57. |
| F03 — direction mismatch | Canonical factor direction also sets the row bias and preliminary scenario geometry. Pro uses the same boundary. Explicit bearish direction takes precedence over a bullish EMA fallback. | Direction/level regression; opposite-side preliminary stops and targets are rebuilt and neutral levels are cleared. |
| F04 — shortlist before gates | Final eligibility and score are applied before the ranked top ten. Browser uses the already-final score without another 0.4 multiplier. | Eleven-row fixture retains the eligible eleventh candidate ahead of the blocked first candidate. |
| F05 — crypto volume units | Crypto turnover remains USD; equity shares are multiplied by price once. | Price/volume unit regression covers cheap and expensive crypto assets. |
| F06 — data truth bypass | Shared score applies trust caps, actual bar freshness and blockers for required inputs and interval mismatch. Future timestamps become unknown; old intraday bars on today's date age normally. | Fresh/delayed/stale/unknown and missing ATR fixtures. Missing trust evaluation blocks eligibility. |
| F07 — historical model mismatch | Historical proxy formula extracted into one module, used by historical replay and exposed by live Ranked preprocessing. Backtest visibly names its technical proxy and signed thresholds. | Existing proxy fixture remains bullish 90; full historical MSP replay is still unavailable without point-in-time external inputs. |
| F08 — wrong factor denominator | Coverage uses the declared applicable groups. Positioning is crypto-only; quality is a multiplier; unused sentiment is not counted as a missing catalyst feed. | Complete equity profile can reach HIGH evidence and 100% factor coverage. |
| F09 — missing opponent boosted rank | Score uses a conservative bound for missing applicable factor votes. Observed direction, magnitude, coverage and conservative magnitude are separate fields. | Removing an opposing group cannot improve the bound with profile, regime and external multipliers held fixed. This is not a claim about arbitrary changes to underlying indicator sub-signals. |
| F10 — Radar saturation | Related signals share seven group budgets totaling 100; deductions apply after the bounded base. Missing volume and crowded funding carry numerical penalties. | Strongest fixture loses exactly 30 points for extension; crowded funding loses 10. New version and components travel into reports/snapshots. |
| F11 — misleading macro confidence | Liquidity evidence quality counts fresh finite return inputs and usable M2 coverage. Fragility evidence quality cannot exceed observed series coverage and is zero for unavailable/stale input. | Stale liquidity audit fixture falls from presence coverage 100 to evidence quality 0; single-series Fragility stays below 5. Native stage calculations are unchanged. |
| F12 — weekly ATR scaling | Weekly bars/day uses 1/5 for equity and 1/7 for crypto. Fractional rates are retained. | Weekly 8% ATR and its daily equivalent receive the same risk bucket. |
| F13 — options contribution mismatch | All 15 contribution rows include their inner weight, outer layer weight and permission multiplier. Headline rounding has no artificial 1/99 floor/cap. Key confluence displays use /100. | Allowed and blocked candidate contributions reconcile to the displayed integer score. |

## Scanner contract: msp.scanner.v2.1

The factor weights are retained. The missing-data treatment and eligibility boundary are versioned changes.

Let C be available factor weight divided by applicable factor weight. Let D be the signed weighted average of available factor votes, each in [-1, 1].

- Observed magnitude = 100 × abs(D).
- Conservative magnitude = 100 × max(0, abs(D) × C − (1 − C)).
- Intermediate score = round(conservative magnitude × evidence × freshness × liquidity multipliers).
- Final score = round(min(intermediate score × regime gate, trust cap)).
- PASS / WATCH / BLOCK is separate from the score. PASS means the data and configured gates permit further research; it is not an instruction to trade.
- Ranking orders PASS before WATCH before BLOCK, then final score, then symbol.

The missing weight is treated as an unknown opposing vote when calculating the conservative bound. It is not filled with invented market values. Available factor votes, both weight bases, multipliers and the final cap are retained for explanation.

Ranked and Pro use this contract, but may use different universes, horizons and observed inputs. Equal tickers alone do not imply identical scores. Pro light scans without technical history remain visible as blocked neutral observations; a price change alone cannot masquerade as a technical long or short setup.

Best-effort Ranked event recording now includes all evaluated candidates before the top-ten limit, the model version, original factor contract, input basis, derivatives, technical proxy and shortlist membership. This starts more useful forward evidence collection; it does not manufacture historical coverage or guarantee a successful database write.

## Other model identities

- Golden Egg: `msp.golden-egg.v2.1`, fixed applicable component budgets (30% structure, 25% flow, 20% momentum, 25% risk). Forex flow is outside its applicable profile. Crypto flow remains missing while comparable directional derivatives evidence is unavailable; absolute OI is context.
- Radar pre-move: `msp.radar-premove.v2.1`. Budgets are compression 25, participation 15, relative strength 15, structure 15, trigger proximity 15, momentum 10, context 5. These are explicit heuristic budgets, not fitted weights.
- Historical technical proxy: `msp.technical-proxy.v1`. Signed bullish scale; longs require score ≥ threshold, shorts require score ≤ 100 − threshold. Price-only history does not recreate full MSP permission, cross-sectional ranking, options, funding or news.
- Options score: existing context/setup/execution weights 30/45/25 are retained. Contribution reporting is corrected. Delta-based quantities remain proxies, not calibrated probabilities of profitable trades.

## Acceptance checks

- Full suite: 1,770 passed, 13 skipped; 140 passing files and two skipped files, with two workers to avoid concurrent Monte Carlo timeout.
- Final affected workflow checks: 72 passed across five files after the display wording/permission updates.
- TypeScript and the optimized Next.js production build passed. Build-only placeholder credentials were used locally; production configuration was unchanged. Render deployment and live-page acceptance are checked after the push.
- Existing display tests were brought into line with the already-shipped marked-equity label and DETECTED volatility label. The light-scan test now requires incomplete candidates to stay visible and blocked/neutral.

## What remains before claiming predictive quality

1. Freeze this version and its outcome definitions. Choose horizon, entry timing, invalidation/target, costs and slippage before inspecting results.
2. Build a point-in-time dataset for equities and crypto, retaining the entire evaluated universe, rejected candidates, timestamps, corporate actions and missing-data flags. Add complete Pro capture and persistence monitoring; Ranked best-effort events alone are insufficient.
3. Compare against simple momentum/trend and regime-only baselines, plus appropriate passive benchmarks. Use identical capital, turnover, spread and fee assumptions.
4. Run chronological walk-forward tests with purging/embargo for overlapping outcomes and a final untouched holdout. Measure net expectancy, drawdown, turnover and score-bucket ordering separately by asset, direction and regime.
5. Review indicator correlations and missingness within each factor group. Reject redundant features; change weights only when held-out evidence justifies it.
6. Calibrate probabilities only for a precisely defined outcome with sufficient independent observations and uncertainty intervals. Keep research quality expressed as /100 until then.
7. Shadow the frozen version forward, including losing and rejected observations. Set evidence-based acceptance thresholds and monitoring for drift and stale/missing inputs.

No weight optimization, probability calibration or out-of-sample performance improvement is claimed by this release. Lower scores and more WATCH/BLOCK labels can be the correct result of exposing missing evidence.
