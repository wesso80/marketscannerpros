# UPE + CRCS Architecture Note (Locked Decisions)

Date: 2026-02-21  
Restore-point base commit: `58d07daa`

## Strategic Direction
MarketScanner Pros will implement a **single unified capital-allocation spine** across equities + crypto:
- One **Unified Permission Engine (UPE)**
- One **CRCS model** (Confluence-Weighted Risk-Adjusted Capital Score)
- Two asset adapters (equities, crypto)
- Multiple surfaces (Market Movers, Equity Explorer, Crypto Explorer)

## Locked Product Decisions
1. **Cross-asset relative view enabled** (Equity Explorer v3 direction).
2. Relative ranking uses **Confluence-weighted risk-adjusted score (CRCS)**.
3. CRCS model uses **hybrid timing**:
   - Daily base (stable)
   - Hourly micro adjustment (bounded)
4. CRCS influences:
   - Sorting
   - Watchlist prioritization
   - Alert sensitivity
   - Journal tagging context
5. Pilot rollout: **both equities and crypto surfaces**, but via **one shared engine**.
6. CRCS compute cadence: fixed scheduler at **:05 past each hour ET**.
7. Storage retention:
   - `crcs_hourly`: **90-day rolling**
   - `global_regime_snapshots`: >= 1 year
   - `override_log`: permanent
8. Blocked-row UX behavior: **B**
   - Show row + disabled action + tooltip reason
9. Service architecture: **internal microservice** (`upe-service`) with private API.
10. Tenancy: **multi-tenant ready** with user overlays applied at read-time only.

## CRCS Contract (v1)
For each symbol snapshot:
- `symbol`
- `asset_class`
- `cluster`
- `eligibility` (Eligible/Conditional/Blocked)
- `confluence_score`
- `rar_score`
- `crcs_base`
- `micro_adjustment` (bounded)
- `crcs_final`
- `capital_mode`
- `computed_at`

### Scoring principle
- Confluence > raw movement.
- Risk-adjusted return included but not dominant.
- Eligibility and capital mode enforce discipline.

## Timing Model
### Daily jobs
- 09:35 ET: global open snapshot
- 16:05 ET: global close snapshot

### Hourly micro job
- 24/7 at **HH:05 ET**
- Data smoothing + bounded micro adjustment
- No regime/capital-mode flipping intraday

## Guardrails (Non-negotiable)
1. CRCS never bypasses risk governor.
2. CRCS never overrides hard blocks.
3. CRCS never changes global capital mode.
4. Micro adjustment bounded and smoothed.
5. Intraday logic cannot flip eligibility tier upward if blocked by hard constraints.
6. Every computation cycle is logged with timestamp + snapshot references.

## Multi-Tenant Overlay Rules
Tenant overlays can:
- tighten permissions
- adjust sizing within bounds

Tenant overlays cannot:
- alter global regime snapshots
- alter stored CRCS base snapshots
- convert blocked to eligible
- loosen risk beyond global posture

## Tenant Profiles v1 (Locked)
### Presets
- `conservative`: default size `0.7`, low volatility tolerance, stricter small/micro/high-beta permissions.
- `balanced`: default size `0.85`, medium tolerance, follows global tiering (tighten-only).
- `aggressive`: default size `1.0`, high tolerance, may allow conditional small/high-beta only when global mode is not defensive.

### Limited advanced tweaks (tighten-only)
- Size slider constrained to `0.6-1.0`, further capped by global capital mode.
- Volatility tolerance selector: `low | med | high`.
- Cluster tightening toggles: `block_microcaps`, `block_high_beta`, `only_large_mid`.

### Overlay placement
- Overlay math is applied **inside UPE service read endpoints**, never in UI clients.
- UPE returns both global and tenant-adjusted outputs (`globalEligibility`, `eligibilityUser`, `CRCS_final`, `CRCS_user`, `sizingCap`, `profileName`).

## Phase-1 Build Order (Pilot Discipline)
1. Create UPE schema/tables.
2. Implement global regime snapshot jobs.
3. Implement hourly CRCS micro job + persistence.
4. Expose internal read endpoints.
5. Wire Market Movers (equities + crypto) to CRCS snapshots.
6. Add blocked-action disabled tooltip behavior.
7. Add explorer deployment/relative view consumption.

## Implementation Status
- ✅ Phase A complete: schema + global snapshot worker.
- ✅ Phase B baseline complete: hourly CRCS base worker (`worker/upe-crcs-hourly.ts`) writing `crcs_hourly_base` and `micro_regime_snapshots`.
- ✅ Phase C complete: UPE read endpoints added:
   - `GET /api/upe/snapshot/global`
   - `GET /api/upe/crcs/latest?asset_class=equity|crypto&limit=...`
   - `GET /api/upe/crcs/symbol?symbol=...&asset_class=equity|crypto`
   - Read-time tenant overlays applied in `lib/upe.ts` (tighten-only + sizing cap by capital mode)
- ✅ Movers pilot wired (`app/tools/market-movers/page.tsx`):
   - UPE CRCS ingest (`/api/upe/crcs/latest?asset_class=crypto`)
   - Sorting priority updated to eligibility → CRCS user → confluence → relvol
   - CRCS and hourly micro delta columns added
   - Blocked action rendered as disabled control with tooltip explanation
- ✅ Scheduler wiring complete in `render.yaml`:
   - `upe-global-open` (weekday open snapshot)
   - `upe-global-close` (weekday close snapshot)
   - `upe-crcs-hourly` (hourly `:05` cadence)
- ⏳ Pending: extend UPE consumption into explorer surfaces.

## Restore Plan
- Restore tag: `restore/pre-upe-crcs-2026-02-21-58d07daa`
- Rollback command:
  - `git checkout restore/pre-upe-crcs-2026-02-21-58d07daa`
  - or `git reset --hard restore/pre-upe-crcs-2026-02-21-58d07daa`
