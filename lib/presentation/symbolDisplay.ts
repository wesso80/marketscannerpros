/** Symbol presentation only. Never pass these labels back to scoring or persistence. */
import { sentenceCaseEngineCode } from '@/lib/presentation/engineLabel';
const reasons: Record<string, string> = {
  NO_SETUP: 'No qualifying setup',
  NO_STRUCTURAL_STOP: 'No clear stop level in the chart',
  'NO_VALIDATED_EDGE: TREND_CONTINUATION': 'Trend-continuation rule not met',
  NO_VALIDATED_EDGE: 'No validated research edge',
  RR_BELOW_MIN: 'Reward-to-risk below the minimum',
};
export function symbolText(value: unknown): string {
  if (value == null) return 'Not recorded';
  let text = String(value).replace(/Golden Egg/g, 'Symbol');
  for (const [code, label] of Object.entries(reasons)) text = text.replaceAll(code, label);
  return text.replace(/\b[A-Z]+(?:_[A-Z]+)+\b/g, code => code.toLowerCase().replaceAll('_', ' '))
    .replace(/\b(?:time unknown|time unavailable)\b/gi, 'observation time not recorded')
    .replace(/\bpercentile unavailable\b/gi, 'rank not recorded')
    .replace(/\b(?:Unknown|Unavailable|Unverified|N\/A|undefined|NaN)\b/gi, 'Not recorded')
    .replace(/\bDegraded\b/gi, 'Data checks failed')
    .replace(/\bTrade Ideas\b/gi, 'Research scenarios')
    .replace(/\bPermission\b/gi, 'Research eligibility')
    .replace(/\bPlaybook\b/gi, 'Research notes')
    .replace(/\bbullish lean\b/gi, 'upward alignment')
    .replace(/\b(?:bullish|LONG)\b(?!-term)/gi, 'upward')
    .replace(/\b(?:bearish|SHORT)\b(?!-term)/gi, 'downward')
    .replace(/\bentry signal\b/gi, 'reference condition')
    .replace(/\bwatch for follow-through\b/gi, 'follow-through not established')
    .replace(/\bWait for decompression\b/gi, 'Decompression not established')
    .replace(/\bmonitor flip conditions\b/gi, 'conditions for a change are not established')
    .replace(/\bMonitor for\b/gi, 'Unconfirmed observation:')
    .replace(/\bMonitor whether\b/gi, 'Unconfirmed whether')
    .replace(/\bbuy\b/gi, 'purchase').replace(/\bsell\b/gi, 'sale')
    .replace(/\bprobability\b/gi, 'outcome estimate')
    .replace(/\blikely\b/gi, 'potentially').replace(/\bshould\b/gi, 'may')
    .replace(/\bwill\b/gi, 'may')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, time => symbolDate(time))
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, day => symbolDate(day,true));
}
export function symbolDate(value: string, sessionOnly = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Observation date not recorded';
  return new Intl.DateTimeFormat('en-AU', sessionOnly
    ? {weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}
    : {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Australia/Sydney',timeZoneName:'short'}).format(date);
}
export function symbolNumber(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return 'Not recorded';
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'ratio') return `${value.toFixed(2)}x`;
  if (unit === 'usd') {
    const abs = Math.abs(value);
    const scale = abs >= 1e12 ? [1e12, 'T'] : abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : null;
    return scale ? `$${(value / Number(scale[0])).toFixed(2)}${scale[1]}` : symbolNumber(value, 'price');
  }
  if (unit === 'price') return `$${Math.abs(value) < 1 && value !== 0 ? Number(value.toPrecision(4)).toString() : value.toLocaleString('en-AU', {minimumFractionDigits:2,maximumFractionDigits:2})}`;
  return value.toLocaleString('en-AU', {maximumFractionDigits:2});
}
export function symbolMetric(value: unknown, unit?: string): string {
  return typeof value === 'number' ? symbolNumber(value, unit) : typeof value === 'boolean' ? value ? 'Yes' : 'No' : symbolText(value);
}

/**
 * Reader label for the Symbol verdict pill. Presentation only.
 *
 * Daily Picks `readerVerdict` (app/daily-pick/wording.ts) maps canonical permission
 * (PASS / WATCH / BLOCK) and turns setup NONE into "No qualifying setup". That is a
 * different surface: this pill already says "No setup" for an equity NONE row, and
 * crypto base stages are not those permissions. Sharing that helper would relabel
 * AAPL or call NEAR's missing base a canonical no-setup. Same pattern here — an
 * explicit table plus a plain fallback — so a raw ALL_CAPS engine token never stays
 * in the pill. Keys are matched after underscores become spaces.
 */
const VERDICT_PILL: Record<string, string> = {
  'NO BASE': 'No base yet',
  'NOT ENOUGH DATA': 'Not enough data',
  'WATCH': 'Base in place',
  'BASE FORMING': 'Base forming',
  'BROKE OUT, RULE NOT MET': 'Broke out, rule not met',
  BREAKOUT: 'Breakout',
  'MEETS V1 RULES': 'Meets the rules',
  EXTENDED: 'Extended',
  'FELL BACK': 'Fell back',
  NONE: 'No setup',
  'NO SETUP': 'No setup',
  BLOCK: 'Blocked',
  BLOCKED: 'Blocked',
  'TREND CONTINUATION': 'Trend continuation',
  PULLBACK: 'Pullback',
  SQUEEZE: 'Squeeze',
  'EXHAUSTION FADE': 'Exhaustion fade',
};

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

function verdictKey(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

function plainEngineFallback(value: string): string {
  const plain = sentenceCaseEngineCode(value);
  if (!plain) return 'Not recorded';
  return ENGINE_TOKEN.test(plain) ? 'Not recorded' : plain;
}

/** Pill text only. Does not change the stored stage, setup type, or score. */
export function symbolVerdictLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  const mapped = VERDICT_PILL[verdictKey(raw)];
  if (mapped) return mapped;
  if (/[a-z]/.test(raw)) return raw;
  return plainEngineFallback(raw);
}

/**
 * Reader labels for Symbol deep views. Presentation only — never feed these
 * strings back into scores, fetches, or stored payloads.
 *
 * Same shape as `symbolVerdictLabel`: an explicit table, then a sentence-case
 * fallback, when the whole value is a code or label. Inside a sentence only an
 * underscore token or a legacy phrase is rewritten — camelCase names and words
 * such as LONG, SHORT, and PASS stay. This table is not the verdict pill.
 * WATCH stays "Watch" here; the pill's "Base in place" belongs only to the
 * crypto stage badge.
 */
const READER: Record<string, string> = {
  'TREND CONTINUATION': 'Trend continuation',
  PULLBACK: 'Pullback',
  SQUEEZE: 'Squeeze',
  'EXHAUSTION FADE': 'Exhaustion fade',
  'MEAN REVERSION': 'Mean reversion',
  BREAKOUT: 'Breakout',
  RANGE: 'Range',
  TREND: 'Trend',
  NONE: 'No setup',
  'NO SETUP': 'No setup',
  LONG: 'Upward',
  SHORT: 'Downward',
  NEUTRAL: 'Neutral',
  ALIGNED: 'Inputs agree',
  'NOT ALIGNED': 'Inputs differ',
  PASS: 'Checks passed',
  WATCH: 'Watch',
  BLOCK: 'Blocked',
  BLOCKED: 'Blocked',
  GOOD: 'Checks passed',
  DEGRADED: 'Some checks failed',
  MISSING: 'Not recorded',
  STALE: 'Older data',
  'INSUFFICIENT DATA': 'Not enough data',
  'NO STRUCTURAL STOP': 'No clear stop level in the chart',
  'NO VALIDATED EDGE': 'No validated research edge',
  'RR BELOW MIN': 'Reward-to-risk below the minimum',
  'STALE DATA': 'Older data',
  'EARNINGS IN WINDOW': 'Earnings inside the holding window',
  'DATA TRUST DEGRADED': 'Data checks failed',
  'INSUFFICIENT HISTORY': 'Not enough history',
  'AT OPPOSING LEVEL': 'At an opposing level',
  'MOMENTUM DISAGREES': 'Momentum disagrees',
  'DIRECTION UNRESOLVED': 'Direction not resolved',
  'PROJECTED TARGET': 'Projected target',
  'UNCALIBRATED TIMEFRAME': 'Uncalibrated timeframe',
  UNCALIBRATED: 'Uncalibrated',
  'NO SIGNAL': 'No signal',
  'ALWAYS OPEN': 'Always open',
  'LONG CROWDED': 'Crowded long',
  'SHORT CROWDED': 'Crowded short',
  'EVENT RISK': 'Event risk',
  'ALPHA VANTAGE': 'Alpha Vantage',
  'TIME SERIES DAILY ADJUSTED': 'Daily (adjusted)',
  'TIME SERIES WEEKLY ADJUSTED': 'Weekly (adjusted)',
  'TIME SERIES DAILY': 'Daily',
  'TIME SERIES INTRADAY': 'Intraday',
  COINGECKO: 'CoinGecko',
  BINANCE: 'Binance',
  'LOCAL DEMO': 'Example data',
  'EARLY CONTEXT': 'Early context',
  'MARKET CONTEXT': 'Market context',
  'SOURCES CHECK': 'Sources check',
  'RULE CHECK': 'Rule check',
};

/** Whole-string section keys. Not applied inside a sentence. */
const SECTION_EXACT: Record<string, string> = {
  price: 'Price',
  ruleCheck: 'Rule check',
  earlyContext: 'Early context',
  marketContext: 'Market context',
  derivatives: 'Derivatives',
  liquidity: 'Liquidity',
  supply: 'Supply',
  levels: 'Levels',
  risks: 'Risks',
  sourcesCheck: 'Sources check',
  notes: 'Notes',
};

const LEGACY_EXACT: Record<string, string> = {
  'legacy grade': 'Indicator reading',
  'legacy confluence': 'Earlier indicator read',
  'legacy engine': 'Earlier read',
};

function labelKey(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').toUpperCase();
}

function readerFallback(value: string): string {
  const words = value.trim().replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').toLowerCase();
  if (!words) return 'Not recorded';
  const plain = words.charAt(0).toUpperCase() + words.slice(1);
  return ENGINE_TOKEN.test(plain) ? 'Not recorded' : plain;
}

function applyLegacyPhrases(text: string): string {
  return text
    .replace(/\blegacy grade\b/gi, 'Indicator reading')
    .replace(/\blegacy confluence\b/gi, 'Earlier indicator read')
    .replace(/\blegacy engine\b/gi, 'Earlier read');
}

/** The entire value is one code or label, not a sentence that happens to contain one. */
function isWholeLabel(raw: string): boolean {
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(raw) && /[a-z][A-Z]/.test(raw)) return true;
  if (/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$/.test(raw)) return true;
  if (/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(raw)) return true;
  return ENGINE_TOKEN.test(raw);
}

