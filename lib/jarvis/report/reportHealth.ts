/**
 * Deterministic delivery health gate. Decides NORMAL / DEGRADED / FAILED from the persisted run only.
 */
import type { MorningReport } from '../radar/types';
import type { HealthCheck, ReportHealth } from './types';
import { MIN_REQUIRED_SECTIONS } from './types';

export const STAGE2_MIN_COVERAGE_PCT = 95;

/** Stage-2 counts: prefer explicit counters; fall back to the provider detail line from older runs. */
export function stage2Coverage(report: MorningReport | null): { selected: number | null; live: number | null; fallback: number | null; missing: number | null; pct: number | null } {
  if (!report) return { selected: null, live: null, fallback: null, missing: null, pct: null };
  const c = report.counts as MorningReport['counts'] & { stage2Selected?: number; stage2Live?: number; stage2Fallback?: number; stage2Missing?: number };
  if (typeof c.stage2Selected === 'number' && typeof c.stage2Live === 'number') {
    const usable = c.stage2Live + (c.stage2Fallback ?? 0);
    return { selected: c.stage2Selected, live: c.stage2Live, fallback: c.stage2Fallback ?? 0, missing: c.stage2Missing ?? Math.max(0, c.stage2Selected - usable), pct: c.stage2Selected ? Math.round((usable / c.stage2Selected) * 1000) / 10 : null };
  }
  const p = report.providers.find((x) => /TIME_SERIES_DAILY_ADJUSTED/.test(x.name));
  const m = p?.detail.match(/(\d+) series live, (\d+) DB fallback[^,]*, (\d+) unavailable/);
  if (m) { const live = +m[1], fb = +m[2], miss = +m[3]; const sel = live + fb + miss; return { selected: sel, live, fallback: fb, missing: miss, pct: sel ? Math.round(((live + fb) / sel) * 1000) / 10 : null }; }
  return { selected: null, live: null, fallback: null, missing: null, pct: null };
}

export function evaluateHealth(report: MorningReport | null, opts: { runtimeMs: number; apiErrors: number }): ReportHealth {
  const checks: HealthCheck[] = [];
  const failed: string[] = [];
  if (!report) {
    return { status: 'FAILED', checks: [{ name: 'run payload', ok: false, detail: 'persisted run payload missing or unreadable', fatal: true }], stage2CoveragePct: null, failedProviders: [], shortlistMayBeIncomplete: true, summary: 'Run payload unreadable — no market report can be produced.' };
  }
  const readable = Array.isArray(report.shortlist) && !!report.counts && !!report.rotation && !!report.thirtySeconds && Array.isArray(report.providers);
  checks.push({ name: 'run payload readable', ok: readable, detail: readable ? 'shortlist, counts, rotation, 30-second summary present' : 'core fields missing', fatal: true });
  if (!readable) {
    return { status: 'FAILED', checks, stage2CoveragePct: null, failedProviders: [], shortlistMayBeIncomplete: true, summary: 'Run payload is missing core fields — no market report can be produced.' };
  }

  const cov = stage2Coverage(report);
  const covOk = cov.pct !== null && cov.pct >= STAGE2_MIN_COVERAGE_PCT;
  checks.push({ name: `Stage 2 coverage ≥ ${STAGE2_MIN_COVERAGE_PCT}%`, ok: covOk, detail: cov.pct === null ? 'coverage unknown (no Stage 2 counters)' : `${cov.pct}% (${cov.live} live + ${cov.fallback} fallback of ${cov.selected}; ${cov.missing} missing)`, fatal: false });

  for (const p of report.providers) {
    const bad = /^(DEGRADED|EMPTY|FAILED|DOWN)$/i.test(p.status);
    const critical = /Stage 1|Stage 2|CoinGecko/.test(p.name);
    if (bad) failed.push(`${p.name}: ${p.status}`);
    if (bad && critical) checks.push({ name: `provider ${p.name}`, ok: false, detail: `${p.status} — ${p.detail}`, fatal: false });
  }
  const stage1Ok = report.counts.stage1Quoted > 1000 || report.providers.some((p) => /Stage 1/.test(p.name) && p.status === 'SKIPPED');
  checks.push({ name: 'Stage 1 bulk screen', ok: stage1Ok, detail: `${report.counts.stage1Listed} listed → ${report.counts.stage1Quoted} quoted → ${report.counts.stage1Liquid} liquid`, fatal: false });
  const cryptoOk = report.counts.crypto >= 50;
  checks.push({ name: 'crypto universe present', ok: cryptoOk, detail: `${report.counts.crypto} coins with history`, fatal: false });
  const shortlistOk = report.counts.deepDives > 0 && report.shortlist.length > 0;
  checks.push({ name: 'shortlist / deep dive completed', ok: shortlistOk, detail: `${report.counts.deepDives} deep dives → ${report.shortlist.length} finalists`, fatal: false });
  const sections = MIN_REQUIRED_SECTIONS.filter((s) => {
    switch (s) {
      case 'marketIn30Seconds': return !!report.thirtySeconds?.whatMoved;
      case 'whatMoved': return !!report.whatMoved?.equities?.length;
      case 'candidates': return Array.isArray(report.shortlist);
      case 'whatMayMoveNext': return Array.isArray(report.settingUp);
      case 'lifecycle': return !!report.lifecycle;
      case 'themes': return Array.isArray(report.themes);
      case 'rejected': return Array.isArray(report.rejected);
      case 'lookAtFirst': return Array.isArray(report.watchToday);
      case 'dataHealth': return Array.isArray(report.providers) && !!report.apiUsage;
      default: return true;
    }
  });
  const sectionsOk = sections.length === MIN_REQUIRED_SECTIONS.length;
  checks.push({ name: 'minimum sections present', ok: sectionsOk, detail: `${sections.length}/${MIN_REQUIRED_SECTIONS.length}`, fatal: true });
  const errOk = opts.apiErrors <= 25;
  checks.push({ name: 'provider error count', ok: errOk, detail: `${opts.apiErrors} provider errors during run`, fatal: false });

  const fatal = checks.some((c) => c.fatal && !c.ok);
  const degraded = checks.some((c) => !c.ok);
  const status = fatal ? 'FAILED' : degraded ? 'DEGRADED' : 'NORMAL';
  const failing = checks.filter((c) => !c.ok).map((c) => c.name);
  const summary = status === 'NORMAL' ? `All ${checks.length} health checks passed; Stage 2 coverage ${cov.pct}%.` : `${status}: ${failing.join('; ')}. Runtime ${(opts.runtimeMs / 60000).toFixed(1)} min, ${opts.apiErrors} provider errors.`;
  return { status, checks, stage2CoveragePct: cov.pct, failedProviders: failed, shortlistMayBeIncomplete: !shortlistOk || !covOk, summary };
}
