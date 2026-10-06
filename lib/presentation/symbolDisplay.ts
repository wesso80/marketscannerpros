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
