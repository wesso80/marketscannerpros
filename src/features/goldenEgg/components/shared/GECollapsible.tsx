import { ReactNode } from 'react';

type GECollapsibleProps = {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

export default function GECollapsible({ header, children, defaultOpen = false }: GECollapsibleProps) {
  return (
    <details className="rounded-2xl border border-white/5 bg-slate-900/40 p-4" open={defaultOpen}>
      <summary className="cursor-pointer list-none">{header}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
