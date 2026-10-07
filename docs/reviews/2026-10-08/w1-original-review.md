# W1 independent source verification

8 October 2026. Fetched latest remote branches and GitHub PR metadata. Reviewed integrated `research-page-phase4` commit `17133290dc4a6b8fdde90d0fb1f6f7d15f85c94a`, PR #486 head `b6ec4662f54f4a6df32b61ba70d391730558de5d`. GitHub reports #486 merged into the development branch. The reviewer performed no merge or deployment. #485's separate Volatility UI change is also present but is not fully reviewed here.

## Result

Core W1 implementation is present and addresses the original Golden Egg expiry propagation and DVE equity/crypto cache collision in source. Whole-page acceptance remains incomplete. Do not mark all W1/W3/W5 requirements closed.

| Finding | Verified source result | Status |
|---|---|---|
| P3-01 main Symbol packet | URL expiry reaches useGoldenEgg/fetchGoldenEgg, API, engine, fetchOptionsSnapshot and chain selector. Equity cache key includes expiry. Unlisted explicit expiry yields unavailable status and warnings, including cached response. | Implemented in source; runtime verification pending; embedded Deep Analysis still excluded. |
| P3-02 DVE cache | Asset class resolved before lookup; key includes symbol, timeframe, asset class and equity expiry. Cached response retains its own bar-age/evidence metadata. | Original key defect addressed in source; broader stable coin identity is not implemented here. |
| N01 Options specialist link | Calls optionsHref with requested expiry. Options fold receives the same request. | Implemented in source; rendered navigation test pending. |
| N07 stable identity | Equity versus crypto separation added; no CoinGecko-ID/exchange-instrument binding. | Only asset-class portion addressed; W2 and stable-ID navigation remain open. |

## Remaining acceptance gaps

1. **Embedded Deep Analysis still uses default expiry.** Its fetch URLs omit expiry and `/api/deep-analysis` calls computeGoldenEgg without it. Main Symbol and embedded explanation can therefore still describe different expiries. Claude explicitly discloses this in #486 and assigns it to W3. Keep P3-01's whole-page acceptance open until that path is fixed or deliberately removed from the public flow.
2. **Test coverage is narrower than full acceptance.** The new suite exercises the real chain selector/engine with mocked dependencies and the DVE handler, but does not mount Symbol or call the Golden Egg HTTP handler. It does not verify expiry switching in rendered sections or auth-failure behaviour. DVE asset tests assert price/cache hit, not complete freshness metadata. DVE expiry warm-order/value assertions are less complete than Golden Egg's.
3. **IV differentiation is absent.** Both fixture expiries use the same IV. OI ratios differ and are asserted; separate IV/expected-move fixtures are still needed to verify those section values follow the selection.
4. **Signal-write assertion is vacuous for its current neutral fixture.** Claude acknowledges the base also passes that test. Add a non-neutral default/explicit pair showing default behaviour preserved and explicit-expiry signal writes suppressed. recordEngineEvent remains unchanged; no claim of a side-effect-free endpoint is justified.
5. **Date validation checks format only.** The routes reject non-YYYY-MM-DD strings, but do not establish calendar validity. Impossible dates and empty/duplicate query values need a defined contract; this does not negate the core expiry fix.

The identity/expiry helpers remain shared with private consumers. No direct admin/worker files changed in W1, but this alone is not full admin regression evidence.

## Test evidence and limits

Claude reports in [PR #486](https://github.com/wesso80/marketscannerpros/pull/486): 12/12 targeted tests pass; 9/12 fail on the base; TypeScript clean; full suite 5882 passing/44 failing versus base 5870/44. These are builder-reported results, not independently reproduced results. No check-run evidence was returned by the queried head check-runs endpoint.

This local source checkout has no node_modules. No dependencies were installed and no application tests were run in this review. The test source was inspected; its mocks cover key external fetchers and writers, but that is not a certification of process-wide network denial. Repository working tree remains clean. No provider requests or production endpoint calls were made.

## Source references

- [Integrated W1 commit](https://github.com/wesso80/marketscannerpros/commit/17133290dc4a6b8fdde90d0fb1f6f7d15f85c94a).
- [Acceptance test](https://github.com/wesso80/marketscannerpros/blob/17133290dc4a6b8fdde90d0fb1f6f7d15f85c94a/test/w1ExpiryIdentity.test.ts).
- [DVE route](https://github.com/wesso80/marketscannerpros/blob/17133290dc4a6b8fdde90d0fb1f6f7d15f85c94a/app/api/dve/route.ts).
- [Golden Egg engine](https://github.com/wesso80/marketscannerpros/blob/17133290dc4a6b8fdde90d0fb1f6f7d15f85c94a/lib/goldenEgg/engine.ts).
- [Deep Analysis caller](https://github.com/wesso80/marketscannerpros/blob/17133290dc4a6b8fdde90d0fb1f6f7d15f85c94a/app/tools/deep-analysis/page.tsx#L742) and [API](https://github.com/wesso80/marketscannerpros/blob/17133290dc4a6b8fdde90d0fb1f6f7d15f85c94a/app/api/deep-analysis/route.ts).

## Next task

Have Claude complete the deferred Deep Analysis expiry path and provide isolated whole-page captures/tests with distinct OI and IV fixtures. Keep ACT01–ACT04 action-executor fixes prioritised ahead of lower-impact presentation work. Next independent verification should review those concrete commits rather than duplicate W1 implementation.
