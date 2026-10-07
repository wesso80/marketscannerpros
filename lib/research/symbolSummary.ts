import type { SymbolNews } from '@/lib/research/newsEvidence';
import type { PublicSymbolPacket } from '@/lib/research/publicSymbolPacket';
import type { ResearchSnapshot } from '@/lib/research/researchSnapshot';
import type { EvidenceSummary } from '@/lib/research/evidenceSummary';

/** Symbol AI summary (W3 Option 2): contract, evidence sections, model input and output check. See app/api/deep-analysis. */
export const PUBLIC_DEEP_ANALYSIS_CONTRACT = 'public-symbol-summary-v1' as const;

export interface SymbolSummarySections {
  /** Factual sentences from the research snapshot. */
  summary: string[];
  /** Observations grouped by input. */
  evidence: Array<{ input: string; observations: string[] }>;
  differences: string[];
  missing: string[];
  events: string[];
  recheck: string[];
}

export function sectionsFrom(snapshot: ResearchSnapshot, ev: EvidenceSummary, news: SymbolNews): SymbolSummarySections {
  const events = news.status === 'available'
    ? news.events.slice(0, 5).map((e) => `${e.headline} (${e.articles} article${e.articles === 1 ? '' : 's'}; ${e.catalyst.toLowerCase().replace('_', ' ')}; first ${e.firstPublishedAt?.slice(0, 10) ?? 'date not recorded'})`)
    : [news.headline];
  if (snapshot.nextEvent) events.push(`Next known event: ${snapshot.nextEvent}`);
  return {
    summary: snapshot.summary,
    evidence: ev.groups.map((g) => ({ input: g.label, observations: g.observations })),
    differences: ev.differences, missing: ev.missing, events, recheck: ev.recheck,
  };
}

/** The model's input: the evidence sections only, plus the dates behind them. */
export function buildSummaryPrompt(symbol: string, p: PublicSymbolPacket, snapshot: ResearchSnapshot, s: SymbolSummarySections, independenceNote: string): string {
  const L: string[] = [`SYMBOL: ${symbol} (${p.meta.assetClass}, ${p.meta.timeframe})`];
  L.push('DATES:');
  for (const d of snapshot.dates) L.push(`- ${d.label}: ${d.value ?? 'not recorded'} (${d.basis})`);
  L.push('SUMMARY:'); for (const x of s.summary) L.push(`- ${x}`);
  L.push(`OBSERVATIONS BY INPUT (${independenceNote}):`);
  for (const g of s.evidence) { L.push(`- ${g.input}:`); for (const o of g.observations) L.push(`  - ${o}`); }
  if (p.canonical?.fundamentals) {
    const f = p.canonical.fundamentals;
    L.push(`COMPANY (reporting period ${f.lastReportedQuarter ?? 'not recorded'}): ${f.name ?? symbol}, ${f.sector ?? 'sector n/a'}; revenue growth ${f.revenueGrowthYoy != null ? (f.revenueGrowthYoy * 100).toFixed(1) + '%' : 'n/a'} and earnings growth ${f.earningsGrowthYoy != null ? (f.earningsGrowthYoy * 100).toFixed(1) + '%' : 'n/a'} year on year; profit margin ${f.profitMargin != null ? (f.profitMargin * 100).toFixed(1) + '%' : 'n/a'}; ${f.multipleLabel || 'valuation multiple n/a'}.`);
  }
  L.push('NEWS AND EVENTS (each event once, however many articles):'); for (const e of s.events) L.push(`- ${e}`);
  L.push('WHERE METHODS OR DATES DIFFER:'); for (const d of s.differences.length ? s.differences : ['none recorded']) L.push(`- ${d}`);
  L.push('MISSING OR PARTIAL:'); for (const m of s.missing.length ? s.missing : ['nothing recorded as missing']) L.push(`- ${m}`);
  L.push('CHECK AGAIN WHEN NEW DATA ARRIVES:'); for (const r of s.recheck.length ? s.recheck : ['no scheduled update recorded']) L.push(`- ${r}`);
  return L.join('\n');
}

export const SUMMARY_SYSTEM = `You write a short educational research summary for one market symbol from the evidence you are given.

RULES
- Describe the evidence only. Use only the facts and numbers in the input; if something is not there, say it is not available.
- Do not forecast, predict or recommend. No buy, sell, hold, entry, exit, target, stop, position size or "traders should". No probabilities, win rates, scores, grades or ratings, and do not invent any.
- Keep each observation's date or basis when you use it. Several readings of the same input are one source of evidence, not separate confirmations.
- Say plainly what is missing or uncertain.

OUTPUT: plain text, at most 220 words, with exactly these headings in this order:
WHAT THE EVIDENCE SHOWS
WHAT DIFFERS OR IS MISSING
WHAT TO CHECK AGAIN
Use short "- " bullet lines under each heading.`;

/** Lines that forecast, recommend or score are removed rather than trusted. */
const FORBIDDEN = /\b(high probability|probabilit|likely to|will (rally|rise|fall|break|go)|should (break|rise|fall|rally|move|buy|sell)|expected to (rise|fall|rally|break)|strong chance|win rate|buy|sell|hold|accumulate|entry|stop[- ]loss|price target|target price|position size|traders should|investors should|we recommend|bullish|bearish|grade [a-f]\b|\d+\s*\/\s*100)/i;
export function sanitizeSummary(text: string | null): { text: string | null; removedLines: number } {
  if (!text) return { text: null, removedLines: 0 };
  const lines = text.split('\n');
  const kept = lines.filter((l) => !FORBIDDEN.test(l));
  return { text: kept.join('\n').trim() || null, removedLines: lines.length - kept.length };
}

