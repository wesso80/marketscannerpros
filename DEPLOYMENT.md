# Deployment Guide

## Stack Notes
- Runtime: Next.js App Router on Render.
- Auth: custom signed cookie session (`ms_auth`), not NextAuth.
- Data: Neon/Postgres via `DATABASE_URL`.
- Workflow loop: `/api/workflow/events`, `/api/workflow/today`, `/api/workflow/tasks`.
- Presence layer: `/api/operator/state`, `/api/operator/presence`.

## Required Environment Variables (Production)
- `APP_SIGNING_SECRET`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `ALPHA_VANTAGE_API_KEY`

## Optional Environment Variables
- `FREE_FOR_ALL_MODE` (set `false` in production unless intentionally overriding tiers)
- `PRO_OVERRIDE_EMAILS`

## Deploy Sequence (Recommended)
1. Push `main` and deploy on Render.
2. Run Neon migration `migrations/020_workflow_operator_loop.sql` (idempotent).
3. Run Neon migration `migrations/021_operator_state.sql` (idempotent).
4. Confirm build/runtime health and workflow loop smoke checks.

## Neon Migration (Operator Workflow)
Run SQL from:
- `migrations/020_workflow_operator_loop.sql`
- `migrations/021_operator_state.sql`

What it covers:
- AI event indexes for workflow funnel events.
- Coach/task event lookup indexes.
- Alert dedupe indexes for auto plan alerts.
- Journal indexes for open-draft and coach-enrichment lookups.
- Safety `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for journal risk fields.
- Operator Presence pulse table + lookup indexes.

## Post-Deploy Smoke Checklist
1. Open `/operator` and verify:
	- Today metrics render.
	- Loop conversion rates render.
	- Coach Action Queue renders.
2. Execute a sample workflow:
	- Trigger a candidate/pass path from scanner/backtest.
	- Verify auto alert + auto journal draft creation.
3. Close a trade from portfolio and verify:
	- `coach.analysis.generated` event created.
	- `strategy.rule.suggested` task events created.
	- Task accept/reject posts `strategy.rule.applied`.
4. Verify today summary endpoint returns expected fields:
	- `/api/workflow/today`
5. Verify tasks endpoint behavior:
	- `GET /api/workflow/tasks?status=pending`
	- `POST /api/workflow/tasks` with `accepted`/`rejected`
6. Verify presence endpoints:
	- `GET /api/operator/presence`
	- `GET /api/operator/state`

## Troubleshooting
- Build warning about `baseline-browser-mapping` age is non-blocking.
- If migration was not run, workflow endpoints still work but query performance may degrade.
- If auth fails on protected APIs, verify `APP_SIGNING_SECRET` and cookie domain/session config.