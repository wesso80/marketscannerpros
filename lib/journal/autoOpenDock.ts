import { JournalDockKey, TradeRowModel } from '@/types/journal';

export function getAutoOpenDockKeys(trade?: TradeRowModel): JournalDockKey[] {
  if (!trade) return [];
  if (trade.status === 'open' && trade.stop == null) return ['risk'];
  if (trade.status === 'closed' && trade.rMultiple == null) return ['labeling'];
  if (trade.status === 'closed' && Math.abs(Number(trade.rMultiple || 0)) >= 3) return ['review'];
  return [];
}

export function buildDockOpenState(keys: JournalDockKey[]): Record<JournalDockKey, boolean> {
  return {
    risk: keys.includes('risk'),
    review: keys.includes('review'),
    labeling: keys.includes('labeling'),
    evidence: keys.includes('evidence'),
  };
}
