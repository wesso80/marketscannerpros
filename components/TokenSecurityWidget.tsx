'use client';

import { useState } from 'react';

interface TokenSecurityData {
  address: string;
  name: string;
  symbol: string;
  image: string | null;
  gtScore: number | null;
  gtScoreDetails: {
    pool: number;
    transaction: number;
    creation: number;
    info: number;
    holders: number;
  } | null;
  gtVerified: boolean;
  isHoneypot: boolean | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  holders: {
    count: number;
    distribution_percentage: { top_10: string; [key: string]: string };
    last_updated: string;
  } | null;
  socials: {
    website: string | null;
    twitter: string | null;
    telegram: string | null;
    discord: string | null;
  };
}

const NETWORKS = [
  { id: 'eth', label: 'Ethereum' },
  { id: 'solana', label: 'Solana' },
  { id: 'bsc', label: 'BNB Chain' },
  { id: 'base', label: 'Base' },
  { id: 'arbitrum', label: 'Arbitrum' },
  { id: 'polygon_pos', label: 'Polygon' },
  { id: 'optimism', label: 'Optimism' },
  { id: 'avax', label: 'Avalanche' },
];

function GtScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ color: '#94a3b8', fontSize: '11px' }}>{label}</span>
        <span style={{ color, fontSize: '11px', fontWeight: 700 }}>{score.toFixed(0)}</span>
      </div>
      <div style={{ height: '4px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '2px' }} />
      </div>
    </div>
  );
}

