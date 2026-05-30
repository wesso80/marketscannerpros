/**
 * lib/dailyPacket/htmlRenderer.ts — Render DailyOperatorPacket as
 * print-friendly HTML. Operator can "Save as PDF" from the browser
 * (no Playwright/Puppeteer dependency needed for v1).
 *
 * Output is self-contained HTML — no external CSS, no JS. Safe to
 * email or download.
 */

import type { DailyOperatorPacket, DailyPacketSection } from './builder';

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function badge(freshness: DailyPacketSection['freshness']): string {
  const color = freshness === 'fresh' ? 'var(--msp-bull)' : freshness === 'stale' ? 'var(--msp-warn)' : '#9CA3AF';
  return `<span style="background:${color};color:#0F172A;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${freshness}</span>`;
}

function sectionHeader(title: string, section: DailyPacketSection): string {
  return `<div class="sec-head">
    <h2>${esc(title)}</h2>
    <div class="sec-meta">
      ${badge(section.freshness)}
      <span>source: <code>${esc(section.source)}</code></span>
      <span>last updated: ${section.lastUpdated ? esc(new Date(section.lastUpdated).toLocaleString()) : '—'}</span>
      ${section.notes ? `<span class="note">${esc(section.notes)}</span>` : ''}
    </div>
  </div>`;
}

