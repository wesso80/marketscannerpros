# MSP Admin Private Research Terminal — Roadmap & Progress Tracker

> **Single source of truth for the admin terminal upgrade.** Update this file at the end of every work session so any machine (home/office) can pick up exactly where the last one left off.

**Boundary (do not cross, ever):** Private research, analytics, alerting, and journaling only. **No broker execution. No order placement. No order routing. No client trading authority. No custody.** See [Allowed vs Forbidden Language](#allowed-vs-forbidden-language) at the bottom.

---

## Quick Status

| Phase | Title | Status | Branch / Commit |
|---|---|---|---|
| 1 | Lockdown & Boundary | ⬜ Not started | — |
| 2 | Truth Layer | ⬜ Not started | — |
| 3 | Opportunity Research Board | ⬜ Not started | — |
| 4 | Symbol Research Terminal | ⬜ Not started | — |
| 5 | Alerts & Discord | ⬜ Not started | — |
| 6 | ARCA Admin Research | ⬜ Not started | — |
| 7 | Journal Learning | ⬜ Not started | — |
| 8 | Elite UI Polish | ⬜ Not started | — |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Complete · ⚠️ Blocked

**Last session ended at:** _(fill in)_
**Last commit on main:** `3a9e1348` (Workspace Portfolio A-grade header)
**Next action when resuming:** Begin Phase 1 — boundary banner + language rename + boundary regex test

---

## Existing Foundation (already built — do not duplicate)

These already exist and form the backbone we extend, not replace:

- [app/admin/operator-terminal/page.tsx](../app/admin/operator-terminal/page.tsx) — 4-rail cockpit shell (canonical going forward)
- [app/admin/terminal/[symbol]/page.tsx](../app/admin/terminal) — symbol cockpit (will be promoted to `/admin/symbol/[symbol]`)
- [app/admin/commander/page.tsx](../app/admin/commander/page.tsx) — one-pane brief
- [app/admin/morning-brief/page.tsx](../app/admin/morning-brief/page.tsx) — daily brief
- [app/admin/risk/page.tsx](../app/admin/risk/page.tsx) — risk governor (will be neutralized → alert posture)
- [app/admin/discord-bridge/page.tsx](../app/admin/discord-bridge/page.tsx) — Discord alert bridge
- [app/admin/diagnostics](../app/admin/diagnostics) + [app/admin/system](../app/admin/system) — to be merged into `/admin/data-health`
- [app/admin/quant/page.tsx](../app/admin/quant/page.tsx) — promote → `/admin/backtest-lab`
- [app/admin/scalper/page.tsx](../app/admin/scalper/page.tsx) — keep, link from opportunity board
- [app/admin/live-scanner/page.tsx](../app/admin/live-scanner/page.tsx) — feeds opportunity board
- [components/admin/operator/](../components/admin/operator) — full card library: `VerdictHeaderCard`, `IndicatorMatrixCard`, `LiveChartPanel`, `TruthRail`, `LiquidityLevelsCard`, `TargetsInvalidationCard`, `RiskGovernorCard`, `AIExplainCard`, etc.
- [components/admin/terminal/](../components/admin/terminal) — `SymbolHeader`, `ConfidenceCard`, `DVEDetailCard`, `RiskStateCard`, `PositionSizingCard`, `CrossMarketCard`, `TerminalBottomWorkspace`
- [components/admin/shared/](../components/admin/shared) — `AdminCard`, `SectionTitle`, `MiniStat`, `StatusPill`, `Tabs`, `DataRow`
- [lib/admin/](../lib/admin) — `truth-layer.ts`, `signal-recorder.ts`, `scan-context.ts`, `permissions.ts`, `morning-brief.ts`, `expectancy.ts`, `hooks.ts`, `types.ts`, `serializer.ts`
- [lib/adminAuth.ts](../lib/adminAuth.ts) — `requireAdmin()` (will gain `lib/admin/requireAdmin.ts` re-export)

**No actual broker API, OAuth, or order routes exist.** Risk is purely language drift.

---

## Boundary Violations to Fix in Phase 1

These are the only places execution-grade language has crept in. All purely cosmetic — no real broker plumbing — but must be neutralized first so the regex guard test can lock the door behind us.

| # | File | Current | Replacement |
|---|---|---|---|
| 1 | [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts#L31) | `\| "EXECUTE"` (type union) | `\| "RESEARCH_READY"` |
| 2 | [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts#L193) | `executionReady` field | `researchReady` |
| 3 | [lib/admin/morning-brief.ts](../lib/admin/morning-brief.ts#L662) | `buildBrokerFillSyncReport` + `MorningBrokerFillSyncReport` + `brokerLinked` + `brokerTaggedTrades` | `buildJournalTagReconciliationReport` + `JournalTagReconciliationReport` + `journalTagged` + `taggedTrades` |
| 4 | [lib/admin/scan-context.ts](../lib/admin/scan-context.ts#L45) | `brokerConnected: false` | _remove field entirely_ |
| 5 | [app/admin/operator-terminal/page.tsx](../app/admin/operator-terminal/page.tsx#L86) | "⛔ Kill Switch Active — All execution paused" | "⏸ Auto-Scan Paused" |
| 6 | [app/admin/risk/page.tsx](../app/admin/risk/page.tsx#L57) | "Kill Switch" pill | "Alert Posture" |
| 7 | [app/admin/page.tsx](../app/admin/page.tsx#L298) | `riskPermission === "KILL"` → "stand down" | "Suppress alerts" |
| 8 | [app/admin/commander/page.tsx](../app/admin/commander/page.tsx#L130) | returns `"BLOCK"` permission | returns `"NO_RESEARCH"` |
| 9 | [app/admin/commander/page.tsx](../app/admin/commander/page.tsx#L348) | "KILL SWITCH ON/OFF" pill | "RESEARCH ALERTS PAUSED/ACTIVE" |
| 10 | [app/admin/morning-brief/page.tsx](../app/admin/morning-brief/page.tsx) | "Broker / Fill Sync", `brokerSync`, "Sync Fills" button, `broker_sync` action | "Journal Tag Reconciliation", `journalTagSync`, "Reconcile Tags" |

---

## Phase 1 — Lockdown & Boundary _(do this first, in one PR)_

**Goal:** Remove all execution-grade language and lock the door behind us with a regex test so it can never come back.

- [ ] Mount `<AdminBoundaryBanner />` in [app/admin/layout.tsx](../app/admin/layout.tsx) — small persistent strip reading `PRIVATE RESEARCH TERMINAL — NO BROKER EXECUTION`
- [ ] Apply all 10 renames from the table above
- [ ] Create `lib/admin/requireAdmin.ts` as a re-export of `lib/adminAuth.ts`'s `requireAdmin` (to match brief's expected import path)
- [ ] Add [test/admin/boundaryLanguage.test.ts](../test/admin/boundaryLanguage.test.ts) — regex scan asserting these verbs are absent under `/app/admin/**`, `/components/admin/**`, `/lib/admin/**`, `/lib/engines/**`, `/lib/alerts/**`:
  - `Place Order`, `Submit Order`, `Buy Now`, `Sell Now`, `Execute Trade`, `Kill Switch`, `Send to Broker`, `Auto Trade`, `Deploy Capital`, `Order Ticket`, `Bracket Order`
- [ ] Update [test/layoutFlowAudit.test.ts](../test/layoutFlowAudit.test.ts) to assert presence of `<AdminBoundaryBanner />` text in admin layout
- [ ] Run `npx vitest run` (full suite) — green
- [ ] Run `npm run build` with full env vars — green
- [ ] Commit + push

**Exit criteria:** Zero forbidden verbs in admin tree; banner visible on every admin route; boundary test green.

---

## Phase 2 — Truth Layer

**Goal:** Single source of truth for "is this data trustworthy?" surfaced on every panel.

- [ ] Create [lib/engines/dataTruth.ts](../lib/engines/dataTruth.ts) exporting `computeDataTruth(input): DataTruth` (statuses: `LIVE`, `CACHED`, `STALE`, `DEGRADED`, `MISSING`, `ERROR`, `SIMULATED`)
- [ ] Split [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts) → keep readiness logic in new `lib/engines/researchReadiness.ts`
- [ ] Create `<DataTruthBadge truth={...} />` shared component
- [ ] Mount badge on every operator card via prop
- [ ] Add `test/engines/dataTruth.test.ts`
- [ ] Build + commit

---

## Phase 3 — Opportunity Research Board

**Goal:** One screen ranks every symbol by Research Score × Data Trust.

- [ ] Create [lib/admin/adminTypes.ts](../lib/admin/adminTypes.ts) — exports `InternalResearchScore`, `AdminResearchAlert`, `SetupDefinition` (full shapes from brief Sections 10, 11, 16)
- [ ] Create [lib/engines/internalResearchScore.ts](../lib/engines/internalResearchScore.ts) — pure `computeInternalResearchScore(input): InternalResearchScore`
  - Hard floor: `dataTrustScore < 50` ⇒ `lifecycle = DATA_DEGRADED`
  - One-axis cap: no single sub-score contributes > 25%
  - Stale data ⇒ heavy penalty
- [ ] Create [lib/engines/setupClassifier.ts](../lib/engines/setupClassifier.ts) — 16 setup types from brief Section 11
- [ ] Create [app/api/admin/opportunities/route.ts](../app/api/admin/opportunities/route.ts)
- [ ] Create [app/admin/opportunity-board/page.tsx](../app/admin/opportunity-board/page.tsx)
- [ ] Create `<AdminOpportunityBoard />` component with columns: Rank, Symbol, Asset, Setup Type, Bias, Research Score, Cleanliness, Volatility State, Time Confluence, Options Context, Liquidity State, Data Trust, Lifecycle, Change Since Last Scan, Alert State, Review CTA (no "Trade"/"Execute"/"Order"/"Enter")
- [ ] Filters: Asset class, lifecycle, setup type, data-trust min, score min, "changed since last scan"
- [ ] Suppress rows where lifecycle ∈ {EXHAUSTED, TRAPPED, INVALIDATED, NO_EDGE, DATA_DEGRADED} unless toggled
- [ ] Tests for score engine + classifier
- [ ] Build + commit

---

## Phase 4 — Symbol Research Terminal

**Goal:** One-symbol research cockpit that consumes the centralized score.

- [ ] Promote `/admin/terminal/[symbol]` → `/admin/symbol/[symbol]` (redirect old path)
- [ ] Create `<AdminResearchVerdictPanel />` (top of page)
- [ ] Create `<AdminEvidenceStack />` — 9 axes: trend, momentum, volatility, time, options, liquidity, macro, sentiment, fundamentals
- [ ] Create `<AdminResearchScoreBreakdown />` — show every penalty + boost from the score engine
- [ ] Add Scenario Map (Bullish / Bearish / Neutral / Invalidation conditions)
- [ ] Refactor existing cards (`ConfidenceCard`, `VerdictHeaderCard`, `RiskGovernorCard`, `IndicatorMatrixCard`) to consume centralized `InternalResearchScore`
- [ ] Save Research Case button → writes to journal
- [ ] Build + commit

---

## Phase 5 — Alerts & Discord

**Goal:** Threshold-fired research alerts with cooldown + duplicate suppression.

- [ ] Create [lib/engines/researchAlertEngine.ts](../lib/engines/researchAlertEngine.ts)
- [ ] Create [lib/alerts/discord.ts](../lib/alerts/discord.ts) — payload header: `PRIVATE RESEARCH ALERT — NOT BROKER EXECUTION`
- [ ] Create [lib/alerts/email.ts](../lib/alerts/email.ts)
- [ ] Create [lib/alerts/alertSuppression.ts](../lib/alerts/alertSuppression.ts) — cooldown, duplicate, evidence threshold
- [ ] Upgrade [app/admin/alerts/page.tsx](../app/admin/alerts/page.tsx) to render `AdminResearchAlert` log
- [ ] Test: payload contains required header; suppression blocks duplicates inside cooldown window
- [ ] Build + commit

---

## Phase 6 — ARCA Admin Research

**Goal:** Private research copilot bound to score + evidence + truth.

- [ ] Create `<AdminARCAPanel />` with 9 modes: Explain Rank, Challenge Setup, Find Missing Evidence, Summarize Watchlist, Detect Contradictions, Prepare Research Alert, Review Journal Mistake, Compare Two Symbols, What Changed Since Last Scan
- [ ] Server prompt explicitly forbids execution verbs (`buy`, `sell`, `execute`, `place order`, `position size`, `deploy`)
- [ ] Output enforced to `ArcaAdminResearchOutput` shape
- [ ] Auto-binds `InternalResearchScore` + `EvidenceStack` + `DataTruth` to context
- [ ] Test: prompt content asserted to contain forbidden-verb refusal clause
- [ ] Build + commit

---

## Phase 7 — Journal Learning

**Goal:** Pattern detection from past saved research cases.

- [ ] Create [lib/engines/journalLearning.ts](../lib/engines/journalLearning.ts)
- [ ] Create [app/admin/journal-learning/page.tsx](../app/admin/journal-learning/page.tsx)
- [ ] Create `<AdminJournalDNAPanel />`
- [ ] Surface "Journal Pattern Match" boost in `internalResearchScore`
- [ ] Build + commit

---

## Phase 8 — Elite UI Polish

**Goal:** Command palette, shortcuts, missing pages, consolidated diagnostics.

- [ ] Create `<AdminCommandPalette />` — bind Cmd-K
- [ ] Keyboard shortcuts in `<AdminTerminalShell />`:
  - `/` palette · `S` symbol search · `O` opportunity board · `G` Golden Egg · `T` time confluence · `V` DVE · `A` alerts · `D` data health · `J` journal learning · `Esc` close · `Enter` open selected
- [ ] Create `<AdminProviderHealthGrid />`
- [ ] Create `<AdminWebhookStatusPanel />`
- [ ] Consolidate `/admin/diagnostics` + `/admin/system` → [/admin/data-health](../app/admin/data-health)
- [ ] Create [/admin/model-diagnostics](../app/admin/model-diagnostics)
- [ ] Create [/admin/backtest-lab](../app/admin/backtest-lab) (or rename `/admin/quant`)
- [ ] Build + commit

---

## File Inventory — Create

```
app/admin/opportunity-board/page.tsx
app/admin/symbol/[symbol]/page.tsx          # canonical (deprecate /admin/terminal/[symbol])
app/admin/data-health/page.tsx
app/admin/model-diagnostics/page.tsx
app/admin/journal-learning/page.tsx
app/admin/backtest-lab/page.tsx

app/api/admin/opportunities/route.ts
app/api/admin/data-health/route.ts
app/api/admin/model-diagnostics/route.ts
app/api/admin/journal-learning/route.ts
app/api/admin/backtest-lab/route.ts
app/api/admin/time-confluence/route.ts

components/admin/AdminBoundaryBanner.tsx
components/admin/AdminTerminalShell.tsx
components/admin/AdminTopCommandStrip.tsx
components/admin/AdminOpportunityBoard.tsx
components/admin/AdminResearchVerdictPanel.tsx
components/admin/AdminEvidenceStack.tsx
components/admin/AdminResearchScoreBreakdown.tsx
components/admin/AdminDataTruthGrid.tsx
components/admin/AdminAlertRail.tsx
components/admin/AdminARCAPanel.tsx
components/admin/AdminProviderHealthGrid.tsx
components/admin/AdminWebhookStatusPanel.tsx
components/admin/AdminJournalDNAPanel.tsx
components/admin/AdminCommandPalette.tsx
components/admin/AdminAlertPostureCard.tsx

lib/admin/requireAdmin.ts                   # re-export of lib/adminAuth.ts:requireAdmin
lib/admin/adminRoutes.ts
lib/admin/adminTypes.ts                     # InternalResearchScore, AdminResearchAlert, etc.

lib/engines/internalResearchScore.ts
lib/engines/setupClassifier.ts
lib/engines/dataTruth.ts
lib/engines/researchReadiness.ts            # split from truth-layer
lib/engines/researchAlertEngine.ts
lib/engines/liquiditySweep.ts
lib/engines/modelDiagnostics.ts
lib/engines/journalLearning.ts

lib/alerts/discord.ts
lib/alerts/email.ts
lib/alerts/alertSuppression.ts

test/admin/requireAdmin.test.ts
test/admin/boundaryLanguage.test.ts
test/engines/internalResearchScore.test.ts
test/engines/setupClassifier.test.ts
test/engines/dataTruth.test.ts
test/engines/alertSuppression.test.ts
```

## File Inventory — Modify

```
app/admin/layout.tsx                        # mount <AdminBoundaryBanner />
app/admin/operator-terminal/page.tsx        # remove "Kill Switch" copy
app/admin/risk/page.tsx                     # convert to AdminAlertPostureCard
app/admin/page.tsx                          # remove "stand down" copy
app/admin/commander/page.tsx                # remove BLOCK/KILL SWITCH labels
app/admin/morning-brief/page.tsx            # rename Broker → Journal Tag
lib/admin/truth-layer.ts                    # remove "EXECUTE", split engine
lib/admin/morning-brief.ts                  # rename buildBrokerFillSyncReport → journal tag
lib/admin/scan-context.ts                   # drop brokerConnected
lib/admin/permissions.ts                    # convert to alert posture
lib/admin/hooks.ts                          # add useResearchScore, useOpportunityBoard
components/admin/operator/OperatorRightRail.tsx  # split into AlertRail + ARCAPanel
components/admin/operator/RiskGovernorCard.tsx   # convert/rename
test/layoutFlowAudit.test.ts                # add admin language guards
```

---

## Reference Type Shapes (from brief)

### `InternalResearchScore` _(brief Section 10)_

```ts
type InternalResearchScore = {
  symbol: string;
  assetClass: "equity" | "crypto" | "forex" | "commodity" | "index";
  timestamp: string;

  totalResearchScore: number; // 0-100, never exceeds 100
  evidenceScore: number;
  cleanlinessScore: number;
  timingScore: number;
  volatilityScore: number;
  trendScore: number;
  liquidityScore: number;
  optionsScore?: number;
  macroScore: number;
  dataTrustScore: number;
  journalFitScore?: number;

  penalties: {
    staleData: number;
    missingEvidence: number;
    lowLiquidity: number;
    conflictingSignals: number;
    lateMove: number;
    overextended: number;
    badSpread: number;
  };

  boosts: {
    timeConfluence: number;
    volatilityCompression: number;
    gammaLevelProximity: number;
    liquiditySweep: number;
    regimeAlignment: number;
    journalPatternMatch: number;
  };

  lifecycle:
    | "EARLY"
    | "DEVELOPING"
    | "RESEARCH_READY"
    | "ACTIVE_RESEARCH"
    | "LATE"
    | "EXHAUSTED"
    | "TRAPPED"
    | "INVALIDATED"
    | "NO_EDGE"
    | "DATA_DEGRADED";

  bias: "BULLISH_RESEARCH" | "BEARISH_RESEARCH" | "NEUTRAL" | "MIXED";
  setupType: string;
  explanation: string;
  missingEvidence: string[];
  contradictionFlags: string[];
  invalidationConditions: string[];
  nextResearchChecks: string[];
};
```

### `AdminResearchAlert` _(brief Section 16)_

```ts
type AdminResearchAlert = {
  id: string;
  symbol: string;
  assetClass: string;
  alertType: string;
  severity: "INFO" | "WATCH" | "HIGH" | "CRITICAL";
  lifecycle: string;
  researchScore: number;
  reason: string;
  evidence: string[];
  missingEvidence: string[];
  invalidationConditions: string[];
  contradictionFlags: string[];
  dataTrust: string;
  createdAt: string;
  sentToDiscord: boolean;
  discordStatus?: number;
  sentToEmail: boolean;
  suppressed: boolean;
  suppressionReason?: string;
};
```

### `DataTruth` _(brief Section 18)_

```ts
type DataTruth = {
  source: string;
  status: "LIVE" | "CACHED" | "STALE" | "DEGRADED" | "MISSING" | "ERROR" | "SIMULATED";
  fetchedAt: string;
  cacheAgeSeconds: number;
  coverage: number; // 0-1
  warnings: string[];
};
```

---

## Allowed vs Forbidden Language

### Allowed research labels
`READY` · `ACTIVE` · `LATE` · `EXHAUSTED` · `TRAPPED` · `INVALIDATED` · `HIGH PRIORITY` · `WATCH` · `NO EDGE` · `DATA DEGRADED`

### Forbidden execution language _(boundary test will fail the build)_
`Execute Trade` · `Place Order` · `Submit Order` · `Buy Now` · `Sell Now` · `Close Trade` · `Increase Position` · `Reduce Position` · `Auto Trade` · `Deploy Capital` · `Send to Broker` · `Order Ticket` · `Bracket Order` · `Market Order` · `Limit Order` · `Take Profit Order` · `Stop Loss Order` · `Exercise Option` · `Kill Switch`

### Safe replacement vocabulary

| Avoid | Use |
|---|---|
| Execute trade | Save research case |
| Place order | Create scenario note |
| Buy | Bullish research bias |
| Sell | Bearish research bias |
| Entry | Reference zone |
| Stop loss | Invalidation area |
| Take profit | Reaction zone |
| Target | Key reaction level |
| Trade signal | Research alert |
| Trading bot | Research automation |
| Auto trade | Auto-scan / auto-alert |
| Position sizing | Risk model / scenario sizing |
| Order ticket | Scenario ticket |
| Trade ready | Research-ready |
| Execute | Open research terminal |
| Deploy | Save / monitor / review |
| Kill switch | Pause auto-scan / Alert posture |

---

## Resume Checklist (use at start of every new session)

1. `git pull origin main`
2. Open this file — find current Phase, find first unchecked box
3. Verify environment: `npm install` if `package.json` changed
4. Run baseline tests: `npx vitest run test/layoutFlowAudit.test.ts --reporter=dot`
5. Pick up at the first unchecked box in the active Phase
6. Update Quick Status table + check boxes as you go
7. End-of-session: update **Last session ended at** + **Next action when resuming** lines at top
