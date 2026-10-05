# Alerts layout evidence — Job 4

Branch base: `5976360a6430b23eae4f57ab3495c50248f7a521` on `batch/oct-wp` after #373. No merge or deployment by the builder.

Screenshots use mocked application records, not a live account. The populated fixture contains 12 alerts and two loaded trigger-history rows. The Free fixture deliberately retains 12 existing records while the unchanged Free creation cap is three. Empty and signed-out states are also captured. All browser API calls are intercepted; external browser requests are aborted. Raw capture times, requests, text, geometry and errors are in evidence.json.

The before server is the previously built Track/Portfolio checkout. Its Alerts, alert presentation and Track-shell source files match the branch base. No integration overlay is needed for after captures: #373 is already in the base.

## Reproduce

Build this checkout using dummy API keys and a dummy loopback database, then run:

`TRACK_ROOT=<checkout> TRACK_OUT=<output> TRACK_PORT=3121 node docs/qa/track-alerts-2026-10-05/visual-runner.cjs`

The runner uses the isolated environment's installed Playwright/Chromium paths, launches a local production server and closes it after capture. `ALERTS_BEFORE=true` skips new-page assertions for the old build. Full-height screenshots are retained at widths1280 and390; viewport heights are800 and844. The Pro desktop case navigates through `/tools/alerts` and records the final uppercase `?tab=Alerts` URL. The phone case verifies five default rows and twelve after Show all.

## Word-scan exception

The existing disclosure is unchanged and excluded verbatim from the scan:

> Alerts are user-defined notifications only. Triggered alerts are not trading signals, financial advice, or recommendations to buy, sell, hold, short, or trade any asset.

Its buy/sell/short wording is protected disclosure text, not a direction label. The default and expanded captured bodies otherwise have zero scan hits. Arbitrary user alert names and every modal/error state are not exhaustively covered.

## Retained behavior

- Email, push delivery, unsubscribe, digest, checker logic and limits are unchanged. UI labels do not rename condition identifiers or alter thresholds.
- The same Edit/Pause/Arm/Delete handlers are in an accessible native disclosure menu. No action was sent to production during validation.
- Trigger history and summary folds start closed, including empty history. Missing history is labelled Not triggered yet only after a successful load. A failed load shows a fault and suppresses numeric summary placeholders.
- Phone length slightly exceeds the two-screen target while retaining five readable rows and the existing legal disclosure; it remains below the2.3 hard maximum.
- New alert still opens the existing capabilities/creation section; its form and delivery settings are retained.

## Closed screen counts

| State | 1280x800 | 390x844 |
|---|---:|---:|
| pro populated | 1.806 | 2.172 |
| pro empty | 1.387 | 1.704 |
| free populated | 1.806 | 2.172 |
| anonymous empty | 1.000 | 1.000 |

All captured phone widths are390. All eight cases have zero browser errors and no unprotected closed/expanded word-scan hits. Authenticated states have one SourceLine and one verdict above the fold; signed out keeps the existing account gate. Five default console rows and twelve after Show all are asserted by the runner.
