/**
 * Alpha Vantage options payloads shaped exactly like the live API (all numbers are strings, envelope
 * { endpoint, message, data }, no top-level date — the session date is on every row).
 *
 * HISTORICAL_OPTIONS_IBM: verbatim rows from a real response (function=HISTORICAL_OPTIONS&symbol=IBM, fetched
 * 2026-09-25 ET, previous session 2026-09-24). Two-sided quotes on ~90% of that chain (1992/2200 rows).
 *
 * REALTIME_OPTIONS_IBM: same field layout as AV's REALTIME_OPTIONS (require_greeks=true) schema, re-dated to the
 * current session with slightly moved quotes.
 *
 * FMV_MARKS_IBM: REALTIME_OPTIONS_FMV as the Options Terminal saw it live (AAPL, 25 Sep 2026): real contracts and a
 * fair-value `mark`, but no usable bid/ask ("0.00") on any row — 98/98 contracts had no two-sided quote.
 * (Alpha Vantage does not publish the FMV field list; its MCP describes the function as "FMV mark prices".)
 */
export type AvOptionRow = Record<string, string>;

export const HISTORICAL_OPTIONS_IBM_ROWS: AvOptionRow[] = [
  {
    "contractID": "IBM261016C00220000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "220.00",
    "type": "call",
    "last": "11.65",
    "mark": "11.72",
    "bid": "10.95",
    "bid_size": "137",
    "ask": "12.50",
    "ask_size": "197",
    "volume": "18",
    "open_interest": "517",
    "date": "2026-09-24",
    "implied_volatility": "0.33682",
    "delta": "0.67422",
    "gamma": "0.01919",
    "theta": "-0.16876",
    "vega": "0.20083",
    "rho": "0.08518"
  },
  {
    "contractID": "IBM261016P00220000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "220.00",
    "type": "put",
    "last": "3.95",
    "mark": "3.88",
    "bid": "3.70",
    "bid_size": "97",
    "ask": "4.05",
    "ask_size": "50",
    "volume": "422",
    "open_interest": "4661",
    "date": "2026-09-24",
    "implied_volatility": "0.31731",
    "delta": "-0.31759",
    "gamma": "0.02015",
    "theta": "-0.13524",
    "vega": "0.19872",
    "rho": "-0.04575"
  },
  {
    "contractID": "IBM261016C00225000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "225.00",
    "type": "call",
    "last": "8.70",
    "mark": "8.75",
    "bid": "8.40",
    "bid_size": "16",
    "ask": "9.10",
    "ask_size": "142",
    "volume": "58",
    "open_interest": "2613",
    "date": "2026-09-24",
    "implied_volatility": "0.33682",
    "delta": "0.57136",
    "gamma": "0.02091",
    "theta": "-0.18036",
    "vega": "0.21882",
    "rho": "0.07289"
  },
  {
    "contractID": "IBM261016P00225000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "225.00",
    "type": "put",
    "last": "5.88",
    "mark": "5.93",
    "bid": "5.65",
    "bid_size": "68",
    "ask": "6.20",
    "ask_size": "48",
    "volume": "151",
    "open_interest": "1605",
    "date": "2026-09-24",
    "implied_volatility": "0.32707",
    "delta": "-0.42749",
    "gamma": "0.02152",
    "theta": "-0.15161",
    "vega": "0.21871",
    "rho": "-0.06213"
  },
  {
    "contractID": "IBM261016C00230000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "230.00",
    "type": "call",
    "last": "6.23",
    "mark": "6.17",
    "bid": "6.00",
    "bid_size": "48",
    "ask": "6.35",
    "ask_size": "17",
    "volume": "559",
    "open_interest": "2274",
    "date": "2026-09-24",
    "implied_volatility": "0.32707",
    "delta": "0.46377",
    "gamma": "0.02179",
    "theta": "-0.17517",
    "vega": "0.22147",
    "rho": "0.05975"
  },
  {
    "contractID": "IBM261016P00230000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "230.00",
    "type": "put",
    "last": "8.50",
    "mark": "8.50",
    "bid": "8.15",
    "bid_size": "88",
    "ask": "8.85",
    "ask_size": "45",
    "volume": "113",
    "open_interest": "1045",
    "date": "2026-09-24",
    "implied_volatility": "0.32707",
    "delta": "-0.53623",
    "gamma": "0.02179",
    "theta": "-0.15077",
    "vega": "0.22147",
    "rho": "-0.07856"
  },
  {
    "contractID": "IBM261016C00235000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "235.00",
    "type": "call",
    "last": "4.39",
    "mark": "4.43",
    "bid": "4.20",
    "bid_size": "47",
    "ask": "4.65",
    "ask_size": "87",
    "volume": "336",
    "open_interest": "2485",
    "date": "2026-09-24",
    "implied_volatility": "0.33682",
    "delta": "0.36466",
    "gamma": "0.02001",
    "theta": "-0.16867",
    "vega": "0.20947",
    "rho": "0.04721"
  },
  {
    "contractID": "IBM261016P00235000",
    "symbol": "IBM",
    "expiration": "2026-10-16",
    "strike": "235.00",
    "type": "put",
    "last": "11.60",
    "mark": "11.50",
    "bid": "10.60",
    "bid_size": "340",
    "ask": "12.40",
    "ask_size": "296",
    "volume": "26",
    "open_interest": "4024",
    "date": "2026-09-24",
    "implied_volatility": "0.31731",
    "delta": "-0.64514",
    "gamma": "0.02104",
    "theta": "-0.13285",
    "vega": "0.20750",
    "rho": "-0.09520"
  }
];

