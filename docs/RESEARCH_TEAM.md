# MarketScanner Pros — Private Research Team (Grok API)

Status: live and tested on 2026-10-03 against production data.
Scope: internal admin research only. Not published to MarketScanner Pros users. No trades, no orders, no broker connection.

---

## 1. What this is

Four "bots" — **Scanner, Validator, Skeptic, Reporter** — that read a daily export from our own database, check it, and write a private Markdown research memo on the admin's Mac.

This is the **API version** (step 8 of the original Grok Bot plan). The four bots are **four sequential calls to the xAI Responses API** (`https://api.x.ai/v1/responses`, model `grok-4.7`), orchestrated by a local TypeScript script. There is no cloud desktop and no Grok Bot app involved. Grok never gets database credentials or tool access — it only sees the text the script hands it.

```
Neon Postgres (production, read-only role)
        │  npm run research:export
        ▼
msp-research/inbox/scan-YYYY-MM-DD.csv
        │  npm run research:team
        ▼
[code] adds evidence_quality_score   → work/enriched.csv
        ▼
Scanner    (Grok call 1) → work/shortlist.csv
        ▼
Validator  (Grok call 2) → work/evidence.md
        ▼
Skeptic    (Grok call 3) → work/skeptic.md
        ▼
Reporter   (Grok call 4) → memo draft
        ▼
[code] guardrail checks ──fail──► work/rejected-report.md (run stops)
        │ pass
        ▼
msp-research/reports/YYYY-MM-DD-research.md
```

---

## 2. Files added to the repo

| Path | Purpose |
|---|---|
| `scripts/research-team/export-scan.ts` | Read-only export from production DB → one CSV in the inbox |
| `scripts/research-team/run-team.ts` | Runs the four Grok calls, enforces guardrails, writes the memo |
| `package.json` | Added `research:export` and `research:team` scripts |
| `.gitignore` | Added `msp-research/` (exports and reports never committed) |
| `.env.local` (git-ignored) | `XAI_API_KEY`, `RESEARCH_DATABASE_URL`, `ADMIN_WORKSPACE_ID` |

Local folders (git-ignored): `msp-research/inbox`, `msp-research/work`, `msp-research/reports`.

Daily use:
```
npm run research:export
npm run research:team
```

---

## 3. Database access

- Database: Neon Postgres (production project).
- A dedicated role **`msp_research`** was created with:
  - `CONNECT` on the database, `USAGE` on schema `public`
  - `SELECT` only on `edge_ledger_setups`, `signals_fired`, `scanner_results_cache`, `signal_outcomes`
  - `default_transaction_read_only = on`
- The export script additionally runs inside `BEGIN READ ONLY`.
- Password was rotated after initial setup.

---

## 4. Export step (`export-scan.ts`)

Pulls the last 24h (`RESEARCH_LOOKBACK_HOURS`, default 24) from three sources into one CSV with a `source` column.

| Source | Filter | Mapped fields |
|---|---|---|
| `edge_ledger_setups` | **Admin workspace only** (`ADMIN_WORKSPACE_ID`) — never other users' setups | score = `opportunity_score`; invalidation = `stop_price`; quality = `confidence` (or `invalidated`); plus `ledger_confidence`, `ledger_evidence_quality`, `regime`, `setup_type` |
| `signals_fired` | all signals in window | score, direction, timeframe, bar_time = `signal_at`; quality = `not_stored` (table has no quality field); invalidation blank |
| `scanner_results_cache` | rows computed in window | JSON walked for objects with `symbol`/`ticker`; picks score / direction / quality / invalidation by common key names |

CSV columns:
`source, symbol, asset_class, timeframe, score, score_components, direction, bar_time, quality, stale, invalidation, ledger_confidence, ledger_evidence_quality, regime, setup_type, sample_n, hit_rate, avg_favourable_move_pct`

**Paper check (join, not model judgment):** for each `signals_fired` row, the export joins `signal_outcomes` on symbol + signal type + timeframe + direction, at a horizon matched to timeframe (15m→60m, 1h→240m, 4h/daily→1440m). It writes `sample_n` (resolved outcomes) always; `hit_rate` (correct / (correct+wrong), %) and `avg_favourable_move_pct` (direction-adjusted mean move) only when `sample_n >= 30`. If the role lacks access, the export continues with `sample_n=0`.

Rules applied in the export:
- **Entry and target prices are deliberately excluded.** Only the stop level is exported, as the invalidation level.
- Missing fields are left blank or explicitly `not_stored` — never backfilled with made-up values.
- Direction normalised to `bullish` / `bearish`.
- `signals_fired` has no asset class, so it is exported as `unknown` (not guessed).
- Staleness by timeframe: 15m > 1h, 1h > 4h, 4h > 12h, daily > 36h → `stale=true`.
- Commas stripped from values (simple CSV).

Current data reality (2026-10-03): ~188 rows/day, all from `signals_fired`. Edge ledger's newest setup is 2026-09-28; `scanner_results_cache` had nothing in the last 24h.

---

## 5. Team step (`run-team.ts`)

### Pre-checks (code)
- Stop if the export is empty.
- Stop if stale rows > 5 **and** > 25% of the export.
- Compute **Evidence Quality Score** (0–100) per row in code, so the model can't invent it. Weighted:

  | Item | Weight |
  |---|---|
  | Score present | 15 |
  | Direction present | 10 |
  | Bar time present | 10 |
  | Quality stored (not `not_stored`) | 10 |
  | Invalidation present | 25 |
  | Any score component | 10 |
  | History: `sample_n >= 30` | 20 |

  Capped at **60** if invalidation is missing and **50** if there is no sufficient history. Today's `signals_fired` rows score 35.
