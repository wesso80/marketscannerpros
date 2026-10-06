import type { ReactNode } from 'react';
export default function SavedRuleGroup({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  if (count === 1) return <>{children}</>;
  return <details className="rounded border border-slate-700 p-2"><summary className="min-h-10 cursor-pointer text-sm">{label} · {count} saved rules</summary><p className="py-2 text-xs text-slate-400">These are separate saved rules. Expand each row’s actions to manage it.</p>{children}</details>;
}
