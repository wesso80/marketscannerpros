# Confluence demotion — validation record, 4 October 2026

Implements Brad's seven-order confluence brief on `confluence/v1`, based on main `a52751c1`. One draft PR; Brad reviews and merges. No deployment, production configuration change, scan button, paper cycle or real trade was performed.

## Evidence and limits

The checks are deterministic local tests with mocked provider traffic, not observations of deployed behavior. Calendar/timeframe facts are still returned. Invalid/unmeasurable midpoint rows are excluded before counting. Measured midpoints still supply price levels and strike selection. Direction now requires agreeing O/I put/call and max-pain evidence with an untested 0.12 policy floor; otherwise unknown/WAIT. This is not evidence of a trading edge.

Regression fixtures cover closed and live equity sessions using 30-minute bars, both scanner entry points, short histories, opposite scan directions, calendar extremes, chain-only direction, grade/gate behavior, MPE/DVE scoring, and Golden Egg timing warnings. A weak/no-signal timeframe fixture with measured levels and agreeing chain evidence produces a bullish A-grade setup and a listed strike; the opposing-evidence fixture produces unknown/WAIT. This guards against a vacuous implementation that always returns WAIT.

Recorded unchanged-main level fixture: spot 100; measured midpoints 98, 104, 110; ATR 4; stop 97.4; targets 104 and 110; ATM strike 100. F-7 retains those values exactly within floating-point tolerance. The #341 zero-level strike tests remain unchanged.

The existing 2× span rule in `scanHierarchical` is unchanged. The sibling `analyzeDecompressionPull` actually uses 3× on main; that is also unchanged. Both now skip unusable rows before timing/counting.

API compatibility: keep `tradeQuality`, `optionsGrade`, `confluenceScore`, `legacyConfluence`, the literal `legacy confluence (secondary)`, and `eligibleForHardGate` (always false). `directionStatus`, `directionReason`, `unmeasuredTFs`, warning and display labels are additive. Existing stored payload fixtures may omit the new optional fields.

Main was rechecked before publication and had not advanced. PR #344 remains an open draft and overlaps the Symbol page; #339/#335/#332 overlap the options analyzer. Those branches were not merged or modified.

## Existing tests updated intentionally

- Golden Egg timing: former hard-gate conditions now emit a warning while the compatibility boolean stays false.
- DVE traps: compression plus time alone is 57, not a detected trap; the distant-strike fixture is 43, not a candidate. Display components remain present.
- DVE freshness: remove its unused confluence-agent mock.
- Canonical output snapshots: wording only, including the Indicator composite prefix and narrative text. Canonical scoring and thresholds are unchanged.
- F-7 extracts shared test fixtures without changing product code.

## Additional finding, deliberately not fixed in this scope

`fetchMPE` in `lib/goldenEggFetchers.ts` omits `symbol` and `assetClass` when constructing `MarketPressureInput`, despite requiring both. On the current engine this makes weight lookup fail and the helper catches it as `null`. This is an existing main defect: the regression inspects the actual helper inputs without pretending it returned a successful pressure reading. It needs a separate wiring fix. The direct market-pressure route supplies both fields and its engine tests pass. No live performance improvement or successful Golden Egg MPE value is claimed here.

DVE's dedicated scan was removed; the existing `fetchMPE` fallback may still perform its own scan. The net saving is one call removed from that route's code path, not a measured production latency or billing result.

## What we are NOT changing (put this list in the PR)
- Strike, expiry, stop and target selection logic. They keep using prior-candle midpoints, but only measurable ones (F-1). Nothing else about strike picking changes.
- The calendar and timeframe calculations themselves (`calculateCandleCloseConfluence`, `scanHierarchical` maths, timeframe table and weights, the 2× span rule). They still run and still display.
- The calendar-override direction inside the agent (it adopts a direction from about 60 correlated day/week midpoints when the decompression direction is neutral). It is now display only for options (F-4) and Golden Egg (F-5), so it can no longer decide a verdict. Removing it from the agent is a later decision.
- Dedupe of near-duplicate day/week timeframes; unknown-timeframe default weight 1.0.
- The Golden Egg indicator composite maths (structure, flow, momentum, risk), the canonical verdict engine, grades and thresholds.
- Quant fusion timing dimension (`lib/quant/*`), operator `timeConfluence` weight and permission logic (`lib/operator/*`), admin pages: off limits or out of scope; written up in the audit as follow-ups.
- Scanner `confluenceBonus` (+8/+4 for data coverage) and ranking; only one wording string changes (F-6).
- options-v21 scoring (`lib/scoring/options-v21.ts`); only the value passed in changes (F-3).
- AI assistant regime scoring (its MTF weights are already dead), UPE-CRCS worker "confluence" (a single-timeframe indicator score, naming only), watchlist signal counts, backtest-lab `tc_*` strategies, time widgets and Discord time-confluence alerts.
- The per-contract premium panels, chain data, IV and expected-move maths, the journal, the watchlists.
- Data, tables, env vars, `render.yaml`, migrations, `cryptoPaper*`, `CRYPTO_MARKETS_PAUSED`, anything under admin or operator.

