export type PermissionState = 'YES' | 'CONDITIONAL' | 'NO';

export interface NewsGateModel {
  permission: PermissionState;
  riskState: string;
  volRegime: string;
  catalystDensity: string;
  narrativeStrength: string;
  executionMode: string;
  topNarrative: string;
  confidencePct: number;
  rotationLeaders: string[];
  warnings: string[];
  sentimentPct: number;
  eventRiskLabel: string;
  eventRiskCountdown: string;
  briefAllowed: string[];
  briefAvoid: string[];
}

export interface DecisionNewsItem {
  id: string;
  raw: {
    title: string;
    summary: string;
    url: string;
    source: string;
    tickerSentiments?: Array<{ ticker: string }>;
    aiWhyMatters?: string;
  };
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  impactScore: number;
  quality: number;
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  tags: string[];
  narrative: string;
  mentions: number;
}

export interface NarrativeGroup {
  narrative: string;
  items: DecisionNewsItem[];
  bullish: number;
  bearish: number;
  avgImpact: number;
}
