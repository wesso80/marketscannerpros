export type MarketDataAlertLevel = 'none' | 'info' | 'warning' | 'critical';

export interface MarketDataProviderStatus {
  source: string;
  provider: string;
  live: boolean;
  simulated: boolean;
  stale: boolean;
  degraded: boolean;
  productionDemoEnabled: boolean;
  alertLevel: MarketDataAlertLevel;
  warnings: string[];
}

const emittedDemoAlerts = new Set<string>();

export function isLocalDemoMarketDataAllowed(env: {
  nodeEnv?: string;
  localDemoMarketData?: string;
}) {
  const productionDemoEnabled = env.nodeEnv === 'production' && env.localDemoMarketData === 'true';
  return {
    allowed: env.nodeEnv !== 'production' || env.localDemoMarketData === 'true',
    productionDemoEnabled,
  };
}

export function buildMarketDataProviderStatus(input: {
  source: string;
  provider?: string;
  localDemo?: boolean;
  stale?: boolean;
  degraded?: boolean;
  warnings?: string[];
  productionDemoEnabled?: boolean;
}): MarketDataProviderStatus {
  const warnings = input.warnings?.filter(Boolean) ?? [];
  const simulated = Boolean(input.localDemo);
  const productionDemoEnabled = Boolean(input.productionDemoEnabled);
  const degraded = Boolean(input.degraded || input.stale || simulated || warnings.length);
  const alertLevel: MarketDataAlertLevel = productionDemoEnabled
    ? 'critical'
    : simulated || input.stale
      ? 'warning'
      : degraded
        ? 'info'
        : 'none';

  return {
    source: input.source,
    provider: input.provider ?? input.source,
    live: !simulated && !input.stale,
    simulated,
    stale: Boolean(input.stale),
    degraded,
    productionDemoEnabled,
    alertLevel,
    warnings,
  };
}

export function emitProductionDemoDataAlert(surface: string, reason: string, context: Record<string, unknown> = {}) {
  const key = `${surface}:${reason}`;
  if (emittedDemoAlerts.has(key)) return;
  emittedDemoAlerts.add(key);
  console.error('[market-data] PRODUCTION_DEMO_DATA_ENABLED', {
    surface,
    reason,
    ...context,
  });
}
