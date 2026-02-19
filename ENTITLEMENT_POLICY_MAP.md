# Entitlement Policy Map

This file documents where entitlement and free-mode logic is enforced in API routes, and which shared helper each route uses.

## Shared Source of Truth

- Helper module: `lib/entitlements.ts`
- Canonical tier type: `AppTier` (`free`, `pro`, `pro_trader`)
- Canonical AI limits: `AI_DAILY_LIMITS` (10 / 50 / 200)
- Canonical free-mode flag: `isFreeForAllMode()` (`FREE_FOR_ALL_MODE === "true"`)
- Canonical pro gate: `hasProAccess()`
- Canonical tier coercion: `normalizeTier()`
- Canonical AI limit accessor: `getDailyAiLimit()`

## Route Policy Map

| Route | Method | Helpers Used | Auth/Tier Behavior | AI Limit Behavior |
|---|---|---|---|---|
| `app/api/me/route.ts` | GET | none (session-only) | Returns `free` when no session; returns cookie tier when session exists | none |
| `app/api/entitlements/route.ts` | GET | `isFreeForAllMode()` | If free mode ON, returns `pro_trader` active. Otherwise checks bearer claims + RevenueCat (`pro_trader` first, then `pro`) and falls back to `free`. | none |
| `app/api/msp-analyst/route.ts` | POST | `isFreeForAllMode()`, `normalizeTier()`, `AI_DAILY_LIMITS` | If no session and free mode ON, creates temporary `free-mode` pro_trader-style session. If still no session, creates anonymous free fingerprint workspace. | Enforces canonical 10/50/200 daily limits by normalized tier. |
| `app/api/journal/analyze/route.ts` | POST | `isFreeForAllMode()`, `normalizeTier()`, `getDailyAiLimit()` | Requires session workspace unless free mode ON; uses `free-mode` workspace fallback when free mode is enabled. | Enforces canonical 10/50/200 limit for real workspace IDs; skips usage logging for `free-mode`. |
| `app/api/portfolio/analyze/route.ts` | POST | `isFreeForAllMode()`, `normalizeTier()`, `getDailyAiLimit()` | Requires session workspace unless free mode ON; uses `free-mode` workspace fallback when free mode is enabled. | Enforces canonical 10/50/200 limit for real workspace IDs; skips usage logging for `free-mode`. |
| `app/api/ai-market-focus/route.ts` | GET | `isFreeForAllMode()`, `hasProAccess()` | If free mode ON, returns full explanations for everyone. Otherwise requires session; non-pro tiers receive blurred explanation text. | none |
| `app/api/market-focus/generate/route.ts` | POST | `isFreeForAllMode()`, `hasProAccess()` | Authorized when free mode ON, or admin API key, or pro/pro_trader session. | none |
| `app/api/migrations/market-focus/route.ts` | POST | `isFreeForAllMode()` | Authorized when free mode ON, or setup key, or bearer secret. | none |
| `app/api/portfolio/route.ts` | GET/POST | none (session-only) | If no session workspace, returns local-only success payloads instead of 401 to support local free UX. | none |

## Supporting Access Utility

| File | Purpose |
|---|---|
| `lib/proTraderAccess.ts` | Pro Trader bypass logic (`PRO_TRADER_BYPASS_UNTIL` / `TEMP_PRO_TRADER_BYPASS_UNTIL`) now also keys off `isFreeForAllMode()` from shared entitlements helper. |

## Intentional Exceptions

- `app/api/env-check/route.ts` reads raw `process.env.FREE_FOR_ALL_MODE` intentionally for diagnostics visibility.
- UI copy can still contain literal strings like `10/day`, `50/day`, `200/day` (pricing/account pages). These are presentation strings, not enforcement logic.

## Guardrails for Future Changes

1. Do not read `process.env.FREE_FOR_ALL_MODE` directly in business logic routes; use `isFreeForAllMode()`.
2. Do not hardcode AI limits in API routes; use `getDailyAiLimit()` or `AI_DAILY_LIMITS`.
3. Do not write inline `tier === "pro" || tier === "pro_trader"` checks in API routes; use `hasProAccess()`.
4. Keep no-session local behavior explicit per-route (for routes designed to support local-only usage).
5. Update this map in the same PR whenever entitlement behavior changes.
