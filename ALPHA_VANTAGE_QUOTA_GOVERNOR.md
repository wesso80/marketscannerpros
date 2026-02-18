# Alpha Vantage Quota Governor (450k Usable / 50k Reserve)

## Goal
Keep monthly Alpha Vantage usage at or below **450,000 calls** and preserve **50,000 emergency calls**.

## Budget Targets
- Monthly hard cap (usable): `450,000`
- Emergency reserve (do not touch): `50,000`
- Daily target average: `15,000`
- Daily soft ceiling: `14,000` (start throttling before this is exceeded)

## Session Targets (US Market)
For market-day operations, use these rough limits:
- By 12:00 ET: <= `6,000`
- By 14:00 ET: <= `9,000`
- By 16:00 ET: <= `12,000`
- End of day: <= `14,000`

If any checkpoint is exceeded, switch to conservation mode immediately.

## Modes

### 1) Normal Mode
Use when call burn is healthy.
- Ingest cycle: every `120s`
- Tier scope: equities + crypto
- Forex: disabled unless manually required
- Options refresh: normal cadence

### 2) Elevated Burn Mode
Use when projected day usage > `14,000`.
- Ingest cycle: every `180s` to `300s`
- Reduce options refresh frequency by ~30-50%
- Keep only highest-priority symbols in fast lanes
- Pause non-essential backfills

### 3) Conservation Mode
Use when monthly usage is near emergency threshold.
- Ingest cycle: every `300s`+ (or market-hours only)
- Options: prioritize active/watchlist symbols only
- Disable optional scans and bulk refresh features
- No historical/backfill jobs

## Daily Operator Checklist
1. Read provider dashboard monthly usage and remaining calls.
2. Compute daily allowance left:
   - `daily_allowance = (450000 - used_this_month) / days_remaining`
3. Compare against current projected burn.
4. Select mode:
   - projected <= daily_allowance -> Normal
   - projected > daily_allowance and monthly_remaining > 60k -> Elevated Burn
   - monthly_remaining <= 60k -> Conservation
5. Re-check at 12:00 ET and 14:00 ET and adjust mode.

## Weekly Adjustment Rules
- If 3+ days exceeded soft ceiling (`14k`), permanently slow ingest one notch.
- If 5+ straight days stay under `11k`, cautiously speed up one notch.
- Keep reserve untouched until urgent production issue.

## Current Recommended Worker Baseline
- `ALPHA_VANTAGE_RPM=120`
- `ALPHA_VANTAGE_BURST_PER_SECOND=2`
- `WORKER_INCLUDE_FOREX=false`

## Manual Override (only when required)
For one-off forex/manual need:
- CLI: `npm run worker:ingest -- --include-forex`

## Notes
- User count is not the dominant driver; worker cadence + options refresh policy is.
- CoinGecko can absorb broader crypto coverage; protect Alpha Vantage budget for equities/options.
