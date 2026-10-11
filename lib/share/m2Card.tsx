/**
 * Global M2 share card, from the persisted monthly Global M2 store only (macro_series GM2_USD_<bloc>).
 *
 * The live page (/api/intelligence/global-m2) fetches ~20 central-bank and Alpha Vantage FX series on a cache miss.
 * This card never does: every live provider is replaced by an offline stub, so buildWave3Bundle takes its existing
 * "serve persisted last-known-good" path for each bloc and runs the same engine. No network, no Alpha Vantage quota.
 * With nothing persisted it returns null (the route answers 503, never an empty image).
 */
import { buildWave3Bundle } from '@/lib/intelligence/data/globalM2Pipeline';
import { persistedOnlyDeps, readOnlyM2Store } from '@/lib/intelligence/data/globalM2PersistedRead';
import { dbGlobalM2Store, type PersistedM2Store } from '@/lib/intelligence/data/globalM2Store';

export { persistedOnlyDeps, readOnlyM2Store };
import { CardFrame, Stat } from './CardFrame';
import { SHARE_THEME as T } from './theme';
import { clipText } from './validate';

export interface M2CardModel {
  totalUsdT: string;
  oneMonthPct: string;
  threeMonthAnnualizedPct: string;
  yoyPct: string;
  /** Cross-bloc cycle and acceleration; null when coverage is below the interpretation threshold. */
  interpretation: { cycle: string; acceleration: string } | null;
  coverageNote: string;
  blocCount: string;
  dataThrough: string;
  lastIngested: string | null;
  topBlocs: { name: string; share: string; r3: string }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => { const [y, m] = ym.split('-').map(Number); return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : ym; };
const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const humanState = (s: string) => clipText(s.replace(/_/g, ' ').toLowerCase(), 28);

/** "Jul 2026", or "Jul 2026 (some blocs Jun 2026)" when the blocs in the total end in different months. */
export function dataThroughLabel(observationMonths: string[]): string {
  const months = observationMonths.filter((m) => /^\d{4}-\d{2}/.test(m)).map((m) => m.slice(0, 7)).sort();
  if (months.length === 0) return '—';
  const newest = months[months.length - 1];
  const oldest = months[0];
  return oldest === newest ? monthLabel(newest) : `${monthLabel(newest)} (some blocs ${monthLabel(oldest)})`;
}

export async function loadM2CardModel(opts: { store?: PersistedM2Store } = {}): Promise<M2CardModel | null> {
  // persist: true is what turns on buildWave3Bundle's "read persisted last-known-good" fallback (persist: false skips
  // reading as well as writing, which would leave the card with no data). Writes are blocked by readOnlyM2Store.
  const b = await buildWave3Bundle(persistedOnlyDeps(), { persist: true, store: readOnlyM2Store(opts.store ?? dbGlobalM2Store) });
  const r = b.result;
  if (!r.validBlocCount || !(r.totalUsd > 0) || r.blocs.length === 0) return null;
  const ingested = b.blocs.map((x) => x.retrievedAt).filter(Boolean).sort();
  const q = r.quality;
  const eligible = b.eligibility.interpretationEligible;
  return {
    totalUsdT: `$${(r.totalUsd / 1e12).toFixed(2)}T`,
    oneMonthPct: pct(r.oneMonthPct),
    threeMonthAnnualizedPct: pct(r.threeMonthAnnualizedPct),
    yoyPct: pct(r.yoyPct),
    interpretation: eligible ? { cycle: humanState(r.liquidityCycle), acceleration: humanState(r.accelerationState) } : null,
    coverageNote: eligible
      ? `Weighted coverage ${q.estimatedWeightedCoveragePercent.toFixed(1)}%`
      : `Weighted coverage ${q.estimatedWeightedCoveragePercent.toFixed(1)}% (below ${b.eligibility.weightedCoverageThreshold}%): cross-bloc cycle not shown`,
    blocCount: `${r.validBlocCount} of 11 blocs`,
    dataThrough: dataThroughLabel(r.blocs.map((x) => x.observationMonth)),
    lastIngested: ingested.length ? ingested[ingested.length - 1].slice(0, 10) : null,
    topBlocs: [...r.blocs].sort((a, c) => c.shareOfGlobal - a.shareOfGlobal).slice(0, 6).map((x) => ({
      name: clipText(x.name, 18), share: `${x.shareOfGlobal.toFixed(1)}%`, r3: pct(x.r3),
    })),
  };
}

const tone = (s: string) => (s.startsWith('+') ? T.bull : s.startsWith('-') ? T.bear : T.text);

export function M2Card({ m }: { m: M2CardModel }) {
  return (
    <CardFrame
      kicker="Global M2 liquidity"
      asOf={`Data through ${m.dataThrough}`}
      accent={T.info}
      note={m.interpretation ? null : m.coverageNote}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', fontSize: 84, color: T.text, lineHeight: 1 }}>{m.totalUsdT}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 22, marginBottom: 6 }}>
          <div style={{ display: 'flex', fontSize: 20, color: T.muted }}>USD-normalised M2</div>
          <div style={{ display: 'flex', fontSize: 20, color: T.muted }}>{m.blocCount}</div>
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 24 }}>
        <Stat label="1 month" value={m.oneMonthPct} color={tone(m.oneMonthPct)} />
        <Stat label="3M annualised" value={m.threeMonthAnnualizedPct} color={tone(m.threeMonthAnnualizedPct)} />
        <Stat label="Year on year" value={m.yoyPct} color={tone(m.yoyPct)} />
        {m.interpretation ? <Stat label="Cycle" value={m.interpretation.cycle} /> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20 }}>
        <div style={{ display: 'flex', fontSize: 15, color: T.muted, letterSpacing: 1, marginBottom: 6 }}>LARGEST BLOCS · SHARE · 3M CHANGE</div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {m.topBlocs.map((x) => (
            <div key={x.name} style={{ display: 'flex', width: 350, justifyContent: 'space-between', marginRight: 30, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', fontSize: 21, color: T.text }}>{x.name}</div>
              <div style={{ display: 'flex', fontSize: 21, color: T.muted }}>
                {x.share}
                <span style={{ color: tone(x.r3), marginLeft: 14 }}>{x.r3}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 15, color: T.faint, marginTop: 10 }}>
        {`Official central-bank / statistics sources, monthly, converted to USD.${m.lastIngested ? ` Last ingested ${m.lastIngested}.` : ''}${m.interpretation ? ` ${m.coverageNote}.` : ''}`}
      </div>
    </CardFrame>
  );
}
