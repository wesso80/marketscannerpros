import { q } from '@/lib/db';
import { randomUUID } from 'crypto';
import type { DecisionAssessment } from './decisionDesk';
export const DECISION_ACTIONS = ['WATCH', 'DECLINED', 'FOLLOW_UP'] as const;
export type DecisionAction = typeof DECISION_ACTIONS[number];
export type DecisionRecord = { id: string; request_id: string; symbol: string; market: string; strategy_id: string;
  action: DecisionAction; note: string; evidence: { assessment: DecisionAssessment; account: unknown; macro: unknown };
  created_at: string; reference_price: number | null; reference_at: string | null };
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS admin_decision_records (
  id UUID PRIMARY KEY, workspace_id TEXT NOT NULL, request_id UUID NOT NULL,
  symbol TEXT NOT NULL, market TEXT NOT NULL, strategy_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('WATCH','DECLINED','FOLLOW_UP')), note TEXT NOT NULL,
  evidence JSONB NOT NULL, reference_price DOUBLE PRECISION, reference_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(workspace_id, request_id)
)`;
/** Initialization happens only on explicit POST, never on a read request. */
export async function saveDecision(workspaceId: string, input: {
  requestId: string; action: DecisionAction; note: string; assessment: DecisionAssessment; account: unknown; macro: unknown;
  referencePrice: number | null; referenceAt: string | null;
}): Promise<DecisionRecord> {
  await q(CREATE_TABLE);
  const rows = await q<DecisionRecord>(`INSERT INTO admin_decision_records
    (id, workspace_id, request_id, symbol, market, strategy_id, action, note, evidence, reference_price, reference_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
    ON CONFLICT (workspace_id, request_id) DO NOTHING RETURNING *`,
    [randomUUID(), workspaceId, input.requestId, input.assessment.symbol, input.assessment.market, input.assessment.strategyId,
      input.action, input.note, JSON.stringify({ assessment: input.assessment, account: input.account, macro: input.macro }), input.referencePrice, input.referenceAt]);
  if (rows[0]) return rows[0];
  const existing = await q<DecisionRecord>('SELECT * FROM admin_decision_records WHERE workspace_id = $1 AND request_id = $2', [workspaceId, input.requestId]);
  if (!existing[0]) throw new Error('Decision save unavailable');
  if (existing[0].evidence.assessment.evidenceId !== input.assessment.evidenceId || existing[0].action !== input.action || existing[0].note !== input.note) throw new Error('Request ID already used for another decision');
  return existing[0];
}
export async function readDecisions(workspaceId: string) {
  try { return { available: true, records: await q<DecisionRecord>('SELECT id, request_id, symbol, market, strategy_id, action, note, evidence, reference_price, reference_at, created_at FROM admin_decision_records WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100', [workspaceId]) }; }
  catch (error) {
    if ((error as {code?:string}).code === '42P01') return { available: false, records: [] as DecisionRecord[], message: 'Decision history initializes on the first explicit save.' };
    throw error;
  }
}
/** Calendar-day review clock, independent of entry or fill assumptions. */
export function reviewCheckpoints(createdAt: string | Date, nowMs = Date.now()) {
  return [42,84].map(days => { const due = new Date(new Date(createdAt).getTime() + days * 86_400_000);
    return { horizonDays: days, dueAt: due.toISOString(), status: due.getTime() > nowMs ? 'PENDING' : 'DUE', observation: null,
      note: 'Research review checkpoint; no fill, exit or realized return is assumed.' }; });
}
