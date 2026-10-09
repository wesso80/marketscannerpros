# Admin analytics browser acceptance (local, discovery-only on)

Branch: `claude/reconcile-617-analytics-read` (#620 = Codex #617 + admin-integration). Date: 2026-10-09.
Environment: local `next dev` (port 3100), local PostgreSQL 16 with the real migrations 048, 068, 103, 105 (6w/12w)
and 133, `ADMIN_DISCOVERY_ONLY=true`, Chromium 1194 via playwright-core. Fixture data only (no production data,
no provider calls): 80 verified-provenance 24h results (Breakout LONG equity 15m), 60 post-fix legacy results
(Fade SHORT crypto 1h), 20 pending, 10 expired. No Morning Brief table, so the missing-table and no-snapshot paths
were exercised. Signed admin (`ms_admin`) and non-admin (`ms_auth`) cookies minted with the local secret.

## Results

| Check | Result |
|---|---|
| 7 pages × desktop 1280px and mobile 390px, as admin | All 200, no redirect to the paused page, **0px horizontal overflow** at both widths |
| Page data APIs | edge-check, model-diagnostics, signals, signals/stats, signals/scorecard, backtest-lab, outcome-cohorts all 200 |
| Console errors | None, except Morning Brief's 500 (fixed below) |
| Filters, cohort selectors (every option of every `<select>`) | Edge Check 21, Model Diagnostics 17, Outcomes 25, Backtest Lab 14 changes; **0 failed API calls** |
| Verified cohort | Fixture rows classified `verified` by the reader (e.g. AAPL/Breakout 8 of 8); unknown and old-method rows counted separately |
| Stale data | Truth stamps show "Stale" on the old fixture data |
| Signed out | Pages redirect to `/auth`; APIs 401 |
| Non-admin signed in | Pages redirect to `/auth`; APIs 401 |
| Paused write controls (UI) | Disabled: Morning Brief Rebuild, Run Prewake, At Open Re-score, Reconcile Tags, Review Email, Preview Email, Email Now; Outcomes "Run Labeler Now". Reload Saved and Refresh stay enabled |
| Paused writes (server, same-origin) | POST morning-brief, morning-brief/feedback, morning-brief/actions, edge-check → 503 `admin_discovery_only`; foreign Origin → 403 |
| Custom brief build while paused | GET `?symbols=AAPL` → 409 "Custom brief builds are paused" |
| Missing Morning Brief table | **Found: 500.** Fixed in 9d0bf1e0: read-only mode treats Postgres 42P01 as "no saved brief" → 404 "No saved brief … building is paused"; table still not created; other DB errors still surface |
| Expectancy Shadow | Page loads; API returns current vs verified profiles (e.g. AAPL/Breakout provenance 8/8 verified) |

Desktop and mobile screenshots were reviewed: the paused notice, dimmed controls, cohort selector, completeness counts
and explanations render within the existing visual design.

## Not covered (needs production or a seeded snapshot)

- A **present** Morning Brief snapshot (the fixture had none); rendering of a real saved brief while paused.
- Production data volumes, real provider-backed records, and the deployed web build (local was `next dev`).
- The Outcomes manual labeller is disabled in the UI only; the shared `/api/cron/label-ai-outcomes` route and its
  schedule are unchanged and not paused globally.
