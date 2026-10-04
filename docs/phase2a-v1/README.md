# Phase 2A — updated after #348 merged

Current main base: `f74d257f160c4a0e5665e4ca38b851a5ba70e081` (#348 merge). Main was merged normally into the existing `phase2a/v1` branch, without rebase or force-push. All work remains in draft PR #349; Brad merges. No production deployment or live-data mutation.

## Previously deferred P2A work now implemented

- **P2A-4/12:** All tools is a searchable, seven-group catalog of **57 unique destinations**, generated from the same destination map as desktop and phone menus. One compact name/phrase/access-chip row per item; counts derive from catalog data. Today starts open, other groups folded, matching groups open during search. Duplicate Options, Movers, Research, Earnings and Time Confluence entries removed. Crypto Heatmap points at its final Explorer URL. Named tab/section links have exact active states.
- **Saved-page compatibility:** retained canonical keys and mapped obsolete duplicate keys. Favorites resolve/deduplicate legacy aliases without a migration or automatic writes; explicit unpin removes stored aliases. Liquidity Sweep shows Free, matching its actual `canAccessScanner` gate. Pro tools retain their page/API gates; labels do not change entitlements. Macro remains Free summary; Intelligence remains Pro.
- **P2A-5:** fixed the remaining Alerts/Workspace workflow links and Portfolio sign-in link (safe next URL). These were blocked on #348 before. All tools omits the unrelated global RegimeBar and page-favorite toggle.
- **P2A-7:** removed the final two redirect-shadowed, zero-importer page implementations (`crypto-terminal`, `journal`). `post-348-import-audit.json` records the fresh audit before these deletions. All 15 embedded route pages remain; only the explicitly requested link literals in Alerts/Portfolio were changed.
- **P2A-8:** #348's IntelligenceGate retained and tested: Free access does not mount paid children. Three live module statuses are folded into one ChipRow; one SourceLine; Coming soon remains closed. Reused/extended #348's friendlyStatus helper, including historical options and missing-value wording, without changing underlying status/scoring logic.
- **P2A-10:** collapsed and minimized ARCA launchers now occupy their own normal-flow row at the end of tool content, so they cannot cover page controls. Hide/minimized targets are 40px. The explicitly opened chat panel remains its existing overlay. No AI request behavior or new polling added.

## Acceptance and scope

The code tasks previously blocked on #348 are complete in this branch. **PR #349 stays draft pending visual acceptance**, not another dependency merge. Required before/after 1440px and 390px screenshots remain unavailable because the connected preview was blocked by browser policy in the prior run. No policy workaround attempted. The launcher placement change is verified structurally in rendered tests; actual browser layout still needs review.

The current-code route inventory test covers every public static content route, excluding existing redirects, account-transition pages, dynamic detail pages and deliberate omissions (Reviews D4, no-index partner demo, unfinished Intelligence modules). The named source review files are still unavailable; this inventory supplements the pasted brief rather than pretending those files were read.

Defaults D1–D5 unchanged. P2B–P2E still wait for the preceding phase to merge; no additional phase branches or PRs created. Journal preference UI, own-trade KPIs and server dedupe remain P2E. Catalog/navigation names are unified; later-phase page bodies are not broadly renamed in P2A. Compliance text, APIs, scoring, limits, providers, paper/admin/operator code and deployment configuration remain unchanged relative to merged main.

The Macro route conflict remains documented below and is for P2B. All tools is now the catalog rather than the historical five-stage workflow. Research auto-log remains default-off as in the first P2A commit.

## Updated verification

Final `env -u CRYPTO_SUMMARY_KEY npx vitest run`: **4,869 passed / 5 failed / 13 skipped**, 552 files. Four failures match the fresh main baseline; the fifth is the previously documented `cryptoScanAliasRows` timeout. `bulkSelectionRoute` timed out on baseline but passed in the final run. P2A + free-tier cases: **88 passing tests in 14 files** within that run. `npx tsc --noEmit`: clean. Merged-main baseline: **4,826 passed / 5 failed / 13 skipped**, 547 files. Failures: commanderCommandState, operatorMarketDataAccuracy, workerEquityBulkWiring, intelligence/globalM2Reliability and bulkSelectionRoute timeout. cryptoScanAliasRows remains a previously documented flaky timeout. TypeScript is clean; focused P2A/free-tier tests pass. Protected-file and whitespace checks passed.

---

## Historical pre-#348 implementation record

The following is the first draft's audit record. Its dependency/deferred-task statements and test totals are historical; the update above supersedes them.

# Phase 2A — independent work, draft only

Base: `d2bb03592e58550d69b0fc9da2bc1dcee5e20b54` (Phase 1 / #347).
Branch: `phase2a/v1`. One PR. Brad merges; no merge, rebase, force-push or deployment performed.

## Dependency and source boundary

#348 is still open at `504d77e97f713fe0ef5c9148e9b95d090a1f32c0`. This draft follows section 3.6's exception: implement independent tasks, skip files shared with #348, and keep the PR draft. Changed-file overlap with #348 is **zero**. Once #348 merges, merge main into this branch and complete deferred P2A work in this same PR. Do not merge this partial draft first.

The implementation uses Brad's pasted 4 Oct Phase 2 brief and repository inspection. The named `page-review-notes.md`, `site-map.md`, `site-map-summary.md`, and `pr-347-review.md` were not available in the repository or resolved document search. The full ~54-page catalog coverage cannot be certified from Appendix C's abbreviated reference. No other review document was substituted.

## Task status

| Task | Result in this draft | Remaining |
|---|---|---|
| P2A-1 | Six reusable components: StatTile, ChipRow, CollapsibleSection, SourceLine, EmptyState, TabBar. Reuses Phase 1 StatCard/StampLine and existing value-tone map. Keyboard/empty/source tests. | Adopt in later phases; visual acceptance. |
| P2A-2 | Seven desktop and phone groups from one destination map. Daily Picks, Intelligence, Signal Accuracy, Partners and legal links reachable. | Full sitemap/catalog completeness after sources and #348. |
| P2A-3 | Correct active groups; Track sub-bar handles Settings, Signal Accuracy and My Pages; obsolete backtest area removed. | P2B retires Dashboard's command tab; no Dashboard body changed here. |
| P2A-4 | Deferred. | All tools/catalog grouping, search, dedupe and chips depend on #348's `lib/toolCatalog.ts`. |
| P2A-5 | Terminal's broken workflow action → All tools; Macro guide URL canonicalized; static OG image endpoint; sitemap canonical paths; Footer Contact, Refund policy, Compliance Hub. | Alerts/Workspace workflow links and Portfolio `/login` live in #348-shared files. `/auth/login` belongs to #348. |
| P2A-6 | Resources redirect into two preserved, folded Guide sections; Partners linked; demo noindex; Desktop App retired to All tools. | Reviews left unchanged (D4). |
| P2A-7 | Four legal bodies moved unchanged to short canonical routes (trailing whitespace removed); old legal pages redirect. 14 redirect-shadowed route implementations, middleware-shadowed quant page and six unimported components removed. | Two other pure-dead pages shared with #348 deferred. All 15 imported redirect-shadowed pages retained. |
| P2A-8 | Intelligence nav has Overview plus three live modules; Soon/History absent. Overview has a home link and one folded Coming soon list. | Gating/layout changes deferred (`app/intelligence/layout.tsx` shared with #348); existing status wording/charts belong to later work. |
| P2A-9 | `fireAutoLog` exits before operator state or fetch unless explicitly opted in. Missing/blocked storage defaults OFF. | User-facing setting and server dedupe/KPI filtering are P2E; no Journal UI or route edits here. |
| P2A-10 | Deferred. | Floating copilot file overlaps #348. No claim that overlap is fixed yet. |
| P2A-11 | Persistent aria-controls targets, ArrowDown open/focus, menu arrow/Home/End/Escape, drawer focus trap, theme-accent hover. | Actual 1440/390 px layout acceptance. |
| P2A-12 | Navigation labels use the agreed names. | Catalog tiers and all visible body labels after #348 / later phases. |

## Auto-log behavior

The preference is browser-local (`msp:auto-log-research`, exact string `true` only). P2E can wire its setting through `setResearchAutoLogEnabled`. This draft adds no settings control, so existing users remain off. It is not an account-synced preference. Existing records are not deleted or reclassified. The remaining Options scanner caller uses the helper. The old Markets/Movers implementations were already redirected and are now removed. AlertsWidget's explicit action still calls the auto-log endpoint directly and is deliberately unchanged. This is not a blanket server prohibition on journal writes.

## Deletion evidence

`import-audit.json` records the pre-deletion graph: TypeScript module resolution over tracked TS/JS import/export/dynamic-import/require statements, with the repository tsconfig. Every removed component/page has zero resolved importers. It records all 15 embedded redirect pages that were preserved byte-for-byte, and the two zero-importer pages (`crypto-terminal`, `journal`) deferred because of #348.

The audit command is `node docs/phase2a-v1/audit-imports.cjs` from a checkout of the base commit (script may be supplied from this branch). It prints JSON; it does not mutate the repository. `/quant` is separately covered by the existing middleware redirect to `/admin/quant`. No middleware change. Tests exercise page redirects and verify each retired route still has its existing next.config redirect with a live destination. `app/v2/_lib` and `_components` remain intact.

Retired implementations: `/v2`, `/v2/scanner`, `/tools/options-terminal`, `/tools/gainers-losers`, `/tools/heatmap`, `/tools/markets`, `/tools/earnings`, `/tools/earnings-calendar`, `/tools/ai-analyst`, `/tools/crypto-time-confluence`, `/tools/watchlists`, `/tools/backtest`, `/tools/settings`, `/tools/scanner/backtest`, `/quant`.

Unimported components removed: MobileNav, UrgencyHero, WorkflowHero, MidCTA, HomePricingCTAs, app/components/Hero.

## Verification

- `npx tsc --noEmit`: clean.
- `env -u CRYPTO_SUMMARY_KEY npx vitest run`: **4,824 passed, 10 failed, 13 skipped**, 543 files.
- Identical-main baseline: **4,790 passed, 11 failed, 13 skipped**, 539 files.
- Every final failure also occurs in the baseline: backtestStrategySignals (4), bulkSelectionRoute timeout (1 final, 2 baseline), commanderCommandState, cryptoScanAliasRows timeout, operatorMarketDataAccuracy, workerEquityBulkWiring, intelligence/globalM2Reliability. These protected/pre-existing failures were not fixed in this phase.
- Existing source guards were updated only where navigation contracts changed or the implementation was retired. Backtest safety guards now target the actual BacktestHub; scoring unit tests remain. New UI tests render the menus, shared components, live Intelligence tabs and Footer; page redirects are invoked with Next redirect mocked. New network-dependent tests mock fetch.
- Scope checks: no #348 file overlap; no edits to prohibited admin/operator/paper/scoring/provider/config/dependency/migration/disclosure files. Legal text retained. No new provider or polling.
- No production scans, paper cycles or trades run.

## Screenshots and acceptance — outstanding

Before/after screenshots at **1440 px and 390 px are not available**. The connected browser's local preview is blocked; inspecting its error tab was also rejected by browser URL policy. No alternate browser or policy workaround was attempted. Render tests are not visual proof.

Affected visual surfaces: global Header/phone drawer and Footer (all pages), Track sub-bar, Guide and redirected Resources destinations, Intelligence overview/tab bar, canonical legal pages (content relocation), Terminal action label, static OG image; Desktop App now redirects. Partner demo changes metadata only. Shared primitives need representative integration screenshots when adopted. Thus S1–S10 are **not signed off** for this draft. In particular All tools, ARCA overlap, existing Intelligence status text and all later-phase bodies remain pending.

## Defaults and noticed, not changed

D1 Pro scanner is a future Scanner tab; D2 disclosures unchanged; D3 follow #348 Macro policy; D4 Reviews remains an orphan; D5 Soon modules hidden, History hidden. Options remains `/tools/options`; Terminal options tabs retained; Dashboard My Pages + Macro consolidation remains P2B; Footer Contact → `/contact`.

Confirmed Macro conflict: next.config still 308-redirects `/tools/macro` to `/tools/dashboard?tab=macro`; the Macro page is also an embedded component. #348's F-9 free Macro wording must be reconciled before P2B. No config edit here.

All tools still uses the old five-stage workflow/catalog pending #348. ToolsNavBar is currently unimported and unchanged. Public headings/copy beyond this draft's navigation scope are not globally renamed. Guide's full seven-group searchable layout is P2E; its resource bodies were preserved rather than editorially rewritten. Legal disclosures and the repeated compliance footer remain intact. Cloudflare Pages is reported red on main in the brief; no configuration changed. P2B–P2E were not started: each must branch from the next merged main and receive its own one-merge PR.
