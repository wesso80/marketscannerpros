// Databento historical adapter (REST). Live (DBN over WS) is stubbed for a
// follow-up — Databento's Live gateway uses binary DBN and is best handled
// in a dedicated worker process, not the web edge.
//
// Required env: DATABENTO_API_KEY (set in .env.local, never exposed client-side).
// Default dataset: GLBX.MDP3 for CME Globex futures.
//
// Docs: https://databento.com/docs/api-reference-historical/timeseries/get-range

import type {
  Bar,
  BarsRequest,
  BarsResponse,
  MarketDataProvider,
  Resolution,
  SymbolMeta,
} from './types';

const HIST_BASE = 'https://hist.databento.com/v0';

// Map our resolution to Databento schema.
// 1m..60m → ohlcv-1m / ohlcv-1h aggregates; daily → ohlcv-1d.
// Sub-minute resolutions are not aggregated by Databento — caller would
// build them from MBP/trades; we surface "unsupported" rather than fabricate.
const SCHEMA_FOR: Partial<Record<Resolution, string>> = {
  '1': 'ohlcv-1m',
  '5': 'ohlcv-1m',
  '15': 'ohlcv-1m',
  '30': 'ohlcv-1m',
  '60': 'ohlcv-1h',
  '240': 'ohlcv-1h',
  D: 'ohlcv-1d',
  W: 'ohlcv-1d',
};

// Server-side aggregation when Databento doesn't natively serve our resolution.
const NATIVE_STEP_MS: Record<string, number> = {
  'ohlcv-1m': 60_000,
  'ohlcv-1h': 3_600_000,
  'ohlcv-1d': 86_400_000,
};

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

