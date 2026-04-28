export type ScannerLiquidityStatus = 'sufficient' | 'thin' | 'missing' | 'not_applicable';

export interface ScannerLiquidityAssessment {
  status: ScannerLiquidityStatus;
  penalty: number;
  warnings: string[];
}

export function evaluateScannerLiquidity(args: {
  type: 'crypto' | 'equity' | 'forex';
  averageVolume?: number;
}): ScannerLiquidityAssessment {
  if (args.type === 'forex') {
    return { status: 'not_applicable', penalty: 0, warnings: [] };
  }

  const averageVolume = Number(args.averageVolume);
  if (!Number.isFinite(averageVolume) || averageVolume <= 0) {
    return {
      status: 'missing',
      penalty: args.type === 'equity' ? 10 : 8,
      warnings: ['missing_liquidity_volume'],
    };
  }

  if (args.type === 'equity') {
    if (averageVolume < 50_000) {
      return { status: 'thin', penalty: 18, warnings: ['thin_equity_volume'] };
    }
    if (averageVolume < 200_000) {
      return { status: 'thin', penalty: 8, warnings: ['below_preferred_equity_volume'] };
    }
    return { status: 'sufficient', penalty: 0, warnings: [] };
  }

  if (averageVolume < 1_000) {
    return { status: 'thin', penalty: 12, warnings: ['thin_crypto_volume'] };
  }

  return { status: 'sufficient', penalty: 0, warnings: [] };
}
