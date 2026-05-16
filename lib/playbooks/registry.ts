/**
 * lib/playbooks/registry.ts — starter set of 6 playbooks.
 *
 * Each playbook is a declarative template the scanner can classify against.
 * Outcomes from edge_ledger_outcomes group naturally by playbook id, so the
 * Edge Matrix can show per-playbook win rate, avg R, and confidence band.
 *
 * To add a new playbook: append to PLAYBOOKS. Do NOT mutate existing ids
 * (they are foreign-key-like into edge_ledger_setups.playbook history).
 */

import type { Playbook } from './types';

export const PLAYBOOKS: readonly Playbook[] = [
  {
    id: 'vwap-reclaim-long',
    name: 'VWAP Reclaim (long)',
    type: 'reversal',
    direction: 'long',
    preferredRegime: 'trend-up',
    ivBias: 'iv-any',
    expectedHoldBars: 3,
    defaultRR: 2.0,
    triggers: [
      { label: 'Price held below VWAP intraday then reclaimed it with rising volume', key: 'vwap.reclaim' },
      { label: 'RSI(14) crosses above 50 on the reclaim bar', key: 'rsi.cross50' },
    ],
    invalidations: [
      { label: 'Close back below VWAP on next bar', key: 'vwap.lose' },
      { label: 'Volume drops below 50% of 20-bar avg on the reclaim bar', key: 'vol.weak' },
    ],
    summary: 'Mean-reversion-into-trend long when intraday VWAP is reclaimed on volume in an uptrending regime.',
    featureHints: { atr: 'use 1×ATR stop', rsi: 'gate at >50' },
  },
  {
    id: 'squeeze-break-long',
    name: 'Squeeze Break (long)',
    type: 'breakout',
    direction: 'long',
    preferredRegime: 'vol-expand',
    ivBias: 'iv-low',
    expectedHoldBars: 8,
    defaultRR: 2.5,
    triggers: [
      { label: 'Bollinger Band(20,2) width inside Keltner Channel(20,1.5) — squeeze on', key: 'squeeze.on' },
      { label: 'Price breaks above upper Bollinger band on volume > 1.5× 20-bar avg', key: 'bb.break.up' },
    ],
    invalidations: [
      { label: 'Close back inside the prior squeeze range', key: 'squeeze.refail' },
      { label: 'ATR contracts on the next bar after the break (failed expansion)', key: 'atr.contract' },
    ],
    summary: 'Long volatility-expansion breakout after a confirmed Bollinger-in-Keltner squeeze.',
    featureHints: { atr: 'use 1.5×ATR stop', vol: 'require 1.5× avg' },
  },
  {
    id: 'range-fade-short',
    name: 'Range Fade (short)',
    type: 'fade',
    direction: 'short',
    preferredRegime: 'chop',
    ivBias: 'iv-any',
    expectedHoldBars: 4,
    defaultRR: 1.5,
    triggers: [
      { label: 'Price tags upper range boundary tested ≥3 times in last 20 bars', key: 'range.upper.test' },
      { label: 'RSI(14) > 70 with bearish divergence', key: 'rsi.div.bear' },
    ],
    invalidations: [
      { label: 'Two consecutive closes above the range high', key: 'range.break' },
      { label: 'Volume expansion on the breakout candle', key: 'vol.break' },
    ],
    summary: 'Short the high of an established range in a chop regime when momentum is overbought and diverging.',
  },
  {
    id: 'gap-continuation-long',
    name: 'Gap Continuation (long)',
    type: 'continuation',
    direction: 'long',
    preferredRegime: 'trend-up',
    ivBias: 'iv-any',
    expectedHoldBars: 5,
    defaultRR: 2.0,
    triggers: [
      { label: 'Open gap up >2% on positive catalyst with no fill in first 30 minutes', key: 'gap.holds' },
      { label: '50-EMA > 200-EMA on daily', key: 'trend.up' },
    ],
    invalidations: [
      { label: 'Gap fills (price returns to prior close) within first 60 minutes', key: 'gap.fill' },
      { label: 'Closes red on the gap-up day', key: 'gap.red' },
    ],
    summary: 'Continuation long on an unfilled bullish gap inside an established daily uptrend.',
  },
  {
    id: 'failed-breakout-short',
    name: 'Failed Breakout (short)',
    type: 'reversal',
    direction: 'short',
    preferredRegime: 'chop',
    ivBias: 'iv-high',
    expectedHoldBars: 4,
    defaultRR: 2.0,
    triggers: [
      { label: 'Price breaks 20-bar high but closes back inside the range', key: 'break.fail' },
      { label: 'Volume on failure candle > volume on break candle', key: 'vol.fail.gt.break' },
    ],
    invalidations: [
      { label: 'Reclaims the breakout level within 2 bars', key: 'reclaim' },
      { label: 'Closes above the day-of-failure high', key: 'fail.invalidate' },
    ],
    summary: 'Short a failed breakout — bull-trap — where buyers exhaust at the high and sellers absorb on heavier volume.',
  },
  {
    id: 'earnings-iv-crush-fade',
    name: 'Post-Earnings IV Crush (short premium)',
    type: 'event-driven',
    direction: 'short',
    preferredRegime: 'any',
    ivBias: 'iv-high',
    expectedHoldBars: 1,
    defaultRR: 1.0,
    triggers: [
      { label: 'IV rank > 70 ahead of earnings', key: 'iv.rank.high' },
      { label: 'Expected move > 1.5× historical post-earnings move', key: 'em.elevated' },
    ],
    invalidations: [
      { label: 'Pre-announcement news cancels expected move', key: 'news.cancel' },
      { label: 'IV does not crush ≥30% on earnings open', key: 'iv.no.crush' },
    ],
    summary: 'Sell elevated event premium when implied move exceeds historical realised move; close after IV crush, not direction.',
  },
];

export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.id === id);
}

export function listPlaybooks(opts: { direction?: 'long' | 'short'; type?: Playbook['type'] } = {}): Playbook[] {
  return PLAYBOOKS.filter((p) =>
    (opts.direction ? p.direction === opts.direction : true) &&
    (opts.type ? p.type === opts.type : true),
  );
}
