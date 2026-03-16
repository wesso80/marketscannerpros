# Engine Rollout (Brains -> Execution)

## What was added

- Durable queue migration: `migrations/025_engine_jobs.sql`
- Queue library: `lib/engine/jobQueue.ts`
- Worker runner: `worker/engine-runner.ts`
- NPM scripts:
  - `npm run worker:engine`
  - `npm run worker:engine:once`

## Queue model

`engine_jobs` status lifecycle:

`pending -> processing -> completed`

Failure path:

`processing -> pending` (retry with delay)

Terminal failure:

`processing -> dead` when `attempts >= max_attempts`

Run history:

- `engine_job_runs` stores success/failure attempts with output/error.

## Supported job types (current scaffold)

- `operator.recompute_presence`
- `coach.recompute`
- `journal.prefill`
- `focus.create_alert`
- `focus.create_plan`

Current handlers are safe placeholders (return success payloads). Integrate real domain actions incrementally.

## Deploy steps

1. Run migrations in order (includes `025_engine_jobs.sql`).
2. Start engine worker process:
   - `npm run worker:engine`
3. Optional one-shot sanity run:
   - `npm run worker:engine:once`

## First production integrations (recommended)

1. On focus creators, enqueue follow-up jobs:
   - `coach.recompute`
   - `journal.prefill`
2. On explicit feedback tags, enqueue:
   - `operator.recompute_presence`
3. Add dashboard health counters from `engine_jobs`:
   - pending count
   - dead count
   - oldest pending age

## Operational defaults

Environment vars:

- `ENGINE_POLL_MS` (default `1500`)
- `ENGINE_STALE_MINUTES` (default `10`)

Worker resilience:

- Requeues stale `processing` jobs on startup.
- Uses `FOR UPDATE SKIP LOCKED` to avoid double-processing.
