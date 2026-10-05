# Job16a — WP2 Scanner

Base `2698cbc9bb97def65fad84b8e038c98c0e90a115` from `batch/oct-wp`. One-page draft; no merge or deployment.

Scanner now has one first-fold summary, one mode bar, one market selector, one run button and one stat strip. Presets, queue filters and data details are folded. Ranked results use five compact phone cards and a five-column desktop table; Pro uses five compact cards. Show all expands the same sorted results. Price cells use the existing price formatter without per-row provenance. Exclusions are one chip. Missing scores stay hidden, visible direction codes are plain evidence labels, and the purple status treatment is gone.

The initial ranked hook actually sent two scan POSTs on page load. A page-local manual hook now invokes the unchanged existing helper only from the run button and ignores stale responses after a timeframe change. Shared hooks, endpoints, payloads, scoring, limits and provider policy remain unchanged. The Pro bulk action and preset logic are byte-identical.

## Screens and layout gate

Local production builds, deterministic twelve-row equity/crypto fixtures. 1280×800 and390×844; Pro unrun, manual Pro run, manual ranked run, Free Quick/locked and signed-out Quick/locked. **Mocked/off-session layout evidence, not live market acceptance.** Counts use the maximum body/document scroll height and are checked against actual PNG dimensions. Raw UTC capture/request times are retained.

| Tier / asset / state | Before1280 /390 | After1280 /390 | Screenshots |
|---|---|---|---|
| anonymous / equity / locked | 1.089 / 1.250 | 1.089 / 1.250 | [before 1280](before/anonymous-equity-locked-1280.png) · [before 390](before/anonymous-equity-locked-390.png) · [after 1280](after/anonymous-equity-locked-1280.png) · [after 390](after/anonymous-equity-locked-390.png) |
| anonymous / equity / unrun | 1.109 / 1.406 | 1.109 / 1.406 | [before 1280](before/anonymous-equity-unrun-1280.png) · [before 390](before/anonymous-equity-unrun-390.png) · [after 1280](after/anonymous-equity-unrun-1280.png) · [after 390](after/anonymous-equity-unrun-390.png) |
| free / equity / locked | 1.000 / 1.002 | 1.000 / 1.002 | [before 1280](before/free-equity-locked-1280.png) · [before 390](before/free-equity-locked-390.png) · [after 1280](after/free-equity-locked-1280.png) · [after 390](after/free-equity-locked-390.png) |
| free / equity / unrun | 1.000 / 1.159 | 1.000 / 1.159 | [before 1280](before/free-equity-unrun-1280.png) · [before 390](before/free-equity-unrun-390.png) · [after 1280](after/free-equity-unrun-1280.png) · [after 390](after/free-equity-unrun-390.png) |
| pro / crypto / pro-run | 1.981 / 5.800 | 1.556 / 1.647 | [before 1280](before/pro-crypto-pro-run-1280.png) · [before 390](before/pro-crypto-pro-run-390.png) · [after 1280](after/pro-crypto-pro-run-1280.png) · [after 390](after/pro-crypto-pro-run-390.png) |
| pro / crypto / ranked-run | 2.280 / 7.088 | 1.333 / 1.538 | [before 1280](before/pro-crypto-ranked-run-1280.png) · [before 390](before/pro-crypto-ranked-run-390.png) · [after 1280](after/pro-crypto-ranked-run-1280.png) · [after 390](after/pro-crypto-ranked-run-390.png) |
| pro / crypto / unrun | 2.280 / 7.088 | 1.155 / 1.257 | [before 1280](before/pro-crypto-unrun-1280.png) · [before 390](before/pro-crypto-unrun-390.png) · [after 1280](after/pro-crypto-unrun-1280.png) · [after 390](after/pro-crypto-unrun-390.png) |
| pro / equity / pro-run | 1.981 / 5.800 | 1.556 / 1.647 | [before 1280](before/pro-equity-pro-run-1280.png) · [before 390](before/pro-equity-pro-run-390.png) · [after 1280](after/pro-equity-pro-run-1280.png) · [after 390](after/pro-equity-pro-run-390.png) |
| pro / equity / ranked-run | 2.280 / 7.088 | 1.333 / 1.538 | [before 1280](before/pro-equity-ranked-run-1280.png) · [before 390](before/pro-equity-ranked-run-390.png) · [after 1280](after/pro-equity-ranked-run-1280.png) · [after 390](after/pro-equity-ranked-run-390.png) |
| pro / equity / unrun | 2.280 / 7.088 | 1.155 / 1.257 | [before 1280](before/pro-equity-unrun-1280.png) · [before 390](before/pro-equity-unrun-390.png) · [after 1280](after/pro-equity-unrun-1280.png) · [after 390](after/pro-equity-unrun-390.png) |

