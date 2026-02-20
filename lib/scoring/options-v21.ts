import { GATE_MULTIPLIER, OPTIONS_SCORING_THRESHOLDS } from '@/lib/scoring/config';
import {
  MSPContribution,
  MSPOptionCandidate,
  MSPOptionLeg,
  MSPOptionStrategyType,
  MSPPermissionState,
  MSPScorePayloadV2,
} from '@/lib/scoring/types';

export interface AVOptionRow {
  contractID?: string;
  expiration?: string;
  strike?: string | number;
  type?: string;
  bid?: string | number;
  ask?: string | number;
  mark?: string | number;
  last?: string | number;
  last_price?: string | number;
  volume?: string | number;
  open_interest?: string | number;
  implied_volatility?: string | number;
  delta?: string | number;
  gamma?: string | number;
  theta?: string | number;
  vega?: string | number;
}

interface ScoreInput {
  symbol: string;
  timeframe: string;
  spot: number;
  expectedMovePct: number;
  ivRank: number;
  marketDirection: 'bullish' | 'bearish' | 'neutral';
  marketRegimeAlignment: number;
  tfConfluenceScore: number;
  staleSeconds: number;
  freshness: 'REALTIME' | 'DELAYED' | 'EOD' | 'STALE';
  macroRisk: number;
  optionsRows: AVOptionRow[];
  timePermission?: 'ALLOW' | 'WAIT' | 'BLOCK';
  timeQuality?: number;
}

type CandidateScored = {
  payload: MSPScorePayloadV2;
  rank: { permissionRank: number; confidence: number; execution: number };
};

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const clamp100 = (value: number) => clamp(value, 0, 100);
const norm = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
};

function toNum(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMid(bid?: number, ask?: number, mark?: number, last?: number): number {
  if (Number.isFinite(mark as number) && (mark as number) > 0) return mark as number;
  if (Number.isFinite(bid as number) && Number.isFinite(ask as number) && (ask as number) > 0 && (bid as number) >= 0) {
    return ((bid as number) + (ask as number)) / 2;
  }
  return Number.isFinite(last as number) && (last as number) > 0 ? (last as number) : 0;
}

function spreadPct(leg: MSPOptionLeg): number {
  const bid = toNum(leg.bid, 0);
  const ask = toNum(leg.ask, 0);
  const mid = toNum(leg.mid, 0);
  if (mid <= 0 || ask <= 0 || ask < bid) return 100;
  return ((ask - bid) / mid) * 100;
}

function legLiquidity(leg: MSPOptionLeg): number {
  const oiNorm = norm(toNum(leg.openInterest, 0), 50, 5000);
  const volNorm = norm(toNum(leg.volume, 0), 10, 5000);
  const sprNorm = 1 - norm(spreadPct(leg), 0.5, 6.0);
  return clamp(0.45 * oiNorm + 0.35 * volNorm + 0.2 * sprNorm, 0, 1);
}

function sideFromStrategy(strategyType: MSPOptionStrategyType): 'bullish' | 'bearish' {
  if (strategyType === 'PUT' || strategyType === 'BEAR_PUT_DEBIT' || strategyType === 'BEAR_CALL_CREDIT') return 'bearish';
  return 'bullish';
}

function qualityFromConfidence(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 76) return 'high';
  if (confidence >= 55) return 'medium';
  return 'low';
}

function tfAlignmentFromScore(tfConfluenceScore: number): 1 | 2 | 3 | 4 {
  if (tfConfluenceScore >= 78) return 4;
  if (tfConfluenceScore >= 62) return 3;
  if (tfConfluenceScore >= 45) return 2;
  return 1;
}

function contractToLeg(row: AVOptionRow, side: 'long' | 'short'): MSPOptionLeg {
  const strike = toNum(row.strike, 0);
  const bid = toNum(row.bid, 0);
  const ask = toNum(row.ask, 0);
  const mark = toNum(row.mark, 0);
  const last = toNum(row.last ?? row.last_price, 0);
  const mid = toMid(bid, ask, mark, last);
  return {
    contractId: String(row.contractID || `${row.expiration || 'na'}:${String(row.type || 'x').toLowerCase()}:${strike}`),
    type: String(row.type || '').toLowerCase() === 'put' ? 'put' : 'call',
    side,
    strike,
    expiry: String(row.expiration || ''),
    bid,
    ask,
    mid,
    last,
    volume: toNum(row.volume, 0),
    openInterest: toNum(row.open_interest, 0),
    iv: toNum(row.implied_volatility, 0),
    delta: toNum(row.delta, Number.NaN),
    gamma: toNum(row.gamma, Number.NaN),
    theta: toNum(row.theta, Number.NaN),
    vega: toNum(row.vega, Number.NaN),
  };
}

