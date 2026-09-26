/**
 * TR-28: validation for editing a journal trade from the drawer. Stop/target only on OPEN trades (a closed trade's
 * stored R was computed from its levels); a stop must sit on the loss side of the entry and a target on the profit
 * side (for options both are premiums per share, like the entry). Notes are appended with a date stamp.
 */
export type TradeEditCurrent = {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  isOpen: boolean;
  stopLoss: number | null;
  target: number | null;
  notes: string;
};

export type TradeEditResult =
  | { ok: true; side: 'LONG' | 'SHORT'; stopLoss: number | null; target: number | null; notes: string; levelsChanged: boolean; notesChanged: boolean }
  | { ok: false; status: number; error: string };

const MAX_NOTE = 2000;
const MAX_NOTES_TOTAL = 20000;

/** undefined = not being changed; null/'' = clear; otherwise a positive number. */
function parseLevel(raw: unknown): { ok: true; value: number | null | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === '') return { ok: true, value: null };
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? { ok: true, value: n } : { ok: false };
}

export function validateTradeEdit(current: TradeEditCurrent, body: any): TradeEditResult {
  const stop = parseLevel(body?.stopLoss);
  const target = parseLevel(body?.target);
  if (!stop.ok) return { ok: false, status: 400, error: 'Stop must be a positive number, or blank for no stop.' };
  if (!target.ok) return { ok: false, status: 400, error: 'Target must be a positive number, or blank for no target.' };

  const wantsLevels = stop.value !== undefined || target.value !== undefined;
  if (wantsLevels && !current.isOpen) {
    return { ok: false, status: 409, error: 'Stop and target can only be changed on an open trade.' };
  }

  const nextStop = stop.value === undefined ? current.stopLoss : stop.value;
  const nextTarget = target.value === undefined ? current.target : target.value;
  const long = current.side === 'LONG';
  if (wantsLevels && nextStop != null && (long ? nextStop >= current.entryPrice : nextStop <= current.entryPrice)) {
    return { ok: false, status: 400, error: `A ${long ? 'long' : 'short'} trade's stop must be ${long ? 'below' : 'above'} the entry (${current.entryPrice}).` };
  }
  if (wantsLevels && nextTarget != null && (long ? nextTarget <= current.entryPrice : nextTarget >= current.entryPrice)) {
    return { ok: false, status: 400, error: `A ${long ? 'long' : 'short'} trade's target must be ${long ? 'above' : 'below'} the entry (${current.entryPrice}).` };
  }

  let notes = current.notes ?? '';
  let notesChanged = false;
  if (body?.appendNote !== undefined) {
    const text = typeof body.appendNote === 'string' ? body.appendNote.trim() : '';
    if (!text) return { ok: false, status: 400, error: 'Note is empty.' };
    if (text.length > MAX_NOTE) return { ok: false, status: 400, error: `Note is too long (max ${MAX_NOTE} characters).` };
    const date = typeof body?.noteDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.noteDate) ? body.noteDate : new Date().toISOString().slice(0, 10);
    const next = `${notes ? `${notes.replace(/\s+$/, '')}\n` : ''}[${date}] ${text}`;
    if (next.length > MAX_NOTES_TOTAL) return { ok: false, status: 400, error: 'Notes are full for this trade.' };
    notes = next;
    notesChanged = true;
  }

  if (!wantsLevels && !notesChanged) return { ok: false, status: 400, error: 'Nothing to update.' };

  return {
    ok: true,
    side: current.side,
    stopLoss: nextStop,
    target: nextTarget,
    notes,
    levelsChanged: wantsLevels && (nextStop !== current.stopLoss || nextTarget !== current.target),
    notesChanged,
  };
}
