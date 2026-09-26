/**
 * Golden Egg ← canonical engine (lib/scoring/canonical). Pure.
 *
 * The canonical verdict (permission / grade / setup / direction / levels) is the PRIMARY Golden Egg verdict. The
 * v2 confluence score and its grade/assessment are kept as secondary, labelled "legacy confluence", under
 * `payload.legacyConfluence`. The result is attached as `payload.canonicalVerdict` — NOT `payload.canonical`, which
 * is the Golden Egg data packet (data trust, indicators, levels, timing) that Deep Analysis already consumes.
 */
import type { PriceData } from '@/lib/goldenEggFetchers';
import { evaluateCanonicalFromBars } from '@/lib/scoring/canonical/engine';
import { evaluateRegimeOverlay, overlayForDirection, type RegimeOverlayInputs } from '@/lib/scoring/canonical/regimeOverlay';
import { SETUP_LABEL } from '@/lib/scoring/canonical/scannerAdapter';
import { noSetupDisplay, targetBasisLabel } from '@/lib/scoring/canonical/display';
import type { CanonicalAssetClass, CanonicalBar, CanonicalLevels, CanonicalReason, CanonicalResult } from '@/lib/scoring/canonical/types';
import type { Direction, GoldenEggPayload, PublicAssessment } from '@/src/features/goldenEgg/types';

/** Oldest-first canonical bars from the Golden Egg price history (null volume when the provider gave none). */
export function goldenEggCanonicalBars(priceData: Pick<PriceData, 'historicalCloses' | 'historicalOpens' | 'historicalHighs' | 'historicalLows' | 'historicalDates' | 'historicalVolumes'>): CanonicalBar[] {
  const c = priceData.historicalCloses ?? [];
  const o = priceData.historicalOpens, h = priceData.historicalHighs, l = priceData.historicalLows, d = priceData.historicalDates, v = priceData.historicalVolumes;
  if (!h || !l || h.length !== c.length || l.length !== c.length) return [];
  const bars: CanonicalBar[] = [];
  for (let i = 0; i < c.length; i++) {
    const close = c[i], high = h[i], low = l[i];
    const open = o && o.length === c.length ? o[i] : i > 0 ? c[i - 1] : close;
    if (![open, high, low, close].every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) continue;
    const raw = d?.[i];
    const t = raw ? (raw.length === 10 ? `${raw}T00:00:00.000Z` : raw.includes('T') ? raw : raw.replace(' ', 'T')) : String(i);
    const vol = v?.[i];
    bars.push({ t, open, high, low, close, volume: typeof vol === 'number' && Number.isFinite(vol) && vol > 0 ? vol : null });
  }
  return bars;
}

export interface GoldenEggCanonicalContext {
  symbol: string;
  assetClass: CanonicalAssetClass;
  timeframe: string;
  /** Data trust level from the Golden Egg packet (STALE → hard block). */
  trustLevel?: string | null;
  /** Earnings inside the holding window (same rule as lib/scanner/hardBlocks) → hard block. */
  earningsInWindow?: { date: string | null; days: number; windowDays: number } | null;
  overlay?: RegimeOverlayInputs | null;
  dataTimestamp?: string | null;
}

