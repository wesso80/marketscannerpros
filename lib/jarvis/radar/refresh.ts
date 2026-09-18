/**
 * Second pass before the owner reads the report: refresh only crypto (price, volume, funding, OI,
 * dominance, breadth, categories) against the latest persisted overnight run. No equity calls.
 */
import { loadCategories, loadCryptoMarkets, loadDerivatives } from './collect';
import { budget, resetBudget } from './budget';
import type { MorningReport } from './types';

const sp = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

export async function refreshCrypto(report: MorningReport, nowMs: number): Promise<{ lines: string[]; material: boolean; snapshotPatch: MorningReport['snapshot'] }> {
  resetBudget();
  const rows = await loadCryptoMarkets(250);
  if (!rows.length) return { lines: ['CoinGecko unavailable — crypto section not refreshed (values below are from the overnight run).'], material: false, snapshotPatch: {} };
  const syms = rows.map((r) => r.symbol.toUpperCase());
  const [derivs, cats] = await Promise.all([loadDerivatives(syms), loadCategories()]);
  const bySym = new Map(rows.map((r) => [r.symbol.toUpperCase(), r]));
  const btc = bySym.get('BTC'), eth = bySym.get('ETH');
  const alts = rows.filter((r) => !['BTC', 'ETH'].includes(r.symbol.toUpperCase()));
  const breadth = (rows.filter((r) => r.price_change_percentage_24h > 0).length / rows.length) * 100;
  const altMed = median(alts.map((r) => r.price_change_percentage_24h).filter(Number.isFinite));
  const totalMcap = rows.reduce((s, r) => s + (r.market_cap || 0), 0);
  const btcDom = btc && totalMcap ? (btc.market_cap / totalMcap) * 100 : null;
  const lines: string[] = [];
  let material = false;
  const prevB = report.rotation.crypto.breadth24h ?? 0;
  lines.push(`Since the overnight run (${report.generatedAt.slice(11, 16)}Z → ${new Date(nowMs).toISOString().slice(11, 16)}Z): BTC ${sp(btc?.price_change_percentage_24h, 1)} 24h, ETH ${sp(eth?.price_change_percentage_24h, 1)}, alt median ${sp(altMed, 1)}; breadth ${breadth.toFixed(0)}% up (was ${prevB.toFixed(0)}%); BTC share of top-250 ${btcDom === null ? 'n/a' : btcDom.toFixed(1) + '%'}.`);
  if (Math.abs(breadth - prevB) >= 15) { material = true; lines.push(`MATERIAL: crypto breadth moved ${breadth > prevB ? 'up' : 'down'} ${Math.abs(breadth - prevB).toFixed(0)}pp overnight.`); }
  const patch: MorningReport['snapshot'] = {};
  const watch = new Set([...report.shortlist.filter((c) => c.assetClass === 'crypto').map((c) => c.symbol), ...report.settingUp.filter((s) => s.assetClass === 'crypto').map((s) => s.symbol)]);
  for (const sym of watch) {
    const r = bySym.get(sym), snap = report.snapshot[`crypto:${sym}`], d = derivs[sym];
    if (!r || !snap) { lines.push(`${sym}: no longer in CoinGecko top-250 or missing from snapshot.`); continue; }
    const sinceRun = snap.price ? ((r.current_price - snap.price) / snap.price) * 100 : null;
    const fundΔ = d?.fundingMedianPct != null && snap.funding != null ? d.fundingMedianPct - snap.funding : null;
    const oiΔ = d?.openInterestUsd && snap.oi ? ((d.openInterestUsd - snap.oi) / snap.oi) * 100 : null;
    const bits = [`${sym}: ${sp(sinceRun, 1)} since run (24h ${sp(r.price_change_percentage_24h, 1)})`];
    if (fundΔ !== null && Math.abs(fundΔ) > 0.01) bits.push(`funding ${fundΔ > 0 ? '+' : ''}${fundΔ.toFixed(3)}pp → ${(d!.fundingMedianPct as number).toFixed(4)}%`);
    if (oiΔ !== null && Math.abs(oiΔ) > 3) bits.push(`OI ${sp(oiΔ, 1)}`);
    const flag = (sinceRun !== null && Math.abs(sinceRun) >= 5) || (d?.fundingMedianPct != null && Math.abs(d.fundingMedianPct) > 0.05) || (oiΔ !== null && Math.abs(oiΔ) > 10);
    if (flag) { material = true; bits.push('← MATERIAL'); }
    lines.push(bits.join(' · '));
    patch[`crypto:${sym}`] = { ...snap, funding: d?.fundingMedianPct ?? snap.funding, oi: d?.openInterestUsd ?? snap.oi, price: r.current_price };
  }
  const up = [...cats].sort((a, b) => b.change24h - a.change24h).slice(0, 4), dn = [...cats].sort((a, b) => a.change24h - b.change24h).slice(0, 3);
  lines.push(`Categories now: up ${up.map((c) => `${c.name} ${sp(c.change24h)}`).join(', ')}; down ${dn.map((c) => `${c.name} ${sp(c.change24h)}`).join(', ')}.`);
  lines.push(`Refresh cost: ${budget.cg} CoinGecko calls, 0 Alpha Vantage calls.`);
  return { lines, material, snapshotPatch: patch };
}
