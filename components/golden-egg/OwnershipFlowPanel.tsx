'use client';
/**
 * MV-5: insider transactions, congressional trades and institutional holdings in Golden Egg → Fundamentals (equities).
 * Data: /api/ownership (Alpha Vantage, cached server-side). Each block shows "Unavailable (reason)" on its own.
 */
import { useEffect, useState } from 'react';
import type { OwnershipContext, Unavailable } from '@/lib/ownership/avOwnership';
import { amountRange, congressHeadline, insiderHeadline, institutionalHeadline, shares, usd } from '@/lib/ownership/ownershipText';

const box = 'rounded-md bg-[var(--msp-panel-2)] px-3 py-2 text-xs';
const title = 'text-slate-400 text-[10px] uppercase tracking-wide mb-1';

function UnavailableLine({ u }: { u: Unavailable }) {
  return <div className="text-slate-500">Unavailable ({u.reason})</div>;
}

export default function OwnershipFlowPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<OwnershipContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/ownership?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) setError(j?.error || `HTTP ${r.status}`);
        else setData(j as OwnershipContext);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'network error'); });
    return () => { cancelled = true; };
  }, [symbol]);

  return (
    <section className="mt-4 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-4" aria-label="Ownership and insider activity">
      <h3 className="text-xs font-semibold text-emerald-400 mb-1">Ownership & insider activity — {symbol}</h3>
      <p className="text-[11px] text-slate-500 mb-3">Reported filings from Alpha Vantage (insider transactions, congressional trade disclosures, quarterly 13F institutional holdings). Filings lag the trades they describe. Research context only — not a signal or advice.</p>
      {error && <div className="text-xs text-slate-500">Unavailable ({error})</div>}
      {!error && !data && <div className="text-xs text-slate-500 animate-pulse">Loading ownership data…</div>}
      {data && (
        <div className="grid gap-2 lg:grid-cols-3">
          <div className={box}>
            <div className={title}>Insider transactions (90 days)</div>
            {data.insider.status === 'unavailable' ? <UnavailableLine u={data.insider} /> : (
              <>
                <div className="text-slate-200">{insiderHeadline(data.insider)}</div>
                {data.insider.notable.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {data.insider.notable.map((t, i) => (
                      <li key={`${t.date}-${t.name}-${i}`} className="flex justify-between gap-2">
                        <span className="text-slate-400 truncate" title={t.title}>{t.date} · {t.name}{t.title ? ` (${t.title})` : ''}</span>
                        <span className={t.side === 'buy' ? 'text-emerald-400 whitespace-nowrap' : 'text-red-400 whitespace-nowrap'}>{t.side} {shares(t.shares)} @ ${t.price.toFixed(2)} ≈ {usd(t.value)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 text-[10px] text-slate-500">Buys/sells are priced common-stock transactions. Grants, vesting and option rows are not counted as buys{data.insider.awards.count || data.insider.otherCount ? ` (${data.insider.awards.count + data.insider.otherCount} such rows)` : ''}.</div>
              </>
            )}
          </div>
          <div className={box}>
            <div className={title}>Congressional trades</div>
            {data.congress.status === 'unavailable' ? <UnavailableLine u={data.congress} /> : (
              <>
                <div className="text-slate-200">{congressHeadline(data.congress)}</div>
                {data.congress.recent.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {data.congress.recent.slice(0, 6).map((t, i) => (
                      <li key={`${t.date}-${t.politician}-${i}`} className="flex justify-between gap-2">
                        <span className="text-slate-400 truncate">{t.date} · {t.politician}{t.party || t.state ? ` (${[t.party, t.state].filter(Boolean).join('-')})` : ''}</span>
                        <span className={t.type.startsWith('BUY') ? 'text-emerald-400 whitespace-nowrap' : t.type.startsWith('SELL') ? 'text-red-400 whitespace-nowrap' : 'text-slate-300 whitespace-nowrap'}>{t.type.toLowerCase()} {amountRange(t.amountMin, t.amountMax)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 text-[10px] text-slate-500">Amounts are the disclosed ranges; disclosures can be filed weeks after the trade.</div>
              </>
            )}
          </div>
          <div className={box}>
            <div className={title}>Institutional holdings (13F)</div>
            {data.institutional.status === 'unavailable' ? <UnavailableLine u={data.institutional} /> : (
              <>
                <div className="text-slate-200">{institutionalHeadline(data.institutional)}</div>
                {data.institutional.holdersIncreased != null && data.institutional.holdersDecreased != null && (
                  <div className="mt-1 text-slate-400">{data.institutional.holdersIncreased.toLocaleString('en-US')} holders added, {data.institutional.holdersDecreased.toLocaleString('en-US')} reduced{data.institutional.holdersUnchanged != null ? `, ${data.institutional.holdersUnchanged.toLocaleString('en-US')} unchanged` : ''}.</div>
                )}
                {data.institutional.topHolders.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {data.institutional.topHolders.map((h) => (
                      <li key={h.name} className="flex justify-between gap-2">
                        <span className="text-slate-400 truncate">{h.name}</span>
                        <span className="text-slate-300 whitespace-nowrap">{shares(h.shares)} sh{h.changePct != null ? ` (${h.changePct > 0 ? '+' : ''}${h.changePct.toFixed(1)}%)` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
