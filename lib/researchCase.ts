export type ResearchDataStatus = 'LIVE' | 'DELAYED' | 'CACHED' | 'STALE' | 'MISSING' | 'ERROR';

export interface ResearchDataSource {
  name: string;
  status: ResearchDataStatus;
  fetchedAt: string | null;
  cacheAgeSeconds: number | null;
  notes?: string[];
}

export interface TruthLayer {
  whatWeKnow: string[];
  whatWeDoNotKnow: string[];
  dataQuality: 'GOOD' | 'DEGRADED' | 'STALE' | 'MISSING';
  source: ResearchDataSource[];
  lastUpdated: string;
  confidenceReason: string;
  invalidation: string | null;
  riskFlags: string[];
  nextUsefulCheck: string;
  disclaimer: string;
}

export interface ResearchScenarioPlan {
  referenceType: string | null;
  triggers: string[];
  invalidationLogic: string | null;
  reactionZones: string[];
  managementNotes: string[];
  modelSize: number | null;
}

export interface BuildTruthLayerInput {
  symbol: string;
  assetClass: string;
  quote?: { price?: number | null; fetchedAt?: string | null; source?: string | null } | null;
  indicators?: { computedAt?: string | null; source?: string | null; warmup?: unknown; atr14?: number | null; adx14?: number | null } | null;
  mpe?: unknown | null;
  cfe?: any;
  regime?: any;
  flow?: any;
  probMatrix?: any;
  doctrine?: any;
  invalidation?: string | null;
}

export function classifyDataSource(source?: string | null, timestamp?: string | null): ResearchDataSource {
  const fetchedAt = timestamp ?? null;
  const age = ageSeconds(fetchedAt);
  const baseStatus = source === 'live'
    ? 'LIVE'
    : source === 'cache' || source === 'database'
    ? 'CACHED'
    : 'MISSING';
  const status = age != null && age > 60 * 60 * 24 ? 'STALE' : baseStatus;

  return {
    name: source === 'cache' ? 'Redis cache' : source === 'database' ? 'Database cache' : source === 'live' ? 'Live provider' : 'Unknown source',
    status,
    fetchedAt,
    cacheAgeSeconds: age,
  };
}

export function buildScenarioPlan(plan: any): ResearchScenarioPlan | null {
  if (!plan) return null;
  return {
    referenceType: typeof plan.entryType === 'string' ? plan.entryType : null,
    triggers: Array.isArray(plan.triggers) ? plan.triggers.map(String) : [],
    invalidationLogic: typeof plan.stopRule === 'string' ? plan.stopRule : null,
    reactionZones: Array.isArray(plan.targets) ? plan.targets.map(String) : [],
    managementNotes: Array.isArray(plan.management) ? plan.management.map(String) : [],
    modelSize: Number.isFinite(Number(plan.size)) ? Number(plan.size) : null,
  };
}

export function buildTruthLayer(input: BuildTruthLayerInput): TruthLayer {
  const sources = [
    classifyDataSource(input.quote?.source, input.quote?.fetchedAt),
    classifyDataSource(input.indicators?.source, input.indicators?.computedAt),
    input.mpe
      ? { name: 'Market Pressure Engine', status: 'LIVE' as ResearchDataStatus, fetchedAt: new Date().toISOString(), cacheAgeSeconds: 0 }
      : { name: 'Market Pressure Engine', status: 'MISSING' as ResearchDataStatus, fetchedAt: null, cacheAgeSeconds: null },
  ];

  const missing: string[] = [];
  const known: string[] = [];
  const riskFlags: string[] = [];

  if (Number.isFinite(Number(input.quote?.price)) && Number(input.quote?.price) > 0) {
    known.push(`${input.symbol} has a current reference price available.`);
  } else {
    missing.push('Current quote is unavailable.');
    riskFlags.push('Quote missing');
  }

  if (input.indicators) {
    known.push('Daily technical indicator context is available.');
    if (!Number.isFinite(Number(input.indicators.atr14))) riskFlags.push('ATR unavailable');
    if (!Number.isFinite(Number(input.indicators.adx14))) riskFlags.push('ADX unavailable');
  } else {
    missing.push('Technical indicators are unavailable.');
    riskFlags.push('Indicator context missing');
  }

  if (input.mpe) known.push('Market pressure context is available.');
  else missing.push('Market pressure context is unavailable.');

  if (input.cfe) known.push('Capital flow scenario context is available.');
  else missing.push('Capital flow scenario context is unavailable.');

  if (input.doctrine) known.push('Methodology match context is available.');
  else missing.push('Methodology match context is unavailable.');

  const staleCount = sources.filter((s) => s.status === 'STALE').length;
  const missingCount = sources.filter((s) => s.status === 'MISSING' || s.status === 'ERROR').length;
  const dataQuality: TruthLayer['dataQuality'] = missingCount >= 2
    ? 'MISSING'
    : staleCount > 0
    ? 'STALE'
    : missingCount > 0
    ? 'DEGRADED'
    : 'GOOD';

  return {
    whatWeKnow: known.length > 0 ? known : ['No reliable market context is currently available.'],
    whatWeDoNotKnow: missing,
    dataQuality,
    source: sources,
    lastUpdated: latestTimestamp(sources) ?? new Date().toISOString(),
    confidenceReason: buildConfidenceReason(input, dataQuality),
    invalidation: input.invalidation ?? null,
    riskFlags,
    nextUsefulCheck: buildNextUsefulCheck(input, dataQuality),
    disclaimer: 'Educational market research only. This is not financial advice and is not a recommendation to buy, sell, hold, or rebalance any financial product.',
  };
}