export default function TokenSecurityWidget() {
  const [network, setNetwork] = useState('eth');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TokenSecurityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(
        `/api/crypto/token-info?network=${encodeURIComponent(network)}&address=${encodeURIComponent(address.trim())}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to fetch token info');
      } else {
        setData(json);
      }
    } catch (e) {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const honeypotColor = data?.isHoneypot === true ? '#ef4444' : data?.isHoneypot === false ? '#10b981' : '#f59e0b';
  const honeypotLabel = data?.isHoneypot === true ? '🍯 Honeypot Detected' : data?.isHoneypot === false ? '✅ Not Honeypot' : '❓ Unknown';

  const gtColor = !data?.gtScore ? '#64748b' : data.gtScore >= 75 ? '#10b981' : data.gtScore >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      background: 'var(--msp-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '20px' }}>🛡️</span>
        <div>
          <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, margin: 0 }}>
            Token Safety Check
          </h3>
          <p style={{ color: '#64748b', fontSize: '11px', margin: 0 }}>
            GT Score, honeypot detection & security analysis
          </p>
        </div>
      </div>

      {/* Input Row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          style={{
            padding: '10px 12px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          {NETWORKS.map(n => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          placeholder="Token contract address (0x... or Solana)"
          style={{
            flex: 1,
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={handleCheck}
          disabled={loading || !address.trim()}
          style={{
            padding: '10px 18px',
            background: loading ? '#334155' : 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '8px',
            color: loading ? '#64748b' : '#10b981',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading || !address.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Checking...' : 'Check Token'}
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
        }}>
          ⚠️ {error}
        </div>
      )}

      {data && (
        <div>
          {/* Token Identity */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '8px',
            marginBottom: '16px',
          }}>
            {data.image && (
              <img src={data.image} alt={data.symbol} style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 700 }}>
                  {data.name}
                </span>
                <span style={{ color: '#64748b', fontSize: '12px' }}>
                  {data.symbol}
                </span>
                {data.gtVerified && (
                  <span style={{
                    padding: '2px 8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: '10px',
                    color: '#10b981',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}>
                    ✓ GT Verified
                  </span>
                )}
              </div>
              <div style={{ color: '#475569', fontSize: '10px', marginTop: '2px', wordBreak: 'break-all' }}>
                {data.address}
              </div>
            </div>
          </div>

          {/* Safety Badges Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
            {/* Honeypot Status */}
            <div style={{
              padding: '12px',
              background: `${honeypotColor}15`,
              border: `1px solid ${honeypotColor}40`,
              borderRadius: '8px',
            }}>
              <div style={{ color: honeypotColor, fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>
                {honeypotLabel}
              </div>
              <div style={{ color: '#64748b', fontSize: '10px' }}>Honeypot Detection</div>
            </div>

            {/* GT Score */}
            <div style={{
              padding: '12px',
              background: `${gtColor}15`,
              border: `1px solid ${gtColor}40`,
              borderRadius: '8px',
            }}>
              <div style={{ color: gtColor, fontSize: '22px', fontWeight: 700, lineHeight: 1 }}>
                {data.gtScore !== null ? data.gtScore.toFixed(1) : 'N/A'}
              </div>
              <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>GT Score / 100</div>
            </div>

            {/* Mint Authority */}
            <div style={{
              padding: '12px',
              background: data.mintAuthority ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${data.mintAuthority ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
              borderRadius: '8px',
            }}>
              <div style={{
                color: data.mintAuthority ? '#ef4444' : '#10b981',
                fontSize: '13px',
                fontWeight: 700,
                marginBottom: '2px'
              }}>
                {data.mintAuthority ? '⚠️ Minting Enabled' : '🔒 Minting Disabled'}
              </div>
              <div style={{ color: '#64748b', fontSize: '10px' }}>Mint Authority</div>
            </div>

            {/* Freeze Authority */}
            <div style={{
              padding: '12px',
              background: data.freezeAuthority ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${data.freezeAuthority ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
              borderRadius: '8px',
            }}>
              <div style={{
                color: data.freezeAuthority ? '#ef4444' : '#10b981',
                fontSize: '13px',
                fontWeight: 700,
                marginBottom: '2px'
              }}>
                {data.freezeAuthority ? '⚠️ Freeze Enabled' : '🔓 Freeze Disabled'}
              </div>
              <div style={{ color: '#64748b', fontSize: '10px' }}>Freeze Authority</div>
            </div>
          </div>

          {/* GT Score Breakdown */}
          {data.gtScoreDetails && (
            <div style={{
              padding: '14px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>
                GT SCORE BREAKDOWN
              </div>
              <GtScoreBar label="Pool Signals" score={data.gtScoreDetails.pool} />
              <GtScoreBar label="Transactions" score={data.gtScoreDetails.transaction} />
              <GtScoreBar label="Pool Age" score={data.gtScoreDetails.creation} />
              <GtScoreBar label="Token Info" score={data.gtScoreDetails.info} />
              <GtScoreBar label="Holder Distribution" score={data.gtScoreDetails.holders} />
            </div>
          )}

          {/* Holder Metrics */}
          {data.holders && (
            <div style={{
              padding: '14px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>
                HOLDER DISTRIBUTION
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>Total Holders</div>
                  <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700 }}>
                    {data.holders.count.toLocaleString()}
                  </div>
                </div>
                {Object.entries(data.holders.distribution_percentage).filter(([k]) => k !== 'last_updated').map(([key, val]) => (
                  <div key={key}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>
                      {key === 'top_10' ? 'Top 10' : key === 'rest' ? 'Rest' : `#${key}`}
                    </div>
                    <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600 }}>
                      {parseFloat(val).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Socials */}
          {(data.socials.website || data.socials.twitter || data.socials.telegram) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {data.socials.website && (
                <a href={data.socials.website} target="_blank" rel="noopener noreferrer" style={{
                  padding: '6px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '11px',
                  textDecoration: 'none',
                }}>
                  🌐 Website
                </a>
              )}
              {data.socials.twitter && (
                <a href={`https://x.com/${data.socials.twitter}`} target="_blank" rel="noopener noreferrer" style={{
                  padding: '6px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '11px',
                  textDecoration: 'none',
                }}>
                  𝕏 {data.socials.twitter}
                </a>
              )}
              {data.socials.telegram && (
                <a href={`https://t.me/${data.socials.telegram}`} target="_blank" rel="noopener noreferrer" style={{
                  padding: '6px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '11px',
                  textDecoration: 'none',
                }}>
                  ✈️ {data.socials.telegram}
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {!data && !loading && !error && (
        <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
          Enter a token contract address above to check its safety score and honeypot status
        </div>
      )}
    </div>
  );
}
