'use client';

import { useRegime, regimeLabel, regimeBadgeColor } from '@/lib/useRegime';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import MarketStatusBadge from '@/components/MarketStatusBadge';

/**
 * InstitutionalStateStrip — Sticky top bar on Markets page.
 * Shows: Regime | Vol State | Risk Mode | R-Budget | Data Quality | Session Phase
 * All data from real providers — no decoration.
 */
export default function InstitutionalStateStrip() {
  const { data: regime, loading: regimeLoading } = useRegime();
  const { snapshot, loading: riskLoading, guardEnabled, isLocked } = useRiskPermission();

  const loading = regimeLoading || riskLoading;

  // Derive vol state from regime
  const volState = regime?.regime === 'VOL_EXPANSION'
    ? 'Expansion'
    : regime?.regime === 'VOL_CONTRACTION'
      ? 'Contraction'
      : regime?.regime === 'RISK_OFF_STRESS'
        ? 'Stress'
        : 'Normal';

  const volColor = volState === 'Expansion' || volState === 'Stress'
    ? 'text-amber-400'
    : volState === 'Contraction'
      ? 'text-cyan-400'
      : 'text-slate-400';

  // Risk mode
  const riskMode = snapshot?.risk_mode ?? 'NORMAL';
  const riskModeColor: Record<string, string> = {
    NORMAL: 'text-emerald-400',
    THROTTLED: 'text-amber-400',
    DEFENSIVE: 'text-orange-400',
    LOCKED: 'text-red-400',
  };

  // R budget
  const remainingR = snapshot?.session?.remaining_daily_R ?? 0;
  const maxR = snapshot?.session?.max_daily_R ?? 6;
  const rPct = maxR > 0 ? (remainingR / maxR) * 100 : 0;
  const rColor = rPct > 50 ? 'text-emerald-400' : rPct > 25 ? 'text-amber-400' : 'text-red-400';

  // Data quality
  const dataHealth = snapshot?.data_health?.status ?? 'UNKNOWN';
  const dataColor = dataHealth === 'OK' ? 'text-emerald-400' : dataHealth === 'DEGRADED' ? 'text-amber-400' : 'text-red-400';

  // Stale signal count
  const staleCount = regime?.signals?.filter(s => s.stale).length ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] px-2 py-1.5 text-[10px] md:sticky md:top-0 md:z-40 md:text-[11px]">
      {/* Regime */}
      <Pill label="Regime" loading={loading}>
        <span className={regimeBadgeColor(regime?.regime)}>
          {regimeLabel(regime?.regime)}
        </span>
      </Pill>

      {/* Vol State */}
      <Pill label="Vol" loading={loading}>
        <span className={volColor}>{volState}</span>
      </Pill>

      {/* Risk Mode */}
      <Pill label="Risk" loading={loading}>
        <span className={riskModeColor[riskMode] ?? 'text-slate-400'}>{riskMode}</span>
      </Pill>

      {/* R Budget */}
      <Pill label="R Budget" loading={loading}>
        <span className={rColor}>{remainingR.toFixed(1)}R / {maxR}R</span>
      </Pill>

      {/* Data Quality */}
      <Pill label="Data" loading={loading}>
        <span className={dataColor}>{dataHealth}</span>
        {staleCount > 0 && (
          <span className="ml-1 text-amber-500">({staleCount} stale)</span>
        )}
      </Pill>

      {/* Guard */}
      <Pill label="Guard">
        <span className={guardEnabled ? 'text-emerald-400' : 'text-red-400'}>
          {guardEnabled ? 'ON' : 'OFF'}
        </span>
        {isLocked && <span className="ml-1 text-red-400 font-bold">LOCKED</span>}
      </Pill>

      {/* Market Session */}
      <div className="ml-auto">
        <MarketStatusBadge compact showGlobal />
      </div>
    </div>
  );
}

function Pill({ label, loading, children }: { label: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-0.5">
      <span className="font-semibold tracking-wide uppercase text-[var(--msp-text-faint)]">{label}</span>
      <span className="text-[var(--msp-divider)]">·</span>
      {loading ? (
        <span className="text-slate-500 animate-pulse">—</span>
      ) : (
        <span className="font-medium">{children}</span>
      )}
    </div>
  );
}
