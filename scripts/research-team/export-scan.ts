/**
 * Read-only export for the private research team.
 *
 * Pulls the last 24h from three sources into one CSV in msp-research/inbox/:
 *   - edge_ledger_setups  (admin workspace only — never other users' setups)
 *   - signals_fired
 *   - scanner_results_cache
 *
 * Runs inside a READ ONLY transaction with a read-only DB user. Prices for
 * entries/targets are deliberately excluded; only the stop level is exported,
 * as the invalidation level.
 *
 * Usage:
 *   npm run research:export
 *
 * Env (.env.local):
 *   RESEARCH_DATABASE_URL   read-only Postgres URL (required)
 *   ADMIN_WORKSPACE_ID      your workspace UUID (required for edge ledger rows)
 *   RESEARCH_LOOKBACK_HOURS optional, default 24
 */
import { config } from "dotenv";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

config({ path: ".env.local" });
config();

const INBOX = path.resolve("msp-research", "inbox");
const LOOKBACK_HOURS = Number(process.env.RESEARCH_LOOKBACK_HOURS || 24);
/** Below this many resolved outcomes, no hit rate is shown ("no paper check"). */
const MIN_SAMPLE = 30;
/** Outcome horizon used for each signal timeframe. */
const HORIZON_MINUTES: Record<string, number> = { "15m": 60, "1h": 240, "4h": 1440, daily: 1440, "1d": 1440 };

/** Hours after which a bar is stale, by timeframe. */
const STALE_HOURS: Record<string, number> = { "15m": 1, "1h": 4, "4h": 12, daily: 36, "1d": 36 };

const COLUMNS = [
  "source",
  "symbol",
  "asset_class",
  "timeframe",
  "score",
  "score_components",
  "direction",
  "bar_time",
  "quality",
  "stale",
  "invalidation",
  "ledger_confidence",
  "ledger_evidence_quality",
  "regime",
  "setup_type",
  "sample_n",
  "hit_rate",
  "avg_favourable_move_pct",
] as const;
type Row = Partial<Record<(typeof COLUMNS)[number], string | number | null | undefined>>;

function fail(msg: string): never {
  console.error(`STOP: ${msg}`);
  process.exit(1);
}

const clean = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).replace(/[,\r\n]+/g, ";").trim();

function normDirection(d: unknown): string {
  const s = clean(d).toLowerCase();
  if (["long", "bull", "bullish", "up", "buy"].includes(s)) return "bullish";
  if (["short", "bear", "bearish", "down", "sell"].includes(s)) return "bearish";
  return s;
}

function isStale(barTime: string, timeframe: string): boolean {
  const t = Date.parse(barTime);
  if (Number.isNaN(t)) return true;
  const limit = STALE_HOURS[timeframe.toLowerCase()] ?? 36;
  return Date.now() - t > limit * 3_600_000;
}

