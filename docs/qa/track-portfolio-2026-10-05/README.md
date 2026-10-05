# Job 2 — Track shell and Portfolio (work in progress)

Base: `bd919bee5c658e8855b277102a063cfb85a75953` (`batch/oct-wp`).

This draft replaces the duplicate Track hero/rail with a title and shared TabBar, and Portfolio's stacked summaries with one factual recorded-position summary. Portfolio has Overview, Positions, Ledger, Risk and Allocation tabs. Add Position uses the existing form. Empty portfolios show the shared labelled illustrative EmptyState instead of zero-value summary tiles. The overview shows existing value and open P&L, largest allocation, and an allocation donut; risk, performance and record actions are folded. Calculations, persistence, price refresh, tier limits and API handlers are unchanged.

## Verification

- Production `next build`: exit 0 with dummy environment. No genuine provider credentials supplied.
- 151 focused checks across 17 files pass, including full page renders with mocked fetch, empty/new-user action, loaded allocation, closed folds, source count and existing Portfolio math/persistence regressions.
- Source-string tests updated only for intentionally removed duplicate heroes, rails and tab markup. Financial helper expectations unchanged.
- No full-suite run: prior FRED-network block remains in force.

## Gate status — not merge ready

| Gate | Evidence / remaining work |
|---|---|
| One verdict | Render confirms one factual position summary. First-fold geometry pending. |
| Two screens | Exact 1280x800 and 390x844 measurements pending. |
| No overflow | Shared tabs wrap; browser measurement pending. |
| Honest tools | Empty page has an explicitly labelled illustration, no zero-value summary tiles; Today says Not measured. |
| Word scan | Overview render passes raw-value scan. All tabs, folds and account tiers still need full DOM scan. |
| Numbers / source | Existing money formatters reused; one SourceLine in rendered overview. Position mark observation times are not available in the current Position model; no timestamp invented. |
| Screenshots | Before/after browser proof not captured yet. |
| Naming | Track title/shared bar; Portfolio overview names. Full DOM/chrome scan pending. |

## Noticed, not changed

- There is no reliable matching prior-session value in the current Portfolio input. Today is explicitly Not measured, not substituted with open P&L or a cash-flow-contaminated equity delta.
- Existing position refresh, operator-state and persistence effects remain. All test fetches are mocked; no live Portfolio visit was used to test this change.
- Expanded Risk, Allocation, Positions and Ledger still require the complete word/length review. This draft is not a claim those views meet the final hard gate.
- Account settings, Journal, Alerts and other Track tab bodies are their separate jobs.
- #353 real-session proof remains blocked: Render production is main and PR previews are disabled. Existing WP1 PNGs retained pending Brad decision.
