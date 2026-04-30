import type { ReactNode } from 'react';

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({ title = 'No data', description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-950/30 px-6 py-10 text-center ${className}`}>
      <div className="mb-1 text-sm font-bold text-slate-300">{title}</div>
      {description && <p className="max-w-xs text-xs leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
