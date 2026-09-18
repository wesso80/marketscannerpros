/**
 * Theme clustering — groups before names. Equities cluster by sector/industry (sector-ETF map,
 * cached AV OVERVIEW); crypto by CoinGecko category membership. A "genuine group move" needs breadth.
 */
import type { Features, Scored } from './types';

export interface Theme {
  name: string; assetClass: 'equity' | 'crypto'; members: number; up: number; pctUp: number; medianRet1: number; medianRs5: number | null;
  withNewFlags: number; volumeBroad: number; early: string[]; extended: string[]; leaders: string[]; laggards: string[];
  confirmation: string; verdict: 'GENUINE_GROUP_MOVE' | 'PARTIAL' | 'ISOLATED' | 'GROUP_WEAKNESS'; fundingCrowded: boolean | null;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function buildThemes(scored: Scored[], opts: { industryOf: (sym: string) => string | null; btc24h: number | null; eth24h: number | null; minMembers?: number }): Theme[] {
  const groups = new Map<string, { cls: 'equity' | 'crypto'; items: Scored[] }>();
  const add = (k: string, cls: 'equity' | 'crypto', s: Scored) => { if (!groups.has(k)) groups.set(k, { cls, items: [] }); groups.get(k)!.items.push(s); };
  for (const s of scored) {
    const f = s.f;
    if (f.assetClass === 'crypto') { for (const c of f.crypto?.categories ?? []) add(c, 'crypto', s); continue; }
    if (f.assetClass === 'etf') continue;
    if (f.sector) add(f.sector, 'equity', s);
    const ind = opts.industryOf(f.symbol); if (ind && ind !== f.sector) add(ind, 'equity', s);
  }
  const min = opts.minMembers ?? 4;
  const themes: Theme[] = [];
  for (const [name, g] of groups) {
    if (g.items.length < min) continue;
    const fresh = g.items.filter((s) => s.f.dataQuality.fresh); if (fresh.length < min) continue;
    const up = fresh.filter((s) => s.f.ret1 > 0).length, pctUp = (up / fresh.length) * 100;
    const med1 = median(fresh.map((s) => s.f.ret1));
    const rs = fresh.map((s) => s.f.rsBench5).filter((x): x is number => x !== null);
    const withNew = fresh.filter((s) => s.f.flags.some((x) => x.startsWith('NEW_') && !x.includes('WEAK') && !x.includes('LOSS') && !x.includes('BREAKDOWN'))).length;
    const volBroad = fresh.filter((s) => (s.f.volRatio ?? 0) >= 1.3).length;
    const early = fresh.filter((s) => (s.f.extensionAtr ?? 0) < 1.5 && (s.f.ret5Atr ?? 0) < 2.5 && s.f.now.aboveE50).map((s) => s.f.symbol);
    const extended = fresh.filter((s) => (s.f.extensionAtr ?? 0) > 2.5 || (s.f.ret5Atr ?? 0) > 3).map((s) => s.f.symbol);
    const sorted = [...fresh].sort((a, b) => (b.f.rsBench5 ?? -99) - (a.f.rsBench5 ?? -99));
    const fund = g.cls === 'crypto' ? fresh.map((s) => s.f.crypto?.fundingMedianPct).filter((x): x is number => x !== null && x !== undefined) : [];
    const fundingCrowded = g.cls === 'crypto' && fund.length ? median(fund) > 0.05 : g.cls === 'crypto' ? null : null;
    let verdict: Theme['verdict'];
    if (pctUp >= 70 && med1 > 0 && (withNew / fresh.length >= 0.3 || volBroad / fresh.length >= 0.3)) verdict = 'GENUINE_GROUP_MOVE';
    else if (pctUp <= 30 && med1 < 0) verdict = 'GROUP_WEAKNESS';
    else if (pctUp >= 55 && med1 > 0) verdict = 'PARTIAL';
    else verdict = 'ISOLATED';
    const conf = g.cls === 'crypto'
      ? `BTC ${opts.btc24h === null ? 'n/a' : (opts.btc24h > 0 ? '+' : '') + opts.btc24h.toFixed(1) + '%'} / ETH ${opts.eth24h === null ? 'n/a' : (opts.eth24h > 0 ? '+' : '') + opts.eth24h.toFixed(1) + '%'} ${med1 > (Math.max(opts.btc24h ?? 0, opts.eth24h ?? 0)) ? '— group outpacing majors' : '— majors leading the group'}${fundingCrowded === null ? '' : fundingCrowded ? '; funding CROWDED' : '; funding neutral'}`
      : `${volBroad}/${fresh.length} members ≥1.3× volume; ${withNew} with fresh structural flags`;
    themes.push({ name, assetClass: g.cls, members: fresh.length, up, pctUp, medianRet1: med1, medianRs5: rs.length ? median(rs) : null, withNewFlags: withNew, volumeBroad: volBroad, early: early.slice(0, 8), extended: extended.slice(0, 8), leaders: sorted.slice(0, 4).map((s) => s.f.symbol), laggards: sorted.slice(-3).map((s) => s.f.symbol), confirmation: conf, verdict, fundingCrowded });
  }
  return themes.sort((a, b) => (b.verdict === 'GENUINE_GROUP_MOVE' ? 1 : 0) - (a.verdict === 'GENUINE_GROUP_MOVE' ? 1 : 0) || Math.abs(b.medianRet1) - Math.abs(a.medianRet1));
}

export function themeOf(f: Features, themes: Theme[]): Theme | null {
  if (f.assetClass === 'crypto') return themes.find((t) => t.assetClass === 'crypto' && f.crypto?.categories.includes(t.name)) ?? null;
  return themes.find((t) => t.assetClass === 'equity' && t.name === f.sector) ?? null;
}
