import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

export function getGoldenEggMockPayload(): GoldenEggPayload {
  return {
    meta: {
      symbol: 'NVDA',
      assetClass: 'equity',
      price: 1134.2,
      asOfTs: new Date().toISOString(),
      timeframe: '1H',
    },
    layer1: {
      permission: 'WATCH',
      direction: 'LONG',
      confidence: 68,
      grade: 'B',
      primaryDriver: 'HTF trend and momentum remain constructive with contained pullback volatility.',
      primaryBlocker: 'Flow confirmation is neutral and price is still below trigger reclaim.',
      flipConditions: [
        { id: 'f1', text: '1H close above 1142.00 with expanding volume', severity: 'must' },
        { id: 'f2', text: 'Options flow flips to agree (call skew + OI support)', severity: 'should' },
        { id: 'f3', text: 'ADX holds above 22 through NY session', severity: 'nice' },
      ],
      scoreBreakdown: [
        { key: 'Structure', weight: 30, value: 74, note: 'HTF alignment supportive' },
        { key: 'Flow', weight: 25, value: 52, note: 'Neutral / waiting confirmation' },
        { key: 'Momentum', weight: 20, value: 69 },
        { key: 'Risk', weight: 25, value: 64, note: 'Defined invalidation' },
      ],
      cta: {
        primary: 'SET_ALERT',
        secondary: 'OPEN_TIME',
      },
    },
    layer2: {
      setup: {
        setupType: 'trend',
        thesis: 'Trend continuation setup if reclaim holds with participation; otherwise remain patient.',
        timeframeAlignment: {
          score: 3,
          max: 4,
          details: ['4H bullish structure', '1H pullback inside uptrend', '15m momentum rebuilding', '5m still noisy'],
        },
        keyLevels: [
          { label: 'Pivot', price: 1130.0, kind: 'pivot' },
          { label: 'Resistance', price: 1142.0, kind: 'resistance' },
          { label: 'Support', price: 1116.5, kind: 'support' },
        ],
        invalidation: 'Thesis invalid if 1H closes below 1116.5 with breadth deterioration.',
      },
      execution: {
        entryTrigger: 'Enter only after 1H close > 1142.0 and first pullback holds above reclaim.',
        entry: { type: 'stop', price: 1143.0 },
        stop: { price: 1116.5, logic: 'Below invalidation structure + failed reclaim' },
        targets: [
          { price: 1168.0, rMultiple: 1.0, note: 'First scale' },
          { price: 1196.0, rMultiple: 2.0, note: 'Primary target' },
          { price: 1224.0, rMultiple: 3.0, note: 'Extension' },
        ],
        rr: { expectedR: 2.1, minR: 1.6 },
        sizingHint: { riskPct: 0.75, riskUsd: 750, sizeUnits: 28 },
      },
    },
    layer3: {
      structure: {
        verdict: 'agree',
        trend: { htf: 'Bullish', mtf: 'Bullish pullback', ltf: 'Rebuild phase' },
        volatility: { regime: 'compression', atr: 24.6 },
        liquidity: { overhead: '1142-1148 supply pocket', below: '1116 demand shelf', note: 'Liquidity sweep risk near prior high.' },
      },
      options: {
        enabled: true,
        verdict: 'neutral',
        highlights: [
          { label: 'Put/Call OI', value: '0.94' },
          { label: 'IV Rank', value: '47' },
          { label: 'Dealer Gamma', value: 'Slightly long gamma' },
        ],
        notes: ['No decisive unusual premium concentration yet.'],
      },
      momentum: {
        verdict: 'agree',
        indicators: [
          { name: 'RSI(14)', value: '57', state: 'bull' },
          { name: 'ADX', value: '24', state: 'bull' },
          { name: 'MACD', value: 'Positive / flattening', state: 'neutral' },
        ],
      },
      internals: {
        enabled: true,
        verdict: 'neutral',
        items: [
          { name: 'Sector Breadth', value: 'Mixed', state: 'neutral' },
          { name: 'QQQ Relative', value: '+0.6%', state: 'bull' },
        ],
      },
      narrative: {
        enabled: true,
        summary: 'Constructive trend context with acceptable risk definition, but entry requires reclaim confirmation.',
        bullets: ['Risk/reward is viable only above trigger.', 'Flow confirmation remains the missing piece.'],
        risks: ['Failure to reclaim 1142 likely extends consolidation.', 'Macro event risk can invalidate intraday setups quickly.'],
      },
    },
  };
}
