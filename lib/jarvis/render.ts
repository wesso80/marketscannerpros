/** Private Jarvis — Markdown renderer for JarvisBrief. */
import type { CatalystItem, JarvisBrief, ResearchCandidate } from './types';

const pct = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`);
const list = (items: string[], empty = '_None._') => (items.length ? items.map((x) => `- ${x}`).join('\n') : empty);

function assessmentBlock(title: string, a: { label: string; evidence: string[]; conflicts: string[]; provenance: string[]; confidence: number }): string {
  return [`**${title}: ${a.label}** (layer confidence ${a.confidence})`, '', 'Evidence:', list(a.evidence), '', a.conflicts.length ? `Conflicts / caveats:\n${list(a.conflicts)}` : '', a.provenance.length ? `Provenance: ${a.provenance.join('; ')}` : ''].filter(Boolean).join('\n');
}

function catalystTable(items: CatalystItem[]): string {
  if (!items.length) return '_No medium/high-importance events in window._';
  const rows = items.map((c) => `| ${c.timeLocal} | ${c.country} | ${c.event} | ${c.importance.toUpperCase()} | ${c.timingStatus}/${c.sourceAuthority} | ${c.assetsMostExposed.slice(0, 5).join(', ')} | ${c.whyItMatters} |`);
  return ['| Time (local) | Country | Event | Impact | Timing/Source | Most exposed | Why it matters |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
}

function candidateBlock(c: ResearchCandidate): string {
  return [
    `### ${c.symbol} — ${c.researchStatus}`,
    `Asset class ${c.assetClass} · rank ${c.rank} · composite ${c.composite} · percentile ${c.percentile} · bias ${c.bias} · confidence ${c.confidence} · liquidity ${c.liquidityState} · data ${c.dataQuality} · event risk ${c.eventRisk}`,
    '', '**Why interesting**', list(c.whyInteresting),
    '', '**Confirming evidence**', list(c.confirmingEvidence),
    '', '**Conflicting evidence**', list(c.conflictingEvidence),
    '', `**Confirmation:** ${c.confirmationLevel ?? 'n/a'}`, `**Invalidation:** ${c.invalidationLevel ?? 'n/a'}`,
    `**Catalysts:** ${c.catalysts.length ? c.catalysts.join('; ') : 'none identified in ±14d'}`,
  ].join('\n');
}

