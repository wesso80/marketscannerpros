# WP1-W1 Word-brief follow-up — 5 October 2026

Continues draft #353 on `phase2d/symbol` from `9b8d93a811da008ae9cbac2be773fa1a008baea0`; base remains main `f33130bd969238fc3e959049df1cbd48c819ae04`. The earlier review record below is historical. **Draft remains not merge-ready: viewport and live-session evidence are still missing.**

## Added acceptance evidence

| Brief check | Evidence / limitation |
|---|---|
| 1. One top verdict | AAPL/NVDA blocked canonical fixture has one No setup label and its recorded block reason. NEAR/LINK/BTC compact fixtures have one NO BASE stage; duplicate prose prefix removed. Change-symbol fold now follows the summary. No stock stage is invented; stock label uses the existing canonical setup / block state. |
| 2. Legacy closed | Full-page AAPL/NVDA tests keep legacy Watch/Long/Grade out while folds are closed. Existing deferred legacy fold retained; engine payload unchanged. |
| 3. One source | All crypto compact folds plus evidence open in render tests: one SourceLine, no per-field stamps. Rule values use the same supplied measurements. |
| 4. Pro time | Pro close fixture renders Last close Fri, 2 Oct (New York); observed instants use AEDT. Missing observation remains an explicit missing-time note, never a fabricated timestamp. |
| 5. Codes | Presentation-only labels for named reasons and unknown underscore codes. Expanded AAPL packet and compact crypto folds tested; scoring/storage output untouched. |
| 6. Numbers | Unit and render checks: 249.4%, $1.09B, $0.4664, 1.49x; ISO instants become dated zoned text. |
| 7. Advice words | Compact and expanded research labels tested. Existing disclosure “Research alignment, not an outcome probability” intentionally preserved under the brief’s no-disclosure-edits rule. Thus a literal whole-DOM ban on probability is NOT claimed. Embedded dynamic legacy tools are stubbed in render tests and still need browser review. |
| 8. Parity | Existing AAPL/NVDA/BTC fixed-input replay passes; payload JSON remains identical across rendering. These historical fixtures have null canonical verdicts, so no live canonical parity claim is made. |

Quick fixes: Fundamentals stays available without market cap (“Company overview and ownership”); blocked equity summary uses recorded reasons; compact crypto removes only the dev SHA prefix, keeping its explanatory text. Existing `lib/free/friendlyStatus.ts` and `components/visual/CollapsibleSection.tsx` changes from earlier #353 commits remain; this follow-up introduces a Symbol-only formatter, without extending global friendly-status behavior.

## Verification

- Required dummy-environment `timeout 1500 npx next build`: exit 0. Restored generated next-env.d.ts. Build dependencies had to be local hardlinks because Turbopack rejects a node_modules symlink outside its root. No package/config changes.
- `npx tsc --noEmit`: exit 0.
- Focused Symbol/layout/shared-component/parity group: 76 passed across 9 files.
- Full `env -u CRYPTO_SUMMARY_KEY -u OPENAI_API_KEY npx vitest run`: 4,925 passed, 12 failed, 13 skipped; 554 files passed, 7 failed, 2 skipped.
- Four named existing failures: commanderCommandState, operatorMarketDataAccuracy, workerEquityBulkWiring, globalM2Reliability.
- Other failing files: backtestStrategySignals (four 99-days/100-required failures), bulkSelectionRoute (three timeouts in full run), cryptoScanAliasRows (one timeout). The same three files were rerun on untouched starting head and follow-up: both isolated runs had 7 failing / 16 passing tests (two bulk timeouts), confirming the extra baseline failures; timeout counts vary with full-suite load. These files and their implementation were not edited.
- The three new full-page acceptance tests fail on untouched starting head and pass on this follow-up.
- Two pre-existing source assertions now expect the display formatter around canonical setup / status warning labels. Their scoring and shared-component assertions remain. No tests skipped or removed.

## Visual and live gates — still pending

No before/after screenshot or screen count is claimed. Required 1280×800 and 390×844 AAPL/NEAR/LINK, folds closed and Rule check open, plus gating differences remain outstanding. No Chromium was installed; agent-browser’s browser install failed certificate validation; the official Playwright installer using the existing system CA bundle returned a truncated/invalid archive. TLS verification was not disabled. No cropped desktop or jsdom image is substituted for browser evidence. Real-session shots remain required before merge.

## Noticed, not changed

- NEAR future OI observation and funding mismatch remain Patch-owned; no provider/data logic change.
- Main score replay is not live canonical score parity.
- Existing Cloudflare bot reported failed deployment on the prior head; not fixed by this UI-only work and not a deployment-success claim.
- Scanner/Options length, nav, analytics, alert email, preview links, admin/operator, scoring, feeds, workers, packages, limits, disclosures and stored values are untouched.

---

# WP1 / PR #353 revision

Base main: `f33130bd969238fc3e959049df1cbd48c819ae04`. Branch: `phase2d/symbol`.

## Review fixes

