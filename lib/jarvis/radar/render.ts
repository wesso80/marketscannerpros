import type { MorningReport, Scored } from './types';

const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));
const sp = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`);
const unit = (s: Scored) => (s.f.dataQuality.ohlc === 'close_only' ? 'σ' : 'ATR');

function scoredRow(s: Scored): string {
  const f = s.f;
  return `| ${f.symbol} | ${f.assetClass} | ${sp(f.ret1, 2)} | ${f1(Math.abs(f.moveAtr ?? 0))}${unit(s)} | ${f.volRatio === null ? 'n/a' : f1(f.volRatio) + '×'} | ${sp(f.rsBench5)} | ${s.score} | ${s.status} | ${s.opportunityType ?? '—'} | ${f.flags.join(', ') || '—'} |`;
}
const HDR = '| Symbol | Class | Overnight | Move | Vol | RS5 | Score | Status | Type | Flags |\n|---|---|---|---|---|---|---|---|---|---|';
const list = (a: string[], empty = '_none_') => (a.length ? a.map((x) => `- ${x}`) : [empty]);

export function renderMorning(r: MorningReport, refresh?: { at: string; lines: string[] }): string {
  const o: string[] = [];
  const c = r.counts, t = r.thirtySeconds;
  o.push('# PRIVATE JARVIS — MORNING OPPORTUNITY RADAR', '', `Session ${r.sessionDate} · generated ${r.generatedAt}${refresh ? ` · crypto refreshed ${refresh.at}` : ''}`, '', '_Research only. No buy/sell signals. Stale or missing data is stated, never inferred._', '');

  o.push('## MARKET IN 30 SECONDS', '');
  if (refresh?.lines.length) { o.push('**OVERNIGHT CRYPTO REFRESH**'); o.push(...list(refresh.lines)); o.push(''); }
  o.push(`**WHAT MOVED:** ${t.whatMoved}`, '', `**WHERE MONEY IS ROTATING:** ${t.rotation}`, '', '**BEST NEW STRENGTH**', ...list(t.bestNewStrength), '', '**BEST EARLY SETUPS**', ...list(t.bestEarlySetups), '', '**BIG MOVES TO IGNORE**', ...list(t.ignore), '', '**MAIN THING TO WATCH TODAY**', ...t.watchToday.map((w, i) => `${i + 1}. ${w}`), '');
  if (t.macro) o.push(`**MACRO THAT MATTERS TODAY:** ${t.macro}`, ''); else o.push("_Macro: no high-impact release inside 24h that changes today's picture._", '');

  o.push('## FUNNEL', '', '| Stage | Count |', '|---|---|', `| Listings screened (Stage 1) | ${c.stage1Listed} listed → ${c.stage1Quoted} quoted → ${c.stage1Liquid} liquid |`, `| Universe with full history (Stage 2) | **${c.universe}** (equities ${c.equities}, crypto ${c.crypto}, ETFs/proxies ${c.other}) |`, `| Meaningful movers | ${c.meaningfulMovers} |`, `| Unusual activity | ${c.unusual} |`, `| New strength / new weakness | ${c.newStrength} / ${c.newWeakness} |`, `| Initial research candidates | ${c.initialCandidates} |`, `| Deep dives (Stage 3) | ${c.deepDives} |`, `| **Final shortlist** | **${c.finalShortlist}** |`, `| Rejected large movers | ${c.rejected} |`, `| Pre-move setups (score ≥40) | ${c.settingUp} |`, '');

  o.push('## 1. WHAT MOVED', '', '**Equities**', ...r.whatMoved.equities.map((l) => `- ${l}`), '', '**Crypto**', ...r.whatMoved.crypto.map((l) => `- ${l}`), '', '**Sectors (ranked by 5d RS vs SPY)**', ...r.whatMoved.sectors.map((l) => `- ${l}`), '', '**Commodities**', ...r.whatMoved.commodities.map((l) => `- ${l}`), '', '**FX**', ...r.whatMoved.fx.map((l) => `- ${l}`), '', '**Rates / credit / vol**', ...r.whatMoved.rates.map((l) => `- ${l}`));

  o.push('', '## 2. THEMES (groups before names)', '', '| Theme | Class | Members | % up | Median move | Verdict | Confirmation | Early | Extended |', '|---|---|---|---|---|---|---|---|---|');
  for (const th of r.themes) o.push(`| ${th.name} | ${th.assetClass} | ${th.members} | ${f1(th.pctUp, 0)}% | ${sp(th.medianRet1, 1)} | ${th.verdict} | ${th.confirmation} | ${th.early.slice(0, 5).join(', ') || '—'} | ${th.extended.slice(0, 4).join(', ') || '—'} |`);
  if (!r.themes.length) o.push('_No theme with ≥4 fresh members._');

  o.push('', '## 3. BIGGEST CHANGES THAT MATTER', '', HDR); r.biggestChanges.forEach((s) => o.push(scoredRow(s)));
  o.push(''); for (const s of r.biggestChanges.slice(0, 5)) o.push(`- **${s.f.symbol}** ${sp(s.f.ret1, 2)}: ${[...s.confirming.slice(0, 2), ...s.conflicting.slice(0, 2)].join('; ') || s.reasons.join('; ')}`);
  o.push('', '## 4. NEW STRENGTH', '', HDR); r.newStrength.forEach((s) => o.push(scoredRow(s)));
  o.push('', '## 5. NEW WEAKNESS', '', HDR); r.newWeakness.forEach((s) => o.push(scoredRow(s)));
  o.push('', '## 6. UNUSUAL ACTIVITY', '', HDR); r.unusual.forEach((s) => o.push(scoredRow(s)));

  const rt = r.rotation;
  o.push('', '## 7. ROTATION', '', '| Sector | 1d | 5d | 20d | RS5 vs SPY | RS20 | 5d rank | rank a week ago | Note |', '|---|---|---|---|---|---|---|---|---|');
  rt.sectors.forEach((s) => o.push(`| ${s.ticker} ${s.label} | ${sp(s.ret1, 2)} | ${sp(s.ret5)} | ${sp(s.ret20)} | ${sp(s.rs5)} | ${sp(s.rs20)} | ${s.rank5} | ${s.rank20Prev} | ${s.note ?? ''} |`));
  o.push('', `- Strong a week ago: ${rt.strongYesterday.join(', ')} · Strong now (5d RS): ${rt.strongToday.join(', ')}`, `- Newly strengthened: ${rt.newlyStrengthened.join(', ') || 'none'} · Lost leadership: ${rt.lostLeadership.join(', ') || 'none'}`, `- Equity breadth: ${rt.breadth.equities.up}/${rt.breadth.equities.total} up · ${rt.breadth.equities.aboveE20} > EMA20 · ${rt.breadth.equities.aboveE50} > EMA50 · new 20d highs ${rt.breadth.equities.newHi20} / lows ${rt.breadth.equities.newLo20}`, '', '**Cross-asset (5d)**', ...rt.crossAsset.map((x) => `- ${x.pair}: ${x.reading}`), '', '**Crypto**', `- BTC ${sp(rt.crypto.btc24h, 2)} / ETH ${sp(rt.crypto.eth24h, 2)} / alt median ${sp(rt.crypto.altMedian24h, 2)} (24h) → ${rt.crypto.leader24h} leading; 7d BTC ${sp(rt.crypto.btc7d)} / ETH ${sp(rt.crypto.eth7d)} / alts ${sp(rt.crypto.altMedian7d)} → ${rt.crypto.leader7d} leading`, `- Breadth: ${f1(rt.crypto.breadth24h, 0)}% up 24h, ${f1(rt.crypto.breadth7d, 0)}% up 7d · ${rt.breadth.crypto.aboveE20}/${rt.breadth.crypto.total} > EMA20, ${rt.breadth.crypto.aboveE50} > EMA50`, `- Categories up (24h mcap): ${rt.crypto.categoriesUp.map((x) => `${x.name} ${sp(x.change24h)}`).join(', ')}`, `- Categories down: ${rt.crypto.categoriesDown.map((x) => `${x.name} ${sp(x.change24h)}`).join(', ')}`);

  o.push('', "## 8. TODAY'S RESEARCH SHORTLIST", '');
  if (!r.shortlist.length) o.push('_No candidate survived deep review._');
  for (const x of r.shortlist) {
    o.push(`### ${x.rank}. ${x.symbol}${x.name ? ` — ${x.name}` : ''}`, '', '| SYMBOL | ASSET CLASS | RESEARCH SCORE | STAGE | OPPORTUNITY TYPE | STATUS | 1D | 5D |', '|---|---|---|---|---|---|---|---|', `| ${x.symbol} | ${x.assetClass} | ${x.score} | ${x.stage} | ${x.opportunityType ?? 'unclassified'} | ${x.status} | ${sp(x.ret1, 2)} | ${sp(x.ret5)} |`, '',
      `- **VOLUME VS NORMAL:** ${x.volume}`, `- **RS CHANGE:** ${x.relativeStrength}`, `- **SECTOR/THEME:** ${x.sectorTheme}`, `- **STRUCTURE:** ${x.structure}`, `- **MOMENTUM:** ${x.momentum}`, `- **VOLATILITY:** ${x.volatility}`, '',
      `- **WHY JARVIS FOUND IT:** ${x.whyFlagged}`, `- **WHAT CHANGED:** ${x.whatChanged}`, `- **CHANGE VELOCITY:** ${x.velocity.join(' ')}`, `- **WHY IT MAY CONTINUE:** ${x.whyMayContinue}`, `- **WHAT ARGUES AGAINST IT:** ${x.conflicting.join('; ') || 'nothing material found'}`, `- **IS IT EARLY OR EXTENDED?** ${x.earlyOrExtended}`, `- **WHAT TO WATCH NEXT:** ${x.whatToWatchNext}`, `- **WHAT WOULD INVALIDATE THE RESEARCH IDEA:** ${x.whatWouldInvalidate}`, `- **WHAT WOULD REDUCE INTEREST:** ${x.whatWouldReduceInterest}`, `- **CATALYSTS:** ${x.catalyst}`, `- **DATA QUALITY:** ${x.dataQuality}`, '');
  }

  o.push('## 9. MOVES TO IGNORE (rejected large movers)', '', '| Symbol | Class | Move | Rejection | Detail |', '|---|---|---|---|---|');
  r.rejected.forEach((x) => o.push(`| ${x.symbol} | ${x.assetClass} | ${sp(x.ret1, 2)} | ${x.reasons.join(', ')} | ${x.detail.join('; ')} |`));
  if (!r.rejected.length) o.push('| — | | | | |');

  o.push('', '## 10. WHAT MAY BE SETTING UP NEXT (pre-move detector)', '', '_Assets that have NOT made the major move: compression, accumulation, RS acceleration, EMA reclaim, proximity to trigger._', '', '| Symbol | Class | Stage | Score | 1d | 5d | BB pctile | RS Δ | 5d/20d vol | To 20d high | ADX | Trigger | Signals | Penalties |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of r.settingUp) o.push(`| ${s.symbol} | ${s.assetClass} | ${s.stage} | ${s.score} | ${sp(s.ret1, 2)} | ${sp(s.ret5)} | ${f1(s.bbWidthPctile, 0)} | ${sp(s.rsBenchDelta)} | ${f1(s.accumRatio, 2)} | ${sp(s.distToHi20Pct)} | ${f1(s.adx, 0)} | ${s.triggerLevel === null ? 'n/a' : s.triggerLevel >= 1 ? s.triggerLevel.toFixed(2) : s.triggerLevel.toPrecision(4)} | ${s.signals.slice(0, 4).join('; ')} | ${s.penalties.slice(0, 2).join('; ') || '—'} |`);
  if (!r.settingUp.length) o.push('| — | | | | | | | | | | | | | |');

  o.push('', '## 11. WATCHLIST LIFECYCLE', '', '**Changes this run**', ...list(r.lifecycle.changes.map((x) => `${x.symbol}: ${x.from ?? 'new'} → **${x.to}** — ${x.note}`)), '', '**Active entries**', ...list(r.lifecycle.active.map((x) => `${x.symbol} · ${x.status} · seen ${x.sessionsSeen} session(s) · ${x.note}`)));

  o.push('', '## 12. WHAT JARVIS WILL WATCH TODAY', '', ...r.watchToday.map((w, i) => `${i + 1}. ${w}`));
  if (r.macroNext24h.length) { o.push('', '**Macro inside 24h**'); r.macroNext24h.forEach((m) => o.push(`- ${m.time} · ${m.country} · ${m.event} · ${m.impact}`)); }

  o.push('', '## DATA HEALTH & API USAGE', '', '| Provider | Status | Detail |', '|---|---|---|'); r.providers.forEach((p) => o.push(`| ${p.name} | ${p.status} | ${p.detail} |`));
  o.push('', `**API usage:** Alpha Vantage ${r.apiUsage.alphaVantage} calls · CoinGecko ${r.apiUsage.coingecko} calls · DB queries ${r.apiUsage.dbQueries} · provider errors ${r.apiUsage.errors} · runtime ${(r.apiUsage.runtimeMs / 60000).toFixed(1)} min`, '', `**Sustainable universe:** ${r.apiUsage.sustainableMaxEquities}`, '', '**Gaps / limitations**', ...r.dataGaps.map((g) => `- ${g}`));
  return o.join('\n') + '\n';
}
