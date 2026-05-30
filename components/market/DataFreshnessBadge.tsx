import type { MarketDataProviderStatus } from '@/lib/scanner/providerStatus';

export function providerStatusColor(status?: MarketDataProviderStatus | null): string {
  if (!status) return 'var(--msp-text-muted)';
  if (status.alertLevel === 'critical') return 'var(--msp-bear)';
  if (status.alertLevel === 'warning' || status.degraded || status.stale || status.simulated) return 'var(--msp-warn)';
  return 'var(--msp-bull)';
}

export function providerStatusLabel(status?: MarketDataProviderStatus | null): string {
  if (!status) return 'UNKNOWN';
  if (status.productionDemoEnabled) return 'PROD DEMO ALERT';
  if (status.simulated) return 'SIMULATED';
  if (status.stale) return 'STALE';
  if (status.degraded) return 'DEGRADED';
  return status.live ? 'LIVE' : 'CHECK';
}

type DataFreshnessBadgeProps = {
  status?: MarketDataProviderStatus | null;
  label?: string;
  compact?: boolean;
  className?: string;
};

export default function DataFreshnessBadge({ status, label, compact = false, className = '' }: DataFreshnessBadgeProps) {
  const color = providerStatusColor(status);
  const text = label ?? providerStatusLabel(status);
  const title = status?.warnings?.length ? status.warnings.join(' | ') : status?.provider ?? 'Provider status unavailable';

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border font-black uppercase ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} ${className}`}
      style={{ color, borderColor: `${color}66`, backgroundColor: `${color}14` }}
    >
      {text}
    </span>
  );
}
