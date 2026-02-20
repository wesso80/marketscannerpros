import Link from 'next/link';

interface GlobalMarketState {
  regime: 'trend' | 'range' | 'expansion' | 'compression';
  riskState: 'risk-on' | 'neutral' | 'risk-off';
  volatility: 'low' | 'normal' | 'elevated';
  breadth: 'weak' | 'neutral' | 'strong';
  liquidity: 'negative' | 'neutral' | 'positive';
  gammaState: 'short-gamma' | 'neutral' | 'long-gamma';
}

interface ExecutionGuidance {
  bias: 'long' | 'short' | 'neutral';
  strategyMode: string;
  shortPermission: 'disabled' | 'tactical' | 'allowed';
  confidence: number;
}

interface Playbook {
  directives: string[];
  mtfAlignment: number;
  expectedRange: 'low' | 'moderate' | 'high';
}

interface ActiveAsset {
  symbol: string;
  structure: string;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  mtfAlignment: number;
}

interface RiskSnapshot {
  portfolioHeat?: number;
  openRiskLevel?: 'low' | 'moderate' | 'high';
  maxAllocation?: number;
  netExposure?: 'long' | 'short' | 'neutral';
  globalRiskIndex?: number;
  macroStress?: 'low' | 'medium' | 'high';
  liquidityRegime?: string;
}

interface TerminalStatus {
  scanner: {
    highProbability: number;
    newSignals: number;
    shortSetups: number;
  };
  options: {
    gammaCandidates: number;
    volExpansion: number;
  };
  deepAnalysis: {
    regimeShiftAlerts: number;
    priorityReviews: number;
  };
  journal: {
    openTrades: number;
    recentClosed: number;
  };
  portfolio: {
    activePositions: number;
    riskFlags: number;
  };
}

interface SystemCycleState {
  observe: boolean;
  contextualize: boolean;
  decide: boolean;
  execute: boolean;
  learn: boolean;
}

const marketState: GlobalMarketState = {
  regime: 'expansion',
  riskState: 'risk-on',
  volatility: 'normal',
  breadth: 'strong',
  liquidity: 'positive',
  gammaState: 'neutral',
};

const executionGuidance: ExecutionGuidance = {
  bias: 'long',
  strategyMode: 'BREAKOUT / TREND PULLBACK',
  shortPermission: 'tactical',
  confidence: 72,
};

const playbook: Playbook = {
  directives: [
    'Buy pullbacks in leading sectors',
    'Prioritize high RS names',
    'Avoid mean reversion setups',
  ],
  mtfAlignment: 3,
  expectedRange: 'moderate',
};

const activeAssets: ActiveAsset[] = [
  { symbol: 'BTCUSD', structure: 'Volatility Expansion', direction: 'long', confidence: 77, mtfAlignment: 3 },
  { symbol: 'NVDA', structure: 'Trend Pullback', direction: 'long', confidence: 74, mtfAlignment: 4 },
  { symbol: 'MSFT', structure: 'Range Break', direction: 'long', confidence: 69, mtfAlignment: 3 },
  { symbol: 'AAPL', structure: 'Compression Resolve', direction: 'neutral', confidence: 61, mtfAlignment: 2 },
  { symbol: 'TSLA', structure: 'Failed Bounce', direction: 'short', confidence: 58, mtfAlignment: 2 },
];

const riskSnapshot: RiskSnapshot = {
  portfolioHeat: 38,
  openRiskLevel: 'moderate',
  maxAllocation: 60,
  netExposure: 'long',
};

const terminalStatus: TerminalStatus = {
  scanner: {
    highProbability: 3,
    newSignals: 2,
    shortSetups: 1,
  },
  options: {
    gammaCandidates: 4,
    volExpansion: 2,
  },
  deepAnalysis: {
    regimeShiftAlerts: 1,
    priorityReviews: 3,
  },
  journal: {
    openTrades: 2,
    recentClosed: 5,
  },
  portfolio: {
    activePositions: 6,
    riskFlags: 1,
  },
};

