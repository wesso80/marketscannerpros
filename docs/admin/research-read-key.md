# Read-only research key (agents)

Lets Claude and Codex read admin data for research. It is not a login: it can't change anything, place orders,
open admin pages, or reach any endpoint that isn't on the allowlist in `lib/admin/researchReadKey.ts`.

## What it allows

- `GET`/`HEAD` only, and only on the listed read endpoints, covering:
  - scanner and Symbol analysis;
  - signal outcomes and backtests;
  - paper portfolio and journal;
  - Health and data sources.
- Requests with `refresh` or `force` are refused, because those re-run work instead of reading.
- The key acts as the admin in `ADMIN_RESEARCH_READ_EMAIL`, in that admin's `/admin/login` workspace, so it sees the same paper and journal data.
- Every request is logged as `[admin-research-read] key=<label> <METHOD> <path>` in Render logs.
- `/api/admin/symbol/<SYMBOL>` runs a live scan and uses Alpha Vantage quota, which the existing quota governor limits.

## Setup (owner; never paste keys into chat)

1. Generate one key per agent on your own machine, for example with `openssl rand -hex 32`. Each key must be at least 32 characters.
2. **Render (web service) → Environment:**
   - `ADMIN_RESEARCH_READ_KEYS` = `claude:<key1>,codex:<key2>`
   - `ADMIN_RESEARCH_READ_EMAIL` = your admin email (it must be listed in `ADMIN_EMAILS`).
3. **Claude cloud environment** (session title bar → environment → Edit):
   - Add `ADMIN_RESEARCH_READ_KEY` = `<key1>` as a secret or environment variable.
   - Add `marketscannerpros.app` and `www.marketscannerpros.app` under Allowed domains.
   - Start a new session so it picks them up.
4. **Codex:** give it `<key2>` through its own secret settings, plus network access to the same domains.

Agents send the key as the `X-Admin-Research-Key: <key>` header.

## Revoke

- **One agent:** remove its `label:key` entry from `ADMIN_RESEARCH_READ_KEYS`.
- **All agents:** delete `ADMIN_RESEARCH_READ_KEYS`, or `ADMIN_RESEARCH_READ_EMAIL`, or remove that email from `ADMIN_EMAILS`.

## Output rules for agents using it

Research and simulation only:

- No broker connection, no order routing and no auto-execution.
- Every setup write-up includes the fields required by `.claude/rules/ai-output-standards.md`:
  - Opportunity Score;
  - Evidence Quality Score;
  - personal exposure;
  - confidence statement;
  - what confirms;
  - what invalidates;
  - main risk.
- Name every data source with its time and freshness. Stale, missing or simulated data lowers the stated confidence.