function ageSeconds(timestamp: string | null): number | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
}

function latestTimestamp(sources: ResearchDataSource[]): string | null {
  const times = sources
    .map((source) => source.fetchedAt ? new Date(source.fetchedAt).getTime() : NaN)
    .filter(Number.isFinite);
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

function buildConfidenceReason(input: BuildTruthLayerInput, dataQuality: TruthLayer['dataQuality']): string {
  const pieces: string[] = [];
  if (input.regime?.regime) pieces.push(`regime ${input.regime.regime}`);
  if (input.cfe?.market_mode) pieces.push(`market mode ${input.cfe.market_mode}`);
  if (input.flow?.flowBias) pieces.push(`flow bias ${input.flow.flowBias}`);
  if (input.doctrine?.doctrineId) pieces.push(`methodology ${input.doctrine.doctrineId}`);
  const base = pieces.length > 0 ? `Based on ${pieces.join(', ')}.` : 'Insufficient aligned evidence for a strong reading.';
  return dataQuality === 'GOOD' ? base : `${base} Data quality is ${dataQuality.toLowerCase()}, so the case should be treated as incomplete.`;
}

function buildNextUsefulCheck(input: BuildTruthLayerInput, dataQuality: TruthLayer['dataQuality']): string {
  if (dataQuality === 'MISSING' || dataQuality === 'STALE') return 'Refresh quote, indicators, and market pressure before relying on this case.';
  if (!input.mpe) return 'Add market pressure confirmation before escalating the case.';
  if (!input.cfe) return 'Add capital flow context to confirm whether the scenario has broader support.';
  return 'Monitor whether price respects the reference level and whether missing evidence improves or deteriorates.';
}

export interface NormalizedResearchCaseSave {
  symbol: string;
  assetClass: string;
  sourceType: string;
  title: string | null;
  dataQuality: TruthLayer['dataQuality'];
  generatedAt: string | null;
  payload: Record<string, unknown>;
}

export type ResearchCaseLifecycleDirection = 'long' | 'short';
export type ResearchCaseOutcomeStatus = 'pending' | 'confirmed' | 'invalidated' | 'expired' | 'reviewed';

export interface ResearchCaseOutcomeSuggestion {
  status: ResearchCaseOutcomeStatus;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
}

export interface BuildOutcomeSuggestionInput {
  savedState?: string | null;
  currentState?: string | null;
  createdAt?: string | null;
  currentUpdatedAt?: string | null;
  outcomeStatus?: string | null;
}

export function buildResearchCaseOutcomeSuggestion(input: BuildOutcomeSuggestionInput): ResearchCaseOutcomeSuggestion {
  const outcomeStatus = String(input.outcomeStatus || 'pending').toLowerCase();
  if (outcomeStatus !== 'pending') {
    return {
      status: outcomeStatus === 'confirmed' || outcomeStatus === 'invalidated' || outcomeStatus === 'expired' || outcomeStatus === 'reviewed'
        ? outcomeStatus
        : 'reviewed',
      confidence: 'high',
      reason: 'This research case has already been manually reviewed.',
    };
  }

  const currentState = String(input.currentState || '').toUpperCase();
  const savedState = String(input.savedState || '').toUpperCase();

  if (currentState === 'BLOCKED' || currentState === 'COOLDOWN') {
    return {
      status: 'invalidated',
      confidence: savedState && savedState !== currentState ? 'high' : 'medium',
      reason: `Latest lifecycle state is ${currentState}, which suggests the original case no longer has aligned evidence.`,
    };
  }

  if (currentState === 'EXECUTE' || currentState === 'MANAGE') {
    return {
      status: 'confirmed',
      confidence: savedState === 'ARMED' || savedState === 'STALK' ? 'high' : 'medium',
      reason: `Latest lifecycle state advanced to ${currentState}, which suggests the case progressed after it was saved.`,
    };
  }

  if (isOlderThanDays(input.createdAt, 14)) {
    return {
      status: 'expired',
      confidence: 'medium',
      reason: 'This case is older than 14 days without a confirmed or invalidated review.',
    };
  }

  if (!currentState) {
    return {
      status: 'pending',
      confidence: 'low',
      reason: 'No current lifecycle state is available for comparison yet.',
    };
  }

  return {
    status: 'pending',
    confidence: 'low',
    reason: `Latest lifecycle state is ${currentState}; more evidence is needed before suggesting a final outcome.`,
  };
}

export function normalizeResearchCaseDirection(input: unknown): ResearchCaseLifecycleDirection | undefined {
  const source = isRecord(input) ? input : {};
  const setup = isRecord(source.setup) ? source.setup : {};
  const candidates = [
    source.direction,
    source.bias,
    source.side,
    setup.direction,
    setup.bias,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').toLowerCase();
    if (value.includes('long') || value.includes('bull')) return 'long';
    if (value.includes('short') || value.includes('bear')) return 'short';
  }

  return undefined;
}

export function normalizeResearchCaseForSave(input: unknown): NormalizedResearchCaseSave {
  const body = isRecord(input) ? input : {};
  const rawCase = isRecord(body.researchCase)
    ? body.researchCase
    : isRecord(body.case)
    ? body.case
    : body;

  if (!isRecord(rawCase)) {
    throw new Error('researchCase object is required');
  }

  const symbol = String(rawCase.symbol ?? body.symbol ?? '').trim().toUpperCase();
  if (!symbol || symbol.length > 32 || !/^[A-Z0-9.\-/=^]+$/.test(symbol)) {
    throw new Error('valid symbol is required');
  }

  const assetClass = normalizeAssetClass(rawCase.assetClass ?? body.assetClass);
  const dataQuality = normalizeDataQuality(rawCase.dataQuality ?? (isRecord(rawCase.truthLayer) ? rawCase.truthLayer.dataQuality : undefined));
  const sourceType = normalizeSourceType(body.sourceType ?? rawCase.sourceType);
  const generatedAt = normalizeTimestamp(rawCase.generatedAt ?? body.generatedAt);
  const title = normalizeTitle(body.title ?? rawCase.title ?? `${symbol} Research Case`);

  return {
    symbol,
    assetClass,
    sourceType,
    title,
    dataQuality,
    generatedAt,
    payload: rawCase,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAssetClass(value: unknown): string {
  const raw = String(value || 'equity').toLowerCase().trim();
  if (raw === 'crypto') return 'crypto';
  if (raw === 'forex') return 'forex';
  if (raw === 'commodity' || raw === 'commodities') return 'commodity';
  if (raw === 'options') return 'options';
  return 'equity';
}

function normalizeDataQuality(value: unknown): TruthLayer['dataQuality'] {
  const raw = String(value || '').toUpperCase().trim();
  if (raw === 'GOOD') return 'GOOD';
  if (raw === 'DEGRADED') return 'DEGRADED';
  if (raw === 'STALE') return 'STALE';
  return 'MISSING';
}

function normalizeSourceType(value: unknown): string {
  const raw = String(value || 'manual').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
  return raw.slice(0, 40) || 'manual';
}

function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeTitle(value: unknown): string | null {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 160) : null;
}

function isOlderThanDays(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed > days * 24 * 60 * 60 * 1000;
}