/** All new free-tier customer copy lives here. Example values are never live claims. */
export const FREE_COPY = {
  olderData: 'Some data is older; check its date before researching further.',
  details: 'Details', savedList: 'Latest saved list', scanner: 'Scanner', macro: 'Macro summary',
  research: 'Research and education only. Not a trade instruction.',
  source: 'Daily picks database', basis: 'Saved daily snapshot', stampUnavailable: 'Time not supplied',
  demoTitle: 'Explore one symbol', scanAapl: 'Scan AAPL', of: 'of', scansLeft: 'scans left today', resets: 'resets',
  scanLimit: (n: number) => `Today’s ${n} scans are used. Pro includes unlimited scans.`,
  price: 'Price', rsi: 'RSI', coverage: 'Coverage', scanSource: 'Scanner', lastBar: 'Last completed bar', fullAnalysis: 'Open full analysis',
  treasury: 'US Treasury · 10 year', inflation: 'Inflation rate', macroSource: 'Macro database', observation: 'Published observation', deepMacro: 'Explore macro research',
  picks: 'research picks',
  seeAll: 'See all', loading: 'Loading…', unavailable: 'Not available right now', retry: 'Try again',
  signIn: 'Sign in', signedIn: 'Signed in. Opening your page…',
  upgrade: 'Unlock with Pro', guarantee: '7-day money-back guarantee', example: 'Example',
  startFree: 'Start Free · no card needed',
} as const;
