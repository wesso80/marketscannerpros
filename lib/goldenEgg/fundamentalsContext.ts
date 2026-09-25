/**
 * Fundamentals presentation rules — period basis, transparent valuation wording, earnings-calendar parsing.
 * Never says "overvalued"/"undervalued"; describes the multiple and the rule that produced the label.
 */

import { parseAlphaVantageEarningsCalendar, type EarningsCalendarRow } from '../earningsCalendarCsv';

export interface MultipleRead {
  label: 'Premium multiple' | 'Elevated multiple' | 'Moderate multiple' | 'Low multiple' | 'Multiple unavailable';
  detail: string;
  rule: string;
}

export function describeMultiple(pe: number | null, forwardPe: number | null, peg: number | null): MultipleRead {
  const rule = 'Rule: trailing P/E > 50 premium · 25–50 elevated · 12–25 moderate · < 12 low; forward P/E and PEG shown alongside, not folded into the label.';
  if (pe == null || !Number.isFinite(pe) || pe <= 0) {
    return { label: 'Multiple unavailable', detail: pe != null && pe <= 0 ? 'Negative or zero trailing earnings — P/E not meaningful.' : 'Trailing P/E not reported.', rule };
  }
  const parts = [`trailing P/E ${pe.toFixed(1)}`];
  if (forwardPe != null && Number.isFinite(forwardPe) && forwardPe > 0) parts.push(`forward P/E ${forwardPe.toFixed(1)}`);
  if (peg != null && Number.isFinite(peg) && peg > 0) parts.push(`PEG ${peg.toFixed(2)}`);
  const context = peg != null && peg > 0 && peg < 1
    ? ' PEG below 1 indicates the multiple is low relative to reported growth.'
    : forwardPe != null && pe > 0 && forwardPe > 0 && forwardPe < pe * 0.85
      ? ' Forward P/E is materially below trailing — earnings are expected to grow into the multiple.'
      : '';
  const detail = `${parts.join(' · ')}.${context}`;
  if (pe > 50) return { label: 'Premium multiple', detail, rule };
  if (pe > 25) return { label: 'Elevated multiple', detail, rule };
  if (pe >= 12) return { label: 'Moderate multiple', detail, rule };
  return { label: 'Low multiple', detail, rule };
}

export interface PeriodLabels {
  latestQuarter: string | null;
  fiscalYearEnd: string | null;
  basis: Array<{ metric: string; period: string }>;
  summary: string;
}

/** Alpha Vantage OVERVIEW field bases (documented): TTM for revenue/margins/EPS; latest quarter YoY for growth. */
export function periodLabels(overview: { LatestQuarter?: string | null; FiscalYearEnd?: string | null } | null | undefined): PeriodLabels {
  const latestQuarter = overview?.LatestQuarter && /^\d{4}-\d{2}-\d{2}$/.test(overview.LatestQuarter) ? overview.LatestQuarter : null;
  const fiscalYearEnd = overview?.FiscalYearEnd || null;
  const basis = [
    { metric: 'Revenue, gross profit, EPS, margins, ROE/ROA', period: 'Trailing twelve months (TTM)' },
    { metric: 'Revenue growth, earnings growth', period: `Latest reported quarter${latestQuarter ? ` (${latestQuarter})` : ''} vs same quarter a year earlier (YoY)` },
    { metric: 'P/E (trailing)', period: 'Price ÷ TTM EPS' },
    { metric: 'Forward P/E, PEG, analyst target', period: 'Consensus estimates (provider-supplied)' },
  ];
  const summary = latestQuarter
    ? `Latest reported quarter ${latestQuarter}${fiscalYearEnd ? ` · fiscal year ends ${fiscalYearEnd}` : ''}. Revenue/EPS/margins are TTM; growth rates are latest-quarter YoY.`
    : 'Reporting period not supplied by provider. Revenue/EPS/margins are TTM; growth rates are latest-quarter YoY.';
  return { latestQuarter, fiscalYearEnd, basis, summary };
}

export type { EarningsCalendarRow } from '../earningsCalendarCsv';

/** Parse Alpha Vantage EARNINGS_CALENDAR CSV (symbol,name,reportDate,fiscalDateEnding,estimate,currency).
 *  Quote-aware (names like "FLAGSTAR BANK, N.A." keep their date); rows with an unreadable date are skipped and logged.
 *  Use `parseAlphaVantageEarningsCalendar` when you need to know whether any rows were skipped. */
export function parseEarningsCalendarCsv(csv: string): EarningsCalendarRow[] {
  return parseAlphaVantageEarningsCalendar(csv, { source: 'golden-egg' }).rows;
}

export function nextEarningsFromCalendar(rows: EarningsCalendarRow[], symbol: string, nowMs = Date.now()): EarningsCalendarRow | null {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const mine = rows.filter((r) => r.symbol === symbol.toUpperCase() && r.reportDate >= today).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  return mine[0] ?? null;
}

export function daysUntil(dateIso: string | null | undefined, nowMs = Date.now()): number | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}/.test(dateIso)) return null;
  const d = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d)) return null;
  return Math.round((d - Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate())) / 86_400_000);
}

/** Growth direction wording that can never flip a negative number positive. */
export function growthPhrase(metric: string, yoy: number | null): string | null {
  if (yoy == null || !Number.isFinite(yoy)) return null;
  const pct = yoy * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${metric} ${sign}${Math.abs(pct).toFixed(1)}% YoY (latest quarter)`;
}
