/**
 * Worker-side daily crypto history: fetch the ~360-bar CoinGecko daily history ONCE, then only the missing bars once
 * per UTC day (after the new candle is published), instead of re-reading 360 days on every tier refresh.
 *
 * The worker only uses COMPLETED daily bars (the open bar is dropped by fetchCryptoSeries), so between two UTC day
 * closes the history it gets from CoinGecko is the same every time; re-fetching it every 10–120 minutes spent ~3
 * CoinGecko calls per coin per refresh (≈12.7k calls/day for 100 coins) for identical data.
 *
 * Readers see the same data shape: the bars are exactly what a full `fetchCryptoSeries(…, 'daily')` returns (the same
 * ~360-day window, trimmed as days pass). A full re-sync runs every `fullResyncMs` (default 7 days) to pick up any
 * candle CoinGecko revised further back than the 2-day overlap of the incremental read.
 *
 * Pure logic + injected fetchers/persistence so it is unit-testable without CoinGecko, Redis or Postgres.
 */
import type { Bar } from '@/lib/scanner/barAggregation';
import { attachDailyVolumes } from '@/lib/scanner/barAggregation';
import { cryptoRequestAnchors } from '@/lib/scanner/cryptoBars';

export const DAY_MS = 86_400_000;
/** Bars a default full daily fetch holds: 2 × 180-day windows → opens from (today − 360 d) to yesterday. */
export const DAILY_HISTORY_DAYS = 360;

export interface DailyHistoryEntry {
  coinId: string;
  /** Completed daily bars, ascending by open time (`t`). */
  bars: Bar[];
  /** Last full (360-day) fetch, epoch ms. */
  fullAt: number;
  /** Last fetch attempt of any kind, epoch ms (spaces retries while CoinGecko has not published the new candle). */
  checkedAt: number;
}

export interface DailyHistoryConfig {
  /** Time after 00:00 UTC before the just-closed candle is expected (CoinGecko publishes daily OHLC ~00:35 UTC). */
  settleMs: number;
  /** Minimum spacing between incremental attempts when the expected candle is still missing. */
  retryMs: number;
  /** Full 360-day re-sync interval. */
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
 * Keep the same window a fresh full fetch returns: bars opening on or after (00:00 UTC today − 360 d), i.e. daily
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
  /** CoinGecko HTTP calls this read made (full = 3, incremental = 2, none = 0). */
  calls: number;
  /** True when the held bars changed (new candle or re-sync). */
  changed: boolean;
  warnings: string[];
}

const FULL_CALLS = 3;
const INCREMENT_CALLS = 2;

export class CryptoDailyHistoryCache {
  private readonly entries = new Map<string, DailyHistoryEntry>();
  private readonly loaded = new Set<string>();

  constructor(private readonly deps: DailyHistoryDeps, private readonly cfg: DailyHistoryConfig = DEFAULT_DAILY_HISTORY_CONFIG) {}

  peek(coinId: string): DailyHistoryEntry | undefined {
    return this.entries.get(coinId);
  }

  private async hydrate(coinId: string): Promise<void> {
    if (this.loaded.has(coinId) || this.entries.has(coinId) || !this.deps.load) { this.loaded.add(coinId); return; }
    this.loaded.add(coinId);
    try {
      const stored = await this.deps.load(coinId);
      if (isDailyHistoryEntry(stored) && stored.coinId === coinId && stored.bars.length) this.entries.set(coinId, stored);
    } catch (err) {
      this.deps.log?.(`daily history load failed for ${coinId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async persist(entry: DailyHistoryEntry): Promise<void> {
    if (!this.deps.save) return;
    try { await this.deps.save(entry); } catch (err) {
      this.deps.log?.(`daily history save failed for ${entry.coinId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getBars(symbol: string, coinId: string): Promise<DailyHistoryResult> {
    const now = (this.deps.now ?? Date.now)();
    await this.hydrate(coinId);
    const entry = this.entries.get(coinId);
    let plan = planDailyHistoryFetch(entry, now, this.cfg);

    if (plan === 'none') {
      const bars = trimDailyWindow(entry!.bars, now);
      if (bars.length !== entry!.bars.length) this.entries.set(coinId, { ...entry!, bars });
      return { bars, plan, calls: 0, changed: false, warnings: [] };
    }

    if (plan === 'incremental') {
      const lastOpen = Date.parse(entry!.bars[entry!.bars.length - 1].t);
      try {
        const inc = await this.deps.fetchIncrement(coinId, lastOpen, now);
        if (inc) {
          const bars = mergeDailyHistory(entry!.bars, inc.bars, inc.volumes, now);
          const newLast = bars.length ? Date.parse(bars[bars.length - 1].t) : lastOpen;
          const next: DailyHistoryEntry = { ...entry!, bars, checkedAt: now };
          this.entries.set(coinId, next);
          const changed = newLast > lastOpen || bars.length !== entry!.bars.length || inc.bars.length > 0;
          if (newLast > lastOpen) await this.persist(next);
          return { bars, plan, calls: INCREMENT_CALLS, changed, warnings: inc.warnings };
        }
        plan = 'full'; // gap too long for one window
      } catch (err) {
        // Keep serving the held history (at most one candle behind) and retry after retryMs.
        this.entries.set(coinId, { ...entry!, checkedAt: now });
        this.deps.log?.(`daily increment failed for ${symbol} (${coinId}): ${err instanceof Error ? err.message : String(err)}`);
        return { bars: trimDailyWindow(entry!.bars, now), plan, calls: INCREMENT_CALLS, changed: false, warnings: ['incremental daily fetch failed; serving held history'] };
      }
    }

    // Full fetch.
    try {
      const full = await this.deps.fetchFull(symbol, coinId, now);
      if (!full.bars.length) {
        if (entry) {
          this.entries.set(coinId, { ...entry, checkedAt: now });
          return { bars: trimDailyWindow(entry.bars, now), plan: 'full', calls: FULL_CALLS, changed: false, warnings: full.warnings };
        }
        return { bars: [], plan: 'full', calls: FULL_CALLS, changed: false, warnings: full.warnings };
      }
      const next: DailyHistoryEntry = { coinId, bars: full.bars, fullAt: now, checkedAt: now };
      this.entries.set(coinId, next);
      await this.persist(next);
      return { bars: full.bars, plan: 'full', calls: FULL_CALLS, changed: true, warnings: full.warnings };
    } catch (err) {
      if (entry) {
        this.entries.set(coinId, { ...entry, checkedAt: now });
        return { bars: trimDailyWindow(entry.bars, now), plan: 'full', calls: FULL_CALLS, changed: false, warnings: ['full daily fetch failed; serving held history'] };
      }
      throw err;
    }
  }
}
