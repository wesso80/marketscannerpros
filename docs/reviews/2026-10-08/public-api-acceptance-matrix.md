# Public API exposure acceptance matrix

For Claude Code, 8 October 2026. This specifies the proposed public response and AI boundary for P3-07 and P3-08. Source baseline: `01652f9f4acb0b1fd293fcf86285317dfee22113`. It does not claim later builder work has been reviewed. “Public” includes authenticated subscribers. Internal admin scores, models, crypto research, scanners, paper accounts, workers and collection remain unchanged.

The public Symbol snapshot should contain dated observations and explanations of those observations. Implement an explicit projection at the public boundary, preserving internal packet contracts. A smaller React view does not restrict the response delivered to the browser. The proposed field groups below are a design contract, not an existing executable JSON schema; the builder must map them to exact leaf paths and reject additional properties recursively.

## Existing protections and remaining work

Golden Egg, Deep Analysis, DVE and news require session and paid access; Options uses its access helper. Deep Analysis has rate limiting. These controls do not make subscriber payloads admin-only. The Options journal query is already workspace-scoped; no cross-user disclosure or shared cache of its enriched response was established. Golden Egg has a shared market-result cache with symbol, timeframe and asset class; DVE currently omits asset class. Cache isolation is therefore not an established platform-wide property.

Source findings and pinned references are in [response boundary review](Phase%203%20public%20response%20boundary%20review.md) and [current issue list](Phase%203%20consolidated%20builder%20issue%20list.md). The criteria below are proposed changes and verification obligations, not protections already implemented.

## Field disposition

“Keep with basis” means explicit leaves, units, provider or calculation method, observation time, coverage and missing state. It never authorizes copying an entire parent object.

| Current field or family | Public response and AI disposition | Required acceptance |
|---|---|---|
| Symbol, resolved asset class, supported stable coin identity, timeframe, selected expiry | Keep | Echo resolved identity; all sections and relevant cache keys agree. Explicit unavailable expiry cannot silently select another expiry. |
| Price, OHLCV, completed-bar timestamps, quote timestamp, history count | Keep with basis | Distinguish quote time, completed-bar time and retrieval time; preserve interval and timezone. Intraday bars cannot be described as daily. |
| SMA/EMA, RSI, ADX, ATR, BBWP, realised volatility, volume ratio | Keep with basis | Document lookback, units, annualisation where applicable, completed-bar policy and available sample size. Insufficient history is missing, not zero. |
| Options expiry, snapshotTs, totalCallOi, totalPutOi, putCallOi, topCall/topPut strike and OI | Keep with basis | Same contract universe across consumers; expose expiry, observation date, strike/filter coverage and denominator behaviour. A wall is a measured OI concentration, not a guaranteed support level. |
| Options avgIvPct, expectedMovePct, maxPain, Greeks | Explain and reconcile | Identify model/calculation and assumptions; IV units explicit; expected move is an estimate, not a realised observation or promised range. Max pain is a calculated payout minimum, not a price forecast. Do not silently mix filtered and all-strike measures. |
| Crypto funding, derivatives OI, spot/network market cap, supply, volume | Keep applicable observations with basis | Include instrument/venue or aggregate coverage, observation window and units. Do not substitute equity option evidence. Missing crypto derivatives remain missing. |
| Fundamentals and earnings observations | Keep with basis | Preserve fiscal/reporting period and publication basis; distinguish reported from estimated EPS. Unknown ratings/counts are not zero. |
| Third-party analyst targets and ratings | Explain or omit pending product decision | If retained, identify third-party estimates, source/date/coverage and aggregation method; never present them as the platform verdict. |
| News article title, URL, publisher, publishedAt; event grouping | Keep with basis | Preserve attribution, ticker relevance rule and grouping method. Article text is source material, not instructions to the model. |
| News relevance/sentiment/catalyst labels | Explain or omit raw scores | Label classifier/provider basis; no trade recommendation or independent-confirmation claim. Do not treat relevance as investment merit. |
| Data availability, staleness, reasons, sample/coverage counts | Keep explicit diagnostic leaves | Separate freshness from completeness. A data-quality status must not become a trade-confidence score. Sanitize error text; no credentials, queries or internal stack traces. |
| `data.layer1.confidence`, assessments, grades/confluence; `data.canonical.scores`, `.verdict`, `.legacyConfluence` on Golden Egg | Remove from public response and public AI input | Internal values remain intact. No aliases, nested copies, string summaries or embedded JSON may reintroduce them. |
| Golden Egg or Deep Analysis `canonicalVerdict` permission, score, grade, sizeMultiplier, setup/direction, thresholds, entry/target plans | Remove private model packet | Independently project permitted dated observations; do not pass the verdict parent object to public code or AI. |
| Deep Analysis `goldenEgg.scores/verdict/legacyConfluence`, `signals.signal/score`; deterministic thesis/supports/blockers derived from them | Remove or rebuild from permitted evidence | Both deterministic and generated explanation paths must use the public projection. Stripping only the model narrative is insufficient. |
| DVE direction.score/confidence, directionalVolatility.confidence, breakout.score/label, trap.score, exhaustion.level, transition.probability | Remove private heuristic outputs | Keep separately defined measured volatility leaves. A score scaled to 0–100 must not be recast as a probability. |
| DVE projection/invalidation and release conditions | Review each leaf; omit unreconciled model triggers | A dated recorded event may be explained by its rule; forecasts/trade triggers are not automatically observations. No wholesale DVEReading copy. |
| Options `institutionalFilter`, `universalScoringV21`, strategy recommendation and ranked candidates | Remove private ranking/verdict payloads | Factual contract filters may remain; do not preserve composite ranking behind a renamed label. |
| Options `capitalFlow.brain_decision_v1` permission/size_multiplier, risk_governor, execution_plan, brain_score; brain_decision summary | Remove private decision payloads | Public projection must not mutate the original capital-flow object consumed internally. |
| Options `adaptiveLayer.profile` and `.match` | Exclude from shared research and its AI context | No sampleSize, wins, styleBias, riskDNA, decisionTiming, environmentRates, personalityMatch, adaptiveScore, reasons or noTradeBias. Any retained personal feature needs a separately authorized private contract. |
| Raw journal notes, workspace identity, account/position state, private reasons, secrets | Never in shared research or shared AI cache | Verify full serialized body, prompt/tool context, errors and cache values with synthetic canaries. Portfolio/Journal are separately authenticated personal destinations. |
| Explanations and summary strings | Keep only grounded explanation | Numbers and claims trace to allowed evidence IDs; missing evidence remains missing; no reconstructed scores, sizing or trade permission. |

