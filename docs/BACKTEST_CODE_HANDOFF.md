# Backtest Code Handoff

This is the exact implementation map for the backtest pipeline, starting at the API route entry point and following every major call.

## 1) Route entry point (server)

- Entry function: `POST /api/backtest`
- File: `app/api/backtest/route.ts`
- Symbol: `export async function POST(req: NextRequest)`

Direct flow inside `POST`:
1. Auth + tier gate (`getSessionFromCookie`, `hasProTraderAccess`)
2. Request validation (`backtestRequestSchema.parse`)
3. Strategy lookup (`getBacktestStrategy`)
4. Timeframe support check (`isBacktestTimeframeSupported`)
5. Price fetch (`fetchPriceData`)
6. Strategy execution (`runStrategy`)
7. Metrics build (`buildBacktestEngineResult`)
8. JSON response to UI (metrics + `dataSources`)

### Minimal route skeleton

```ts
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Please log in to use Backtesting' }, { status: 401 });
  if (!hasProTraderAccess(session.tier)) return NextResponse.json({ error: 'Pro Trader subscription required for Backtesting' }, { status: 403 });

  const body = backtestRequestSchema.parse(await req.json());
  const { symbol, strategy, startDate, endDate, initialCapital, timeframe = 'daily' } = body;

  const strategyDefinition = getBacktestStrategy(strategy);
  if (!strategyDefinition) return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 });

  const effectiveTimeframe = timeframe as RegistryBacktestTimeframe;
  if (!isBacktestTimeframeSupported(strategyDefinition.id, effectiveTimeframe)) {
    return NextResponse.json({ error: `Timeframe ${effectiveTimeframe} is not supported for strategy ${strategyDefinition.label}` }, { status: 400 });
  }

  const { priceData, source: priceDataSource } = await fetchPriceData(symbol, effectiveTimeframe, startDate, endDate);
  const { trades, dates } = runStrategy(strategyDefinition.id, priceData, initialCapital, startDate, endDate, symbol, effectiveTimeframe);
  const result = buildBacktestEngineResult(trades, dates, initialCapital);

  return NextResponse.json({
    ...result,
    dataSources: { priceData: priceDataSource, assetType: isCryptoSymbol(symbol) ? 'crypto' : 'stock' },
  });
}
```

## 2) Data fetcher/provider/caching/limits

All fetchers are in `app/api/backtest/route.ts`.

### Provider chain

- Stocks: `fetchStockPriceData` -> Alpha Vantage
- Crypto primary: `fetchCryptoPriceDataBinance` -> Binance klines
- Crypto fallback: `fetchCryptoPriceDataCoinGecko` -> CoinGecko OHLC
- Router: `fetchPriceData` (auto-detect stock vs crypto)

### Current behavior

- Intraday + daily supported for both stocks and crypto.
- Stock fetch uses Alpha Vantage `TIME_SERIES_DAILY` or `TIME_SERIES_INTRADAY`.
- Crypto tries Binance first, then falls back to CoinGecko on failure.
- No persistent server-side cache in this route currently.
- Alpha Vantage rate limit returns an explicit error when `Note` is present.

### If you need caching

Best insertion point is `fetchPriceData`:

```ts
const cacheKey = `${symbol}:${timeframe}:${startDate}:${endDate}`;
const cached = await getFromCache(cacheKey);
if (cached) return cached;

const fresh = isCryptoSymbol(symbol)
  ? await fetchCryptoPriceData(symbol, timeframe, startDate, endDate)
  : { priceData: await fetchStockPriceData(symbol, timeframe), source: 'alpha_vantage' as const };

await setCache(cacheKey, fresh, 60); // seconds
return fresh;
```

## 3) Strategy definition format

Strategy IDs and metadata are defined in `lib/strategies`.

- Types: `lib/strategies/types.ts`
- Registry: `lib/strategies/registry.ts`

Core type:

```ts
export interface BacktestStrategyDefinition {
  id: string;
  label: string;
  timeframes: readonly BacktestTimeframe[];
}
```

How strategies are exposed:
- `BACKTEST_STRATEGY_CATEGORIES` powers UI grouping and valid strategy IDs.
- `getBacktestStrategy(id)` resolves definition.
- `isBacktestTimeframeSupported(strategyId, timeframe)` enforces per-strategy timeframe support.

Execution logic lives in:
- `app/api/backtest/route.ts` -> `runStrategy(...)` for most strategy branches.
- `lib/backtest/strategyExecutors.ts` -> `runCoreStrategyStep(...)` for core shared strategies.

## 4) Timeframe handling

Timeframe validity is defined in two places:

1. Request validation (`lib/validation.ts`):

```ts
export const backtestTimeframeSchema = z.enum(["1min", "5min", "15min", "30min", "60min", "daily"]);
```

