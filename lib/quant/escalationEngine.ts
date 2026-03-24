/**
 * Layer 5 — Escalation Engine
 *
 * Converts PermissionResults into actionable InternalAlerts with:
 *   - Tiered classification (WATCHLIST → INTERESTING → ACTIONABLE → PRIORITY)
 *   - Per-symbol cooldown to prevent alert spam
 *   - Deduplication against active signals
 *   - Thesis generation from dimension data
 *   - TTL / expiry management
 */

import type {
  AlertTier,
  FusionScore,
  InternalAlert,
  PermissionLevel,
  PermissionResult,
  UnifiedRegimeState,
} from './types';
import { DEFAULT_QUANT_CONFIG, type QuantConfig } from './types';

// ─── In-memory cooldown + dedup state ───────────────────────────────────────

const cooldownMap = new Map<string, number>(); // symbol → timestamp when cooldown expires
const activeAlerts = new Map<string, InternalAlert>(); // alertId → alert

// ─── Tier Classification ────────────────────────────────────────────────────

function classifyTier(fusionScore: number, permission: PermissionLevel): AlertTier {
  if (permission === 'PRIORITY_GO' && fusionScore >= 85) return 'PRIORITY';
  if ((permission === 'GO' || permission === 'PRIORITY_GO') && fusionScore >= 75) return 'ACTIONABLE';
  if (fusionScore >= 65) return 'INTERESTING';
  return 'WATCHLIST';
}

// ─── Thesis Generation ──────────────────────────────────────────────────────

function generateThesis(
  score: FusionScore,
  permission: PermissionResult,
  regime: UnifiedRegimeState,
): string {
  const topDims = [...score.dimensions]
    .sort((a, b) => b.normalized - a.normalized)
    .slice(0, 3);

  const dirLabel = score.direction === 'LONG' ? 'BULLISH' : score.direction === 'SHORT' ? 'BEARISH' : 'NEUTRAL';

  const dimExplanations = score.dimensions.map(d => {
    const emoji = d.normalized >= 70 ? '✅' : d.normalized >= 50 ? '◐' : '⚠️';
    return `${emoji} ${d.name}: ${d.normalized.toFixed(0)}/100 (wt ${(d.weight * 100).toFixed(0)}%)`;
  }).join(' | ');

  const strengthPhrases = topDims.map(d => {
    switch (d.name) {
      case 'regime': return `regime is ${regime.phase} with ${regime.confidence}% confidence (${regime.agreement}/4 sources agree)`;
      case 'structure': return `trend structure is aligned (EMA stacking + ADX confirming)`;
      case 'volatility': return `volatility positioning is favorable for entry`;
      case 'momentum': return `momentum indicators (RSI/MACD/Stoch) aligned ${dirLabel.toLowerCase()}`;
      case 'participation': return `volume and institutional participation elevated`;
      case 'asymmetry': return `risk:reward asymmetry favors this position`;
      case 'freshness': return `data is fresh and high-confidence`;
      case 'timing': return `time confluence window active`;
      default: return `${d.name} scoring ${d.normalized.toFixed(0)}`;
    }
  }).join('; ');

  const bottom2 = [...score.dimensions].sort((a, b) => a.normalized - b.normalized).slice(0, 2);
  const weakPhrase = bottom2.map(d => `${d.name} (${d.normalized.toFixed(0)})`).join(', ');

  return `${dirLabel} ${score.symbol} — Fusion ${score.composite.toFixed(0)}/100 in ${regime.phase} regime. ` +
    `WHY: ${strengthPhrases}. ` +
    `Direction confidence: ${score.directionConfidence.toFixed(0)}%. ` +
    `Gates: ${permission.hardGatesPassed}/${permission.hardGatesTotal} hard, soft score ${permission.softGateScore.toFixed(0)}%. ` +
    `Weakest: ${weakPhrase}. ` +
    `ALL DIMS: ${dimExplanations}`;
}

function generateInvalidation(score: FusionScore, regime: UnifiedRegimeState): string {
  const weakest = [...score.dimensions].sort((a, b) => a.normalized - b.normalized)[0];
  const secondWeakest = [...score.dimensions].sort((a, b) => a.normalized - b.normalized)[1];
  return `INVALIDATED IF: (1) regime shifts from ${regime.phase} to RISK_OFF or conflicting, ` +
    `(2) weakest dim ${weakest?.name} (${weakest?.normalized.toFixed(0)}) drops below 30, ` +
    `(3) ${secondWeakest?.name} (${secondWeakest?.normalized.toFixed(0)}) deteriorates, ` +
    `(4) fusion drops below 50, (5) direction flips from ${score.direction}.`;
}

// ─── TTL ────────────────────────────────────────────────────────────────────

