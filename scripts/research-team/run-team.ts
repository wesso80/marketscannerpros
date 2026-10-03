/**
 * Private research team: Scanner -> Validator -> Skeptic -> Reporter.
 *
 * Reads a local scan export, runs four Grok calls in sequence, and writes a
 * Markdown memo to msp-research/reports/. Internal only: never wired into the
 * app, user alerts, or any order path. Grok only ever sees the file contents
 * this script passes it — no DB credentials, no network tools.
 *
 * Usage:
 *   npm run research:team -- msp-research/inbox/scan-2026-10-02.csv
 *
 * Env (shell or .env.local):
 *   XAI_API_KEY   required
 *   XAI_MODEL     optional, default grok-4.7
 */
import { config } from "dotenv";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });
config();

const ROOT = path.resolve("msp-research");
const INBOX = path.join(ROOT, "inbox");
const WORK = path.join(ROOT, "work");
const REPORTS = path.join(ROOT, "reports");

const API_URL = "https://api.x.ai/v1/responses";
const MODEL = process.env.XAI_MODEL || "grok-4.7";
const MAX_STALE_ROWS = 5;
const DISCLAIMER = "Private research. Not advice. No orders.";

const BASE_RULES = `You are one stage of a private research pipeline for MarketScanner Pros.
Use ONLY data present in the input you are given. Never invent prices, indicators, scores, or statistics.
Never write trade instructions (buy, sell, entry, target, position size, order). Output only the requested file content, no preamble.`;

const STAGES = [
  {
    name: "Scanner",
    out: "shortlist.csv",
    prompt: `Input is a CSV that code has already filtered (stale/invalidated rows removed) and sorted, with ties broken.
Output the header plus the first 20 rows exactly as given. Do NOT reorder, drop, or edit any row or value.
Quality "not_stored" means that source has no quality field; its evidence_quality_score already reflects it.`,
  },
  {
    name: "Validator",
    out: "evidence.md",
    prompt: `Input is a shortlist CSV. For each symbol write a Markdown section listing only evidence already in the row: score, score components, evidence_quality_score, direction, invalidation level, bar time, quality flag, sample_n, hit_rate, avg_favourable_move_pct.
Required fields are score, direction and bar time: mark a row missing any of these as "REJECT: missing <field>".
If invalidation level or score components are blank, do NOT reject: write "invalidation: missing" (or "score components: missing") as evidence.`,
  },
  {
    name: "Skeptic",
    out: "skeptic.md",
    prompt: `Input is evidence.md. Reject a symbol ONLY if it is marked REJECT or makes a claim not supported by that file.
A missing invalidation level is NOT a reason to reject: accept it, note "no invalidation level stored" as a risk, and treat confidence as low.
Thin sample size is NOT a reason to reject: accept the symbol and attach a risk note instead.
Paper check: you may only copy sample_n, hit_rate and avg_favourable_move_pct from the evidence; never compute or judge them yourself.
If sample_n is under 30 or hit_rate is blank, write "no paper check (sample_n=<value>)" as a risk note.
For every accepted symbol, add a "Risk notes:" line covering thin sample size and anything that would not survive a paper check.
Output two Markdown sections exactly titled "## Accepted" (keep all evidence fields and risk notes) and "## Rejected" (one-line reason each).`,
  },
  {
    name: "Reporter",
    out: "", // set at runtime
    prompt: `Input is the Skeptic's accepted and rejected lists. Write a Markdown research memo containing only:
- date and source file name (given below)
- ranked list of accepted symbols; for each symbol, these fields in this order:
  - Opportunity Score: the export's score, copied exactly
  - Evidence Quality Score: the evidence_quality_score value, copied exactly
  - Personal Exposure: "Flag: not available (no position data in export)" unless exposure data is present
  - Confidence: one sentence, never stronger than the evidence supports; say "low" when sample is thin or fields are missing
  - What confirms: only conditions derivable from the given fields (direction, score components); no new prices or levels
  - What invalidates: the invalidation level copied exactly, or "missing" if absent
  - Main risk: from the Skeptic's risk notes
  - Paper check: sample_n, hit_rate and avg_favourable_move_pct copied exactly, or "no paper check (sample_n=<value>)"
  - Evidence: bullets of score components, direction, bar time
- rejected symbols and the reason
Use uncertainty-aware wording. Never deterministic language. No trade instructions.
End with the exact line: "${DISCLAIMER}"`,
  },
] as const;

function fail(msg: string): never {
  console.error(`STOP: ${msg}`);
  process.exit(1);
}

const usage = { input: 0, output: 0 };

