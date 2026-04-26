export const SCANNER_EDUCATIONAL_NOTE =
  'Scanner outputs are educational market research only. They are not financial advice and are not recommendations to buy, sell, hold, short, or trade any asset.';

export function scannerComplianceMetadata() {
  return {
    educationalOnly: true,
    notFinancialAdvice: true,
    notARecommendation: true,
    usageNote: SCANNER_EDUCATIONAL_NOTE,
  };
}

export type ScannerDataQualityInput = {
  source: string;
  computedAt?: string | Date | null;
  stale?: boolean;
  coverageScore?: number | null;
  warnings?: string[];
};

export function scannerDataQualityMetadata(input: ScannerDataQualityInput) {
  return {
    source: input.source,
    computedAt: input.computedAt ? new Date(input.computedAt).toISOString() : null,
    stale: Boolean(input.stale),
    coverageScore: typeof input.coverageScore === 'number' ? Math.max(0, Math.min(100, Math.round(input.coverageScore))) : null,
    warnings: input.warnings?.filter(Boolean) ?? [],
  };
}