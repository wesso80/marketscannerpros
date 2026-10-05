# Journal layout evidence — Job 3

Base: `bd919bee5c658e8855b277102a063cfb85a75953`, branch `fix/track-journal`, target `batch/oct-wp`.

These are mocked application screenshots, not live-data acceptance. All browser API calls are intercepted and all external browser requests are aborted. The fixture has 12 personal records (two open) and one automated PAPER record with a deliberately large result. Saved rows are retained; the automated record is excluded from personal KPIs, counts and cumulative P&L. Quotes are synthetic observations at test runtime. Raw capture times, requests, body text and browser errors are in each evidence.json.

## Integration dependency

After captures include the two Track shell files from draft #373, head `396f98bd38498e86fdf91c927e5f073e1b5f71e9`: `app/tools/workspace/page.tsx` and `components/WorkflowNavigation.tsx`. `integration-shell.patch` records that temporary overlay. Neither shell file is part of this Journal PR. They are restored to this PR's base after capture. The Journal layout gate therefore depends on #373 landing first; it is not a claim that the old batch shell already passes.

Before captures use the previously built #371 checkout; its Track shell and Journal sources match the base. The same fixture runner is used before and after.

## Reproduce

1. Check out this PR and install its existing locked dependencies.
2. For integrated screenshots, apply `integration-shell.patch` (or use a batch containing #373). Do not apply it twice.
3. Build with dummy local-only database credentials and dummy API keys; never use production journal records for this layout test.
4. Run `TRACK_ROOT=<checkout> TRACK_OUT=<output> TRACK_PORT=3122 JOURNAL_EXPAND=true node docs/qa/track-journal-2026-10-05/visual-runner.cjs`.

The runner uses the isolated validation environment's Playwright and Chromium locations, starts its own local production server, closes it on completion, and captures 1280x800 and 390x844 for Pro populated/empty, Free populated and signed out. Set `JOURNAL_BEFORE=true` for the old page, which has different headings. This script never runs the auto-log endpoint against production.

## Limits and retained behavior

- Ten rows remain visible by default. The phone layout is slightly over the two-screen target but below the 2.3 hard maximum; the existing disclosure is retained.
- Research defaults off. Auto-log uses the existing browser key, defaults off, and does not control the separately gated server/worker writers.
- Free five-open-entry cap still counts automated open rows. No limit, entitlement, polling or provider-policy changes.
- The auto-log duplicate query is account + symbol + side + trade date + source. It is best effort, not concurrency-safe: no unique index or migration was authorized.
- Existing CSV import was already absent because there is no import backend; no fake import button is introduced. Export and existing clear action remain in settings; no records were deleted during validation.
- Arbitrary user notes, every modal/error path and large saved books are not exhaustively covered. Existing disclosure/upgrade wording is preserved.
- Worker/default server opt-in changes require Brad/Pip approval and are not in this PR. #353 still needs real-session screenshot access and a PNG decision.

## Captured screen counts

| State | 1280x800 | 390x844 |
|---|---:|---:|
| pro populated | 1.923 | 2.230 |
| pro empty | 1.258 | 1.414 |
| free populated | 1.830 | 2.109 |
| anonymous empty | 1.000 | 1.000 |

All captured phone widths are 390; the eight cases have zero browser errors. Authenticated captures have one source line and one verdict above the fold. Expanded word scans have zero hits. The phone interaction also reveals research while keeping personal KPIs unchanged and verifies the browser auto-log setting starts off and stores true only after clicking it. Full-height PNGs are retained; raw measurements preserve the 800/844 viewport heights.
