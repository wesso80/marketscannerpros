import { useMemo, type ReactNode } from 'react';
import Pill from './Pill';

export type TerminalDensity = 'compact' | 'normal';

interface CommandStripProps {
  symbol?: string;
  status?: string;
  confidence?: number;
  dataHealth?: string;
  mode?: string;
  density?: TerminalDensity;
  onDensityChange?: (density: TerminalDensity) => void;
  rightSlot?: ReactNode;
}

export default function CommandStrip({
  symbol,
  status,
  confidence,
  dataHealth,
  mode,
  density = 'normal',
  onDensityChange,
  rightSlot,
}: CommandStripProps) {
  const densityClass = density === 'compact' ? 'py-1.5 px-2 text-[11px]' : 'py-2.5 px-3 text-xs';

  const confidenceTone = useMemo(() => {
    if ((confidence ?? 0) >= 70) return 'bull' as const;
    if ((confidence ?? 0) >= 50) return 'warn' as const;
    return 'bear' as const;
  }, [confidence]);

  return (
    <section className={`sticky top-2 z-40 mb-4 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] shadow-[var(--msp-shadow)] ${densityClass}`}>
      <div className="flex flex-wrap items-center gap-2">
        {symbol ? <Pill tone="accent">{symbol}</Pill> : null}
        {status ? <Pill tone="neutral">Status: {status}</Pill> : null}
        {typeof confidence === 'number' ? <Pill tone={confidenceTone}>Confidence: {confidence.toFixed(0)}%</Pill> : null}
        {dataHealth ? <Pill tone="neutral">Data: {dataHealth}</Pill> : null}
        {mode ? <Pill tone="accent">Mode: {mode}</Pill> : null}

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
          {onDensityChange ? (
            <div className="inline-flex rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-0.5">
              <button
                type="button"
                onClick={() => onDensityChange('compact')}
                className={`rounded px-2 py-1 text-[11px] font-bold uppercase ${density === 'compact' ? 'bg-[var(--msp-panel)] text-[var(--msp-accent)]' : 'text-[var(--msp-text-muted)]'}`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => onDensityChange('normal')}
                className={`rounded px-2 py-1 text-[11px] font-bold uppercase ${density === 'normal' ? 'bg-[var(--msp-panel)] text-[var(--msp-accent)]' : 'text-[var(--msp-text-muted)]'}`}
              >
                Normal
              </button>
            </div>
          ) : null}
          {rightSlot}
        </div>
      </div>
    </section>
  );
}