export function evaluateGoldenEggCanonical(bars: CanonicalBar[], ctx: GoldenEggCanonicalContext): CanonicalResult | null {
  if (bars.length < 30) return null;
  const hardBlocks: CanonicalReason[] = [];
  if (ctx.trustLevel === 'STALE') hardBlocks.push({ code: 'STALE_DATA', message: 'Golden Egg data trust is STALE' });
  if (ctx.earningsInWindow) {
    hardBlocks.push({ code: 'EARNINGS_IN_WINDOW', message: `Earnings ${ctx.earningsInWindow.date ?? ''} (in ${ctx.earningsInWindow.days}d) inside the ${ctx.earningsInWindow.windowDays}-day holding window`.replace('  ', ' ') });
  }
  const dataWatchReasons: CanonicalReason[] = ctx.trustLevel === 'DEGRADED' || ctx.trustLevel === 'INSUFFICIENT_DATA'
    ? [{ code: 'DATA_TRUST_DEGRADED', message: `Golden Egg data trust is ${ctx.trustLevel}` }] : [];
  const flags: CanonicalReason[] = ctx.timeframe.toLowerCase() !== 'daily'
    ? [{ code: 'UNCALIBRATED_TIMEFRAME', message: `Outcome calibration covers daily bars only; this ${ctx.timeframe} verdict is uncalibrated factor alignment (no probability or expected-R claim)` }] : [];
  return evaluateCanonicalFromBars(bars.slice(-500), {
    symbol: ctx.symbol, assetClass: ctx.assetClass, timeframe: ctx.timeframe,
    hardBlocks, dataWatchReasons, flags, trust: ctx.trustLevel ?? null, dataTimestamp: ctx.dataTimestamp ?? bars[bars.length - 1]?.t ?? null,
    regimeOverlay: ctx.overlay ? overlayForDirection(evaluateRegimeOverlay(ctx.overlay, ctx.assetClass)) : undefined,
  });
}

export const CANONICAL_TO_ASSESSMENT: Record<CanonicalResult['permission'], PublicAssessment> = { PASS: 'ALIGNED', WATCH: 'WATCH', BLOCK: 'NOT_ALIGNED' };
export const canonicalToDirection = (d: CanonicalResult['direction']): Direction => (d === 'long' ? 'LONG' : d === 'short' ? 'SHORT' : 'NEUTRAL');

export type GoldenEggLegacyConfluence = NonNullable<GoldenEggPayload['legacyConfluence']>;

/**
 * Make the canonical verdict primary on a Golden Egg payload (returns a new object). Headline fields that the UI,
 * Deep Analysis and signal recording read — layer1.assessment/direction/grade/primaryBlocker/flipConditions and
 * payload.canonical.verdict — now agree with the canonical engine. The v2 confluence score stays available as
 * `layer1.confluenceScore` / `layer1.confidence` and, with its original grade/assessment, in `legacyConfluence`.
 * Whenever a canonical setup with levels exists, every level panel's data — the Golden Egg scenario (layer2.scenario:
 * reference/trigger, invalidation, reaction zones, R), layer2.setup.invalidation and the packet levels /
 * confirmation / invalidation that Deep Analysis reads — is rebuilt from the canonical setup's own direction and
 * levels, so a canonical short never shows the legacy engine's long stop/targets (RS-13).
 */
