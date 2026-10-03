/** The terminal analyses purchased options. Call/put is not the position direction. */
export function optionJournalParams(symbol: string, c: { type: 'call' | 'put'; strike: number; expiration: string; ask: number }, mode: 'scenario' | 'analysis'): URLSearchParams {
  if (!Number.isFinite(c.ask) || c.ask <= 0) throw new Error('A valid ask is required for a buy entry');
  const label = `${symbol} ${c.expiration} ${c.strike}${c.type === 'call' ? 'C' : 'P'}`;
  return new URLSearchParams({ symbol, side: 'LONG', tradeType: 'Options', optionType: c.type.toUpperCase(),
    strikePrice: String(c.strike), expirationDate: c.expiration, quantity: '1', entryPrice: String(c.ask),
    premium: String(c.ask), strategy: 'Options', setup: label,
    notes: `${mode === 'scenario' ? 'Options scenario' : 'Analysis notes'}: ${label}\nBuy entry basis: ask $${c.ask} per share. One standard contract = 100 shares. Review before saving; no order has been executed.`,
  });
}