interface DatabentoOhlcvRow {
  ts_event: string; // RFC3339
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function authHeader(): string {
  const key = process.env.DATABENTO_API_KEY;
  if (!key) throw new Error('DATABENTO_API_KEY not configured');
  // Databento uses HTTP Basic with the API key as the username and empty password.
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

/**
 * Parse Databento's `available_end` ISO timestamp out of a 422 error body.
 * Databento returns JSON like:
 *   {"detail":"data_end_after_available_end: ...; available_end=2026-05-06T09:30:00.000000000Z"}
 * but the exact wrapping varies, so we accept any ISO-8601 substring labelled
 * `available_end`. Returns epoch ms or null.
 */
function parseAvailableEnd(body: string): number | null {
  if (!body) return null;
  const m = body.match(/available_end[^0-9A-Z]*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)/i);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isFinite(t) ? t : null;
}

function aggregate(bars: Bar[], stepMs: number): Bar[] {
  if (bars.length === 0) return bars;
  const out: Bar[] = [];
  let bucket: Bar | null = null;
  for (const b of bars) {
    const bucketStart = Math.floor(b.time / stepMs) * stepMs;
    if (!bucket || bucket.time !== bucketStart) {
      if (bucket) out.push(bucket);
      bucket = { time: bucketStart, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      bucket.high = Math.max(bucket.high, b.high);
      bucket.low = Math.min(bucket.low, b.low);
      bucket.close = b.close;
      bucket.volume += b.volume;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

export class DatabentoProvider implements MarketDataProvider {
  readonly name = 'databento';
  private dataset: string;

  constructor(opts: { dataset?: string } = {}) {
    this.dataset = opts.dataset ?? 'GLBX.MDP3';
  }

  async resolveSymbol(input: string): Promise<SymbolMeta | null> {
    // Minimal stub: caller passes a Databento-native symbol (e.g. "ES.c.0"
    // continuous front-month, or "ESM6"). Tick metadata for ES; extend per
    // contract as you onboard more symbols. Do NOT fabricate metadata for
    // symbols we haven't verified.
    const id = input.toUpperCase();
    if (id.startsWith('ES')) {
      return {
        id,
        display: id,
        description: 'E-mini S&P 500',
        tickSize: 0.25,
        tickValue: 12.5,
        assetClass: 'future',
        exchange: this.dataset,
        sessionTz: 'America/Chicago 17:00-16:00',
        currency: 'USD',
      };
    }
    if (id.startsWith('NQ')) {
      return {
        id,
        display: id,
        description: 'E-mini Nasdaq-100',
        tickSize: 0.25,
        tickValue: 5.0,
        assetClass: 'future',
        exchange: this.dataset,
        sessionTz: 'America/Chicago 17:00-16:00',
        currency: 'USD',
      };
    }
    return null;
  }

  async getBars(req: BarsRequest): Promise<BarsResponse> {
    const schema = SCHEMA_FOR[req.resolution];
    if (!schema) {
      // Sub-minute or weekly aggregate: refuse rather than guess.
      return {
        symbol: req.symbol,
        resolution: req.resolution,
        bars: [],
        source: 'databento',
        fetchedAt: Date.now(),
        noData: true,
      };
    }

    const url = new URL(`${HIST_BASE}/timeseries.get_range`);
    url.searchParams.set('dataset', this.dataset);
    url.searchParams.set('schema', schema);
    url.searchParams.set('symbols', req.symbol);
    url.searchParams.set('stype_in', 'continuous');
    url.searchParams.set('encoding', 'json');
    // Databento historical data lags real-time by a few minutes. Clamp `end`
    // to that lag window so requests for "now" don't 422 with
    // data_end_after_available_end.
    const lagMs = Number(process.env.DATABENTO_HIST_LAG_MS ?? '600000'); // 10 min default
    const clampedEnd = Math.min(req.to, Date.now() - lagMs);
    if (clampedEnd <= req.from) {
      return {
        symbol: req.symbol,
        resolution: req.resolution,
        bars: [],
        source: 'databento',
        fetchedAt: Date.now(),
        noData: true,
      };
    }
    const fetchRange = async (startMs: number, endMs: number) => {
      url.searchParams.set('start', new Date(startMs).toISOString());
      url.searchParams.set('end', new Date(endMs).toISOString());
      return fetch(url, {
        headers: { Authorization: authHeader() },
        cache: 'no-store',
      });
    };

    let res = await fetchRange(req.from, clampedEnd);
    let usedAvailableEnd = false;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Auto-detect available_end from Databento's 422 and retry once.
      // Usage-based plans expose only fixed historical snapshots whose
      // available_end may sit far behind real-time. Parse the boundary
      // out of the error body and retry with that as the new end.
      const availableEnd = parseAvailableEnd(body);
      if (availableEnd && availableEnd > req.from) {
        const retryEnd = Math.min(clampedEnd, availableEnd);
        if (retryEnd > req.from) {
          res = await fetchRange(req.from, retryEnd);
          usedAvailableEnd = true;
          if (!res.ok) {
            const body2 = await res.text().catch(() => '');
            throw new Error(`Databento ${res.status} (after available_end retry): ${body2.slice(0, 200)}`);
          }
        } else {
          throw new Error(`Databento ${res.status}: available_end ${new Date(availableEnd).toISOString()} precedes requested start; ${body.slice(0, 200)}`);
        }
      } else {
        throw new Error(`Databento ${res.status}: ${body.slice(0, 200)}`);
      }
    }

    // JSON encoding returns NDJSON (one row per line).
    const text = await res.text();
    const rows: DatabentoOhlcvRow[] = text
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as DatabentoOhlcvRow);

    let bars: Bar[] = rows.map((r) => ({
      time: new Date(r.ts_event).getTime(),
      open: Number(r.open) / 1e9, // Databento prices are fixed-point 1e9
      high: Number(r.high) / 1e9,
      low: Number(r.low) / 1e9,
      close: Number(r.close) / 1e9,
      volume: Number(r.volume),
    }));

    // Aggregate up if our requested resolution is coarser than the schema.
    const nativeStep = NATIVE_STEP_MS[schema];
    const targetStep = RES_MS[req.resolution];
    if (nativeStep && targetStep > nativeStep) {
      bars = aggregate(bars, targetStep);
    }

    if (req.limit && bars.length > req.limit) bars = bars.slice(-req.limit);

    return {
      symbol: req.symbol,
      resolution: req.resolution,
      bars,
      source: 'databento',
      fetchedAt: Date.now(),
      noData: bars.length === 0,
      effectiveEnd: Number(url.searchParams.get('end') ? Date.parse(url.searchParams.get('end') as string) : clampedEnd),
      usedAvailableEnd,
    };
  }

  // Live tick/bar streaming intentionally not implemented in the web layer.
  // The Databento Live gateway speaks DBN binary and should run in a
  // dedicated worker that rebroadcasts a normalized JSON stream over our
  // own WebSocket. See the upcoming worker/trade-livefeed.ts.
}
