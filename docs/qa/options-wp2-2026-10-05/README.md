# Job16b — WP2 Options

Base `28e526b8d97ea26fd6350d615628a31af3db0003` from `batch/oct-wp`. Draft only; no deployment or merge.

The chain is visible by default with a seven-column mobile Calls/Puts view, sticky strike and header, readable quotes and compact counts. The inspector initially selects the actual nearest listed ATM contract through the existing helper; it never substitutes a farther strike when the nearest contract is filtered out. Contract selection remains local. Open-interest context, filters, inspector and details are closed initially. OI walls retain the same top-eight selection and are displayed by strike with a Calls/Puts legend. Terminal reuses its existing symbol input.

Option quote session and underlying session remain separate. Date-only observations are printed as dates, not fabricated midnight quote times. Inferred spot is labelled an estimate. No provider, expiry, pricing, Greek, eligibility or scoring logic changes.

## Evidence and hard gate

**Mocked, off-session layout evidence. Not live OI or live acceptance proof.** Local production build, AAPL standalone and MU embedded, 29 listed fixture strikes before existing filters, selected expiry 2026-11-20, underlying332.50/session2026-10-05, option quotes2026-10-02. Raw UTC observation/request times remain in evidence JSON. Browser requests are intercepted locally; external requests are aborted. Auth/disclosure fixture responses do not change production access or consent.

| Case | Before1280 /390 | After1280 /390 | Screenshots |
|---|---|---|---|
| options-loaded | 2.310 / 3.323 | 1.732 / 1.882 | [before 1280](before/options-loaded-1280.png) · [before 390](before/options-loaded-390.png) · [after 1280](after/options-loaded-1280.png) · [after 390](after/options-loaded-390.png) |
| options-missing | 1.691 / 2.457 | 1.649 / 1.628 | [before 1280](before/options-missing-1280.png) · [before 390](before/options-missing-390.png) · [after 1280](after/options-missing-1280.png) · [after 390](after/options-missing-390.png) |
| terminal-loaded | 2.626 / 3.703 | 2.079 / 2.261 | [before 1280](before/terminal-loaded-1280.png) · [before 390](before/terminal-loaded-390.png) · [after 1280](after/terminal-loaded-1280.png) · [after 390](after/terminal-loaded-390.png) |
| options-free | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/options-free-1280.png) · [before 390](before/options-free-390.png) · [after 1280](after/options-free-1280.png) · [after 390](after/options-free-390.png) |
| options-anonymous | 1.000 / 1.021 | 1.000 / 1.021 | [before 1280](before/options-anonymous-1280.png) · [before 390](before/options-anonymous-390.png) · [after 1280](after/options-anonymous-1280.png) · [after 390](after/options-anonymous-390.png) |

| # | Gate | Answer + evidence |
|---|---|---|
| 1 | One verdict above first fold | Yes: one Options verdict in each Pro case; AAPL listed-strike count, or honest missing-chain statement. Terminal retains its shell above the chain summary. |
| 2 | About two screens closed | Standalone1.732/1.882; embedded2.079/2.261. Terminal exceeds2.0 because the existing shell and protected disclosure remain; below2.3 hard maximum. Every desktop case no taller than before. |
| 3 | No sideways scroll390 | Yes: closed and expanded widths match viewport at360,390,430,485,639. Seven columns fit; primary quote values stay on one line. |
| 4 | No fake/empty tools | Actual fixture contracts displayed, actual ATM preselection, missing chain has an honest state. No fabricated history. |
| 5 | No banned/engine words | Primary page folds scanned open/closed across Pro/Free/anonymous: only buy/sell in the unchanged protected Options Risk disclosure. Shared missing-regime banner remains #367; independent Setup ideas/Flow estimate actions were not run by this chain fixture. |
| 6 | Readable numbers +one source | Yes: e.g.$332.50,0.33%,11.4K,25.0%; one SourceLine closed/expanded on Pro, zero on access gate. Separate actual date bases; no clock invented for date-only data. |
| 7 | Screenshots1280/390 | Yes:40 before/after PNGs, including five mobile widths, both contract sides, missing chain, embedded Terminal, Free and anonymous. |
| 8 | Symbol /Overview /Track | Options and Options chain titles; no legacy product naming in tested primary content. Routes unchanged. |

## Verification

15 focused tests in9files pass: mobile seven-column side toggle and selection, sticky markup, true ATM tie/filter behavior, OI ordering/legend, inspector selection, date-only source display, expiry continuity/unavailable expiry, underlying observation, existing costs and journal handoff. Production build and TypeScript pass. Zero browser page errors.25 core files and13 calculation/expiry blocks are byte-identical to the base (see parity report).

All Options buttons have a page-scoped40px minimum height. The phone screenshot shows the MSP AI bubble below the controls; no chain bid/ask button is behind it in the captured default view. Dimensions use maximum body/document height and match PNG dimensions. Before shots keep folds closed; additional before chain-open shots document the old table. After chain is always visible; Puts screenshots select325P. OI330C and325P here are deterministic fixture values only.

## Noticed, not changed

- **Live acceptance remains outstanding.** The scheduled Tue6Oct00:30–02:00AEDT window is not claimed completed. #334's roughly9x provider OI discrepancy is not claimed fixed. The separately merged read-only harness #380 must be explicitly run with independent same-expiry comparison evidence. No live harness/provider request was made for this layout work.
- Open #335–339 own expiry continuity, underlying spot/date basis, routing, loading/provider issues and nearest listed ATM. Their existing helpers/calculation paths are preserved; this adds only initial UI selection and display formatting. Pip should retain both stacks when combining.
- #367 owns data-truth/global regime labels. Existing shared missing-regime banner remains; no provider-policy, cache, API, polling or data-health edits.
- Missing history remains “not collected”; no invented IV history, ATR, stop or target. This layout fixture is not a new live missing-history acceptance claim.
- Protected Options Risk disclosure, educational/legal text and Free/Pro access wording remain unchanged. Primary folds were inspected; independent nested research tools were not invoked or represented as live checked.
- No scoring, worker, pricing, billing, Stripe, analytics, alert delivery, navigation menus, config or dependency changes. #353 still needs approved live-head screenshots and a PNG retention decision.
