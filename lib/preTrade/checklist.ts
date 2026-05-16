/**
 * lib/preTrade/checklist.ts — Pre-Trade Checklist engine.
 *
 * Runs a standard set of gates against a proposed setup and returns a
 * recommendation (go / caution / no-go) with blocking + warning gates.
 *
 * Gates:
 *   - regime:         setup's preferred regime matches observed regime
 *   - evidence:       evidenceQuality >= threshold
 *   - exposure:       symbol/sector exposure under operator's caps
 *   - news_blackout:  no fresh adverse news within blackout window
 *   - data_freshness: contributing market data is real-time/delayed (not stale)
 *   - iv_bias:        playbook IV bias matches observed IV bucket
 *   - personal_cap:   today's trade count under operator's daily cap
 *
 * Recommendation rules:
 *   - any BLOCKING gate fails → 'no-go'
 *   - any WARNING gate fails  → 'caution'
 *   - all pass                → 'go'
 *
 * Boundary: RESEARCH/DECISION-SUPPORT only. No broker execution.
 */

import { q } from '@/lib/db';
import { getPlaybook } from '@/lib/playbooks';
import type { Playbook, PreferredRegime, IvBias } from '@/lib/playbooks';

export type Recommendation = 'go' | 'caution' | 'no-go';

export interface ChecklistInput {
  workspaceId: string;
  setupId?: number;
  symbol: string;
  sector?: string | null;
  playbookId?: string | null;
  observedRegime?: PreferredRegime;
  evidenceQuality?: number | null;            // 0..100
  ivBucket?: 'iv<30' | 'iv30-70' | 'iv>70' | 'iv-unknown';
  freshness?: 'real-time' | 'delayed' | 'stale' | 'missing';
  proposedSizePct?: number | null;            // % of account
  /** Optional: existing exposure data from caller (already-summed). */
  currentExposure?: { sameSymbolPct?: number; sameSectorPct?: number };
}

export interface GateResult {
  key: string;
  label: string;
  passed: boolean | null;        // null = not evaluated (input missing)
  severity: 'blocking' | 'warning';
  detail?: string;
}

export interface ChecklistResult {
  recommendation: Recommendation;
  gates: GateResult[];
  blockingGates: string[];
  warningGates: string[];
  rationale: string;
  playbook: Playbook | null;
}

const DEFAULT_LIMITS = {
  evidenceMin: 60,
  sameSymbolMaxPct: 5,
  sameSectorMaxPct: 25,
  dailyTradeCap: 5,
  newsBlackoutHours: 24,
};

function ivMatch(bias: IvBias, bucket: ChecklistInput['ivBucket']): boolean | null {
  if (!bucket || bucket === 'iv-unknown') return null;
  if (bias === 'iv-any') return true;
  if (bias === 'iv-low') return bucket === 'iv<30';
  if (bias === 'iv-high') return bucket === 'iv>70';
  return null;
}

async function fetchTodayTradeCount(workspaceId: string): Promise<number> {
  const rows = await q<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM edge_ledger_setups
      WHERE workspace_id = $1 AND status = 'taken'
        AND taken_at >= date_trunc('day', NOW())`,
    [workspaceId],
  );
  return Number(rows[0]?.count ?? '0');
}

async function fetchRecentAdverseNews(workspaceId: string, symbol: string, hours: number): Promise<boolean> {
  // news_events may not have a workspace_id concept; treat as global symbol-keyed.
  // We flag adverse if any news in window with sentiment < -0.3.
  // workspace_id param is reserved for future scoping.
  void workspaceId;
  const rows = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM news_events
      WHERE symbol = $1
        AND published_at >= NOW() - ($2 || ' hours')::interval
        AND COALESCE(sentiment, 0) < -0.3`,
    [symbol.toUpperCase(), String(hours)],
  );
  return Number(rows[0]?.n ?? '0') > 0;
}

