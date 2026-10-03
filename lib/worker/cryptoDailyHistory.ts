/**
 * Worker-side daily crypto history: fetch the ~1080-bar CoinGecko daily history ONCE, then only the missing bars once
 * per UTC day (after the new candle is published), instead of re-reading 1080 days on every tier refresh.
 *
 * The worker only uses COMPLETED daily bars (the open bar is dropped by fetchCryptoSeries), so between two UTC day
 * closes the history it gets from CoinGecko is the same every time; re-fetching it every 10–120 minutes spent ~3
 * CoinGecko calls per coin per refresh (≈12.7k calls/day for 100 coins) for identical data.
 *
 * Readers see the same data shape: the bars are exactly what a full `fetchCryptoSeries(…, 'daily')` returns (the same
 * ~1080-day window, trimmed as days pass). A full re-sync runs every `fullResyncMs` (default 7 days) to pick up any
 * candle CoinGecko revised further back than the 2-day overlap of the incremental read.
 *
 * Pure logic + injected fetchers/persistence so it is unit-testable without CoinGecko, Redis or Postgres.
 */
import type { Bar } from '@/lib/scanner/barAggregation';
import { attachDailyVolumes } from '@/lib/scanner/barAggregation';
import { cryptoRequestAnchors } from '@/lib/scanner/cryptoBars';

export const DAY_MS = 86_400_000;
/** Worker/ingest warm-up only. User-facing `fetchCryptoSeries` stays at 2 × 180-day windows. */
export const WORKER_DAILY_WINDOWS = 6;
/** Bars a worker full daily fetch holds: 6 × 180-day windows → opens from (today − 1080 d) to yesterday. */
export const DAILY_HISTORY_DAYS = WORKER_DAILY_WINDOWS * 180;

export interface DailyHistoryEntry {
  coinId: string;
  /** Completed daily bars, ascending by open time (`t`). */
  bars: Bar[];
  /** Last full (1080-day) fetch, epoch ms. */
  fullAt: number;
  /** Last fetch attempt of any kind, epoch ms (spaces retries while CoinGecko has not published the new candle). */
  checkedAt: number;
}

export interface DailyHistoryConfig {
  /** Time after 00:00 UTC before the just-closed candle is expected (CoinGecko publishes daily OHLC ~00:35 UTC). */
  settleMs: number;
  /** Minimum spacing between incremental attempts when the expected candle is still missing. */
  retryMs: number;
  /** Full 1080-day re-sync interval. */
  fullResyncMs: number;
}

export const DEFAULT_DAILY_HISTORY_CONFIG: DailyHistoryConfig = {
  settleMs: 40 * 60_000,
  retryMs: 15 * 60_000,
  fullResyncMs: 7 * DAY_MS,
};

const utcDayStart = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/**
 * Open time of the newest completed daily bar that should be available at `nowMs`: the bar that closed at the most
 * recent 00:00 UTC, once `settleMs` has passed; before that, the bar before it.
 */
export function expectedLatestDailyOpenMs(nowMs: number, settleMs: number): number {
  return utcDayStart(nowMs - settleMs) - DAY_MS;
}

export type DailyHistoryPlan = 'full' | 'incremental' | 'none';

export function planDailyHistoryFetch(entry: DailyHistoryEntry | null | undefined, nowMs: number, cfg: DailyHistoryConfig = DEFAULT_DAILY_HISTORY_CONFIG): DailyHistoryPlan {
  if (!entry || entry.bars.length === 0) return 'full';
  // Any failed or empty attempt (full or incremental) waits retryMs before the next one.
  const recentlyChecked = nowMs - entry.checkedAt < cfg.retryMs;
  if (nowMs - entry.fullAt >= cfg.fullResyncMs) return recentlyChecked ? 'none' : 'full';
  const lastOpen = Date.parse(entry.bars[entry.bars.length - 1].t);
  if (!Number.isFinite(lastOpen)) return 'full';
  if (lastOpen >= expectedLatestDailyOpenMs(nowMs, cfg.settleMs)) return 'none';
  if (recentlyChecked) return 'none';
  // A gap too long for one incremental window (≤ 180 days incl. overlap) — refetch everything.
  if (nowMs - lastOpen > 170 * DAY_MS) return 'full';
  return 'incremental';
}