/** Walk arbitrary scanner JSON and return every object that has a symbol. */
function symbolObjects(node: unknown, out: Record<string, any>[] = []): Record<string, any>[] {
  if (Array.isArray(node)) node.forEach((n) => symbolObjects(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, any>;
    if (typeof o.symbol === "string" || typeof o.ticker === "string") out.push(o);
    else Object.values(o).forEach((v) => symbolObjects(v, out));
  }
  return out;
}

const pick = (o: Record<string, any>, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null);

async function main() {
  const url = process.env.RESEARCH_DATABASE_URL;
  if (!url) fail("RESEARCH_DATABASE_URL is not set in .env.local (use a read-only DB user).");
  const workspaceId = process.env.ADMIN_WORKSPACE_ID;

  const client = new Client({
    connectionString: url,
    ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false },
    statement_timeout: 30_000,
  });
  await client.connect();

  const rows: Row[] = [];
  const counts: Record<string, number | string> = {};
  try {
    await client.query("BEGIN READ ONLY");
    const since = `NOW() - make_interval(hours => $1)`;

    // 1. Edge ledger — admin workspace only
    if (workspaceId) {
      const { rows: r } = await client.query(
        `SELECT symbol, market, direction, opportunity_score, evidence_quality, confidence,
                stop_price, regime, setup_type, playbook, status, surfaced_at
           FROM edge_ledger_setups
          WHERE workspace_id = $2 AND surfaced_at > ${since}
          ORDER BY surfaced_at DESC`,
        [LOOKBACK_HOURS, workspaceId],
      );
      for (const s of r) {
        const barTime = new Date(s.surfaced_at).toISOString();
        rows.push({
          source: "edge_ledger",
          symbol: s.symbol,
          asset_class: s.market,
          timeframe: "daily",
          score: s.opportunity_score,
          score_components: s.playbook ? `playbook=${s.playbook}` : "",
          direction: normDirection(s.direction),
          bar_time: barTime,
          quality: s.status === "invalidated" ? "invalidated" : s.confidence,
          stale: String(s.status === "invalidated" || isStale(barTime, "daily")),
          invalidation: s.stop_price,
          ledger_confidence: s.confidence,
          ledger_evidence_quality: s.evidence_quality,
          regime: s.regime,
          setup_type: s.setup_type,
        });
      }
      counts.edge_ledger = r.length;
    } else {
      counts.edge_ledger = "skipped (ADMIN_WORKSPACE_ID not set)";
    }

    // 2. Signals fired
    {
      const { rows: r } = await client.query(
        `SELECT symbol, signal_type, direction, score, timeframe, signal_at, scanner_version
           FROM signals_fired
          WHERE signal_at > ${since}
          ORDER BY signal_at DESC`,
        [LOOKBACK_HOURS],
      );
      for (const s of r) {
        const barTime = new Date(s.signal_at).toISOString();
        rows.push({
          source: `signals:${s.signal_type}`,
          symbol: s.symbol,
          asset_class: "unknown", // signals_fired has no asset class; do not guess
          timeframe: s.timeframe,
          score: s.score,
          score_components: "", // signals_fired stores no score breakdown
          direction: normDirection(s.direction),
          bar_time: barTime,
          quality: "not_stored", // signals_fired has no quality field — explicit, not backfilled
          stale: String(isStale(barTime, s.timeframe)),
          invalidation: "",
          sample_n: 0,
          _key: `${s.symbol}|${s.signal_type}|${s.timeframe}|${normDirection(s.direction)}`,
        } as Row);
      }
      counts.signals_fired = r.length;

      // Paper check: past resolved outcomes for the same symbol + signal type + timeframe + direction.
      // Needs SELECT on signal_outcomes; without it the run continues with sample_n=0.
      await client.query("SAVEPOINT outcomes");
      try {
        const symbols = [...new Set(r.map((s) => s.symbol))];
        const { rows: o } = await client.query(
          `SELECT f.symbol, f.signal_type, f.timeframe, f.direction,
                  COUNT(*) FILTER (WHERE o.outcome IN ('correct','wrong','neutral'))::int AS n,
                  COUNT(*) FILTER (WHERE o.outcome = 'correct')::int AS c,
                  COUNT(*) FILTER (WHERE o.outcome = 'wrong')::int AS w,
                  AVG(CASE WHEN f.direction = 'bearish' THEN -o.pct_move ELSE o.pct_move END)
                    FILTER (WHERE o.outcome IN ('correct','wrong','neutral')) AS fav
             FROM signals_fired f
             JOIN signal_outcomes o ON o.signal_id = f.id
            WHERE f.symbol = ANY($1)
              AND o.horizon_minutes = CASE f.timeframe ${Object.entries(HORIZON_MINUTES)
                .map(([tf, m]) => `WHEN '${tf}' THEN ${m}`)
                .join(" ")} ELSE 1440 END
            GROUP BY 1, 2, 3, 4`,
          [symbols],
        );
        const stats = new Map(o.map((x) => [`${x.symbol}|${x.signal_type}|${x.timeframe}|${normDirection(x.direction)}`, x]));
        let withSample = 0;
        for (const row of rows as (Row & { _key?: string })[]) {
          const x = row._key ? stats.get(row._key) : undefined;
          if (!x) continue;
          row.sample_n = x.n;
          if (x.n >= MIN_SAMPLE) {
            withSample++;
            row.hit_rate = x.c + x.w ? ((100 * x.c) / (x.c + x.w)).toFixed(1) : "";
            row.avg_favourable_move_pct = x.fav === null ? "" : Number(x.fav).toFixed(2);
          }
        }
        counts.paper_check = `${withSample} rows with >= ${MIN_SAMPLE} resolved outcomes`;
        await client.query("RELEASE SAVEPOINT outcomes");
      } catch (err: any) {
        await client.query("ROLLBACK TO SAVEPOINT outcomes");
        counts.paper_check = `skipped (${err?.message ?? err})`;
      }
    }

    // 3. Scanner results cache
    {
      const { rows: r } = await client.query(
        `SELECT scanner_name, universe, timeframe, results, computed_at
           FROM scanner_results_cache
          WHERE computed_at > ${since}`,
        [LOOKBACK_HOURS],
      );
      let n = 0;
      for (const c of r) {
        const barTime = new Date(c.computed_at).toISOString();
        for (const o of symbolObjects(c.results)) {
          const parts = Object.entries(o)
            .filter(([k, v]) => /score/i.test(k) && k !== "score" && typeof v === "number")
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
          rows.push({
            source: `scanner:${c.scanner_name}`,
            symbol: pick(o, ["symbol", "ticker"]),
            asset_class: /crypto/i.test(c.universe) ? "crypto" : "equity",
            timeframe: c.timeframe,
            score: pick(o, ["score", "total_score", "confluence_score", "composite_score"]),
            score_components: parts,
            direction: normDirection(pick(o, ["direction", "bias", "signal", "side"])),
            bar_time: clean(pick(o, ["bar_time", "timestamp", "time"])) || barTime,
            quality: pick(o, ["quality", "quality_flag", "data_quality"]) ?? "not_stored",
            stale: String(isStale(barTime, c.timeframe)),
            invalidation: pick(o, ["invalidation", "invalidation_level", "stop", "stop_price"]),
          });
          n++;
        }
      }
      counts.scanner_results_cache = n;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }

  if (!rows.length) fail(`No rows in the last ${LOOKBACK_HOURS}h from any source. Nothing written.`);

  const csv = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => clean(r[c])).join(","))].join("\n");
  await mkdir(INBOX, { recursive: true });
  const outPath = path.join(INBOX, `scan-${new Date().toLocaleDateString("en-CA")}.csv`);
  await writeFile(outPath, csv + "\n");

  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`Wrote ${rows.length} rows → ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => fail(err?.message ?? String(err)));
