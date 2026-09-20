/**
 * Deterministic, symbol-specific Scanner Analysis content. Pure: builds short evidence lines from the scan row itself
 * (never prose templates). Every line names the number it came from, and confirmation is derived from the SETUP type.
 */
export interface AnalysisRowInput {
  symbol: string;
  direction?: 'bullish' | 'bearish' | 'neutral' | string;
  setup?: string | null;
  price?: number | null;
  rsi?: number | null;
  adx?: number | null;
  atr?: number | null;
  ema200?: number | null;
  macdHist?: number | null;
  dveFlags?: string[] | null;
  dveBbwp?: number | null;
  liquidity?: { avgVolume20: number | null; adv20: number | null; volumeRatio: number | null } | null;
  enhancements?: {
    relativeStrength?: { rs?: number | null; label?: string; benchmark?: string; window?: string; benchmarkMissing?: boolean } | null;
    emaStack?: { direction?: string; label?: string } | null;
    squeeze?: { squeeze?: boolean; squeezeIntensity?: number } | null;
  } | null;
  insight?: { setupStage?: string; extensionState?: string; evidenceQuality?: { level?: string }; whyRanked?: string[]; cautions?: string[] } | null;
  dataTrust?: { level: string; reasons: string[]; freshness?: string } | null;
  dataBasis?: { barInterval?: string; lastCompletedBarAt?: string | null; currentBarPartial?: boolean; historyBars?: number; source?: string; computedAt?: string; volumeBasis?: string; hlBasis?: string; notes?: string[] } | null;
  lifecycle?: string | null;
  scoreQuality?: { evidenceLayers?: number; freshnessStatus?: string; liquidityStatus?: string } | null;
}