function wholeLabel(raw: string): string {
  const mapped = READER[labelKey(raw)];
  if (mapped) return mapped;
  if (/[a-z][A-Z]/.test(raw) || /_/.test(raw) || (/[\s-]/.test(raw) && !/[a-z]/.test(raw))) return readerFallback(raw);
  if (/^[A-Z]{6,}$/.test(raw)) return readerFallback(raw);
  return raw;
}

/**
 * Inside a sentence, only an underscore token (TREND_CONTINUATION) or an
 * explicit legacy phrase is rewritten. CamelCase product names and ordinary
 * capital words (LONG, SHORT, PASS) stay as written.
 */
function replaceProseTokens(text: string): string {
  const out = text.replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, (token) => READER[labelKey(token)] ?? readerFallback(token));
  return applyLegacyPhrases(out);
}

/** Plain reader text. Stored codes stay stored; this only changes what is shown. */
export function readerLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim().replace(/\s+/g, ' ');
  if (!raw) return 'Not recorded';
  if (/^n\/a$/i.test(raw)) return 'Not recorded';
  const legacy = LEGACY_EXACT[raw.toLowerCase()];
  if (legacy) return legacy;
  if (SECTION_EXACT[raw]) return SECTION_EXACT[raw];
  if (isWholeLabel(raw)) return wholeLabel(raw);
  return replaceProseTokens(raw);
}

/**
 * The page source line. A known provider call becomes one short name.
 * Anything else still goes through `readerLabel`, so a new snake_case or
 * ALL_CAPS function name cannot stay raw.
 */
export function readerSourceLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  const av = /alpha[-_ ]?vantage/i.test(raw);
  if (av && /TIME_SERIES_WEEKLY_ADJUSTED/i.test(raw)) return 'Alpha Vantage weekly (adjusted)';
  if (av && /TIME_SERIES_DAILY_ADJUSTED/i.test(raw)) return 'Alpha Vantage daily (adjusted)';
  if (av && /TIME_SERIES_INTRADAY/i.test(raw)) return 'Alpha Vantage intraday';
  if (av && /TIME_SERIES_DAILY/i.test(raw)) return 'Alpha Vantage daily';
  if (av && /REALTIME_OPTIONS/i.test(raw)) return 'Alpha Vantage options';
  if (av && /quote/i.test(raw)) return 'Alpha Vantage quote';
  if (av && raw.length < 80) return 'Alpha Vantage';
  if (/^coingecko$/i.test(raw)) return 'CoinGecko';
  if (/^binance$/i.test(raw)) return 'Binance';
  return readerLabel(raw);
}
