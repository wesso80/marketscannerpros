/**
 * Morning briefing email (short). Full detail lives on the archive page.
 * Inline styles match lib/email.ts branding (dark #0f172a, accent #10b981).
 */
import type { DailyReport } from './types';
import { BRAND, REPORT_TITLE, classifyCaveat } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const pct = (n: number | null) => (n === null ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
const lvl = (v: number | null) => (v === null ? 'n/a' : v >= 1 ? v.toFixed(2) : v.toPrecision(4));
const MUTED = '#94a3b8', TEXT = '#e2e8f0', ACCENT = '#10b981', CARD = '#0f172a', WARN = '#f59e0b';

export function emailSubject(r: DailyReport): string {
  return r.health.status === 'NORMAL' ? `${REPORT_TITLE} — ${fmtDate(r.sessionDate)}` : `⚠ ${BRAND} Data Health Warning — ${fmtDate(r.sessionDate)}`;
}

function section(title: string, body: string): string {
  return `<div style="background:${CARD};border-radius:10px;padding:14px 16px;margin-bottom:14px;"><div style="font-size:11px;font-weight:700;letter-spacing:0.6px;color:${ACCENT};text-transform:uppercase;margin-bottom:8px;">${esc(title)}</div>${body}</div>`;
}
const li = (items: string[]) => (items.length ? `<ul style="margin:0;padding-left:18px;color:${TEXT};font-size:13px;line-height:1.5;">${items.map((x) => `<li style="margin:3px 0;">${x}</li>`).join('')}</ul>` : `<div style="color:${MUTED};font-size:13px;">none</div>`);

export function renderEmailHtml(r: DailyReport, fullReportUrl: string): string {
  const warn = r.health.status !== 'NORMAL';
  const parts: string[] = [];
  if (warn) {
    parts.push(`<div style="background:#451a03;border:1px solid ${WARN};border-radius:10px;padding:14px 16px;margin-bottom:14px;color:#fde68a;font-size:13px;line-height:1.5;"><div style="font-weight:800;color:${WARN};margin-bottom:6px;">DATA HEALTH WARNING</div>${esc(r.health.summary)}<br/>Stage 2 coverage: <b>${r.health.stage2CoveragePct ?? 'unknown'}%</b> · failed providers: ${esc(r.health.failedProviders.join('; ') || 'none')} · shortlist may be incomplete: <b>${r.health.shortlistMayBeIncomplete ? 'YES' : 'no'}</b> · runtime ${(r.run.runtimeMs / 60000).toFixed(1)} min · provider errors ${r.run.apiUsage.errors}<ul style="margin:8px 0 0;padding-left:18px;">${r.health.checks.filter((c) => !c.ok).map((c) => `<li>${esc(c.name)}: ${esc(c.detail)}</li>`).join('')}</ul></div>`);
  }
  if (r.status !== 'FAILED') {
    parts.push(section('Market in 30 seconds', li(r.marketIn30Seconds.map((l) => `<b style="color:#f1f5f9;">${esc(l.label)}:</b> ${esc(l.value)}`))));
    parts.push(section('Look at first today', li(r.lookAtFirst.map((a) => `<b style="color:#f1f5f9;">${esc(a.title)}</b> — ${esc(a.why)}`))));
    const rows = r.candidates.slice(0, 5).map((c) => `<tr><td style="padding:6px 8px;color:#f1f5f9;font-weight:700;">${c.rank}. ${esc(c.symbol)}</td><td style="padding:6px 8px;color:${MUTED};">${esc(c.assetClass)}</td><td style="padding:6px 8px;color:${TEXT};">${esc(c.setupType)}</td><td style="padding:6px 8px;color:${ACCENT};font-weight:700;">${c.score}</td><td style="padding:6px 8px;color:${c.extension === 'EXTENDED' ? WARN : TEXT};">${c.extension}</td><td style="padding:6px 8px;color:${TEXT};">${pct(c.ret1)}</td></tr><tr><td colspan="6" style="padding:0 8px 8px;color:${MUTED};font-size:12px;border-bottom:1px solid #1e293b;">${esc(c.whySurfaced.slice(0, 160))}${c.caveat ? (() => { const cv = classifyCaveat(c.caveat); return cv.kind === 'observed' ? ` · <span style="color:${WARN};">caveat:</span> ${esc(cv.text.slice(0, 100))}` : ` · would reduce interest: ${esc(cv.text.slice(0, 100))}`; })() : ''}</td></tr>`).join('');
    parts.push(section('Top 5 research candidates (largest mover ≠ best candidate)', `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="color:${MUTED};font-size:11px;text-transform:uppercase;"><td style="padding:4px 8px;">Symbol</td><td style="padding:4px 8px;">Class</td><td style="padding:4px 8px;">Setup</td><td style="padding:4px 8px;">Score</td><td style="padding:4px 8px;">Stage</td><td style="padding:4px 8px;">1d</td></tr>${rows}</table>`));
    parts.push(section('What may move next (setups — require confirmation)', li(r.whatMayMoveNext.slice(0, 6).map((n) => `<b style="color:#f1f5f9;">${esc(n.symbol)}</b> ${esc(n.stage)} (${n.score}) · trigger ${lvl(n.triggerLevel)}${n.distanceToTriggerPct === null ? '' : `, ${n.distanceToTriggerPct > 0 ? n.distanceToTriggerPct.toFixed(1) + '% below' : Math.abs(n.distanceToTriggerPct).toFixed(1) + '% above'}`} · ${esc(n.reasons.slice(0, 2).join('; '))}`))));
    const lc = r.lifecycle;
    parts.push(section('Lifecycle changes (persisted watchlist)', `<div style="color:${MUTED};font-size:12px;margin-bottom:6px;">${esc(Object.entries(lc.counts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' · ') || 'no entries')}</div>${li(lc.highlights.slice(0, 8).map((t) => `${esc(t.symbol)}: ${esc(t.from ?? 'new')} → <b style="color:#f1f5f9;">${esc(t.to)}</b> — ${esc(t.note.slice(0, 110))}`))}`));
    parts.push(section('Theme rotation', li([`<b style="color:#f1f5f9;">Leading:</b> ${esc(r.themes.equity.leading.join(', ') || 'n/a')}`, `<b style="color:#f1f5f9;">Improving:</b> ${esc(r.themes.equity.improving.join(', ') || 'none')}`, `<b style="color:#f1f5f9;">Deteriorating:</b> ${esc(r.themes.equity.deteriorating.join(', ') || 'none')}`, ...r.themes.equity.groups.filter((g) => g.verdict === 'GENUINE_GROUP_MOVE').slice(0, 3).map((g) => `<b style="color:#f1f5f9;">${esc(g.name)}</b> ${g.up}/${g.members} up, median ${esc(g.medianMove)} · early: ${esc(g.early.slice(0, 4).join(', ') || '—')}`), `<b style="color:#f1f5f9;">Crypto:</b> ${esc(r.themes.crypto.context)}`, ...r.themes.crypto.groups.filter((g) => g.verdict === 'GENUINE_GROUP_MOVE').slice(0, 3).map((g) => `<b style="color:#f1f5f9;">${esc(g.name)}</b> ${g.up}/${g.members} up, median ${esc(g.medianMove)} · ${esc(g.confirmation)}`)])));
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0f172a;color:${TEXT};padding:20px;margin:0;">
<div style="max-width:640px;margin:0 auto;background:#1e293b;border-radius:16px;padding:24px;border:1px solid #334155;">
  <div style="text-align:center;margin-bottom:16px;"><span style="display:inline-block;font-size:13px;font-weight:800;color:${ACCENT};border:1px solid ${ACCENT};border-radius:999px;padding:8px 14px;letter-spacing:1px;">${BRAND.toUpperCase()}</span></div>
  <h1 style="color:${warn ? WARN : ACCENT};margin:0 0 4px;font-size:20px;text-align:center;">${warn ? `⚠ ${BRAND} Data Health Warning` : 'Daily Market Intelligence'}</h1>
  <p style="color:${MUTED};text-align:center;margin:0 0 6px;font-size:13px;">US session ${esc(fmtDate(r.sessionDate))} · run ${esc(r.run.generatedAt.slice(0, 16))}Z</p>
  <p style="color:#f1f5f9;text-align:center;margin:0 0 18px;font-size:14px;font-weight:600;">${esc(r.headline)}</p>
  ${parts.join('')}
  <div style="text-align:center;margin:20px 0 8px;"><a href="${esc(fullReportUrl)}" style="display:inline-block;background:${ACCENT};color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open full report</a></div>
  <p style="color:#64748b;font-size:12px;text-align:center;margin:16px 0 0;line-height:1.5;">${esc(r.disclaimer)}<br/>MarketScanner Pros · private owner report · not for distribution</p>
</div></body></html>`;
}
