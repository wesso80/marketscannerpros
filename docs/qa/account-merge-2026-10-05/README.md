# Job 5 — Account / Settings / Referrals

Base: `75aa7a48f60a0931c49b3ac4211fd2d8e36907da` (`batch/oct-wp`).

Screenshots are mocked application renders, not real account or provider evidence. All browser `/api/` requests are intercepted; external requests are aborted. No production mutations or billing actions were performed. Raw observation times, DOM text, geometry, request logs and errors are in each `evidence.json`. The “empty” case has no saved alerts; other account/referral fixtures remain populated. Signed-out login copy is unchanged.

| State | Before 1280 / 390 | After 1280 / 390 |
|---|---|---|
| Pro | 2.191 / 3.199 | 1.719 / 1.966 |
| Free | 2.191 / 3.239 | 1.816 / 2.117 |
| Signed out | 1.476 / 1.662 | 1.476 / 1.662 |

All phone documents measure 390px wide. One authenticated verdict above fold, one SourceLine, no default-open folds. Free's extra fold and existing upgrade button account for the additional height above the 2.0 target; it remains below the 2.3 hard maximum.

Before used the built Track Alerts worktree; its Account source SHA-256 equals the branch base (`45dd6f9ac53fc2e5564b18b869312d5a50540e7dc7b5a6f723aecaaa03bf9b81`). After uses this branch's production build. No shell overlay.

Closed word scans: zero hits. Expanded scans: **Golden Egg only**, inside two unchanged plan descriptions, pending the brief's plan-copy approval gate. Proposed substitutions: “Unlimited scanning + Symbol” and “Symbol Deep Analysis”. No limit or entitlement change proposed. Existing disclosure and reward wording retained.

Renewal date is not exposed by the existing account responses. Existing “Active · Renewal date in billing portal” wording and billing behavior are retained. The existing entitlement endpoint also does not return `aiUsedToday`; the UI now says Not collected instead of presenting fabricated zero usage. Alert/watchlist load failures likewise remain uncollected. No API, polling or provider policy change.

Tests: 45 pass across account render, client boundary, free copy, alert email controls, watchlist pricing and pricing-model files. Production build and standalone TypeScript pass. Browser: eight cases, zero page errors, redirect assertions for lower/mixed-case Settings and Referrals. Full suite was not rerun after the earlier provider-network approval block.

Reproduce with the repository dependencies and a production build, then `TRACK_ROOT=<repo> TRACK_OUT=<output> TRACK_PORT=3122 node visual.cjs`. The recorded runner uses the environment's isolated Playwright/Chromium paths; adjust those installation paths locally. Set `ALERTS_BEFORE=true` for the unchanged before page (the flag is inherited from the earlier runner). No live-data claim is made.
