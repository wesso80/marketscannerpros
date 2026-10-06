# 6 October display follow-up — Pip review checklist

Base: `batch/oct-wp` at `019956dc` (includes #424 and #425). #422 was open at start; Symbol deep-label files are untouched. This is a display/layout change, not live acceptance evidence. No production records or provider payloads were changed.

## Implemented

| User item | Change / review target |
| --- | --- |
| Markets heatmap and URL state | Dedicated Heatmap tab reuses the existing equity sector grid. `tab=heatmap` selects it. Market tab selection writes canonical URLs; tab state follows URL/back/forward. Crypto `section=heatmap` opens the Market evidence fold with the requested widget; its selector writes the section URL. |
| Header at 1280 | Full desktop navigation starts at 1280 in both CSS and drawer matchMedia. Compact MSP branding at 1280–1439 reserves link space. |
| Commodities warning on crypto tabs | Outer feed warning now follows the displayed view. Commodities owns its errors; an unrelated commodities failure is not shown on crypto. |
| Movers order | Display copies of gainers sorted descending and decliners ascending by percentage, including charts. Eligibility, scores and calculation order untouched. Overview lists use the same visible ordering. |
| Large crypto values | Shared crypto amount rendering uses compact K/M/B/T values, e.g. $14.35B. Values and inputs unchanged. |
| Duplicate Markets disclaimer | Embedded Crypto assets and Movers defer to the Markets host disclaimer; standalone views retain their notice. |
| Crypto news | Deduplicate by normalized URL or cleaned title; remove RSS/news/guide and publisher prefixes. Provider objects and fetches unchanged. Research News/Earnings page files untouched. |
| Empty tiles | Markets metric summaries and crypto evidence sections render available values and combine missing metrics into one labelled line. Genuine zero is retained. |
| Research tabs / heading | Shared tabs are a single horizontal scroll row with nonshrinking labels. Published macro observations becomes a small paragraph, outside global h2 enlargement. |
| Dashboard Macro | Dashboard heading/tabs appear in both views. Macro uses a subordinate heading. Orphan My Pages link removed. Yield-curve end labels are inset/aligned away from the y-axis, with more top padding. |
| My Pages | Dashboard disclaimer follows content; orphan Crypto Derivatives link and extra Track navigation on Dashboard removed. |
| False source unavailability | Shared plain source line distinguishes absent observation time from absent data: Observation time not supplied. It does not fabricate timestamps. Applies to Earnings, My Pages, Saved Cases, Crypto and News without editing Patch's News/Earnings files. |
| Remaining labels | Calendar Global / High impact; Symbol catalog badge SY; real GDP tile explicitly labelled US real GDP (trillion USD). Research News/Earnings copy left alone. |
| Portfolio | Currency has exactly two decimals; compact KPIs use a single column below 420 to keep figures together. The proposed Clear All Data relocation is withdrawn to avoid Patch’s concurrent Portfolio save work; the page file matches the batch exactly. |
| Alerts repetitions | Identical displayed condition/symbol/threshold grouped under a closed count disclosure; every saved ID and action remains inside. No records deleted or merged. Full threshold remains in a title attribute; XLM-style prices display four decimal places, very small prices retain enough precision. |
| Alerts summaries | Simple price/percent/volume rules no longer count as Smart from a legacy flag. No-trigger history shows a sentence rather than a status in a symbol slot. Unlabelled proportion bar removed. Plain lock wording and no 999 sentinel in embedded plan/creation display. |
| Alerts folds | Native toggle state updates Expand/Collapse. Capabilities no longer repeats the console filters/list: it hosts creation-only controls with Price rule / Market condition choices. Existing creation handlers unchanged. |
| Journal | Review by setup requires both review summary and modules, so a null body has no fold. Journal settings already has the auto-log toggle, help and Export/Import/Clear actions on this batch; retained rather than hiding working controls. Verify the reported live empty state against this version. |
| Backtest / Learning | Display helper removes option emoji and translates Brain Signal Replay / AIO / Bias thresholds / BBWP / DVE wording. Registry identifiers, thresholds, strategies and engine maths untouched. Uppercase CSS removed from Backtest fields. |
| Signal Accuracy | Threshold explanation states movement in recorded versus opposite direction, matching the existing worker (not two overlapping positive thresholds). Australian dates, labelled, at least. One full disclaimer. Standalone Track navigation uses shared TabBar styling. |
| Track disclaimers | Embedded Journal, Backtest, Learning and Alerts no longer repeat the host disclaimer. The full Portfolio disclaimer is retained unchanged, per review. |

## Verification

- TypeScript: `./node_modules/.bin/tsc --noEmit` passed.
- Focused Vitest: 28 passed in six files: `explorerLayout`, `displayAuditOct6`, `portfolioFormatMoney`, `alertsConsoleMultiStatus`, `alertsLayoutRender`, `workspaceTabPanels`.
- `git diff --check` passed.
- `wp3MoversRows.test.tsx` still expects retired CRCS/table markup. One failure reproduced on unchanged `019956dc` in a separate worktree. Not rewritten to mask it.
- No full-suite pass claimed.

## Hard layout gate — HOLD for visual proof

| Gate | Status |
| --- | --- |
| One verdict above fold | Existing verdict components retained; authenticated visual recheck pending. |
| Approximately two screens closed | Pending 1280/390 measurement; no claim from jsdom. |
| No sideways page scroll at 390 | Nonwrapping inner tab scrollers and Portfolio layout implemented; full-page check pending. |
| No fake/empty tools | Missing metrics collapsed; empty review fold gated; Journal settings has real controls in source. Live recheck pending. |
| No banned/engine words | Requested display mappings changed; complete live copy scan pending. |
| Readable numbers / one source line | Formatting and timestamp fallback implemented and focused tests pass; full-page recheck pending. |
| 1280 / 390 screenshots | NOT CAPTURED. Current browser controls did not expose viewport resizing; previous 1363 audit screenshots are not proof for this change. |
| Symbol / Overview / Track naming | Symbol catalog badge corrected; no route renames. |

Pip: open both widths, check all affected tabs before/after expansion, test browser Back/Forward between Markets and crypto sections, check header links fit at exactly 1280, inspect yield labels, confirm Portfolio figures do not split, open grouped alerts and confirm each saved rule still has its own actions, and confirm a single notice on each Track page. Do not merge until visual gate is checked.

## Explicitly untouched data questions

- Calendar: 4 high-impact events versus 16; 78 versus 31 events.
- Macro Mixed versus header TREND UP.
- BTC OI $14.35B versus $4.56B.
- 429 errors on commodities and news feeds.

No changes to data providers, rate limits, scoring, workers, Stripe, admin, pricing, login, legal amounts, or Research News/Earnings page files. No merges/deployments performed.

## Review follow-up: Portfolio ownership and intentional assertions

- Restored `app/tools/portfolio/page.tsx` exactly to batch `79549d2c`: no page-file delta, no disclaimer edit, no overlap with Patch’s save fix. Clear All Data relocation is deferred. Currency/KPI fixes remain isolated in `formatMoney` and `PortfolioOverview`.
- Updated stale assertions for scrolling tabs, two-decimal dollar amounts, missing observation time, reader-facing plan wording and classification of plain price rules. Enforced limits remain 3/999; a legacy Smart flag does not change a simple price rule’s displayed classification.
- Alert pagination now pages condition groups. The render regression opens Show all for twelve distinct rules and verifies all twelve rows remain; repeated rules keep separate IDs/actions inside their group.
- Exact 390 layout proof remains Pip’s check. Class assertions and jsdom rendering are not screenshot evidence.

### Full-suite comparison after review fixes

Ran `npx vitest run --reporter=json --outputFile=...` on the revised draft and unchanged batch `79549d2c`, in separate worktrees using the same installed dependencies. Both commands completed with exit 1 due to existing failures.

| Result | Batch | Revised draft |
| --- | ---: | ---: |
| Total tests | 5,374 | 5,381 |
| Passed | 5,311 | 5,318 |
| Failed tests | 50 | 50 |
| Skipped/pending | 13 | 13 |
| Vitest failed-suite counter | 46 | 46 |

**Zero new failure names; the failed-test sets match exactly.** The reported 46 failing-test baseline was not reproduced as a test count here: there are 50 failed assertions on both runs (the reporter's failed-suite count is 46). No claim of a green full suite. The exact matching names and counters are saved in `2026-10-06-display-full-test-comparison.json`. TypeScript and `git diff --check` also pass.

## Review rework (rebased onto batch `cca76a6`)

- **Disclaimer once on Track and Markets.** Embedded tabs already defer theirs, so `app/tools/workspace/page.tsx` and `app/tools/explorer/page.tsx` each render one `ComplianceDisclaimer compact`. Embedded Commodities and Equity Deep-Dive now defer to the host too, so every Workspace and Explorer tab shows exactly one.
- **Alerts banner restored** to the full amber "user-defined notifications only…" text.
- **Pro tile restored** to `{ALERT_LIMITS.pro} active alerts` (999). Enforced caps unchanged.
- **x/3 counter restored** in `AlertsWidget` (including the creation-only view).
- **Journal upgrade block restored** inside "Review by setup" (Intelligence Dock — Pro Feature).
- **Tabs wrap again**: `TabBar` reverted to the batch version; the two tab-layout tests and the Pro-tile assertion reverted to match.
- Added regression checks in `test/displayAuditOct6.test.ts` for all of the above.
- Verification: `tsc --noEmit` clean. On the 44 test files this PR touches or that reference the changed files, the failing set is identical to `cca76a6` (14 pre-existing failures, none new).
