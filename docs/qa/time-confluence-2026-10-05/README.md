# Job15 — Time Confluence compact

Base `ce0272eab0cace659e53d54772a265fed50e605c` from `batch/oct-wp`. Draft only; no merge or deployment.

The after-run view puts its existing result first and folds timing evidence and scheduled context. Embedded controls reuse the loaded symbol. Unmeasured R:R is hidden. Plain display labels replace engine and direction codes; calculations are untouched.

Crypto shows 24/7 context and the existing asset-aware Macro/Calendar views, without the US-anchored Current/Today/Fib panels or equity-session windows. Equity keeps its session views; clocks show the viewer time zone. Removed invented historical hit rates and the local-only alert button, which never created an alert. No real alert API or storage changed.

## Measurements and screenshots

Local production builds, deterministic missing/measured scan fixtures, Pro/Free/signed-out, Australia/Sydney. These are mocked layout observations, not live market acceptance. Raw capture times, text, expanded attributes, widths and intercepted requests are retained in evidence.json. All Pro unrun states remain 1.000 screens; unchanged gated views reach 1.044 (Free) and 1.263 (signed-out) on phone. Pro after-run results:

| Case / width | Before screens | After screens | Screenshots |
|---|---|---|---|
| BTCUSD / pro / missing / 1280 | 2.462 | 1.000 | [before](before/time-confluence-btcusd-pro-missing-1280-after-run.png) · [after](after/time-confluence-btcusd-pro-missing-1280-after-run.png) |
| BTCUSD / pro / missing / 390 | 3.674 | 1.276 | [before](before/time-confluence-btcusd-pro-missing-390-after-run.png) · [after](after/time-confluence-btcusd-pro-missing-390-after-run.png) |
| MU / pro / missing / 1280 | 3.321 | 1.000 | [before](before/time-confluence-mu-pro-missing-1280-after-run.png) · [after](after/time-confluence-mu-pro-missing-1280-after-run.png) |
| MU / pro / missing / 390 | 4.135 | 1.327 | [before](before/time-confluence-mu-pro-missing-390-after-run.png) · [after](after/time-confluence-mu-pro-missing-390-after-run.png) |
| BTCUSD / pro / measured / 1280 | 3.393 | 1.000 | [before](before/time-confluence-btcusd-pro-measured-1280-after-run.png) · [after](after/time-confluence-btcusd-pro-measured-1280-after-run.png) |
| BTCUSD / pro / measured / 390 | 4.352 | 1.276 | [before](before/time-confluence-btcusd-pro-measured-390-after-run.png) · [after](after/time-confluence-btcusd-pro-measured-390-after-run.png) |
| MU / pro / measured / 1280 | 3.882 | 1.000 | [before](before/time-confluence-mu-pro-measured-1280-after-run.png) · [after](after/time-confluence-mu-pro-measured-1280-after-run.png) |
| MU / pro / measured / 390 | 4.813 | 1.327 | [before](before/time-confluence-mu-pro-measured-390-after-run.png) · [after](after/time-confluence-mu-pro-measured-390-after-run.png) |
| BTCUSD / free / missing / 1280 | 1.000 | 1.000 | [before](before/time-confluence-btcusd-free-missing-1280-full.png) · [after](after/time-confluence-btcusd-free-missing-1280-full.png) |
| BTCUSD / free / missing / 390 | 1.044 | 1.044 | [before](before/time-confluence-btcusd-free-missing-390-full.png) · [after](after/time-confluence-btcusd-free-missing-390-full.png) |
| MU / anonymous / missing / 1280 | 1.000 | 1.000 | [before](before/time-confluence-mu-anonymous-missing-1280-full.png) · [after](after/time-confluence-mu-anonymous-missing-1280-full.png) |
| MU / anonymous / missing / 390 | 1.263 | 1.263 | [before](before/time-confluence-mu-anonymous-missing-390-full.png) · [after](after/time-confluence-mu-anonymous-missing-390-full.png) |

Unrun PNGs use the same stems with `-full.png`; all 40 before/after PNGs are included. Before build uses the titles-small worktree: the four Time components match the stated base before these edits; its document-title change does not affect this body.

## Eight gates

| Gate | Evidence |
|---|---|
| One verdict above fold | One after-run result; BTCUSD and MU remain inside the 844px phone viewport. Unrun retains #365's single run prompt; locked tiers retain their access prompt. |
| About two screens closed | All checked states below 2.3; measured and missing after-run cases and both widths listed above. |
| No sideways scroll at390 | Closed and expanded document widths390 in every phone case. |
| No fake/empty tools | Unrun behavior unchanged; no fabricated hit rate or nonfunctional alert. Missing timing evidence is stated plainly. |
| No banned/engine words | Time panel display labels cleaned, including populated Market Pressure. Protected disclosure remains verbatim. Global regime strip remains an ownership exception below. |
| Readable numbers + one source | Rounded existing scores/percentages. One SourceLine after run uses the response timestamp, explicitly a scan observation—not a provider quote timestamp. No synthetic as-of. |
| Screenshots1280/390 | Before/after, unrun/run, BTCUSD/MU, measured/missing, Free/signed-out. |
| Symbol / Overview / Track | Existing Terminal chrome retained; no Golden Egg or Command Center labels added. |

## Verification

30 focused tests pass across five files, including zero-score crypto presentation, loaded pressure labels, unrun #365 behavior, scheduling and server/client boundaries. Production build and standalone TypeScript pass. Browser page errors: zero. All API requests are fulfilled locally; external requests are aborted, and the server uses a closed dummy database port.

18 calculation files are byte-identical, including `lib/time/*`, `lib/time-confluence.ts`, `components/time/scoring.ts` and `lib/marketPressureEngine.ts`. Mapping helpers and constants are byte-identical. Four BTCUSD/MU missing/measured replay outputs match exactly. `verify-parity.cjs` injects the explicit asset context, matching runScan's existing override; run it from repo root. Capture runner requires the documented environment's Playwright/Chromium paths and a prebuilt app.

## Noticed, not changed

- Global regime banner can say “NOT AVAILABLE RIGHT NOW”; it belongs to shared/data-truth work, not this scoped Time body. The protected Options Risk disclosure and access copy are unchanged. No global banned-word pass is claimed for those exceptions.
- TimeGravity's nested provider panel is tested in its unavailable-feed state; scan and Market Pressure fixtures cover measured data. This does not prove all possible provider prose.
- No scoring, provider, polling, data-source policy, production data, other Terminal-tab body, login or compliance changes. Shared TimeConfluenceWidget also serves the Markets Time view; the same removal of fake hit rates/alerts applies there.
- Scheduled US-session live acceptance was not run. These fixtures do not resolve the Options OI discrepancy or #353 live screenshot/PNG hold.
