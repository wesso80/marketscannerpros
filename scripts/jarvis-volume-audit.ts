/**
 * Volume-multiple audit for a session: persisted-snapshot distribution + a bounded live re-fetch sample.
 *   npx tsx scripts/jarvis-volume-audit.ts 2026-09-18
 * Read-only; ~25 Alpha Vantage calls.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
process.env.ALPHA_VANTAGE_RPM ??= '120';

const SAMPLE = ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'JPM', 'XOM', 'PFE', 'KO', 'HD', 'CAT', 'GOOGL', 'GILD', 'TWLO', 'HALO', 'COIN', 'CZR', 'ACA', 'GM', 'OHI', 'TMUS', 'CSCO', 'ABBV', 'ORCL'];

async function main() {
  const session = process.argv[2];
  const { loadRunBySession } = await import('../lib/jarvis/radar/store');
  const { avFetchDailyBars } = await import('../lib/marketData/client');
  const run = await loadRunBySession(session);
  if (!run) throw new Error('no run');
  const snap = run.snapshot as Record<string, { volRatio: number | null; price: number }>;
  const eq = Object.entries(snap).filter(([k, v]) => k.startsWith('equity:') && v.volRatio !== null).map(([k, v]) => ({ symbol: k.slice(7), vr: v.volRatio as number }));
  const vrs = eq.map((e) => e.vr).sort((a, b) => a - b);
  const pct = (p: number) => vrs[Math.min(vrs.length - 1, Math.floor((p / 100) * vrs.length))];
  const dup = new Set<string>(); let dups = 0; for (const e of eq) { if (dup.has(e.symbol)) dups++; dup.add(e.symbol); }
  console.log(`== persisted snapshot ${session}: ${eq.length} equity/ETF entries with volRatio (duplicates: ${dups}) ==`);
  console.log(`median ${pct(50).toFixed(2)}× · p75 ${pct(75).toFixed(2)}× · p90 ${pct(90).toFixed(2)}× · p95 ${pct(95).toFixed(2)}× · share ≥2×: ${(100 * vrs.filter((v) => v >= 2).length / vrs.length).toFixed(1)}% · share ≥1.5×: ${(100 * vrs.filter((v) => v >= 1.5).length / vrs.length).toFixed(1)}%`);
  const prev = await loadRunBySession('2026-09-17');
  if (prev) {
    const pv = Object.entries(prev.snapshot as Record<string, any>).filter(([k, v]) => k.startsWith('equity:') && v.volRatio !== null).map(([, v]) => v.volRatio as number).sort((a, b) => a - b);
    const pp = (p: number) => pv[Math.min(pv.length - 1, Math.floor((p / 100) * pv.length))];
    console.log(`   vs 2026-09-17: median ${pp(50).toFixed(2)}× · p75 ${pp(75).toFixed(2)}× · p90 ${pp(90).toFixed(2)}× · p95 ${pp(95).toFixed(2)}× · share ≥2×: ${(100 * pv.filter((v) => v >= 2).length / pv.length).toFixed(1)}%`);
  }
  console.log(`\n== live re-fetch (${SAMPLE.length} AV calls) — formula: vol[last] / mean(vol[last-20..last-1]) ==`);
  console.log('symbol | last bar | volume | baseline mean (20 prior bars, window) | multiple | run snapshot | 5d mean/20d mean | max single-day in window');
  const rows: any[] = [];
  for (const s of SAMPLE) {
    const r = await avFetchDailyBars(s, false);
    if (!r || r.bars.length < 22) { console.log(`${s} | unavailable`); continue; }
    const bars = r.bars.filter((b) => b.date <= session);
    const lastBar = bars[bars.length - 1];
    const win = bars.slice(-21, -1);
    const base = win.reduce((a, b) => a + b.volume, 0) / win.length;
    const m = lastBar.volume / base;
    const mean5 = bars.slice(-5).reduce((a, b) => a + b.volume, 0) / 5;
    const maxWin = Math.max(...win.map((b) => b.volume));
    const snapVr = snap[`equity:${s}`]?.volRatio ?? null;
    const splitHint = win.some((b, i) => i > 0 && Math.abs(b.close / win[i - 1].close - 1) > 0.4) ? ' SPLIT?' : '';
    rows.push({ s, m });
    console.log(`${s.padEnd(6)} | ${lastBar.date} | ${lastBar.volume.toLocaleString().padStart(13)} | ${Math.round(base).toLocaleString().padStart(13)} (${win[0].date}→${win[win.length - 1].date}) | ${m.toFixed(2)}× | ${snapVr === null ? 'n/a' : snapVr.toFixed(2) + '×'} | ${(mean5 / base).toFixed(2)} | ${(maxWin / base).toFixed(2)}×${splitHint}`);
  }
  const ms = rows.map((r) => r.m).sort((a, b) => a - b);
  console.log(`\nsample median multiple ${ms[Math.floor(ms.length / 2)].toFixed(2)}× · ≥2×: ${ms.filter((m) => m >= 2).length}/${ms.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