export const historicalOptionsIbm = () => ({ endpoint: 'Historical Options', message: 'success', data: HISTORICAL_OPTIONS_IBM_ROWS.map((r) => ({ ...r })) });

const bump = (v: string, by: number) => (Number(v) + by).toFixed(2);

export const realtimeOptionsIbm = () => ({
  endpoint: 'Realtime Options',
  message: 'success',
  data: HISTORICAL_OPTIONS_IBM_ROWS.map((r) => ({ ...r, date: '2026-09-25', bid: bump(r.bid, 0.1), ask: bump(r.ask, 0.1), mark: bump(r.mark, 0.1) })),
});

export const fmvMarksIbm = () => ({
  endpoint: 'Realtime Options FMV',
  message: 'success',
  data: HISTORICAL_OPTIONS_IBM_ROWS.map((r) => ({ ...r, date: '2026-09-25', mark: bump(r.mark, 0.1), bid: '0.00', bid_size: '0', ask: '0.00', ask_size: '0' })),
});

/** Realtime chain before the open: contracts listed, most books empty. */
export const realtimePreMarketIbm = () => ({
  endpoint: 'Realtime Options',
  message: 'success',
  data: HISTORICAL_OPTIONS_IBM_ROWS.map((r, i) => (i === 0 ? { ...r, date: '2026-09-25' } : { ...r, date: '2026-09-25', bid: '0.00', ask: '0.00' })),
});

/** What AV returns to a key that is not entitled to REALTIME_OPTIONS (observed with apikey=demo). */
export const realtimeNotEntitledSample = () => ({
  endpoint: 'Realtime Options',
  message: 'This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL AND FOR ILLUSTRATION PURPOSES ONLY***. To access the actual data, please subscribe to either the 600 requests per minute or the 1200 requests per minute premium plan at https://www.alphavantage.co/premium/ if you would like to access realtime US options data for personal non-professional use.',
  data: [{
    contractID: 'XXYYZZ999999C00020000', symbol: 'XXYYZZ', expiration: '2099-99-99', strike: '20.00', type: 'call', last: '100.00',
    mark: '100.10', bid: '100.05', bid_size: '100', ask: '100.15', ask_size: '100', volume: '100', open_interest: '100',
    date: '2049-99-99', implied_volatility: '0.23766', delta: '0.17818', gamma: '0.00317', theta: '-0.02015', vega: '0.90231', rho: '0.71615',
  }],
});