const systemCycle: SystemCycleState = {
  observe: true,
  contextualize: true,
  decide: true,
  execute: true,
  learn: false,
};

const tonePill = (tone: 'green' | 'yellow' | 'red' | 'gray') => {
  if (tone === 'green') {
    return {
      border: '1px solid rgba(16,185,129,0.42)',
      background: 'rgba(16,185,129,0.14)',
      color: '#6ee7b7',
    };
  }

  if (tone === 'yellow') {
    return {
      border: '1px solid rgba(251,191,36,0.42)',
      background: 'rgba(251,191,36,0.14)',
      color: '#fde68a',
    };
  }

  if (tone === 'red') {
    return {
      border: '1px solid rgba(239,68,68,0.42)',
      background: 'rgba(239,68,68,0.14)',
      color: '#fca5a5',
    };
  }

  return {
    border: '1px solid rgba(148,163,184,0.34)',
    background: 'rgba(148,163,184,0.12)',
    color: '#cbd5e1',
  };
};

const signalTone = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.includes('expansion') || lower.includes('risk-on') || lower.includes('strong') || lower.includes('positive') || lower.includes('long-gamma')) {
    return 'green' as const;
  }

  if (lower.includes('compression') || lower.includes('risk-off') || lower.includes('weak') || lower.includes('negative') || lower.includes('short-gamma')) {
    return 'red' as const;
  }

  return 'yellow' as const;
};

const directionTone = (direction: 'long' | 'short' | 'neutral') => {
  if (direction === 'long') return tonePill('green');
  if (direction === 'short') return tonePill('red');
  return tonePill('gray');
};

const cycleTone = (stage: keyof SystemCycleState, active: boolean) => {
  if (!active) return tonePill('gray');
  if (stage === 'decide') return tonePill('yellow');
  if (stage === 'execute') return tonePill('red');
  return tonePill('green');
};

