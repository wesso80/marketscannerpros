# detect-mock-data

Audit the admin terminal for mock, fallback, placeholder, stale, hardcoded, or simulated data.

Search for:
- mock
- demo
- sample
- placeholder
- fake
- fallback
- hardcoded
- testData
- SAMPLE_DATA
- TODO replace
- static arrays used as live data
- stale cache shown as fresh
- generated values without source tags

Return:
1. File path
2. Component or line
3. Type of mock/fallback data
4. Whether it reaches admin UI
5. Severity
6. Required fix
