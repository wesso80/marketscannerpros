import { ReactNode } from 'react';
import { EvidenceModuleKey } from '@/types/optionsScanner';

type EvidenceModuleCardProps = {
  k: EvidenceModuleKey;
  title: string;
  score?: number;
  statusChips?: string[];
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export default function EvidenceModuleCard({ title, score, statusChips = [], open, onToggle, children }: EvidenceModuleCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">{title}</span>
          {typeof score === 'number' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">{score}</span>}
          {statusChips.map((chip) => (
            <span key={chip} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">{chip}</span>
          ))}
        </div>
        <span className="text-xs text-slate-400">{open ? 'Collapse' : 'Expand'}</span>
      </button>
      {open && <div className="border-t border-white/5 px-4 py-3">{children}</div>}
    </div>
  );
}
