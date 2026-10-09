import { FREE_DAILY_SCAN_LIMIT, FREE_JOURNAL_LIMIT } from '@/lib/free/limits';
import { ALERT_LIMITS } from '@/lib/alerts/planLimits';
import { WATCHLIST_LIMITS } from '@/lib/tiers';

/** All new free-tier customer copy lives here. Example values are never live claims. */
export const FREE_COPY = {
  olderData: 'Some data is older; check its date before researching further.',
  details: 'Details', savedList: 'Latest saved list', scanner: 'Scanner', macro: 'Macro summary',
  research: 'Research and education only. Not a trade instruction.',
  source: 'Stored daily observations', basis: 'Saved daily snapshot', stampUnavailable: 'Time not supplied',
  portfolioCount: (n: number) => `Portfolio tracker (${n} positions)`, aiCount: (n: number) => `${n} AI questions a day`, available: 'Available',
  notNow: 'Not now', moments: { scan: `Today’s ${FREE_DAILY_SCAN_LIMIT} scans are used. Pro includes unlimited scans.`, alerts: `Free keeps ${ALERT_LIMITS.free} alerts. Pro keeps up to ${ALERT_LIMITS.pro}, plus smart alerts.`, watchlists: `Free keeps ${WATCHLIST_LIMITS.free.watchlists} lists of ${WATCHLIST_LIMITS.free.items}. Pro keeps ${WATCHLIST_LIMITS.pro.watchlists} lists of ${WATCHLIST_LIMITS.pro.items}.`, portfolio: 'Your free portfolio is full. Pro includes more positions.', journal: `Free keeps ${FREE_JOURNAL_LIMIT} open entries. Pro includes unlimited journal entries.`, ai: 'Today’s AI allowance is used. Pro includes a higher daily allowance.' },
  deepDescription: 'Macro deep modules: Global M2, Liquidity, Fragility and more.', freeMacro: 'Open the free Macro summary',
  journalLimit: (n: number) => `Free keeps ${n} open journal entries. Close an entry or unlock Pro.`,
  journalCount: (n: number) => `${n} of ${FREE_JOURNAL_LIMIT} open entries`,
  pricing: { scans: `${FREE_DAILY_SCAN_LIMIT} scans a day`, picks: 'Today’s stored observations', alerts: `${ALERT_LIMITS.free} price alerts`, watchlists: `${WATCHLIST_LIMITS.free.watchlists} watchlists of ${WATCHLIST_LIMITS.free.items} symbols`, journal: `Journal (${FREE_JOURNAL_LIMIT} open entries)`, macro: 'Macro summary' },
  disclosure: 'Research and education only. Not financial advice.', readDisclosure: 'Read the disclosure',
  exampleSymbol: 'AAPL · example research', exampleEvidence: 'Price history · volume · market context',
  exampleBasis: 'Illustrative layout · no live market values', lockedDescription: 'Explore the complete research view and its supporting evidence.',
  optionsDescription: 'Options chain, flow and agreement for each researched symbol.', journalDescription: 'Unlimited journal entries with AI review.',
  goldenEgg: 'Regime, indicators, volatility and scenario context for one symbol.',
  today: 'Today', overview: 'Open full Overview', radar: 'Daily Radar', session: 'US market session', reportReady: 'Report ready',
  unlockReport: 'Unlock today’s full report', fromReport: (date: string) => `From ${date} report`,
  demoTitle: 'Explore one symbol', scanAapl: 'Scan AAPL', of: 'of', scansLeft: 'scans left today', resets: 'resets',
  scanLimit: (n: number) => `Today’s ${n} scans are used. Pro includes unlimited scans.`,
  price: 'Price', rsi: 'RSI', coverage: 'Coverage', scanSource: 'Scanner', lastBar: 'Last completed bar', fullAnalysis: 'Open full analysis',
  treasury: 'US Treasury · 10 year', inflation: 'Inflation rate', macroSource: 'Macro database', observation: 'Published observation', deepMacro: 'Explore macro research',
  picks: 'stored observations',
  seeAll: 'See all', loading: 'Loading…', unavailable: 'Not available right now', retry: 'Try again',
  signIn: 'Sign in', signedIn: 'Signed in. Opening your page…',
  upgrade: 'Unlock with Pro', guarantee: '7-day money-back guarantee', example: 'Example',
  startFree: 'Start Free · no card needed',
} as const;