export default function HomePage() {
  const confidenceWidth = `${Math.max(0, Math.min(100, executionGuidance.confidence))}%`;
  const reducedSize = executionGuidance.confidence < 55;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--msp-bg)', color: 'var(--msp-text)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0.9rem 1rem 2rem' }}>
        <div className="grid grid-cols-12 gap-4">
          <section
            className="col-span-12"
            style={{
              position: 'sticky',
              top: 8,
              zIndex: 30,
              borderRadius: 14,
              border: '1px solid var(--msp-border-strong)',
              background: 'var(--msp-panel)',
              padding: '0.9rem',
              display: 'grid',
              gap: '0.9rem',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.48rem' }}>
              {[
                { label: 'REGIME', value: marketState.regime.toUpperCase() },
                { label: 'RISK', value: marketState.riskState.toUpperCase() },
                { label: 'VOLATILITY', value: marketState.volatility.toUpperCase() },
                { label: 'BREADTH', value: marketState.breadth.toUpperCase() },
                { label: 'LIQUIDITY', value: marketState.liquidity.toUpperCase() },
                { label: 'GAMMA', value: marketState.gammaState.toUpperCase() },
              ].map((badge) => (
                <div
                  key={badge.label}
                  style={{
                    ...tonePill(signalTone(badge.value)),
                    borderRadius: 999,
                    padding: '0.24rem 0.6rem',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                  }}
                >
                  {badge.label}: {badge.value}
                </div>
              ))}
            </div>

            <div
              style={{
                borderRadius: 12,
                border: '1px solid var(--msp-border)',
                background: 'var(--msp-card)',
                padding: '0.9rem',
                display: 'grid',
                gap: '0.46rem',
              }}
            >
              <div style={{ fontSize: 'clamp(1.05rem, 2.2vw, 1.45rem)', fontWeight: 850, lineHeight: 1.15 }}>
                EXECUTION BIAS: {executionGuidance.bias.toUpperCase()} CONTINUATION
              </div>
              <div style={{ color: 'var(--msp-text-muted)', fontWeight: 700, letterSpacing: '0.03em' }}>
                STRATEGY MODE: {executionGuidance.strategyMode}
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.88rem' }}>
                SHORTS: {executionGuidance.shortPermission.toUpperCase()} ONLY
              </div>
              <div style={{ display: 'grid', gap: '0.38rem', marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--msp-text-muted)' }}>
                  <span>CONFIDENCE</span>
                  <strong style={{ color: '#e2e8f0' }}>{executionGuidance.confidence}%</strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'rgba(30,41,59,0.85)', overflow: 'hidden', border: '1px solid var(--msp-border)' }}>
                  <div style={{ width: confidenceWidth, height: '100%', background: reducedSize ? '#f59e0b' : 'var(--msp-accent)' }} />
                </div>
                {reducedSize && (
                  <div style={{ ...tonePill('yellow'), borderRadius: 8, padding: '0.34rem 0.48rem', fontSize: '0.75rem', fontWeight: 700 }}>
                    REDUCED SIZE ENVIRONMENT
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="col-span-12 md:col-span-6 xl:col-span-4" style={{ borderRadius: 14, border: '1px solid var(--msp-border)', background: 'var(--msp-card)', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.65rem' }}>
              Primary Playbook
            </div>
            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {playbook.directives.map((directive) => (
                <div key={directive} style={{ color: '#e2e8f0', fontSize: '0.88rem' }}>• {directive}</div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--msp-divider)', paddingTop: '0.62rem', color: 'var(--msp-text-muted)', fontSize: '0.82rem', display: 'grid', gap: '0.26rem' }}>
              <div>Multi-TF Alignment: {playbook.mtfAlignment} / 4</div>
              <div>Expected Range Expansion: {playbook.expectedRange.toUpperCase()}</div>
            </div>
          </section>

          <section className="col-span-12 md:col-span-6 xl:col-span-4" style={{ borderRadius: 14, border: '1px solid var(--msp-border)', background: 'var(--msp-card)', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.65rem' }}>
              High Probability Assets
            </div>
            <div style={{ display: 'grid', gap: '0.48rem' }}>
              {activeAssets.slice(0, 5).map((asset) => (
                <Link
                  key={asset.symbol}
                  href={`/tools/markets?symbol=${asset.symbol}`}
                  style={{
                    textDecoration: 'none',
                    border: '1px solid var(--msp-border)',
                    borderRadius: 10,
                    background: 'var(--msp-panel)',
                    padding: '0.52rem 0.6rem',
                    display: 'grid',
                    gap: '0.26rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontSize: '0.86rem', fontWeight: 700 }}>
                    <span>{asset.symbol}</span>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>{asset.structure}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ ...directionTone(asset.direction), borderRadius: 999, padding: '0.16rem 0.46rem', fontSize: '0.68rem', fontWeight: 800 }}>
                      {asset.direction.toUpperCase()} BIAS
                    </span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.76rem' }}>{asset.confidence}%</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.76rem' }}>{asset.mtfAlignment}/4 TF</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="col-span-12 md:col-span-2 xl:col-span-4" style={{ borderRadius: 14, border: '1px solid var(--msp-border)', background: 'var(--msp-card)', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.65rem' }}>
              Risk Environment
            </div>
            {typeof riskSnapshot.portfolioHeat === 'number' ? (
              <div style={{ display: 'grid', gap: '0.42rem', fontSize: '0.84rem' }}>
                <div style={{ color: '#e2e8f0' }}>Portfolio Heat: {riskSnapshot.portfolioHeat}%</div>
                <div style={{ color: '#cbd5e1' }}>Open Risk Exposure: {(riskSnapshot.openRiskLevel || 'moderate').toUpperCase()}</div>
                <div style={{ color: '#cbd5e1' }}>Max Allocation Allowed: {riskSnapshot.maxAllocation ?? 60}%</div>
                <div style={{ color: '#cbd5e1' }}>Net Directional Exposure: {(riskSnapshot.netExposure || 'neutral').toUpperCase()}</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.42rem', fontSize: '0.84rem' }}>
                <div style={{ color: '#e2e8f0' }}>Global Risk Index: {riskSnapshot.globalRiskIndex ?? 72}</div>
                <div style={{ color: '#cbd5e1' }}>Macro Stress: {(riskSnapshot.macroStress || 'low').toUpperCase()}</div>
                <div style={{ color: '#cbd5e1' }}>Liquidity Regime: {riskSnapshot.liquidityRegime || 'Stable'}</div>
              </div>
            )}
          </section>

          <section className="col-span-12" style={{ borderRadius: 14, border: '1px solid var(--msp-border)', background: 'var(--msp-card)', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.65rem' }}>
              Execution Terminals
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[
                {
                  title: 'Scanner',
                  href: '/tools/scanner',
                  status: [
                    `High Probability Setups: ${terminalStatus.scanner.highProbability}`,
                    `New Signals: ${terminalStatus.scanner.newSignals}`,
                    `Short Bias Setups: ${terminalStatus.scanner.shortSetups}`,
                  ],
                },
                {
                  title: 'Options Confluence',
                  href: '/tools/options-confluence',
                  status: [
                    `Gamma Candidates: ${terminalStatus.options.gammaCandidates}`,
                    `Vol Expansion: ${terminalStatus.options.volExpansion}`,
                  ],
                },
                {
                  title: 'Deep Analysis',
                  href: '/tools/deep-analysis',
                  status: [
                    `Regime Shift Alerts: ${terminalStatus.deepAnalysis.regimeShiftAlerts}`,
                    `Priority Reviews: ${terminalStatus.deepAnalysis.priorityReviews}`,
                  ],
                },
                {
                  title: 'Journal',
                  href: '/tools/journal',
                  status: [
                    `Open Trades: ${terminalStatus.journal.openTrades}`,
                    `Recent Closed: ${terminalStatus.journal.recentClosed}`,
                  ],
                },
                {
                  title: 'Portfolio',
                  href: '/tools/portfolio',
                  status: [
                    `Active Positions: ${terminalStatus.portfolio.activePositions}`,
                    `Risk Flags: ${terminalStatus.portfolio.riskFlags}`,
                  ],
                },
              ].map((tile) => (
                <Link
                  key={tile.title}
                  href={tile.href}
                  style={{
                    textDecoration: 'none',
                    border: '1px solid var(--msp-border)',
                    borderRadius: 12,
                    background: 'var(--msp-panel)',
                    padding: '0.76rem',
                    display: 'grid',
                    gap: '0.34rem',
                  }}
                >
                  <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '0.96rem' }}>{tile.title}</div>
                  {tile.status.map((row) => (
                    <div key={row} style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{row}</div>
                  ))}
                </Link>
              ))}
            </div>
          </section>

          <section className="col-span-12" style={{ borderRadius: 14, border: '1px solid var(--msp-border)', background: 'var(--msp-card)', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', letterSpacing: '0.06em', color: 'var(--msp-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.65rem' }}>
              System Cycle Tracker
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {[
                { key: 'observe' as const, label: 'Observe', active: systemCycle.observe },
                { key: 'contextualize' as const, label: 'Contextualize', active: systemCycle.contextualize },
                { key: 'decide' as const, label: 'Decide', active: systemCycle.decide },
                { key: 'execute' as const, label: 'Execute', active: systemCycle.execute },
                { key: 'learn' as const, label: 'Learn', active: systemCycle.learn },
              ].map((stage) => (
                <div
                  key={stage.label}
                  style={{
                    ...cycleTone(stage.key, stage.active),
                    borderRadius: 10,
                    padding: '0.5rem 0.62rem',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{stage.label}</span>
                  <span>{stage.active ? '🟢' : '⚪'}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
