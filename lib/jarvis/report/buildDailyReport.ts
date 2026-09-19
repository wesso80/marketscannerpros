/**
 * Build the Daily Market Intelligence Report from a completed persisted Jarvis run.
 * Pure transformation: no provider calls, no re-scoring. Every figure comes from the run payload
 * or the persisted watchlist lifecycle.
 */
import type { MorningReport, Scored } from '../radar/types';
import type { WatchEntry, WatchStatus } from '../radar/store';
import { evaluateHealth, stage2Coverage } from './reportHealth';
import type { AttentionItem, BuildInputs, CandidateRow, DailyReport, Extension, LifecycleSection, LifecycleTransition, MarketLine, MoverLine, NextMoveRow, RejectedRow, ThemeRow, ThemesSection, WhatMoved } from './types';
import { DISCLAIMER, REPORT_VERSION } from './types';

const sp = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`);
const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));
const lvl = (v: number | null) => (v === null ? 'n/a' : v >= 1 ? v.toFixed(2) : v.toPrecision(4));
const STATUSES: WatchStatus[] = ['NEW', 'DEVELOPING', 'NEAR_TRIGGER', 'CONFIRMED_MOVE', 'FAILED', 'DETERIORATING', 'EXPIRED'];

export function extensionOf(earlyOrExtended: string): Extension {
  const u = earlyOrExtended.toUpperCase();
  if (u.startsWith('EXTENDED')) return 'EXTENDED';
  if (u.startsWith('MID')) return 'MID';
  if (u.startsWith('EARLY')) return 'EARLY';
  return 'n/a';
}

const SIGNIFICANCE: Record<string, number> = { 'NEAR_TRIGGER>CONFIRMED_MOVE': 10, 'DEVELOPING>CONFIRMED_MOVE': 9, 'NEW>CONFIRMED_MOVE': 8, 'DEVELOPING>NEAR_TRIGGER': 7, 'NEW>NEAR_TRIGGER': 6, 'NEAR_TRIGGER>FAILED': 6, 'CONFIRMED_MOVE>FAILED': 6, 'DEVELOPING>FAILED': 5, 'NEAR_TRIGGER>DETERIORATING': 5, 'DEVELOPING>DETERIORATING': 5, 'CONFIRMED_MOVE>DETERIORATING': 5, 'NEW>FAILED': 4, 'DETERIORATING>DEVELOPING': 4, 'NEW>DEVELOPING': 3 };

/** Lifecycle transitions for a session, read from persisted watchlist history (not from report text). */
export function lifecycleFromWatchlist(watchlist: WatchEntry[], sessionDate: string): LifecycleSection {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<WatchStatus, number>;
  const transitions: LifecycleTransition[] = [];
  for (const e of watchlist) {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
    const h = e.state?.history ?? [];
    for (let i = 0; i < h.length; i++) {
      if (h[i].date !== sessionDate) continue;
      const from = i > 0 ? h[i - 1].status : null;
      const to = h[i].status;
      if (from === to) continue;
      transitions.push({ symbol: e.symbol, assetClass: e.assetClass, from, to, note: h[i].note, significance: SIGNIFICANCE[`${from ?? 'NEW'}>${to}`] ?? (from === null ? 1 : 2) });
    }
  }
  transitions.sort((a, b) => b.significance - a.significance || a.symbol.localeCompare(b.symbol));
  return { counts, transitions, highlights: transitions.filter((t) => t.significance >= 4).slice(0, 10), source: 'jarvis_watchlist' };
}

function mover(s: Scored, detail: string): MoverLine { return { symbol: s.f.symbol, assetClass: s.f.assetClass, change: sp(s.f.ret1, 2), detail }; }

function buildWhatMoved(r: MorningReport): WhatMoved {
  const fresh = (s: Scored) => s.f.dataQuality.fresh && s.f.assetClass !== 'etf';
  const eq = [...r.biggestChanges, ...r.newStrength, ...r.newWeakness, ...r.unusual].filter((s) => fresh(s) && s.f.assetClass === 'equity');
  const uniq = (list: Scored[]) => { const seen = new Set<string>(); return list.filter((s) => (seen.has(s.f.symbol) ? false : (seen.add(s.f.symbol), true))); };
  const strength = uniq(r.newStrength.filter((s) => s.f.assetClass === 'equity')).slice(0, 6).map((s) => mover(s, `${s.opportunityType ?? s.status} · vol ${s.f.volRatio === null ? 'n/a' : f1(s.f.volRatio) + '×'} · score ${s.score}`));
  const weakness = uniq(r.newWeakness.filter((s) => s.f.assetClass === 'equity')).slice(0, 6).map((s) => mover(s, `${s.f.flags.filter((x) => /BREAKDOWN|LOSS|LOW|WEAK/.test(x)).join(', ') || s.status} · vol ${s.f.volRatio === null ? 'n/a' : f1(s.f.volRatio) + '×'}`));
  const unusualVolume = uniq(eq.filter((s) => (s.f.volRatio ?? 0) >= 2.5)).sort((a, b) => (b.f.volRatio ?? 0) - (a.f.volRatio ?? 0)).slice(0, 6).map((s) => mover(s, `${f1(s.f.volRatio)}× 20d volume · ${s.status}`));
  const gaps = uniq(eq.filter((s) => s.f.flags.includes('GAP_UP') || s.f.flags.includes('GAP_DOWN'))).slice(0, 6).map((s) => mover(s, `gap ${sp(s.f.gapPct, 2)} · ${s.f.flags.includes('GAP_UP') ? 'up' : 'down'}`));
  const breakouts = uniq(eq.filter((s) => s.f.flags.includes('NEW_BREAKOUT') || s.f.flags.includes('NEW_HIGH'))).slice(0, 6).map((s) => mover(s, `new 20d high ${lvl(s.f.now.hi20)} · ${s.status}`));
  const breakdowns = uniq(eq.filter((s) => s.f.flags.includes('NEW_BREAKDOWN') || s.f.flags.includes('NEW_LOW'))).slice(0, 6).map((s) => mover(s, `new 20d low ${lvl(s.f.now.lo20)} · ${s.status}`));
  const b = r.rotation.breadth.equities;
  const cr = [...r.biggestChanges, ...r.newStrength, ...r.unusual].filter((s) => fresh(s) && s.f.assetClass === 'crypto');
  const c = r.rotation.crypto;
  return {
    equities: { strength, weakness, unusualVolume, gaps, breakouts, breakdowns, breadth: `${b.up}/${b.total} up · ${b.newHi20} new 20d highs vs ${b.newLo20} new lows · ${b.volSurge} names ≥2× volume · ${b.aboveE50}/${b.total} above EMA50` },
    crypto: {
      context: `BTC ${sp(c.btc24h, 1)} / ETH ${sp(c.eth24h, 1)} (24h); 7d BTC ${sp(c.btc7d)} / ETH ${sp(c.eth7d)}; ${c.leader24h} leading 24h, ${c.leader7d} over 7d`,
      altBreadth: `alt median ${sp(c.altMedian24h, 1)} 24h / ${sp(c.altMedian7d)} 7d · ${f1(c.breadth24h, 0)}% of top-250 up 24h, ${f1(c.breadth7d, 0)}% up 7d`,
      movers: uniq(cr).sort((a, b2) => Math.abs(b2.f.ret1) - Math.abs(a.f.ret1)).slice(0, 8).map((s) => mover(s, `${s.status}${s.rejection.length ? ' — ' + s.rejection.join(', ') : ''} · vol ${s.f.volRatio === null ? 'n/a' : f1(s.f.volRatio) + '×'}`)),
      unusual: uniq(cr.filter((s) => s.f.flags.includes('NEW_DERIVATIVES_ACTIVITY') || (s.f.crypto?.turnoverVsMedian ?? 0) > 3 || (s.f.volRatio ?? 0) >= 3)).slice(0, 6).map((s) => mover(s, `turnover ${f1(s.f.crypto?.turnoverVsMedian)}× median${s.f.crypto?.oiChangePct != null ? ` · OI ${sp(s.f.crypto.oiChangePct)}` : ''}${s.f.crypto?.fundingMedianPct != null ? ` · funding ${s.f.crypto.fundingMedianPct.toFixed(4)}%` : ''}`)),
    },
    crossAsset: [...r.whatMoved.rates, ...r.whatMoved.fx, ...r.whatMoved.commodities].map((line) => { const i = line.indexOf(') '); return { label: i > 0 ? line.slice(0, i + 1) : line, value: i > 0 ? line.slice(i + 2) : '' }; }),
  };
}

function buildThirty(r: MorningReport): MarketLine[] {
  const c = r.rotation.crypto, b = r.rotation.breadth.equities, x = r.rotation.crossAsset;
  const find = (sym: string) => [...r.whatMoved.rates, ...r.whatMoved.fx, ...r.whatMoved.commodities].find((l) => l.includes(`(${sym})`))?.split(') ')[1]?.split(' · ')[0] ?? 'n/a';
  const spyLine = r.thirtySeconds.whatMoved.match(/SPY ([+-]?\d+\.\d+%)/)?.[1] ?? 'n/a';
  const pairVal = (p: string) => x.find((y) => y.pair === p)?.reading.split(' → ')[1] ?? 'n/a';
  return [
    { label: 'Equities', value: `SPY ${spyLine} · ${b.up}/${b.total} up · ${b.newHi20} new 20d highs vs ${b.newLo20} lows · ${b.volSurge} names ≥2× volume` },
    { label: 'Crypto', value: `BTC ${sp(c.btc24h, 1)} / ETH ${sp(c.eth24h, 1)} · alt median ${sp(c.altMedian24h, 1)} · ${f1(c.breadth24h, 0)}% up 24h, ${f1(c.breadth7d, 0)}% up 7d · ${c.leader24h} leading` },
    { label: 'Sectors', value: `5d RS leaders ${r.rotation.strongToday.join(', ')}${r.rotation.newlyStrengthened.length ? ` · newly strengthening ${r.rotation.newlyStrengthened.join('/')}` : ''}${r.rotation.lostLeadership.length ? ` · losing ${r.rotation.lostLeadership.join('/')}` : ''}` },
    { label: 'Growth vs defensive', value: `growth vs broad: ${pairVal('Growth vs broad')} · defensive vs growth: ${pairVal('Defensive vs growth')} · small vs large: ${pairVal('Small vs large caps')}` },
    { label: 'Rates / duration', value: `TLT ${find('TLT')} · IEF ${find('IEF')} · HY ${find('HYG')} vs IG ${find('LQD')}` },
    { label: 'Volatility', value: `VXX ${find('VXX')} · ${r.counts.meaningfulMovers} meaningful movers, ${r.counts.unusual} unusual` },
    { label: 'Dollar', value: `UUP ${find('UUP')} · JPY ${find('FXY')} · EUR ${find('FXE')}` },
    { label: 'Metals / commodities', value: `Gold ${find('GLD')} · Silver ${find('SLV')} · Copper ${find('CPER')} · Oil ${find('USO')}` },
    { label: 'Themes', value: r.themes.filter((t) => t.verdict === 'GENUINE_GROUP_MOVE').slice(0, 4).map((t) => `${t.name} ${t.members > 0 ? `${Math.round((t.pctUp / 100) * t.members)}/${t.members}` : ''} ${sp(t.medianRet1, 1)}`).join('; ') || 'no genuine group move' },
  ];
}

function buildCandidates(r: MorningReport, wl: Map<string, WatchEntry>): CandidateRow[] {
  return r.shortlist.slice(0, 10).map((c) => ({
    rank: c.rank, symbol: c.symbol, name: c.name, assetClass: c.assetClass, setupType: c.opportunityType ?? c.status, score: c.score, extension: extensionOf(c.earlyOrExtended),
    ret1: c.ret1, ret5: c.ret5, velocity: c.velocity.slice(0, 2).join(' '), whySurfaced: c.whyFlagged, caveat: c.conflicting[0] ?? c.whatWouldReduceInterest.split(';')[0], catalyst: c.catalyst.startsWith('none') ? 'none identified' : c.catalyst.split(' | ')[0],
    lifecycle: wl.get(`${c.assetClass === 'crypto' ? 'crypto' : 'equity'}:${c.symbol}`)?.status ?? null,
  }));
}

function buildNext(r: MorningReport, wl: Map<string, WatchEntry>): NextMoveRow[] {
  const order = { NEAR_TRIGGER: 0, DEVELOPING: 1, EARLY_STAGE: 2 } as Record<string, number>;
  return [...r.settingUp].sort((a, b) => (order[a.stage] ?? 9) - (order[b.stage] ?? 9) || b.score - a.score).slice(0, 12).map((s) => {
    const e = wl.get(`${s.assetClass === 'crypto' ? 'crypto' : 'equity'}:${s.symbol}`);
    const price = e?.state?.metrics?.price as number | undefined;
    const dist = s.triggerLevel !== null && price ? ((s.triggerLevel - price) / price) * 100 : (typeof s.distToHi20Pct === 'number' ? -s.distToHi20Pct : null);
    const inval = e?.state?.invalidationLevel ?? null;
    return { symbol: s.symbol, assetClass: s.assetClass, score: s.score, stage: s.stage, lifecycle: e?.status ?? null, triggerLevel: s.triggerLevel, distanceToTriggerPct: dist === null ? null : Math.round(dist * 10) / 10, reasons: s.signals.slice(0, 4), confirmation: `Requires a close above ${lvl(s.triggerLevel)} with volume ≥1.5× 20d average${s.assetClass === 'crypto' ? ' and funding staying neutral' : ''}.`, invalidation: inval !== null ? `Setup weakens on a close below ${lvl(inval)} (EMA50 / 20d low reference).${s.penalties.length ? ' Caveat: ' + s.penalties.join('; ') : ''}` : s.penalties.length ? `Caveat: ${s.penalties.join('; ')}` : 'No penalty flags recorded.' };
  });
}

function buildThemes(r: MorningReport): ThemesSection {
  const row = (t: MorningReport['themes'][number]): ThemeRow => ({ name: t.name, members: t.members, up: Math.round((t.pctUp / 100) * t.members), pctUp: t.pctUp, medianMove: sp(t.medianRet1, 1), verdict: t.verdict, confirmation: t.confirmation, early: t.early, extended: t.extended });
  const eqRows = r.themes.filter((t) => t.assetClass === 'equity').map(row), crRows = r.themes.filter((t) => t.assetClass === 'crypto').map(row);
  const sectors = r.rotation.sectors;
  return {
    equity: { leading: sectors.slice(0, 3).map((s) => `${s.ticker} ${s.label} (RS5 ${sp(s.rs5)})`), improving: r.rotation.newlyStrengthened.map((t) => { const s = sectors.find((x) => x.ticker === t); return s ? `${t} ${s.label} (rank ${s.rank20Prev} → ${s.rank5})` : t; }), deteriorating: r.rotation.lostLeadership.map((t) => { const s = sectors.find((x) => x.ticker === t); return s ? `${t} ${s.label} (rank ${s.rank20Prev} → ${s.rank5})` : t; }), groups: eqRows },
    crypto: { context: `${r.rotation.crypto.leader24h} leading 24h; categories up: ${r.rotation.crypto.categoriesUp.slice(0, 4).map((c) => `${c.name} ${sp(c.change24h)}`).join(', ')}; down: ${r.rotation.crypto.categoriesDown.slice(0, 3).map((c) => `${c.name} ${sp(c.change24h)}`).join(', ')}`, groups: crRows },
  };
}

function buildLookAtFirst(r: MorningReport, next: NextMoveRow[], lifecycle: LifecycleSection): AttentionItem[] {
  const out: AttentionItem[] = [];
  const genuineEq = r.themes.filter((t) => t.assetClass === 'equity' && t.verdict === 'GENUINE_GROUP_MOVE').sort((a, b) => b.members - a.members)[0];
  if (genuineEq) out.push({ kind: 'theme', title: `${genuineEq.name} group move`, why: `${Math.round((genuineEq.pctUp / 100) * genuineEq.members)}/${genuineEq.members} members up (median ${sp(genuineEq.medianRet1, 1)}); early names ${genuineEq.early.slice(0, 4).join(', ') || 'none'} — a group move is more informative than any single mover.` });
  else if (r.rotation.newlyStrengthened.length) out.push({ kind: 'theme', title: `${r.rotation.newlyStrengthened.join('/')} newly strengthening`, why: 'Sector RS rank jumped into the top 4 this week — check whether the rotation persists.' });
  const top = r.shortlist.find((c) => c.direction === 'up' && extensionOf(c.earlyOrExtended) !== 'EXTENDED');
  if (top) out.push({ kind: 'setup', title: `${top.symbol} — highest-quality single name (${top.opportunityType ?? top.status}, score ${top.score})`, why: `${top.whyFlagged.split(';').slice(0, 2).join(';')}. ${top.earlyOrExtended}. Watch: ${top.whatToWatchNext}` });
  const nt = next.filter((n) => n.stage === 'NEAR_TRIGGER').slice(0, 3);
  if (nt.length) out.push({ kind: 'trigger', title: `NEAR_TRIGGER setups: ${nt.map((n) => n.symbol).join(', ')}`, why: nt.map((n) => `${n.symbol} ${n.distanceToTriggerPct === null ? '' : `${n.distanceToTriggerPct > 0 ? n.distanceToTriggerPct.toFixed(1) + '% below' : Math.abs(n.distanceToTriggerPct).toFixed(1) + '% above'} ${lvl(n.triggerLevel)}`} (${n.reasons[0] ?? ''})`).join('; ') + '. Compression resolving with volume is the confirmation to look for.' });
  const genuineCr = r.themes.filter((t) => t.assetClass === 'crypto' && t.verdict === 'GENUINE_GROUP_MOVE');
  if (genuineCr.length) out.push({ kind: 'crypto', title: `Crypto theme: ${genuineCr.slice(0, 3).map((t) => t.name).join(', ')}`, why: `${genuineCr[0].confirmation}. 7d breadth ${f1(r.rotation.crypto.breadth7d, 0)}% — does participation hold above 60% or was the 24h reading (${f1(r.rotation.crypto.breadth24h, 0)}%) the high-water mark?` });
  const confirmed = lifecycle.highlights.filter((t) => t.to === 'CONFIRMED_MOVE');
  const failed = lifecycle.highlights.filter((t) => t.to === 'FAILED' || t.to === 'DETERIORATING');
  if (confirmed.length || failed.length) out.push({ kind: 'risk', title: 'Lifecycle changes worth noting', why: [confirmed.length ? `${confirmed.map((t) => t.symbol).join(', ')} moved to CONFIRMED_MOVE` : '', failed.length ? `${failed.map((t) => t.symbol).join(', ')} failed/deteriorated` : ''].filter(Boolean).join('; ') + ' — persisted watchlist history, not inference.' });
  const rej = r.rejected.filter((x) => x.reasons.includes('PARABOLIC')).length;
  if (rej >= 3 && out.length < 5) out.push({ kind: 'risk', title: `${rej} parabolic movers rejected`, why: 'A high count of parabolic micro-cap moves is a speculative-froth reading; it is not a candidate list.' });
  return out.slice(0, 5);
}

function buildNoise(r: MorningReport): string[] {
  const by = (reason: string) => r.rejected.filter((x) => x.reasons.includes(reason as never)).slice(0, 5).map((x) => `${x.symbol} ${sp(x.ret1, 1)}`);
  const out: string[] = [];
  const para = by('PARABOLIC'); if (para.length) out.push(`Parabolic micro-caps: ${para.join(', ')} — already extended, late not early.`);
  const thin = by('THIN_LIQUIDITY'); if (thin.length) out.push(`Low-liquidity spikes: ${thin.join(', ')} — below the liquidity floor.`);
  const ext = r.shortlist.filter((c) => extensionOf(c.earlyOrExtended) === 'EXTENDED').map((c) => `${c.symbol} (${c.earlyOrExtended.split(' — ')[1] ?? ''})`); if (ext.length) out.push(`Already very extended setups: ${ext.join(', ')} — quality names, poor location.`);
  const beta = by('BETA_ONLY'); if (beta.length) out.push(`Broad-beta moves lacking idiosyncratic evidence: ${beta.join(', ')}.`);
  if ((r.rotation.crypto.breadth24h ?? 0) >= 80) out.push(`Crypto 24h breadth ${f1(r.rotation.crypto.breadth24h, 0)}% — individual alt gains in line with the median (${sp(r.rotation.crypto.altMedian24h, 1)}) are beta, not alpha.`);
  return out;
}

export function buildDailyReport(inp: BuildInputs): DailyReport {
  const r = inp.run.report;
  const health = evaluateHealth(r, { runtimeMs: inp.run.runtimeMs, apiErrors: r?.apiUsage?.errors ?? inp.run.apiUsage.errors ?? 0 });
  const wl = new Map(inp.watchlist.map((e) => [e.key, e]));
  const lifecycle = lifecycleFromWatchlist(inp.watchlist, inp.run.sessionDate);
  const cov = stage2Coverage(r);
  const next = buildNext(r, wl);
  const candidates = buildCandidates(r, wl);
  const lookAtFirst = buildLookAtFirst(r, next, lifecycle);
  const genuine = r.themes.filter((t) => t.verdict === 'GENUINE_GROUP_MOVE');
  const b = r.rotation.breadth.equities;
  const headline = health.status === 'NORMAL'
    ? `${b.up}/${b.total} equities up, ${r.counts.finalShortlist} research candidates${genuine.length ? `, ${genuine.length} genuine group move${genuine.length > 1 ? 's' : ''} (${genuine.slice(0, 2).map((t) => t.name).join(', ')})` : ''}, ${next.filter((n) => n.stage === 'NEAR_TRIGGER').length} setups near trigger`
    : `MSP RADAR DATA HEALTH WARNING — ${health.summary}`;
  const sectorCache = r.providers.find((p) => /Sector\/industry cache|OVERVIEW sector cache/.test(p.name))?.detail ?? null;
  const api = r.apiUsage;
  return {
    version: REPORT_VERSION, sessionDate: inp.run.sessionDate, generatedAt: new Date().toISOString(), headline,
    status: health.status === 'NORMAL' ? 'COMPLETE' : health.status === 'DEGRADED' ? 'DEGRADED' : 'FAILED', health,
    run: { runKey: inp.run.runKey, sessionDate: inp.run.sessionDate, generatedAt: inp.run.generatedAt, runtimeMs: inp.run.runtimeMs, apiUsage: { alphaVantage: api.alphaVantage, coingecko: api.coingecko, dbQueries: api.dbQueries, errors: api.errors, peakRssMb: (inp.run.apiUsage.peakRssMb as number | undefined) ?? null, equityCap: (inp.run.apiUsage.equityCap as number | undefined) ?? null } },
    marketIn30Seconds: buildThirty(r), whatMoved: buildWhatMoved(r), candidates, whatMayMoveNext: next, lifecycle, themes: buildThemes(r),
    rejected: r.rejected.slice(0, 12).map((x): RejectedRow => ({ symbol: x.symbol, assetClass: x.assetClass, change: sp(x.ret1, 1), reasons: x.reasons, detail: x.detail.join('; ') })),
    lookAtFirst, probablyNoise: buildNoise(r),
    dataHealth: { universe: r.counts.universe, equities: r.counts.equities, crypto: r.counts.crypto, etfs: r.counts.other, stage1Listed: r.counts.stage1Listed, stage1Quoted: r.counts.stage1Quoted, liquid: r.counts.stage1Liquid, stage2Selected: cov.selected, stage2Live: cov.live, stage2Fallback: cov.fallback, stage2Missing: cov.missing, coveragePct: cov.pct, deepDives: r.counts.deepDives, alphaVantageCalls: api.alphaVantage, coingeckoCalls: api.coingecko, dbQueries: api.dbQueries, providerErrors: api.errors, runtimeMs: api.runtimeMs, peakRssMb: (inp.run.apiUsage.peakRssMb as number | undefined) ?? null, sectorCacheCoverage: sectorCache, providers: r.providers, gaps: r.dataGaps },
    disclaimer: DISCLAIMER,
  };
}

/** Report for a run whose payload could not be read at all. */
export function buildFailedReport(sessionDate: string, runKey: string | null, reason: string): DailyReport {
  const health = evaluateHealth(null, { runtimeMs: 0, apiErrors: 0 });
  health.checks[0].detail = reason;
  const empty: LifecycleSection = { counts: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<WatchStatus, number>, transitions: [], highlights: [], source: 'jarvis_watchlist' };
  return {
    version: REPORT_VERSION, sessionDate, generatedAt: new Date().toISOString(), headline: `MSP RADAR DATA HEALTH WARNING — run for ${sessionDate} failed: ${reason}`, status: 'FAILED', health,
    run: { runKey: runKey ?? 'n/a', sessionDate, generatedAt: new Date().toISOString(), runtimeMs: 0, apiUsage: { alphaVantage: 0, coingecko: 0, dbQueries: 0, errors: 0, peakRssMb: null, equityCap: null } },
    marketIn30Seconds: [{ label: 'Status', value: `No completed MSP Radar run for ${sessionDate}: ${reason}` }], whatMoved: { equities: { strength: [], weakness: [], unusualVolume: [], gaps: [], breakouts: [], breakdowns: [], breadth: 'unavailable' }, crypto: { context: 'unavailable', altBreadth: 'unavailable', movers: [], unusual: [] }, crossAsset: [] },
    candidates: [], whatMayMoveNext: [], lifecycle: empty, themes: { equity: { leading: [], improving: [], deteriorating: [], groups: [] }, crypto: { context: 'unavailable', groups: [] } }, rejected: [], lookAtFirst: [], probablyNoise: [],
    dataHealth: { universe: 0, equities: 0, crypto: 0, etfs: 0, stage1Listed: 0, stage1Quoted: 0, liquid: 0, stage2Selected: null, stage2Live: null, stage2Fallback: null, stage2Missing: null, coveragePct: null, deepDives: 0, alphaVantageCalls: 0, coingeckoCalls: 0, dbQueries: 0, providerErrors: 0, runtimeMs: 0, peakRssMb: null, sectorCacheCoverage: null, providers: [], gaps: [reason] },
    disclaimer: DISCLAIMER,
  };
}
