/**
 * Test script #2 - precise offset finder for TradingView multi-day crypto candles.
 * 
 * Goal: Find offset where 9D closes on March 4, 2026 exactly at 00:00 UTC.
 */

const DAY_MS = 86_400_000;
const todayMs = Date.UTC(2026, 2, 4); // March 4, 2026 00:00 UTC
const todayDay = todayMs / DAY_MS;

console.log(`March 4, 2026 00:00 UTC = ${todayMs} ms = day ${todayDay} from epoch`);
console.log(`Day of week: ${new Date(todayMs).toUTCString()}`);
console.log();

function fmtDate(ms) {
  const d = new Date(ms);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} (${days[d.getUTCDay()]})`;
}

// For each offset 0-8, check if 9D boundary falls exactly on March 4
console.log('=== Test: does 9D boundary land on March 4 for each offset? ===');
for (let off = 0; off < 9; off++) {
  const anchorMs = off * DAY_MS;
  const periodMs = 9 * DAY_MS;
  const elapsed = todayMs - anchorMs;
  
  // Is today EXACTLY on a boundary?
  const remainder = elapsed % periodMs;
  const isOnBoundary = remainder === 0;
  
  // Next close after now (or at now if exactly on boundary)
  const periodsElapsed = elapsed / periodMs;
  const nextClose = anchorMs + Math.ceil(periodsElapsed) * periodMs;
  const prevClose = nextClose - periodMs;
  
  console.log(`  offset=${off}: elapsed=${elapsed/DAY_MS}d, remainder=${remainder/DAY_MS}d, onBoundary=${isOnBoundary}, nextClose=${fmtDate(nextClose)}, prevClose=${fmtDate(prevClose)}`);
}

// The key insight: when our code uses Math.ceil(nowMs / periodMs) * periodMs,
// and nowMs is EXACTLY on a boundary, Math.ceil returns the same value (ceil of integer = integer)
// So the "close" = today, minutes to close = 0.
// The NEXT candle also starts at the same moment.
// So "9D closes today" means today IS a boundary.

console.log('\n=== For 9D to close March 4, we need (todayMs - offset) % (9 * DAY_MS) === 0 ===');
console.log(`todayMs = ${todayMs}`);
console.log(`9 * DAY_MS = ${9 * DAY_MS}`);
console.log(`todayMs % (9*DAY_MS) = ${todayMs % (9 * DAY_MS)} = ${(todayMs % (9 * DAY_MS)) / DAY_MS} days`);
console.log(`So offset must be ≡ ${(todayMs % (9 * DAY_MS)) / DAY_MS} days (mod 9)`);

const requiredOffsetMod9 = (todayMs % (9 * DAY_MS)) / DAY_MS;

// Now, what's special: the user said "9D closes today" meaning Math.ceil(nowMs / periodMs) * periodMs == todayMs
// This is true ONLY if now < todayMs + 1 (i.e., we're exactly at start of March 4)
// OR if the user means the 9D candle close happened at the START of March 4 (00:00 UTC)

// With current code (no offset), what's the next 9D close after different "now" times?
const now3am = todayMs + 3 * 3600 * 1000; // March 4, 03:00 UTC (user is UTC+11 so local 14:00)
console.log(`\n=== At March 4 03:00 UTC (14:00 AEDT): ===`);
for (let off = 0; off < 9; off++) {
  const anchorMs = off * DAY_MS;
  const periodMs = 9 * DAY_MS;
  const elapsed = now3am - anchorMs;
  const nextClose = anchorMs + Math.ceil(elapsed / periodMs) * periodMs;
  const minsToClose = Math.floor((nextClose - now3am) / 60000);
  console.log(`  offset=${off}: nextClose=${fmtDate(nextClose)}, minsToClose=${minsToClose} (${(minsToClose/60).toFixed(1)}h)`);
}

// If user says 9D "closes today", they might mean the candle that was open 
// just closed at midnight, OR they mean the displayed "close date" is March 4.
// On TradingView, the displayed date is the OPEN date of the candle, not the close.
// So let me also check: 9D candle that OPENED today and 9D candle that CLOSED today.

console.log('\n=== 9D candle open/close schedule for offsets 0-8 (around March 4) ===');
for (let off = 0; off < 9; off++) {
  const anchorMs = off * DAY_MS;
  const periodMs = 9 * DAY_MS;
  const elapsed = todayMs - anchorMs;
  const idx = Math.floor(elapsed / periodMs);
  const candleOpen = anchorMs + idx * periodMs;
  const candleClose = candleOpen + periodMs;
  
  const prevOpen = candleOpen - periodMs;
  const prevClose = candleOpen;
  
  console.log(`  offset=${off}: prev candle ${fmtDate(prevOpen)}→${fmtDate(prevClose)}, current ${fmtDate(candleOpen)}→${fmtDate(candleClose)}`);
}

// Check TradingView's known anchor: from symbol's first bar time
// BTCUSDT on Binance first listed around 2017-08-17
// But TV may use different dates. Let me check several:
console.log('\n=== Testing known crypto dates as anchors ===');
const cryptoDates = [
  ['BTC genesis 2009-01-03', Date.UTC(2009, 0, 3)],
  ['Binance launch 2017-07-14', Date.UTC(2017, 6, 14)],
  ['BTCUSDT Binance ~2017-08-17', Date.UTC(2017, 7, 17)],
  ['BTCUSDT first trade', Date.UTC(2017, 7, 14)],
  ['TV crypto epoch guess 2015-01-01', Date.UTC(2015, 0, 1)],
  ['TV crypto epoch guess 2017-01-01', Date.UTC(2017, 0, 1)],
  ['TV crypto epoch guess 2000-01-01', Date.UTC(2000, 0, 1)],
];

for (const [label, anchorMs] of cryptoDates) {
  const p9 = 9 * DAY_MS;
  const p17 = 17 * DAY_MS;
  const e9 = todayMs - anchorMs;
  const e17 = todayMs - anchorMs;
  
  const r9 = e9 % p9;
  const r17 = e17 % p17;
  
  const c9_open = anchorMs + Math.floor(e9 / p9) * p9;
  const c9_close = c9_open + p9;
  const c17_open = anchorMs + Math.floor(e17 / p17) * p17;
  const c17_close = c17_open + p17;
  
  const match9 = r9 === 0 ? '✓ 9D closes today' : `9D closes ${fmtDate(c9_close)}`;
  
  console.log(`  ${label} (day ${anchorMs/DAY_MS}): ${match9}, 17D: ${fmtDate(c17_open)}→${fmtDate(c17_close)}`);
}

// Final: try to find a "round" offset that satisfies offset ≡ 5 mod 9
// and check 17D
console.log('\n=== Round dates where offset ≡ 5 mod 9 ===');
// We need anchorDay mod 9 ≡ requiredOffsetMod9 (which is 5)
// Check years around crypto start dates
for (let year = 2009; year <= 2020; year++) {
  for (let month = 0; month < 12; month++) {
    const anchorMs = Date.UTC(year, month, 1);
    const anchorDay = anchorMs / DAY_MS;
    if (anchorDay % 9 === requiredOffsetMod9) {
      const p17 = 17 * DAY_MS;
      const e17 = todayMs - anchorMs;
      const c17_open = anchorMs + Math.floor(e17 / p17) * p17;
      const c17_close = c17_open + p17;
      const d = new Date(anchorMs);
      console.log(`  ${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01 (day ${anchorDay}): 9D ✓ | 17D: ${fmtDate(c17_open)}→${fmtDate(c17_close)}`);
    }
  }
}