function dteFromExpiry(expiry: string): number {
  const now = new Date();
  const end = new Date(expiry);
  if (!Number.isFinite(end.getTime())) return 0;
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function buildCandidates(rows: AVOptionRow[], symbol: string, spot: number, expectedMovePct: number): MSPOptionCandidate[] {
  const byExpiry = new Map<string, { calls: AVOptionRow[]; puts: AVOptionRow[] }>();
  for (const row of rows) {
    const expiry = String(row.expiration || '').trim();
    if (!expiry) continue;
    const strike = toNum(row.strike, 0);
    if (strike <= 0) continue;
    if (!byExpiry.has(expiry)) byExpiry.set(expiry, { calls: [], puts: [] });
    const bucket = byExpiry.get(expiry)!;
    if (String(row.type || '').toLowerCase() === 'put') bucket.puts.push(row);
    else bucket.calls.push(row);
  }

  const candidates: MSPOptionCandidate[] = [];
  const band = Math.max(0.8, expectedMovePct || 3);

  for (const [expiry, group] of byExpiry.entries()) {
    const dte = dteFromExpiry(expiry);
    if (!((dte >= 7 && dte <= 14) || (dte >= 21 && dte <= 45) || (dte >= 60 && dte <= 90))) continue;

    const withDistance = (arr: AVOptionRow[]) => arr
      .map((row) => ({ row, strike: toNum(row.strike, 0), distPct: Math.abs((toNum(row.strike, 0) - spot) / spot) * 100 }))
      .filter((v) => v.strike > 0 && v.distPct <= band)
      .sort((a, b) => a.distPct - b.distPct)
      .slice(0, 6)
      .map((v) => v.row);

    const nearCalls = withDistance(group.calls);
    const nearPuts = withDistance(group.puts);
    if (!nearCalls.length && !nearPuts.length) continue;

    const sortedCalls = [...nearCalls].sort((a, b) => toNum(a.strike, 0) - toNum(b.strike, 0));
    const sortedPuts = [...nearPuts].sort((a, b) => toNum(a.strike, 0) - toNum(b.strike, 0));

    const atmCall = sortedCalls.reduce<AVOptionRow | null>((acc, cur) => {
      if (!acc) return cur;
      return Math.abs(toNum(cur.strike, 0) - spot) < Math.abs(toNum(acc.strike, 0) - spot) ? cur : acc;
    }, null);
    const atmPut = sortedPuts.reduce<AVOptionRow | null>((acc, cur) => {
      if (!acc) return cur;
      return Math.abs(toNum(cur.strike, 0) - spot) < Math.abs(toNum(acc.strike, 0) - spot) ? cur : acc;
    }, null);

    if (atmCall) {
      const callLeg = contractToLeg(atmCall, 'long');
      const debit = toNum(callLeg.mid, 0);
      candidates.push({
        strategyType: 'CALL',
        underlying: symbol,
        spot,
        dte,
        legs: [callLeg],
        debit,
        maxGain: debit > 0 ? debit * 2.0 : undefined,
        maxLoss: debit,
        breakeven: callLeg.strike + debit,
        expectedMovePct,
      });
    }

    if (atmPut) {
      const putLeg = contractToLeg(atmPut, 'long');
      const debit = toNum(putLeg.mid, 0);
      candidates.push({
        strategyType: 'PUT',
        underlying: symbol,
        spot,
        dte,
        legs: [putLeg],
        debit,
        maxGain: debit > 0 ? debit * 2.0 : undefined,
        maxLoss: debit,
        breakeven: putLeg.strike - debit,
        expectedMovePct,
      });
    }

    const maxWidth = Math.min(5, Math.max(1, sortedCalls.length - 1), Math.max(1, sortedPuts.length - 1));
    for (let width = 1; width <= maxWidth; width++) {
      for (let i = 0; i + width < sortedCalls.length; i++) {
        const lower = contractToLeg(sortedCalls[i], 'long');
        const upper = contractToLeg(sortedCalls[i + width], 'short');
        const debit = toNum(lower.mid, 0) - toNum(upper.mid, 0);
        if (debit > 0) {
          const spreadWidth = Math.abs(upper.strike - lower.strike);
          candidates.push({
            strategyType: 'BULL_CALL_DEBIT',
            underlying: symbol,
            spot,
            dte,
            legs: [lower, upper],
            debit,
            maxLoss: debit,
            maxGain: Math.max(0, spreadWidth - debit),
            breakeven: lower.strike + debit,
            expectedMovePct,
          });
        }

        const creditLegLong = contractToLeg(sortedCalls[i + width], 'long');
        const creditLegShort = contractToLeg(sortedCalls[i], 'short');
        const credit = toNum(creditLegShort.mid, 0) - toNum(creditLegLong.mid, 0);
        if (credit > 0) {
          const spreadWidth = Math.abs(creditLegLong.strike - creditLegShort.strike);
          candidates.push({
            strategyType: 'BEAR_CALL_CREDIT',
            underlying: symbol,
            spot,
            dte,
            legs: [creditLegShort, creditLegLong],
            credit,
            maxGain: credit,
            maxLoss: Math.max(0, spreadWidth - credit),
            breakeven: creditLegShort.strike + credit,
            expectedMovePct,
          });
        }
      }

      for (let i = width; i < sortedPuts.length; i++) {
        const upperPut = contractToLeg(sortedPuts[i], 'long');
        const lowerPut = contractToLeg(sortedPuts[i - width], 'short');
        const debit = toNum(upperPut.mid, 0) - toNum(lowerPut.mid, 0);
        if (debit > 0) {
          const spreadWidth = Math.abs(upperPut.strike - lowerPut.strike);
          candidates.push({
            strategyType: 'BEAR_PUT_DEBIT',
            underlying: symbol,
            spot,
            dte,
            legs: [upperPut, lowerPut],
            debit,
            maxLoss: debit,
            maxGain: Math.max(0, spreadWidth - debit),
            breakeven: upperPut.strike - debit,
            expectedMovePct,
          });
        }

        const shortPut = contractToLeg(sortedPuts[i], 'short');
        const longPut = contractToLeg(sortedPuts[i - width], 'long');
        const credit = toNum(shortPut.mid, 0) - toNum(longPut.mid, 0);
        if (credit > 0) {
          const spreadWidth = Math.abs(shortPut.strike - longPut.strike);
          candidates.push({
            strategyType: 'BULL_PUT_CREDIT',
            underlying: symbol,
            spot,
            dte,
            legs: [shortPut, longPut],
            credit,
            maxGain: credit,
            maxLoss: Math.max(0, spreadWidth - credit),
            breakeven: shortPut.strike - credit,
            expectedMovePct,
          });
        }
      }
    }
  }

  const capped = new Map<string, MSPOptionCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.underlying}:${candidate.dte}`;
    if (!capped.has(key)) capped.set(key, []);
    const arr = capped.get(key)!;
    if (arr.length < 24) arr.push(candidate);
  }
  return Array.from(capped.values()).flat();
}

function scoreCandidate(input: ScoreInput, candidate: MSPOptionCandidate): CandidateScored {
  const side = sideFromStrategy(candidate.strategyType);
  const legLiquidities = candidate.legs.map(legLiquidity);
  const spreadLiquidity = legLiquidities.length ? Math.min(...legLiquidities) : 0;

  const legSpreadPcts = candidate.legs.map(spreadPct);
  const fillSlippagePct = candidate.legs
    .map((leg) => {
      const bid = toNum(leg.bid, 0);
      const ask = toNum(leg.ask, 0);
      const mid = toNum(leg.mid, 0);
      if (mid <= 0 || ask < bid) return 2;
      return (((ask - bid) * 0.2) / mid) * 100;
    })
    .reduce((sum, value) => sum + value, 0);
  const fillQuality = 1 - norm(fillSlippagePct, 0.0, 1.5);

  const emPct = Math.max(0.01, toNum(candidate.expectedMovePct, input.expectedMovePct || 3));
  const beDistPct = candidate.breakeven ? Math.abs(candidate.breakeven - candidate.spot) / candidate.spot * 100 : emPct;

  const shortLeg = candidate.legs.find((leg) => leg.side === 'short');
  const emFit = clamp((emPct - beDistPct) / emPct, 0, 1);
  const bufferPct = shortLeg ? Math.abs(shortLeg.strike - candidate.spot) / candidate.spot * 100 : 0;
  const bufferFit = clamp(bufferPct / emPct, 0, 1);

  const payoff = (() => {
    if (candidate.strategyType.includes('CREDIT')) {
      const creditToRisk = toNum(candidate.credit, 0) / Math.max(0.0001, toNum(candidate.maxLoss, 0));
      return norm(creditToRisk, 0.1, 0.45);
    }
    const debit = Math.max(0.0001, toNum(candidate.debit, 0));
    const maxGainPct = toNum(candidate.maxGain, 0) / debit;
    return norm(maxGainPct, 0.5, 3.0);
  })();

  const pWinProxy = (() => {
    if (candidate.strategyType.includes('CREDIT')) {
      const deltaShort = Math.abs(toNum(shortLeg?.delta, 0.25));
      return clamp(1 - deltaShort, 0, 1);
    }
    const longLeg = candidate.legs.find((leg) => leg.side === 'long');
    return norm(Math.abs(toNum(longLeg?.delta, 0.45)), 0.35, 0.7);
  })();

  const ivRankNorm = norm(input.ivRank, 20, 80);
  const volFit = candidate.strategyType.includes('CREDIT') ? ivRankNorm : (1 - ivRankNorm);

  const directionalAgreement = input.marketDirection === 'neutral'
    ? 0.5
    : input.marketDirection === side
    ? 1
    : 0;

  const dteSuitability = (() => {
    const tf = input.timeframe;
    if (/scalp|intraday/i.test(tf)) return norm(14 - candidate.dte, 0, 14);
    if (/swing/i.test(tf)) return norm(candidate.dte, 14, 45);
    return norm(candidate.dte, 30, 90);
  })();

  const riskGeometry = clamp(payoff * 0.7 + pWinProxy * 0.3, 0, 1);
  const timeWindowFitRaw = clamp(toNum(input.timeQuality, 100) / 100, 0, 1);
  const timeWindowFit = Math.min(0.85, timeWindowFitRaw);

  const contextFeatures = {
    volFit,
    underlyingRegimeAlignment: clamp(input.marketRegimeAlignment, 0, 1),
    liquidityHealth: spreadLiquidity,
    dataFreshness: 1 - norm(input.staleSeconds, 0, OPTIONS_SCORING_THRESHOLDS.MAX_STALE_SEC_REALTIME * 2),
    macroRisk: clamp(input.macroRisk, 0, 1),
  };
  const setupFeatures = {
    directionalAgreement,
    emBufferFit: candidate.strategyType.includes('CREDIT') ? bufferFit : emFit,
    payoff,
    tfConfluenceScore: clamp(input.tfConfluenceScore / 100, 0, 1),
    pWinProxy,
  };
  const executionFeatures = {
    spreadLiquidity,
    fillQuality,
    dteSuitability,
    riskGeometry,
    timeWindowFit,
  };

  const context = clamp100(
    (contextFeatures.volFit * 0.3 +
      contextFeatures.underlyingRegimeAlignment * 0.2 +
      contextFeatures.liquidityHealth * 0.2 +
      contextFeatures.dataFreshness * 0.15 +
      contextFeatures.macroRisk * 0.15) * 100,
  );

  const setup = clamp100(
    (setupFeatures.directionalAgreement * 0.2 +
      setupFeatures.emBufferFit * 0.25 +
      setupFeatures.payoff * 0.2 +
      setupFeatures.tfConfluenceScore * 0.2 +
      setupFeatures.pWinProxy * 0.15) * 100,
  );

  const execution = clamp100(
    (executionFeatures.spreadLiquidity * 0.35 +
      executionFeatures.fillQuality * 0.22 +
      executionFeatures.dteSuitability * 0.18 +
      executionFeatures.riskGeometry * 0.15 +
      executionFeatures.timeWindowFit * 0.1) * 100,
  );

  const baseScore = clamp100(context * 0.3 + setup * 0.45 + execution * 0.25);

  const blockers: string[] = [];
  const warnings: string[] = [];

  const staleBlocked = input.freshness === 'REALTIME' && input.staleSeconds > OPTIONS_SCORING_THRESHOLDS.MAX_STALE_SEC_REALTIME;
  if (staleBlocked || input.freshness === 'STALE') blockers.push('data_stale_or_missing');

  if (candidate.legs.some((leg, i) => legSpreadPcts[i] > OPTIONS_SCORING_THRESHOLDS.MAX_SPREAD_PCT)) blockers.push('leg_spread_too_wide');
  if (candidate.legs.some((leg) => toNum(leg.openInterest, 0) < OPTIONS_SCORING_THRESHOLDS.MIN_OI)) blockers.push('oi_below_minimum');
  if (candidate.legs.some((leg) => toNum(leg.volume, 0) < OPTIONS_SCORING_THRESHOLDS.MIN_VOL)) blockers.push('volume_below_minimum');

  if (!candidate.strategyType.includes('CREDIT') && toNum(candidate.debit, 0) <= 0) blockers.push('invalid_debit_pricing');
  if (candidate.strategyType.includes('CREDIT')) {
    const creditToRisk = toNum(candidate.credit, 0) / Math.max(0.0001, toNum(candidate.maxLoss, 0));
    if (creditToRisk < OPTIONS_SCORING_THRESHOLDS.MIN_CREDIT_TO_RISK) blockers.push('credit_to_risk_too_low');
  }

  if (setupFeatures.tfConfluenceScore < 0.45) warnings.push('tf_confluence_low');
  if (executionFeatures.fillQuality < 0.55) warnings.push('fill_quality_low');
  if (executionFeatures.dteSuitability < 0.5) warnings.push('dte_suitability_low');
  if (directionalAgreement === 0) warnings.push('regime_conflict');

  let state: MSPPermissionState = 'ALLOW';
  if (blockers.length > 0) state = 'BLOCK';
  else if (warnings.length > 1) state = 'WAIT';

  if (input.timePermission === 'BLOCK') state = 'BLOCK';
  else if (input.timePermission === 'WAIT' && state === 'ALLOW') state = 'WAIT';

  const gateMultiplier = GATE_MULTIPLIER[state];
  const finalScore = clamp100(baseScore * gateMultiplier);
  const confidence = Math.max(1, Math.min(99, Math.round(finalScore)));
  const tfAlignment = tfAlignmentFromScore(input.tfConfluenceScore);

  const contrib: MSPContribution[] = [
    { key: 'context_vol_fit', label: 'Vol Fit', layer: 'context', weight: 0.3, value: contextFeatures.volFit, points: contextFeatures.volFit * 30 },
    { key: 'setup_tf_confluence', label: 'TF Confluence', layer: 'setup', weight: 0.2, value: setupFeatures.tfConfluenceScore, points: setupFeatures.tfConfluenceScore * 20 },
    { key: 'execution_liquidity', label: 'Spread Liquidity', layer: 'execution', weight: 0.35, value: executionFeatures.spreadLiquidity, points: executionFeatures.spreadLiquidity * 35 },
  ];

  const payload: MSPScorePayloadV2 = {
    version: 'msp.score.v2.1',
    asOf: new Date().toISOString(),
    symbol: input.symbol,
    assetClass: 'options',
    timeframe: input.timeframe,
    mode: 'options_scanner',
    bias: {
      direction: side,
      strength: clamp(Math.abs(setup - 50) / 50, 0, 1),
    },
    permission: {
      state,
      blockers,
      warnings,
      notes: state === 'BLOCK' ? 'Hard gate active' : state === 'WAIT' ? 'Soft conflict watch state' : 'Execution permitted',
    },
    scores: {
      context: Math.round(context),
      setup: Math.round(setup),
      execution: Math.round(execution),
      baseScore: Math.round(baseScore),
      gateMultiplier,
      finalScore: Math.round(finalScore),
      confidence,
      quality: qualityFromConfidence(confidence),
      tfConfluenceScore: Math.round(input.tfConfluenceScore),
      tfAlignment,
      timeWindowFit,
    },
    features: {
      context: contextFeatures,
      setup: setupFeatures,
      execution: executionFeatures,
    },
    contrib,
    evidence: {
      dataCoverage: {
        provider: 'alpha_vantage',
        staleSeconds: Math.max(0, Math.round(input.staleSeconds)),
      },
      optionsCandidate: candidate,
    },
    explain: {
      oneLiner: `${candidate.strategyType} ${state} @ ${confidence}% confidence`,
      bullets: [
        `Context ${Math.round(context)} / Setup ${Math.round(setup)} / Execution ${Math.round(execution)}`,
        `Liquidity ${(spreadLiquidity * 100).toFixed(0)}% | Fill ${(fillQuality * 100).toFixed(0)}% | DTE fit ${(dteSuitability * 100).toFixed(0)}%`,
        blockers.length > 0 ? `Blockers: ${blockers.join(', ')}` : `Warnings: ${warnings.join(', ') || 'none'}`,
      ],
    },
  };

  const permissionRank = state === 'ALLOW' ? 0 : state === 'WAIT' ? 1 : 2;
  return {
    payload,
    rank: {
      permissionRank,
      confidence,
      execution: Math.round(execution),
    },
  };
}

export function scoreOptionCandidatesV21(input: ScoreInput): MSPScorePayloadV2[] {
  const candidates = buildCandidates(input.optionsRows, input.symbol, input.spot, input.expectedMovePct);
  const scored = candidates.map((candidate) => scoreCandidate(input, candidate));
  return scored
    .sort((a, b) => {
      if (a.rank.permissionRank !== b.rank.permissionRank) return a.rank.permissionRank - b.rank.permissionRank;
      if (a.rank.confidence !== b.rank.confidence) return b.rank.confidence - a.rank.confidence;
      return b.rank.execution - a.rank.execution;
    })
    .map((item) => item.payload);
}
