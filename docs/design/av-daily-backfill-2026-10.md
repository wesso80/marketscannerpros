# 20-year daily equity backfill

Design sketch, 2026-10-10. Nothing in this sketch was run against Neon, Render, or Alpha Vantage.

This pull request builds the backfill only. `recordCorporateActions` and `splitAdjustStoredBars` are the companion change, so this script does not write corporate actions and does not change the worker's download path.

Do not run the backfill before pull request 636 is merged. Until that read path is on the split-only basis, a raw 20-year series is served next to dividend-adjusted closes.

The stored series stays raw, which is what the worker already writes. A 20-year load of adjusted closes would be overwritten on the next equity refresh for the newest 100 sessions and left adjusted behind that, which is the mixed series PR #107 refused. Split adjustment happens on read, in the same change as the load, so EMA200 can use the new history. Volume repair is the same upsert.

## Synthesis decision

Base: the raw-storage candidate. It holds one price basis with the worker left as it is. A rollback, a missed deploy, or a deleted progress row cannot put raw bars next to adjusted bars.

Grafted from the split-adjusted candidate:

- `avTakeToken` gains `allowFallback: false`, defaulting to today's fallback. This job passes `false`, so a Redis miss throws instead of spending a second jarvis-role bucket on top of the 600/min licence.
- The same change records split and dividend facts and applies one split-adjustment function on the long indicator reads. That is what makes a raw 20-year series usable by EMA200. It is part of this design, not a later project.

Rejected from that candidate: storing split-adjusted OHLC in `ohlcv_bars`, a per-symbol worker gate that switches the write basis, and rewriting a symbol's full history inside the ingest process. Those fail when the new worker is not the process that is running. Also rejected: `volume = EXCLUDED.volume` with no guard (a provider 0 wipes a real volume), creating the progress table from the script, and retrying an AV "Error Message" on every run.

## Problem

`ohlcv_bars` is the worker's daily bar table. Equity rows are a short raw tail. From 24 Feb 2026 through 26 Sep 2026 the worker stored volume 0 on every daily bar it wrote. The parser is fixed. The writer still only refreshes the newest 100 sessions, so the zero band remains, and the admin audit counts a symbol when more than half its bars are zero (`lib/admin/scannerDataAudit.ts:37`).

Readers that want EMA200, SMA200, or a multi-year position window are capped by that tail, and a raw series that grows past a split trips `detectPriceDiscontinuity` (`lib/scanner/barAggregation.ts:115`). The load has to repair volume, stay on the limiter's backfill lane, and leave the table on one basis.

## 1. Zero-volume root cause

The equity zeros were written by `upsertBars` in `worker/ingest-data.ts`, fed by `fetchAVTimeSeries`.

`f13409c8` (2026-02-24) changed the worker URL from `TIME_SERIES_DAILY` to `TIME_SERIES_DAILY_ADJUSTED` and left the volume line as:

```text
volume: parseInt(v['5. volume'] || '0', 10)
```

On `TIME_SERIES_DAILY` that key is the share volume. On `TIME_SERIES_DAILY_ADJUSTED` field 5 is `'5. adjusted close'` and `'5. volume'` is absent. `undefined || '0'` is `'0'`, so `parseInt` stored 0. The adjusted close was not written into the volume column. The key was missing, and the `|| '0'` default filled it. PR #59 states this directly: every daily bar the worker wrote after the February switch has volume 0.

`c706a802` (2026-09-26) replaced that read with `avRowVolume` (`lib/scanner/avVolume.ts:8-11`), which takes `'6. volume'` and then `'5. volume'`. The worker calls it at `worker/ingest-data.ts:526`. Close is still raw `'4. close'` at line 525.

Proof, run against the real function (Node 22 type-stripping import of `lib/scanner/avVolume.ts`), on an adjusted row whose `'6. volume'` is `4149575`:

| Expression | Result |
|---|---|
| `parseInt(row['5. volume'] \|\| '0', 10)` (the pre-fix parser) | `0` |
| `avRowVolume(row)` | `4149575` |
| `avRowVolume({ '5. adjusted close': '227.06' })` | `0` |
| `Math.round(Number(NaN) \|\| 0)` (what `upsertBars` does with a missing crypto volume) | `0` |

The same assertion is locked in `test/scannerVolumeAndReason.test.ts:13-33`.

The zeros are still in the table because a history refresh does not rewrite them. `fetchAVTimeSeries(symbol, 'daily', 'full')` downloads the full series (`worker/ingest-data.ts:1412`). `retainEquityDailyBars` keeps 250 bars in memory (`lib/worker/equityBulk.ts:31-37`). `mergeLiveDailyBar` then cuts the series to `AV_DAILY_COMPACT_BARS` (100) (`lib/worker/equityBulk.ts:23-24`, `:176-184`). Only that tail is passed to `upsertBars` (`worker/ingest-data.ts:1444-1447`). Between refreshes the worker upserts one live bar. `cleanup_old_bars` (`migrations/002_cached_data_schema.sql:193`) has no caller, so rows that age out of the 100-bar window stay forever.

Before the fix, each refresh fetched compact history and upserted those 100 bars at volume 0 (`41fec040^`). Sessions that sat inside that window between 24 Feb 2026 and 26 Sep 2026, and have since aged past bar 100, are the stranded band. That is on the order of 150 sessions, roughly late Sep 2025 through mid May 2026, for a name that was ingested the whole time. Rows older than the band kept the volume they had under `TIME_SERIES_DAILY`. The audit's "more than half" rule (`scannerDataAudit.ts:37`) then flags names whose stored depth is less than about twice the band. A symbol with a long pre-2026 history can contain the band and stay under 50%. The live count of 159 was not queried.

