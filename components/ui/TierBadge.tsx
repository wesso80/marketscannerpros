type Tier = 'free' | 'pro' | 'pro_trader' | string;

type TierBadgeProps = {
  tier: Tier;
  compact?: boolean;
};

const TIER_META: Record<string, { label: string; bg: string; border: string; text: string }> = {
  pro_trader: {
    label: 'Pro Trader',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/40',
    text: 'text-amber-300',
  },
  pro: {
    label: 'Pro',
    bg: 'bg-emerald-500/12',
    border: 'border-emerald-500/35',
    text: 'text-emerald-300',
  },
  free: {
    label: 'Free',
    bg: 'bg-slate-800/60',
    border: 'border-slate-700',
    text: 'text-slate-400',
  },
};

function tierMeta(tier: Tier) {
  return TIER_META[tier] ?? { label: tier.toUpperCase(), bg: 'bg-slate-800/60', border: 'border-slate-700', text: 'text-slate-400' };
}

export default function TierBadge({ tier, compact = false }: TierBadgeProps) {
  const { label, bg, border, text } = tierMeta(tier);
  const size = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex items-center rounded border font-black uppercase tracking-[0.06em] ${bg} ${border} ${text} ${size}`}>
      {label}
    </span>
  );
}
