# Free tier v1 — build and verification record

Draft implementation of Brad's 4 October 2026 free-tier brief. Base: `main` at `325d117d3798f2b9e23df0dbe9cd3d893aacd988`. Branch: `free-tier/v1`. This branch has not been merged or deployed.

## Merge blockers and acceptance work

1. Phase 1 PR #347 remains open at `d1a503a2346b55322e3e8addadcc40031faca6d4`. The brief explicitly permits the other orders in a draft, but prohibits the Golden Egg page edit until that merge. After it merges, **merge main into this branch**, without rebase or force push, then implement F-5/F-6 in the Golden Egg locked-card block only. The API's 403 error distinction is present; the Golden Egg free preview and its 401/403 page tests are not.
2. The requested before/after screenshots and signed-out/Free acceptance at 1280 px and 390 px remain outstanding. The connected browser rejected the local preview with `ERR_BLOCKED_BY_CLIENT`; no screenshots are being presented as proof. The components use responsive layouts and 40–44 px buttons, but visual fit and the reported black-page problem are not verified in a real free session.
3. `test/layoutNavigation.test.ts` still requires every login to land on Overview. That conflicts with this brief's free Today landing and safe return URL. The brief protects this test from edits, so it remains unchanged and failing. Reconcile this test with Phase 1 before marking ready.
4. Brad's pre-merge confirmation of the signed-out slim disclosure default remains required by the brief. The actual disclosure wording and version are unchanged; authenticated acceptance is still explicit and recorded on the workspace.
5. Live acceptance must verify a fresh free sign-in, actual scan response/latency, quota persistence across reloads and independent browsers, and the next Daily Radar run. No production scan, email, admin action, paper cycle or trade was run for this verification.

## Work orders implemented

| Order | Change |
| --- | --- |
| F-3 | Atomic free scan reservation, one shared 5/day constant, workspace or visitor/IP identity, DB-only usage endpoint. Free/anonymous scanner hooks load saved daily picks instead of running scans on mount. |
| F-10 | Validated local `next` through magic-link/verify, free Today landing, paid Overview default, corrected scalper link, loading skeletons, stricter Crypto Explorer gate. |
| F-5 | Free Scanner view and Macro summary use real available values or friendly unavailable notes. Optional friendly MarketStatusStrip mode leaves other callers unchanged. Overview and Golden Egg edits deferred/protected. |
| F-6 | `UpgradeRequiredError` extends `AuthError`; 403 is distinguishable from 401. Golden Egg page intentionally untouched. |
| F-2 | One-symbol AAPL/SPY/BTC/NVDA demo, explicit POST only on click, visible live allowance/reset time, real stored response score, timestamp, friendly error and upgrade state. Handles the scanner's `BTC-USD` response. |
| F-1 | `/tools/start`: five saved public picks with ranked bars, metadata-only Radar preview and earlier-session symbols, demo, Overview link. No scan POST on mount. |
| F-4 | Labelled static example previews for locked tools; separate paid child components prevent free users mounting their data-fetch hooks. Radar uses the allowlisted historical preview. |
| F-7 | Signed-out Start Free banner with return URL; slim disclosure notice. New authenticated users still explicitly accept; old anonymous acknowledgements are not silently copied into their workspace. |
| F-8 | Shared pricing/account limits, active alerts counted rather than paused history, list count rather than symbol count, free journal with 5 open entries. Both journal replacement and actual add-trade routes enforce the cap under the same workspace transaction lock. |
| F-9 | Free Macro summary and UI-only deep-module previews. Intelligence APIs stay open for existing Radar collectors. Free Macro does not run the existing polling interval. |
| F-11 | Dismissible upgrade moments at scan/alert/watchlist/portfolio/journal limits, usable Dashboard/Explorer upgrade links, AI quota-reply link. No timed prompts. |
| F-12 | Consent-aware, session-deduplicated first-scan, scan-limit and preview events plus upgrade click events. No email or symbol-list properties. `free_signup` deliberately not emitted: login does not return an account-is-new flag. |

## New endpoints and data boundary

- `GET /api/scanner/usage` reads `scan_usage` for the authenticated workspace, valid first-party visitor cookie, or hashed IP fallback. It returns `{used, limit, resetsAt}` and is private/no-store. It establishes an HttpOnly visitor cookie; the demo reads this endpoint before any scan. A client that rejects cookies retains the same IP bucket. No provider call or migration.
- `GET /api/msp-radar/preview` uses `pgReportStore` read operations only. Its allowlist is latest `sessionDate`, `status`, candidate count, and at most three symbol names from a strictly earlier session. No current symbol names, headline, candidate scores, operation fields or raw report JSON. The true latest session comes from the archive so a failed latest report is not disguised by an older successful one. Missing counts are null, not invented zeros; failed reports do not display a pick count.
- Locked examples are explicitly illustrative. Blurring is not used as an access boundary over today's paid data. No new data providers or new data-provider call paths were added.

## Code-confirmed choices and deviations

