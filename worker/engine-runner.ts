import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import {
  claimNextEngineJob,
  completeEngineJob,
  failEngineJob,
  requeueStaleProcessingJobs,
} from '../lib/engine/jobQueue';
import { q } from '../lib/db';

type EngineHandler = (job: {
  id: number;
  workspace_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}) => Promise<Record<string, unknown>>;

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asFinite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSymbol(value: unknown): string {
  return asString(value).trim().toUpperCase().slice(0, 24);
}

async function ensureJournalSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      trade_date DATE NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
      trade_type VARCHAR(20) NOT NULL CHECK (trade_type IN ('Spot', 'Options', 'Futures', 'Margin')),
      option_type VARCHAR(10),
      strike_price DECIMAL(18, 8),
      expiration_date DATE,
      quantity DECIMAL(18, 8) NOT NULL,
      entry_price DECIMAL(18, 8) NOT NULL,
      exit_price DECIMAL(18, 8),
      exit_date DATE,
      pl DECIMAL(18, 8),
      pl_percent DECIMAL(10, 4),
      strategy VARCHAR(100),
      setup VARCHAR(100),
      notes TEXT,
      emotions TEXT,
      outcome VARCHAR(20) CHECK (outcome IN ('win', 'loss', 'breakeven', 'open')),
      tags TEXT[],
      is_open BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace ON journal_entries (workspace_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries (workspace_id, trade_date DESC)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS target DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_amount DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS r_multiple DECIMAL(10,4)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS planned_rr DECIMAL(10,4)`);
}

function eventId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function emitEngineEvent(input: {
  workspaceId: string;
  eventType: string;
  route: string;
  module: string;
  payload: Record<string, unknown>;
}) {
  const eventData = {
    event_id: eventId('evt_engine'),
    event_type: input.eventType,
    event_version: 1,
    occurred_at: new Date().toISOString(),
    actor: {
      actor_type: 'system',
      user_id: null,
      anonymous_id: null,
      session_id: null,
    },
    context: {
      tenant_id: 'msp',
      app: { name: 'MarketScannerPros', env: process.env.NODE_ENV || 'prod' },
      page: { route: input.route, module: input.module },
    },
    payload: input.payload,
  };

  await q(
    `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [
      input.workspaceId,
      input.eventType,
      JSON.stringify(eventData),
      JSON.stringify({ route: input.route, module: input.module }),
    ]
  );
}

async function handleRecomputePresence(job: {
  id: number;
  workspace_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}): Promise<Record<string, unknown>> {
  const currentRows = await q<{ context_state: any }>(
    `SELECT context_state
       FROM operator_state
      WHERE workspace_id = $1
      LIMIT 1`,
    [job.workspace_id]
  );

  const currentContext = currentRows[0]?.context_state || {};
  const nextContext = {
    ...currentContext,
    engine: {
      ...(currentContext.engine || {}),
      lastPresenceRecomputeAt: new Date().toISOString(),
      lastPresenceRecomputeJobId: job.id,
      lastPresenceRecomputeAttempts: job.attempts,
      lastPresenceRecomputePayload: job.payload,
    },
  };

  await q(
    `INSERT INTO operator_state (workspace_id, context_state, source_module, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (workspace_id)
     DO UPDATE SET
       context_state = $2::jsonb,
       source_module = $3,
       updated_at = NOW()`,
    [job.workspace_id, JSON.stringify(nextContext), 'engine_runner']
  );

  await emitEngineEvent({
    workspaceId: job.workspace_id,
    eventType: 'operator.recompute_presence.completed',
    route: '/worker/engine',
    module: 'engine_runner',
    payload: {
      source: 'engine_worker',
      job_type: 'operator.recompute_presence',
      job_id: job.id,
      attempts: job.attempts,
      requested_by: job.payload?.requestedBy || null,
      reason: job.payload?.reason || null,
    },
  });

  return {
    ok: true,
    action: 'presence_recompute',
    workspaceId: job.workspace_id,
    updated: true,
  };
}

function buildCoachRecommendations(args: {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  sampleSize: number;
}): Array<{ action: string; detail: string; priority: 'high' | 'medium' }> {
  const recommendations: Array<{ action: string; detail: string; priority: 'high' | 'medium' }> = [];

  if (args.sampleSize < 5) {
    recommendations.push({
      priority: 'high',
      action: 'increase_sample_size',
      detail: 'Collect at least 5-10 closed trades before adjusting strategy parameters.',
    });
  }

  if (args.avgLoss > 0 && args.avgWin > 0 && args.avgWin < args.avgLoss) {
    recommendations.push({
      priority: 'high',
      action: 'improve_reward_to_risk',
      detail: 'Average loss is larger than average win. Tighten invalidation or extend target structure.',
    });
  }

  if (args.winRate < 45) {
    recommendations.push({
      priority: 'medium',
      action: 'tighten_entry_filter',
      detail: 'Win rate is below 45%. Increase selectivity on setup quality before execution.',
    });
  }

  if (args.expectancy > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'keep_size_consistent',
      detail: 'Expectancy is positive. Keep sizing stable and avoid emotional scaling.',
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      priority: 'medium',
      action: 'continue_process_discipline',
      detail: 'Maintain process consistency and review another batch after additional closures.',
    });
  }

  return recommendations.slice(0, 3);
}

