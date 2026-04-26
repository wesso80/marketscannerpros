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
    <section className={`rounded-lg border bg-slate-900/40 p-4 ${tone}`}>
      {(title || rightSlot) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {title}
          </h2>
          <div className="shrink-0">{rightSlot}</div>
        </div>
      )}
      {children}
    </section>
  );
}
