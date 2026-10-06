/**
 * Daily Radar reader copy. Presentation only — the stored report, scores, and codes stay as they are.
 * Explicit table first, then the same sentence-case fallback as the Symbol verdict pill.
 */
import { sentenceCaseEngineCode } from '@/lib/presentation/engineLabel';
import { fixOrdinalSuffixes } from '@/lib/utils/ordinal';

const RADAR_LABELS: Record<string, string> = {
  NEW: 'New',
  DEVELOPING: 'Developing',
  'NEAR TRIGGER': 'Near trigger',
  'CONFIRMED MOVE': 'Confirmed move',
  FAILED: 'Failed',
  DETERIORATING: 'Deteriorating',
  EXPIRED: 'Expired',
  DISCOVERED: 'Discovered',
  WATCHING: 'Watching',
  'SETTING UP': 'Setting up',
  READY: 'Ready',
  INVALIDATED: 'Invalidated',
  'NEW BREAKOUT': 'New breakout',
  'NEW BREAKDOWN': 'New breakdown',
  'NEW TREND RECLAIM': 'New trend reclaim',
  'NEW TREND LOSS': 'New trend loss',
  'NEW RELATIVE STRENGTH': 'New relative strength',
  'NEW RELATIVE WEAKNESS': 'New relative weakness',
  'NEW VOLUME EXPANSION': 'New volume expansion',
  'NEW VOLATILITY EXPANSION': 'New volatility expansion',
  'NEW MOMENTUM ACCELERATION': 'New momentum acceleration',
  'NEW MOMENTUM DIVERGENCE': 'New momentum divergence',
  'NEW SECTOR ROTATION': 'New sector rotation',
  'NEW CRYPTO ROTATION': 'New crypto rotation',
  'NEW CATALYST': 'New catalyst',
  'NEW DERIVATIVES ACTIVITY': 'New derivatives activity',
  'NEW SQUEEZE RELEASE': 'New squeeze release',
  'NEW HIGH': 'New high',
  'NEW LOW': 'New low',
  'GAP UP': 'Gap up',
  'GAP DOWN': 'Gap down',
  'RSI REGIME UP': 'RSI regime up',
  'RSI REGIME DOWN': 'RSI regime down',
  'MACD FLIP UP': 'MACD flip up',
  'MACD FLIP DOWN': 'MACD flip down',
  'HIGH RESEARCH PRIORITY': 'High research priority',
  INVESTIGATE: 'Investigate',
  WATCH: 'Watch',
  'LOW QUALITY MOVE': 'Low-quality move',
  'LOW QUALITY': 'Low quality',
  IGNORE: 'Ignore',
  PARABOLIC: 'Parabolic',
  'TOO EXTENDED': 'Too extended',
  'THIN LIQUIDITY': 'Thin liquidity',
  'NO VOLUME CONFIRMATION': 'No volume confirmation',
  'DOWNTREND RALLY': 'Downtrend rally',
  'NO CATALYST': 'No catalyst',
  'WEAK RELATIVE STRENGTH': 'Weak relative strength',
  'SECTOR NOT CONFIRMING': 'Sector not confirming',
  'DATA QUALITY': 'Data quality',
  'STALE PRINT': 'Stale print',
  'CROWDED DERIVATIVES': 'Crowded derivatives',
  'BETA ONLY': 'Beta only',
  'NO PRIOR LEADERSHIP': 'No prior leadership',
  'EARLY BREAKOUT': 'Early breakout',
  'BREAKOUT CONFIRMATION': 'Breakout confirmation',
  'TREND RECLAIM': 'Trend reclaim',
  'TREND CONTINUATION': 'Trend continuation',
  'MOMENTUM CONTINUATION': 'Momentum continuation',
  'RELATIVE STRENGTH LEADER': 'Relative strength leader',
  'SECTOR ROTATION': 'Sector rotation',
  'CRYPTO ROTATION': 'Crypto rotation',
  'VOLATILITY EXPANSION': 'Volatility expansion',
  'CATALYST MOVE': 'Catalyst move',
  'REVERSAL WATCH': 'Reversal watch',
  'OVERSOLD RECOVERY': 'Oversold recovery',
  'SQUEEZE RELEASE': 'Squeeze release',
  'MEAN REVERSION': 'Mean reversion',
  'DETERIORATING LEADER': 'Deteriorating leader',
  'FAILED BREAKOUT': 'Failed breakout',
  BREAKDOWN: 'Breakdown',
  'EARLY STAGE': 'Early stage',
  'ALREADY MOVED': 'Already moved',
  'GENUINE GROUP MOVE': 'Genuine group move',
  'GROUP WEAKNESS': 'Group weakness',
  PARTIAL: 'Partial',
  ISOLATED: 'Isolated',
  MIXED: 'Mixed',
  'SINGLE NAME': 'Single name',
  'NOT ALIGNED': 'Not aligned',
  ALIGNED: 'Aligned',
  CONDITIONAL: 'Conditional',
  EARLY: 'Early',
  MID: 'Mid',
  EXTENDED: 'Extended',
  'MID MOVE': 'Mid-move',
  'NEWLY STRENGTHENING': 'Newly strengthening',
  'LOSING LEADERSHIP': 'Losing leadership',
  SENT: 'Sent',
  'SUPPRESSED HEALTH': 'Held back',
  'NO RECIPIENT': 'No recipient',
  PENDING: 'Pending',
};

