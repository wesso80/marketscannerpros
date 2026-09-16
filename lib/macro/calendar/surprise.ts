import type {
  AssetBias,
  AssetImpact,
  AssetSensitivity,
  AssetTag,
  CountryCode,
  EventCategory,
  HigherMeans,
  PolicyLean,
  SurpriseResult,
} from './types';

const SCENARIO_DISCLAIMER =
  'Scenario sensitivity only. Describes how these assets have typically been sensitive to this kind of surprise; not a prediction or a directional call.';

/**
 * Parse provider value strings such as "2.9%", "-0.1%", "150K", "1.2M", "".
 * Returns null for anything non-numeric. Never substitutes a default.
 */
export function parseProviderNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').replace(/%/g, '').replace(/pp$/i, '').trim();
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  // Provider values for K-denominated series are already expressed in K; scale
  // only when the suffix disagrees with that convention.
  const suffix = (m[2] ?? '').toUpperCase();
  if (suffix === 'M') return n * 1000;
  if (suffix === 'B') return n * 1_000_000;
  return n;
}

export function formatValue(value: number | null, unit: string | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  if (unit === 'K') return `${value.toFixed(0)}K`;
  const oneDecimalExact = Math.abs(Math.round(value * 10) - value * 10) < 1e-9;
  const num = oneDecimalExact ? value.toFixed(1) : value.toFixed(2);
  return unit === '%' ? `${num}%` : num;
}

function formatSurpriseLabel(raw: number, unit: string | null): string {
  const sign = raw > 0 ? '+' : raw < 0 ? '-' : '';
  const abs = Math.abs(raw);
  if (unit === 'K') return `${sign}${abs.toFixed(0)}K`;
  const oneDecimalExact = Math.abs(Math.round(abs * 10) - abs * 10) < 1e-9;
  const num = oneDecimalExact ? abs.toFixed(1) : abs.toFixed(2);
  return unit === '%' ? `${sign}${num}pp` : `${sign}${num}`;
}

/** Policy lean given the sign of a surprise and what "higher" means for this indicator. */
export function leanFromSurprise(raw: number, higherMeans: HigherMeans, tolerance = 0): PolicyLean {
  if (Math.abs(raw) <= tolerance) return 'NEUTRAL';
  const above = raw > 0;
  if (higherMeans === 'HAWKISH') return above ? 'HAWKISH' : 'DOVISH';
  return above ? 'DOVISH' : 'HAWKISH';
}

/**
 * Compute the surprise for a released event.
 * Returns null when either actual or consensus is missing — a forecast is
 * never substituted for an actual.
 */
export function computeSurprise(args: {
  actual: number | null;
  consensus: number | null;
  higherMeans: HigherMeans;
  unit: string | null;
  surpriseScale: number | null;
}): SurpriseResult | null {
  const { actual, consensus, higherMeans, unit, surpriseScale } = args;
  if (actual === null || consensus === null) return null;
  const raw = Number((actual - consensus).toPrecision(10));
  const tolerance = unit === '%' ? 0.0001 : 0;
  const direction: SurpriseResult['direction'] = Math.abs(raw) <= tolerance ? 'INLINE' : raw > 0 ? 'ABOVE' : 'BELOW';
  const normalized = surpriseScale && surpriseScale > 0 ? Number((raw / surpriseScale).toFixed(2)) : null;
  return {
    raw,
    normalized,
    direction,
    lean: leanFromSurprise(raw, higherMeans, tolerance),
    label: direction === 'INLINE' ? 'in line' : formatSurpriseLabel(raw, unit),
    unit: unit === '%' ? 'pp' : unit,
  };
}

const CURRENCY_ASSET: Partial<Record<CountryCode, AssetTag>> = {
  US: 'USD',
  JP: 'JPY',
  EU: 'EUR',
  UK: 'GBP',
  AU: 'AUD',
  CA: 'CAD',
};