export function applyCanonicalToGoldenEgg(payload: GoldenEggPayload, c: CanonicalResult): GoldenEggPayload {
  const l1 = payload.layer1;
  const legacy: GoldenEggLegacyConfluence = {
    label: 'legacy confluence (secondary)',
    assessment: l1.assessment, direction: l1.direction, grade: l1.grade, confluenceScore: l1.confluenceScore,
    primaryBlocker: l1.primaryBlocker ?? null, flipConditions: l1.flipConditions,
    levels: payload.canonical?.levels ?? null,
  };
  const assessment = CANONICAL_TO_ASSESSMENT[c.permission];
  const direction = canonicalToDirection(c.direction);
  const setup = SETUP_LABEL[c.setupType] ?? c.setupType;
  const reasons = c.permission === 'BLOCK' ? c.blockReasons : c.permission === 'WATCH' ? c.watchReasons : [];
  const primaryBlocker = reasons[0] ? `${reasons[0].code}: ${reasons[0].message}` : undefined;
  const flipConditions: GoldenEggPayload['layer1']['flipConditions'] = c.permission === 'PASS'
    ? []
    : reasons.map((r, i) => ({ id: `canonical_${r.code.toLowerCase()}_${i}`, text: `${r.code}: ${r.message}`, severity: 'must' as const }));

  const out: GoldenEggPayload = {
    ...payload,
    layer1: {
      ...l1, assessment, direction, grade: c.grade, primaryBlocker, flipConditions,
      primaryDriver: c.setupType === 'NONE' ? l1.primaryDriver : `${setup} ${c.direction} · canonical score ${c.score}`,
      cta: c.permission === 'PASS' ? l1.cta : { ...l1.cta, primary: 'SET_ALERT' },
    },
    canonicalVerdict: c,
    legacyConfluence: legacy,
  };

  const lv = canonicalSetupLevels(c);
  if (lv) {
    const long = c.direction === 'long';
    out.layer2 = {
      ...payload.layer2,
      setup: { ...payload.layer2?.setup, invalidation: `The canonical ${c.direction} setup is invalidated by a close ${long ? 'below' : 'above'} ${fmtLevel(lv.invalidation)}.` },
      scenario: {
        referenceTrigger: `${setup} ${c.direction}: canonical entry ${fmtLevel(lv.entry)} (last close); the setup holds while price stays ${long ? 'above' : 'below'} ${fmtLevel(lv.invalidation)}`,
        referenceLevel: { type: c.permission === 'PASS' ? 'reference' : 'confirmation', price: lv.entry },
        invalidationLevel: { price: lv.invalidation, logic: invalidationLogic(lv, long) },
        reactionZones: [{ price: lv.target, rMultiple: lv.riskReward, note: `Canonical target (${targetBasisLabel(lv)})` }],
        hypotheticalRr: { expectedR: lv.riskReward, minR: payload.layer2?.scenario?.hypotheticalRr?.minR ?? 1.5 },
        ...(payload.layer2?.scenario?.hypotheticalRisk ? { hypotheticalRisk: payload.layer2.scenario.hypotheticalRisk } : {}),
      },
    };
  }

  if (payload.canonical) {
    const packet = { ...payload.canonical };
    packet.verdict = { ...packet.verdict, assessment, direction, grade: c.grade, primaryBlocker: primaryBlocker ?? null, setupType: c.setupType === 'NONE' ? packet.verdict.setupType : c.setupType, setupNote: c.setupType === 'NONE' ? packet.verdict.setupNote : `${setup} (canonical ${c.score}/100, ${c.permission})` };
    if (lv) {
      const mech = lv.invalidationBasis === 'atr_fallback';
      const above = c.direction === 'long';
      packet.levels = {
        reference: { price: lv.entry, basis: 'structural', label: 'Canonical entry (last close)' },
        invalidation: { price: lv.invalidation, basis: mech ? 'mechanical' : 'structural', label: `Canonical invalidation (${lv.invalidationBasis.replace('_', ' ')})`, distanceAtr: typeof lv.riskAtr === 'number' ? lv.riskAtr : null },
        zones: [{ price: lv.target, basis: lv.targetBasis === 'projected' ? 'mechanical' : 'structural', label: `Canonical target (${targetBasisLabel(lv)})`, rMultiple: lv.riskReward }],
        illustrativeR: lv.riskReward,
      };
      packet.confirmation = [`${setup} ${c.direction} setup holds while price stays ${above ? 'above' : 'below'} ${fmtLevel(lv.invalidation)}`];
      packet.invalidation = [`A close ${above ? 'below' : 'above'} ${fmtLevel(lv.invalidation)} invalidates the canonical ${c.direction} setup`];
    } else if (direction !== l1.direction) {
      // No usable canonical setup and the legacy text described another direction: replace it so nothing reads as
      // the opposite trade.
      packet.confirmation = ['No canonical setup is eligible — wait for a trend-continuation, pullback, squeeze or exhaustion setup to form'];
      packet.invalidation = [];
      packet.levels = { ...packet.levels, reference: { ...packet.levels.reference, label: `Legacy confluence: ${packet.levels.reference.label}` } };
    }
    out.canonical = packet;
  }
  if (out.layer3?.narrative && (assessment !== l1.assessment || direction !== l1.direction)) {
    out.layer3 = { ...out.layer3, narrative: { ...out.layer3.narrative, summary: canonicalNarrativeSummary(payload.meta.symbol, c, l1) } };
  }
  return out;
}

