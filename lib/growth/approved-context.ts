// Approved MSP context — the ONLY platform information Claude may see when
// drafting public-facing content. Curated, compliance-checked, and free of
// private user data, payment data, API keys, and unpublished legal copy.
//
// If you want Claude to mention a new feature, pricing tier, or claim, add
// it here. Anything not in this file is off-limits.

export const APPROVED_DISCLAIMERS = {
  // Australian compliance-safe educational disclaimer.
  educational_short:
    'Educational only. Not financial advice. Trading involves risk.',
  educational_full:
    'MarketScanner Pros is an educational and informational tool. Nothing posted here is financial advice or a recommendation to trade. Past performance does not guarantee future results. Trading involves substantial risk of loss. Consult a licensed adviser before making investment decisions.',
};

export const APPROVED_FEATURES = [
  {
    key: 'scanner',
    name: 'Live Scanner',
    summary:
      'A multi-timeframe scanner that surfaces setups based on confluence — regime, volatility state, structure, and time clustering — rather than single-indicator triggers.',
  },
  {
    key: 'volatility-compression',
    name: 'Volatility Compression',
    summary:
      'Identifies symbols where volatility is compressed below historical baselines, with context on what an expansion would look like and what would invalidate the read.',
  },
  {
    key: 'opportunity-board',
    name: 'Opportunity Board',
    summary:
      'A ranked board of current setups with evidence quality, regime fit, and what confirms / what invalidates each idea. Designed for research review, not order placement.',
  },
  {
    key: 'morning-brief',
    name: 'Morning Brief',
    summary:
      'A pre-session note covering overnight context, key levels, calendar risk, and what would change the read by lunch.',
  },
  {
    key: 'learning-engine',
    name: 'Learning Engine',
    summary:
      'Outcome-based feedback that tracks which setup types follow through in current regime, with Wilson-bounded confidence so small samples never look like edges.',
  },
  {
    key: 'time-clustering',
    name: 'Time Confluence',
    summary:
      'Detects when multiple sessions, intraday windows, and historical reaction times line up — surfaces when timing edge is active vs absent.',
  },
  {
    key: 'journal',
    name: 'Trade Journal',
    summary:
      'Structured journaling that flags repeat mistakes, regime mismatches, and decisions that violate the trader\'s own playbook.',
  },
  {
    key: 'operator-terminal',
    name: 'Operator Terminal',
    summary:
      'A consolidated desk view: regime, structure, volatility, participation flow, time confluence, and cross-market confirmation in one place.',
  },
];

export const APPROVED_TIERS = [
  {
    key: 'trial',
    name: 'Free Trial',
    summary: 'Time-limited full access to evaluate the platform before committing.',
  },
  {
    key: 'pro_trader',
    name: 'Pro Trader',
    summary: 'Full access to scanner, opportunity board, morning brief, learning engine, journal, and operator terminal.',
  },
];

export const APPROVED_BRAND_POSITIONING = `
MarketScanner Pros is a research and analytics command centre for active
retail traders. It surfaces structure, regime, volatility, and time
confluence — the same lenses an institutional desk uses — without
pretending to be a broker or adviser. We do not place trades, route
orders, or give personal financial advice.
`.trim();

export interface ApprovedContext {
  positioning: string;
  features: typeof APPROVED_FEATURES;
  tiers: typeof APPROVED_TIERS;
  disclaimers: typeof APPROVED_DISCLAIMERS;
}

export function getApprovedContext(): ApprovedContext {
  return {
    positioning: APPROVED_BRAND_POSITIONING,
    features: APPROVED_FEATURES,
    tiers: APPROVED_TIERS,
    disclaimers: APPROVED_DISCLAIMERS,
  };
}

export function getApprovedFeature(key: string) {
  return APPROVED_FEATURES.find((f) => f.key === key);
}

export function approvedContextAsPromptBlock(featureKey?: string): string {
  const ctx = getApprovedContext();
  const featureBlock = featureKey
    ? (() => {
        const f = getApprovedFeature(featureKey);
        return f
          ? `\nFOCUS FEATURE: ${f.name}\n${f.summary}`
          : '';
      })()
    : '';
  return [
    'APPROVED MSP CONTEXT — you may reference these and nothing else:',
    '',
    'POSITIONING:',
    ctx.positioning,
    '',
    'FEATURES:',
    ...ctx.features.map((f) => `  • ${f.name} — ${f.summary}`),
    '',
    'TIERS:',
    ...ctx.tiers.map((t) => `  • ${t.name} — ${t.summary}`),
    '',
    'DISCLAIMER (use one of these on every post):',
    `  short: "${ctx.disclaimers.educational_short}"`,
    `  full:  "${ctx.disclaimers.educational_full}"`,
    featureBlock,
  ].join('\n');
}
