import { isUSMarketHoliday } from './lib/time/marketHolidays';

// Replicate getTradingDayIndex logic
function countHolidaysUpTo(targetMs: number): number {
  const epochMs = Date.UTC(2019, 11, 30);
  let count = 0;
  for (let ms = epochMs + 86_400_000; ms <= targetMs; ms += 86_400_000) {
    const d = new Date(ms);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (isUSMarketHoliday(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) {
      count++;
    }
  }
  return count;
}

function getTradingDayIndex(year: number, month: number, day: number): number {
  const refMs = Date.UTC(2019, 11, 30); // Monday Dec 30, 2019
  const todayMs = Date.UTC(year, month, day);
  const calDays = Math.floor((todayMs - refMs) / 86_400_000);
  const fullWeeks = Math.floor(calDays / 7);
  const dayInWeek = ((calDays % 7) + 7) % 7;
  const tradingDayInWeek = Math.min(dayInWeek, 4);
  const weekdayIndex = fullWeeks * 5 + tradingDayInWeek;
  const holidayCount = countHolidaysUpTo(todayMs);
  return weekdayIndex - holidayCount;
}

// Check 5D close: should be Mon Mar 2, 2026
// March 2026: Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
const N = 5;
console.log('=== 5D Close Check (week of Mar 2-6, 2026) ===');
for (let d = 2; d <= 6; d++) {
  const idx = getTradingDayIndex(2026, 2, d); // month is 0-indexed, so 2 = March
  const dow = new Date(Date.UTC(2026, 2, d)).toLocaleDateString('en-US', { weekday: 'short' });
  const isClose = idx % N === N - 1;
  console.log(`Mar ${d} (${dow}): tdIdx=${idx}, ${idx}%5=${idx % N}, close=${isClose}`);
}

console.log('\n=== Next 2 weeks: Mar 2-13 ===');
for (let d = 2; d <= 13; d++) {
  const date = new Date(Date.UTC(2026, 2, d));
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  if (isUSMarketHoliday(2026, 2, d)) { console.log(`Mar ${d}: HOLIDAY`); continue; }
  const idx = getTradingDayIndex(2026, 2, d);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const closes: string[] = [];
  for (const tf of [2, 3, 4, 5, 6, 7]) {
    if (idx % tf === tf - 1) closes.push(`${tf}D`);
  }
  console.log(`Mar ${d} (${dayName}): tdIdx=${idx}${closes.length ? ' ← CLOSES: ' + closes.join(', ') : ''}`);
}
