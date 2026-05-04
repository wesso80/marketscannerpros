# Admin Data Pipeline Doctrine

## Objective
Build a transparent, source-attributed, freshness-aware research pipeline for admin-only analysis.

## Pipeline Stages
1. Ingest
- Pull from approved sources only.
- Attach source ID and fetch timestamp.

2. Normalize
- Convert symbols, time zones, and units into platform standards.
- Retain original raw fields for auditability.

3. Validate
- Check schema, null rates, stale thresholds, and anomaly bounds.
- Mark missing and derived fields explicitly.

4. Score
- Compute Opportunity Score using market/setup features.
- Compute Evidence Quality Score using freshness/completeness/reliability.
- Compute Personal Exposure Score from owner portfolio context only.

5. Render
- Show all three score layers independently.
- Add a Truth Layer summary on every admin card.

## Non-Negotiables
- No silent fallback from live to mock data.
- No stale data shown as live.
- No source-less generated values labeled as facts.
- No portfolio-blocking in Opportunity Scout mode.