export function renderDailyPacketHtml(p: DailyOperatorPacket): string {
  const warningsHtml = p.warnings.length > 0
    ? `<div class="warnings">
        <strong>Pre-flight warnings</strong>
        <ul>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
      </div>` : '';

  const killBlock = `<div class="kill ${p.killSwitch.enabled ? 'on' : 'off'}">
    <strong>Kill switch: ${p.killSwitch.enabled ? 'ON — alerts &amp; notifications suppressed' : 'OFF — alerts active'}</strong>
    ${p.killSwitch.reason ? `<div class="muted">Reason: ${esc(p.killSwitch.reason)}</div>` : ''}
    ${p.killSwitch.setAt ? `<div class="muted">Set at: ${esc(new Date(p.killSwitch.setAt).toLocaleString())}</div>` : ''}
  </div>`;

  const setupsHtml = p.openSetups.length === 0
    ? '<div class="muted">No open setups in the last 7 days.</div>'
    : `<table>
        <thead><tr>
          <th>Symbol</th><th>Setup</th><th>Dir</th><th>Playbook</th><th>Regime</th>
          <th>Opp</th><th>Ev</th><th>Surfaced</th>
        </tr></thead>
        <tbody>
          ${p.openSetups.map((s) => `<tr>
            <td><strong>${esc(s.symbol)}</strong></td>
            <td>${esc(s.setupType)}</td>
            <td>${esc(s.direction)}</td>
            <td>${esc(s.playbook ?? '—')}</td>
            <td>${esc(s.regime ?? '—')}</td>
            <td style="text-align:right">${s.opportunityScore?.toFixed(0) ?? '—'}</td>
            <td style="text-align:right">${s.evidenceQuality?.toFixed(0) ?? '—'}</td>
            <td>${esc(new Date(s.surfacedAt).toLocaleString())}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

  const macroByCat: Record<string, typeof p.macro> = {};
  for (const m of p.macro) {
    const c = m.category || 'other';
    if (!macroByCat[c]) macroByCat[c] = [];
    macroByCat[c].push(m);
  }
  const macroHtml = p.macro.length === 0
    ? '<div class="muted">No macro series ingested.</div>'
    : Object.entries(macroByCat).map(([cat, rows]) => `
        <h3>${esc(cat)}</h3>
        <table><thead><tr>
          <th>Series</th><th>Description</th><th>Latest</th><th>As of</th><th>Δ</th><th>Δ%</th><th>Age (d)</th>
        </tr></thead><tbody>
          ${rows.map((r) => `<tr>
            <td><strong>${esc(r.seriesKey)}</strong></td>
            <td>${esc(r.description)}</td>
            <td style="text-align:right">${r.latestValue === null ? '—' : r.latestValue.toFixed(2)} ${esc(r.units)}</td>
            <td>${esc(r.latestObservedOn ?? '—')}</td>
            <td style="text-align:right;color:${r.change === null ? '#9CA3AF' : r.change >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)'}">
              ${r.change === null ? '—' : (r.change >= 0 ? '+' : '') + r.change.toFixed(2)}
            </td>
            <td style="text-align:right;color:${r.changePct === null ? '#9CA3AF' : r.changePct >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)'}">
              ${r.changePct === null ? '—' : (r.changePct >= 0 ? '+' : '') + r.changePct.toFixed(2) + '%'}
            </td>
            <td style="text-align:right">${r.freshnessAgeDays ?? '—'}</td>
          </tr>`).join('')}
        </tbody></table>`).join('');

  const driftHtml = !p.drift
    ? '<div class="muted">Drift not available.</div>'
    : `<table><thead><tr><th>Signal</th><th>Severity</th><th>Value</th><th>Detail</th></tr></thead><tbody>
        ${p.drift.signals.map((s) => `<tr>
          <td>${esc(s.label)}</td>
          <td><span class="sev sev-${s.severity}">${esc(s.severity)}</span></td>
          <td>${esc(s.value)}</td>
          <td class="muted">${esc(s.detail)}</td>
        </tr>`).join('')}
      </tbody></table>`;

  const calBucket = (title: string, rows: { bucket: string; setups: number; withOutcome: number; winRate: number | null; avgR5d: number | null; avgR20d: number | null }[]) => `
    <h3>${esc(title)}</h3>
    <table><thead><tr><th>${esc(title)}</th><th>Setups</th><th>Resolved</th><th>Win rate</th><th>Avg R (5d)</th><th>Avg R (20d)</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td><strong>${esc(r.bucket)}</strong></td>
      <td style="text-align:right">${r.setups}</td>
      <td style="text-align:right">${r.withOutcome}</td>
      <td style="text-align:right">${r.winRate === null ? '—' : (r.winRate * 100).toFixed(0) + '%'}</td>
      <td style="text-align:right;color:${r.avgR5d === null ? '#9CA3AF' : r.avgR5d >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)'}">${r.avgR5d === null ? '—' : r.avgR5d.toFixed(2)}</td>
      <td style="text-align:right;color:${r.avgR20d === null ? '#9CA3AF' : r.avgR20d >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)'}">${r.avgR20d === null ? '—' : r.avgR20d.toFixed(2)}</td>
    </tr>`).join('')}</tbody></table>`;
  const calHtml = !p.calibration
    ? '<div class="muted">Calibration not available.</div>'
    : calBucket('Confidence', p.calibration.byConfidence)
      + calBucket('Opportunity score', p.calibration.byOppScore)
      + calBucket('Evidence quality', p.calibration.byEvidenceQuality);

  const universeHtml = p.universe.length === 0
    ? '<div class="muted">Empty.</div>'
    : `<div class="chips">${p.universe.map((u) => `<span class="chip">${esc(u.symbol)}${u.tags.length ? ` <small>${esc(u.tags.join(', '))}</small>` : ''}</span>`).join('')}</div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Daily Operator Packet — ${esc(p.generatedAt.slice(0, 10))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #111; background: #fff; margin: 24px; font-size: 12px; line-height: 1.4; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { font-size: 14px; margin: 0; }
  h3 { font-size: 13px; margin: 14px 0 6px; color: #374151; }
  .header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
  .muted { color: #6B7280; }
  .warnings { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 10px 14px; margin-bottom: 18px; }
  .warnings ul { margin: 4px 0 0; padding-left: 18px; }
  .kill { padding: 10px 14px; border-radius: 6px; margin-bottom: 18px; }
  .kill.on { background: #FEE2E2; border: 1px solid #B91C1C; color: #7F1D1D; }
  .kill.off { background: #ECFDF5; border: 1px solid #10B981; color: #065F46; }
  section { margin-bottom: 20px; page-break-inside: avoid; }
  .sec-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; margin-bottom: 10px; flex-wrap: wrap; gap: 8px; }
  .sec-meta { font-size: 10px; color: #6B7280; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .sec-meta .note { color: #B45309; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #E5E7EB; font-size: 11px; }
  th { background: #F9FAFB; font-weight: 600; color: #374151; text-transform: uppercase; font-size: 10px; letter-spacing: .5px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { background: #F3F4F6; border: 1px solid #E5E7EB; border-radius: 4px; padding: 3px 8px; font-size: 11px; }
  .chip small { color: #6B7280; }
  .sev { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .sev-high { background: #FEE2E2; color: #991B1B; }
  .sev-medium { background: #FEF3C7; color: #92400E; }
  .sev-low { background: #E0F2FE; color: #075985; }
  .footer { border-top: 1px solid #E5E7EB; margin-top: 24px; padding-top: 10px; font-size: 10px; color: #6B7280; }
  @media print { .no-print { display: none; } body { margin: 0; font-size: 11px; } }
</style></head>
<body>
  <div class="header">
    <h1>Daily Operator Packet</h1>
    <div class="muted">Generated: ${esc(new Date(p.generatedAt).toLocaleString())} · Workspace: <code>${esc(p.workspaceId.slice(0, 8))}…</code></div>
  </div>
  <div class="no-print" style="margin-bottom:16px;">
    <button onclick="window.print()" style="background:#10B981;color:#0F172A;border:none;border-radius:4px;padding:6px 14px;font-weight:700;cursor:pointer">Save as PDF</button>
  </div>

  ${warningsHtml}
  ${killBlock}

  ${bestBlock(p)}
  ${diffBlock(p)}

  <section>${sectionHeader('Open setups (last 7 days)', p.openSetupSection)}${setupsHtml}</section>
  <section>${sectionHeader('Macro Pulse', p.macroSection)}${macroHtml}</section>
  <section>${sectionHeader('Behavioral drift (last 30 days)', p.driftSection)}${driftHtml}</section>
  <section>${sectionHeader('Calibration', p.calibrationSection)}${calHtml}</section>
  <section>
    <div class="sec-head"><h2>Personal universe (${p.universeSize})</h2></div>
    ${universeHtml}
  </section>

  <div class="footer">
    RESEARCH ONLY. No broker execution. Verify every fact before acting.
    Stale or missing data cannot be represented as current truth.
  </div>
</body></html>`;
}

function bestBlock(p: DailyOperatorPacket): string {
  const b = p.bestSetupToday;
  if (!b) {
    return `<section><div class="sec-head"><h2>Best setup today</h2></div><div class="muted">No setups surfaced today.</div></section>`;
  }
  return `<section>
    <div class="sec-head"><h2>Best setup today</h2></div>
    <div style="border:2px solid #10B981;border-radius:6px;padding:12px;background:#0F172A0d">
      <div style="font-size:18px;font-weight:700">${esc(b.symbol)} — ${esc(b.setupType)} ${esc(b.direction)}</div>
      <div class="muted">Playbook: ${esc(b.playbook ?? '—')} · Regime: ${esc(b.regime ?? '—')}</div>
      <div>Opportunity: <strong>${b.opportunityScore?.toFixed(0) ?? '—'}</strong> · Evidence: <strong>${b.evidenceQuality?.toFixed(0) ?? '—'}</strong></div>
      <div class="muted">Surfaced: ${esc(new Date(b.surfacedAt).toLocaleString())}</div>
    </div>
  </section>`;
}

function diffBlock(p: DailyOperatorPacket): string {
  const d = p.setupDiff;
  const fmt = (arr: string[]) => arr.length === 0 ? '<span class="muted">—</span>' : arr.map((s) => `<code>${esc(s)}</code>`).join(' ');
  return `<section>
    <div class="sec-head"><h2>Today vs yesterday</h2>
      <div class="sec-meta"><span>today: ${d.todayCount}</span><span>yesterday: ${d.yesterdayCount}</span></div>
    </div>
    <div><strong>New today:</strong> ${fmt(d.newSymbols)}</div>
    <div><strong>Persisted:</strong> ${fmt(d.persistedSymbols)}</div>
    <div><strong>Dropped:</strong> ${fmt(d.droppedSymbols)}</div>
  </section>`;
}
