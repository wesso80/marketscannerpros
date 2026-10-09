'use client';
import { useCopilotSection } from '@/lib/ai/useCopilotSection';

import { useCallback, useEffect, useState } from 'react';
import type { PublicOptionsEvidence } from '@/lib/research/publicOptionsScan';
import { ResearchFold, ResearchMetric, researchDate, researchLabel, researchNumber, researchPrice, researchReason, researchTime, selectedExpirySummary } from '@/components/terminal/researchPresentation';

/**
 * Options chain evidence for one symbol and expiry (W3; replaces the Options setup scanner, product decision 8 Oct).
 * Shows only what the chain measures: open interest, put/call, max pain, ATM IV, expected move, volume against open
 * interest and the chain's data quality, each with its basis. No grade, direction, strategy, strike pick or trade level.
 */
export default function OptionsChainEvidence({ symbol, expiry, embeddedInTerminal }: { symbol: string; expiry?: string | null; timeframe?: string | null; embeddedInTerminal?: boolean }) {
  const publishEvidence=useCopilotSection('options',symbol);
  const [data, setData] = useState<PublicOptionsEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!symbol.trim()) return;
    setLoading(true); setError(null); publishEvidence(null);
    try {
      const res = await fetch(`/api/research/options?${new URLSearchParams({symbol:symbol.trim().toUpperCase(),...(expiry?{expiry}:{})})}`, { signal });
      const json = await res.json().catch(() => null);
      if (signal?.aborted) return;
      if (!res.ok || !json?.success || !json.data) { setData(null); setError(json?.error || 'Options evidence request failed'); return; }
      setData(json.data as PublicOptionsEvidence); publishEvidence(json.copilotEvidenceToken);
    } catch (e) {
      if (!signal?.aborted) { setData(null); setError(e instanceof Error ? e.message : 'Options evidence request failed'); }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [symbol, expiry, publishEvidence]);

  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);

  const d = data, oi = d?.openInterest, iv = d?.impliedVolatility, em = d?.expectedMove, vo = d?.volumeVsOpenInterest;
  const status = loading ? `Loading options evidence for ${symbol}` : error ? 'Options evidence not collected' : !d ? `No options evidence for ${symbol} yet` : d.chain.expiry ? `${d.symbol} options chain, ${researchDate(d.chain.expiry)} expiry` : `${d.symbol}: no usable options chain`;
  return (
    <section data-options-evidence className={`min-w-0 space-y-3 text-slate-200 ${embeddedInTerminal ? '' : 'p-1'}`}>
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
        <p data-research-verdict className="break-words text-lg font-semibold">{status}</p>
        <p className="mt-2 text-xs text-slate-400">Measured chain evidence only: no check, direction, strategy or trade levels. Chains can be thin or delayed; each figure states its basis.</p>
        {error && <p role="alert" className="mt-2 break-words text-sm text-amber-300">{researchReason(error)}</p>}
        {d && (
          <dl className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-4">
            <ResearchMetric label="Underlying" value={`${researchPrice(d.underlying.price)}${d.underlying.asOf ? ` · ${researchTime(d.underlying.asOf)}` : ''}`} />
            <ResearchMetric label="Selected expiry" value={selectedExpirySummary({ selectedExpiry: expiry ?? '', analyzedExpiry: d.chain.expiry ?? '' })} />
            <ResearchMetric label="Expiry analysed" value={d.chain.expiry ? `${researchDate(d.chain.expiry)}${d.chain.daysToExpiry != null ? ` (${d.chain.daysToExpiry} DTE)` : ''}` : 'Not collected'} />
            <ResearchMetric label="Chain" value={`${researchLabel(d.chain.source)} · ${researchLabel(d.chain.freshness)}`} />
          </dl>
        )}
        {d && expiry && d.chain.expiry && expiry !== d.chain.expiry && <p className="mt-2 text-xs text-amber-300">The selected expiry was not available; the chain above is for {researchDate(d.chain.expiry)}.</p>}
      </div>
      <button type="button" disabled={loading || !symbol.trim()} onClick={() => void load()} className="rounded border border-slate-600 px-3 py-2 text-sm disabled:opacity-50">{loading ? 'Loading…' : 'Refresh evidence'}</button>

      {d && (
        <>
          <ResearchFold title="Open interest">
            {oi ? (
              <div className="space-y-2">
                <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
                  <ResearchMetric label="Call open interest" value={researchNumber(oi.calls)} />
                  <ResearchMetric label="Put open interest" value={researchNumber(oi.puts)} />
                  <ResearchMetric label="Put/call" value={oi.putCall != null ? researchNumber(oi.putCall, 2) : 'Not collected'} />
                </dl>
                <p className="break-words text-xs text-slate-400">Put/call over {oi.putCallBasis}. A ratio of positions, not a direction.</p>
                <p className="break-words text-sm">Max pain: {oi.maxPain.strike != null ? researchPrice(oi.maxPain.strike) : 'not calculated'}{oi.maxPain.strike != null ? ` (${oi.maxPain.strikesUsed} strikes${oi.maxPain.reliable ? '' : ', thin coverage'})` : ''}. <span className="text-xs text-slate-400">{oi.maxPain.note}</span></p>
                {oi.largestStrikes.length > 0 && (
                  <ul data-largest-strikes className="space-y-1 text-sm">
                    {oi.largestStrikes.map((s) => (
                      <li key={`${s.type}-${s.strike}`} className="flex min-w-0 flex-wrap justify-between gap-x-3">
                        <span>{researchPrice(s.strike)} {s.type}</span>
                        <span className="text-slate-400">OI {researchNumber(s.openInterest)} · vol {researchNumber(s.volume)}{s.iv != null ? ` · IV ${researchNumber(s.iv * 100, 0)}%` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-500">A large open-interest strike is a measured concentration of positions, not a support or resistance level.</p>
              </div>
            ) : <p className="text-sm text-slate-400">Open interest not collected for this expiry.</p>}
          </ResearchFold>

          <ResearchFold title="Implied volatility and expected move">
            <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              <ResearchMetric label="ATM implied volatility" value={iv?.atmIvPct != null ? `${researchNumber(iv.atmIvPct, 1)}%` : 'Not collected'} />
              <ResearchMetric label="IV percentile" value={iv?.ivRank != null ? researchNumber(iv.ivRank) : 'Not collected'} />
              <ResearchMetric label="Expected move to expiry" value={em?.pct != null ? `±${researchNumber(em.pct, 1)}%${em.usd != null ? ` (±${researchPrice(em.usd)})` : ''}` : 'Not collected'} />
            </dl>
            {iv && <p className="mt-2 text-xs text-slate-400">{iv.ivRankNote}</p>}
            {em && <p className="mt-1 break-words text-xs text-slate-400">{em.note}{em.calculation ? ` Method: ${em.calculation}` : ''}</p>}
          </ResearchFold>

          <ResearchFold title="Volume against open interest">
            {vo && vo.strikes.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {vo.strikes.map((s) => (
                  <li key={`${s.type}-${s.strike}`} className="flex min-w-0 flex-wrap justify-between gap-x-3">
                    <span>{researchPrice(s.strike)} {s.type}</span>
                    <span className="text-slate-400">vol {researchNumber(s.volume)} · OI {researchNumber(s.openInterest)} · {researchNumber(s.volumeOiRatio, 1)}×</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-400">No strike with volume high against open interest.</p>}
            {vo && <p className="mt-2 text-xs text-slate-400">{vo.note}</p>}
          </ResearchFold>

          <ResearchFold title="Data quality">
            <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-4">
              <ResearchMetric label="Contracts" value={`${researchNumber(d.chain.contracts.calls)} calls · ${researchNumber(d.chain.contracts.puts)} puts`} />
              <ResearchMetric label="Chain quality" value={d.chain.quality ? `${researchLabel(d.chain.quality.status)} (${researchNumber(d.chain.quality.liquidContracts)} liquid of ${researchNumber(d.chain.quality.quotedContracts)} quoted)` : 'Not assessed'} />
              <ResearchMetric label="Average quoted spread" value={d.chain.quality?.avgSpreadPct != null ? `${researchNumber(d.chain.quality.avgSpreadPct, 1)}%` : 'Not collected'} />
              <ResearchMetric label="Greeks" value={d.chain.greeks} />
              <ResearchMetric label="Chain updated" value={researchTime(d.chain.lastUpdated)} />
            </dl>
            {[...(d.chain.quality?.warnings ?? []), ...d.warnings, ...d.missing].length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-200">
                {[...new Set([...(d.chain.quality?.warnings ?? []), ...d.warnings, ...d.missing])].map((w) => <li key={w} className="break-words">{researchReason(w)}</li>)}
              </ul>
            )}
          </ResearchFold>
          <p data-research-source className="break-words text-xs text-slate-500">Source: {researchLabel(d.chain.source)} options chain · {researchTime(d.chain.lastUpdated)}. Educational research, not a recommendation.</p>
        </>
      )}
    </section>
  );
}
