# Admin mutation origin boundary

Branch: codex/admin-mutation-origins. Base: admin-integration 88785fa7e2fa5f30f4ad6c7b99a50fa44efb81e9. No merges, deployments, provider calls or production writes.

## Change

All inventoried admin POST/PUT/PATCH/DELETE handlers now apply an origin policy through the real shared authentication gate or an explicit session handler. The policy is scoped to /api/admin/ write requests. Public paths, jobs, operator paths outside that prefix and read methods keep their existing authentication behavior. No public route or page is edited.

Existing signed sessions, operator membership, workspace checks, pause gates and SameSite cookies remain in place. This adds explicit origin enforcement; it does not claim a demonstrated cross-site exploit or replace those protections.

- Admin and app session cookies require Origin to match the actual request origin or the existing explicit https://marketscannerpros.app allowance for Render's internal URL.
- Missing, null, foreign and lookalike Origins are rejected for cookie identities.
- A genuine verified admin-secret header, without an authenticated cookie identity taking precedence, may omit Origin. Invalid secrets remain rejected. A supplied foreign Origin is rejected even with a valid header.
- Cron authorization is unchanged. This does not promise that middleware admits header clients it previously rejected.
- Logout checks Origin before clearing the cookie. Legacy verify POST is still retired by Claude's separate #551; this PR does not restore it.
- Contest, research-events and research-scheduler have session fallbacks after requireAdmin. Those fallbacks now check origin too, so they cannot re-authorize an origin rejection.
- research-alerts/settings uses the same existing trusted-origin helper instead of rejecting Render's public origin against an internal request URL.

The shared lib/adminAuth.ts is edited, but the new policy returns unchanged behavior outside admin writes; tests pin the public/operator exception. lib/admin/mutationOrigin.ts is unchanged so its other consumers retain existing behavior.

## Caller compatibility

Browser fetch writes send Origin automatically. Cookie-based scripts must send a trusted Origin. Header-only scripts retain missing-Origin compatibility only where authentication/middleware already allows them. Authenticated cookie identity takes precedence over a simultaneously supplied secret; the secret cannot bypass its missing-Origin rejection. No forwarding header is trusted to manufacture an allowed origin.

No database migration or environment setting is needed. GET-side effects are outside this write-method change; the momentum read repair remains in #557. Future admin methods that bypass the shared auth gate need their own guard. A source inventory test covers the existing explicit handlers and the growth re-export.

## Verification

- 20 new tests use real session signing/verification and the real admin authentication gate. Cookie storage and operator membership are fixtures; effects/provider/database helpers are mocked.
- Real paper route rejects before automation/account effects for both cookie types. All four write methods cover trusted/direct, foreign, lookalike, insecure, null and absent Origin.
- Header-only valid/invalid credentials, cookie/header precedence, genuine cron authorization and public/operator-path non-interference are checked.
- Real contest/research-events/research-scheduler handlers reject before fallback effects; logout cannot clear cookies on rejected requests.
- Admin regression suite: 185 files, 1,563 tests passed. Public Copilot/auth/middleware boundary suite: 5 files, 32 tests passed. Project typecheck passed.
- Computed merge trees (no branch merges) are clean with #551, #555 and #561. Combined #551 session route/layout/tests plus this change: 28 focused tests passed. The existing session test helper now supplies the same-origin header required for a legitimate logout; rejection tests separately cover its absence.

Commands used with the isolated locked dependency checkout:

```sh
vitest run test/admin
vitest run test/publicCopilotRoute.test.ts test/copilotAccessBoundary.test.ts test/middlewareOperatorGate.test.ts test/middlewareAdminPauseAfterAuth.test.ts test/freeTierAuth.test.ts
tsc --noEmit --incremental false --typeRoots ./node_modules/@types
```

## Next proposed work

M5: separate admin paper-action outcomes from the follow-up account snapshot. If a setting change succeeds but refreshing the snapshot fails, the response should report the completed action and unavailable snapshot instead of presenting the whole operation as failed. This remains unimplemented here. Global automation scope/permission policy (M4) still needs its separate decision.
