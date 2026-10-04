/** Reviewed presentation copy for Phase 1. Data labels remain provider facts. */
export const COPY = {
  nav: {
    overview: 'Overview', radar: 'Daily Radar', scanner: 'Scanner', symbol: 'Symbol', options: 'Options', track: 'Track',
    account: 'Account', settings: 'Account settings', referrals: 'Referrals', compliance: 'Compliance Hub', more: 'More',
  },
  today: {
    overview: 'Overview', subtitle: "Today's market at a glance. Research only.",
    loading: 'Loading…', current: 'Current', stale: 'Stale inputs', unavailable: 'Not available right now',
    regime: 'regime', snapshot: 'snapshot', sectors: 'Sectors, % change vs prior close', sectorSource: 'Alpha Vantage',
    lastClose: 'last close', sessionDay: 'New York session', timeUnknown: 'Not available right now', sourceUnknown: 'Not available right now',
    noQuote: 'no quote', na: 'No reading', sectorsUp: 'Sectors up', sampled: 'sectors with change data', noSectors: 'Sector data is not in this snapshot',
    dataStatus: 'Data status', degraded: 'needs a check', staleCount: 'stale', notTimed: 'not timed', show: 'Show', hide: 'Hide',
    btc: 'BTC', eth: 'ETH', spy: 'SPY',
  },
  radarCard: {
    title: "Today's report", source: 'Daily Radar', session: 'US session', candidates: 'candidates',
    older: 'Older report', open: 'Open Daily Radar', empty: 'No report stored yet.', unavailable: 'Report unavailable',
    teaser: 'A dated report each US session with ranked research candidates.', paid: 'Paid plan', plans: 'See plans', signIn: 'Sign in',
    loading: 'Loading report', timeUnknown: 'time unknown', healthUnknown: 'Health unknown',
    networkError: 'Network request failed.', invalidResponse: 'Invalid report response.', httpError: 'HTTP', generated: 'generated',
  },
} as const;
