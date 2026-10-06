import { expect, it } from 'vitest';
import { isRadarImplementationNote, RADAR_READER_LABELS, radarReaderFeedDetail, radarReaderGap, radarReaderLabel, radarReaderText } from '@/lib/presentation/radarReader';

const ENGINE_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

const mapped: Array<[string, string]> = [
  ['CONFIRMED_MOVE', 'Confirmed move'],
  ['NEW_RELATIVE_WEAKNESS', 'New relative weakness'],
  ['GAP_UP', 'Gap up'],
  ['GAP_DOWN', 'Gap down'],
  ['NEAR_TRIGGER', 'Near trigger'],
  ['NEW_BREAKOUT', 'New breakout'],
  ['RSI_REGIME_UP', 'RSI regime up'],
  ['MACD_FLIP_DOWN', 'MACD flip down'],
  ['HIGH_RESEARCH_PRIORITY', 'High research priority'],
  ['GENUINE_GROUP_MOVE', 'Genuine group move'],
  ['BREAKOUT_CONFIRMATION', 'Breakout confirmation'],
  ['SUPPRESSED_HEALTH', 'Held back'],
];

it.each(mapped)('maps %s to the reader label %s', (raw, label) => {
  expect(radarReaderLabel(raw)).toBe(label);
  expect(radarReaderLabel(raw)).not.toMatch(ENGINE_TOKEN);
});

it('sentence-cases an unknown engine token and leaves prose alone', () => {
  expect(radarReaderLabel('ZZZ_NEW_STATE')).toBe('Zzz new state');
  expect(radarReaderLabel('FUTURE STAGE')).toBe('Future stage');
  expect(radarReaderLabel('ZZZ_NEW_STATE')).not.toBe('ZZZ_NEW_STATE');
  expect(radarReaderLabel('ZZZ_NEW_STATE')).not.toMatch(ENGINE_TOKEN);
  expect(radarReaderLabel('Already a sentence.')).toBe('Already a sentence.');
  expect(radarReaderLabel(null)).toBe('Not recorded');
  expect(radarReaderLabel('')).toBe('Not recorded');
  expect(radarReaderLabel('   ')).toBe('Not recorded');
});

it('keeps every explicit label free of raw engine codes', () => {
  for (const [code, label] of Object.entries(RADAR_READER_LABELS)) {
    expect(label, code).not.toMatch(ENGINE_TOKEN);
    expect(label, code).not.toBe(code);
  }
});

it('rewrites codes and bad ordinals inside a reader sentence', () => {
  const raw = 'structural weakness: NEW_RELATIVE_WEAKNESS/GAP_UP; moved to CONFIRMED_MOVE; volume (92th pct of 60d) and 83th pct';
  const text = radarReaderText(raw);
  expect(text).toBe('structural weakness: New relative weakness/Gap up; moved to Confirmed move; volume (92nd pct of 60d) and 83rd pct');
  expect(text).not.toMatch(ENGINE_TOKEN);
  expect(radarReaderText('SPY +1.2% · BTC leading · 11th and 4th')).toBe('SPY +1.2% · BTC leading · 11th and 4th');
  expect(radarReaderText('AT NEW 20d HIGH · NEWLY STRENGTHENING')).toBe('At a new 20-day high · Newly strengthening');
});

it('drops database and cron notes and keeps a plain history line', () => {
  const cron = 'company_overview: route + write path verified in production on 2026-09-18 (220 rows written via admin trigger); the Render cron service refresh-fundamentals had never populated it — confirm that cron service exists and has CRON_SECRET. news_events / earnings_calendar are lazy admin caches never triggered (intentionally unused)';
  expect(radarReaderGap(cron)).toBeNull();
  expect(isRadarImplementationNote('Run history (jarvis_runs)')).toBe(true);
  expect(isRadarImplementationNote('Sector/industry cache (company_overview + AV OVERVIEW → jarvis_kv)')).toBe(true);
  expect(radarReaderGap('No prior run in the private store — funding/OI change and score history begin accumulating from this run')).toBe('Earlier session history is not on file yet.');
  expect(radarReaderGap('Macro calendar is the curated fallback — timings mostly ESTIMATED')).toBe('Macro calendar is the curated fallback — timings mostly ESTIMATED');
  expect(radarReaderFeedDetail('140 series live, 12 DB fallback (no volume), 1 unavailable')).toBe('140 series live, 1 unavailable');
});
