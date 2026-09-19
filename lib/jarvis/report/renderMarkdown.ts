import type { DailyReport } from './types';

const list = (a: string[], empty = '_none_') => (a.length ? a.map((x) => `- ${x}`) : [empty]);
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dist = (n: number | null) => (n === null ? 'n/a' : n > 0 ? `${n.toFixed(1)}% below` : `${Math.abs(n).toFixed(1)}% above`);
const lvl = (v: number | null) => (v === null ? 'n/a' : v >= 1 ? v.toFixed(2) : v.toPrecision(4));

export function renderReportMarkdown(r: DailyReport): string {
  const o: string[] = [];
  const warn = r.health.status !== 'NORMAL';
  o.push(`# ${warn ? '⚠ MSP RADAR DATA HEALTH WARNING' : 'MSP RADAR — DAILY MARKET INTELLIGENCE'} — ${fmtDate(r.sessionDate)}`, '', `US session ${r.sessionDate} · run ${r.run.runKey} generated ${r.run.generatedAt} · report v${r.version} built ${r.generatedAt}`, '', `**${r.headline}**`, '', `_${r.disclaimer}_`, '');
  if (warn) {
    o.push('## DATA HEALTH WARNING', '', r.health.summary, '', '| Check | OK | Detail |', '|---|---|---|', ...r.health.checks.map((c) => `| ${c.name} | ${c.ok ? 'yes' : '**NO**'} | ${c.detail} |`), '', `Stage 2 coverage: ${r.health.stage2CoveragePct ?? 'unknown'}% · failed providers: ${r.health.failedProviders.join('; ') || 'none'} · shortlist may be incomplete: ${r.health.shortlistMayBeIncomplete ? 'YES' : 'no'} · runtime ${(r.run.runtimeMs / 60000).toFixed(1)} min · provider errors ${r.run.apiUsage.errors}`, '');
    if (r.status === 'FAILED') { o.push('_No market content is presented for a failed run._'); return o.join('\n') + '\n'; }
    o.push('_The sections below are shown for reference; treat them as potentially incomplete._', '');
  }
  o.push('## A. MARKET IN 30 SECONDS', '', ...r.marketIn30Seconds.map((l) => `- **${l.label}:** ${l.value}`), '');
  const w = r.whatMoved;
  const ml = (a: typeof w.equities.strength) => list(a.map((m) => `**${m.symbol}** ${m.change} — ${m.detail}`));
  o.push('## B. WHAT MOVED', '', '**Equities** — ' + w.equities.breadth, '', '_Strength_', ...ml(w.equities.strength), '', '_Weakness_', ...ml(w.equities.weakness), '', '_Unusual volume_', ...ml(w.equities.unusualVolume), '', '_Gaps_', ...ml(w.equities.gaps), '', '_Breakouts_', ...ml(w.equities.breakouts), '', '_Breakdowns_', ...ml(w.equities.breakdowns), '', '**Crypto**', `- ${w.crypto.context}`, `- ${w.crypto.altBreadth}`, '', '_Movers_', ...ml(w.crypto.movers), '', '_Unusual volume / derivatives_', ...ml(w.crypto.unusual), '', '**Cross-asset**', ...w.crossAsset.map((x) => `- ${x.label} ${x.value}`), '');
  o.push('## C. TOP RESEARCH CANDIDATES', '', '_Largest mover ≠ best candidate: ranking is research quality (participation, structure, RS, theme, catalyst), not % change._', '', '| # | Symbol | Class | Setup | Score | Stage | 1d | 5d | Lifecycle | Why surfaced | Caveat | Catalyst |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of r.candidates) o.push(`| ${c.rank} | **${c.symbol}** | ${c.assetClass} | ${c.setupType} | ${c.score} | ${c.extension} | ${c.ret1 > 0 ? '+' : ''}${c.ret1.toFixed(1)}% | ${c.ret5 === null ? 'n/a' : (c.ret5 > 0 ? '+' : '') + c.ret5.toFixed(1) + '%'} | ${c.lifecycle ?? '—'} | ${c.whySurfaced.slice(0, 140)} | ${c.caveat.slice(0, 110)} | ${c.catalyst.slice(0, 90)} |`);
  o.push(''); for (const c of r.candidates.slice(0, 10)) o.push(`- **${c.symbol}** velocity: ${c.velocity}`);
  o.push('', '## D. WHAT MAY MOVE NEXT', '', '_Setups, not predictions: each requires confirmation._', '', '| Symbol | Class | Stage | Score | Lifecycle | Trigger | Distance | Reasons | Confirmation | Invalidation / caveat |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const n of r.whatMayMoveNext) o.push(`| **${n.symbol}** | ${n.assetClass} | ${n.stage} | ${n.score} | ${n.lifecycle ?? '—'} | ${lvl(n.triggerLevel)} | ${dist(n.distanceToTriggerPct)} | ${n.reasons.join('; ')} | ${n.confirmation} | ${n.invalidation} |`);
  const lc = r.lifecycle;
  o.push('', '## E. LIFECYCLE CHANGES (persisted watchlist)', '', `Counts: ${Object.entries(lc.counts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`, '', '**Highlights**', ...list(lc.highlights.map((t) => `${t.symbol}: ${t.from ?? 'new'} → **${t.to}** — ${t.note}`)), '', `_${lc.transitions.length} transitions recorded for ${r.sessionDate}._`);
  o.push('', '## F. THEMES & ROTATION', '', '**Equity**', `- Leading: ${r.themes.equity.leading.join(', ') || 'n/a'}`, `- Improving: ${r.themes.equity.improving.join(', ') || 'none'}`, `- Deteriorating: ${r.themes.equity.deteriorating.join(', ') || 'none'}`, '', '| Group | Members | Up | Median | Verdict | Confirmation | Early | Extended |', '|---|---|---|---|---|---|---|---|');
  for (const g of r.themes.equity.groups) o.push(`| ${g.name} | ${g.members} | ${g.up} | ${g.medianMove} | ${g.verdict} | ${g.confirmation} | ${g.early.slice(0, 4).join(', ') || '—'} | ${g.extended.slice(0, 3).join(', ') || '—'} |`);
  o.push('', '**Crypto**', `- ${r.themes.crypto.context}`, '', '| Category | Members | Up | Median | Verdict | vs majors / funding | Early | Extended |', '|---|---|---|---|---|---|---|---|');
  for (const g of r.themes.crypto.groups) o.push(`| ${g.name} | ${g.members} | ${g.up} | ${g.medianMove} | ${g.verdict} | ${g.confirmation} | ${g.early.slice(0, 4).join(', ') || '—'} | ${g.extended.slice(0, 3).join(', ') || '—'} |`);
  o.push('', '## G. REJECTED NOISE', '', '| Symbol | Class | Move | Reasons | Detail |', '|---|---|---|---|---|', ...r.rejected.map((x) => `| ${x.symbol} | ${x.assetClass} | ${x.change} | ${x.reasons.join(', ')} | ${x.detail} |`));
  o.push('', '## H. LOOK AT FIRST TODAY', '', ...list(r.lookAtFirst.map((a) => `**${a.title}** — ${a.why}`)));
  o.push('', '## I. PROBABLY NOISE', '', ...list(r.probablyNoise));
  const d = r.dataHealth;
  o.push('', '## J. DATA / PROVIDER HEALTH', '', `Universe ${d.universe} (equities ${d.equities}, crypto ${d.crypto}, ETFs ${d.etfs}) · Stage 1: ${d.stage1Listed} listed → ${d.stage1Quoted} quoted → ${d.liquid} liquid · Stage 2: ${d.stage2Selected ?? 'n/a'} selected, ${d.stage2Live ?? 'n/a'} live, ${d.stage2Fallback ?? 'n/a'} fallback, ${d.stage2Missing ?? 'n/a'} missing → coverage ${d.coveragePct ?? 'n/a'}% · Stage 3 deep dives ${d.deepDives}`, `Alpha Vantage ${d.alphaVantageCalls} calls · CoinGecko ${d.coingeckoCalls} · DB ${d.dbQueries} · provider errors ${d.providerErrors} · runtime ${(d.runtimeMs / 60000).toFixed(1)} min · peak RSS ${d.peakRssMb ?? 'n/a'} MB`, `Sector cache: ${d.sectorCacheCoverage ?? 'n/a'}`, '', '| Provider | Status | Detail |', '|---|---|---|', ...d.providers.map((p) => `| ${p.name} | ${p.status} | ${p.detail} |`), '', '**Gaps**', ...list(d.gaps));
  o.push('', `_${r.disclaimer}_`);
  return o.join('\n') + '\n';
}
