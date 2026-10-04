import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), 'utf8');

// BT-1: running a backtest must be read-only. The retired page used to emit a
// `trade.plan.created` workflow event on every result, which made
// /api/workflow/events auto-create a live price alert and an open journal entry
// from a stale historical entry price.
describe('canonical Backtest hub is read-only (BT-1)', () => {
  const page = read('components/backtest/BacktestHub.tsx');
  const route = read('app/api/workflow/events/route.ts');

  it('never emits trade.plan.created from the backtest page', () => {
    expect(page).not.toMatch(/eventType:\s*['"]trade\.plan\.created['"]/);
  });

  it('only emits workflow events that the events route does not turn into alerts or journal entries', () => {
    const emitted = [...page.matchAll(/eventType:\s*['"]([a-z_.]+)['"]/g)].map((m) => m[1]);
    expect(emitted).toEqual([]);

    // The route only auto-creates alerts / journal entries for trade.plan.created,
    // and only generates coach output for trade.closed.
    expect(route).toMatch(/async function autoCreatePlanAlertForEvent[\s\S]{0,200}event\.event_type !== 'trade\.plan\.created'/);
    expect(route).toMatch(/async function autoCreateJournalDraftForEvent[\s\S]{0,200}event\.event_type !== 'trade\.plan\.created'\) return false;/);
    expect(route).toMatch(/async function autoGenerateCoachEventForClosedTrade[\s\S]{0,200}event\.event_type !== 'trade\.closed'\) return null;/);
  });

  it('the canonical Backtest hub does not emit journal or alert mutations', () => {
    expect(page).not.toContain('emitWorkflowEvents(');
    expect(page).not.toMatch(/fetch\(['"]\/api\/(journal|alerts)/);
  });
});