`upsertBars` still does `Math.round(Number(bar.volume) || 0)` at `worker/ingest-data.ts:930` and then `volume = EXCLUDED.volume` (`:952`). A later write of 0 replaces a good volume. `buildLiveDailyBar` can do that for the current session when the quote volume is missing (`lib/worker/equityBulk.ts:165`). That is one row, and the next post-close refresh with `avRowVolume` puts the provider volume back.

Crypto is a current writer of 0, and it is not this job. CoinGecko OHLC has `volume: null` (`lib/scanner/cryptoBars.ts:53`). `attachDailyVolumes` fills about the last 360 days (`lib/scanner/cryptoBars.ts:94-100`). The worker holds 6 × 180 = 1080 days (`lib/worker/cryptoDailyHistory.ts:21-23`) and maps a missing volume to `NaN` (`worker/ingest-data.ts:669`). Line 930 stores that as 0, and every crypto refresh upserts the whole series (`:1602`). An Alpha Vantage equity backfill must not touch those rows.

These parsers still read `'5. volume'` on an adjusted payload. They do not insert `ohlcv_bars`. They are a separate fix:

- `app/api/scanner/bulk/route.ts:553` (`parseFloat(values['5. volume'] || '0')`)
- `lib/catalyst/priceService.ts:174`
- `app/api/equity/detail/route.ts:155` (`parseInt` of a missing key is `NaN`) and `:183` (`|| 0`)
- `lib/options-confluence-analyzer.ts:90`
- `lib/candleProcessor.ts:252` (midpoints, via `scripts/backfill-equities.ts`)

`/api/bars` reads `v['5. volume'] ?? v['6. volume'] ?? 0` (`app/api/bars/route.ts:166`). On a normal adjusted row the first key is absent, so this falls through to `'6. volume'`. It is not the systematic zero writer. It only stores bars when the symbol has none (`:66-68`).

The proposed fix for the stranded equity band is the upsert in section 2. It writes `'6. volume'` through `avRowVolume` for every session in the 20-year window, and the conflict clause updates `volume` when the new value is positive. No second repair pass.

## 2. Backfill design

### Usage

```bash
# Read-only. No AV calls, no writes, no kill switch.
npx tsx scripts/backfill-equity-daily-history.ts --audit

# Canary. --symbols always refetches, including rows already marked done.
EQUITY_DAILY_BACKFILL=1 \
  npx tsx scripts/backfill-equity-daily-history.ts --symbols=SPY,AAPL,NVDA

# Full enabled-equity universe. Same command resumes after a crash.
EQUITY_DAILY_BACKFILL=1 \
  npx tsx scripts/backfill-equity-daily-history.ts
```

Run it as a one-off process with `msp-data-worker`'s env (`DATABASE_URL`, `ALPHA_VANTAGE_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` at `render.yaml:48-56`). Do not add it to `render.yaml`.

```ts
// scripts/backfill-equity-daily-history.ts
process.env.AV_PROCESS_ROLE = 'jarvis'; // assignment, so an inherited worker role cannot win
const { runEquityHistoryBackfill } = await import('../lib/history/equityDailyBackfill');
const report = await runEquityHistoryBackfill({ nowMs: Date.now(), symbols: args.symbols, log });
process.exit(report.exitCode);

// worker/ingest-data.ts, after a successful full daily download (payload already in hand)
await recordCorporateActions(symbol, payload); // no extra AV call

// app/api/scanner/bulk/route.ts, before EMA200
const adjusted = splitAdjustStoredBars(rawBars, actionsBySymbol.get(sym) ?? []);
```

Exit codes: `0` complete or kill switch off, `2` refused before any AV call, `3` stopped and resumable, `4` AV returned `Note` or `Information`, `1` crash.

### Where it runs

A one-shot script, `scripts/backfill-equity-daily-history.ts`. Not a job inside the ingest loop.

The ingest process is `AV_PROCESS_ROLE=worker` (`worker/ingest-data.ts:26`) and the whole loop is `runWithAvBudget({ lane: 'scheduled', feature: 'worker-ingest' })` (`:2111`). On a Redis timeout its fallback is entirely scheduled (`lib/avLimiter.ts:425-429`, `fallbackBudget('worker')`), which grants nothing to `backfill`. One process has one role. The script assigns `jarvis` so that fallback, if it were ever used, would be the backfill bucket. This job then disables that fallback (below).

