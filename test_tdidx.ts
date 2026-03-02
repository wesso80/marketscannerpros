import { isUSMarketHoliday } from './lib/time/marketHolidays';

const epochMs = Date.UTC(2019, 11, 30);
let count = 0;
for (let ms = epochMs + 86400000; ms <= Date.UTC(2026, 2, 6); ms += 86400000) {
  const d = new Date(ms);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  if (isUSMarketHoliday(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) {
    count++;
    if (d.getTime() > Date.UTC(2024, 11, 1)) console.log('  Holiday:', d.toISOString().slice(0,10));
  }
}
console.log('Total weekday holidays epoch->Mar 6 2026:', count);

function getTdIdx(yr: number, mo: number, dy: number) {
  const refMs = Date.UTC(2019, 11, 30);
  const todayMs = Date.UTC(yr, mo, dy);
  const calDays = Math.floor((todayMs - refMs) / 86400000);
  const fullWeeks = Math.floor(calDays / 7);
  const dayInWeek = ((calDays % 7) + 7) % 7;
  const tradingDayInWeek = Math.min(dayInWeek, 4);
  const weekdayIndex = fullWeeks * 5 + tradingDayInWeek;
  let hol = 0;
  for (let ms = refMs + 86400000; ms <= todayMs; ms += 86400000) {
    const d = new Date(ms);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (isUSMarketHoliday(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) hol++;
  }
  return weekdayIndex - hol;
}

console.log('\n--- Multi-day close dates (Mar 2-10, 2026) ---');
const days: [number,number,number,string][] = [
  [2026, 2, 2, 'Mon Mar  2'],
  [2026, 2, 3, 'Tue Mar  3'],
  [2026, 2, 4, 'Wed Mar  4'],
  [2026, 2, 5, 'Thu Mar  5'],
  [2026, 2, 6, 'Fri Mar  6'],
  [2026, 2, 9, 'Mon Mar  9'],
  [2026, 2, 10,'Tue Mar 10'],
];
for (const [yr, mo, dy, label] of days) {
  const idx = getTdIdx(yr, mo, dy);
  const closes: string[] = [];
  for (const n of [2, 3, 4, 5, 6, 7]) {
    if (idx % n === n - 1) closes.push(n + 'D');
  }
  console.log(`${label}: tdIdx=${idx} (mod2=${idx%2} mod3=${idx%3} mod5=${idx%5}) closes: ${closes.length ? closes.join(', ') : '(1D only)'}`);
}
