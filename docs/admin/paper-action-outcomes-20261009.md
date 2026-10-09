# Admin paper-action outcomes

Base: admin-integration 88785fa7e2fa5f30f4ad6c7b99a50fa44efb81e9.
Branch: codex/admin-paper-action-outcomes. No merge, deployment, production/provider call or database migration.

## Problem and result

The paper POST handler previously ran the requested action and its follow-up snapshot reads in one try/catch. A successful automation toggle followed by an account-read failure returned 503 as though the action had failed. Some base-sleeve errors were also silently swallowed.

The route now returns actionResult separately from snapshot. Each attempted setting/cycle step is completed, skipped or unconfirmed. A returned helper with ok=false or monitorHealthy=false is unconfirmed; a skipped helper is not reported as having executed. An exception may follow a committed write, so no rollback is inferred.

- Successful action plus failed snapshot returns HTTP 200 with the confirmed steps and snapshot.status=unavailable, without an invented account view.
- Successful action plus successful snapshot retains the existing top-level account fields, adding actionResult and snapshot metadata.
- A caught secondary base step failure reports partial, preserving the other confirmed steps and existing execution ordering.
- A thrown primary action step returns 503/unknown with earlier confirmed steps retained. It does not automatically retry.
- Authorization/input refusal stays 403/400 before actions. POST responses are private/no-store.

The engines, shared automation permission/scope, pause behavior and workspace selection are unchanged. No public API/page or shared trading model is edited.

## Panel behavior

The Crypto paper account panel displays the action summary and individual step outcomes. On an unavailable snapshot it keeps the previous data, labels it stale, and does not publish the incomplete response into the shared snapshot store. Mutation controls stay disabled until a read refresh. A GET refresh restores controls without another POST; an uncertain network response also requires a read refresh. Old background-scan values are explicitly labelled as previous-snapshot values.

## Evidence

- 15 route fault-injection tests: all five actions followed by a snapshot failure; independent automation/base reads failing; normal response compatibility; setter failure; later primary cycle failure; both secondary base failures; skipped/unhealthy cycles; refusal before effects.
- Three rendered interaction tests: successful change/failed snapshot; completed steps before later uncertainty; lost response without automatic resubmission.
- Existing five paper-route tests pass, including kill-switch behavior.
- Full admin suite: 186 files, 1,561 tests passed. Project typecheck passed. Final UI label/button polish rechecked with the three interaction tests.
- Real component bundled with synthetic fetch responses in Chromium: 1280 and 390 widths, no horizontal overflow or browser exceptions, stale warning visible, repeat action disabled, GET/POST/GET sequence verified. This is a fixture rendering, not a production or full-app browser check.

## Limits and release hold

This is a response/reporting fix, not a durable action receipt ledger. If the HTTP response is lost, original per-step outcomes cannot be retrieved by request key; the UI reports uncertainty and reads saved state. Adding cross-store durable receipts/idempotency for paper cycles remains separate work. The manual simulated-order receipt work is already separate in #561. A later GET establishes current account state, not proof of what an earlier interrupted request did.

No automatic retries, migrations, merges or deployments were performed. Keep the admin deployment hold.

Next recommended review: combine the pending admin drafts in an isolated test tree and resolve the overlapping #562/#563 origin policies before integration. Those drafts should not both be merged without checking their combined behavior and public boundary.