async function callGrok(system: string, user: string): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) fail("XAI_API_KEY is not set (shell or .env.local).");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) fail(`xAI API ${res.status}: ${await res.text()}`);

  const data: any = await res.json();
  usage.input += data.usage?.input_tokens ?? 0;
  usage.output += data.usage?.output_tokens ?? 0;
  const text: string =
    data.output_text ??
    (data.output ?? [])
      .flatMap((o: any) => o.content ?? [])
      .filter((c: any) => c.type === "output_text" || c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
  if (!text?.trim()) fail("Empty response from model.");
  return text.replace(/^```[a-z]*\n?|\n?```$/g, "").trim();
}

function parseCsv(raw: string) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((l) => l.split(","));
  return { header, rows };
}

/**
 * Evidence Quality Score (0-100), computed here so the model never invents it.
 * Weighted: invalidation and history count most, because a score with no stop
 * and no sample is not the same kind of evidence as one with both.
 * Capped at 60 without invalidation and at 50 without a sample/history column.
 */
const EQ_WEIGHTS = { score: 15, direction: 10, barTime: 10, quality: 10, invalidation: 25, component: 10, history: 20 };

/** Tie-break order for sources: richest evidence first. */
const SOURCE_RANK = (src: string) => (src.startsWith("edge_ledger") ? 0 : src.startsWith("scanner") ? 1 : 2);

type Prepared = { enriched: string; reviewed: string; excluded: Record<string, number> };

function prepareRows(header: string[], rows: string[][]): Prepared {
  const MISSING = new Set(["", "not_stored"]);
  const val = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const has = (r: string[], i: number) => i >= 0 && !MISSING.has(val(r, i).toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));

  const col = {
    score: idx(["score"]),
    direction: idx(["direction"]),
    barTime: idx(["bar_time", "bartime", "timestamp"]),
    quality: idx(["quality", "quality_flag"]),
    invalidation: idx(["invalidation", "invalidation_level"]),
    stale: idx(["stale", "is_stale"]),
    source: idx(["source"]),
    symbol: idx(["symbol"]),
  };
  const componentIdx = header.map((h, i) => (h.startsWith("score_") ? i : -1)).filter((i) => i >= 0);
  const historyIdx = header.findIndex((h) => /sample|history|win_rate|signal_count|n_obs/.test(h));
  const MIN_SAMPLE = 30; // must match export-scan.ts

  const eqs = (r: string[]) => {
    let s = 0;
    if (has(r, col.score)) s += EQ_WEIGHTS.score;
    if (has(r, col.direction)) s += EQ_WEIGHTS.direction;
    if (has(r, col.barTime)) s += EQ_WEIGHTS.barTime;
    if (has(r, col.quality)) s += EQ_WEIGHTS.quality;
    if (has(r, col.invalidation)) s += EQ_WEIGHTS.invalidation;
    if (componentIdx.some((i) => has(r, i))) s += EQ_WEIGHTS.component;
    // History only counts when there are enough resolved outcomes to mean something
    const hasHistory = header[historyIdx] === "sample_n" ? Number(val(r, historyIdx)) >= MIN_SAMPLE : has(r, historyIdx);
    if (hasHistory) s += EQ_WEIGHTS.history;
    if (!has(r, col.invalidation)) s = Math.min(s, 60);
    if (!hasHistory) s = Math.min(s, 50);
    return s;
  };

  const scored = rows.map((r) => ({ r, q: eqs(r) }));
  const enriched = [[...header, "evidence_quality_score"].join(","), ...scored.map(({ r, q }) => [...r, q].join(","))].join("\n");

  // Exclusions happen in code so they can be counted, not mixed into the Skeptic's rejections
  const excluded: Record<string, number> = { stale: 0, "blank quality": 0, invalidated: 0 };
  const kept = scored.filter(({ r }) => {
    if (/^(true|1|yes|stale)$/i.test(val(r, col.stale))) return excluded.stale++, false;
    if (val(r, col.quality) === "") return excluded["blank quality"]++, false;
    if (val(r, col.quality).toLowerCase() === "invalidated") return excluded.invalidated++, false;
    return true;
  });

  // Ties broken in code: score, evidence quality, newer bar, source rank, symbol
  kept.sort(
    (a, b) =>
      Number(val(b.r, col.score) || -1) - Number(val(a.r, col.score) || -1) ||
      b.q - a.q ||
      (Date.parse(val(b.r, col.barTime)) || 0) - (Date.parse(val(a.r, col.barTime)) || 0) ||
      SOURCE_RANK(val(a.r, col.source)) - SOURCE_RANK(val(b.r, col.source)) ||
      val(a.r, col.symbol).localeCompare(val(b.r, col.symbol)),
  );
  const reviewed = [[...header, "evidence_quality_score"].join(","), ...kept.map(({ r, q }) => [...r, q].join(","))].join("\n");
  return { enriched, reviewed, excluded };
}

