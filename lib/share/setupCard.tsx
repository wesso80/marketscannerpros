/**
 * Share card for one ticker from the stored daily scan (daily_picks), the same rows the public /daily-pick and
 * /share/scan pages show. No live market-data calls.
 *
 * Public (W3, 8 Oct): measured values only (price and its basis, session change, RSI, ADX, ATR %). No verdict, grade,
 * score, side or reference levels. Without a date, only a row from the last LATEST_MAX_AGE_DAYS is used, so an old
 * snapshot is never presented as current.
 */
import { readStoredCanonical } from '@/lib/scoring/canonical/dailyPick';
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
  /** Price shown and what it is: the completed daily bar close, else the stored scan price. */
  price: string;
  priceLabel: string;
  /** Completed daily bar (YYYY-MM-DD), when stored. */
  barDate: string | null;
  changePct: string;
  rsi: string;
  adx: string;
  atrPct: string;
  basisNote: string;
}

// The stored verdict is read only for the completed bar's close and date (the price basis); nothing else from it.
const COLUMNS = `symbol, asset_class, scan_date, price, change_percent, indicators->>'rsi' AS rsi, indicators->>'adx' AS adx, indicators->>'atrPct' AS atr_pct, indicators->'canonical' AS canonical`;

/** Crypto may be requested as BTC-USD; the scan stores BTC. */
function lookupSymbols(symbol: string): string[] {
  const base = symbol.replace(/-(USD|USDT|USDC)$/, '');
  return base !== symbol ? [symbol, base] : [symbol];
}

export async function loadSetupCardModel(q: Q, symbol: string, date: string | null, now = Date.now()): Promise<SetupCardModel | null> {
  const syms = lookupSymbols(symbol);
  const rows = date
    ? await q(`SELECT ${COLUMNS} FROM daily_picks WHERE symbol = ANY($1) AND scan_date = $2 ORDER BY asset_class LIMIT 1`, [syms, date])
    : await q(`SELECT ${COLUMNS} FROM daily_picks WHERE symbol = ANY($1) ORDER BY scan_date DESC, asset_class LIMIT 1`, [syms]);
  const r = rows[0];
  if (!r) return null;
  const scanDate = toYmd(r.scan_date);
  if (!scanDate) return null;
  if (!date && now - Date.parse(`${scanDate}T00:00:00Z`) > LATEST_MAX_AGE_DAYS * 86_400_000) return null;
  return setupModelFromRow({ ...r, scan_date: scanDate });
}

const fmtNum = (v: unknown, dp: number, suffix = '') => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? `${n.toFixed(dp)}${suffix}` : 'Not collected'; };

export function setupModelFromRow(r: { symbol: unknown; asset_class: unknown; scan_date: string; price: unknown; change_percent?: unknown; rsi?: unknown; adx?: unknown; atr_pct?: unknown; canonical?: unknown }): SetupCardModel {
  const c = readStoredCanonical({ canonical: r.canonical });
  const assetClass = String(r.asset_class ?? 'equity');
  const symbol = clipText(proDisplaySymbol(String(r.symbol), assetClass), 16);
  // Crypto rows store an exchange-rate spot quote as `price`; show the completed daily bar's close when stored (and say so).
  const barClose = Number(c?.raw?.close);
  const hasBarClose = Number.isFinite(barClose) && barClose > 0;
  const price = hasBarClose ? barClose : r.price != null ? Number(r.price) : null;
  const barDate = typeof c?.barDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(c.barDate) ? c.barDate.slice(0, 10) : null;
  const chg = Number(r.change_percent);
  return {
    symbol,
    assetClass,
    scanDate: r.scan_date,
    price: formatScannerPrice(price),
    priceLabel: hasBarClose ? (barDate ? `Daily close ${barDate}` : 'Daily close') : 'Price at scan',
    barDate,
    changePct: r.change_percent != null && Number.isFinite(chg) ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : 'Not recorded',
    rsi: fmtNum(r.rsi, 1),
    adx: fmtNum(r.adx, 1),
    atrPct: fmtNum(r.atr_pct, 2, '%'),
    basisNote: 'Measured values from the daily scan. Not a rating, ranking or recommendation.',
  };
}

export function SetupCard({ m }: { m: SetupCardModel }) {
  const accent = T.muted;
  const session = m.assetClass === 'crypto'
    ? `Daily candle ${m.barDate ?? m.scanDate} (UTC)`
    : `US session ${formatSessionDate(m.scanDate)}`;
  return (
    <CardFrame kicker="Research snapshot · daily scan" asOf={session} accent={accent} note={m.basisNote}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 92, lineHeight: 1, color: T.text }}>{m.symbol}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 28 }}>
          <div style={{ display: 'flex', fontSize: 30, color: T.text }}>{m.price}</div>
          <div style={{ display: 'flex', fontSize: 22, color: T.muted, marginTop: 4 }}>{m.priceLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 26 }}>
        <Stat label="Session change" value={m.changePct} />
        <Stat label="RSI (14)" value={m.rsi} />
        <Stat label="ADX (14)" value={m.adx} />
        <Stat label="ATR %" value={m.atrPct} />
      </div>
    </CardFrame>
  );
}
