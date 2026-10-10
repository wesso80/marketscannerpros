/**
 * Split and dividend facts for raw daily bars, and the read-side adjustment.
 * Recording uses a payload the caller already downloaded. A missing table is no actions.
 */
import { q } from '@/lib/db';

export interface CorporateAction {
  session: string;
  splitCoefficient: number;
  dividendAmount: number;
}

export const UPSERT_ACTIONS_SQL = `INSERT INTO equity_corporate_actions (symbol, session, split_coefficient, dividend_amount)
SELECT $1, r.session::date, r.split_coefficient, r.dividend_amount
  FROM unnest($2::date[], $3::numeric[], $4::numeric[]) AS r(session, split_coefficient, dividend_amount)
ON CONFLICT (symbol, session) DO UPDATE SET
  split_coefficient = EXCLUDED.split_coefficient,
  dividend_amount = EXCLUDED.dividend_amount
WHERE equity_corporate_actions.split_coefficient IS DISTINCT FROM EXCLUDED.split_coefficient
   OR equity_corporate_actions.dividend_amount IS DISTINCT FROM EXCLUDED.dividend_amount`;

export const LOAD_ACTIONS_SQL = `SELECT symbol, session::text AS session, split_coefficient, dividend_amount
  FROM equity_corporate_actions
 WHERE symbol = ANY($1::text[])`;

type Query = (sql: string, params?: unknown[]) => Promise<unknown>;
type QueryRows = (sql: string, params?: unknown[]) => Promise<unknown[]>;

const PRICE_KEYS = ['open', 'high', 'low', 'close'] as const;

export function isMissingRelation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '42P01';
}

export function corporateActionsFromPayload(payload: unknown): CorporateAction[] {
  if (!payload || typeof payload !== 'object') return [];
  const series = (payload as Record<string, unknown>)['Time Series (Daily)'];
  if (!series || typeof series !== 'object') return [];
  const out: CorporateAction[] = [];
  for (const [session, raw] of Object.entries(series as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session) || !raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const coef = Number(row['8. split coefficient'] ?? 1);
    const dividend = Number(row['7. dividend amount'] ?? 0);
    const splitCoefficient = Number.isFinite(coef) && coef > 0 ? coef : 1;
    const dividendAmount = Number.isFinite(dividend) && dividend > 0 ? dividend : 0;
    if (Math.abs(splitCoefficient - 1) <= 1e-9 && dividendAmount === 0) continue;
    out.push({ session, splitCoefficient, dividendAmount });
  }
  out.sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : 0));
  return out;
}

/** OHLC divided by later split coefficients, volume multiplied. Dividends do not move the price. Input order is kept. */
export function splitAdjustStoredBars<T extends object>(bars: readonly T[], actions: readonly CorporateAction[]): T[] {
  const splits = actions.filter((action) => Number.isFinite(action.splitCoefficient) && action.splitCoefficient > 0 && Math.abs(action.splitCoefficient - 1) > 1e-9);
  if (splits.length === 0 || bars.length === 0) return bars as T[];
  return bars.map((bar) => {
    const session = barSession(bar);
    if (!session) return bar;
    let factor = 1;
    for (const action of splits) {
      if (action.session > session) factor *= action.splitCoefficient;
    }
    if (Math.abs(factor - 1) <= 1e-12) return bar;
    const next = { ...(bar as Record<string, unknown>) };
    for (const key of PRICE_KEYS) {
      const value = next[key];
      if (typeof value === 'number' && Number.isFinite(value)) next[key] = value / factor;
    }
    const volume = next.volume;
    if (typeof volume === 'number' && Number.isFinite(volume)) next.volume = volume * factor;
    return next as T;
  });
}

export async function recordCorporateActions(symbol: string, payload: unknown, query: Query = defaultQuery): Promise<number> {
  const actions = corporateActionsFromPayload(payload);
  if (actions.length === 0) return 0;
  try {
    await query(UPSERT_ACTIONS_SQL, [
      symbol.trim().toUpperCase(),
      actions.map((action) => action.session),
      actions.map((action) => action.splitCoefficient),
      actions.map((action) => action.dividendAmount),
    ]);
    return actions.length;
  } catch (err) {
    if (isMissingRelation(err)) return 0;
    throw err;
  }
}

export async function loadCorporateActions(symbols: readonly string[], query: QueryRows = defaultRows): Promise<Map<string, CorporateAction[]>> {
  const list = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const map = new Map<string, CorporateAction[]>();
  if (list.length === 0) return map;
  let rows: unknown[];
  try {
    rows = await query(LOAD_ACTIONS_SQL, [list]);
  } catch (err) {
    if (isMissingRelation(err)) return map;
    throw err;
  }
  for (const row of rows) {
    const typed = row as { symbol?: unknown; session?: unknown; split_coefficient?: unknown; dividend_amount?: unknown };
    const symbol = String(typed.symbol ?? '').toUpperCase();
    const session = String(typed.session ?? '').slice(0, 10);
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(session)) continue;
    const bucket = map.get(symbol) ?? [];
    bucket.push({
      session,
      splitCoefficient: Number(typed.split_coefficient ?? 1),
      dividendAmount: Number(typed.dividend_amount ?? 0),
    });
    map.set(symbol, bucket);
  }
  return map;
}

function defaultQuery(sql: string, params?: unknown[]): Promise<unknown> {
  return q(sql, params ?? []);
}

function defaultRows(sql: string, params?: unknown[]): Promise<unknown[]> {
  return q(sql, params ?? []);
}

function barSession(bar: object): string | null {
  const raw = (bar as Record<string, unknown>).t
    ?? (bar as Record<string, unknown>).ts
    ?? (bar as Record<string, unknown>).date
    ?? (bar as Record<string, unknown>).timestamp
    ?? (bar as Record<string, unknown>).session;
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw.toISOString().slice(0, 10) : null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString().slice(0, 10);
  if (typeof raw === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
    return match ? match[1] : null;
  }
  return null;
}
