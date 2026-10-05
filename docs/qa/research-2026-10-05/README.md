# Research / Signal Accuracy — Job 11

Base: `ed2c58db6509abc6774d97ff9c8b9e42405b0b7f` (batch/oct-wp). Scope: Research News and Economic Calendar, plus Signal Accuracy. No provider, scoring, outcome-labelling or saved-case action changes.

News starts with five headlines and More; each has one publication chip and folded article context. Calendar starts with the next five confirmed high-impact events using the existing calendar helper, with Show all retaining access to undated/earlier entries in the selected filter. Existing filters remain accessible. Missing release values are plain text, not dashes. Dates use the viewer zone; raw ISO tooltips are removed.

Signal Accuracy shows Outcomes pending for zero labelled outcomes, hides absent percentage metrics, and places thresholds, groups and recent observations in a closed evidence fold. Groups and recent rows start at five, with independent Show all controls. Phone cards avoid horizontally scrolling tables. No calculation or label-writing logic changes.

| View / tier / state | Before 1280 /390 | After 1280 /390 | PNGs |
|---|---|---|---|
| research-news / pro / populated | 2.047 / 2.916 | 1.549 / 1.961 | [before 1280](before/research-news-pro-populated-1280-full.png) · [before 390](before/research-news-pro-populated-390-full.png) · [after 1280](after/research-news-pro-populated-1280-full.png) · [after 390](after/research-news-pro-populated-390-full.png) |
| research-news / pro / missing | 1.000 / 1.499 | 1.000 / 1.000 | [before 1280](before/research-news-pro-missing-1280-full.png) · [before 390](before/research-news-pro-missing-390-full.png) · [after 1280](after/research-news-pro-missing-1280-full.png) · [after 390](after/research-news-pro-missing-390-full.png) |
| research-news / free / populated | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/research-news-free-populated-1280-full.png) · [before 390](before/research-news-free-populated-390-full.png) · [after 1280](after/research-news-free-populated-1280-full.png) · [after 390](after/research-news-free-populated-390-full.png) |
| research-news / anonymous / populated | 1.000 / 1.100 | 1.000 / 1.100 | [before 1280](before/research-news-anonymous-populated-1280-full.png) · [before 390](before/research-news-anonymous-populated-390-full.png) · [after 1280](after/research-news-anonymous-populated-1280-full.png) · [after 390](after/research-news-anonymous-populated-390-full.png) |
| research-calendar / pro / populated | 1.285 / 2.043 | 1.458 / 1.751 | [before 1280](before/research-calendar-pro-populated-1280-full.png) · [before 390](before/research-calendar-pro-populated-390-full.png) · [after 1280](after/research-calendar-pro-populated-1280-full.png) · [after 390](after/research-calendar-pro-populated-390-full.png) |
| research-calendar / pro / missing | 1.000 / 1.546 | 1.000 / 1.019 | [before 1280](before/research-calendar-pro-missing-1280-full.png) · [before 390](before/research-calendar-pro-missing-390-full.png) · [after 1280](after/research-calendar-pro-missing-1280-full.png) · [after 390](after/research-calendar-pro-missing-390-full.png) |
| research-calendar / free / populated | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/research-calendar-free-populated-1280-full.png) · [before 390](before/research-calendar-free-populated-390-full.png) · [after 1280](after/research-calendar-free-populated-1280-full.png) · [after 390](after/research-calendar-free-populated-390-full.png) |
| research-calendar / anonymous / populated | 1.000 / 1.100 | 1.000 / 1.100 | [before 1280](before/research-calendar-anonymous-populated-1280-full.png) · [before 390](before/research-calendar-anonymous-populated-390-full.png) · [after 1280](after/research-calendar-anonymous-populated-1280-full.png) · [after 390](after/research-calendar-anonymous-populated-390-full.png) |
| signal-accuracy / pro / populated | 2.314 / 3.081 | 1.161 / 1.712 | [before 1280](before/signal-accuracy-pro-populated-1280-full.png) · [before 390](before/signal-accuracy-pro-populated-390-full.png) · [after 1280](after/signal-accuracy-pro-populated-1280-full.png) · [after 390](after/signal-accuracy-pro-populated-390-full.png) |
| signal-accuracy / pro / missing | 1.280 / 1.977 | 1.000 / 1.313 | [before 1280](before/signal-accuracy-pro-missing-1280-full.png) · [before 390](before/signal-accuracy-pro-missing-390-full.png) · [after 1280](after/signal-accuracy-pro-missing-1280-full.png) · [after 390](after/signal-accuracy-pro-missing-390-full.png) |
| signal-accuracy / free / populated | 1.280 / 1.389 | 1.000 / 1.000 | [before 1280](before/signal-accuracy-free-populated-1280-full.png) · [before 390](before/signal-accuracy-free-populated-390-full.png) · [after 1280](after/signal-accuracy-free-populated-1280-full.png) · [after 390](after/signal-accuracy-free-populated-390-full.png) |
| signal-accuracy / anonymous / populated | 1.456 / 1.636 | 1.000 / 1.000 | [before 1280](before/signal-accuracy-anonymous-populated-1280-full.png) · [before 390](before/signal-accuracy-anonymous-populated-390-full.png) · [after 1280](after/signal-accuracy-anonymous-populated-1280-full.png) · [after 390](after/signal-accuracy-anonymous-populated-390-full.png) |

