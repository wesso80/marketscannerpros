# admin-audit

Run a full admin integrity audit.

Checklist:
- auth boundary checks
- no-execution rule compliance
- no public leakage
- stale data labeling
- source attribution coverage
- score separation compliance

Return:
1. Passed checks
2. Failed checks
3. Severity
4. Required fixes
