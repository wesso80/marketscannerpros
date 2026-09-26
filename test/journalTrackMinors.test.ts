/** Journal Track minors: TR-12, TR-13, TR-28, TR-29, TR-31, TR-34. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatSignedPct, formatSignedUsd, formatUsd, markTimeLabel, optionContractLabel, parseTags } from '@/lib/journal/display';
import { parseJournalQuote } from '@/lib/journal/markToMarket';
import { validateTradeEdit, type TradeEditCurrent } from '@/lib/journal/tradeEdit';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('TR-12: stat and P&L formatting', () => {
  it('puts the minus before the dollar sign and never shows "+Unavailable"', () => {
    expect(formatUsd(-123.45)).toBe('-$123.45');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(-0.001)).toBe('$0.00');
    expect(formatSignedUsd(12)).toBe('+$12.00');
    expect(formatSignedUsd(-12)).toBe('-$12.00');
    expect(formatSignedPct(undefined)).toBe('Unavailable');
    expect(formatSignedPct(1.234)).toBe('+1.23%');
    expect(formatSignedPct(-0.4)).toBe('-0.40%');
  });
  it('KPI cards show one value (no unitless duplicate badge) and the table has no "+Unavailable" path', () => {
    const kpi = read('components/journal/layer1/JournalKpiRow.tsx');
    expect(kpi).not.toContain('DeltaBadge');
    expect(kpi).not.toMatch(/`\$\$\{/);
    const table = read('components/journal/layer2/TradeTable.tsx');
    expect(table).not.toContain("Number(row.pnlPct || 0) >= 0 ? '+' : ''}{row.pnlPct == null ? 'Unavailable'");
  });
});

describe('TR-13: mark times in local time', () => {
  it('crypto shows the provider time in the reader zone; stocks show the trading day', () => {
    expect(markTimeLabel({ price: 1, observedAt: '2026-09-25T17:12:00.000Z', retrievedAt: '2026-09-25T17:12:30.000Z' }, 'Australia/Sydney'))
      .toMatch(/^Price as of 26 Sept?, 3:12 am AEST$/i);
    expect(markTimeLabel({ price: 1, observedAt: null, retrievedAt: '2026-09-26T04:00:00.000Z', tradingDay: '2026-09-25' }, 'Australia/Sydney'))
      .toMatch(/^Last price for the 2026-09-25 trading day \(fetched 26 Sept?, 2:00 pm AEST\)$/i);
    expect(markTimeLabel({ price: 1, observedAt: null, retrievedAt: 'x', basis: 'EOD', asOfDate: '2026-09-25' })).toBe('EOD option mark for the 2026-09-25 session');
  });
  it('the stock quote trading day is kept on the mark', () => {
    const now = Date.parse('2026-09-26T04:00:00Z');
    expect(parseJournalQuote({ ok: true, price: 100, observedAt: null, observationDate: '2026-09-25' }, now)?.tradingDay).toBe('2026-09-25');
    expect(parseJournalQuote({ ok: true, price: 100 }, now)).not.toHaveProperty('tradingDay');
  });
  it('the table tooltip no longer prints raw ISO', () => {
    expect(read('components/journal/layer2/TradeTable.tsx')).not.toContain('Provider observation: ${row.mark.observedAt}');
  });
});

describe('TR-28: editing an open trade', () => {
  const open: TradeEditCurrent = { side: 'LONG', entryPrice: 100, isOpen: true, stopLoss: null, target: null, notes: '' };
  it('accepts a stop below / target above a long entry and flags the change', () => {
    const r = validateTradeEdit(open, { stopLoss: 95, target: 110 });
    expect(r).toMatchObject({ ok: true, stopLoss: 95, target: 110, levelsChanged: true, notesChanged: false });
  });
  it('rejects a stop on the wrong side, non-numbers, and level edits on closed trades', () => {
    expect(validateTradeEdit(open, { stopLoss: 101 })).toMatchObject({ ok: false, status: 400 });
    expect(validateTradeEdit({ ...open, side: 'SHORT' }, { stopLoss: 99 })).toMatchObject({ ok: false, status: 400 });
    expect(validateTradeEdit(open, { target: 90 })).toMatchObject({ ok: false, status: 400 });
    expect(validateTradeEdit(open, { stopLoss: 'abc' })).toMatchObject({ ok: false, status: 400 });
    expect(validateTradeEdit({ ...open, isOpen: false }, { stopLoss: 95 })).toMatchObject({ ok: false, status: 409 });
  });
  it('blank clears a level; notes append with a date on open or closed trades', () => {
    expect(validateTradeEdit({ ...open, stopLoss: 95 }, { stopLoss: '' })).toMatchObject({ ok: true, stopLoss: null, levelsChanged: true });
    const r = validateTradeEdit({ ...open, isOpen: false, notes: 'first' }, { appendNote: ' second ', noteDate: '2026-09-26' });
    expect(r).toMatchObject({ ok: true, notes: 'first\n[2026-09-26] second', notesChanged: true, levelsChanged: false });
    expect(validateTradeEdit(open, { appendNote: '   ' })).toMatchObject({ ok: false });
    expect(validateTradeEdit(open, {})).toMatchObject({ ok: false, error: 'Nothing to update.' });
  });
  it('the PATCH route only changes levels on open rows and scopes every query to the workspace', () => {
    const route = read('app/api/journal/trade/[id]/route.ts');
    expect(route).toContain('export async function PATCH');
    expect(route).toMatch(/WHERE workspace_id = \$1 AND id = \$2 AND is_open = true/);
    expect(route.match(/workspace_id = \$1 AND id = \$2/g)?.length).toBe(3);
    expect(read('components/journal/drawer/tabs/TradeNotesTab.tsx')).not.toContain('coming soon');
  });
});

describe('TR-29: add-trade form wording and tags', () => {
  it('labels Stop/Target and sends cleaned tags', () => {
    const form = read('components/journal/drawer/TradeEntryForm.tsx');
    expect(form).not.toContain('>Risk Level<');
    expect(form).not.toContain('>Key Level<');
    expect(form).toMatch(/className=\{LABEL\}>Stop\{/);
    expect(form).toMatch(/className=\{LABEL\}>Target\{/);
    expect(form).toContain('id="trade-tags"');
    expect(parseTags('earnings, #swing, Earnings, , paper')).toEqual(['earnings', 'swing', 'paper']);
    expect(read('app/api/journal/add-trade/route.ts')).toContain('sanitizeTags(body.tags)');
  });
});

describe('TR-31: quantity, target and option contract details', () => {
  it('labels the contract', () => {
    expect(optionContractLabel({ tradeType: 'Options', option: { right: 'call', strike: 190, expiration: '2026-10-17' } })).toBe('190 Call · exp 2026-10-17');
    expect(optionContractLabel({ tradeType: 'Options', option: {} })).toBe('Contract details not recorded');
    expect(optionContractLabel({ tradeType: 'Spot' })).toBeNull();
  });
  it('table and drawer show quantity, target and the contract', () => {
    const table = read('components/journal/layer2/TradeTable.tsx');
    expect(table).toContain('>Qty</th>');
    expect(table).toContain('>Stop / Target</th>');
    expect(table).toContain('optionContractLabel(row)');
    const drawer = read('components/journal/drawer/tabs/TradeOverviewTab.tsx');
    expect(drawer).toContain('Contract: {contract}');
    expect(drawer).toContain('Target: {fmt(currentTarget)}');
  });
});

describe('TR-34: no count while loading', () => {
  it('section header shows … until the journal loads', () => {
    expect(read('components/journal/layer2/Layer2TradeInventory.tsx')).toContain("{loading ? '…' : count}");
  });
});