function computeTTL(tier: AlertTier): number {
  switch (tier) {
    case 'PRIORITY': return 4 * 60 * 60_000;  // 4 hours
    case 'ACTIONABLE': return 2 * 60 * 60_000; // 2 hours
    case 'INTERESTING': return 1 * 60 * 60_000; // 1 hour
    case 'WATCHLIST': return 30 * 60_000;       // 30 minutes
  }
}

// ─── Core Escalation ────────────────────────────────────────────────────────

export function escalateSignal(
  permission: PermissionResult,
  score: FusionScore,
  regime: UnifiedRegimeState,
  config: QuantConfig = DEFAULT_QUANT_CONFIG,
): InternalAlert | null {
  // Only escalate MONITOR and above (BLOCK already filtered by permission engine)
  if (permission.level === 'BLOCK') return null;

  // Cooldown check
  const now = Date.now();
  const cooldownExpiry = cooldownMap.get(score.symbol);
  if (cooldownExpiry && now < cooldownExpiry) return null;

  // Minimum fusion threshold
  if (score.composite < config.fusionThreshold) return null;

  // Dedup: don't re-alert if same symbol already has an active alert at same or higher tier
  const existingKey = `${score.symbol}_${score.direction}`;
  const existing = activeAlerts.get(existingKey);
  if (existing && existing.status === 'ACTIVE') {
    const tierRank: Record<AlertTier, number> = { WATCHLIST: 1, INTERESTING: 2, ACTIONABLE: 3, PRIORITY: 4 };
    const newTier = classifyTier(score.composite, permission.level);
    if (tierRank[newTier] <= tierRank[existing.tier]) return null; // Same or lower — skip
    // Higher tier — upgrade the existing alert
    existing.status = 'EXPIRED';
  }

  const tier = classifyTier(score.composite, permission.level);
  const ttl = computeTTL(tier);

  const alert: InternalAlert = {
    id: `${score.symbol}_${score.direction}_${now}`,
    symbol: score.symbol,
    tier,
    permission: permission.level,
    fusionScore: score.composite,
    direction: score.direction,
    regime: regime.phase,
    topDimensions: [...score.dimensions]
      .sort((a, b) => b.normalized - a.normalized)
      .slice(0, 4)
      .map(d => ({ name: d.name, score: Math.round(d.normalized) })),
    thesis: generateThesis(score, permission, regime),
    invalidation: generateInvalidation(score, regime),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
    status: 'ACTIVE',
  };

  // Set cooldown
  cooldownMap.set(score.symbol, now + config.cooldownMinutes * 60_000);

  // Track active
  activeAlerts.set(`${score.symbol}_${score.direction}`, alert);

  return alert;
}

/**
 * Escalate all permitted signals. Returns alerts sorted by tier (PRIORITY first).
 * Caps total alerts per scan via config.maxAlertsPerScan.
 */
export function escalateAll(
  permissions: PermissionResult[],
  scores: FusionScore[],
  regime: UnifiedRegimeState,
  config: QuantConfig = DEFAULT_QUANT_CONFIG,
): InternalAlert[] {
  const scoreMap = new Map(scores.map(s => [s.symbol, s]));
  const alerts: InternalAlert[] = [];

  for (const perm of permissions) {
    const score = scoreMap.get(perm.symbol);
    if (!score) continue;

    const alert = escalateSignal(perm, score, regime, config);
    if (alert) alerts.push(alert);
  }

  // Sort by tier priority + fusion score
  const tierRank: Record<AlertTier, number> = { PRIORITY: 4, ACTIONABLE: 3, INTERESTING: 2, WATCHLIST: 1 };
  alerts.sort((a, b) => {
    const tierDiff = (tierRank[b.tier] ?? 0) - (tierRank[a.tier] ?? 0);
    return tierDiff !== 0 ? tierDiff : b.fusionScore - a.fusionScore;
  });

  return alerts.slice(0, config.maxAlertsPerScan);
}

// ─── State management ───────────────────────────────────────────────────────

export function getActiveAlerts(): InternalAlert[] {
  const now = Date.now();
  const results: InternalAlert[] = [];

  for (const [key, alert] of activeAlerts) {
    if (alert.status !== 'ACTIVE') continue;
    if (new Date(alert.expiresAt).getTime() < now) {
      alert.status = 'EXPIRED';
      continue;
    }
    results.push(alert);
  }

  return results.sort((a, b) => {
    const tierRank: Record<AlertTier, number> = { PRIORITY: 4, ACTIONABLE: 3, INTERESTING: 2, WATCHLIST: 1 };
    return (tierRank[b.tier] ?? 0) - (tierRank[a.tier] ?? 0);
  });
}

export function clearCooldowns(): void {
  cooldownMap.clear();
}

export function clearAlerts(): void {
  activeAlerts.clear();
}
