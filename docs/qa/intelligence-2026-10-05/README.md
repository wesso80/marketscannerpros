# Job 7: Intelligence layout evidence

Base: `c4f3882ac1364ce959953aa261b97552a82af218` (`batch/oct-wp`, after #379).

These are isolated browser fixtures, not live-provider or Render acceptance. All browser API calls are intercepted; external requests are aborted. Fixtures use the existing Fragility development data and Liquidity mapper-test values, plus a deterministic M2 example. The before build is from the Options harness worktree; the three Intelligence pages, layout, navigation, Free gate and root layout were verified byte-identical to the job base.

## Closed screen counts

| Page / case | Before 1280 | Before 390 | After 1280 | After 390 |
|---|---:|---:|---:|---:|
| global-m2 / pro / populated | 1.558 | 2.346 | 1.484 | 1.993 |
| global-m2 / pro / missing | Not required | Not required | 1.000 | 1.320 |
| global-m2 / free / populated | Not required | Not required | 1.284 | 1.596 |
| global-m2 / anonymous / populated | Not required | Not required | 1.284 | 1.596 |
| fragility / pro / populated | 2.365 | 3.475 | 1.396 | 1.892 |
| fragility / pro / missing | Not required | Not required | 1.396 | 1.911 |
| fragility / free / populated | Not required | Not required | 1.284 | 1.596 |
| fragility / anonymous / populated | Not required | Not required | 1.284 | 1.596 |
| liquidity / pro / populated | 2.809 | 5.161 | 1.480 | 2.079 |
| liquidity / pro / missing | Not required | Not required | 1.058 | 1.534 |
| liquidity / free / populated | Not required | Not required | 1.284 | 1.596 |
| liquidity / anonymous / populated | Not required | Not required | 1.284 | 1.596 |

Liquidity is 2.079 phone screens including the unchanged research disclosure and site footer; eight realistic stage names and the source/missing-bloc explanation remain visible. This is below the 2.3 hard maximum.

## Verification

- 24 after cases: no page errors; all phone document widths are 390. Pro pages each have one verdict and one source line; details start closed. Free and signed-out users retain the existing LockedPreview (no fabricated data/chart).
- Desktop charts end at 596 px (M2), 527 px (Fragility), and 594 px (Liquidity), above the 800 px fold.
- Closed and fully expanded DOM word scans: zero unprotected matches in all 24 cases. The existing Intelligence disclosure containing “buy or sell” is preserved and explicitly excluded; it is not a literal zero-word claim.
- Five placeholder browser navigations land on `/intelligence`. Original placeholder code is retained after the page-level redirect.
- 98 focused tests pass; 2 existing deferred parity cases skipped. Five compact presentation tests also pass after the final label boundary correction. No scoring/parity test was changed.
- Production build and standalone TypeScript pass. Full suite was not retried: its external FRED request was previously rejected by automatic approval review; this job uses only isolated focused checks.
- Raw observation timestamps, DOM text, source/verdict/chart geometry, word hits, requests, and redirects are in the evidence JSON files.

## Screenshots

### global-m2

- [before Pro 1280](before/global-m2-pro-populated-1280-full.png)
- [before Pro 390](before/global-m2-pro-populated-390-full.png)
- [after Pro 1280](after/global-m2-pro-populated-1280-full.png)
- [after Pro 390](after/global-m2-pro-populated-390-full.png)
### fragility

- [before Pro 1280](before/fragility-pro-populated-1280-full.png)
- [before Pro 390](before/fragility-pro-populated-390-full.png)
- [after Pro 1280](after/fragility-pro-populated-1280-full.png)
- [after Pro 390](after/fragility-pro-populated-390-full.png)
### liquidity

- [before Pro 1280](before/liquidity-pro-populated-1280-full.png)
- [before Pro 390](before/liquidity-pro-populated-390-full.png)
- [after Pro 1280](after/liquidity-pro-populated-1280-full.png)
- [after Pro 390](after/liquidity-pro-populated-390-full.png)

Free, signed-out, and missing-data screenshots are alongside the Pro shots in `after/`.

## Reproduction

Build the target checkout with fixture-only credentials. Run `TRACK_ROOT=/absolute/checkout TRACK_OUT=/absolute/output node capture.cjs`. For baseline Pro captures set `BEFORE=true`. Chromium paths in the script refer to this QA environment. No provider credentials are needed.

## Noticed, not changed

- `/api/intelligence/*`, engine calculations, providers, caches and polling are unchanged. This is not a data-parity repair.
- Intelligence navigation pills and metadata remain as supplied; navigation work and Job 14 titles are separate.
- Global M2 reliability tests were not edited. No permissions, plans, billing, login or protected disclosure wording changed.
- #353 still needs real-session preview screenshots and the WP1 PNG decision. These unrelated QA PNGs are outside `docs/phase2/wp1/`.
