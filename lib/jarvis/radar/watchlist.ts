/**
 * Watchlist lifecycle — candidates persist across sessions and move through
 * NEW → DEVELOPING → NEAR_TRIGGER → CONFIRMED_MOVE | FAILED | DETERIORATING → EXPIRED.
 */
import type { PreMove } from './premove';
import type { WatchEntry, WatchStatus } from './store';
import type { Features, Scored } from './types';

export interface LifecycleChange { key: string; symbol: string; from: WatchStatus | null; to: WatchStatus; note: string }

const EXPIRE_AFTER_SESSIONS_UNSEEN = 5;
const f2 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n >= 1 ? n.toFixed(2) : n.toPrecision(4));

export function updateWatchlist(args: {
  existing: WatchEntry[]; sessionDate: string; shortlist: Scored[]; premove: Map<string, PreMove>; deteriorating: Scored[]; all: Map<string, Features>;
}): { entries: WatchEntry[]; changes: LifecycleChange[] } {
  const { existing, sessionDate, premove, all } = args;
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const changes: LifecycleChange[] = [];
  const keyOf = (f: Features) => `${f.assetClass === 'crypto' ? 'crypto' : 'equity'}:${f.symbol}`;
  const setStatus = (e: WatchEntry, to: WatchStatus, note: string) => { if (e.status !== to) { changes.push({ key: e.key, symbol: e.symbol, from: e.status, to, note }); e.state.history.push({ date: sessionDate, status: to, note }); e.status = to; } e.state.note = note; };
  const metrics = (f: Features, pm: PreMove | undefined) => ({ price: f.price, ret1: f.ret1, ret5: f.ret5, volRatio: f.volRatio, rsBench5: f.rsBench5, rsBenchDelta: f.rsBenchDelta, bbWidthPctile: f.now.bbWidthPctile, adx: f.adx, rsi: f.rsi, distToHi20Pct: f.distToHi20Pct, extensionAtr: f.extensionAtr, premoveScore: pm?.score ?? null, premoveStage: pm?.stage ?? null, ema20: f.now.ema20, ema50: f.now.ema50, hi20: f.now.hi20 });

  const seen = new Set<string>();
  const upsert = (f: Features, origin: WatchEntry['origin'], initial: WatchStatus, note: string, pm?: PreMove) => {
    const key = keyOf(f); seen.add(key);
    let e = byKey.get(key);
    if (!e) {
      e = { key, symbol: f.symbol, assetClass: f.assetClass, status: initial, firstSeen: sessionDate, lastSeen: sessionDate, sessionsSeen: 1, origin, state: { history: [{ date: sessionDate, status: initial, note }], metrics: metrics(f, pm), triggerLevel: pm?.triggerLevel ?? f.now.hi20, invalidationLevel: pm?.invalidationLevel ?? f.now.ema50, note } };
      byKey.set(key, e); changes.push({ key, symbol: f.symbol, from: null, to: initial, note });
      return e;
    }
    if (e.lastSeen !== sessionDate) { e.sessionsSeen += 1; e.lastSeen = sessionDate; }
    e.state.metrics = metrics(f, pm); e.state.triggerLevel = pm?.triggerLevel ?? e.state.triggerLevel; e.state.invalidationLevel = pm?.invalidationLevel ?? e.state.invalidationLevel;
    return e;
  };

  // 1. Re-evaluate every existing entry against today's features first.
  //    Entries already updated for this session are left alone so re-runs of the same session are idempotent.
  for (const e of byKey.values()) {
    const f = all.get(e.key);
    if (!f) continue;
    if (e.lastSeen === sessionDate) { seen.add(e.key); continue; }
    const pm = premove.get(e.key);
    const wasActive = ['NEW', 'DEVELOPING', 'NEAR_TRIGGER'].includes(e.status);
    e.sessionsSeen += 1; e.lastSeen = sessionDate;
    e.state.metrics = metrics(f, pm);
    if (wasActive) {
      const trig = e.state.triggerLevel, inval = e.state.invalidationLevel;
      if (trig !== null && f.price > trig && (f.volRatio ?? 1) >= 1.3 && f.ret1 > 0) setStatus(e, 'CONFIRMED_MOVE', `broke ${f2(trig)} on ${f2(f.volRatio)}× volume (${f.ret1 > 0 ? '+' : ''}${f.ret1.toFixed(1)}%)`);
      else if (inval !== null && f.price < inval) setStatus(e, 'FAILED', `closed below invalidation ${f2(inval)} (EMA50/20d low)`);
      else if (f.flags.includes('NEW_TREND_LOSS') || (f.rsBenchDelta !== null && f.rsBenchDelta < -3)) setStatus(e, 'DETERIORATING', `RS/trend weakened (RS Δ ${f.rsBenchDelta === null ? 'n/a' : f.rsBenchDelta.toFixed(1)}pp)`);
      else if (pm?.stage === 'NEAR_TRIGGER') setStatus(e, 'NEAR_TRIGGER', `${pm.signals.slice(0, 3).join('; ')}`);
      else if (pm?.stage === 'DEVELOPING' || pm?.stage === 'EARLY_STAGE') setStatus(e, 'DEVELOPING', `${pm.signals.slice(0, 3).join('; ') || 'compression intact'}`);
      else if (pm?.stage === 'ALREADY_MOVED' && f.ret1 > 0 && (f.volRatio ?? 1) >= 1.3) setStatus(e, 'CONFIRMED_MOVE', `moved ${f.ret1.toFixed(1)}% on ${f2(f.volRatio)}× volume`);
      else if (pm?.stage === 'LOW_QUALITY') setStatus(e, 'FAILED', `dropped to LOW_QUALITY: ${pm.penalties.slice(0, 2).join('; ')}`);
      seen.add(e.key);
    } else if (e.status === 'CONFIRMED_MOVE') {
      if (f.now.ema20 !== null && f.price < f.now.ema20) setStatus(e, 'FAILED', `follow-through failed: closed below EMA20 ${f2(f.now.ema20)}`);
      else if (f.ret1 < 0 && (f.volRatio ?? 0) < 0.8) e.state.note = 'holding, quiet pullback';
      seen.add(e.key);
    } else if (e.status === 'DETERIORATING') {
      if (f.flags.includes('NEW_TREND_RECLAIM') && f.rsBench5 !== null && f.rsBench5 > 0) setStatus(e, 'DEVELOPING', 'reclaimed trend with RS positive');
      seen.add(e.key);
    }
  }

  // 2. Add today's candidates.
  for (const s of args.shortlist) {
    const pm = premove.get(keyOf(s.f));
    const stage: WatchStatus = pm?.stage === 'NEAR_TRIGGER' ? 'NEAR_TRIGGER' : pm?.stage === 'ALREADY_MOVED' && (s.f.volRatio ?? 1) >= 1.3 ? 'CONFIRMED_MOVE' : 'NEW';
    const e = upsert(s.f, 'shortlist', stage, `shortlisted: ${s.opportunityType ?? s.status} (score ${s.score})`, pm);
    if (e.sessionsSeen > 1 && e.status === 'NEW') setStatus(e, stage === 'NEW' ? 'DEVELOPING' : stage, `re-shortlisted (${s.opportunityType ?? s.status})`);
  }
  for (const [key, pm] of premove) {
    if (pm.stage !== 'NEAR_TRIGGER' && pm.stage !== 'DEVELOPING') continue;
    const f = all.get(key); if (!f) continue;
    const e = upsert(f, 'premove', pm.stage === 'NEAR_TRIGGER' ? 'NEAR_TRIGGER' : 'NEW', `pre-move ${pm.stage} (score ${pm.score}): ${pm.signals.slice(0, 3).join('; ')}`, pm);
    if (e.sessionsSeen > 1 && e.status === 'NEW') setStatus(e, 'DEVELOPING', `still compressing (pre-move ${pm.score})`);
  }
  for (const s of args.deteriorating) upsert(s.f, 'deteriorating', 'DETERIORATING', `${s.opportunityType ?? 'DETERIORATING'}: ${s.reasons[0] ?? ''}`);

  // 3. Expire entries not seen for a while (terminal states expire faster).
  for (const e of byKey.values()) {
    if (seen.has(e.key) || e.status === 'EXPIRED') continue;
    const unseen = Math.round((Date.parse(sessionDate) - Date.parse(e.lastSeen)) / 86400e3);
    const limit = ['FAILED', 'CONFIRMED_MOVE', 'DETERIORATING'].includes(e.status) ? 3 : EXPIRE_AFTER_SESSIONS_UNSEEN;
    if (unseen >= limit) setStatus(e, 'EXPIRED', `not in universe/candidates for ${unseen} days`);
  }
  return { entries: [...byKey.values()], changes };
}
