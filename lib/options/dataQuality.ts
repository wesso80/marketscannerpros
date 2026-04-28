import type { AVOptionRow } from '@/lib/scoring/options-v21';

export type OptionsChainQualityStatus = 'sufficient' | 'thin' | 'missing';

export interface OptionsChainQuality {
  status: OptionsChainQualityStatus;
  totalContracts: number;
  quotedContracts: number;
  liquidContracts: number;
  avgSpreadPct: number | null;
  warnings: string[];
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function rowSpreadPct(row: AVOptionRow): number | null {
  const bid = toNumber(row.bid);
  const ask = toNumber(row.ask);
  const mark = toNumber(row.mark);
  const last = toNumber(row.last ?? row.last_price);
  const mid = Number.isFinite(mark) && mark > 0
    ? mark
    : Number.isFinite(bid) && Number.isFinite(ask) && ask > 0 && bid >= 0
      ? (bid + ask) / 2
      : Number.isFinite(last) && last > 0
        ? last
        : 0;

  if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= 0 || bid < 0 || ask < bid || mid <= 0) return null;
  return ((ask - bid) / mid) * 100;
}

export function assessOptionsChainQuality(rows: AVOptionRow[]): OptionsChainQuality {
  if (!rows.length) {
    return {
      status: 'missing',
      totalContracts: 0,
      quotedContracts: 0,
      liquidContracts: 0,
      avgSpreadPct: null,
      warnings: ['missing_options_chain'],
    };
  }

  const spreads = rows
    .map(rowSpreadPct)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const liquidContracts = rows.filter((row) => {
    const spread = rowSpreadPct(row);
    const volume = toNumber(row.volume);
    const openInterest = toNumber(row.open_interest);
    return spread != null && spread <= 12 && ((Number.isFinite(volume) && volume >= 10) || (Number.isFinite(openInterest) && openInterest >= 50));
  }).length;
  const avgSpreadPct = spreads.length
    ? Math.round((spreads.reduce((sum, value) => sum + value, 0) / spreads.length) * 10) / 10
    : null;
  const quotedCoverage = spreads.length / rows.length;
  const liquidCoverage = liquidContracts / rows.length;
  const warnings: string[] = [];

  if (quotedCoverage < 0.35) warnings.push('low_quoted_contract_coverage');
  if (avgSpreadPct != null && avgSpreadPct > 20) warnings.push('wide_average_spread');
  if (liquidCoverage < 0.1) warnings.push('thin_options_liquidity');

  return {
    status: warnings.length ? 'thin' : 'sufficient',
    totalContracts: rows.length,
    quotedContracts: spreads.length,
    liquidContracts,
    avgSpreadPct,
    warnings,
  };
}
