import type { ReactNode } from 'react';

type ToolPanelProps = {
  children: ReactNode;
  className?: string;
  /** Tints the left border for quick visual scanning */
  accent?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  /** Removes padding for when you need a flush container */
  flush?: boolean;
};

const ACCENT_BORDER: Record<NonNullable<ToolPanelProps['accent']>, string> = {
  green: 'border-l-emerald-500/50',
  amber: 'border-l-amber-500/50',
  red:   'border-l-red-500/50',
  blue:  'border-l-blue-500/50',
  slate: 'border-l-slate-600/50',
};

export default function ToolPanel({ children, className = '', accent, flush = false }: ToolPanelProps) {
  const borderAccent = accent ? `border-l-2 ${ACCENT_BORDER[accent]}` : 'border';
  const padding = flush ? '' : 'p-4';
  return (
    <div
      className={`rounded-lg border-slate-800 bg-slate-950/40 ${borderAccent} ${padding} ${className}`}
      style={{ border: accent ? undefined : '1px solid rgba(255,255,255,0.07)' }}
    >
      {children}
    </div>
  );
}
