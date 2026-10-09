"use client";

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { InputSection, PublicMarketInputs } from '@/lib/research/publicMarketInputs';

/**
 * Market inputs (Time Confluence tab). Renders the public Market Inputs contract: measured volatility, derivatives
 * and options-chain inputs with source and time, and "Not collected" where an input is missing. No composite score,
 * direction, alignment or pressure label (those stay inside the internal Market Pressure Engine).
 */
interface Props {
  symbol: string;
  scanMode?: string;
  sessionMode?: string;
}

const NOT_COLLECTED = 'Not collected';
const fmt = (v: number | null, dp = 2, suffix = '') => (v == null ? NOT_COLLECTED : `${v.toLocaleString('en-US', { maximumFractionDigits: dp })}${suffix}`);
const usd = (v: number | null) => (v == null ? NOT_COLLECTED : `$${Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'time not supplied');

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 text-xs">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`text-right font-mono ${value === NOT_COLLECTED ? 'text-slate-500' : 'text-slate-200'}`}>{value}</dd>
    </div>
  );
}

function Section<T>({ title, section, children, foot }: { title: string; section: InputSection<T>; children: ReactNode; foot?: string }) {
  return (
    <section data-market-input={title} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/25 p-3">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-200">{title}</h4>
        <span className="text-[10px] text-slate-500">{section.source} · {when(section.asOf)}</span>
      </div>
      <dl className="space-y-1">{children}</dl>
      {section.missing.length > 0 && <p className="mt-1.5 break-words text-[10px] text-amber-200/80">{section.missing.join(' · ')}</p>}
      {foot && <p className="mt-1 break-words text-[10px] text-slate-500">{foot}</p>}
    </section>
  );
}

export default function MarketPressureWidget({ symbol, scanMode = 'intraday_1h' }: Props) {
  const [data, setData] = useState<PublicMarketInputs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-pressure?symbol=${encodeURIComponent(symbol)}&scanMode=${encodeURIComponent(scanMode)}`);
      const json = await res.json();
      if (res.ok && json?.success && json.data?.contract === 'public-market-inputs-v1') setData(json.data);
      else { setData(null); setError(json?.error || 'Market inputs could not be loaded'); }
    } catch {
      setData(null);
      setError('Market inputs could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [symbol, scanMode]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="py-8 text-center text-xs text-slate-500">Loading market inputs…</div>;
  if (error) return <div role="alert" className="py-4 text-center text-xs text-slate-500">{error}</div>;
  if (!data) return null;

  const v = data.volatility.values;
  return (
    <div data-market-inputs className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Section title="Volatility" section={data.volatility} foot={v.squeezeDefinition}>
          <Row label="ADX (14)" value={fmt(v.adx14, 1)} />
          <Row label="ATR % (14)" value={fmt(v.atrPercent14, 2, '%')} />
          <Row label="Squeeze" value={v.inSqueeze == null ? NOT_COLLECTED : v.inSqueeze ? 'Yes' : 'No'} />
        </Section>
        {data.derivatives && (
          <Section title="Derivatives" section={data.derivatives}>
            <Row label="Open interest" value={usd(data.derivatives.values.openInterestUsd)} />
            <Row label="Exchanges" value={fmt(data.derivatives.values.exchanges, 0)} />
            <Row label="Funding rate" value={fmt(data.derivatives.values.fundingRatePercent, 4, '%')} />
          </Section>
        )}
        {data.options && (
          <Section title="Options chain" section={data.options} foot={data.options.values.gammaEstimateBasis}>
            <Row label="Expiry" value={data.options.values.expiry ?? NOT_COLLECTED} />
            <Row label="Put/call (open interest)" value={fmt(data.options.values.putCallRatio, 2)} />
            <Row label="Max pain" value={data.options.values.maxPainStrike == null ? NOT_COLLECTED : `${fmt(data.options.values.maxPainStrike, 2)}${data.options.values.maxPainReliable === false ? ' (thin coverage)' : ''}`} />
            <Row label="IV percentile" value={fmt(data.options.values.ivRank, 0)} />
            <Row label="Strikes with volume high vs open interest" value={fmt(data.options.values.strikesWithHighVolumeVsOpenInterest, 0)} />
            <Row label="Estimated net gamma" value={usd(data.options.values.estimatedNetGammaUsd)} />
            <Row label="Estimated gamma flip" value={fmt(data.options.values.estimatedGammaFlipPrice, 2)} />
          </Section>
        )}
      </div>
      <p className="text-[11px] text-slate-500">{data.note} Observed {when(data.observedAt)}.</p>
    </div>
  );
}
