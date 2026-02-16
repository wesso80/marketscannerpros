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