2. Strategy framework (`lib/strategies/types.ts`):

```ts
export const BACKTEST_TIMEFRAMES = ['1min', '5min', '15min', '30min', '60min', 'daily'] as const;
```

Runtime enforcement in route:
- `isBacktestTimeframeSupported(strategyDefinition.id, effectiveTimeframe)`

Notes:
- Route uses `startDate/endDate` date-only filters even for intraday bars by splitting timestamp to date part.
- `runStrategy` enforces minimum bars:
  - intraday: at least 50 bars
  - daily: at least 100 bars

## 5) Result payload returned to UI

Metric/result shape source of truth:
- `lib/backtest/engine.ts` -> `BacktestEngineResult`
- Built by `buildBacktestEngineResult(trades, dates, initialCapital)`

Core return fields:

```ts
interface BacktestEngineResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  cagr: number;
  volatility: number;
  sortinoRatio: number;
  calmarRatio: number;
  timeInMarket: number;
  bestTrade: BacktestTrade | null;
  worstTrade: BacktestTrade | null;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
}
```

Route appends:

```ts
dataSources: {
  priceData: 'alpha_vantage' | 'binance' | 'coingecko';
  assetType: 'stock' | 'crypto';
}
```

UI consumer:
- `app/tools/backtest/page.tsx` (`runBacktest` -> `setResults(result)`) expects this shape directly.

## 6) If you want to add a new strategy (exact checklist)

1. Add strategy ID/label/timeframes to `BACKTEST_STRATEGY_CATEGORIES` in `lib/strategies/registry.ts`.
2. Implement signal logic:
   - Prefer `runCoreStrategyStep` if it fits existing core pattern, or
   - Add a dedicated branch in `runStrategy` in `app/api/backtest/route.ts`.
3. Ensure required indicators are computed in `runStrategy` before strategy loop.
4. Verify timeframe list includes desired values.
5. Run a sample POST to `/api/backtest` and confirm UI renders result without shape changes.

## 7) If you want route-entry + called-function subset only

Read these in order:
1. `app/api/backtest/route.ts` -> `POST`
2. `app/api/backtest/route.ts` -> `fetchPriceData`
3. `app/api/backtest/route.ts` -> `runStrategy`
4. `lib/backtest/strategyExecutors.ts` -> `runCoreStrategyStep`
5. `lib/backtest/engine.ts` -> `buildBacktestEngineResult`

That sequence is the minimal complete execution path.

## 8) Phase 1 implemented: Brain-native replay backtest

### New route

- `POST /api/backtest/brain`
- File: `app/api/backtest/brain/route.ts`
- Purpose: replay real `decision_packets` (Brain/operator signal stream) as trade signals against historical bars.

### Shared signal schema

- File: `lib/backtest/signalSnapshots.ts`
- Provides:
  - `brainSignalSnapshotSchema`
  - `brainBacktestRequestSchema`

### Replay logic (MVP)

1. Load decision packet snapshots for workspace + symbol + date range.
2. Keep qualified snapshots where:
   - `bias` is bullish/bearish
   - `signal_score >= minSignalScore` (default `60`)
3. Map each snapshot to nearest available market bar.
4. Simulate position open/close using packet levels:
   - entry: `entry_zone` or bar close fallback
   - stop: `invalidation` or fallback (1%)
   - target: first target or fallback (2%)
   - exit also on opposite qualified signal
5. Return standard `BacktestEngineResult` + replay metadata.

### UI wiring

- Registry now includes `brain_signal_replay` strategy in `lib/strategies/registry.ts`.
- `app/tools/backtest/page.tsx` routes requests based on strategy:
  - `brain_signal_replay` -> `/api/backtest/brain`
  - all others -> `/api/backtest`

## 9) Phase 2 implemented: Options + Time Scanner native replay

### New replay routes

- `POST /api/backtest/options`
  - File: `app/api/backtest/options/route.ts`
  - Replays only decision packets with `signal_source = 'options.confluence'`
- `POST /api/backtest/time-scanner`
  - File: `app/api/backtest/time-scanner/route.ts`
  - Replays only decision packets with `signal_source IN ('scanner.run', 'scanner.bulk')`

### Shared replay engine

- File: `lib/backtest/signalReplay.ts`
- Provides reusable signal replay flow used by:
  - `/api/backtest/brain`
  - `/api/backtest/options`
  - `/api/backtest/time-scanner`

### New backtest strategies exposed in UI

- `brain_signal_replay`
- `options_signal_replay`
- `time_scanner_signal_replay`

Routing in `app/tools/backtest/page.tsx`:
- `brain_signal_replay` -> `/api/backtest/brain`
- `options_signal_replay` -> `/api/backtest/options`
- `time_scanner_signal_replay` -> `/api/backtest/time-scanner`
- fallback -> `/api/backtest`
