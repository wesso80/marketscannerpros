/**
 * MSP Radar daily share card: a teaser of the persisted daily report (jarvis_daily_reports).
 *
 * Only these report parts are read (selected in SQL, so nothing else leaves the database): session date, status,
 * headline, generated time, the "market in 30 seconds" lines and the top candidates' symbol / asset class / setup.
 * Never read: run / API usage, data health, provider details, email or delivery fields, lifecycle notes.
 * FAILED reports are never shown.
 */
import { formatSessionDate, toYmd } from '@/lib/time/usSession';
import { proDisplaySymbol } from '@/lib/scanner/proDisplay';
import { CardFrame } from './CardFrame';
import { SHARE_THEME as T } from './theme';
import { clipText } from './validate';

type Q = <R = any>(sql: string, params?: unknown[]) => Promise<R[]>;

export interface RadarCardModel {
  sessionDate: string;
  status: 'COMPLETE' | 'DEGRADED';
  headline: string;
  generatedAtUtc: string | null;
  lines: { label: string; value: string }[];
  candidates: { symbol: string; setup: string }[];
}

/** Market lines shown on the card, in this order (others are left for the full report). */
const LINE_LABELS = ['Equities', 'Crypto', 'Sectors', 'Volatility'];

const COLUMNS = `session_date, status, headline, generated_at,
  report_json->'marketIn30Seconds' AS market,
  report_json->'candidates' AS candidates`;

export async function loadRadarCardModel(q: Q, date: string | null): Promise<RadarCardModel | null> {
  const rows = date
    ? await q(`SELECT ${COLUMNS} FROM jarvis_daily_reports WHERE session_date = $1 AND status <> 'FAILED' LIMIT 1`, [date])
    : await q(`SELECT ${COLUMNS} FROM jarvis_daily_reports WHERE status <> 'FAILED' ORDER BY session_date DESC LIMIT 1`);
  const r = rows[0];
  if (!r) return null;
  return radarModelFromRow(r);
}

const asArray = (v: unknown): any[] => {
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
  return Array.isArray(v) ? v : [];
};

export function radarModelFromRow(r: { session_date: unknown; status: unknown; headline: unknown; generated_at: unknown; market: unknown; candidates: unknown }): RadarCardModel | null {
  const sessionDate = toYmd(r.session_date);
  if (!sessionDate || (r.status !== 'COMPLETE' && r.status !== 'DEGRADED')) return null;
  const market = asArray(r.market);
  const lines = LINE_LABELS
    .map((label) => market.find((l) => l && l.label === label))
    .filter(Boolean)
    .map((l) => ({ label: clipText(l.label, 24), value: clipText(l.value, 92) }));
  const candidates = asArray(r.candidates).slice(0, 5)
    .filter((c) => c && typeof c.symbol === 'string')
    .map((c) => ({
      symbol: clipText(proDisplaySymbol(c.symbol, c.assetClass === 'crypto' ? 'crypto' : null), 14),
      setup: clipText(String(c.setupType ?? '').replace(/_/g, ' ').toLowerCase(), 22),
    }));
  const gen = r.generated_at ? new Date(r.generated_at as string) : null;
  return {
    sessionDate,
    status: r.status as RadarCardModel['status'],
    headline: clipText(r.headline, 150),
    generatedAtUtc: gen && Number.isFinite(gen.getTime()) ? `${gen.toISOString().slice(0, 16).replace('T', ' ')} UTC` : null,
    lines,
    candidates,
  };
}

/** Width of the research-list panel. Crypto keeps the site's "-USD" display (OV-13), so it must fit e.g. "MORPHO-USD". */
export const RADAR_LIST_WIDTH = 384;

export function RadarCard({ m }: { m: RadarCardModel }) {
  return (
    <CardFrame
      kicker="MSP Radar · Daily market intelligence"
      asOf={`US session ${formatSessionDate(m.sessionDate)}`}
      note={m.status === 'DEGRADED' ? 'Some data sources were degraded for this session; the full report lists the gaps.' : null}
    >
      <div style={{ display: 'flex', flexShrink: 0, fontSize: 31, lineHeight: 1.2, color: T.text }}>{m.headline}</div>
      {/* The only part that shrinks: with unusually long text the last market line is clipped, never the footer. */}
      <div style={{ display: 'flex', marginTop: 14, flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, flexBasis: 0, minWidth: 0, marginRight: 24 }}>
          {m.lines.map((l) => (
            <div key={l.label} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginBottom: 10 }}>
              <div style={{ display: 'flex', fontSize: 15, color: T.accent, letterSpacing: 1 }}>{l.label.toUpperCase()}</div>
              <div style={{ display: 'flex', fontSize: 20, lineHeight: 1.2, color: T.text, marginTop: 2 }}>{l.value}</div>
            </div>
          ))}
        </div>
        {m.candidates.length > 0 ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', flexShrink: 0, alignSelf: 'flex-start', width: RADAR_LIST_WIDTH,
              background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 18px',
            }}
          >
            <div style={{ display: 'flex', fontSize: 15, color: T.muted, letterSpacing: 1, marginBottom: 6 }}>ON THE RESEARCH LIST</div>
            {m.candidates.map((c, i) => (
              <div
                key={`${c.symbol}-${i}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid ${T.border}` }}
              >
                {/* One line per candidate: the symbol never wraps; the setup text gives way (ellipsis) instead. */}
                <div style={{ display: 'flex', flexShrink: 0, fontSize: 22, color: T.text, whiteSpace: 'nowrap', marginRight: 16 }}>{c.symbol}</div>
                <div
                  style={{
                    display: 'block', flexShrink: 1, minWidth: 0, fontSize: 16, color: T.muted,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {c.setup}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', fontSize: 14, color: T.faint, marginTop: 8 }}>Surfaced for research, not recommendations.</div>
          </div>
        ) : null}
      </div>
      {m.generatedAtUtc ? (
        <div style={{ display: 'flex', flexShrink: 0, fontSize: 15, color: T.faint, marginTop: 6 }}>{`Report generated ${m.generatedAtUtc}`}</div>
      ) : null}
    </CardFrame>
  );
}
