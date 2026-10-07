# W2 independent source verification

8 October 2026. Fetched remote state and reviewed integrated `research-page-phase4` commit `9a665548f3b8f99dc056117bb27d91ff890fcecd`, PR #487 head `d9fd2e769b2f1f8d3c679334699ae374a5a47070`. GitHub reports the PR merged into the development branch. No merge or deployment was performed by this reviewer.

## Result

**C02 partially addressed; not ready to close.** Failed coin-detail validation now withholds ticker-selected OKX/Yahoo observations. Ambiguous symbol-search results are blocked, identity reasons are returned, and compact UI adds a warning. The response gate is evaluated per coin ID even when raw OKX data is cached by ticker. These improvements should be retained.

Two concrete gaps remain in `bindIdentity`:

### W2-R1 P1 Explicit ID does not establish Yahoo instrument identity

`ambiguous` is true only when source is symbol search and matches exceeds one. Explicit IDs have matches=null and ambiguous=false. `yahooBound = verified && !ambiguous` therefore allows both explicitly selected same-ticker coins once their details repeat the ticker. The loader uses the same `yahoo:<symbol>` cache and `<symbol>-USD` request for both, then attaches that value to sourcesCheck.

The supplied QNT fixtures already contain quant-network and fake-quant with the same ticker. The explicit-ID warm-order tests assert OKX exclusion for fake-quant but do not assert Yahoo exclusion. Yahoo is still described as matched for a verified, unambiguous coin even though no Yahoo instrument-to-CoinGecko-ID mapping was established. Yahoo's missing observation time excludes it from freshness agreement, but its quote still appears in the response.

Required correction: independently bind Yahoo identity using an explicit trusted mapping or withhold the Yahoo comparison when unresolved. Selecting a specific CoinGecko ID resolves user intent, not another provider's ticker namespace. Add assertions for Yahoo value/basis in both explicit-ID orders and a cold/warm fixture. Do not suppress legitimate CoinGecko ID-keyed observations.

### W2-R2 P2 Missing coin ID is accepted as a match

The OKX listing predicate includes `(!t.coin_id || t.coin_id === identity.id)`. Thus a row with an absent/empty coin_id can produce bound=true. The PR describes binding to the base AND coin ID, which is stricter than the implementation. Existing tests reject a different coin ID, but not an absent one.

Required correction: make the contract explicit. For strict row-level ID binding require the exact ID and withhold missing-ID rows, with tests. If the per-coin endpoint's provenance is intentionally accepted instead, document and validate that invariant rather than claiming the row's ID was verified. Also define whether an arbitrary OKX market for the base establishes the selected USDT perpetual/spot instrument mapping: the predicate does not inspect target or instrument type. This is an unverified mapping assumption, not a demonstrated venue mismatch.

## What the new tests cover

Inspected `test/w2CryptoIdentity.test.ts`: fake Redis, fake fetch, failed/recovered detail, ambiguous search, explicit same-ticker IDs in both warm orders, ticker failure, wrong-ID row, mismatched coin detail and absence of unbound OKX values. Unexpected hosts throw in its fetch stub. These are meaningful loader tests, but not rendered compact UI tests or independent provider validation.

Claude reports 20/20 targeted tests including transport tests, TypeScript clean, and full suite 5891 passing/44 failing versus base 5882/44. These are builder-reported results from [PR #487](https://github.com/wesso80/marketscannerpros/pull/487), not independently rerun tests. This checkout still has no installed application dependencies; no packages were installed or application tests executed here.

## Scope and next action

This six-file W2 delta does not change embedded Deep Analysis expiry or the ACT01–ACT04 action executor findings. Those remain open unless fixed on another, unreviewed branch. W4 per-observation provenance and W7 funding/OI semantics are also deferred by the PR.

Ask Claude to address W2-R1 and clarify/fix W2-R2 in the existing workstream, then return the follow-up commit and expanded tests. Preserve the failed-detail and ambiguous-search protections already added. Continue prioritising the action executor controls ahead of presentation cleanup.

Sources: [binding and attachment](https://github.com/wesso80/marketscannerpros/blob/9a665548f3b8f99dc056117bb27d91ff890fcecd/lib/crypto/breakdown/load.ts), [test fixtures](https://github.com/wesso80/marketscannerpros/blob/9a665548f3b8f99dc056117bb27d91ff890fcecd/test/w2CryptoIdentity.test.ts), [identity type](https://github.com/wesso80/marketscannerpros/blob/9a665548f3b8f99dc056117bb27d91ff890fcecd/lib/crypto/breakdown/types.ts).

No provider calls, production endpoint requests, business writes or application edits were made. Findings establish source paths, not reproduced production incidents.
