'use client';

import { readOperatorState } from '@/lib/operatorState';

/**
 * Shared auto-log helper for all scanner/tool pages.
 * Fires POST /api/journal/auto-log with execution-engine fields.
 * 
 * Returns { ok: boolean; entryId?: number; error?: string }
 */
export interface AutoLogPayload {
  symbol: string;
  conditionType: string;
  conditionMet: string;
  triggerPrice: number;
  source: string;
  assetClass?: 'equity' | 'crypto' | 'forex' | 'commodity';
  atr?: number | null;
  marketRegime?: string;
  marketMood?: string;
  derivativesBias?: string;
  sectorStrength?: string;
}

export async function fireAutoLog(payload: AutoLogPayload): Promise<{ ok: boolean; entryId?: number; error?: string }> {
  try {
    const op = readOperatorState();
    const res = await fetch('/api/journal/auto-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        triggeredAt: new Date().toISOString(),
        operatorMode: op.mode,
        operatorBias: op.bias,
        operatorRisk: op.risk,
        operatorEdge: op.edge,
        marketRegime: payload.marketRegime || 'Trend',
        marketMood: payload.marketMood || (op.action === 'EXECUTE' ? 'Action Ready' : op.action === 'PREP' ? 'Building' : 'Defensive'),
        derivativesBias: payload.derivativesBias || op.bias,
        sectorStrength: payload.sectorStrength || op.next,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, entryId: data?.entryId };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Auto-log failed' };
  }
}