## Noticed, not changed (starting list for the PR)
- `buildProfessionalTradeStack` liquidity score uses the scan's `prediction.targetLevel` (a weighted midpoint), so it is still partly scan-derived (F-3 keeps it, weight 0.20 of a 0.45 base).
- `OptionsConfluenceScanner.tsx` builds its own display scores and "adaptive mode" from `signalStrength` (same scan) as well as `confluenceStack`; F-3 only removes the stack term.
- Mean-reversion framing: price above every midpoint reads "bearish" in every uptrend (acknowledged in the `timing.ts` header).
- Day/week timeframe multiples count the same closes many times (about 60 timeframes in the calendar override).
- `lib/signals/probability-engine.ts` uses an unmeasured 0.62 base win rate for the time-confluence signal.
- Quant fusion timing dimension is identical for every symbol at a given moment (cannot rank, shifts alert thresholds for the whole cohort).
- AI regime-scoring MTF weights 0.30 and 0.35 never receive input and are renormalised away.
- The price-based timeframe confluence has never been tested (needs 30m OHLC history).


## After deploy checklist (put in the PR; Brad or Grok ticks these)
Any time (no market-hours wait):
- [ ] Symbol page (`/tools/golden-egg?symbol=LINK&type=crypto`): the badge and the header metric read "Indicator composite N/100"; hover text says it has no timeframe or calendar input; "Canonical: no qualifying setup" is unchanged; the Time panel is titled "Timeframe pull and close calendar (display only)".
- [ ] Symbol page for an equity (AAPL): same labels; permission and canonical verdict identical to before the deploy for the same bar (compare with a pre-deploy screenshot).
- [ ] Deep Analysis for any symbol: "Indicator composite (secondary)", and the timing line says "note only".
- [ ] Golden Egg API (`/api/golden-egg?symbol=...`): `timing.eligibleForHardGate` is `false`, `timing.warning` present only when a conflict exists, no `primaryBlocker` mentioning time confluence.
- [ ] `/api/market-pressure?symbol=BTC` and `/api/dve?symbol=BTC`: time component shown as display only; DVE response time is shorter (no scan); breakout and trap scores unchanged when you call twice at different minutes of the hour (the time term no longer moves them).
- [ ] Admin and paper trading unchanged: `/admin/crypto-markets` loads as before; `CRYPTO_MARKETS_PAUSED` unchanged.
- [ ] Render: one deploy only; note build minutes used before and after.

