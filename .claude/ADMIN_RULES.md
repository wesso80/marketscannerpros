# Admin Rules Index

This file maps the enforcement stack for the private Admin Terminal.

## Rule Priority
1. ADMIN_NO_EXECUTION.md
2. rules/no-broker-execution.md
3. rules/no-public-leakage.md
4. rules/admin-only.md
5. rules/data-integrity.md
6. ADMIN_TRUTH_LAYER.md
7. rules/ai-output-standards.md

## Enforcement Requirements
- If two rules conflict, the stricter safety rule wins.
- If data confidence is uncertain, surface uncertainty.
- If data source attribution is missing, downgrade evidence quality and flag it.
- If portfolio and opportunity logic collide, keep scores separate.

## Mandatory Labels On Admin Outputs
- Mode
- Opportunity Score
- Evidence Quality Score
- Personal Exposure Score or Flag
- Data freshness status
- Source attribution status
- Confidence statement