- The shared scan constant lives in server-safe `lib/free/limits.ts` and is re-exported by `lib/useUserTier.ts`; importing a client hook module into the server route would be incorrect.
- `/api/scanner/top-cached` rejects anonymous access, so saved views use the existing public daily-picks DB endpoint.
- The free live action is a single-symbol demo request (one reservation). Saved-list refreshes are DB reads; there is no new combined equity+crypto live-universe Rescan button. Paid live-on-load behavior stays as before.
- Quota counts attempted scan requests: reservation happens before provider work and is not refunded on a provider failure. The existing per-IP request limiter stays in place. The supported demo initializes visitor identity via the usage GET; cookie-blocked visitors behind the same IP share its fallback allowance.
- Demo values are stamped with the actual completed-bar timestamp. It does not invent a market-closed date when the response does not supply that evidence. The brief's exact closed-session wording remains an acceptance gap.
- The macro URL is canonically redirected by protected `next.config.mjs` to `dashboard?tab=macro`. Catalog links retain that canonical route; the free Macro component works inside that tab, and the CTA is no longer inside a pointer-disabled wrapper. No redirect config was changed.
- Journal creation actually uses `/api/journal/add-trade`; capping only `/api/journal` would leave a bypass. Both were covered. The brief defines the limit as five **open** entries, not five lifetime entries.
- Pricing uses existing portfolio/AI limit helpers, not new limits. Account/Workspace now also state the scan and open-journal allowance in their free feature list.
- The Render service read confirmed `main` auto-deploy with previews off. Its read interface did not expose which analytics environment variables are set; enabled production analytics providers and receipt of events remain unverified. No environment variables were changed.

## Defaults used

1. Free journal: yes, five open entries, server checked; advanced analytics/import/AI review retain their paid gates.
2. Free scans: five per UTC day; reset displayed in the viewer's timezone.
3. Macro summary free; deep modules gated in UI only; APIs open.
4. Signed-out slim disclosure, explicit authenticated acceptance; Brad's confirmation before merge outstanding.
5. Radar latest metadata plus three previous-session symbols.
6. Free default landing `/tools/start`; paid/admin default Overview; validated `next` takes priority.
7. Remove the unimplemented delayed-data promise instead of introducing an artificial delay.

## Verification

All network calls in the added tests are mocked. This evidence is local code behavior, not deployed observations.

- `npx tsc --noEmit`: pass.
- Focused free-tier coverage: 25 tests across 7 files. Workspace/visitor/IP quota identity and reset; independent visitor caps; GET does not charge; usage-cookie/no-cache/error behavior; journal add route rejects sixth entry before insert; safe return URL; copy/constants; historical Radar allowlist; free/anonymous Scanner/Today and dashboard scan-hook loads issue no scan POST; one demo click decrements once; BTC response normalization; paid children do not mount behind free gates; loading state; consent/deduplication; limit prompt dismissal.
- Last completed full suite: 4,773 passed, 11 failed, 13 skipped (543 files); this predates the final active-alert, Radar missing-count, demo refresh/BTC corrections. A subsequent full rerun was interrupted with `network approval was cancelled before a decision was returned`; no final summary was produced. The final focused suite covers those corrections. Full-suite completion on the final commit remains an acceptance gate. Baseline families also seen on main include backtest minimum-history assertions; bulkSelectionRoute and cryptoScanAliasRows timeout failures; commanderCommandState; operatorMarketDataAccuracy; workerEquityBulkWiring; globalM2Reliability. `CRYPTO_SUMMARY_KEY` is unset for the test command as required. The additional protected landing assertion is listed above, not concealed as a baseline failure.
- `git diff --check`: pass. Protected-scope scan: no admin/operator/paper, scoring, Stripe, dependencies, migration, middleware/config, Phase 1 or PR #346 protected files changed.
- Typecheck and full suite were run after each work order; final corrections received a clean typecheck, focused suite and an interrupted full-suite attempt. No screenshot, browser-session acceptance, production latency or analytics delivery claim is made.

## Files shared with Phase 1

None at this stage. The sole allowed exception, Golden Egg's locked-card block, is deferred until #347 merges. No header, Overview, visual primitive, protected test or Phase 1 documentation was modified.

## Noticed, not changed

- Overview UNKNOWN regime/quotes and its text-only Radar lock are Phase 1 concerns. Header Pro labels/persistent upgrade CTA are protected.
- Existing v2 blur gates elsewhere can mount real children; review each data boundary separately.
- Portfolio's three-position cap is browser-only; its server API is unchanged.
- Public daily-picks accepts historical dates.
- Dead pricing components, legacy Pro Trader terms and stale entitlement documentation remain.
- Signed-out copilot may display Unauthorized. Movers/Calendar/News walls differ from API access.
- The existing shared UserTierProvider abort timeout can leave loading unresolved because its catch returns for any aborted signal. This was found statically, not reproduced as the reported signed-out black page; the provider was not changed outside this brief's targeted pages.
- Legacy cached rows without canonical scores still pass the existing ranked-queue fallback on Dashboard/Overview. Scoring code is protected; the new free Scanner and Today display the stored score directly.

## Post-merge/deploy acceptance handoff

Only after dependency, legal-style confirmation, protected-test reconciliation and visual checks: Brad merges this one PR. Then verify the brief's 12 post-deploy checks using a Free test account and signed-out browser, including independent visitor quotas, 401/403 Golden Egg behavior, no scan POST on reload, no paid data in HTML, Macro/Radar continuity, and admin/operator unchanged. This draft is not a deployment or a finished-product assertion.
