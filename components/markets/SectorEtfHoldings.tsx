'use client';
/**
 * MV-6: what is inside each sector ETF — top holdings and sector weights from Alpha Vantage ETF_PROFILE
 * (/api/sectors/etf-profile, cached server-side). Shows "Unavailable (reason)" when the profile cannot be loaded.
 */
import { useEffect, useState } from 'react';
import type { EtfProfileResult } from '@/lib/etf/etfProfile';
import { formatNetAssets } from '@/lib/etf/etfProfileText';

export default function SectorEtfHoldings({ etfs }: { etfs: Array<{ symbol: string; name: string }> }) {
  const [selected, setSelected] = useState<string | null>(etfs[0]?.symbol ?? null);
  const [profiles, setProfiles] = useState<Record<string, EtfProfileResult | { status: 'error'; reason: string }>>({});

  useEffect(() => {
    if (!selected && etfs[0]) setSelected(etfs[0].symbol);
  }, [etfs, selected]);

  useEffect(() => {
    if (!selected || profiles[selected]) return;
    let cancelled = false;
    fetch(`/api/sectors/etf-profile?symbol=${encodeURIComponent(selected)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        setProfiles((p) => ({ ...p, [selected]: r.ok ? (j as EtfProfileResult) : { status: 'error', reason: j?.error || `HTTP ${r.status}` } }));
      })
      .catch((e) => { if (!cancelled) setProfiles((p) => ({ ...p, [selected]: { status: 'error', reason: e instanceof Error ? e.message : 'network error' } })); });
    return () => { cancelled = true; };
  }, [selected, profiles]);

  if (!etfs.length) return null;
  const prof = selected ? profiles[selected] : undefined;
  const name = etfs.find((e) => e.symbol === selected)?.name ?? '';

  return (
    <section className="mt-4 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-4" aria-label="Sector ETF holdings">
      <h3 className="text-sm font-semibold text-white mb-1">Inside the sector ETFs</h3>
      <p className="text-[11px] text-slate-500 mb-3">Top holdings and sector weights from Alpha Vantage ETF_PROFILE, to see which companies drive each sector tile. For research only.</p>
      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Choose a sector ETF">
        {etfs.map((e) => (
          <button
            key={e.symbol}
            type="button"
            role="tab"
            aria-selected={e.symbol === selected}
            onClick={() => setSelected(e.symbol)}
            title={e.name}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold border focus:outline-none focus:ring-1 focus:ring-emerald-400/60 ${e.symbol === selected ? 'border-emerald-400/60 text-emerald-300 bg-emerald-500/10' : 'border-[var(--msp-border)] text-slate-300 hover:border-slate-500'}`}
          >
            {e.symbol}
          </button>
        ))}
      </div>
      {!prof && <div className="text-xs text-slate-500 animate-pulse">Loading {selected} holdings…</div>}
      {prof && prof.status !== 'ok' && <div className="text-xs text-slate-500">{selected}{name ? ` (${name})` : ''}: Unavailable ({prof.reason})</div>}
      {prof && prof.status === 'ok' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">Top {prof.topHoldings.length} holdings{prof.topHoldingsWeightPct != null ? ` · ${prof.topHoldingsWeightPct.toFixed(1)}% of the fund` : ''}</div>
            {prof.topHoldings.length === 0 ? <div className="text-xs text-slate-500">No holdings listed.</div> : (
              <ul className="space-y-1 text-xs">
                {prof.topHoldings.map((h) => (
                  <li key={h.symbol || h.name} className="flex items-center gap-2">
                    <span className="w-12 font-semibold text-white">{h.symbol || '—'}</span>
                    <span className="flex-1 truncate text-slate-400" title={h.name}>{h.name}</span>
                    <span className="w-24 h-1.5 rounded bg-slate-800 overflow-hidden" aria-hidden><span className="block h-full bg-emerald-500/70" style={{ width: `${Math.min(100, (h.weightPct / (prof.topHoldings[0]?.weightPct || 1)) * 100)}%` }} /></span>
                    <span className="w-14 text-right font-mono text-slate-300">{h.weightPct.toFixed(2)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">Sector weights</div>
            {prof.sectors.length === 0 ? <div className="text-xs text-slate-500">No sector breakdown listed.</div> : (
              <ul className="space-y-1 text-xs">
                {prof.sectors.slice(0, 8).map((s) => (
                  <li key={s.sector} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-slate-300">{s.sector}</span>
                    <span className="w-24 h-1.5 rounded bg-slate-800 overflow-hidden" aria-hidden><span className="block h-full bg-sky-500/70" style={{ width: `${Math.min(100, s.weightPct)}%` }} /></span>
                    <span className="w-12 text-right font-mono text-slate-300">{s.weightPct.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-[10px] text-slate-500">
              {[
                prof.netAssets != null ? `Net assets ${formatNetAssets(prof.netAssets)}` : null,
                prof.expenseRatioPct != null ? `expense ratio ${prof.expenseRatioPct.toFixed(2)}%` : null,
                `${prof.holdingsCount} holdings`,
                prof.lastUpdated ? `updated ${prof.lastUpdated}` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
