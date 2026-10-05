# Job 2 — Track shell and Portfolio (work in progress)

Base: `bd919bee5c658e8855b277102a063cfb85a75953` (`batch/oct-wp`).

This draft replaces the duplicate Track hero/rail with a title and shared TabBar, and Portfolio's stacked summaries with one factual recorded-position summary. Portfolio has Overview, Positions, Ledger, Risk and Allocation tabs. Add Position uses the existing form. Empty portfolios show the shared labelled illustrative EmptyState instead of zero-value summary tiles. The overview shows existing value and open P&L, largest allocation, and an allocation donut; risk, performance and record actions are folded. Calculations, persistence, price refresh, tier limits and API handlers are unchanged.

## Verification

- Production `next build`: exit 0 with dummy environment. No genuine provider credentials supplied.
- 168 focused checks across 18 files pass, including full page renders with mocked fetch, empty/new-user action, loaded allocation, closed folds, source count and existing Portfolio math/persistence regressions.
- Source-string tests updated only for intentionally removed duplicate heroes, rails and tab markup. Financial helper expectations unchanged.
- No full-suite run: prior FRED-network block remains in force.

## Gate status — not merge ready

| Gate | Evidence / remaining work |
|---|---|
| One verdict | Render confirms one factual position summary. First-fold geometry confirmed in mocked Pro/Free captures. |
| Two screens | Populated 1.279 / 1.573 screens; empty 1.156 / 1.332 screens. Pro and Free overview match. |
| No overflow | All phone captures have scrollWidth 390. |
| Honest tools | Empty page has an explicitly labelled illustration, no zero-value summary tiles; Today says Not measured. |
| Word scan | Overview render passes raw-value scan. All tabs, folds and account tiers still need full DOM scan. |
| Numbers / source | Existing money formatters reused; one SourceLine in rendered overview. Position mark observation times are not available in the current Position model; no timestamp invented. |
| Screenshots | Mocked before/after screenshots and raw observations are in before/ and after/. |
| Naming | Track title/shared bar; Portfolio overview names. Full DOM/chrome scan pending. |

## Noticed, not changed

- There is no reliable matching prior-session value in the current Portfolio input. Today is explicitly Not measured, not substituted with open P&L or a cash-flow-contaminated equity delta.
- Existing position refresh, operator-state and persistence effects remain. All test fetches are mocked; no live Portfolio visit was used to test this change.
- Expanded Risk, Allocation, Positions and Ledger still require the complete word/length review. This draft is not a claim those views meet the final hard gate.
- Account settings, Journal, Alerts and other Track tab bodies are their separate jobs.
- #353 real-session proof remains blocked: Render production is main and PR previews are disabled. Existing WP1 PNGs retained pending Brad decision.

## Browser proof update

The duplicate Track tool rail outside the page has been removed only on `/tools/workspace`; header dropdown and legacy route links are unchanged. Pro and Free populated overviews: 1.279 desktop / 1.573 phone screens; new-user Pro: 1.156 / 1.332; signed-out account gate: 1.000 / 1.000. One first-fold factual summary and one source line in authenticated captures, all folds closed, no page errors, phone widths exactly 390.

Before populated: 3.086 / 7.263 screens; before empty: 3.061 / 7.031. Before uses the previously built #371 tree: its Track/Portfolio source is unchanged from the Job 2 batch base. After uses this draft. Every API request is intercepted with synthetic fixture data; non-local browser requests are aborted. No provider or production Portfolio endpoint is called. Screenshot fixture includes a revision token so the existing sync guard behaves normally; attempted test writes receive local mocked responses.

Source explicitly says mark basis and observation times were not collected. The UI does not invent them. Initial diagnostic screenshots that omitted the fixture revision are superseded and are not retained here.

Full-page render regressions also scan each of the four detail tabs for raw missing values; all pass. Expanded browser scans for all controls, unusual saved text and all account states are still pending, so this remains a draft.
