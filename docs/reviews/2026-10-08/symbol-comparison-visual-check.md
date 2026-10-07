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
