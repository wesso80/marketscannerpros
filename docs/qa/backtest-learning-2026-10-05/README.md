# Job 6 — Backtest and Learning

Base: `204e95ef69101fd28d87a911cfb0057bdb4abc4a` (`batch/oct-wp`, after Alerts #377).

These are isolated, mocked application screenshots, not live-session evidence. Browser API requests are intercepted; external requests are aborted. Before uses the built Alerts worktree whose Backtest/Learning source and Track shell match the base. After uses this branch's production build. No shell overlay, real account mutation or provider request.

| State | After 1280×800 | After 390×844 |
|---|---:|---:|
| Backtest, unrun Pro |1.000|1.002|
| Backtest, mocked result Pro |1.099|1.150|
| Backtest, Free |1.000|1.000|
| Learning, populated Pro/Free |1.235|1.400|
| Learning, empty Pro |1.000|1.069|
| Signed out, either page |1.000|1.000|

All phone widths390. All default folds closed. One authenticated verdict above fold, bottom314px desktop/389.5px phone. One authenticated SourceLine; the signed-out gate has no data/source. A Free upgrade overlay remains unchanged, including its existing blurred children. Free fixtures do not claim actual server access.

Backtest's dashed sample has no numeric/date axes and is explicitly labelled “Sample chart · illustrative only, not a simulation result”. Browser evidence records zero Backtest requests before clicking Run; the mocked run replaces it (sample count0), and result details remain foldable. Request inputs are unchanged. No sample is assigned to the result state.

Learning preserves the recorded scores/calculations and uses compact folded framework lists. The four-bar chart is drawn from the existing recorded win rates. Empty state has one Journal action. Failed loads show a fault rather than claiming an empty history. Every framework definition was expanded in Pro at both widths; no banned-word hits.

## Holds and preserved copy

Free Backtest contains two unchanged access labels, “Backtest Engine” (Track gate) and “Strategy Backtesting Engine” (hub gate). These are the only captured word-scan hits. The brief's section6c says free/Pro access lines are unchanged without approval. Request: approve label-only replacements “Backtest” and “Strategy backtesting”. No access logic or plan change proposed. Gate5/8 remain HOLD pending this decision.

Existing calculation-basis/assumption disclosures are unchanged. Saved-result fallback language such as “Calculation basis is unavailable…” and existing assumptions may contain words from the global scan; they are outside the captured labelled-basis fixture and require separate copy/disclosure approval, not a claim of exhaustive zero hits. The global regime bar is unchanged.

## Checks

Production build and standalone TypeScript pass. Focused run:51 passing checks;2 baseline failures in layoutFlowAudit's old Journal/Alerts title assertions. The Journal failure is reproduced on the unchanged Account-base worktree, and the Alerts failure on the unchanged Alerts worktree. Both relevant page files match this branch's base. The new Backtest/Learning render tests, request parity, no-auto-run, missing-feed handling and registry presentation checks all pass. No scoring, backtest math, worker, route or API changes. The retired `/tools/backtest` page is untouched.

Raw observation times, requests, expanded/default text and geometry are in evidence.json. Reproduce after a production build with `TRACK_ROOT=<repo> TRACK_OUT=<output> TRACK_PORT=3124 node visual.cjs`; the runner uses this environment's Playwright/Chromium install paths, which may need adjustment. The included playbooks.json is copied from the existing registry, not live provider data. `ALERTS_BEFORE=true` captures the unchanged before page; this flag name is inherited from the earlier runner. Full suite not rerun after the prior provider-network approval block.
