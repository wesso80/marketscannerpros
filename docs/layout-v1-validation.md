# Layout v1 validation

## Scope and evidence

L-1 through L-8 implement the public Overview → Scanner → Symbol → Options → Track layout. Started after the O-1–O-13 merge (#340, `550aa7f6`); rebased after notifying Brad onto #341 (`8b50725e`). The merged options analyzer changes are preserved.

Local verification after rebase: TypeScript clean; Vitest **4,628 passed, 10 failed, 13 skipped** across 517 files. The same ten failures occurred on the original main baseline. New layout tests and the new #341 tests pass. These are local unit, SSR fixture and source checks, not live browser or production verification. No Render build/deploy, production mutation, migration, or data deletion was performed.

Protected implementation files are unchanged: admin/operator pages, middleware, crypto paper engine and pause switch, options decision/analyzer logic, provider calls, journal storage and P&L calculations, render.yaml. Options Confluence and Flow components were moved for reuse; their old routes are redirect wrappers. Existing whitespace in those moved components was preserved.

## Pre-existing test failures

| File | Failures | Detail |
|---|---:|---|
| backtestStrategySignals.test.ts | 4 | Date-dependent bar count and end-of-data expectations |
| bulkSelectionRoute.test.ts | 1 | Existing Deep crypto scan test timeout |
| commanderCommandState.test.ts | 1 | Existing source-string expectation for paused research alerts |
| cryptoScanAliasRows.test.ts | 1 | Existing alias scan test timeout |
| operatorMarketDataAccuracy.test.ts | 1 | Existing cached daily-data call expectation |
| workerEquityBulkWiring.test.ts | 1 | Existing SQL column source guard |
| intelligence/globalM2Reliability.test.ts | 1 | Date-dependent CN LIVE vs STALE |

## Forex inventory and scope boundary

`rg -i forex app components lib` returned **396 matching lines before**, **387 after**. This is a text inventory, not a count of active scans or UI controls.

**Visible UI — NOT empty globally.** The specified Scanner, Home CommandHub, alert and journal new-entry pickers have been changed. Visible references outside the brief's permitted Forex file list remain, including the WatchlistWidget new-entry Forex choice, TimeGravityMapWidget, HomePreviewStrip, legacy correlation/scalper/backtest copy and older marketing/metadata copy. The global “none visible anywhere” acceptance check is therefore **not met**. The brief explicitly says to change only listed surfaces; this PR does not silently expand Forex removal.

**Kept for old records.** Forex type unions and record readers remain; journal and alert rows use “Forex (retired)”. Daily scan active assets exclude Forex; the worker universe excludes it, and the specified Forex quote paths are retired. No stored row was deleted or updated.

**Other references outside scope.** Generic bulk/scanner and market-data helpers still contain Forex branches; operator/admin code is untouched. Do not interpret this PR as disabling every possible Forex endpoint.

## Noticed, not changed

- Public APIs do not retain observation timestamps for every CoinGecko heatmap price or Portfolio mark. Those stamps say **time unknown**, rather than presenting fetch time as market observation time.
- The daily-picks API has date lookup but no available-date index. Overview compares the prior expected scan date (previous equity trading day / crypto UTC day); it shows a dated missing-history message when absent, rather than searching arbitrary older dates.
- Existing Golden Egg tab content and old derivatives internals are retained as required. The new public headers/rows are stamped; this is not a rewrite of every legacy price widget.
- The crypto derivatives detail remains the existing dashboard universe; the symbol link does not add new derivative coverage.
- `/operator` middleware still accepts a valid admin session or an app session matching the configured admin allowlists; otherwise redirects to authentication with `next`. No access policy changed.
- Local checks do not prove deployed data freshness, live option quotes, login sessions, or deployment health. Main/deployed parity needs checking after Brad's one merge.

## Defaults used

1. Nav label Symbol.
2. Retain last-session digest inside the dated change section.
3. No new symbol alias route.
4. Unlink legacy single-symbol primary navigation; keep routes.
5. Redirect standalone options-confluence/flow with symbol and expiry.
6. Crypto Terminal/dashboard link to dedicated crypto detail; keep old components.
7. Keep Terminal in All tools.
8. Five latest stored picks per tab, with actual scan date.
9. One PR/merge; no Render configuration changes or claims about which services rebuild.
10. Leave operator access unchanged (see above).
11. No fear-greed-custom or open-interest tiles on Overview/Symbol.
12. Extract the existing per-contract block and call the existing calculations.
13. Preserve O-3 IV/move calculations and labels.
14. Verify merged source on main; do not claim deployed parity from source alone.

## After-deploy checks (not executed)

- [ ] L-1: Check weekday, weekend and Sydney DST price/time labels; missing observation time must warn.
- [ ] L-2: Login and checkout land on Overview; five primary tabs in order; admin/operator absent from navigation/catalog/sitemap and direct access unchanged.
- [ ] L-3: Next daily scan has zero Forex rows; old Forex journal/alert still reads as retired; no data deleted. Global no-Forex UI remains blocked by the out-of-scope items above.
- [ ] L-4: Scanner has Crypto/Stocks only; `?type=forex` falls back to Stocks; row dates and Symbol handoffs match.
- [ ] L-5: Overview timestamps/bases, dated comparison or missing-history message, no Forex/FG/OI tile, correct API-ranked five picks per tab.
- [ ] L-6: BTC/ETH spot basis and rolling 24-hour change, OKX funding matches source; research rank and scenario bar date agree; journal/watchlist draft handoffs and derivatives link work.
- [ ] L-7: During a US weekday session (e.g. Tue 6 Oct 00:30–02:00 AEDT), bare Options opens SPY; expiry flows to both lazy sections; real bid/ask costs, spread, breakeven and theta match; invalid quote warns; Symbol and Options IV/move agree for same expiry.
- [ ] L-7/L-8: Log a LONG put with correct strike/expiry; premium rise is gain; watchlist keeps other contracts. Option/stock stamps distinguish live from last New York close.
- [ ] L-8: Crypto detail funding is correctly scaled and names OKX; watchlist/journal/portfolio marks show observation basis or unknown time.
- [ ] Crypto Markets paper trading remains unchanged and paused; no real-money actions.
- [ ] Render: one merge/deploy only; record build minutes before/after and verify deployed commit.

## Full Forex text inventory after changes

Each entry below is a search hit, not an assertion that the code executes. The classifications and exceptions above govern interpretation.

```text
lib/barCache.ts:export type BarMarket = 'equity' | 'crypto' | 'forex' | 'commodity' | 'options' | string;
app/tools/scanner/page.tsx:type AssetClass = 'crypto' | 'equity' | 'forex';
app/tools/scanner/page.tsx:  const [selectedAssetClass, setSelectedAssetClass] = useState<'equity' | 'crypto' | 'forex' | null>(null);
app/tools/scanner/backtest/page.tsx:                  Data: <strong className="text-slate-200">Alpha Vantage</strong> for equities/forex,
lib/operator/market-data.ts:  // Equities / Futures / Forex / Options → standard endpoints. Regular-session bars only: Alpha Vantage includes
lib/operator/watchlists.ts:  'forex-majors': {
lib/operator/watchlists.ts:    name: 'Forex Majors',
lib/operator/watchlists.ts:    market: 'FOREX',
lib/watchlist/quotes.ts: * - Each item is priced by its saved asset type (crypto / forex / commodity / equity).
lib/watchlist/quotes.ts:export type WatchlistAssetType = 'equity' | 'crypto' | 'forex' | 'commodity';
lib/watchlist/quotes.ts:  if (t === 'forex' || t === 'fx' || t === 'currency') return 'forex';
lib/goldenEggFetchers.ts:export function detectAssetClass(symbol: string, typeOverride?: string): 'equity' | 'crypto' | 'forex' {
lib/goldenEggFetchers.ts:  if (s.length === 6 && fx.some(f => s.includes(f))) return 'forex';
lib/equityNewsRelevance.ts:/** Symbol to look for in article text: "CRYPTO:BTC" -> "BTC", "FOREX:EUR" -> "EUR", "AAPL" -> "AAPL". */
lib/equityNewsRelevance.ts:  return providerTicker.trim().toUpperCase().replace(/^(CRYPTO|FOREX):/, '');
lib/catalyst/alphaVantageNewsProvider.ts:    .map((t) => t.ticker.replace('CRYPTO:', '').replace('FOREX:', ''))
app/api/jobs/scan-daily/route.ts:const FOREX_UNIVERSE = [
app/api/jobs/scan-daily/route.ts:async function scanForex(symbol: string, apiKey: string, overlay: RegimeOverlayInputs | null = null): Promise<any | null> {
app/api/jobs/scan-daily/route.ts:    // Fetch daily forex bars (full history so EMA200 is real) and compute the same lib/ta/core indicator set as the
app/api/jobs/scan-daily/route.ts:    // simple-average RSI, so forex daily picks were scored on a different, mislabeled trend line.
app/api/jobs/scan-daily/route.ts:    const bars = parseAlphaVantageDailyBars(priceData).filter(b => isCompletedDailyBar('forex', b.t));
app/api/jobs/scan-daily/route.ts:    const canonical = canonicalForDailyPick(bars, { symbol: `${symbol}/USD`, assetClass: 'forex', overlay });
app/api/jobs/scan-daily/route.ts:      asset_class: 'forex',
app/api/jobs/scan-daily/route.ts:    console.error(`Error scanning forex ${symbol}:`, e);
app/api/jobs/scan-daily/route.ts:    // Optional ?assets=crypto (comma list of equity,crypto,forex): refresh only those asset classes for the current
app/api/jobs/journal-auto-close/route.ts:function normalizeAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/jobs/journal-auto-close/route.ts:  if (normalized === 'forex') return 'forex';
app/api/jobs/journal-auto-close/route.ts:function resolveQuoteParams(symbol: string, assetClass: 'crypto' | 'equity' | 'forex' | 'commodity') {
app/api/jobs/journal-auto-close/route.ts:  if (assetClass === 'forex') {
app/api/jobs/journal-auto-close/route.ts:async function fetchCurrentPrice(req: NextRequest, symbol: string, assetClass: 'crypto' | 'equity' | 'forex' | 'commodity') {
app/tools/workspace/PortfolioV2.tsx:              <span className="text-amber-400 font-medium">Forex:</span> EURUSD, GBPUSD
lib/scanner/liquidity.ts:  type: 'crypto' | 'equity' | 'forex';
lib/scanner/liquidity.ts:  if (args.type === 'forex') {
components/MarketStatusBadge.tsx:    forex: { status: string };
components/MarketStatusBadge.tsx:            <div className={`w-1.5 h-1.5 rounded-full ${status.global.forex.status === 'open' ? 'bg-green-500' : 'bg-red-500'}`} />
lib/confluence-learning-agent.ts:export type CloseCalendarScheduleModel = 'crypto_247' | 'equity_session' | 'forex_session';
lib/scanner/proScanMode.ts: * bookmarked state) is run as Deep instead of returning empty results. Equity and forex are unchanged.
lib/scanner/dailyPickTrust.ts:  const assetClass: TrustAssetClass = row.asset_class === 'crypto' ? 'crypto' : row.asset_class === 'forex' ? 'forex' : 'equity';
lib/scanner/dailyPickTrust.ts:  // Legacy forex rows (written before Sep 2026) stored an EMA50 under `ema200` alongside `ema50`; identical values = proxy.
lib/options-confluence-analyzer.ts:    if (assetType === 'forex' && symbol.length >= 6) {
lib/options-confluence-analyzer.ts:    if (assetType === 'forex' && symbol.length >= 6) {
lib/options-confluence-analyzer.ts:  if (assetType === 'crypto' || assetType === 'forex') {
lib/options-confluence-analyzer.ts:export type AssetType = 'equity' | 'crypto' | 'index' | 'etf' | 'forex';
lib/options-confluence-analyzer.ts:    // Only fetch options for equity/etf/index (not crypto/forex)
lib/scanner/scoreContract.ts:  if (asset === 'forex' || !Number.isFinite(price) || price! <= 0) return undefined;
lib/engines/earningsRisk.ts:  assetClass: "equity" | "crypto" | "forex" | "index";
lib/engines/earningsRisk.ts:  assetClass: "equity" | "crypto" | "forex" | "index";
lib/scanner/dailyPickPriceBasis.ts: * The scan writers store different things in `daily_picks.price`: equity and forex rows store the close of the latest
lib/engines/optionsIntelligence.ts:  assetClass: "equity" | "crypto" | "forex" | "index";
lib/engines/optionsIntelligence.ts:  assetClass: "equity" | "crypto" | "forex" | "index";
lib/scanner/vwap.ts:export function scannerVwapModeFor(type: 'crypto' | 'equity' | 'forex'): ScannerVwapMode {
lib/scoring/types.ts:  assetClass: 'equity' | 'crypto' | 'forex' | 'index' | 'options';
lib/scanner/proScore.ts:    volumeAvailable: asset === 'forex' ? null : Number.isFinite(ind.volume) && ind.volume > 0,
lib/scanner/hardBlocks.ts:  asset: 'equity' | 'crypto' | 'forex';
lib/scanner/hardBlocks.ts:export function barsPerDay(timeframe: string | null | undefined, asset: 'equity' | 'crypto' | 'forex'): number {
lib/scanner/hardBlocks.ts:  if (input.asset !== 'forex') {
app/api/midpoints/route.ts: *   assetType: 'crypto' | 'stock' | 'forex'
lib/scanner/dailyScanAssets.ts: * `?assets=` filter for the scan-daily job: a comma list of equity, crypto, forex. Absent = every asset class (the
lib/scanner/dailyScanAssets.ts: * re-scanning (or deleting) equities and forex.
lib/scanner/dailyScanAssets.ts:export type DailyScanAsset = 'equity' | 'crypto' | 'forex';
lib/scoring/canonical/types.ts:export type CanonicalAssetClass = 'equity' | 'crypto' | 'forex';
lib/scanner/dataTrust.ts:import { forexOpenMinutesBetween, forexSessionsBetween, lastCompletedForexDailyBar } from '@/lib/time/fxSession';
lib/scanner/dataTrust.ts:export type TrustAssetClass = 'equity' | 'crypto' | 'forex';
lib/scanner/dataTrust.ts:  if (input.assetClass === 'forex') {
lib/scanner/dataTrust.ts:      const behind = forexSessionsBetween(input.lastBarAt.slice(0, 10), lastCompletedForexDailyBar(nowMs));
lib/scanner/dataTrust.ts:    const openMin = forexOpenMinutesBetween(lastMs, nowMs);
lib/market/assets.ts:  return value === 'forex' ? 'Forex (retired)' : value === 'equity' ? 'Stocks' : value === 'crypto' ? 'Crypto' : value;
lib/scoring/canonical/regimeOverlay.ts: * Unavailable inputs are simply not counted (listed in `unavailable`). Forex uses the volatility condition only
lib/scoring/canonical/regimeOverlay.ts:  const riskAsset = assetClass !== 'forex';
lib/scoring/canonical/thresholds.ts: * Per-setup FACTOR-SCORE thresholds — used only for UNCALIBRATED contexts (intraday / weekly timeframes, forex,
app/api/options/gex/route.ts:  gexContractsForExpiry,
app/api/options/gex/route.ts:    const contracts = gexContractsForExpiry(chain.rows, expiration);
lib/scoring/canonical/calibration.ts: * intraday / weekly timeframes, forex, snapshot mode — returns null and the engine labels the result UNCALIBRATED.
app/tools/macro/layout.tsx:    'Comprehensive macro economic dashboard showing indices, rates, commodities, crypto, forex, and volatility in real-time.',
lib/scoring/options-v21.ts:export function atmIvForExpiry(rows: AVOptionRow[], spot: number): number | null {
lib/scoring/options-v21.ts:export function expectedMoveForExpiry(
lib/scoring/options-v21.ts:  const atmIv = atmIvForExpiry(expiryRows, spot);
lib/scoring/options-v21.ts:    const expectedMovePct = expectedMoveForExpiry([...group.calls, ...group.puts], spot, dte, fallbackMove);
components/home/HomePreviewStrip.tsx:        Filter equities, crypto, and forex by structured technical conditions.
lib/researchContext.ts:export type ResearchAsset = 'equity' | 'crypto' | 'forex' | 'futures';
lib/researchContext.ts:  return value === 'equity' || value === 'crypto' || value === 'forex' || value === 'futures' ? value : undefined;
lib/researchCase.ts:  if (raw === 'forex') return 'forex';
lib/regime-classifier.ts: * crypto rows were hard-blocked as REGIME_CHAOS, mostly shorts, just for being crypto. Forex is far calmer (≈ 0.5–0.8%).
lib/regime-classifier.ts:export function volatilityThresholds(assetClass?: 'equity' | 'crypto' | 'forex'): { compressed: number; expanded: number; extreme: number } {
lib/regime-classifier.ts:  if (assetClass === 'forex') return { compressed: 0.35, expanded: 1.5, extreme: 2.5 };
lib/regime-classifier.ts:export function riskOffThresholds(assetClass?: 'equity' | 'crypto' | 'forex'): { atrPct: number; movePct: number } {
lib/regime-classifier.ts:  assetClass?: 'equity' | 'crypto' | 'forex';
lib/journal/mapPayload.ts:  if (value === 'forex' || value === 'commodity') return value;
lib/journal/entryLevels.ts: * A blank target stays blank too (it used to default to +4% / 10% crypto / 3% forex). Planned R:R
lib/autoLog.ts:  assetClass?: 'equity' | 'crypto' | 'forex' | 'commodity';
lib/alerts/priceConditions.ts:  // Forex rates are quoted to 5 decimals and are not dollar amounts (e.g. USDJPY).
lib/alerts/priceConditions.ts:  const isFx = assetType === 'forex';
lib/alerts/assetTypes.ts: * non-crypto alert was priced as a US stock (Alpha Vantage GLOBAL_QUOTE), so forex and
lib/alerts/assetTypes.ts:export const BASIC_ALERT_ASSET_TYPES = ['crypto', 'equity', 'forex'] as const;
lib/alerts/assetTypes.ts:export type QuoteSource = 'crypto' | 'stock' | 'forex' | 'unsupported';
lib/alerts/assetTypes.ts:    case 'forex':
lib/alerts/assetTypes.ts:      return 'forex';
lib/alerts/assetTypes.ts:      message: 'Choose the market for this alert (crypto, stock or forex) so it is priced from the right feed.',
lib/alerts/assetTypes.ts:      message: 'Commodity price alerts are not checked yet, so they would never fire. Choose crypto, stock or forex.',
lib/alerts/assetTypes.ts:      message: 'The market must be crypto, stock (equity) or forex.',
lib/alerts/assetTypes.ts:  if (type === 'forex') {
lib/alerts/assetTypes.ts:        error: '% change alerts are not available for forex',
lib/alerts/assetTypes.ts:        message: 'The forex feed reports only the current rate, not a daily % change. Use a price above/below alert instead.',
lib/alerts/assetTypes.ts:        error: `Invalid forex pair: ${symbol}`,
lib/alerts/assetTypes.ts:        message: 'Enter a forex pair such as EURUSD or EUR/USD.',
lib/alerts/assetTypes.ts:/** Alpha Vantage CURRENCY_EXCHANGE_RATE URL for a forex alert symbol, or null if it is not a pair. */
lib/options-gex.ts:export function gexContractsForExpiry(rows: RawChainRowForGex[], expiration: string): GexContractInput[] {
components/CorrelationConfluenceCard.tsx:  type?: 'crypto' | 'equity' | 'forex';
components/CorrelationConfluenceCard.tsx:            {data.type === 'crypto' ? 'Crypto majors' : data.type === 'forex' ? 'Forex pairs' : 'Equity peers'}
lib/admin/morning-brief.ts:  FOREX: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF", "EURGBP"],
lib/admin/morning-brief.ts:  if (market === "FOREX") return "forex";
lib/prompts/platformKnowledge.ts:   The flagship scanner. Scans equities, crypto, and forex across 14 technical indicators simultaneously.
lib/backtest/assumptions.ts:export const BACKTEST_COMMISSION_BPS: Record<'stock' | 'crypto' | 'forex', number> = {
lib/backtest/assumptions.ts:  forex: 2,   // 2 pips on a 1.0000 price
lib/backtest/assumptions.ts:export function roundTripCostBps(assetType: 'stock' | 'crypto' | 'forex'): number {
lib/workflow/types.ts:export type AssetClass = 'equity' | 'crypto' | 'forex' | 'commodities' | 'options' | 'mixed';
lib/workflow/types.ts:  market: 'stocks' | 'crypto' | 'options' | 'forex';
lib/backtest/runStrategy.ts:function inferAssetType(symbol: string): 'stock' | 'crypto' | 'forex' {
lib/backtest/runStrategy.ts:  if (s.includes('/') || s.endsWith('USD') || s.endsWith('EUR') || s.endsWith('JPY')) return 'forex';
lib/backtest/runStrategy.ts:function calcCommissionCost(entry: number, exit: number, qty: number, assetType: 'stock' | 'crypto' | 'forex'): number {
lib/backtest/runStrategy.ts:  assetType: 'stock' | 'crypto' | 'forex',
lib/backtest/runStrategy.ts:  requestedAssetType?: 'stock' | 'crypto' | 'forex'
app/tools/portfolio/page.tsx:                    <strong className="text-slate-300">Forex:</strong> EURUSD, GBPUSD
lib/candleProcessor.ts:  assetType: 'crypto' | 'stock' | 'forex'
lib/candleProcessor.ts:    // For stocks/forex using Alpha Vantage
lib/execution/types.ts:/** Extended asset class list (adds futures/forex to journal's set) */
lib/execution/types.ts:export type AssetClass = TradeAssetClass | 'futures' | 'forex';
lib/execution/leverage.ts:  forex: 50,       // retail limit (varies by jurisdiction)
lib/execution/runPipeline.ts:  assetClass: 'crypto' | 'equity' | 'forex' | 'commodity';
lib/time/fxSession.ts:export function isForexClosed(ms: number): boolean {
lib/time/fxSession.ts:export function forexOpenMinutesBetween(fromMs: number, toMs: number): number {
lib/time/fxSession.ts:    if (!isForexClosed(t)) open += Math.min(STEP_MS, toMs - t);
lib/time/fxSession.ts:export function lastCompletedForexDailyBar(nowMs: number): string {
lib/time/fxSession.ts:export function forexSessionsBetween(fromYmd: string, toYmd: string): number {
lib/execution/positionSizing.ts:    case 'forex':
lib/goldenEgg/timing.ts:  assetClass: 'equity' | 'crypto' | 'forex';
lib/goldenEgg/timing.ts:export function sanitizeTimeConfluence(tc: TimeConfluenceData, opts: { assetClass: 'equity' | 'crypto' | 'forex'; sessionOpen: boolean }): TimeConfluenceData & { sessionState: 'open' | 'closed' | 'always_open'; displayNote?: string } {
lib/execution/validators.ts:const VALID_ASSET_CLASSES: AssetClass[] = ['equity', 'crypto', 'options', 'futures', 'forex'];
lib/goldenEgg/semantics.ts:  assetClass: 'equity' | 'crypto' | 'forex';
lib/goldenEgg/semantics.ts:  if (s.assetClass !== 'forex' && s.advUsd != null) {
lib/goldenEgg/semantics.ts:  assetClass: 'equity' | 'crypto' | 'forex';
lib/goldenEgg/semantics.ts:  if (r.assetClass !== 'forex' && r.advUsd != null && r.advUsd < 5_000_000) { score -= 15; reasons.push(`thin liquidity — ${formatUsdShort(r.advUsd)} average dollar volume`); }
lib/execution/exits.ts:  forex: 1.0,
lib/execution/exits.ts:  forex: 1.5,
lib/execution/exits.ts:  forex: 3.0,
lib/execution/exits.ts:  if (assetClass === 'forex') return 60 * 8;             // 8h session
lib/goldenEgg/engine.ts:function goldenEggLiveDataQuality(assetClass: 'equity' | 'crypto' | 'forex') {
lib/goldenEgg/engine.ts:  assetClass: 'equity' | 'crypto' | 'forex',
lib/goldenEgg/engine.ts:  const demoPrices: Record<'equity' | 'crypto' | 'forex', Record<string, number>> = {
lib/goldenEgg/engine.ts:    forex: { EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 156.4, AUDUSD: 0.65, NZDUSD: 0.59, USDCAD: 1.36, USDCHF: 0.91, EURJPY: 168.9 },
lib/goldenEgg/engine.ts:  const basePrice = demoPrices[assetClass]?.[key] ?? (assetClass === 'crypto' ? 65000 : assetClass === 'forex' ? 1.1 : 420);
lib/goldenEgg/engine.ts:  const volume = assetClass === 'forex' ? 0 : 1_800_000;
lib/goldenEgg/engine.ts:    avgVolume: assetClass === 'forex' ? undefined : 1_500_000,
lib/goldenEgg/engine.ts:function barsPerDayFor(tfLabel: string, assetClass: 'equity' | 'crypto' | 'forex'): number {
lib/goldenEgg/engine.ts:  assetClass: 'equity' | 'crypto' | 'forex',
lib/goldenEgg/engine.ts:    volumeAvailable: assetClass === 'forex' ? null : avgVolume != null && avgVolume > 0,
lib/goldenEgg/engine.ts:  if (assetClass !== 'forex' && advUsd != null && advUsd < 5_000_000 && trust.level === 'GOOD') {
lib/goldenEgg/engine.ts:    // Crypto/forex have no comparable options-flow contract, so Flow is structurally NOT APPLICABLE there and its
lib/goldenEgg/engine.ts:  assetClass: 'equity' | 'crypto' | 'forex';
lib/goldenEgg/engine.ts:async function buildCrossMarket(assetClass: 'equity' | 'crypto' | 'forex', direction: Direction, sector: string | null, symbolBase: string, series: { btcCloses?: number[]; ethCloses?: number[] }): Promise<CrossMarketContext> {
lib/goldenEgg/engine.ts:      assetClass: assetClass === 'crypto' ? 'crypto' : assetClass === 'forex' ? 'fx' : 'equities', timeframe: tfLabel, source: 'golden_egg',
components/MultiConditionAlertBuilder.tsx:  assetType: 'crypto' | 'equity' | 'forex' | 'commodity';
lib/execution/fetchATR.ts: * - Equities/Forex/Commodities → Alpha Vantage ATR indicator (rate-governed + circuit-breaker)
lib/execution/fetchATR.ts:// ── Equity/Forex ATR via Alpha Vantage ──────────────────────────────
lib/execution/fetchATR.ts: * - `equity` / `forex` / `commodity` → Alpha Vantage ATR indicator
lib/execution/fetchATR.ts:  assetClass: 'crypto' | 'equity' | 'forex' | 'commodity' = 'equity',
lib/goldenEgg/newsRelevance.ts:/** Alpha Vantage ticker keys: equities plain (META), crypto prefixed (CRYPTO:BTC), forex FOREX:EUR. */
lib/goldenEgg/newsRelevance.ts:export function avTickerKey(symbol: string, assetClass: 'equity' | 'crypto' | 'forex'): string {
lib/goldenEgg/newsRelevance.ts:  if (assetClass === 'forex') return `FOREX:${base.slice(0, 3)}`;
lib/goldenEgg/newsRelevance.ts:  assetClass: 'equity' | 'crypto' | 'forex',
lib/goldenEgg/newsRelevance.ts:    if (relevance < EQUITY_NEWS_STRONG_RELEVANCE && !mentionsCompany(text, key.replace(/^(CRYPTO|FOREX):/, ''), opts.companyName)) continue;
lib/goldenEgg/newsRelevance.ts:export function classifyCatalyst(text: string, assetClass: 'equity' | 'crypto' | 'forex' = 'equity'): { klass: CatalystClass; reason: string } {
app/api/scanner/run/route.ts:// Equity & Forex require commercial data licenses - admin-only testing with Alpha Vantage
app/api/scanner/run/route.ts:  type: "crypto" | "equity" | "forex";
app/api/scanner/run/route.ts:  type: 'crypto' | 'equity' | 'forex';
app/api/scanner/run/route.ts:  const defaults: Record<'crypto' | 'equity' | 'forex', string[]> = {
app/api/scanner/run/route.ts:    forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD'],
app/api/scanner/run/route.ts:  const demoPrices: Record<'crypto' | 'equity' | 'forex', Record<string, number>> = {
app/api/scanner/run/route.ts:    forex: { EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 156.4, AUDUSD: 0.65, NZDUSD: 0.59, USDCAD: 1.36, USDCHF: 0.91, EURJPY: 168.9 },
app/api/scanner/run/route.ts:    const priceBase = demoPrices[args.type][symbol.toUpperCase()] ?? (args.type === 'crypto' ? 65000 / (index + 1) : args.type === 'forex' ? 1 + index * 0.12 : 520 - index * 47);
app/api/scanner/run/route.ts:      price: Number(priceBase.toFixed(args.type === 'forex' ? 4 : 2)),
app/api/scanner/run/route.ts:      entry: Number((priceBase * (bullish ? 1.002 : 0.998)).toFixed(args.type === 'forex' ? 4 : 2)),
app/api/scanner/run/route.ts:      stop: Number((priceBase * (bullish ? 0.972 : 1.028)).toFixed(args.type === 'forex' ? 4 : 2)),
app/api/scanner/run/route.ts:      target: Number((priceBase * (bullish ? 1.061 : 0.939)).toFixed(args.type === 'forex' ? 4 : 2)),
app/api/scanner/run/route.ts:      atr: Number((priceBase * 0.025).toFixed(args.type === 'forex' ? 4 : 2)),
app/api/scanner/run/route.ts:  let requestedType: 'crypto' | 'equity' | 'forex' = 'crypto';
app/api/scanner/run/route.ts:    if (type === 'crypto' || type === 'equity' || type === 'forex') requestedType = type;
app/api/scanner/run/route.ts:    if (!type || !["crypto", "equity", "forex"].includes(type)) {
app/api/scanner/run/route.ts:        { error: "Invalid type. Must be 'crypto', 'equity', or 'forex'" },
app/api/scanner/run/route.ts:    const FALLBACK_FOREX = [
app/api/scanner/run/route.ts:        const assetFilter = type === 'crypto' ? 'crypto' : type === 'forex' ? 'forex' : 'equity';
app/api/scanner/run/route.ts:          symbolsToScan = type === 'crypto' ? FALLBACK_CRYPTO : type === 'forex' ? FALLBACK_FOREX : FALLBACK_EQUITIES;
app/api/scanner/run/route.ts:        symbolsToScan = type === 'crypto' ? FALLBACK_CRYPTO : type === 'forex' ? FALLBACK_FOREX : FALLBACK_EQUITIES;
app/api/scanner/run/route.ts:    } else if (type === "equity" || type === "forex") {
app/api/scanner/run/route.ts:      // Equity & Forex use Alpha Vantage (admin-only testing, requires commercial license for production)
app/api/scanner/run/route.ts:          message: "Stock/Forex data requires commercial licensing - Coming Soon",
app/api/scanner/run/route.ts:          errors: ["Stock and Forex scanning requires commercial data licensing"],
app/api/scanner/run/route.ts:    // Note: Equity and Forex use Alpha Vantage (admin-only testing)
app/api/scanner/run/route.ts:      marketType: 'crypto' | 'equity' | 'forex' = 'equity',
app/api/scanner/run/route.ts:        } else if (type === "forex") {
app/api/scanner/run/route.ts:          // FOREX: Use FX_INTRADAY or FX_DAILY endpoints
app/api/scanner/run/route.ts:          // Parse forex pair (e.g., "EURUSD" -> from=EUR, to=USD)
app/api/scanner/run/route.ts:          console.info(`[scanner] Fetching FOREX ${fromCurrency}/${toCurrency} (${avInterval})`);
app/api/scanner/run/route.ts:            volume: 0, // Forex doesn't have volume data
app/api/scanner/run/route.ts:          if (!candles.length) throw new Error(`No forex candles returned for ${sym}`);
app/api/scanner/run/route.ts:          console.info(`[scanner] Forex ${sym}: Got ${candles.length} candles, latest: ${lastCandleTime}`);
app/api/scanner/run/route.ts:          const vwapArr = vwap(highs, lows, closes, volumes, timestamps, 'forex');
app/api/scanner/run/route.ts:          const mfiValForex = mfiArr[last];
app/api/scanner/run/route.ts:          const vwapValForex = vwapArr[last];
app/api/scanner/run/route.ts:          const dveForex = computeScannerDVE(closes, highs, lows, price, sym, {
app/api/scanner/run/route.ts:            mfiValForex, vwapValForex, stochObj.d, adxObj.plus_di, adxObj.minus_di,
app/api/scanner/run/route.ts:            dveForex?.dveBbwp, dveForex?.dveBreakoutScore, dveForex?.dveFlags,
app/api/scanner/run/route.ts:          // Compute trade setup fields for forex (same ATR-based logic as equity/crypto)
app/api/scanner/run/route.ts:          const atrSafeFx = Number.isFinite(atrVal) ? atrVal : price * 0.002; // Forex fallback: 0.2% of price (20 pips)
app/api/scanner/run/route.ts:          const setupLabelFx = deriveSetupLabel({ direction: scoreResult.direction, rsi: rsiVal, adx: adxObj.adx, stochK: stochObj.k, stochD: stochObj.d, macdHist: macHist, close: price, ema200: ema200Val, bbwp: dveForex?.dveBbwp, dveFlags: dveForex?.dveFlags, mfi: mfiValForex, aroonUp: aroonObj.up, aroonDown: aroonObj.down });
app/api/scanner/run/route.ts:            mfi: mfiValForex,
app/api/scanner/run/route.ts:            vwap: vwapValForex,
app/api/scanner/run/route.ts:          // Compute enhancements for forex
app/api/scanner/run/route.ts:              benchmarkChangePct: 0, // no benchmark for forex
app/api/scanner/run/route.ts:          // DVE flags for forex (already computed before scoring)
app/api/scanner/run/route.ts:          if (dveForex) Object.assign(item, dveForex);
app/api/scanner/run/route.ts:        assetClass: type === 'crypto' ? 'crypto' : type === 'forex' ? 'forex' : 'equity',
app/api/scanner/run/route.ts:        volumeAvailable: type === 'forex' ? null : Number.isFinite(result.avgVolume) && (result.avgVolume as number) > 0,
app/api/scanner/run/route.ts:    const assetClassForCanonical = type === 'crypto' ? 'crypto' : type === 'forex' ? 'forex' : 'equity';
app/api/scanner/run/route.ts:        assetClass: type === 'crypto' ? 'crypto' : type === 'forex' ? 'forex' : 'equity',
app/api/scanner/run/route.ts:        asset: type === 'crypto' ? 'crypto' : type === 'forex' ? 'forex' : 'equity', timeframe,
app/api/scanner/run/route.ts:      const volBands = volatilityThresholds(type === 'crypto' ? 'crypto' : type === 'forex' ? 'forex' : 'equity');
app/api/scanner/run/route.ts:              assetClass: type === 'crypto' ? 'crypto' : type === 'forex' ? 'fx' : 'equities',
app/tools/deep-analysis/page.tsx:  assetType: 'crypto' | 'forex' | 'commodity' | 'stock';
app/tools/deep-analysis/page.tsx:                  {result.assetType === 'crypto' ? 'CR' : result.assetType === 'forex' ? 'FX' : result.assetType === 'commodity' ? 'CM' : 'EQ'}
app/tools/deep-analysis/page.tsx:              Supports stocks (AAPL, TSLA), crypto (BTC, ETH), forex (EURUSD), and commodities (GOLD).
components/TimeGravityMapWidget.tsx:  assetType?: 'crypto' | 'stock' | 'forex';
components/WatchlistWidget.tsx:                  <option value="forex">Forex</option>
lib/universe/assetClass.ts:export const ASSET_CLASSES = ['equity', 'etf', 'crypto', 'forex', 'commodity', 'index', 'future'] as const;
app/api/scanner/bulk/route.ts:const FALLBACK_FOREX_UNIVERSE = [
app/api/scanner/bulk/route.ts:async function getUniverseFromDB(assetType: 'equity' | 'crypto' | 'forex'): Promise<string[]> {
app/api/scanner/bulk/route.ts:  const fallback = assetType === 'equity' ? FALLBACK_EQUITY_UNIVERSE : assetType === 'forex' ? FALLBACK_FOREX_UNIVERSE : FALLBACK_CRYPTO_UNIVERSE;
app/api/scanner/bulk/route.ts:/** Fetch forex candle data from Alpha Vantage FX_DAILY / FX_INTRADAY */
app/api/scanner/bulk/route.ts:async function fetchForexCandles(pair: string, timeframe: string = '1d'): Promise<OHLCV[] | null> {
app/api/scanner/bulk/route.ts:      console.warn(`[bulk-scan] AV forex issue for ${pair}:`, data.Note || data.Information || data['Error Message']);
app/api/scanner/bulk/route.ts:      volume: 0, // Forex has no volume
app/api/scanner/bulk/route.ts:    console.error(`[bulk-scan] Forex fetch error for ${pair}:`, err);
app/api/scanner/bulk/route.ts:  type: 'equity' | 'crypto' | 'forex';
app/api/scanner/bulk/route.ts:  const symbolsByType: Record<'equity' | 'crypto' | 'forex', string[]> = {
app/api/scanner/bulk/route.ts:    forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURJPY'],
app/api/scanner/bulk/route.ts:  const pricesByType: Record<'equity' | 'crypto' | 'forex', Record<string, number>> = {
app/api/scanner/bulk/route.ts:    forex: { EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 156.4, AUDUSD: 0.65, NZDUSD: 0.59, USDCAD: 1.36, USDCHF: 0.91, EURJPY: 168.9 },
app/api/scanner/bulk/route.ts:        price: Number(price.toFixed(args.type === 'forex' ? 4 : 2)),
app/api/scanner/bulk/route.ts:        atr: Number(atr.toFixed(args.type === 'forex' ? 4 : 2)),
app/api/scanner/bulk/route.ts:        volume: args.type === 'forex' ? undefined : Math.round(1_500_000 * (index + 1)),
app/api/scanner/bulk/route.ts: * Forex bulk scan — fetches FX candles from Alpha Vantage, computes indicators locally,
app/api/scanner/bulk/route.ts:async function runForexBulkScan(startTime: number, timeframe: string) {
app/api/scanner/bulk/route.ts:  const forexUniverse = await getUniverseFromDB('forex');
app/api/scanner/bulk/route.ts:  const pairs = forexUniverse.map(s => s.length === 3 ? `${s}USD` : s);
app/api/scanner/bulk/route.ts:  console.log(`[bulk-scan/forex] Scanning ${symbolsToScan.length} forex pairs on ${timeframe}...`);
app/api/scanner/bulk/route.ts:      console.log(`[bulk-scan/forex] Time limit reached after ${scored.length} pairs`);
app/api/scanner/bulk/route.ts:    const candles = await fetchForexCandles(pair, timeframe);
app/api/scanner/bulk/route.ts:      // Bar time for the data-trust check. Without it every forex row read as "freshness unknown" → institutional
app/api/scanner/bulk/route.ts:      // DATA_UNRELIABLE hard block → no side → 0/4 factor agreement → no forex results. AV FX timestamps are UTC.
app/api/scanner/bulk/route.ts:        historyBars: candles.length, volumeBasis: 'not_applicable_forex', source: 'alpha_vantage_fx',
app/api/scanner/bulk/route.ts:    /** Asset class for the canonical engine (forex rides the equity institutional filter). */
app/api/scanner/bulk/route.ts:    canonicalAssetClass?: 'equity' | 'crypto' | 'forex';
app/api/scanner/bulk/route.ts:  let localFallbackArgs: { type: 'equity' | 'crypto' | 'forex'; timeframe: string; mode: BulkScanMode; requestedUniverseSize: number; filters: ProScanFilters; sort: ProScanSort } | null = null;
app/api/scanner/bulk/route.ts:    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); } // 'equity', 'crypto', or 'forex'
app/api/scanner/bulk/route.ts:      type: ['equity', 'crypto', 'forex'].includes(type) ? type : 'crypto',
app/api/scanner/bulk/route.ts:    if (!type || !['equity', 'crypto', 'forex'].includes(type)) {
app/api/scanner/bulk/route.ts:      return NextResponse.json({ error: "Type must be 'equity', 'crypto', or 'forex'" }, { status: 400 });
app/api/scanner/bulk/route.ts:    if (type === 'forex') {
app/api/scanner/bulk/route.ts:      const forexResult = await runForexBulkScan(startTime, selectedTimeframe);
app/api/scanner/bulk/route.ts:      // Use 'equity' type for institutional filter since forex is similar
app/api/scanner/bulk/route.ts:      const institutional = applyInstitutionalFilterToTopPicks(forexResult.topPicks, {
app/api/scanner/bulk/route.ts:        canonicalAssetClass: 'forex',
app/api/scanner/bulk/route.ts:        scanned: forexResult.scanned,
app/api/scanner/bulk/route.ts:        sourceSymbols: forexResult.sourceSymbols,
app/api/scanner/bulk/route.ts:        apiCallsUsed: forexResult.apiCallsUsed,
app/api/scanner/bulk/route.ts:        apiCallsCap: forexResult.apiCallsCap,
app/api/scanner/bulk/route.ts:        effectiveUniverseSize: forexResult.effectiveUniverseSize,
app/api/scanner/bulk/route.ts:          source: 'alpha_vantage_forex',
app/api/scanner/bulk/route.ts:          coverageScore: forexResult.scanned ? Math.min(100, Math.round((forexResult.scanned / Math.max(1, forexResult.effectiveUniverseSize)) * 100)) : 0,
components/options-terminal/OptionsConfluenceScanner.tsx:  assetType?: 'equity' | 'crypto' | 'index' | 'etf' | 'forex';
components/AlertsWidget.tsx:    assetType: '' as '' | 'crypto' | 'equity' | 'forex',
components/AlertsWidget.tsx:        : matchedAlert?.asset_type === 'forex'
components/AlertsWidget.tsx:        ? 'forex'
components/AlertsWidget.tsx:                <span className="font-mono text-emerald-400">{alert.symbol}{alert.asset_type === 'forex' && <span className="ml-1 text-xs text-amber-300">Forex (retired)</span>}</span>
components/AlertsWidget.tsx:                        {alert.symbol}{alert.asset_type === 'forex' && <span className="ml-1 text-xs text-amber-300">Forex (retired)</span>}
components/AlertsWidget.tsx:                              {alert.symbol}{alert.asset_type === 'forex' && <span className="ml-1 text-xs text-amber-300">Forex (retired)</span>}
components/AlertsWidget.tsx:                            {alert.symbol}{alert.asset_type === 'forex' && <span className="ml-1 text-xs text-amber-300">Forex (retired)</span>}
components/AlertsWidget.tsx:                            {alert.symbol}{alert.asset_type === 'forex' && <span className="ml-1 text-xs text-amber-300">Forex (retired)</span>}
components/time/types.ts:  assetClass: 'crypto' | 'equity' | 'forex';
components/journal/drawer/TradeEntryForm.tsx:  assetClass: 'equity' | 'crypto' | 'forex' | 'commodity';
components/journal/drawer/TradeEntryForm.tsx:  assetClass?: 'equity' | 'crypto' | 'forex' | 'commodity';
components/journal/drawer/TradeEntryForm.tsx:  const [assetClass, setAssetClass] = useState<'equity' | 'crypto' | 'forex' | 'commodity'>(iv?.assetClass || 'equity');
components/journal/drawer/TradeEntryForm.tsx:              {iv?.assetClass === 'forex' && <option value="forex" disabled>Forex (retired)</option>}
app/api/scanner/daily-picks/route.ts:      forex: []
app/api/scanner/daily-picks/route.ts:      forex: []
app/api/scanner/daily-picks/route.ts:        forex: topPicks.forex
app/api/scanner/daily-picks/route.ts:        forex: bottomPicks.forex
app/api/scanner/daily-picks/route.ts:      topPicks: { equity: [], crypto: [], forex: [] },
app/api/scanner/daily-picks/route.ts:      bottomPicks: { equity: [], crypto: [], forex: [] },
app/api/golden-egg/route.ts:  let fallbackAssetClass: 'equity' | 'crypto' | 'forex' = 'equity';
app/api/scanner/quotes/route.ts:    // (crypto via CoinGecko, forex via Alpha Vantage exchange rates, everything else as a stock).
app/api/scanner/quotes/route.ts:  // Forex and stocks: Alpha Vantage (rate governed), in parallel like the legacy form.
app/api/scanner/quotes/route.ts:      if (item.assetType === 'forex') {
app/api/scanner/quotes/route.ts:        results.set(item.symbol, missing(item.symbol, 'forex', 'Forex (retired)'));
app/api/execute-trade/route.ts:    const assetClass = intent.asset_class === 'futures' || intent.asset_class === 'forex'
components/journal/layer2/TradeTable.tsx:                <span className="font-semibold text-slate-100 text-sm"><Link href={symbolHref(row.symbol,row.assetClass??'equity')}>{row.symbol}</Link>{row.assetClass === 'forex' && <span className="ml-1 text-xs text-amber-300">{assetDisplayLabel(row.assetClass)}</span>}</span>
components/journal/layer2/TradeTable.tsx:                  <Link href={symbolHref(row.symbol,row.assetClass??'equity')}>{row.symbol}</Link>{row.assetClass === 'forex' && <span className="ml-1 text-xs text-amber-300">{assetDisplayLabel(row.assetClass)}</span>}
app/layout.tsx:  description: "Educational market analysis platform with structured scanners, AI research context, technical indicators, and real-time market alerts for stocks, crypto, and forex.",
app/layout.tsx:    description: 'Educational market analysis platform with structured scanners, AI research context, technical indicators, and real-time market alerts for stocks, crypto, and forex.',
app/layout.tsx:    description: 'AI-supported educational market analysis for stocks, crypto, and forex.',
app/api/actions/execute/route.ts:function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/actions/execute/route.ts:  if (normalized === 'forex' || normalized === 'fx') return 'forex';
app/api/actions/execute/route.ts:    assetClass: assetClass as 'crypto' | 'equity' | 'forex' | 'commodity',
app/blog/posts-data.ts:- Crypto + stocks + forex
app/operator/engine/page.tsx:                  <option value="FOREX">Forex</option>
app/v2/_lib/api.ts:export type CloseCalendarScheduleModel = 'crypto_247' | 'equity_session' | 'forex_session';
app/api/deep-analysis/route.ts:async function fetchNewsFeed(symbol: string, assetClass: 'equity' | 'crypto' | 'forex'): Promise<{ feed: any[]; provider: string }> {
app/api/deep-analysis/route.ts:function newsCompanyName(symbol: string, assetClass: 'equity' | 'crypto' | 'forex', fundamentals: FundamentalsSummary | null): string | null {
app/api/deep-analysis/route.ts:    const assetType: 'crypto' | 'forex' | 'stock' = assetClass === 'crypto' ? 'crypto' : assetClass === 'forex' ? 'forex' : 'stock';
app/api/workflow/events/route.ts:function normalizeAlertAssetType(assetClass?: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/workflow/events/route.ts:function normalizeAlertAssetTypeNullable(assetClass?: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' | null {
app/api/workflow/events/route.ts:  if (normalized === 'forex' || normalized === 'fx') return 'forex';
app/api/workflow/events/route.ts:  if (raw === 'forex') return 'forex';
app/api/workflow/events/route.ts:        .filter((value): value is 'crypto' | 'equity' | 'forex' | 'commodity' => Boolean(value))
app/api/workflow/events/route.ts:    assetClass: assetClass as 'crypto' | 'equity' | 'forex' | 'commodity',
app/api/quote/route.ts:      return NextResponse.json({ok:false,error:'Forex (retired)',retired:true},{status:410});
app/api/quote/route.ts:  // For forex, we store as combined symbol (e.g., EURUSD)
app/api/alerts/check/route.ts:    } else if (source === 'forex') {
app/api/alerts/check/route.ts:      // Forex pairs: Alpha Vantage exchange rate (rate only; forex % alerts are refused at creation)
app/api/journal/auto-log/route.ts:function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/journal/auto-log/route.ts:  if (normalized === 'forex') return 'forex';
app/api/journal/auto-log/route.ts:  if (condition.includes('_forex')) return 'forex';
app/api/journal/auto-log/route.ts:  if (source.includes('forex')) return 'forex';
app/api/journal/auto-log/route.ts:              : assetClass === 'forex' ? 'fx'
app/api/alerts/route.ts:  assetType: 'crypto' | 'equity' | 'forex' | 'commodity';
app/api/journal/route.ts:  assetClass?: 'crypto' | 'equity' | 'forex' | 'commodity';
app/api/journal/route.ts:function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/journal/route.ts:  if (normalized === 'forex') return 'forex';
app/api/journal/route.ts:}): 'crypto' | 'equity' | 'forex' | 'commodity' | null {
app/api/journal/route.ts:    haystack.includes('asset_class_forex') ||
app/api/journal/route.ts:    haystack.includes('scanner_monitor_forex') ||
app/api/journal/route.ts:    haystack.includes(' forex') ||
app/api/journal/route.ts:    return 'forex';
app/api/journal/route.ts:function getTaggedAssetClass(tags: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' | null {
app/api/journal/route.ts:function normalizeUniverseAssetType(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/journal/route.ts:  if (normalized === 'forex') return 'forex';
app/api/journal/route.ts:function normalizePacketMarketToAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' | null {
app/api/journal/route.ts:  if (normalized === 'forex' || normalized === 'fx') return 'forex';
app/api/journal/route.ts:  fallback: 'crypto' | 'equity' | 'forex' | 'commodity';
app/api/journal/route.ts:  universeTypes?: Set<'crypto' | 'equity' | 'forex' | 'commodity'>;
app/api/journal/route.ts:}): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/journal/route.ts:  if (universeTypes.has('forex') && !universeTypes.has('equity')) return 'forex';
app/api/journal/route.ts:            WHERE lower(tag) = 'asset_class_forex'
app/api/journal/route.ts:         ) THEN 'forex'
app/api/journal/route.ts:           lower(COALESCE(setup, '')) LIKE '%forex%'
app/api/journal/route.ts:           OR lower(COALESCE(notes, '')) LIKE '%forex%'
app/api/journal/route.ts:           OR lower(COALESCE(strategy, '')) LIKE '%forex%'
app/api/journal/route.ts:         ) THEN 'forex'
app/api/journal/route.ts:    const symbolUniverseBySymbol = new Map<string, Set<'crypto' | 'equity' | 'forex' | 'commodity'>>();
app/api/journal/route.ts:    const symbolUniverseBySymbol = new Map<string, Set<'crypto' | 'equity' | 'forex' | 'commodity'>>();
app/api/dve/route.ts:type BarAge = { assetClass: 'equity' | 'crypto' | 'forex'; timeframe: string; lastBarAt: string | null; barInterval: string | null };
app/api/correlation/route.ts: *   type     — asset class hint: crypto | equity | forex  (auto-detected if omitted)
app/api/correlation/route.ts:const FOREX_UNIVERSE = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
app/api/correlation/route.ts:function detectType(symbol: string): 'crypto' | 'equity' | 'forex' {
app/api/correlation/route.ts:  // Forex pairs (6 chars, two 3-letter currencies)
app/api/correlation/route.ts:  if (/^[A-Z]{6}$/.test(upper) && FOREX_UNIVERSE.includes(upper)) return 'forex';
app/api/correlation/route.ts:  } else if (type === 'forex') {
app/api/correlation/route.ts:    universe = FOREX_UNIVERSE;
app/api/correlation/route.ts: * Fetch daily closes for a forex pair via Alpha Vantage FX_DAILY
app/api/correlation/route.ts:async function fetchForexDailyCloses(pair: string): Promise<DailyClose[]> {
app/api/correlation/route.ts:  if (type === 'forex') return fetchForexDailyCloses(symbol);
app/api/journal/exit-verdict/route.ts:function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
app/api/journal/exit-verdict/route.ts:  if (normalized === 'forex') return 'forex';
app/api/journal/exit-verdict/route.ts:async function getLatestPrice(req: NextRequest, symbol: string, assetClass: 'crypto' | 'equity' | 'forex' | 'commodity'): Promise<{ price: number | null; source: string }> {
app/api/journal/exit-verdict/route.ts:  const type = assetClass === 'crypto' ? 'crypto' : assetClass === 'forex' ? 'fx' : 'stock';
app/api/cached/universe/route.ts:  const assetType = searchParams.get('asset_type') === 'forex' ? 'equity' : searchParams.get('asset_type'); // equity, crypto, forex
app/api/cached/universe/route.ts:  const VALID_ASSET_TYPES = new Set(['equity', 'crypto', 'forex']);
app/api/cached/universe/route.ts:    return NextResponse.json({ error: 'Invalid asset_type. Must be one of: equity, crypto, forex' }, { status: 400 });
app/api/cached/universe/route.ts:    let query = "SELECT * FROM symbol_universe WHERE COALESCE(asset_type, 'equity') <> 'forex'";
app/api/cached/universe/route.ts:      if (assetType === 'forex') { errors.push('Forex is retired; existing records are preserved'); continue; }
app/api/cached/status/route.ts:        COUNT(*) FILTER (WHERE asset_type = 'forex') as forex,
app/api/market-status/route.ts:  const forex = markets.find(m => m.market_type === 'Forex');
app/api/market-status/route.ts:      forex: {
app/api/market-status/route.ts:        status: forex?.current_status || 'open', // Forex is 24/5
app/api/market-status/route.ts:        notes: forex?.notes || '',
app/api/backtest/symbol-range/route.ts:type AssetType = 'equity' | 'crypto' | 'forex' | 'commodity';
app/api/backtest/symbol-range/route.ts:  if (normalized === 'forex') return 'forex';

```
