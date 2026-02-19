import { q } from '@/lib/db';
import { buildBacktestEngineResult, type BacktestTrade } from '@/lib/backtest/engine';
import { brainSignalSnapshotSchema, type BrainSignalSnapshot } from '@/lib/backtest/signalSnapshots';
import { parseBacktestTimeframe, resamplePriceData, computeCoverage } from '@/lib/backtest/timeframe';
import { buildBacktestDiagnostics, inferStrategyDirection } from '@/lib/backtest/diagnostics';
import { enrichTradesWithMetadata } from '@/lib/backtest/tradeForensics';
import { buildValidationPayload } from '@/lib/backtest/validationPayload';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'UI755FUUAM6FRRI9';

type PriceData = Record<string, {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>;

const KNOWN_CRYPTO = new Set([
  'BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK',
  'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'FIL', 'AAVE', 'EOS',
  'XTZ', 'THETA', 'XMR', 'NEO', 'MKR', 'COMP', 'SNX', 'SUSHI', 'YFI', 'CRV',
  'GRT', 'ENJ', 'MANA', 'SAND', 'AXS', 'CHZ', 'HBAR', 'FTM', 'NEAR', 'EGLD',
  'FLOW', 'ICP', 'AR', 'HNT', 'STX', 'KSM', 'ZEC', 'DASH', 'WAVES', 'KAVA',
  'BNB', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'APE', 'IMX', 'OP', 'ARB',
  'SUI', 'SEI', 'TIA', 'INJ', 'FET', 'RNDR', 'RENDER', 'JUP', 'KAS', 'RUNE',
  'OSMO', 'CELO', 'ONE', 'ZIL', 'ICX', 'QTUM', 'ONT', 'ZRX', 'BAT',
]);

export function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase().replace(/-?USD$/, '').replace(/-?USDT$/, '');
  return KNOWN_CRYPTO.has(upper);
}

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/-?USD$/, '').replace(/-?USDT$/, '');
}

function toBarKey(timestamp: string, isDailyBars: boolean): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  if (isDailyBars) return date.toISOString().slice(0, 10);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function resolveBarIndexFromTime(sortedDates: string[], timestamp: string, isDailyBars: boolean): number {
  const desired = toBarKey(timestamp, isDailyBars);
  if (!desired) return -1;
  for (let i = 0; i < sortedDates.length; i++) {
    if (sortedDates[i] >= desired) return i;
  }
  return -1;
}

async function fetchStockPriceData(symbol: string, timeframe: string): Promise<PriceData> {
  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  if (!parsedTimeframe) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  const isDaily = parsedTimeframe.kind === 'daily';
  const interval = parsedTimeframe.alphaInterval || '1min';
  const timeSeriesKey = isDaily ? 'Time Series (Daily)' : `Time Series (${interval})`;
  const url = isDaily
    ? `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`
    : `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;

  const response = await fetch(url);
  const data = await response.json();
  const timeSeries = data[timeSeriesKey];
  if (!timeSeries) {
    if (data['Error Message']) throw new Error(`Invalid symbol ${symbol}: ${data['Error Message']}`);
    if (data['Note']) throw new Error('API rate limit exceeded. Please try again in a minute.');
    throw new Error(`Failed to fetch stock data for ${symbol}`);
  }

  const parsed: PriceData = {};
  for (const [date, values] of Object.entries(timeSeries)) {
    parsed[date] = {
      open: Number((values as any)['1. open']),
      high: Number((values as any)['2. high']),
      low: Number((values as any)['3. low']),
      close: Number((values as any)['4. close']),
      volume: Number((values as any)['5. volume']),
    };
  }
  if (parsedTimeframe.needsResample && parsedTimeframe.minutes > parsedTimeframe.sourceMinutes) {
    return resamplePriceData(parsed, parsedTimeframe.minutes, parsedTimeframe.sourceMinutes);
  }

  return parsed;
}

async function fetchCryptoPriceData(symbol: string, timeframe: string, startDate: string, endDate: string): Promise<PriceData> {
  const cleanSymbol = normalizeSymbol(symbol);
  const binanceSymbol = `${cleanSymbol}USDT`;
  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  if (!parsedTimeframe) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }
  const interval = parsedTimeframe.binanceInterval;

  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime() + 86400000;

  const allCandles: any[] = [];
  let currentStart = startTime;
  const limit = 1000;

  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Binance API error for ${cleanSymbol}.`);

    const data = await response.json();
    if (data.code) throw new Error(`Binance API error: ${data.msg}`);
    if (!Array.isArray(data) || data.length === 0) break;

    allCandles.push(...data);
    const lastCandle = data[data.length - 1];
    currentStart = Number(lastCandle[0]) + 1;
    if (data.length < limit) break;
  }

  if (!allCandles.length) throw new Error(`No crypto bars found for ${cleanSymbol}`);

  const parsed: PriceData = {};
  for (const candle of allCandles) {
    const date = new Date(Number(candle[0]));
    const key = parsedTimeframe.kind === 'daily'
      ? date.toISOString().slice(0, 10)
      : date.toISOString().replace('T', ' ').slice(0, 19);

    parsed[key] = {
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5]),
    };
  }
  if (parsedTimeframe.needsResample && parsedTimeframe.minutes > parsedTimeframe.sourceMinutes) {
    return resamplePriceData(parsed, parsedTimeframe.minutes, parsedTimeframe.sourceMinutes);
  }

  return parsed;
}