async function handleCoachRecompute(job: {
  id: number;
  workspace_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}): Promise<Record<string, unknown>> {
  const closedRows = await q<{ pl: number | null; outcome: string | null }>(
    `SELECT pl, outcome
       FROM journal_entries
      WHERE workspace_id = $1
        AND is_open = false
      ORDER BY COALESCE(exit_date, trade_date) DESC NULLS LAST
      LIMIT 20`,
    [job.workspace_id]
  );

  const sampleSize = closedRows.length;
  const wins = closedRows.filter((row) => Number(row.pl || 0) > 0 || row.outcome === 'win');
  const losses = closedRows.filter((row) => Number(row.pl || 0) < 0 || row.outcome === 'loss');
  const winRate = sampleSize > 0 ? (wins.length / sampleSize) * 100 : 0;
  const avgWin = wins.length > 0
    ? wins.reduce((sum, row) => sum + Math.max(0, Number(row.pl || 0)), 0) / wins.length
    : 0;
  const avgLoss = losses.length > 0
    ? Math.abs(losses.reduce((sum, row) => sum + Math.min(0, Number(row.pl || 0)), 0) / losses.length)
    : 0;
  const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

  const recommendations = buildCoachRecommendations({ winRate, avgWin, avgLoss, expectancy, sampleSize });
  const symbol = normalizeSymbol(job.payload.symbol);
  const workflowId = asString(job.payload.decisionPacketId || `wf_engine_coach_${job.id}`).slice(0, 120);

  for (const rec of recommendations) {
    const taskId = symbol
      ? `coach_${symbol.toLowerCase()}_${rec.action}`
      : `coach_global_${rec.action}`;
    const event = {
      event_id: eventId('evt_strategy_rule_suggested'),
      event_type: 'strategy.rule.suggested',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      actor: {
        actor_type: 'system',
        user_id: null,
        anonymous_id: null,
        session_id: null,
      },
      context: {
        tenant_id: 'msp',
        app: { name: 'MarketScannerPros', env: process.env.NODE_ENV || 'prod' },
        page: { route: '/worker/engine', module: 'coach_recompute' },
      },
      entity: {
        entity_type: 'coach',
        entity_id: taskId,
        symbol: symbol || undefined,
        asset_class: 'mixed',
      },
      correlation: {
        workflow_id: workflowId,
        parent_event_id: null,
      },
      payload: {
        task_id: taskId,
        action: rec.action,
        detail: rec.detail,
        priority: rec.priority,
        source: 'engine.coach',
        summary: {
          sample_size: sampleSize,
          win_rate: Number(winRate.toFixed(2)),
          avg_win: Number(avgWin.toFixed(2)),
          avg_loss: Number(avgLoss.toFixed(2)),
          expectancy: Number(expectancy.toFixed(2)),
        },
      },
    };

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [
        job.workspace_id,
        'strategy.rule.suggested',
        JSON.stringify(event),
        JSON.stringify({ route: '/worker/engine', module: 'coach_recompute' }),
      ]
    );
  }

  const stateRows = await q<{ context_state: unknown }>(
    `SELECT context_state FROM operator_state WHERE workspace_id = $1 LIMIT 1`,
    [job.workspace_id]
  );
  const currentContext = asObject(stateRows[0]?.context_state);
  const nextContext = {
    ...currentContext,
    coach: {
      ...(asObject(currentContext.coach) || {}),
      lastRecomputeAt: new Date().toISOString(),
      fromJobId: job.id,
      sampleSize,
      winRate: Number(winRate.toFixed(2)),
      expectancy: Number(expectancy.toFixed(2)),
      recommendations,
    },
  };

  await q(
    `INSERT INTO operator_state (workspace_id, context_state, source_module, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (workspace_id)
     DO UPDATE SET
       context_state = $2::jsonb,
       source_module = $3,
       updated_at = NOW()`,
    [job.workspace_id, JSON.stringify(nextContext), 'engine_runner']
  );

  await emitEngineEvent({
    workspaceId: job.workspace_id,
    eventType: 'coach.recompute.completed',
    route: '/worker/engine',
    module: 'coach_recompute',
    payload: {
      source: 'engine_worker',
      job_type: 'coach.recompute',
      job_id: job.id,
      attempts: job.attempts,
      recommendation_count: recommendations.length,
      sample_size: sampleSize,
      symbol: symbol || null,
    },
  });

  return {
    ok: true,
    action: 'coach_recompute',
    workspaceId: job.workspace_id,
    recommendations: recommendations.length,
    sampleSize,
  };
}

