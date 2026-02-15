import { q } from '@/lib/db';
import { EvolutionCycleOutput, EvolutionSample, OutcomeLabel } from './evolution-engine';

export interface EvolutionAdjustmentRow {
  id: number;
  workspace_id: string;
  symbol_group: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  learning_period: string;
  confidence: number;
  changes_json: Array<{ parameter: string; old: number; new: number; reason: string }>;
  metrics_json: Record<string, unknown>;
  adjustments_json: Record<string, unknown>;
  created_at: string;
}

function normalizeOutcome(outcome: string): OutcomeLabel {
  const value = (outcome || '').toLowerCase();
  if (value === 'win') return 'WIN';
  if (value === 'loss') return 'LOSS';
  if (value === 'breakeven') return 'SCRATCH';
  return 'NO_FOLLOW_THROUGH';
}

function classifyOutcome(row: { outcome?: string | null; setup?: string | null; strategy?: string | null; r_multiple?: number | string | null }): OutcomeLabel {
  const base = normalizeOutcome(String(row.outcome || ''));
  const setupText = String(row.setup || '').toLowerCase();
  const strategyText = String(row.strategy || '').toLowerCase();
  const text = `${setupText} ${strategyText}`;
  const riskMultiple = Number.isFinite(Number(row.r_multiple)) ? Number(row.r_multiple) : 0;

  if (/forced|fomo|revenge|chase/.test(text)) return 'FORCED_TRADE';
  if (/late|chased|late_entry/.test(text)) return 'LATE_ENTRY';
  if (/early|cut_early|early_exit/.test(text)) return 'EARLY_EXIT';
  if (base === 'LOSS' && riskMultiple > -0.25) return 'NO_FOLLOW_THROUGH';
  return base;
}

function inferTimeOfDay(timestamp: string | null): EvolutionSample['timeOfDay'] {
  if (!timestamp) return 'MIDDAY';
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 13 && hour < 16) return 'OPEN';
  if (hour >= 16 && hour < 19) return 'MIDDAY';
  if (hour >= 19 && hour < 21) return 'CLOSE';
  return 'AFTERHOURS';
}

function inferStateFromSetup(setup: string | null): string {
  const text = (setup || '').toLowerCase();
  if (/armed|ready/.test(text)) return 'ARMED';
  if (/stalk|forming/.test(text)) return 'STALK';
  if (/watch/.test(text)) return 'WATCH';
  return 'WATCH';
}

function inferTransitionPath(setup: string | null): string {
  const text = (setup || '').toLowerCase();
  if (/fast|jump/.test(text)) return 'SCAN>ARMED>EXECUTE';
  if (/watch|stalk|armed/.test(text)) return 'WATCH>STALK>ARMED>EXECUTE';
  return 'WATCH>STALK>ARMED>EXECUTE';
}

function inferPlaybook(strategy: string | null): string {
  return (strategy || 'momentum_pullback').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function inferSymbolGroup(symbol: string): string {
  const s = symbol.toUpperCase();
  if (/^(AAPL|MSFT|NVDA|GOOGL|AMZN|META|TSLA|AMD)$/.test(s)) return 'Tech Large Cap';
  if (/^(JPM|BAC|GS|MS)$/.test(s)) return 'Financials';
  if (/^(XOM|CVX|COP)$/.test(s)) return 'Energy';
  return 'General';
}

export async function loadEvolutionSamples(
  workspaceId: string,
  symbolGroup?: string,
  limit = 400
): Promise<EvolutionSample[]> {
  const capped = Math.max(30, Math.min(1000, limit));

  const rows = await q<any>(
    `SELECT symbol, outcome, r_multiple, strategy, setup, trade_date::text AS trade_date, created_at::text AS created_at
     FROM journal_entries
     WHERE workspace_id = $1
       AND outcome IS NOT NULL
     ORDER BY COALESCE(created_at, NOW()) DESC
     LIMIT $2`,
    [workspaceId, capped]
  );

  const samples = rows.map((row) => {
    const outcome = classifyOutcome(row);
    const riskMultiple = Number.isFinite(Number(row.r_multiple)) ? Number(row.r_multiple) : (outcome === 'WIN' ? 1.2 : outcome === 'LOSS' ? -1 : 0);
    const setupText = String(row.setup || '').toLowerCase();
    const strategyText = String(row.strategy || '').toLowerCase();
    const text = `${setupText} ${strategyText}`;

    const stateAlignment = Math.max(0, Math.min(1, 0.55 + (riskMultiple > 0 ? 0.2 : -0.12)));
    const flowQuality = Math.max(0, Math.min(1, 0.52 + (/(flow|momentum|trend|gamma|oi)/i.test(strategyText) ? 0.2 : 0)));
    const timingPrecision = Math.max(0, Math.min(1, 0.5 + (/late/.test(text) ? -0.2 : /(open|break|reclaim)/.test(text) ? 0.12 : 0)));
    const volatilityMatch = Math.max(0, Math.min(1, 0.55 + (/(reversion|range)/i.test(strategyText) ? -0.05 : 0.08)));
    const executionQuality = Math.max(0, Math.min(1, 0.5 + (riskMultiple * 0.15) + (/forced|fomo|revenge/.test(text) ? -0.2 : 0)));

    const holdingMinutes = /scalp|0dte/.test(text)
      ? 20
      : /swing|weekly|position|leaps/.test(text)
        ? 240
        : 45;

    return {
      symbol: String(row.symbol || '').toUpperCase(),
      symbolGroup: inferSymbolGroup(String(row.symbol || '')),
      state: inferStateFromSetup(row.setup),
      transitionPath: inferTransitionPath(row.setup),
      playbook: inferPlaybook(row.strategy),
      outcome,
      riskMultiple,
      holdingMinutes,
      timeOfDay: inferTimeOfDay(row.created_at || row.trade_date),
      stateAlignment,
      flowQuality,
      timingPrecision,
      volatilityMatch,
      executionQuality,
    } as EvolutionSample;
  });

  return symbolGroup
    ? samples.filter((sample) => sample.symbolGroup.toLowerCase() === symbolGroup.toLowerCase())
    : samples;
}

export async function saveEvolutionAdjustment(
  workspaceId: string,
  cadence: 'daily' | 'weekly' | 'monthly',
  output: EvolutionCycleOutput
): Promise<void> {
  await q(
    `INSERT INTO evolution_adjustments (
      workspace_id,
      symbol_group,
      cadence,
      learning_period,
      confidence,
      changes_json,
      metrics_json,
      adjustments_json
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
    [
      workspaceId,
      output.symbol_group,
      cadence,
      output.learning_period,
      output.confidence,
      JSON.stringify(output.changes),
      JSON.stringify(output.metrics),
      JSON.stringify(output.adjustments),
    ]
  );
}

export async function getLatestEvolutionAdjustments(
  workspaceId: string,
  limit = 10
): Promise<EvolutionAdjustmentRow[]> {
  const capped = Math.max(1, Math.min(100, limit));
  return q<EvolutionAdjustmentRow>(
    `SELECT *
     FROM evolution_adjustments
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, capped]
  );
}
