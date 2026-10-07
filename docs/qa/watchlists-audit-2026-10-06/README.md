# Watchlists — Pip visual check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

Previously every symbol card and its many actions were expanded below repeated metrics and sticky filters. The initial view now shows five symbol cards, one list summary, and folded list selection, management, filters, quote evidence/actions and bulk actions. Show all retains access to the complete filtered list. Controls have larger targets; visible mode labels are Research / Tracking / Risk review while internal values remain unchanged. One source line explains separate quote sources and dates; per-symbol PriceStamp remains inside its fold.

All navigation, data fetch, sorting, summary calculations, create/rename/remove/delete, export and risk restrictions are unchanged. The block from launchTool through exportWatchlist is byte-identical to base, SHA-256 `4419da157ce102a6297cd30d3715821a034319101968148679262a6f4830f4bf`. The five-row cap is applied only during JSX rendering, so the full list still drives quotes, filters, summary, export and bulk actions.

Validation: 35 focused tests passed across watchlistsCompact, watchlistTodayMove, watchlistPricing, watchlistDedupeManage and optionsWatchlistIdentity. TypeScript and whitespace check passed. UI tests cover five/all, full quote input, filter changes, asset-aware links, closed folds, one source/summary, internal mode values and tracking-lock restriction. APIs/providers are mocked; no production writes or provider requests.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | Pass. One list summary above the fold at 1280 and 390. See [evidence.md](evidence.md) |
| About two screens closed | Pass against the 2.3 hard max. Five symbols closed are 2.211 phone screens, above the 2.0 target. Show all 8 is 2.882 and is the expanded list |
| No sideways scroll at 390 | Pass. Document width 390. Track tabs wrap |
| No fake/empty tool | No fixture data in production; existing fetch-failure caveat below |
| No banned/engine words | Mode labels plain; populated and error copy captured |
| Readable numbers + one source line | One SourceLine on populated and empty. Error has none. Quote details stay folded |
| Screenshots 1280 and 390 | Captured, mocked. [evidence.md](evidence.md) |
| Symbol / Overview / Track chrome | Workspace chrome included. Symbol routes were not clicked |

**Pip to check:** Workspace → Watchlists at 1280×800 and 390×844. Capture before/after with five symbols and folds closed; record first-fold summary, document height/screen count and overflow. Include crypto, equity and an options-contract symbol, cached and missing prices, and long list names. Exercise switch list/mode, Show all/five, filters/sort, quote evidence, Symbol/Options links and tracking lock. On disposable test lists check create, rename, add/remove and confirmed list deletion, export and first-visible alert behavior. Shared Workspace chrome must be included.

Existing caveat retained: fetchItems catches failures by logging, and can retain previous items after a failed list switch. This presentation PR does not claim that data-state failure fixed; it needs a separate follow-up and must not be marked as full data-truth acceptance. Quote date/Today semantics and provider freshness are unchanged.

Layout-gate screenshots are attached in [evidence.md](evidence.md). Switch list, filters, quote folds, symbol routes, and list mutations were not run. Keep draft. No merge/deploy. The stale-list-on-load-failure caveat above is still open.
