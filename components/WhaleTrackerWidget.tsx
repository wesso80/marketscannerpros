'use client';

import { useState } from 'react';

interface Trader {
  address: string;
  name: string | null;
  type: string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  tokenBalance: number;
  avgBuyPriceUsd: number;
  avgSellPriceUsd: number | null;
  buyCount: number;
  sellCount: number;
  totalBuyUsd: number;
  totalSellUsd: number;
  explorerUrl: string;
}

const NETWORKS = [
  { id: 'eth', label: 'Ethereum' },
  { id: 'solana', label: 'Solana' },
  { id: 'bsc', label: 'BNB Chain' },
  { id: 'base', label: 'Base' },
  { id: 'arbitrum', label: 'Arbitrum' },
  { id: 'polygon_pos', label: 'Polygon' },
];

const PERIODS = [
  { id: '5m', label: '5m' },
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
];

function formatUsd(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e6) return `${val >= 0 ? '+' : '-'}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${val >= 0 ? '+' : '-'}$${(abs / 1e3).toFixed(1)}K`;
  return `${val >= 0 ? '+' : '-'}$${abs.toFixed(0)}`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WhaleTrackerWidget() {
  const [network, setNetwork] = useState('eth');
  const [address, setAddress] = useState('');
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(false);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [meta, setMeta] = useState<{ network: string; address: string; period: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setTraders([]);
    try {
      const res = await fetch(
        `/api/crypto/top-traders?network=${encodeURIComponent(network)}&address=${encodeURIComponent(address.trim())}&period=${period}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to fetch traders');
      } else {
        setTraders(json.traders || []);
        setMeta({ network: json.network, address: json.address, period: json.period });
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'var(--msp-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '20px' }}>🐋</span>
        <div>
          <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, margin: 0 }}>
            Whale Tracker
          </h3>
          <p style={{ color: '#64748b', fontSize: '11px', margin: 0 }}>
            Top traders by realized + unrealized PnL
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          style={{
            padding: '9px 10px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {NETWORKS.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          placeholder="Token contract address"
          style={{
            flex: 1,
            minWidth: '160px',
            padding: '9px 12px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '4px' }}>
          {PERIODS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              style={{
                padding: '6px 10px',
                background: period === p.id ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                border: period === p.id ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #334155',
                borderRadius: '6px',
                color: period === p.id ? '#10b981' : '#64748b',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleFetch}
          disabled={loading || !address.trim()}
          style={{
            padding: '9px 16px',
            background: loading ? '#334155' : 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '8px',
            color: loading ? '#64748b' : '#10b981',
            fontSize: '12px',
            fontWeight: 600,
            cursor: loading || !address.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Loading...' : 'Track Whales'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '13px',
          marginBottom: '12px',
        }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-slate-700/30 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && traders.length > 0 && (
        <>
          {meta && (
            <div style={{ color: '#475569', fontSize: '10px', marginBottom: '10px', wordBreak: 'break-all' }}>
              {meta.address} · {meta.network.toUpperCase()} · {meta.period} period
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {traders.map((trader, i) => {
              const pnlColor = trader.totalPnlUsd >= 0 ? '#10b981' : '#ef4444';
              return (
                <div
                  key={trader.address}
                  style={{
                    padding: '12px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          background: i < 3 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0,0,0,0.3)',
                          color: i < 3 ? '#f59e0b' : '#64748b',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontSize: '10px',
                          fontWeight: 700,
                        }}>
                          #{i + 1}
                        </span>
                        <a
                          href={trader.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#94a3b8', fontSize: '12px', textDecoration: 'none' }}
                          className="hover:text-white"
                        >
                          {trader.name || shortAddr(trader.address)}
                        </a>
                        {trader.type && trader.type !== 'other' && (
                          <span style={{
                            padding: '1px 6px',
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '4px',
                            color: '#818cf8',
                            fontSize: '9px',
                          }}>
                            {trader.type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: pnlColor, fontSize: '15px', fontWeight: 700 }}>
                        {formatUsd(trader.totalPnlUsd)}
                      </div>
                      <div style={{ color: '#475569', fontSize: '9px' }}>Total PnL</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    <div>
                      <div style={{ color: '#475569', fontSize: '9px' }}>Realized</div>
                      <div style={{ color: trader.realizedPnlUsd >= 0 ? '#10b981' : '#ef4444', fontSize: '11px', fontWeight: 600 }}>
                        {formatUsd(trader.realizedPnlUsd)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#475569', fontSize: '9px' }}>Unrealized</div>
                      <div style={{ color: trader.unrealizedPnlUsd >= 0 ? '#10b981' : '#ef4444', fontSize: '11px', fontWeight: 600 }}>
                        {formatUsd(trader.unrealizedPnlUsd)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#475569', fontSize: '9px' }}>Buys</div>
                      <div style={{ color: '#10b981', fontSize: '11px', fontWeight: 600 }}>
                        {trader.buyCount}x
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#475569', fontSize: '9px' }}>Sells</div>
                      <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>
                        {trader.sellCount}x
                      </div>
                    </div>
                  </div>

                  {trader.avgBuyPriceUsd > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', gap: '16px' }}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ color: '#475569', fontSize: '9px' }}>Avg Buy:</span>
                        <span style={{ color: '#10b981', fontSize: '10px', fontWeight: 600 }}>
                          ${trader.avgBuyPriceUsd < 0.001 ? trader.avgBuyPriceUsd.toExponential(2) : trader.avgBuyPriceUsd.toFixed(4)}
                        </span>
                      </div>
                      {trader.avgSellPriceUsd && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span style={{ color: '#475569', fontSize: '9px' }}>Avg Sell:</span>
                          <span style={{ color: '#ef4444', fontSize: '10px', fontWeight: 600 }}>
                            ${trader.avgSellPriceUsd < 0.001 ? trader.avgSellPriceUsd.toExponential(2) : trader.avgSellPriceUsd.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '10px', color: '#475569', fontSize: '10px', textAlign: 'right' }}>
            Powered by GeckoTerminal
          </div>
        </>
      )}

      {!loading && !error && traders.length === 0 && !meta && (
        <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
          Enter a token contract address to see the top traders and their PnL
        </div>
      )}
    </div>
  );
}
