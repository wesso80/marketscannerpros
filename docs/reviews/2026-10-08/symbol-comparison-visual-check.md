# Symbol comparison visual verification

Verified 8 October 2026 on codex/summary-layout-check, following commit 6acc23a2 and the mobile performance-card adjustment.

Actual SymbolAiSummary and SymbolComparisonChart components were bundled with esbuild and repository Tailwind styles. Synthetic AAPL/SPY/QQQ and ETH/BTC histories were injected through fixture responses. Chromium headless shell ran against a temporary loopback server; non-loopback requests were blocked. Server and browser were closed after the run.

## Results

20 browser cases passed: two asset types x two widths (1280 and 390) x five states (ready, AI unavailable, AI error, AI loading, chart error). No horizontal document overflow, overflowing descendants or browser page errors were found. Ready desktop/mobile screenshots were inspected for both asset types.

All four ready views passed period switching (1M and 1Y), keyboard date-slider movement and calculation-disclosure interaction. Evidence preceded AI narrative. Missing chart data left the evidence available. Mobile performance cards were compacted to reduce scrolling before the chart.

Six focused component tests passed after the final style adjustment. The preceding implementation run passed 34 tests across seven suites. TypeScript has six known diagnostics outside the changed files; normal CI must rerun with locked dependencies.

## Limits and next check

This verifies isolated production components using synthetic data, not the complete signed-in Symbol page, live provider histories or production operation. Next: run the complete Symbol page with mocked network responses at both widths, checking tab navigation, authentication states and surrounding layout. No merges, deployments or production/provider requests were performed.

Local artifacts are in the workspace outputs directory: Symbol research comparison preview.html, summary-browser-results.json and summary-{equity|crypto}-{1280|390}-{state}.png. The local fixture runner is in the external w6-test-runtime/summary-preview directory; it is not a committed CI harness.

## Price and indicators follow-up

Added a second mode sharing the symbol and 1M/3M/1Y selection with Compare. It renders valid OHLC candles, with a close-line fallback when OHLC is unavailable. Moving averages (SMA20/50) and provider volume start enabled. Bollinger Bands (20, 2 population standard deviations), Wilder RSI14 and MACD12/26 with a 9-period signal are selectable. Available history before the visible window supplies warm-up; insufficient values remain null. All methods are public descriptive measurements and do not affect shared/admin calculations.

The additive price projection uses the selected symbol's already-fetched history, without extra provider requests. Invalid OHLC and misaligned arrays are withheld; zero volume is preserved when the upstream helper supplies it. Existing shared fetchPrice may normalize zero volume to null; this change does not alter that helper. Price history is independent of benchmark date intersection. Compare and price coverage can therefore differ, and both disclose dates.

21 tests passed across five relevant suites after this change, including warm-up mathematics, null/zero handling, stale identity, shared period selection and response projection. The 20 browser cases passed again; all four ready asset/width combinations additionally exercised mode switching, all optional indicators, keyboard price-date inspection and preservation of the selected 1Y period. No browser errors or horizontal overflow. Desktop equity and mobile crypto indicator screenshots were visually reviewed. TypeScript still reports the same six unrelated baseline errors.

This remains isolated component/fixture verification; the complete signed-in page and real provider behaviour are unverified. No provider calls, merges or deployments were made. Next task remains complete-page verification with mocked responses.