/**
 * Keep the same window a fresh full fetch returns: bars opening on or after (00:00 UTC today − 1080 d), i.e. daily
 * closes from 359 days ago up to the last completed close. The window is anchored on the trailing request time
 * (now − 60 s, floored to the minute) exactly as fetchCryptoSeries anchors its requests.
 */
export function trimDailyWindow(bars: Bar[], nowMs: number): Bar[] {
  const oldestOpen = cryptoRequestAnchors(nowMs).dayStartS * 1000 - DAILY_HISTORY_DAYS * DAY_MS;
  return bars.filter((b) => Date.parse(b.t) >= oldestOpen);
}

/** Merge newly fetched bars over the held history (new values win), re-attach fresh volumes, trim to the window. */
export function mergeDailyHistory(existing: Bar[], incoming: Bar[], volumes: Array<[number, number]>, nowMs: number): Bar[] {
  const byOpen = new Map<string, Bar>();
  for (const b of existing) byOpen.set(b.t, b);
  for (const b of incoming) byOpen.set(b.t, b);
  const merged = [...byOpen.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return trimDailyWindow(volumes.length ? attachDailyVolumes(merged, volumes) : merged, nowMs);
}

/** Loose validation for an entry read back from persistence (Redis). */
export function isDailyHistoryEntry(value: unknown): value is DailyHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DailyHistoryEntry>;
  return typeof v.coinId === 'string' && Array.isArray(v.bars) && Number.isFinite(v.fullAt) && Number.isFinite(v.checkedAt) &&
    v.bars.every((b) => b && typeof b.t === 'string' && [b.open, b.high, b.low, b.close].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      (b.volume === null || (typeof b.volume === 'number' && Number.isFinite(b.volume))));
}

export interface DailyHistoryDeps {
  /** Full history (same call the worker made on every refresh before): completed daily bars, ascending. */
  fetchFull: (symbol: string, coinId: string, nowMs: number) => Promise<{ bars: Bar[]; warnings: string[] }>;
  /** Missing bars since the newest held open time; null = gap too long (do a full fetch). */
  fetchIncrement: (coinId: string, sinceOpenMs: number, nowMs: number) => Promise<{ bars: Bar[]; volumes: Array<[number, number]>; warnings: string[] } | null>;
  load?: (coinId: string) => Promise<unknown>;
  save?: (entry: DailyHistoryEntry) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

export interface DailyHistoryResult {
  bars: Bar[];
  plan: DailyHistoryPlan;
  /** CoinGecko HTTP calls this read made (full = 7, incremental = 2, none = 0). */
  calls: number;
  /** True when the held bars changed (new candle or re-sync). */
  changed: boolean;
  warnings: string[];
}

const FULL_CALLS = WORKER_DAILY_WINDOWS + 1;
const INCREMENT_CALLS = 2;

/**
 * Full daily series kept in THIS process at once. Planning metadata (last open, fullAt, checkedAt) stays for every
 * coin; the bar arrays are reloaded from `load` (Redis) when the next indicator pass needs them. One series is about
 * 1,080 bars — holding the whole universe was the worker's steady heap. The persisted entry is still the full window.
 */
export const MAX_RESIDENT_DAILY_SERIES = 1;

interface DailyHistoryMeta {
  coinId: string;
  fullAt: number;
  checkedAt: number;
  /** Open time of the newest bar, so a plan can be made after the array has been released. */
  lastOpenMs: number;
  barCount: number;
}

export class CryptoDailyHistoryCache {
  /** Clock + last-open for every coin. Small. */
  private readonly meta = new Map<string, DailyHistoryMeta>();
  /** Full bar arrays currently on the heap. Capped by `maxResidentSeries`. */
  private readonly bars = new Map<string, Bar[]>();
  private readonly residentOrder: string[] = [];
  private readonly loaded = new Set<string>();
  /** Coin whose bars must survive eviction for the in-flight read. */
  private pin: string | null = null;