`53efdece` (PR #343) dropped full history out of `equityBarHolds` after the 512 MB worker was OOM-killed. The script keeps one parsed symbol, commits it, and drops the array. It does not put the series back into the worker heap.

A cron in `render.yaml` would start on a schedule and would put the kill switch in the blueprint. This is a campaign an operator starts.

### Limiter

Every AV call is one `TIME_SERIES_DAILY_ADJUSTED` with `outputsize=full`, inside:

```ts
await runWithAvBudget({ lane: 'backfill', feature: 'equity-daily-history' }, async () => {
  await avTakeToken({ lane: 'backfill', feature: 'equity-daily-history', allowFallback: false });
});
```

`runWithAvBudget` is `lib/avLimiter.ts:260`. `avTakeToken` is `:634`. Admission is `decideAvTake` (`:308-330`), mirrored by `AV_LIMITER_LUA`. Floors are minimums (`:13-20`, `:70-75`). A take is allowed when `usedTotal + 1 + unmet floors of the other lanes that are currently held <= ceiling`.

| Lane | Split floor | When the floor is held |
|---|---|---|
| user | 50 | Always, including when the lane has not called (`laneFloorIsHeld`, `:303`) |
| alerts | 30 | A grant this minute, or last grant inside 120s (`AV_LANE_ACTIVE_MS`) |
| scheduled | 100 | Same 120s window |
| backfill | 120 | Only while `av_limiter:jarvis` exists (`:304`) |

This job never calls `touchJarvisHeartbeat` (`:519`). With the key absent, the backfill floor is spare and the user lane can still reach 200/min while scheduled sits at 100 (`test/avLimiter.test.ts:252-255`). With the key present, that same case cuts the user lane from 200 to 80 (`test/avLimiter.test.ts:242`). The heartbeat is how a backfill starves the user. Leaving it unset is the point.

`avTakeToken` on the backfill lane waits 20s and then throws (`WAIT_MS`, `:632`). A throw is a pause, not a fetch, and it does not count as a failed symbol.

Pace is `currentAvBudgetPlan().reserves.backfill`: 120/min in split, 216/min when `AV_BUDGET_MODE=540` (`:70-75`, `:113-128`). The script sleeps `ceil(60_000 / reserve)` between AV starts (500ms or 278ms). A grant from spare capacity does not shorten the sleep. At 120 starts/min the other three floors (50 + 30 + 100 = 180) stay unused on a 300 ceiling even when those lanes are idle. The Lua script is still what admits each call. There is no private RPM constant and no use of `scripts/backfill-equities.ts`, which has its own 600 rpm limiter and writes midpoints.

`allowFallback: false` is new on `avTakeToken` and defaults to today's behavior for every existing caller. When this job passes `false` and `tryRedis` returns null (absent, timeout, or error, `:543-546` and `:623-627`), the take throws `AV limiter Redis unavailable` and does not call `tryLocal`. The jarvis local bucket is another 120/min in split (`:420-423`) on top of the shared ceiling. The licence proof is one process per role (`:7-11`). A second jarvis-role process on the fallback breaks that sum. The script also exits 2 before the first call when `getLimiterRedis()` is null.

Do not override `AV_BUDGET_MODE` on the one-off. It must match the worker, or the Lua ceiling and the other processes disagree.

Run window: the script refuses to start, and stops itself, outside 08:30–20:30 America/New_York on a US trading day being closed. In that window it stays out of the 09:00 pre-open refresh, the session, the 16:20 close refresh, and the weekday Jarvis crons at 21:15 and 22:15 UTC (`render.yaml:95`, `:135`). Those Jarvis crons do not have `UPSTASH_REDIS_REST_URL` (`render.yaml:98-130`), so `touchJarvisHeartbeat` returns immediately (`lib/avLimiter.ts:521-522`) and a heartbeat probe cannot see them. The clock is the separation. Weekends and US holidays are open all day. A clean pass fits in one night (below).

### Idempotent upsert

The unique key is the primary key. There is no date column and no second unique index.

```60:64:migrations/002_cached_data_schema.sql
  PRIMARY KEY (symbol, timeframe, ts)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_bars_symbol_tf ON ohlcv_bars(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_ohlcv_bars_ts ON ohlcv_bars(ts);
```

Postgres names the unique btree `ohlcv_bars_pkey`. `idx_ohlcv_bars_symbol_tf` and `idx_ohlcv_bars_ts` are not unique. The session date is `ts` at UTC midnight, the same instant `normalizeBarTimestamp` writes for a `YYYY-MM-DD` string (`worker/ingest-data.ts:767-769`).

```sql
-- $1 symbol, $2 ts[] as 'YYYY-MM-DDT00:00:00.000Z', $3 open[], $4 high[], $5 low[], $6 close[], $7 volume[]
INSERT INTO ohlcv_bars (symbol, timeframe, ts, open, high, low, close, volume)
SELECT $1, 'daily', r.ts, r.open, r.high, r.low, r.close, r.volume
  FROM unnest($2::timestamptz[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::bigint[])
       AS r(ts, open, high, low, close, volume)
 WHERE EXISTS (
   SELECT 1 FROM symbol_universe u
    WHERE u.symbol = $1 AND u.enabled AND COALESCE(u.asset_type, 'equity') = 'equity')
 ORDER BY r.ts
ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
  open   = EXCLUDED.open,
  high   = EXCLUDED.high,
  low    = EXCLUDED.low,
  close  = EXCLUDED.close,
  volume = CASE WHEN EXCLUDED.volume > 0 THEN EXCLUDED.volume ELSE ohlcv_bars.volume END
WHERE (ohlcv_bars.open, ohlcv_bars.high, ohlcv_bars.low, ohlcv_bars.close, ohlcv_bars.volume)
      IS DISTINCT FROM
      (EXCLUDED.open, EXCLUDED.high, EXCLUDED.low, EXCLUDED.close,
       CASE WHEN EXCLUDED.volume > 0 THEN EXCLUDED.volume ELSE ohlcv_bars.volume END);
```

`ts` is bound as a `Z` timestamp, so the row hits the worker's key regardless of the session TimeZone. A bare `YYYY-MM-DD` is not bound. `onDemandFetch` and `/api/bars` still bind a bare date (`lib/onDemandFetch.ts:233`, `app/api/bars/route.ts:207`). Whether those collide with UTC midnight depends on the database TimeZone, which was not queried. The audit counts off-midnight daily rows and the job does not delete them.

A new row is inserted even when volume is 0. The `CASE` applies only on conflict: a 0 never overwrites an existing volume, and a positive volume still replaces a stored 0. The `IS DISTINCT FROM` guard makes a second pass write nothing when the row is already right. The `EXISTS` guard repeats the universe predicate at write time. `ORDER BY r.ts` matches the worker's ascending lock order (`worker/ingest-data.ts:918-919`).

The statement does not go through `upsertBars`. That function keeps `bars.slice(-1100)` (`worker/ingest-data.ts:913`) and would drop a 20-year series to 1,100 bars. It also does not call `cleanup_old_bars`. The default of that function keeps 500 bars and would delete the load.

The write window ends one US trading day before the last completed session. The newest completed session and the live bar stay worker-owned, so this statement does not race the live quote. The zero band is older than that edge.

### Resume

Progress is a table, not `MAX(ts)`.

`MIN(ts)` and a bar count get the crash case wrong: if the oldest chunk committed and the process died, the symbol already looks 20 years deep while the middle is missing. A listing younger than 20 years never satisfies `MIN(ts) <= window start`, so it would be refetched on every run. A real provider volume of 0 cannot be told from an unfinished repair. An unknown symbol needs a terminal state or it costs a call forever. The split marker for the read-side adjuster has nowhere to live on `ohlcv_bars`, which has no coefficient column.

Migration `135_equity_daily_history_backfill.sql` (next number after `134_ai_outcome_long_horizon_provenance.sql`):

```sql
CREATE TABLE equity_history_backfill (
  campaign          text        NOT NULL,
  symbol            varchar(20) NOT NULL,
  status            text        NOT NULL, -- done | no_data | retry | failed
  attempts          int         NOT NULL DEFAULT 0,
  provider_oldest   date,
  written_from      date,
  written_through   date,
  inserted_rows     int         NOT NULL DEFAULT 0,
  volume_repaired   int         NOT NULL DEFAULT 0,
  provider_zero_volume int      NOT NULL DEFAULT 0,
  last_error        text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign, symbol)
);

CREATE TABLE equity_corporate_actions (
  symbol            varchar(20) NOT NULL,
  ex_date           date        NOT NULL,
  split_coefficient numeric     NOT NULL DEFAULT 1,
  dividend_amount   numeric     NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, ex_date)
);
```

Campaign constant: `av-daily-raw-20y-v1`. Bumping it re-runs the universe. One transaction per symbol commits the bar chunks, the action rows, and the `done` progress row together. A crash mid-symbol rolls all three back. The next run fetches that symbol again (one extra AV call) and the upsert is safe if any rows did land.

| Crash point | After restart |
|---|---|
| During the AV fetch | Nothing written. Fetch again. |
| Mid-transaction | Rolled back. Fetch again. |
| After commit | `done`. Skip. Zero AV calls. |

`no_data` is terminal for an AV `Error Message` or an empty series. `retry` becomes `failed` at 3 attempts. A limiter denial is not an attempt. Before skipping `done`, one lookup checks that a daily bar still exists in the 14 days after the first session this campaign expected to store. That session is `written_from` when the provider history reaches the window, and `provider_oldest` when the listing is younger, so a Sunday window start and a young listing are not reopened. `scripts/cleanup-cache.ts:44-46` truncates `ohlcv_bars`, and `cleanup_old_bars(500)` would delete that old tail. Either one reopens the symbol. That check reads the table. It is not a second progress store.

### Adjusted vs raw

Stored daily equity OHLC is raw: `'1. open'`, `'2. high'`, `'3. low'`, `'4. close'`, and `'6. volume'` via `avRowVolume`. No split factor is applied at write time. `'5. adjusted close'` is not stored.

That is the worker's basis (`worker/ingest-data.ts:522-526`, `lib/worker/equityBulk.ts:141`). `onDemandFetch` and `/api/bars` write the same fields. The worker's next history refresh overwrites the newest 100 sessions with the same raw values, so the overwrite does not move the price. There is no seam at bar 100.

Raw history does not change when a later split or dividend prints. Split-adjusted history does: every older row moves. A one-shot adjusted load is stale at the next corporate action unless something rewrites the whole symbol. PR #107 (`16945e8e`) and the comment at `lib/scoring/canonical/regimeOverlayData.ts:12-14` refused to write the adjusted helper into this table for that reason. PR #59 left "store adjusted closes plus a backfill" as an open decision. This sketch closes it as: backfill yes, adjusted storage no.

`getBars` is the writer that breaks the basis today. `avFetchDailyBars` sets `close` to `'5. adjusted close'` and scales open, high, and low by adjusted/raw (`lib/marketData/client.ts:52-65`). `getBars` upserts those rows (`lib/marketData/index.ts:135-137`), including 500 rows when `fullDailyHistory` is set. The comment at `index.ts:111-112` says the table already mixes the two. In the same change, `getBars` stops persisting `daily`, `weekly`, and `monthly`. It still returns the adjusted series to its callers. The full-history path already prefers its own Redis key (`daily-position-v2`) and skips the Postgres read; the write at line 137 is what this change removes. Intraday writes stay.

Dividends stay in the close. `parseAlphaVantageDailyBars` (`lib/scanner/avDailyBars.ts:4-6`) is the house rule: split-adjust, do not dividend-adjust, matching the daily scan and the research chart copy. The daily scan does not read `ohlcv_bars`. It keeps fetching AV. This load does not change its per-symbol math.

`equity_corporate_actions` stores `'8. split coefficient'` when it is not 1, and `'7. dividend amount'` when it is not 0, from the same full payload. The backfill writes the history. After that, the worker calls `recordCorporateActions` on the full download it already holds at `worker/ingest-data.ts:1412`. No second AV call. Readers that need a continuous price call one function:

```ts
splitAdjustStoredBars(bars, actions): Bar[]
```

Newest session factor is 1. A coefficient other than 1 multiplies into older sessions. OHLC is divided by the factor. Volume is multiplied by it, so dollar volume is unchanged across a split. The arithmetic is the walk in `parseAlphaVantageDailyBars` (`lib/scanner/avDailyBars.ts:15-31`). That function and this one share one implementation. A 1000-bar cap stays on the daily-scan parser only.

Call sites in this change, all before indicator math:

- bulk scanner, 400-day window (`app/api/scanner/bulk/route.ts:1620`)
- scanner run, 260 daily bars (`app/api/scanner/run/route.ts:2097`)
- canonical `loadStoredDailyBars` (`lib/scoring/canonical/barStore.ts:13`)
- decision evidence, 500 bars (`lib/admin/decisionEvidence.ts:26`)
- regime overlay SPY/QQQ, 200 closes (`lib/scoring/canonical/regimeOverlayData.ts:53`)
- Jarvis DB fallback, 260 bars (`lib/jarvis/radar/collect.ts:50`)

Without those calls, a raw 20-year series puts split gaps inside the 260/400/500-bar windows. `detectPriceDiscontinuity` flags a close ratio ≤ 0.6 or ≥ 1.6, and the bulk route then sets EMA200 to `NaN` (`app/api/scanner/bulk/route.ts:1634-1636`). The adjustment is what keeps that from firing on a split. An ordinary ex-dividend move stays inside 0.6/1.6, which is why the close is not dividend-adjusted.

Outcome labellers do not call it. They compare a raw `price_at_signal` with later closes (`lib/outcomes/positionHorizonLabeller.ts:279`, `worker/label-outcomes.ts:239`). Split-adjusting those bars would make a label wrong whenever a split landed between the signal and the labelling run. On raw bars, a label is wrong only when a split falls inside the horizon itself.

`indicators_latest` is computed from the in-memory 100-bar tail, not from `ohlcv_bars`. This load does not refresh it. The next equity cycle still overwrites it from raw AV bars. Surfaces that read EMA200 from the table (the bulk 400-day query) are the ones that change.

### Repair of existing zero-volume rows

The conflict clause is the repair. Every session in the window with a positive `'6. volume'` overwrites a stored 0. The Feb–Sep 2026 band sits inside a 20-year window. A provider 0 leaves the stored volume alone, so a real zero and a parse miss are not given a second chance to wipe a good row.

The universe is the scanner equity predicate, and only that:

```sql
SELECT symbol FROM symbol_universe
 WHERE enabled = TRUE AND COALESCE(asset_type, 'equity') = 'equity'
 ORDER BY tier ASC, symbol ASC
```

That is the query at `app/api/scanner/bulk/route.ts:97-101` and `app/api/scanner/run/route.ts:665-667`. ETFs were left as `asset_type = 'equity'` in `migrations/100_symbol_universe_asset_hygiene.sql`, so they are included. Crypto, forex, and a null-joined unknown are not. The job never runs `UPDATE ohlcv_bars SET volume = … WHERE volume = 0`.

The 326 figure is not in the repo. `--audit` prints the live count. The worker's universe is wider: every enabled non-forex symbol (`worker/ingest-data.ts:748-764`), and anything that is not `crypto` is treated as an equity (`:1910`). A symbol stored as `etf` under a different asset type, or as `stock` / `equities`, is ingested by the worker and skipped here. See the open questions.

### Batch, calls, runtime, size, failure, kill switch

| Item | Value |
|---|---|
| AV calls | 1 `outputsize=full` per enabled equity. About 326 on a clean pass. Ceiling 3 attempts per symbol. |
| Pace | `reserves.backfill`: 120/min split, 216/min in 540 mode. Floor on call spacing is about 2.7 min or 1.5 min. |
| Wall clock | One symbol at a time. AV full payload is about 1–4s, and the Neon transaction is about 1–2s, so a clean pass is about 15–35 minutes. DB time dominates the AV floor. |
| Rows | 252 sessions × 20 years × 326 symbols = 1,643,040. Listings younger than 20 years land under that. The payload is clipped to the window before write. Existing tails are updates, not inserts. Net new rows are on the order of 1.6 million if equities currently hold ~100 bars. |
| Batch | 1,000 rows per `unnest` statement, one transaction per symbol. Seven array parameters, under the 65,535-parameter cap. `statement_timeout` 30s for the transaction. |
| Neon | About 150–200 bytes per row for the heap tuple plus `ohlcv_bars_pkey` and the two secondary indexes. 1.64 million × 180 bytes ≈ 300 MB. Budget 0.35 GB including update bloat. WAL for the load is extra for the history window. |
| Actions | A few splits and on the order of 80 dividends per symbol. Tens of thousands of rows. Negligible next to the bars. |

`docs/BUSINESS_PLAN_2026.md:291` lists the current Neon bill as the free tier. Neon’s published free-plan storage is 0.5 GB. This sketch did not query `pg_database_size`. A 0.35 GB add on top of the database that is already there can miss a 0.5 GB cap. `--audit` prints `pg_database_size` and `pg_total_relation_size('ohlcv_bars')` before anyone sets the kill switch.

Failure:

| Outcome | What the script does | Progress row |
|---|---|---|
| Kill switch is not `1` or `true` | Exit 0 before Redis, AV, or SQL | none |
| Role is not `jarvis`, or limiter Redis is missing | Exit 2, no AV call | none |
| `avTakeToken` throws denied | Sleep 30s, same symbol. Denied for 10 minutes: exit 3 | unchanged |
| `allowFallback: false` throws | Exit 2. Completed symbols stay `done` | unchanged |
| AV `Note` or `Information` | Exit 4. The limiter should have made this impossible | unchanged |
| AV `Error Message` or empty series | Next symbol | `no_data` |
| HTTP, timeout, bad JSON, database error | Next symbol | `retry`, then `failed` at 3 |
| Row fails OHLC sanity (non-finite, high < close, low > close) | Dropped and counted | — |
| Clock enters the NY session window | Exit 3 | as committed |
| SIGTERM | The open transaction commits or rolls back. Exit 3 | as committed |

Kill switch: `EQUITY_DAILY_BACKFILL` must equal `1` or `true`. Unset, `0`, and anything else are off. It is not added to `render.yaml`. A test reads `render.yaml` and fails if the name appears. Cancelling the process is the stop. The same command resumes. Do not run the backfill before pull request 636 is merged.

## 3. Blast radius

The safety fact: daily equity rows in `ohlcv_bars` stay raw `'4. close'`, which is what the worker, `onDemandFetch`, and `/api/bars` already write, and `getBars` stops persisting daily-family rows in the same change. The worker's next refresh then writes the same prices over the newest 100 sessions. Labellers keep comparing raw closes to raw `price_at_signal`.

How far that was proved:

- The volume bug was run (section 1). Step 4 of a code proof.
- The primary key was read at `migrations/002_cached_data_schema.sql:60`. The `Z` timestamp matches `normalizeBarTimestamp` (`worker/ingest-data.ts:767-769`). Whether bare-date inserts from `onDemandFetch` and `/api/bars` already share that instant was not queried.
- The 100-bar overwrite was read at `worker/ingest-data.ts:1444-1447` and `lib/worker/equityBulk.ts:176-184`. It was not executed against production rows.
- Which of the 159 zero-volume symbols are equity, crypto, or unknown was not queried. The audit joins `symbol_universe` and labels a miss as `unknown` (`scannerDataAudit.ts:62-63`).

### Writers after this change

| Writer | Basis | What it still writes |
|---|---|---|
| Worker `upsertBars` (`worker/ingest-data.ts:944`) | raw | Newest 100 after a daily refresh, plus the live bar. Crypto series unchanged, including its zeros. |
| This job | raw | The 20-year window, except the newest completed session and the live bar. |
| `onDemandFetch` (`lib/onDemandFetch.ts:236`) | raw | Last 50. Bare `YYYY-MM-DD` in `ts`. |
| `/api/bars` (`app/api/bars/route.ts:211`) | raw | Last 50, and only when the symbol has no rows. |
| `getBars` → `pgUpsertBars` (`lib/marketData/index.ts:137`) | adjusted today | Stops for `daily`, `weekly`, and `monthly`. Intraday unchanged. |

`getBars` today can still overwrite 500 raw rows with dividend-adjusted OHLC on a cache miss (`lib/operator/market-data.ts:207` asks for `fullDailyHistory`). That is the companion change. Shipping the load without it puts the mixed series back on the next operator page view.

### Readers

History older than each reader's window does not change that reader. The equity worker currently persists about 100 bars, so filling up to the window does change scores even when the newest closes are untouched.

| Reader | File:line | Window | Volume 0 → real | Close, still raw, with split-adjust on read |
|---|---|---|---|---|
| Bulk EMA / liquidity | `app/api/scanner/bulk/route.ts:1620` | 400 days | Last-20 average starts counting bars that were 0. Can move the $5M dollar-volume block | Splits inside 400 days no longer null EMA200. Symbols that grow past 200 bars gain an EMA |
| Scanner run | `app/api/scanner/run/route.ts:2097` | 260 bars; AV fallback under 60 | OBV, MFI, VWAP, dollar ADV inside the window | Same discontinuity gate at `:2220` stops firing on splits. Weekly bars are still built from these 260 sessions |
| Scanner SPY relative strength | `app/api/scanner/run/route.ts:1669` | 120 closes | No | Only if SPY split inside 120 sessions |
| Canonical bar store | `lib/scoring/canonical/barStore.ts:13` | default 500 | Volume ≤ 0 becomes null today; a repair makes it available | Continuous closes for the options-cockpit features |
| Regime SPY/QQQ | `lib/scoring/canonical/regimeOverlayData.ts:53` | 200 closes | No | SMA50/SMA200 move when a split sits in those 200. Daily scan, scan-universe, and the scanner overlay all read this. Cache is 15 minutes |
| Decision evidence | `lib/admin/decisionEvidence.ts:26` | 500 | No | Position trend can turn on once a short store passes ~26 weeks. A raw gap without the adjuster rejects the series |
| Jarvis DB fallback | `lib/jarvis/radar/collect.ts:50` | 260, only if the AV compact fetch fails | `hasVolume` stays hardcoded false (`:66-68`) | Fallback series is split-adjusted. The primary path is still the AV fetch |
| 6w/12w labeller | `lib/outcomes/positionHorizonLabeller.ts:153` | `getBars` 100 merged with 520 stored | No | Stays raw, on purpose. Unlabelled rows inside 520 become measurable. Already-written horizons stay |
| 24h AI labeller | `lib/outcomes/aiOutcomePrices.ts:91` | newest 100 via `getBars`, and only if intraday missed | No | Pending rows only. `getBars` compact still reads Postgres until its cache expires |
| Edge labeller | `lib/edge/outcomeLabeller.ts:131` | from the signal, limit 90, keep 20 sessions | No | Pending and partial rows only. A close outside high/low drops the bar |
| Signal labeller | `worker/label-outcomes.ts:98` | the signal's own window | No | Unlabelled signals only. `get_unlabeled_signals` skips a signal that already has a row |
| UPE hourly | `worker/upe-crcs-hourly.ts:164` | last close, close 20 back, average of 20 volumes | Zeros are included in `AVG`, so a repair raises the average and lowers relative volume. The 0.55 block can change | 20-day return uses the raw close. This reader is not in the split-adjust list. A split inside 20 sessions still moves it |
| Market movers | `app/api/market-movers/route.ts:250` | 40 bars | 5-day move versus the volume surge | Short window |
| `/api/bars` | `app/api/bars/route.ts:58` | limit, default 50, max 200 | Volume is not in the JSON payload | Candles, EMA, RSI, MACD inside the limit. This route is not in the split-adjust list, so a chart can still show a split gap inside 200 bars |
| News JEV | `lib/admin/equityNewsJev.ts:121` | existence, then 40 closes | No | Unlabelled stamps whose closes sit in those 40 |
| Scanner audit | `lib/admin/scannerDataAudit.ts:61` | all daily rows | The half-zero count drops. A 5,000-row symbol hides a 160-row band under the 50% rule even before the repair, so the proof uses absolute zero counts | Depth and years change |
| Backtest coverage | `app/api/backtest/symbol-range/route.ts:68` | min/max/count, no timeframe filter | No | Span grows. The count mixes timeframes |
| Cross-asset confluence | `lib/crossAsset/confluence.ts:107` | newest 100 via `getBars` | No | Redis can hide a rewrite for an hour |
| Operator daily bars | `lib/operator/market-data.ts:205` | AV last 500 on success | Only on the AV-failure fallback | A successful fetch still returns adjusted bars and, after this change, does not write them back |

`/api/flow` selects a column named `timestamp` (`app/api/flow/route.ts:49`). The column is `ts`. The query throws and the route falls through to Alpha Vantage. This load does not change that route.

Caches that keep a pre-load series until they expire: Redis `md:bars:{symbol}:daily` (1 hour), `chartBars` (300s), worker `ind:{symbol}:daily` (300s), regime overlay memory (15 minutes), scanner-audit Redis (3600s). `indicators_latest` is not invalidated by a bar rewrite.

`cleanup_old_bars(500)` and `scripts/cleanup-cache.ts` (`TRUNCATE ohlcv_bars`) delete the load. Neither is called by this job. The stale-`done` check refills after a truncate, at the cost of another full pass.

No column is added to `ohlcv_bars`. The migration is the two new tables in section 2. Readers of `ohlcv_bars` do not need a schema change. They need the `splitAdjustStoredBars` call listed above, which is application code in the same change.

## 4. Test and proof plan

Run these before any production pass. The first group needs no network, no database, and no Alpha Vantage.

1. Volume. The fixture row from `test/scannerVolumeAndReason.test.ts` (no `'5. volume'`, `'6. volume' = 4149575`). The old expression is 0. `avRowVolume` is 4149575. The backfill parser stores that volume and raw `'4. close'`, with `ts` ending in `T00:00:00.000Z`.
2. Split facts, not split prices. A 2-for-1 session stores the raw close and a corporate-action row. The previous session's stored close is the raw print, not the raw print divided by 2. `splitAdjustStoredBars` then halves that previous close and doubles the volume. A row whose `'5. adjusted close'` differs from `'4. close'` and whose split coefficient is 1 stores `'4. close'`.
3. Planner. Classifies insert, volume repair, and unchanged. A provider 0 does not replace a stored positive volume. No row is newer than the write window's `through`.
4. Window and clock. `through` is the session before the last completed one. The NY gate is closed from 08:30 to 20:30 on a trading day and open on a Saturday.
5. Conflict text. The SQL constant contains `ON CONFLICT (symbol, timeframe, ts) DO UPDATE` and `volume = CASE WHEN EXCLUDED.volume > 0`. It does not contain `cleanup_old_bars` or `slice(-1100)`.
6. Source contract, over the repo rather than one file. Production daily writers of `ohlcv_bars` are the worker, `onDemandFetch`, `/api/bars`, and this module. `getBars` does not call `pgUpsertBars` for `daily`, `weekly`, or `monthly`. The script assigns `AV_PROCESS_ROLE = 'jarvis'`, passes `lane: 'backfill'` and `allowFallback: false`, and does not reference `touchJarvisHeartbeat`, `cleanup_old_bars`, or `backfill-equities`. `render.yaml` does not contain `EQUITY_DAILY_BACKFILL`. The split-adjust call sites are the six listed in section 2, and the labellers are not among them.
7. Limiter. Existing `test/avLimiter.test.ts` cases still fall back when Redis is absent. A new case: `allowFallback: false` with `tryRedis` returning null throws and does not call `tryLocal`. `getLimiterRedis()` null refuses the run with zero fetches. Two AV starts are at least `ceil(60_000 / reserves.backfill)` apart when the take resolves immediately. A spy records zero heartbeat calls.
8. Kill switch. Unset and `0` return disabled and `avCalls: 0`. `1` and `true` both enable the run.
9. Resume. A `done` symbol makes no fetch. A thrown statement inside the symbol transaction rolls back and leaves no `done` row. The next call fetches that symbol.

Then one loopback Postgres test, gated on an explicit test URL, in a schema that has the `ohlcv_bars` DDL from migration 002 plus migration 135. Seed an equity with 100 zero-volume rows and a handful of adjusted rows, a crypto symbol, and a live bar for today. After the run: zeros in the window are repaired, adjusted rows are raw, crypto rows are unchanged, today's bar is unchanged. A second run changes nothing. A truncate reopens `done`.

Operator proof, in order, still with no change to Render services and with the kill switch off until the canary:

1. `--audit`. Record the equity count, any enabled asset type that is not `equity` and not `crypto` or `forex`, per-symbol bar counts and the zero band, off-midnight row count, and database size.
2. Apply migration 135 by hand in Neon. The app does not run migrations on boot.
3. Canary at night, `--symbols=SPY,AAPL,NVDA`. Each symbol's window has on the order of 5,000 rows, every `ts` is UTC midnight, a date inside the old zero band has a positive volume, and the stored close matches AV `'4. close'` rather than `'5. adjusted close'`. NVDA around the 2024-06-10 split still shows the raw gap in `ohlcv_bars`, and `equity_corporate_actions` has the split row. `splitAdjustStoredBars` on that window removes the gap.
4. Run the canary again. Three AV calls, zero row changes.
5. Kill the process for one symbol after the fetch log line. That symbol's row count is unchanged and it has no `done` row. Run it again and it completes.
6. Across the next worker after-close refresh, the canary rows at or before `written_through` keep the same close and volume.
7. Full run inside the night window. Limiter logs for `equity-daily-history` stay at or under the reserve. No jarvis fallback line. No new user-lane denials.
8. Post-run audit. Equity zero-volume rows inside the window equal the sum of `provider_zero_volume`. `done + no_data + failed` equals the universe. Table size is inside the 0.35 GB budget. The bulk scanner's discontinuity list is the names whose actions failed to load, not the names that split.

## 5. Open questions for Brad

1. Confirm raw storage, with split adjustment on the six indicator reads in the same change, and with `getBars` no longer persisting daily-family rows. That is the decision PR #59 left open.
2. Neon headroom. The table grows by about 0.3–0.35 GB plus WAL. The business plan lists the free tier. `--audit` prints the live database size before a run. If that plus 0.35 GB exceeds the plan, the load waits.
3. The scanner predicate is `asset_type = 'equity'`. The worker also ingests other non-crypto types, and `label-outcomes.ts` treats `equities`, `stock`, and `etf` as equity. If any enabled scanner name is stored under those tags, this job leaves it on the 100-bar raw tail. Widen the predicate, or leave it?
4. Twenty calendar years, or the full AV history (back to about Nov 1999, roughly a third more rows, same number of AV calls)?
5. If `--audit` finds daily rows whose `ts` is not UTC midnight, leave them or delete them in a separate one-off? This job only reports them.
6. Disabled and delisted symbols are not loaded, so the survivorship bias the scanner audit already describes stays. A later campaign can add them. Is the enabled universe the whole ask?
7. UPE's 20-bar average and `/api/bars` charts are outside the split-adjust list. UPE's relative-volume block will move when zeros become real volume. Should either of those call `splitAdjustStoredBars` in this change?
8. Is the night-and-weekend window acceptable, given a clean pass is about 15–35 minutes?

## Shape

One module, `lib/history/equityDailyBackfill.ts`. The script sets the process role and calls in. The module is not re-exported from a barrel. `splitAdjustStoredBars` lives next to `parseAlphaVantageDailyBars` and is the function the six readers import. The backfill module does not export its SQL.

Public surface:

- `runEquityHistoryBackfill(input) → BackfillReport`
- `auditEquityHistory(nowMs) → EquityHistoryAudit`
- `splitAdjustStoredBars(bars, actions) → Bar[]`
- `recordCorporateActions(symbol, payload) → void` (worker, after a full download)
- `avTakeToken` grows an optional `allowFallback` flag, defaulting to the current fallback

`EquitySymbol` is produced only by the universe query. `SessionTs` is `` `${YYYY-MM-DD}T00:00:00.000Z` ``. `RawDailyBar` is positive finite OHLC with low ≤ min(open, close), high ≥ max(open, close), and an integer volume ≥ 0. The write window's `through` is before the last completed session. There is no timeframe argument on the writer. The SQL literal is `'daily'`.

The worker's equity parse and `upsertBars` stay. Crypto stays on `upsertBars`. `getBars`, `onDemandFetch`, and `/api/bars` are not given a second write path.

## Tradeoffs

- Indicator readers and labellers see different closes once a split is in the window. Indicators see the split-adjusted series. Labellers see raw, because the entry price is raw. A chart served by `/api/bars` still shows the raw gap until that route is added to the call list (question 7).
- `getBars` no longer warms daily rows in Postgres. Universe symbols stay warm through the worker. A symbol outside the universe goes back to Alpha Vantage on the next cache miss, behind Redis.
- The corporate-action table is a second store. It stays aligned because the only writers are this campaign and the worker's existing full download. A split that lands when the worker fails its daily refresh is missing until the next successful full fetch, and `detectPriceDiscontinuity` still fires for that name.
- The script is operator-started. A symbol enabled later stays on the 100-bar tail until the script runs again.
- `allowFallback: false` stops the script on a Redis blip. The run is resumable, so stopping is the failure mode. Every other AV caller keeps today's fallback.
- Two new tables. No new column on `ohlcv_bars`.

## Alternatives

- Store split-adjusted OHLC and switch the worker per symbol once a progress row exists. A rollback or a raw tail written after the marker commits mixes bases on the symbols where a split matters. The ingest process would also rewrite the full series on the next split, which is the heap PR #343 emptied. Rejected.
- Store `'5. adjusted close'` and scale OHLC, matching `avFetchDailyBars`. Every ex-dividend rewrites history, and the result disagrees with the daily scan. PR #107 already refused to put that series in this table. Rejected.
- Raw storage with no reader-side adjustment. The load is safe and the volume repair stands, and the bulk scanner nulls EMA200 for every name with a split inside 400 days. That fails the reason for a 20-year series. Rejected as the whole design. The adjustment calls are in this change.
- Derive progress from `MAX(ts)` or a bar count. A crash after the oldest chunk looks finished, and a young listing never completes. Rejected.
- Put the job in the ingest loop, or extend `scripts/backfill-equities.ts`. The loop is the scheduled lane and the 512 MB heap. The midpoint script bypasses `avLimiter`. Rejected.
- Call `touchJarvisHeartbeat` so the backfill floor is reserved. That reservation is what cuts the user lane from 200 to 80. Rejected.
- `ON CONFLICT DO NOTHING`. Existing zero-volume rows would stay zero. Rejected.
- Call `cleanup_old_bars` after the load. The default keeps 500 bars. Rejected.

## Next implementation step

The first code change is the pure core and its tests, with no I/O: `SessionTs`, the write window, the NY gate, the raw parser, `splitAdjustStoredBars`, and the volume-repair planner, using the `4149575` fixture and an NVDA 2024-06 split window. The script, migration 135, the limiter flag, and the `getBars` write removal come after those tests pass. The canary stays behind `EQUITY_DAILY_BACKFILL=1`.