async function fetchPriceData(symbol: string, timeframe: string, startDate: string, endDate: string): Promise<PriceData> {
  if (isCryptoSymbol(symbol)) {
    return fetchCryptoPriceData(symbol, timeframe, startDate, endDate);
  }
  return fetchStockPriceData(symbol, timeframe);
}

type RawSignalRow = {
  packet_id: string;
  symbol: string;
  signal_source: string | null;
  signal_score: number | null;
  bias: string | null;
  status: string | null;
  entry_zone: number | null;
  invalidation: number | null;
  targets: unknown;
  created_at: string;
  updated_at: string;
};

type SourceFilter = {
  exact?: string[];
  like?: string[];
};

function formatSourceFilterLabel(filter?: SourceFilter): string {
  const exact = (filter?.exact || []).filter(Boolean);
  const like = (filter?.like || []).filter(Boolean);

  if (!exact.length && !like.length) {
    return 'decision_packets (all sources)';
  }

  const parts: string[] = [];
  if (exact.length) {
    parts.push(`signal_source IN (${exact.map((value) => `'${value}'`).join(', ')})`);
  }
  if (like.length) {
    parts.push(`signal_source LIKE (${like.map((value) => `'${value}'`).join(', ')})`);
  }

  return parts.join(' OR ');
}

function buildReplaySymbolCandidates(symbol: string): string[] {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return [];

  const stripped = upper.replace(/-?USDT$/, '').replace(/-?USD$/, '');
  const candidates = [
    upper,
    stripped,
    `${stripped}USD`,
    `${stripped}USDT`,
    `${stripped}-USD`,
    `${stripped}-USDT`,
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(candidates));
}

type ReplayRequest = {
  workspaceId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  timeframe: string;
  initialCapital: number;
  minSignalScore: number;
  mode: 'brain_signal_replay' | 'options_signal_replay' | 'time_scanner_signal_replay';
  sourceFilter?: SourceFilter;
};

function replayStrategyLabel(mode: ReplayRequest['mode']): string {
  if (mode === 'brain_signal_replay') return 'Brain Signal Replay';
  if (mode === 'options_signal_replay') return 'Options Confluence Replay';
  return 'Time Scanner Replay';
}

