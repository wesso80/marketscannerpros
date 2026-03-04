/**
 * Test script to find TradingView's multi-day crypto candle anchor.
 * 
 * We know from user screenshots:
 * - BTCUSDT 9D closes on March 4, 2026 (today)
 * - BTCUSDT 17D does NOT close on a Friday
 * 
 * TradingView anchors multi-day candles to a fixed reference point.
 * Common candidates: epoch (Jan 1 1970), or various crypto-specific dates.
 */

const DAY_MS = 86_400_000;

// March 4, 2026 00:00 UTC
const today = new Date('2026-03-04T00:00:00Z');
const todayMs = today.getTime();

// Test a range of timeframes
const TFs = [2,3,4,5,7,9,12,17,19,25];

// Helper: get day-of-week name
function dow(ms) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ms).getUTCDay()];
}

function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} (${dow(ms)})`;
}

// For a given anchor (epoch + offset days), compute where candle boundaries
// fall around today for each TF
function testAnchor(label, anchorMs) {
  console.log(`\n=== Anchor: ${label} (${fmtDate(anchorMs)}) ===`);
  for (const N of TFs) {
    const periodMs = N * DAY_MS;
    // How many full periods from anchor to now?
    const elapsed = todayMs - anchorMs;
    const periods = Math.floor(elapsed / periodMs);
    const currentOpen = anchorMs + periods * periodMs;
    const currentClose = currentOpen + periodMs;
    const prevClose = currentOpen; // = prev candle close
    
    console.log(`  ${N}D: current candle ${fmtDate(currentOpen)} → ${fmtDate(currentClose)}, prev close ${fmtDate(prevClose)}`);
  }
}

// Test 1: Raw epoch (Jan 1, 1970)
testAnchor('Epoch (Jan 1 1970)', 0);

// Test 2: Jan 1, 2017 (commonly cited TradingView crypto anchor)
testAnchor('Jan 1 2017', Date.UTC(2017, 0, 1));

// Test 3: Try various offsets from epoch to find one where 9D closes March 4
console.log('\n=== Searching for offset where 9D closes exactly March 4, 2026 ===');
const targetClose9D = todayMs; // 9D should close March 4 at 00:00 UTC
const period9D = 9 * DAY_MS;

// Work backwards: if 9D closes on March 4, the candle opened on Feb 23
// offset must satisfy: (targetClose - offset) % period9D == 0
// i.e., offset % period9D == targetClose % period9D
const remainder9D = todayMs % period9D;
console.log(`  9D period = ${period9D} ms`);
console.log(`  March 4 2026 UTC ms = ${todayMs}`);
console.log(`  todayMs % period9D = ${remainder9D} (= ${remainder9D / DAY_MS} days)`);
console.log(`  So offset must be ≡ ${remainder9D / DAY_MS} days mod 9`);

// The offset (in days from epoch) that makes 9D close on March 4
const offsetDays9D = (todayMs % period9D) / DAY_MS;
console.log(`  Offset for 9D alignment: ${offsetDays9D} days from epoch`);

// Now check: with that offset, where does 17D fall?
const anchor9D = offsetDays9D * DAY_MS;
const period17D = 17 * DAY_MS;
const elapsed17D = todayMs - anchor9D;
const periods17D = Math.floor(elapsed17D / period17D);
const current17DOpen = anchor9D + periods17D * period17D;
const current17DClose = current17DOpen + period17D;
console.log(`  With offset ${offsetDays9D}d → 17D current candle: ${fmtDate(current17DOpen)} → ${fmtDate(current17DClose)}`);

// Test 4: Try the old 114-day offset
console.log('\n=== Test with 114-day offset ===');
testAnchor('114 days from epoch', 114 * DAY_MS);

// Test 5: Scan offsets 0-29 and show which ones make 9D close March 4
console.log('\n=== All offsets (0-29 days) where 9D closes March 4 ===');
for (let off = 0; off < 30; off++) {
  const anchorMs = off * DAY_MS;
  const periodMs = 9 * DAY_MS;
  const elapsed = todayMs - anchorMs;
  const close = anchorMs + Math.ceil(elapsed / periodMs) * periodMs;
  if (close === todayMs) {
    console.log(`  Offset ${off} days → 9D closes March 4 ✓`);
    // Also check 17D
    const p17 = 17 * DAY_MS;
    const e17 = todayMs - anchorMs;
    const c17open = anchorMs + Math.floor(e17 / p17) * p17;
    const c17close = c17open + p17;
    console.log(`    17D current: ${fmtDate(c17open)} → ${fmtDate(c17close)}`);
    // Check all TFs
    for (const N of TFs) {
      const pN = N * DAY_MS;
      const eN = todayMs - anchorMs;
      const cNopen = anchorMs + Math.floor(eN / pN) * pN;
      const cNclose = cNopen + pN;
      console.log(`    ${N}D: ${fmtDate(cNopen)} → ${fmtDate(cNclose)}`);
    }
  }
}

// Test 6: Also show raw/pure epoch for reference
console.log('\n=== Raw epoch (offset=0) all TFs ===');
for (const N of TFs) {
  const pN = N * DAY_MS;
  const cNclose = Math.ceil(todayMs / pN) * pN;
  const cNopen = cNclose - pN;
  console.log(`  ${N}D: ${fmtDate(cNopen)} → ${fmtDate(cNclose)}`);
}

// Test 7: Check what the ORIGINAL 114-offset code produced
console.log('\n=== 114-day offset all TFs ===');
const OFF_114 = 114 * DAY_MS;
for (const N of TFs) {
  const pN = N * DAY_MS;
  const aligned = todayMs - OFF_114;
  const cNclose = Math.ceil(aligned / pN) * pN + OFF_114;
  const cNopen = cNclose - pN;
  console.log(`  ${N}D: ${fmtDate(cNopen)} → ${fmtDate(cNclose)}`);
}
