export interface ToolGuide {
  route: string;
  badge: string;
  title: string;
  summary: string;
  steps: string[];
  tips: string[];
}

export const TOOL_GUIDES: ToolGuide[] = [
  {
    route: '/pricing',
    badge: 'Pricing',
    title: 'Plans & Upgrades',
    summary: 'Choose the plan that matches your workflow intensity and AI usage needs.',
    steps: [
      'Compare Free, Pro, and Pro Trader features.',
      'Select monthly or yearly billing.',
      'Start checkout and complete activation with your email.',
    ],
    tips: [
      'Use yearly billing if you plan to trade consistently.',
      'Match plan tier to your expected AI and backtest usage.',
    ],
  },
  {
    route: '/auth',
    badge: 'Auth',
    title: 'Sign In & Activation',
    summary: 'Authenticate with your checkout email to activate session and tool access.',
    steps: [
      'Enter the same email used during checkout.',
      'Wait for activation confirmation and redirect.',
      'If needed, restart checkout from pricing when no subscription is found.',
    ],
    tips: [
      'Use one primary billing email for all devices.',
      'Check spam folder if verification-related messages are delayed.',
    ],
  },
  {
    route: '/account',
    badge: 'Account',
    title: 'Account Settings',
    summary: 'Manage subscription, view plan features, and access referral tools.',
    steps: [
      'Review your current tier and account email.',
      'Open billing portal for subscription changes.',
      'Copy/share referral links and track referral stats.',
    ],
    tips: [
      'Reconfirm plan access after upgrades or cancellations.',
      'Use referral links directly from account for clean tracking.',
    ],
  },
  {
    route: '/tools',
    badge: 'Tools Hub',
    title: 'Tools Workspace',
    summary: 'Use the tools hub to choose your workflow: discover, validate, test, and review.',
    steps: [
      'Choose your current task: scanning, planning, testing, or review.',
      'Open the matching tool and confirm market/risk context first.',
      'Move outcomes into alerts, portfolio, and journal for continuity.',
    ],
    tips: ['Run a consistent daily sequence to avoid context switching.', 'Favor depth over tool-hopping when conditions are noisy.'],
  },
  {
    route: '/operator',
    badge: 'Private',
    title: 'Private Research Dashboard',
    summary: 'Private internal dashboard for reviewing presence, context, and workflow state.',
    steps: [
      'Check presence mode and context state first.',
      'Review top-attention symbols and confidence context.',
      'Compare suggested next checks with risk posture before escalating a scenario.',
    ],
    tips: [
      'Use feedback buttons after each review to improve adaptation.',
      'Treat controlMatrix output as internal research state, not public advice.',
    ],
  },
  {
    route: '/tools/scanner',
    badge: 'Scanner',
    title: 'Market Scanner',
    summary: 'Scan symbols, evaluate setup quality, and promote high-confidence candidates into plans.',
    steps: [
      'Run a scan with your selected asset class and timeframe.',
      'Inspect confidence, direction, and confluence evidence.',
      'Promote pass-grade candidates and review generated plan details.',
    ],
    tips: [
      'Use tighter watchlists when volatility is high.',
      'Prioritize symbols with stable directional agreement across signals.',
    ],
  },
  {
    route: '/tools/terminal?tab=options-confluence',
    badge: 'Options',
    title: 'Options Confluence',
    summary: 'Combine options flow, IV context, and structure to produce higher-quality setups.',
    steps: [
      'Load symbol and timeframe, then run confluence analysis.',
      'Check confluence tier, key levels, and strategy classification.',
      'Promote pass outcomes into workflow plans and alerts.',
    ],
    tips: [
      'Guided mode is faster for analysis; Advanced mode is better for diagnostics.',
      'Avoid forcing setups when volatility regime and flow disagree.',
    ],
  },
  {
    route: '/tools/workspace?tab=alerts',
    badge: 'Alerts',
    title: 'Alerts Center',
    summary: 'Create automated conditions and monitor triggered events across your watch universe.',
    steps: [
      'Define symbol, condition, and threshold.',
      'Enable recurring checks and notification preferences.',
      'Review triggered alerts and send relevant ones to journal/workflow.',
    ],
    tips: [
      'Use fewer, higher-conviction alerts to reduce noise.',
      'Tie alerts to planned entry zones instead of arbitrary prices.',
    ],
  },
  {
    route: '/tools/workspace?tab=portfolio',
    badge: 'Portfolio',
    title: 'Portfolio Tracking',
    summary: 'Track exposure, concentration, and performance to maintain risk discipline.',
    steps: [
      'Review open positions and aggregate exposure.',
      'Check concentration and drawdown before adding risk.',
      'Use performance history to evaluate consistency over time.',
    ],
    tips: [
      'High concentration should reduce new position sizing.',
      'Use drawdown state as a hard guardrail for pace.',
    ],
  },
  {
    route: '/tools/workspace?tab=journal',
    badge: 'Journal',
    title: 'Trade Journal',
    summary: 'Capture execution decisions and outcomes to improve repeatability and edge quality.',
    steps: [
      'Log entries with setup, side, and rationale.',
      'Record exits and classify outcome quality.',
      'Review stats and recurring behavior patterns weekly.',
    ],
    tips: [
      'Write why you entered before the trade, not after.',
      'Track mistakes with consistent tags for cleaner analytics.',
    ],
  },
  {
    route: '/tools/workspace?tab=backtest',
    badge: 'Backtest',
    title: 'Strategy Backtester',
    summary: 'Validate strategy assumptions on historical data before risking live capital.',
    steps: [
      'Select symbol, strategy, timeframe, and period.',
      'Run test and inspect win rate, profit factor, and drawdown.',
      'Promote robust configurations into plan templates.',
    ],
    tips: [
      'Prioritize stability metrics over single-period returns.',
      'Retest after any strategy parameter change.',
    ],
  },
  {
    route: '/tools/scanner',
    badge: 'ARCA AI',
    title: 'ARCA AI Panel',
    summary: 'Use the floating AI research panel beside live Scanner context.',
    steps: [
      'Ask a focused market or scenario question.',
      'Compare the response against scanner evidence and data quality.',
      'Convert useful research context into alerts, plans, or journal notes.',
    ],
    tips: [
      'Use specific symbols and timeframes for higher-quality output.',
      'Treat AI output as research support, not personal advice.',
    ],
  },
  {
    route: '/tools/explorer',
    badge: 'Markets',
    title: 'Markets Overview',
    summary: 'Monitor broad market conditions before drilling into symbol-level execution.',
    steps: [
      'Start with market trend and breadth context.',
      'Identify sectors or themes with strongest relative momentum.',
      'Move qualified opportunities into scanner or watchlists.',
    ],
    tips: ['Use this as your daily top-down checkpoint.', 'Avoid trading against dominant market regime.'],
  },
  {
    route: '/tools/explorer?tab=movers',
    badge: 'Movers',
    title: 'Market Movers',
    summary: 'Track strongest gainers and losers for momentum and mean-reversion opportunities.',
    steps: [
      'Review top movers and liquidity profile.',
      'Filter for symbols matching your strategy profile.',
      'Send qualified symbols to scanner or alerts.',
    ],
    tips: ['Confirm follow-through with volume, not price alone.', 'Avoid thin names during high-spread sessions.'],
  },
  {
    route: '/tools/workspace?tab=watchlists',
    badge: 'Watchlists',
    title: 'Watchlists',
    summary: 'Organize symbols by strategy so scans and alerts stay focused.',
    steps: [
      'Create strategy-specific watchlists.',
      'Add high-conviction symbols with clean thesis notes.',
      'Feed watchlists into scanner and alert workflows.',
    ],
    tips: ['Smaller focused lists outperform giant mixed lists.', 'Archive stale symbols weekly.'],
  },
  {
    route: '/tools/research',
    badge: 'News',
    title: 'News Feed',
    summary: 'Use macro and company catalysts to avoid blind technical setups.',
    steps: ['Scan headlines by symbol/theme.', 'Mark actionable catalysts.', 'Adjust risk and timing around event windows.'],
    tips: ['Price reaction matters more than headline tone.', 'Avoid new entries right before binary events.'],
  },
  {
    route: '/tools/explorer?tab=macro',
    badge: 'Macro',
    title: 'Macro Dashboard',
    summary: 'Track macro drivers that shift risk appetite and trend persistence.',
    steps: ['Review key macro indicators.', 'Map macro regime to current strategy bias.', 'Adjust position sizing by regime risk.'],
    tips: ['Treat macro as context, not single-signal triggers.', 'Reduce aggression in mixed macro regimes.'],
  },
  {
    route: '/tools/explorer?tab=movers',
    badge: 'Leaders',
    title: 'Gainers & Losers',
    summary: 'Identify leadership and weakness quickly for intraday prioritization.',
    steps: ['Open top gainers/losers tables.', 'Validate with liquidity and structure.', 'Queue candidates into scanner.'],
    tips: ['Leadership rotation can invalidate old watchlist priorities.', 'Beware one-candle spikes with no structure.'],
  },
  {
    route: '/tools/explorer?tab=heatmap',
    badge: 'Heatmap',
    title: 'Heatmap',
    summary: 'Visualize strength clusters across sectors and assets.',
    steps: ['Read hot/cold clusters.', 'Drill into strongest sectors.', 'Cross-check with scanner confidence.'],
    tips: ['Use heatmaps for direction, scanner for execution.', 'Look for broad participation, not isolated spikes.'],
  },
  {
    route: '/tools/explorer?tab=equity',
    badge: 'Equity',
    title: 'Equity Explorer',
    summary: 'Research equities with structured market, technical, and context data.',
    steps: ['Search symbol fundamentals/context.', 'Validate trend and volatility conditions.', 'Promote symbols to plans/alerts as needed.'],
    tips: ['Check earnings proximity before planning entries.', 'Use explorer for thesis, scanner for timing.'],
  },
  {
    route: '/tools/company-overview',
    badge: 'Company',
    title: 'Company Overview',
    summary: 'Get quick business-level context before committing trade risk.',
    steps: ['Load company profile and key metrics.', 'Review business and valuation context.', 'Integrate with technical setup quality.'],
    tips: ['Avoid mismatch between thesis horizon and trade timeframe.', 'Use overview to spot narrative risk.'],
  },
  {
    route: '/tools/golden-egg',
    badge: 'Charts',
    title: 'Intraday Charts',
    summary: 'Use structured chart views to refine levels and invalidation.',
    steps: ['Select symbol and timeframe.', 'Apply key indicators and levels.', 'Define reference/invalidation/key level zones.'],
    tips: ['One clean setup beats many noisy micro-signals.', 'Mark invalidation before acting.'],
  },
  {
    route: '/tools/research?tab=earnings',
    badge: 'Earnings',
    title: 'Earnings Intelligence',
    summary: 'Evaluate earnings-driven volatility and event risk inside Market Intelligence.',
    steps: ['Review upcoming earnings names.', 'Assess implied volatility context.', 'Adjust scenario timing around report windows.'],
    tips: ['Binary event risk warrants conservative assumptions.', 'Avoid relying on unclear evidence through reports.'],
  },
  {
    route: '/tools/research?tab=earnings',
    badge: 'Calendar',
    title: 'Earnings Calendar',
    summary: 'Track report schedules to avoid accidental event exposure.',
    steps: ['Filter by date and relevance.', 'Tag symbols with pending events.', 'Route flagged names into watchlists/alerts.'],
    tips: ['Use pre/post-market timing details.', 'Pair with scanner to reprioritize daily focus.'],
  },
  {
    route: '/tools/research?tab=calendar',
    badge: 'Macro Events',
    title: 'Economic Calendar',
    summary: 'Plan trading around high-impact macro releases.',
    steps: ['Check high-impact events first.', 'Align intraday risk windows.', 'Lower exposure into uncertain prints.'],
    tips: ['Volatility often starts before release time.', 'Prioritize survival over prediction on event days.'],
  },
  {
    route: '/tools/explorer?tab=crypto-command',
    badge: 'Crypto',
    title: 'Crypto Markets',
    summary: 'Monitor crypto market structure, trend shifts, and opportunity flow.',
    steps: ['Review dominant trend and breadth.', 'Identify relative strength leaders.', 'Promote actionable setups to scanner/alerts.'],
    tips: ['Respect funding and liquidation risk during spikes.', 'Use smaller size in unstable regime transitions.'],
  },
  {
    route: '/tools/dashboard?tab=crypto',
    badge: 'Crypto Dashboard',
    title: 'Crypto Dashboard',
    summary: 'Central view for crypto momentum, derivatives sentiment, and risk context.',
    steps: ['Check dominance/funding/open-interest context.', 'Confirm directional consensus.', 'Review only when context and setup align.'],
    tips: ['Derivatives extremes often precede reversals.', 'Treat dashboard as context layer, not direct trigger.'],
  },
  {
    route: '/tools/explorer?tab=crypto',
    badge: 'Crypto Explorer',
    title: 'Crypto Explorer',
    summary: 'Deep dive into individual crypto assets for analysis.',
    steps: ['Select asset and review structure.', 'Inspect volatility and participation.', 'Map reference levels and risk constraints.'],
    tips: ['Use explorer for selection, scanner for timing context.', 'Avoid forcing low-liquidity assets.'],
  },
  {
    route: '/tools/crypto-heatmap',
    badge: 'Crypto Heatmap',
    title: 'Crypto Heatmap',
    summary: 'Visualize sector-level momentum and risk rotation in crypto.',
    steps: ['Read strongest/weakest clusters.', 'Prioritize liquid leaders.', 'Cross-check with confluence signals before acting.'],
    tips: ['Look for broad alignment in top assets.', 'Ignore isolated outliers without confirmation.'],
  },
  {
    route: '/tools/terminal?tab=time-confluence',
    badge: 'Confluence',
    title: 'Confluence Scanner',
    summary: 'Combine multiple factors into one score to rank setup quality.',
    steps: ['Run confluence scan for your universe.', 'Inspect score components and regime fit.', 'Promote top setups into plan workflow.'],
    tips: ['Guided mode is ideal for speed.', 'Use advanced diagnostics when confidence is borderline.'],
  },
  {
    route: '/tools/golden-egg',
    badge: 'Deep Analysis',
    title: 'Golden Egg Deep Analysis',
    summary: 'Generate structured multi-factor analysis for high-conviction decisions.',
    steps: ['Run deep analysis on selected symbol.', 'Review confidence and risk factors.', 'Convert strong outputs into actionable plans.'],
    tips: ['Use this for fewer but higher-quality decisions.', 'Document assumptions in journal before execution.'],
  },
  {
    route: '/tools',
    badge: 'AI Tools',
    title: 'AI Tools',
    summary: 'Use the current workflow and ARCA panel instead of the retired AI tools collection.',
    steps: ['Start from the workflow map.', 'Open the live research tool that matches the question.', 'Use ARCA for context, then validate against evidence.'],
    tips: ['Specific prompts produce better output.', 'Always validate outputs against source data.'],
  },
  {
    route: '/tools/commodities',
    badge: 'Commodities',
    title: 'Commodities',
    summary: 'Track commodity markets with structure, trend, and macro context.',
    steps: ['Review commodity trend state.', 'Check macro drivers and volatility.', 'Promote clean setups into scanner/alerts.'],
    tips: ['Commodities react strongly to macro surprises.', 'Use tighter risk in event-heavy sessions.'],
  },
];

export function getGuideByPath(pathname: string): ToolGuide | null {
  const exact = TOOL_GUIDES.find((guide) => guide.route === pathname);
  if (exact) return exact;
  return TOOL_GUIDES.find((guide) => pathname.startsWith(`${guide.route}/`)) || null;
}