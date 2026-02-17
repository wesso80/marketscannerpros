import { q } from '@/lib/db';

export type EngineJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

export interface EngineJob {
  id: number;
  workspace_id: string;
  job_type: string;
  status: EngineJobStatus;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  priority: number;
  run_after: string;
  attempts: number;
  max_attempts: number;
  lock_token: string | null;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function createLockToken() {
  return `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueEngineJob(args: {
  workspaceId: string;
  jobType: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  priority?: number;
  runAfterIso?: string;
  maxAttempts?: number;
}): Promise<{ enqueued: boolean; jobId?: number }> {
  const payload = args.payload || {};
  const priority = Number.isFinite(args.priority as number) ? Number(args.priority) : 100;
  const maxAttempts = Number.isFinite(args.maxAttempts as number) ? Number(args.maxAttempts) : 5;

  const rows = await q<{ id: number }>(
    `INSERT INTO engine_jobs (
      workspace_id, job_type, status, payload, dedupe_key, priority, run_after, max_attempts
    ) VALUES (
      $1, $2, 'pending', $3::jsonb, $4, $5, COALESCE($6::timestamptz, NOW()), $7
    )
    ON CONFLICT (workspace_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL
    DO NOTHING
    RETURNING id`,
    [
      args.workspaceId,
      args.jobType,
      JSON.stringify(payload),
      args.dedupeKey || null,
      priority,
      args.runAfterIso || null,
      maxAttempts,
    ]
  );

  if (!rows[0]) return { enqueued: false };
  return { enqueued: true, jobId: Number(rows[0].id) };
}

export async function claimNextEngineJob(workerId: string, supportedTypes: string[] = []): Promise<EngineJob | null> {
  const lockToken = createLockToken();
  const useTypeFilter = supportedTypes.length > 0;

  const rows = await q<EngineJob>(
    `WITH next_job AS (
       SELECT id
       FROM engine_jobs
       WHERE status = 'pending'
         AND run_after <= NOW()
         AND (
           $3::boolean = false
           OR job_type = ANY($4::text[])
         )
       ORDER BY priority ASC, id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE engine_jobs ej
     SET
       status = 'processing',
       lock_token = $1,
       locked_at = NOW(),
       locked_by = $2,
       attempts = ej.attempts + 1,
       updated_at = NOW()
     FROM next_job
     WHERE ej.id = next_job.id
     RETURNING ej.*`,
    [lockToken, workerId, useTypeFilter, supportedTypes]
  );

  return rows[0] || null;
}

export async function completeEngineJob(args: {
  jobId: number;
  result?: Record<string, unknown>;
  workerId: string;
}) {
  await q(
    `UPDATE engine_jobs
     SET status = 'completed', completed_at = NOW(), lock_token = NULL, locked_at = NULL, locked_by = NULL, updated_at = NOW()
     WHERE id = $1`,
    [args.jobId]
  );

  await q(
    `INSERT INTO engine_job_runs (job_id, workspace_id, worker_id, started_at, finished_at, success, result)
     SELECT id, workspace_id, $2, COALESCE(locked_at, NOW()), NOW(), true, $3::jsonb
     FROM engine_jobs
     WHERE id = $1`,
    [args.jobId, args.workerId, JSON.stringify(args.result || {})]
  );
}

export async function failEngineJob(args: {
  jobId: number;
  workerId: string;
  error: string;
  retryDelaySeconds?: number;
}) {
  const retryDelaySeconds = Math.max(15, Number(args.retryDelaySeconds || 60));

  const rows = await q<{ attempts: number; max_attempts: number }>(
    `SELECT attempts, max_attempts FROM engine_jobs WHERE id = $1 LIMIT 1`,
    [args.jobId]
  );

  const attempts = Number(rows[0]?.attempts || 0);
  const maxAttempts = Number(rows[0]?.max_attempts || 5);
  const nextStatus: EngineJobStatus = attempts >= maxAttempts ? 'dead' : 'pending';

  await q(
    `UPDATE engine_jobs
     SET
       status = $2,
       run_after = CASE WHEN $2 = 'pending' THEN NOW() + make_interval(secs => $3) ELSE run_after END,
       last_error = $4,
       lock_token = NULL,
       locked_at = NULL,
       locked_by = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [args.jobId, nextStatus, retryDelaySeconds, args.error.slice(0, 2000)]
  );

  await q(
    `INSERT INTO engine_job_runs (job_id, workspace_id, worker_id, started_at, finished_at, success, error)
     SELECT id, workspace_id, $2, COALESCE(locked_at, NOW()), NOW(), false, $3
     FROM engine_jobs
     WHERE id = $1`,
    [args.jobId, args.workerId, args.error.slice(0, 2000)]
  );
}

export async function requeueStaleProcessingJobs(staleMinutes = 10): Promise<number> {
  const rows = await q<{ id: number }>(
    `UPDATE engine_jobs
     SET status = 'pending', lock_token = NULL, locked_at = NULL, locked_by = NULL, updated_at = NOW()
     WHERE status = 'processing'
       AND locked_at < NOW() - make_interval(mins => $1)
     RETURNING id`,
    [Math.max(1, staleMinutes)]
  );

  return rows.length;
}
