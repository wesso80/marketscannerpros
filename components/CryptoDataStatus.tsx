'use client';

type FreshnessStatus = 'fresh' | 'delayed' | 'stale' | 'unknown';

interface CryptoDataStatusProps {
  source?: string | null;
  freshnessStatus?: FreshnessStatus | string | null;
  lastUpdated?: string | null;
}

function getStatusStyles(status: FreshnessStatus) {
  if (status === 'fresh') {
    return {
      border: '1px solid rgba(16, 185, 129, 0.28)',
      background: 'rgba(16, 185, 129, 0.12)',
      color: '#86efac',
    };
  }
  if (status === 'delayed') {
    return {
      border: '1px solid rgba(234, 179, 8, 0.28)',
      background: 'rgba(234, 179, 8, 0.12)',
      color: '#fcd34d',
    };
  }
  if (status === 'stale') {
    return {
      border: '1px solid rgba(239, 68, 68, 0.28)',
      background: 'rgba(239, 68, 68, 0.12)',
      color: '#fca5a5',
    };
  }
  return {
    border: '1px solid rgba(100, 116, 139, 0.28)',
    background: 'rgba(100, 116, 139, 0.12)',
    color: '#94a3b8',
  };
}

function normalizeStatus(status?: FreshnessStatus | string | null): FreshnessStatus {
  if (status === 'fresh' || status === 'delayed' || status === 'stale') return status;
  return 'unknown';
}

function getLabel(status: FreshnessStatus): string {
  if (status === 'fresh') return 'Fresh';
  if (status === 'delayed') return 'Delayed';
  if (status === 'stale') return 'Stale';
  return 'Unknown';
}

export default function CryptoDataStatus({ source, freshnessStatus, lastUpdated }: CryptoDataStatusProps) {
  const normalizedStatus = normalizeStatus(freshnessStatus);
  const styles = getStatusStyles(normalizedStatus);
  const normalizedSource = source?.toLowerCase() === 'coingecko' ? 'CoinGecko' : source || 'CoinGecko';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <span
        style={{
          ...styles,
          fontSize: '10px',
          padding: '4px 8px',
          borderRadius: '999px',
          fontWeight: 700,
          letterSpacing: '0.02em',
        }}
      >
        {getLabel(normalizedStatus)}
      </span>
      <span style={{ color: '#64748b', fontSize: '10px' }}>
        {normalizedSource}
        {lastUpdated ? ` • ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
      </span>
    </div>
  );
}