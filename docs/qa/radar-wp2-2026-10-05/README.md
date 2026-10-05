# Job16c — WP2 Radar

Base `24e05acf82825bfa4b0a63a78d1f6eea563f72d6` from `batch/oct-wp`. Draft only; no merge or deployment.

Radar starts with one report summary, four compact headline tiles, the existing session-change chart and three phone/five desktop candidate cards. Show all expands the same ranked list. Lifecycle changes now appear once in their own closed fold. The top run/health/email pills become one plain report-status chip, with partial-coverage warnings still visible. One SourceLine uses the report's actual generated timestamp in the viewer's zone and retains the US session date separately. Archive range buttons move inside the archive fold. Existing report fetching, API, entitlement, no-store policy, data and ranking are unchanged.

## Screens and hard gate

Local production builds, deterministic eight-candidate report fixtures. **Mocked/off-session layout evidence, not a live report or provider check.** All browser API calls are fulfilled locally, external calls aborted, dummy database only. Raw UTC observation/request times are preserved. The partial case includes an admin ops payload; Free/anonymous show the unchanged honest preview-failure/access state because preview API is intentionally unpopulated. No production auth/consent changes.

| Case | Before1280 /390 | After1280 /390 | Screenshots |
|---|---|---|---|
| radar-loaded | 1.758 / 2.947 | 1.596 / 1.940 | [before 1280](before/radar-loaded-1280.png) · [before 390](before/radar-loaded-390.png) · [after 1280](after/radar-loaded-1280.png) · [after 390](after/radar-loaded-390.png) |
| radar-partial | 1.851 / 3.126 | 1.626 / 1.987 | [before 1280](before/radar-partial-1280.png) · [before 390](before/radar-partial-390.png) · [after 1280](after/radar-partial-1280.png) · [after 390](after/radar-partial-390.png) |
| radar-empty | 1.123 / 1.719 | 1.021 / 1.323 | [before 1280](before/radar-empty-1280.png) · [before 390](before/radar-empty-390.png) · [after 1280](after/radar-empty-1280.png) · [after 390](after/radar-empty-390.png) |
| radar-failed | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/radar-failed-1280.png) · [before 390](before/radar-failed-390.png) · [after 1280](after/radar-failed-1280.png) · [after 390](after/radar-failed-390.png) |
| radar-free | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/radar-free-1280.png) · [before 390](before/radar-free-390.png) · [after 1280](after/radar-free-1280.png) · [after 390](after/radar-free-390.png) |
| radar-anonymous | 1.000 / 1.000 | 1.000 / 1.000 | [before 1280](before/radar-anonymous-1280.png) · [before 390](before/radar-anonymous-390.png) · [after 1280](after/radar-anonymous-1280.png) · [after 390](after/radar-anonymous-390.png) |

| # | Gate | Answer + evidence |
|---|---|---|
| 1 | One verdict above first fold | One report headline; failed report has an explicit collection-failure summary. Counts and warnings do not invent a second market verdict. |
| 2 | About two screens closed | All final cases below2.3; measurements above include shared chrome and unchanged disclosure. Every desktop case no taller than before. |
| 3 | No sideways scroll390 | Closed/expanded body and document width390. Detailed wide tables scroll within their own containers. |
| 4 | No fake/empty tools | Real fixture rows or explicit empty/failed report; no fabricated candidate count. Partial coverage stays visible. |
| 5 | No banned/engine words | Supplied word regex returns zero hits on tested closed/expanded DOM across all12states. Global missing-regime banner remains #367. Existing protected disclosure unchanged. |
| 6 | Readable numbers +one source | Scores rounded for display; coverage99.2%, change+1.0%; SourceLine count1 on report states,0 on access preview. Viewer-zone clock and separate US session date. |
| 7 | Screenshots1280/390 |24 before/after PNGs across loaded/partial-admin/empty/failed/Free/anonymous. |
| 8 | Symbol /Overview /Track | Symbol link wording from #390 retained; route/identifiers unchanged. |

## Verification

9 focused tests in3files pass, plus2 legacy Radar tests: card cap/Show all, unchanged rank order, exactly one lifecycle list/source/verdict, truthful partial/failed state, no-store credentials, paid/admin access and Free preview privacy. Build and TypeScript pass. Zero browser page errors. All visible report buttons measure40px; phone screenshots show the MSP AI bubble below report actions. Show all intentionally expands beyond the closed-page limit.

34 protected files (Jarvis report/radar core, Radar APIs/access, gated page and Free preview) and5 request/state blocks are byte-identical to base. Source timestamps use existing shared formatting. No scoring or math changes.

## Noticed, not changed

- The broader pre-existing phase2bToday suite has two Macro title/hero failures after the earlier Macro redesign; neither Macro file is changed here. Both Radar tests from that suite pass in isolation. No attempt to rewrite unrelated checks.
- Free/anonymous preview is unchanged; shots exercise its honest unavailable-preview state, not a populated historical preview. Its access/privacy unit tests pass.
- Existing generated prose can vary in real reports. Word-scan proof covers these fixtures, not every historical report. No provider-output rewrite or storage migration.
- Shared missing-regime banner is #367. #353 still needs live-head screenshots and PNG-retention approval. Reviews still awaits Y10.
- No checkRadarAccess, no-store, scoring, worker, API, pricing, billing, Stripe, analytics, alert delivery, navigation menus, legal/disclosure wording, config or dependencies changed.
