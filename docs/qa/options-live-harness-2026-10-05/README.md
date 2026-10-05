# Options acceptance harness — offline construction evidence

Base: `39215dcd65fd698395e8725e2965581c7095856e` (batch/oct-wp after Account #378).

`fixture/` is an explicitly artificial, zero-network run. Its fixed clock is in the scheduled verification window to exercise the time gate; `actualStartedAt` records when the offline run was actually made. This is **not a live session check** and does not resolve the roughly9x OI discrepancy or deployed UI acceptance.

The fixture passes all16 evidence checks. It shows same-expiry330C/325P values, spot/date basis, canonical ATM, sufficient-history ATR, a controlled missing-history case and a simulated provider missing-history case. Both missing cases have null ATR, null confluence levels, null Symbol invalidation and no reaction zones. Database attempts0, recorder attempts0, actual network requests0; one shared-cache write is suppressed locally.

Focused verification:22 tests pass in6 files. A separate9x-mismatch fixture produces FAIL, ratio9, preserved JSON evidence and exit1. Existing ATM, missing-level, expiry continuity/unavailable-expiry and shared-chain-cache tests pass. Production build and TypeScript pass. No application route, scoring/helper implementation, database schema, package file, production data or provider policy is changed.

Run instructions, independent exchange template, exact session window, read-only boundary and limitations are in `scripts/options-validation/README.md`. Live mode was not run during construction. The reviewed command requires an explicit `--live` flag and an existing provider key; missing exchange evidence, missing-history symbol, stale/missing spot basis, historical-only chain or off-window observation yields FAIL rather than a false acceptance pass.