  constructor(
    private readonly deps: DailyHistoryDeps,
    private readonly cfg: DailyHistoryConfig = DEFAULT_DAILY_HISTORY_CONFIG,
    private readonly maxResidentSeries = MAX_RESIDENT_DAILY_SERIES,
  ) {}

  /** Resident full series, for tests and a memory gauge. Metadata-only coins are not counted. */
  residentSeriesCount(): number {
    return this.bars.size;
  }

  holdsBars(coinId: string): boolean {
    return this.bars.has(coinId);
  }

  /** Drop every in-process bar array. Metadata stays, so the next read reloads persistence instead of refetching. */
  releaseBarPayloads(): void {
    this.bars.clear();
    this.residentOrder.length = 0;
  }

  peek(coinId: string): DailyHistoryEntry | undefined {
    const meta = this.meta.get(coinId);
    const bars = this.bars.get(coinId);
    if (!meta || !bars) return undefined;
    return { coinId: meta.coinId, bars, fullAt: meta.fullAt, checkedAt: meta.checkedAt };
  }

  private remember(entry: DailyHistoryEntry, keepBars: boolean): void {
    const lastOpenMs = entry.bars.length ? Date.parse(entry.bars[entry.bars.length - 1].t) : Number.NaN;
    this.meta.set(entry.coinId, {
      coinId: entry.coinId,
      fullAt: entry.fullAt,
      checkedAt: entry.checkedAt,
      lastOpenMs,
      barCount: entry.bars.length,
    });
    if (keepBars && entry.bars.length) this.retain(entry.coinId, entry.bars);
  }

  private retain(coinId: string, bars: Bar[]): void {
    this.bars.set(coinId, bars);
    const at = this.residentOrder.indexOf(coinId);
    if (at >= 0) this.residentOrder.splice(at, 1);
    this.residentOrder.push(coinId);
    const cap = Math.max(1, Math.floor(this.maxResidentSeries) || 1);
    while (this.bars.size > cap) {
      const victim = this.residentOrder.find((id) => id !== this.pin && this.bars.has(id));
      if (!victim) break;
      this.bars.delete(victim);
      const i = this.residentOrder.indexOf(victim);
      if (i >= 0) this.residentOrder.splice(i, 1);
    }
  }

  private entryFrom(coinId: string, bars: Bar[]): DailyHistoryEntry | null {
    const meta = this.meta.get(coinId);
    if (!meta) return null;
    return { coinId, bars, fullAt: meta.fullAt, checkedAt: meta.checkedAt };
  }

