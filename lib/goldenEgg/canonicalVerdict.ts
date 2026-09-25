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
import type { CanonicalAssetClass, CanonicalBar, CanonicalReason, CanonicalResult } from '@/lib/scoring/canonical/types';
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
    ? [{ code: 'THRESHOLDS_DAILY_CALIBRATED', message: `Canonical thresholds were calibrated on daily bars; ${ctx.timeframe} verdicts use the same cut-offs` }] : [];
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
 * When the canonical direction differs from the legacy direction, the packet levels are replaced by the canonical
 * levels so invalidation/targets never describe the opposite trade.
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

  if (payload.canonical) {
    const packet = { ...payload.canonical };
    packet.verdict = { ...packet.verdict, assessment, direction, grade: c.grade, primaryBlocker: primaryBlocker ?? null, setupType: c.setupType === 'NONE' ? packet.verdict.setupType : c.setupType, setupNote: c.setupType === 'NONE' ? packet.verdict.setupNote : `${setup} (canonical ${c.score}/100, ${c.permission})` };
    if (c.levels && c.direction !== 'neutral' && direction !== l1.direction) {
      const lv = c.levels;
      const mech = lv.invalidationBasis === 'atr_fallback';
      packet.levels = {
        reference: { price: lv.entry, basis: 'structural', label: 'Canonical entry (last close)' },
        invalidation: { price: lv.invalidation, basis: mech ? 'mechanical' : 'structural', label: `Canonical invalidation (${lv.invalidationBasis.replace('_', ' ')})`, distanceAtr: null },
        zones: [{ price: lv.target, basis: lv.targetBasis === 'projected' ? 'mechanical' : 'structural', label: `Canonical target (${lv.targetBasis.replace('_', ' ')})`, rMultiple: lv.riskReward }],
        illustrativeR: lv.riskReward,
      };
    }
    if (direction !== l1.direction) {
      // Legacy confirmation/invalidation text described the legacy direction; replace it so nothing reads as the
      // opposite trade.
      if (c.levels && c.direction !== 'neutral') {
        const above = c.direction === 'long';
        packet.confirmation = [`${setup} ${c.direction} setup holds while price stays ${above ? 'above' : 'below'} ${c.levels.invalidation}`];
        packet.invalidation = [`A close ${above ? 'below' : 'above'} ${c.levels.invalidation} invalidates the canonical ${c.direction} setup`];
      } else {
        packet.confirmation = ['No canonical setup is eligible — wait for a trend-continuation, pullback, squeeze or exhaustion setup to form'];
        packet.invalidation = [];
        packet.levels = { ...packet.levels, reference: { ...packet.levels.reference, label: `Legacy confluence: ${packet.levels.reference.label}` } };
      }
    }
    out.canonical = packet;
  }
  if (out.layer3?.narrative && (assessment !== l1.assessment || direction !== l1.direction)) {
    const why = primaryBlocker ? ` ${primaryBlocker}.` : '';
    out.layer3 = {
      ...out.layer3,
      narrative: {
        ...out.layer3.narrative,
        summary: `${payload.meta.symbol}: canonical verdict ${c.permission} · grade ${c.grade} · ${setup}${c.direction !== 'neutral' ? ` ${c.direction}` : ''}.${why} Legacy confluence ${l1.confluenceScore}/100 read ${l1.assessment} ${l1.direction} (secondary).`,
      },
    };
  }
  return out;
}
