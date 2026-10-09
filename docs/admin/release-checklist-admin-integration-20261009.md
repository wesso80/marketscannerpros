# Admin release checklist — `admin-integration` → `main`

Status: **not released**. Merging `admin-integration` into `main` is the deploy (Render builds `main`).
It happens only when the owner explicitly approves. Nothing here has been run against production.

Validated tip: `admin-integration` @ `d98ef088` (contains `main` @ `63da1d34`):
full suite 6,730 passed / 0 failed / 31 skipped, `tsc --noEmit` 0 errors, `next build` passes.
Later tip `760a4efa` (adds #569, #574, #575, #576): 6,746 passed / 0 failed / 31 skipped, `tsc` 0, `next build` passes.
These results are for those tips only. Re-run all three on the final tip, which must include the final head of
Codex's #568 (mobile navigation plus visual work).

## 1. What ships

### Public-facing changes (call these out in release notes)

#552 and #556 were approved by the owner in the Claude session (low-float gate: "yes"; Journal: "it should not stop public
from using journal"). Codex's admin tasks keep public frozen and cannot see that approval, so the owner should
re-confirm both when approving the release. #576 (retire rather than harden) was chosen by the owner on 2026-10-09.

| PR | Change | Who notices |
|----|--------|-------------|
| #552 | `/api/scanner/low-float` is admin-only. Non-admins get `403 Admin access required`. | Any public page or user calling low-float. |
| #556 | Journal `add-trade` is no longer blocked by the admin kill switch. | Users could log trades during a kill-switch pause. |
| #576 | `/api/ai/analyst-context` and `/api/ai/explain` return 410 (retired). No page called them. | Only direct API callers. |

No other public page, route or shared engine changed. Non-admin files touched outside admin paths:
`middleware.ts`, `lib/adminAuth.ts` (admin gating only), `app/api/actions/execute/route.ts` (operator-only),
plus the routes above (low-float, Journal add-trade, the two retired AI routes) and their tests; the unused
`lib/ai/useAnalystContext.ts` hook is deleted.

### Admin sign-in and session behaviour

- The secret login form is retired (#551). Sign in at `/admin/login` or with an account whose email is in `ADMIN_EMAILS`.
  `POST /api/admin/verify` returns 410.
- **Everyone will need to sign in again** if their `ms_admin` cookie came from the retired secret login (`cid admin_admin_secret`).
- `ms_admin` cookies stop working as soon as the identity leaves the admin list. Removing an email from
  `ADMIN_EMAILS` revokes cookies already issued (#567).
- Admin logout clears both `ms_admin` and `ms_auth` (signs out of the main app too) (#567).
- Admins on paid (`cus_*`) accounts are admitted by middleware via their workspace hash (#549).
- `/api/operator/*` and `/api/actions/execute` require an operator/admin, not just any signed-in user (#547).

### Write protection

- Admin/operator writes (`POST/PUT/PATCH/DELETE` on `/api/admin`, `/api/operator`, `/api/actions/execute`)
  refuse foreign Origins (#562 middleware, #563 route level). Trusted: the request's own origin,
  `https://marketscannerpros.app`, `https://www.marketscannerpros.app`.
- Manual simulated orders require an `Idempotency-Key` (16–128 chars) and use migration 130 (#561).
- `order.export` returns a plain-text research note, not a broker order file (#559).

### Admin-only fixes

Error text no longer leaks internals — responses carry `Request failed (ref xxxx)` and the ref is in the logs (#555);
freshness/source stamps on 8 admin pages (#566; Symbol page is a hold item, below); read-only Settings reference and dead nav removed (#560);
Health overview (#550); paper reads without DDL (#553); momentum GET read-only (#557); paper-action outcomes (#565).

## 2. Hold items (unresolved — release waits on these or an explicit owner deferral)

- [x] **Symbol page freshness (from Codex's #566 review)** — fixed by #574 + #575 (merged): `dataAsOf` is the close
      of the newest completed price bar actually supplied (future/forming/unordered bars ignored, none → unknown),
      packet build time shown separately as build time.

## 3. Before merging to `main`

- [ ] Codex's #568 (mobile navigation and visual work) merged into `admin-integration` (or explicitly deferred).
- [ ] Hold items in section 2 resolved or explicitly deferred by the owner.
- [ ] Owner re-confirms the public changes (#552, #556, #576).
- [x] #569 (Health guard skip removal) merged.
- [ ] Final tip re-validated: full vitest, `tsc --noEmit`, `next build`.
- [ ] **Apply `migrations/130_admin_manual_order_requests.sql`** to the production Neon database (owner runs it;
      `CREATE TABLE IF NOT EXISTS`, additive, safe to apply before the deploy). Without it, manual simulated orders fail closed with 503.
      Never prune `admin_manual_order_requests` — deleting a receipt makes its key reusable.
- [ ] Scripts that create manual simulated orders send `Idempotency-Key` and reuse the same key and body on retry.
- [ ] Cookie-based admin scripts send `Origin: https://marketscannerpros.app`. Header-only callers are unchanged.
- [ ] `ADMIN_EMAILS` on Render lists every admin email (this is now also the revocation list).
- [ ] Tell admins they will be signed out once and should use `/admin/login`.
- [ ] Release notes mention #552, #556 and #576.

No new environment variables are required.

## 4. Deploy

- [ ] Owner merges `admin-integration` into `main` (merge commit, no squash) and watches the Render build.

## 5. After deploy (owner, in a browser — never paste tokens into chat)

- [ ] Signed out: `/admin` redirects to sign-in; `/api/admin/health` returns 401.
- [ ] Sign in at `/admin/login`; Health, Settings and one stamped page (e.g. Outcomes) load with source/freshness lines.
- [ ] Admin logout also signs you out of the main app.
- [ ] Non-admin account: `/api/scanner/low-float` returns 403; Journal still accepts a trade.
- [ ] One manual simulated order with an `Idempotency-Key`; repeating the same request returns the same result, not a second order.
- [ ] A write from another site is refused (e.g. from devtools on another origin: `fetch('https://marketscannerpros.app/api/admin/verify', {method:'DELETE', credentials:'include'})` → 403).
- [ ] Render logs show no new 5xx bursts; any admin error has an `[admin-error ref]` line.

## 6. Rollback

Revert the merge commit on `main` (Render redeploys). Migration 130 is additive and can stay.
Rolling back restores the old secret login and the old low-float/Journal behaviour.

## 7. Owner follow-ups (outside the code)

Rotate credentials flagged earlier: Neon, Alpha Vantage, and any secrets ever passed as `?key=`.
