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
    <div style={{
      background: 'var(--msp-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: '#10b981', fontWeight: 700 }}>TREASURY</span>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, margin: 0 }}>
              Institutional Treasury Holdings
            </h3>
            <p style={{ color: '#64748b', fontSize: '11px', margin: 0 }}>
              Public companies &amp; governments holding crypto
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {COINS.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCoin(c.id as 'bitcoin' | 'ethereum')}
              style={{
                padding: '6px 14px',
                background: coin === c.id ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                border: coin === c.id ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #334155',
                borderRadius: '8px',
                color: coin === c.id ? '#10b981' : '#64748b',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {c.symbol}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-700 rounded-lg" />)}
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-slate-700/50 rounded" />)}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '13px',
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
            marginBottom: '16px',
          }}>
            <div style={{
              padding: '14px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}>
              <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>
                TOTAL HOLDINGS
              </div>
              <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700 }}>
                {data.summary.totalHoldings.toLocaleString()}
              </div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>{coinSymbol}</div>
            </div>
            <div style={{
              padding: '14px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}>
              <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>
                TOTAL VALUE
              </div>
              <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700 }}>
                {formatUsd(data.summary.totalValueUsd)}
              </div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>USD</div>
            </div>
            <div style={{
              padding: '14px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}>
              <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>
                COMPANIES
              </div>
              <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700 }}>
                {data.summary.companyCount}
              </div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>Entities</div>
            </div>
            <div style={{
              padding: '14px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}>
              <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>
                SUPPLY HELD
              </div>
              <div style={{ color: '#f59e0b', fontSize: '22px', fontWeight: 700 }}>
                {data.summary.marketCapDominance?.toFixed(2)}%
              </div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>Of Total Supply</div>
            </div>
          </div>

          {/* Sort Controls */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b', fontSize: '10px', alignSelf: 'center', marginRight: '4px' }}>Sort by:</span>
            {[
              { key: 'currentValueUsd', label: 'Value' },
              { key: 'holdings', label: 'Holdings' },
              { key: 'profitLossUsd', label: 'P&L $' },
              { key: 'profitLossPercent', label: 'P&L %' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortCol(key as typeof sortCol)}
                style={{
                  padding: '4px 10px',
                  background: sortCol === key ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  border: sortCol === key ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #334155',
                  borderRadius: '6px',
                  color: sortCol === key ? '#10b981' : '#64748b',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 600, textAlign: 'left' }}>Entity</th>
                  <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>Holdings</th>
                  <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>Value</th>
                  <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>P&L</th>
                  <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>% Supply</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((co, i) => {
                  const plColor = co.profitLossUsd >= 0 ? '#10b981' : '#ef4444';
                  const countryCode = (co.country || '--').toUpperCase().slice(0, 2);
                  return (
                    <tr
                      key={`${co.name}-${i}`}
                      style={{ borderBottom: '1px solid #1e293b' }}
                      className="hover:bg-slate-800/30"
                    >
                      <td style={{ padding: '10px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#94a3b8',
                            border: '1px solid #334155',
                            borderRadius: '4px',
                            padding: '2px 5px',
                            minWidth: '28px',
                            textAlign: 'center',
                          }}>{countryCode}</span>
                          <div>
                            <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{co.name}</div>
                            {co.symbol && (
                              <div style={{ color: '#64748b', fontSize: '10px' }}>{co.symbol}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#f1f5f9' }}>
                        {co.holdings.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#f1f5f9' }}>
                        {formatUsd(co.currentValueUsd)}
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                        <div style={{ color: plColor, fontWeight: 600 }}>{formatUsd(co.profitLossUsd)}</div>
                        <div style={{ color: plColor, fontSize: '10px' }}>{formatPct(co.profitLossPercent)}</div>
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8' }}>
                        {co.percentOfSupply?.toFixed(3)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '12px', color: '#475569', fontSize: '10px', textAlign: 'right' }}>
            Source: CoinGecko Public Treasury
          </div>
        </>
      )}
    </div>
  );
}