const PHRASES: Array<[string, string]> = [
  ['NEWLY STRENGTHENING', RADAR_LABELS['NEWLY STRENGTHENING']],
  ['LOSING LEADERSHIP', RADAR_LABELS['LOSING LEADERSHIP']],
  ['AT NEW 20d HIGH', 'At a new 20-day high'],
  ['AT NEW 20D HIGH', 'At a new 20-day high'],
];

const SINGLE_WORD = Object.keys(RADAR_LABELS)
  .filter((key) => !key.includes(' '))
  .sort((a, b) => b.length - a.length);
const SINGLE_WORD_RE = new RegExp(`\\b(?:${SINGLE_WORD.join('|')})\\b`, 'g');

function labelKey(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

/** One engine code → reader label. Unknown tokens use sentence case. Prose that already has lowercase letters stays. */
export function radarReaderLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  const mapped = RADAR_LABELS[labelKey(raw)];
  if (mapped) return mapped;
  if (/[a-z]/.test(raw)) return fixOrdinalSuffixes(raw);
  const plain = sentenceCaseEngineCode(raw);
  return plain ? fixOrdinalSuffixes(plain) : 'Not recorded';
}

/** Replace engine codes embedded in a sentence. Tickers and other plain capitals stay. */
export function radarReaderText(text: string | null | undefined): string {
  if (!text) return '';
  let out = String(text);
  for (const [phrase, label] of PHRASES) out = out.replaceAll(phrase, label);
  out = out.replace(/\b[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+\b/g, (token) => RADAR_LABELS[labelKey(token)] ?? sentenceCaseEngineCode(token));
  out = out.replace(SINGLE_WORD_RE, (token) => RADAR_LABELS[token] ?? token);
  return fixOrdinalSuffixes(out);
}

const IMPLEMENTATION_NOTE = /\b(?:cron|CRON_SECRET|refresh-fundamentals|company_overview|jarvis_[a-z0-9_]*|PRODUCTION_DB|news_events|earnings_calendar|postgres|database|admin trigger|write path|migration \d+|symbol_universe|private store|DB fallback)\b/i;

/** True when a line is a database, cron, or store implementation note. */
export function isRadarImplementationNote(text: string | null | undefined): boolean {
  return !!text && IMPLEMENTATION_NOTE.test(text);
}

/**
 * A data-quality line for readers. Database and cron notes are dropped.
 * The missing-history line is the one case that still needs a plain reader sentence.
 */
export function radarReaderGap(text: string | null | undefined): string | null {
  if (!text) return null;
  if (/private store/i.test(text)) return 'Earlier session history is not on file yet.';
  if (isRadarImplementationNote(text)) return null;
  const plain = radarReaderText(text).trim();
  return plain || null;
}

/** Feed detail with database/cron clauses removed. Null when nothing reader-facing remains. */
export function radarReaderFeedDetail(text: string | null | undefined): string | null {
  if (!text) return null;
  const stripped = text
    .replace(/,?\s*\d*\s*DB fallback(?:\s*\([^)]*\))?/gi, '')
    .replace(/\s*\([^)]*(?:company_overview|jarvis_|PRODUCTION_DB|cron|database|postgres|symbol_universe)[^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  if (!stripped || isRadarImplementationNote(stripped)) return null;
  return radarReaderText(stripped);
}

export const RADAR_READER_LABELS = RADAR_LABELS;