  private async readStored(coinId: string): Promise<DailyHistoryEntry | null> {
    if (!this.deps.load) return null;
    try {
      const stored = await this.deps.load(coinId);
      if (isDailyHistoryEntry(stored) && stored.coinId === coinId && stored.bars.length) return stored;
    } catch (err) {
      this.deps.log?.(`daily history load failed for ${coinId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }

  private async hydrate(coinId: string): Promise<void> {
    if (this.loaded.has(coinId)) return;
    this.loaded.add(coinId);
    if (this.meta.has(coinId) || !this.deps.load) return;
    const stored = await this.readStored(coinId);
    if (stored) this.remember(stored, true);
  }

  /** Bars for a compute. Resident copy if we still have it, otherwise the persisted full window. */
  private async ensureBars(coinId: string): Promise<Bar[] | null> {
    const resident = this.bars.get(coinId);
    if (resident?.length) return resident;
    const stored = await this.readStored(coinId);
    if (!stored) return null;
    if (!this.meta.has(coinId)) this.remember(stored, false);
    this.retain(coinId, stored.bars);
    return stored.bars;
  }

  private async persist(entry: DailyHistoryEntry): Promise<void> {
    if (!this.deps.save) return;
    try { await this.deps.save(entry); } catch (err) {
      this.deps.log?.(`daily history save failed for ${entry.coinId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getBars(symbol: string, coinId: string): Promise<DailyHistoryResult> {
    const now = (this.deps.now ?? Date.now)();
    this.pin = coinId;
    try {
      await this.hydrate(coinId);
      const meta = this.meta.get(coinId);
      const planEntry = meta && meta.barCount > 0 && Number.isFinite(meta.lastOpenMs)
        ? {
            coinId,
            bars: [{ t: new Date(meta.lastOpenMs).toISOString(), open: 0, high: 0, low: 0, close: 0, volume: null }],
            fullAt: meta.fullAt,
            checkedAt: meta.checkedAt,
          }
        : undefined;
      let plan = planDailyHistoryFetch(planEntry, now, this.cfg);

      if (plan === 'none') {
        const held = await this.ensureBars(coinId);
        const entry = held ? this.entryFrom(coinId, held) : null;
        if (!entry) {
          plan = 'full';
        } else {
          const bars = trimDailyWindow(entry.bars, now);
          if (bars.length !== entry.bars.length) this.remember({ ...entry, bars }, true);
          return { bars, plan, calls: 0, changed: false, warnings: [] };
        }
      }

      if (plan === 'incremental') {
        const held = await this.ensureBars(coinId);
        const entry = held ? this.entryFrom(coinId, held) : null;
        if (!entry) {
          plan = 'full';
        } else {
          const lastOpen = Date.parse(entry.bars[entry.bars.length - 1].t);
          try {
            const inc = await this.deps.fetchIncrement(coinId, lastOpen, now);
            if (inc) {
              const bars = mergeDailyHistory(entry.bars, inc.bars, inc.volumes, now);
              const newLast = bars.length ? Date.parse(bars[bars.length - 1].t) : lastOpen;
              const next: DailyHistoryEntry = { ...entry, bars, checkedAt: now };
              this.remember(next, true);
              const changed = newLast > lastOpen || bars.length !== entry.bars.length || inc.bars.length > 0;
              if (newLast > lastOpen) await this.persist(next);
              return { bars, plan, calls: INCREMENT_CALLS, changed, warnings: inc.warnings };
            }
            plan = 'full'; // gap too long for one window
          } catch (err) {
            // Keep serving the held history (at most one candle behind) and retry after retryMs.
            this.remember({ ...entry, checkedAt: now }, true);
            this.deps.log?.(`daily increment failed for ${symbol} (${coinId}): ${err instanceof Error ? err.message : String(err)}`);
            return { bars: trimDailyWindow(entry.bars, now), plan, calls: INCREMENT_CALLS, changed: false, warnings: ['incremental daily fetch failed; serving held history'] };
          }
        }
      }

      // Full fetch. Indicators still see this whole window; only other coins' arrays are dropped.
      try {
        const full = await this.deps.fetchFull(symbol, coinId, now);
        const prior = this.meta.get(coinId);
        if (!full.bars.length) {
          if (prior && prior.barCount > 0) {
            this.meta.set(coinId, { ...prior, checkedAt: now });
            const held = await this.ensureBars(coinId);
            return { bars: held ? trimDailyWindow(held, now) : [], plan: 'full', calls: FULL_CALLS, changed: false, warnings: full.warnings };
          }
          return { bars: [], plan: 'full', calls: FULL_CALLS, changed: false, warnings: full.warnings };
        }
        const next: DailyHistoryEntry = { coinId, bars: full.bars, fullAt: now, checkedAt: now };
        this.remember(next, true);
        await this.persist(next);
        return { bars: full.bars, plan: 'full', calls: FULL_CALLS, changed: true, warnings: full.warnings };
      } catch (err) {
        const prior = this.meta.get(coinId);
        if (prior && prior.barCount > 0) {
          this.meta.set(coinId, { ...prior, checkedAt: now });
          const held = await this.ensureBars(coinId);
          if (held) return { bars: trimDailyWindow(held, now), plan: 'full', calls: FULL_CALLS, changed: false, warnings: ['full daily fetch failed; serving held history'] };
        }
        throw err;
      }
    } finally {
      if (this.pin === coinId) this.pin = null;
    }
  }
}
