# Titles and small items — Job 14

Base `de508e5fd0d496ba32be52e6a908508282c42ec9` from batch/oct-wp. Draft for review, **not an all-gates-pass claim**.

Removed duplicate branding from page metadata, added nested title templates and per-page Intelligence titles, and named the 404. Daily Picks gets a stable page title without changing its Open Graph/Twitter title or data fetch. Tab titles follow Track, Macro, Explorer and Terminal; a scoped observer keeps streamed metadata from overwriting the selected client tab and disconnects on unmount. Route names and identifiers are unchanged.

Removed Movers' invented audit-log data, tabs and rows. No scoring, filters or market-data code changed. Terminal missing calendar values now read Not collected / No instead of em-dash placeholders. Public Scanner, Radar, Deep Analysis, Crypto header and selected Intelligence display names are plain Symbol / Overview; protected wording and owner conflicts are listed below.

## Title evidence

34 URLs checked with curl against a local production build: **32 pass, 2 unresolved**. All eight client-navigation title checks pass (Journal, Portfolio, Watchlists, Alerts, Backtest, Learning, Macro, Market Movers). Raw titles and UTC observations are in after/evidence.json.

- `/reviews`: still doubled. Job13 explicitly says do nothing until Brad's retire/keep decision; no Reviews edits made. If kept, the concrete title fix is `title: 'Reviews'` under the existing root template.
- `/share/scan/AAPL`: the existing database read fails against the isolated dummy database, so curl cannot collect a rendered title. The unchanged metadata uses the unbranded `${data.symbol} — study snapshot` and root template. No production DB, provider or OG changes were made. Needs a populated approved preview to verify HTTP output.
- Metadata-only legal, pricing and public pages retain their existing body/layout. This is not an acceptance claim for their full page length or copy.

| View | Before 1280 / 390 | After 1280 / 390 | PNGs |
|---|---|---|---|
| auth | 1.677 / 1.877 | 1.677 / 1.877 | [before 1280](before/auth-1280.png) · [before 390](before/auth-390.png) · [after 1280](after/auth-1280.png) · [after 390](after/auth-390.png) |
| movers | 2.175 / 3.621 | 2.123 / 3.571 | [before 1280](before/movers-1280.png) · [before 390](before/movers-390.png) · [after 1280](after/movers-1280.png) · [after 390](after/movers-390.png) |
| redirect-ai-tools | 1.137 / 1.341 | 1.137 / 1.341 | [before 1280](before/redirect-ai-tools-1280.png) · [before 390](before/redirect-ai-tools-390.png) · [after 1280](after/redirect-ai-tools-1280.png) · [after 390](after/redirect-ai-tools-390.png) |
| redirect-crypto-heatmap | 1.121 / 1.463 | 1.121 / 1.463 | [before 1280](before/redirect-crypto-heatmap-1280.png) · [before 390](before/redirect-crypto-heatmap-390.png) · [after 1280](after/redirect-crypto-heatmap-1280.png) · [after 390](after/redirect-crypto-heatmap-390.png) |
| redirect-crypto-intel | 1.147 / 1.380 | 1.147 / 1.380 | [before 1280](before/redirect-crypto-intel-1280.png) · [before 390](before/redirect-crypto-intel-390.png) · [after 1280](after/redirect-crypto-intel-1280.png) · [after 390](after/redirect-crypto-intel-390.png) |
| redirect-desktop | 1.137 / 1.341 | 1.137 / 1.341 | [before 1280](before/redirect-desktop-1280.png) · [before 390](before/redirect-desktop-390.png) · [after 1280](after/redirect-desktop-1280.png) · [after 390](after/redirect-desktop-390.png) |
| redirect-time | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/redirect-time-1280.png) · [before 390](before/redirect-time-390.png) · [after 1280](after/redirect-time-1280.png) · [after 390](after/redirect-time-390.png) |
| sweep-anonymous | 1.000 / 1.100 | 1.000 / 1.100 | [before 1280](before/sweep-anonymous-1280.png) · [before 390](before/sweep-anonymous-390.png) · [after 1280](after/sweep-anonymous-1280.png) · [after 390](after/sweep-anonymous-390.png) |
| sweep-free | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/sweep-free-1280.png) · [before 390](before/sweep-free-390.png) · [after 1280](after/sweep-free-1280.png) · [after 390](after/sweep-free-390.png) |
| terminal-chain | 2.033 / 2.884 | 2.033 / 2.884 | [before 1280](before/terminal-chain-1280.png) · [before 390](before/terminal-chain-390.png) · [after 1280](after/terminal-chain-1280.png) · [after 390](after/terminal-chain-390.png) |
| terminal-close | 1.000 / 1.168 | 1.000 / 1.168 | [before 1280](before/terminal-close-1280.png) · [before 390](before/terminal-close-390.png) · [after 1280](after/terminal-close-1280.png) · [after 390](after/terminal-close-390.png) |