const ALL_ASSETS: AssetTag[] = ['USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'US10Y', 'NQ', 'SPX', 'BTC', 'ETH', 'Gold'];

/** Assets usually most sensitive to a release from this country/category. */
export function primaryAssets(countryCode: CountryCode, category: EventCategory): AssetTag[] {
  const home = CURRENCY_ASSET[countryCode];
  if (countryCode === 'US') {
    if (category === 'inflation' || category === 'central_bank') return ['USD', 'US10Y', 'NQ', 'SPX', 'Gold', 'BTC'];
    if (category === 'employment') return ['USD', 'US10Y', 'SPX', 'NQ'];
    return ['USD', 'US10Y', 'SPX'];
  }
  if (countryCode === 'JP') return ['JPY', 'USD', 'US10Y', 'NQ'];
  if (countryCode === 'CN') return ['AUD', 'USD', 'Gold'];
  if (countryCode === 'NZ') return ['AUD'];
  if (countryCode === 'CH') return ['EUR', 'Gold'];
  if (countryCode === 'KR' || countryCode === 'IN') return ['USD'];
  return home ? [home, 'USD'] : ['USD'];
}

function bias(asset: AssetTag, b: AssetBias, note: string): AssetSensitivity {
  return { asset, bias: b, note };
}

/**
 * Post-release sensitivity read. Wording is deliberately conditional.
 */
export function realizedSensitivity(countryCode: CountryCode, lean: PolicyLean, category: EventCategory): AssetSensitivity[] {
  if (lean === 'NEUTRAL' || lean === 'UNKNOWN') {
    return ALL_ASSETS.map((a) => bias(a, 'LOW', 'In-line print; limited repricing pressure from this release alone.'));
  }
  const hawkish = lean === 'HAWKISH';
  const home = CURRENCY_ASSET[countryCode];
  const cb = countryCode;
  const out: AssetSensitivity[] = [];

  for (const asset of ALL_ASSETS) {
    if (home && asset === home) {
      out.push(bias(asset, hawkish ? 'SUPPORTIVE' : 'PRESSURE', `${hawkish ? 'Hawkish' : 'Dovish'} ${cb} surprise has historically been ${hawkish ? 'supportive of' : 'a headwind for'} the home currency via rate expectations.`));
      continue;
    }
    if (asset === 'USD') {
      if (cb === 'US') continue; // handled as home
      out.push(bias(asset, hawkish ? 'PRESSURE' : 'SUPPORTIVE', `Relative-rates channel: a ${hawkish ? 'hawkish' : 'dovish'} ${cb} print tends to ${hawkish ? 'weigh on' : 'support'} USD against ${home ?? 'the local currency'}.`));
      continue;
    }
    if (['JPY', 'EUR', 'GBP', 'AUD', 'CAD'].includes(asset)) {
      if (cb === 'US') {
        out.push(bias(asset, hawkish ? 'PRESSURE' : 'SUPPORTIVE', `USD-cross sensitivity: hawkish US data has typically pressured ${asset} vs USD.`));
      } else if (cb === 'CN' && asset === 'AUD') {
        out.push(bias(asset, hawkish ? 'SUPPORTIVE' : 'PRESSURE', 'AUD is the liquid China-growth proxy; firmer China data has tended to support it.'));
      } else {
        out.push(bias(asset, 'LOW', 'Second-order only via cross rates.'));
      }
      continue;
    }
    if (asset === 'US10Y') {
      if (cb === 'US') out.push(bias(asset, hawkish ? 'PRESSURE' : 'SUPPORTIVE', hawkish ? 'Yields have tended to rise (price pressure) on hawkish US surprises.' : 'Yields have tended to fall (price support) on dovish US surprises.'));
      else if (cb === 'JP') out.push(bias(asset, hawkish ? 'PRESSURE' : 'LOW', hawkish ? 'Hawkish BoJ repricing can lift global term premia via JGB spillover.' : 'Limited spillover.'));
      else out.push(bias(asset, 'LOW', 'Indirect global-yield spillover only.'));
      continue;
    }
    if (asset === 'NQ' || asset === 'SPX') {
      if (cb === 'US') {
        const growthData = category === 'employment' || category === 'gdp' || category === 'pmi' || category === 'consumer' || category === 'manufacturing';
        out.push(bias(asset, hawkish ? (growthData ? 'MIXED' : 'PRESSURE') : (growthData ? 'MIXED' : 'SUPPORTIVE'),
          growthData
            ? 'Growth data cuts both ways: stronger activity supports earnings but firms rate expectations.'
            : hawkish ? 'Rate-sensitive equities have historically been pressured by hawkish inflation/policy surprises.' : 'Dovish inflation/policy surprises have historically supported rate-sensitive equities.'));
      } else if (cb === 'JP') {
        out.push(bias(asset, hawkish ? 'PRESSURE' : 'LOW', hawkish ? 'Hawkish BoJ repricing can tighten global carry funding, a historical headwind for high-beta indices.' : 'Limited direct effect.'));
      } else {
        out.push(bias(asset, 'LOW', 'Limited direct sensitivity to this region.'));
      }
      continue;
    }
    if (asset === 'BTC' || asset === 'ETH') {
      if (cb === 'US') out.push(bias(asset, hawkish ? 'PRESSURE' : 'SUPPORTIVE', `Crypto has traded as a liquidity-sensitive asset; ${hawkish ? 'hawkish' : 'dovish'} US surprises have historically ${hawkish ? 'pressured' : 'supported'} it.`));
      else if (cb === 'JP') out.push(bias(asset, hawkish ? 'PRESSURE' : 'LOW', hawkish ? 'Yen-carry unwind episodes have coincided with crypto drawdowns.' : 'Limited direct effect.'));
      else out.push(bias(asset, 'LOW', 'Limited direct sensitivity to this region.'));
      continue;
    }
    if (asset === 'Gold') {
      if (cb === 'US') out.push(bias(asset, hawkish ? 'PRESSURE' : 'SUPPORTIVE', hawkish ? 'Higher real-rate expectations have historically weighed on gold.' : 'Lower real-rate expectations have historically supported gold.'));
      else if (cb === 'CN') out.push(bias(asset, 'MIXED', 'China demand channel and USD channel can offset.'));
      else out.push(bias(asset, 'LOW', 'Mostly via USD; second-order.'));
    }
  }
  return out;
}

export function buildAssetImpact(args: {
  countryCode: CountryCode;
  category: EventCategory;
  higherMeans: HigherMeans;
  surprise: SurpriseResult | null;
}): AssetImpact {
  const { countryCode, category, higherMeans, surprise } = args;
  return {
    primary: primaryAssets(countryCode, category),
    ifAbove: higherMeans === 'HAWKISH' ? 'HAWKISH' : 'DOVISH',
    ifBelow: higherMeans === 'HAWKISH' ? 'DOVISH' : 'HAWKISH',
    realized: surprise ? realizedSensitivity(countryCode, surprise.lean, category) : null,
    disclaimer: SCENARIO_DISCLAIMER,
  };
}