async function fetchSignalSnapshots(params: ReplayRequest): Promise<BrainSignalSnapshot[]> {
  const symbolCandidates = buildReplaySymbolCandidates(params.symbol);

  const whereParts = [
    'workspace_id = $1',
    'UPPER(symbol) = ANY($2::text[])',
    'created_at::date >= $3::date',
    'created_at::date <= $4::date',
  ];
  const args: any[] = [params.workspaceId, symbolCandidates, params.startDate, params.endDate];

  if (params.sourceFilter?.exact?.length) {
    args.push(params.sourceFilter.exact);
    whereParts.push(`signal_source = ANY($${args.length}::text[])`);
  }

  if (params.sourceFilter?.like?.length) {
    args.push(params.sourceFilter.like);
    whereParts.push(`EXISTS (
      SELECT 1
      FROM unnest($${args.length}::text[]) AS pattern
      WHERE COALESCE(signal_source, '') ILIKE pattern
    )`);
  }

  const rows = await q<RawSignalRow>(
    `SELECT packet_id, symbol, signal_source, signal_score, bias, status, entry_zone, invalidation, targets, created_at, updated_at
       FROM decision_packets
      WHERE ${whereParts.join(' AND ')}
      ORDER BY created_at ASC`,
    args
  );

  const snapshots: BrainSignalSnapshot[] = [];
  for (const row of rows) {
    const targets = Array.isArray(row.targets)
      ? row.targets.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : [];

    const parsed = brainSignalSnapshotSchema.safeParse({
      packetId: row.packet_id,
      symbol: row.symbol,
      signalSource: row.signal_source,
      signalScore: row.signal_score,
      bias: row.bias === 'bullish' || row.bias === 'bearish' || row.bias === 'neutral' ? row.bias : 'neutral',
      status: row.status === 'candidate' || row.status === 'planned' || row.status === 'alerted' || row.status === 'executed' || row.status === 'closed'
        ? row.status
        : 'candidate',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      entryZone: row.entry_zone,
      invalidation: row.invalidation,
      targets,
    });

    if (parsed.success) snapshots.push(parsed.data);
  }

  return snapshots;
}

type Direction = 'LONG' | 'SHORT';

