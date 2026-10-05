# Learn pages — Job 12

Base `181e7bff2f055f07e94c8d3e868fb7dbd9214af1` from batch/oct-wp. Guide groups follow the existing seven menu groups, with searchable titles, summaries, instructions and tips. Each tool is a closed one-line card. The public operator card is removed. Two reference cards link to existing Intelligence and Open Interest pages so all seven groups have useful contents. Existing session-aware PlatformGuide stays server-side; no auth or navigation changes.

Methodology keeps all ten factor cards and all six stage cards open, with prose folded. About prose is folded. Legal and compliance sentences, amounts, pricing and sign-in wording remain unchanged. Methodology's old Unknown label becomes Not collected; the Guide's sizing instruction becomes a neutral review description. Time Confluence and Symbol replace legacy product labels.

| Page / tier | Before 1280 / 390 | After 1280 / 390 | Screenshots |
|---|---|---|---|
| guide / pro | 1.476 / 1.662 | 1.641 / 1.790 | [before 1280](before/guide-pro-populated-1280-full.png) · [before 390](before/guide-pro-populated-390-full.png) · [after 1280](after/guide-pro-populated-1280-full.png) · [after 390](after/guide-pro-populated-390-full.png) |
| guide / free | 1.476 / 1.662 | 1.641 / 1.790 | [before 1280](before/guide-free-populated-1280-full.png) · [before 390](before/guide-free-populated-390-full.png) · [after 1280](after/guide-free-populated-1280-full.png) · [after 390](after/guide-free-populated-390-full.png) |
| guide / anonymous | 1.476 / 1.662 | 1.641 / 1.790 | [before 1280](before/guide-anonymous-populated-1280-full.png) · [before 390](before/guide-anonymous-populated-390-full.png) · [after 1280](after/guide-anonymous-populated-1280-full.png) · [after 390](after/guide-anonymous-populated-390-full.png) |
| methodology / pro | 3.906 / 7.155 | 1.624 / 2.224 | [before 1280](before/methodology-pro-populated-1280-full.png) · [before 390](before/methodology-pro-populated-390-full.png) · [after 1280](after/methodology-pro-populated-1280-full.png) · [after 390](after/methodology-pro-populated-390-full.png) |
| methodology / free | 3.906 / 7.155 | 1.624 / 2.224 | [before 1280](before/methodology-free-populated-1280-full.png) · [before 390](before/methodology-free-populated-390-full.png) · [after 1280](after/methodology-free-populated-1280-full.png) · [after 390](after/methodology-free-populated-390-full.png) |
| methodology / anonymous | 3.906 / 7.155 | 1.624 / 2.224 | [before 1280](before/methodology-anonymous-populated-1280-full.png) · [before 390](before/methodology-anonymous-populated-390-full.png) · [after 1280](after/methodology-anonymous-populated-1280-full.png) · [after 390](after/methodology-anonymous-populated-390-full.png) |
| about / pro | 2.154 / 3.264 | 1.476 / 1.662 | [before 1280](before/about-pro-populated-1280-full.png) · [before 390](before/about-pro-populated-390-full.png) · [after 1280](after/about-pro-populated-1280-full.png) · [after 390](after/about-pro-populated-390-full.png) |
| about / free | 2.154 / 3.264 | 1.476 / 1.662 | [before 1280](before/about-free-populated-1280-full.png) · [before 390](before/about-free-populated-390-full.png) · [after 1280](after/about-free-populated-1280-full.png) · [after 390](after/about-free-populated-390-full.png) |
| about / anonymous | 2.154 / 3.264 | 1.476 / 1.662 | [before 1280](before/about-anonymous-populated-1280-full.png) · [before 390](before/about-anonymous-populated-390-full.png) · [after 1280](after/about-anonymous-populated-1280-full.png) · [after 390](after/about-anonymous-populated-390-full.png) |

## Eight gates

| Gate | Answer |
|---|---|
| One verdict above fold | One documentation summary per page; all 18 cases entirely above fold. These are documentation pages, not market verdicts. |
| About two screens closed | All cases under 2.3 screens, including shared disclosure/footer; exact measurements above. |
| No sideways scroll at 390 | Every phone document width is 390. |
| No fake or empty tools | Guide links to existing destinations; search has actual filtering and a truthful match count. No operator link. |
| No raw/advice/engine words | No unprotected primary labels. Protected/documentation exceptions listed below; raw scan results retained, not claimed zero. |
| Readable numbers + one source | One documentation source line on each page; no fabricated market dates or statistics. |
| Screenshots | 36 before/after PNGs at 1280×800 and 390×844, Pro/Free/anonymous local fixtures. |
| Naming | Symbol, All tools and Time Confluence in changed public copy; routes and identifiers unchanged. |

## Validation and limits

Production build, standalone TypeScript and three focused tests pass, including the complete client/server import graph and Guide filtering/fold interaction. All screenshots use local fixture sessions signed with a test-only key; production authentication and configuration are unchanged. APIs are intercepted and external requests aborted. Raw observation times and request/error logs are in evidence.json. No provider requests or production mutations. These are local visual checks, not #353 live acceptance.

Before images use the research-layout baseline build: Guide, Methodology, About, their supporting guide components, root layout and Header are byte-identical between that baseline and this PR's fresh batch base. After screenshots use the release build of this change. SourceLine uses a static documentation attribution, not an invented observation timestamp. Metadata title corrections are deferred to Job14.

## Explicit wording exceptions and Brad decisions

- About's exact real-time claim remains under its fold, as Y9 requires. Proposed replacement for Brad: “We combine technical analysis, source-dated market data, AI-powered insights, and research tools in a single web-based dashboard.” Not applied.
- Pricing, account and sign-in guide instructions remain untouched, including “Wait for activation confirmation and redirect.” Proposed wording for Brad: “Activation confirmation completes the sign-in flow.” Not applied.
- Methodology's explanatory/disclosure sentences retain probability, buy/sell negations, Missing as a documented freshness category, and degraded in the statement that cached/lower-quality data is not presented as live. These are definitions/disclosures, not primary live status labels. All original risk/disclosure language remains intact.
- Shared legal/footer wording is untouched, including “Do Not Sell My Personal Information.”

Job13 Reviews remains unchanged pending Brad's explicit retire/keep decision. No merge or deployment performed.
