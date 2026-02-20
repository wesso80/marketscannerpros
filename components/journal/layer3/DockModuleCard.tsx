import { ReactNode } from 'react';

type DockModuleCardProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export default function DockModuleCard({ title, open, onToggle, children }: DockModuleCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        <span className="text-xs text-slate-400">{open ? 'Collapse' : 'Expand'}</span>
      </button>
      {open && <div className="border-t border-white/5 px-4 py-3">{children}</div>}
    </div>
  );
}
