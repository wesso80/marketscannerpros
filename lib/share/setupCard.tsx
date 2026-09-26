/**
 * Setup share card for one ticker, from the stored daily scan (daily_picks) — the same rows the public /daily-pick
 * and /share/scan pages and /api/scanner/daily-picks already show. No live market-data calls.
 *
 * Shows the canonical verdict (permission · grade · setup), score, side and the scanner's reference levels
 * (entry / invalidation / target, R:R) as stored at scan time. Without a date, only a row from the last
 * LATEST_MAX_AGE_DAYS is used, so an old setup is never presented as current.
 */
import { readStoredCanonical, canonicalLabel } from '@/lib/scoring/canonical/dailyPick';
import { NO_EDGE_BANNER, isCalibrated, scoreLabel, targetBasisLabel } from '@/lib/scoring/canonical/display';
import { formatScannerPrice, proDisplaySymbol } from '@/lib/scanner/proDisplay';
import { formatSessionDate, toYmd } from '@/lib/time/usSession';
import { CardFrame, Stat } from './CardFrame';
import { SHARE_THEME as T } from './theme';
import { clipText } from './validate';

type Q = <R = any>(sql: string, params?: unknown[]) => Promise<R[]>;

export const LATEST_MAX_AGE_DAYS = 7;

export interface SetupCardModel {
  symbol: string;
  assetClass: string;
  scanDate: string;
  side: 'bullish' | 'bearish' | 'neutral';
  verdict: string | null;
  score: string;
  /** Price shown and what it is: the completed daily bar close the verdict used, else the stored scan price. */
  price: string;
  priceLabel: string;
  /** Completed daily bar the verdict was computed on (YYYY-MM-DD), when stored. */
  barDate: string | null;
  levels: { entry: string; invalidation: string; target: string; targetBasis: string; riskReward: string } | null;
  basisNote: string;
}

const COLUMNS = `symbol, asset_class, scan_date, price, direction, score, indicators->'canonical' AS canonical`;

/** Crypto may be requested as BTC-USD; the scan stores BTC. */
function lookupSymbols(symbol: string): string[] {
  const base = symbol.replace(/-(USD|USDT|USDC)$/, '');
  return base !== symbol ? [symbol, base] : [symbol];
}

export async function loadSetupCardModel(q: Q, symbol: string, date: string | null, now = Date.now()): Promise<SetupCardModel | null> {
  const syms = lookupSymbols(symbol);
  const rows = date
    ? await q(`SELECT ${COLUMNS} FROM daily_picks WHERE symbol = ANY($1) AND scan_date = $2 ORDER BY score DESC LIMIT 1`, [syms, date])
    : await q(`SELECT ${COLUMNS} FROM daily_picks WHERE symbol = ANY($1) ORDER BY scan_date DESC, score DESC LIMIT 1`, [syms]);
  const r = rows[0];
  if (!r) return null;
  const scanDate = toYmd(r.scan_date);
  if (!scanDate) return null;
  if (!date && now - Date.parse(`${scanDate}T00:00:00Z`) > LATEST_MAX_AGE_DAYS * 86_400_000) return null;
  return setupModelFromRow({ ...r, scan_date: scanDate });
}

export function setupModelFromRow(r: { symbol: unknown; asset_class: unknown; scan_date: string; price: unknown; direction: unknown; score: unknown; canonical: unknown }): SetupCardModel {
  const c = readStoredCanonical({ canonical: r.canonical });
  const assetClass = String(r.asset_class ?? 'equity');
  const symbol = clipText(proDisplaySymbol(String(r.symbol), assetClass), 16);
  const side: SetupCardModel['side'] = c
    ? (c.permission === 'BLOCK' || c.direction === 'neutral' ? 'neutral' : c.direction === 'long' ? 'bullish' : 'bearish')
    : (r.direction === 'bullish' || r.direction === 'bearish' ? r.direction : 'neutral');
  const lv = c?.levels ?? null;
  // Crypto rows store an exchange-rate spot quote as `price`, while the verdict and levels come from the completed
  // daily bar. Show that bar's close (and say so) so the card's price matches its levels; fall back to the scan price.
  const barClose = Number(c?.raw?.close);
  const hasBarClose = Number.isFinite(barClose) && barClose > 0;
  const price = hasBarClose ? barClose : r.price != null ? Number(r.price) : null;
  const barDate = typeof c?.barDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(c.barDate) ? c.barDate.slice(0, 10) : null;
  return {
    symbol,
    assetClass,
    scanDate: r.scan_date,
    side,
    verdict: c ? clipText(canonicalLabel(c), 60) : null,
    score: c ? clipText(scoreLabel(c), 40) : `${Number(r.score) || 0}/100 (legacy signal count)`,
    price: formatScannerPrice(price),
    priceLabel: hasBarClose ? (barDate ? `Daily close ${barDate}` : 'Daily close') : 'Price at scan',
    barDate,
    levels: lv ? {
      entry: formatScannerPrice(lv.entry),
      invalidation: formatScannerPrice(lv.invalidation),
      target: formatScannerPrice(lv.target),
      targetBasis: clipText(targetBasisLabel(lv), 40),
      riskReward: Number.isFinite(lv.riskReward) ? `${Number(lv.riskReward.toFixed(2))}R` : '—',
    } : null,
    basisNote: c ? (isCalibrated(c) ? 'Score = percentile of calibrated expected R among same-side setups.' : NO_EDGE_BANNER) : 'Scanned before the canonical engine: no verdict or levels stored.',
  };
}

const SIDE_TEXT = { bullish: 'Bullish alignment', bearish: 'Bearish alignment', neutral: 'No directional setup' } as const;
const SIDE_COLOR = { bullish: T.bull, bearish: T.bear, neutral: T.warn } as const;

export function SetupCard({ m }: { m: SetupCardModel }) {
  const accent = SIDE_COLOR[m.side];
  const session = m.assetClass === 'crypto'
    ? `Daily candle ${m.barDate ?? m.scanDate} (UTC)`
    : `US session ${formatSessionDate(m.scanDate)}`;
  return (
    <CardFrame kicker="Setup snapshot · daily scan" asOf={session} accent={accent} note={m.basisNote}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 92, lineHeight: 1, color: T.text }}>{m.symbol}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 28 }}>
          <div style={{ display: 'flex', fontSize: 30, color: accent }}>{SIDE_TEXT[m.side]}</div>
          <div style={{ display: 'flex', fontSize: 22, color: T.muted, marginTop: 4 }}>{`${m.priceLabel} ${m.price}`}</div>
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 26 }}>
        <Stat label="Verdict" value={m.verdict ?? 'Not available'} width={620} />
        <Stat label="Score" value={m.score} />
      </div>
      {m.levels ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}>
          <div style={{ display: 'flex' }}>
            <Stat label="Entry reference" value={m.levels.entry} />
            <Stat label="Invalidation" value={m.levels.invalidation} color={T.bear} />
            <Stat label="Target" value={m.levels.target} color={T.bull} />
            <Stat label="Reward : risk" value={m.levels.riskReward} />
          </div>
          <div style={{ display: 'flex', fontSize: 16, color: T.faint, marginTop: 8 }}>
            {`Reference levels from the scan, for research. Target basis: ${m.levels.targetBasis}.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', fontSize: 22, color: T.muted, marginTop: 22 }}>No qualifying setup levels were stored for this scan.</div>
      )}
    </CardFrame>
  );
}