async function handleJournalPrefill(job: {
  id: number;
  workspace_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}): Promise<Record<string, unknown>> {
  await ensureJournalSchema();

  const planId = asString(job.payload.planId).trim();
  const payloadSymbol = normalizeSymbol(job.payload.symbol);
  if (!planId && !payloadSymbol) {
    throw new Error('journal.prefill requires planId or symbol');
  }

  const planRows = planId
    ? await q<{ plan_id: string; symbol: string; decision_packet_id: string | null; draft_payload: unknown }>(
      `SELECT plan_id, symbol, decision_packet_id, draft_payload
         FROM trade_plans
        WHERE workspace_id = $1 AND plan_id = $2
        LIMIT 1`,
      [job.workspace_id, planId]
    )
    : await q<{ plan_id: string; symbol: string; decision_packet_id: string | null; draft_payload: unknown }>(
      `SELECT plan_id, symbol, decision_packet_id, draft_payload
         FROM trade_plans
        WHERE workspace_id = $1 AND symbol = $2
        ORDER BY updated_at DESC
        LIMIT 1`,
      [job.workspace_id, payloadSymbol]
    );

  const plan = planRows[0];
  if (!plan) {
    await emitEngineEvent({
      workspaceId: job.workspace_id,
      eventType: 'journal.prefill.skipped',
      route: '/worker/engine',
      module: 'journal_prefill',
      payload: {
        source: 'engine_worker',
        reason: 'trade_plan_not_found',
        plan_id: planId || null,
        symbol: payloadSymbol || null,
      },
    });

    return {
      ok: true,
      action: 'journal_prefill',
      workspaceId: job.workspace_id,
      inserted: false,
      reason: 'trade_plan_not_found',
    };
  }

  const draft = asObject(plan.draft_payload);
  const symbol = normalizeSymbol(plan.symbol || payloadSymbol || draft.symbol);
  const planTag = `plan_${plan.plan_id}`;

  const dedupeRows = await q<{ id: number }>(
    `SELECT id
       FROM journal_entries
      WHERE workspace_id = $1
        AND symbol = $2
        AND is_open = true
        AND outcome = 'open'
        AND (
          COALESCE(tags, ARRAY[]::text[]) @> ARRAY[$3]::text[]
          OR notes ILIKE $4
        )
      LIMIT 1`,
    [job.workspace_id, symbol, planTag, `%${plan.plan_id}%`]
  );

  if (dedupeRows.length > 0) {
    await emitEngineEvent({
      workspaceId: job.workspace_id,
      eventType: 'journal.prefill.skipped',
      route: '/worker/engine',
      module: 'journal_prefill',
      payload: {
        source: 'engine_worker',
        reason: 'journal_draft_exists',
        plan_id: plan.plan_id,
        symbol,
      },
    });

    return {
      ok: true,
      action: 'journal_prefill',
      workspaceId: job.workspace_id,
      inserted: false,
      reason: 'journal_draft_exists',
    };
  }

  const risk = asObject(draft.risk);
  const setup = asObject(draft.setup);
  const entry = asObject(draft.entry);
  const bias = asString(setup.bias).toLowerCase();
  const side = bias === 'short' ? 'SHORT' : 'LONG';
  const entryPrice = asFinite(entry.zone) ?? 0;
  const notes = [
    'Auto-created from focus plan draft.',
    `Plan: ${plan.plan_id}`,
    `Decision Packet: ${plan.decision_packet_id || 'n/a'}`,
    `Timeframe: ${asString(draft.timeframe) || 'n/a'}`,
    `Risk %: ${asFinite(risk.risk_pct) ?? 'n/a'}`,
    `Signal Source: ${asString(setup.signal_source) || 'focus.creator'}`,
  ].join('\n');

  const tags = ['auto_plan_draft', `workflow_engine_${job.id}`, planTag];
  if (plan.decision_packet_id) {
    tags.push(`dp_${plan.decision_packet_id}`);
  }

  const inserted = await q<{ id: number }>(
    `INSERT INTO journal_entries (
      workspace_id, trade_date, symbol, side, trade_type, quantity, entry_price,
      strategy, setup, notes, emotions, outcome, tags, is_open,
      stop_loss, target, planned_rr
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17
    )
    RETURNING id`,
    [
      job.workspace_id,
      new Date().toISOString().slice(0, 10),
      symbol,
      side,
      'Spot',
      1,
      entryPrice,
      asString(setup.signal_source || 'focus_plan').slice(0, 100),
      asString(setup.thesis || 'focus_draft').slice(0, 100),
      notes,
      '',
      'open',
      tags,
      true,
      asFinite(risk.invalidation),
      Array.isArray(risk.targets) ? asFinite(risk.targets[0]) : null,
      null,
    ]
  );

  await q(
    `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [
      job.workspace_id,
      'journal.draft.created',
      JSON.stringify({
        event_id: eventId('evt_journal_draft_created'),
        event_type: 'journal.draft.created',
        event_version: 1,
        occurred_at: new Date().toISOString(),
        actor: {
          actor_type: 'system',
          user_id: null,
          anonymous_id: null,
          session_id: null,
        },
        context: {
          tenant_id: 'msp',
          app: { name: 'MarketScannerPros', env: process.env.NODE_ENV || 'prod' },
          page: { route: '/worker/engine', module: 'journal_prefill' },
        },
        entity: {
          entity_type: 'journal',
          entity_id: String(inserted[0]?.id || ''),
          symbol,
          asset_class: 'mixed',
        },
        correlation: {
          workflow_id: `wf_engine_journal_${job.id}`,
          parent_event_id: null,
        },
        payload: {
          source: 'engine.journal_prefill',
          plan_id: plan.plan_id,
          decision_packet_id: plan.decision_packet_id,
          journal_entry_id: inserted[0]?.id || null,
          symbol,
        },
      }),
      JSON.stringify({ route: '/worker/engine', module: 'journal_prefill' }),
    ]
  );

  await emitEngineEvent({
    workspaceId: job.workspace_id,
    eventType: 'journal.prefill.completed',
    route: '/worker/engine',
    module: 'journal_prefill',
    payload: {
      source: 'engine_worker',
      job_type: 'journal.prefill',
      job_id: job.id,
      attempts: job.attempts,
      plan_id: plan.plan_id,
      journal_entry_id: inserted[0]?.id || null,
      symbol,
    },
  });

  return {
    ok: true,
    action: 'journal_prefill',
    workspaceId: job.workspace_id,
    inserted: true,
    planId: plan.plan_id,
    journalEntryId: inserted[0]?.id || null,
  };
}

const handlers: Record<string, EngineHandler> = {
  'operator.recompute_presence': async (job) => handleRecomputePresence(job),
  'coach.recompute': async (job) => handleCoachRecompute(job),
  'journal.prefill': async (job) => handleJournalPrefill(job),
  'focus.create_alert': async (job) => ({ ok: true, action: 'focus_alert', workspaceId: job.workspace_id }),
  'focus.create_plan': async (job) => ({ ok: true, action: 'focus_plan', workspaceId: job.workspace_id }),
};

const pollMs = Math.max(500, Number(process.env.ENGINE_POLL_MS || 1500));
const staleMins = Math.max(1, Number(process.env.ENGINE_STALE_MINUTES || 10));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOne(workerId: string, supportedTypes: string[]): Promise<boolean> {
  const job = await claimNextEngineJob(workerId, supportedTypes);
  if (!job) return false;

  const handler = handlers[job.job_type];
  if (!handler) {
    await failEngineJob({
      jobId: job.id,
      workerId,
      error: `No handler registered for job_type=${job.job_type}`,
      retryDelaySeconds: 300,
    });
    return true;
  }

  try {
    const result = await handler({
      id: job.id,
      workspace_id: job.workspace_id,
      job_type: job.job_type,
      payload: (job.payload || {}) as Record<string, unknown>,
      attempts: job.attempts,
    });

    await completeEngineJob({
      jobId: job.id,
      workerId,
      result,
    });

    console.log(`[engine] completed job ${job.id} type=${job.job_type}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failEngineJob({
      jobId: job.id,
      workerId,
      error: message,
      retryDelaySeconds: 60,
    });
    console.error(`[engine] failed job ${job.id} type=${job.job_type}: ${message}`);
  }

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const typesArg = args.find((v) => v.startsWith('--types='));
  const supportedTypes = typesArg
    ? typesArg.replace('--types=', '').split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const workerId = `engine_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`[engine] worker=${workerId} once=${once} types=${supportedTypes.join(',') || 'ALL'}`);

  await requeueStaleProcessingJobs(staleMins);

  if (once) {
    const processed = await processOne(workerId, supportedTypes);
    if (!processed) console.log('[engine] no pending jobs');
    return;
  }

  while (true) {
    const processed = await processOne(workerId, supportedTypes);
    if (!processed) {
      await sleep(pollMs);
    }
  }
}

main().catch((error) => {
  console.error('[engine] fatal error', error);
  process.exit(1);
});