| Gate | Answer |
|---|---|
| One verdict above first fold | One research-candidate summary on Pro; unchanged Free/locked prompts. |
| About two screens closed | All measured after states within2.3; desktop no taller than its corresponding before state. Show all deliberately expands the list. |
| No sideways scroll390 | Document/body width390, including expanded filters. Desktop price cells no longer carry provenance strings. |
| No fake/empty tools | Manual scan prompt, visible run action and honest result counts. Explicitly labelled #348 example/demo and its counter are preserved as required. |
| No banned/engine words | Compact result/filter copy cleaned; protected disclaimer, shared regime banner and pending source-label exceptions below are not claimed fixed. |
| Readable numbers +one source | Existing price formatting, whole scores, one SourceLine. Its missing timestamp is an unresolved #367 overlap, not fabricated here. |
| Screenshots1280/390 | 40 before/after PNGs cover all listed states. |
| Symbol /Overview /Track | Scanner header links say Symbol; routes/identifiers unchanged. #390 owns remaining legacy inline-analysis naming. |

## Verification

60 focused tests across10files pass, including real rendered page-load/preset behavior, single-button payload, stale-response suppression, five-row cap and Show all, phone/desktop price parity, data integrity and existing score labels. Obsolete source checks for removed table/hero structures were updated; scoring tests remain intact. Production build and TypeScript pass. Zero browser page errors.

The baseline mocked usage counter moves to2 on page load; after stays0 through page view and preset selection. Only explicitly pressing Run sends a scan request. This is a request-boundary test, **not a read of production usage**. All browser API calls are fulfilled locally; external calls aborted; local database is a closed dummy port. Local fixture consent uses the existing essential-cookie choice and accepted-disclosure response; no production consent/auth changes.

64 protected logic files and seven calculation/filter/action blocks are byte-identical. `verify-parity.cjs` verifies those against the stated base. The #348 explicit example block, FreeScannerModes, FreeScanner and demo counter code are unchanged. Row navigation still carries symbol/asset/timeframe to Symbol. The shared API hook used by other pages is unchanged.

## Noticed, not changed / overlap

- **#367** remains open and owns Scanner source/trading-date versus Ready truth. This PR removes the unexplained issue tile and per-row provenance but preserves existing data-health expressions and SourceLine inputs. Its “Not available right now” source fallback and the global missing-regime banner remain unresolved; the page-level empty regime pill is removed. No data-truth logic is duplicated.
- **#335–339** checked before WP2: expiry continuity, underlying date basis, entry routing, loading/payload and canonical ATM remain owned by that Options stack. No Options files changed here.
- **#390** has eligible Scanner name-only changes; header replacements use Symbol. Pip should retain its separate legacy inline-analysis rename when stacking. No rebase or force-push.
- The90-day mini line needs history absent from existing scan row payloads; no new data request or invented sparkline. The explicit example's existing90-day disclosure remains.
- Mixed-evidence counts use the existing filtered group (Pro TIGHT; ranked setting-up), never total row count. No score or classification change.
- Free Quick demo and Pro LockedPreview remain as shipped, including protected access/plan wording. No scoring, worker, pricing, Stripe, analytics, alert delivery, legal wording or navigation-menu edits.
- The archived original WP2 Markdown was not present in the supplied upload folder; the full16-job brief's detailed WP2 requirements governed this page.
