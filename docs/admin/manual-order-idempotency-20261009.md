# Admin manual simulated-order safeguard

Base: `admin-integration` at `88785fa7e2fa5f30f4ad6c7b99a50fa44efb81e9`.
Branch: `codex/admin-manual-order-idempotency`.
Scope: admin paper orders only. No public page, public API, shared engine, authentication helper or worker changed. No merge, deployment or production migration performed.

## Corrected audit finding

`sizeForPortfolio` already reserves risk and cash for pending orders through `loadCapacity`. The manual route lacked a transaction and portfolio lock around sizing and insertion; two requests could both observe the same capacity. This change reuses that existing calculation under the same portfolio row lock used by the automated cycle. It does not introduce a new sizing model.

## Request and retry contract

`POST /api/admin/portfolio-lab/create-sim-order` now requires `Idempotency-Key`: 16–128 letters, digits, dots, dashes, underscores or colons. Use a fresh UUID for a new intended order. Persist the key and body before sending; reuse both after a timeout or uncertain result.

- Authentication and origin checks happen before receipt reads or business work.
- The key is scoped to the authenticated workspace; a body cannot choose the workspace.
- Same key and normalized input return the original status/body, with `Idempotency-Replayed: true`.
- Same key with changed input returns 409 without another order.
- Business rejections are recorded too. A retry cannot turn a previous rejection into a later order; a deliberate new attempt requires a new key.
- Order, entry journal and receipt commit together. SQL failure rolls them all back. A generic 503 tells the caller to retry the same key because a failed response is not proof that commit failed.
- Receipts survive account reset/replacement. Replaying an old request returns its old result rather than placing an order into the replacement account. The returned receipt is historical, not the current order status.
- Responses are private/no-store. No runtime schema creation is added.

No in-repository caller was found outside the route; external scripts must adopt this header before rollout. Manual orders retain the existing ACTIVE/PAUSED account behavior. This PR does not change pause policy.

## Locking and capacity

A transaction-level advisory lock serializes a workspace/key pair. A portfolio row lock then serializes different keys before account reread, sizing, pre-trade checking and order creation. Existing cycle/reset/status code uses the same portfolio row lock; this compatibility was inspected in code. The database concurrency test exercises two actual manual route requests, not a full automated cycle.

The shared capacity reader loads at most 200 pending orders. This route now refuses admission above that bound rather than silently omitting reservations. The shared reader and automated cycle remain unchanged; their own overflow handling is a separate follow-up.

## Migration / release hold

Apply `migrations/130_admin_manual_order_requests.sql` explicitly as part of the later approved release, before serving the updated route. It creates the dedicated receipt table. Without it the route fails closed with 503. Never prune these receipts casually: deleting a receipt makes its old key reusable. No production migration has been run.

## Validation

- Isolated PostgreSQL 18.4 with real migrations 095 and 130, real route, store, sizing, risk and journal code: **10/10 passed**. Only the admin identity resolver is faked.
- Cases: simultaneous duplicate, simultaneous competing risk, changed payload, replay after response loss/account replacement, journal-trigger failure and rollback/retry, stable rejection after capacity changes, workspace separation, missing key/foreign origin, unauthenticated receipt access, and more than 200 pending orders.
- Admin regression suite: **184 files / 1,543 tests passed**.
- TypeScript project check passed with local dependency type roots.
- No provider, broker, OpenAI or production database calls; no browser check needed for this server-only change.

To rerun the database suite, use a disposable UTF-8 PostgreSQL database named `msp_manual_order_test` on `127.0.0.1`, set `DATABASE_URL`, `NODE_ENV=test`, and `PG_POOL_MAX=8`, then run:

```sh
npx vitest run --config test/integration/manualOrder.vitest.config.ts
```

The suite refuses other hosts/database names, applies the two migrations, and truncates fixture account/receipt tables between cases. It intentionally has a dedicated config and filename so ordinary unit-test runs never touch a database.

## Handoff and next task

Claude can review this independently of auth, error hygiene, navigation and order-export work. Next recommended task: apply consistent origin checks to the remaining admin mutation routes, using the mutation audit inventory and tests that reject foreign-origin requests before writes. Keep public APIs out of that workstream.
