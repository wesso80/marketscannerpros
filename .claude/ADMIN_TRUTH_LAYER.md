# Admin Truth Layer Standard

Every admin output must state:
- What is known (direct source fields).
- What is derived (computed from known fields).
- What is delayed (timestamp and expected lag).
- What is missing (critical fields unavailable).
- What is simulated or fallback (if any).
- Confidence level and why.

## Truth Labels
- Real-time
- Delayed
- Derived
- Simulated
- Missing
- Stale

## Confidence Policy
- High: fresh, complete, multi-source corroboration.
- Medium: minor delays or single-source dependence.
- Low: missing critical inputs, stale data, or fallback path active.

If confidence is Low, the system must explain the exact reason.