export function renderMarkdown(b: JarvisBrief): string {
  const s = b.marketState;
  const out: string[] = [];
  out.push('# JARVIS MARKET INTELLIGENCE', '', `Generated: ${b.generatedAt}`, `Data confidence: ${b.confidence.label} (${b.confidence.score}/100)`, `Critical coverage: ${b.criticalCoverage.covered}/${b.criticalCoverage.total} (${b.criticalCoverage.pct}%)${b.criticalCoverage.sufficient ? '' : ' — INSUFFICIENT DATA FOR HIGH-CONFIDENCE ASSESSMENT'}`, '', `_${b.environmentNote}_`, '', '_Educational market research only. Not financial advice; no recommendation to buy, sell or hold any instrument._', '');
  out.push('## 1. EXECUTIVE SUMMARY', '', ...b.executiveSummary.map((p) => `${p}\n`));
  out.push('## 2. MARKET STATE', '', `| Dimension | Reading |`, `|---|---|`, `| Regime | ${s.regime.label} |`, `| Risk | ${s.regime.label === 'RISK_OFF' ? 'Defensive' : s.regime.label === 'RISK_ON' ? 'Constructive' : s.regime.label} |`, `| Liquidity | ${s.liquidity.label} |`, `| Fragility | ${s.fragility.label}${s.fragility.score !== null ? ` (${s.fragility.score.toFixed(1)})` : ''} |`, `| Breadth | ${s.breadth.label} |`, `| Volatility | ${s.volatility} |`, `| USD | ${s.usd} |`, `| Rates | ${s.rates} |`, `| Crypto | ${s.crypto} |`, `| Confidence | ${b.confidence.label} (${b.confidence.score}) |`, '');
  out.push('## 3. WHAT CHANGED OVERNIGHT', '', `_Basis: ${b.whatChanged.basis}_`, '');
  for (const k of ['NEW_STRENGTH', 'NEW_WEAKNESS', 'REGIME_CHANGES', 'BREADTH_CHANGES', 'LIQUIDITY_CHANGES', 'FRAGILITY_CHANGES', 'SCANNER_ROTATION', 'SECTOR_ROTATION', 'CRYPTO_ROTATION', 'CATALYST_CHANGES'] as const) {
    const items = b.whatChanged[k]; if (items.length) out.push(`**${k}**`, list(items), '');
  }
  if (!Object.entries(b.whatChanged).some(([k, v]) => k !== 'basis' && (v as string[]).length)) out.push('_No material changes detected on the available comparison basis._', '');
  out.push('## 4. WHY MARKETS ARE MOVING', '', ...b.drivers.map((d) => `${d.rank}. **${d.driver}** — ${d.evidence}`), '');
  out.push('## 5. CROSS-ASSET CONFIRMATION', '', assessmentBlock('Confirmation', s.crossAsset), '', '| Pair | Reading |', '|---|---|', ...s.crossAsset.pairs.map((p) => `| ${p.pair} | ${p.reading} |`), '');
  out.push('## 6. LIQUIDITY / GLOBAL M2', '', assessmentBlock('Liquidity', s.liquidity), '');
  out.push('## 7. FRAGILITY', '', assessmentBlock('Fragility', s.fragility), '', s.fragility.components.length ? ['| Component | Value | Read |', '|---|---|---|', ...s.fragility.components.map((c) => `| ${c.label} | ${c.value.toFixed(1)} | ${c.semantic} |`)].join('\n') : '', '');
  out.push('## 8. EQUITY LEADERSHIP', '', assessmentBlock('Breadth', s.breadth), '', '**Strongest sectors (5d/1m/3m persistence)**', '| Sector | 1d | 5d | 1m | 3m | YTD | Persistence rank |', '|---|---|---|---|---|---|---|', ...b.leadership.strongestSectors.map((x) => `| ${x.name} (${x.etf}) | ${pct(x.d1, 2)} | ${pct(x.d5, 2)} | ${pct(x.m1, 2)} | ${pct(x.m3, 2)} | ${pct(x.ytd, 2)} | ${x.persistenceRank} |`), '', '**Weakest sectors**', '| Sector | 1d | 5d | 1m | 3m | YTD | Persistence rank |', '|---|---|---|---|---|---|---|', ...b.leadership.weakestSectors.map((x) => `| ${x.name} (${x.etf}) | ${pct(x.d1, 2)} | ${pct(x.d5, 2)} | ${pct(x.m1, 2)} | ${pct(x.m3, 2)} | ${pct(x.ytd, 2)} | ${x.persistenceRank} |`), '', '**Asset classes (last print, with persisted daily context)**', '| Asset | Change | Context |', '|---|---|---|', ...b.leadership.assetClasses.map((a) => `| ${a.asset} | ${pct(a.change, 2)} | ${a.note} |`), '');
  out.push('## 9. CRYPTO STATE', '', ...Object.entries(b.crypto).map(([k, v]) => `- **${k}**: ${v}`), '', '**Strongest crypto groups (24h mcap change, >$2B groups)**', list(b.leadership.strongestCryptoGroups.map((g) => `${g.name} ${pct(g.change24h, 2)}`)), '', '**Weakest crypto groups**', list(b.leadership.weakestCryptoGroups.map((g) => `${g.name} ${pct(g.change24h, 2)}`)), '');
  out.push('## 10. HIGHEST-EVIDENCE RESEARCH AREAS', '', b.candidates.length ? b.candidates.map(candidateBlock).join('\n\n') : '_No candidates._', '');
  out.push('## 11. DETERIORATING AREAS', '', list(b.deteriorating, '_No deteriorating names identified on the available comparison basis._'), '');
  out.push('## 12. UPCOMING CATALYSTS', '', '### Next 24 hours', catalystTable(b.catalysts.next24Hours), '', '### Next 72 hours', catalystTable(b.catalysts.next72Hours.filter((c) => !b.catalysts.next24Hours.includes(c))), '', '### Next 7 days', catalystTable(b.catalysts.next7Days.filter((c) => !b.catalysts.next72Hours.includes(c))), '');
  out.push('## 13. BULL CASE', '', '_Evidence that would be required:_', list(b.cases.bull), '', '## 14. BEAR CASE', '', '_Evidence that would be required:_', list(b.cases.bear), '', '## 15. BASE CASE', '', list(b.cases.base), '', '## 16. WHAT WOULD CHANGE THE VIEW', '', '**Would strengthen if:**', list(b.cases.whatWouldChangeTheView.strengthenIf), '', '**Would weaken if:**', list(b.cases.whatWouldChangeTheView.weakenIf), '');
  out.push('## 17. DATA HEALTH', '', '| Dataset | Provider | Env | Freshness | Age (m) | Coverage | Conf | Warnings |', '|---|---|---|---|---|---|---|---|', ...b.datasets.map((d) => `| ${d.label} | ${d.provider} | ${d.environment} | ${d.freshness} | ${d.ageMinutes ?? '—'} | ${d.coverage} | ${d.confidence} | ${d.warnings.join('; ') || '—'} |`), '', '**Stale feeds**', list(b.dataHealth.stale), '', '**Missing feeds**', list(b.dataHealth.missing), '', '**Proxies**', list(b.dataHealth.proxies), '', '**Conflicts**', list(b.dataHealth.conflicts), '', '**Confidence methodology**', list(b.confidence.methodology), '');
  return out.join('\n');
}
