type StatusPillProps = {
  label: string;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'slate';
  compact?: boolean;
  title?: string;
};

const TONES: Record<NonNullable<StatusPillProps['tone']>, { bg: string; border: string; text: string }> = {
  green:  { bg: 'bg-emerald-500/12', border: 'border-emerald-500/35', text: 'text-emerald-300' },
  amber:  { bg: 'bg-amber-500/12',   border: 'border-amber-500/35',   text: 'text-amber-300'   },
  red:    { bg: 'bg-red-500/12',     border: 'border-red-500/35',     text: 'text-red-300'     },
  blue:   { bg: 'bg-blue-500/12',    border: 'border-blue-500/35',    text: 'text-blue-300'    },
  purple: { bg: 'bg-purple-500/12',  border: 'border-purple-500/35',  text: 'text-purple-300'  },
  slate:  { bg: 'bg-slate-800/60',   border: 'border-slate-700',      text: 'text-slate-400'   },
};

export default function StatusPill({ label, tone = 'slate', compact = false, title }: StatusPillProps) {
  const { bg, border, text } = TONES[tone];
  const size = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border font-black uppercase tracking-[0.06em] ${bg} ${border} ${text} ${size}`}
    >
      {label}
    </span>
  );
}
