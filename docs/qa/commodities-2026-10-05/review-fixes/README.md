# Pip review fixes

Restored the plain amber warning when gateReady is false: stale data limits the assessment. Excluded rows remain excluded. Replaced Long/Short with Upside case/Downside case, formatted source dates and retrieval time without seconds, and changed the overview eyebrow to a paragraph so it cannot outsize the Markets heading.

40 requested Commodities/layout tests pass; 75 related Explorer tests pass. The old source assertions intentionally now expect the compact verdict/context and new stale-warning/source wording. A rendered gateReady=false regression checks the actual warning. Production build and TypeScript pass. Screenshots are mocked, remain1.16 desktop/2.07 phone screens, with no overflow.

Noticed, not changed: other Explorer tabs and the shared TabBar retain their existing layout. No unrelated tab rewrite. Live provider acceptance and full-suite run remain pending.