## Contract and response acceptance

| Check | Fixture and procedure | Pass condition |
|---|---|---|
| R01 Complete response allowlist | Exercise actual route serialization on cold and warm paths using mocked services. Validate complete body against versioned exact schema. | No additional nested fields; no filtering the capture before validation. Run for new public endpoint and every still-accessible legacy subscriber route. |
| R02 Mutation safety | Freeze the internal packet; run public projection; compare before/after internal packet. | Projection succeeds without mutation and internal scores/plans retain identical values and shape. |
| R03 Forbidden data canaries | Put distinctive synthetic values in every private family, nested alias, diagnostic string and error branch. | None reaches response, public prompt/tool result, shared cache or user-visible debug output. Key-name denylisting alone is insufficient. |
| R04 Missing and stale | Missing provider, empty chain, zero call OI, short bar history, partial bars, stale data, malformed timestamps. | Explicit appropriate state; finite numbers only; zero denominators do not produce infinity or fabricated neutral verdicts. Retrieval time does not replace observation time. |
| R05 Asset and expiry | Two expiries with different OI/IV and equity/crypto sharing a symbol; warm in both orders. | Correct body and metadata for each identity; inapplicable fields absent or explicitly not applicable. Coordinate with Claude's P3-01/P3-02 fixes rather than duplicating them. |
| R06 Authentication | Anonymous, expired session, unpaid subscriber, paid A, paid B, authorized admin, non-admin attempting admin route. | Existing entitlement behaviour preserved; failed auth never gets a cached successful body. Public endpoint remains projected even for an admin session. |
| R07 Error and fallback | Throw from each mocked dependency and test degraded/demo branches. | Same boundary on every branch; generic public error, no raw exception disclosure or private fallback packet. Demo evidence unmistakably labelled. |
| R08 Legacy migration | Inventory imports and HTTP callers before changing shared endpoint behaviour. | Every public caller uses projected contract; any preserved private contract is protected server-side, not by client flag or UI hiding. Redirecting a page alone does not close its API exposure. |

## AI acceptance