export async function runChecklist(input: ChecklistInput, limits = DEFAULT_LIMITS): Promise<ChecklistResult> {
  const playbook = input.playbookId ? (getPlaybook(input.playbookId) ?? null) : null;

  const gates: GateResult[] = [];

  // 1. Regime gate
  if (playbook && input.observedRegime !== undefined) {
    const pass = playbook.preferredRegime === 'any' || playbook.preferredRegime === input.observedRegime;
    gates.push({
      key: 'regime',
      label: `Regime matches playbook (${playbook.preferredRegime})`,
      passed: pass,
      severity: 'warning',
      detail: pass ? undefined : `Observed regime: ${input.observedRegime}`,
    });
  } else {
    gates.push({ key: 'regime', label: 'Regime match', passed: null, severity: 'warning', detail: 'No playbook or regime provided' });
  }

  // 2. Evidence quality gate
  if (typeof input.evidenceQuality === 'number') {
    const pass = input.evidenceQuality >= limits.evidenceMin;
    gates.push({
      key: 'evidence',
      label: `Evidence Quality ≥ ${limits.evidenceMin}`,
      passed: pass,
      severity: 'blocking',
      detail: pass ? undefined : `EQ = ${input.evidenceQuality.toFixed(0)}`,
    });
  } else {
    gates.push({ key: 'evidence', label: 'Evidence Quality', passed: null, severity: 'blocking', detail: 'Not provided' });
  }

  // 3. Exposure gate
  if (input.currentExposure) {
    const sym = input.currentExposure.sameSymbolPct ?? 0;
    const sec = input.currentExposure.sameSectorPct ?? 0;
    const symOk = sym + (input.proposedSizePct ?? 0) <= limits.sameSymbolMaxPct;
    const secOk = sec + (input.proposedSizePct ?? 0) <= limits.sameSectorMaxPct;
    const pass = symOk && secOk;
    gates.push({
      key: 'exposure',
      label: `Exposure caps (sym ≤ ${limits.sameSymbolMaxPct}%, sector ≤ ${limits.sameSectorMaxPct}%)`,
      passed: pass,
      severity: 'blocking',
      detail: pass ? undefined : `sym=${sym.toFixed(1)}% sec=${sec.toFixed(1)}%`,
    });
  } else {
    gates.push({ key: 'exposure', label: 'Exposure caps', passed: null, severity: 'blocking', detail: 'Exposure data not provided' });
  }

  // 4. News blackout
  try {
    const adverse = await fetchRecentAdverseNews(input.workspaceId, input.symbol, limits.newsBlackoutHours);
    gates.push({
      key: 'news_blackout',
      label: `No adverse news in last ${limits.newsBlackoutHours}h`,
      passed: !adverse,
      severity: 'warning',
      detail: adverse ? 'Recent adverse news detected' : undefined,
    });
  } catch {
    gates.push({ key: 'news_blackout', label: 'News blackout check', passed: null, severity: 'warning', detail: 'news_events table unavailable' });
  }

  // 5. Data freshness
  if (input.freshness) {
    const pass = input.freshness === 'real-time' || input.freshness === 'delayed';
    gates.push({
      key: 'data_freshness',
      label: 'Market data is fresh',
      passed: pass,
      severity: 'blocking',
      detail: pass ? undefined : `Freshness: ${input.freshness}`,
    });
  } else {
    gates.push({ key: 'data_freshness', label: 'Market data freshness', passed: null, severity: 'blocking', detail: 'Freshness not provided' });
  }

  // 6. IV bias
  if (playbook) {
    const m = ivMatch(playbook.ivBias, input.ivBucket);
    gates.push({
      key: 'iv_bias',
      label: `IV bias matches playbook (${playbook.ivBias})`,
      passed: m,
      severity: 'warning',
      detail: m === false ? `IV bucket: ${input.ivBucket}` : undefined,
    });
  } else {
    gates.push({ key: 'iv_bias', label: 'IV bias', passed: null, severity: 'warning', detail: 'No playbook' });
  }

  // 7. Personal daily cap
  try {
    const todayCount = await fetchTodayTradeCount(input.workspaceId);
    const pass = todayCount < limits.dailyTradeCap;
    gates.push({
      key: 'personal_cap',
      label: `Daily trade cap (${limits.dailyTradeCap})`,
      passed: pass,
      severity: 'blocking',
      detail: pass ? `Today: ${todayCount}/${limits.dailyTradeCap}` : `Cap reached: ${todayCount}/${limits.dailyTradeCap}`,
    });
  } catch {
    gates.push({ key: 'personal_cap', label: 'Daily trade cap', passed: null, severity: 'blocking', detail: 'Could not read ledger' });
  }

  const blocking = gates.filter((g) => g.severity === 'blocking' && g.passed === false).map((g) => g.key);
  const warning = gates.filter((g) => g.severity === 'warning' && g.passed === false).map((g) => g.key);

  let recommendation: Recommendation = 'go';
  if (blocking.length > 0) recommendation = 'no-go';
  else if (warning.length > 0) recommendation = 'caution';

  const rationale =
    recommendation === 'no-go' ? `Blocked by ${blocking.length} gate(s): ${blocking.join(', ')}` :
    recommendation === 'caution' ? `Proceed with caution: ${warning.length} warning(s): ${warning.join(', ')}` :
    'All evaluated gates passed.';

  return {
    recommendation,
    gates,
    blockingGates: blocking,
    warningGates: warning,
    rationale,
    playbook,
  };
}

export async function persistChecklist(input: ChecklistInput, result: ChecklistResult, operatorAction?: 'taken' | 'skipped' | 'pending', overrideReason?: string): Promise<number> {
  const g = (key: string): boolean | null => {
    const found = result.gates.find((gg) => gg.key === key);
    return found ? found.passed : null;
  };
  const rows = await q<{ id: number }>(
    `INSERT INTO pre_trade_checklists
       (workspace_id, setup_id, symbol, playbook,
        gate_regime, gate_evidence, gate_exposure, gate_news_blackout,
        gate_data_freshness, gate_iv_bias, gate_personal_cap,
        recommendation, blocking_gates, warning_gates, rationale,
        operator_action, operator_overrode, override_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
    [
      input.workspaceId, input.setupId ?? null, input.symbol.toUpperCase(), input.playbookId ?? null,
      g('regime'), g('evidence'), g('exposure'), g('news_blackout'),
      g('data_freshness'), g('iv_bias'), g('personal_cap'),
      result.recommendation, result.blockingGates, result.warningGates, result.rationale,
      operatorAction ?? 'pending',
      Boolean(overrideReason && operatorAction === 'taken' && result.recommendation === 'no-go'),
      overrideReason ?? null,
    ],
  );
  return rows[0]?.id ?? 0;
}