On the US options session (Tue 6 Oct 00:30 to 02:00 AEDT, i.e. Mon 5 Oct 09:30 to 11:00 New York), SPY and AAPL:
- [ ] Options Confluence tab runs without "No listed strikes available" (the #341 fix is still in place), on both symbols.
- [ ] The scan shows "Not measured on this data: 5m, 10m, 15m, 30m"; the "TFs closing together" count never includes them; no level of 0 appears in the levels, clusters or zones.
- [ ] Direction: the page shows "Direction: unknown" with the reason in most scans, or a determined direction only when open interest put/call and max pain both agree strongly (DTE about 6 or less). Record, for 5 scans across SPY/AAPL/QQQ, how often it is unknown (expected: most).
- [ ] Grade chip reads "Setup grade" and its reasons list contains IV, levels, O/I, chain quality only. Change nothing and re-run twice 10 minutes apart: grade and verdict do not change because the clock moved (they may change if prices, IV or OI changed).
- [ ] Close-calendar card shows "display only"; at a time when many timeframes close together (top of the hour, e.g. 10:00 New York = 01:00 AEDT Tue) the verdict, grade and confidence are unchanged from a scan taken at an off-minute (e.g. 09:47 NY) with the same chain.
- [ ] Strikes and levels: when a direction is determined, strikes, stop and targets appear and come from listed, quoted strikes; the stop is below price for a call and above price for a put.
- [ ] Email best opportunities (if it runs): the "why" list has no "Confluence stack" line.
- [ ] Report in the PR comment: how many of the 5 scans were unknown, any scan that still shows a timeframe count in a grade/gate reason, and any 500 from `/api/options-scan` or `/api/flow`.


## Open questions (builder is never blocked: use the default, note it in the PR)
1. When the scan is out of the direction vote, what is the direction? **Default: from O/I put/call and max pain only, with the evidence floor lowered from 0.25 to 0.12 so both must agree; otherwise "Direction unknown" and WAIT.** Both inputs are also untested, and the floor number is invented. Alternatives: always unknown (stricter), or a user-chosen call/put side that still runs the strike machinery (a new feature, not in this PR). Brad to confirm.
2. What happens to the options letter grade? **Default: keep the letter grade, computed from IV environment, risk:reward of the shown levels, O/I agreement and chain quality (the existing `optionsGrade`), labelled "Setup grade (timeframes not used)".** Alternative: show "not graded by timeframes" and no letter (breaks types and readers; not done here).
3. Does the C/F-grade WAIT gate stay? **Default: yes, but on `optionsGrade` only (it already included IV, levels, agreement and the data caps). The scan grade is removed from the gate and from risk sizing.**
4. Calendar-override confidence bump (+8) and the rating boost (+15/+10/+5): **Default: both removed (F-2). The override's direction logic stays but no longer decides any verdict.**
5. MPE and DVE time terms: **Default: computed and shown, weight 0, the remaining terms rescaled so the composite and the DVE labels keep their scale (F-5).** Alternative: leave the scale unrescaled (scores drop by up to 30 points; labels would shift).
6. options-v21 `tfConfluenceScore`: **Default: pass the neutral constant 50 and relabel the two cards "Multi-TF (not measured)"; do not edit `options-v21.ts`.** Effect: the v21 score loses a differentiator worth about 9% of its weight.
7. `analyzeDecompressionPull` (the sibling used by `generateForecast`): **Default: same guard as `scanHierarchical`; its learned-statistics side is not changed.**
8. Keep the `eligibleForHardGate` field in the Golden Egg payload? **Default: yes, always `false`, to avoid breaking readers; remove in a later PR.**
9. Rename the data keys `legacyConfluence` / `confluenceScore`? **Default: no, labels only, so the API shape and stored `ai_signal_log` / `signal log features.legacy_confluence` keep their names.**
10. Scanner `confluenceBonus` and the AI MTF weights: **Default: not in this PR (one wording string in `rankExplanation.ts` only).** A later small PR can rename the bonus to "data coverage bonus".
11. Quant fusion timing dimension and the operator `timeConfluence` weight: **Default: not touched (operator is off limits; fusion is cohort-wide). Listed under "Noticed" for a later PR; Brad decides.**
12. Where do unmeasured timeframes show? **Default: one line "Not measured on this data: …" on the Options Confluence page and the Time panel; never counted.**
13. Is the deployed build equal to main `a52751c`? **Default: confirm main's latest commit before starting; line numbers in this brief are hints only.**
14. Which Render services redeploy on a merge? **Default: assume one merge may rebuild web, worker and crons; do not edit `render.yaml`; Brad checks the dashboard.**
15. What to do about the untested price-based confluence? **Default: nothing in code. It stays displayed as "no tested edge". A pre-registered test needs 30m OHLC history (not held in the close-only cache); Pip can write that spec separately.**

## Final local results

- `npx tsc --noEmit`: pass at each completed order and on the final tree.
- Focused new and affected regression tests: **191 passed, 14 files**.
- Final full `npx vitest run`: **4,676 passed, 10 failed, 13 skipped** across 527 files.
- Unchanged-main baseline: **4,637 passed, 10 failed, 13 skipped** across 519 files. All 39 added tests pass.
- Existing failures: four slippage/end-of-data assertions in `backtestStrategySignals`; Fast-to-Deep timeout in `bulkSelectionRoute`; source-string in `commanderCommandState`; `cryptoScanAliasRows` timeout; daily cache expectation in `operatorMarketDataAccuracy`; SQL guard in `workerEquityBulkWiring`; date-sensitive CN freshness in `intelligence/globalM2Reliability`.
- F-5's full run additionally hit the known default-factor-agreement `bulkSelectionRoute` timeout, previously reproduced on unchanged main. Final run returned to the original 10 failures.
- Full-suite pass/fail/skip by order: F-1 4644/10/13; F-2 4647/10/13; F-3 4651/10/13; F-4 4661/10/13; F-5 4666/11/13; F-6 4670/10/13; F-7 4676/10/13.
- `git diff --check`: pass. Protected-path diff check: no admin/operator/quant/scoring-options-v21/paper/configuration/environment/migration edits.

The preview/deployed UI, live provider responses, weekday SPY/AAPL/QQQ observations and Render build-minute checks above remain **unchecked**. Do not describe this as a deployed or validated trading edge.
