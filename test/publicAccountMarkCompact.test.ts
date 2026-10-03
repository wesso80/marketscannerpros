import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const src = readFileSync('worker/ingest-data.ts', 'utf8');
const accountMark = src.slice(src.indexOf('async function refreshAndCaptureAccounts'), src.indexOf('async function runIngestionCycle'));

it('account marks read the latest equity bar without a full history download', () => {
  expect(accountMark).toContain("fetchAVTimeSeries(symbol, 'daily', 'compact')");
  expect(accountMark).not.toContain("fetchAVTimeSeries(symbol, 'daily', 'full')");
});