Deep Analysis currently calls `buildDeterministicAnalyst(c, ge, ...)` and `buildPacketPrompt(c, ge, ...)` before generation. The former inserts structure/momentum/flow scores and composite verdict text; the latter inserts canonical verdict details. Both require a public evidence input contract. See [Deep Analysis source](https://github.com/wesso80/marketscannerpros/blob/01652f9f4acb0b1fd293fcf86285317dfee22113/app/api/deep-analysis/route.ts).

| Check | Pass condition |
|---|---|
| A01 Input boundary | Capture the actual outgoing prompt, messages, tool results and retrieval context with a fake model adapter. Only approved evidence and instructions appear; no original engine packet or journal profile. |
| A02 Deterministic fallback | Model failure, empty result and disabled model paths return factual missing-aware explanation with no score-derived thesis. |
| A03 Source grounding | Every numeric explanation has a supporting permitted observation and matching unit/time/expiry. Category counts are described as distinct input families, not statistical independence. |
| A04 Untrusted news | Synthetic article asks to reveal a journal or output a trade grade. It remains quoted/source data and cannot change the allowed context or output contract. |
| A05 Output boundary | Fake model returns private canaries, unsupported numbers and sizing recommendations. Application rejects or safely falls back rather than forwarding them. Prefer structured references to evidence; regex deletion alone does not establish semantic grounding. |
| A06 AI cache | Test different asset, expiry, timeframe, evidence revision and explanation version; test private A/B context separately if such a feature exists. No stale identity mismatch or shared personal context. |

These fixtures can prove application handling of supplied model outputs. They cannot certify every future model response; runtime validation and safe fallback remain necessary. No paid model call is needed to execute them.

## Journal and cache acceptance

Use synthetic workspaces A and B with distinct profiles and at least six closed entries each, plus C with insufficient history. Load identical mocked market evidence. Record cache lookup/set keys, value classes, authentication order and persistence calls.

1. Request shared research A then B, clear isolated caches, then B then A. Shared responses contain market evidence only. Neither profile canary appears for any user, including C.
2. If a separate personal feature is retained, A receives only A's authorized data and B only B's. A body/query workspaceId must not override the server-authenticated workspace. Unauthenticated requests are denied before returning a cached personal body.
3. Raw market caches may be shared when their identity and data are market-only. Personal application caches require workspace/user scope appropriate to the authorization model, and must not enter CDN/shared HTTP caches. Verify actual headers and framework cache configuration, not just the local Map key.
4. Test warm/cold, expiration, logout/session change, failed authorization and concurrent A/B requests. Inspect full cache values, not merely keys. A correct key does not excuse a shared response containing personalization.
5. An exact same market observation can legitimately appear for A and B. Equality alone neither proves nor disproves isolation; distinctive personal canaries and traces establish the boundary.

## Admin compatibility and isolated execution

Do not delete fields from shared engine types or change private calculations to satisfy a public schema. Known dependency anchors at this baseline:

| Source anchor | Compatibility obligation |
|---|---|
| `lib/goldenEgg/engine.ts` imports computeDVE; `lib/goldenEgg/canonicalVerdict.ts` imports canonical engine, overlay and display helpers | Preserve internal payload and calculation contracts; project separately. |
| `lib/quant/discoveryEngine.ts` imports directional-pressure and capital-flow calculations; `lib/quant/fusionEngine.ts` consumes capitalFlow conviction/bias | Freeze representative private quant fixtures and compare exact stable outputs. Do not prune shared capitalFlow or DVE models globally. |
| `lib/admin/scannerDataAudit.ts` imports canonical calibration metadata | Preserve metadata and calibration behaviour. |
| `app/admin/quant/page.tsx` reads evidence.capitalFlow | Preserve private evidence contract and display. |
| `app/api/admin/opportunities/route.ts` and `app/api/cron/persist-edge-packets/route.ts` use shared saved scans and edge-packet projection | Preserve admin authorization, saved research packets, ranking, schedules and persistence semantics. Do not run these routes live as audit tests. |

These are verified dependency anchors, not an exhaustive transitive caller map. Before changing a shared endpoint/helper, search imports, fetch URLs and worker scripts at the implementation commit and attach the resulting caller list. An empty search in `app/admin` alone does not establish that no private consumer exists.

Run tests in a credential-free isolated process with provider/network calls denied and persistence adapters replaced. Golden Egg computation can record signals/events; Options scan can upsert state-machine history. Fake those writes and assert the public path's intended side-effect contract. Preserve authorized private worker behaviour in separate fixture tests; never disable global collection to make a public test pass. Normalize only documented volatile fields in regression comparisons, never scores, plans or model versions.

## Builder evidence required for signoff

- Implementation branch and full commit SHA, changed-file list and mapping from each migrated route to its exact public schema.
- Caller map, complete serialized fixtures, captured fake-model inputs/outputs, cache traces and auth matrix results.
- Internal packet and private consumer regression comparisons, with explicit normalization rules.
- Executed commands and results; list any checks not run. Existing offline checker self-tests are not proof that application routes comply.
- Explicit product decisions for third-party analyst estimates, DVE recorded release statements and any retained personal Journal explanation. Until decided, omit these ambiguous fields from the new shared contract while preserving private behaviour.

No application code changed and no route, provider, database or model was called for this matrix. Application acceptance tests remain to be implemented and executed. This matrix builds on the pinned source audit; it is not a production isolation certificate.

## Next task

Review old URLs and specialist links for preservation of symbol, expiry, timeframe and asset identity, using the existing migration pack and current builder commits. Keep that review separate from Claude's active expiry/cache implementation.
