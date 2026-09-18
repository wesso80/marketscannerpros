/**
 * Private Jarvis persistence: Postgres (jarvis_runs / jarvis_watchlist / jarvis_kv) when DATABASE_URL is
 * set, mirrored to .jarvis-data/ locally so the owner can read history without a DB client.
 * Nothing here is reachable from public routes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { q } from '../../db';
import type { MorningReport } from './types';

const DATA_DIR = path.resolve(process.cwd(), '.jarvis-data');
const hasDb = () => !!process.env.DATABASE_URL;
const fileSafe = (k: string) => k.replace(/[^A-Za-z0-9_.:-]/g, '_');
/** pg returns DATE columns as a JS Date at *local* midnight — format with local getters, never toISOString. */
const dateStr = (v: unknown): string => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));

function writeFileMirror(rel: string, data: unknown) {
  try { const p = path.join(DATA_DIR, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); } catch { /* mirror is best-effort */ }
}
function readFileMirror<T>(rel: string): T | null {
  try { const p = path.join(DATA_DIR, rel); return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null; } catch { return null; }
}

// ───────────────────────────── Runs ─────────────────────────────

export interface RunRecord { runKey: string; generatedAt: string; sessionDate: string; kind: 'overnight' | 'crypto_refresh'; report: MorningReport; markdown: string; snapshot: MorningReport['snapshot']; apiUsage: Record<string, number>; runtimeMs: number }

export async function saveRun(r: RunRecord): Promise<void> {
  writeFileMirror(`runs/${fileSafe(r.runKey)}.json`, r);
  if (!hasDb()) return;
  await q(`INSERT INTO jarvis_runs (run_key, generated_at, session_date, kind, report, markdown, snapshot, api_usage, runtime_ms)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9)
           ON CONFLICT (run_key) DO UPDATE SET generated_at = EXCLUDED.generated_at, report = EXCLUDED.report, markdown = EXCLUDED.markdown, snapshot = EXCLUDED.snapshot, api_usage = EXCLUDED.api_usage, runtime_ms = EXCLUDED.runtime_ms`,
    [r.runKey, r.generatedAt, r.sessionDate, r.kind, JSON.stringify(r.report), r.markdown, JSON.stringify(r.snapshot), JSON.stringify(r.apiUsage), r.runtimeMs]);
}

/** Most recent overnight runs, newest first (excludes crypto refreshes). */
export async function loadRecentRuns(limit = 25): Promise<Array<Pick<RunRecord, 'runKey' | 'generatedAt' | 'sessionDate' | 'snapshot'>>> {
  if (hasDb()) {
    try {
      const rows = await q<any>(`SELECT run_key, generated_at, session_date, snapshot FROM jarvis_runs WHERE kind = 'overnight' ORDER BY session_date DESC, generated_at DESC LIMIT $1`, [limit]);
      return rows.map((r: any) => ({ runKey: r.run_key, generatedAt: new Date(r.generated_at).toISOString(), sessionDate: dateStr(r.session_date), snapshot: r.snapshot }));
    } catch { /* fall back to files */ }
  }
  try {
    const dir = path.join(DATA_DIR, 'runs');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('refresh')).sort().reverse().slice(0, limit)
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RunRecord)
      .map((r) => ({ runKey: r.runKey, generatedAt: r.generatedAt, sessionDate: r.sessionDate, snapshot: r.snapshot }));
  } catch { return []; }
}

export async function loadLatestRun(): Promise<RunRecord | null> {
  if (hasDb()) {
    try {
      const rows = await q<any>(`SELECT * FROM jarvis_runs WHERE kind = 'overnight' ORDER BY session_date DESC, generated_at DESC LIMIT 1`);
      if (rows[0]) { const r = rows[0]; return { runKey: r.run_key, generatedAt: new Date(r.generated_at).toISOString(), sessionDate: dateStr(r.session_date), kind: r.kind, report: r.report, markdown: r.markdown, snapshot: r.snapshot, apiUsage: r.api_usage, runtimeMs: r.runtime_ms }; }
    } catch { /* fall back */ }
  }
  const runs = await loadRecentRuns(1);
  return runs[0] ? readFileMirror<RunRecord>(`runs/${fileSafe(runs[0].runKey)}.json`) : null;
}

// ───────────────────────────── Watchlist ─────────────────────────────

export type WatchStatus = 'NEW' | 'DEVELOPING' | 'NEAR_TRIGGER' | 'CONFIRMED_MOVE' | 'FAILED' | 'DETERIORATING' | 'EXPIRED';
export interface WatchEntry {
  key: string; symbol: string; assetClass: string; status: WatchStatus; firstSeen: string; lastSeen: string; sessionsSeen: number; origin: 'shortlist' | 'premove' | 'deteriorating';
  state: { history: Array<{ date: string; status: WatchStatus; note: string }>; metrics: Record<string, number | string | null>; triggerLevel: number | null; invalidationLevel: number | null; note: string };
}

export async function loadWatchlist(): Promise<WatchEntry[]> {
  if (hasDb()) {
    try {
      const rows = await q<any>(`SELECT * FROM jarvis_watchlist`);
      return rows.map((r: any) => ({ key: r.key, symbol: r.symbol, assetClass: r.asset_class, status: r.status, firstSeen: dateStr(r.first_seen), lastSeen: dateStr(r.last_seen), sessionsSeen: r.sessions_seen, origin: r.origin, state: r.state }));
    } catch { /* fall back */ }
  }
  return readFileMirror<WatchEntry[]>('watchlist.json') ?? [];
}

export async function saveWatchlist(entries: WatchEntry[]): Promise<void> {
  writeFileMirror('watchlist.json', entries);
  if (!hasDb()) return;
  for (const e of entries) {
    await q(`INSERT INTO jarvis_watchlist (key, symbol, asset_class, status, first_seen, last_seen, sessions_seen, origin, state, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
             ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, last_seen = EXCLUDED.last_seen, sessions_seen = EXCLUDED.sessions_seen, state = EXCLUDED.state, updated_at = NOW()`,
      [e.key, e.symbol, e.assetClass, e.status, e.firstSeen, e.lastSeen, e.sessionsSeen, e.origin, JSON.stringify(e.state)]);
  }
}

// ───────────────────────────── KV (overview cache, run markers) ─────────────────────────────

export async function kvGet<T>(key: string): Promise<T | null> {
  if (hasDb()) { try { const rows = await q<any>(`SELECT value FROM jarvis_kv WHERE key = $1`, [key]); if (rows[0]) return rows[0].value as T; } catch { /* fall back */ } }
  return readFileMirror<T>(`kv/${fileSafe(key)}.json`);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  writeFileMirror(`kv/${fileSafe(key)}.json`, value);
  if (!hasDb()) return;
  await q(`INSERT INTO jarvis_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, JSON.stringify(value)]);
}

export interface OverviewCacheEntry { sector: string | null; industry: string | null; marketCap: number | null; beta: number | null; high52w: number | null; low52w: number | null; name: string | null; fetchedAt: string }
export type OverviewCache = Record<string, OverviewCacheEntry>;
export const OVERVIEW_CACHE_KEY = 'overview_cache_v1';
export const OVERVIEW_TTL_MS = 30 * 86400e3;
