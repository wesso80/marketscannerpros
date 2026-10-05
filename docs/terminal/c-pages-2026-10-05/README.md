# Terminal C-pages — 5 October 2026

Draft research UI only. **All screenshots use mocked API responses, not live provider acceptance.** Every API request is intercepted and external origins blocked. No production writes or live scans are part of this proof.

Stacked on C-shell #370, exact parent `3cceca0fcbd9887ad390b1c22cd27ba9f2b9bb83`. Target remains `batch/oct-wp`, whose base at preparation is `03946b7e54a3aae344e05c0f179907fe0ca9e098`. Review this job's code after the #370 parent; the PR diff against batch includes that prerequisite. No merges, rebases or force-pushes.

## Changes and preserved behavior

Embedded Gravity, Capital Pressure and Options Confluence use compact presentation components with closed evidence folds. One verdict leads each result. Options uses the loaded symbol and retains an explicit Run analysis action; there is no new automatic scan. Timeframe/expiry controls remain. Standalone Options/Gravity rendering is unchanged. Existing data calculations, scores, fetching effects and access checks remain in their original components; presentation receives their results.

Capital hard-risk blocks take precedence in the verdict and retain the detailed reasons. Options blocked results retain their actual timing reason and data-confidence caveats rather than inventing a missing-contract diagnosis. Contract and projected values are withheld when the existing blocker says so. Fractional IV is displayed in percent, consistent with the existing renderer; tiny nonzero prices retain significant digits. Missing values do not become zero.

#365 Options Flow, Crypto derivatives and Time Confluence components are untouched. The one-input gate here covers the three C-pages subviews; #370 documents the intentionally untouched Options Flow input. Shared educational disclosures remain verbatim, including their buy/sell/probability wording. No routes renamed, no provider math, workers, APIs, auth, pricing or legal text changed.

## Hard layout gate

| Gate | Result |
|---|---|
| One verdict above first fold | PASS: one per view; bottom 732px or less on 390×844; 547px or less on 1280×800. |
| About two screens closed | PASS: Gravity 1.12/1.48, Capital 1.21/1.52, Options 1.10/1.50 (desktop/phone). |
| No sideways scroll at 390 | PASS: scrollWidth 390 closed and all evidence open; desktop 1280. |
| No fake/empty tools | PASS: response-backed evidence; unrun/empty/demo/error views are explicit; no fabricated zero metrics. |
| No banned/engine words | PASS in revised subview evidence: no TARGET ACTIVE, Trade Permission, playbook, UNKNOWN, NO_SETUP or NO_TREND, including expanded folds. Protected disclosures and unchanged #365 tabs are excluded from this scoped claim. |
| Readable numbers + one source | PASS: one source across closed/all-open states; $249.35, 49.4% IV, grouped OI; receipt time explicitly distinguished from observation time in Gravity. |
| Screenshots 1280 and 390 | PASS: same fixtures before/after all three subviews; dimensions 1280×800 and 390×844. |
| Symbol / Overview / Track | PASS with prerequisite #370: Terminal chrome says Symbol; existing routes unchanged. |

## Before / after screenshots

Before is the exact built C-shell parent, with completed mocked observations in all three subviews. Both before and after have no page exceptions. Raw capture times, text, dimensions, input/source/verdict counts and requests are in the evidence JSON files. Fixtures are synthetic; dates and prices are not current market claims.

| View | Before1280 | After1280 | Before390 | After390 |
|---|---|---|---|---|
| Gravity MU | [Full](before/gravity-mu-pro-1280-full.png) | [Full](after/gravity-mu-pro-1280-full.png) | [Full](before/gravity-mu-pro-390-full.png) | [Full](after/gravity-mu-pro-390-full.png) |
| Capital SPY | [Full](before/capital-spy-pro-1280-full.png) | [Full](after/capital-spy-pro-1280-full.png) | [Full](before/capital-spy-pro-390-full.png) | [Full](after/capital-spy-pro-390-full.png) |
| Options MU | [Full](before/options-confluence-mu-pro-1280-full.png) | [Full](after/options-confluence-mu-pro-1280-full.png) | [Full](before/options-confluence-mu-pro-390-full.png) | [Full](after/options-confluence-mu-pro-390-full.png) |

Before screen counts desktop/phone: Gravity 2.40/3.48, Capital 2.05/3.15, Options 2.62/4.89. First-viewport and expanded-evidence PNGs are included alongside full pages. [After observations](after/evidence.json), [before observations](before/evidence.json), [fixtures](fixtures.json), and [capture procedure](capture.cjs).

## Verification and limits

- Production Next build with dummy environment passed; TypeScript `--noEmit` passed.
- 24 focused tests pass: 9 presentation tests, 8 preserved #365 behaviors and 7 shell checks. Includes unchanged input objects, exact IV conversion, tiny prices, risk hard blocks, retained failure/block reasons, empty/demo handling and manual scan action.
- Same-fixture browser checks pass all six scenarios, closed and expanded; no page exceptions. All API calls mocked; external origins blocked. Console HTTP errors from deliberately uncollected unrelated fixture feeds are not provider calls.
- Protected calculation/helper files unchanged. No changes to API request timing or providers. Existing legal disclosures unchanged.
- Full suite **not rerun**: automatic approval review previously blocked the Commodities suite follow-up citing a FRED provider request. No bypass attempted. Full-suite acceptance remains pending; focused tests are not a claim of a green full suite.
- Authenticated live/provider acceptance remains pending. Research/simulation only; general information, not financial advice.

Brad/Pip review required before any batch merge.