export async function runSignalReplayBacktest(params: ReplayRequest) {
  const parsedTimeframe = parseBacktestTimeframe(params.timeframe);
  if (!parsedTimeframe) {
    throw new Error(`Unsupported timeframe format: ${params.timeframe}`);
  }

  const [priceData, snapshots] = await Promise.all([
    fetchPriceData(params.symbol, parsedTimeframe.normalized, params.startDate, params.endDate),
    fetchSignalSnapshots(params),
  ]);

  const isCrypto = isCryptoSymbol(params.symbol);
  const symbolCandidates = buildReplaySymbolCandidates(params.symbol);
  const sourceFilterLabel = formatSourceFilterLabel(params.sourceFilter);
  const isDailyBars = parsedTimeframe.kind === 'daily';

  if (!snapshots.length) {
    const emptyResult = buildBacktestEngineResult([], [], params.initialCapital);
    const strategyDirection = inferStrategyDirection(params.mode, emptyResult.trades);
    const diagnostics = buildBacktestDiagnostics(emptyResult, strategyDirection, parsedTimeframe.normalized, 0);
    const validation = buildValidationPayload(params.mode, strategyDirection, emptyResult);

    return {
      ...emptyResult,
      validation,
      dataSources: {
        priceData: isCrypto ? 'binance' : 'alpha_vantage',
        assetType: isCrypto ? 'crypto' : 'stock',
      },
      signalReplay: {
        snapshots: 0,
        qualifiedSignals: 0,
        mode: params.mode,
        minSignalScore: params.minSignalScore,
        sourceFilterLabel,
        symbolCandidates,
        noDataReason: 'No decision packets matched symbol/date/source filters in this workspace.',
        filterStats: {
          rejectedByScore: 0,
          rejectedByNeutralBias: 0,
          rejectedByOutOfRange: 0,
        },
      },
      strategyProfile: {
        id: params.mode,
        label: replayStrategyLabel(params.mode),
        direction: strategyDirection,
        invalidation: diagnostics.invalidation,
      },
      diagnostics,
    };
  }

  const coverage = computeCoverage(priceData, params.startDate, params.endDate);

  const dates = Object.keys(priceData).sort().filter((key) => {
    const dateOnly = key.split(' ')[0];
    return dateOnly >= coverage.appliedStartDate && dateOnly <= coverage.appliedEndDate;
  });

  if (dates.length < 20) {
    throw new Error(`Insufficient market data for ${params.symbol}. Need at least 20 bars, found ${dates.length}.`);
  }

  const closes = dates.map((d) => priceData[d].close);
  const highs = dates.map((d) => priceData[d].high);
  const lows = dates.map((d) => priceData[d].low);

  type SignalAtBar = {
    direction: Direction;
    score: number;
    entryZone: number | null;
    stop: number | null;
    target: number | null;
  };

  const signalsByBar = new Map<number, SignalAtBar>();
  let qualifiedSignals = 0;
  let rejectedByScore = 0;
  let rejectedByNeutralBias = 0;
  let rejectedByOutOfRange = 0;

  for (const snapshot of snapshots) {
    const score = snapshot.signalScore ?? 0;
    if (score < params.minSignalScore) {
      rejectedByScore += 1;
      continue;
    }
    if (snapshot.bias === 'neutral') {
      rejectedByNeutralBias += 1;
      continue;
    }

    const direction: Direction = snapshot.bias === 'bullish' ? 'LONG' : 'SHORT';
    const barIndex = resolveBarIndexFromTime(dates, snapshot.createdAt, isDailyBars);
    if (barIndex < 1 || barIndex >= dates.length) {
      rejectedByOutOfRange += 1;
      continue;
    }

    const existing = signalsByBar.get(barIndex);
    const nextSignal: SignalAtBar = {
      direction,
      score,
      entryZone: snapshot.entryZone,
      stop: snapshot.invalidation,
      target: snapshot.targets[0] ?? null,
    };

    if (!existing || existing.score <= score) {
      signalsByBar.set(barIndex, nextSignal);
    }
    qualifiedSignals += 1;
  }

  const trades: BacktestTrade[] = [];
  let position: {
    side: Direction;
    entry: number;
    entryDate: string;
    entryIdx: number;
    stop: number;
    target: number;
  } | null = null;

  for (let i = 1; i < dates.length; i++) {
    const signal = signalsByBar.get(i);
    const close = closes[i];

    if (!position && signal) {
      const entry = signal.entryZone ?? close;
      const fallbackStop = signal.direction === 'LONG' ? entry * 0.99 : entry * 1.01;
      const fallbackTarget = signal.direction === 'LONG' ? entry * 1.02 : entry * 0.98;
      position = {
        side: signal.direction,
        entry,
        entryDate: dates[i],
        entryIdx: i,
        stop: signal.stop ?? fallbackStop,
        target: signal.target ?? fallbackTarget,
      };
      continue;
    }

    if (!position) continue;

    const hitStop = position.side === 'LONG' ? lows[i] <= position.stop : highs[i] >= position.stop;
    const hitTarget = position.side === 'LONG' ? highs[i] >= position.target : lows[i] <= position.target;

    let shouldExit = false;
    let exit = close;
    let exitReason: BacktestTrade['exitReason'] | null = null;

    if (hitStop) {
      shouldExit = true;
      exit = position.stop;
      exitReason = 'stop';
    } else if (hitTarget) {
      shouldExit = true;
      exit = position.target;
      exitReason = 'target';
    } else if (signal && signal.direction !== position.side) {
      shouldExit = true;
      exit = close;
      exitReason = 'signal_flip';
    }

    if (!shouldExit) continue;

    const shares = (params.initialCapital * 0.95) / position.entry;
    const returnDollars = position.side === 'LONG'
      ? (exit - position.entry) * shares
      : (position.entry - exit) * shares;
    const returnPercent = position.side === 'LONG'
      ? ((exit - position.entry) / position.entry) * 100
      : ((position.entry - exit) / position.entry) * 100;

    trades.push({
      entryDate: position.entryDate,
      exitDate: dates[i],
      entryTs: position.entryDate,
      exitTs: dates[i],
      symbol: params.symbol.toUpperCase(),
      side: position.side,
      direction: position.side === 'LONG' ? 'long' : 'short',
      entry: position.entry,
      exit,
      return: returnDollars,
      returnPercent,
      exitReason: exitReason ?? 'signal_flip',
      holdingPeriodDays: i - position.entryIdx + 1,
    });

    position = null;
  }

  if (position) {
    const lastIndex = dates.length - 1;
    const exit = closes[lastIndex];
    const shares = (params.initialCapital * 0.95) / position.entry;
    const returnDollars = position.side === 'LONG'
      ? (exit - position.entry) * shares
      : (position.entry - exit) * shares;
    const returnPercent = position.side === 'LONG'
      ? ((exit - position.entry) / position.entry) * 100
      : ((position.entry - exit) / position.entry) * 100;

    trades.push({
      entryDate: position.entryDate,
      exitDate: dates[lastIndex],
      entryTs: position.entryDate,
      exitTs: dates[lastIndex],
      symbol: params.symbol.toUpperCase(),
      side: position.side,
      direction: position.side === 'LONG' ? 'long' : 'short',
      entry: position.entry,
      exit,
      return: returnDollars,
      returnPercent,
      exitReason: 'end_of_data',
      holdingPeriodDays: lastIndex - position.entryIdx + 1,
    });
  }

  const enrichedTrades = enrichTradesWithMetadata(trades, dates, highs, lows);
  const result = buildBacktestEngineResult(enrichedTrades, dates, params.initialCapital);
  const strategyDirection = inferStrategyDirection(params.mode, result.trades);
  const diagnostics = buildBacktestDiagnostics(result, strategyDirection, parsedTimeframe.normalized, coverage.bars);
  const validation = buildValidationPayload(params.mode, strategyDirection, result);

  let noDataReason: string | null = null;
  if (snapshots.length === 0) {
    noDataReason = 'No decision packets matched symbol/date/source filters in this workspace.';
  } else if (qualifiedSignals === 0) {
    if (rejectedByScore === snapshots.length) {
      noDataReason = `All matched snapshots were below minimum score ${params.minSignalScore}.`;
    } else if (rejectedByNeutralBias === snapshots.length) {
      noDataReason = 'All matched snapshots were neutral bias and cannot open replay positions.';
    } else if (rejectedByOutOfRange === snapshots.length) {
      noDataReason = 'Matched snapshots were outside the available price-bar timeline for the selected timeframe/date range.';
    } else {
      noDataReason = 'Matched snapshots existed, but none qualified after replay filters.';
    }
  }

  return {
    ...result,
    validation,
    dataSources: {
      priceData: isCrypto ? 'binance' : 'alpha_vantage',
      assetType: isCrypto ? 'crypto' : 'stock',
    },
    signalReplay: {
      snapshots: snapshots.length,
      qualifiedSignals,
      mode: params.mode,
      minSignalScore: params.minSignalScore,
      sourceFilterLabel,
      symbolCandidates,
      noDataReason,
      filterStats: {
        rejectedByScore,
        rejectedByNeutralBias,
        rejectedByOutOfRange,
      },
    },
    strategyProfile: {
      id: params.mode,
      label: replayStrategyLabel(params.mode),
      direction: strategyDirection,
      invalidation: diagnostics.invalidation,
    },
    diagnostics,
    dataCoverage: {
      requested: {
        startDate: params.startDate,
        endDate: params.endDate,
      },
      applied: {
        startDate: coverage.appliedStartDate,
        endDate: coverage.appliedEndDate,
      },
      minAvailable: coverage.minAvailable,
      maxAvailable: coverage.maxAvailable,
      bars: coverage.bars,
      provider: isCrypto ? 'binance' : 'alpha_vantage',
    },
  };
}