# AI action execution boundary review

8 October 2026. Read-only review of saved revision `d4a97f01e01e61f5d9344219448ef6bea2267f85`, primarily `app/api/ai/actions/route.ts`. No fresh remote-state claim, application execution, model call or production mutation. Claude must check whether its newer commits already address these findings.

## Priority conclusion

The action route has a confirmed source-level dry-run fallthrough: dryRun=true bypasses the pending-confirmation branch and reaches the executor switch. This is more urgent than presentation cleanup because the switch contains business writes. Confirmation also lacks binding to the stored proposal, and idempotency checks occur before effects without an atomic execution claim. Give these findings to the current implementation owner as a separate focused fix; preserve admin engines and collection.

## Existing protections

The route requires a session workspace and paid access. It resolves a known tool policy, checks skill/tool compatibility, validates parameters and some business rules, applies rate limits and scopes action-status/idempotency lookups to the session workspace. Action GET also filters by workspace. The inspected alert/watchlist executors use the session workspace rather than a body workspace ID. Unknown tools do not dispatch arbitrary code.

When neither confirm nor dryRun is set for a confirmation-required tool, the route simulates and records a pending action. Existing executed keys return a saved result. These controls are useful but do not close the gaps below. No broker order or account-data disclosure was demonstrated.

## Findings and acceptance

### ACT01 P1 Dry run reaches business executors

The pending branch requires `policy.requiresConfirmation && !dryRun && !confirm`. There is no separate dry-run early return before the executor switch. For an otherwise valid new request, dryRun=true therefore proceeds to create_alert, watchlist mutation, journal_trade or another registered executor. The flag is also not passed to those executors.

Acceptance: for every tool, dryRun=true must call only the intended simulator and return before any business effect. Test dryRun with confirm false/true, new/existing key and pending/executed status. Explicitly define any allowed audit/rate-limit writes; assert no alert, watchlist, journal, schema, queue, provider or execution-pipeline mutation. Treat existing saved-result responses separately from actual simulation. Never probe this live.

### ACT02 P1 Confirmation does not bind stored proposal parameters

The route accepts confirm=true without requiring a pending action. If an action ID is supplied, its workspace-scoped UPDATE may affect zero rows and execution still continues. When a key finds a pending action, the lookup selects status/result but not stored action type/parameters, and the executor uses the current request parameters. It does not compare those values with what was proposed or previewed.

A direct authenticated request may be intended as an explicit user command, but that is a different contract from confirming an existing AI proposal. The current route conflates them. No evidence establishes that confirm=true itself came from a human click.

Acceptance: define separate direct-command and proposal-confirmation semantics if both are needed. Proposal confirmation must load the owned pending record, check its expected status/version and execute the stored authorized parameters. Missing, foreign, expired, cancelled or mismatched proposals cause no business write. Test altered parameters/tool under the same key, nonexistent action IDs and cross-workspace IDs. Regenerate the preview/confirmation when parameters change.

### ACT03 P1 Idempotency is checked before effects but not atomically claimed

Two concurrent requests can both observe no executed result (or the same pending status), then execute business effects before action-log insertion/update. The pending INSERT uses a conflict clause, but the executor path has no atomic transition that grants one request execution ownership. A later unique-key failure cannot undo an earlier alert insert or other effect. A supplied key is also not verified against the tool/parameter identity, so reuse can return a prior unrelated result.

Acceptance: atomically claim execution, bind the key to the canonical action identity and ensure business effects have durable idempotency or transaction protection. Simultaneous confirmations of one proposal produce at most one business effect and a consistent result. Test failure after the effect but before result persistence, retry after failure, key reuse with different parameters and conflicting actionId/key. Scope all claims by workspace. Do not rely solely on a sequential duplicate-request test.

### ACT04 P1 Response metadata update lacks workspace predicate

After successful execution, the route runs `UPDATE ai_responses ... WHERE id = $1` using request responseId, without workspace_id. `resolveActionSkill` verifies response ownership only when it derives skill from that response; an explicit requestedSkill returns early. Consequently that ownership check cannot be relied on to protect the later update.

This is a missing tenant predicate on learning/action metadata, not demonstrated access to another user's portfolio or model output. Exploitability depends on obtaining another response ID and satisfying the other gates; the source path is sufficient to require an ownership check.

Acceptance: validate responseId ownership whenever supplied, regardless of requestedSkill, and scope the update to session.workspaceId. Synthetic A executes a valid action while supplying B's response ID: B's record remains unchanged and the invalid association is rejected before business execution. Preserve legitimate own-workspace associations.

## Implementation scope

Primary file: `app/api/ai/actions/route.ts`; coordinate related tool-policy/types and persistence changes with the same owner. Add route-level tests using fake database/executor adapters and deterministic concurrent barriers. Do not modify admin scoring, crypto research or scheduled collection to address these public action controls.

`executeJournalTrade` calls `ensureJournalRiskColumns`, which includes ALTER TABLE statements, and imports execution/risk helpers. That makes live route testing particularly inappropriate. This review does not trace every downstream journal execution mode or certify broker behaviour; the dry-run and authorization fixes must prevent reaching the executor before those details matter.

Before implementing atomicity, inspect current migrations, constraints and downstream executor transactions. The route-level ordering finding is not a complete database concurrency audit. Capture only synthetic data in tests; no production credentials, provider/network calls or real notifications.

## Source references

- [Action handler and executors](https://github.com/wesso80/marketscannerpros/blob/d4a97f01e01e61f5d9344219448ef6bea2267f85/app/api/ai/actions/route.ts).
- [Tool policies and generated idempotency keys](https://github.com/wesso80/marketscannerpros/blob/d4a97f01e01e61f5d9344219448ef6bea2267f85/lib/ai/tools.ts).
- [Copilot suggested-action construction](https://github.com/wesso80/marketscannerpros/blob/d4a97f01e01e61f5d9344219448ef6bea2267f85/app/api/ai/copilot/route.ts).

## Handoff and next task

Add ACT01–ACT04 as an urgent focused boundary package in the [Claude handoff](START%20HERE%20Claude%20implementation%20handoff.md). These are inherited implementation findings distinct from the public evidence redesign. No fixes or application tests were performed in this audit.

Recommended next task: Claude implements and returns a commit with isolated dry-run, confirmation, concurrency and workspace-association tests; Codex independently verifies that commit. Avoid expanding the audit queue before reviewing those concrete fixes.
