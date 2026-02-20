import { ReactNode } from 'react';

type GECardProps = {
  title?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'success';
};

export default function GECard({ title, rightSlot, children, variant = 'default' }: GECardProps) {
  const tone =
    variant === 'warning'
      ? 'border-amber-500/30'
      : variant === 'danger'
      ? 'border-rose-500/30'
      : variant === 'success'
      ? 'border-emerald-500/30'
      : 'border-white/5';

  return (
    <section className={`rounded-2xl border bg-slate-900/40 p-4 ${tone}`}>
      {(title || rightSlot) && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <div>{rightSlot}</div>
        </div>
      )}
      {children}
    </section>
  );
}
