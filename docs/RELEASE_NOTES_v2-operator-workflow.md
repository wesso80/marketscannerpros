# v2-operator-workflow

## Summary
This milestone turns MarketScanner Pros into a connected operator workflow by linking planning, execution, journaling, and learning through canonical workflow events and a unified operator surface.

## Highlights
- Added unified Operator Dashboard (`/operator`) as the command surface for Observe → Evaluate → Execute → Review flow.
- Added institutional workflow event envelope and ingestion pipeline.
- Added correlated event chain from backtest planning into journal drafting.
- Added automated alert-triggered journal draft logging (`/api/journal/auto-log`).
- Added lifecycle telemetry for portfolio actions:
  - `trade.executed` on position open
  - `trade.updated` on manual and auto price updates
  - `trade.closed` on position close
- Added journal lifecycle telemetry:
  - `journal.updated` on save/new entry
  - `journal.completed` on trade close in journal

## Architecture Additions
- New workflow contracts and emitter:
  - `lib/workflow/types.ts`
  - `lib/workflow/client.ts`
- New workflow ingestion API:
  - `app/api/workflow/events/route.ts`
- New operator route:
  - `app/operator/page.tsx`

## Product Surface Changes
- Navigation now includes Operator Dashboard.
- Tools hub includes Operator card.
- Backtest strategy UX grouped by edge type and strategy variant.
- Alerts Triggered feed supports actioned handoff and auto-log draft creation.

## Correlation Model
- Events use canonical envelope fields (`event_id`, `event_type`, `event_version`, `occurred_at`, actor/context/entity/correlation/payload).
- Correlation fields (`workflow_id`, `parent_event_id`) now connect plan → execution → journal events.

## Developer Notes
- Build compiles successfully.
- Existing non-blocking warning persists: baseline-browser-mapping dataset age warning.

## Tag and Commit
- Tag: `v2-operator-workflow`
- Main commit: `721d39a49efc90f6e36d26f50dade2e1dbba5df5`

---

## Addendum · Feb 17, 2026 (Operator Loop Completion)

### New Workflow Automation
- Introduced canonical `DecisionPacket` object and scanner lifecycle wiring:
  - `signal.created`
  - `candidate.created`
  - auto `trade.plan.created` when candidate result is pass
- Added strict validation for `candidate.created` payload and `decision_packet` shape in workflow ingestion.
- Added server-side automation on `trade.plan.created`:
  - auto smart alert creation (deduped)
  - auto journal draft creation (deduped)
- Added server-side automation on `trade.closed`:
  - auto `coach.analysis.generated` (deduped)
  - auto journal note enrichment with coach summary
  - auto `strategy.rule.suggested` tasks from coach recommendations

### Operator UX Additions
- Added `/api/workflow/today` summary endpoint and Operator “Today’s Workflow” strip.
- Added “Last Coach Insight” panel on Operator.
- Added Coach Action Queue with accept/reject actions backed by `/api/workflow/tasks`.
- Added loop conversion rates strip:
  - Signal→Candidate
  - Candidate→Plan
  - Plan→Execution
  - Execution→Closed
  - Closed→Coach
  - Task Accept

### Supporting APIs
- `POST /api/workflow/events` now returns additional automation counters:
  - `autoAlertsCreated`
  - `autoJournalDraftsCreated`
  - `autoCoachAnalysesGenerated`
  - `autoCoachActionTasksCreated`
  - `autoCoachJournalUpdates`
- New task API:
  - `GET /api/workflow/tasks?status=pending|resolved|all&limit=n`
  - `POST /api/workflow/tasks` with `{ taskId, decision: accepted|rejected }`

### Neon Rollout Requirement
- Run `migrations/020_workflow_operator_loop.sql` (idempotent) after deploy.
- This migration includes performance indexes for workflow event aggregation, task decision lookups, alert dedupe, and journal enrichment queries.

### Production Validation
- Build compiles successfully after all changes.
- Existing warning remains non-blocking: baseline-browser-mapping dataset age warning.

### Operator Presence Phase (Latest)
- Added options confluence into workflow event loop:
  - emits `signal.created`, `candidate.created`, and pass-gated `trade.plan.created`.
- Added invisible-layer persistence foundation:
  - `migrations/021_operator_state.sql`
  - `POST/GET /api/operator/state`
  - client pulse sync from `writeOperatorState(...)`.
- Added Operator Presence summary endpoint:
  - `GET /api/operator/presence`
  - returns market state, top attention symbols, pending task context, and suggested actions.
- Added Operator Presence panel on `/operator`:
  - Market State, Volatility, Risk Load, Pending Tasks
  - Top Attention list
  - Suggested Actions with direct handoff links

### Additional Rollout Requirement
- Run `migrations/021_operator_state.sql` in Neon (idempotent) after deploy.
