'use client';

import { useState, useEffect } from 'react';

interface TreasuryCompany {
  name: string;
  symbol: string;
  country: string;
  holdings: number;
  entryValueUsd: number;
  currentValueUsd: number;
  percentOfSupply: number;
  profitLossUsd: number;
  profitLossPercent: number;
}

interface TreasurySummary {
  totalHoldings: number;
  totalValueUsd: number;
  marketCapDominance: number;
  companyCount: number;
}

interface TreasuryData {
  coin: string;
  summary: TreasurySummary;
  companies: TreasuryCompany[];
}

const COINS = [
  { id: 'bitcoin', label: 'Bitcoin', symbol: 'BTC' },
  { id: 'ethereum', label: 'Ethereum', symbol: 'ETH' },
];

function formatUsd(val: number): string {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatPct(val: number): string {
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

export default function PublicTreasuryWidget() {
  const [coin, setCoin] = useState<'bitcoin' | 'ethereum'>('bitcoin');
  const [data, setData] = useState<TreasuryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<'holdings' | 'currentValueUsd' | 'profitLossUsd' | 'profitLossPercent'>('currentValueUsd');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/crypto/public-treasury?coin=${coin}`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled) {
          if (json.error) setError(json.error);
          else setData(json);
        }
      })
      .catch(() => { if (!cancelled) setError('Failed to load treasury data'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [coin]);

  const sorted = data?.companies
    ? [...data.companies].sort((a, b) => b[sortCol] - a[sortCol])
    : [];

  const coinSymbol = COINS.find(c => c.id === coin)?.symbol || 'BTC';

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-400">Treasury</p>
          <h3 className="text-sm font-bold text-slate-100">Institutional Holdings</h3>
          <p className="text-[11px] text-slate-500">Public companies &amp; governments holding crypto</p>
        </div>
        <div className="flex gap-1">
          {COINS.map(c => (
            <button
              key={c.id}
              type="button"
              aria-pressed={coin === c.id}
              onClick={() => setCoin(c.id as 'bitcoin' | 'ethereum')}
              className={`rounded-md border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                coin === c.id
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-transparent text-slate-500 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {c.symbol}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-lg bg-slate-700" />)}
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-11 rounded bg-slate-700/50" />)}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-center text-[13px] text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary Cards */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">Total Holdings</p>
              <p className="mt-0.5 text-lg font-bold text-slate-100">{data.summary.totalHoldings.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">{coinSymbol}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">Total Value</p>
              <p className="mt-0.5 text-lg font-bold text-slate-100">{formatUsd(data.summary.totalValueUsd)}</p>
              <p className="text-[10px] text-slate-500">USD</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">Entities</p>
              <p className="mt-0.5 text-lg font-bold text-slate-100">{data.summary.companyCount}</p>
              <p className="text-[10px] text-slate-500">Companies</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">Supply Held</p>
              <p className="mt-0.5 text-lg font-bold text-amber-300">{data.summary.marketCapDominance?.toFixed(2)}%</p>
              <p className="text-[10px] text-slate-500">Of Total Supply</p>
            </div>
          </div>

          {/* Sort Controls */}
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] text-slate-500">Sort:</span>
            {([
              { key: 'currentValueUsd', label: 'Value' },
              { key: 'holdings', label: 'Holdings' },
              { key: 'profitLossUsd', label: 'P&L $' },
              { key: 'profitLossPercent', label: 'P&L %' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={sortCol === key}
                onClick={() => setSortCol(key)}
                className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  sortCol === key
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-transparent text-slate-500 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-md border border-slate-700">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-950/60">
                  <th scope="col" className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500">Entity</th>
                  <th scope="col" className="px-2 py-2 text-right text-[10px] font-semibold text-slate-500">Holdings</th>
                  <th scope="col" className="px-2 py-2 text-right text-[10px] font-semibold text-slate-500">Value</th>
                  <th scope="col" className="px-2 py-2 text-right text-[10px] font-semibold text-slate-500">P&L</th>
                  <th scope="col" className="px-2 py-2 text-right text-[10px] font-semibold text-slate-500">% Supply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sorted.map((co, i) => {
                  const isProfit = co.profitLossUsd >= 0;
                  const countryCode = (co.country || '--').toUpperCase().slice(0, 2);
                  return (
                    <tr key={`${co.name}-${i}`} className="hover:bg-slate-800/30">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="min-w-[28px] rounded border border-slate-700 px-1 py-px text-center text-[10px] text-slate-400">
                            {countryCode}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-200">{co.name}</p>
                            {co.symbol && <p className="text-[10px] text-slate-500">{co.symbol}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-slate-200">{co.holdings.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right text-slate-200">{formatUsd(co.currentValueUsd)}</td>
                      <td className="px-2 py-2 text-right">
                        <p className={`font-semibold ${isProfit ? 'text-emerald-300' : 'text-rose-300'}`}>{formatUsd(co.profitLossUsd)}</p>
                        <p className={`text-[10px] ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(co.profitLossPercent)}</p>
                      </td>
                      <td className="px-2 py-2 text-right text-slate-400">{co.percentOfSupply?.toFixed(3)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-right text-[10px] text-slate-600">Source: CoinGecko Public Treasury</p>
        </>
      )}
    </div>
  );
}
