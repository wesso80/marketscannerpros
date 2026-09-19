/**
 * Customer-facing labels for internal enums. Presentation only — never changes persisted values.
 * Use `humanizeEnum` for anything not in the explicit maps.
 */

const EXPLICIT: Record<string, string> = {
  // Market regime (lib/useRegime + /api/regime)
  RANGE_NEUTRAL: 'Range / Neutral',
  TREND_UP: 'Trend Up',
  TREND_DOWN: 'Trend Down',
  VOL_EXPANSION: 'Vol Expansion',
  VOL_CONTRACTION: 'Vol Contraction',
  RISK_OFF_STRESS: 'Risk-Off Stress',
  RISK_OFF: 'Risk-Off',
  RISK_ON: 'Risk-On',
  // Watchlist / research lifecycle (Scanner + MSP Radar)
  NEW: 'New',
  DEVELOPING: 'Developing',
  NEAR_TRIGGER: 'Near Trigger',
  CONFIRMED_MOVE: 'Confirmed Move',
  DETERIORATING: 'Deteriorating',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
  DISCOVERED: 'Discovered',
  WATCHING: 'Watching',
  SETTING_UP: 'Setting Up',
  READY: 'Ready',
  INVALIDATED: 'Invalidated',
  // Setup / opportunity types
  BREAKOUT_CONFIRMATION: 'Breakout Confirmation',
  TREND_RECLAIM: 'Trend Reclaim',
  SQUEEZE_RELEASE: 'Squeeze Release',
  VOLATILITY_EXPANSION: 'Volatility Expansion',
  TREND_CONTINUATION: 'Trend Continuation',
  MEAN_REVERSION: 'Mean Reversion',
  // Research status
  HIGH_RESEARCH_PRIORITY: 'High Research Priority',
  NEW_STRENGTH: 'New Strength',
  NEW_WEAKNESS: 'New Weakness',
  LOW_QUALITY_MOVE: 'Low-Quality Move',
  EARLY_STAGE: 'Early Stage',
  ALREADY_MOVED: 'Already Moved',
  LOW_QUALITY: 'Low Quality',
  GENUINE_GROUP_MOVE: 'Genuine Group Move',
  MIXED: 'Mixed',
  SINGLE_NAME: 'Single Name',
  NOT_ALIGNED: 'Not Aligned',
  ALIGNED: 'Aligned',
  CONDITIONAL: 'Conditional',
};

const KEEP_UPPER = new Set(['ATR', 'RSI', 'ADX', 'EMA', 'SMA', 'BB', 'OI', 'RS', 'DVE', 'MSP', 'ETF', 'AI', 'R:R', 'USD', 'BTC', 'ETH']);

/** `SOME_ENUM_VALUE` → `Some Enum Value`; known values use the curated label. Non-enum strings pass through. */
export function humanizeEnum(value: string | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const raw = String(value).trim();
  const key = raw.toUpperCase();
  if (EXPLICIT[key]) return EXPLICIT[key];
  // Only transform tokens that look like enums (upper-case with underscores/hyphens); leave prose alone.
  if (!/^[A-Z0-9][A-Z0-9_\-/]*$/.test(raw) && !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(raw)) return raw;
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

export const regimeLabel = (v: string | null | undefined) => humanizeEnum(v, 'Unknown');
export const lifecycleLabel = (v: string | null | undefined) => humanizeEnum(v);
export const setupLabel = (v: string | null | undefined) => humanizeEnum(v);

/** Replace enum tokens embedded in prose (e.g. "NEAR_TRIGGER (score 91): NEW_VOLUME_EXPANSION") with readable labels. */
export function humanizeText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (tok) => humanizeEnum(tok, tok));
}
