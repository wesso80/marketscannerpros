# W8 acceptance and ACT database verification handoff

Reviewed 8 October 2026 against fetched development branch `c083777f`. Claude's reserved WIP is `7a6fe1b0b7170226a30d9ce134a03a83aff89969`; this review makes no edits there. No merges, deployments, provider requests or production data changes.

## Acceptance status

| Work | Evidence and result | Remaining acceptance |
| --- | --- | --- |
| W1 #486 | 12 existing expiry/identity tests independently passed. Explicit expiry flows through main Symbol engine and DVE; asset class and expiry are in relevant cache keys. | Whole-page distinct IV/expected-move fixtures, non-neutral signal-write suppression, and AI summary expiry need verification. Deep Analysis replacement is Claude's WIP; not accepted here. |
| W2 #487 | 9 existing identity tests independently passed. Failed detail and ambiguous search withhold ticker-combined data. | `load.ts:45` accepts missing coin_id; `:49` uses verified && !ambiguous to bind Yahoo without independent provider identity. Prior W2-R1/R2 remain open. Passing current tests does not close them. |
| W3 Symbol #490 | 4 existing contract tests independently passed. Auth precedes computation; top-level private verdict blocks are omitted. | Nested spreads/direct references and verdict-derived strings violate the matrix's no aliases/nested copies/string summaries requirement. Local follow-up b661abfa has 3 regressions failing on base and passing with the fix; 35 related tests pass. Envelope diagnostics/cache storage isolation remain unverified. |
| ACT + R1-R3 #491 | Existing 18 fixture tests passed previously. New real PostgreSQL harness e45567d9 passed six tests on c083777f. | Fake business effects only; no downstream exactly-once guarantee, no process-kill chaos test or full production migration rehearsal. |

## Real PostgreSQL harness

Branch `codex/act-postgres-harness`, commit `e45567d9`. File `test/actPostgres.integration.test.ts` invokes the actual POST handler, replacing auth and q transport. Action SQL, constraints, JSONB equality, rate limiter, audit writes and row claims run through node-postgres against PostgreSQL 18.4. Only the business alert insert is fake; outcome-write interruption is deliberately injected.

The disposable database name is random (`act_boundary_*`), created only on 127.0.0.1 using explicit ACT_TEST_POSTGRES_PORT/USER/PASSWORD inputs. The harness never reads DATABASE_URL. A separate local cluster listened on port 55439. The database was dropped and the server stopped after testing.

Applied the exact workspaces table definition from 000_FULL_SCHEMA_NEON.sql, then the complete AI_PLATFORM_SCHEMA.sql, AI_PLATFORM_SCHEMA_V2.sql and 016_ai_actions_executor_hardening.sql (twice for repeatability). This is the relevant migration dependency set, not every application migration.

Six passing cases:

1. Repeated proposals exercise the real partial unique index / ON CONFLICT predicate and return one action. Reordered JSON keys still confirm correctly.
2. A barrier releases two confirmations into actual database row claims together. One 200, one 409, exactly one fake business effect.
3. Cancelled rows cannot be proposed or confirmed again.
4. Failed rows cannot be proposed or confirmed again.
5. An actual simulated executor failure records terminal failed state and cannot replay.
6. Effect succeeds, final outcome write throws: row stays confirmed, retry returns unknown outcome without a second effect.

No route changes. Harness opt-in command (against a disposable local PostgreSQL with CREATEDB permission): set ACT_TEST_POSTGRES_PORT and ACT_TEST_POSTGRES_USER, then run `npx vitest run test/actPostgres.integration.test.ts`. Without the port it skips. Local Windows Vite needed external preserveSymlinks config; dependencies were installed from package.json ranges, not exact lockfile CI. Run again in normal CI and, if different, the production PostgreSQL major version.

## Reserved-file overlap

Do not apply b661abfa wholesale onto Claude's WIP: both touch publicSymbolPacket.ts. WIP removes lastEpsBeat; b661abfa's explicit fundamentals projection retained it. Preserve Claude's omission when reconciling. Its nested allow-list and neutral text changes still address confirmed gaps. No reserved files were edited during this task.

W6 `07438e4a` has no reserved-file overlap. It remains local because terminal GitHub credentials are unavailable despite reconnecting the app. The apply-ready patch remains available.

## Included report contents

- public-api-acceptance-matrix.md: requested full public field policy and checks.
- original-action-boundary-review.md: requested original action-boundary findings. Historical findings are not all current defects; use the verification above for fixes now landed.
- w1-original-review.md and w2-original-review.md: detailed earlier source traces. Their statements that local dependencies/tests were unavailable are historical; the targeted tests have now been rerun as above.

Next: Claude reconciles the nested projection into W3; separately complete W2 provider identity acceptance. W7 funding/OI changes belong in their own branch, independent of reserved files.