- **Exclude in code** (counted, not sent to bots): stale rows, blank quality, quality `invalidated`.
- **Sort and break ties in code**: score ↓, Evidence Quality ↓, bar time newest first, source rank (edge_ledger → scanner → signals), symbol A–Z. Scanner is told not to reorder.

### Shared rules sent to every bot
Use only data in the input. Never invent prices, indicators, scores or statistics. Never write trade instructions (buy, sell, entry, target, position size, order). Output only the requested file.

### The four bots

| Bot | Input | Instructions (summary) | Output |
|---|---|---|---|
| **Scanner** | pre-filtered, pre-sorted CSV (`work/reviewed.csv`) | Output the first 20 rows exactly as given — no reordering, dropping or editing | `work/shortlist.csv` |
| **Validator** | shortlist | List only evidence in each row. **Reject only if score, direction or bar time is missing.** Blank invalidation / components are noted as "missing", not rejected | `work/evidence.md` |
| **Skeptic** | evidence | Reject only REJECT-marked rows or unsupported claims. **Thin sample and missing invalidation → accept with a risk note and low confidence.** May only copy `sample_n` / `hit_rate` / `avg_favourable_move_pct`; writes "no paper check (sample_n=N)" when under 30. Output `## Accepted` / `## Rejected` | `work/skeptic.md` |
| **Reporter** | Skeptic output | Write memo with required admin fields (below), uncertainty-aware wording, no trade instructions, ending with the disclaimer line | `reports/YYYY-MM-DD-research.md` |

### Required admin fields per accepted symbol (project rule)
- Opportunity Score — export score, copied exactly
- Evidence Quality Score — code-computed value, copied exactly
- Personal Exposure — "Flag: not available (no position data in export)" unless present
- Confidence — never stronger than evidence; "low" when sample is thin or fields missing
- What confirms — only from given fields; no new prices or levels
- What invalidates — invalidation level copied exactly, or "missing"
- Main risk — from Skeptic's risk notes
- Paper check — `sample_n`, `hit_rate`, `avg_favourable_move_pct` copied exactly, or "no paper check (sample_n=N)"
- Evidence bullets

### Post-checks on the memo (code, not model)
- **Trade-language filter** — stops the run if it finds buy / sell / short / go long / entry / take profit / stop loss / position size / place order.
- **Invented-number check** — every number in the memo must appear in the export (dates, ranks ≤ 50 and 2/4-digit date parts excepted). Otherwise the run stops.
- Failed memos are saved to `work/rejected-report.md`, never to `reports/`.
- Code appends an **"Excluded before review"** section with exact counts (stale / blank quality / invalidated), then the disclaimer **"Private research. Not advice. No orders."** as the final line.

### Other details
- `temperature: 0`.
- Model overridable with `XAI_MODEL` (e.g. `grok-4.3`).
- Report filenames use the local date (Australia), not UTC.
- Each run prints total input/output tokens.

---

## 6. Cost (measured)

One run on 188 rows: roughly **18–20k input + 12–22k output tokens** (output includes reasoning; varies run to run).

| Model | Price per 1M (in / out) | Per run | ~22 weekday runs/month |
|---|---|---|---|
| grok-4.7 | $2.00 / $6.00 | ~$0.10–0.17 | ~$2–4 |
| grok-4.3 | $1.25 / $2.50 | ~$0.065 | ~$1.50 |

Neon read queries: negligible.

---

## 7. Compliance boundaries (from project rules)

- No broker connection, no order routing, no auto-execution.
- Admin-only: nothing exposed to public endpoints or user alerts.
- Only the admin workspace's ledger rows leave the database.
- Stale or missing data is labelled, never presented as current truth.
- Missing data lowers Evidence Quality; it is never replaced with a proxy.

---

## 8. Changes after Grok review (2026-10-03)

1. Equal-weight Evidence Quality → weighted with caps (section 5).
2. Ties broken in code before Scanner; Scanner no longer filters or sorts.
3. Stale / invalidated / blank-quality rows excluded in code and reported as "Excluded before review", separate from Skeptic rejections.
4. Paper check added as a DB join in the export, minimum 30 resolved outcomes before a hit rate is shown.
5. Asset class for `signals_fired` no longer guessed.

## 9. Known gaps / open items

1. **Outcome labelling stopped on 2026-02-19.** `signal_outcomes` has only 137 rows, newest 2026-02-19. The labeller (`worker/label-outcomes.ts`, `npm run worker:outcomes`) is not deployed in `render.yaml`, so the paper check currently returns `sample_n=0` for almost every row. Deploying it is the single biggest unlock for evidence quality.
2. **Thin signal data.** `signals_fired` stores no invalidation level and no score components. Until it does, Evidence Quality for these rows is capped at 35 and every memo is low confidence.
3. **Edge ledger inactive** since 2026-09-28; when active, those rows carry stop levels and rank ahead of signals on ties.
4. **`scanner_results_cache`** had no rows in the last 24h; its JSON shape is not defined in the repo, so field mapping uses common key names.
5. **Simple CSV parser** — export strips commas from values to keep it valid.
6. **TLS** — DB connection is encrypted but does not verify the server certificate.
7. **Delivery** — reports stay on the admin's Mac (`msp-research/reports/`). An admin-panel page or server-side scheduled run is a later option.
8. **Not yet scheduled; not yet committed to git.** Plan: three clean manual runs, then schedule the two npm commands. `msp-research/` is never committed.
