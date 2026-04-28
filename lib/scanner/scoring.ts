export type ScannerDerivativesEvidenceStatus = 'available' | 'missing' | 'not_applicable';

export interface ScannerDerivativesContributionInput {
  fundingRate?: number;
  oiChangePercent?: number;
  expected?: boolean;
}

export interface ScannerDerivativesContribution {
  evidenceStatus: ScannerDerivativesEvidenceStatus;
  boost: number;
  bullishSignal: number;
  bearishSignal: number;
  warnings: string[];
}

export function computeScannerDerivativesContribution(input: ScannerDerivativesContributionInput): ScannerDerivativesContribution {
  if (!input.expected) {
    return {
      evidenceStatus: 'not_applicable',
      boost: 0,
      bullishSignal: 0,
      bearishSignal: 0,
      warnings: [],
    };
  }

  const hasFunding = Number.isFinite(input.fundingRate);
  const hasOpenInterest = Number.isFinite(input.oiChangePercent);

  if (!hasFunding && !hasOpenInterest) {
    return {
      evidenceStatus: 'missing',
      boost: 0,
      bullishSignal: 0,
      bearishSignal: 0,
      warnings: ['missing_derivatives_evidence_no_score_boost'],
    };
  }

  let boost = 0;
  let bullishSignal = 0;
  let bearishSignal = 0;

  if (hasFunding) {
    const fundingRate = input.fundingRate!;
    if (fundingRate > 0.05) {
      bearishSignal += 0.8;
      boost += 2;
    } else if (fundingRate < -0.05) {
      bullishSignal += 0.8;
      boost += 2;
    } else if (fundingRate > 0.01) {
      bullishSignal += 0.3;
    } else if (fundingRate < -0.01) {
      bearishSignal += 0.3;
    }
  }

  if (hasOpenInterest) {
    const oiChangePercent = input.oiChangePercent!;
    if (Math.abs(oiChangePercent) > 5) boost += 3;
    else if (Math.abs(oiChangePercent) > 2) boost += 1;
  }

  return {
    evidenceStatus: 'available',
    boost,
    bullishSignal,
    bearishSignal,
    warnings: [],
  };
}