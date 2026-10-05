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
