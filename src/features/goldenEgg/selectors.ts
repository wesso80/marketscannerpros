import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

export function topScoreBreakdownRows(payload: GoldenEggPayload) {
  return [...payload.layer1.scoreBreakdown]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
}

export function isNoTrade(payload: GoldenEggPayload) {
  return payload.layer1.permission === 'NO_TRADE';
}
