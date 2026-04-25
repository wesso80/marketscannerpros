'use client';

import { useState } from 'react';

interface TimeframeBreakdown {
  timeframe: string;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netVolumeUsd: number;
}

interface PoolPressureData {
  poolName: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string;
  address: string;
  network: string;
  breakdown: TimeframeBreakdown[];
}

const NETWORKS = [
  { id: 'eth', label: 'Ethereum' },
  { id: 'bsc', label: 'BNB Chain' },
  { id: 'solana', label: 'Solana' },
  { id: 'polygon_pos', label: 'Polygon' },
  { id: 'avax', label: 'Avalanche' },
  { id: 'base', label: 'Base' },
  { id: 'arbitrum', label: 'Arbitrum' },
];

function formatUsd(val: number): string {
  const abs = Math.abs(val);
  const s = val < 0 ? '-' : '';
  if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${s}$${(abs / 1e3).toFixed(1)}K`;
  return `${s}$${abs.toFixed(0)}`;
}

const TF_LABELS: Record<string, string> = {
  m5: '5m', m15: '15m', m30: '30m', h1: '1H', h6: '6H', h24: '24H',
};

export default function NetBuySellWidget() {
  const [network, setNetwork] = useState('eth');
  const [address, setAddress] = useState('');
  const [data, setData] = useState<PoolPressureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTf, setSelectedTf] = useState('h1');

  async function fetchPressure() {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/crypto/pool-pressure?network=${network}&address=${encodeURIComponent(address.trim())}`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }

  const selected = data?.breakdown.find(b => b.timeframe === selectedTf);
  const maxVol = data
    ? Math.max(...data.breakdown.flatMap(b => [b.buyVolumeUsd, b.sellVolumeUsd]))
    : 1;

  return (
    <div style={{
      background: 'var(--msp-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: '#10b981', fontWeight: 700 }}>FLOW</span>
        <div>
          <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, margin: 0 }}>
            Net Buy / Sell Pressure
          </h3>
          <p style={{ color: '#64748b', fontSize: '11px', margin: 0 }}>
            DEX pool volume breakdown by timeframe
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <select
          value={network}
          onChange={e => setNetwork(e.target.value)}
          style={{
            padding: '8px 12px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {NETWORKS.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchPressure()}
          placeholder="Pool contract address..."
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '8px 12px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={fetchPressure}
          disabled={loading || !address.trim()}
          style={{
            padding: '8px 16px',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '8px',
            color: '#10b981',
            fontSize: '12px',
            fontWeight: 600,
            cursor: loading || !address.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !address.trim() ? 0.5 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Analyze'}
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
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Pool Name */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{
              padding: '4px 10px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              color: '#10b981',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {data.poolName || `${data.baseTokenSymbol}/${data.quoteTokenSymbol}`}
            </span>
          </div>

          {/* Timeframe Selector */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {data.breakdown.map(b => (
              <button
                key={b.timeframe}
                type="button"
                onClick={() => setSelectedTf(b.timeframe)}
                style={{
                  padding: '5px 12px',
                  background: selectedTf === b.timeframe ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  border: selectedTf === b.timeframe ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #334155',
                  borderRadius: '6px',
                  color: selectedTf === b.timeframe ? '#10b981' : '#64748b',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {TF_LABELS[b.timeframe] || b.timeframe}
              </button>
            ))}
          </div>

          {/* Selected Timeframe Summary */}
          {selected && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '10px',
              marginBottom: '20px',
            }}>
              <div style={{
                padding: '14px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>BUY VOLUME</div>
                <div style={{ color: '#10b981', fontSize: '18px', fontWeight: 700 }}>
                  {formatUsd(selected.buyVolumeUsd)}
                </div>
              </div>
              <div style={{
                padding: '14px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>SELL VOLUME</div>
                <div style={{ color: '#ef4444', fontSize: '18px', fontWeight: 700 }}>
                  {formatUsd(selected.sellVolumeUsd)}
                </div>
              </div>
              <div style={{
                padding: '14px',
                background: selected.netVolumeUsd >= 0
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'rgba(239, 68, 68, 0.08)',
                border: selected.netVolumeUsd >= 0
                  ? '1px solid rgba(16, 185, 129, 0.2)'
                  : '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>NET PRESSURE</div>
                <div style={{
                  color: selected.netVolumeUsd >= 0 ? '#10b981' : '#ef4444',
                  fontSize: '18px',
                  fontWeight: 700,
                }}>
                  {selected.netVolumeUsd >= 0 ? 'UP' : 'DOWN'} {formatUsd(Math.abs(selected.netVolumeUsd))}
                </div>
              </div>
            </div>
          )}

          {/* Bar Chart - All Timeframes */}
          <div>
            <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '10px', fontWeight: 600 }}>
              ALL TIMEFRAMES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.breakdown.map(b => {
                const buyPct = maxVol > 0 ? (b.buyVolumeUsd / maxVol) * 100 : 0;
                const sellPct = maxVol > 0 ? (b.sellVolumeUsd / maxVol) * 100 : 0;
                const total = b.buyVolumeUsd + b.sellVolumeUsd;
                const buyRatio = total > 0 ? b.buyVolumeUsd / total : 0.5;
                return (
                  <div key={b.timeframe}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600, width: '28px' }}>
                        {TF_LABELS[b.timeframe]}
                      </span>
                      <div style={{ flex: 1, position: 'relative' }}>
                        {/* Buy bar */}
                        <div style={{
                          height: '8px',
                          background: '#1e293b',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          display: 'flex',
                        }}>
                          <div style={{
                            width: `${buyRatio * 100}%`,
                            background: 'linear-gradient(90deg, #10b981, #34d399)',
                            borderRadius: '4px 0 0 4px',
                          }} />
                          <div style={{
                            flex: 1,
                            background: 'linear-gradient(90deg, #ef4444, #f87171)',
                            borderRadius: '0 4px 4px 0',
                          }} />
                        </div>
                      </div>
                      <span style={{
                        fontSize: '10px',
                        color: b.netVolumeUsd >= 0 ? '#10b981' : '#ef4444',
                        fontWeight: 600,
                        width: '60px',
                        textAlign: 'right',
                      }}>
                        {b.netVolumeUsd >= 0 ? '+' : ''}{formatUsd(b.netVolumeUsd)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
                <span style={{ color: '#64748b', fontSize: '10px' }}>Buy pressure</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#ef4444' }} />
                <span style={{ color: '#64748b', fontSize: '10px' }}>Sell pressure</span>
              </div>
            </div>
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div style={{
          padding: '32px',
          textAlign: 'center',
          color: '#475569',
          fontSize: '13px',
        }}>
          Enter a DEX pool address to analyze buy/sell pressure
        </div>
      )}
    </div>
  );
}