/** The canonical setup's levels when a directional setup exists and its geometry matches its direction
 *  (long: stop < entry < target; short: target < entry < stop); otherwise null. */
export function canonicalSetupLevels(c: CanonicalResult): CanonicalLevels | null {
  const lv = c.levels;
  if (!lv || c.setupType === 'NONE' || c.direction === 'neutral') return null;
  if (![lv.entry, lv.invalidation, lv.target, lv.riskReward].every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const ok = c.direction === 'long' ? lv.invalidation < lv.entry && lv.target > lv.entry : lv.invalidation > lv.entry && lv.target < lv.entry;
  return ok ? lv : null;
}

function fmtLevel(x: number): string {
  const a = Math.abs(x);
  return String(Number(x.toFixed(a >= 1000 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 8)));
}

function invalidationLogic(lv: CanonicalLevels, long: boolean): string {
  const side = long ? 'Below' : 'Above';
  const atr = typeof lv.riskAtr === 'number' && Number.isFinite(lv.riskAtr) ? `, ${Number(lv.riskAtr.toFixed(2))}x ATR from entry` : '';
  const basis = lv.invalidationBasis === 'swing' ? `the last confirmed swing ${long ? 'low' : 'high'}`
    : lv.invalidationBasis === 'recent_extreme' ? `the recent exhaustion ${long ? 'low' : 'high'}`
    : 'an ATR-based model stop (no structural level)';
  return `${side} ${basis} (canonical setup${atr})`;
}

const LEGACY_LEAN: Record<Direction, string> = { LONG: 'a bullish lean', SHORT: 'a bearish lean', NEUTRAL: 'no clear lean' };
const trimStop = (s: string) => s.trim().replace(/[.\s]+$/, '');

/** Plain-sentence Golden Egg narrative summary for the canonical verdict (no raw engine labels such as
 *  "canonical verdict BLOCK · grade F"). */
export function canonicalNarrativeSummary(symbol: string, c: CanonicalResult, l1: Pick<GoldenEggPayload['layer1'], 'confluenceScore' | 'direction'>): string {
  const legacy = ` The older confluence model scores it ${l1.confluenceScore}/100 with ${LEGACY_LEAN[l1.direction] ?? 'no clear lean'} (secondary context only).`;
  const none = noSetupDisplay(c);
  if (none) {
    if (none.kind === 'blocked') return `${symbol}: no trade setup is allowed right now — ${trimStop(none.detail ?? 'blocked')}.${legacy}`;
    const closest = none.detail?.startsWith('Closest: ') ? ` The closest candidate was ${trimStop(none.detail.slice(9))}.` : none.detail ? ` ${trimStop(none.detail)}.` : '';
    return `${symbol}: there is no qualifying setup right now.${closest}${legacy}`;
  }
  const setup = `${c.direction === 'neutral' ? '' : `${c.direction} `}${(SETUP_LABEL[c.setupType] ?? c.setupType).toLowerCase()} setup`;
  const reasons = c.permission === 'BLOCK' ? c.blockReasons : c.permission === 'WATCH' ? c.watchReasons : [];
  // Engine reasons lead with the raw code ("EXHAUSTION_FADE short: …"): say it in words ("exhaustion fade (short): …").
  const why = reasons[0] ? trimStop(reasons[0].message).replace(/^([A-Z][A-Z_]+) (long|short)\b/, (_m, code: string, dir: string) => `${(SETUP_LABEL[code] ?? code.replace(/_/g, ' ')).toLowerCase()} (${dir})`) : '';
  const lead = c.permission === 'PASS'
    ? `${symbol}: a ${setup} qualifies (grade ${c.grade}).`
    : c.permission === 'WATCH'
      ? `${symbol}: a ${setup} is forming but is on watch (grade ${c.grade})${why ? ` because ${/^[A-Z][a-z]/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why}` : ''}.`
      : `${symbol}: a ${setup} was found but is blocked${why ? ` — ${why}` : ''}.`;
  return `${lead}${legacy}`;
}
