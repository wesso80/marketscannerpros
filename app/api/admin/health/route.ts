/**
 * GET /api/admin/health — Centralised admin health aggregator.
 *
 * Returns a single JSON snapshot covering:
 *   - Database connectivity + latency
 *   - Alpha Vantage + CoinGecko provider posture
 *   - Last evening packet generation
 *   - FRED macro ingest freshness
 *   - AI signal volume (24h) + last AI usage row
 *   - Active kill switches across workspaces
 *
 * Each section carries its own `status` (ok | warn | error | unknown) and a
 * human-readable note. The top-level `status` is the worst of all sections.
 *
 * Admin-only. Dependency failures are reported without raw error details.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { hasCoinGeckoApiKey } from '@/lib/coingecko';
import { q } from '@/lib/db';
import { discoveryOnlyAction } from '@/lib/admin/discoveryOnly';
import { readHealthOperations } from '@/lib/admin/healthOverview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Status = 'ok' | 'warn' | 'error' | 'unknown';

interface Section {
  status: Status;
  note: string;
  data?: Record<string, unknown>;
}

const STATUS_RANK: Record<Status, number> = { ok: 0, unknown: 1, warn: 2, error: 3 };
function worst(...statuses: Status[]): Status {
  return statuses.reduce<Status>((acc, s) => (STATUS_RANK[s] > STATUS_RANK[acc] ? s : acc), 'ok');
}

async function checkDatabase(): Promise<Section> {
  const started = Date.now();
  try {
    await q('SELECT 1');
    const latencyMs = Date.now() - started;
    return {
      status: latencyMs > 1000 ? 'warn' : 'ok',
      note: `db ping ${latencyMs}ms`,
      data: { latencyMs },
    };
  } catch {
    return { status: 'error', note: 'db unreachable. Details withheld.' };
  }
}

async function checkProviders(): Promise<Section> {
  return { status: 'unknown', note: 'Configuration only; provider reachability and quota are not tested.',
    data: { alphaVantageConfigured: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
      coinGeckoConfigured: hasCoinGeckoApiKey() } };
}

async function checkEveningPacket(): Promise<Section> {
  try {
    const rows = await q<{ date_iso: string; generated_at: Date; count: string }>(
      `SELECT date_iso, MAX(generated_at) AS generated_at, COUNT(*)::text AS count
       FROM evening_packets
       GROUP BY date_iso
       ORDER BY date_iso DESC
       LIMIT 1`,
    );
    if (!rows.length) return { status: 'warn', note: 'no evening packets recorded' };
    const r = rows[0];
    const ageHours = (Date.now() - new Date(r.generated_at).getTime()) / 36e5;
    const paused = discoveryOnlyAction('/api/cron/evening-packet') === 'skip_job';
    const status: Status = paused || ageHours < 0 ? 'unknown' : ageHours > 36 ? 'error' : ageHours > 28 ? 'warn' : 'ok';
    return {
      status,
      note: `${paused ? 'Job paused by web configuration; stored ' : ''}last ${r.date_iso} (${ageHours.toFixed(1)}h ago, ${r.count} workspaces)`,
      data: { lastDate: r.date_iso, generatedAt: new Date(r.generated_at).toISOString(), workspaces: Number(r.count), ageHours },
    };
  } catch {
    return { status: 'unknown', note: 'evening_packets table unavailable. Details withheld.' };
  }
}

async function checkMacroIngest(): Promise<Section> {
  try {
    const rows = await q<{ last_obs: Date | null; series_count: string }>(
      `SELECT MAX(obs_date)::timestamptz AS last_obs, COUNT(DISTINCT series_id)::text AS series_count
       FROM macro_series`,
    );
    const r = rows[0];
    if (!r?.last_obs) return { status: 'warn', note: 'no macro observations yet' };
    const ageHours = (Date.now() - new Date(r.last_obs).getTime()) / 36e5;
    // Observation dates are not ingestion timestamps; mixed series have different release cadences.
    const status: Status = 'unknown';
    return {
      status,
      note: `${Number(r.series_count)} series · newest observation (not ingest time) ${(ageHours / 24).toFixed(1)}d old`,
      data: { lastObs: new Date(r.last_obs).toISOString(), seriesCount: Number(r.series_count), ageHours },
    };
  } catch {
    return { status: 'unknown', note: 'macro_series unavailable. Details withheld.' };
  }
}

async function checkAiSignals(): Promise<Section> {
  try {
    const rows = await q<{ count_24h: string; last_signal: Date | null }>(
      `SELECT COUNT(*)::text AS count_24h, MAX(signal_at) AS last_signal
       FROM ai_signal_log
       WHERE signal_at >= NOW() - INTERVAL '24 hours'`,
    );
    const r = rows[0];
    if (!r || r.count_24h == null) return { status: 'unknown', note: 'Signal count unavailable' };
    const count = Number(r.count_24h);
    const lastAgeMin = r?.last_signal ? (Date.now() - new Date(r.last_signal).getTime()) / 60000 : null;
    const status: Status = count === 0 ? 'warn' : 'ok';
    return {
      status,
      note: `${count} signals/24h${lastAgeMin != null ? ` · last ${lastAgeMin.toFixed(0)}m ago` : ''}`,
      data: { count24h: count, lastSignalAt: r?.last_signal ? new Date(r.last_signal).toISOString() : null },
    };
  } catch {
    return { status: 'unknown', note: 'ai_signal_log unavailable. Details withheld.' };
  }
}

async function checkKillSwitches(): Promise<Section> {
  try {
    const rows = await q<{ active: string; latest: Date | null }>(
      `SELECT COUNT(*)::text AS active, MAX(kill_switch_set_at) AS latest
       FROM workspace_settings
       WHERE kill_switch_enabled = TRUE`,
    );
    if (!rows[0] || rows[0].active == null) return { status: 'unknown', note: 'Kill switch count unavailable' };
    const active = Number(rows[0].active);
    if (active === 0) return { status: 'ok', note: 'no kill switches active', data: { active: 0 } };
    return {
      status: 'warn',
      note: `${active} workspace(s) with kill switch ON`,
      data: { active, latest: rows[0]?.latest ? new Date(rows[0].latest).toISOString() : null },
    };
  } catch {
    return { status: 'unknown', note: 'workspace_settings unavailable. Details withheld.' };
  }
}

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };
  const auth = await requireAdmin(req).catch(() => null);
  if (!auth?.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers });
  }
  const started = Date.now();
  const [database, providers, eveningPacket, macroIngest, aiSignals, killSwitches, operations] = await Promise.all([
    checkDatabase(),
    checkProviders(),
    checkEveningPacket(),
    checkMacroIngest(),
    checkAiSignals(),
    checkKillSwitches(),
    readHealthOperations(auth.workspaceId),
  ]);

  const overall = worst(
    database.status,
    providers.status,
    eveningPacket.status,
    macroIngest.status,
    aiSignals.status,
    killSwitches.status,
  );

  return NextResponse.json({
    ok: true,
    overall,
    operations,
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    sections: {
      database,
      providers,
      eveningPacket,
      macroIngest,
      aiSignals,
      killSwitches,
    },
  }, { headers });
}
