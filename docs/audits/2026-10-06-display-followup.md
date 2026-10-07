# Display follow-up #428 — reconciled 7 October 2026

Display/layout work only. Keep the draft on visual HOLD.

## Exact inputs

- Batch: `f94d43a204237da3da758e6891244fd2dec2652a`.
- Existing PR head: `2bbee560a1bc1f26a5a097d67b8c5a56bca1b800`.
- Shared ancestor: `f0173618f429cad79b67fc2a759f039786db33d9`.
- User-supplied ZIP commit comments match these heads. Every batch file matches GitHub's blob hashes. Ancestor file versions were fetched through the authenticated GitHub connection for three-way reconciliation.
- Publication adds a merge commit to the feature branch with its old head and batch as parents. No rebase, force-push, PR merge or deployment.

## Retained changes

| Area | Display change |
|---|---|
| Markets URLs | Dedicated sector Heatmap tab; tabs follow the URL and selection updates it. Crypto section selection writes its URL and requested sections open the evidence fold. |
| Header | Full navigation begins at 1280px with compact branding through 1439px. Actual fit needs visual proof. |
| Feeds and movers | Warnings follow the visible view; gainers descend and decliners ascend in display copies and charts. |
| Crypto | Compact large amounts, cleaned/deduplicated news headlines, missing metrics combined into one line. |
| Dashboard/Macro | Heading/tabs in Macro view, no orphan links/extra Dashboard navigation, notice after content, smaller observations heading, explicit GDP units, inset yield labels. |
| Sources | Missing observation time no longer falsely claims displayed data is unavailable. No invented timestamps. |
| Portfolio | Two-decimal currency, one KPI column below 420px without mid-number wrapping, five desktop columns including Total cost. Largest-position span starts at 420px to prevent an implicit second phone column. |
| Reader wording | Global / High impact, Symbol badge SY, four-decimal XLM-style alert prices, readable Backtest/Learning wording, Australian Signal Accuracy dates and labelled. |
| Notices | Markets/Track host notice where embedded views defer theirs. Tool-specific legal disclosures remain; no claim that every tab has only one notice. |

## Newer fixes preserved

- Commodities: Yahoo gold/silver futures attribution, unavailable-value handling and source wrapping. Standalone notice retained; embedded notice defers to Markets.
- Movers: hidden-extreme-move notice retained.
- Signal Accuracy: current 1d/1w horizons, signed outcomes, shared threshold chips, sample minimum, neutral-exclusion rules and full current legal wording retained. Old competing threshold wording is not restored.
- Portfolio: current cost and side-aware P&L calculations retained. `app/tools/portfolio/page.tsx` exactly matches batch, including save behavior and legal text. Clear All Data relocation remains deferred.
- Alerts page, console classification and AlertsWidget exactly match batch. Later review withdrew grouping, creation-only Capabilities and summary changes. Their unused SavedRuleGroup component and creationOnly widget option are removed. Current limits are preserved, not reset to 999.
- Shared TabBar exactly matches the batch's wrapping version, as required by later review. The initial scrolling-tab request remains unimplemented by this revision.
- Research News/Earnings page files, APIs, scoring, workers, admin, Stripe, login, pricing, legal components and provider fetching are unchanged against batch.

## Verification

Fresh full-suite counts and failure identities are in `2026-10-07-display-full-test-comparison.json`. The 6 October JSON is historical only.

Both snapshots use the same installed dependencies; package-lock matches the dependency checkout. TypeScript and whitespace checks are recorded with the comparison. The first full comparison caught four stale assertions in newer tests: Portfolio amounts, responsive span, and embedded Commodities notice placement. Updated those expectations while retaining arithmetic, missing-price and Yahoo-source checks. The affected three files pass 16 tests, including standalone and embedded Commodities.

React review: no new fetching effects or conditional hooks; sorts use display copies; newer signed-value and missing-data behavior retained.

## Hard layout gate — HOLD

| Gate | Remaining review |
|---|---|
| One verdict above fold | Check every affected view with parent chrome. |
| About two screens closed | Measure at 1280×800 and 390×844; no new count claimed. |
| No sideways scroll at 390 | Whole document, tabs and Portfolio cards; class tests are not visual proof. |
| No fake/empty tools | Exercise loading, empty, error and populated states. |
| No engine words | Full rendered-text scan. |
| Readable numbers + one source line | Amounts, dates, source placement, missing quote time. |
| 1280/390 screenshots | Not captured for this reconciliation; Pip check required. |
| Symbol / Overview / Track | Existing reader chrome and SY badge; no route renames. |

Pip: check Markets Back/Forward and crypto section URLs, header fit at exactly 1280, Yahoo attribution, hidden-extreme notice, yield labels, Portfolio totals/missing prices, and notice duplication on every Track tab. Protected Portfolio/Alerts/Signal Accuracy legal wording has not been shortened to force the notice gate.

## Outside this reconciliation

Live Options acceptance, Overview versus current regime, calendar count discrepancies and feed 429s still need their own current-data checks. #446 already changed the shared crypto OI total: retest before treating the historical $14.35B / $4.56B mismatch as a current defect. No new provider requests or production-data writes were initiated for this reconciliation.
