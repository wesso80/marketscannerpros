# Cron Runbook (Render)

This project uses **Render cron services only**.

## Source of truth

- Cron definitions: `render.yaml`
- Auth header used by cron calls: `x-cron-secret: $CRON_SECRET`
- App base URL variable in Render cron services: `RENDER_EXTERNAL_URL`

## Active cron jobs

| Cron name | Schedule | Endpoint |
|---|---|---|
| alerts-price-check | `*/5 * * * *` | `POST /api/alerts/check` |
| alerts-signal-check | `*/10 * * * *` | `POST /api/alerts/signal-check` |
| alerts-smart-check | `*/5 * * * *` | `POST /api/alerts/smart-check` |
| alerts-strategy-check | `*/15 * * * *` | `POST /api/alerts/strategy-check` |
| daily-market-focus | `0 21 * * *` | `POST /api/jobs/generate-market-focus` |
| daily-scan | `30 21 * * *` | `POST /api/jobs/scan-daily` |
| learning-outcomes | `*/15 * * * *` | `POST /api/jobs/learning-outcomes` |
| journal-auto-close | `*/5 * * * *` | `POST /api/jobs/journal-auto-close?limit=200` |

## Render configuration checklist

1. Ensure each cron service in `render.yaml` includes:
   - `RENDER_EXTERNAL_URL` from web service URL
   - `CRON_SECRET` (sync false / env secret)
2. Ensure web service has matching `CRON_SECRET` value.
3. Deploy after `render.yaml` changes.

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