## Eight gates

| Gate | Answer |
|---|---|
| One verdict above fold | Yes: one in each Pro case, entirely above fold. Gated views keep existing access explanations. |
| About two screens closed | Yes: every after case ≤1.961 screens. |
| No sideways scroll at390 | Yes: all phone document widths390. |
| No fake/empty tools | Zero outcomes are pending, never Ready; empty feeds are explicit; absent percentages hidden. |
| No raw/advice/engine words | Zero unprotected closed/expanded/attribute hits in 24 cases. Protected metadata disclosure exception below. |
| Readable numbers +one source | One SourceLine per Pro view, publication chips as required; 89.12 score, 1.23% move; viewer-zone times. Access screens do not invent a data source. |
| Screenshots | 48 before/after PNGs at1280×800 and390×844, Pro populated/empty plus Free/anonymous. |
| Naming | Symbol copy in Research/Accuracy; route and handler identifiers unchanged. |

## Verification and limits

Production build and standalone TypeScript passed. 36 focused tests across six files passed. Tests cover five-row caps/expansion, pending outcomes, confirmed future calendar selection, public boundaries and existing feed contracts. Twelve helper/action bodies are byte-identical to base, including saved-case actions, calendar filter, accuracy fetch and grouping. See calculation-parity.json. Browser cases have zero page errors and all folds closed at capture. Every API request is mocked; external requests are aborted. No production mutations or live provider acceptance claimed.

Existing disclosure text is preserved verbatim. The outcome methodology note contains “Unknown outcomes are excluded. This is not a closed trade.” The DOM scan excludes that exact protected sentence pair; it is not an application status label. No other raw-word exceptions are claimed for the tested views. Existing paid/login copy and access behavior remain unchanged.

Not changed: deeper Research Intelligence tabs, Earnings/Saved Cases data/actions, metadata title work (Job14), outcome labelling, providers and polling. Shared Research tab chrome changes, but this evidence matrix validates the two Job11 feed views, not every deeper specialist panel. Last copy-only change replaces two Saved Cases references to Golden Egg with Symbol; it does not change the captured views.

Reproduce from root with researchCompact, researchFeedContracts, calendarTimingVsConsensus, eventTimeDisplay, guideClientBoundary and phoneWidthOverflow tests. Run calculation-parity.cjs. Build the chosen revision, set TRACK_ROOT and fresh TRACK_OUT, then run capture.cjs with local Playwright/Chromium paths adjusted if necessary. Keep API interception enabled. Fixed unit-test clock is 2026-10-05T13:00:00Z; browser capture times are real and recorded in evidence.json.