export interface AnalysisNarrative {
  supports: string[];
  blockers: string[];
  /** What must happen next for THIS setup type to be confirmed / invalidated. */
  confirmation: { confirms: string; invalidates: string; setupFamily: string };
  /** Human label for the setup family used to derive confirmation. */
  extensionLabel: string;
  stageLabel: string;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fmt = (v: number, d = 2) => (Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(d));
const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${Math.round(v).toLocaleString()}`);

export type SetupFamily = 'breakout' | 'trend' | 'squeeze' | 'reversal' | 'range' | 'exhaustion' | 'momentum' | 'unknown';

export function classifySetupFamily(setup?: string | null): SetupFamily {
  const s = String(setup ?? '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('exhaustion')) return 'exhaustion';
  if (s.includes('squeeze') || s.includes('compression')) return 'squeeze';
  if (s.includes('breakout') || s.includes('breakdown') || s.includes('expansion')) return 'breakout';
  if (s.includes('reversal') || s.includes('oversold') || s.includes('overbought') || s.includes('mean reversion') || s.includes('fade') || s.includes('reclaim')) return 'reversal';
  if (s.includes('range') || s.includes('consolidation')) return 'range';
  if (s.includes('trend') || s.includes('pullback')) return 'trend';
  if (s.includes('momentum')) return 'momentum';
  return 'unknown';
}

export function buildConfirmation(row: AnalysisRowInput): AnalysisNarrative['confirmation'] {
  const family = classifySetupFamily(row.setup);
  const long = row.direction === 'bullish';
  const short = row.direction === 'bearish';
  const side = long ? 'above' : short ? 'below' : 'through';
  const opp = long ? 'below' : short ? 'above' : 'against';
  const ema = num(row.ema200) ? `EMA200 ${fmt(row.ema200)}` : 'the 200-bar average (unavailable)';
  const volNote = row.liquidity?.volumeRatio != null ? ` (last bar ${row.liquidity.volumeRatio.toFixed(2)}× the 20-bar average)` : '';
  switch (family) {
    case 'breakout':
      return { setupFamily: 'Breakout / expansion', confirms: `A close ${side} the breakout level with volume ≥ 1.5× the 20-bar average${volNote}, holding the level on the next bar.`, invalidates: `A close back ${opp} the breakout level (failed break) or volume fading below average on continuation.` };
    case 'trend':
      return { setupFamily: 'Trend continuation', confirms: `Price holds ${side} ${ema} and the pullback resolves with a higher ${long ? 'low' : 'high'}; ADX staying ≥ 25 keeps trend persistence intact${num(row.adx) ? ` (now ${row.adx.toFixed(1)})` : ''}.`, invalidates: `A decisive close ${opp} ${ema} or ADX rolling below 20 — the trend read is then gone.` };
    case 'squeeze':
      return { setupFamily: 'Volatility squeeze', confirms: `Bollinger width expanding out of the squeeze with a directional close and participation${volNote}; direction is not assumed until the expansion bar prints.`, invalidates: `Expansion in the opposite direction, or the squeeze persisting for many more bars without resolution.` };
    case 'reversal':
      return { setupFamily: 'Reversal / mean reversion', confirms: `A reclaim (${long ? 'close back above' : 'close back below'}) of the prior structure level with RSI turning ${long ? 'up from oversold' : 'down from overbought'}${num(row.rsi) ? ` (RSI ${row.rsi.toFixed(1)})` : ''}.`, invalidates: `Rejection at the structure level and a new ${long ? 'low' : 'high'} — the reversal thesis fails.` };
    case 'range':
      return { setupFamily: 'Range', confirms: `An actual range break: close outside the range with volume ≥ 1.5× average${volNote}. Inside the range there is nothing to confirm.`, invalidates: `Price returning inside the range after a break (false break).` };
    case 'exhaustion':
      return { setupFamily: 'Extended move — exhaustion risk', confirms: `For continuation: a controlled pullback that holds ${side} the 20-bar average with volume contracting. For reversal: a climax bar followed by a close ${opp} its midpoint.`, invalidates: `Continuation is invalidated by a close ${opp} the 20-bar average; the exhaustion read is invalidated by a fresh ${long ? 'high' : 'low'} on expanding volume.` };
    case 'momentum':
      return { setupFamily: 'Momentum', confirms: `Momentum persists: RSI holds ${long ? '≥ 55' : '≤ 45'} and MACD histogram keeps its sign${num(row.macdHist) ? ` (now ${row.macdHist > 0 ? '+' : ''}${fmt(row.macdHist, 3)})` : ''}.`, invalidates: `RSI crossing back through 50 against the bias or a MACD histogram sign flip.` };
    default:
      return { setupFamily: 'Unclassified', confirms: 'Setup type not classified — treat as observation only until structure is defined.', invalidates: 'n/a' };
  }
}

export function buildAnalysisNarrative(row: AnalysisRowInput): AnalysisNarrative {
  const supports: string[] = [];
  const blockers: string[] = [];
  const long = row.direction === 'bullish';
  const short = row.direction === 'bearish';

  if (num(row.adx)) {
    if (row.adx >= 25) supports.push(`ADX ${row.adx.toFixed(1)} — trend strength present`);
    else if (row.adx < 20) blockers.push(`ADX ${row.adx.toFixed(1)} — no trend strength (range conditions)`);
  }
  if (num(row.rsi)) {
    if (long && row.rsi >= 55 && row.rsi <= 70) supports.push(`RSI ${row.rsi.toFixed(1)} — healthy bullish momentum`);
    else if (short && row.rsi >= 30 && row.rsi <= 45) supports.push(`RSI ${row.rsi.toFixed(1)} — bearish momentum without oversold`);
    else if (row.rsi > 70) blockers.push(`RSI ${row.rsi.toFixed(1)} — overbought; chasing risk`);
    else if (row.rsi < 30) blockers.push(`RSI ${row.rsi.toFixed(1)} — oversold; bounce risk for shorts`);
  }
  if (num(row.price) && num(row.ema200)) {
    const pct = ((row.price - row.ema200) / row.ema200) * 100;
    const above = pct > 0;
    if ((long && above) || (short && !above)) supports.push(`Price ${above ? 'above' : 'below'} EMA200 by ${Math.abs(pct).toFixed(1)}%`);
    else if (row.direction !== 'neutral') blockers.push(`Price ${above ? 'above' : 'below'} EMA200 (${pct.toFixed(1)}%) — against the ${row.direction} bias`);
  } else if (row.ema200 === null || (row.ema200 !== undefined && !num(row.ema200))) {
    blockers.push('EMA200 unavailable — trend anchor missing (insufficient history)');
  }
  const stack = row.enhancements?.emaStack;
  if (stack?.direction && stack.direction !== 'mixed' && stack.direction !== 'neutral') {
    if ((long && stack.direction === 'bullish') || (short && stack.direction === 'bearish')) supports.push(`EMA stack ${stack.direction}${stack.label ? ` (${stack.label})` : ''}`);
    else blockers.push(`EMA stack ${stack.direction} — against bias`);
  }
  const vr = row.liquidity?.volumeRatio;
  if (num(vr)) {
    if (vr >= 1.5) supports.push(`Volume ${vr.toFixed(2)}× the 20-bar average — participation confirms`);
    else if (vr < 0.7) blockers.push(`Volume ${vr.toFixed(2)}× the 20-bar average — thin participation`);
    else supports.push(`Volume ${vr.toFixed(2)}× average — normal participation`);
  } else if (row.liquidity && row.liquidity.avgVolume20 === null) {
    blockers.push('Volume ratio unavailable for this interval');
  }
  if (num(row.liquidity?.adv20)) supports.push(`Average dollar volume ${money(row.liquidity!.adv20 as number)}`);
  const rs = row.enhancements?.relativeStrength;
  if (rs && num(rs.rs)) {
    const bench = rs.benchmark ?? 'benchmark';
    const win = rs.window ? ` over ${rs.window}` : '';
    if ((long && rs.rs >= 1.03) || (short && rs.rs <= 0.97)) supports.push(`Relative strength ${rs.rs.toFixed(3)} vs ${bench}${win} — ${rs.label ?? (rs.rs > 1 ? 'outperforming' : 'underperforming')}`);
    else if ((long && rs.rs <= 0.97) || (short && rs.rs >= 1.03)) blockers.push(`Relative strength ${rs.rs.toFixed(3)} vs ${bench}${win} — against bias`);
    else supports.push(`Relative strength ${rs.rs.toFixed(3)} vs ${bench}${win} — in line`);
    if (rs.benchmarkMissing) blockers.push(`Benchmark ${bench} series unavailable — RS is absolute, not relative`);
  }
  const flags = row.dveFlags ?? [];
  if (flags.includes('SQUEEZE_FIRE')) supports.push('DVE squeeze fired');
  if (flags.includes('COMPRESSED') && num(row.dveBbwp)) supports.push(`Volatility compressed (BBWP ${row.dveBbwp.toFixed(0)})`);
  if (flags.includes('EXHAUSTION_RISK')) blockers.push('DVE exhaustion risk — move already extended');
  if (flags.includes('CLIMAX')) blockers.push('DVE climax volatility');
  if (flags.includes('VOL_TRAP')) blockers.push('DVE volatility trap flagged');
  const ext = row.insight?.extensionState;
  if (ext === 'EXTREME' || ext === 'ELEVATED') blockers.push(`Extension ${ext.toLowerCase()} — late in the move`);
  else if (ext === 'EARLY') supports.push('Extension early — not yet stretched');
  if (row.lifecycle) {
    const lc = String(row.lifecycle).replace(/_/g, ' ').toLowerCase();
    (row.lifecycle === 'READY' || row.lifecycle === 'SETTING_UP' ? supports : blockers).push(`Research lifecycle: ${lc}`);
  }
  if (row.dataTrust) {
    if (row.dataTrust.level !== 'GOOD') for (const r of row.dataTrust.reasons) blockers.push(`Data ${row.dataTrust.level.toLowerCase().replace('_', ' ')}: ${r}`);
    else supports.push('Data trust good — fresh completed bar, indicators complete');
  }
  if (num(row.scoreQuality?.evidenceLayers)) supports.push(`${row.scoreQuality!.evidenceLayers} evidence layers scored`);

  return {
    supports: [...new Set(supports)],
    blockers: [...new Set(blockers)],
    confirmation: buildConfirmation(row),
    extensionLabel: ext ? ext.charAt(0) + ext.slice(1).toLowerCase() : 'n/a',
    stageLabel: row.insight?.setupStage ? row.insight.setupStage.charAt(0) + row.insight.setupStage.slice(1).toLowerCase() : 'n/a',
  };
}
