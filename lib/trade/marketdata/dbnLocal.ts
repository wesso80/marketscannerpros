// Local Databento NDJSON provider.
//
// Reads a pre-downloaded Databento OHLCV-1m NDJSON file (e.g. purchased once
// from the Databento UI) and serves bars from memory. Eliminates per-request
// API calls, available_end clamping, and quota issues.
//
// File format (one JSON per line):
//   { "hd": { "ts_event": "2026-04-06T00:00:00.000000000Z", ... },
//     "open": "6587.500000000", "high": "...", "low": "...",
//     "close": "...", "volume": "3005", "symbol": "ESM6" }
//
// Env:
//   TRADE_LOCAL_DATA_FILE  Optional absolute path. Defaults to
//                          ./data/glbx-mdp3-20260406-20260505.ohlcv-1m.json
//
// Continuous symbols (ES.c.0, NQ.c.0, MES.c.0, MNQ.c.0) are mapped to the
// front-month contract code present in the file (M6 = June 2026).

import fs from 'fs';
import path from 'path';
import type {
  Bar,
  BarsRequest,
  BarsResponse,
  MarketDataProvider,
  Resolution,
  SymbolMeta,
} from './types';

const DEFAULT_FILE = path.join(
  process.cwd(),
  'data',
  'glbx-mdp3-20260406-20260505.ohlcv-1m.json',
);

const RES_MS: Record<Resolution, number> = {
  '1S': 1_000,
  '5S': 5_000,
  '15S': 15_000,
  '30S': 30_000,
  '1': 60_000,
  '5': 5 * 60_000,
  '15': 15 * 60_000,
  '30': 30 * 60_000,
  '60': 60 * 60_000,
  '240': 240 * 60_000,
  D: 86_400_000,
  W: 7 * 86_400_000,
};

// Map continuous → front-month contract code present in the bundled file.
// Update when rolling to a later expiry.
const CONTINUOUS_MAP: Record<string, string> = {
  'ES.C.0': 'ESM6',
  'NQ.C.0': 'NQM6',
  'MES.C.0': 'MESM6',
  'MNQ.C.0': 'MNQM6',
};

function resolveContract(sym: string): string {
  const up = sym.toUpperCase();
  return CONTINUOUS_MAP[up] ?? up;
}

let INDEX: Map<string, Bar[]> | null = null;
let LOAD_ERR: string | null = null;
let LOAD_PATH: string | null = null;

function loadIndex(): Map<string, Bar[]> {
  if (INDEX) return INDEX;
  const filePath = process.env.TRADE_LOCAL_DATA_FILE || DEFAULT_FILE;
  LOAD_PATH = filePath;
  if (!fs.existsSync(filePath)) {
    LOAD_ERR = `Local data file not found: ${filePath}`;
    INDEX = new Map();
    return INDEX;
  }
  const idx = new Map<string, Bar[]>();
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    LOAD_ERR = `Failed to read local data file: ${(e as Error).message}`;
    INDEX = new Map();
    return INDEX;
  }
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line) continue;
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const sym: string | undefined = row.symbol;
    const tsStr: string | undefined = row.hd?.ts_event;
    if (!sym || !tsStr) continue;
    const time = Date.parse(tsStr);
    if (!Number.isFinite(time)) continue;
    const bar: Bar = {
      time,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume) || 0,
    };
    if (!Number.isFinite(bar.open) || !Number.isFinite(bar.close)) continue;
    let arr = idx.get(sym);
    if (!arr) {
      arr = [];
      idx.set(sym, arr);
    }
    arr.push(bar);
  }
  // Sort each symbol by time (file is mostly time-ordered already, but be safe).
  for (const arr of idx.values()) {
    arr.sort((a, b) => a.time - b.time);
  }
  INDEX = idx;
  LOAD_ERR = null;
  return INDEX;
}

/** Aggregate 1-minute bars up to a higher resolution by epoch-aligned buckets. */
function aggregate(bars: Bar[], stepMs: number): Bar[] {
  if (stepMs <= 60_000) return bars;
  const out: Bar[] = [];
  let bucketStart = -1;
  let cur: Bar | null = null;
  for (const b of bars) {
    const bs = Math.floor(b.time / stepMs) * stepMs;
    if (bs !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = bs;
      cur = { time: bs, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else if (cur) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export class DbnLocalProvider implements MarketDataProvider {
  readonly name = 'dbn-local';

  async resolveSymbol(input: string): Promise<SymbolMeta | null> {
    const contract = resolveContract(input);
    const id = contract.toUpperCase();
    const base = (() => {
      if (id.startsWith('MES'))
        return { description: 'Micro E-mini S&P 500', tickValue: 1.25 };
      if (id.startsWith('MNQ'))
        return { description: 'Micro E-mini Nasdaq-100', tickValue: 0.5 };
      if (id.startsWith('ES'))
        return { description: 'E-mini S&P 500', tickValue: 12.5 };
      if (id.startsWith('NQ'))
        return { description: 'E-mini Nasdaq-100', tickValue: 5.0 };
      return null;
    })();
    if (!base) return null;
    return {
      id,
      display: id,
      description: base.description,
      tickSize: 0.25,
      tickValue: base.tickValue,
      assetClass: 'future',
      exchange: 'GLBX.MDP3',
      sessionTz: 'America/Chicago 17:00-16:00',
      currency: 'USD',
    };
  }

  async getBars(req: BarsRequest): Promise<BarsResponse> {
    const idx = loadIndex();
    const stepMs = RES_MS[req.resolution] ?? 60_000;
    if (stepMs < 60_000) {
      return {
        symbol: req.symbol,
        resolution: req.resolution,
        bars: [],
        source: 'dbn-local',
        fetchedAt: Date.now(),
        noData: true,
      };
    }
    const contract = resolveContract(req.symbol);
    const all = idx.get(contract) ?? [];
    // Inclusive from, exclusive to (matches BarsRequest contract).
    const slice: Bar[] = [];
    for (const b of all) {
      if (b.time < req.from) continue;
      if (b.time >= req.to) break;
      slice.push(b);
    }
    const agg = aggregate(slice, stepMs);
    const limited = req.limit && agg.length > req.limit ? agg.slice(-req.limit) : agg;
    return {
      symbol: req.symbol,
      resolution: req.resolution,
      bars: limited,
      source: 'dbn-local',
      fetchedAt: Date.now(),
      noData: limited.length === 0,
    };
  }
}

/** Diagnostic snapshot for the diag route. */
export function dbnLocalDiag() {
  const idx = loadIndex();
  const symbols = Array.from(idx.entries())
    .map(([sym, arr]) => ({
      symbol: sym,
      bars: arr.length,
      firstTime: arr[0]?.time ?? null,
      lastTime: arr[arr.length - 1]?.time ?? null,
    }))
    .sort((a, b) => b.bars - a.bars)
    .slice(0, 20);
  return {
    path: LOAD_PATH,
    error: LOAD_ERR,
    totalSymbols: idx.size,
    topSymbols: symbols,
  };
}
