import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), 'utf8');

// BT-1: running a backtest must be read-only. The backtest page used to emit a
// `trade.plan.created` workflow event on every result, which made
// /api/workflow/events auto-create a live price alert and an open journal entry
// from a stale historical entry price.
describe('backtest page is read-only (BT-1)', () => {
  const page = read('app/tools/backtest/page.tsx');
  const route = read('app/api/workflow/events/route.ts');

  it('never emits trade.plan.created from the backtest page', () => {
    expect(page).not.toMatch(/eventType:\s*['"]trade\.plan\.created['"]/);
  });

  it('only emits workflow events that the events route does not turn into alerts or journal entries', () => {
    const emitted = [...page.matchAll(/eventType:\s*['"]([a-z_.]+)['"]/g)].map((m) => m[1]);
    expect(emitted).toEqual(['journal.draft.created']);

    // The route only auto-creates alerts / journal entries for trade.plan.created,
    // and only generates coach output for trade.closed.
    expect(route).toMatch(/async function autoCreatePlanAlertForEvent[\s\S]{0,200}event\.event_type !== 'trade\.plan\.created'/);
    expect(route).toMatch(/async function autoCreateJournalDraftForEvent[\s\S]{0,200}event\.event_type !== 'trade\.plan\.created'\) return false;/);
    expect(route).toMatch(/async function autoGenerateCoachEventForClosedTrade[\s\S]{0,200}event\.event_type !== 'trade\.closed'\) return null;/);
  });

  it('only emits workflow events from the explicit journal-draft click handler, not when results load', () => {
    const emitCalls = [...page.matchAll(/emitWorkflowEvents\(/g)].map((m) => m.index ?? -1);
    expect(emitCalls).toHaveLength(1);

    const handlerStart = page.indexOf('const handleAutoJournalDraftClick = () => {');
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerEnd = page.indexOf('\n  };', handlerStart);
    expect(emitCalls[0]).toBeGreaterThan(handlerStart);
    expect(emitCalls[0]).toBeLessThan(handlerEnd);
    expect(page).toContain('onClick={handleAutoJournalDraftClick}');
  });
});
