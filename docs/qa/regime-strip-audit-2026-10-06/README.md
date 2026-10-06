# F18 — compact regime strip; Pip visual check pending

Base: `batch/oct-wp` at `4c871971a79313f6df0682efbe1de8398e12e11e` (the batch used by merged #417). #417 completed Symbol, Futures Close Calendar, F03 Research Intelligence, F10 Daily Picks and Watchlists follow-ups; this does not redo them.

The shared regime strip previously repeated each contributing signal in an open horizontally scrolling row. It now keeps one regime label and a supporting-signal count in a native, initially closed disclosure. Expanded evidence wraps in a responsive grid; the summary has a 40px target and visible keyboard focus. Signal source labels use the existing display helper.

The regime hook, data endpoint, filtering (`!stale && counted !== false`), order, colors, regime selection and hideIfMissing semantics are unchanged. No nav menu, scoring, API, provider, worker, pricing or #367 edits. No added source line: individual tool pages keep their existing source ownership.

Validation: 16 assertions/tests passed across regimeStripCompact, todayCompact and regimeHonestDefault; one existing source-string assertion failed because the unchanged Markets page no longer contains `Regime unavailable`. Current batch source already has `Market context has not been collected.` That legacy assertion was not modified in this PR. The three new tests cover closed supporting evidence, exact included/excluded signal set, unchanged payload, no horizontal-scroll class, hideIfMissing and loading without retained evidence. TypeScript and whitespace checks passed. All test API/database paths mocked; no provider requests or production writes.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | One regime in closed strip; tool-page verdict remains unchanged |
| About two screens closed | Page-level measurement for Pip |
| No sideways scroll at 390 | Horizontal-scroll row removed; browser proof for Pip |
| No fake/empty tool | Existing missing/loading/hide semantics retained |
| No banned/engine words | Existing regime humanizer retained; evidence sources humanized |
| Readable numbers + one source line | Count only; no extra per-page source line added |
| Screenshots 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | No nav or tool-title changes |

**Pip to check:** representative tool pages with 0, 1 and several regime signals at 1280×800 and 390×844; before/after with disclosure closed and open. Check one closed regime label, keyboard Enter/Space activation, focus outline, wrapping of long source names, no sideways scroll and no obscured page verdict. Check Today/Dashboard hideIfMissing behavior. Record any remaining cookie-overlay issue separately; cookies were not changed here.

User assigned screenshots/layout acceptance to Pip. Draft/HOLD pending review; no merge/deploy. The original F18 cookie-overlay audit gap remains unverified.