## Eight layout gates

| Gate | Answer |
|---|---|
| One verdict above fold | No new verdicts added by metadata work. Existing Terminal chain duplicates hierarchy and remains a read-only finding; no global pass claimed. |
| About two screens closed | Partial: close-calendar, locked Sweep, auth and all five redirect destinations fit. Movers is 3.571 phone screens; chain is 2.884 without data and 3.652 populated. See findings. |
| No sideways scroll at 390 | Yes for all 24 checked browser cases: document width390. Chain itself retains its intentional folded horizontal table. |
| No fake/empty tools | Invented Movers log fully removed. Existing #369 Sweep gates verified without changes; free/anonymous have no Run scan button. |
| No banned/engine words | Changed missing-value/name literals cleaned. Protected copy and unchanged read-only views prevent a global clean claim. |
| Readable numbers +one source | Calculations/formatting unchanged. Chain has one SourceLine; metadata work does not add fabricated sources to static pages. |
| Screenshots | 44 before/after plus two populated-chain review PNGs, at1280×800 and390×844. Metadata-only pages keep their layouts. |
| Symbol / Overview / Track | Partial: eligible public copy fixed; scoped owner/protected exceptions below. |

## Read-only findings required by brief

- Crypto Heatmap → `/tools/explorer?tab=crypto-command&section=heatmap`.
- AI tools → `/tools`; Desktop app → `/tools`.
- Time → `/tools/terminal?tab=time-confluence&symbol=MU&type=equity`, preserving context.
- Crypto Intel → `/tools/explorer?tab=crypto-intel&symbol=BTCUSD&type=crypto`, preserving context.
- All five verified in a browser at both widths. Their routing implementations were not changed.
- Auth: the email sign-in form plus the existing separate admin form fit 1.677 desktop /1.877 phone screens, document width390. No credential entry, submission or login/access-copy changes.
- Terminal Chain-quality / Options Terminal: populated prior-session fixture is 2.551 desktop /3.652 phone screens, one SourceLine and no document overflow, but duplicate outer/inner hierarchy and open IV/navigator/inspector sections remain. “IV history unavailable” also remains in its educational model note. These are recorded only as requested; Job16's shared Options component is the next permitted layout work. [Desktop](chain-read-only/terminal-chain-loaded-1280.png) · [Phone](chain-read-only/terminal-chain-loaded-390.png).
- Movers: deleting the fabricated fold reduces length slightly, but its existing top panels still exceed the general length gate. No additional Movers rewrite in this small-items job.

## Noticed, not changed / naming ownership

The full remaining grep is preserved in remaining-name-matches.txt. No claim that global gate8 is clean.

- `app/tools/golden-egg/page.tsx`: owned by the still-HOLD additive #353; not rewritten or duplicated here. Symbol OG titles/alt text belong to held link-preview work, unchanged.
- Homepage components and Partners demo are Patch/growth-owned, unchanged.
- Pricing and Account plan lists and Crypto access statements retain Golden Egg / Command Center names because billing/access copy is protected. Proposed exact name-only changes for Brad: Golden Egg → Symbol; Crypto Command Centre/Center → Crypto Overview. No amount, promise, limit or access wording changes proposed.
- Deep Analysis's existing legal disclaimer includes Golden Egg; preserved verbatim. Comments, API payloads/prompts, admin/operator surfaces and `app/v2/_lib` are excluded from text/aria-only edits.
- Crypto Heatmap's brief redirect message is untouched because its route is explicitly check/report-only in this job.
- Guide's tool list naming fix is already submitted in #389; no duplicate edit here.
- The old fabricated-log phrases occur only in the retained before observation JSON. Application/component grep has zero matches; evidence is not silently rewritten to manufacture a repository-wide zero.

## Verification and limitations

Production build and standalone TypeScript pass; nine focused tests pass, including title streaming/tab-change/unmount behavior and the client/server import boundary. Browser checks show zero page errors. All API calls are intercepted, external calls aborted, local DB points to a closed dummy port. No live provider requests or production mutations, no merges or deployments.

Before capture uses the research-layout build with identical relevant page, root and shell sources at base. Final checked title/tab behavior and populated-chain inspection use this PR's build; a later two-literal Crypto standalone header rename does not affect the captured embedded view and is covered by final build/typecheck. Shared legal, pricing, auth, scoring, provider, polling, schema, data-truth #367 and OG/Twitter content remain unchanged.
