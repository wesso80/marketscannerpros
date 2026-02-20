import { TimeConfluenceV2Inputs } from '@/components/time/types';

export function mockTimeInput(): TimeConfluenceV2Inputs {
  return {
    context: {
      symbol: 'BTCUSD',
      assetClass: 'crypto',
      primaryTfMinutes: 60,
      lookbackBars: 500,
      macroBias: 'bearish',
      htfBias: 'bearish',
      regime: 'expansion',
      volState: 'high',
      trendStrength: 0.48,
      dataIntegrity: {
        provider: 'CoinGecko',
        freshnessSec: 120,
        coveragePct: 0.92,
        gapsPct: 0.04,
      },
      extremeConditions: ['PRICE_MAGNET'],
    },
    setup: {
      primaryDirection: 'bearish',
      decomposition: [
        { tfLabel: '5m', tfMinutes: 5, closeBias: 'bearish', state: 'confirmed', strength: 0.72, alignedToPrimary: true },
        { tfLabel: '15m', tfMinutes: 15, closeBias: 'bearish', state: 'forming', strength: 0.58, alignedToPrimary: true },
        { tfLabel: '1h', tfMinutes: 60, closeBias: 'neutral', state: 'forming', strength: 0.44, alignedToPrimary: false },
        { tfLabel: '4h', tfMinutes: 240, closeBias: 'bearish', state: 'confirmed', strength: 0.64, alignedToPrimary: true },
      ],
      window: {
        status: 'ACTIVE',
        durationHours: 48,
        timeRemainingMinutes: 340,
        strength: 0.56,
        clusterIntegrity: 0.52,
        directionConsistency: 0.6,
        alignmentCount: 3,
        tfCount: 4,
      },
      warnings: ['LOW_CLUSTER_INTEGRITY'],
    },
    execution: {
      closeConfirmation: 'PENDING',
      closeStrength: 0.49,
      entryWindowQuality: 0.54,
      liquidityOK: true,
      riskState: 'elevated',
      notes: ['Wait for stronger close confirmation.'],
    },
  };
}
