'use client';

import { useState } from 'react';
import TradeIntelligenceTab from '@/components/journal/drawer/tabs/TradeIntelligenceTab';
import TradeNotesTab from '@/components/journal/drawer/tabs/TradeNotesTab';
import TradeOverviewTab from '@/components/journal/drawer/tabs/TradeOverviewTab';
import TradeSnapshotsTab from '@/components/journal/drawer/tabs/TradeSnapshotsTab';
import { TradeModel } from '@/types/journal';

type TradeDrawerProps = {
  open: boolean;
  trade?: TradeModel;
  onClose: () => void;
  onRequestCloseTrade: () => void;
  onRequestSnapshot: () => void;
};

type TabKey = 'overview' | 'intelligence' | 'snapshots' | 'notes';

export default function TradeDrawer({ open, trade, onClose, onRequestCloseTrade, onRequestSnapshot }: TradeDrawerProps) {
  const [tab, setTab] = useState<TabKey>('overview');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-slate-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400">Trade Drawer</div>
            <div className="text-lg font-semibold text-slate-100">{trade?.symbol || 'New Trade'}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onRequestSnapshot} className="rounded bg-white/10 px-3 py-1 text-sm text-slate-100">Snapshot</button>
            <button onClick={onRequestCloseTrade} className="rounded bg-rose-500/20 px-3 py-1 text-sm text-rose-200">Close</button>
            <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-sm text-slate-100">Done</button>
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          {(['overview', 'intelligence', 'snapshots', 'notes'] as TabKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded px-3 py-1.5 text-sm ${tab === key ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-slate-100'}`}
            >
              {key}
            </button>
          ))}
        </div>

        {tab === 'overview' && <TradeOverviewTab trade={trade} />}
        {tab === 'intelligence' && <TradeIntelligenceTab trade={trade} />}
        {tab === 'snapshots' && <TradeSnapshotsTab trade={trade} />}
        {tab === 'notes' && <TradeNotesTab trade={trade} />}
      </div>
    </div>
  );
}