1. Stock has no stage field: removed assessment-as-stage badge. No stage/base/rank is invented.
2. Verdict sentence reports how many measured checks meet their recorded thresholds. Scores and thresholds unchanged.
3. First four measured checks use readable names. Additional measured checks are explicitly counted in a closed “Additional checks” fold; absent checks are omitted, never fabricated to pad the count.
4. Fundamentals summary uses actual market cap and is hidden without it. Backtest uses recorded history count and is hidden without it. Crypto summaries say “1 recorded value” / “N recorded values”.
5. Expanded evidence/status copy uses plain wording. Unmeasured score rows are omitted instead of showing Missing (50) / N/A. Locked card now says Symbol breakdown, explicitly authorized by this review; gates and description unchanged.
6. Source line is omitted when provider and observation timestamp are absent.
7. MEETS v1 RULES restored to amber. Committed build log and JPGs removed as requested. Build logs stay outside the repository.
8. Required viewport screenshots and live score comparisons remain blocked, as described below.
9. Added full Symbol-page Pro render tests for AAPL, NVDA and BTC. Stock opens evidence and the legacy verdict fold; crypto opens all compact folds and evidence. Network calls mocked, dynamically imported legacy tool pages stubbed (not a replacement for browser testing).

## Proof status

- Production `npx next build`: exit 0 before push. `npx tsc --noEmit`: exit 0. Full suite: 4,912 passed / 10 failed / 13 skipped; failures are confined to the same seven files reproduced on main. Focused Symbol/free-tier/crypto/evidence checks: 27 passed. Added main-score replay: 3 passed. Build log is intentionally uncommitted.
- Fixed-input score replay against exact main: AAPL 76 / ALIGNED / A; NVDA 76 / ALIGNED / A; BTC 86 / ALIGNED / A. Same fixture inputs produce identical JSON on main and this revision. Fixtures have no canonical verdict; this does **not** prove live canonical scores or live before/after visual parity.
- Existing canonical scoring/rule code untouched; rendering fixtures also asserts payload JSON is unchanged.
- Connected browser documentation exposes no viewport resize. Local preview access was blocked previously. No supported route to the requested 1280×800 / 390×844 after matrix is available here. Do not substitute cropped desktop screenshots or rendered fixtures for real Pro/Free/signed-out evidence.
- Screen counts at both requested widths: **not measured** for stock or crypto, before or after. The two-screen target is not yet verified. This remains a draft, not merge-ready.

## Every removed/replaced existing assertion

| Test | Original assertion(s) | Reason and replacement |
|---|---|---|
| cryptoBreakdownPage | source contains `:<SymbolOptionsContext` | Equity branch now contains EquityTop followed by folded compact SymbolOptionsContext. Both asserted; full-page Pro render added. |
| layoutFlowAudit | “Golden Egg subview”, “Golden Egg [tab] command header” | Required visible-name change to Symbol; assertions renamed. |
| layoutFlowAudit | “Golden Egg validation workbench”, “Validate one symbol before testing history.”, long regime/data-trust hero sentence | Removed duplicate hero to meet one-title compact layout. Pro render asserts one h1 and shared summary. |
| layoutFlowAudit | “Next useful check:”, “Choose a symbol to build the verdict packet.” | Removed duplicate hero prompt / empty-tool wording. Default AAPL and populated Pro render now covered. |
| layoutFlowAudit | `ariaLabel="Golden Egg command header"` | Removed PageHero. Closed native fold assertion plus one-h1 render coverage replace it. |
| layoutFlowAudit | literal “Open Scanner”, “Open Backtest” in page file | Old hero CTAs removed. Header draft handoffs remain; Backtest uses a measured history summary and existing link. No scanner auto-run added. |
| phase1Overview | searches `<PageHero`, `titleAs="h2"` | Header now SymbolSnapshotHeader compact. Existing assertions that composite stays below header and retains original label remain. Full-page render checks one h1. |
| productionAuditRemediation | error ternary containing “Unavailable”; “Retry the selected symbol” | Replaced raw error wording with Symbol data feed failed and actual refetch handler. Feed-failure render test covers fault vs gate. Timeout assertions unchanged. |
| sharedMarketComponents | Golden Egg Evidence Stack | Required Symbol name; same component remains. |
| sharedMarketComponents | exact non-friendly MarketStatusStrip invocation | Uses friendly mode to avoid raw internal statuses. Pro expanded-page test rejects raw words. |

No assertions were removed from the free-tier tests; added locked title, absent-source and Pro expansion checks. The existing crypto stale-colour regression remains and now passes with amber. The new WP1 EquityTop tests dropped only the obsolete assessment prop; payload/stage preservation checks remain.

## Defaults and noticed, not changed

Y8: original composite wording/value retained in deep analysis. Missing stock stage/base/numeric rank hidden, per latest instruction. No new scoring, auth/access, worker, provider, polling, storage, migrations, limits, billing or disclosure changes. Shared outer regime pill remains WP7. Dynamically imported legacy tools still need browser verification. WP2 waits for WP1 merge.
