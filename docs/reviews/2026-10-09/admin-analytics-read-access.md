# Admin analytics read access

Base: `admin-integration` at `aac4960a450c6e3b584e2abeaf46dc6b824f801e`.
Branch: `codex/admin-analytics-read-access`. No merge, deployment, production query or provider request was made.

## Scope

During `ADMIN_DISCOVERY_ONLY`, authenticated admins can open Edge Check, Model Diagnostics, Signal Outcomes, the Outcomes Scorecard, Backtest Lab, Expectancy Shadow and saved Morning Brief. Navigation filtering recognizes those pages. Expectancy Shadow remains reachable from Edge Check.

The exact GET allowlist is in `lib/admin/discoveryOnly.ts`: edge-check, model-diagnostics, signals, signals/stats, signals/scorecard, backtest-lab, outcome-cohorts, expectancy-shadow and morning-brief, all under `/api/admin/`. No prefix-wide API exemption was added. POST/PUT/PATCH/DELETE and other methods stay paused; adjacent Morning Brief action/feedback routes stay paused. Authentication still runs before the admin pause response.

## Morning Brief side effects removed from paused reads

A simple GET exemption was unsafe: the route built custom symbol lists, bootstrapped and saved absent briefs, and its saved loader ran CREATE TABLE/INDEX statements. While paused:

- GET with custom symbols returns 409 before data work.
- Existing snapshots are selected by authenticated workspace, market and timeframe, with saved timestamps and age retained.
- Missing snapshots return 404 without building or saving.
- The loader receives an explicit read-only option and executes only its SELECT, without creating tables/indexes. Missing schema results in a redacted failure, not automatic repair.
- Direct POST rebuild calls return 409 after authentication; middleware normally refuses them first with 503.
- Every Morning Brief handler response has `Cache-Control: private, no-store`.
- Rebuild, prewake, rescore, journal sync, review email, preview/send email, plan generation and feedback controls are disabled; their page handlers also return before any request. Reload Saved stays enabled.

The helper's default behavior is preserved for existing callers; only this paused route opts into no-DDL reads. Ending the pause restores the existing route behavior.

## Existing exceptions preserved

The #605 equity auto-scan and equity edge-packet persistence exemptions are unchanged. Existing Crypto Markets, Jev equity and business-read access remain unchanged. Previously skipped private jobs stay skipped. No public page, public response, score model, trading rule or broker integration changed.

The shared `/api/cron/label-ai-outcomes` route was already allowed and remains unchanged, including its scheduled and authenticated manual API behavior. This patch disables the Signal Outcomes page's manual labeler button while paused; that UI restriction is not a new server-wide prohibition on the shared labeler. Disabling the shared job would affect public/shared outcome collection and is outside this patch.

## Validation

- 13 targeted test files, 300 tests passed, including actual middleware session/GET/write checks, equity exemptions, authentication lifecycle, origin checks, saved loader no-DDL calls and rendered paused controls.
- Project TypeScript check passed with `--noEmit --incremental false --typeRoots ./node_modules/@types`.
- `git diff --check` passed.
- Tested in an isolated checkout whose starting tree is identical to the base commit, with this patch copied over. Fake data only; no provider, email or production database calls.
- React review: hooks remain unconditional, callbacks include pause state, native disabled buttons and visible status text explain unavailable actions, and refresh reads remain usable.

## Remaining acceptance before any later release

Verify production schema/migration availability and saved evidence completeness using read-only access. Then, on an authorized preview/deployment, check the seven pages with an admin session and the denial paths with signed-out/non-admin sessions. These local tests do not establish production schema readiness or live browser layout. No deployment was requested or performed here.

Next recommended task: a read-only production schema and evidence-coverage check, recording what is available versus missing without running migrations, rebuilding briefs or changing scores.

## Independent review follow-ups (Claude, 9 Oct)

- **Stale saved brief:** while paused, every Morning Brief builder is off, so the newest saved brief only gets older.
  The page now shows a warning above any saved brief more than 6 hours old. It gives the age and build time and says
  the cache status, desk state and plays describe that time, not now. It uses the same thresholds as the API's
  `truth.freshness` (`lib/admin/morningBriefFreshness.ts`).
- **Test isolation:** `test/admin/discoveryOnly.test.ts` sets `ADMIN_DISCOVERY_ONLY=true` for every test. Before
  this, 93 of its 159 tests failed when the environment had `ADMIN_DISCOVERY_ONLY=false`.
- **Not changed:** `/api/cron/label-ai-outcomes` still accepts an admin session while discovery-only is on. The page
  button is disabled, but the server does not refuse a direct call. This matches the deployed behaviour and the
  handoff ("do not claim the shared labeler is globally paused"). Closing it is a separate decision.
