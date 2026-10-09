# Cron Runbook (Render + worker scheduler)

Since 2026-10-02 almost every scheduled job runs **inside the always-on data worker** (`msp-data-worker`), not as its own Render cron service. Render bills each cron service a flat monthly minimum and rebuilds all of them on every deploy; the worker fires the identical requests for nothing extra and keeps the service count under the Hobby-plan cap.

## Source of truth

- Job table (schedule, path, body, timeouts, retries): `lib/worker/schedule.ts` — edit a row there exactly as you would have edited the old `render.yaml` cron block.
- Runner: `worker/scheduler.ts` (minute-aligned UTC tick, in-flight guard, curl-style retries; script jobs spawn `npm run <script>`).
- Started from `worker/ingest-data.ts` only in the long-lived worker after it holds the lane lock, so exactly one instance fires jobs. Env on the worker: `WEB_URL`, `CRON_SECRET` (from the web service), optional `WORKER_SCHEDULER_ENABLED=false` to pause.
- Last outcome per job is written to Redis at `worker:scheduler:last:<name>` (7-day TTL); the worker log shows `[scheduler] ok|FAILED <name> …` lines.
- Auth header used by every HTTP job: `x-cron-secret: $CRON_SECRET`.
- Tests: `test/worker/scheduler.test.ts` (matcher, due set, retries, parity with `render.yaml`).

## Still real Render cron services (`render.yaml`)

| Cron name | Schedule | Why it stays |
|---|---|---|
| arca-cycle | `*/15 * * * *` | Backstop so paper exits are checked even if the worker is down. Not in the worker table, so it never double-fires. |
| jarvis-overnight-radar-a / -b | `15 21 * * 1-5` / `15 22 * * 1-5` | ~20 min, ~200 MB script; too heavy for the Starter worker. |
| jarvis-crypto-refresh | `0 20 * * *` | Same script family. |

## Jobs in the worker schedule (abridged; the table is the full list)

| Job | Schedule (UTC) | Target |
|---|---|---|
| alerts-price-check | `0-59/5 * * * *` | `POST /api/alerts/check` |
| alerts-signal-check | `3-59/10 * * * *` | `POST /api/alerts/signal-check` |
| alerts-smart-check | `1-59/5 * * * *` | `POST /api/alerts/smart-check` |
| alerts-strategy-check | `4,19,34,49 * * * *` | `POST /api/alerts/strategy-check` |
| daily-scan | `30 21 * * *` | `POST /api/jobs/scan-daily` |
| learning-outcomes | `9,24,39,54 * * * *` | `POST /api/jobs/learning-outcomes` |
| journal-auto-close | `2-59/5 * * * *` | `POST /api/jobs/journal-auto-close?limit=200` |
| stale-auto-draft-cleanup | `15 0 * * *` | `npm run worker:cleanup:stale-auto-drafts` |
| upe-global-open | `35 14 * * 1-5` | `npm run worker:upe:global:open` |
| upe-global-close | `5 21 * * 1-5` | `npm run worker:upe:global:close` |
| upe-crcs-hourly | `8 * * * *` | `npm run worker:upe:crcs:hourly` |
| admin radar ×9, catalyst ×3, emails ×3, edge layer, macro ingest, evening packet, persist-edge-packets, arca-daily-report, refresh-fundamentals | per table | see `lib/worker/schedule.ts` |

## UPE cadence note

- UPE schedules are configured in UTC with **EST baseline** session alignment.
- If you want exact ET wall-clock behavior through DST transitions, shift:
  - open job by 1 hour during DST windows
  - close job by 1 hour during DST windows

## Render configuration checklist

1. Worker `msp-data-worker` has `WEB_URL` and `CRON_SECRET` (fromService web) — both are in `render.yaml`.
2. The remaining cron services in `render.yaml` carry their own `WEB_URL` / `CRON_SECRET` or script env.
3. Web service owns the `CRON_SECRET` value.
4. Deploy after `render.yaml` or `lib/worker/schedule.ts` changes (the worker redeploys with the repo).
5. After the Blueprint sync, delete any orphaned cron services the sync left behind so the workspace stays ≤ 25 services.

## Manual verification

Use any terminal with your production URL and secret:

```bash
curl -X POST "$RENDER_EXTERNAL_URL/api/jobs/journal-auto-close?dryRun=1&limit=25" \
  -H "x-cron-secret:$CRON_SECRET" \
  -H "Content-Type:application/json"
```

Expected response shape:

- `success: true`
- `dryRun: true`
- counters like `checked`, `eligible`, `closed`, `priceUnavailable`

## Security notes

- Do not expose `CRON_SECRET` in client code.
- Keep cron endpoints protected by `CRON_SECRET` checks (and optional admin override where already implemented).

## Deconfliction note

- `vercel.json` cron config has been removed to prevent scheduler conflicts.