async function latestInboxFile(): Promise<string> {
  const files = (await readdir(INBOX)).filter((f) => /\.(csv|json)$/i.test(f));
  if (!files.length) fail(`No export found in ${INBOX}`);
  const withTime = await Promise.all(
    files.map(async (f) => ({ f, t: (await stat(path.join(INBOX, f))).mtimeMs })),
  );
  return path.join(INBOX, withTime.sort((a, b) => b.t - a.t)[0].f);
}

/** Every number in the report must exist in the source export (ranks/dates excepted). */
function findInventedNumbers(report: string, source: string): string[] {
  const NUM = /(?<![\d.])-?\d+(?:\.\d+)?/g; // "-" only counts as a sign when not between digits
  const stripDates = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g, " ");
  const allowed = new Set(source.match(NUM) ?? []);
  const found = stripDates(report).match(NUM) ?? [];
  return [...new Set(found)].filter((n) => {
    if (allowed.has(n)) return false;
    const v = Number(n);
    if (Number.isInteger(v) && v >= 0 && v <= 50) return false; // ranks, list numbering
    if (/^\d{4}$/.test(n) || /^\d{2}$/.test(n)) return false; // date parts
    return true;
  });
}

async function main() {
  const inputArg = process.argv[2];
  const inputPath = inputArg ? path.resolve(inputArg) : await latestInboxFile();
  const rawSource = await readFile(inputPath, "utf8");
  const sourceName = path.basename(inputPath);
  const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD

  // Stop conditions on the raw export
  const { header, rows } = parseCsv(rawSource);
  if (!rows.length) fail(`Export is empty: ${sourceName}`);
  const staleIdx = header.findIndex((h) => h === "stale" || h === "is_stale");
  if (staleIdx >= 0) {
    const stale = rows.filter((r) => /^(true|1|yes|stale)$/i.test((r[staleIdx] ?? "").trim())).length;
    // "More than a handful": over MAX_STALE_ROWS and over 25% of the export
    if (stale > Math.max(MAX_STALE_ROWS, rows.length * 0.25))
      fail(`${stale} of ${rows.length} rows are stale. Re-export fresh data.`);
  }

  await mkdir(WORK, { recursive: true });
  await mkdir(REPORTS, { recursive: true });

  const { enriched: source, reviewed, excluded } = prepareRows(header, rows);
  await writeFile(path.join(WORK, "enriched.csv"), source);
  await writeFile(path.join(WORK, "reviewed.csv"), reviewed);
  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0);

  console.log(`Source: ${sourceName} (${rows.length} rows) · model ${MODEL}`);

  let input = reviewed;
  for (const stage of STAGES) {
    const outPath =
      stage.name === "Reporter"
        ? path.join(REPORTS, `${today}-research.md`)
        : path.join(WORK, stage.out);
    const extra = stage.name === "Reporter" ? `\n\nDate: ${today}\nSource file: ${sourceName}` : "";

    process.stdout.write(`→ ${stage.name}... `);
    const output = await callGrok(`${BASE_RULES}\n\n${stage.prompt}${extra}`, input);
    if (!output.trim()) fail(`${stage.name} produced no output.`);

    if (stage.name === "Reporter") {
      if (/\b(buy|sell|short|go long|entry|take profit|stop loss|position size|place (an )?order)\b/i.test(output)) {
        await writeFile(path.join(WORK, "rejected-report.md"), output);
        fail("Reporter added a trade instruction. Saved to work/rejected-report.md; fix the prompt and rerun.");
      }
      const invented = findInventedNumbers(output, source);
      if (invented.length) {
        await writeFile(path.join(WORK, "rejected-report.md"), output);
        fail(`Report contains numbers not in the export: ${invented.join(", ")}. Saved to work/rejected-report.md.`);
      }
    }

    let final = output;
    if (stage.name === "Reporter") {
      // Added by code after the checks, so counts are exact and the disclaimer always ends the memo
      const breakdown = Object.entries(excluded).filter(([, n]) => n).map(([k, n]) => `- ${k}: ${n}`).join("\n");
      final =
        `${output.replace(DISCLAIMER, "").trimEnd()}\n\n## Excluded before review\n\n` +
        `${excludedTotal} of ${rows.length} exported rows were excluded by code before the bots saw them.` +
        `${breakdown ? `\n\n${breakdown}` : ""}\n\n${DISCLAIMER}\n`;
    }
    await writeFile(outPath, final);
    console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
    input = final;
  }

  console.log(`Tokens: ${usage.input} in / ${usage.output} out (incl. reasoning) — see console.x.ai for billed cost`);
  console.log("Done. Read the memo before you use it.");
}

main().catch((err) => fail(err?.message ?? String(err)));
